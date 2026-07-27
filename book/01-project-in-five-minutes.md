# Chapter 1 — The Project in Five Minutes

> At the end of this chapter you can stand at a whiteboard and explain what Intern Radar is, draw its architecture, and trace one job posting from LinkedIn to a student's phone — in sixty seconds.

**New words:** server, static site, scraping, JSON, git, commit, push, repository, deploy, Vercel, SQLite, Node.js, npm, dependency, Playwright, API, serverless function, launchd, build step, deduplication.

---

## 1.1 The problem: early beats perfect

An internship posting from a well-known company in India collects hundreds of applicants within a day. Some collect a thousand. Recruiters do not read a thousand applications. They read the first fifty, shortlist from those, and close the posting.

So what decides whether your application is seen is not how good your résumé is. It is what time you applied.

That game is unfair, and also solvable. If you knew within a few hours that Razorpay had posted a Software Engineering Intern role, you would be in the first fifty. The problem is that "knowing" means opening LinkedIn, typing "internship", scrolling, and doing it again tomorrow. Nobody keeps that up for four months.

Intern Radar does the checking. Twice a day it looks at LinkedIn for new internships at a watchlist of about 860 companies with an India presence, pulls out the useful facts — stipend, duration, location, whether it is remote — and puts them on a public website at `internradar.online`. As the README says on line 7: it finds and summarises, you click Apply.

## 1.2 Who it is for

Two people use this project, and they use it differently.

**The author.** He runs the watcher on his own Mac and gets a macOS notification plus a local HTML report when something new appears. His watchlist is the one in `companies.json`.

**Every other student.** They install nothing. They open `internradar.online` on a phone, read the list, filter it, and click through to the LinkedIn posting. They can also upload a résumé and have the site rewrite it to match a specific job.

That split — one operator, many readers — is the reason for the architecture in the next section. Serving a hundred operators, each with their own watchlist and LinkedIn login, would need a completely different design. An interviewer will ask about that.

## 1.3 The thing a beginner misses: this is two programs

Here is the mistake. You hear "a website that shows internships" and picture one program: a **server** — a computer that stays switched on and answers requests from other computers over the internet — holding a database, scraping in the background, and sending pages to visitors.

There is no such computer in this project.

Intern Radar is **two separate programs that share one folder in git and never talk to each other directly.**

```
   PROGRAM 1                                   PROGRAM 2
   The watcher                                 The site
   (author's Mac, twice a day)                 (Vercel, always up)

   +--------------------+                      +--------------------+
   |  Node.js + Brave   |   writes a file      |  static HTML/CSS/JS |
   |  scrapes LinkedIn  | -----------------→   |  reads that file    |
   |  stores in SQLite  |   jobs.json in git   |  shows the list     |
   +--------------------+                      +--------------------+
             |                                            ↑
             |  git push                                  |
             +------------→  GitHub  ------→  Vercel rebuilds
```

They communicate through **one JSON file committed to git**. **JSON** (JavaScript Object Notation) is a plain-text format for structured data — a list of jobs looks like `[{"company":"Razorpay","title":"SDE Intern"}, ...]`. **Git** is a tool that records versions of a folder; a **commit** is one saved version, and a **push** sends your commits to a copy of the folder stored elsewhere, here on GitHub. **Vercel** is a hosting company: you connect it to a GitHub **repository** (a folder git is tracking) and every time you push, it copies the new files onto its own machines around the world and serves them to visitors. That copying-and-going-live step is a **deploy**.

So the watcher's last act is a `git push`. Vercel notices and redeploys. About a minute later, students see new jobs. The two programs never open a connection to each other. The file is the interface.

The README draws it in three lines (README lines 130–132):

```
you run npm start  →  scraper finds jobs  →  writes web/public/data/jobs.json
                   →  commits + pushes    →  Vercel redeploys  →  live in ~1 min
```

Now the detailed version. Read it slowly; it answers most architecture questions you will be asked.

