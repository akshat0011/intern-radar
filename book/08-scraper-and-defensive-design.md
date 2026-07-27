# Chapter 8 — The Scraper: Playwright and Defensive Design

> By the end you can explain how this project reads LinkedIn with a real browser, why it deliberately acts slowly, how it detects a block and stops, and how to write software that depends on a system you do not control.

**New words:** scraping, API, Terms of Service, browser automation, Playwright, headless, headed, persistent profile, cookie, selector, virtualised list, CAPTCHA, rate limit, fail-fast, idempotent.

---

## 8.1 What scraping is, and why anyone does it

An **API** (Application Programming Interface) is a front door a company builds on purpose: a fixed address you send a request to, and a tidy, stable answer comes back — usually **JSON**, text laid out as labelled fields, like `{"title": "Data Intern"}`. Chapter 7, *APIs, REST, and Talking to a Language Model*, shows this project using one to talk to Google's Gemini.

**Scraping** is the opposite arrangement. There is no front door, so you load the page a human would load and pull facts out of its **HTML** — the tags that describe a page's structure, like `<li>` for a list item. Scraping means reading data out of a document designed for eyes, not for programs.

Think of the college notice board. If the office emailed you a clean timetable every morning, that is an API. If you walk to the board and copy room numbers into your notebook, that is scraping. Only one of them survives the office reprinting the sheet in a new layout.

Why scrape here? LinkedIn's job-search APIs are sold to partners and recruiting products, not given to a student who wants to know when Google posts an internship. The data is visible to any signed-in member on `linkedin.com/jobs`. There is no door to knock on, so the watcher reads the page. The costs are real, and the rest of the chapter is about paying them: **fragility** (their HTML changes with no warning), **slowness** (a real browser is thousands of times more expensive than an API call), and **legitimacy** (an API comes with permission; scraping does not).

---

## 8.2 The honest picture: this is against LinkedIn's Terms

Say this plainly. A hedge sounds worse than the truth.

**Terms of Service** are the contract you accept when you make an account. LinkedIn's User Agreement forbids using bots or other automated means to access the service and to copy data. This project signs into a real account and drives a browser through job search. **It breaks the Terms of Service.** There is no reading of the rules where it does not.

Separate two questions people confuse. *Is it a crime?* Different question. US courts, in the long-running *hiQ Labs v. LinkedIn* case, were sceptical that scraping **public** pages violates the Computer Fraud and Abuse Act — a computer-intrusion law — but hiQ still lost on the contract claim. This project uses a signed-in session, not the public surface, so the contract clearly applies. *Is it a Terms violation?* Yes. The realistic consequence is not police; it is LinkedIn restricting the author's own real account. The person taking the risk is the person who wrote the tool.

What the project does about it, all visible in code:

1. **Human-like pacing** (`src/human.js`) — delays, stepped mouse movement, small scroll increments. Low volume, spread out.
2. **A real, logged-in profile — the author's own** (`src/browser.js`). No fake accounts, no bought accounts, no stolen cookies. It reads exactly what its owner could read by hand.
3. **Modest volume.** Twice a day, one watchlist, one person. Not a crawl of the site.
4. **No republishing of the employer's text.** Descriptions are stored locally for classification, then stripped by `src/publish.js` before publishing. The public site shows facts about a posting — title, company, stipend, link — not the employer's copyrighted paragraphs.
5. **When LinkedIn pushes back, the tool stops.** It does not solve CAPTCHAs and does not retry harder. Section 8.5 is that machinery.

Then the sentence that must follow: **mitigation is not permission.** Politeness does not convert a violation into an allowed use. It reduces harm and reduces the chance of a ban, which is worth doing. The honest summary is: *I know this breaks their terms; I took the risk knowingly, on my own account, at low volume, and designed the tool to stop rather than fight. Building this for many users would need a licensed data source, because this design does not scale and should not.*

---

## 8.3 Driving a real browser

**Browser automation** is a program controlling a real web browser — opening pages, clicking, reading what rendered. **Playwright** is the library that does it here, and `playwright-core` is the project's only npm dependency.

Why a whole browser? Node can download a URL in one line, but LinkedIn's job list is not in the downloaded HTML. The page arrives nearly empty and JavaScript running *inside the browser* fetches the jobs and builds the list. Downloading the file gets you the envelope, not the letter.

Playwright talks to the browser over the debugging protocol that also powers developer tools. Your Node program says "navigate here", "give me that element's text", "move the mouse to (412, 300)". Every call is **asynchronous** — it returns a promise, a placeholder for a value that arrives later — which is why nearly every line below has `await` in front of it. Chapter 4, *JavaScript, and Why Async Is Hard*, covers that.

### Headless versus headed

**Headless** means the browser runs with no visible window: same engine, no pixels. It is faster and is the default for most automation. **Headed** means a real window opens on a real screen. This project refuses headless in code:

