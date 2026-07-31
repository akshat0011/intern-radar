# Intern Radar — what changed, and how it all works

*Written to be readable without knowing the codebase. Jargon is explained the first time it appears.*

---

## The one-paragraph version

Intern Radar used to be **one collector** (a robot that reads LinkedIn) feeding **one website**. It is now
**two collectors** feeding the same website: the LinkedIn robot, plus a second one that reads job
listings straight from the software companies use to manage hiring. Along the way the site moved to a
new domain, dropped every non-engineering role, gained a feed you can subscribe to, and had a family
of bugs fixed that were silently killing about one run in four.

---

## Part 0 — The mental model

Three things, and it helps enormously to keep them separate in your head.

```
   COLLECTORS  ───────────►   THE DATABASE   ───────────►   THE WEBSITE
   (find jobs)                 (remembers)                   (shows them)

   1. LinkedIn scraper         one SQLite file               internradar.info
      every 15 min             on your Mac                   static files
   2. ATS poller                                              on Vercel
      every 15 min
```

**A collector** finds jobs and writes them down. It does not care what happens next.

**The database** is one file on your Mac. It is the only thing that remembers anything.

**The website** reads a single file (`jobs.json`) that gets generated from the database and pushed to
GitHub. Vercel notices the push and puts it live. The website has no server and no database of its
own — it is just files.

The important property: **the collectors and the website never talk to each other.** A file in Git is
the only connection. That is why a whole new collector could be added without changing the website at
all.

---

## Part 1 — The domain moved

**What happened:** the registry that runs `.online` domains suspended `internradar.online` for
"suspicious activity". Suspended at the registry level means it is removed from the internet's phone
book entirely — it does not just stop working, it stops *existing* as far as DNS is concerned.

**Why it mattered more than it looks.** A constant in the code called `SITE` was still set to
`internradar.online`. That one value is used to build:

- the *canonical URL* on every page (a tag that tells Google "this is the real address of this page")
- `sitemap.xml` (the list of every page you want Google to find)
- `robots.txt`
- the structured data on each job page

So every single page was telling Google "the real version of me lives at a domain that no longer
exists." Fixing one line fixed all 340 pages, because they are all generated from it.

**One trap worth knowing.** The scraper publishes by committing a *narrow list* of files — deliberately,
so an unattended run can never commit half-finished code. `web/public/index.html` is not on that list.
So the automatic publish would have fixed every job page and left the homepage pointing at the dead
domain forever. That needed a manual commit.

---

## Part 2 — The site is engineering-only now

**Before:** 393 listings, of which only 79 were engineering. Four out of five were sales, legal,
content and procurement roles, on a site whose title, tagline and README all say *engineering*.

**Now:** engineering only, enforced in two places.

1. **While collecting** — a title the classifier is confident is non-technical is dropped immediately
   and never stored. (`matching.storeNonTechRoles`)
2. **While publishing** — only rows marked technical reach the site. (`publish.techRolesOnly`)

Why two places? Because they protect against different things. The first stops you *storing* rubbish.
The second stops old rubbish, stored before the rule existed, from *appearing*.

**A detail that matters.** The publish filter tests `is_tech === 1`, not "is `is_tech` truthy". The
column has three possible values:

| Value | Meaning |
|---|---|
| `1` | confirmed technical |
| `0` | confirmed not technical |
| `NULL` | **not decided yet** |

`NULL` is not "probably fine". It means a job arrived and nothing has judged it. Treating it as
maybe-technical would publish unjudged roles. So `NULL` is excluded, and a later pass decides.

The filter runs at publish time rather than being a `DELETE`, so **nothing was thrown away**. The 312
non-engineering rows are still in the database. Flip `techRolesOnly` to `false` and they all come
back.

**Results:** 393 → 79 listings. `jobs.json` went from 557 KB to 133 KB. The share of pages Google is
allowed to index went from 71% to 94%.

---

## Part 3 — A feed, so people don't have to remember to visit

The site's entire promise is *be early*. That is wasted on someone who checks twice a week.

So every publish now also writes two files:

- `feed.xml` — RSS, the format news readers have used for twenty years
- `feed.json` — JSON Feed, the modern equivalent

