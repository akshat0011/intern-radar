# Chapter 3 — Meet Intern Radar

> By the end of this chapter you will be able to draw the whole system on a napkin — both programs, the one file that joins them, and every hop a piece of data makes from a LinkedIn page to a student's phone — and explain why it was built this way and what that choice costs.

**Before this chapter you should have read:** Chapter 1, *What Is Software?*, and Chapter 2, *How Websites Actually Work*.

**New words introduced here:** program, process, run, watcher, scraper, server, client, static site, dynamic site, deploy, hosting, git, repository, commit, push, remote, GitHub, Vercel, JSON, database, SQLite, table, row, column, query, API, endpoint, HTTP, request, response, GET, POST, status code, DNS, domain, CDN, cache, serverless function, cold start, environment variable, API key, launchd, LaunchAgent, npm, dependency, module, Node.js, front end, back end, rate limit, IP address, build step.

---

## 3.1 The problem, stated plainly

Here is a thing that happens to nearly every engineering student in India.

A company you actually want to work for posts an internship. You find out about it three days later — a friend sends the link in a WhatsApp group, or it drifts past you on LinkedIn while you are procrastinating. You open it. Under the job title there is a small grey line of text:

> 1,247 applicants

You apply anyway. You spend forty minutes rewriting your résumé for it. You never hear back.

Nothing was wrong with your résumé. The problem was arithmetic. A human being at that company will look at perhaps the first fifty applications with any real attention. Whether you were applicant number 51 or number 1,247 barely matters; both are on the wrong side of the line. And the line was crossed in the first few hours after the posting went live.

This is the single fact the whole project is built around:

**For internships in India, being early beats being perfect.**

Not "instead of" — nobody is telling you to send a bad résumé. But a good résumé sent in hour one is worth more than a great one sent on day three. The distribution of applications over time is brutally front-loaded. Popular postings collect hundreds of applicants within a day, and the earliest ones get read by a person rather than skimmed by a filter.

You can see this in the project's own data. Here is a real record from the file the site publishes, `web/public/data/jobs.json`, trimmed to the interesting lines:

```json
{
 "id": "4443804958",
 "title": "Product Innovation Internship Program | Industrial Design & NPD (Food Technology)",
 "company": "Country Delight",
 "applicants": "2 applicants",
 "postedText": "8 minutes ago",
 "postedAt": 1785131692245,
 "firstSeenAt": 1785132172251
}
```

Read the last three fields together. `postedText` is what LinkedIn's own page said — the posting was eight minutes old. `postedAt` is that converted into a number the computer can compare (milliseconds since 1 January 1970 — you will meet this format properly in Chapter 14, *Databases and SQLite*). `firstSeenAt` is when this project noticed it. Subtract one from the other and you get about eight minutes. The posting had **two** applicants at that moment.

That gap — between "a job exists" and "a student hears about it" — is the entire problem. Intern Radar exists to make that gap small.

### Who uses it

There are two different humans in this story, and they use two different halves of the project.

**The author, on his own Mac.** He wants a private tripwire. He does not want to open LinkedIn eleven times a day. He wants his computer to check for him, and to tap him on the shoulder only when something at a company he cares about appears. What he gets is a notification, a sound, and a locally generated HTML report he can open in his browser.

**Students, on the public internet.** They want a list. They go to `https://www.internradar.online`, see internships sorted newest-first with a little bar that visibly drains over the first twenty-four hours, and click through to LinkedIn to apply. They can also upload their résumé and have it rewritten to target one specific listing.

Those two audiences pull the design in different directions, and the way the project resolves that tension is the subject of this chapter.

### Why it was built

Because the alternative was refreshing LinkedIn. That is the honest answer. The author was a student looking for internships, found that the useful window was measured in hours, and noticed that a computer is much better than a human at checking something every hour without getting bored. Once the checking worked, publishing the results cost almost nothing extra — the data was already collected and sitting in a file. So the private tool grew a public face.

That order matters. The site is downstream of a tool that already worked. It is not a startup that needed a scraper; it is a scraper that acquired a website.

---

## 3.2 What the program actually does, in one paragraph

Every hour, on a Mac that is switched on, a program wakes up. It opens a real Brave browser window — the same Brave you would use yourself — and, because you signed into LinkedIn in that window once by hand, it is already logged in. It goes to LinkedIn's job search, runs one broad query for internships in India, and pages through the results the way a person would: scrolling, pausing, clicking. It reads every job card on every page. It throws away anything from a company that is not on a watchlist of about nine hundred employers. What survives, it opens and reads properly — stipend, duration, skills, work mode, the description. It decides whether each one is a software role or something else. It saves everything into a small database file on that same Mac. Then it writes a summary of the last fourteen days of findings into a single text file, commits that file to version control, and pushes it to GitHub. A hosting service called Vercel notices the push and, about a minute later, the public website is serving the new list. Then the program exits. Nothing of it is left running.

If you understood that paragraph, you understand the system. The rest of this chapter is that paragraph, slowed down.

---

## 3.3 The idea everyone misses first: this is two programs

Before anything else, define the word.

A **program** is a file (or set of files) of instructions that a computer can carry out. A **process** is what you get when the computer actually starts carrying them out — a program that is currently alive, occupying memory, doing things. A **run** is one lifetime of a process: it starts, it works, it exits.

Now the thing that trips up almost every beginner reading this repository for the first time.

**This project is two separate programs that never run at the same time and never talk to each other directly.**

They live in one folder. They share one git repository. They are written in the same language. Because of that, people read the folder and assume it is one application — that when a student clicks something on the website, some code somewhere runs a search on LinkedIn. It does not. It cannot. The two halves are as separate as a factory and a shop.

Here is the whole system at the coarsest possible level:

```
        THE AUTHOR'S MAC                          THE PUBLIC INTERNET
   (must be on and awake)                     (always up, costs nothing)

  +--------------------------+                +--------------------------+
  |  PROGRAM 1 — the watcher |                |  PROGRAM 2 — the site    |
  |                          |                |                          |
  |  folders: src/  bin/     |   git push     |  folder: web/            |
  |                          | -------------> |                          |
  |  wakes up on the hour    |   (once per    |  no code of ours is      |
  |  runs, then EXITS        |    run, if     |  running between visits  |
  |                          |    anything    |                          |
  |  needs Brave, a LinkedIn |    changed)    |  needs nothing at all    |
  |  session, and a Mac      |                |                          |
  |  that is switched on     |                |  serves files to anyone  |
  +--------------------------+                +--------------------------+
            ^                                            ^
            |                                            |
     launchd starts it                         a student's browser
     (macOS's alarm clock)                        asks for a page
```

Program 1 exists for a few minutes an hour and then is gone. Program 2 is not a program in the "running" sense at all — it is a pile of files that a hosting company hands out on request.

### The analogy: the department notice board

Think about the notice board outside your department office.

The board itself does nothing. It has no opinions and no power supply. It cannot fetch you anything. It just holds whatever paper is pinned to it, and anyone walking past at any hour can read it — at 3 a.m., during a strike, on a Sunday. It works when the office is locked. It works when the clerk is on leave. Its only weakness is that it says exactly what was pinned to it last, and not one word more.

Somebody has to pin things up. A clerk walks to the office, collects the day's notices, copies the useful ones onto a fresh sheet, walks back, takes down the old sheet and pins up the new one. That walk takes twenty minutes and happens on a schedule. In between walks the clerk is not standing by the board waiting for questions. The clerk is somewhere else entirely, doing something else.

The watcher is the clerk. The site is the board. The sheet of paper is one file called `jobs.json`.

Everything else in this chapter follows from that. If a student stares at the board at 4 p.m. wishing for a job posted at 3:58 p.m., the board cannot help — the clerk has not walked yet. If the clerk is ill, the board keeps showing yesterday's sheet to everyone, cheerfully and without error, forever. And if you ask the board a question the sheet does not answer, there is nobody there to ask.

Hold on to this. We will come back to it at the end of the chapter, once you know what is really in the file.

---

## 3.4 Program one: the watcher

### Where it lives and when it runs

The watcher's code is in `src/` (nineteen files) and `bin/` (seven). Its entry point — the file that gets started, that starts everything else — is `src/index.js`. Six hundred and eighty lines. Chapter 18, *The Watcher, File by File*, goes through every one of them; here we only need the shape.

Nobody types a command to start it. macOS does. macOS has a built-in scheduler called **launchd** — a background service that starts programs at set times, the way an alarm clock starts your morning. A single scheduled job registered with launchd is called a **LaunchAgent**. The project installs one with `bin/install-schedule.sh`, which writes out a configuration file containing this:

```xml
<key>StartCalendarInterval</key>
<array>
    <dict><key>Minute</key><integer>0</integer></dict>
</array>
```

That is from `bin/install-schedule.sh:144-147`. Read it as a rule: "start this job whenever the minute is 0". The hour is not mentioned, and in launchd an omitted field means *any*. So: every hour, on the hour, twenty-four times a day. The installer's own comment above those lines says exactly that, and the script prints `Scheduled: every hour on the hour, plus a few minutes of random jitter.` when it finishes (`bin/install-schedule.sh:191`).

