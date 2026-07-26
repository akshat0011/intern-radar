import { classifyRole, isSoftwareRole } from '../src/roles.js';

let pass = 0, fail = 0;
function check(title, expected) {
  const { verdict, matched } = classifyRole(title);
  if (verdict === expected) {
    pass++;
    console.log(`  ok    ${String(verdict).padEnd(9)} ${title}`);
  } else {
    fail++;
    console.log(`  FAIL  got ${verdict} (via "${matched}"), want ${expected}  —  ${title}`);
  }
}

console.log('\n== should be TECH ==');
for (const t of [
  'Software Engineer Intern',
  'SDE Intern',
  'Backend Developer Intern',
  'Frontend Intern',
  'Full Stack Developer Internship',
  'Android Developer Intern',
  'iOS Developer Internship',
  'Flutter Developer Intern',
  'Python Developer Intern',
  'Java Backend Intern',
  'Data Science Intern',
  'Data Analyst Intern',
  'Machine Learning Intern',
  'AI Intern',
  'ML Engineer Intern',
  'Computer Vision Intern',
  'NLP Research Intern',
  'Generative AI Intern',
  'DevOps Intern',
  'Cloud Engineer Intern',
  'Site Reliability Engineer Intern',
  'QA Intern',
  'Software Testing Intern',
  'SDET Intern',
  'Cybersecurity Intern',
  'Security Engineer Internship',
  'Embedded Software Intern',
  'Firmware Intern',
  'VLSI Design Intern',
  'Game Development Intern',
  'Blockchain Developer Intern',
  'Database Intern',
  'API Developer Intern',
  'Product Management Intern',
  'UI/UX Design Intern',
  'Product Design Intern',
  'Technology Analyst Intern',
  'Graduate Engineer Trainee',
  'Web Development Internship in Bangalore',
  'Business Intelligence Intern',
]) check(t, 'tech');

console.log('\n== should be NON-TECH (real titles from actual runs) ==');
for (const t of [
  'Psychosocial Support Intern',
  'Business Development Intern',
  'Talent acquisition Intern',
  'Volunteer Teacher Internship in Bhopal',
  'Video Editing/Making Internship in Bangalore',
  'Recruiter Internship in Gurgaon',
  'Social Media Marketing Internship in Lucknow',
  'School Marketing Internship in Chennai',
  'Cinematography Internship in Bangalore',
  'Field Sales Internship in Surat',
  'Content and Social Media Marketing Internship',
  'HR Intern',
  'Finance Intern',
  'Legal Intern',
  'Graphic Design Intern',
  'Customer Support Intern',
  'Digital Marketing Intern',
  'Content Writing Intern',
  'Mechanical Engineer Intern',
  'Civil Engineer Intern',
  'Counselling Psychology Intern',
  'Supply Chain Intern',
  'Data Entry Intern',
  'Business Analyst Intern',
  'Fashion Design Intern',
]) check(t, 'non-tech');

console.log('\n== negative must beat positive (trap cases) ==');
for (const t of [
  'Software Sales Intern',
  'Sales Engineer Intern',
  'Technical Recruiter Intern',
  'Marketing Technology Intern',
  'IT Sales Intern',
]) check(t, 'non-tech');

console.log('\n== specific tech phrase must survive a generic negative word ==');
// "analyst" reads commercial, but these are data roles.
for (const t of [
  'Data Analyst Intern',
  'Business Intelligence Analyst Intern',
]) check(t, 'tech');

console.log('\n== genuinely ambiguous -> uncertain, not guessed ==');
for (const t of [
  'Summer Intern',
  'Intern',
  'Internship Trainee',
  'Operations Intern',
]) check(t, 'uncertain');

console.log('\n== real titles from a live run (regression corpus) ==');
// Harvested from `show-report.js --roles` after a real scheduled run. Two of
// these were genuine misses: \bcloud\b could not match "CloudOps" (8 postings
// lost), and bare "ux" was absent while "ui/ux" was present.
for (const t of [
  'CloudOps Trainee',
  'UX Researcher Intern',
  'Trading Intern',
  'Quantitative Trading Intern',
]) check(t, 'tech');

for (const t of [
  'Global Market Analyst Intern',
  'Telecaller / Customer Acquisition Intern',
  'Client Acquisition Intern',
  'Mechanical Design Intern',
  'Content creator Intern',
  'Student Ambassador Intern',
  'Management Trainee',
  'Character Animation Intern',
  'Curation Intern',
  'Article Trainee',
  'Fashion Intern',
  'Sports Intern',
  'Field Executive Trainee-Chemical-DMD ( 82820935 )',
  'SUE Graduate Trainee Technician',
  'EIC Apprentice - Leasing Tenant Representation_Bangalore',
  "Growth & Founder's Office Intern",
  'Quick Commerce – Cataloging Intern',
]) check(t, 'non-tech');

console.log('\n== degenerate input ==');
let d = 0;
for (const [label, v] of [['empty', ''], ['null', null], ['undefined', undefined], ['spaces', '   ']]) {
  const { verdict } = classifyRole(v);
  const ok = verdict === 'uncertain';
  if (ok) { pass++; d++; } else { fail++; console.log(`  FAIL ${label} -> ${verdict}`); }
}
console.log(`  ok    ${d}/4 degenerate inputs return uncertain without throwing`);

console.log('\n== isSoftwareRole gate ==');
const gate = [
  ['Software Engineer Intern', false, true],
  ['HR Intern', false, false],
  ['Summer Intern', false, false],
  ['Summer Intern', true, true],
];
for (const [title, includeUncertain, want] of gate) {
  const got = isSoftwareRole(title, { includeUncertain });
  if (got === want) { pass++; console.log(`  ok    ${String(got).padEnd(5)} includeUncertain=${String(includeUncertain).padEnd(5)} ${title}`); }
  else { fail++; console.log(`  FAIL  got ${got} want ${want} — ${title} (includeUncertain=${includeUncertain})`); }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
