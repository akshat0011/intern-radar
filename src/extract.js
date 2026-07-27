/**
 * Pulling structured facts out of free-text job descriptions.
 * Everything here is offline and deterministic — no API calls, no key required.
 */

const CURRENCY_SYMBOLS = {
  '₹': 'INR', 'rs': 'INR', 'rs.': 'INR', 'inr': 'INR',
  '$': 'USD', 'usd': 'USD', 'us$': 'USD',
  '€': 'EUR', 'eur': 'EUR',
  '£': 'GBP', 'gbp': 'GBP',
  '¥': 'JPY', 'jpy': 'JPY',
  'aed': 'AED', 'sgd': 'SGD', 'cad': 'CAD', 'aud': 'AUD',
};

const PERIOD_PATTERNS = [
  [/\b(per\s+month|\/\s*month|\/\s*mo\b|p\.?m\.?\b|monthly|a\s+month)/i, 'month'],
  [/\b(per\s+hour|\/\s*hour|\/\s*hr\b|hourly|an\s+hour)/i, 'hour'],
  [/\b(per\s+week|\/\s*week|\/\s*wk\b|weekly|a\s+week)/i, 'week'],
  [/\b(per\s+year|\/\s*year|\/\s*yr\b|annually|per\s+annum|p\.?a\.?\b|lpa|yearly)/i, 'year'],
  [/\b(per\s+day|\/\s*day|daily|a\s+day)/i, 'day'],
  [/\b(stipend|total|lump\s*sum)\b/i, 'total'],
];

/** A bare number with optional scale suffix: "1,20,000", "25k", "1.5 lakh", "12 LPA". */
const AMOUNT = String.raw`\d[\d,]*(?:\.\d+)?(?:\s*(?:k|lakhs?|lac|lpa|cr(?:ore)?s?|million|mn)\b)?`;
/** A leading currency marker: "₹", "$", "INR ", "Rs. ". */
const CURRENCY = String.raw`[₹$€£¥]|\b(?:inr|usd|eur|gbp|jpy|aed|sgd|cad|aud|rs)\b\.?\s*`;

/**
 * "1,20,000" / "25k" / "1.5 lakh" / "12 LPA" -> a number.
 * Also reports whether a scale suffix was applied, which is what lets us trust
 * a small figure like "50k" while rejecting a stray "3".
 */
function parseAmount(text) {
  if (!text) return null;
  const s = String(text).toLowerCase().replace(/,/g, '').trim();

  let multiplier = 1;
  if (/\b(lakhs?|lac|lpa)\b/.test(s)) multiplier = 100_000;
  else if (/\bcr(ore)?s?\b/.test(s)) multiplier = 10_000_000;
  else if (/\b(million|mn)\b/.test(s)) multiplier = 1_000_000;
  else if (/\d\s*k\b/.test(s)) multiplier = 1_000;

  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const value = parseFloat(m[1]) * multiplier;
  if (!Number.isFinite(value)) return null;
  return { value, scaled: multiplier > 1 };
}

/**
 * Period and currency are read from a narrow window around the figure rather
 * than the whole line, so "₹40,000 per month" in a paragraph that also mentions
 * an annual bonus does not get mislabelled.
 */
function windowAround(line, index, length, span = 90) {
  return line.slice(Math.max(0, index - span), Math.min(line.length, index + length + span));
}

function detectPeriod(context) {
  for (const [re, period] of PERIOD_PATTERNS) {
    if (re.test(context)) return period;
  }
  return null;
}

