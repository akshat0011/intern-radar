/**
 * POST /api/tailor
 *
 * Takes a student's resume text plus a job, and returns a rewritten version
 * targeted at that job.
 *
 * Two things this endpoint will not do:
 *   1. Invent anything. The model is instructed, and the output is checked, so
 *      that every claim traces back to the resume it was given. A tool that
 *      quietly adds skills a student does not have is handing them a fraudulent
 *      document to send to real employers.
 *   2. Store anything. Resume text is personal data; it lives in memory for the
 *      length of the request and is never written down or logged.
 */

const MODEL = process.env.TAILOR_MODEL || 'claude-haiku-4-5-20251001';
const MAX_RESUME_CHARS = 18_000;
const MAX_OUTPUT_TOKENS = 3_000;

// ---- spend protection -------------------------------------------------------
// The site is public and the API key is the site owner's, so throttling is not
// optional. These are deliberately conservative; raise them once you have seen
// real traffic.
const PER_IP_PER_HOUR = Number(process.env.RATE_LIMIT_PER_IP_HOURLY || 5);
const PER_IP_PER_DAY = Number(process.env.RATE_LIMIT_PER_IP_DAILY || 15);
const GLOBAL_PER_DAY = Number(process.env.RATE_LIMIT_GLOBAL_DAILY || 400);

/**
 * In-memory counters. Serverless instances recycle, so this is a speed bump
 * rather than a vault — it stops runaway loops and casual abuse, which is what
 * it is for. For a hard guarantee, set a monthly spend cap in the Anthropic
 * console; that is the only limit that cannot be evaded.
 */
const hits = new Map();

function sweep(now) {
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < 86_400_000);
    if (live.length) hits.set(key, live);
    else hits.delete(key);
  }
}

function rateLimit(ip, now) {
  if (hits.size > 5000) sweep(now);

  const globalTimes = hits.get('__global__') ?? [];
  if (globalTimes.filter((t) => now - t < 86_400_000).length >= GLOBAL_PER_DAY) {
    return { ok: false, status: 503, message: "Today's tailoring limit for the whole site has been reached. Please try again tomorrow." };
  }

  const times = (hits.get(ip) ?? []).filter((t) => now - t < 86_400_000);
  if (times.filter((t) => now - t < 3_600_000).length >= PER_IP_PER_HOUR) {
    return { ok: false, status: 429, message: `You can tailor ${PER_IP_PER_HOUR} resumes per hour. Try again shortly.` };
  }
  if (times.length >= PER_IP_PER_DAY) {
    return { ok: false, status: 429, message: `You have hit the daily limit of ${PER_IP_PER_DAY} tailored resumes. Try again tomorrow.` };
  }

  hits.set(ip, [...times, now]);
  hits.set('__global__', [...globalTimes.filter((t) => now - t < 86_400_000), now]);
  return { ok: true };
}

// ---- prompt -----------------------------------------------------------------

const SYSTEM = `You rewrite a candidate's existing resume so it targets one specific job. You are working with a real person's real resume, which they will send to real employers.

ABSOLUTE RULE — invent nothing.
- Every skill, tool, employer, job title, date, degree, metric and achievement in your output must already be present in the resume you were given.
- You may reword, reorder, re-emphasise, merge, cut, and re-title sections. You may adopt the job's vocabulary WHERE THE RESUME ALREADY SUPPORTS THE CLAIM (e.g. if the resume says "built REST APIs in Flask" and the job asks for "backend services", describing it as backend service work is fine).
- You may NOT add a technology the resume never mentions, inflate a duration, invent a number, upgrade a title, or imply seniority the resume does not show. If the job wants Kubernetes and the resume has no Kubernetes, the resume still has no Kubernetes.
- Never write placeholders like "[add metric]" or "X%". Omit rather than fabricate.

How to tailor well:
- Lead with the experience closest to this job; push less relevant material down or cut it.
- Mirror the job's terminology for things the candidate genuinely did.
- Prefer concrete outcomes already stated in the resume over vague duties.
- Keep it to one page of content unless the source clearly warrants two.
- Keep the candidate's real contact details exactly as given.

Return ONLY valid JSON, no markdown fence, matching:
{
  "name": "candidate's name from the resume",
  "contact": "one line: email · phone · city · links, only what the resume actually has",
  "summary": "2-3 sentence positioning statement grounded strictly in the resume",
  "sections": [
    { "heading": "Experience", "items": [
        { "title": "Role or project name", "org": "Employer or context, if the resume gives one",
          "dates": "as written in the resume, else empty string",
          "bullets": ["achievement-focused line", "..."] } ] }
  ],
  "skills": ["only skills that appear in the resume"],
  "changeNotes": ["short plain-English note on each significant change you made and why it fits this job"],
  "gaps": ["requirements in the job description the resume does NOT evidence - state them honestly so the candidate knows what they are missing"]
}`;