**A note on a contradiction you will hit.** The comment at the top of `src/index.js` says the program is "Invoked by launchd at 12:00 and 18:00", and line 2 of `bin/install-schedule.sh` says the same. Those comments are stale — they describe an older schedule. The configuration a few lines below them, the README, and `config.json`'s own notes all describe hourly runs. When a comment and the code disagree, **the code wins**, because the code is what runs. This book's style guide also describes the watcher as running twice a day; the repository says hourly, and the repository is the truth. Treat this as your first real lesson about reading code: comments are a human's *claim* about the program. Only the instructions are the program.

There is deliberate sloppiness built into the timing. `config.json` sets `"startupJitter": [0, 240000]` — up to 240,000 milliseconds, which is four minutes. Scheduled runs wait a random amount of that before starting, so activity does not land on LinkedIn's servers at exactly `HH:00:00` every single hour. A perfectly punctual visitor is an obviously automated visitor.

### What one run needs

The watcher is fussy about its surroundings, and it is worth seeing why, because each requirement teaches something.

- **A Mac that is switched on and logged in.** The LaunchAgent is registered with `LimitLoadToSessionType = Aqua`, meaning "only in a graphical, logged-in session". The job opens a browser window; there is no point running it on a locked-out machine.
- **Brave installed at a known path.** `src/browser.js:8` hard-codes `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`.
- **A LinkedIn session that a human created.** You run `npm run login` once, type your own password into a real browser window, and the session is stored. The tool never sees or types your password.
- **Node.js version 22 or newer.** `package.json:9-11` declares `"engines": { "node": ">=22" }`. **Node.js** is the program that runs JavaScript outside a web browser — Chapter 10, *Inside Node.js*, is entirely about it. Version 22 matters because of the database; more on that shortly.

### The shape of one run

Here is the skeleton of `main()` in `src/index.js`, in order, with the line numbers so you can follow along in the real file:

1. **Load configuration and learned vocabulary** (`:102-114`). Read `config.json`, then merge in terms the classifier has learned from past runs.
2. **Refuse to start if another run is going** (`:150-160`). A lock is stored in the database. Two browsers fighting over one profile is a mess.
3. **Refuse to start if LinkedIn recently pushed back** (`:163-170`). After a rate limit, the tool sits out 24 hours.
4. **Wait a random few minutes** (`:173-179`). The jitter described above.
5. **Work out how far back to look** (`:188-192`). If the last successful run was an hour ago, look back about three hours. If the Mac was shut for two days, stretch the window to cover the gap, capped at 36 hours.
6. **Launch Brave and confirm we are really signed in** (`:208-214`).
7. **Page through search results** (`:239-458`). For each page: read every card, filter, open the interesting ones, extract, save.
8. **Classify everything captured** (`:512-583`). Tech or non-tech, mostly offline and free.
9. **Write the local HTML report and notify** (`:640-665`).
10. **Publish** (`:669`).
11. **Release the lock and exit** (`:671-673`).

Step 7 is where the interesting filtering happens, and the ordering of the filters is a real engineering decision. The very first gate is the employer:

```javascript
const matched = matchCompany(card.company, cfg.watchlist);
if (cfg.matching.requireCompanyMatch && !matched) {
  counters.skippedCompany++;
  store.noteSkippedCard(card.jobId, 'company not on watchlist', card.company, card.title);
  continue;
}
```

That is `src/index.js:289-294`. Line by line:

- `matchCompany(...)` compares the employer written on the job card against the watchlist, and returns the matching watchlist name or nothing.
- If matching is required and nothing matched, three things happen: a counter goes up, a cheap note is written to the database so a future run does not re-examine the same card, and `continue` jumps to the next card.
- What does **not** happen is everything else: no title parsing, no role classification, no page opened, no call to an AI service. Hundreds of cards are read; a handful are opened.

This is why the watchlist can hold nine hundred companies without costing nine hundred requests. The comparison happens in memory, against cards that are already on the screen. Checking one more company is free. `companies.json` currently holds 908 entries across sixteen sector groups, and `config.json` adds one more inline (`Dream11`). Every one of those is checked against every card, and the whole exercise costs nothing extra.

### Where the watcher keeps its things

Not in the project folder. `src/paths.js:18-19`:

```javascript
const STATE = join(homedir(), 'Library', 'Application Support', APP_ID);
const LOGS = join(homedir(), 'Library', 'Logs', APP_ID);
```

The database, the browser profile, the reports and the screenshots all live under `~/Library/Application Support/linkedin-watcher/`. The reason is a macOS security system called TCC, which protects `~/Desktop`, `~/Documents` and `~/Downloads`. A program started by launchd has no stable identity to grant permission to, so it silently fails to read those folders — but only when scheduled, never when you run it by hand. That is the worst kind of bug: it works when you test it and breaks at 2 a.m. Chapter 21, *Deployment, Scheduling, and Operations*, tells the full story.

For now, remember one thing: **the database is not in the repository.** It is on one Mac, in one folder, and if that Mac dies, it is gone.

---

## 3.5 Program two: the site

Now the other half. Everything in `web/`.

A **static site** is a website made of files that already exist, exactly as the visitor will receive them. Nothing is generated at the moment of asking. The opposite is a **dynamic site**, where a program runs on each visit and builds the page fresh — this is what most large sites do, and it is what you would build with a framework like Express or Django.

Intern Radar's site is static, with a single exception we will get to. The whole thing is five kinds of file:

```
web/
  public/
    index.html      210 lines   the page's structure
    styles.css      550 lines   how it looks
    app.js          825 lines   everything it does in the browser
    data/
      jobs.json     ~262 KB     the data — 185 jobs at the moment
    logos/          80 images   one JPEG per company
    og.jpg                      the picture that appears when a link is shared
  api/
    tailor.js       278 lines   the one piece of code that runs on a server
  vercel.json        26 lines   hosting configuration
  serve.js          100 lines   a local preview server, for development only
```

Two things about this list are unusual enough to be worth stopping on.

**There is no build step.** A **build step** is a program that transforms your source code into something else before it ships — bundling twenty JavaScript files into one, compiling a newer syntax into an older one, minifying, generating CSS from a shorthand language. Nearly every modern web project has one. This one does not. `web/public/app.js` is the file you edit *and* the file the browser downloads, byte for byte. When you change a colour in `styles.css` and reload, that is the change. There is nothing in between.

**There is no front-end framework.** No React, no Vue, no Svelte. `web/public/index.html` is hand-written HTML, and `app.js` builds the list of jobs with direct calls to the browser's own document API. Here is the helper it uses everywhere (`web/public/app.js:10-15`):

```javascript
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
```

Five lines. It makes an element, optionally gives it a class and some text, and returns it. That is the entire "framework". Chapter 9, *Frameworks, React, and the Road Not Taken*, teaches React properly and then examines what this file gains and loses by not using it — that comparison is one of the more useful things in the book, and I am not going to short-circuit it here.

**Hosting** means someone keeps your files on a computer that is always connected to the internet, and hands them out when browsers ask. **Vercel** is the hosting company here, on their free "Hobby" plan. It is connected to the GitHub repository at `github.com/akshat0011/intern-radar`, and configured with `web` as its root directory — so `web/public` becomes the website's top level, and `web/api/tailor.js` becomes an address you can call.

---

## 3.6 The handshake: one file, passed through git

Now the join. This is the part to get right.

Some vocabulary first.

**JSON** (JavaScript Object Notation) is a way of writing structured data as plain text. It has objects `{ "key": "value" }`, arrays `[1, 2, 3]`, strings, numbers, `true`, `false` and `null`. That is the whole language. It is readable by a human and parseable by every programming language in use. When two programs need to hand data to each other, JSON is the default answer.

**Git** is a system that records the history of a folder. Each saved snapshot is a **commit**. A **repository** (or repo) is the folder plus its whole history. A **remote** is a copy of that repository living somewhere else — here, on **GitHub**, a company that hosts git repositories. **Pushing** means sending your new commits to the remote.

Now the mechanism, which is unusual enough that people assume they have misread it:

> The watcher writes a JSON file into the website's folder, commits it to git, and pushes it to GitHub. Vercel is watching GitHub. When the push lands, Vercel rebuilds and redeploys the site. Roughly a minute later the public site is showing the new data.

**Git is the message queue.** A commit is the message. That is the entire integration between the two halves of the project. There is no shared database, no API call from the watcher to the site, no upload endpoint, no credentials passed between them.

Here it is drawn out:

