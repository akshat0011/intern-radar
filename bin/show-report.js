#!/usr/bin/env node
/** Open the most recent report, or print a summary of recent runs with --runs. */
import { existsSync } from 'node:fs';
import { PATHS } from '../src/paths.js';
import { Store } from '../src/store.js';
import { open } from '../src/notify.js';

const store = new Store();

if (process.argv.includes('--runs')) {
  const runs = store.recentRuns(10);
  if (!runs.length) {
    console.log('No runs recorded yet. Run `npm run dry-run` first.');
  } else {
    console.log('\nRecent runs:\n');
    for (const r of runs) {
      const when = new Date(r.started_at).toLocaleString('en-IN');
      const dur = r.finished_at ? `${Math.round((r.finished_at - r.started_at) / 1000)}s` : 'unfinished';
      console.log(
        `  ${when}  ${String(r.status).padEnd(8)} ${dur.padStart(7)}  ` +
        `${r.pages_scanned} pages, ${r.cards_seen} cards, ${r.details_extracted} opened, ${r.new_jobs} new`,
      );
      if (r.skipped_note) console.log(`      note: ${r.skipped_note}`);
      if (r.error) console.log(`      error: ${r.error}`);
    }
  }
  const s = store.stats();
  console.log(`\n  ${s.total} jobs tracked across ${s.companies} companies; ${s.skipped} cards skipped as non-matching.\n`);
  store.close();
  process.exit(0);
}

store.close();

if (!existsSync(PATHS.latestReport)) {
  console.error('No report yet — run `npm run dry-run` or wait for the next scheduled run.');
  process.exit(1);
}
await open(PATHS.latestReport);
console.log(`Opened ${PATHS.latestReport}`);
