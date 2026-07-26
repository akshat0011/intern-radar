# LinkedIn internship watcher

Every three hours, opens Brave and checks LinkedIn for internships posted in the
last day at the companies on your watchlist, pulls out the details, and hands
you an HTML report — plus a public site students can browse.

It does **not** apply for you. It finds and summarises; you click Apply.

---

## Read this first

**Automated scraping is against LinkedIn's Terms of Service.** LinkedIn can
restrict or ban accounts for it. The pacing is deliberately slow and the volume
small: **one** search paginated to exhaustion, then all the filtering done
locally. Checking 860 companies costs nothing extra, because the company match
happens in memory against cards already on screen — no per-company request. That
keeps it well below the thresholds that usually trigger enforcement, but it
cannot make the risk zero. You are choosing to accept that.

**Request volume is what gets accounts banned**, far more than total runtime.
That is why the design pushes work into local filtering rather than more
queries. Visiting one jobs page per company would be ~880 loads a run against
the ~10–30 this does, for the same result.

Three design choices follow from it:

- **It stops rather than pushes through.** A CAPTCHA, a rate-limit banner, or an
  expired session ends the run. Nothing retries in a loop. After a rate limit it
  refuses to run again for 24 hours.
- **It never solves CAPTCHAs.** It pings you — sound, notification, and a modal
  dialog — brings the window forward, and waits up to 12 minutes for you to
  solve it, then carries on where it left off.
- **It never submits an application** and never types your password. You sign in
  by hand, once.

It also does not open recruiter or poster profiles. That matters: LinkedIn's
"commercial use limit" is a *profile-view* limit, so staying inside `/jobs/`
keeps this tool out of that budget entirely.

---

## Setup

```bash
cd ~/Desktop/projects/tbd && npm install
```

Sign in once. This opens a Brave window using a profile belonging to the tool —
not your everyday Brave profile, because Playwright cannot share a profile with
a running browser, and Chromium refuses remote debugging on the default one:

```bash
npm run login
```

Type your own credentials in that window. The script waits for the session
cookie to appear and never reads what you typed. The session persists, so this
is a one-time step until LinkedIn expires it.

While you are in that window, click the Brave lion and set **Shields down for
linkedin.com**. Not strictly required, but it keeps your browser fingerprint
stable between runs instead of being randomised each session.

Now set your location in **`config.json`** — one value covers every search:

```json
"defaultLocation": "India"
```

`searches` is a single broad entry — `internship`. That one query, paginated
until LinkedIn runs out of Next, returns every internship in the window; the
filtering then happens locally, which is free. Role-specific keywords were tried
and removed: they cost a full pagination pass each and found nothing the broad
sweep missed.

The watchlist itself lives in **`companies.json`** — about 860 companies with an
India presence, grouped by sector (global tech, semiconductor, Indian IT
services, quant/trading, fintech, SaaS, deeptech, edtech, healthtech,
logistics, media/gaming, cybersecurity, automotive/aerospace, FMCG).

- **To narrow coverage**, delete whole groups from that file.
- **To add your own**, put them in the `companies` list in `config.json`; the
  two are merged.

`aliases` exist because LinkedIn lists subsidiaries under their own names — a
Google posting may appear as "YouTube". Matching is normalised and whole-word,
so `"Razorpay"` already catches "Razorpay Software Private Limited" while
`"Ola"` does *not* match "Solar Industries".

Test before scheduling anything:

```bash
npm run dry-run
```

One search, one page, at most three job details, then it opens the report. Watch
the Brave window — you should see it scroll the list and click through postings
at a human pace.

Then schedule it:

```bash
npm run install-schedule
```

### The Desktop problem

The installer will **stop and refuse** if the project is in `~/Desktop`,
`~/Documents` or `~/Downloads`. That is not fussiness. Those folders are
TCC-protected, and a job started by launchd runs as a bare interpreter with no
stable code signature — so it gets no permission grant. It works perfectly when
you run it in Terminal (which already has a grant) and then fails silently at
the next scheduled slot, which is the worst possible failure mode.

The fix, which keeps `cd ~/Desktop/projects/tbd` working via a symlink:

```bash
bash bin/install-schedule.sh --relocate
```

---

## The public site

`web/` is a separate, deployable site where students browse the listings and
tailor a resume to any of them.

```
you run npm start  →  scraper finds jobs  →  writes web/public/data/jobs.json
                   →  commits + pushes    →  Vercel redeploys  →  live in ~1 min
```

Preview it locally at <http://localhost:4321>:

```bash
npm run web
```

