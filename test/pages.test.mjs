import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobSlug, slugify, renderJobPage } from '../src/pages.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got:  ${a}\n         want: ${e}`); }
}

const ats = { id: 'ats:greenhouse:alphagrepsecurities:8622004002', company: 'AlphaGrep Securities', title: 'Software Development Intern' };
const linkedin = { id: '4441247638', company: 'Adobe', title: 'AI Engineer Apprentice' };

console.log('\n== job slugs ==');
// A colon in the filename is what makes a Windows checkout of this repo fail.
check('ats id carries no colon', jobSlug(ats).includes(':'), false);
check('ats id is fully slugified', jobSlug(ats),
  'alphagrep-securities-software-development-intern-ats-greenhouse-alphagrepsecurities-8622004002');
// A numeric id survives slugify untouched, so no existing LinkedIn URL moves.
check('linkedin url is unchanged', jobSlug(linkedin), 'adobe-ai-engineer-apprentice-4441247638');
check('slug is filesystem-safe', /^[a-z0-9-]+$/.test(jobSlug(ats)), true);
check('missing id does not produce a trailing dash', jobSlug({ id: null, company: 'X', title: 'Y' }), 'x-y-role');
// Two Workday requisitions from one tenant differ only in their last characters.
// Capping the id at slugify's 70 would collide them onto a single page.
const wd = (n) => ({ company: 'Piramal Pharma', title: 'Intern', id: `ats:workday:piramalpharma:wd102:PIRAMAL_EXTERNAL_CAREERS:R0000${n}` });
check('long ids are not truncated', jobSlug(wd(2295)) !== jobSlug(wd(2296)), true);
check('long id survives in full', jobSlug(wd(2295)).endsWith('r00002295'), true);

console.log('\n== slug parity with the browser copy ==');
// web/public/app.js duplicates this function to link to the generated pages. If
// the two ever drift the site links to a 404, so the duplication is pinned here.
const appSrc = readFileSync(join(ROOT, 'web', 'public', 'app.js'), 'utf8');
const start = appSrc.indexOf('function jobPageSlug(job) {');
const end = appSrc.indexOf('\n}', start);
const browserSlug = new Function(`${appSrc.slice(start, end + 2)}; return jobPageSlug;`)();

for (const job of [ats, linkedin, { id: 'x', company: 'Ford & Co', title: 'Intern — Data' }]) {
  check(`parity: ${job.company}`, browserSlug(job), jobSlug(job));
}

console.log('\n== slugify ==');
check('ampersand becomes and', slugify('Ford & Co'), 'ford-and-co');
check('collapses punctuation', slugify('Intern — Data (Remote)'), 'intern-data-remote');
check('empty falls back', slugify(''), 'role');
check('caps length', slugify('a'.repeat(200)).length, 70);

console.log('\n== apply links ==');
const page = { ...linkedin, postedAt: Date.UTC(2026, 6, 1), firstSeenAt: Date.UTC(2026, 6, 1), bullets: ['a', 'b'] };
const withJs = renderJobPage({ ...page, applyUrl: 'javascript:alert(1)' });
check('javascript: url is not rendered', withJs.includes('javascript:alert(1)'), false);
check('no empty apply href', withJs.includes('href=""'), false);
const withHttps = renderJobPage({ ...page, applyUrl: 'https://www.linkedin.com/jobs/view/1' });
check('https url is rendered', withHttps.includes('href="https://www.linkedin.com/jobs/view/1"'), true);
check('posted date is rendered', withHttps.includes('<dd>2026-07-01</dd>'), true);
// A row with no dates at all must not abort the whole publish step.
check('undated job still renders', typeof renderJobPage({ ...linkedin, bullets: [] }), 'string');

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
