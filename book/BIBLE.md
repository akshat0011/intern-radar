# Book Bible — binding contract for every chapter

You are writing ONE chapter of ONE book. Ten chapters are being written in parallel by
other writers. This file is what makes them one book. Follow it exactly.

---

## 1. The book and its reader

**Title:** *Intern Radar, Explained: A Working Project, From First Principles to Interview*

**Reader:** a first-year university student who has never built a website. They may not
know what a server is. They are smart, motivated, and starting from zero.

**The deadline that shapes everything:** the reader has a **technical interview in one
week**, about this project. They must finish the book in a few evenings and walk in able
to explain and defend every decision.

**Therefore:**
- **Tight, not padded.** Every paragraph earns its place. No filler, no throat-clearing.
- **Interview-first.** The `## Interview questions` section is the most important part of
  your chapter, not an afterthought. Write it as if you know it will be asked.
- **Teach the concept, then show the real code.** Concept first, always — but reach the
  real code quickly.

**Hard length limit: 4,000–5,500 words per chapter.** This is a ceiling AND a floor. Going
long breaks the one-week promise. Going short breaks the teaching. Cut adjectives, never
explanations.

---

## 2. Voice

- **Second person, present tense.** "You open the file. Node reads it."
- **Simple English. Short sentences.** Past ~25 words, split it.
- **Define every term the first time you use it**, inline, in **bold**, in one plain
  sentence. Do this even if another chapter also defines it — readers skip around.
- **No marketing voice.** Never "powerful", "seamless", "robust", "leverage", "dive in".
- **No filler enthusiasm.** Never "Great question!", "Let's explore!".
- **One real-life analogy per major concept**, from ordinary Indian student life where it
  fits — the hostel mess queue, a railway reservation chart, the college notice board, a
  shared WiFi router. Use it once, well. Do not stack analogies.
- **Name the trade-off.** Every choice in this project costs something. Say what.

### Code rules
- Fenced and language-tagged.
- **Quoted from the real repository.** Read the file first. Never invent a function,
  filename, or line number.
- After every real code block, explain it — line by line or in labelled groups.
- Cite as `` `src/roles.js:175` ``.
- Toy examples are fine and encouraged, but label them: "made-up example, not from the
  project."

---

## 3. Mandatory chapter skeleton

Exactly this, in this order:

```markdown
# Chapter N — Title

> One sentence: what you can do at the end.

**New words:** term, term, term.

## N.1 Subchapter
## N.2 Subchapter
...

## Chapter summary
(6–10 bullets, each a complete, independently useful sentence.)

## Key takeaways
(3–4 sentences. What survives a year later.)

## Interview questions
(**8–12 questions with full model answers of 4–8 sentences.** THE MOST IMPORTANT SECTION.
Mix three kinds: (a) general concept questions any interviewer asks — "what is the event
loop?"; (b) questions about THIS project — "why no framework?"; (c) at least two hostile
follow-ups that probe a weakness — "isn't scraping LinkedIn against their terms?",
"what happens when your Mac is closed?". Model answers must be honest about limitations.
An answer that admits a real trade-off beats one that pretends there isn't one.)

## Common beginner mistakes
(4–6. Each: what the beginner does, why it looks right, what actually happens, the fix.)

## Exercises
(3–5, easy → hard. At least one uses the real project. Mark the hardest 🔴.)

## Quiz
(6 questions. Answers in a block at the very bottom, after a `---`.)
```

No other top-level sections. Do not omit any of these.

---

## 4. GROUND TRUTH — never contradict this

The obvious assumption about this repo is **wrong**. It looks like a web project, so a
writer reaches for React, Express, MongoDB, JWT, Tailwind, Docker. **There is none of
that.** Getting this wrong ruins the book.

### What it is
**Two programs sharing one folder and one database.**

1. **The watcher** (`src/`, `bin/`) — Node.js on the author's Mac, twice a day, driving a
   real Brave browser to search LinkedIn for internships at a watchlist of companies,
   extracting them, classifying them, storing them in SQLite.
2. **The site** (`web/`) — a static site on Vercel that reads one JSON file the watcher
   published, plus one serverless function that tailors a résumé.

They communicate through **a JSON file committed to git**. The watcher `git push`es;
Vercel deploys on push. **There is no always-on server.**

### The stack — exact
| Thing | Reality |
|---|---|
| Language | JavaScript, ESM (`"type": "module"`). No TypeScript. |
| Runtime | Node.js ≥22 (watcher), ≥20 (site function) |
| Frontend framework | **none** — vanilla DOM calls in `web/public/app.js` |
| Build step | **none** — the file you edit is the file that ships |
| CSS | one hand-written file, `web/public/styles.css`. No Tailwind. |
| Backend framework | **none** — `web/serve.js` is hand-rolled on `node:http`. No Express. |
| Database | SQLite via Node's **built-in** `node:sqlite` (`DatabaseSync`). No ORM, no MongoDB. |
| npm dependencies | **exactly one: `playwright-core`** |
| Browser automation | Playwright driving the user's real Brave via a persistent profile |
| AI | Google Gemini `gemini-2.5-flash` over plain `fetch`. No SDK. |
| Hosting | Vercel, git-connected to `github.com/akshat0011/intern-radar` |
| Scheduling | macOS **launchd** (`bin/install-schedule.sh`). Not cron. |
| Testing | Node's built-in `assert` in three `.mjs` files run directly. No Jest. |
| Domain | `internradar.online` |

