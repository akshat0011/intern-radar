import { findInventedSkills } from '../web/api/tailor.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got:  ${a}\n         want: ${e}`); }
}

const resume = `Akshat Saroha — akshat@example.com — Bengaluru
B.Tech Computer Science, graduating 2027.
Built a REST API in Flask backed by PostgreSQL, deployed with Docker.
Interned at a startup writing Python data pipelines and SQL reports.
Skills: Python, Flask, SQL, Git, Docker, Node.js`;

console.log('\n== fabrication guard ==');
// Anything genuinely in the resume must survive.
check('keeps python', findInventedSkills(resume, ['Python']), []);
check('keeps postgresql', findInventedSkills(resume, ['PostgreSQL']), []);
check('keeps node.js', findInventedSkills(resume, ['Node.js']), []);
check('keeps case-insensitive', findInventedSkills(resume, ['python', 'FLASK', 'Docker']), []);

// Anything not in the resume must be caught.
check('catches kubernetes', findInventedSkills(resume, ['Kubernetes']), ['Kubernetes']);
check('catches react', findInventedSkills(resume, ['React']), ['React']);
check('catches several', findInventedSkills(resume, ['Python', 'Kubernetes', 'Rust']), ['Kubernetes', 'Rust']);

// Multi-word skills count as present only if every significant word is.
check('multiword present', findInventedSkills(resume, ['data pipelines']), []);
check('multiword absent', findInventedSkills(resume, ['machine learning']), ['machine learning']);
check('multiword partial is caught', findInventedSkills(resume, ['python kubernetes']), ['python kubernetes']);

// Degenerate input must not throw or produce noise.
check('empty list', findInventedSkills(resume, []), []);
check('undefined list', findInventedSkills(resume, undefined), []);
check('empty resume flags everything', findInventedSkills('', ['Python']), ['Python']);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
