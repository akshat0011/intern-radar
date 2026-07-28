# Prompt — paste this into the Study USICT chat

Copy everything below the line.

---

I want you to write me a complete technical book about **this project (Study USICT)**, the
same way a book was written for my other project. I have a technical interview coming up
and I will be asked about both projects. The goal is blunt: **there should not be a single
question about this project I cannot answer.**

## What I already know — do not teach these again

I have already read a full book about my other project, *Intern Radar* (a LinkedIn
internship scraper: Node.js watcher on a Mac + static site on Vercel, vanilla JS, SQLite,
one npm dependency). That book already taught me, thoroughly:

- **Computing foundations** — CPU, RAM vs storage, OS, processes, compiler vs interpreter,
  what a server is as a *role*.
- **How the web works** — packets, IP, DNS and its resolution path, A vs CNAME, TTL, ports,
  TCP vs UDP, HTTP as text, methods, status codes, headers, HTTPS/TLS and certificates,
  cookies, sessions, JSON, caching and `Cache-Control`, CDNs, load balancers, reverse
  proxies, domains, hosting.
- **HTML** — elements, attributes, the document tree, semantics, forms, accessibility,
  ARIA, skip links, keyboard navigation.
- **CSS** — selectors, specificity, the cascade, the box model, display, position
  (including sticky), flexbox, grid, units, colours, custom properties, media queries.
  Including two real bugs: flex items and `min-width: auto`, and why
  `body{overflow-x:hidden}` does nothing while `html` is `overflow-x: visible`.
- **The DOM** — nodes vs elements, selecting and creating, `textContent` vs `innerHTML`
  and XSS, events, bubbling, delegation, layout/reflow/paint, DevTools.
- **JavaScript the language** — types, scope, hoisting, closures, `this`, arrays and their
  methods, destructuring, classes, modules, errors, JSON, regex, `Map`/`Set`.
- **Async** — blocking vs non-blocking, callbacks, Promises, `Promise.all`/`allSettled`/
  `race`, `async`/`await`, awaiting in a loop, `AbortController` and timeouts.
- **Node.js** — V8, libuv, the event loop and its phases, microtasks, the thread pool,
  why "single-threaded" is misleading.
- **Modules and npm** — CommonJS vs ESM, `package.json`, semantic versioning, lock files,
  `node_modules`, transitive dependencies, supply-chain risk.
- **Servers** — what a server does, `node:http`, MIME types, Express and its middleware
  model (taught in theory).
- **Databases** — the relational model, tables/rows/keys, SQL statements, JOINs, indexes
  and B-trees, transactions and ACID, prepared statements and SQL injection, SQL vs NoSQL,
  SQLite specifically, migrations.
- **APIs** — endpoints, methods, safety and idempotency, status codes, REST, GraphQL/gRPC
  in passing, API keys, JWT in theory, rate limiting, pagination, versioning.
- **Deployment** — dev vs production, build steps, hosting models, Vercel and git-connected
  deploys, CI/CD, environment variables and secrets, logs, monitoring, backups.
- **Engineering principles** — clean code, DRY, KISS, YAGNI, separation of concerns, pure
  functions, SOLID, the repository pattern, dependency injection, coupling and cohesion,
  error-handling strategy, testing strategy.

**The rule:** when this project touches one of the above, spend **one sentence** reminding
me and then go straight to *how this project uses it and how that differs*. Do not
re-explain the concept from scratch. Write "you know what an index is from the Intern Radar
book — here it matters because…".

**The important exception.** The Intern Radar book taught React, Express, MongoDB, ORMs,
Docker, JWT and bundlers only as *roads not taken*, because that project deliberately uses
none of them. **If Study USICT actually uses any of those, teach them properly and in
depth** — that is new material, not repetition, and it is exactly what an interviewer will
dig into.

## Step 1 — find out what this project actually is

**Do not assume anything about the stack. Do not start writing until you have inventoried
the repository.** Run and read, at minimum:

- The full file tree, excluding `node_modules` and `.git`, with line counts
- `package.json` (every dependency, every script), and any lock file
- Every config file: framework config, build config, linter, tsconfig, Docker, CI workflows,
  hosting config
- The entry point and the routing layer
- The data layer: schema, models, migrations, queries
- Every API route or server action
- The main UI components
- `README.md` — but see the warning below
- `git log --oneline | head -40` to see how it actually evolved

