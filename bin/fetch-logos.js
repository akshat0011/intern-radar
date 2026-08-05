#!/usr/bin/env node
/**
 * Fill in company logos we never captured.
 *
 * A job stored before logo capture existed has no logo URL, and it will never
 * reappear in a search once it falls outside the lookback window — so it would
 * show initials forever. This searches LinkedIn for each such company by name,
 * harvests the logo URL off the first matching card, and downloads it.
 *
 * One page load per company, paced. Run it by hand after adding companies or
 * after a schema change; it is not part of the hourly run.
 *
 *   node bin/fetch-logos.js
 */
import { loadConfig, matchCompany, normaliseCompany } from '../src/config.js';
import { Store } from '../src/store.js';
import { launchBrave, closeBrave } from '../src/browser.js';
import { ensureHealthy, assertSignedIn } from '../src/guard.js';
import * as li from '../src/linkedin.js';
import { pause, sleep, rand } from '../src/human.js';
import { syncLogos, logoPathFor, logoSlug } from '../src/logos.js';
import { writeJobsFile, pushToSite } from '../src/publish.js';
import { log } from '../src/logger.js';
import { ROOT } from '../src/paths.js';
import { join } from 'node:path';

try { process.loadEnvFile(join(ROOT, '.env')); } catch { /* optional */ }

const cfg = loadConfig();
const store = new Store();

// Which published companies still have no logo on disk?
const maxAgeMs = (cfg.publish?.maxAgeDays ?? 14) * 86_400_000;
const existing = await syncLogos([]);
const needed = [...new Set(
  store.recentJobs(Date.now() - maxAgeMs)
    .map((r) => r.company)
    .filter((c) => c && !logoPathFor(c, existing)),
)];

log.section('Logo backfill');
if (!needed.length) {
  log.ok('Every published company already has a logo. Nothing to do.');
  store.close();
  process.exit(0);
}
log.info(`${needed.length} company/companies without a logo: ${needed.join(', ')}`);

const session = await launchBrave(cfg);
const { page, context } = session;
const harvested = [];

try {
  await li.warmUp(page, cfg);
  await ensureHealthy(page, cfg, { context: 'warm-up' });
  await assertSignedIn(page, context, cfg);

  for (const company of needed) {
    // No time filter: we want any posting from this employer, however old.
    const url = li.buildSearchUrl(
      { keywords: `"${company}"`, location: cfg.defaultLocation ?? '' },
      { postedWithinHours: 24 * 365, sortBy: 'relevance', jobTypes: [] },
      { start: 0 },
    );

    const ok = await li.gotoSearch(page, url, cfg);
    await ensureHealthy(page, cfg, { context: `logo search for ${company}` });
    if (!ok) {
      log.warn(`No results page for "${company}".`);
      continue;
    }

    const { cards } = await li.enumerateCards(page, cfg);
    // Take the logo from a card whose employer actually resolves to the company
    // we are looking for — a keyword search returns near-misses too.
    const hit = cards.find(
      (c) => c.logoUrl && (
        normaliseCompany(c.company) === normaliseCompany(company) ||
        matchCompany(c.company, [{ display: company, term: normaliseCompany(company) }])
      ),
    );

    if (hit) {
      harvested.push({ company, logoUrl: hit.logoUrl });
      log.ok(`Found a logo for ${company} (via "${hit.company}").`);
      // Also store it against the job rows so a future run does not re-fetch.
      for (const row of store.recentJobs(Date.now() - maxAgeMs)) {
        if (normaliseCompany(row.company) === normaliseCompany(company)) {
          store.backfillLogo(row.job_id, hit.logoUrl);
        }
      }
    } else {
      log.warn(`No card matched "${company}" — it will keep showing initials.`);
    }

    await pause(cfg.pacing.betweenSearches);
  }
} finally {
  await closeBrave(session);
}

if (harvested.length) {
  const index = await syncLogos(harvested);
  log.ok(`Downloaded ${harvested.length} logo(s).`);
  for (const { company } of harvested) {
    log.info(`  ${company} -> ${logoPathFor(company, index) ?? logoSlug(company) + ' (failed)'}`);
  }
  const r = await writeJobsFile(store, cfg);
  log.ok(`Republished ${r.count} jobs — ${r.withLogo} now have a logo.`);
  pushToSite(0);
} else {
  log.warn('Nothing harvested.');
}

store.close();