```js
if (cfg.browser.headed === false) {
  // Headless leaks "HeadlessChrome" in the user agent and collapses the
  // screen to 800x600 — both trivially detectable.
  throw new Error('browser.headed must stay true. Headless mode is detectable and will get the account flagged.');
}
```
— `src/browser.js:88`

The **user agent** is the string a browser sends identifying itself; headless Chromium historically puts `HeadlessChrome` in it. And the screen size JavaScript reports collapses to defaults no real laptop has. A site checking for automation looks at exactly these. Note the shape of the guard: it does not silently correct a bad config, it throws.

### The user's real Brave, and a persistent profile

```js
export const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
```
— `src/browser.js:8`

That is the actual installed application. Playwright can ship its own Chromium, but a real installed browser is a more ordinary thing to be. The file explains why it still cannot drive your *everyday* Brave: Chromium 136+ refuses remote debugging on the default user-data directory, and an already-open Brave holds the profile lock, so a second launch just relays and exits.

So the tool keeps its own **profile** — the folder where a browser stores cookies, history and settings. A **cookie** is a small piece of data a site asks the browser to store and send back later; a login cookie is how a site remembers you. **Persistent** means the folder survives between runs.

```js
mkdirSync(PATHS.profile, { recursive: true });
const firstEver = !existsSync(join(PATHS.profile, 'Default'));

if (!forLogin && firstEver) {
  throw new Error('No LinkedIn session yet. Run `npm run login` once to sign in.');
}
```
— `src/browser.js:94`

This is the security decision worth memorising. **The project never stores your password and never types one.** You run `npm run login` once, a window opens, *you* sign in by hand — including two-factor codes no script could handle — and Brave writes the session cookie into that folder. Every later run reuses it. The tool's only secret is a cookie on your own disk, exactly like the browser you use daily.

### The launch options

```js
const context = await chromium.launchPersistentContext(PATHS.profile, {
  executablePath: BRAVE_PATH,
  headless: false,
  viewport: null,
  args: braveArgs(cfg),
  chromiumSandbox: true,
});
```
— `src/browser.js:108`

`executablePath` uses the installed Brave. `viewport: null` stops Playwright faking a page size — the **viewport** is the visible page area, and if Playwright sets it independently, the CSS viewport and the real window disagree, giving an `outerWidth`/`innerWidth` mismatch no genuine browser has. `chromiumSandbox: true` overrides Playwright's default `--no-sandbox`, which would make Brave show a yellow "unsupported command-line flag" banner on every page.

Window size therefore comes through as a Chromium **command-line argument** — a flag passed at startup:

```js
`--window-size=${w},${h}`,
`--window-position=${x},${y}`,
'--disable-blink-features=AutomationControlled',
```
— `src/browser.js:26`

The third is the only masking flag in the file. Without it, `navigator.webdriver` — readable by any page in one line — is `true` even with a real binary, real profile and real window. The flag clears it inside Blink, the rendering engine, leaving no JavaScript artifact.

What is *absent* matters as much. No spoofed user agent, no fake timezone, no fingerprint script:

```js
// No fingerprint-spoofing init script here, deliberately. What keeps this
// account safe is low volume and honest pacing, not pretending to be a
// different browser. If LinkedIn challenges the session, the tool stops and
// asks you — see src/guard.js.
```
— `src/browser.js:122`

On the user's own machine the natural values are correct *by definition*. Overriding locale or timezone can only create a mismatch between JavaScript values, HTTP headers and the IP address's real geography — and mismatches are what detection looks for. Lying badly is worse than not lying.

Three helpers finish the file. `restoreFocus()` (`src/browser.js:72`) hands keyboard focus back to whatever app you were using, since Chromium always steals it at launch. `focusBrave()` (`:150`) does the reverse when a CAPTCHA needs a human. `hasLinkedInSession()` (`:160`) answers "are we signed in?" by finding the `li_at` cookie and checking it has not expired.

---

## 8.4 Acting like a person on purpose: `src/human.js`

Here is the idea beginners find hardest: **the program is deliberately made worse.** Slower, less precise, occasionally pointless.

A script is obvious. It clicks the exact centre of an element, waits exactly 1000 ms, never scrolls back to re-read, never drifts the mouse. Detection does not need to catch you doing anything forbidden — only to notice that no human has ever behaved like this. Regularity is the signature. The file says so:

```js
 * The point of this module is not to be undetectable — it is to keep the tool's
 * footprint far below anything LinkedIn would consider abusive, and to make the
 * interaction pattern look like a person reading job posts rather than a script
 * hammering a list.
```
— `src/human.js:1`

### Delays that are not uniform

```js
export function humanDelay(pair) {
  const [min, max] = pair;
  const mid = (max - min) / 2;
  return Math.floor(min + (Math.random() * mid + Math.random() * mid));
}
```
— `src/human.js:27`

