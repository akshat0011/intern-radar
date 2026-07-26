import { log } from './logger.js';

/** Boilerplate that carries no signal for a candidate deciding whether to apply. */
const NOISE = [
  /equal opportunit(y|ies)/i,
  /without regard to race/i,
  /reasonable accommodation/i,
  /we are an? (equal|inclusive)/i,
  /background check/i,
  /by (applying|submitting).{0,40}(consent|agree)/i,
  /^(about (us|the company)|who we are|our (mission|story|values))\b/i,
  /follow us on/i,
  /^\s*(show more|show less)\s*$/i,
];

/** Generic company-blurb sentences that crowd out the useful ones. */
const ANTI_SIGNAL = [
  [/^we are (?:a|an|the)\b/i, -4],
  [/\b(fast|rapidly)[- ]growing\b/i, -3],
  [/\b(world|industry)[- ]lead(?:ing|er)\b/i, -3],
  [/\b(mission|vision|values|culture)\b/i, -2],
  [/\bjoin (?:us|our team)\b/i, -2],
  [/\bexciting opportunit/i, -2],
];

const SIGNAL = [
  [/\b(responsibilit|you will|you'll|your role|day.to.day|what you.ll do)\b/i, 3],
  [/\b(require|qualification|must have|looking for|we seek|ideal candidate|eligib)\b/i, 3],
  [/\b(stipend|salary|compensation|paid|pay)\b/i, 3],
  [/\b(duration|months?|start date|starting|joining|summer|full.time offer|ppo|pre.placement)\b/i, 2],
  [/\b(experience with|proficien|familiar|knowledge of|skills?)\b/i, 2],
  [/\b(remote|hybrid|on.?site|location|relocat)\b/i, 2],
  [/\b(deadline|apply by|last date|closes?)\b/i, 3],
  [/\b(graduat|final year|pursuing|degree|b\.?tech|bachelor|master|cgpa|gpa)\b/i, 2],
];

function cleanText(desc) {
  return String(desc || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !NOISE.some((re) => re.test(l)))
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    // Short lines like "Apply by 15 August 2026." are among the most useful
    // things in a posting, so the floor is deliberately low.
    .filter((s) => s.length >= 18 && s.length <= 400);
}

/**
 * Extractive summary: score each sentence for candidate-relevant signal, keep
 * the best few in their original order so the result still reads coherently.
 */
export function offlineSummary(description, { maxSentences = 4, maxChars = 620 } = {}) {
  const text = cleanText(description);
  if (!text) return null;

  const sentences = splitSentences(text);
  if (sentences.length === 0) return text.slice(0, maxChars);
  if (sentences.length <= maxSentences) return sentences.join(' ').slice(0, maxChars);

  const scored = sentences.map((sentence, index) => {
    let score = 0;
    for (const [re, weight] of SIGNAL) if (re.test(sentence)) score += weight;
    for (const [re, weight] of ANTI_SIGNAL) if (re.test(sentence)) score += weight;
    // Mild preference for the top of the post, where the real description lives.
    score += Math.max(0, 3 - Math.floor(index / 4));
    // Bullet-style lines are usually the dense, useful ones.
    if (/^[-•*–]/.test(sentence)) score += 1;
    return { sentence, index, score };
  });

  const picked = scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence.replace(/^[-•*–]\s*/, ''));

  let out = picked.join(' ');
  if (out.length > maxChars) out = `${out.slice(0, maxChars).replace(/\s+\S*$/, '')}…`;
  return out;
}

/**
 * Optional higher-quality summary via the Claude API. Falls back to the offline
 * summary on any failure — a summarisation hiccup must never lose a job posting.
 */
async function claudeSummary(job, description, { model }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const body = {
    model,
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Summarise this internship posting for a candidate deciding whether to apply. Three to four short lines, plain text, no preamble and no markdown headers. Cover: what the role actually does, the hard eligibility requirements, stipend/duration if stated, and anything unusual worth knowing. If a detail is not in the posting, leave it out rather than guessing.

Title: ${job.title}
Company: ${job.company}
Location: ${job.location ?? 'not stated'}

Description:
${String(description).slice(0, 12_000)}`,
    }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      log.warn(`Claude summary failed (HTTP ${res.status}) — using offline summary.`);
      return null;
    }
    const json = await res.json();
    const text = json.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return text || null;
  } catch (err) {
    log.warn(`Claude summary error (${err.name === 'AbortError' ? 'timeout' : err.message}) — using offline summary.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Summarise using the configured mode, always returning something usable. */
export async function summarize(job, description, summarizerConfig) {
  if (summarizerConfig?.mode === 'claude') {
    const viaClaude = await claudeSummary(job, description, summarizerConfig);
    if (viaClaude) return viaClaude;
  }
  return offlineSummary(description);
}