```
  THE WATCHER (on the Mac)
  ------------------------
        |
        | 1. src/publish.js writes the file
        v
  web/public/data/jobs.json      <-- a normal file in the project folder
  web/public/logos/*.jpg         <-- and any new company logos
        |
        | 2. git add / git commit / git push
        v
  +------------------+
  |  GitHub          |   github.com/akshat0011/intern-radar
  |  (the remote)    |
  +------------------+
        |
        | 3. GitHub tells Vercel: "new commit on main"
        v
  +------------------+
  |  Vercel          |   copies web/public to its servers worldwide
  |  (the host)      |   registers web/api/tailor.js as an endpoint
  +------------------+
        |
        | 4. about one minute later
        v
  https://www.internradar.online   <-- serving the new jobs.json
```

The code that does step 1 and step 2 is `src/publish.js`. Step 1 first — the end of `writeJobsFile` (`src/publish.js:113-127`):

```javascript
const techCount = publicJobs.filter((j) => j.isTech).length;
const payload = {
  generatedAt: Date.now(),
  count: publicJobs.length,
  techCount,
  otherCount: publicJobs.length - techCount,
  companies: [...new Set(publicJobs.map((j) => j.company))].sort(),
  locations: [...new Set(publicJobs.map((j) => j.location).filter(Boolean))].sort(),
  jobs: publicJobs,
};

mkdirSync(WEB_DATA_DIR, { recursive: true });

const next = `${JSON.stringify(payload, null, 1)}\n`;
writeFileSync(JOBS_FILE, next);
```

Group by group:

- `techCount` counts how many of the jobs are software roles. The site shows this on its "Engineering" tab.
- `payload` is the object that will become the file. `generatedAt` is the moment of writing — the site uses it to display "swept 40m ago". `count`, `techCount` and `otherCount` are totals. `companies` and `locations` are de-duplicated, sorted lists, built by pushing every value through a `Set` (which discards repeats) and back into an array; they fill the two dropdown filters on the site. `jobs` is the actual list.
- `JSON.stringify(payload, null, 1)` turns that object into text, indented by one space. The indentation is not decoration: a file with line breaks produces small, readable differences in git, so you can see in the history exactly which jobs were added.
- `writeFileSync` writes it to `web/public/data/jobs.json`. Note where that is — *inside the website's folder*. The watcher writes directly into the site's source.

Now step 2 — `pushToSite` (`src/publish.js:152-173`), condensed to the flow:

```javascript
const status = git(['status', '--porcelain', 'web/public/data', 'web/public/logos'], { allowFail: true });
if (!status) {
  log.info('Job list is unchanged — nothing to publish.');
  return false;
}

const remote = git(['remote'], { allowFail: true });
if (!remote) {
  log.warn('No git remote configured — the jobs file was written but not published.');
  return false;
}

try {
  git(['add', 'web/public/data', 'web/public/logos']);
  const message = newJobCount > 0
    ? `Add ${newJobCount} new internship${newJobCount === 1 ? '' : 's'}`
    : 'Refresh job listings';
  git(['commit', '-m', message]);

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  git(['push', 'origin', branch]);
  log.ok(`Published to the site — Vercel will redeploy within a minute.`);
  return true;
}
```

- `git status --porcelain <paths>` asks git whether those two folders changed. `--porcelain` means "give me output designed for a program, not a human". If the answer is empty, nothing changed and there is nothing to publish — so an hour in which no job was posted and none aged out produces no commit at all.
- Then it checks a remote exists. Without one, `push` would fail, and the message tells you exactly that instead of throwing a stack trace at you.
- `git add`, then `git commit` with a message written from the count, then `git push origin <current branch>`.

You can see the result of this function in the project's own history. Here are real commits:

```
2086d6a Add 2 new internships
5a5ba8e Add 2 new internships
11d54f9 Add 1 new internship
28f1053 Refresh job listings
```

Every one of those was written by a machine at the end of a run. Mixed in among them are the author's own commits — `Rebuild the job card around what a student actually decides on` — which is a slightly strange thing to see in one history, and a trade-off we will come back to.

One more detail that shows good judgement. The whole publish step is wrapped so that a failure to push can never break the scrape (`src/publish.js:175-180`):

```javascript
} catch (err) {
  // A publish failure must never fail the scrape; the data is safe locally.
  log.warn(`Could not publish: ${err.message}`);
  log.info('The jobs file is written locally. Push it by hand when convenient.');
  return false;
}
```

If GitHub is down, or the WiFi drops, the run still counts as successful. The data is in SQLite and in the file. Publishing is the last, least important step. This ordering is deliberate: **do the irreplaceable work first, the recoverable work last.**

---

## 3.7 Data flow, end to end

Now the full pipeline, at the level of detail where you could rebuild it. Follow one internship from the moment a recruiter clicks "Post" to the moment it appears on a student's screen.

```
 (1) LINKEDIN
     A recruiter posts an internship. It appears in search results,
     sorted newest-first.
        |
        |  Brave, driven by Playwright   src/browser.js, src/linkedin.js
        v
 (2) A JOB CARD IN A BROWSER WINDOW
     title, company, location, "8 minutes ago", logo URL
        |
        |  cheap local filters, in order   src/index.js:276-368
        |    a. already in the database?    -> skip
        |    b. company on the watchlist?   -> if not, drop it here
        |    c. posted inside the window?   -> if not, drop
        |    d. title contains an intern word? -> if not, drop
        |    e. confidently non-tech?       -> store from the card, do not open
        v
 (3) THE JOB PAGE, OPENED
     full description, applicant count, salary badge, apply link
        |
        |  pure text parsing   src/extract.js
        |    extractStipend, extractDuration, extractSkills,
        |    extractWorkplaceType, parseRelativeTime
        |  plus a summary      src/summarize.js
        v
 (4) A JAVASCRIPT OBJECT
     { jobId, title, company, stipend, duration, skills, summary, ... }
        |
        |  store.upsertJob()   src/store.js:396
        v
 (5) SQLITE  ~/Library/Application Support/linkedin-watcher/jobs.db
     table `jobs`, one row per posting, job_id as the primary key
        |
        |  classification pass, after the walk   src/index.js:512-583
        |    offline vocabulary first   src/roles.js
        |    only the undecidable ones  src/gemini.js -> Google Gemini
        |    and what Gemini teaches is remembered  src/learned.js
        v
 (6) SQLITE, NOW WITH A VERDICT
     is_tech = 1 or 0, role_source = 'offline' | 'gemini-description' | ...
        |
        |  publish   src/publish.js:79-131
        |    last 14 days only
        |    re-check the company match
        |    download any missing logo   src/logos.js
        |    DROP the description
        v
 (7) web/public/data/jobs.json     one file, ~262 KB
        |
        |  git add / commit / push   src/publish.js:146
        v
 (8) GITHUB  github.com/akshat0011/intern-radar
        |
        |  webhook: "new commit"
        v
 (9) VERCEL — copies web/public onto its edge network worldwide
        |
        |  HTTPS
        v
(10) A STUDENT'S BROWSER
     app.js fetches /data/jobs.json and draws 185 rows
```

Ten stages. Several of them deserve a sentence of their own.

**Stage 1 to 2 — a real browser.** The watcher does not fetch LinkedIn's HTML with a plain HTTP request. It drives Brave through **Playwright**, a library for controlling browsers programmatically. `src/browser.js:108-118`:

```javascript
const context = await chromium.launchPersistentContext(PATHS.profile, {
  executablePath: BRAVE_PATH,
  headless: false,
  viewport: null,
  args: braveArgs(cfg),
  chromiumSandbox: true,
});
```

`launchPersistentContext` starts a browser using a folder that survives between runs — so the cookies from your one manual login are still there next time. `executablePath` points at Brave rather than Playwright's own bundled Chromium. `headless: false` means a real, visible window: **headless** mode is a browser with no window drawn, and it announces itself in ways LinkedIn can detect. Chapter 16, *Web Scraping and Playwright*, covers all of this properly.

**Stage 2 to 3 — the filters are ordered by cost.** Look again at the list in the diagram. The cheapest test comes first (is this ID already in the database — one indexed lookup). The most expensive action, opening a job page, comes last and happens rarely. On a real backfill described in `config.json`, this ordering cut the number of pages opened from twelve to four per dozen candidates. That is a 3× reduction in requests to LinkedIn for the same result, which is a 3× reduction in the chance of the account being restricted.

**Stage 5 — SQLite, built in.** A **database** is a program or file that stores structured data and lets you query it. A **table** is a grid; each **row** is one record, each **column** one field. A **query** is a question written in SQL. **SQLite** is a database that is not a server at all — it is a single file, and a library that reads and writes it. And since Node 22 it ships *inside Node*:

```javascript
import { DatabaseSync } from 'node:sqlite';
```

That is line 1 of `src/store.js`. The `node:` prefix means "a module built into Node itself" — nothing was installed to get this. The schema below it defines four tables: `jobs`, `runs`, `seen_cards`, `settings`, plus a `company_ids` cache. Chapter 14 is all about it.