`Math.random()` is **uniform**: every value equally likely, so 2.1 seconds is exactly as likely as 5.0. Real reading time clusters around a typical value with rarer extremes. Summing *two* randoms, each over half the range, gives a **triangular** distribution that bunches in the middle. Four lines, no statistics library, and it removes the flat-histogram fingerprint a uniform delay leaves. `pause(pair)` (`:38`) wraps it in a `sleep`, and the ranges live in `config.json`, so pacing is tunable without touching code.

### Mouse paths and clicks

`humanMouseTo` (`src/human.js:47`) passes `steps: rand(6, 14)` to `page.mouse.move`. Playwright's default click teleports the pointer with no intermediate `mousemove` events; real pointers emit a stream of them.

```js
const x = box.x + box.width * (0.3 + Math.random() * 0.4);
const y = box.y + box.height * (0.3 + Math.random() * 0.4);

await humanMouseTo(page, x, y);
await sleep(rand(120, 480));
await page.mouse.down();
await sleep(rand(40, 130));
await page.mouse.up();
```
— `src/human.js:62`

`humanClick` aims at a random point in the middle 40% of the element — never dead centre. Then hover, wait, press, hold, release: a human click decomposed. It returns `false` rather than throwing when the element vanished, because LinkedIn re-renders its list constantly and that is normal, not exceptional.

### Scrolling, which is not optional

```js
const before = el.scrollTop;
el.scrollBy(0, 220 + Math.random() * 260);
// If scrollTop did not move, we have hit the end of the container.
return el.scrollTop === before;
```
— `src/human.js:86`, inside `humanScrollContainer`

This runs inside `page.evaluate`, which executes a function *in the browser* and returns the result — how Node reaches the **DOM**, the live tree of objects the browser builds from HTML.

Scrolling is not only camouflage. LinkedIn's job list is **virtualised**: to stay fast it only creates the rows near where you are looking and destroys the ones you pass. Without scrolling, most cards never exist in the DOM, so there is nothing to read. The bottom-detection is neat too: record `scrollTop`, scroll, check whether it moved. No selector, no guessing at an "end of results" element.

### Fidgeting, and the bug that made a rule

`idleFidget` (`src/human.js:119`) scrolls back up 35% of the time and drifts the mouse to a random point 30% of the time. Both are pointless. Both make the session look like a person half-paying-attention. Its comment records a real incident:

> This is decoration, so it must never be able to fail a run. It once did: a mouse.wheel on a browser that had just crashed threw, and aborted a run that had already collected 51 jobs. Anything purely cosmetic swallows its errors.

Fifty-one jobs lost to a decorative mouse wheel. The rule: **failures should be as loud as the thing that failed is important.** Cosmetic code swallows errors; load-bearing code shouts. `pageAlive` (`:143`) supports that by poking the page with a trivial `evaluate`, so a crash reports as "the browser closed" instead of a confusing message about a wheel event.

### What it costs

All of this makes the run **much** slower — seconds of deliberate waiting per card, up to 900 ms per scroll step, the list walked rather than jumped through. The trade is **latency for survival**. It works only because the data is needed twice a day, not twice a second. If this needed minute-fresh data, the design would be wrong and the honest answer would be "buy a data feed".

---

## 8.5 Knowing when to stop: `src/guard.js`

`human.js` tries to avoid trouble. `guard.js` assumes trouble arrives anyway.

A **CAPTCHA** is a puzzle a site shows to check you are human. A **rate limit** is a site refusing further requests because you made too many. Both mean stop. The instinct — wait a bit, retry harder — is exactly wrong. Retrying through a block turns a warning into a ban.

### The state machine

A **state machine** is a design where the system is always in exactly one named state. Here there are five:

```js
export const State = {
  OK: 'ok',
  CHALLENGE: 'challenge',
  LOGGED_OUT: 'logged_out',
  RATE_LIMITED: 'rate_limited',
  SOFT_BLOCK: 'soft_block',
};
```
— `src/guard.js:11`

Its comment states the policy: anything other than OK means stop touching LinkedIn and either ask the human or end the run — never push through. `RunAborted` (`:19`) is a custom error carrying the state, so the orchestrator in `src/index.js` can tell "you got logged out" from "a database write failed".

### Reading the page for evidence

`classify(page)` (`src/guard.js:99`) is cheap and side-effect free, and runs after every navigation. It checks three things, cheapest first.

**One: the URL.** A **regular expression** is a pattern for matching text; `/\/authwall/i` matches those letters anywhere, ignoring capitals.

```js
const URL_MARKERS = [
  [/\/checkpoint\/challenge/i, State.CHALLENGE],
  [/\/authwall/i, State.LOGGED_OUT],
  [/\/error\/429/i, State.RATE_LIMITED],
];
```
— condensed from `src/guard.js:27`