function buildUserPrompt(resumeText, job) {
  const facts = [
    `Role: ${job.title ?? 'Unknown'}`,
    `Company: ${job.company ?? 'Unknown'}`,
    job.location ? `Location: ${job.location}` : null,
    job.workplaceType ? `Work mode: ${job.workplaceType}` : null,
    job.stipend ? `Stipend: ${job.stipend}` : null,
    job.duration ? `Duration: ${job.duration}` : null,
    job.skills?.length ? `Listed skills: ${job.skills.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return `THE JOB
${facts}

What the posting says:
${job.description || job.summary || '(no description captured — tailor against the role, company and listed skills above)'}

THE CANDIDATE'S CURRENT RESUME
${resumeText}

Rewrite this resume to target the job above. Remember: reorganise and rephrase what is there. Add nothing that is not.`;
}

// ---- verification -----------------------------------------------------------

/**
 * Cheap guard against the most damaging failure mode: a skill appearing in the
 * output that never appeared in the input. Catches the obvious cases; it is a
 * safety net under the prompt, not a replacement for it.
 */
export function findInventedSkills(resumeText, skills) {
  const haystack = resumeText.toLowerCase().replace(/[^a-z0-9+#./ ]/g, ' ');
  return (skills ?? []).filter((skill) => {
    const s = String(skill).toLowerCase().trim();
    if (s.length < 2) return false;
    // Multi-word skills count as present if every significant word is present.
    const words = s.split(/[\s/,]+/).filter((w) => w.length > 2);
    if (words.length > 1) return !words.every((w) => haystack.includes(w));
    return !haystack.includes(s);
  });
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (process.env.TAILOR_DISABLED === 'true') {
    return res.status(503).json({ error: 'Resume tailoring is switched off right now.' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'The site is missing its API key. Contact the site owner.' });
  }

  const limit = rateLimit(clientIp(req), Date.now());
  if (!limit.ok) return res.status(limit.status).json({ error: limit.message });

  const { resumeText, job } = req.body ?? {};

  if (typeof resumeText !== 'string' || resumeText.trim().length < 200) {
    return res.status(400).json({ error: 'That resume looks too short to work with. If it is a scanned image, the text could not be read — try a PDF exported from a document editor.' });
  }
  if (!job?.title) {
    return res.status(400).json({ error: 'No job was selected.' });
  }

  const resume = resumeText.slice(0, MAX_RESUME_CHARS);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM,
        messages: [{ role: 'user', content: buildUserPrompt(resume, job) }],
      }),
    });

    if (!upstream.ok) {
      const status = upstream.status;
      const message = status === 429
        ? 'The AI service is busy. Try again in a moment.'
        : status === 401
          ? 'The site\'s API key was rejected. Contact the site owner.'
          : 'The AI service could not be reached. Try again shortly.';
      return res.status(status === 401 ? 500 : 502).json({ error: message });
    }

    const payload = await upstream.json();
    const raw = (payload.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let tailored;
    try {
      tailored = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'The AI returned something unreadable. Please try again.' });
    }

    const invented = findInventedSkills(resume, tailored.skills);
    if (invented.length) {
      // Strip them rather than failing outright — the rest of the rewrite is
      // still useful, and the student is told exactly what was removed.
      tailored.skills = (tailored.skills ?? []).filter((s) => !invented.includes(s));
      tailored.removedSkills = invented;
    }

    return res.status(200).json({
      tailored,
      meta: {
        model: MODEL,
        job: { title: job.title, company: job.company },
      },
    });
  } catch {
    return res.status(500).json({ error: 'Something went wrong while tailoring. Please try again.' });
  }
}