**Stage 6 — classification is mostly free.** Every captured job is labelled software or not-software. Most titles are settled offline by a vocabulary list in `src/roles.js`, at no cost and instantly. Only genuinely ambiguous ones — a bare "Trainee", something resting on nothing but the word "Engineer" — are sent to Google's Gemini model, and then Gemini is asked which *phrase* decided it, and that phrase joins the offline vocabulary. The classifier gets better and the number of API calls goes down the longer the tool runs. Chapter 17, *Talking to a Language Model*, covers this.

**Stage 6 to 7 — what gets thrown away.** This is important and easy to miss. The published file does **not** contain the job descriptions. `src/publish.js:74`:

```javascript
description: includeFullDescription ? row.description : null,
```

and `config.json` sets `includeFullDescription` to `false`. The description is stored locally, used for classification and summarising, and then deliberately not republished — it is the employer's copyrighted text. What students get is the project's own generated summary plus a link to the original. That is a legal and ethical decision expressed as one ternary expression.

Also thrown away: anything older than fourteen days (`publish.maxAgeDays`), and anything whose company no longer matches the watchlist when re-checked at publish time. That second check exists because of a real bug — an early matcher filed a company called "SolarSquare" under "Ola", because "Ola" appears inside "Solar". Publishing that to students would have been worse than publishing nothing, so the match is recomputed at publish time rather than trusted from storage (`src/publish.js:87-97`).

**Stage 7 — the file itself.** 262 KB. 185 jobs, of which 39 are tagged tech and 146 are not. Alongside it, 80 JPEG files in `web/public/logos/`, one per company, downloaded once each. `src/logos.js` explains why they are downloaded rather than linked: LinkedIn's image URLs are signed and expire, so a linked logo would silently break after a few weeks, and every student's browser would be sending requests to LinkedIn.

---

## 3.8 The user flow

Two humans, two paths.

**Path A — the author, once an hour, mostly invisible.**

```
  12:00  launchd fires
    |
    +--> jitter: wait 0-4 minutes
    +--> Brave opens; the feed loads; the session is confirmed
    +--> one search, paginated until LinkedIn's "Next" runs out
    +--> 0-100 jobs opened, extracted, stored
    +--> classification pass
    |
    +--> IF new jobs found:
    |      macOS notification: "3 new internships"
    |      a sound
    |      the HTML report opens in the default browser
    |
    +--> jobs.json rewritten, committed, pushed
    +--> Brave closes; the process exits
```

Total elapsed time: a few minutes on a quiet hour, up to the 45-minute ceiling set by `limits.maxRuntimeMinutes` on a busy one. Most hours find nothing new, and the README is blunt about that being the normal, healthy state: "A watchlist of large companies posts internships rarely; the tool is a tripwire for the moment one does, not a daily digest."

**Path B — a student, at any hour, with no idea any of the above exists.**

```
  opens https://www.internradar.online
    |
    +--> sees "Be early." and a list of roles, newest first
    +--> Engineering tab (39) | Everything else tab (146)
    +--> filters: search box, company, city, mode, paid, easy apply
    +--> clicks a row
    |      -> detail pane: stipend, mode, duration, posted, applicants,
    |         the summary, the skills, and two buttons
    |
    +--> "Apply on LinkedIn ->"   leaves the site entirely
    |
    +--> "Tailor my resume"
           -> uploads a PDF (read in the browser, never uploaded as a file)
           -> POST /api/tailor
           -> ~10-20 seconds
           -> a rewritten resume, a list of what changed, and a list of
              what the job wants that their resume does not show
```

Notice what a student *cannot* do: create an account, save a job, set an alert, get an email. There is no login, because there is nowhere to keep user accounts. That is not an oversight; it is the direct consequence of having no always-on server and no shared database. We will price that decision in section 3.12.

---

## 3.9 Request flow: what actually happens when someone opens the site

Now zoom right in. A student types the address and presses Enter. What happens, step by step?

Some vocabulary first.

**HTTP** is the language browsers and web servers speak. The browser sends a **request** ("give me `/styles.css`"), the server sends a **response** (the file, plus a **status code** — 200 means fine, 404 means no such thing, 500 means the server broke). A **GET** request asks for something; a **POST** request sends something. A **domain** is a human-readable name like `internradar.online`. **DNS** is the phone book that turns that name into a numeric address. A **CDN** (content delivery network) is a set of copies of your files kept in many cities, so the one nearest the visitor answers.

```
  BROWSER                                              VERCEL'S EDGE NETWORK
  -------                                              ---------------------

  1. DNS lookup: www.internradar.online --> an IP address near the student
        |
        v
  2. GET /                                  --> web/public/index.html   (200)
        |
        |  the browser reads the HTML and finds what else it needs
        v
  3. GET /styles.css                        --> web/public/styles.css   (200)
     GET /app.js                            --> web/public/app.js       (200)
     GET https://fonts.googleapis.com/...   --> Google's servers        (200)
        |
        |  app.js runs: init() at the bottom of the file
        v
  4. GET /data/jobs.json?t=1785132201199    --> web/public/data/jobs.json (200)
        |
        |  185 job objects arrive as text; app.js turns them into rows
        v
  5. GET /logos/country-delight.jpg         --> a stored JPEG            (200)
     GET /logos/amazon.jpg                       (lazily, as they scroll)
        |
        v
  6. The page is finished. Nothing further happens until the student clicks.
```

Six numbered steps and — this is the point — **not one of them ran any code the author wrote on any server.** Vercel looked up files on disk and sent them. The only code of ours that executed is `app.js`, and it executed on the student's own phone or laptop.

The fetch in step 4 is `web/public/app.js:119-130`:

```javascript
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
```

- `fetch(...)` asks for a URL and returns a promise of the response. `await` waits for it.
- `?t=${Date.now()}` appends the current time as a meaningless query parameter. It exists purely to make the URL different every time, so no cache anywhere serves a stale copy. `{ cache: 'no-store' }` says the same thing to the browser directly. Belt and braces, because stale data is the one failure this site cannot tolerate — a job list that is silently a day old is worse than no job list.
- `res.ok` is true for status codes in the 200s. Anything else throws.
- `await res.json()` parses the text into a real JavaScript object.
- The two assignments copy the data into the page's in-memory state.
- The `catch` is doing something worth noticing: on *any* failure it sets the jobs to an empty array. The page then renders its "Warming up / No listings have been published here yet" empty state. A broken fetch produces a calm, complete-looking page rather than a blank screen or a console error nobody sees.