**Two: a visible CAPTCHA frame.** `visibleChallengeFrame` (`:74`) is the subtlest function here, because the obvious version was wrong. An **iframe** is a page embedded in another page, and LinkedIn puts an invisible reCAPTCHA Enterprise frame on ordinary pages — the feed included — to score traffic passively. So "is a CAPTCHA iframe present?" is true on healthy pages, and the naive check halted every run before it started. Two rules fix it: reCAPTCHA's `anchor` frame is the passive scorer and only `bframe` is a real puzzle, and the frame must be rendered at human-visible size — over 100×100 pixels, not `display:none`, not near-transparent.

**Three: the page text**, with a guard against itself:

```js
probe = await page.evaluate(() => ({
  text: document.body?.innerText?.slice(0, 4000) ?? '',
  signedIn: !!document.querySelector(
    '.global-nav__me, .global-nav__me-photo, img.global-nav__me-photo, [data-control-name="nav.settings"], .global-nav__primary-items',
  ),
}));
```
— `src/guard.js:118`

Only 4,000 characters, enough for banners without dragging a megabyte of feed text back on every check. And it records whether the signed-in navigation bar is rendered, because:

```js
if (state === State.LOGGED_OUT && probe.signedIn) continue;
```
— `src/guard.js:136`

Feed posts routinely contain "sign in to see". Without this line, someone else's post cancels your run. Structure beats content. The same lesson sits in the marker list: there is deliberately no bare `/captcha/` pattern, because the word appears in ordinary posts and once halted a run on a perfectly healthy page (`src/guard.js:48`). Both notes record **false positives** — the detector firing when nothing was wrong. A jumpy detector gets switched off, and a switched-off detector protects nothing.

### What happens in each state

`ensureHealthy` (`src/guard.js:220`) is the function the rest of the codebase calls. It returns normally when it is safe to continue and throws `RunAborted` otherwise.

- **OK** — return.
- **CHALLENGE** — `waitForHuman`: screenshot, log, bring Brave to the front, fire a macOS notification with sound, put up a dialog. Then poll every 5 seconds for up to 12 minutes, re-running `classify`. If it goes OK, the human solved it — log, notify, resume. If nobody solves it, abort the run. **The tool never attempts to solve or bypass the challenge itself** (`:160`).
- **LOGGED_OUT** — screenshot, notify "run `npm run login`", abort. No attempt to sign in.
- **RATE_LIMITED** — screenshot, notify suggesting higher pacing values in `config.json`, abort immediately.

That CHALLENGE path is the correct division of labour: the program does the boring part, the person does the part that requires being a person.

### Two guards against silent wrongness

```js
/**
 * Confirm the session is actually signed in.
 *
 * This is not redundant with `classify`. LinkedIn will happily serve a *public*
 * job-search page to a signed-out visitor — it looks healthy, it has job cards,
 * and nothing in the URL or page text says "logged out". Scraping that would
 * quietly produce worse results from a different surface, and poison the
 * database with them. The session cookie is the honest signal.
 */
```
— `src/guard.js:264`

`assertSignedIn` checks the `li_at` cookie *and* corroborates with the DOM: signed-in pages have a "Me" menu, guest pages have join and sign-in buttons. Failing here is not "the page broke" — it is "the page worked and gave you the wrong data". Those bugs live in a database for months.

```js
if (emptyState) {
  log.info(`LinkedIn reports genuinely no results for "${searchLabel}" page ${pageIndex}.`);
  return;
}

throw new Error(
  `Job list rendered 0 cards for "${searchLabel}" page ${pageIndex}, and LinkedIn did not show a ` +
  `"no results" message. This usually means LinkedIn changed its markup and the card selectors need updating.`
);
```
— condensed from `src/guard.js:308`, `assertListRendered`

Zero jobs is ambiguous: either no internships were posted today, or LinkedIn renamed a class and every selector missed. Both produce 0. So the function demands positive evidence of emptiness — LinkedIn's own "no results" message — before believing it, and otherwise throws an error naming the likely cause and pointing at a screenshot. Without this, a broken scraper looks exactly like a quiet job market, and you find out weeks later.

---

## 8.6 Someone else's HTML: `src/linkedin.js`

### Building a search URL

A **URL** can carry a **query string** — the part after `?`, made of `name=value` pairs joined by `&`. LinkedIn's job search is driven almost entirely by these.

```js
if (search.companyIds?.length) {
  params.set('f_C', search.companyIds.join(','));
  if (search.keywords) params.set('keywords', search.keywords);
} else {
  params.set('keywords', search.keywords ?? '');
}
...
const seconds = Math.round((filters.postedWithinHours ?? 24) * 3600);
params.set('f_TPR', `r${seconds}`);
params.set('sortBy', filters.sortBy === 'relevance' ? 'R' : 'DD');
...
if (start > 0) params.set('start', String(start));

return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
```
— condensed from `buildSearchUrl`, `src/linkedin.js:46`

`URLSearchParams` is built into Node and escapes values correctly, so a location of "New Delhi, India" does not break the URL. Gluing strings by hand is how you get a bug the first time a company name contains an ampersand.

