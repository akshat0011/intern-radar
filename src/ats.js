/**
 * Applicant-tracking-system job boards.
 *
 * Why this exists alongside the LinkedIn scraper: LinkedIn is downstream. A
 * company posts to its ATS, and the LinkedIn listing is a copy that appears
 * later. Reading the ATS directly is earlier, structured, and — unlike the
 * scraper — uses endpoints that exist to be consumed, so there is no browser, no
 * selector rot, no rate-limit guard and no terms-of-service problem.
 *
 * Every provider here is unauthenticated and free. They are the public job-board
 * endpoints that a company's own careers page calls to render itself.
 *
 * Workday is deliberately NOT in this file. It has no public job-board API; what
 * it has is the undocumented endpoint its careers pages call, which needs a
 * per-company tenant and site rather than a name slug, and which can change
 * without notice. It belongs behind its own adapter with its own discovery, not
 * mixed in with providers that publish a contract.
 */
import { log } from './logger.js';

const TIMEOUT_MS = 8000;
const UA = 'internradar (+https://www.internradar.info)';

async function getJson(url, { method = 'GET', body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': UA,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalised shape every adapter returns, so the rest of the app sees one thing. */
function job({ id, title, location, url, postedAt, department, remote }) {
  return {
    id: String(id),
    title: String(title ?? '').trim(),
    location: location ? String(location).trim() : null,
    url,
    postedAt: postedAt ? new Date(postedAt).getTime() : null,
    department: department ?? null,
    remote: remote ?? null,
  };
}

/**
 * Name → candidate tokens.
 *
 * Ordered most-likely first, and deliberately conservative: a token that is too
 * generic will match somebody else's board, and a wrong employer on a public
 * site is worse than a missing one. "India", "Technologies", "Group" and the
 * like are stripped because they are noise in a slug, but a bare first word is
 * never tried on its own for the same reason.
 */
export function candidateTokens(name) {
  const base = String(name)
    .replace(/&/g, ' and ')
    .replace(/\b(pvt|private|ltd|limited|inc|llc|corp|corporation|plc|gmbh)\b/gi, ' ')
    .trim();

  const trimmed = base.replace(/\b(india|technologies|technology|labs|group|global|solutions|services|systems|software)\b/gi, ' ').trim();

  const forms = new Set();
  for (const v of [base, trimmed]) {
    if (!v) continue;
    forms.add(v.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    forms.add(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  }
  return [...forms].filter((t) => t.length >= 3);
}

/** Loose match used to confirm a board really belongs to the company we asked for. */
function looksLikeSameCompany(a, b) {
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Is this an unclaimed demo board rather than a real employer's?
 *
 * Several of these platforms hand out a subdomain to anyone who signs up, and
 * plenty of those trials were started on a big company's name and abandoned
 * full of the template postings the product ships with. A real case from this
 * watchlist: accenture.recruitee.com serves "Senior Marketer (Sample)" and one
 * sales role in Amsterdam. Publishing that as Accenture would put a fabricated
 * job under a real employer's name on a public site, which is the worst class of
 * error this project can make.
 */
function looksLikeDemoBoard(jobs) {
  if (!jobs?.length) return true;
  const sampleish = jobs.filter((j) => /\((sample|demo|example)\)|^sample\b|^demo\b/i.test(j.title ?? '')).length;
  // Any sample posting at all is damning on a small board; on a large one it is
  // more likely to be a genuine oddity.
  return sampleish > 0 && sampleish / jobs.length >= 0.2;
}

/**
 * Confirm a board using the company name the POSTINGS carry.
 *
 * Stronger than checking the token, which we generated from the name ourselves
 * and so proves nothing. Used where the provider has no board-metadata endpoint
 * but does stamp each posting with the employer.
 */
function verifyFromPostings(rawJobs, companyName, pick) {
  const names = (rawJobs ?? []).map(pick).filter(Boolean);
  if (!names.length) return false;
  return names.some((n) => looksLikeSameCompany(n, companyName));
}

/**
 * Each provider exposes:
 *   list(token)   -> normalised jobs, or null when the board does not exist
 *   verify(token, companyName) -> true when the board is provably that company
 *
 * `verify` matters more than it looks. A short token like "navi" or "meesho"
 * will happily resolve to somebody else's board, and publishing another
 * company's postings under a watchlist name is precisely the failure the publish
 * step already guards against. Where a provider exposes the board's own name we
 * check it; where it does not, discovery falls back to requiring an exact token.
 */
export const PROVIDERS = {
  greenhouse: {
    label: 'Greenhouse',
    async list(token) {
      const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
      if (!Array.isArray(j?.jobs)) return null;
      return j.jobs.map((p) => job({
        id: p.id,
        title: p.title,
        location: p.location?.name,
        url: p.absolute_url,
        postedAt: p.updated_at ?? p.first_published,
        department: p.departments?.[0]?.name,
      }));
    },
    async verify(token, companyName) {
      const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}`);
      return j?.name ? looksLikeSameCompany(j.name, companyName) : false;
    },
  },

  lever: {
    label: 'Lever',
    async list(token) {
      const j = await getJson(`https://api.lever.co/v0/postings/${token}?mode=json`);
      if (!Array.isArray(j)) return null;
      return j.map((p) => job({
        id: p.id,
        title: p.text,
        location: p.categories?.location,
        url: p.hostedUrl ?? p.applyUrl,
        postedAt: p.createdAt,
        department: p.categories?.team,
        remote: p.workplaceType,
      }));
    },
    // Lever has no board-metadata endpoint, so the token itself is the evidence.
    async verify(token, companyName) {
      return candidateTokens(companyName).includes(token);
    },
  },

  ashby: {
    label: 'Ashby',
    async list(token) {
      const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
      if (!Array.isArray(j?.jobs)) return null;
      return j.jobs.map((p) => job({
        id: p.id,
        title: p.title,
        location: p.location,
        url: p.jobUrl,
        postedAt: p.publishedAt,
        department: p.department,
        remote: p.isRemote ? 'Remote' : null,
      }));
    },
    async verify(token, companyName) {
      return candidateTokens(companyName).includes(token);
    },
  },

  smartrecruiters: {
    label: 'SmartRecruiters',
    async list(token) {
      const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100`);
      if (!Array.isArray(j?.content)) return null;
      return j.content.map((p) => job({
        id: p.id,
        title: p.name,
        location: [p.location?.city, p.location?.country].filter(Boolean).join(', '),
        url: `https://jobs.smartrecruiters.com/${token}/${p.id}`,
        postedAt: p.releasedDate,
        department: p.department?.label,
        remote: p.location?.remote ? 'Remote' : null,
      }));
    },
    async verify(token, companyName) {
      const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=10`);
      return verifyFromPostings(j?.content, companyName, (p) => p?.company?.name);
    },
  },

  workable: {
    label: 'Workable',
    async list(token) {
      const j = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${token}?details=true`);
      if (!Array.isArray(j?.jobs)) return null;
      return j.jobs.map((p) => job({
        id: p.shortcode,
        title: p.title,
        location: [p.city, p.country].filter(Boolean).join(', '),
        url: p.url ?? p.application_url,
        postedAt: p.published_on,
        department: p.department,
        remote: p.telecommuting ? 'Remote' : null,
      }));
    },
    async verify(token, companyName) {
      const j = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${token}`);
      return j?.name ? looksLikeSameCompany(j.name, companyName) : false;
    },
  },

  recruitee: {
    label: 'Recruitee',
    async list(token) {
      const j = await getJson(`https://${token}.recruitee.com/api/offers/`);
      if (!Array.isArray(j?.offers)) return null;
      return j.offers.map((p) => job({
        id: p.id,
        title: p.title,
        location: [p.city, p.country].filter(Boolean).join(', '),
        url: p.careers_url ?? p.careers_apply_url,
        postedAt: p.published_at,
        department: p.department,
        remote: p.remote ? 'Remote' : null,
      }));
    },
    async verify(token, companyName) {
      const j = await getJson(`https://${token}.recruitee.com/api/offers/`);
      if (looksLikeDemoBoard((j?.offers ?? []).map((o) => ({ title: o.title })))) return false;
      return verifyFromPostings(j?.offers, companyName, (o) => o?.company_name);
    },
  },

  personio: {
    label: 'Personio',
    async list(token) {
      const j = await getJson(`https://${token}.jobs.personio.de/search.json`);
      if (!Array.isArray(j)) return null;
      return j.map((p) => job({
        id: p.id,
        title: p.name,
        location: p.office,
        url: `https://${token}.jobs.personio.de/job/${p.id}`,
        postedAt: p.createdAt,
        department: p.department,
      }));
    },
    async verify(token, companyName) {
      return candidateTokens(companyName).includes(token);
    },
  },
};

export const PROVIDER_NAMES = Object.keys(PROVIDERS);

/**
 * Find which board, if any, belongs to this company.
 * Returns { provider, token, count } or null.
 */
export async function discover(companyName, { providers = PROVIDER_NAMES } = {}) {
  const tokens = candidateTokens(companyName);

  for (const providerName of providers) {
    const provider = PROVIDERS[providerName];
    for (const token of tokens) {
      const jobs = await provider.list(token);
      if (!jobs || jobs.length === 0) continue;

      if (looksLikeDemoBoard(jobs)) {
        log.debug(`${companyName}: ${providerName}/${token} looks like an unclaimed demo board — skipping.`);
        continue;
      }

      // A board that exists is not yet a board that is theirs.
      const ok = await provider.verify(token, companyName);
      if (!ok) {
        log.debug(`${companyName}: ${providerName}/${token} exists but did not verify — skipping.`);
        continue;
      }
      return { provider: providerName, token, count: jobs.length };
    }
  }
  return null;
}

/** Fetch the current postings for a discovered board. */
export async function fetchBoard(providerName, token) {
  const provider = PROVIDERS[providerName];
  if (!provider) return null;
  return provider.list(token);
}
