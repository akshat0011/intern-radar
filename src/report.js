import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS, ensureDirs } from './paths.js';
import { formatStipend } from './extract.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function relTime(ms) {
  if (!ms) return 'unknown';
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function absTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

const CSS = `
:root{
  --bg:#f6f7f9; --panel:#fff; --panel-2:#fbfbfd; --ink:#14161a; --ink-2:#5b6470;
  --line:#e3e6ea; --accent:#0a66c2; --accent-ink:#fff; --good:#0a7c4a; --good-bg:#e6f5ee;
  --warn:#8a5a00; --warn-bg:#fdf3dc; --chip:#eef1f5; --shadow:0 1px 2px rgba(16,24,40,.06),0 4px 12px rgba(16,24,40,.04);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0e1116; --panel:#161a21; --panel-2:#1b2029; --ink:#e8ecf1; --ink-2:#96a1b0;
    --line:#262c36; --accent:#4a9eff; --accent-ink:#08131f; --good:#5fd39b; --good-bg:#12291f;
    --warn:#e8c169; --warn-bg:#2a2213; --chip:#222833; --shadow:none;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
.wrap{max-width:960px;margin:0 auto;padding:28px 20px 72px}
header{margin-bottom:22px}
h1{font-size:23px;font-weight:650;letter-spacing:-.02em;margin:0 0 6px}
.sub{color:var(--ink-2);font-size:13.5px}
.statbar{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 20px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px 13px;box-shadow:var(--shadow)}
.stat b{display:block;font-size:19px;font-weight:650;letter-spacing:-.02em}
/* Direct child only — the count lives in a span inside the <b> and must not
   pick up the label's small-caps styling. */
.stat > span{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-2)}
.controls{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
input[type=search]{flex:1;min-width:200px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;
  background:var(--panel);color:var(--ink);font-size:14px}
input[type=search]:focus{outline:2px solid var(--accent);outline-offset:-1px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chipbtn{border:1px solid var(--line);background:var(--panel);color:var(--ink-2);border-radius:999px;
  padding:5px 11px;font-size:12.5px;cursor:pointer;font-family:inherit}
.chipbtn[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:550}
.job{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:17px 18px;
  margin-bottom:12px;box-shadow:var(--shadow)}
.job.hide{display:none}
.top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.title{font-size:16.5px;font-weight:600;letter-spacing:-.01em;margin:0 0 3px;line-height:1.35}
.title a{color:var(--ink);text-decoration:none}
.title a:hover{color:var(--accent);text-decoration:underline}
.co{font-size:14px;color:var(--ink-2)}
.co b{color:var(--ink);font-weight:550}
.posted{white-space:nowrap;font-size:12.5px;color:var(--ink-2);text-align:right}
.fresh{color:var(--good);font-weight:600}
.meta{display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 0}
.tag{background:var(--chip);border-radius:6px;padding:3px 8px;font-size:12px;color:var(--ink-2)}
.tag.money{background:var(--good-bg);color:var(--good);font-weight:600}
.tag.easy{background:var(--warn-bg);color:var(--warn);font-weight:550}
.summary{margin:12px 0 0;font-size:14px;color:var(--ink);white-space:pre-line}
.skills{display:flex;flex-wrap:wrap;gap:5px;margin-top:11px}
.skill{border:1px solid var(--line);border-radius:5px;padding:2px 7px;font-size:11.5px;color:var(--ink-2)}
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;align-items:center}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);text-decoration:none;
  border-radius:7px;padding:8px 15px;font-size:13.5px;font-weight:600}
.btn.ghost{background:transparent;color:var(--ink-2);border:1px solid var(--line);font-weight:500}
details{margin-top:12px}
summary{cursor:pointer;font-size:13px;color:var(--ink-2);user-select:none}
summary:hover{color:var(--accent)}
.desc{margin-top:10px;padding:13px;background:var(--panel-2);border:1px solid var(--line);border-radius:8px;
  font-size:13.5px;white-space:pre-wrap;max-height:440px;overflow:auto;color:var(--ink-2)}
.empty{background:var(--panel);border:1px dashed var(--line);border-radius:12px;padding:40px 20px;text-align:center;color:var(--ink-2)}
footer{margin-top:32px;padding-top:18px;border-top:1px solid var(--line);color:var(--ink-2);font-size:12.5px}
footer code{background:var(--chip);padding:1px 5px;border-radius:4px;font-size:12px}
.note{background:var(--warn-bg);color:var(--warn);border-radius:8px;padding:11px 13px;font-size:13px;margin-bottom:16px}
`;

const JS = `
const q = document.getElementById('q');
const chips = [...document.querySelectorAll('.chipbtn')];
const jobs = [...document.querySelectorAll('.job')];
let company = 'all';
function apply(){
  const term = (q.value || '').toLowerCase().trim();
  let shown = 0;
  for (const j of jobs){
    const okCo = company === 'all' || j.dataset.company === company;
    const okTerm = !term || j.dataset.search.includes(term);
    const show = okCo && okTerm;
    j.classList.toggle('hide', !show);
    if (show) shown++;
  }
  document.getElementById('shown').textContent = shown;
}
q.addEventListener('input', apply);
for (const c of chips){
  c.addEventListener('click', () => {
    chips.forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    company = c.dataset.co;
    apply();
  });
}
`;