The parameters: `f_C` is company IDs — and when present, **no keyword is added**, because `f_C` already restricts results to those employers and a keyword could only drop postings that happen not to contain the word. `f_TPR=r86400` means posted within the last 86,400 seconds. `sortBy=DD` is date-descending (`R` would be relevance). `f_JT=I` is job type internship. `start` pages in steps of 25 (`RESULTS_PER_PAGE`, `:16`).

The design note is the quotable one: combining a tight keyword with `f_TPR` and `sortBy=DD` **keeps the page count low, and therefore the request count low.** A lazier design fetches everything and filters in Node — more pages, more requests, more exposure. These parameter names are also undocumented. Nobody promised `f_TPR` exists next year.

### Finding the cards

A **selector** is a string describing which elements you want; `.jobs-search-results-list` means "elements with that CSS class". `LIST_CONTAINERS` (`src/linkedin.js:19`) lists five candidates, best first. If all five miss, `enumerateCards` stops trusting class names and reasons from structure:

```js
const links = [...document.querySelectorAll('a[href*="/jobs/view/"]')];
// ...walk up each link's ancestors to the nearest scrollable box, and count.
best.setAttribute('data-watcher-list', '1');
return '[data-watcher-list="1"]';
```
— condensed from `src/linkedin.js:141`

Whichever scrollable box holds the most job links *is* the list, whatever it is called. It then tags that element with its own attribute so the caller has something stable to scroll. The pattern: **specific and fast first, general and slow as a backstop.** Class names change often; "the scrollable thing containing the most job links" changes only in a redesign.

The same ladder repeats for the cards:

```js
let cards = [...document.querySelectorAll('li[data-occludable-job-id], li[data-job-id]')];
if (cards.length === 0) cards = [...document.querySelectorAll('[data-job-id]')];
if (cards.length === 0) {
  const seen = new Set();
  cards = [...document.querySelectorAll('a[href*="/jobs/view/"]')]
    .map((a) => a.closest('li') ?? a.closest('[class*="job-card"]') ?? a.parentElement)
    .filter((el) => el && !seen.has(el) && seen.add(el));
}
```
— `src/linkedin.js:194`

Data attributes first: `data-job-id` is functional markup, less fashion-driven than a class name. The `<li>` wrappers are matched *before* a bare `[data-job-id]`, because the loose version also matches an element nested inside each card and yields every job twice.

Each field follows the same shape. The title tries a nested `<strong>`, then class names, then the link's `aria-label` — an accessibility label, more stable than styling because screen readers depend on it — then the link text (`:217`). If company and location are still empty, it falls back to text heuristics: split the card into lines, drop metadata lines like "2 hours ago" and "Easy Apply", take what remains in order, and prefer a line with a comma or "remote"/"hybrid" for the location (`:233`). Finally, cards without a `jobId` and repeated `jobId`s are dropped (`:280`), because the virtualised list makes duplicates normal.

Ladders reduce the blast radius: three strategies must fail together before a field goes empty. No ladder makes this stable — LinkedIn rotates class names, ships redesigns, and A/B tests, so two people can get different HTML on the same day. You cannot prevent breakage. `assertListRendered` guarantees you find out the day it happens.

---

## 8.7 The general lesson: building on ground you do not own

Strip out LinkedIn and this is a problem every engineer has: a payment provider, a college results page, a partner's API. Five principles, all visible above.

**1. Fallbacks, ordered.** Try the cheap specific thing, then a structural thing, then a heuristic. `LIST_CONTAINERS` before ancestor-counting; `data-job-id` before `aria-label` before text lines. The same shape is the best decision in the codebase, from Chapter 7: every Gemini call has an offline fallback that runs *first*, so the program never depends on an API being up.

**2. Guards on the boundary.** Never trust that a call worked because it did not throw. `assertSignedIn` catches a page that renders perfectly and is the wrong page; `assertListRendered` catches a zero that means "broken", not "empty". The most dangerous failure is a success that is quietly false.

**3. Fail fast, fail loud.** When the world says stop, stop. `ensureHealthy` throws rather than retrying. A half-finished run is recoverable; a banned account is not. Loud matters as much as fast: a screenshot on disk, an error naming the probable cause, a notification. Like the mess queue — if the counter is closed you leave and come back, you do not stand there pushing the shutter.

**4. Idempotency.** An operation is **idempotent** if doing it twice leaves the same result as doing it once. This run is: jobs are keyed by LinkedIn's job id, duplicates are dropped in `enumerateCards`, and the store (Chapter 6, *Remembering Things: SQLite and the Store*) recognises jobs it has seen. That is what makes aborting cheap. If a half-finished run corrupted the database you would be tempted to push through a block to "finish properly" — and that temptation is how accounts die. Idempotency buys you the right to give up.

**5. Never assume the page is what you saw yesterday.** Not the HTML, not the URL parameters, not the flow. Write assumptions down in comments — this codebase does, constantly — and put a tripwire on each one.

