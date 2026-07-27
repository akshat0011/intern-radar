# Chapter 10 — Engineering Judgment, and Rebuilding It From an Empty Folder

> By the end of this chapter you can name the principles behind every major decision in this codebase, trace one job's complete journey from LinkedIn to a student's screen, and rebuild the whole project yourself in stages without copying code.

**New words:** clean code, DRY, KISS, YAGNI, separation of concerns, pure function, side effect, SOLID, MVC, repository pattern, dependency injection, coupling, cohesion, regression, technical debt, idempotent.

---

# Part A — Principles, found in real code

Principles are only useful when you can point at a line and say "that is what this means". So each one below is defined, then located.

## 10.1 Clean code

**Clean code** is code another person can read and change without fear. Not clever code — clear code.

The strongest signal here is comment style. Most beginner comments restate the code:

```js
// increment i
i++;
```

That comment is worse than nothing; it will drift out of date and mislead. Good comments explain **why**, because the *what* is already in the code. This codebase is unusually disciplined about that. From `.gitignore`:

```
# Leading slash matters: this is the scraper's local state directory only.
# Without it, web/public/data/jobs.json and web/public/logos — which the site
# needs — would also be ignored, and the deployed site would silently have no
# listings and no logos.
```

A single character — `/` before `data/` — with four lines explaining what breaks without it. Nobody will ever delete that slash by accident now.

From `src/publish.js`:

```js
// A publish failure must never fail the scrape; the data is safe locally.
```

Six words of rule, then the reason. A future editor tempted to rethrow that error knows immediately why they should not.

From `config.json`, on why the browser must stay visible:

```
"Must stay true. Headless Chromium reports 'HeadlessChrome' in its user agent
and an 800x600 screen - trivially detectable, and you could not solve a CAPTCHA
in a window you cannot see. The tool refuses to start if this is false."
```

That is a comment doing real work: it anticipates the exact "optimisation" a future reader would attempt and explains why it fails.

**The test:** if a comment would still be true after you rewrote the function, it is probably a *why* comment and worth keeping.

## 10.2 DRY, and when to ignore it

**DRY** — Don't Repeat Yourself. One piece of knowledge should have one home.

`src/paths.js` is DRY applied properly. Every filesystem location the program uses lives in one object:

```js
export const PATHS = {
  config: join(ROOT, 'config.json'),
  db: join(STATE, 'jobs.db'),
  profile: join(STATE, 'brave-profile'),
  reports: join(STATE, 'reports'),
  ...
};
```

Without it, `~/Library/Application Support/linkedin-watcher/jobs.db` would be spelled out in a dozen files, and moving it would mean finding all of them.

But DRY is regularly over-applied. Two pieces of code that *look* alike are not duplication unless they encode the same **knowledge**. If you merge two similar functions and later need one of them to change, you now have a function with a boolean flag and two behaviours — worse than the duplication you removed. The real question is: when this rule changes, must both places change together? If yes, unify. If no, leave them alone.

## 10.3 KISS and YAGNI

**KISS** — Keep It Simple. **YAGNI** — You Aren't Gonna Need It: do not build for a future you are guessing at.

This project is close to an extended argument for both. It has no framework, no bundler, no ORM, no container, and one dependency. Each absence is a "no" to something a bigger project would need.

The honest counter-position matters too. YAGNI is not an excuse to skip things you *do* need. There are no tests on the browser code, and that is not YAGNI — that is a gap. The distinction is whether you are declining to solve a problem you do not have, or declining to solve one you do.

## 10.4 Separation of concerns, and pure functions

**Separation of concerns** means each part of a system has one job.

Look at how the watcher splits work. `src/linkedin.js` knows about LinkedIn's pages. `src/extract.js` knows how to read facts out of text. `src/store.js` knows about SQLite. `src/publish.js` knows about git. None of them knows about the others' subjects.

That split has a testable payoff. A **pure function** is one that depends only on its inputs, returns a value, and changes nothing else — no files, no network, no globals. Those changes to the outside world are called **side effects**.

`src/extract.js` is almost entirely pure. `extractStipend("₹15,000/month")` will return the same thing on any machine, at any time, forever. So it can be tested without a browser, without LinkedIn, without a database:

```js
// test/extract.test.mjs
ok('stipend from a range', extractStipend('₹20,000 - ₹30,000 per month'));
```

