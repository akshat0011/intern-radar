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
import { normaliseDegree } from './extract.js';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;
const MAX_TITLES_PER_CALL = 60;

/**
 * Every call here is schema-constrained labelling, not reasoning, and the 2.5
 * models spend their reply budget on thinking before they ever emit the JSON.
 * Measured on a batch of six postings: thinking on returned 1533 thought tokens
 * and zero parseable items; thinking off returned all six. Raising
 * maxOutputTokens did not help, so this is not truncation — the structured reply
 * simply does not survive the thinking pass. Off is also faster and cheaper.
 */
const NO_THINKING = { thinkingBudget: 0 };

const DESC_SYSTEM = `You label internship postings for a software-internship board, using the description because the title alone is too generic to judge.

Decide whether the ACTUAL WORK is software or technology — writing code, building systems, working with data, designing software products, or engineering hardware/silicon.

Count as tech: software engineering of any kind, data science and analytics, machine learning and AI, infrastructure and DevOps and cloud, QA and test automation, cybersecurity, chip and hardware design, quantitative and algorithmic trading, and product management or UI/UX for software products.

Count as NOT tech: sales, business development, marketing, content, HR, recruiting, finance, accounting, legal, admin, operations, customer support, teaching, social work, media design and video, and non-software engineering such as mechanical, civil, electrical power, chemical or industrial plant work.

Judge by the primary work, not by the employer being a technology company. A finance internship at a software firm is still finance.

For each posting also return keyTerm: the single most decisive phrase, two to four words, copied EXACTLY as it appears in the title or description, that a future classifier could match on to reach the same conclusion. Prefer a phrase naming the discipline ("mechanical design", "backend services", "financial reporting") over a generic one ("good communication"). If nothing is decisive, return an empty keyTerm.`;

const DESC_SCHEMA = {
  type: 'OBJECT',
  properties: {
    verdicts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          isTech: { type: 'BOOLEAN' },
          keyTerm: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['id', 'isTech', 'keyTerm'],
      },
    },
  },
  required: ['verdicts'],
};

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
          thinkingConfig: NO_THINKING,
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

/**
 * Classify ambiguous postings from their descriptions, and report the term each
 * decision hinged on so the offline vocabulary can absorb it.
 *
 * Only called for titles the vocabulary could not settle — see needsDescription
 * in roles.js. That is what keeps this to a handful of postings per run rather
 * than every one.
 *
 * @returns {Promise<Map<number, {isTech: boolean, keyTerm: string, reason: string}>|null>}
 *          null when Gemini is unavailable, so the caller keeps its offline verdicts
 */
export async function classifyFromDescriptions(items, cfg) {
  if (!items.length) return new Map();
  if (cfg.roleClassifier?.useGeminiForAmbiguous === false) return null;
  if (!geminiAvailable()) {
    log.info(`No GEMINI_API_KEY — ${items.length} ambiguous role(s) keep their offline verdict.`);
    return null;
  }

  const model = process.env.GEMINI_MODEL || cfg.roleClassifier?.model || 'gemini-2.5-flash';
  const out = new Map();

  // Descriptions are long, so batch far more conservatively than titles.
  const PER_CALL = 8;
  for (let start = 0; start < items.length; start += PER_CALL) {
    const slice = items.slice(start, start + PER_CALL);
    const body = slice.map((it, i) => [
      `### ${i}`,
      `Title: ${it.title}`,
      `Company: ${it.company ?? 'unknown'}`,
      `Description: ${String(it.description ?? '').slice(0, 3500) || '(none captured)'}`,
    ].join('\n')).join('\n\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: DESC_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: `Label these ${slice.length} postings:\n\n${body}` }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 3_000,
            responseMimeType: 'application/json',
            responseSchema: DESC_SCHEMA,
            thinkingConfig: NO_THINKING,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const why = res.status === 429 ? 'daily free quota exhausted'
          : res.status === 400 || res.status === 403 ? 'API key rejected'
          : `HTTP ${res.status}`;
        log.warn(`Gemini unavailable (${why}) — remaining ambiguous roles keep their offline verdict.`);
        return out.size ? out : null;
      }

      const payload = await res.json();
      if (payload.promptFeedback?.blockReason) {
        log.warn('Gemini refused a batch (content filter) — offline verdicts stand for it.');
        continue;
      }

      const raw = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text).filter(Boolean).join('').trim();
      const parsed = JSON.parse(raw);
      for (const v of parsed.verdicts ?? []) {
        if (!Number.isInteger(v?.id) || typeof v.isTech !== 'boolean') continue;
        if (v.id < 0 || v.id >= slice.length) continue;
        out.set(start + v.id, { isTech: v.isTech, keyTerm: v.keyTerm ?? '', reason: v.reason ?? '' });
      }
    } catch (err) {
      const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
      log.warn(`Gemini call failed (${why}) — offline verdicts stand for the rest.`);
      return out.size ? out : null;
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}