The server side of the caching decision is in `web/vercel.json`, the whole of which is short enough to read:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" }
      ]
    },
    {
      "source": "/data/jobs.json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ],
  "functions": {
    "api/tailor.js": {
      "maxDuration": 60
    }
  }
}
```

Four blocks:

- `"framework": null` tells Vercel there is no framework to detect and no build command to run. Take the files as they are.
- The first `headers` block applies to every URL (`/(.*)` is a pattern meaning "anything"). These are **response headers** — extra instructions attached to every file. `nosniff` stops browsers guessing a file's type. `X-Frame-Options: DENY` stops other websites embedding this one inside a frame. `Referrer-Policy` limits how much of the current address is leaked when a student clicks through to LinkedIn. `Permissions-Policy` switches off camera, microphone, location and Google's ad-targeting API for this site entirely — a site that never needs your camera should say so.
- The second `headers` block singles out `/data/jobs.json` and says `max-age=0, must-revalidate`: never serve this from cache without checking first. Everything else may be cached hard; the data may not.
- `functions` sets a 60-second ceiling on the one server-side function. Which brings us to it.

---

## 3.10 The single dynamic path: the tailor endpoint

Everything so far has been files. Now the exception.

`web/api/tailor.js` is a **serverless function**: a piece of code that has no server of its own, but which the hosting company will run for you, on demand, when a particular address is requested. It starts up when a request arrives, handles that request, and is thrown away. You pay (in the free tier, you are charged nothing) only for the seconds it actually ran. Chapter 13, *Serverless and the Tailor Endpoint*, is entirely about this idea.

Because Vercel is told the root directory is `web`, the file at `web/api/tailor.js` becomes the address `/api/tailor`. That is a convention, not configuration — the folder called `api` is special to Vercel.

The browser side is `web/public/app.js:554-560`:

```javascript
const res = await fetch('/api/tailor', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ resumeText, job: activeJob }),
});
```

A POST to `/api/tailor`, carrying JSON with two things: the résumé as plain text, and the job object the student selected. Note that the *file* never leaves the browser. If the student uploads a PDF, `app.js` reads it locally using a PDF library and extracts the text (`web/public/app.js:478-507`); only the text is sent.

The server side, `web/api/tailor.js:174-203`, in order:

```javascript
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }
  if (process.env.TAILOR_DISABLED === 'true') {
    return res.status(503).json({ error: 'Resume tailoring is switched off right now.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'The site is missing its API key. Contact the site owner.' });
  }

  const { resumeText, job } = req.body ?? {};

  if (typeof resumeText !== 'string' || resumeText.trim().length < 200) {
    return res.status(400).json({ error: 'That resume looks too short to work with. ...' });
  }
  if (!job?.title) {
    return res.status(400).json({ error: 'No job was selected.' });
  }

  const limit = rateLimit(clientIp(req), Date.now());
  if (!limit.ok) return res.status(limit.status).json({ error: limit.message });

  const resume = resumeText.slice(0, MAX_RESUME_CHARS);
```

Group by group:

- **Method checks.** Anything that is not a POST is refused with 405. Cheap, first.
- **A kill switch.** `process.env` holds **environment variables** — settings handed to a program from outside, rather than written in its code. If `TAILOR_DISABLED` is set to `"true"` in Vercel's dashboard, the feature is off within seconds, with no code change and no deploy. That is worth having when the thing being switched off costs money or quota.
- **The API key.** An **API key** is a secret string that identifies you to another company's service. `GEMINI_API_KEY` is read from the environment, never written in the repository. If it is missing, the function says so plainly rather than crashing.
- **Validation before anything expensive.** A résumé under 200 characters, or a request with no job, is rejected immediately.
- **Rate limiting, deliberately after validation.** A **rate limit** caps how often something may be done. Here it is 5 per hour and 15 per day per **IP address** (the numeric address a request comes from), and 200 per day across the whole site. Because validation runs first, a student who mistypes six times has not burned their hourly allowance — only real, well-formed requests count.
- **Truncation.** `MAX_RESUME_CHARS` is 18,000. A pasted novel cannot run up the bill.

Then the actual call, `web/api/tailor.js:206-222`, is a plain `fetch` to Google's REST endpoint. No SDK, no library. It sends a system instruction, the prompt, and a `responseSchema` — a description of the exact JSON shape the answer must take, which Gemini enforces. That single parameter removes a whole category of "the model returned prose instead of JSON" bugs.

And then the part that shows what the author actually cares about (`web/api/tailor.js:156-166`):

```javascript
export function findInventedSkills(resumeText, skills) {
  const haystack = String(resumeText).toLowerCase().replace(/[^a-z0-9+#./ ]/g, ' ');
  return (skills ?? []).filter((skill) => {
    const s = String(skill).toLowerCase().trim();
    if (s.length < 2) return false;
    const words = s.split(/[\s/,]+/).filter((w) => w.length > 2);
    if (words.length > 1) return !words.every((w) => haystack.includes(w));
    return !haystack.includes(s);
  });
}
```

- `haystack` is the original résumé, lower-cased, with punctuation flattened to spaces — but keeping `+`, `#`, `.` and `/`, because `C++`, `C#`, `Node.js` and `CI/CD` are real skill names and destroying those characters would produce false alarms.
- For every skill in the model's output, it asks: does this string appear in the original résumé?
- Multi-word skills ("machine learning") count as present if every significant word is present, which tolerates reordering and rephrasing.
- What comes back is the list of skills the model produced that the student's résumé never mentioned.

The caller strips those and tells the student exactly what was removed (`web/api/tailor.js:263-269`). The comment above the file says why in one sentence: a tool that quietly adds skills a student does not have is handing them a fraudulent document to send to real employers.

Here is the whole dynamic path drawn out, so you can see how little of the system it touches:

```
  STUDENT'S BROWSER                VERCEL                    GOOGLE
  -----------------                ------                    ------
   picks a job
   uploads a PDF
   [PDF -> text, locally]
        |
        | POST /api/tailor
        | { resumeText, job }
        +----------------------> cold start (~1s)
                                 tailor.js runs
                                   method check
                                   kill-switch check
                                   API key from env
                                   validate
                                   rate limit
                                        |
                                        | POST generateContent
                                        | (system prompt + job + resume)
                                        +---------------------> gemini-2.5-flash
                                                                     |
                                        <---------------------+ JSON, schema-checked
                                   findInventedSkills()
                                   strip anything invented
                                        |
        <----------------------+ 200 { tailored, meta }
   renders the rewrite
   "Download PDF" -> window.print()

  NOTHING WAS STORED ANYWHERE. The function is discarded.
  jobs.json was not touched. SQLite was not touched.
  The watcher has no idea any of this happened.
```

That last block is the point. The dynamic path is a side branch. It reads nothing the watcher wrote except the job object the browser already had, and it writes nothing at all.

---

## 3.11 Why this architecture

Now the question a first-year student should be asking: *why like this?* Most tutorials would have you build something quite different. Let us look at that something, because you cannot appreciate a design until you have seen the one it replaced.

### The "before": how you would normally be told to build this

The conventional answer in 2026 looks like this:

```
  +----------------+     +---------------------+     +----------------+
  |  React app     |     |  Express API server |     |  MongoDB       |
  |  in the browser| --> |  running 24/7 on a  | --> |  running 24/7  |
  |  (built by a   |     |  rented Linux box   |     |  on another    |
  |   bundler)     |     |  or a container     |     |  rented box    |
  +----------------+     +---------------------+     +----------------+
                                    ^
                                    |
                         +---------------------+
                         |  a cron job / worker|
                         |  that scrapes       |
                         +---------------------+
```

Four moving parts, all of which must be running at once for the site to work. To make this real you would need: a server to rent (₹400–800 a month at the cheap end), an operating system on it to keep patched, a web server in front, TLS certificates to renew, a database to install, secure, back up and upgrade, a process manager so your app restarts when it crashes, a deployment process, and a place to keep your secrets where the running server can read them.

And every one of those is a thing that can break at 2 a.m. while you are in an exam.

### What Intern Radar does instead, and what it buys

```
  +----------------+     +---------------------+     +----------------+
  |  vanilla JS in |     |  static files on    |     |  a JSON file   |
  |  the browser   | --> |  Vercel's CDN       | --> |  in git        |
  |  (no build)    |     |  (no code running)  |     |                |
  +----------------+     +---------------------+     +----------------+
                                    ^
                                    |
                         +---------------------+
                         |  a program on a Mac |
                         |  that runs and exits|
                         +---------------------+
```

Four reasons, in the order the author would probably rank them.

**1. It costs nothing. Really nothing.** Vercel's Hobby plan is free. Gemini's free tier is free and needs no card. GitHub is free. The Mac already existed. The domain is the only line item — a few hundred rupees a year. There is no card on file anywhere, which means there is no scenario in which a bug or a burst of traffic produces a bill. For a student project this is not a small thing; it is the difference between a project that survives and one that gets shut down in April when the free trial ends.

**2. There is no server to maintain.** You cannot fail to patch a server you do not have. There is no operating system to update, no `sudo apt upgrade`, no expiring certificate, no process that quietly dies on a Tuesday. Vercel serves files; that is a problem they have solved for millions of sites, and it is not your problem.

**3. No credentials sit on a server.** Think about what the watcher holds: a live LinkedIn session belonging to a real person. The README says to treat the browser profile like a password. On the conventional architecture, that session would have to live on a rented Linux box, reachable from the internet, protected by however good your server hardening happens to be. Here it never leaves a laptop. The *only* secret that exists on the internet is the Gemini API key, which is stored in Vercel's environment variables, is free to replace, and can only ever cost quota. The blast radius of a compromise is small by construction.

**4. There is almost no attack surface.** A static file cannot be injected into. There is no login form to brute-force, no session cookie to steal, no database to inject SQL into, no user data to leak — the site holds none. The one endpoint that accepts input validates it, caps it, rate-limits it, and stores nothing. Chapter 12, *Servers From Scratch*, will show you all the things that can go wrong with a server you write yourself, and the shortest way to get them all right is to not have one.

There is a fifth reason that is less about engineering and more about honesty: **the design matches the problem's actual shape.** The data changes once an hour. There are perhaps two hundred records. Nobody logs in. Nobody writes anything. A system that regenerates a page from a database on every request would be doing that work hundreds of times between two changes to the underlying data. Serving a pre-made file is not a cheap trick — it is the correct answer to a read-only problem.

---

## 3.12 What it costs

Every design decision is a trade. If a chapter only tells you what an architecture buys, it is selling you something. Here is the bill.

### Cost 1 — the data is only as fresh as the last run

The site cannot be more current than the most recent successful run. The header shows this honestly (`web/public/app.js:132-136`):

```javascript
function renderFreshness() {
  $('freshness-text').textContent = state.generatedAt
    ? `swept ${relTime(state.generatedAt)}`
    : 'standing by';
}
```

`generatedAt` came from the JSON file, and the page prints "swept 40m ago". It does not pretend. On a good day the delay is minutes. On a day when the lid was shut it is however long the lid was shut.

Notice that the site is completely unable to detect the difference between "nothing new was posted" and "the watcher has not run since Tuesday". Both look like the same file. There is no heartbeat, no alert, no "last successful run" monitor. The only person who finds out is the author, when he notices his notifications have stopped.

### Cost 2 — the site can do nothing the JSON does not already contain

This is the hardest one for beginners to internalise, so let us be concrete. Things a student cannot do on Intern Radar, all for the same single reason:

- **Search beyond what is loaded.** The search box filters the 185 records already in memory. A job that aged out fourteen days ago is not findable, because it is not in the file.
- **Read the full description.** It was deliberately dropped at publish time. There is no "load more detail" request that could go and get it, because there is nothing to ask.
- **Create an account, save a job, or set an alert.** All three need somewhere to write, and there is nowhere. The one function that runs on a server stores nothing on purpose.
- **Get a job the moment it is posted.** See cost 1.

The rule, stated once so you can carry it around: **a static site can only answer questions whose answers were baked into it before anyone asked.** The board only says what is on the sheet.

### Cost 3 — the whole thing stops when the Mac is closed

There is exactly one machine in this system that matters, and it is a laptop.

Close the lid, and no runs happen. macOS is decent about this — launchd fires once shortly after you open the lid and folds several missed slots into a single run — but a machine that is powered off for a weekend simply misses that weekend. The tool compensates for the gap in the only way it can, by widening its lookback window to cover it, which recovers the jobs but not the *timing*. The whole promise of the project is being early. A Monday-morning catch-up run finds Saturday's posting when it already has three hundred applicants.

Worse, the failure is quiet. The site does not go down. It keeps serving Friday's list, beautifully, to everyone. A dead pipeline and a slow week look identical from outside.

And there is the single point of failure for the data itself: `jobs.db` lives on that one Mac and is not in the repository. There is no backup step anywhere in the code. If the disk fails, the entire history of every job ever seen — the thing that makes deduplication work — is gone. The site would survive (its JSON is in git), but the tool would start again from nothing.

### Cost 4 — the payload only grows

Every visitor downloads the entire job list, including the 146 jobs on the tab they are not looking at. 262 KB today. Set `maxAgeDays` to 60 instead of 14 and it becomes roughly a megabyte, and every phone on a patchy connection pays that before seeing a single row. There is no pagination and no server-side filtering, because there is no server to do the filtering. The 14-day window is not only about relevance; it is also what keeps the file small enough for this design to work at all.

### Cost 5 — git is being used as a data pipeline

It works, and it is elegant, but be clear-eyed. Every run that changes anything writes a commit. The project's history is now a mixture of human commits (`Shrink the header, outline every job`) and machine commits (`Refresh job listings`), which makes the log harder to read. Binary JPEGs are committed too, and git stores every version of a binary file forever — the repository can only grow. A hosting provider that charged for build minutes would be charging for a build triggered by a robot every hour.

There is also a small race: if the author is editing the site while a run pushes, git can reject the push. The code handles this by warning and moving on, leaving the file to be pushed by hand — which is the right call, but it does mean publishing is not guaranteed.

### Cost 6 — the rate limiter is a speed bump, not a lock

The tailor endpoint counts requests in a plain JavaScript `Map` in memory. Serverless instances are created and destroyed constantly, and each one has its own counter. The file says so itself (`web/api/tailor.js:36-39`): "Serverless instances recycle, so this is a speed bump rather than a vault." It stops runaway loops and casual abuse. It would not stop someone determined. Doing better requires shared state — a database, a Redis, something always-on — which is precisely what this architecture has removed. That is the trade, named honestly in a comment.

### Cost 7 — it depends on things outside its control

LinkedIn's terms of service prohibit automated scraping, and the README says so in its first section rather than burying it. The design mitigates the risk — one search, low volume, human pacing, an immediate stop on any challenge — but cannot remove it. Separately, LinkedIn rotates its CSS class names, and when it does, the extraction breaks. The code is built to fail *loudly* in that case rather than quietly reporting "no jobs today", which is the right choice, but the maintenance burden is real.

And although the site is "static", the page does load two things from other companies: web fonts from Google, and a PDF-reading library from a public CDN (`web/public/app.js:3-4`). If either is unreachable, the fonts fall back and PDF upload fails — the paste-as-text path still works. Nothing here is a crisis, but "zero dependencies" is a claim about npm, not about the network.

---

## 3.13 What this project is not

Because you may have arrived expecting something else, here is the list, plainly.

- **No React**, and no other front-end framework. `web/public/app.js` builds elements with `document.createElement`. Chapter 9 teaches React properly and then compares.
- **No Express**, and no back-end framework. `web/serve.js` is a local preview server written directly on Node's built-in `node:http` module, exactly 100 lines. In production it is not used at all — Vercel does that job. Chapter 12 covers it.
- **No MongoDB**, and no database server of any kind. SQLite, through Node's built-in `node:sqlite`. Chapter 14 covers it.
- **No TypeScript**, no bundler, no build step, no Tailwind, no Sass.
- **No test framework.** Three files in `test/` run directly with `node`, using assertions built into Node itself.
- **Exactly one npm dependency.** Here is the entire dependency list, from `package.json:23-25`:

```json
"dependencies": {
  "playwright-core": "^1.56.0"
}
```

One line. **npm** is the package manager for JavaScript — the thing that downloads other people's code into your project. A **dependency** is a package your project needs to run. A typical project of this size has several hundred, arriving as a tree of packages that depend on packages that depend on packages. This one has one, and it is there because writing a browser-automation protocol yourself is genuinely not sensible.

That is not asceticism for its own sake. Every dependency is code you did not write, running with your permissions, that you must keep updated and trust. Chapter 11, *Modules, npm, and the One-Dependency Rule*, asks the question this project keeps asking — "did we actually need a library for this?" — and shows the several places where the answer turned out to be no.

---

## Chapter summary

- Internship postings in India collect hundreds of applicants within a day, so the useful window for applying is measured in hours, and the project exists to shrink the delay between "posted" and "you know about it".
- Intern Radar is **two programs**, not one: a watcher that runs on the author's Mac and exits, and a static site hosted on Vercel that has no code of its own running between visits.
- The two halves communicate through exactly one artefact — the file `web/public/data/jobs.json` — which the watcher writes, commits to git, and pushes to GitHub, where Vercel picks it up and redeploys.
- There is no always-on backend, no shared database between the halves, and no direct connection of any kind from the site back to the watcher.
- The watcher is started by macOS's launchd every hour on the hour, plus up to four minutes of deliberate random jitter; the stale comments in `src/index.js` and `bin/install-schedule.sh` that say "12:00 and 18:00" describe an older schedule and are wrong.
- Data flows LinkedIn → a real Brave browser driven by Playwright → local filters ordered cheapest-first → extraction and summarising → SQLite on the Mac → classification → a published JSON file → git → Vercel → the student's browser.
- The employer is checked before anything else, so a nine-hundred-company watchlist costs no extra requests: matching happens in memory against cards already on screen.
- Full job descriptions are stored locally but deliberately never republished, because they are the posting company's copyrighted text; students get a generated summary and a link to the source.
- Opening the site triggers only file requests — HTML, CSS, JavaScript, one JSON file, some JPEGs — and the only code of the author's that runs during a visit runs inside the visitor's own browser.
- The one dynamic path is `web/api/tailor.js`, a serverless function that rewrites a résumé for a chosen job, checks the model's output against the original, strips anything invented, and stores nothing.
- The architecture is chosen for zero cost, nothing to maintain, no credentials on any internet-facing machine, and almost no attack surface.
- The price is real: the data is only as fresh as the last run, the site can never answer a question the JSON does not already contain, no student can log in or save anything, and the entire pipeline stops the moment the author's Mac is closed — silently, while the site keeps serving stale data perfectly.

## Key takeaways

The single most important sentence in this chapter is that Intern Radar is two programs joined by a file in git, and that nothing a visitor does can ever reach LinkedIn. Once you hold that, every other question about the project — why there is no login, why the search only covers fourteen days, why the freshness label exists — answers itself. The architecture was chosen because the problem is read-mostly and changes once an hour, and for that shape of problem a pre-built file is not a shortcut but the correct answer. What it costs is freshness, interactivity, and a dependence on one laptop staying open — and a design you cannot state the costs of is a design you do not yet understand.

## Real-life analogy revisited

The clerk and the notice board hold up all the way down.

The clerk walks to the office on a schedule (launchd, every hour) and, so as not to be predictable, does not leave at the same second each time (`startupJitter`). At the office the clerk reads every notice on the board but only copies down the ones from departments on a list in their pocket (`matchCompany`, the first gate). For most notices, reading the heading is enough to know they are irrelevant, and only a few get taken down and read in full (opening a job page). The clerk keeps a private ledger at home of every notice ever seen, so the same one is never copied twice (`jobs.db`, which lives outside the project and is in no repository).

Back at the department, the clerk does not annotate the old sheet. A completely new sheet is written each time, holding only the last fortnight of notices (`publish.maxAgeDays`), and the old one comes down. The full text of each notice is not copied out — that belongs to whoever wrote it — only a summary and a pointer to where the original is pinned.

And the board itself: it is genuinely and permanently dumb. It cannot fetch, cannot answer, cannot remember who read it. It works at 3 a.m. and during a power cut. If a student stands in front of it asking for something that is not on the sheet, there is nobody there to hear the question. If the clerk is ill for a week, the board goes on showing last week's sheet to everyone, confidently, with no sign that anything is wrong.

The one exception is a small window beside the board with a bell on it. Ring it and someone will, in twenty seconds, rewrite your own application letter to suit one of the notices — using nothing but words you already wrote, and keeping no copy. That is `web/api/tailor.js`. It is the only living thing on that wall, and even it forgets you the moment you walk away.

## Frequently asked questions

**Why can't I just have the website scrape LinkedIn when someone opens it?**
Three reasons, any one of which is fatal. Scraping needs a logged-in LinkedIn session — you would be handing a real person's account to a public web page. It takes minutes, and the visitor would sit staring at a blank screen. And two hundred visitors would mean two hundred simultaneous LinkedIn sessions from one account, which is precisely the request volume that gets accounts restricted. The watcher does it once an hour, on one machine, at a human pace, and everyone shares the result.

**If both halves are in one folder and one repository, in what sense are they two programs?**
In the sense that matters: they are started by different things, at different times, on different computers, and neither can call the other. `src/index.js` is run by launchd on a Mac. `web/api/tailor.js` is run by Vercel in a data centre. `web/public/app.js` is run by a student's phone. They share a folder for convenience — one place to edit, one history — not because they are one system at run time.

**Why a JSON file? Wouldn't a real database be more professional?**
"Professional" is not a property of a technology; it is a property of a fit. The data changes once an hour, is read many times, is about a quarter of a megabyte, and is never written by a visitor. A file served from a CDN answers that perfectly, at zero cost, with nothing to secure or back up. A database would add a server, a connection, credentials, and a new way to be down — in exchange for capabilities this site does not use. Note that there *is* a real database in the project: SQLite, on the Mac, where the writes actually happen.

**What happens if two runs overlap?**
They cannot. A run writes a lock into the settings table at the start and clears it at the end (`src/index.js:150-160`). A second run that finds a fresh lock logs "Skipping this slot" and exits. The lock self-expires after `maxRuntimeMinutes` so a crashed run cannot wedge the schedule permanently — which is why `config.json` keeps that value at 45 with hourly runs.

**Is the résumé I upload stored anywhere?**
Not by this project. The PDF is read inside your own browser and only the extracted text is sent. The function holds it in memory for one request, never writes it to disk and never logs it. But the text *is* sent to Google's Gemini API on the free tier, and Google's free tier permits them to use submitted data to improve their models. The upload screen says exactly that before you pick a file, and the README instructs that the notice must not be removed.

**Why does the tailor endpoint refuse to add skills, even if I ask it to?**
Because a résumé is a document you send to a real employer with your name on it. A tool that adds "Kubernetes" to your skills because the job wanted Kubernetes has not helped you; it has written a lie and put your name under it. The prompt forbids it, the output is checked against your original text, and anything invented is stripped and reported back to you. What the tool will do instead is tell you honestly which of the job's requirements your résumé does not evidence.

**Could this run on a cloud server instead of a Mac, so it never sleeps?**
Technically yes, and it would fix the closed-lid problem. It would also put a live LinkedIn session on an internet-facing machine, cost money, require a Linux box with a graphical browser, and make the account look like it is browsing from a data centre — which is far more suspicious than browsing from a home connection. The current design trades reliability for safety and cost. That is a defensible trade, not an accident.

**How do I know if the watcher has stopped running?**
From the site, you cannot, and that is a genuine gap. The nearest thing is the "swept 3h ago" label in the header, computed from `generatedAt` in the JSON. Locally the author checks `tail -20 ~/Library/Logs/linkedin-watcher/run.log` or `node bin/show-report.js --runs`. Building an actual alert — the site noticing its own data has gone stale — is left as an exercise below.

## Common beginner mistakes

**1. Believing the site talks to LinkedIn.**
*What they do:* Open `web/public/app.js` looking for the scraping code.
*Why it seems right:* It is all one repository, and the site clearly shows LinkedIn data.
*What actually happens:* They waste an hour, then conclude the code is hiding somewhere clever.
*The fix:* The site reads one file, `/data/jobs.json`. Trace `loadJobs()` at `web/public/app.js:119` and notice it is the *only* place the site gets job data. All the LinkedIn code is in `src/`, which never ships to Vercel in any executable sense.

**2. Editing `jobs.json` by hand to fix something.**
*What they do:* Correct a company name directly in the published file and push.
*Why it seems right:* It is just a file, and the fix appears on the site within a minute.
*What actually happens:* The next run regenerates the file from SQLite and the edit vanishes. The bug is still in the database.
*The fix:* Treat `jobs.json` as output, never input. Fix the cause — the watchlist, the matcher, or the row in `jobs.db` — and let the next publish rewrite the file.

**3. Expecting the site to update the instant a run finds a job.**
*What they do:* Watch the browser during a run, refreshing.
*Why it seems right:* The run said it found something.
*What actually happens:* Nothing, for a while. The publish step is the last thing in the run, then git has to push, then Vercel has to redeploy. Roughly a minute after the push, not after the find.
*The fix:* Read `src/index.js:669`. Publishing happens once, at the end, not per job.

**4. Assuming a quiet run means the tool is broken.**
*What they do:* See "0 new jobs" several times and start debugging selectors.
*Why it seems right:* A tool that finds nothing feels broken.
*What actually happens:* They change working code. The README is explicit that zero results run after run is the normal state for a watchlist of large employers.
*The fix:* Ask the data instead of guessing. `node bin/show-report.js --runs` shows cards seen per run. Healthy `cards_seen` with zero new jobs means the filters worked. `cards_seen` of zero means something really is wrong.

**5. Putting the API key in the code, or in `.zshrc`.**
*What they do:* Paste `GEMINI_API_KEY` into a source file, or export it in their shell profile.
*Why it seems right:* It works when they run the program by hand.
*What actually happens:* In the source file, the key is committed to a public repository. In `.zshrc`, the scheduled run cannot see it — launchd gives a job almost no environment, so the exported variable never arrives, and the 12:00 run silently behaves as if there were no key at all.
*The fix:* A `.env` file at the project root, which is gitignored and which `src/index.js:93-99` loads explicitly for exactly this reason. For the site, use Vercel's environment variables.

**6. Adding a dependency without asking whether it is needed.**
*What they do:* `npm install dotenv`, `npm install express`, `npm install better-sqlite3`.
*Why it seems right:* Every tutorial starts that way.
*What actually happens:* Three packages that Node 22 already provides — `process.loadEnvFile`, `node:http`, `node:sqlite` — arrive with their own dependency trees, their own update burden, and their own supply-chain risk.
*The fix:* Before installing, check whether Node has it. This project's entire production dependency list is one line, and that is the result of asking every time.

**7. Removing the free-tier disclosure from the upload screen.**
*What they do:* Delete the warning block because it is long and makes the page look scary.
*Why it seems right:* It is ugly, and "we don't store anything" is already said in the footer.
*What actually happens:* Students upload personal documents to a service whose terms permit the provider to train on them, without being told.
*The fix:* Leave it. The README says explicitly not to remove it. "We don't store it" and "we send it to Google, who may keep it" are different claims, and only one of them is the whole truth.

**8. Scheduling the project from `~/Desktop`.**
*What they do:* Keep the project on the Desktop and run `npm run install-schedule`.
*Why it seems right:* It runs perfectly from Terminal.
*What actually happens:* The installer refuses. If forced, the scheduled run silently fails because Desktop is a TCC-protected folder and a launchd-spawned process has no permission grant for it.
*The fix:* `bash bin/install-schedule.sh --relocate`, which moves the project somewhere readable and leaves a symlink behind so your old path keeps working.

## Interview questions

**1. Describe the architecture of Intern Radar in under a minute.**
It is two programs joined by a file. A Node.js watcher runs on a Mac every hour under launchd, drives a real Brave browser with Playwright to search LinkedIn for internships at a watchlist of about nine hundred companies, extracts and classifies them, and stores everything in a local SQLite database. At the end of each run it writes the last fourteen days of listings to `web/public/data/jobs.json`, commits it, and pushes to GitHub. Vercel is connected to that repository and redeploys a static site within about a minute. There is no always-on backend; the only server-side code is one serverless function that tailors a résumé.

**2. Why is there no server, and what would you have had to do if there were one?**
Because the problem is read-mostly: the data changes once an hour, is about a quarter of a megabyte, and no visitor ever writes anything. A pre-built file on a CDN answers that perfectly. Having a server would mean renting a machine, patching its operating system, renewing certificates, running and backing up a database, keeping a process alive, and storing a live LinkedIn session on an internet-facing box. All of that is cost and risk in exchange for capabilities the site does not use.

**3. How do the two halves of the system communicate, and what are the consequences of that choice?**
Through a single JSON file committed to git; the push is the message and Vercel's deploy hook is the delivery. The consequences are that publishing is atomic and versioned — you can see in the history exactly what the site showed at any moment — and that it costs nothing. The costs are that latency is bounded by the run schedule, that the repository grows forever including binary logos, that machine commits are interleaved with human ones, and that a push conflict can delay publication.

**4. What can the site not do, and why?**
It cannot search beyond the fourteen days in the file, show full job descriptions, offer accounts, save jobs, send alerts, or reflect a job posted five minutes ago. Every one of those has the same cause: a static site can only answer questions whose answers were baked in before anyone asked, and there is no server-side store to write to. The one server-side function that does exist deliberately stores nothing.

**5. Walk me through what happens when a student clicks "Tailor my resume".**
The PDF is read in the browser and converted to text locally, so the file itself never leaves the machine. The page POSTs the text plus the selected job to `/api/tailor`. Vercel cold-starts the function, which checks the method, a kill-switch environment variable, the presence of the API key, then validates the input, then applies per-IP and global rate limits. It calls Gemini over plain `fetch` with a response schema that forces valid JSON. The result is checked against the original résumé, any skill that does not appear in the source is stripped and reported back, and the response is returned. Nothing is stored and the function is discarded.

**6. The watcher checks about nine hundred companies. Doesn't that mean nine hundred requests?**
No — it means zero extra requests. The tool runs one broad search for internships and paginates until LinkedIn's own "Next" control runs out. The company check happens in memory against cards that are already on screen, as the very first filter. Adding a company to the watchlist costs nothing. Doing it the other way, one jobs page per company, would be roughly 880 page loads per run instead of ten to thirty, for the same result — and request volume is what gets accounts restricted.

**7. What is the biggest weakness of this design, and how would you address it?**
That the entire pipeline depends on one laptop being open, and that its failure is silent — the site keeps serving stale data perfectly. I would address the visibility problem first, because it is cheap: the site already knows `generatedAt`, so it can show a clear warning when the data is more than a few hours old rather than a quiet "swept 2d ago". The reliability problem itself is harder, because moving the watcher to a cloud machine would put a live LinkedIn session on an internet-facing box and make the traffic look like a data centre — which is the risk the current design was built to avoid.

**8. Why are job descriptions stored but not published?**
Because they are the posting company's copyrighted text, and republishing them wholesale is a much larger exposure than showing a generated summary with a link to the source. They are kept locally because the classifier and summariser need them — an ambiguous title like "Graduate Engineer Trainee" can only be settled from the description. `src/publish.js` drops the field on the way out unless `publish.includeFullDescription` is explicitly turned on, and `config.json` keeps it off.

## Exercises

**1. Read the published file.** Open `web/public/data/jobs.json` in a text editor. Find `count`, `techCount` and `generatedAt` at the top. Convert `generatedAt` to a readable date — in a terminal, `node -e "console.log(new Date(PASTE_THE_NUMBER).toString())"`. How old is the data you are looking at? Now find one job and list every field it has. Which fields are `null`, and can you work out why from `src/publish.js`?

**2. Trace one value from the file to the screen.** Pick `stipendStatus` on any job. Find where it is set on the way out (`src/publish.js`) and where it is read on the way in (`web/public/app.js`). Write down, in your own words, what the site shows for each of the three possible values, and why the author decided "unknown" is a better answer than a blank space.

**3. Run the site locally.** From the project root, `npm run web`, then open `http://localhost:4321`. It serves the same files Vercel serves, using `web/serve.js`. Now break it on purpose: rename `web/public/data/jobs.json` to `jobs.json.bak` and reload. What does the page show? Find the code in `app.js` that produced that outcome. Rename the file back.

**4. Prove the two halves are separate.** With the local site running, switch off your WiFi and reload the page. Some things break and some do not. Write down which, and explain each from what you know about where the files come from. (Hint: look at lines 3-4 and 39-41 of the files involved.)

**5. Change the shape of the published data.** In `config.json`, change `publish.maxAgeDays` from 14 to 3. Then run `node -e "..."` — or more simply, read `src/publish.js:80` and work out on paper how many of the 185 jobs would survive. Now check your answer against the data: count how many jobs in `jobs.json` have a `firstSeenAt` within three days of `generatedAt`. Set the value back to 14 when you are done.

**6. Add a company and predict what happens.** Add an entry to the `companies` array in `config.json` for a company you would like to work at. Do *not* run the scraper yet. Write down, before running anything, what you expect to happen on the next run: how many extra requests to LinkedIn will this cause, and when would you first see a result? Then check your prediction against `src/index.js:289-294` and the README's description of local filtering.

**7. Make staleness visible.** Edit `web/public/app.js` so that when `generatedAt` is more than six hours old, the freshness indicator says something clearly different — for example "data may be stale". Test it by temporarily editing `generatedAt` in your local copy of `jobs.json` to a much older number. This is a real gap in the project, and a genuinely useful contribution.

**8. 🔴 Design the replacement pipeline, on paper.** Suppose the author's Mac is no longer available and the watcher must move to a machine that is always on. Write two pages covering: where it would run and what that costs; how the LinkedIn session would be created and protected there; how detection risk changes when traffic comes from a data centre rather than a home connection; whether git-as-a-pipeline still makes sense or should be replaced, and by what; how `jobs.db` would be backed up; and what new failure modes you have introduced. Then argue, in a paragraph, whether you would actually do it. There is no correct answer — there is only a defensible one, and the argument is the exercise.

## Quiz

1. How many separate programs make up Intern Radar, and what starts each of them?

2. What is the *only* thing the watcher and the site share at run time?
   a) a MongoDB database  b) an HTTP API  c) a JSON file committed to git  d) a shared memory buffer

