#!/usr/bin/env node
/**
 * Work out which ATS job board each watchlist company uses, once, and remember it.
 *
 *   node bin/discover-ats.js                 probe every company not yet resolved
 *   node bin/discover-ats.js --all           re-probe everything, including known
 *   node bin/discover-ats.js --limit 50      stop after 50 companies
 *   node bin/discover-ats.js --company "Meesho"
 *
 * This is the expensive half of the ATS integration and the reason it is a
 * separate script rather than part of a scan: a company's ATS changes maybe once
 * every few years, while the postings on it change hourly. Discovery is cached
 * in the database; the poller just reads the cache.
 *
 * Companies that resolve to nothing are recorded too, with the time they were
 * checked, so repeated runs do not re-probe the same misses every night.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../src/paths.js';
import { Store } from '../src/store.js';
import { discover, discoverViaCareersPage, discoverViaHomepage, PROVIDER_NAMES } from '../src/ats.js';
import { log } from '../src/logger.js';

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const valueOf = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };

const REDISCOVER_ALL = has('--all');
/**
 * Second discovery method: read the company's own careers page and take the ATS
 * link off it, instead of guessing a slug. Slower, but it finds tokens guessing
 * cannot — Razorpay's board is `razorpaysoftwareprivatelimited` — and it is the
 * only route to Workday, whose site names are bespoke and unguessable.
 */
const VIA_CAREERS = has('--careers');
/**
 * Third method: fetch the homepage, find whatever it calls its careers page,
 * follow that, and read the ATS link there. Slowest of the three, but it does
 * not guess a URL shape — which is what the other two get wrong.
 */
const VIA_HOMEPAGE = has('--homepage');
const LIMIT = Number(valueOf('--limit') ?? 0) || null;
const ONLY = valueOf('--company');
const CONCURRENCY = Number(valueOf('--concurrency') ?? 6);
/** Re-check a company that previously resolved to nothing after this long. */
const MISS_TTL_DAYS = 30;

function watchlistNames() {
  const file = JSON.parse(readFileSync(join(ROOT, 'companies.json'), 'utf8'));
  const names = [];
  for (const [group, entries] of Object.entries(file)) {
    if (group === '_note' || !Array.isArray(entries)) continue;
    for (const e of entries) names.push(typeof e === 'string' ? e : e?.name);
  }
  const cfg = JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
  for (const e of cfg.companies ?? []) names.push(typeof e === 'string' ? e : e?.name);
  return [...new Set(names.filter(Boolean))];
}

const store = new Store();
store.ensureAtsTable();

let names = ONLY ? [ONLY] : watchlistNames();

if (!REDISCOVER_ALL && !ONLY) {
  const cutoff = Date.now() - MISS_TTL_DAYS * 86_400_000;
  names = names.filter((n) => {
    const row = store.getAts(n);
    if (!row) return true;
    if (row.provider) return false;              // already resolved
    // The careers-page pass is a DIFFERENT method, not a retry of the same one,
    // so the miss cooldown does not apply: a company slug discovery could not
    // guess is exactly the company whose careers page is worth reading.
    if (VIA_CAREERS || VIA_HOMEPAGE) return true;
    return (row.checked_at ?? 0) < cutoff;       // a stale miss is worth re-checking
  });
}

if (LIMIT) names = names.slice(0, LIMIT);

if (!names.length) {
  console.log('Nothing to discover — every company is already resolved or recently checked.');
  store.close();
  process.exit(0);
}

console.log(`Probing ${names.length} companies across ${PROVIDER_NAMES.length} providers (concurrency ${CONCURRENCY})…\n`);

let done = 0;
let found = 0;
const byProvider = new Map();

async function worker(queue) {
  while (queue.length) {
    const name = queue.shift();
    if (!name) break;
    let hit = null;
    try {
      if (VIA_HOMEPAGE) hit = await discoverViaHomepage(name);
      else if (VIA_CAREERS) hit = await discoverViaCareersPage(name);
      else hit = await discover(name);
    } catch (err) {
      log.debug(`${name}: discovery error ${err.message}`);
    }
    done++;

    if (hit) {
      found++;
      byProvider.set(hit.provider, (byProvider.get(hit.provider) ?? 0) + 1);
      store.saveAts(name, hit.provider, hit.token, hit.count ?? 0);
      console.log(`  ✓ ${name.padEnd(30)} ${hit.provider.padEnd(15)} ${String(hit.token).slice(0, 34)}`);
    } else {
      store.saveAts(name, null, null, 0);
    }

    if (done % 50 === 0) console.log(`  … ${done}/${names.length} checked, ${found} found`);
  }
}

const queue = [...names];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.log(`\n=== ${found}/${names.length} resolved (${Math.round((found / names.length) * 100)}%) ===`);
for (const [p, n] of [...byProvider.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p.padEnd(18)} ${n}`);
}
console.log('\nStored in the company_ats table. Run bin/poll-ats.js to collect postings.');
store.close();
