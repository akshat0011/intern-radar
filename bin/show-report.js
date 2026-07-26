#!/usr/bin/env node
/** Open the most recent report, or print a summary of recent runs with --runs. */
import { existsSync } from 'node:fs';
import { PATHS } from '../src/paths.js';
import { Store } from '../src/store.js';
import { open } from '../src/notify.js';

const store = new Store();

if (process.argv.includes('--roles')) {
  const nearMiss = store.skippedByRole('title lacks intern (watchlist tech role)', 40);
  const unclear = store.skippedByRole('role unclear', 40);
  const nonTech = store.skippedByRole('not a software role', 25);

  if (nearMiss.length) {
    console.log('\nNEAR MISSES — tech roles at watchlist companies, skipped only because');
    console.log('the title has no internship word. Check whether these are internships:\n');
    for (const r of nearMiss) console.log(`  ${String(r.title).slice(0, 62).padEnd(64)} ${r.company ?? ''}`);
    console.log('\nIf they are, add the missing word to matching.titleMustMatch in config.json.');
  }

  if (!unclear.length && !nonTech.length && !nearMiss.length) {
    console.log('\nNo role decisions recorded yet. Run a scan first.\n');
  } else {
    console.log('\nTitles the classifier could NOT decide — review these:\n');
    if (!unclear.length) console.log('  (none)');
    for (const r of unclear) console.log(`  ${String(r.title).slice(0, 62).padEnd(64)} ${r.company ?? ''}`);

    console.log('\nRejected as non-software (a sample, to check for mistakes):\n');
    if (!nonTech.length) console.log('  (none)');
    for (const r of nonTech) console.log(`  ${String(r.title).slice(0, 62).padEnd(64)} ${r.company ?? ''}`);

    console.log('\nIf a software role appears in either list, add a distinguishing word to');
    console.log('matching.extraTechTerms in config.json. If junk survived, add to');
    console.log('matching.extraNonTechTerms. Both are checked before the built-in lists.\n');
  }
  store.close();
  process.exit(0);
}

if (process.argv.includes('--skipped')) {
  const rows = store.topSkippedCompanies(50);
  if (!rows.length) {
    console.log('\nNo skipped companies recorded yet. Run a scan first.\n');
  } else {
    console.log('\nCompanies seen but skipped because they are not on your watchlist:\n');
    for (const { company, n } of rows) {
      console.log(`  ${String(n).padStart(4)}×  ${company}`);
    }
    console.log('\nAdd any worth watching to the `companies` list in config.json.');
    console.log('If most of these look like companies you would happily intern at, consider');
    console.log('setting matching.requireCompanyMatch to false instead.\n');
  }
  store.close();
  process.exit(0);
}

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
