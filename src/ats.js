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

async function getJson(url, { method = 'GET', body = null, retriesLeft = 2 } = {}) {
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
    // 429 means slow down, not "this board does not exist". Collapsing the two
    // silently dropped three Workable boards from every poll.
    if (res.status === 429 && retriesLeft > 0) {
      clearTimeout(timer);
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * (3 - retriesLeft + 1);
      await new Promise((r) => setTimeout(r, Math.min(wait, 10_000)));
      return getJson(url, { method, body, retriesLeft: retriesLeft - 1 });
    }
    if (!res.ok) return null;
    // A Workday site name that does not exist answers 200 with the careers-page
    // HTML rather than an error, so a non-JSON body is a failure too.
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Normalised shape every adapter returns, so the rest of the app sees one thing. */
function job({ id, title, location, url, postedAt, department, remote, description, externalPath }) {
  return {
    id: String(id),
    title: String(title ?? '').trim(),
    location: location ? String(location).trim() : null,
    url,
    postedAt: postedAt ? new Date(postedAt).getTime() : null,
    department: department ?? null,
    remote: remote ?? null,
    description: description ? stripHtml(description) : null,
    externalPath: externalPath ?? null,
  };
}

/**
 * These descriptions arrive as HTML. Everything downstream — the stipend and
 * duration parsers, the summariser, the enrichment prompt — expects readable
 * text, and feeding it markup makes all of them worse. Block-level tags become
 * newlines so bullet lists survive as lines rather than collapsing into one
 * run-on paragraph.
 */
function stripHtml(html) {
  return String(html)
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;/gi, "'").replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    .trim();
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
/**
 * Does this board token plausibly belong to this company?
 *
 * Exact-match against the generated tokens was too strict in two ways that cost
 * real boards: it compared case-sensitively, so Ashby's "Clerk" failed against
 * "clerk"; and it demanded equality, so "sarvam" failed against "Sarvam AI".
 *
 * The prefix rule is length-bounded on purpose. Allowing any prefix would let
 * "navi" match "navitas" — a different company — which is the false positive
 * this whole verification layer exists to prevent. Five characters is short
 * enough to admit "sarvam" and long enough to exclude the short brand names
 * where collisions actually happen.
 */
function tokenMatchesCompany(token, companyName) {
  const t = String(token).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!t) return false;
  if (candidateTokens(companyName).some((c) => c.replace(/[^a-z0-9]/g, '') === t)) return true;
  const name = String(companyName).toLowerCase().replace(/[^a-z0-9]/g, '');
  return t.length >= 5 && name.startsWith(t);
}

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
        description: p.content,
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
        description: p.descriptionPlain ?? p.description,
      }));
    },
    // Lever has no board-metadata endpoint, so the token itself is the evidence.
    async verify(token, companyName) {
      return tokenMatchesCompany(token, companyName);
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
        description: p.descriptionPlain ?? p.descriptionHtml,
      }));
    },
    async verify(token, companyName) {
      return tokenMatchesCompany(token, companyName);
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
        description: p.description,
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
        description: p.description,
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
      return tokenMatchesCompany(token, companyName);
    },
  },
};

/**
 * Workday, kept apart from the rest on purpose.
 *
 * It publishes no job-board API. What works is the endpoint its own careers page
 * calls, and it needs three things a company name cannot give you: a tenant, a
 * datacentre number (wd1, wd3, wd5, wd12…) and a site name that is entirely
 * bespoke — NVIDIAExternalCareerSite, external_experienced, External_Career_Site.
 *
 * Guessing those is not an option, and I measured why rather than assuming:
 * `zzzznotarealcompany.wd5` answers 422 exactly like a real tenant does, so
 * there is no signal to search against. The token here is therefore always
 * discovered from a real careers-page link, never constructed, and is stored as
 * "tenant:wd:site".
 */
