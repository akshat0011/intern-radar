/**
 * Static HTML pages, one per job and one per company, generated at publish time.
 *
 * Why this exists: the main page is an empty <ol> that JavaScript fills from
 * jobs.json, so a crawler that does not run JavaScript sees zero listings. The
 * site is therefore invisible to search — the only traffic it can ever get is
 * links someone shares by hand. These pages are the fix: real HTML, present in
 * the response body, one URL per posting.
 *
 * Two rules shape everything here, and both are about not getting the site
 * penalised rather than about ranking:
 *
 * 1. NEVER republish the employer's description. It is their copyrighted text,
 *    and a page whose body is someone else's posting is precisely what Google's
 *    scraped-content policy is written to demote. Every page is built from our
 *    own material: the bullets, the eligibility read, the skills, the freshness.
 *
 * 2. A page with nothing to say is not published as indexable. 55 of the current
 *    237 postings have no bullets because the employer posted a template or the
 *    description was never captured. Those get noindex — a site carrying dozens
 *    of near-empty pages looks like a content farm, and that judgement is applied
 *    site-wide, not page by page.
 */
import { writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const SITE = 'https://www.internradar.info';

/** HTML-escape. Company names and titles come from LinkedIn and are not trusted. */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escape for embedding inside a <script type="application/ld+json"> block. */
function jsonLd(obj) {
  // </script> inside a JSON string would close the tag early; U+2028/9 break older parsers.
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function slugify(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'role';
}

/** A URL a human can read and a search engine can parse: company, role, then id. */
export function jobSlug(job) {
  return `${slugify(job.company)}-${slugify(job.title)}-${job.id}`;
}

export function companySlug(company) {
  return slugify(company);
}

/** Postings age out of the public file after 14 days; tell Google the same. */
const VALID_DAYS = 14;

function validThrough(job) {
  return new Date((job.postedAt ?? job.firstSeenAt ?? Date.now()) + VALID_DAYS * 86_400_000).toISOString();
}

/** Enough substance to deserve a place in the index. */
export function isIndexable(job) {
  return (job.bullets ?? []).length >= 2;
}

/**
 * Google's JobPosting schema. Getting this wrong is worse than omitting it — a
 * structured-data manual action affects the whole domain — so every field here is
 * one we actually hold, and nothing is invented to fill a slot.
 */
function jobPostingLd(job, url) {
  const description = `<p>${esc(job.roleLabel || job.title)}</p><ul>${
    (job.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')
  }</ul>`;

  const ld = {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description,
    identifier: { '@type': 'PropertyValue', name: job.company, value: String(job.id) },
    datePosted: new Date(job.postedAt ?? job.firstSeenAt ?? Date.now()).toISOString(),
    validThrough: validThrough(job),
    employmentType: 'INTERN',
    hiringOrganization: { '@type': 'Organization', name: job.company },
    // We are not the apply destination — LinkedIn is. Saying otherwise is the
    // single most common way sites earn a JobPosting penalty.
    directApply: false,
    url,
  };

  if (job.location) {
    ld.jobLocation = {
      '@type': 'Place',
      address: { '@type': 'PostalAddress', addressLocality: job.location, addressCountry: 'IN' },
    };
  }
  if (job.workplaceType === 'Remote') ld.jobLocationType = 'TELECOMMUTE';
  if (job.logo) ld.hiringOrganization.logo = `${SITE}${job.logo}`;

  return ld;
}

/** Shared <head>, so every generated page carries the same rules. */
function head({ title, description, canonical, indexable, extraLd = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${indexable ? '' : '<meta name="robots" content="noindex,follow">\n'}<meta name="color-scheme" content="dark light">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Intern Radar">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og.jpg?v=2">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/og.jpg?v=2">
<link rel="icon" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/page.css">
${extraLd}<script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
<header class="bar">
  <div class="wrap bar-in">
    <a class="brand" href="/" aria-label="Intern Radar">
      <span class="scope" aria-hidden="true">
        <svg viewBox="0 0 44 44">
          <circle class="s-ring" cx="22" cy="22" r="20"/><circle class="s-ring" cx="22" cy="22" r="13"/>
          <circle class="s-ring" cx="22" cy="22" r="6"/><circle class="s-dot" cx="22" cy="22" r="2.8"/>
        </svg>
      </span>
      <span class="word">INTERN<em>RADAR</em></span>
    </a>
  </div>
</header>
`;
}

const FOOT = `
<footer class="foot">
  <div class="wrap">
    <p>Listings are collected from LinkedIn and link back to the original posting — always apply on the company's own page. Summaries are written by Intern Radar; the linked posting is the source of truth.</p>
    <p><a href="/">See every live internship →</a></p>
  </div>
</footer>
</body>
</html>
`;

/** A single job page. */
export function renderJobPage(job) {
  const url = `${SITE}/jobs/${jobSlug(job)}`;
  const indexable = isIndexable(job);
  const year = new Date(job.postedAt ?? Date.now()).getFullYear();

  // Title shaped the way people actually search: company, role, the word
  // internship, then India and the year.
  const pageTitle = `${job.company} ${job.title} Internship ${year} — India | Intern Radar`;
  const description = (job.bullets ?? [])[0]
    ? `${job.company} is hiring: ${job.title}. ${(job.bullets ?? [])[0]}.`
    : `${job.company} is hiring a ${job.title} intern in India.`;

  const facts = [
    ['Company', esc(job.company)],
    ['Role', esc(job.title)],
    job.roleLabel ? ['Focus', esc(job.roleLabel)] : null,
    job.location ? ['Location', esc(job.location)] : null,
    job.workplaceType ? ['Mode', esc(job.workplaceType)] : null,
    job.degreeLevel ? ['Eligibility', esc([job.degreeLevel, job.degreeText].filter(Boolean).join(' · '))] : null,
    job.duration ? ['Duration', esc(job.duration)] : null,
    ['Stipend', job.stipend ? esc(job.stipend) : job.stipendStatus === 'unpaid' ? 'Unpaid' : job.stipendStatus === 'paid' ? 'Paid' : 'Not stated'],
    ['Posted', new Date(job.postedAt ?? job.firstSeenAt).toISOString().slice(0, 10)],
  ].filter(Boolean);

  return `${head({
    title: pageTitle,
    description,
    canonical: url,
    indexable,
    extraLd: `<script type="application/ld+json">${jsonLd(jobPostingLd(job, url))}</script>\n`,
  })}
<main class="page">
  <div class="wrap">
    <nav class="crumbs"><a href="/">Home</a> › <a href="/companies/${companySlug(job.company)}">${esc(job.company)}</a> › <span>${esc(job.title)}</span></nav>

    <h1>${esc(job.company)} — ${esc(job.title)}</h1>
    ${job.roleLabel ? `<p class="lede-sub">${esc(job.roleLabel)}</p>` : ''}

    <a class="apply" href="${esc(job.applyUrl)}" target="_blank" rel="nofollow noopener">Apply on LinkedIn →</a>

    <dl class="facts">
      ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n      ')}
    </dl>

    ${(job.bullets ?? []).length ? `<h2>What the role involves</h2>
    <ul class="gist-list">${(job.bullets ?? []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}

    ${(job.keySkills ?? []).length ? `<h2>Skills mentioned</h2>
    <div class="skills">${(job.keySkills ?? []).map((s) => `<span class="skill">${esc(s)}</span>`).join('')}</div>` : ''}

    <h2>How to apply</h2>
    <p>Applications go through LinkedIn. Internships in India often collect hundreds of applicants within a day, so applying early matters more than applying perfectly.</p>
    <a class="apply" href="${esc(job.applyUrl)}" target="_blank" rel="nofollow noopener">Open the original posting →</a>

    <p class="tiny">This summary was written by Intern Radar from the public posting. The linked posting is the source of truth — check it before you apply.</p>
  </div>
</main>
${FOOT}`;
}

/** A company hub — the page with a real chance of ranking for "<company> internship". */
export function renderCompanyPage(company, jobs) {
  const url = `${SITE}/companies/${companySlug(company)}`;
  const live = jobs.filter(isIndexable);
  const indexable = live.length > 0;

  const pageTitle = `${company} Internships in India ${new Date().getFullYear()} — ${live.length} open role${live.length === 1 ? '' : 's'} | Intern Radar`;
  const description = live.length
    ? `${live.length} live ${company} internship${live.length === 1 ? '' : 's'} in India, updated every 30 minutes. ${live.slice(0, 3).map((j) => j.title).join(', ')}.`
    : `${company} internships in India, tracked by Intern Radar and updated every 30 minutes.`;

  const listLd = {
    '@context': 'https://schema.org/',
    '@type': 'ItemList',
    itemListElement: live.map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/jobs/${jobSlug(j)}`,
      name: `${j.company} — ${j.title}`,
    })),
  };

  return `${head({
    title: pageTitle,
    description,
    canonical: url,
    indexable,
    extraLd: live.length ? `<script type="application/ld+json">${jsonLd(listLd)}</script>\n` : '',
  })}
<main class="page">
  <div class="wrap">
    <nav class="crumbs"><a href="/">Home</a> › <span>${esc(company)}</span></nav>
    <h1>${esc(company)} internships in India</h1>
    <p class="lede-sub">${live.length} live opening${live.length === 1 ? '' : 's'}, refreshed every 30 minutes from LinkedIn.</p>

    ${live.length ? `<ul class="hub">${live.map((j) => `
      <li>
        <a href="/jobs/${jobSlug(j)}">${esc(j.title)}</a>
        ${j.roleLabel ? `<span class="qual">${esc(j.roleLabel)}</span>` : ''}
        <span class="tiny">${esc(j.location || 'India')}${j.workplaceType ? ` · ${esc(j.workplaceType)}` : ''}</span>
      </li>`).join('')}</ul>`
      : '<p>No live openings right now. New ones appear here within minutes of being posted.</p>'}

    <p><a href="/">Browse every company →</a></p>
  </div>
</main>
${FOOT}`;
}

/**
 * The directory of every company hub.
 *
 * The sitemap tells Google these URLs exist, but a sitemap is a hint, not a crawl
 * path — and the homepage is an empty list filled by JavaScript, so a crawler
 * arriving there finds no links to follow at all. This page is the bridge: one
 * static link from the homepage reaches it, and from here every company hub and
 * then every job page is reachable by following ordinary anchors.
 */
export function renderCompanyIndex(byCompany) {
  const url = `${SITE}/companies/`;
  const rows = [...byCompany.entries()]
    .map(([company, list]) => ({ company, live: list.filter(isIndexable).length }))
    .filter((r) => r.live > 0)
    .sort((a, b) => b.live - a.live || a.company.localeCompare(b.company));

  const total = rows.reduce((n, r) => n + r.live, 0);

  return `${head({
    title: `Internships in India by company — ${rows.length} companies hiring | Intern Radar`,
    description: `Browse ${total} live internships across ${rows.length} companies in India. Updated every 30 minutes from LinkedIn.`,
    canonical: url,
    indexable: rows.length > 0,
  })}
<main class="page">
  <div class="wrap">
    <nav class="crumbs"><a href="/">Home</a> › <span>Companies</span></nav>
    <h1>Internships by company</h1>
    <p class="lede-sub">${total} live openings across ${rows.length} companies, refreshed every 30 minutes.</p>
    <ul class="hub">${rows.map((r) => `
      <li>
        <a href="/companies/${companySlug(r.company)}">${esc(r.company)}</a>
        <span class="tiny">${r.live} open role${r.live === 1 ? '' : 's'}</span>
      </li>`).join('')}</ul>
  </div>
</main>
${FOOT}`;
}

function writeIfChanged(path, contents) {
  writeFileSync(path, contents);
}

/**
 * Regenerate every page. Stale files are removed rather than left to rot: a
 * posting that aged out of jobs.json must not keep a live URL, or the site
 * accumulates pages for jobs nobody can apply to any more.
 *
 * @returns {{jobPages: number, companyPages: number, indexable: number, removed: number}}
 */
export function writePages(jobs, publicDir) {
  const jobsDir = join(publicDir, 'jobs');
  const compDir = join(publicDir, 'companies');
  mkdirSync(jobsDir, { recursive: true });
  mkdirSync(compDir, { recursive: true });

  const wanted = new Set();
  for (const job of jobs) {
    const name = `${jobSlug(job)}.html`;
    wanted.add(join(jobsDir, name));
    writeIfChanged(join(jobsDir, name), renderJobPage(job));
  }

  const byCompany = new Map();
  for (const job of jobs) {
    if (!byCompany.has(job.company)) byCompany.set(job.company, []);
    byCompany.get(job.company).push(job);
  }
  for (const [company, list] of byCompany) {
    const name = `${companySlug(company)}.html`;
    wanted.add(join(compDir, name));
    writeIfChanged(join(compDir, name), renderCompanyPage(company, list));
  }

  // The directory, at /companies/. index.html rather than a slug so the bare
  // directory URL resolves on Vercel and on the dev server alike.
  wanted.add(join(compDir, 'index.html'));
  writeIfChanged(join(compDir, 'index.html'), renderCompanyIndex(byCompany));

  let removed = 0;
  for (const dir of [jobsDir, compDir]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const full = join(dir, f);
      if (f.endsWith('.html') && !wanted.has(full)) { rmSync(full); removed++; }
    }
  }

  const indexable = jobs.filter(isIndexable).length;
  writeSitemap(jobs, byCompany, publicDir);
  writeRobots(publicDir);

  return { jobPages: jobs.length, companyPages: byCompany.size, indexable, removed };
}

/** Only indexable URLs go in the sitemap — submitting pages you tell Google to ignore is noise. */
function writeSitemap(jobs, byCompany, publicDir) {
  const now = new Date().toISOString();
  const urls = [
    { loc: `${SITE}/`, priority: '1.0', lastmod: now },
    { loc: `${SITE}/companies/`, priority: '0.7', lastmod: now },
    ...jobs.filter(isIndexable).map((j) => ({
      loc: `${SITE}/jobs/${jobSlug(j)}`,
      priority: '0.8',
      lastmod: new Date(j.postedAt ?? j.firstSeenAt).toISOString(),
    })),
    ...[...byCompany.entries()]
      .filter(([, list]) => list.some(isIndexable))
      .map(([company]) => ({ loc: `${SITE}/companies/${companySlug(company)}`, priority: '0.6', lastmod: now })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>
`;
  writeFileSync(join(publicDir, 'sitemap.xml'), xml);
}

function writeRobots(publicDir) {
  writeFileSync(join(publicDir, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);
}
