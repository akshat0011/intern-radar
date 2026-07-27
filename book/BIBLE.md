# The Book Bible — binding contract for every chapter

You are writing ONE chapter of ONE book. Twenty-seven chapters are being written
alongside yours. This file is what stops them reading like twenty-seven different
essays. Follow it exactly.

---

## 1. The book

**Title:** *Reading the Radar: How One Small Program Watches LinkedIn, and Everything
You Need to Know to Build It Yourself*

**Subject:** the real, working codebase at the repository root — Intern Radar, live at
`https://www.internradar.online`.

**Reader:** a first-year university student who has never built a website. They may
never have heard the word "server". They are intelligent and motivated but have zero
assumed knowledge. They are reading to *understand*, not to copy.

**Promise on the cover:** after this book the reader can rebuild the whole project from
an empty folder without copying code, and can explain every decision in an interview.

---

## 2. Voice

Write like a good textbook author, not like documentation.

- **Second person, present tense.** "You open the folder. Node reads the file."
- **Simple English. Short sentences.** If a sentence runs past ~25 words, split it.
- **Never use a term before defining it.** The first time *any* technical word appears
  anywhere in your chapter, define it inline in **bold**, in one plain sentence, even if
  another chapter also defines it. Redundancy across chapters is correct — readers skip.
- **No marketing voice.** Never "powerful", "seamless", "robust", "leverage",
  "in today's fast-paced world", "dive in", "unleash".
- **No cheerfulness padding.** Never "Great question!", "Let's explore!", "Awesome!".
- **Contractions are fine.** "it's", "you'll". This is a book, not a legal document.
- **Address the reader's likely confusion directly.** "This is the part everyone gets
  wrong the first time, and here is why it is confusing:"

### Analogies
Every major concept gets **one** real-life analogy, drawn from ordinary Indian student
life where it fits naturally — hostel mess queues, railway reservation charts, the
college notice board, a shared WiFi router, an autorickshaw meter, a library index card
drawer. Use the analogy once, well. Do not run it into the ground for three pages, and
do not stack five analogies for one idea.

### Code in the text
- Every code block is fenced and language-tagged.
- **Code is quoted from the real repository.** Read the actual file. Never invent a
  function that does not exist, never rename one, never "simplify" a real signature
  without saying you have.
- After every real code block, explain it **line by line** or in labelled groups. Never
  paste code and move on.
- Cite locations as `` `src/roles.js:175` `` so the reader can open it.
- Illustrative toy examples are allowed and encouraged for teaching a concept — but say
  explicitly "this is a made-up example to show the idea, not from the project."

---

## 3. Mandatory chapter skeleton

Every chapter file follows this exact shape, in this order:

```markdown
# Chapter N — Title

> One-sentence statement of what the reader will be able to do at the end.

**Before this chapter you should have read:** Chapter X, Chapter Y.
**New words introduced here:** term, term, term.

## N.1 Subchapter
## N.2 Subchapter
...

## Chapter summary
(8–15 bullet points, each a complete sentence, each independently useful.)

## Key takeaways
(3–5 sentences. The things that survive a year later.)

## Real-life analogy revisited
(Tie the chapter's central analogy back to the code.)

## Frequently asked questions
(5–8 Q&As, in the reader's actual voice — "Why can't I just...?")

## Common beginner mistakes
(5–8. Each: what the beginner does, why it seems right, what actually happens, the fix.)

## Interview questions
(5–8, with model answers of 3–6 sentences each. These must be answerable *from this
chapter*.)

## Exercises
(4–8. Ordered easy → hard. At least two must involve editing or running the real
project. Mark the hardest one 🔴.)

## Quiz
(6–10 questions, multiple choice or short answer, with an **Answers** block at the very
bottom of the chapter, after a `---` rule.)

## Where this leads
(2–4 sentences pointing into the next chapter by name and number.)
```

Do not omit any section. Do not add top-level sections beyond these.

---

## 4. Ground truth about the project — DO NOT CONTRADICT THIS

The reader's original request assumed a typical React/Express/MongoDB app. **This project
is none of those.** Getting this wrong poisons the book. The facts:

### What it is
Two programs that share one folder and one database.