PROVIDERS.workday = {
  label: 'Workday',
  async list(token) {
    const [tenant, wd, site] = String(token).split(':');
    if (!tenant || !wd || !site) return null;
    const j = await getJson(
      `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`,
      { method: 'POST', body: { appliedFacets: {}, limit: 20, offset: 0, searchText: '' } },
    );
    if (!Array.isArray(j?.jobPostings)) return null;
    return j.jobPostings.map((p) => job({
      id: p.bulletFields?.[0] ?? p.externalPath,
      title: p.title,
      location: p.locationsText,
      url: `https://${tenant}.${wd}.myworkdayjobs.com/en-US/${site}${p.externalPath}`,
      // Left null here on purpose: the list only offers "Posted 3 Days Ago".
      // detail() replaces it with the real startDate for the few postings kept.
      postedAt: null,
      externalPath: p.externalPath,
    }));
  },
  /**
   * "It came off their careers page, so it is theirs" is not sound, and a real
   * crawl proved it: Discover resolved to capitalone:wd12:Capital_One, and Plum
   * to an unrelated `pacs` tenant. Following links lands on the wrong page often
   * enough that the tenant has to be checked against the company name.
   *
   * Internal boards are rejected outright. A site called Internal_Careers is for
   * existing employees; publishing it would send students to a page they cannot
   * apply through.
   */
  async verify(token, companyName) {
    const [tenant, , site] = String(token).split(':');
    if (!tenant || !site) return false;
    if (/internal/i.test(site)) return false;
    return looksLikeSameCompany(tenant, companyName);
    // Deliberately NOT calling list() to confirm the board reads.
    //
    // That was the obvious next check and it would have been a disaster: when
    // Workday rate-limits us it answers 200 with the careers-page HTML for every
    // tenant, including ones that worked minutes earlier. A verifier that
    // required a readable board would then delete all 38 Workday boards during a
    // block that clears on its own. Unreadable-right-now and does-not-exist are
    // different, and this file has been bitten by conflating them before.
  },

  /**
   * Workday's list gives neither a description nor a usable date — `postedOn`
   * is the phrase "Posted 2 Days Ago". The per-job endpoint gives both, and its
   * `startDate` is an actual calendar date, which beats parsing English.
   *
   * Called only for postings that already passed every filter, so a board of
   * 2,000 roles costs one extra request per internship rather than 2,000.
   */
  async detail(token, externalPath) {
    const [tenant, wd, site] = String(token).split(':');
    if (!externalPath) return null;
    const j = await getJson(`https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}${externalPath}`);
    const info = j?.jobPostingInfo;
    if (!info) return null;
    return {
      description: info.jobDescription ? stripHtml(info.jobDescription) : null,
      postedAt: info.startDate ? new Date(info.startDate).getTime() : null,
    };
  },
};

/** Fetch the extra per-job data a provider only exposes on a detail endpoint. */
export async function fetchDetail(providerName, token, atsJob) {
  const provider = PROVIDERS[providerName];
  if (!provider?.detail) return null;
  return provider.detail(token, atsJob.externalPath);
}

export const PROVIDER_NAMES = Object.keys(PROVIDERS).filter((n) => n !== 'workday');

/** Every ATS link shape we know how to read, for scraping off a careers page. */
const ATS_LINK = new RegExp([
  String.raw`([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([A-Za-z0-9_-]+)`,
  // The embed form puts the real token in a query parameter, not the path:
  // boards.greenhouse.io/embed/job_board?for=cloudsek. Matching the path first
  // would capture the literal word "embed" as the board name.
  String.raw`greenhouse\.io\/embed\/job_board\?for=([a-z0-9-]+)`,
  String.raw`(?:boards|job-boards)\.greenhouse\.io\/(?!embed\b)([a-z0-9-]+)`,
  String.raw`jobs\.lever\.co\/([a-z0-9-]+)`,
  String.raw`jobs\.ashbyhq\.com\/([a-z0-9-]+)`,
  String.raw`([a-z0-9-]+)\.recruitee\.com`,
  String.raw`apply\.workable\.com\/([a-z0-9-]+)`,
  String.raw`jobs\.smartrecruiters\.com\/([A-Za-z0-9-]+)`,
].join('|'), 'i');

/** Plausible homepages for a company name, best guess first. */
function candidateDomains(name) {
  const slug = String(name).toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(pvt|private|ltd|limited|inc|llc|corp|corporation|plc)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '');
  if (slug.length < 3) return [];
  // Indian startups sit on a wide spread of TLDs — CRED is cred.club, and
  // guessing only .com/.in was why its Lever board went undiscovered even though
  // its careers page links jobs.lever.co/cred in plain sight. Ordered by how
  // often each actually resolves, and the search stops at the first that does.
  return [`${slug}.com`, `${slug}.in`, `${slug}.co.in`, `${slug}.io`, `${slug}.club`, `${slug}.ai`, `${slug}.co`];
}

/**
 * Find the ATS by reading the company's own careers page.
 *
 * Strictly better than guessing a slug where it works, because the page links
 * the real token: Razorpay's board is
 * `job-boards.greenhouse.io/razorpaysoftwareprivatelimited`, which no amount of
 * slugifying "Razorpay" would ever produce. It is also the only way to reach
 * Workday at all.
 *
 * It misses careers pages rendered entirely in JavaScript — Infosys, Swiggy and
 * Zomato all come back empty — so this complements slug discovery rather than
 * replacing it.
 */
/**
 * Follow the company's homepage to whatever it calls its careers page, then read
 * the ATS link off that.
 *
 * The guess-based version only tried `{slug}.com/careers`, which is why it
 * resolved 46 of 744: real careers pages live at /company/careers, /join-us,
 * careers.acme.com, and a dozen other shapes. Asking the homepage where its own
 * careers page is costs one extra request and removes the guessing entirely.
 */
async function fetchText(url, timeoutMs = 9000) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; internradar/1.0; +https://www.internradar.info)' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return { url: res.url, html: await res.text() };
  } catch { return null; }
}