```
 ┌──────────────────────── THE AUTHOR'S MAC ────────────────────────┐
 │                                                                  │
 │  launchd (macOS scheduler)                                       │
 │      │  fires twice a day                                        │
 │      ▼                                                           │
 │  bin/run.sh  →  node src/index.js --scheduled                    │
 │      │                                                           │
 │      │ 1. take a lock, size the lookback window                  │
 │      ▼                                                           │
 │  src/browser.js ── launches REAL Brave (persistent profile,      │
 │      │             already logged in to LinkedIn)                │
 │      ▼                                                           │
 │  src/linkedin.js ─ search URL → scroll → read cards → open job   │
 │      │             src/human.js paces every action like a person │
 │      │             src/guard.js aborts on captcha / rate limit   │
 │      ▼                                                           │
 │  src/extract.js ── stipend, duration, skills, dates (pure text)  │
 │  src/roles.js ──── tech vs non-tech, OFFLINE, free               │
 │      │  only the titles it cannot settle ↓                       │
 │  src/gemini.js ─── one batched call to Google Gemini ──→ (cloud) │
 │      │                                                           │
 │      ▼                                                           │
 │  src/store.js ──── SQLite file: ~/Library/Application Support/   │
 │      │             linkedin-watcher/jobs.db  (every job ever)    │
 │      ▼                                                           │
 │  src/publish.js ── rows → web/public/data/jobs.json              │
 │      │             strips full descriptions (copyright)          │
 │      │             git add / commit / push                       │
 │  src/report.js ─── local HTML report + macOS notification        │
 └──────────────────────────────┬───────────────────────────────────┘
                                │  git push
                                ▼
                        github.com/akshat0011/intern-radar
                                │  webhook: "new commit"
                                ▼
 ┌──────────────────────────── VERCEL ──────────────────────────────┐
 │  deploys web/  (Root Directory = web, framework: null)           │
 │                                                                  │
 │  static files                       one serverless function      │
 │  ├─ index.html                      └─ api/tailor.js             │
 │  ├─ app.js   (825 lines, vanilla)      résumé in → Gemini →      │
 │  ├─ styles.css                          rewritten résumé out     │
 │  ├─ logos/*.png                         (max 60 seconds)         │
 │  └─ data/jobs.json  ← the whole database, as far as the site     │
 └──────────────────────────────┬───────────────────────────────────┘
                                │  HTTPS
                                ▼
                      a student's phone browser
                      fetches jobs.json, renders the list
```

Two facts to hold onto from that picture.

**Fact one: the site cannot do anything `jobs.json` does not already contain.** It has no database connection. If a field is missing from the JSON, no frontend code can conjure it. Every site feature is really a decision made earlier, in `src/publish.js`.

**Fact two: exactly one piece of code on Vercel runs on demand.** That is `web/api/tailor.js`, a **serverless function** — a small program the host runs only when a request arrives, then shuts down, so you never pay for an idle machine. Everything else Vercel serves is a file sitting on disk.

`web/vercel.json` states both facts in configuration:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "headers": [ ... ],
  "functions": {
    "api/tailor.js": {
      "maxDuration": 60
    }
  }
}
```

`"framework": null` (`web/vercel.json:3`) tells Vercel there is no React, no Next.js, no build tool — take the files as they are. `"maxDuration": 60` (`web/vercel.json:21–25`) allows the one function sixty seconds, because asking a language model to rewrite a résumé is slow. The `headers` block, unpacked in Chapter 2, sets caching and browser security rules.

## 1.4 The journey of one job

Follow one posting all the way through. This is what an interviewer is really asking for when they say "walk me through your project".

**Step 0 — the schedule fires.** **launchd** is macOS's built-in scheduler: you describe a job and when to run it, and the operating system starts it for you. (Linux uses cron; macOS prefers launchd, and `bin/install-schedule.sh` registers the job.) It runs `bin/run.sh`, which runs `src/index.js`, whose header comment says exactly this (`src/index.js:1–5`):

```js
#!/usr/bin/env node
/**
 * One scan of LinkedIn for new internships at the watchlist companies.
 * Invoked by launchd at 12:00 and 18:00, or by hand via `npm run`.
 */
