/**
 * Company logos, fetched once and served from our own site.
 *
 * The logo URL comes free with every job card. What we deliberately do NOT do
 * is put that URL on the public page: LinkedIn's CDN links carry an expiry
 * timestamp and a signature, so a hotlinked logo silently 404s after a few
 * weeks, and every student's browser would be making requests to LinkedIn.
 * Downloading once into web/public/logos/ avoids both.
 *
 * A failed download is never fatal — the site falls back to the company's
 * initials, which is why this whole module is allowed to give up quietly.
 */
import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './paths.js';
import { log } from './logger.js';

export const LOGO_DIR = join(ROOT, 'web', 'public', 'logos');

const MAX_BYTES = 400 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** Filesystem-safe, stable key for a company name. */
export function logoSlug(company) {
  return String(company)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Existing files, keyed by slug, so a company is only ever fetched once. */
function existingLogos() {
  if (!existsSync(LOGO_DIR)) return new Map();
  const map = new Map();
  for (const file of readdirSync(LOGO_DIR)) {
    const slug = file.replace(/\.[a-z0-9]+$/i, '');
    if (!map.has(slug)) map.set(slug, file);
  }
  return map;
}

/**
 * Ask LinkedIn's CDN for a bigger rendition. Their URLs embed the size in the
 * path (company-logo_100_100); asking for 200 costs nothing and looks better on
 * a retina screen. If the rewrite is rejected we fall back to the original.
 */
function upscale(url) {
  return url.replace(/company-logo_(\d+)_(\d+)/, 'company-logo_200_200');
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;

    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const ext = EXT_BY_TYPE[type];
    // Only store things that are actually images — never write whatever a
    // redirected URL happened to return.
    if (!ext) return null;

    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared && declared > MAX_BYTES) return null;

    const bytes = Buffer.from(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;

    return { bytes, ext };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch any logos we do not already hold.
 * @param {Array<{company: string, logoUrl: string}>} candidates
 * @returns {Promise<Map<string,string>>} company slug -> public path
 */
export async function syncLogos(candidates) {
  mkdirSync(LOGO_DIR, { recursive: true });
  const have = existingLogos();

  // One entry per company; prefer whichever candidate actually has a URL.
  const wanted = new Map();
  for (const { company, logoUrl } of candidates) {
    if (!company || !logoUrl) continue;
    const slug = logoSlug(company);
    if (!slug || have.has(slug) || wanted.has(slug)) continue;
    wanted.set(slug, logoUrl);
  }

  let fetched = 0;
  for (const [slug, url] of wanted) {
    const got = (await download(upscale(url))) ?? (await download(url));
    if (!got) {
      log.debug(`No logo for ${slug} — the site will show initials instead.`);
      continue;
    }
    const file = `${slug}.${got.ext}`;
    writeFileSync(join(LOGO_DIR, file), got.bytes);
    have.set(slug, file);
    fetched++;
  }

  if (fetched) log.ok(`Downloaded ${fetched} new company logo${fetched === 1 ? '' : 's'}.`);

  const out = new Map();
  for (const [slug, file] of have) out.set(slug, `/logos/${file}`);
  return out;
}

/** Public path for a company's stored logo, or null. */
export function logoPathFor(company, index) {
  return index.get(logoSlug(company)) ?? null;
}

/** Total bytes held, for reporting. */
export function logoDirSize() {
  if (!existsSync(LOGO_DIR)) return 0;
  return readdirSync(LOGO_DIR)
    .reduce((sum, f) => sum + statSync(join(LOGO_DIR, f)).size, 0);
}
