import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './paths.js';
import { log } from './logger.js';
import { formatStipend } from './extract.js';
import { matchCompany } from './config.js';

const WEB_DATA_DIR = join(ROOT, 'web', 'public', 'data');
const JOBS_FILE = join(WEB_DATA_DIR, 'jobs.json');

/**
 * Shape a stored job into what the public site shows.
 *
 * Full descriptions are deliberately left out by default. They are the posting
 * company's copyrighted text, and republishing them wholesale is a far bigger
 * exposure than showing our own summary and linking to the source. Students get
 * the summary plus every hard fact they need to decide; the Apply link takes
 * them to the real posting.
 */
function toPublicJob(row, { includeFullDescription, matchedNow }) {
  const stipend = formatStipend({
    min: row.stipend_min, max: row.stipend_max,
    currency: row.stipend_currency, period: row.stipend_period,
  }) || row.salary_text || null;

  return {
    id: row.job_id,
    // The company shown publicly is the one on the posting, not our watchlist
    // label. A mislabelled employer on a public site is worse than no label.
    title: row.title,
    company: row.company || matchedNow || 'Unknown',
    matchedWatchlist: matchedNow,
    location: row.location || null,
    workplaceType: row.workplace_type || null,
    stipend,
    duration: row.duration || null,
    applicants: row.applicants || null,
    easyApply: !!row.easy_apply,
    skills: row.skills || [],
    summary: row.summary || null,
    postedText: row.posted_text || null,
    postedAt: row.posted_at || row.first_seen_at,
    firstSeenAt: row.first_seen_at,
    url: row.job_url,
    applyUrl: row.apply_url || row.job_url,
    // Only carried when explicitly enabled; the tailor endpoint works fine
    // from the summary and skills alone.
    description: includeFullDescription ? row.description : null,
  };
}

/** Write the public jobs payload. Returns { count, path, changed }. */
export function writeJobsFile(store, cfg) {
  const maxAgeMs = (cfg.publish?.maxAgeDays ?? 14) * 86_400_000;
  const includeFullDescription = !!cfg.publish?.includeFullDescription;

  let dropped = 0;
  const jobs = store
    .recentJobs(Date.now() - maxAgeMs)
    // Re-run the company match at publish time instead of trusting what was
    // stored. Rows captured before a matcher fix can carry a stale, wrong
    // label — an early bug filed "SolarSquare" under "Ola" — and publishing
    // that to students would be worse than dropping it.
    .map((row) => ({ row, matchedNow: matchCompany(row.company, cfg.watchlist) }))
    .filter(({ row, matchedNow }) => {
      if (!cfg.matching?.requireCompanyMatch) return true;
      if (matchedNow) return true;
      dropped++;
      log.debug(`Not publishing "${row.title}" — "${row.company}" no longer matches the watchlist.`);
      return false;
    })
    .map(({ row, matchedNow }) => toPublicJob(row, { includeFullDescription, matchedNow }))
    .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));

  if (dropped) {
    log.warn(`Held back ${dropped} stored job${dropped === 1 ? '' : 's'} whose company no longer matches the watchlist.`);
  }

  const payload = {
    generatedAt: Date.now(),
    count: jobs.length,
    companies: [...new Set(jobs.map((j) => j.company))].sort(),
    locations: [...new Set(jobs.map((j) => j.location).filter(Boolean))].sort(),
    jobs,
  };

  mkdirSync(WEB_DATA_DIR, { recursive: true });

  const next = `${JSON.stringify(payload, null, 1)}\n`;
  writeFileSync(JOBS_FILE, next);

  return { count: jobs.length, path: JOBS_FILE };
}

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args[0]} failed: ${(err.stderr || err.message).toString().split('\n')[0]}`);
  }
}

/**
 * Commit and push the jobs file. Vercel is watching the repo, so the push is
 * what makes the site update — usually live within a minute.
 */
export function pushToSite(newJobCount) {
  if (!existsSync(join(ROOT, '.git'))) {
    log.warn('Not a git repository — skipping publish. Run `git init` and connect the GitHub remote first.');
    return false;
  }

  const status = git(['status', '--porcelain', 'web/public/data/jobs.json'], { allowFail: true });
  if (!status) {
    log.info('Job list is unchanged — nothing to publish.');
    return false;
  }

  const remote = git(['remote'], { allowFail: true });
  if (!remote) {
    log.warn('No git remote configured — the jobs file was written but not published.');
    return false;
  }

  try {
    git(['add', 'web/public/data/jobs.json']);
    const message = newJobCount > 0
      ? `Add ${newJobCount} new internship${newJobCount === 1 ? '' : 's'}`
      : 'Refresh job listings';
    git(['commit', '-m', message]);

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    git(['push', 'origin', branch]);
    log.ok(`Published to the site — Vercel will redeploy within a minute.`);
    return true;
  } catch (err) {
    // A publish failure must never fail the scrape; the data is safe locally.
    log.warn(`Could not publish: ${err.message}`);
    log.info('The jobs file is written locally. Push it by hand when convenient.');
    return false;
  }
}

/** Full publish step, called at the end of a run. */
export function publish(store, cfg, newJobCount) {
  if (cfg.publish?.enabled === false) return;

  try {
    const { count, path } = writeJobsFile(store, cfg);
    log.info(`Wrote ${count} jobs to ${path.replace(ROOT, '.')}`);
    if (cfg.publish?.autoPush !== false) pushToSite(newJobCount);
  } catch (err) {
    log.warn(`Publish step failed: ${err.message}`);
  }
}