Then write `book/BIBLE.md` **before any chapter**: a ground-truth file recording the exact
stack, every file and its job, the real architecture, and the honest weaknesses. Every
chapter is written against that file so they agree with each other.

**Warning, learned the hard way.** In the other project the `README` and `package.json`
description both said the scraper ran "twice daily" — the actual scheduler config said
*hourly*. The README said "860 companies"; the code loaded **921**. Both wrong facts got
written into nine chapters before being caught. **Verify every number against the code that
runs, never against prose describing it.** If a document and the code disagree, the code
wins, and say so in the book.

## Step 2 — structure

Aim for **10–12 chapters of 5,000–8,000 words each**, plus front matter and a glossary.
That is readable in about five evenings, which is the point — a 300,000-word book I cannot
finish before the interview is worth nothing.

Decide the chapter list from what the project actually is, but it must cover:

1. **The project in five minutes** — the problem it solves, who uses it, the architecture,
   and the 60-second spoken pitch I can memorise.
2. **The stack, and why each piece** — every framework and library, what problem it solves,
   what it replaced, what the alternatives were, and what choosing it cost.
3. **Every file and folder** — what each is for and how they connect.
4. **The data layer** — schema design, relationships, queries, and why it is modelled that
   way.
5. **The server / API layer** — every route, its validation, its business logic, its errors.
6. **The UI layer** — component architecture, state management, rendering, data fetching.
7. **Auth and security**, if the project has users — this is heavily asked about.
8. **The hardest part of the project** — the bug or design problem that took longest.
   Interviewers love this; I need it as a story with a beginning and an end.
9. **Deployment and operations** — how it ships and how it is kept running.
10. **A full walkthrough** — one complete request, end to end, naming the real function at
    every hop.
11. **Rebuild it from an empty folder** — staged instructions I could follow without copying
    code, with "done when…" for each stage.
12. **Glossary and interview pack.**

### One chapter that matters more than the rest

Add a chapter called something like **"Two Projects, Two Answers"**, comparing this project
against Intern Radar. Because I built both, I will be asked *why the choices differ*:

- Why a framework here and vanilla JavaScript there?
- Why this database and SQLite there?
- Why an always-on server here and a static file + git push there?
- Which decision would I reverse today, on each project?

Being able to answer that well is the single strongest thing I can do in the interview,
because it proves the choices were reasoned rather than copied from a tutorial. Write this
chapter as genuine engineering comparison, not as flattery of either project.

## Step 3 — how each chapter must be written

Voice: second person, present tense, simple English, short sentences. Define any new term
in bold the first time it appears. No marketing words. One real-life analogy per major
concept, drawn from ordinary Indian student life. Every code block quoted from the real
repository — never invented — with a file and line citation, and explained line by line
after it.

Every chapter ends with, in this order:

- **Chapter summary** — 6–10 complete sentences
- **Key takeaways** — 3–4 sentences
- **Interview questions** — **12 questions with model answers of 4–8 sentences.** This is
  the most important section in the book. Mix three kinds:
  (a) general concept questions any interviewer asks,
  (b) questions about this specific project,
  (c) **at least two hostile questions that attack a real weakness** — and answer them
  honestly. An answer that concedes a genuine limitation and explains the reasoning anyway
  beats one that pretends there is no limitation. Interviewers are testing whether I know
  where the bodies are buried.
- **Common beginner mistakes** — 4–6
- **Exercises** — 3–5, easy to hard, at least one using the real project
- **Quiz** — 6 questions, answers in a block at the very bottom

The final **Interview Pack** must contain: the 60-second pitch as a script; the 10 most
likely questions; the 5 hardest questions with honest answers; the numbers worth memorising
(dependency count, line count, user count, response times, whatever this project's real
figures are); and a list of sentences I can actually say that make me sound like an engineer
rather than a student — each one a real trade-off from this project.

## Step 4 — how to actually get it written

Write it in **waves of about four chapters at a time**, not all at once. Each chapter is
written to its own file the moment it is finished, so if anything interrupts the run the
completed chapters survive on disk. After each wave, verify before continuing:

- every chapter has all its required sections
- every file path cited in the prose actually exists in the repo
- no chapter contradicts `BIBLE.md`

Report honestly what is done and what is not. If something fails, say so plainly rather
than reporting success — I would rather know a chapter is missing than find out the night
before.

Start by inventorying the repository and showing me the stack you found, plus your proposed
chapter list, before you write any chapters.