function jobCard(job) {
  const stipend = formatStipend({
    min: job.stipend_min, max: job.stipend_max,
    currency: job.stipend_currency, period: job.stipend_period,
  }) || job.salary_text;

  const postedMs = job.posted_at || job.first_seen_at;
  const isFresh = postedMs && Date.now() - postedMs < 6 * 3_600_000;
  const applyUrl = job.apply_url || job.job_url;
  const external = job.apply_url && !/linkedin\.com/.test(job.apply_url);

  const tags = [];
  if (stipend) tags.push(`<span class="tag money">${esc(stipend)}</span>`);
  if (job.location) tags.push(`<span class="tag">${esc(job.location)}</span>`);
  if (job.workplace_type) tags.push(`<span class="tag">${esc(job.workplace_type)}</span>`);
  if (job.duration) tags.push(`<span class="tag">${esc(job.duration)}</span>`);
  if (job.applicants) tags.push(`<span class="tag">${esc(job.applicants)}</span>`);
  if (job.easy_apply) tags.push('<span class="tag easy">Easy Apply</span>');
  if (external) tags.push('<span class="tag">External site</span>');

  const searchBlob = [job.title, job.company, job.location, job.summary, (job.skills || []).join(' ')]
    .filter(Boolean).join(' ').toLowerCase();

  return `
<article class="job" data-company="${esc(job.company_matched || job.company || 'Other')}" data-search="${esc(searchBlob)}">
  <div class="top">
    <div>
      <h2 class="title"><a href="${esc(job.job_url)}" target="_blank" rel="noreferrer">${esc(job.title)}</a></h2>
      <div class="co"><b>${esc(job.company || 'Unknown company')}</b></div>
    </div>
    <div class="posted">
      <div class="${isFresh ? 'fresh' : ''}">${esc(job.posted_text || relTime(postedMs))}</div>
      <div style="opacity:.7;margin-top:2px">seen ${esc(relTime(job.first_seen_at))}</div>
    </div>
  </div>
  ${tags.length ? `<div class="meta">${tags.join('')}</div>` : ''}
  ${job.summary ? `<p class="summary">${esc(job.summary)}</p>` : ''}
  ${(job.skills || []).length ? `<div class="skills">${job.skills.map((s) => `<span class="skill">${esc(s)}</span>`).join('')}</div>` : ''}
  <div class="actions">
    <a class="btn" href="${esc(applyUrl)}" target="_blank" rel="noreferrer">${external ? 'Apply on company site' : 'Apply on LinkedIn'}</a>
    ${external ? `<a class="btn ghost" href="${esc(job.job_url)}" target="_blank" rel="noreferrer">View on LinkedIn</a>` : ''}
  </div>
  ${job.description ? `<details><summary>Full description</summary><div class="desc">${esc(job.description)}</div></details>` : ''}
</article>`;
}

/**
 * Build the HTML report. `notes` is a list of honest caveats about the run
 * (caps hit, pages skipped, CAPTCHA encountered) — never silently omitted.
 */
export function buildReport({ jobs, run, notes = [], stats = {} }) {
  const companies = [...new Set(jobs.map((j) => j.company_matched || j.company || 'Other'))].sort();
  const withStipend = jobs.filter((j) => j.stipend_min || j.salary_text).length;
  const easyApply = jobs.filter((j) => j.easy_apply).length;

  const body = jobs.length
    ? jobs.map(jobCard).join('\n')
    : `<div class="empty"><b>No new matching internships this run.</b><br>
       Scanned ${esc(run.cardsSeen ?? 0)} job cards across ${esc(run.pagesScanned ?? 0)} pages — none were new postings from your watchlist companies.</div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LinkedIn internships — ${esc(absTime(run.startedAt))}</title>
<style>${CSS}</style></head><body>
<div class="wrap">
<header>
  <h1>New internships on your watchlist</h1>
  <div class="sub">Run finished ${esc(absTime(run.finishedAt || Date.now()))} · scanned ${esc(run.pagesScanned ?? 0)} pages, ${esc(run.cardsSeen ?? 0)} cards · next run at 12:00 / 18:00</div>
</header>

${notes.map((n) => `<div class="note">${esc(n)}</div>`).join('')}

<div class="statbar">
  <div class="stat"><b><span id="shown">${jobs.length}</span></b><span>new jobs</span></div>
  <div class="stat"><b>${companies.length}</b><span>companies</span></div>
  <div class="stat"><b>${withStipend}</b><span>stipend listed</span></div>
  <div class="stat"><b>${easyApply}</b><span>easy apply</span></div>
  <div class="stat"><b>${esc(stats.total ?? 0)}</b><span>tracked all-time</span></div>
</div>

${jobs.length ? `<div class="controls">
  <input type="search" id="q" placeholder="Filter by title, skill, location…" autocomplete="off">
  <div class="chips">
    <button class="chipbtn" data-co="all" aria-pressed="true">All</button>
    ${companies.map((c) => `<button class="chipbtn" data-co="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
  </div>
</div>` : ''}

${body}

<footer>
  Generated by <code>linkedin-internship-watcher</code> · run <code>${esc(run.runId)}</code> ·
  ${esc(stats.skipped ?? 0)} non-matching cards remembered so they are not re-opened next run.<br>
  Edit <code>config.json</code> to change the company watchlist, search terms, or pacing.
</footer>
</div>
${jobs.length ? `<script>${JS}</script>` : ''}
</body></html>`;
}

/** Write the report to a timestamped file plus `latest.html`. Returns its path. */
export function writeReport(html, runId) {
  ensureDirs();
  const file = join(PATHS.reports, `report-${runId}.html`);
  writeFileSync(file, html, 'utf8');
  writeFileSync(PATHS.latestReport, html, 'utf8');
  return file;
}