/* ---------------- per-job enrichment ---------------- */

const ENRICH_SYSTEM = `You turn an internship posting into a compact, scannable card for a student deciding whether to apply.

Return, for each posting:

bullets — 2 to 4 fragments, each at most 90 characters, no trailing period. Lead with what the intern actually DOES day to day, then the stack or tools, then anything concrete that affects the decision (team, product, duration). Write plainly, as a person would to a friend. Never open with the company boilerplate ("About X, founded in..."), never use marketing language ("exciting opportunity", "fast-paced environment", "dynamic team"), and never repeat the job title back.

Never write a bullet ABOUT the posting itself — no "the posting is vague", "no duties listed", "details not specified". The reader wants the job, not a review of the advert. If the posting is too thin to yield two real bullets, return an empty bullets array and the card will fall back to plain text.

roleLabel — 2 to 4 words naming what this job ACTUALLY is, in plain terms: "Backend engineering", "Credit risk modelling", "Payroll operations", "Product marketing". Many postings are titled only "Intern", "Apprentice" or "Trainee", which tells a reader nothing and makes ten different jobs at the same company look identical. This is the field that tells them apart. Name the work, never the seniority or the company. Do not repeat the job title back. Empty string only if the posting genuinely does not say what the work is.

degreeLevel — who is eligible, judged ONLY from the text:
  "UG" for bachelor's-level study (B.Tech, B.E., B.Sc, BCA)
  "PG" for master's-level and above (M.Tech, M.E., M.Sc, MCA, MBA, PhD)
  "UG/PG" when either is explicitly acceptable
  "Pursuing" when it requires a currently-enrolled student but names no level
  "none" when the posting genuinely does not say

degreeText — the degree NAME ONLY, never the field of study. Write "B.Tech", not "B.Tech Computer Science". Write "MBA", not "MBA in Finance". Write "B.E/B.Tech" when the posting accepts either. Use the short Indian forms: B.Tech, M.Tech, B.E, M.E, B.Sc, M.Sc, BCA, MCA, BBA, MBA, B.Com, PhD, Diploma, CA. At most two, separated by "/". The reader already knows what field they are searching in; the qualification is what decides whether they are eligible. Return an empty string for anything that is a status rather than a qualification ("recent graduates", "freshers", "any discipline") — degreeLevel already carries that.

keySkills — 2 to 5 concrete, specific skills or technologies named in the posting: languages, frameworks, tools, named methods. Lowercase. Never soft skills ("communication", "teamwork", "attention to detail"), never vague nouns ("technology", "software"). Empty array if the posting names none.

stipendStatus — "paid" only if the posting states a stipend, salary or amount; "unpaid" only if it explicitly says unpaid or that no stipend is provided; otherwise "unknown".

isTech — whether the ACTUAL WORK is software or technology: writing code, building systems, working with data, designing software products, or engineering silicon. Product management and UI/UX for software products count as tech. Sales, marketing, HR, finance, legal, admin, operations, support, content, media design, and non-software engineering (mechanical, civil, electrical power, chemical, industrial) do not. Judge by the primary work, not by the employer being a technology company.

The single hard rule: state only what the posting supports. Never infer a qualification, a skill or a stipend that is not there. An empty field is correct and useful; an invented one sends a student to an application they are not eligible for.`;

const ENRICH_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          bullets: { type: 'ARRAY', items: { type: 'STRING' } },
          roleLabel: { type: 'STRING' },
          // "none" rather than "": the API rejects an empty string inside an enum.
          degreeLevel: { type: 'STRING', enum: ['UG', 'PG', 'UG/PG', 'Pursuing', 'none'] },
          degreeText: { type: 'STRING' },
          keySkills: { type: 'ARRAY', items: { type: 'STRING' } },
          stipendStatus: { type: 'STRING', enum: ['paid', 'unpaid', 'unknown'] },
          isTech: { type: 'BOOLEAN' },
        },
        required: ['id', 'bullets', 'degreeLevel', 'keySkills', 'stipendStatus', 'isTech'],
      },
    },
  },
  required: ['items'],
};

