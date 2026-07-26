/**
 * Turning the company watchlist into LinkedIn search queries.
 *
 * Rather than scanning a broad result set and discarding most of it, each query
 * names a batch of watchlist companies with boolean OR, so nearly every card
 * that comes back is one we care about. 862 companies at ~30 per batch is about
 * 30 queries — a fraction of the 862 that searching them one at a time would
 * cost.
 */

/** Longest keyword string we will put in one query. */
const MAX_KEYWORD_CHARS = 1200;

/**
 * Multi-word names must be quoted, or LinkedIn reads
 * `Goldman Sachs OR Jane Street` as four loose words instead of two phrases.
 * Double quotes inside a name would terminate the phrase early, so they go.
 */
export function quoteTerm(name) {
  const clean = String(name).replace(/"/g, ' ').replace(/\s+/g, ' ').trim();
  return /\s/.test(clean) ? `"${clean}"` : clean;
}

/** Every distinct name and alias in the watchlist, in config order. */
export function companySearchTerms(cfg) {
  const terms = [];
  const seen = new Set();
  for (const entry of cfg.companies ?? []) {
    const company = typeof entry === 'string' ? { name: entry } : entry;
    if (!company?.name) continue;
    for (const name of [company.name, ...(company.aliases ?? [])]) {
      const key = String(name).toLowerCase().trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      terms.push(name);
    }
  }
  return terms;
}

/**
 * Group the watchlist into boolean OR queries.
 *
 * Batches are bounded by BOTH a company count and a character budget — a batch
 * of long names ("Mercedes-Benz Research and Development India") would blow
 * past a safe URL length well before it hit 30 entries.
 */
export function buildCompanyBatches(cfg) {
  const terms = companySearchTerms(cfg);
  const size = Math.max(1, cfg.companySearch?.batchSize ?? 30);
  const prefix = String(cfg.companySearch?.extraKeywords ?? '').trim();
  const location = cfg.defaultLocation ?? '';

  const batches = [];
  let group = [];
  let chars = 0;

  const flush = () => {
    if (!group.length) return;
    const clause = `(${group.map(quoteTerm).join(' OR ')})`;
    batches.push({
      keywords: prefix ? `${prefix} ${clause}` : clause,
      location,
      label: `companies ${batches.length + 1}`,
      companyCount: group.length,
    });
    group = [];
    chars = 0;
  };

  for (const term of terms) {
    const cost = quoteTerm(term).length + 4; // " OR "
    if (group.length >= size || (group.length && chars + cost > MAX_KEYWORD_CHARS)) flush();
    group.push(term);
    chars += cost;
  }
  flush();

  return batches;
}

/**
 * The searches a run should perform, per `searchMode`.
 *   companies — boolean OR batches of the watchlist (default)
 *   keywords  — the role keyword list in config.json
 *   both      — company batches first, then role keywords
 */
export function resolveSearches(cfg) {
  const mode = cfg.searchMode ?? 'companies';
  const keywordSearches = cfg.searches ?? [];

  if (mode === 'keywords') return keywordSearches;

  const batches = buildCompanyBatches(cfg);
  if (!batches.length) return keywordSearches;

  return mode === 'both' ? [...batches, ...keywordSearches] : batches;
}
