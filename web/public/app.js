/* Intern Radar — listings browser + resume tailoring */

const PDFJS_VERSION = '4.6.82';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const HOT_MS = 60 * 60 * 1000;      // "just posted"
const FRESH_MS = 24 * 60 * 60 * 1000; // "new"

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const state = {
  jobs: [],
  filtered: [],
  selectedId: null,
  resumeText: '',
  tailored: null,
  generatedAt: null,
};

/* ---------------- theme ---------------- */

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.dataset.theme = saved;

  $('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = isDark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
}

/* ---------------- helpers ---------------- */

function relTime(ms) {
  if (!ms) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/**
 * A stable colour per company, derived from the name. Gives every card a
 * distinct identity without needing to fetch a single logo.
 */
function companyGradient(name) {
  // FNV-1a. A naive `h * 31 + c` reduced mod 360 each step clusters badly —
  // Salesforce, Optiver and Razorpay all came out the same shade of green.
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  // Nudge away from the muddy yellow-green band.
  const safe = hue > 60 && hue < 95 ? hue + 45 : hue;
  return `linear-gradient(140deg, hsl(${safe} 72% 56%), hsl(${(safe + 38) % 360} 76% 45%))`;
}

function companyInitials(name) {
  const words = String(name).replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Rough monthly-equivalent value, for sorting by stipend. */
function stipendValue(job) {
  if (!job.stipend) return -1;
  let n = parseFloat(job.stipend.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return -1;
  if (/year|annum|lpa/i.test(job.stipend)) n /= 12;
  if (/hour/i.test(job.stipend)) n *= 160;
  if (/week/i.test(job.stipend)) n *= 4;
  return n;
}

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------------- data ---------------- */

async function loadJobs() {
  try {
    const res = await fetch(`/data/jobs.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state.jobs = data.jobs ?? [];
    state.generatedAt = data.generatedAt ?? null;
  } catch {
    state.jobs = [];
    state.generatedAt = null;
  }
}

function renderFreshness() {
  $('freshness-text').textContent = state.generatedAt
    ? `checked ${relTime(state.generatedAt)}`
    : 'no data yet';
}

function populateFilters() {
  const companies = [...new Set(state.jobs.map((j) => j.company))].sort((a, b) => a.localeCompare(b));
  const locations = [...new Set(state.jobs.map((j) => j.location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  for (const c of companies) $('f-company').append(new Option(c, c));
  for (const l of locations.slice(0, 200)) $('f-location').append(new Option(l, l));
}

/* ---------------- filtering ---------------- */

function applyFilters() {
  const q = $('q').value.trim().toLowerCase();
  const company = $('f-company').value;
  const location = $('f-location').value;
  const mode = $('f-mode').value;
  const sort = $('f-sort').value;
  const paidOnly = $('f-paid').getAttribute('aria-pressed') === 'true';
  const easyOnly = $('f-easy').getAttribute('aria-pressed') === 'true';

  const list = state.jobs.filter((j) => {
    if (company && j.company !== company) return false;
    if (location && j.location !== location) return false;
    if (mode && (j.workplaceType ?? '').toLowerCase() !== mode.toLowerCase()) return false;
    if (paidOnly && !j.stipend) return false;
    if (easyOnly && !j.easyApply) return false;
    if (q) {
      const blob = [j.title, j.company, j.location, j.summary, (j.skills || []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'stipend') list.sort((a, b) => stipendValue(b) - stipendValue(a));
  else if (sort === 'company') list.sort((a, b) => a.company.localeCompare(b.company));
  else list.sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));

  state.filtered = list;
  renderList();
}

function anyFilterActive() {
  return $('q').value.trim() || $('f-company').value || $('f-location').value ||
    $('f-mode').value || $('f-paid').getAttribute('aria-pressed') === 'true' ||
    $('f-easy').getAttribute('aria-pressed') === 'true';
}

/* ---------------- rendering ---------------- */

function jobCard(job, index) {
  const li = el('li');
  const card = el('article', 'card');
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.dataset.id = job.id;
  // Stagger the entrance, but cap it so a long list is not slow to appear.
  card.style.animationDelay = `${Math.min(index, 12) * 45}ms`;
  if (job.id === state.selectedId) card.setAttribute('aria-current', 'true');

  const head = el('div', 'card-head');

  const badge = el('div', 'co-badge', companyInitials(job.company));
  badge.style.background = companyGradient(job.company);
  head.append(badge);

  const block = el('div', 'co-block');
  block.append(el('div', 'co-name', job.company));
  block.append(el('div', 'role-name', job.title));
  head.append(block);

  const age = job.postedAt ? Date.now() - job.postedAt : null;
  const when = el('div', 'card-when');
  if (age != null && age < HOT_MS) {
    const hot = el('span', 'hot-badge', '⚡ just posted');
    when.append(hot);
  } else {
    when.append(el('div', null, job.postedText || relTime(job.postedAt)));
  }
  head.append(when);
  card.append(head);

  const tags = el('div', 'tags');
  if (age != null && age >= HOT_MS && age < FRESH_MS) tags.append(el('span', 'tag tag-new', 'New'));
  if (job.stipend) tags.append(el('span', 'tag tag-money', job.stipend));
  if (job.location) tags.append(el('span', 'tag', job.location));
  if (job.workplaceType) tags.append(el('span', 'tag', job.workplaceType));
  if (job.duration) tags.append(el('span', 'tag', job.duration));
  if (job.easyApply) tags.append(el('span', 'tag tag-easy', 'Easy Apply'));
  if (tags.children.length) card.append(tags);

  if (job.summary) card.append(el('p', 'card-blurb', job.summary));

  card.addEventListener('click', () => selectJob(job.id));
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectJob(job.id); }
  });

  li.append(card);
  return li;
}

function renderList() {
  const list = $('joblist');
  list.replaceChildren();

  const n = state.filtered.length;
  $('result-count').textContent = state.jobs.length === 0
    ? 'Nothing on the radar yet'
    : `${n} ${n === 1 ? 'role' : 'roles'}${anyFilterActive() ? ` of ${state.jobs.length}` : ''}`;
  $('reset').hidden = !anyFilterActive();

  const empty = $('empty');
  if (n === 0) {
    empty.hidden = false;
    if (state.jobs.length === 0) {
      $('empty-title').textContent = 'Radar is warming up';
      $('empty-body').textContent = 'No listings have been published here yet. New roles appear within minutes of going live.';
    } else {
      $('empty-title').textContent = 'Radar is clear';
      $('empty-body').textContent = 'Nothing matches those filters. Try clearing the search or widening the company filter.';
    }
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  state.filtered.forEach((job, i) => frag.append(jobCard(job, i)));
  list.append(frag);
}

function selectJob(id) {
  state.selectedId = id;
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return;

  for (const card of document.querySelectorAll('.card')) {
    if (card.dataset.id === id) card.setAttribute('aria-current', 'true');
    else card.removeAttribute('aria-current');
  }

  renderDetail(job);
  history.replaceState(null, '', `#job-${id}`);

  if (matchMedia('(max-width: 980px)').matches) {
    $('detail-col').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
}

function closeDetail() {
  $('detail-col').classList.remove('is-open');
  document.body.style.overflow = '';
}

function renderDetail(job) {
  const d = $('detail');
  $('detail-placeholder').hidden = true;
  d.hidden = false;
  d.replaceChildren();
  d.scrollTop = 0;
  // Replay the entrance animation on every selection. Dropping the class and
  // re-adding it on the next frame restarts it; reassigning style.animation
  // did not, and left the pane stuck at opacity 0.
  d.classList.remove('is-entering');
  requestAnimationFrame(() => d.classList.add('is-entering'));

  const back = el('button', 'detail-back');
  back.type = 'button';
  back.textContent = '← All roles';
  back.addEventListener('click', closeDetail);
  d.append(back);

  d.append(el('div', 'detail-co', job.company));
  d.append(el('h2', null, job.title));
  if (job.location) d.append(el('div', 'detail-loc', job.location));

  const actions = el('div', 'detail-actions');
  const apply = el('a', 'btn btn-primary btn-glow', 'Apply on LinkedIn →');
  apply.href = job.applyUrl || job.url;
  apply.target = '_blank';
  apply.rel = 'noopener noreferrer';
  actions.append(apply);

  const tailorBtn = el('button', 'btn', '✨ Tailor my resume');
  tailorBtn.type = 'button';
  tailorBtn.addEventListener('click', () => openTailor(job));
  actions.append(tailorBtn);
  d.append(actions);

  const facts = el('dl', 'facts');
  const addFact = (label, value, cls) => {
    if (!value) return;
    const f = el('div', 'fact');
    f.append(el('dt', null, label), el('dd', cls, value));
    facts.append(f);
  };
  addFact('Stipend', job.stipend || 'Not stated', job.stipend ? 'money' : null);
  addFact('Work mode', job.workplaceType || '—');
  addFact('Duration', job.duration || '—');
  addFact('Posted', job.postedText || relTime(job.postedAt));
  if (job.applicants) addFact('Applicants', job.applicants);
  d.append(facts);

  if (job.summary) {
    d.append(el('h3', null, 'What the role is'));
    d.append(el('p', 'detail-summary', job.summary));
  }

  if (job.skills?.length) {
    d.append(el('h3', null, 'Skills mentioned'));
    const row = el('div', 'skillrow');
    for (const s of job.skills) row.append(el('span', 'skill', s));
    d.append(row);
  }

  const note = el('p', 'source-note');
  note.append(document.createTextNode('This is an automatic summary. '));
  const link = el('a', null, 'Read the full posting on LinkedIn');
  link.href = job.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  note.append(link, document.createTextNode(' before you apply — it is the source of truth.'));
  d.append(note);
}

/* ---------------- resume tailoring ---------------- */

let activeJob = null;

function openTailor(job) {
  activeJob = job;
  $('tailor-job').textContent = `${job.company} · ${job.title}`;
  showStep('upload');
  $('tailor-backdrop').hidden = false;
  $('tailor').hidden = false;
  document.body.style.overflow = 'hidden';
  $('tailor-close').focus();
}

function closeTailor() {
  $('tailor').hidden = true;
  $('tailor-backdrop').hidden = true;
  if (!$('detail-col').classList.contains('is-open')) document.body.style.overflow = '';
}

function showStep(name) {
  for (const s of ['upload', 'working', 'result', 'error']) {
    $(`step-${s}`).hidden = s !== name;
  }
}

function setResumeText(text, label, ok = true) {
  state.resumeText = ok ? text : '';
  const box = $('file-state');
  box.hidden = false;
  box.classList.toggle('is-bad', !ok);
  box.replaceChildren(el('span', null, ok
    ? `${label} · ${text.length.toLocaleString()} characters read`
    : label));
  $('do-tailor').disabled = !ok || text.trim().length < 200;
}

async function extractPdfText(file) {
  const pdfjs = await import(`${PDFJS_BASE}/pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.mjs`;

  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();

    // Rebuild line structure from glyph positions — a flat join loses the line
    // breaks that make a resume readable to the model.
    let lastY = null;
    let line = [];
    const lines = [];
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.join(' ').replace(/\s+/g, ' ').trim());
        line = [];
      }
      line.push(item.str);
      lastY = y;
    }
    if (line.length) lines.push(line.join(' ').replace(/\s+/g, ' ').trim());
    pages.push(lines.filter(Boolean).join('\n'));
  }
  return pages.join('\n\n').trim();
}

async function handleFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    setResumeText('', 'That file is over 5 MB. Try exporting a smaller PDF.', false);
    return;
  }

  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const isTxt = file.type === 'text/plain' || /\.txt$/i.test(file.name);
  if (!isPdf && !isTxt) {
    setResumeText('', 'Please upload a PDF (or a .txt file).', false);
    return;
  }

  setResumeText('', `Reading ${file.name}…`, false);
  $('file-state').classList.remove('is-bad');

  try {
    const text = isTxt ? await file.text() : await extractPdfText(file);
    if (text.trim().length < 200) {
      setResumeText('', 'Almost no text could be read. If this is a scanned or image-based PDF, paste your resume as text instead.', false);
      return;
    }
    setResumeText(text, file.name, true);
  } catch {
    setResumeText('', 'That PDF could not be read. Try the paste-as-text option below.', false);
  }
}

async function runTailor() {
  const resumeText = state.resumeText || $('resume-paste').value.trim();
  if (resumeText.trim().length < 200) {
    setResumeText('', 'Please provide a bit more of your resume — at least a couple of hundred characters.', false);
    return;
  }

  showStep('working');
  const labels = ['Reading your resume…', 'Comparing it to the role…', 'Rewriting for this job…', 'Almost there…'];
  let i = 0;
  const tick = setInterval(() => {
    i = Math.min(i + 1, labels.length - 1);
    $('working-label').textContent = labels[i];
  }, 4200);

  try {
    const res = await fetch('/api/tailor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resumeText, job: activeJob }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The service is unavailable right now.');

    state.tailored = data.tailored;
    renderTailored(data.tailored);
    showStep('result');
    toast('Resume tailored ✨');
  } catch (err) {
    $('error-text').textContent = err.message;
    showStep('error');
  } finally {
    clearInterval(tick);
  }
}

function renderTailored(t) {
  const removed = $('removed-note');
  if (t.removedSkills?.length) {
    removed.hidden = false;
    removed.replaceChildren(
      el('b', null, 'Some skills were removed'),
      el('span', null, `These appeared in the draft but not in your resume, so they were stripped out rather than left in as claims you cannot back up: ${t.removedSkills.join(', ')}.`),
    );
  } else {
    removed.hidden = true;
  }

  const gaps = $('gaps-note');
  if (t.gaps?.length) {
    gaps.hidden = false;
    gaps.replaceChildren(el('b', null, 'What this role wants that your resume does not show'));
    const ul = el('ul');
    for (const g of t.gaps) ul.append(el('li', null, g));
    gaps.append(ul);
  } else {
    gaps.hidden = true;
  }

  const changes = $('changes');
  changes.replaceChildren();
  if (t.changeNotes?.length) {
    changes.append(el('h4', null, 'What changed'));
    const ul = el('ul');
    for (const c of t.changeNotes) ul.append(el('li', null, c));
    changes.append(ul);
  }

  const p = $('resume-preview');
  p.replaceChildren();
  if (t.name) p.append(el('div', 'r-name', t.name));
  if (t.contact) p.append(el('div', 'r-contact', t.contact));
  if (t.summary) p.append(el('p', 'r-summary', t.summary));

  for (const section of t.sections ?? []) {
    const sec = el('section', 'r-sec');
    sec.append(el('h5', null, section.heading));
    for (const item of section.items ?? []) {
      const box = el('div', 'r-item');
      const head = el('div', 'r-item-head');
      const left = el('div');
      if (item.title) left.append(el('span', 'r-role', item.title));
      if (item.org) {
        left.append(document.createTextNode(' — '));
        left.append(el('span', 'r-org', item.org));
      }
      head.append(left);
      if (item.dates) head.append(el('span', 'r-dates', item.dates));
      box.append(head);
      if (item.bullets?.length) {
        const ul = el('ul');
        for (const b of item.bullets) ul.append(el('li', null, b));
        box.append(ul);
      }
      sec.append(box);
    }
    p.append(sec);
  }

  if (t.skills?.length) {
    const sec = el('section', 'r-sec');
    sec.append(el('h5', null, 'Skills'));
    sec.append(el('div', 'r-skills', t.skills.join(' · ')));
    p.append(sec);
  }
}

function resumeAsText(t) {
  const out = [t.name, t.contact, '', t.summary, ''];
  for (const s of t.sections ?? []) {
    out.push(String(s.heading || '').toUpperCase(), '');
    for (const item of s.items ?? []) {
      out.push([item.title, item.org].filter(Boolean).join(' — ') + (item.dates ? `  (${item.dates})` : ''));
      for (const b of item.bullets ?? []) out.push(`  • ${b}`);
      out.push('');
    }
  }
  if (t.skills?.length) out.push('SKILLS', '', t.skills.join(' · '));
  return out.filter((l) => l !== undefined).join('\n');
}

/* ---------------- wiring ---------------- */

function wireControls() {
  const rerun = () => applyFilters();
  $('q').addEventListener('input', () => {
    $('clear-q').hidden = !$('q').value;
    rerun();
  });
  $('clear-q').addEventListener('click', () => {
    $('q').value = '';
    $('clear-q').hidden = true;
    rerun();
    $('q').focus();
  });
  for (const id of ['f-company', 'f-location', 'f-mode', 'f-sort']) {
    $(id).addEventListener('change', rerun);
  }
  for (const id of ['f-paid', 'f-easy']) {
    $(id).addEventListener('click', () => {
      const btn = $(id);
      btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      rerun();
    });
  }
  $('reset').addEventListener('click', () => {
    $('q').value = '';
    $('clear-q').hidden = true;
    for (const id of ['f-company', 'f-location', 'f-mode']) $(id).value = '';
    $('f-sort').value = 'new';
    for (const id of ['f-paid', 'f-easy']) $(id).setAttribute('aria-pressed', 'false');
    rerun();
  });
}

function wireTailor() {
  $('tailor-close').addEventListener('click', closeTailor);
  $('tailor-backdrop').addEventListener('click', closeTailor);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('tailor').hidden) closeTailor();
    else if ($('detail-col').classList.contains('is-open')) closeDetail();
  });

  const zone = $('dropzone');
  const input = $('resume-file');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => handleFile(input.files[0]));

  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.add('is-over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, (e) => { e.preventDefault(); zone.classList.remove('is-over'); });
  }
  zone.addEventListener('drop', (e) => handleFile(e.dataTransfer?.files?.[0]));

  $('resume-paste').addEventListener('input', (e) => {
    const v = e.target.value.trim();
    state.resumeText = v;
    $('do-tailor').disabled = v.length < 200;
    if (v.length >= 200) setResumeText(v, 'Pasted resume', true);
  });

  $('do-tailor').addEventListener('click', runTailor);
  $('error-retry').addEventListener('click', () => showStep('upload'));
  $('start-over').addEventListener('click', () => {
    state.resumeText = '';
    state.tailored = null;
    $('resume-file').value = '';
    $('resume-paste').value = '';
    $('file-state').hidden = true;
    $('do-tailor').disabled = true;
    showStep('upload');
  });

  $('download-pdf').addEventListener('click', () => {
    toast('Choose "Save as PDF" in the print dialog');
    setTimeout(() => window.print(), 350);
  });

  $('copy-text').addEventListener('click', async () => {
    if (!state.tailored) return;
    try {
      await navigator.clipboard.writeText(resumeAsText(state.tailored));
      toast('Resume copied to clipboard');
    } catch {
      toast('Could not copy — select the text manually');
    }
  });
}

/* ---------------- boot ---------------- */

async function init() {
  initTheme();
  wireControls();
  wireTailor();

  await loadJobs();
  renderFreshness();
  populateFilters();
  applyFilters();

  const hash = location.hash.match(/^#job-(.+)$/);
  if (hash && state.jobs.some((j) => j.id === hash[1])) selectJob(hash[1]);

  setInterval(renderFreshness, 60000);
}

init();
