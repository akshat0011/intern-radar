/**
 * Role classification via Gemini, with the offline classifier underneath.
 *
 * Two design points worth knowing:
 *
 * 1. Every job is given a verdict by the offline classifier FIRST, so a job
 *    always has one. Gemini then refines the batch. If the key is missing, the
 *    quota is spent, the network is down, or the response is malformed, the
 *    offline verdict simply stands — there is no path where a job ends up
 *    unclassified because an API was unavailable.
 *
 * 2. Titles are sent as ONE batched call rather than one call per job. On a
 *    free tier the per-day request count is the scarce resource, and a run with
 *    forty candidates should cost one request, not forty.
 */
import { log } from './logger.js';
import { classifyRole } from './roles.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;
const MAX_TITLES_PER_CALL = 60;

const SYSTEM = `You label job titles for a software-internship board.

For each title, decide whether it is a SOFTWARE or TECHNOLOGY role — something a computer-science or engineering student would take to write code, build systems, work with data, or design software products.

Count as tech (isTech = true):
- software engineering of any kind: backend, frontend, full stack, mobile, embedded, firmware, games
- data science, data engineering, analytics, machine learning, AI, computer vision, NLP
- infrastructure: DevOps, CloudOps, SRE, platform, cloud, networking, databases
- QA, SDET, test automation, cybersecurity
- hardware/chip design: VLSI, RTL, verification, silicon
- quantitative finance and algorithmic trading (these are programming-heavy)
- product management and UI/UX/product design for software products
- broad technical graduate schemes where the work is clearly engineering

Count as NOT tech (isTech = false):
- sales, business development, marketing, content, social media, SEO
- HR, recruiting, finance, accounting, legal, admin, operations, customer support
- teaching, counselling, social work
- graphic design, video, photography, animation for media
- non-software engineering: mechanical, civil, electrical power, chemical, industrial
- lab science, clinical, pharma

If a title mixes both, judge by the primary job. "Software Sales" is sales. "Technical Recruiter" is recruiting.
When genuinely ambiguous, prefer isTech = false.

Return one entry per input, using the same id you were given.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdicts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          isTech: { type: 'BOOLEAN' },
          reason: { type: 'STRING' },
        },
        required: ['id', 'isTech'],
      },
    },
  },
  required: ['verdicts'],
};

/** Is a Gemini key configured at all? */
export function geminiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

async function classifyBatch(titles, model, apiKey) {
  const numbered = titles.map((t, i) => `${i}. ${t.title}${t.company ? ` — ${t.company}` : ''}`).join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: `Label these ${titles.length} job titles:\n\n${numbered}` }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4_000,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const why = res.status === 429 ? 'daily free quota exhausted'
        : res.status === 400 || res.status === 403 ? 'API key rejected'
        : `HTTP ${res.status}`;
      log.warn(`Gemini unavailable (${why}) — using the offline classifier for this run.`);
      return null;
    }

    const payload = await res.json();
    if (payload.promptFeedback?.blockReason) {
      log.warn('Gemini refused the batch (content filter) — using the offline classifier.');
      return null;
    }

    const raw = (payload.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text).filter(Boolean).join('').trim();
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.verdicts)) return null;

    const byId = new Map();
    for (const v of parsed.verdicts) {
      if (Number.isInteger(v?.id) && typeof v.isTech === 'boolean') byId.set(v.id, v);
    }
    return byId;
  } catch (err) {
    const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
    log.warn(`Gemini unavailable (${why}) — using the offline classifier for this run.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Classify a list of { title, company } and return a verdict per item, in the
 * same order.
 *
 * @returns {Promise<Array<{isTech: boolean, source: 'gemini'|'offline', reason: string|null}>>}
 */
export async function classifyRoles(items, cfg) {
  // Offline first, so every item has a verdict no matter what happens next.
  const verdicts = items.map(({ title }) => {
    const r = classifyRole(title, {
      extraPositive: cfg.matching?.extraTechTerms ?? [],
      extraNegative: cfg.matching?.extraNonTechTerms ?? [],
    });
    return {
      // An undecidable title counts as non-tech: it still reaches the site, just
      // in the other section, so nothing is lost by being cautious here.
      isTech: r.verdict === 'tech',
      source: 'offline',
      reason: r.matched ? `matched "${r.matched}"` : 'no vocabulary match',
    };
  });

  if (!items.length) return verdicts;

  if (cfg.roleClassifier?.useGemini === false) return verdicts;
  if (!geminiAvailable()) {
    log.info('No GEMINI_API_KEY set — classifying roles with the offline vocabulary.');
    return verdicts;
  }

  const model = process.env.GEMINI_MODEL || cfg.roleClassifier?.model || 'gemini-2.5-flash';
  let refined = 0;
  let disagreed = 0;

  for (let start = 0; start < items.length; start += MAX_TITLES_PER_CALL) {
    const slice = items.slice(start, start + MAX_TITLES_PER_CALL);
    const byId = await classifyBatch(slice, model, process.env.GEMINI_API_KEY);
    if (!byId) break; // offline verdicts stand for the rest of the run

    for (let i = 0; i < slice.length; i++) {
      const v = byId.get(i);
      if (!v) continue;
      const target = verdicts[start + i];
      if (target.isTech !== v.isTech) disagreed++;
      target.isTech = v.isTech;
      target.source = 'gemini';
      target.reason = v.reason ?? null;
      refined++;
    }
  }

  if (refined) {
    log.ok(`Gemini classified ${refined}/${items.length} roles (${disagreed} differed from the offline guess).`);
  }
  return verdicts;
}
