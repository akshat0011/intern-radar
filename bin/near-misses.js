#!/usr/bin/env node
/**
 * Employers we keep turning away that look like they belong on the watchlist.
 *
 *   node bin/near-misses.js              last 7 days
 *   node bin/near-misses.js --days 21
 *   node bin/near-misses.js --all        every off-watchlist internship, not just technical ones
 *
 * The watchlist is a hard gate and hand-curated, which is the right trade — the
 * off-watchlist employers posting the MOST internships are overwhelmingly
 * training schemes and staffing spam. But the cost of curation is that a real
 * company is invisible until you happen to see it somewhere else. CoinDCX was
 * dropped six times and Flam twice before either was noticed on LinkedIn, and
 * both are obviously legitimate.
 *
 * Every one of those drops is already recorded in seen_cards with the company
 * and the title. Nothing needed collecting; it just needed showing. This is the
 * queue to review — sorted by most recent rather than most frequent, because
 * frequency ranks the spam first: MediNex Workforce alone posted 34.
 */
import { DatabaseSync } from 'node:sqlite';
import { PATHS } from '../src/paths.js';
import { loadConfig, matchTitle, isBlockedCompany } from '../src/config.js';
import { classifyRole, needsDescription } from '../src/roles.js';

const ARGS = process.argv.slice(2);
const valueOf = (f, d) => { const i = ARGS.indexOf(f); return i >= 0 ? ARGS[i + 1] : d; };
const DAYS = Number(valueOf('--days', 7));
const ALL = ARGS.includes('--all');
/**
 * A real employer advertises one or two internships. A staffing or training
 * outfit advertises a catalogue: MediNex Workforce posted 17 distinct technical
 * internships in a week, Zenithbyte 4, while CoinDCX and Flam — both obviously
 * genuine, both missed — posted exactly one each. Volume is the single most
 * reliable spam signal in this data, and it points the opposite way to
 * intuition, so the list is capped rather than ranked by it.
 */
const MAX_ROLES = Number(valueOf('--max-roles', 2));

/**
 * Names that advertise what the business is. Not a moral judgement — a staffing
 * agency is a real company — but its postings are somebody else's jobs listed
 * at one remove, which is not what this site is for.
 */
const AGENCY_NAME = /\b(workforce|staffing|manpower|recruit\w*|consultanc\w*|hr\s*solutions|talent|placement|internship[s]?|trainings?|edtech|academy|institute|career[s]?\s*(hub|point)|jobs?\s*(hub|point))\b/i;

const cfg = loadConfig();
const roleOpts = {
  extraPositive: cfg.matching.extraTechTerms ?? [],
  extraNegative: cfg.matching.extraNonTechTerms ?? [],
};

const db = new DatabaseSync(PATHS.db, { readOnly: true });
const rows = db.prepare(`
  SELECT company, title, last_seen_at
  FROM seen_cards
  WHERE reason = 'company not on watchlist'
    AND company IS NOT NULL AND company != ''
    AND title IS NOT NULL AND title != ''
    AND last_seen_at >= ?
`).all(Date.now() - DAYS * 86_400_000);

const byCompany = new Map();
for (const r of rows) {
  if (isBlockedCompany(r.company)) continue;
  if (!matchTitle(r.title, cfg.titleTerms)) continue;

  // The same bar the scan would apply to an unknown employer: a confident
  // technical verdict resting on a specific term, not a generic "engineer".
  // Without it this list is 5,000 rows of copywriting and admin internships.
  if (!ALL) {
    const v = classifyRole(r.title, roleOpts);
    if (v.verdict !== 'tech' || needsDescription(r.title, roleOpts)) continue;
  }

  const key = r.company.trim();
  if (!byCompany.has(key)) byCompany.set(key, { titles: new Map(), last: 0 });
  const e = byCompany.get(key);
  e.titles.set(r.title, Math.max(e.titles.get(r.title) ?? 0, r.last_seen_at));
  e.last = Math.max(e.last, r.last_seen_at);
}

let suppressedVolume = 0;
let suppressedName = 0;
const ranked = [...byCompany.entries()]
  .map(([company, e]) => ({ company, roles: [...e.titles.keys()], last: e.last }))
  .filter((r) => {
    if (!ALL && r.roles.length > MAX_ROLES) { suppressedVolume++; return false; }
    if (!ALL && AGENCY_NAME.test(r.company)) { suppressedName++; return false; }
    return true;
  })
  .sort((a, b) => b.last - a.last);

const ago = (ms) => {
  const h = (Date.now() - ms) / 3_600_000;
  return h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

console.log(`\n${ranked.length} off-watchlist employer${ranked.length === 1 ? '' : 's'} posted `
  + `${ALL ? 'an internship' : 'a clearly technical internship'} in the last ${DAYS} days.`);
if (suppressedVolume || suppressedName) {
  // Said out loud rather than filtered away quietly: a hidden count is how you
  // end up trusting a list that is missing the thing you were looking for.
  console.log(`(${suppressedVolume} hidden for posting more than ${MAX_ROLES} distinct roles, `
    + `${suppressedName} for an agency-style name — see them all with --all)`);
}
console.log('');

for (const r of ranked.slice(0, 60)) {
  console.log(`  ${r.company}`);
  console.log(`    ${r.roles.slice(0, 3).map((t) => t.slice(0, 62)).join('\n    ')}`);
  console.log(`    last seen ${ago(r.last)}${r.roles.length > 3 ? ` · ${r.roles.length} distinct roles` : ''}\n`);
}

if (ranked.length > 60) console.log(`  …and ${ranked.length - 60} more.\n`);

console.log('Recognise one? Add it to the "companies" list in config.json, then');
console.log('recover the posting itself with:  npm run add-job -- <job id or URL>\n');

db.close();