Compare that with testing `enumerateCards()`, which needs a live browser, a logged-in session, and LinkedIn's current HTML. It is not that nobody wrote those tests out of laziness — it is that pure functions are *cheap* to test and impure ones are expensive. Pushing logic into pure functions is what makes a codebase testable at all.

## 10.5 SOLID, honestly

**SOLID** is five object-oriented principles: Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion.

Here is the honest position, and saying it in an interview is better than reciting definitions: **SOLID is a framework for class-heavy object-oriented code, and this codebase is mostly functional.** There is exactly one class, `Store`. Applying Liskov substitution to a module of pure functions is a category error.

Two of the five do translate:

- **Single responsibility** — each module has one reason to change. `src/roles.js` changes when the classification vocabulary changes, and for no other reason.
- **Dependency inversion** — depend on abstractions, not concretions. Which brings us to the next two principles.

## 10.6 The repository pattern and dependency injection

The **repository pattern** puts all data access behind one interface, so the rest of the program never writes SQL.

`src/store.js` is exactly this. Callers say `store.recentJobs(since)` or `store.needingEnrichment(500)`. They never write a query. That means the day you move to Postgres, you rewrite one file and nothing else notices.

**Dependency injection** means giving a component what it needs instead of letting it fetch its own. Look at the signature in `src/publish.js`:

```js
export async function publish(store, cfg, newJobCount) {
```

`publish` does not import the store or create one. It receives one. That is dependency injection, and it buys two things: a test can pass a fake store, and `publish` cannot secretly open a second database connection.

The contrast is `src/paths.js`, which is imported directly everywhere. That is deliberate — paths are constants, not collaborators. Injecting them would be ceremony with no payoff. **Inject things that vary or have side effects; import things that are fixed.**

## 10.7 Coupling, cohesion, and the file in the middle

**Coupling** is how much two parts depend on each other; you want it low. **Cohesion** is how strongly one part's contents belong together; you want it high.

The single most important architectural decision in this project is a coupling decision: **the watcher and the site communicate through a JSON file in git, not a network call.**

Consider the alternative. If the site called the watcher's database directly, the watcher's machine would need to be reachable from the internet, always on, with a public address, credentials, and a security posture. The two halves would be locked together.

Instead the interface is a file. The watcher writes it and stops caring. The site reads it and never knows where it came from. Either half could be rewritten in another language, or moved to another machine, without the other noticing.

The price is honest: the site can only ever show what is already in that file, and the data is only as fresh as the last write. That is the trade — flexibility and freshness given up for near-total decoupling.

## 10.8 Error handling as a strategy

Scattered `try/catch` blocks are not a strategy. A strategy answers: which failures are fatal, which are survivable, and who finds out?

This codebase has a clear one, and it follows from what is expensive.

**Survivable failures degrade.** Every Gemini call computes an offline answer *first*, then tries to improve it. From `src/gemini.js`:

```js
// Offline first, so every item has a verdict no matter what happens next.
```

If the key is missing, the quota is spent, or the network is down, the offline verdict simply stands. There is no path where a job ends up unclassified because an API was unavailable. **Fallback-before-attempt** is the pattern, and it is the best decision in the codebase.

**Cheap failures never break expensive work.** A failed `git push` warns and leaves the data locally.

**Dangerous failures stop everything.** `src/guard.js` detects captchas, blocks, and logouts, and aborts the run through a dedicated `RunAborted` error. Retrying into a rate limit makes the situation worse — the correct response is to stop loudly and wait.

## 10.9 Testing: what is covered, and what is not

`npm test` runs three files with Node's built-in `assert`. No Jest, no config.

```js
// test/roles.test.mjs — real shape
ok('catches kubernetes', isSoftwareRole('DevOps Intern - Kubernetes'));
ok('keeps postgresql', ...);
```

Thirteen assertions pass. What they cover is deliberate: the **pure** functions — text extraction and role classification. These are exactly where a bug is silent. If `extractStipend` misreads a range, nothing crashes; a wrong number simply appears on a website. Tests catch that class of bug, which is the class humans miss.