function detectCurrency(context) {
  const lower = context.toLowerCase();
  // Symbols are unambiguous; check them before three-letter codes.
  for (const sym of ['₹', '$', '€', '£', '¥']) {
    if (lower.includes(sym)) return CURRENCY_SYMBOLS[sym];
  }
  for (const [token, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (/^[a-z]/.test(token) && new RegExp(`\\b${token.replace('.', '\\.')}`).test(lower)) return code;
  }
  // "12 LPA" implies rupees even with no explicit currency marker.
  if (/\b(lpa|lakhs?|lac|crore)\b/.test(lower)) return 'INR';
  return null;
}

const MONEY_KEYWORD = /\b(stipend|salary|compensation|remuneration|pay|payment|paid|ctc|package|honorarium)\b/i;
const CURRENCY_HINT = /[₹$€£¥]|\b(inr|usd|eur|gbp|rs|lpa|lakhs?|lac|crore)\b/i;

/**
 * Money that is emphatically not the candidate's.
 *
 * Company blurbs are full of large currency figures — "received more than $410
 * million in funding" got published as a $410,000,000 intern stipend before this
 * existed. A line matching any of these is not a compensation line.
 */
const NOT_COMPENSATION = /\b(funding|funded|valuation|valued|raised|raising|investors?|investment|revenue|turnover|arr|gmv|market\s+cap|series\s+[a-f]\b|acquisition|acquired|profit|assets under management|aum|portfolio|transactions?|processed|donat|grant)\b/i;

/** A stipend must be quoted against a period, or be a plausible one-off. */
const PERIOD_HINT = /\b(per|\/|monthly|weekly|yearly|annually|annum|month|week|year|hour|day|pm\b|pa\b|lpa)\b/i;

/**
 * Nothing an intern is paid runs to a crore as an unqualified lump sum. A
 * figure this large with no period attached is a company statistic, not pay.
 */
const IMPLAUSIBLE_LUMP = 10_000_000;

/**
 * Find stipend/salary in text. Prefers an explicit range, then a figure with a
 * currency marker, then a bare figure on a line that talks about money.
 * Returns null when nothing credible is found — a wrong number is worse than
 * no number.
 *
 * Splits on newlines only. An earlier version also split on sentence
 * boundaries, which broke "Rs. 15,000" in half at the abbreviation's full stop.
 */
export function extractStipend(...texts) {
  const haystack = texts.filter(Boolean).join('\n');
  if (!haystack) return null;

  const candidates = [];

  for (const line of haystack.split('\n')) {
    if (line.length > 2000) continue; // Runaway line; not worth scanning.

    // Funding, valuation and revenue figures are the single biggest source of
    // wrong stipends. Drop those lines before looking for numbers at all.
    if (NOT_COMPENSATION.test(line)) continue;

    const hasKeyword = MONEY_KEYWORD.test(line);
    if (!hasKeyword && !CURRENCY_HINT.test(line)) continue;
    const hasPeriod = PERIOD_HINT.test(line);

    // 1. An explicit range: "₹20,000 - ₹40,000", "$25 to $45".
    const range = new RegExp(
      `(?:${CURRENCY})?\\s*(${AMOUNT})\\s*(?:-|–|—|to|up\\s*to)\\s*(?:${CURRENCY})?\\s*(${AMOUNT})`,
      'i',
    ).exec(line);
    if (range) {
      const min = parseAmount(range[1]);
      const max = parseAmount(range[2]);
      const ctx = windowAround(line, range.index, range[0].length);
      // A "3 - 6 months" style range is a duration, not money.
      const credible = min && max && max.value >= min.value
        && (min.scaled || max.scaled || CURRENCY_HINT.test(ctx) || min.value >= 1000);
      if (credible) {
        candidates.push({
          min: min.value, max: max.value,
          currency: detectCurrency(ctx), period: detectPeriod(ctx),
          raw: range[0].trim(), score: hasKeyword ? 4 : 3,
        });
        continue;
      }
    }

    // 2. A figure carrying a currency marker: "₹30,000", "Rs. 15,000".
    // A currency symbol on its own is not evidence of pay — the line must also
    // either talk about compensation or quote a period.
    const withCurrency = (hasKeyword || hasPeriod)
      ? new RegExp(`(${CURRENCY})\\s*(${AMOUNT})`, 'i').exec(line)
      : null;
    if (withCurrency) {
      const amount = parseAmount(withCurrency[2]);
      if (amount && (amount.scaled || amount.value >= 10)) {
        const ctx = windowAround(line, withCurrency.index, withCurrency[0].length);
        candidates.push({
          min: amount.value, max: amount.value,
          currency: detectCurrency(ctx), period: detectPeriod(ctx),
          raw: withCurrency[0].trim(), score: hasKeyword ? 3 : 2,
        });
        continue;
      }
    }

    // 3. A bare figure, but only on a line that is explicitly about money:
    //    "Stipend: 50k per month", "CTC 12 LPA".
    if (!hasKeyword && !/\b(lpa|lakhs?|lac|crore)\b/i.test(line)) continue;
    const bare = new RegExp(`(${AMOUNT})`, 'i').exec(line);
    if (bare) {
      const amount = parseAmount(bare[1]);
      // Unscaled small integers on a money line are usually counts
      // ("2 rounds", "3 interns"), so require a scale suffix or a real figure.
      if (amount && (amount.scaled || amount.value >= 1000)) {
        const ctx = windowAround(line, bare.index, bare[0].length);
        candidates.push({
          min: amount.value, max: amount.value,
          currency: detectCurrency(ctx), period: detectPeriod(ctx),
          raw: bare[0].trim(), score: 1,
        });
      }
    }
  }

  const plausible = candidates.filter(
    (c) => c.period || c.max < IMPLAUSIBLE_LUMP,
  );
  if (!plausible.length) return null;

  plausible.sort((a, b) => b.score - a.score || b.max - a.max);
  const best = plausible[0];
  return { min: best.min, max: best.max, currency: best.currency, period: best.period, raw: best.raw };
}

/** Human-readable stipend string for the report. */
export function formatStipend(stipend) {
  // Callers pass rows straight from the database, where these columns are null
  // whenever no figure was found.
  if (!stipend || stipend.min == null || stipend.max == null) return null;
  const sym = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥' }[stipend.currency] ?? (stipend.currency ? `${stipend.currency} ` : '');
  const fmt = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const amount = stipend.min === stipend.max ? `${sym}${fmt(stipend.min)}` : `${sym}${fmt(stipend.min)} – ${sym}${fmt(stipend.max)}`;
  return stipend.period ? `${amount} / ${stipend.period}` : amount;
}

/** "6 months", "Summer 2026", "3-6 month internship". */
export function extractDuration(...texts) {
  const haystack = texts.filter(Boolean).join('\n');
  const patterns = [
    /\b(\d+\s*(?:-|–|to)\s*\d+)\s*(month|week|year)s?\b/i,
    /\b(\d+)\s*(month|week|year)s?\s*(?:long\s*)?(?:internship|program|duration|contract|term)/i,
    /\b(?:duration|length|period)\s*[:\-–]?\s*(\d+\s*(?:-|–|to)?\s*\d*)\s*(month|week|year)s?/i,
    /\b(\d+)\s*(month|week)s?\b/i,
    /\b(summer|winter|spring|fall|autumn)\s*(20\d\d)\b/i,
  ];
  for (const re of patterns) {
    const m = haystack.match(re);
    if (m) return m[0].replace(/\s+/g, ' ').trim();
  }
  return null;
}

// Bare "go" and "r" are deliberately absent: `\bgo\b` and `\br\b` fire on
// ordinary prose ("ready to go", "R&D") far more often than on the languages.
const SKILL_VOCAB = [
  'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'golang', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'scala', 'matlab', 'sql',
  'react', 'react native', 'next.js', 'vue', 'angular', 'svelte', 'node.js', 'express', 'django', 'flask', 'fastapi', 'spring', 'spring boot', '.net', 'rails',
  'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'jenkins', 'ci/cd', 'linux', 'git',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'llm', 'generative ai', 'rag',
  'mongodb', 'postgresql', 'mysql', 'redis', 'kafka', 'elasticsearch', 'graphql', 'rest api', 'microservices',
  'data structures', 'algorithms', 'system design', 'oop', 'agile', 'figma', 'tableau', 'power bi', 'excel',
];

/** Which known technologies does this description mention? */
export function extractSkills(...texts) {
  const haystack = texts.filter(Boolean).join('\n').toLowerCase();
  if (!haystack) return [];
  const found = new Set();
  for (const skill of SKILL_VOCAB) {
    // Escape regex metacharacters (c++, .net, ci/cd, next.js).
    const esc = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const boundary = /^[a-z0-9]/.test(skill) ? `\\b${esc}` : esc;
    if (new RegExp(`${boundary}${/[a-z0-9]$/.test(skill) ? '\\b' : ''}`, 'i').test(haystack)) {
      found.add(skill);
    }
  }
  // Prefer the more specific of overlapping pairs.
  if (found.has('react native')) found.delete('react');
  if (found.has('spring boot')) found.delete('spring');
  return [...found].slice(0, 14);
}

/**
 * Degree names, longest first so "B.Tech" wins before a bare "B" pattern could
 * match, and so "Bachelor" is only reached when no specific qualification is named.
 */
const DEGREE_PATTERNS = [
  [/\bb\.?\s?tech\b/i, 'B.Tech'],
  [/\bm\.?\s?tech\b/i, 'M.Tech'],
  // Case-sensitive, and no /i. "B.E" and "M.E" without it match the ordinary English
  // words "be" and "me" — a Stripe posting saying "will be used in production" was
  // read as requiring a B.E. Degree abbreviations are always written uppercase.
  [/\bB\.?\s?E\.?(?![a-zA-Z])/, 'B.E'],
  [/\bM\.?\s?E\.?(?![a-zA-Z])/, 'M.E'],
  [/\bb\.?\s?sc\b/i, 'B.Sc'],
  [/\bm\.?\s?sc\b/i, 'M.Sc'],
  [/\bb\.?\s?com\b/i, 'B.Com'],
  [/\bm\.?\s?com\b/i, 'M.Com'],
  [/\bbca\b/i, 'BCA'],
  [/\bmca\b/i, 'MCA'],
  [/\bbba\b/i, 'BBA'],
  [/\bmba\b/i, 'MBA'],
  // Same trap: "BA", "MA" and "CA" are all common words in lower case.
  [/\bB\.?\s?A\.?(?![a-zA-Z])/, 'BA'],
  [/\bM\.?\s?A\.?(?![a-zA-Z])/, 'MA'],
  [/\bph\.?\s?d\b/i, 'PhD'],
  [/\bCMA\b/, 'CMA'],
  [/\bCA\b(?!\w)/, 'CA'],
  [/\bdiploma\b/i, 'Diploma'],
  // Generic levels are matched alongside the specific degrees, not as a fallback
  // after them. "Bachelor's/Master's/PhD in CS" must not reduce to "PhD" just
  // because PhD is in the specific list — that reads as "a doctorate is required".
  [/\bbachelor|\bunder\s?graduate/i, "Bachelor's"],
  [/\bmaster|\bpost\s?graduate/i, "Master's"],
];

/**
 * Named qualifications that make a generic level redundant: "B.Tech or any
 * bachelor's degree" says bachelor twice.
 *
 * PhD is deliberately absent from the master's set. A doctorate is a different
 * level, not a master's, so "Bachelor's/Master's/PhD" must keep its Master's.
 */
const UG_DEGREES = new Set(['B.Tech', 'B.E', 'B.Sc', 'B.Com', 'BCA', 'BBA', 'BA', 'Diploma']);
const PG_DEGREES = new Set(['M.Tech', 'M.E', 'M.Sc', 'M.Com', 'MCA', 'MBA', 'MA']);

/**
 * Reduce a qualification phrase to the degree name alone.
 *
 * The model is asked for just the degree, but it reliably volunteers the field of
 * study too — "B.E/B.Tech CS or IT", "bachelor's degree in Computer Science". The
 * field is noise on a card: the reader already knows they are looking at engineering
 * roles, and "B.Tech" is the fact that decides whether they are eligible.
 *
 * Returns '' when nothing recognisable is named, which the card treats as "not stated"
 * rather than printing something misleading.
 */
export function normaliseDegree(text) {
  if (!text || typeof text !== 'string') return '';

  const found = [];
  for (const [pattern, name] of DEGREE_PATTERNS) {
    const m = text.match(pattern);
    if (m && !found.some((f) => f.name === name)) found.push({ name, at: m.index });
  }

  if (!found.length) return '';

  // "B.Tech or any bachelor's degree" names the same level twice. Keep the specific
  // one and drop the generic, but only for the level that is actually duplicated —
  // in "B.Tech or Master's" the Master's is new information and must survive.
  const names = new Set(found.map((f) => f.name));
  const drop = new Set();
  if ([...names].some((n) => UG_DEGREES.has(n))) drop.add("Bachelor's");
  if ([...names].some((n) => PG_DEGREES.has(n))) drop.add("Master's");

  const kept = found.filter((f) => !drop.has(f.name));
  if (!kept.length) return '';

  // Keep the order the posting used — "B.E/B.Tech" reads as written, not reshuffled.
  // Two is already a mouthful in a chip; beyond that the qualification stops being
  // the point. "B.E/B.Tech" is useful, "B.E/B.Tech/B.Sc/BCA" is not.
  return kept.sort((a, b) => a.at - b.at).slice(0, 2).map((f) => f.name).join('/');
}

/** Remote / hybrid / on-site. */
export function extractWorkplaceType(...texts) {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  if (/\bhybrid\b/.test(haystack)) return 'Hybrid';
  if (/\b(remote|work from home|wfh)\b/.test(haystack)) return 'Remote';
  if (/\b(on-?site|in-?office|in person)\b/.test(haystack)) return 'On-site';
  return null;
}

/**
 * Turn LinkedIn's relative posted-time text into an absolute timestamp.
 * "3 hours ago" / "Just now" / "Posted 2 days ago" / "Reposted 45 minutes ago".
 * Returns epoch ms, or null when the text is unparseable.
 */
export function parseRelativeTime(text, now = Date.now()) {
  if (!text) return null;
  const s = String(text).toLowerCase();

  if (/just now|moments? ago|seconds? ago/.test(s)) return now;

  const m = s.match(/(\d+)\s*(minute|min|hour|hr|day|week|month|year)s?\s*ago/);
  if (!m) return null;

  const n = parseInt(m[1], 10);
  const unit = m[2];
  const MS = {
    minute: 60_000, min: 60_000,
    hour: 3_600_000, hr: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return now - n * (MS[unit] ?? 0);
}

/** Extract a numeric LinkedIn job id from any job URL shape. */
export function jobIdFromUrl(url) {
  if (!url) return null;
  const patterns = [
    /currentJobId=(\d+)/,
    /\/jobs\/view\/(?:[^/?#]*-)?(\d+)/,
    /\/jobs\/collections\/[^?]*\?.*currentJobId=(\d+)/,
    /jobPostingId[=:](\d+)/,
    /(\d{9,12})/,
  ];
  for (const re of patterns) {
    const m = String(url).match(re);
    if (m) return m[1];
  }
  return null;
}