3. True or false: when a student opens `internradar.online`, the site queries LinkedIn for the latest jobs.

4. What triggers a Vercel deployment?
   a) a scheduled timer on Vercel  b) a git push to the connected GitHub repository  c) the watcher calling a Vercel API  d) a student loading the page

5. Name the single npm dependency this project has in production, and say why it is there.

6. Why does the watcher check the employer's name before it checks anything else about a job card?

7. The site cannot show a job's full description. Give the reason, and say where in the code the decision is made.

8. What happens to the public site if the author's Mac is closed for three days?
   a) it shows an error page  b) it goes offline  c) it keeps serving the last published list with no visible failure  d) it falls back to scraping LinkedIn itself

9. Where does the tailor endpoint store the résumé text it receives?

10. The comment at the top of `src/index.js` says the program runs at 12:00 and 18:00, but the LaunchAgent configuration says otherwise. Which is correct, and what general rule does this illustrate?

## Where this leads

You now know what the system is and how its two halves are joined. What you do not yet know is where anything sits. Chapter 4, *The Shape of the Folder*, walks the repository directory by directory — `src/`, `bin/`, `web/`, `test/`, and the loose files at the root — and explains why each thing is where it is, including why the database deliberately lives outside the project altogether. After that, Part III turns to the browser half, starting with Chapter 5, *HTML: The Skeleton*, and the 210 lines of `web/public/index.html`.