A **feed** is just a file listing the newest items. Point any reader at it and new internships arrive
wherever you already read things. No accounts, no email service, no backend — it slots into the
existing design as two more generated files.

Both carry *your* summary of each role and never the employer's own description, for the same reason
the job pages don't: that text is the employer's copyright.

---

## Part 4 — The scraper was failing about a quarter of the time

The database recorded **11 failures in 40 runs**. They looked like four unrelated problems. They were
mostly one chain, and finding the root cause needed the run history rather than the error messages —
the error messages were all describing the *symptom*.

### The chain

**Step 1 — the CAPTCHA wait ignored the run budget.**

When LinkedIn shows a security check, the tool refuses to solve it (deliberately) and instead waits
for a human. That wait was hardcoded at **12 minutes**, decided in a file that had no idea how long
the run was allowed to take.

**Step 2 — so a run blew past its own time limit.**

Runs are allowed 12 minutes. One recorded run took **59.6 minutes**.

**Step 3 — so the lock expired while the run was still alive.**

Only one run may happen at a time, enforced by a *lock* — a note in the database saying "a run started
at this time". To stop a crashed run wedging the schedule forever, the lock expires. It expired at
*exactly* the run's time budget.

That is the bug. The budget only limits the *scanning* part. Classifying, summarising, generating
pages and publishing all happen afterwards. So a perfectly healthy run always finishes a bit *after*
its budget — and got declared dead.

**Step 4 — so the next run started on top of the previous one.**

It cleared the "stale" lock and launched a browser. But the first run's browser was still alive and
holding the browser profile. Two browsers cannot share one profile, so the new one waited... and
timed out.

**Step 5 — which is the error you actually saw.**

`launchPersistentContext: Timeout 90000ms exceeded`. An error about launching a browser, whose real
cause was a CAPTCHA wait four steps earlier.

### The fixes

- The CAPTCHA wait now receives the run's remaining time and never exceeds it. If there is no time
  left, it stops immediately rather than blocking the next slot.
- The lock now expires at **budget + 8 minutes**, so finishing normally is not mistaken for dying.
- Clearing a genuinely stale lock now also kills any leftover browser.

### Two more, unrelated

**Launching is retried.** A browser launch failure used to end the run. The causes are all
temporary — the Mac waking from sleep as the schedule fires, a moment of heavy load — so it now
tries three times with a cleanup between each.

**Network blips are retried.** One run died on `ERR_NETWORK_CHANGED`, which is what a laptop reports
when it switches Wi-Fi. A whole 15-minute slot thrown away over a handover that had already
recovered. Those retry now.

Crucially, **only those**. A rate-limit response is *not* retried, because retrying into a rate limit
is exactly how a slowdown becomes a ban.

### Something I got wrong, and how it was caught

My first theory was that leftover browsers were holding the profile, so I wrote a function to find and
kill them. It never once found anything — the logs proved it. The theory was wrong; the lock-expiry
bug above was the real cause. I also claimed the `ps` command was truncating its output and that this
hid the leftover browsers. Measuring it showed both forms return an identical 4,414 characters. Both
wrong claims are now corrected *in the code comments*, because a confident wrong explanation left in a
comment is worse than no comment.

---

## Part 5 — Jobs that were stuck with no details

**The symptom:** a job on the site showing "stipend: not stated" and no duration, when the LinkedIn
posting plainly said *₹15,000 per month, 3 months*.

**The cause, which was a design decision colliding with itself.** To save time, a role the classifier
is confident is non-technical is stored from the search-results card alone — its page is never opened,
so there is no description.

But the step that generates summaries only looks at jobs that *have* a description. And a later scan
skips jobs it already knows about. So those rows could never improve. **89 postings** were permanently
stuck as bare titles.

**The fix:** a small pass at the end of each run that opens a few of them and fetches what was skipped.
Capped, and it stops the moment the run is out of time, so it only ever uses leftover slack.

