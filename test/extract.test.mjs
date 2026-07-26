import { extractStipend, formatStipend, extractDuration, extractSkills, extractWorkplaceType, parseRelativeTime, jobIdFromUrl } from '../src/extract.js';
import { normaliseCompany, matchCompany, matchTitle, resolveWindowHours } from '../src/config.js';
import { offlineSummary } from '../src/summarize.js';

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got:  ${a}\n         want: ${e}`); }
}
function money(label, text, min, max, currency, period) {
  const s = extractStipend(text);
  const got = s && { min: s.min, max: s.max, currency: s.currency, period: s.period };
  check(label, got, min === null ? null : { min, max, currency, period });
}

console.log('\n== stipend ==');
money('INR range/month', 'Stipend: ₹25,000 - ₹40,000 per month', 25000, 40000, 'INR', 'month');
money('INR single', 'The stipend is ₹30,000/month for the duration.', 30000, 30000, 'INR', 'month');
money('USD hourly', 'Compensation: $25 - $45 per hour', 25, 45, 'USD', 'hour');
money('k notation', 'Stipend: 50k per month', 50000, 50000, null, 'month');
money('LPA', 'CTC 12 LPA on conversion', 1200000, 1200000, 'INR', 'year');
money('lakh per annum', 'Salary: 6.5 lakh per annum', 650000, 650000, 'INR', 'year');
money('Rs. with period', 'Stipend Rs. 15,000 monthly', 15000, 15000, 'INR', 'month');
money('INR code', 'Stipend: INR 40000 per month', 40000, 40000, 'INR', 'month');
money('no money at all', 'We are looking for 3 interns with 2 years experience.', null);
money('team-size trap', 'Join a team of 500 engineers across 12 offices.', null);
money('rounds trap', 'Salary discussed after 2 rounds of interviews.', null);
money('duration-not-money', 'Requirements: 3 - 6 months availability required.', null);
check('formatted range', formatStipend(extractStipend('Stipend: ₹25,000 - ₹40,000 per month')), '₹25,000 – ₹40,000 / month');
check('formatted null row', formatStipend({ min: null, max: null, currency: null, period: null }), null);
check('formatted undefined', formatStipend(null), null);
// The abbreviation full-stop in "Rs." used to split the line and lose the figure.
money('Rs. mid-sentence', 'The selected intern receives Rs. 20,000 per month. Apply soon.', 20000, 20000, 'INR', 'month');

console.log('\n== company money is not the candidate\'s money ==');
// A live bug: "received more than $410 million in funding" was published as a
// $410,000,000 intern stipend on the public site.
money('funding round', 'To date, Eightfold AI has received more than $410 million in funding and a valuation of over $2B from leading investors', null);
money('annual revenue', 'The company crossed $50 million in annual revenue last year.', null);
money('series round', 'We raised $120 million in our Series C round.', null);
money('assets under mgmt', 'The fund manages Rs 12,000 crore in assets under management.', null);
money('transaction volume', 'Our platform processed Rs 5,00,00,000 in transactions last month.', null);
money('market cap', 'A market cap of $2 billion.', null);
// A currency symbol with neither a compensation word nor a period is not pay.
money('bare figure, no period', 'The office is a $30 million campus.', null);
// ...but a period alone is enough, even without the word "stipend".
money('period without keyword', 'The selected intern receives Rs 20,000 per month.', 20000, 20000, 'INR', 'month');

console.log('\n== duration ==');
check('6 months', extractDuration('This is a 6 months internship'), '6 months internship');
check('range', extractDuration('Duration: 3-6 months'), '3-6 months');
check('summer', extractDuration('Summer 2026 internship program'), 'Summer 2026');
check('none', extractDuration('Great opportunity to learn.'), null);

console.log('\n== skills ==');
check('typical', extractSkills('Requirements: Python, React, AWS, and knowledge of Docker. C++ a plus. Experience with PyTorch.'),
  ['python', 'c++', 'react', 'aws', 'docker', 'pytorch']);
check('cicd', extractSkills('You will work on CI/CD pipelines using Node.js and .NET'), ['node.js', '.net', 'ci/cd']);
check('golang', extractSkills('We use Golang and Kubernetes'), ['golang', 'kubernetes']);
check('no false go', extractSkills('Ready to go? R&D team is hiring.'), []);
check('spring boot dedupe', extractSkills('Built with Spring Boot'), ['spring boot']);

console.log('\n== workplace ==');
check('hybrid', extractWorkplaceType('Bengaluru, India (Hybrid)'), 'Hybrid');
check('remote', extractWorkplaceType('Remote - India'), 'Remote');
check('onsite', extractWorkplaceType('On-site in Mumbai'), 'On-site');
check('none', extractWorkplaceType('Bengaluru, Karnataka'), null);

console.log('\n== relative time ==');
const now = Date.parse('2026-07-25T12:00:00Z');
check('2 hours', parseRelativeTime('2 hours ago', now), now - 7200000);
check('45 min', parseRelativeTime('45 minutes ago', now), now - 2700000);
check('just now', parseRelativeTime('Just now', now), now);
check('3 days', parseRelativeTime('3 days ago', now), now - 259200000);
check('reposted', parseRelativeTime('Reposted 5 hours ago', now), now - 18000000);
check('1 week', parseRelativeTime('1 week ago', now), now - 604800000);
check('unparseable', parseRelativeTime('Posted recently', now), null);
check('null', parseRelativeTime(null, now), null);

console.log('\n== job id from url ==');
check('view url', jobIdFromUrl('https://www.linkedin.com/jobs/view/software-engineer-intern-at-stripe-4123456789'), '4123456789');
check('currentJobId', jobIdFromUrl('https://www.linkedin.com/jobs/search/?currentJobId=4123456789&keywords=intern'), '4123456789');
check('plain id', jobIdFromUrl('4123456789'), '4123456789');
check('no id', jobIdFromUrl('https://www.linkedin.com/feed/'), null);

console.log('\n== company matching ==');
const watchlist = [
  { display: 'Google', term: normaliseCompany('Google') },
  { display: 'Google', term: normaliseCompany('YouTube') },
  { display: 'Razorpay', term: normaliseCompany('Razorpay') },
  { display: 'Stripe', term: normaliseCompany('Stripe') },
  { display: 'Microsoft', term: normaliseCompany('Microsoft') },
];
check('exact', matchCompany('Google', watchlist), 'Google');
check('legal suffix', matchCompany('Razorpay Software Private Limited', watchlist), 'Razorpay');
check('alias maps to parent', matchCompany('YouTube', watchlist), 'Google');
check('india suffix', matchCompany('Google India Pvt Ltd', watchlist), 'Google');
check('stripe payments', matchCompany('Stripe Payments India', watchlist), 'Stripe');
check('no match', matchCompany('Some Random Startup', watchlist), null);
check('empty', matchCompany('', watchlist), null);
check('null', matchCompany(null, watchlist), null);
check('normalise pvt', normaliseCompany('Razorpay Software Pvt. Ltd.'), 'razorpay');
check('normalise tech', normaliseCompany('Zomato Technologies India'), 'zomato');

console.log('\n== title matching ==');
const terms = ['intern', 'internship', 'trainee', 'co-op', 'summer analyst'];
check('intern', matchTitle('Software Engineer Intern', terms), true);
check('interns plural', matchTitle('Backend Interns Wanted', terms), true);
check('internship', matchTitle('Summer Internship - Backend', terms), true);
check('trainee', matchTitle('Graduate Trainee Engineer', terms), true);
check('two words', matchTitle('Summer Analyst Program', terms), true);
check('full time rejected', matchTitle('Senior Software Engineer', terms), false);
check('International NOT intern', matchTitle('International Sales Manager', terms), false);
check('Internal NOT intern', matchTitle('Internal Audit Manager', terms), false);
check('disabled passes all', matchTitle('Senior Software Engineer', []), true);

console.log('\n== adaptive lookback window ==');
{
  const f = { adaptiveWindow: true, minWindowHours: 3, maxWindowHours: 36, postedWithinHours: 30 };
  const now = Date.parse('2026-07-26T12:00:00Z');
  const ago = (h) => now - h * 3600000;
  check('hourly run floors at min', resolveWindowHours(ago(1), f, now), 3);
  check('half-hour gap floors too', resolveWindowHours(ago(0.5), f, now), 3);
  check('2h gap -> 4h', resolveWindowHours(ago(2), f, now), 4);
  check('9h overnight -> 11h', resolveWindowHours(ago(9), f, now), 11);
  check('60h gap caps at max', resolveWindowHours(ago(60), f, now), 36);
  check('no previous run -> max', resolveWindowHours(null, f, now), 36);
  // A future timestamp (clock skew, restored backup) must never yield a
  // negative or tiny window that would silently drop everything.
  check('future timestamp -> max', resolveWindowHours(now + 9e6, f, now), 36);
  check('adaptive off uses fixed', resolveWindowHours(ago(1), { ...f, adaptiveWindow: false }, now), 30);
  check('adaptive off, no fixed set', resolveWindowHours(ago(1), { adaptiveWindow: false }, now), 24);
}

console.log('\n== offline summary ==');
const desc = `About us
We are a fast growing company.
Google is an equal opportunity employer and considers all applicants without regard to race.
Responsibilities: You will build and ship backend services that power our payments platform at scale.
Requirements: Currently pursuing a B.Tech degree, graduating in 2027, with strong knowledge of data structures and algorithms.
Stipend: ₹80,000 per month for a 6 month internship based in Bengaluru.
Follow us on Twitter for updates.
Apply by 15 August 2026.`;
const summary = offlineSummary(desc);
console.log(`  ${summary}`);
check('drops EEO boilerplate', /equal opportunity/.test(summary), false);
check('drops "we are a fast growing"', /fast growing/.test(summary), false);
check('keeps stipend', /80,000/.test(summary), true);
check('keeps deadline', /15 August/.test(summary), true);
check('keeps requirements', /B\.Tech/.test(summary), true);
check('empty description', offlineSummary(''), null);
check('null description', offlineSummary(null), null);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
