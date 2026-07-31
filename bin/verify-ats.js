#!/usr/bin/env node
/**
 * Re-check every discovered ATS board against the current verification rules.
 *
 *   node bin/verify-ats.js             report only
 *   node bin/verify-ats.js --fix       clear the boards that no longer verify
 *
 * Discovery decides once and caches, which is right for cost and wrong for
 * trust: a board accepted under weaker rules stays accepted forever. This pass
 * re-applies today's rules to yesterday's answers.
 *
 * The failure it exists to catch is specific. Several of these platforms hand a
 * subdomain to anyone who signs up, so a big company's name can resolve to an
 * abandoned trial account full of template postings — accenture.recruitee.com
 * serves "Senior Marketer (Sample)". Publishing that would put an invented job
 * under a real employer's name, which is worse than having no listing at all.
 */
import { Store } from '../src/store.js';
import { PROVIDERS } from '../src/ats.js';

const FIX = process.argv.includes('--fix');

const store = new Store();
store.ensureAtsTable();
const boards = store.atsBoards();

if (!boards.length) {
  console.log('No boards to verify yet.');
  store.close();
  process.exit(0);
}

console.log(`Re-verifying ${boards.length} board${boards.length === 1 ? '' : 's'}…\n`);

const bad = [];
const unknown = [];
let ok = 0;
const CONCURRENCY = 4;
const queue = [...boards];

/**
 * "The provider said no" and "I could not ask" are different answers, and
 * collapsing them destroys data.
 *
 * The first version treated any thrown error as a rejection, so a single
 * timeout under concurrency deleted a perfectly good board — SingleStore, whose
 * Greenhouse metadata plainly reads {"name":"SingleStore"}. Only a definite
 * negative is allowed to clear a row; anything else is reported and left alone.
 */
async function checkTwice(provider, token, company) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return { verified: await provider.verify(token, company) };
    } catch (err) {
      if (attempt === 2) return { error: err.message };
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return { error: 'unreachable' };
}

await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const b = queue.shift();
    if (!b) break;
    const provider = PROVIDERS[b.provider];
    if (!provider) { bad.push({ ...b, why: 'unknown provider' }); continue; }

    const result = await checkTwice(provider, b.token, b.company);

    if (result.error) {
      unknown.push({ ...b, why: result.error });
      console.log(`  ? ${b.company.padEnd(32)} ${b.provider}/${b.token}  (could not check — left as is)`);
    } else if (result.verified) {
      ok++;
    } else {
      bad.push({ ...b, why: 'did not verify' });
      console.log(`  ✗ ${b.company.padEnd(32)} ${b.provider}/${b.token}`);
    }
  }
}));

console.log(`\n=== ${ok} verified · ${bad.length} rejected · ${unknown.length} unreachable ===`);

if (bad.length && FIX) {
  for (const b of bad) store.saveAts(b.company, null, null, 0);
  console.log(`\nCleared ${bad.length} board${bad.length === 1 ? '' : 's'}. They will be re-probed on the next discovery run.`);
} else if (bad.length) {
  console.log('\nRun again with --fix to clear them.');
}
if (unknown.length) {
  console.log(`${unknown.length} board${unknown.length === 1 ? ' was' : 's were'} left untouched because the check itself failed — re-run to settle them.`);
}

store.close();