What is not covered, stated plainly: the browser-side `app.js`, the scraping in `linkedin.js`, the database layer, and the serverless function beyond one helper. Two different reasons apply, and only one is defensible. Scraping and DOM code fail *visibly* — the page looks wrong, the run errors. The database layer failing silently would be bad, and that gap is real. If asked what you would add first: Playwright tests against the deployed site, then tests for `store.js` against a temporary database file.

A **regression** is a bug in something that used to work. Tests exist mainly to catch those, which is why they matter more as a project ages than when it is new.

---

# Part B — One complete journey

Follow a single job all the way through. Every step names the real function.

**1. A job appears.** A company posts an internship on LinkedIn. Nothing happens yet.

**2. The clock fires.** launchd triggers on the hour, running `bin/run.sh`, which locates `node` and starts `src/index.js`.

**3. Configuration loads.** `loadConfig()` in `src/config.js` reads `config.json` and `companies.json`, producing a watchlist of about 920 companies. `resolveWindowHours()` decides how far back to look — short after a normal hourly run, wider after a sleep.

**4. Brave launches.** `launchBrave()` in `src/browser.js` starts the real browser with a persistent profile, so the human login is reused. `hasLinkedInSession()` confirms the session is alive.

**5. Searches are built.** `resolveSearches()` and `buildCompanyBatches()` in `src/searches.js` turn the watchlist into a handful of search queries. Crucially, it does **not** search per company — that would be ~900 page loads. It searches broadly and filters in memory.

**6. Results are paged.** `buildSearchUrl()` constructs the URL; `gotoSearch()` navigates; `enumerateCards()` reads the visible result cards. Between actions, `src/human.js` inserts randomised delays and human-like scrolling. `hasNextPage()` decides whether to continue.

**7. The guard watches.** After each navigation, `ensureHealthy()` in `src/guard.js` checks for a captcha, a block, or a logout. Any of those raises `RunAborted` and the run stops cleanly.

**8. Filtering, cheapest test first.** `matchCompany()` checks the employer against the watchlist. A non-watchlist posting is dropped immediately — before any title parsing, classification, or API call.

**9. The job is opened.** `openAndExtract()` in `src/linkedin.js` opens the posting and pulls out the raw text.

**10. Facts are extracted.** The pure functions in `src/extract.js` run: `extractStipend()`, `extractDuration()`, `extractSkills()`, `extractWorkplaceType()`, `parseRelativeTime()`.

**11. It is classified — offline first.** `classifyRole()` in `src/roles.js` gives a verdict from the title using a vocabulary. Every job has an answer at this point.

**12. Then refined.** `classifyRoles()` in `src/gemini.js` sends a batch to Gemini to improve those verdicts. If anything fails, the offline verdicts stand. Terms Gemini teaches are saved by `src/learned.js` so the offline classifier improves over time.

**13. It is summarised and stored.** `summarize()` produces a summary; the row is written to SQLite through `Store`.

**14. It is enriched.** `enrichJobs()` turns the description into bullets, an eligibility level, key skills and a stipend state. `saveEnrichment()` stores them.

**15. It is published.** `writeJobsFile()` in `src/publish.js` converts rows into `web/public/data/jobs.json` — deliberately **stripping full descriptions**, which are the employer's copyrighted text. `pushToSite()` commits and pushes.

**16. Vercel deploys.** The push triggers a rebuild. Within about a minute the new JSON is on the CDN.

**17. A student opens the site.** DNS resolves `internradar.online`; the CDN returns `index.html`, `styles.css` and `app.js`.

**18. The page fills itself.** `app.js` fetches `data/jobs.json`, and `renderList()` builds each row with `jobCard()`, using `textContent` throughout because this is scraped third-party text.

**19. They interact.** Clicking a row calls `selectJob()`. Filters call `applyFilters()`. `syncStickyOffset()` measures the real header height rather than guessing it.

**20. They tailor a résumé.** The browser POSTs to `/api/tailor`. The serverless function in `web/api/tailor.js` validates the input, calls Gemini, and runs `findInventedSkills()` to ensure the model has not added a skill the student never claimed. The result returns and the page updates.

The whole path, in one line: **launchd → Node → Brave → LinkedIn → extract → classify → SQLite → JSON → git → Vercel → CDN → browser → Gemini.**

---

# Part C — Rebuild it from an empty folder

Do not copy code. Build in stages, and make each stage *work* before starting the next. If you cannot finish a stage, you have found something you do not understand yet — go back to the relevant chapter.