### The modules
| File | Lines | Job |
|---|---|---|
| `web/public/app.js` | 825 | The entire browser-side app |
| `src/index.js` | 680 | Orchestrator — the whole run, start to finish |
| `web/public/styles.css` | 550 | All styling |
| `src/gemini.js` | 501 | Gemini: classify by title, by description, enrich |
| `src/store.js` | 484 | SQLite layer — schema, migrations, queries |
| `src/linkedin.js` | 472 | Search URLs, paging, opening a job, extracting |
| `src/guard.js` | 327 | Detect blocks/captchas/logouts; abort safely |
| `src/extract.js` | 307 | Pure text parsing: stipend, duration, skills, dates |
| `web/api/tailor.js` | 278 | The one serverless function |
| `src/config.js` | 264 | Load/validate config; company + title matching |
| `src/report.js` | 234 | Local HTML run report |
| `src/roles.js` | 224 | Offline tech/non-tech classification from a title |
| `web/public/index.html` | 210 | The page skeleton |
| `src/publish.js` | 194 | Rows → public JSON; git commit and push |
| `src/browser.js` | 166 | Launch/close Brave, detect a live session |
| `src/human.js` | 151 | Human-like delays, mouse paths, scrolling |
| `src/summarize.js` | 150 | Offline extractive summary |
| `src/logos.js` | 137 | Company logo files and slugs |
| `src/learned.js` | 108 | Persist terms Gemini taught the offline classifier |
| `src/notify.js` | 107 | macOS notifications via AppleScript |
| `web/serve.js` | 100 | Local dev server on `node:http` |
| `src/searches.js` | 98 | Watchlist → batched search queries |
| `src/logger.js` | 54 | Levelled coloured logging |
| `src/paths.js` | 51 | Every filesystem path |

Entry points in `bin/`: `login.js`, `enrich.js`, `show-report.js`, `fetch-logos.js`,
`run.sh`, `install-schedule.sh`, `uninstall-schedule.sh`.

### Facts that teach well — use them
- **One npm dependency.** Keep asking "did we need a library for this?"
- **`node:sqlite` is built into Node 22** — no native module to compile.
- **No build step.** Edit `app.js`, push, it is live.
- The scraper **deliberately acts slowly and imperfectly** (`src/human.js`) because acting
  like a robot gets you blocked.
- **Every Gemini call has an offline fallback that runs FIRST**, so the program never
  depends on an API being up. This is the single best design decision in the codebase.
- **`thinkingBudget: 0`** on all Gemini calls: thinking tokens were destroying the
  structured JSON. Measured — thinking on returned 0 of 6 parseable items, off returned 6.
- Job descriptions are stored locally but **deliberately not republished** — they are the
  employer's copyrighted text. `publish.js` strips them.
- **Real CSS bug:** `.picks select` had `flex:1` and no `min-width:0`, so a flex item's
  default `min-width:auto` floored it at the widest `<option>` text — pushing the page
  150px past a phone viewport. `body{overflow-x:hidden}` did nothing because `html` was
  still `overflow-x:visible`.
- **Real layout bug:** the sticky header + filter rail froze 353px of a phone screen,
  about half the display. Fixed by making the rail `position:static` under 680px.
- **Real production incident:** the old domain `interneadar.in` silently lost its DNS
  records. The share card broke because `og:image` pointed at a hostname that no longer
  resolved. Teaches DNS, absolute URLs, and crawler cache-busting (`?v=2`).
- **`findInventedSkills`** in `web/api/tailor.js:156` guards against the model inventing
  skills the candidate never claimed — which would put a lie on a student's résumé.

### Honest weaknesses — do not hide these, interviewers probe them
- The watcher only runs when the author's Mac is awake. Miss a run, miss jobs.
- Scraping LinkedIn is against their Terms of Service. The project mitigates
  (human-like pacing, a real logged-in profile, no republished descriptions) but does not
  eliminate this. Say so plainly.
- Data is only as fresh as the last run.
- The site cannot do anything the JSON does not already contain.
- No automated tests for the browser-side code.
- One person's watchlist; it does not scale to many users without a real backend.

---

## 5. Chapter list — for correct cross-references

Front matter — cover, preface, how to use, table of contents

1. The Project in Five Minutes — what it is, the two-program architecture, the folder tour
2. How the Web Actually Works — internet, DNS, HTTP, HTTPS, caching, CDNs, deployment
3. The Page: HTML, CSS, and the DOM
4. JavaScript, and Why Async Is Hard
5. Node.js, Modules, and Servers Without a Framework
6. Remembering Things: SQLite and the Store
7. APIs, REST, and Talking to a Language Model
8. The Scraper: Playwright and Defensive Design
9. Shipping It: Deployment, Scheduling, and Operations
10. Engineering Judgment, and Rebuilding It From an Empty Folder

Glossary and Interview Pack

Refer to chapters by number and title: "as Chapter 5, *Node.js, Modules, and Servers
Without a Framework*, explains". Restate the one fact you need rather than sending the
reader backwards.

---

## 6. Output

Write to the exact path you are given, as GitHub-flavoured Markdown, with the Write tool.
Writing the file IS the deliverable — do not return prose instead.
Return two lines only: the path, and the approximate word count.