1. **The watcher** (`src/`, `bin/`) — a Node.js program that runs on the author's Mac,
   twice a day, driving a real Brave browser to search LinkedIn for internships at a
   watchlist of companies, extracting them, classifying them, and writing them to a
   local SQLite file.
2. **The site** (`web/`) — a static website deployed on Vercel that reads one JSON file
   the watcher published, plus a single serverless function that tailors a résumé.

The watcher **pushes to git**; Vercel deploys on push. There is no always-on server.

### The stack — exact
- **Language:** JavaScript (ESM, `"type": "module"`). No TypeScript.
- **Runtime:** Node.js ≥ 22 for the watcher, ≥ 20 for the site's function.
- **Frontend framework:** *none*. Vanilla JavaScript, hand-written DOM calls in
  `web/public/app.js`. No React, no Vue, no Svelte, no build step, no bundler.
- **CSS:** one hand-written file, `web/public/styles.css`. No Tailwind, no Sass.
- **Backend framework:** *none*. `web/serve.js` is a hand-rolled dev server built on the
  built-in `node:http` module. **Express is not used.**
- **Database:** SQLite, through Node's **built-in** `node:sqlite` module
  (`DatabaseSync`). No `better-sqlite3`, no ORM, no Prisma. **MongoDB is not used.**
- **npm dependencies:** exactly **one** — `playwright-core`. That is the entire
  production dependency tree. This is a central teaching point of the book.
- **Browser automation:** Playwright driving the user's real Brave browser via a
  persistent profile, so a human LinkedIn login is reused.
- **AI:** Google Gemini (`gemini-2.5-flash`) over plain `fetch` to the REST endpoint.
  No SDK. Used for role classification, card enrichment, and résumé tailoring.
- **Hosting:** Vercel, git-connected to `github.com/akshat0011/intern-radar`, serving
  `web/public` statically plus `web/api/tailor.js` as a serverless function.
- **Scheduling:** macOS **launchd**, installed by `bin/install-schedule.sh`. Not cron,
  not GitHub Actions.
- **Testing:** Node's built-in test assertions in three `.mjs` files run directly by
  `node`. No Jest, no Vitest, no Mocha.
- **Domain:** `internradar.online`. An older domain `interneadar.in` was retired and no
  longer resolves; if you mention it at all, mention it only as a cautionary tale in
  deployment.

### File inventory (8,712 lines total, largest first)
```
web/public/app.js       825   src/index.js            680
web/public/styles.css   550   src/gemini.js           501
src/store.js            484   src/linkedin.js         472
README.md               409   src/guard.js            327
src/extract.js          307   web/api/tailor.js       278
src/config.js           264   companies.json          247
src/report.js           234   src/roles.js            224
web/public/index.html   210   bin/install-schedule.sh 204
src/publish.js          194   test/roles.test.mjs     166
src/browser.js          166   test/extract.test.mjs   156
src/human.js            151   src/summarize.js        150
src/logos.js            137   config.json             129
web/og-card.html        128   bin/fetch-logos.js      115
src/learned.js          108   src/notify.js           107
bin/show-report.js      105   web/serve.js            100
bin/login.js            100   src/searches.js          98
bin/enrich.js            95   src/logger.js            54
src/paths.js             51   bin/run.sh               51
test/tailor.test.mjs     39   web/vercel.json          26
package.json             26   bin/uninstall-schedule.sh 17
web/package.json         12   .claude/launch.json      11
```

### The modules and what each is for
| File | Job |
|---|---|
| `src/index.js` | The orchestrator. The whole run, start to finish. |
| `src/browser.js` | Launch/close Brave with a persistent profile; detect a live session. |
| `src/linkedin.js` | Build search URLs, page through results, open a job, extract it. |
| `src/extract.js` | Pure text parsing: stipend, duration, skills, workplace type, dates. |
| `src/roles.js` | Offline tech/non-tech classification from a title, by vocabulary. |
| `src/gemini.js` | Gemini calls: classify by title, classify by description, enrich. |
| `src/learned.js` | Persist terms Gemini taught us so the offline classifier improves. |
| `src/store.js` | The SQLite layer. Schema, migrations, every query. |
| `src/publish.js` | Turn stored rows into the public JSON; git commit and push. |
| `src/summarize.js` | Offline extractive summary, with an LLM path. |
| `src/logos.js` | Company logo files and slugs. |
| `src/report.js` | Build the local HTML run report. |
| `src/notify.js` | macOS notifications, sounds, dialogs via AppleScript. |
| `src/guard.js` | Detect blocks/captchas/logouts; abort safely. |
| `src/human.js` | Human-like delays, mouse paths, scrolling. |
| `src/config.js` | Load and validate `config.json`; company and title matching. |
| `src/searches.js` | Turn the watchlist into batched search queries. |
| `src/paths.js` | Every filesystem path the app uses. |
| `src/logger.js` | Levelled, coloured console logging. |
| `web/serve.js` | Local static dev server, hand-rolled on `node:http`. |
| `web/api/tailor.js` | The one serverless function: tailor a résumé to a job. |
| `web/public/app.js` | The entire browser-side application. |