### Stage 0 — An empty folder
`mkdir intern-radar && cd intern-radar && git init && npm init -y`. Add `"type": "module"` to `package.json`. Create `.gitignore` with `node_modules/` and `.env`.
**Done when:** `node -e "console.log('hi')"` runs.

### Stage 1 — A page with fake data
Write `web/public/index.html` with a header and an empty `<ol>`. Write `styles.css`. Write `app.js` that holds an array of three fake job objects and builds list items from them with `document.createElement` and `textContent`.
**Done when:** opening the file shows three job cards. No server, no data, no scraping.
*You have just done Chapter 3's work.*

### Stage 2 — Real data from a file
Move the fake jobs into `web/public/data/jobs.json`. Change `app.js` to `fetch()` it. This will fail from `file://` because of browser security, which is the lesson — you now need a server. Write `web/serve.js` on `node:http`: read the path, look up a MIME type, stream the file.
**Done when:** `node web/serve.js` serves the page at `localhost:4321` and jobs load.
*Chapters 5 and 8.*

### Stage 3 — Filters and interaction
Add the search box, the dropdowns, and the tech/other tabs. Keep filter state in a plain object and re-render on change.
**Done when:** typing filters the list and the count updates.
**Deliberate trap:** give your `<select>` elements long option text at 375px width. Watch the page scroll sideways. Fix it with `min-width: 0`. Now you own that bug.

### Stage 4 — A database
Add `src/store.js` using `node:sqlite`. Create a `jobs` table. Write `insert`, `recentJobs`, and an additive `migrate` that adds missing columns.
**Done when:** you can insert rows by hand and print them back.
*Chapter 6.*

### Stage 5 — Publishing
Write `src/publish.js` to read rows and write `jobs.json` — and deliberately omit the full description field.
**Done when:** editing the database changes what the site shows after re-running publish.
*This is the file-as-interface idea from 10.7, and the moment the two halves become independent.*

### Stage 6 — The scraper
The hardest stage. `npm install playwright-core`. Write `src/browser.js` to launch a real browser with a persistent profile, and a `bin/login.js` that opens LinkedIn and waits while you log in by hand. Then `src/linkedin.js` to build a search URL, read result cards, and open one job.
**Done when:** one real job from LinkedIn lands in your database.
**Go slowly.** Add delays from the start, not later. Run it a handful of times, not in a loop.
*Chapter 8.*

### Stage 7 — Extraction and classification
Write `src/extract.js` as pure functions over text, and write tests for them first — they are the easiest things you will ever test. Then `src/roles.js` with a vocabulary of technical and non-technical terms.
**Done when:** `npm test` passes and jobs are labelled without any API.
*Chapters 4 and 10.*

### Stage 8 — The language model
Add `src/gemini.js`. Call the REST endpoint with `fetch`. Use a response schema. Set `thinkingBudget: 0`.
**The rule that matters:** compute the offline answer *before* you call the API, and let it stand if the call fails. Test this by deliberately using a wrong API key — your program must still produce a full result.
*Chapter 7.*

### Stage 9 — Deployment
Push to GitHub, connect Vercel, point it at `web/public`. Add `vercel.json` with security headers. Add `web/api/tailor.js` as a serverless function.
**Done when:** the site is live on a real URL, and you have checked it from your phone on mobile data — not just your laptop.
*Chapter 9, including the lesson about verifying from outside.*

### Stage 10 — Scheduling
Write `bin/run.sh` that locates `node` explicitly. Write the launchd plist. Install it.
**Done when:** you close your laptop, open it an hour later, and find new jobs on the live site that you did not put there.
*That moment — the system doing its job while you were not watching — is when you have built it.*

## Chapter summary

- Good comments explain *why*, not *what*; this codebase's best comments anticipate the exact mistake a future reader would make.
- DRY applies to knowledge, not to code that merely looks similar — ask whether both places must change together.
- YAGNI justifies not solving problems you do not have; it does not excuse gaps like missing tests.
- Pure functions have no side effects and are cheap to test, which is why `src/extract.js` is well tested and the browser code is not.
- SOLID is an object-oriented frame and applies only partly to this mostly-functional codebase; say so rather than reciting it.
- `src/store.js` is a repository — all SQL lives behind it, so swapping the database would touch one file.
- `publish(store, cfg, ...)` receives its store rather than importing one: inject what varies, import what is fixed.
- The watcher and site are decoupled by a file in git, which is the project's most important architectural decision and its clearest trade-off.
- The error strategy is layered: survivable failures degrade to an offline result, cheap failures warn, dangerous failures abort loudly.
- You can rebuild the whole project in ten stages, each independently verifiable, without copying any code.