/** Trim, drop empties, cap length and count — the model is asked for this shape, not trusted for it. */
function tidyList(value, { max, maxLen, lower = false }) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    let s = raw.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '');
    if (lower) s = s.toLowerCase();
    if (!s || s.length > maxLen) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Summarise and label a batch of postings from their descriptions.
 *
 * Shares the resilience contract of the classifiers above: a failure anywhere
 * leaves the caller's existing fields untouched rather than blanking them, so a
 * spent quota degrades the cards back to plain text instead of emptying them.
 *
 * @param {Array<{title: string, company?: string, description?: string, stipend?: string|null}>} items
 * @returns {Promise<Map<number, {bullets: string[], degreeLevel: string, degreeText: string,
 *                                keySkills: string[], stipendStatus: string, isTech: boolean}>>}
 */
export async function enrichJobs(items, cfg = {}) {
  const out = new Map();
  if (!items.length) return out;
  if (cfg.enrich?.useGemini === false) return out;
  if (!geminiAvailable()) {
    log.info(`No GEMINI_API_KEY — ${items.length} posting(s) keep their plain-text summary.`);
    return out;
  }

  const model = process.env.GEMINI_MODEL || cfg.enrich?.model || 'gemini-2.5-flash';
  // Descriptions run ~3k characters, and each reply carries bullets plus skills,
  // so keep batches small enough that one truncated response costs little.
  const PER_CALL = 6;

  for (let start = 0; start < items.length; start += PER_CALL) {
    const slice = items.slice(start, start + PER_CALL);
    const body = slice.map((it, i) => [
      `### ${i}`,
      `Title: ${it.title}`,
      `Company: ${it.company ?? 'unknown'}`,
      `Stipend field: ${it.stipend ? String(it.stipend) : '(not captured)'}`,
      `Description: ${String(it.description ?? '').slice(0, 3500) || '(none captured)'}`,
    ].join('\n')).join('\n\n');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: ENRICH_SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: `Summarise these ${slice.length} postings:\n\n${body}` }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4_000,
            responseMimeType: 'application/json',
            responseSchema: ENRICH_SCHEMA,
            thinkingConfig: NO_THINKING,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // A 400 is almost always a malformed request on our side, so surface what
        // the API actually said rather than blaming the key and hiding the cause.
        const detail = res.status === 400
          ? `HTTP 400: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 200)}`
          : res.status === 429 ? 'daily free quota exhausted'
          : res.status === 403 ? 'API key rejected'
          : `HTTP ${res.status}`;
        log.warn(`Gemini unavailable (${detail}) — ${items.length - out.size} posting(s) keep their plain-text summary.`);
        return out;
      }

      const payload = await res.json();
      if (payload.promptFeedback?.blockReason) {
        log.warn('Gemini refused a batch (content filter) — those postings keep their plain-text summary.');
        continue;
      }

      const raw = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text).filter(Boolean).join('').trim();
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      for (const v of parsed.items ?? []) {
        if (!Number.isInteger(v?.id) || v.id < 0 || v.id >= slice.length) continue;

        // The model still occasionally reviews the advert instead of describing
        // the job ("this posting is incomplete"). Useless to a student, so drop it.
        const bullets = tidyList(v.bullets, { max: 4, maxLen: 110 })
          .filter((b) => !/\b(this )?(posting|advert|listing|description)\b.*\b(incomplete|vague|unclear|does not|doesn't|no specific|not specified|lacks)\b/i.test(b));
        if (bullets.length < 2) continue; // too thin to be worth a card; keep the plain summary

        // "none" is the schema's stand-in for "not stated"; normalise it back to empty.
        const level = ['UG', 'PG', 'UG/PG', 'Pursuing'].includes(v.degreeLevel) ? v.degreeLevel : '';
        // The prompt asks for the degree name alone, but the model reliably volunteers
        // the field of study too. Strip it here rather than trusting the instruction.
        const degreeText = level ? normaliseDegree(v.degreeText) : '';
        // A captured amount outranks the model: the scraper read it off the posting.
        const stipendStatus = slice[v.id].stipend ? 'paid'
          : ['paid', 'unpaid', 'unknown'].includes(v.stipendStatus) ? v.stipendStatus
          : 'unknown';

        out.set(start + v.id, {
          bullets,
          // Four words is the ceiling: this sits beside the title on one line, and a
          // label that wraps is a label that has stopped being a label.
          roleLabel: typeof v.roleLabel === 'string'
            ? v.roleLabel.trim().replace(/\s+/g, ' ').replace(/[.]+$/, '').split(' ').slice(0, 4).join(' ')
            : '',
          degreeLevel: level,
          degreeText,
          keySkills: tidyList(v.keySkills, { max: 5, maxLen: 24, lower: true }),
          stipendStatus,
          isTech: typeof v.isTech === 'boolean' ? v.isTech : null,
        });
      }
    } catch (err) {
      const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
      log.warn(`Gemini enrichment failed (${why}) — remaining postings keep their plain-text summary.`);
      return out;
    } finally {
      clearTimeout(timer);
    }
  }

  return out;
}
