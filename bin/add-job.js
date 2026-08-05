#!/usr/bin/env node
/**
 * Add specific LinkedIn postings by id or URL, bypassing the search entirely.
 *
 *   node bin/add-job.js 4447602250
 *   node bin/add-job.js https://www.linkedin.com/jobs/view/4447602250/
 *   node bin/add-job.js 4447602250 4448317411 --no-publish
 *
 * This exists because the sweep has a hard ceiling that nothing in it can fix.
 * A single LinkedIn search returns at most 1000 results, and India produces
 * roughly 70-85 internship postings an hour, so one search can only ever see
 * about thirteen hours back — widening filters.postedWithinHours does not help,
 * because f_TPR is cumulative from now and a wider window just returns a larger
 * superset that truncates at the same 1000. A posting older than that is
 * unreachable by the scan no matter what it is asked to do. A five-day backfill
 * walked all 40 pages, saw 1000 cards, and never got within sixty hours of a
 * three-day-old job.
 *
 * So when a run is missed and a posting ages past the horizon, the search
 * cannot recover it and never will. Opening the job by id can, because the id
 * addresses the posting directly instead of asking a ranked, truncated list
 * where it is. Spot something the site should have and did not: paste its id.
 */
import { loadConfig, matchCompany } from '../src/config.js';
import { Store } from '../src/store.js';
import { launchBrave, closeBrave } from '../src/browser.js';
import { assertSignedIn, ensureHealthy } from '../src/guard.js';
import * as li from '../src/linkedin.js';
import { classifyRole } from '../src/roles.js';
import { summarize } from '../src/summarize.js';
import { publish } from '../src/publish.js';
import {
  extractStipend, extractDuration, extractSkills, extractWorkplaceType, parseRelativeTime,
} from '../src/extract.js';
import { pause } from '../src/human.js';
import { log } from '../src/logger.js';

const ARGS = process.argv.slice(2);
const NO_PUBLISH = ARGS.includes('--no-publish');

/** Accept a bare id, a /jobs/view/ URL, or a search URL with currentJobId. */
function toJobId(arg) {
  const s = String(arg).trim();
  if (/^\d{6,}$/.test(s)) return s;
  return (s.match(/\/jobs\/view\/(?:[^/?#]*-)?(\d+)/) || [])[1]
    || (s.match(/currentJobId=(\d+)/) || [])[1]
    || null;
}

const ids = [...new Set(ARGS.filter((a) => !a.startsWith('--')).map(toJobId).filter(Boolean))];

if (!ids.length) {
  console.log('Usage: node bin/add-job.js <job id or LinkedIn URL> [more…] [--no-publish]');
  process.exit(1);
}

const cfg = loadConfig();
const store = new Store();
const runId = `manual-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}`;
store.startRun(runId);

let added = 0;
let failed = 0;
let session;

try {
  session = await launchBrave(cfg);
  const { page, context } = session;
  await li.warmUp(page, cfg);
  await assertSignedIn(page, context, cfg);
  log.ok('Signed in.');

  for (const jobId of ids) {
    if (store.hasJob(jobId)) {
      log.info(`${jobId} is already stored — skipping.`);
      continue;
    }

    await pause(cfg.pacing.betweenCards);

    let detail;
    try {
      detail = await li.openAndExtract(page, { jobId }, cfg);
    } catch (err) {
      failed++;
      log.error(`Could not read ${jobId} — ${err.message.split('\n')[0]}`);
      continue;
    }
    await ensureHealthy(page, cfg, { context: `job ${jobId}`, remainingMs: 60_000 });

    if (!detail?.title) {
      failed++;
      log.error(`${jobId} returned no title — the posting may be closed or the markup shifted.`);
      continue;
    }

    const description = detail.description || '';
    const matched = matchCompany(detail.company, cfg.watchlist);

    // Reported, not enforced. The whole point of adding a job by hand is that
    // you looked at it and decided it belongs; refusing it here because the
    // employer is not on the watchlist would defeat that. It is still recorded
    // so the reason it never arrived on its own is visible.
    if (!matched) {
      log.warn(`"${detail.company}" is not on the watchlist — adding anyway, but the sweep would not have.`);
    }

    const verdict = classifyRole(detail.title, {
      extraPositive: cfg.matching.extraTechTerms ?? [],
      extraNegative: cfg.matching.extraNonTechTerms ?? [],
    }).verdict;

    const job = {
      jobId,
      title: detail.title,
      company: detail.company,
      companyMatched: matched,
      location: detail.location,
      workplaceType: detail.workplaceType || extractWorkplaceType(detail.location, description),
      postedText: detail.postedText,
      postedAt: parseRelativeTime(detail.postedText),
      salaryText: detail.salaryText,
      stipend: extractStipend(detail.salaryText, description),
      applicants: detail.applicants,
      easyApply: detail.easyApply,
      applyUrl: detail.applyUrl,
      jobUrl: li.jobUrl(jobId),
      duration: extractDuration(description, detail.title),
      skills: extractSkills(description),
      description,
      searchKeywords: 'manual',
      logoUrl: detail.logoUrl ?? null,
      // Left NULL when the vocabulary is unsure, so the next run's classifier
      // reads the description rather than this guess standing forever.
      isTech: verdict === 'uncertain' ? null : verdict === 'tech',
      roleSource: verdict === 'uncertain' ? null : 'offline-manual',
    };
    job.summary = await summarize(job, description, cfg.summarizer);

    if (store.upsertJob(job, runId)) {
      added++;
      log.ok(`Added ${detail.company} — ${detail.title} (${detail.location ?? 'location unknown'})`);
    } else {
      log.info(`${jobId} was already present.`);
    }
  }
} catch (err) {
  log.error(`Failed: ${err.stack ?? err.message}`);
} finally {
  if (session) await closeBrave(session);
}

store.finishRun(runId, { status: failed && !added ? 'error' : 'ok', newJobs: added, skippedNote: `manual add of ${ids.length} id(s)` });

log.section('Done');
log.info(`${added} added · ${failed} failed · ${ids.length} requested`);

if (added && !NO_PUBLISH) await publish(store, cfg, added);

store.close();
