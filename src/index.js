#!/usr/bin/env node
/**
 * One scan of LinkedIn for new internships at the watchlist companies.
 * Invoked by launchd at 12:00 and 18:00, or by hand via `npm run`.
 */
import { loadConfig, matchCompany, matchTitle } from './config.js';
import { ensureDirs, PATHS } from './paths.js';
import { log } from './logger.js';
import { Store } from './store.js';
import { launchBrave, closeBrave } from './browser.js';
import { ensureHealthy, assertSignedIn, assertListRendered, RunAborted, State } from './guard.js';
import * as li from './linkedin.js';
import { pause, sleep, idleFidget, humanDelay } from './human.js';
import { summarize } from './summarize.js';
import { extractStipend, extractDuration, extractSkills, extractWorkplaceType, parseRelativeTime } from './extract.js';
import { buildReport, writeReport } from './report.js';
import { publish } from './publish.js';
import { notify, open as openFile } from './notify.js';

const ARGS = new Set(process.argv.slice(2));
const DRY_RUN = ARGS.has('--dry-run');
const NO_OPEN = ARGS.has('--no-open');
/** Set by bin/run.sh so scheduled runs can behave slightly differently. */
const SCHEDULED = ARGS.has('--scheduled');

function makeRunId() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Tracks the wall-clock ceiling so a run can never sprawl unattended. */
function budget(maxMinutes) {
  const start = Date.now();
  const deadline = start + maxMinutes * 60_000;
  return {
    exceeded: () => Date.now() > deadline,
    remainingMinutes: () => Math.max(0, Math.round((deadline - Date.now()) / 60_000)),
    elapsedSeconds: () => Math.round((Date.now() - start) / 1000),
  };
}