/**
 * A link found on a page is a candidate, not an answer.
 *
 * Both link-scraping discoverers used to return the first ATS URL they saw,
 * skipping the verification that slug discovery has always done — and following
 * links lands on the wrong company often enough to matter. Real results from one
 * crawl: Discover resolved to Capital One's Workday, Plum to an unrelated `pacs`
 * tenant, CyberArk to Palo Alto Networks. Every path now goes through the same
 * check before a board is accepted.
 */
async function verified(hit, companyName) {
  if (!hit) return null;
  const provider = PROVIDERS[hit.provider];
  if (!provider) return null;
  try {
    return (await provider.verify(hit.token, companyName)) ? hit : null;
  } catch {
    return null;
  }
}

function matchAts(page) {
  const m = page.url.match(ATS_LINK) || page.html.match(ATS_LINK);
  if (!m) return null;
  const [, wdTenant, wdNum, wdSite, ghEmbed, gh, lever, ashby, recruitee, workable, smart] = m;
  if (wdTenant && wdNum && wdSite) return { provider: 'workday', token: `${wdTenant}:${wdNum}:${wdSite}` };
  if (ghEmbed) return { provider: 'greenhouse', token: ghEmbed };
  if (gh) return { provider: 'greenhouse', token: gh };
  if (lever) return { provider: 'lever', token: lever };
  if (ashby) return { provider: 'ashby', token: ashby };
  if (recruitee) return { provider: 'recruitee', token: recruitee };
  if (workable) return { provider: 'workable', token: workable };
  if (smart) return { provider: 'smartrecruiters', token: smart };
  return null;
}

/** Links on a homepage that look like they lead to jobs. */
function careersLinks(page) {
  const out = new Set();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(page.html))) {
    const href = m[1];
    if (!/career|jobs?\b|join.?us|work.?with.?us|opportunit|hiring|vacanc/i.test(href)) continue;
    if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
    try { out.add(new URL(href, page.url).href); } catch { /* malformed href */ }
    if (out.size >= 6) break;
  }
  return [...out];
}

export async function discoverViaHomepage(companyName) {
  for (const domain of candidateDomains(companyName)) {
    const home = await fetchText(`https://${domain}/`);
    if (!home) continue;

    // The homepage itself sometimes carries the link, e.g. a footer "Careers".
    const direct = await verified(matchAts(home), companyName);
    if (direct) return { ...direct, via: home.url };

    for (const link of careersLinks(home)) {
      const page = await fetchText(link);
      if (!page) continue;
      const hit = await verified(matchAts(page), companyName);
      if (hit) return { ...hit, via: page.url };
    }
    // Deliberately NOT returning here. The first domain that merely *responds*
    // is not the right one: cred.com answers, but CRED is cred.club, and
    // stopping at the first reply meant its Lever board stayed invisible. Only a
    // found board ends the search.
  }
  return null;
}

export async function discoverViaCareersPage(companyName) {
  for (const domain of candidateDomains(companyName)) {
    for (const path of ['/careers', '/jobs']) {
      const url = `https://${domain}${path}`;
      let res;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        res = await fetch(url, {
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; internradar/1.0; +https://www.internradar.info)' },
        });
        clearTimeout(timer);
      } catch { continue; }
      if (!res.ok) continue;

      let html = '';
      try { html = await res.text(); } catch { continue; }

      const m = res.url.match(ATS_LINK) || html.match(ATS_LINK);
      if (!m) continue;

      // Groups line up with the alternation order above.
      const [, wdTenant, wdNum, wdSite, ghEmbed, gh, lever, ashby, recruitee, workable, smart] = m;
      if (wdTenant && wdNum && wdSite) return (await verified({ provider: 'workday', token: `${wdTenant}:${wdNum}:${wdSite}` }, companyName)) && { provider: 'workday', token: `${wdTenant}:${wdNum}:${wdSite}`, via: url };
      if (ghEmbed) return (await verified({ provider: 'greenhouse', token: ghEmbed }, companyName)) && { provider: 'greenhouse', token: ghEmbed, via: url };
      if (gh) return (await verified({ provider: 'greenhouse', token: gh }, companyName)) && { provider: 'greenhouse', token: gh, via: url };
      if (lever) return (await verified({ provider: 'lever', token: lever }, companyName)) && { provider: 'lever', token: lever, via: url };
      if (ashby) return (await verified({ provider: 'ashby', token: ashby }, companyName)) && { provider: 'ashby', token: ashby, via: url };
      if (recruitee) return (await verified({ provider: 'recruitee', token: recruitee }, companyName)) && { provider: 'recruitee', token: recruitee, via: url };
      if (workable) return (await verified({ provider: 'workable', token: workable }, companyName)) && { provider: 'workable', token: workable, via: url };
      if (smart) return (await verified({ provider: 'smartrecruiters', token: smart }, companyName)) && { provider: 'smartrecruiters', token: smart, via: url };
    }
  }
  return null;
}

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