## Key takeaways

Principles are tools for making trade-offs, not rules to obey. The valuable skill is naming what a decision costs, which is why every "we chose X" in this book is followed by "and the price is Y". The single most transferable idea here is fallback-before-attempt: compute an answer you can live with *before* calling something that might fail, so failure degrades quality instead of breaking the program. And the strongest proof you understood a system is being able to rebuild it in stages, each one working, without looking at the original.

## Interview questions

**1. What design decision in this project are you proudest of?**
Making every AI call compute an offline answer first. The vocabulary classifier runs before Gemini is touched, so every job already has a verdict; Gemini only improves it. If the key is missing, the quota is spent, or the network is down, the offline verdict stands and the program still finishes. It means an external service can degrade the output but never break the run, which is the property I actually wanted.

**2. How is your code organised, and why?**
By concern, not by type. `linkedin.js` knows about LinkedIn's pages, `extract.js` knows how to read facts out of text, `store.js` knows about SQLite, `publish.js` knows about git — and none knows the others' subjects. The payoff is testability: because extraction is pure functions with no side effects, it can be tested with no browser and no database, which is exactly where silent bugs live.

**3. Do you follow SOLID?**
Partly, and I would not claim more. SOLID is a framework for class-heavy object-oriented code, and this codebase is mostly functional with a single class. Single responsibility clearly applies — each module has one reason to change. Dependency inversion shows up in that `publish` receives a store rather than importing one. Liskov substitution has nothing to act on here, and pretending otherwise would be cargo-culting.

**4. Why is `store.js` a separate module rather than SQL scattered around?**
It is the repository pattern: all data access behind one interface. Callers ask for `recentJobs()` and never write a query. Concretely, that means moving to Postgres would mean rewriting one file while everything else stays unchanged. It also gives one place to put the migration logic, so schema changes cannot be half-applied across the codebase.

**5. Why do the two halves communicate through a file instead of an API?**
Because it removes almost all coupling. If the site called the watcher's database, my laptop would need to be internet-reachable, always on, with credentials and a security posture. With a file in git, the watcher writes and stops caring, and the site reads without knowing the source — either half could be rewritten or relocated without touching the other. The cost is that the site can only show what is already in that file, and freshness is bounded by the last run.

**6. What is a pure function and why does it matter here?**
A pure function depends only on its inputs, returns a value, and changes nothing outside itself. It matters because it is cheap to test — `extractStipend` gives the same answer on any machine at any time, so it needs no browser, no network, no database. Pushing logic into pure functions is what made this project testable at all, and it is why the tests cover extraction and classification rather than scraping.

**7. What is your testing strategy? [hostile — the coverage is thin]**
Thirteen assertions over the pure functions: text extraction and role classification. That is deliberate rather than complete. Those functions fail *silently* — a misparsed stipend produces a wrong number on a website with nothing crashing — and silent failures are the ones humans miss. Scraping and DOM code fail visibly instead. But the database layer failing quietly would be bad and it is untested, which is a real gap. If I extended this, I would add Playwright tests against the deployed site and `store.js` tests against a temporary database file.

**8. What is the worst part of this codebase? [hostile]**
The scraper's dependence on LinkedIn's HTML. `enumerateCards` reads selectors that LinkedIn can change without warning, and when they do, the run finds nothing. I mitigated it — `guard.js` distinguishes "blocked" from "empty page" and aborts loudly rather than silently reporting zero jobs — but I cannot fix it, because the fragility is inherent to scraping a site you do not control. An official API would remove the problem and does not exist for this data.

**9. What is technical debt, and where is yours?**
Technical debt is a shortcut that buys speed now and costs time later, with interest. Mine is concentrated in three places: no tests on the browser code, no automated backup of the SQLite file even though it is the entire state, and a single hardcoded watchlist that would have to become per-user data if anyone else used this. I would pay the backup one first — it is an hour of work and the only one where the loss is unrecoverable.