**A second bug hiding underneath.** The first version of this fetched nothing at all — every
description came back **0 characters**. The reason: LinkedIn has *two* layouts for a job. The
standalone page at `/jobs/view/123` looks different from the panel inside search results, and every
selector in the code was written for the panel. Navigating to the standalone page silently produced
nothing. Switching to a URL that renders the panel fixed it. The job from the example now correctly
reads ₹15,000/month, 3 months.

---

## Part 6 — The new collector: reading company hiring systems directly

This is the biggest change, and the idea behind it is worth understanding.

### Why LinkedIn is the wrong place to look

When a company opens a role, it posts to its **ATS** — *applicant tracking system*, the software that
manages hiring. Greenhouse, Lever, Workday and so on. The LinkedIn listing is a **copy**, created
afterwards.

So watching LinkedIn means watching a copy. Reading the ATS means reading the original.

### The part that makes it practical

You might think reading 900 company career pages means handling 900 different website layouts. It
would — and it would be unmaintainable.

But almost no company builds its own hiring system. They rent one. And several of those rental
platforms publish a **public API** — a fixed web address that returns clean, structured data instead
of a web page:

```
https://boards-api.greenhouse.io/v1/boards/dropbox/jobs
https://api.lever.co/v0/postings/meesho?mode=json
https://api.ashbyhq.com/posting-api/job-board/atlan
```

No browser. No fragile pattern-matching against HTML. No terms-of-service problem, because these
endpoints exist to be read — they are what the company's own careers page calls to draw itself.

Eight are supported, all free and needing no key: **Greenhouse, Lever, Ashby, SmartRecruiters,
Workable, Recruitee, Personio, BambooHR.**

### The two-step design

Finding *which* system a company uses is slow. Reading the jobs is fast. A company changes its hiring
software maybe once every few years; its job listings change hourly. So the two are separate:

**Step 1 — discovery** (`bin/discover-ats.js`), run occasionally. Works out that Dropbox is on
Greenhouse under the name `dropbox`, and remembers it in the database.

**Step 2 — polling** (`bin/poll-ats.js`), run every 15 minutes. Reads the remembered addresses and
stores any internships found.

### Verification: the part that nearly went wrong

Discovery guesses. It turns "Dropbox" into `dropbox` and tries it. That guess *must* be checked,
because these platforms hand out a web address to anyone who signs up — and plenty of those free
trials were started using a famous company's name and then abandoned.

Two real examples from your watchlist:

- `accenture.recruitee.com` exists and serves two jobs. One is titled **"Senior Marketer (Sample)"**.
  It is an abandoned trial account, not Accenture.
- `meta.recruitee.com` exists and serves postings stamped with the company name
  **"Addis Ababa University"**.

Publishing either would have put an **invented job under a real employer's name** on a public site.
That is the worst mistake this project can make — worse than missing a listing entirely.

So verification no longer trusts the guess. Where a platform states the employer, that is checked
against the company we asked for. Plus a screen for "sample"-style titles that betray a demo account.

### A bug in the checker itself

The first verifier treated *"I could not reach the platform"* the same as *"the platform said no"*. So
a single network timeout deleted SingleStore — a company whose Greenhouse page plainly returns
`{"name": "SingleStore"}`.

That is the same class of error as a silent zero: an absence of information being read as a negative
answer. Now only a definite "no" can remove a board, every check gets a retry, and unreachable
platforms are reported and left alone.

### Workday, and an honest negative result

Workday is the biggest gap, and it is genuinely harder.

**It publishes no public jobs API.** What exists is the undocumented address its own careers pages
call, and it needs three things a company name cannot give you: a *tenant*, a *datacentre number*
(`wd1`, `wd3`, `wd5`, `wd12`…), and a *site name* that is completely bespoke —
`NVIDIAExternalCareerSite`, `external_experienced`, `External_Career_Site`.

Could those be guessed? I tested rather than assumed, and the answer is no:

```
zzzznotarealcompany.wd5  →  HTTP 422
nvidia.wd5               →  HTTP 422   (for a wrong site name)
```

A company that cannot possibly exist answers **identically** to a real one. There is no signal to
search against, so guessing would mean thousands of requests per company at a terrible hit rate.

**What works instead:** read the company's own careers page and take the link off it. That gives the
real address rather than a guess — and it is better than guessing even for the other platforms.
Razorpay's Greenhouse board is `razorpaysoftwareprivatelimited`, which no amount of slugifying
"Razorpay" would ever produce.