**Deploying.** Import the GitHub repo at [vercel.com/new](https://vercel.com/new),
set **Root Directory** to `web`, and add the environment variables:

| Variable | Value |
| --- | --- |
| `GEMINI_API_KEY` | from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free, no card |
| `GEMINI_MODEL` | optional, default `gemini-2.5-flash` |
| `TAILOR_DISABLED` | set to `true` to switch tailoring off instantly |
| `RATE_LIMIT_PER_IP_HOURLY` | default 5 |
| `RATE_LIMIT_PER_IP_DAILY` | default 15 |
| `RATE_LIMIT_GLOBAL_DAILY` | default 200 — keep at or under your Gemini daily quota |

**About the resume tailoring.** It rewrites what the student already has — it
reorders, rephrases, and re-emphasises to match the job. It is explicitly
forbidden from adding a skill, employer, date or metric that is not in the
source resume, and a server-side check strips any skill that appears in the
output but not the input, telling the student exactly what was removed. It also
lists what the job asks for that their resume does not evidence. A tool that
quietly pads a resume is handing a student a fraudulent document.

Resume text is held in memory for the length of one request and never written
to disk or logged.

**A note on cost and privacy.** The whole thing runs on free tiers — Vercel
Hobby for hosting, Gemini's free tier for tailoring — so there is nothing to
pay and no card on file. The tradeoff is that Google's free tier permits them
to use submitted data to improve their models, and students are uploading
resumes. The upload screen says so in plain language before anyone picks a
file; **do not remove that notice.** If you ever move to a paid Gemini tier,
that permission no longer applies and the notice can be softened.

The rate limits exist because the free quota is shared by everyone using the
site — without them one person could exhaust the day's allowance before lunch.
Requests are validated before they count against the limit, so a student who
mistypes six times has not burned their hourly allowance.

**Company logos.** Each job card on LinkedIn carries the employer's logo, so the
URL comes free with a page we are already loading. It is **downloaded once**
into `web/public/logos/` and served from your own site rather than hotlinked:
LinkedIn's CDN links are signed and carry an expiry, so a hotlinked logo would
silently break after a few weeks and would point every visitor at LinkedIn.
Anything that is not a real image, is over 400 KB, or fails to download is
skipped, and the card falls back to a coloured badge with the company's
initials. The browser falls back too — if a stored file ever goes missing the
image removes itself and the initials show through, with no layout shift.

**What is published.** Company, role, stipend, location, work mode, duration,
the generated summary, and a link to the original posting. Full job descriptions
are deliberately *not* republished — they are the posting company's copyrighted
text. Set `publish.includeFullDescription` to `true` in `config.json` if you
want them anyway, understanding what that means.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run login` | One-time interactive LinkedIn sign-in |
| `npm run dry-run` | Small test scan (1 search, 1 page, 3 jobs) |
| `npm start` | Full scan now, exactly as the schedule runs it |
| `npm run report` | Open the most recent report |
| `npm test` | Run the extraction unit tests |
| `node bin/show-report.js --runs` | History of past runs and their counts |
| `node bin/show-report.js --skipped` | Companies seen but skipped — use this to tune the watchlist |
| `node bin/show-report.js --roles` | Role-classifier decisions — use this to tune the software filter |
| `npm run install-schedule` | Register the every-3-hours LaunchAgent |
| `npm run uninstall-schedule` | Remove the schedule (keeps your data) |

Add `--force` to override an active cooldown: `node src/index.js --force`.

---

## How a scan works

1. **Warm up.** Loads your feed first and idles a few seconds, the way a session
   normally starts, rather than deep-linking cold into a filtered search URL.
2. **Confirm the session.** Checks the `li_at` cookie *and* the page chrome.
   LinkedIn will serve a public job page to a signed-out visitor that looks
   perfectly healthy — without this check the tool would scrape that and store
   worse data thinking all was well.
3. **Search.** One broad `internship` query, restricted to internships
   (`f_JT=I`), a rolling 30-hour window, sorted newest-first (`sortBy=DD`), and
   paginated until LinkedIn's own Next control runs out — which is the only
   reliable proof the result set is exhausted. If more searches are configured
   than fit the time budget, the next run resumes where this one stopped rather
   than cutting the same tail every time.
4. **Read the list without clicking.** The results column is virtualised, so it
   gets scrolled in small steps to force every card to render; title, company,
   location and posted-time are then read straight off the cards.
   **It then keeps turning pages until LinkedIn's own "Next" button runs out**,
   which is the only reliable proof that every job in the window has been seen.
   A page count is never assumed.
5. **Filter before opening.** A card is only opened if it clears four cheap
   local checks: posted inside the window, the title reads as an internship,
   **the role is software**, and the company is on your watchlist. Hundreds of
   cards get read; a handful get opened. All of it is free — no extra requests.

   The software check matters because a broad `internship` search also returns
   sales, marketing, HR, teaching, cinematography and field sales. Negative
   signals beat positive ones, so "Software Sales Intern" is correctly rejected.
   A title matching neither list is recorded as **uncertain** rather than
   guessed at:

   ```bash
   node bin/show-report.js --roles
   ```

   That shows what it could not decide and a sample of what it rejected. If a
   real software role is in either list, add a distinguishing word to
   `matching.extraTechTerms`; if junk survived, add to `extraNonTechTerms`.
6. **Extract.** Full description, applicant count, salary badge, apply target.
7. **Summarise and store.** Stipend, duration, work mode and skills are parsed
   out; the description is condensed. Everything lands in SQLite so the same job
   is never reported twice.
8. **Report.** A self-contained HTML page, plus a notification.

---

## Tuning

**`matching.requireCompanyMatch`** — the important one. `true` (default) opens
only watchlist companies. `false` captures *every* internship in the last 24
hours: much slower, much higher risk.

**`pacing`** — `[min, max]` millisecond ranges, randomised per action. Defaults
put 4–9s between job clicks and a 45–90s break every 12 jobs. **Raising these
lowers your risk.** Anything under 1.5s between cards is rejected outright.
`startupJitter` adds a random 0–15 min to scheduled runs so activity does not
land at exactly the same second every slot.

**`limits`** — backstops, not the normal stopping point: 90 minutes, 40 pages
per search (≈1000 results, LinkedIn's own ceiling), 60 jobs opened. Paging
normally ends when the Next button runs out, well before any of these. If a cap
*does* bite, the report says so explicitly — it never truncates silently and
calls it finished.

**`filters.jobTypes`** — LinkedIn's own internship filter (`f_JT=I`). Recruiters
routinely mislabel internships as full-time, so setting this to `[]` and relying
on `matching.titleMustMatch` catches more, at the cost of extra pages.

**`browser.headed`** — must stay `true`. The tool refuses to start otherwise.
Headless Chromium announces itself in the user agent and reports an 800×600
screen, and you could not solve a CAPTCHA in a window you cannot see.

**`summarizer.mode`** — `"offline"` (default) is regex plus sentence scoring:
free, no API key. Set `"claude"` and export `ANTHROPIC_API_KEY` for better
summaries at a fraction of a cent per job.

---

## Where things live

Runtime state deliberately sits outside the project, for the TCC reason above:

```
~/Library/Application Support/linkedin-watcher/
    jobs.db                 every job ever seen, for deduplication
    brave-profile/          the tool's Brave profile, holding your session
    reports/latest.html     the most recent report
    screenshots/            captured automatically when something goes wrong
~/Library/Logs/linkedin-watcher/run.log
```

`brave-profile/` contains a live LinkedIn session. Treat it like a password.

Only `config.json` lives in the project, and it is the only file you need to
edit.

---

## Troubleshooting

**"No LinkedIn session yet"** → `npm run login`.

**"Not signed in — the li_at session cookie is missing or expired"** → LinkedIn
logged you out. `npm run login` again.

**Report is empty but you expected jobs** → `node bin/show-report.js --runs`. If
`cards_seen` is healthy but `new_jobs` is 0, the filters worked and nothing new
came from your watchlist. If `cards_seen` is 0, see below.

**Zero results run after run** → this is the normal state, not a fault. A
watchlist of large companies posts internships rarely; the tool is a tripwire
for the moment one does, not a daily digest. To check that assumption rather
than trust it:

```bash
node bin/show-report.js --skipped
```

That lists the companies that keep appearing and getting skipped. If they are
all tiny agencies you have never heard of, the filter is doing its job. If you
recognise names worth working for, add them to `config.json`.

Also check `node bin/show-report.js --roles`. If genuine software roles are
sitting in the "could not decide" list, the classifier is silently dropping
matches and needs a term added.

**"Job list rendered 0 cards … LinkedIn changed its markup"** → the expected
failure mode over time. LinkedIn rotates its CSS class names. This error is
deliberately loud so it cannot be mistaken for "no jobs today"; the selectors in
`src/linkedin.js` need updating, and a screenshot in `screenshots/` shows what
the page actually looked like.

**No notifications** → notification banners from a launchd job are unreliable on
macOS; delivery is attributed to a host app with no Notification Center
registration. That is why anything urgent also plays a sound and opens a modal
dialog. `brew install terminal-notifier` makes banners work properly — the tool
uses it automatically if present.

**Did the schedule run?**

```bash
tail -20 ~/Library/Logs/linkedin-watcher/run.log
```

**It never fires** → check `launchctl print-disabled gui/$(id -u) | grep watcher`
(the disabled flag lives outside the plist and survives reboots), and check
System Settings → General → Login Items & Extensions, where macOS lets you
switch the agent off.

**Asleep at a slot** → launchd fires once shortly after you open the lid, and
coalesces several missed slots into a single run rather than replaying each one.
**Powered off at a slot** → that slot is dropped and does not catch up; the next
scheduled slot three hours later is the recovery.