**10. If you had to scale this to a thousand users, what changes?**
Almost everything on the write side. Today there is one watchlist on one machine; a thousand users means per-user watchlists, which means a real database with user accounts, a job queue so scraping is not serialised behind one browser, and a server that is always on. The read side barely changes — a static file on a CDN already handles far more traffic than that. I would also have to solve the data source properly, because scraping at that volume is neither legal nor survivable.

**11. Explain the whole system in under a minute.**
Two programs sharing a SQLite file. A watcher runs on my Mac every hour under launchd, drives a real Brave browser through LinkedIn with Playwright, filters against a watchlist of about 920 companies in memory, classifies roles offline and asks Gemini only about the ambiguous ones, and stores everything. Its last step writes one JSON file, commits it and pushes. Vercel redeploys a static site with no framework and no build step; the browser fetches that JSON and renders the list. The only cloud code is one serverless function for tailoring résumés.

**12. What would you do differently if you started again?**
Move the watcher off my laptop from day one — that single point of failure shapes every other limitation. I would also write the extraction tests before the scraper rather than after, because I ended up debugging parsing bugs through a live browser when I could have done it in milliseconds against fixed strings. Those are process changes, not architecture ones; the two-programs-and-a-file structure is the part I would keep.

## Common beginner mistakes

**Applying principles as rules.** You read about DRY and merge two similar functions, then add a flag to handle the difference, then a second flag. The merged function is now harder to change than the duplication was. Ask whether both places must change *together*; if not, leave them apart.

**Writing comments that restate code.** `// loop over jobs` above a loop over jobs. It adds nothing and will eventually lie. Explain the reason, the constraint, or the trap.

**Testing the easy things instead of the risky things.** Beginners test that a function returns a number. The valuable tests cover the messy input — an empty string, a missing currency symbol, a range instead of a single value — because that is where silent wrongness hides.

**Building for imagined scale.** Adding a job queue, a cache layer and an abstraction for three future databases, for a program that runs hourly on one machine. Every layer is code you must now maintain to solve a problem you do not have.

**Treating "no tests" and "no framework" as the same kind of choice.** Skipping a framework you do not need is judgment. Skipping tests on code that fails silently is debt. Learn to tell them apart, because an interviewer can.

**Copying a rebuild instead of doing it.** Reading Part C and pasting the original code teaches nothing. The value is entirely in getting stuck, because getting stuck locates the thing you did not actually understand.

## Exercises

1. Find three comments in this codebase that explain *why* rather than *what*. For each, write one sentence on what would go wrong if a future editor ignored it.

2. Pick any function in `src/extract.js`. Write down its inputs, its output, and one input that would break it. Then check whether `test/extract.test.mjs` covers that case.

3. `src/paths.js` is imported directly while `store` is passed as an argument. Write a short paragraph justifying that difference using the terms *coupling* and *side effect*.

4. Trace one job through Part B with the real files open beside you. At each of the twenty steps, name the file and function. Where you cannot, that is the chapter to reread.

5. 🔴 Do Stages 0 through 3 of Part C from scratch, in a new folder, without opening this project's code. Stop when you can filter a list of fake jobs in a browser. Then compare your `app.js` with the real one and write down three things you did differently and which is better.

## Quiz

1. What makes a function *pure*, and why does that make it easy to test?
2. Why is `publish(store, cfg, ...)` given a store rather than importing one?
3. What is the interface between the watcher and the site?
4. What does "fallback-before-attempt" mean in `src/gemini.js`?
5. Why are full job descriptions stripped before publishing?
6. Which principle is being applied when `matchCompany()` runs before any classification?

---

**Answers**

1. It depends only on its inputs, returns a value, and causes no side effects — so it can be tested with fixed inputs and no browser, network or database.
2. Dependency injection: a test can pass a fake store, and `publish` cannot secretly open a second database connection.
3. A JSON file committed to git — not a network call — which is what keeps the two halves independent.
4. The offline verdict is computed *before* Gemini is called, so an API failure leaves a usable answer standing instead of breaking the run.
5. They are the employer's copyrighted text; the site links to the original posting instead of republishing it.
6. Cheapest test first — the employer check is free and eliminates most postings before any expensive parsing or API call.