And a sixth, not technical: **know what you are doing and to whom.** This project reads someone else's site against their terms, and handles that by staying small, staying slow, stopping when told, and not republishing what is not its to give away. That is not permission. It is the difference between a considered risk and a careless one.

---

## Chapter summary

- Scraping means reading data out of a page built for humans, and you do it when no API — a front door the site built on purpose — gives you what you need.
- Scraping LinkedIn while signed in breaks their Terms of Service; the project mitigates the harm but the violation remains, and the realistic consequence is the author's own account being restricted.
- The project drives the user's real Brave in a headed window, because headless browsers leak `HeadlessChrome` in the user agent and an 800×600 screen size, both trivially detectable.
- No password is ever stored: you sign in once by hand via `npm run login`, and the session cookie lives in a persistent profile folder on your own disk.
- `src/human.js` deliberately makes the program slower and less precise — triangular delays, stepped mouse paths, off-centre clicks, random fidgeting — because perfect regularity is itself the fingerprint.
- Scrolling is not only camouflage: LinkedIn's list is virtualised, so cards do not exist in the DOM until you scroll near them.
- `src/guard.js` classifies every page into one of five states and aborts on anything but OK, waking the human for a CAPTCHA and never trying to solve one itself.
- The subtlest guards catch *silent* failure: `assertSignedIn` rejects the public job page that looks healthy but is the wrong surface, and `assertListRendered` distinguishes "no jobs today" from "the selectors broke".
- `buildSearchUrl` pushes filtering onto LinkedIn's own parameters (`f_TPR`, `sortBy=DD`, `f_JT=I`) so fewer pages, and therefore fewer requests, are needed.
- `enumerateCards` reads every field through a ladder — data attributes, then ARIA, then text heuristics — because selectors built on someone else's class names are permanently fragile.

## Key takeaways

Software that depends on a system you do not control needs a different posture from software that owns its own data: assume the interface changes without notice, and put a tripwire on every assumption so breakage announces itself instead of silently producing wrong answers. The most valuable failure mode is loud and early; the most expensive is a run that "succeeds" against the wrong page and poisons a database for months. Deliberately behaving slowly and imperfectly is a legitimate engineering choice when the cost is latency you do not need and the benefit is not getting banned. And when you build on someone else's terms, the mature position is to name the violation, minimise the harm, and design the tool to stop when told to.

## Interview questions

**1. What is web scraping, and how is it different from using an API?**
An API is an interface a provider builds deliberately: a documented address, a stable contract, structured data like JSON coming back. Scraping means no such interface exists, so you load the page a human would load and pull data out of its HTML. The difference that matters is the contract — an API is usually versioned and its changes are announced, while a scraped page can change any Tuesday with no warning. Scraping is also far more expensive per record, because you render a whole page to get a few fields. You scrape when the data is visible to you but no API exposes it, and you accept that you have signed up for permanent maintenance.

**2. Why drive a real browser instead of just fetching the HTML in Node?**
Because the job list is not in the downloaded HTML. LinkedIn ships a nearly empty document and JavaScript in the browser fetches and renders the results, so a plain `fetch` gets the shell, not the data. A browser also carries the session cookies that unlock the signed-in surface, handles redirects the way a real client does, and produces an ordinary network fingerprint. The cost is enormous — hundreds of megabytes of browser, seconds per page instead of milliseconds. For a run that happens twice a day that cost is irrelevant; for a high-volume crawler it would not be, and you would reverse-engineer internal endpoints instead, which is both more fragile and a bigger provocation.

**3. Isn't scraping LinkedIn against their Terms of Service?**
Yes, and I won't pretend otherwise. Their User Agreement prohibits automated access and automated copying of data, and this project signs into a real account and drives a browser through job search, so it plainly breaks that term. What I did was bound the harm: my own account rather than a fake one, no stored password, twice-daily runs at low volume, human-like pacing so I am never a load problem, and I strip the employers' description text before publishing because it is their copyrighted writing. When LinkedIn challenges the session, the tool stops and asks me rather than solving the CAPTCHA. But mitigation is not permission — the realistic downside is my own account being restricted, and I took that risk knowingly. If this were a product with real users, this design would be wrong and I would need a licensed data source.

**4. People cite hiQ v. LinkedIn as proof scraping is legal. Is that a defence here?**
No, and I would be careful with that argument. The hiQ litigation was mostly about whether scraping *public* pages is unauthorised access under the Computer Fraud and Abuse Act, a computer-intrusion statute — and hiQ still lost the breach-of-contract side. "Not a federal crime" does not mean "not a Terms violation"; they are separate questions. My project is not even on the public surface, since it uses a logged-in session, so the User Agreement I personally accepted clearly applies. The correct framing is that I am breaching a contract I agreed to, at low volume, with the consequence falling on me. Citing a case about a different question would be a way of dodging that.

