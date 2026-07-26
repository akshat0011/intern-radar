import { DatabaseSync } from 'node:sqlite';
import { PATHS, ensureDirs } from './paths.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  job_id            TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  company           TEXT,
  company_matched   TEXT,
  location          TEXT,
  workplace_type    TEXT,
  posted_text       TEXT,
  posted_at         INTEGER,
  salary_text       TEXT,
  stipend_min       REAL,
  stipend_max       REAL,
  stipend_currency  TEXT,
  stipend_period    TEXT,
  applicants        TEXT,
  easy_apply        INTEGER DEFAULT 0,
  apply_url         TEXT,
  job_url           TEXT,
  duration          TEXT,
  skills            TEXT,
  description       TEXT,
  summary           TEXT,
  search_keywords   TEXT,
  first_seen_at     INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  first_run_id      TEXT,
  reported          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_reported   ON jobs(reported, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company    ON jobs(company_matched);

CREATE TABLE IF NOT EXISTS runs (
  run_id            TEXT PRIMARY KEY,
  started_at        INTEGER NOT NULL,
  finished_at       INTEGER,
  status            TEXT,
  pages_scanned     INTEGER DEFAULT 0,
  cards_seen        INTEGER DEFAULT 0,
  details_extracted INTEGER DEFAULT 0,
  new_jobs          INTEGER DEFAULT 0,
  skipped_note      TEXT,
  error             TEXT
);

CREATE TABLE IF NOT EXISTS seen_cards (
  job_id       TEXT PRIMARY KEY,
  last_seen_at INTEGER NOT NULL,
  reason       TEXT,
  company      TEXT,
  title        TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

export class Store {
  constructor() {
    ensureDirs();
    this.db = new DatabaseSync(PATHS.db);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec(SCHEMA);
    this.#migrate();
  }

  /** Additive migrations for databases created by an earlier version. */
  #migrate() {
    const columns = this.db.prepare('PRAGMA table_info(seen_cards)').all().map((c) => c.name);
    for (const [name, type] of [['company', 'TEXT'], ['title', 'TEXT']]) {
      if (!columns.includes(name)) {
        this.db.exec(`ALTER TABLE seen_cards ADD COLUMN ${name} ${type}`);
      }
    }
  }

  close() {
    try { this.db.close(); } catch { /* already closed */ }
  }

  // ---- runs -----------------------------------------------------------------

  startRun(runId) {
    this.db.prepare('INSERT INTO runs (run_id, started_at, status) VALUES (?, ?, ?)')
      .run(runId, Date.now(), 'running');
  }

  finishRun(runId, { status, pagesScanned = 0, cardsSeen = 0, detailsExtracted = 0, newJobs = 0, skippedNote = null, error = null }) {
    this.db.prepare(`
      UPDATE runs SET finished_at = ?, status = ?, pages_scanned = ?, cards_seen = ?,
                      details_extracted = ?, new_jobs = ?, skipped_note = ?, error = ?
      WHERE run_id = ?
    `).run(Date.now(), status, pagesScanned, cardsSeen, detailsExtracted, newJobs, skippedNote, error, runId);
  }

  lastCompletedRun() {
    return this.db.prepare(
      "SELECT * FROM runs WHERE status IN ('ok','partial') ORDER BY started_at DESC LIMIT 1",
    ).get();
  }

  recentRuns(limit = 10) {
    return this.db.prepare('SELECT * FROM runs ORDER BY started_at DESC LIMIT ?').all(limit);
  }

  // ---- settings / cooldown --------------------------------------------------

  setSetting(key, value) {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, String(value));
  }

  getSetting(key) {
    return this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
  }

  /**
   * After LinkedIn rate-limits or restricts the session, refuse to run again
   * until this timestamp. Walking straight back into a rate limit on the next
   * scheduled run is how a temporary block becomes a permanent one.
   */
  setCooldown(untilMs, reason) {
    this.setSetting('cooldown_until', untilMs);
    this.setSetting('cooldown_reason', reason);
  }

  /** Returns { until, reason } while a cooldown is active, else null. */
  activeCooldown() {
    const until = Number(this.getSetting('cooldown_until') ?? 0);
    if (!until || until <= Date.now()) return null;
    return { until, reason: this.getSetting('cooldown_reason') ?? 'unspecified' };
  }

  clearCooldown() {
    this.setSetting('cooldown_until', 0);
  }

  // ---- cards ----------------------------------------------------------------

  /** Have we already fully extracted this job in an earlier run? */
  hasJob(jobId) {
    return !!this.db.prepare('SELECT 1 FROM jobs WHERE job_id = ?').get(jobId);
  }

  /**
   * Cheap record of a card we saw but chose not to open (wrong company, wrong
   * title). Lets later runs skip re-evaluating it and gives us honest counts.
   */
  noteSkippedCard(jobId, reason, company = null, title = null) {
    this.db.prepare(`
      INSERT INTO seen_cards (job_id, last_seen_at, reason, company, title)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET last_seen_at = excluded.last_seen_at
    `).run(jobId, Date.now(), reason, company, title);
  }

  /**
   * Which companies keep turning up and getting skipped.
   *
   * When a run reports "0 new jobs, 97 off-watchlist", this is the answer to
   * the obvious next question — who were those 97? Without it the watchlist is
   * impossible to tune from evidence.
   */
  topSkippedCompanies(limit = 30, sinceMs = 0) {
    return this.db.prepare(`
      SELECT company, COUNT(*) AS n
      FROM seen_cards
      WHERE reason = 'company not on watchlist'
        AND company IS NOT NULL AND company != ''
        AND last_seen_at >= ?
      GROUP BY LOWER(company)
      ORDER BY n DESC, company ASC
      LIMIT ?
    `).all(sinceMs, limit);
  }

  wasSkipped(jobId) {
    return !!this.db.prepare('SELECT 1 FROM seen_cards WHERE job_id = ?').get(jobId);
  }

  touchJob(jobId) {
    this.db.prepare('UPDATE jobs SET last_seen_at = ? WHERE job_id = ?').run(Date.now(), jobId);
  }

  // ---- jobs -----------------------------------------------------------------

  /** Insert a newly extracted job. Returns true if it was genuinely new. */
  upsertJob(job, runId) {
    const now = Date.now();
    const existing = this.db.prepare('SELECT job_id FROM jobs WHERE job_id = ?').get(job.jobId);

    if (existing) {
      this.db.prepare(`
        UPDATE jobs SET last_seen_at = ?, salary_text = COALESCE(?, salary_text),
                        applicants = COALESCE(?, applicants), apply_url = COALESCE(?, apply_url)
        WHERE job_id = ?
      `).run(now, job.salaryText ?? null, job.applicants ?? null, job.applyUrl ?? null, job.jobId);
      return false;
    }

    this.db.prepare(`
      INSERT INTO jobs (
        job_id, title, company, company_matched, location, workplace_type,
        posted_text, posted_at, salary_text, stipend_min, stipend_max,
        stipend_currency, stipend_period, applicants, easy_apply, apply_url,
        job_url, duration, skills, description, summary, search_keywords,
        first_seen_at, last_seen_at, first_run_id, reported
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
    `).run(
      job.jobId,
      job.title ?? '(untitled)',
      job.company ?? null,
      job.companyMatched ?? null,
      job.location ?? null,
      job.workplaceType ?? null,
      job.postedText ?? null,
      job.postedAt ?? null,
      job.salaryText ?? null,
      job.stipend?.min ?? null,
      job.stipend?.max ?? null,
      job.stipend?.currency ?? null,
      job.stipend?.period ?? null,
      job.applicants ?? null,
      job.easyApply ? 1 : 0,
      job.applyUrl ?? null,
      job.jobUrl ?? null,
      job.duration ?? null,
      job.skills ? JSON.stringify(job.skills) : null,
      job.description ?? null,
      job.summary ?? null,
      job.searchKeywords ?? null,
      now,
      now,
      runId,
    );
    return true;
  }

  jobsForRun(runId) {
    return this.db.prepare(
      'SELECT * FROM jobs WHERE first_run_id = ? ORDER BY posted_at DESC NULLS LAST, first_seen_at DESC',
    ).all(runId).map(hydrate);
  }

  unreportedJobs() {
    return this.db.prepare(
      'SELECT * FROM jobs WHERE reported = 0 ORDER BY posted_at DESC NULLS LAST, first_seen_at DESC',
    ).all().map(hydrate);
  }

  markReported(jobIds) {
    const stmt = this.db.prepare('UPDATE jobs SET reported = 1 WHERE job_id = ?');
    for (const id of jobIds) stmt.run(id);
  }

  recentJobs(sinceMs) {
    return this.db.prepare(
      'SELECT * FROM jobs WHERE first_seen_at >= ? ORDER BY first_seen_at DESC',
    ).all(sinceMs).map(hydrate);
  }

  stats() {
    const total = this.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n;
    const companies = this.db.prepare('SELECT COUNT(DISTINCT company_matched) AS n FROM jobs').get().n;
    const skipped = this.db.prepare('SELECT COUNT(*) AS n FROM seen_cards').get().n;
    return { total, companies, skipped };
  }
}

function hydrate(row) {
  return { ...row, skills: row.skills ? JSON.parse(row.skills) : [], easy_apply: !!row.easy_apply };
}