It has a real limitation: careers pages built entirely in JavaScript reveal nothing to a simple
fetch, so Infosys, Swiggy and Zomato all come back empty. It complements slug-guessing rather than
replacing it.

### Staleness — a filter the LinkedIn side never needed

LinkedIn is searched with a time window, so old roles are excluded at the source. An ATS board has no
window: it lists everything still open, and companies leave roles open for months.

The first real poll surfaced postings **159 and 214 days old**. On a site whose entire promise is
being early, that is self-defeating. Being first to a seven-month-old listing is not a feature. So
ATS postings older than 30 days are skipped.

---

## Part 7 — Two collectors, one listing

Both collectors now find the same job. The site must show it once.

The rule: **the ATS version wins.** It carries the employer's real apply link instead of a LinkedIn
redirect, and its date is the actual publish time rather than "3 days ago" scraped off a card.

Getting the matching rule right took two attempts.

**First attempt:** treat two rows as the same job if the *company and title* match. This collapsed 30
identical "Apprentice" postings from American Express into one, which is a real improvement.

But it also merged Bajaj Finserv's "Functional Trainee" listings in **Ranchi, Sandila, Rasulpur,
Lucknow, Pune, Bareilly, Bengaluru and Bhopal** into a single entry — eight genuinely different
vacancies, seven of them silently hidden.

**Second attempt:** include the city. But the two collectors write cities differently — the ATS says
"Bangalore" where LinkedIn says "Bengaluru, Karnataka, India". So cities are mapped to a canonical
form first (`bangalore → bengaluru`, `gurgaon → gurugram`). Loose enough to still match the same job
across collectors, strict enough to keep eight cities apart.

---

## Part 8 — The commands you now have

```bash
npm start                 # one LinkedIn scan (the scheduler runs this)
npm run dry-run           # a tiny safe scan: one page, three jobs

npm run ats:discover      # work out which hiring system each company uses
npm run ats:discover -- --careers   # the same, by reading careers pages (finds Workday)
npm run ats:verify -- --fix         # re-check stored boards, clear bad ones
npm run ats:poll          # read every known board and store what is new
npm run ats:poll -- --dry-run       # show what would be stored, write nothing

npm run remove "Company"  # remove a company's jobs, drop it from the watchlist,
                          # and blocklist it so it cannot return
npm test                  # 222 assertions
```

Both collectors run automatically every 15 minutes. The ATS poller runs **first**, deliberately: it
needs no browser and is the most likely to succeed, so a browser that will not start costs you the
LinkedIn half of that slot and nothing else.

---

## Part 9 — What is still not done

**The résumé uploader loads code from someone else's server.** The page reads PDFs using a library
fetched from a CDN at page load, with no integrity check and no Content-Security-Policy. If that CDN
were ever compromised, the attacker's code would run on the one page where students upload personal
documents. Your README promises that file never leaves their device. This is the only thing that
could quietly break that promise. **This is the highest-priority open item.**

**No alert when a run fails.** The database has everything needed to notice "two failures in a row".
Nothing watches it. You found the browser bug by noticing, not by being told.

**Workday coverage is partial**, limited to companies whose careers page is readable without running
JavaScript.

**"Product management" and "UX" count as technical.** That is a pre-existing rule in the classifier
and it already applied to your LinkedIn listings, so I left it alone — but it means product-management
internships appear under a tab labelled *Engineering*. Worth deciding deliberately rather than by
default.

---

## The single most useful idea in here

Most of the bugs in this session were not wrong code. They were **an absence of information being read
as a negative answer**:

- A run that had not finished was read as a run that had died.
- A platform that could not be reached was read as a platform saying no.
- A description that failed to load was read as a job with no description.
- A `NULL` verdict, if it had been treated as truthy, would have been read as "technical".

Each looks different. Each is the same mistake. When something returns nothing, the question worth
asking every time is: *does this mean "no", or does it mean "I don't know yet"?* Those two need to be
handled differently, and treating them the same is how you get bugs whose symptom appears four steps
away from the cause.