**5. Headless versus headed — what's the difference, and why refuse headless?**
Headless means the browser engine runs with no visible window; headed means a real window on a real screen. Headless is faster, works on servers, and is the normal automation default. This project refuses it because headless is easy to spot: the user agent historically contains `HeadlessChrome`, and screen dimensions collapse to defaults no real laptop reports. `src/browser.js:88` actively throws if the config sets `headed: false` rather than silently accepting it. The cost is that runs need a machine with a real desktop session, which ties the whole project to the author's Mac being awake — one of its genuine weaknesses.

**6. Isn't `human.js` cargo-cult superstition? Can you prove it works?**
Partly it is unfalsifiable from outside, and I would not claim each individual behaviour changes LinkedIn's scoring — the file's own header says the goal is not to be undetectable. What I can defend is the mechanism: detection looks for regularity, and a script that waits exactly one second, clicks exact centres and never backtracks is regular in a way no person is. `humanDelay` sums two uniform randoms for a triangular distribution because even the *shape* of a uniform delay is a signature. The stronger half is volume: multi-second pauses cap how many requests I can make, keeping me far below anything abusive. And one piece is not camouflage at all — the scrolling is functionally required, because the list is virtualised and unscrolled cards do not exist in the DOM.

**7. So what does the slowness actually cost you?**
A run takes far longer than the work requires — minutes of deliberate waiting for data a machine could pull in seconds. That is acceptable only because the data is needed twice a day; if I needed minute-fresh data the design would be wrong. There is a subtler cost too: a longer run gives the Mac more chance to sleep, the network more chance to drop, and LinkedIn more chance to re-render mid-walk, so slowness slightly raises the odds a run dies partway. That is survivable because the run is idempotent — jobs are keyed by LinkedIn's job id and duplicates are dropped — so re-running costs nothing but time.

**8. Walk me through what happens when LinkedIn changes its HTML tomorrow.**
The ladders absorb small changes first: `enumerateCards` tries `<li>` data attributes, then a looser `[data-job-id]`, then walks up from every `/jobs/view/` link, and each field has its own fallback chain down to text heuristics. If a redesign defeats all of them, the card count hits zero — and that is where `assertListRendered` earns its place. It checks whether LinkedIn printed a genuine "no results" message; if not, it saves a screenshot and throws an error naming the likely cause. So the failure mode is a loud error the same day with evidence attached, not a database that quietly stops filling. I cannot prevent breakage, but I can guarantee I learn about it immediately.

**9. Why is `assertSignedIn` not redundant with `classify`?**
Because LinkedIn will serve a public, signed-out job-search page that looks completely healthy — normal URL, no logged-out text, real job cards on screen. `classify` would return OK. But it is a different surface with worse results, and scraping it puts subtly wrong data into the database, which is far more expensive than a crash. So `assertSignedIn` checks the honest signal, the `li_at` session cookie and its expiry, and corroborates with the DOM: signed-in pages have the "Me" menu, guest pages have join and sign-in buttons. It guards against succeeding at the wrong thing, which is the failure class I worry about most.

**10. Why does `idleFidget` swallow every error while `ensureHealthy` throws?**
Because the two pieces carry different weight. `idleFidget` is decoration — a stray scroll, a mouse drift — and its failure tells you nothing the next real action will not. It once did throw: a `mouse.wheel` on a browser that had just crashed aborted a run holding 51 already-collected jobs, and that incident is the comment above the function today. `ensureHealthy` is the opposite: it decides whether continuing is safe, so it must be able to stop the run, and it throws a typed `RunAborted` carrying the state so the caller can report the real cause. The rule is that an error should be as loud as its code is important; swallowing errors is a deliberate choice for cosmetic code, never a default.

**11. Where are the credentials stored, and what would an attacker with your laptop get?**
Nowhere — the project never sees a password. You run `npm run login` once, a Brave window opens, and you sign in by hand, including any two-factor step. Brave writes the session cookie into the tool's own persistent profile folder, and later runs reuse it, exactly like the browser you use daily. Someone with that folder gets a LinkedIn session cookie, which is genuinely sensitive, but no password and nothing that unlocks other accounts; revoking it means signing that session out. The design also fails safe: if the cookie expires, `assertSignedIn` throws and tells you to run `npm run login` again rather than silently scraping the logged-out surface.

**12. This component can be killed at any moment by a company that owes you nothing. Why build it?**
That is a fair characterisation, and I would not build a business on it. It is worth building here because the cost of breakage is bounded and visible: the guards make failure loud, the run is idempotent so nothing is corrupted, and the site keeps serving the last published JSON regardless — the scraper going down degrades freshness, not availability. The value is also immediate, which matters for a personal tool with a short payback period. If I needed durability, the honest path is a paid job-data provider or employer career-page feeds, and the code is shaped for that swap: everything LinkedIn-specific lives in `src/linkedin.js`, so a new source is a new module producing the same job objects, not a rewrite.