```

**Step 1 — the run sets up.** `main()` loads a `.env` file, makes sure the data folders exist, and reads `config.json` (`src/index.js:101–104`):

```js
async function main() {
  loadEnv();
  ensureDirs();
  const cfg = loadConfig();
```

Then it takes a lock and sizes its own lookback window:

```js
  store.setSetting(LOCK_KEY, Date.now());
  store.startRun(runId);

  const lastRun = store.lastCompletedRun();
  cfg.filters.postedWithinHours = resolveWindowHours(lastRun?.started_at ?? null, cfg.filters);
```

Line by line: `setSetting(LOCK_KEY, ...)` writes a timestamp into the database so a second run cannot start while this one is going — two browsers on one profile would corrupt the session. `startRun` records that a run began. `lastCompletedRun()` asks when the last successful run happened, and `resolveWindowHours` turns that gap into a lookback window: a few hours after a normal run, stretching to cover a weekend of sleep, capped at 36 hours. The window is measured, not constant (`src/index.js:181–189`).

**Step 2 — Brave opens.** `src/browser.js` launches Brave, the real browser, using a profile folder that already holds a logged-in LinkedIn session. **Scraping** means reading a website's pages with a program instead of a person. **Playwright** is the library that drives the browser — it clicks, scrolls, and reads the page as a user would. It is the only npm dependency in the project; `package.json:23–25` is the complete list:

```json
  "dependencies": {
    "playwright-core": "^1.56.0"
  }
```

An **npm dependency** is somebody else's code your project downloads and uses. Most Node projects have hundreds.

**Step 3 — search and read the list.** `src/linkedin.js` builds one broad search URL, sorted newest-first, and pages through it until LinkedIn's own "Next" button disappears — the only reliable proof the results are exhausted. The results column is *virtualised*, meaning the page only renders cards near the viewport, so the code scrolls in small steps to force every card into existence, then reads title, company, location and posted-time straight off them. Hundreds of cards are read; almost none are clicked.

**Step 4 — filter, cheapest test first.** The employer is checked before anything else. A posting from a company not on the watchlist is dropped immediately — no title parsing, no classification, no API call. The README explains why (README lines 15–19): checking 860 companies costs nothing extra, because the match happens in memory against cards already on screen. Visiting one page per company would be about 880 page loads a run instead of 10–30, for the same result. Request volume is what gets accounts banned.

**Step 5 — classify the role.** Each surviving job is labelled tech or non-tech. `src/roles.js` does this offline from a vocabulary of title words — free, instant, no network. Only ambiguous titles ("Trainee", "Graduate Engineer Trainee") go to Google's **Gemini** model. An **API** (Application Programming Interface) is a way for one program to ask another a question over the network; here the description goes to Gemini and back comes "tech" or "not tech", plus the phrase that decided it. That phrase joins the offline vocabulary, so the next title containing it never costs a call.

**Step 6 — extract and store.** `src/extract.js` parses stipend, duration, work mode and skills out of the text with plain regular expressions. `src/summarize.js` condenses the description offline. `src/store.js` writes a row into **SQLite** — a database that is a single ordinary file on disk, with no separate server process to run. That is what makes **deduplication** possible: remembering which jobs you have seen, so the same posting is never reported twice.

**Step 7 — publish.** `src/publish.js` turns the rows into `web/public/data/jobs.json`, deliberately stripping full job descriptions, because those are the employer's copyrighted text. Then it commits and pushes. Notice where this happens in `main()` (`src/index.js:667–669`):

```js
  // Push the public job list. Runs even with 0 new jobs so the site drops
  // listings that have aged out of the window.
  if (!DRY_RUN) await publish(store, cfg, newJobs.length);
```

It runs even when nothing new was found. That is not wasted work: the site must also *lose* jobs that have aged out. A publish step that only ran on new data would leave stale listings up forever.

**Step 8 — Vercel.** GitHub tells Vercel a commit arrived. Vercel copies `web/` onto its network and the new `jobs.json` is live in about a minute.

**Step 9 — the student.** They open `internradar.online`. The browser downloads `index.html`, `styles.css` and `app.js`; `app.js` then fetches `data/jobs.json` and builds the list with plain DOM calls. `vercel.json` marks that file `must-revalidate` (`web/vercel.json:14–19`) so a phone never shows yesterday's list from cache.

## 1.5 The folder tour

Four top-level directories. That is the whole project.

**`src/` — the watcher's brain.** Every module here runs on the Mac, never in a browser. The orchestrator is `src/index.js` (680 lines): it owns the run start to finish and calls everything else. You can read the whole architecture from its import block (`src/index.js:6–23`):

```js
import { loadConfig, matchCompany, matchTitle, resolveWindowHours } from './config.js';
import { Store } from './store.js';
import { launchBrave, closeBrave } from './browser.js';
import { ensureHealthy, assertSignedIn, assertListRendered, RunAborted, State } from './guard.js';
import * as li from './linkedin.js';
import { classifyRoles, classifyFromDescriptions } from './gemini.js';
import { classifyRole, needsDescription, builtInPolarity } from './roles.js';
import { pause, sleep, idleFidget, humanDelay, pageAlive } from './human.js';
import { summarize } from './summarize.js';
import { extractStipend, extractDuration, extractSkills, extractWorkplaceType, parseRelativeTime } from './extract.js';
import { buildReport, writeReport } from './report.js';
import { publish } from './publish.js';
```

(Abridged; the real block also imports paths, logging and notifications.) Each name is a job. `guard.js` decides when to stop. `human.js` decides how slowly to move. `roles.js` classifies offline; `gemini.js` classifies online. `publish.js` is the bridge to the other program.

The modules worth knowing:

| File | Lines | Job |
|---|---|---|
| `src/index.js` | 680 | Orchestrator — the whole run, start to finish |
| `src/gemini.js` | 501 | Gemini: classify by title, by description, enrich |
| `src/store.js` | 484 | SQLite layer — schema, migrations, queries |
| `src/linkedin.js` | 472 | Search URLs, paging, opening a job, extracting |
| `src/guard.js` | 327 | Detect blocks, captchas, logouts; abort safely |
| `src/extract.js` | 307 | Pure text parsing: stipend, duration, skills, dates |
| `src/config.js` | 264 | Load and validate config; company and title matching |
| `src/roles.js` | 224 | Offline tech/non-tech classification from a title |
| `src/publish.js` | 194 | Rows → public JSON; git commit and push |
| `src/browser.js` | 166 | Launch and close Brave; detect a live session |
| `src/human.js` | 151 | Human-like delays, mouse paths, scrolling |

Smaller helpers fill the rest: `summarize.js` (offline extractive summary), `logos.js`, `learned.js` (terms Gemini taught the offline classifier), `notify.js` (macOS notifications via AppleScript), `searches.js`, `logger.js`, `paths.js` (every filesystem path, in one place).

**`bin/` — the things a human types.** `login.js` for the one-time LinkedIn sign-in, `show-report.js` for run history, `enrich.js`, `fetch-logos.js`, plus `run.sh`, `install-schedule.sh`, `uninstall-schedule.sh`. No business logic here; these are doors into `src/`.

**`web/` — the second program.** `web/public/` holds what ships to browsers: `index.html` (210 lines of page skeleton), `app.js` (825 lines — the entire browser-side app, vanilla JavaScript), `styles.css` (550 hand-written lines), `logos/`, and `data/jobs.json`. `web/api/tailor.js` (278 lines) is the one serverless function. `web/serve.js` (100 lines) is a local development server on Node's `node:http` module, so you can preview without deploying.

**`test/` — three files** — `extract.test.mjs`, `roles.test.mjs`, `tailor.test.mjs` — using Node's built-in `assert` module and run directly, as `package.json:18` shows:

```json
    "test": "node test/extract.test.mjs && node test/roles.test.mjs && node test/tailor.test.mjs",
```

No Jest, no test-runner configuration. They cover the pure functions — text parsing and classification — where a wrong answer is silent and expensive. There are no automated tests for the browser code. Say so if asked; it is a real gap.

## 1.6 Why this architecture — and what it costs

Every design choice buys something and charges something. Name both.

### What it buys

**Zero cost.** Vercel's Hobby tier hosts static files free. Gemini's free tier does the tailoring. SQLite has no server to rent. The monthly bill is the domain name.

**Nothing to maintain.** No server to patch, no database to back up, no process that can crash at 3 a.m. and take the site down. A static file on a CDN — a **CDN**, or content delivery network, is a fleet of machines around the world that each hold a copy of your files so visitors download from a nearby one — is about as reliable as the internet gets. If the Mac dies tomorrow, the site keeps serving the last published list indefinitely.

**No credentials on a server.** The strongest argument. The LinkedIn session lives in a browser profile on one laptop: never uploaded, never in the repository, never on a rented machine that could be breached. The only secret Vercel holds is a Gemini API key that can spend nothing but a free quota. An always-on scraper in the cloud would need your LinkedIn cookie sitting in a server's environment variables forever.

**No build step.** A **build step** is a program that transforms your source code into something a browser can run — bundling, minifying, compiling TypeScript. This project has none. The `app.js` you edit is byte-for-byte the `app.js` a student downloads. Fix a bug, push, it is live.

**One dependency.** `playwright-core`. Nothing else to audit, update, or have a security advisory filed against.

### What it costs

**The data is only as fresh as the last run.** Twice a day means a job posted at 12:05 waits until the evening run. For a project whose entire premise is "be early", that is the sharpest trade-off in the design, and you should say it out loud before an interviewer does.

**It dies when the Mac sleeps.** launchd fires once shortly after the lid opens and coalesces missed slots into a single run, so a nap costs one run, not many. A powered-off Mac drops the slot entirely. The adaptive lookback window in `src/index.js:188–189` softens this — the next run widens itself to cover the gap — but softening is not fixing. If the laptop is off for a week, jobs posted and expired inside that week are never seen.

**It does not scale past one operator.** One watchlist, one LinkedIn account, one Mac. Ten users would need a real backend, real accounts, and ten LinkedIn sessions somebody has to store.

**The site is a mirror, not an application.** It can filter, sort and search — but only within what `jobs.json` already holds. Any new field means changing the watcher, waiting for a run, and pushing again.

**Scraping LinkedIn is against LinkedIn's Terms of Service.** The project mitigates: human-like pacing, one broad search instead of hundreds, a real logged-in profile rather than a headless robot, no recruiter profiles opened, no descriptions republished, and a full stop on any captcha or rate-limit banner. Mitigating is not eliminating. The README says so in bold on line 13, and you should too.

## 1.7 Your sixty seconds

Practise this out loud until it is automatic.

> "Intern Radar solves a timing problem: internships in India close in a day, so being early beats being polished. It is two programs, not one. A Node.js watcher runs on my Mac twice a day, drives a real Brave browser through LinkedIn, filters about 860 watchlist companies in memory, classifies each role offline and only asks Gemini about the ambiguous ones, and stores everything in SQLite. Its last step writes one JSON file, commits it, and pushes to GitHub. Vercel sees the push and redeploys a static site — no framework, no build step — which fetches that JSON and renders the list. The two halves never talk directly; a file in git is the interface. That means zero hosting cost, no server to maintain, and no LinkedIn credentials anywhere but my laptop. The price is that data is only as fresh as the last run, and if my Mac is off, the run does not happen."

---

## Chapter summary

- Internship postings in India attract hundreds of applicants within a day, so the value of this project is speed of notification, not quality of matching.
- Intern Radar is **two programs** — a Node.js watcher on the author's Mac and a static site on Vercel — that share one git repository and never communicate directly.
- Their interface is a single file, `web/public/data/jobs.json`, which the watcher writes, commits, and pushes; Vercel deploys on that push.
- There is no always-on server: Vercel serves static files plus exactly one serverless function, `web/api/tailor.js`, capped at 60 seconds in `web/vercel.json`.
- A run goes: launchd → Brave → page through one broad search → filter by company first → classify tech/non-tech (offline first, Gemini only when ambiguous) → extract → SQLite → publish JSON → push → deploy → browser.
- The company check runs before everything else because request volume, not runtime, is what gets a LinkedIn account restricted.
- The four directories are `src/` (watcher logic), `bin/` (human entry points), `web/` (the deployed site), `test/` (three files using Node's built-in `assert`).
- The project has exactly one npm dependency, `playwright-core`, no frontend framework, no backend framework, no ORM, and no build step — which buys zero cost, nothing to maintain, and no credentials on any server.
- It costs freshness (twice-daily), availability (the Mac must be awake), and scale (one operator only), and scraping LinkedIn remains against their Terms of Service.

## Key takeaways

The shape of this system is *push, not pull*: the expensive, risky, credential-holding work happens once on a laptop, and the result is published as a plain file that anyone can read cheaply forever. That inversion is why a project with no server can serve a website reliably. Everything else in this book — the SQLite store, the offline-first classifier, the defensive scraper, the framework-free frontend — is a consequence of choosing a file as the interface between two programs. If you remember one sentence a year from now, remember that the watcher's last act is a `git push`, and that push *is* the deployment.

## Interview questions

**1. Describe the architecture of this project in under a minute.**
It is two programs sharing a repository. The first is a Node.js watcher that runs on my Mac twice a day under launchd; it drives a real Brave browser through LinkedIn with Playwright, filters postings against a watchlist of about 860 companies, classifies each role, and stores everything in a SQLite file. Its final step writes `web/public/data/jobs.json`, commits it, and pushes to GitHub. The second program is a static site on Vercel — no framework, no build step — which Vercel redeploys automatically on that push; the browser fetches the JSON and renders the list. The only code that runs on demand in the cloud is one serverless function that tailors résumés. The two halves never open a connection to each other; a committed file is the entire interface.

**2. Why is there no server?**
Because nothing in the read path needs one. The list of jobs changes twice a day, so serving it from a database on every request would be doing expensive work to produce the same answer thousands of times. Publishing a static file lets a CDN cache it worldwide, which is cheaper and more reliable than any server I could run. The write path does need a real machine — a browser has to be driven — but that machine is my laptop, which I already own and which already holds the LinkedIn session. Adding a server would mean paying for idle time, patching it, and storing my session cookie on it.

**3. What exactly is `jobs.json` and why is it in git?**
It is the published list of jobs: company, role, stipend, location, work mode, duration, a generated summary, and a link to the original posting. It is in git because git is already the deployment trigger — Vercel watches the repository, so committing the file and deploying the site are the same action. That gives me version history for free: I can see exactly what the site showed on any past date, and roll back by reverting a commit. The cost is repository bloat, since every run rewrites the file and adds a commit, and git is not designed as a database.

**4. Full job descriptions are stored in SQLite but not published. Why the difference?**
The description is the posting company's copyrighted text. Storing a local copy for classification and summarising is a defensible internal use; republishing it on a public website is redistribution of someone else's writing. So `src/publish.js` strips descriptions on the way out, and the site shows a generated summary plus a link to the original. `config.json` has a `publish.includeFullDescription` flag for anyone who wants them anyway, defaulted off, which makes the choice explicit rather than accidental.

**5. Hostile: isn't scraping LinkedIn against their Terms of Service?**
Yes, plainly. Automated scraping violates LinkedIn's terms and they can restrict or ban an account for it, and the README says so before it says anything else. What the project does is reduce the risk rather than pretend it does not exist: one broad search per run instead of one request per company, which is roughly 10–30 page loads instead of 880; deliberately human-like pacing with randomised delays; a real logged-in profile rather than headless Chromium; never opening recruiter profiles, which keeps it out of LinkedIn's commercial-use profile-view limit; and a hard stop plus a 24-hour cooldown on any rate-limit banner. It never solves captchas and never submits an application. If I were building this for a company rather than for myself, I would use LinkedIn's official APIs or a licensed job-board feed, and accept the smaller coverage.

**6. Hostile: what happens when your Mac is closed?**
The run does not happen, and jobs posted in that gap can be missed. That is a genuine limitation, not something I can argue away. There are two partial defences. launchd fires once shortly after the lid opens and coalesces several missed slots into one run rather than replaying each, and every run sizes its own lookback window from the gap since the last successful run — so after an overnight sleep it looks back further, capped at 36 hours. That recovers postings still inside the window. Anything posted and expired entirely inside a long outage is lost, and the honest fix is a machine that stays on, which changes the credential story and the cost story.

**7. Why does the company check happen before the title check and before any API call?**
Because it is the cheapest filter and it rejects the most. The company name is already on the search-result card, so matching it costs a string comparison in memory — no network request at all. Anything that fails it needs no title parsing, no role classification, and above all no Gemini call, which is a scarce free-tier resource. Ordering filters cheapest-and-most-selective first is the whole idea; reversing the order would mean paying for a classification on a posting I was going to throw away regardless.

**8. Why one npm dependency? Isn't that reinventing wheels?**
Sometimes, and deliberately. Node 22 already ships a SQLite driver (`node:sqlite`), an HTTP server (`node:http`), a test assertion library (`node:assert`), and a `.env` loader (`process.loadEnvFile`), so pulling in better-sqlite3, Express, Jest and dotenv would add hundreds of transitive packages to replace things I already have. Playwright is the exception because driving a real browser is genuinely hard and not something I should write myself. The trade-off is real: my hand-rolled pieces have fewer features and no community behind them, and if the project grew a team I would probably take Express for the routing ergonomics. For one operator and 100 lines of server code, the dependency-free version is smaller and easier to reason about.

**9. There is no build step. Isn't that unprofessional for a modern frontend?**
It is a fit-for-purpose decision. A build step exists to bundle modules, minify, compile TypeScript or JSX, and tree-shake a large dependency graph. This site is one HTML file, one 825-line JavaScript file, and one 550-line stylesheet, with no dependencies to bundle and nothing to compile. Adding a bundler would add configuration, a lockfile, a category of build failure, and a gap between the code I read and the code that ships. What I lose is real: no TypeScript type checking, no automatic minification, and no tooling to stop `app.js` growing into an unmaintainable single file. At about two thousand lines of frontend code the calculation flips, and I would take a bundler then.

**10. Hostile: your site can only ever show what one JSON file contains. Isn't that a dead end?**
It is a ceiling, and I would rather name it than defend it. Every site feature — filtering, search, the tech/other split, logos — has to be satisfiable from fields already in the file, so adding a field means changing `src/publish.js`, waiting for a run, and pushing. It also means the file grows with every job kept in the window, and a phone downloads all of it. Today that is a few hundred kilobytes and fine. If it reached several megabytes I would have to paginate the JSON into chunks, or move to a real read API — at which point I would be running a server and would have to justify its cost and its credentials all over again.

**11. How would you change the design to support a thousand students, each with their own watchlist?**
The current design cannot do it, because it assumes one operator with one LinkedIn session on one laptop. I would keep the two-program split but move the watcher to a machine that stays on, scrape once against a broad query, store every internship centrally, and make the watchlist a per-user filter applied at read time rather than at scrape time — so a thousand watchlists still cost one scrape. That needs a real database, user accounts, and an API, which means the site stops being static. The bigger problem is legal rather than technical: running a public service on scraped data raises the stakes on the Terms of Service issue considerably, so at that scale I would move to licensed data.

**12. Where would you look first if the site showed no new jobs for three days?**
The site is the last link in a long chain, so I would work backwards. First `~/Library/Logs/linkedin-watcher/run.log` to see whether runs are happening at all; if not, the launchd agent is disabled or the Mac was off. If runs are happening, `node bin/show-report.js --runs` shows cards seen versus new jobs — plenty of cards and zero new jobs means the filters worked and the watchlist genuinely posted nothing, which is the normal state. Zero cards means either an expired LinkedIn session or LinkedIn changing its markup, and the code raises a loud, specific error for that second case plus a screenshot. If the run succeeded and pushed, the last suspects are the git push failing silently and the Vercel deploy failing, both visible in the repository's commit history and Vercel's dashboard.

## Common beginner mistakes

**1. Assuming the website does the scraping.**
The beginner sees a job site and pictures the site fetching from LinkedIn when a visitor loads the page. It looks right because that is how most web apps work. What actually happens is the site never contacts LinkedIn at all — it reads a static JSON file that was written hours ago on a laptop. The fix is to trace the data backwards from the browser: `app.js` fetches `data/jobs.json`, and that file's only author is `src/publish.js`.

**2. Reaching for a framework name that is not there.**
Beginners describe this project as "React and Express with MongoDB" because that is the stack every tutorial teaches. It looks right because the project has a frontend, a backend-ish thing, and data. In reality the frontend is vanilla DOM calls, the local server is 100 lines on `node:http`, and the database is SQLite through Node's own built-in module. The fix is to open `package.json` before describing any project: one dependency, `playwright-core`, ends the argument.

**3. Thinking `git push` is only for saving code.**
The beginner treats the push at the end of a run as housekeeping. It looks right because that is what push usually means. Here the push *is* the deployment — Vercel is watching the repository, and no other mechanism makes the site update. The fix is to remember the chain: commit → push → GitHub → webhook → Vercel deploy → live.

**4. Believing more searches means more jobs found.**
The beginner adds role-specific keywords — "software internship", "data internship" — assuming more queries means better coverage. Each keyword costs a full pagination pass, and the README records that they found nothing the one broad sweep missed, while multiplying the request count that gets accounts banned. The fix is one broad query, exhausted by paging, with all filtering done free in memory.

**5. Trying to run the watcher on a cloud server "so it never sleeps".**
The beginner sees the Mac-must-be-awake limitation and moves the scraper to a rented VPS. It looks right because it fixes availability. What it actually does is put a live LinkedIn session cookie on a machine you do not physically control, in a datacentre IP range LinkedIn treats with far more suspicion than a home connection, running headless Chromium that announces itself. The fix, if you truly need continuous coverage, is a dedicated always-on machine you own with a real browser profile — and accepting the increased detection risk knowingly.

## Exercises

1. **Draw it from memory.** Close this book and draw the simple two-box diagram, labelling what flows along each arrow and which machine each box runs on. Check yourself against Section 1.3. Repeat until you can do it in ninety seconds.

2. **Read the interface.** Open `web/public/data/jobs.json` and list every field one job object has. Then name one site feature that would be impossible without changing `src/publish.js`.

3. **Follow one import.** Take three names from the import block in `src/index.js:6–23` — say `assertSignedIn`, `humanDelay`, and `publish` — and find the file each comes from. Write one sentence per function saying what it does and what would break without it.

4. **Cost the alternative.** Compare this architecture against an always-on Node server with a hosted database. For each, state the monthly cost, what has to be patched, where the LinkedIn session lives, and what happens at 3 a.m. when the process crashes.

5. 🔴 **Design the multi-user version.** Sketch the architecture for a thousand students with a thousand watchlists, without increasing the number of LinkedIn requests. Specify: where the scraper runs, what the database holds, how a per-user watchlist is applied, what the site fetches, and what the site now needs that it does not have today. Then write the two paragraphs you would put in that project's README about legal risk.

## Quiz

1. How many programs is Intern Radar, and what do they share?
2. What file is the interface between the two halves, and which module writes it?
3. Name the exact chain of events between the watcher finishing and a student seeing new jobs.
4. How many npm dependencies does the project have, and what is it?
5. Why does `publish` run even when a run finds zero new jobs?
6. Give the two costs of having no always-on server.

---

### Quiz answers

1. **Two.** A watcher (Node.js on the author's Mac, `src/` and `bin/`) and a static site (`web/`, on Vercel). They share one git repository and one published JSON file. They never communicate directly.

2. **`web/public/data/jobs.json`**, written by `src/publish.js`, which converts SQLite rows to JSON, strips full descriptions, then commits and pushes.

3. `src/publish.js` writes the JSON → `git commit` → `git push` → GitHub → webhook notifies Vercel → Vercel deploys the `web/` directory → the file is live on the CDN in about a minute → the student's browser fetches `data/jobs.json` and `app.js` renders it.

4. **One:** `playwright-core` (`package.json:23–25`). Everything else — SQLite, HTTP, tests, `.env` loading — uses modules built into Node.

5. Because the site must also *remove* listings that have aged out of the lookback window. If publishing only happened when new jobs were found, stale jobs would stay visible indefinitely. The comment at `src/index.js:667–668` says exactly this.

6. **Freshness:** data is only as current as the last run, so a job posted just after a run waits hours. **Availability:** the watcher only runs when the Mac is awake, so a powered-off laptop drops that slot entirely — the adaptive lookback window recovers postings still inside the window, but not ones that were posted and expired during a long outage.