async function main() {
  ensureDirs();
  const cfg = loadConfig();

  if (DRY_RUN) {
    log.warn('DRY RUN — one search, one page, at most 3 job details.');
    cfg.searches = cfg.searches.slice(0, 1);
    cfg.limits = { ...cfg.limits, maxPagesPerSearch: 1, maxDetailsPerRun: 3, maxRuntimeMinutes: Math.min(cfg.limits.maxRuntimeMinutes, 15) };
  }

  const runId = makeRunId();
  const store = new Store();

  // Refuse to run while a cooldown from a previous rate limit is in force.
  const cooldown = store.activeCooldown();
  if (cooldown && !ARGS.has('--force')) {
    const hours = ((cooldown.until - Date.now()) / 3_600_000).toFixed(1);
    log.warn(`Skipping this run: cooling down for another ${hours}h after ${cooldown.reason}.`);
    log.info('Override with `node src/index.js --force` if you are sure.');
    store.close();
    return;
  }

  // Land at a slightly different minute each day rather than exactly 12:00:00.
  if (SCHEDULED && !DRY_RUN && cfg.pacing.startupJitter) {
    const jitter = humanDelay(cfg.pacing.startupJitter);
    if (jitter > 1000) {
      log.info(`Waiting ${Math.round(jitter / 60_000)} min before starting (schedule jitter).`);
      await sleep(jitter);
    }
  }

  store.startRun(runId);

  const clock = budget(cfg.limits.maxRuntimeMinutes);
  const notes = [];
  const counters = { pagesScanned: 0, cardsSeen: 0, detailsExtracted: 0, newJobs: 0, skippedStale: 0, skippedCompany: 0, skippedTitle: 0, skippedKnown: 0, failedDetails: 0 };

  log.section(`Run ${runId}`);
  log.info(`${cfg.watchlist.length} watchlist terms across ${cfg.companies.length} companies · ${cfg.searches.length} searches · budget ${cfg.limits.maxRuntimeMinutes}m`);

  let session;
  let status = 'ok';
  let fatalError = null;

  try {
    session = await launchBrave(cfg);
    const { page, context } = session;

    await li.warmUp(page, cfg);
    await ensureHealthy(page, cfg, { context: 'warm-up' });
    await assertSignedIn(page, context, cfg);
    log.ok('Signed in.');

    searchLoop:
    for (const [searchIndex, search] of cfg.searches.entries()) {
      const label = `${search.keywords}${search.location ? ` @ ${search.location}` : ''}`;
      log.section(`Search: ${label}`);

      for (let pageIndex = 0; pageIndex < cfg.limits.maxPagesPerSearch; pageIndex++) {
        if (clock.exceeded()) {
          notes.push(`Stopped at the ${cfg.limits.maxRuntimeMinutes}-minute time limit, partway through "${label}" (page ${pageIndex + 1}). Remaining searches were not scanned.`);
          status = 'partial';
          break searchLoop;
        }
        if (counters.detailsExtracted >= cfg.limits.maxDetailsPerRun) {
          notes.push(`Hit the ${cfg.limits.maxDetailsPerRun}-job limit for one run. Any further matches were left for the next run.`);
          status = 'partial';
          break searchLoop;
        }

        const url = li.buildSearchUrl(search, cfg.filters, { start: pageIndex * li.RESULTS_PER_PAGE });
        log.info(`Page ${pageIndex + 1} — ${url}`);

        const navigated = await li.gotoSearch(page, url, cfg);
        await ensureHealthy(page, cfg, { context: `search "${label}" page ${pageIndex + 1}` });
        if (!navigated) {
          notes.push(`The job list never finished loading for "${label}" page ${pageIndex + 1}; skipped it.`);
          break;
        }

        const cards = await li.enumerateCards(page, cfg);
        await assertListRendered(page, cards.length, { pageIndex: pageIndex + 1, searchLabel: label });
        counters.pagesScanned++;
        counters.cardsSeen += cards.length;
        log.info(`Found ${cards.length} job cards.`);

        if (cards.length === 0) break;

        const cutoff = Date.now() - cfg.filters.postedWithinHours * 3_600_000;
        let openedOnThisPage = 0;

        for (const card of cards) {
          if (clock.exceeded() || counters.detailsExtracted >= cfg.limits.maxDetailsPerRun) break;
          if (!card.jobId) continue;

          // --- cheap filters, evaluated without opening the job -------------
          if (store.hasJob(card.jobId)) {
            counters.skippedKnown++;
            store.touchJob(card.jobId);
            continue;
          }

          const postedAt = parseRelativeTime(card.postedText);
          // Only reject on a *confidently* old timestamp; unparseable text is
          // given the benefit of the doubt rather than silently dropped.
          if (postedAt && postedAt < cutoff) {
            counters.skippedStale++;
            store.noteSkippedCard(card.jobId, 'older than window', card.company, card.title);
            continue;
          }

          if (!matchTitle(card.title, cfg.titleTerms)) {
            counters.skippedTitle++;
            store.noteSkippedCard(card.jobId, 'title did not match', card.company, card.title);
            continue;
          }

          const matched = matchCompany(card.company, cfg.watchlist);
          if (cfg.matching.requireCompanyMatch && !matched) {
            counters.skippedCompany++;
            store.noteSkippedCard(card.jobId, 'company not on watchlist', card.company, card.title);
            continue;
          }

          // --- worth opening ------------------------------------------------
          log.ok(`Opening: ${card.title} — ${card.company}${matched ? ` [${matched}]` : ''} (${card.postedText || 'no date'})`);

          await pause(cfg.pacing.betweenCards);
          await idleFidget(page);

          let detail;
          try {
            detail = await li.openAndExtract(page, card, cfg);
          } catch (err) {
            counters.failedDetails++;
            log.warn(`Could not read "${card.title}" — ${err.message.split('\n')[0]}`);
            await ensureHealthy(page, cfg, { context: `job ${card.jobId}` });
            continue;
          }

          await ensureHealthy(page, cfg, { context: `job ${card.jobId}` });
          counters.detailsExtracted++;
          openedOnThisPage++;

          const description = detail.description || '';
          const job = {
            jobId: card.jobId,
            title: detail.title || card.title,
            company: detail.company || card.company,
            companyMatched: matched,
            location: detail.location || card.location,
            workplaceType: detail.workplaceType || extractWorkplaceType(detail.location, card.location, description),
            postedText: detail.postedText || card.postedText,
            postedAt: parseRelativeTime(detail.postedText || card.postedText),
            salaryText: detail.salaryText || card.salaryText,
            stipend: extractStipend(detail.salaryText, card.salaryText, description),
            applicants: detail.applicants,
            easyApply: detail.easyApply ?? card.easyApply,
            applyUrl: detail.applyUrl,
            jobUrl: li.jobUrl(card.jobId),
            duration: extractDuration(description, detail.title || card.title),
            skills: extractSkills(description),
            description,
            searchKeywords: search.keywords,
          };
          job.summary = await summarize(job, description, cfg.summarizer);

          if (store.upsertJob(job, runId)) {
            counters.newJobs++;
            log.ok(`  → saved (${counters.newJobs} new so far)`);
          }

          if (counters.detailsExtracted > 0 && counters.detailsExtracted % cfg.pacing.longBreakEvery === 0) {
            log.info('Taking a longer break to keep the request rate low…');
            await pause(cfg.pacing.longBreak);
          }
        }

        log.info(`Page ${pageIndex + 1} done — opened ${openedOnThisPage} of ${cards.length} cards.`);

        // Keep paging until LinkedIn's own "Next" control says there is no
        // more, which is the only reliable signal that the result set is
        // exhausted. Fall back to the short-page heuristic only when no
        // pagination bar could be found.
        const more = await li.hasNextPage(page);
        if (more === false) {
          log.ok(`No Next button — all ${pageIndex + 1} pages of "${label}" have been searched.`);
          break;
        }
        if (more === null && cards.length < li.RESULTS_PER_PAGE) {
          log.info(`No pagination control and a short page — treating page ${pageIndex + 1} as the last.`);
          break;
        }
        if (pageIndex === cfg.limits.maxPagesPerSearch - 1) {
          notes.push(`Stopped at the ${cfg.limits.maxPagesPerSearch}-page safety cap for "${label}", and LinkedIn still had a Next page. Raise limits.maxPagesPerSearch in config.json to go deeper.`);
          log.warn(`Hit the ${cfg.limits.maxPagesPerSearch}-page cap for "${label}" with more pages still available.`);
        }
        await pause(cfg.pacing.betweenPages);
      }

      if (searchIndex < cfg.searches.length - 1) {
        log.info('Pausing between searches…');
        await pause(cfg.pacing.betweenSearches);
      }
    }
  } catch (err) {
    if (err instanceof RunAborted) {
      status = counters.newJobs > 0 ? 'partial' : 'aborted';
      fatalError = err.message;

      // A rate limit means back off hard rather than trying again in six hours.
      if (err.state === State.RATE_LIMITED && cfg.safety.cooldownHoursAfterRateLimit > 0) {
        const until = Date.now() + cfg.safety.cooldownHoursAfterRateLimit * 3_600_000;
        store.setCooldown(until, 'a LinkedIn rate limit');
        notes.push(`Runs are paused for ${cfg.safety.cooldownHoursAfterRateLimit}h after that rate limit. Override with \`node src/index.js --force\`.`);
        log.warn(`Cooling down until ${new Date(until).toLocaleString('en-IN')}.`);
      }

      notes.push(
        err.state === State.CHALLENGE ? 'A LinkedIn security check went unsolved, so the scan stopped early. Whatever was found before that is below.'
        : err.state === State.LOGGED_OUT ? 'The LinkedIn session expired mid-run. Run `npm run login` to sign in again.'
        : 'LinkedIn started rate limiting, so the scan stopped early to protect the account.',
      );
      log.error(err.message);
    } else {
      status = 'error';
      fatalError = err.message;
      log.error(`Run failed: ${err.stack ?? err.message}`);
      notes.push(`The run failed: ${err.message}`);
      if (cfg.notifications.onError) {
        await notify('Internship watcher failed', err.message.slice(0, 180), { sound: 'Basso' });
      }
    }
  } finally {
    if (session) await closeBrave(session);
  }

  // ---- report ---------------------------------------------------------------

  const summaryLine =
    `${counters.cardsSeen} cards scanned · ${counters.detailsExtracted} opened · ${counters.newJobs} new · ` +
    `skipped ${counters.skippedCompany} off-watchlist, ${counters.skippedTitle} wrong title, ` +
    `${counters.skippedStale} older than ${cfg.filters.postedWithinHours}h, ${counters.skippedKnown} already known` +
    (counters.failedDetails ? ` · ${counters.failedDetails} failed to read` : '');

  log.section('Summary');
  log.info(summaryLine);
  log.info(`Took ${clock.elapsedSeconds()}s`);

  // "0 new jobs, 97 off-watchlist" invites the question "which 97?". Answer it
  // here, so the watchlist can be tuned from evidence rather than guesswork.
  if (counters.newJobs === 0 && counters.skippedCompany > 0) {
    const top = store.topSkippedCompanies(8, Date.now() - 7 * 86_400_000);
    if (top.length) {
      log.info('Most frequent companies skipped as off-watchlist (last 7 days):');
      for (const { company, n } of top) log.info(`    ${String(n).padStart(3)}×  ${company}`);
      log.info('Add any of these to config.json, or see the full list with `node bin/show-report.js --skipped`.');
    }
  }

  store.finishRun(runId, {
    status,
    pagesScanned: counters.pagesScanned,
    cardsSeen: counters.cardsSeen,
    detailsExtracted: counters.detailsExtracted,
    newJobs: counters.newJobs,
    skippedNote: summaryLine,
    error: fatalError,
  });

  const newJobs = store.jobsForRun(runId);
  const html = buildReport({
    jobs: newJobs,
    run: { runId, startedAt: Date.now() - clock.elapsedSeconds() * 1000, finishedAt: Date.now(), ...counters },
    notes,
    stats: store.stats(),
  });
  const file = writeReport(html, runId);
  log.ok(`Report: ${file}`);

  if (newJobs.length) {
    store.markReported(newJobs.map((j) => j.job_id));
    if (cfg.notifications.onNewJobs) {
      const top = newJobs.slice(0, 3).map((j) => `${j.company}: ${j.title}`).join('\n');
      await notify(
        `${newJobs.length} new internship${newJobs.length === 1 ? '' : 's'}`,
        top + (newJobs.length > 3 ? `\n…and ${newJobs.length - 3} more` : ''),
        { sound: 'Ping', subtitle: 'Click to open the report' },
      );
    }
    if (cfg.notifications.openReportWhenDone && !NO_OPEN) {
      await openFile(file);
    }
  } else {
    log.info('No new matching internships this run.');
  }

  // Push the public job list. Runs even with 0 new jobs so the site drops
  // listings that have aged out of the window.
  if (!DRY_RUN) publish(store, cfg, newJobs.length);

  store.close();
  process.exitCode = status === 'error' ? 1 : 0;
}

// Make sure an unexpected crash still leaves a trace in the log file.
main().catch((err) => {
  log.error(`Unhandled: ${err.stack ?? err.message}`);
  process.exitCode = 1;
});