### Things that are TRUE and surprising — use them, they teach well
- One npm dependency. The book should keep asking "did we need a library for this?"
- `node:sqlite` is built into Node 22 — no native module to compile.
- The site has **no build step**. The files you edit are the files that ship.
- The scraper deliberately acts slowly and imperfectly (`src/human.js`) because acting
  like a robot gets you blocked.
- Every Gemini call has an **offline fallback** that runs first, so the program never
  depends on an API being up.
- `thinkingBudget: 0` is set on all Gemini calls — thinking tokens were destroying the
  structured JSON output.
- Descriptions are stored locally but **deliberately not republished** — they are the
  employer's copyrighted text.
- The apex/`www` and DNS story is a genuine production incident worth teaching.

---

## 5. Rules that keep the book honest

1. **Read the file before you write about it.** Use the Read tool. If your chapter names
   `src/store.js`, you must have read `src/store.js` in full.
2. **Never invent code, filenames, functions, or line numbers.** If you are unsure,
   read again or describe it in prose without a citation.
3. **Never contradict section 4.** If the repository disagrees with section 4, the
   repository wins — say so explicitly in the text.
4. **Teach the technology the reader asked about even when the project avoids it.**
   The React chapter really does teach React properly — components, props, state, hooks,
   virtual DOM — and *then* shows what `app.js` does instead, and what that costs and
   buys. Never say "not used, skip". That is the most interesting lesson in the book.
5. **Show the "before".** For each technology, explain how people did it before it
   existed. That is what makes a reader understand *why* it exists.
6. **Trade-offs, always.** Every choice in this project has a cost. Name it.

---

## 6. Cross-referencing

Refer to other chapters by number and title: "as Chapter 10, *Inside Node.js*, explains".
Assume the reader has read earlier chapters but has forgotten the details — restate the
one fact you need in half a sentence rather than sending them back.

The full chapter list, so your cross-references are correct:

**Front matter** — Cover, Preface, How to Use This Book, Table of Contents

*Part I — Ground Floor*
1. What Is Software?
2. How Websites Actually Work

*Part II — This Project*
3. Meet Intern Radar
4. The Shape of the Folder

*Part III — The Browser Half*
5. HTML: The Skeleton
6. CSS: The Skin
7. JavaScript: The Muscles
8. The DOM and How a Page Is Painted
9. Frameworks, React, and the Road Not Taken

*Part IV — The Server Half*
10. Inside Node.js
11. Modules, npm, and the One-Dependency Rule
12. Servers From Scratch
13. Serverless and the Tailor Endpoint

*Part V — Remembering Things*
14. Databases and SQLite
15. APIs and REST

*Part VI — The Engine Room*
16. Web Scraping and Playwright
17. Talking to a Language Model
18. The Watcher, File by File
19. The Site, File by File

*Part VII — Running It for Real*
20. Every Configuration File
21. Deployment, Scheduling, and Operations

*Part VIII — Becoming the Author*
22. Software Engineering Principles, Seen in This Code
23. One Complete Journey Through the System
24. Rebuild It From an Empty Folder

**Back matter**
25. Glossary
26. Appendix

---

## 7. Length

Each chapter: **6,000–12,000 words**. Chapters 18, 19, 23 and 24 may run longer; they
are the heart of the book. Do not pad to hit a number, and do not cut an explanation
short to stay under one. Depth beats brevity everywhere in this project.

## 8. Output

Write your chapter to the exact path you are given, as GitHub-flavoured Markdown.
Return only a two-line report: the path you wrote, and the approximate word count.
