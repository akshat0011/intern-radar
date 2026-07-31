#!/usr/bin/env node
/**
 * Read every discovered ATS board and store the internships found.
 *
 *   node bin/poll-ats.js              poll all boards, store, publish
 *   node bin/poll-ats.js --dry-run    show what would be stored, write nothing
 *   node bin/poll-ats.js --no-publish store, but do not regenerate the site
 *   node bin/poll-ats.js --company "Meesho"
 *
 * This is the cheap half. No browser, no login, no pacing, no rate-limit guard —
 * just JSON over HTTPS from endpoints that exist to be read. That is why it can
 * run far more often than the LinkedIn scan, and why being early here is a
 * property of the source rather than of how hard we push.
 *
 * Postings land in the same `jobs` table as the scraper's, so the site does not
 * know or care which collector found a role. `source` records which one did,
 * because when two collectors disagree you want to know who said what.
 */
import { loadConfig, matchCompany, matchTitle } from '../src/config.js';
import { Store } from '../src/store.js';
import { fetchBoard } from '../src/ats.js';
import { classifyRole } from '../src/roles.js';
import { extractStipend, extractDuration, extractWorkplaceType } from '../src/extract.js';
import { publish } from '../src/publish.js';
import { log } from '../src/logger.js';

const ARGS = process.argv.slice(2);
const has = (f) => ARGS.includes(f);
const valueOf = (f) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : null; };

const DRY_RUN = has('--dry-run');
const NO_PUBLISH = has('--no-publish');
const ONLY = valueOf('--company');
const CONCURRENCY = Number(valueOf('--concurrency') ?? 8);

const cfg = loadConfig();
const store = new Store();
store.ensureAtsTable();

let boards = store.atsBoards();
if (ONLY) boards = boards.filter((b) => b.company.toLowerCase() === ONLY.toLowerCase());

if (!boards.length) {
  console.log('No ATS boards known yet. Run `node bin/discover-ats.js` first.');
  store.close();
  process.exit(0);
}

/**
 * India-only, and only where the posting says so.
 *
 * These boards are global — a Greenhouse board carries every office. Without
 * this the site would fill with San Francisco roles no student here can take.
 * A posting with no location at all is kept, because "Remote" and blank are both
 * common and dropping them loses real listings; the title filter still applies.
 */
const INDIA = /\b(india|bengaluru|bangalore|mumbai|delhi|gurugram|gurgaon|noida|hyderabad|chennai|pune|kolkata|ahmedabad|jaipur|indore|kochi|coimbatore|chandigarh|trivandrum|thiruvananthapuram|mysore|mysuru|nagpur|bhubaneswar|vizag|visakhapatnam)\b/i;
const NON_INDIA = /\b(united states|usa|u\.s\.|canada|london|uk|united kingdom|germany|berlin|france|paris|singapore|australia|sydney|japan|tokyo|dublin|amsterdam|poland|warsaw|brazil|mexico|israel|tel aviv|dubai|uae|new york|san francisco|seattle|austin|boston|chicago|toronto|vancouver)\b/i;

function isIndia(location) {
  if (!location) return true;               // unknown — let the title filter decide
  if (INDIA.test(location)) return true;
  if (NON_INDIA.test(location)) return false;
  return false;
}

/**
 * How old a posting may be and still count as news.
 *
 * The scraper never needed this: LinkedIn is searched with a time window, so
 * stale roles are filtered at the source. An ATS board has no such window — it
 * lists whatever is still open, and companies leave roles open for months. The
 * first real poll surfaced postings 159 and 214 days old, which would have gone
 * onto a site whose entire promise is being early. Being first to a
 * seven-month-old listing is not a feature.
 */
const MAX_POSTING_AGE_DAYS = Number(valueOf('--max-age-days') ?? cfg.ats?.maxPostingAgeDays ?? 30);
const OLDEST_ACCEPTABLE = Date.now() - MAX_POSTING_AGE_DAYS * 86_400_000;

let checked = 0;
let stored = 0;
let skippedNonIntern = 0;
let skippedNonIndia = 0;
let skippedNonTech = 0;
let skippedStale = 0;
let failed = 0;
const preview = [];

async function pollOne(board) {
  let jobs;
  try {
    jobs = await fetchBoard(board.provider, board.token);
  } catch (err) {
    failed++;
    log.debug(`${board.company}: ${err.message}`);
    return;
  }
  checked++;
  if (!jobs) { failed++; return; }

  for (const j of jobs) {
    if (!matchTitle(j.title, cfg.titleTerms)) { skippedNonIntern++; continue; }
    if (!isIndia(j.location)) { skippedNonIndia++; continue; }
    // A posting with no date is kept — some providers omit it — but a known-old
    // one is not, however open it still is.
    if (j.postedAt && j.postedAt < OLDEST_ACCEPTABLE) { skippedStale++; continue; }

    const verdict = classifyRole(j.title, {
      extraPositive: cfg.matching.extraTechTerms ?? [],
      extraNegative: cfg.matching.extraNonTechTerms ?? [],
    });
    // Same rule as the scraper: engineering only, but an ambiguous title is not
    // thrown away on the title alone.
    if (verdict.verdict === 'non-tech') { skippedNonTech++; continue; }
    const isTech = verdict.verdict === 'tech' ? true : null;

    // Prefixed so an ATS id can never collide with a LinkedIn numeric job id.
    const jobId = `ats:${board.provider}:${board.token}:${j.id}`;

    if (DRY_RUN) {
      preview.push(`${board.company} — ${j.title}${j.location ? ` (${j.location})` : ''}`);
      stored++;
      continue;
    }

    const isNew = store.upsertJob({
      jobId,
      title: j.title,
      company: board.company,
      companyMatched: matchCompany(board.company, cfg.watchlist) ?? board.company,
      location: j.location,
      workplaceType: j.remote || extractWorkplaceType(j.location),
      postedAt: j.postedAt,
      postedText: null,
      salaryText: null,
      stipend: extractStipend(j.title),
      duration: extractDuration(j.title),
      jobUrl: j.url,
      applyUrl: j.url,
      searchKeywords: `ats:${board.provider}`,
      isTech,
      roleSource: `ats-${board.provider}`,
    }, `ats-${new Date().toISOString().slice(0, 10)}`);

    if (isNew) {
      stored++;
      log.ok(`  + ${board.company} — ${j.title}${j.location ? ` (${j.location})` : ''}`);
    }
  }

  if (!DRY_RUN) store.markAtsPolled(board.company);
}

console.log(`Polling ${boards.length} ATS board${boards.length === 1 ? '' : 's'}…\n`);

const queue = [...boards];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const b = queue.shift();
    if (b) await pollOne(b);
  }
}));

console.log(`\n=== ${checked}/${boards.length} boards read${failed ? `, ${failed} failed` : ''} ===`);
console.log(`  ${stored} new internship${stored === 1 ? '' : 's'} stored`);
console.log(`  skipped: ${skippedNonIntern} not an internship · ${skippedNonIndia} outside India · ${skippedStale} older than ${MAX_POSTING_AGE_DAYS}d · ${skippedNonTech} non-engineering`);

if (DRY_RUN) {
  console.log('\n--dry-run, nothing written. Would have stored:');
  for (const p of preview.slice(0, 40)) console.log('   ' + p);
  if (preview.length > 40) console.log(`   …and ${preview.length - 40} more`);
} else if (stored && !NO_PUBLISH) {
  console.log('\nPublishing…');
  await publish(store, cfg, stored);
}

store.close();