---

### Answers

1. **Two.** The watcher (`src/`, `bin/`) is started by macOS's launchd, every hour on the hour. The site (`web/`) is not "started" at all in the usual sense — its files are served by Vercel when a browser asks, and its one serverless function is started by Vercel on each request to `/api/tailor`.

2. **(c) a JSON file committed to git** — `web/public/data/jobs.json`. There is no API between them and no shared database.

3. **False.** The site fetches `/data/jobs.json`, a file that was written during an earlier run of the watcher. No visitor action can reach LinkedIn. The only outbound call the site makes is to Google's Gemini API, from the tailor endpoint.

4. **(b) a git push to the connected GitHub repository.** `src/publish.js:171-172` pushes; Vercel is watching the repo and redeploys within about a minute.

5. **`playwright-core`.** It drives the real Brave browser that the watcher uses to read LinkedIn. Everything else the project needs — HTTP, SQLite, environment-file loading, test assertions — comes from Node itself.

6. Because it is the cheapest possible filter and it eliminates the most work. The company name is already on the card in memory, so the check costs nothing, and a posting from an off-watchlist employer is dropped before any title parsing, any role classification, any API call, and above all before opening the job page. This is what lets a nine-hundred-company watchlist cost zero extra requests.

7. Full descriptions are the posting company's copyrighted text, so republishing them wholesale is an exposure the project chooses not to take. The decision is in `src/publish.js:74` — `description: includeFullDescription ? row.description : null` — with `publish.includeFullDescription` set to `false` in `config.json`. The description is still stored locally, because the classifier and summariser need it.

8. **(c) it keeps serving the last published list with no visible failure.** That silence is the design's most serious weakness. The only clue is the "swept 3d ago" label, computed from `generatedAt`.

9. **Nowhere.** The text lives in memory for the length of one request and is never written to disk or logged. It is, however, sent to Google's Gemini API on the free tier, whose terms permit Google to use submitted data to improve their models — which is why the upload screen discloses this before a student chooses a file.

10. **The LaunchAgent configuration is correct: the watcher runs every hour.** The comments are stale, left over from an earlier schedule. The general rule is that comments are a human's claim about a program, while the code is the program; when they disagree, believe the code — and then fix the comment.