## Common beginner mistakes

**1. Using `fetch` to download the page and wondering where the jobs went.**
The beginner fetches the URL in Node, gets HTML back, and finds no job titles in it. It looks right because the URL is correct and the response is a real page. In fact the content is built by JavaScript after load, so the downloaded file is a shell. The fix is to use something that runs the page, or to find the data request the page itself makes — accepting that undocumented internal endpoints are even more fragile.

**2. Fixed `sleep(1000)` between actions.**
It looks like polite rate limiting, and it does slow you down. But an exactly-one-second gap every time is a cleaner machine signature than no gap at all. Use a random delay, preferably one that clusters like real reading time; `humanDelay` (`src/human.js:27`) gets a triangular distribution in four lines.

**3. Retrying automatically when the page looks blocked.**
The instinct is that retries make software resilient, and for a flaky network they do. Against a rate limit or a security check, a retry loop escalates a warning into a ban. Classify the failure first: retry transient technical errors, and stop dead on anything that is the site deliberately refusing you, which is what `ensureHealthy` does.

**4. Treating zero results as success.**
The scraper returns an empty array, nothing throws, and the run reports "0 new jobs" — a perfectly normal outcome some days. Weeks later you discover the selectors broke on day one. The fix is `assertListRendered` (`src/guard.js:308`): demand positive evidence of emptiness before believing a zero.

**5. Copying a selector straight out of DevTools.**
Right-click, Copy Selector, and you get `div > div:nth-child(3) > span.a7Bq2`. It works immediately, which is why it is tempting, and it breaks on the next deploy because both the generated class name and the exact position are incidental. Prefer data attributes and ARIA labels, and build a ladder of two or three strategies rather than one.

**6. Storing the password in a config file so the script can log in itself.**
It feels like the natural way to automate sign-in and removes a manual step. In practice it puts a plaintext credential on disk, still cannot handle two-factor or a surprise security challenge, and turns any leak of the repository into an account compromise. The fix is this project's: log in once by hand into a persistent profile and let the session cookie work.

## Exercises

1. Read `src/guard.js:39` and pick three entries from `TEXT_MARKERS`. For each, describe in one sentence the LinkedIn page that would produce it and say which `State` it maps to. Then explain in two sentences why there is no bare `/captcha/` pattern.

2. Write a standalone Node script (made-up example, not from the project) that draws 10,000 values from `Math.random()*6+2` and 10,000 from the `humanDelay([2,8])` formula, bins each into six one-second buckets, and prints the counts. Describe the difference in shape in one sentence.

3. Using the real project: double the pacing values in `config.json` and time a run. Report how much longer it took and how many jobs it collected, then argue in a paragraph whether the extra time bought anything you can measure.

4. 🔴 Add a fourth fallback to the card-location ladder in `enumerateCards` (`src/linkedin.js:194`): if all three existing strategies return zero cards, find every element whose `innerText` contains a relative time phrase like "hours ago" and whose subtree contains a `/jobs/view/` link, and use those. Then deliberately break the first three — for instance by renaming the attributes you query — and confirm your fallback still returns cards and that `assertListRendered` never fires.

## Quiz

1. What is the main difference between an API and scraping, in one sentence?
2. Name the two specific things that make a headless browser easy to detect, according to `src/browser.js`.
3. Why does `humanScrollContainer` exist for a reason that has nothing to do with looking human?
4. What does `visibleChallengeFrame` do to avoid firing on every ordinary LinkedIn page?
5. Zero job cards were found. What does `assertListRendered` check before calling this a failure?
6. What does it mean for the run to be idempotent, and why does that make aborting safe?

---

### Quiz answers

1. An API is an interface the provider built on purpose, with a stable documented contract; scraping reads data out of a page designed for human eyes, with no contract and no notice when it changes.
2. The user agent contains `HeadlessChrome`, and the screen collapses to 800×600 — both readable by any page (`src/browser.js:88`).
3. LinkedIn's job list is virtualised: rows near the viewport are created and rows scrolled past are destroyed, so cards you never scroll to do not exist in the DOM at all.
4. Two rules. It ignores reCAPTCHA frames that are not `bframe`, because the always-present `anchor` frame is a passive traffic scorer rather than a puzzle; and it requires the frame to be rendered at a human-visible size — over 100×100 pixels, not hidden, not near-transparent (`src/guard.js:74`).
5. Whether the page contains a genuine "no results" message such as "no matching jobs found". If it does, the zero is real and the run continues; if not, it saves a screenshot and throws an error saying the card selectors probably need updating (`src/guard.js:308`).
6. Idempotent means running it twice leaves the same result as running it once — jobs are keyed by LinkedIn's job id, duplicates are dropped in `enumerateCards`, and the store recognises jobs it has seen. It makes aborting safe because a half-finished run corrupts nothing, so there is never a reason to push through a block just to finish.
