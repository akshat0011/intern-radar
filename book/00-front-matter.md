# Reading the Radar

### How One Small Program Watches LinkedIn, and Everything You Need to Know to Build It Yourself

**akshat0011**

---

A complete walk through one real, working, deployed piece of software — from
"what is a computer program?" to "here is the line that decides whether a job
gets published."

The program is called **Intern Radar**. It runs on a laptop in India, opens a
real web browser on a schedule, looks at LinkedIn for new internships at about
eight hundred and sixty companies, works out which ones are software roles,
remembers them so it never reports the same job twice, and publishes what it
found to a public website that students can browse.

The whole thing is 8,712 lines of code and has exactly **one** installed
library.

**Live site:** <https://www.internradar.online>
**Source code:** <https://github.com/akshat0011/intern-radar>

---

**The promise on this cover:** when you finish this book you will be able to
rebuild this entire project from an empty folder, without copying a single line
of it, and explain every decision in it to an interviewer.

---
---

## Copyright and honest notices

*Reading the Radar: How One Small Program Watches LinkedIn, and Everything You
Need to Know to Build It Yourself*

First edition, 2026.

Text copyright © 2026 akshat0011. All rights reserved.

The source code described in this book is published under the MIT License,
Copyright © 2026 akshat0011. The full licence text is in the file `LICENSE` at
the root of the repository. In plain English, the MIT License says: you may
use, copy, change and redistribute this code, including commercially, as long
as you keep the copyright notice with it, and the author gives you no warranty
of any kind.

**What this book is, formally.** This is a personal learning book. The author
wrote the software described in it, and then wrote this book to understand and
explain his own project properly. It is not a product of any company. It has no
publisher, no editor, and no institutional endorsement. It exists because
explaining a thing line by line is the only reliable way to find out whether you
actually understood it.

**Trademarks.** LinkedIn is a trademark of LinkedIn Corporation, a subsidiary of
Microsoft. Google, Gemini and Chrome are trademarks of Google LLC. Brave is a
trademark of Brave Software, Inc. Vercel is a trademark of Vercel, Inc. GitHub
is a trademark of GitHub, Inc. Node.js is a trademark of the OpenJS Foundation.
SQLite is in the public domain. React is a trademark of Meta Platforms, Inc.
None of these organisations sponsored, reviewed, approved or is in any way
associated with this book or with Intern Radar. Product names are used only to
identify the real tools the project uses.

**A necessary warning about the scraping.** Part of this project reads pages on
LinkedIn automatically. **Automated scraping is against LinkedIn's Terms of
Service.** LinkedIn can restrict or permanently ban an account for it. The
project's own README says exactly this, in its first section, before it says
anything else. This book explains how the program is built, what it does, and
what design choices reduce (but never remove) that risk. It is a description of
one person's software, not advice that you should run it, and it is not legal
advice of any kind. If you run any of this against a live website, you are
choosing to accept the consequences yourself. Chapter 16, *Web Scraping and
Playwright*, treats this question seriously rather than in a footnote.

**A note on accuracy.** Every file, function name, line number and code sample
in this book was read out of the real repository while the book was being
written. This edition describes the repository as it stood on 27 July 2026, at
commit `2086d6a`. Software moves. If a line number in this book does not match
what you see, trust the repository, not the book — and see the section *Where
the code and the words disagree* in **How to Use This Book**, because that
situation is itself one of the lessons.

**No warranty.** The information in this book is provided as is. The author
accepts no liability for anything that happens as a result of following it,
including but not limited to lost data, banned accounts, failed deployments,
exhausted API quotas, or missed internship deadlines.

Written in plain Markdown. No page numbers, because there are no pages.

---
---

## Preface

### What this book is

This is a book about **one** program.

Not a survey of web development. Not "ten projects to build your portfolio."
One program, taken apart completely, in front of you, with nothing hidden and
nothing skipped.

Most programming books work the other way round. They teach a topic — say,
databases — using tiny examples invented for the chapter. A table of students. A
table of books in a library. Those examples are clean, and that is exactly the
problem with them. Real code is never clean. Real code has a comment in the
middle of it explaining why a folder had to move because macOS refused to let a
scheduled job read the Desktop. You do not learn what software engineering feels
like from a table of students.

So this book does the opposite. It picks one real, live, running system, and
teaches every piece of knowledge you need at the exact moment that system needs
it. When we reach the file that stores jobs, you get a full chapter on databases
— what they are, what a table is, what SQL is, what an index does — and then you
read the actual file, `src/store.js`, all 484 lines of it, and see those ideas
used for real.

The system is called Intern Radar. Here is what it does, in one paragraph, using
words I will define properly in a moment.

Twice a day — or, as currently installed, every hour — a **program** (a set of
written instructions a computer can carry out) wakes up on the author's Mac. It
opens a real web **browser** (the application you use to look at websites, like
Chrome or Brave). It signs into LinkedIn using a login the author performed by
hand, once, months ago. It searches for internships. It scrolls through the
results the way a slow, distracted human would, because behaving like a robot is
what gets accounts blocked. It reads the job cards on screen. It throws away
every job from a company that is not on a watchlist of about 860 companies. For
the handful that survive, it opens the posting, pulls out the stipend, the
duration, the skills and the work mode, decides whether the role is a software
role or not, writes everything into a **database** (an organised file that
stores information so you can search it later) so that the same job is never
reported twice, and then writes the fresh results into a single file of plain
text. Finally it commits that file to **git** (a tool that records the history
of a project's files) and pushes it to GitHub. GitHub tells a company called
Vercel that something changed. Vercel rebuilds the public website. About a
minute later, a student in Delhi opening <https://www.internradar.online> on
their phone sees the new internship.

That is the whole system. Two programs, one folder, one database, one website.

By the end of this book you will understand every step of that paragraph well
enough to build your own version of it.

### Who this book is for

You are a first-year student. Possibly first-year engineering, possibly not. You
have never built a website. You may never have heard the word **server** used
seriously, and if someone said "the server is down" you would nod and hope
nobody asked a follow-up question. (A server is just a computer that sits
somewhere else and answers requests from other computers. That is all. Chapter
2, *How Websites Actually Work*, spends a long time on this, because almost
every later confusion traces back to it.)

You know how to use a computer. You can install an app, find a file, and type.
You are not afraid of a bit of maths but you have not written much code, and
what you have written was probably for a class, in a language chosen by someone
else, and you were never quite sure what happened after you pressed Run.

That is the reader I am writing for. Everything is defined. Nothing is assumed.
The first time any technical word appears in a chapter, it gets a plain
one-sentence definition in **bold**, even if an earlier chapter already defined
it — because people skip chapters, and a definition you have to go hunting for
might as well not exist.

You are intelligent. You are just new. Those are completely different things,
and most technical writing confuses them.

If you are *not* that reader — if you already write code and you picked this up
to see how a small production system is put together — the book still works. You
will read the definitions faster than I wrote them. Skip to Part IV.

### What you will be able to do at the end

Concretely, after finishing this book you should be able to:

1. **Explain what happens between typing a web address and seeing a page**, in
   enough detail that a follow-up question does not knock you over.
2. **Write HTML, CSS and JavaScript by hand**, without a framework, and know
   what each of the three is actually responsible for.
3. **Explain what React is, why it exists, and what problem it solves** — and
   also explain, precisely, why this project does not use it, which is a harder
   and more interesting answer.
4. **Run JavaScript outside a browser** using Node.js, read files, make network
   requests, and understand why "asynchronous" is not just jargon.
5. **Write a web server from scratch** in about a hundred lines, with no
   framework, and then explain what a framework like Express would have added.
6. **Design and query a database**, write SQL, understand what an index does,
   and explain when SQLite is the right choice and when it is a bad one.
7. **Call somebody else's API** over the internet, handle its failures, and — the
   part almost nobody does — write the code that still works when that API is
   down.
8. **Drive a real browser from code** with Playwright, and understand the ethical
   and practical limits of doing so.
9. **Deploy a real website to the real internet** on a real domain name, and
   diagnose it when the domain does not resolve.
10. **Rebuild Intern Radar from an empty folder**, in stages, from a plan in
    Chapter 24, without copying the existing code.
11. **Sit in an interview** and answer "walk me through a project you built" with
    something better than a memorised summary.

Point 11 is not a joke item. Chapter 22, *Software Engineering Principles, Seen
in This Code*, exists specifically because "why did you build it that way?" is
the question that separates people who followed a tutorial from people who
understand a system.

### Why this book starts from absolute zero

There is a particular kind of unfairness in learning to program, and it works
like this.

Every tutorial has an assumed floor — a level of knowledge below which it does
not explain things. A tutorial about React assumes you know JavaScript. The
JavaScript tutorial assumes you know what a browser does. The browser
explanation assumes you know what HTTP is. The HTTP explanation assumes you know
what a server is. The server explanation assumes you know what a process is.
Nobody ever tells you where the floor is. You just fall through it, silently,
somewhere around paragraph three, and then spend two hours feeling stupid.

You are not stupid. You are standing under a floor.

So this book has no floor. Chapter 1 is called *What Is Software?* and it means
the question literally. It explains what a program is, what a file is, what it
means for a computer to "run" something. If you already know that, it costs you
fifteen minutes to skim. If you do not know it, it saves you two years of quiet
confusion, and that trade is obviously worth making.

There is a second reason, and it is about how understanding actually forms. If
you learn React before you learn what the **DOM** is (the browser's live,
in-memory model of the page you are looking at — Chapter 8), then React is
magic. Magic is un-debuggable. When magic breaks, you have no idea where to
look, because you never had a mental model of what was supposed to happen. Learn
the DOM first and React stops being magic and becomes a clever labour-saving
device with visible trade-offs. That is a much stronger position to be in.

Everything in this book is taught bottom-up for that reason. Slow first, fast
later.

### The honest note: you probably expected a different book

You may have come to this book — or to this project — expecting **React,
Express and MongoDB**. That is the standard combination. It is what most
tutorials teach, what most college projects use, and what most people mean when
they say "full stack web development."

Intern Radar uses **none of the three.**

That is not an oversight and it is not laziness. Here is the exact truth about
what it uses instead, so that nothing later surprises you:

| What you expected | What this project actually uses |
|---|---|
| React (a library for building user interfaces out of components) | Nothing. Plain JavaScript writing directly to the page, in one file, `web/public/app.js`, 825 lines. No framework, no build step, no bundler. |
| Express (the most common Node.js web-server framework) | Nothing. The local development server, `web/serve.js`, is 100 lines built on Node's built-in `node:http` module. In production there is no server at all — the site is static files plus one serverless function. |
| MongoDB (a document database, usually run as a separate service) | SQLite, through `node:sqlite`, a module built into Node.js itself. The whole database is one file on disk. No server, no driver to install, no ORM. |
| A `node_modules` folder with 300 packages in it | Exactly **one** installed package: `playwright-core`. That is the entire production dependency tree. You can verify it yourself in `package-lock.json`. |
| Tailwind CSS, or Sass, or a CSS framework | One hand-written stylesheet, `web/public/styles.css`, 550 lines. |
| Jest or Vitest for testing | Node's own built-in assertions, in three files run directly by `node`. |
| A cloud cron service or GitHub Actions for scheduling | macOS **launchd**, installed by a 204-line shell script. |

Now: why is that a *better* thing to learn from, rather than a weird thing to
learn from?

**First, because you can see the whole thing.** 8,712 lines is a lot of reading,
but it is a finite amount of reading. You can genuinely hold this system in your
head. A typical React-Express-MongoDB starter project has more code inside
`node_modules` than a human will read in a lifetime, and the parts you did not
write are exactly the parts that break at 2 a.m. Here, when something breaks,
the cause is in a file you have read.

**Second, because frameworks hide the thing you are trying to learn.** React is a
solution. Express is a solution. Mongoose is a solution. If you learn the
solution before you have ever felt the problem, you learn a set of incantations,
not a set of ideas. You will be able to build things — real things, that work —
but you will not be able to reason about them, and you will not be able to
choose anything different, because you never understood what was being chosen
for you. Reading a project that solved those problems by hand shows you the
problems. That is the thing that transfers to other jobs, other languages, other
decades.

**Third, because it inverts the interesting question.** In a framework project
the question is "how do I do X in React?" In this project the question is, over
and over, "did we actually need a library for this?" Sometimes the honest answer
is yes — Playwright is here because writing a browser automation engine yourself
is not a weekend project. Usually the answer is no. Learning to ask that
question at all is a genuine engineering skill, and almost nothing teaches it.

**Fourth, because dependencies are a real, ongoing cost that beginner material
never mentions.** Every package you install is code you did not write, running
with your permissions, that can break, get abandoned, change its licence, or get
taken over. Every one of them has to be updated. A project with one dependency
has almost no maintenance surface. A project with 300 has a part-time job
attached to it. Chapter 11, *Modules, npm, and the One-Dependency Rule*, is
about this and only this.

**And fifth — the important one — none of that means you should not learn React.**

You should. React runs an enormous share of the industry, and you will be
interviewed about it. So this book teaches it properly. Chapter 9, *Frameworks,
React, and the Road Not Taken*, is a full chapter that teaches components,
props, state, hooks, the virtual DOM, re-rendering and why keys matter — with
real, working React examples, clearly marked as illustrative code written for
this book rather than taken from the project. Only *then* does it show you the
equivalent code in `web/public/app.js`, and lay out honestly what the hand-written
version costs (more code you have to write, more chances to introduce a bug,
manual state synchronisation) and what it buys (no build step, no framework
upgrade treadmill, a page that ships as the file you edited, a total JavaScript
payload measured in single-digit kilobytes).

The same applies everywhere the project skipped something popular:

- **Chapter 12, *Servers From Scratch*,** teaches what a server is, shows you how
  the same job looks in Express with real Express code, then reads `web/serve.js`
  line by line to show what Express was actually doing for you.
- **Chapter 14, *Databases and SQLite*,** teaches relational databases and SQL
  properly, explains what MongoDB is and what document databases are genuinely
  good at, then explains why a single-writer, few-hundred-row job log is the
  worst possible case for MongoDB and the best possible case for SQLite.
- **Chapter 13, *Serverless and the Tailor Endpoint*,** teaches what "serverless"
  means (there is still a server; you just do not own it) before it shows you the
  one serverless function in the project.

Never once does this book say "we do not use that, so skip it." That instruction
would be the single worst lesson in the book. Knowing a tool *and* knowing when
not to reach for it is the whole skill. Knowing only one of the two is how people
end up putting a distributed message queue in front of a contact form.

### Which brings us to the other thing this book insists on

**Every technology gets its "before."**

Before CSS existed, people made web pages look right by nesting invisible tables
and using single-pixel transparent images as spacers. Before Node.js, JavaScript
could not run outside a browser at all, and a web developer had to write the
browser half in one language and the server half in another. Before package
managers, you downloaded a library as a zip file, unzipped it into your project,
and hoped you remembered where it came from when a security fix was announced.

Knowing the "before" is the difference between memorising that a thing exists
and understanding why it exists. Once you know that people used to hand-copy
library zips into their project folders, `npm install` stops being a magic spell
and becomes an obvious idea somebody eventually had. So each technology chapter
in this book tells you what life was like without it, briefly, before it tells
you how to use it.

### And every choice gets its cost

There is no chapter in this book where a decision is presented as simply
correct.

SQLite is the right database here, and the cost is that only one process can
write to it at a time, and that it does not work at all on Vercel's serverless
platform, which is why the site reads a JSON file instead. No build step is the
right choice here, and the cost is that `web/public/app.js` is one 825-line file
that a bigger team would find painful to work on together. Driving a real
browser is the right choice for LinkedIn, and the cost is that the whole thing
only runs on one specific Mac, with one specific browser profile, and breaks
whenever LinkedIn changes a CSS class name.

If a book tells you a technology is good and does not tell you what it costs,
the book is selling you something. Every chapter here ends up naming the price.

### What this book is not

- **It is not a copy-paste tutorial.** There is no "step 1, type this." The goal
  is that you understand the system well enough to rebuild it differently.
- **It is not a guide to scraping LinkedIn.** It explains a program that does,
  including the parts designed to keep the risk low, and it is honest that the
  risk is not zero and the activity breaks LinkedIn's terms. Do not treat
  Chapter 16 as permission.
- **It is not neutral.** It is one person's project, with one person's opinions
  about dependencies and frameworks. Where those opinions are contested — and
  the anti-framework position is genuinely contested — the book says so and gives
  the other side.
- **It is not finished.** Software changes. This book describes a specific commit
  in July 2026.

### Thanks

To everyone who has ever answered a beginner's question without making them feel
small, and to whoever wrote the compiler error message that finally made sense.

---
---

## How to Use This Book

This section is short, practical, and worth four minutes.

### The shape of a chapter

Every chapter from 1 to 26 has exactly the same skeleton. Once you have read one
chapter you know where everything is in all the others. In order:

1. **A one-line promise** at the top, in a quote block, stating what you will be
   able to do by the end.
2. **Before this chapter you should have read:** the chapters this one leans on.
3. **New words introduced here:** every term defined in the chapter, listed up
   front so you can see what you are in for.
4. **The numbered sections** — the actual teaching, as `N.1`, `N.2`, and so on.
5. **Chapter summary** — 8 to 15 bullet points, each a full sentence. These are
   written so that reading only the bullets a month later still tells you
   something.
6. **Key takeaways** — three to five sentences. The parts that should survive a
   year.
7. **Real-life analogy revisited** — every chapter has one central everyday
   analogy, and at the end it gets tied back to the actual code.
8. **Frequently asked questions** — written in the voice people actually use.
   "Why can't I just…?" If you found yourself thinking it during the chapter, it
   is probably here.
9. **Common beginner mistakes** — each one says what a beginner does, why it
   seems perfectly reasonable, what actually goes wrong, and the fix.
10. **Interview questions** — with model answers, all answerable from that
    chapter alone.
11. **Exercises** — ordered from easy to hard.
12. **Quiz** — with the answers at the very bottom of the file, after a
    horizontal rule.
13. **Where this leads** — a short pointer into the next chapter by name and
    number.

If you are short on time, the highest-value parts are the numbered sections, the
Common beginner mistakes, and the quiz. The mistakes section is deliberately
front-loaded with the errors that cost people the most hours.

### Reading order

**Read it front to back the first time.** Genuinely. The chapters are ordered by
dependency, not by topic popularity, and Chapter 18 assumes you have read
Chapter 10 the way a maths textbook assumes you have read the previous chapter.

The parts fall into three natural stopping points:

- **After Part II (Chapters 1–4)** you will understand what software is, how the
  web works, what Intern Radar does, and what every folder in the repository is
  for. That is a satisfying place to pause for a day.
- **After Part V (Chapters 1–15)** you have the whole general education: browser,
  server, database, API. At this point you could build a small web application of
  your own design. Do that before continuing, if you can.
- **After Part VIII (Chapters 1–24)** you have the whole system and a rebuild
  plan.

If you are impatient, three alternative routes:

- **"I want to build a website this week."** Chapters 2, 5, 6, 7, 8, then 12.
  Come back for the rest.
- **"I already write code, show me the system."** Chapters 3, 4, then Part VI
  (16–19), then 23.
- **"I have an interview on Friday."** Chapters 9, 11, 12, 14, 15, 22, and the
  Interview questions section of every chapter you skipped.

The two back-matter chapters — 25, *Glossary*, and 26, *Appendix* — are reference
material. Do not read them in order. Use the Glossary the moment a word stops
making sense; that is what it is for, and looking a word up is not cheating.

### What to do with the exercises

Every chapter has four to eight exercises, ordered easy to hard. **At least two
in every chapter involve editing or running the real project**, not writing
something separate. The hardest one in each chapter is marked 🔴.

Advice that sounds obvious and is not:

- **Attempt them before reading the next chapter.** Understanding decays fast if
  it is never used. An exercise attempted badly teaches more than an exercise
  read and nodded at.
- **You are allowed to fail.** Several exercises are designed so that the
  first obvious approach does not work. That is the lesson.
- **Break the code on purpose.** A recurring exercise type is "delete this line,
  run it, and read the error." Reading an error message you caused yourself is
  the fastest way to learn what a line of code was actually doing. Use git
  (`git diff`, `git checkout -- .`) to put everything back.
- **The 🔴 one is optional but it is the one that changes you.** If you only ever
  do the easy ones you will finish the book feeling confident and be unable to
  build anything. The hard exercise is where the real learning is stored.

There are no solutions printed for exercises. That is deliberate — the exercises
are open-ended enough that a printed answer would make you check yours against
mine instead of thinking. The quiz is different, and does have answers.

### Every chapter ends with a quiz, and the answers are right there

Six to ten questions, multiple choice or short answer, at the end of every
chapter. The **Answers** block is at the very bottom of the same file, after a
`---` rule.

Use it like this: cover the answers, do the whole quiz, then check. If you get
one wrong, do not just read the correct answer and move on — go back to the
section it came from and re-read that section. A quiz you score 100% on has
taught you nothing except that you were already fine. A quiz you score 60% on
has just told you exactly which three sections to re-read, which is worth far
more.

The quizzes test understanding, not memory of line numbers. If a question can be
answered by remembering a number, it is a bad question and I have tried to avoid
writing them.

### Running the project while you read

You can read every word of this book without running anything. All the code is
printed and explained. But it is much better with the project open.

**What you need, minimum, for the parts that run anywhere:**

- **Node.js version 22 or newer.** Node.js is the program that runs JavaScript
  outside a browser; Chapter 10 explains it fully. Version 22 matters because
  this project uses `node:sqlite`, which was built into Node from version 22
  onwards. Check with `node --version`.
- **git**, to clone the repository. `git --version`.
- A **text editor**. VS Code is the common choice and is free.
- A **terminal** — the text window where you type commands to your computer.
  Terminal on macOS, Windows Terminal on Windows, any terminal on Linux.

Get the code:

```bash
git clone https://github.com/akshat0011/intern-radar.git
cd intern-radar
npm install
```

`npm install` reads `package.json`, sees the single dependency, and downloads
it. On this project that takes seconds, which is itself part of the point.

**The half you can run anywhere.** The public website runs on any operating
system, needs no LinkedIn account, and touches nothing external:

```bash
npm run web
```

That starts `web/serve.js`, which prints:

```
Intern Radar preview → http://localhost:4321
```

Open that address in your browser. `localhost` means "this computer", and `4321`
is the **port** — a numbered door on a machine, so that several programs can
answer network requests on the same computer without colliding. You are now
looking at the real site, served by the real 100-line server, reading the real
published data file at `web/public/data/jobs.json`. Every chapter in Part III and
Chapter 19 can be followed with this running and the browser's developer tools
open.

Run the tests too — they are fast and they need nothing:

```bash
npm test
```

That runs three files with Node directly. No test framework is installed.
Chapter 22 reads them.

**The half that only runs on one machine.** The watcher needs macOS (it uses
launchd and AppleScript), the Brave browser, and a real LinkedIn login performed
by hand. Even with all of that, running it means sending automated traffic to
LinkedIn, which — to say it a third time — is against their Terms of Service and
can get an account restricted.

**You do not need to run the watcher to understand this book.** Every one of its
outputs is printed and explained in the text. If you do want to see browser
automation for yourself, do it against a site that permits it, or against a page
you host yourself. Chapter 16 says more about how to practise this safely.

If you are on macOS and you do decide to run it, the commands are all in
`package.json`:

| Command | What it does |
|---|---|
| `npm run login` | Opens Brave once so you can sign in by hand. |
| `npm run dry-run` | A small test scan: one search, one page, at most three jobs. |
| `npm start` | A full scan, exactly as the schedule runs it. |
| `npm run report` | Opens the most recent local HTML report. |
| `npm run web` | Starts the local site preview on port 4321. |
| `npm test` | Runs the three test files. |
| `npm run install-schedule` | Registers the scheduled job with macOS. |
| `npm run uninstall-schedule` | Removes the schedule, keeping your data. |

One thing that will confuse you if nobody warns you: **the project's runtime data
does not live in the project folder.** The database, the browser profile, the
reports and the screenshots all live under
`~/Library/Application Support/linkedin-watcher/`. There is a genuinely
interesting macOS reason for that, explained in a comment in the source and at
length in Chapter 21, *Deployment, Scheduling, and Operations*.

### All the code in this book is real, and you can open it

When you see a fenced code block that is presented as project code, it was
copied out of the repository. Not paraphrased. Not tidied. If a line is ugly, it
is ugly in the repository too.

Locations are cited like this: `src/paths.js:18`. That means the file
`src/paths.js`, counting from the repository root, line 18. In VS Code you can
jump straight there with `Ctrl+P` (`Cmd+P` on a Mac) and typing
`src/paths.js:18`.

Here is a real example, so you can see the convention working. This is from the
local development server, `web/serve.js:77`:

```javascript
const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
if (!path.startsWith(ROOT)) {
  res.statusCode = 403;
  return res.end('Forbidden');
}
```

And here is the other convention: **after every real code block, the book
explains it.** Never a paste-and-move-on. Line by line:

- **Line 1** builds the path of the file to send back. `ROOT` is the `public`
  folder. `rel` is whatever the visitor asked for. `normalize` cleans up the path,
  and the `.replace(...)` strips any leading `../` sequences, which are the
  notation for "go up one folder."
- **Line 2** is the actual guard. Even after that cleanup, it checks that the
  final path still starts inside `ROOT`.
- **Lines 3 and 4** refuse the request with status **403**, which is the HTTP code
  for "I understood you and I am not doing it."

Why does that exist? Because without it, a visitor could ask for something like
`/../../.env` and read the file holding the project's secret API key. This is
called a **path traversal attack**, and it is one of the oldest bugs on the web.
Four lines. Chapter 12 goes through the whole file.

Occasionally the book uses a small invented example to teach an idea before
showing the real code — a two-line React component, a toy SQL table. Those are
**always labelled explicitly**, in the sentence right before them, as made-up
examples that are not from the project. If a code block is not labelled that
way, it is real and you can open it.

### Where the code and the words disagree

Here is a real thing that happened in this repository, and it is worth teaching
in the front matter because you will meet it in your own work within a month.

`src/index.js:4` — the comment at the very top of the main file — says the
program is:

> Invoked by launchd at 12:00 and 18:00, or by hand via `npm run`.

The installer script says the same in its header, at
`bin/install-schedule.sh:2`: it "runs the watcher at 12:00 and 18:00 daily."

But the actual schedule that gets installed is at `bin/install-schedule.sh:144`,
and it contains a single entry with a `Minute` of `0` and no `Hour` key at all. In
macOS scheduling, an omitted field is a wildcard. That means **every hour, on the
hour** — twenty-four runs a day, not two. The README agrees with the code. The
comments do not.

Nothing is broken. The design changed from twice a day to hourly, the code and
the README were updated, and two comments were not. This is completely normal and
it happens in every codebase in the world.

The rule this book follows, and the rule you should follow: **when a comment and
the code disagree, the code wins.** A comment is a claim about the code. The code
is the code. Comments do not run, so nothing forces them to stay true. When you
read this book and it describes behaviour that differs from a comment you see in
the file, that is why.

It also tells you something about how to write comments. The comments that stay
true are the ones that explain *why* — "launchd creates log files but never their
parent directory" — because reasons change far more slowly than schedules do. The
comments that rot are the ones that restate *what*.

### Conventions used throughout

- **Bold** on first use marks a term being defined. The definition is in the same
  sentence.
- `Fixed-width text` is a filename, a command, a value, or a piece of code.
- A `$` at the start of a line in a shell block means "type the rest of this at
  your terminal." Do not type the `$`.
- 🔴 marks the hardest exercise in a chapter.
- Chapters are referenced by number and title — "Chapter 14, *Databases and
  SQLite*" — so you always know where you are being sent.
- The book assumes you have forgotten the details of earlier chapters, because
  you have. Rather than sending you back, it restates the one fact it needs in
  half a sentence. That repetition is intentional. Skim past it when you do not
  need it.

### How long this takes

Twenty-six chapters, six to twelve thousand words each. That is a semester's
worth of reading if you treat it as a textbook, and a couple of intense weeks if
you do nothing else.

The most common way to fail at this is to read all of it and build none of it.
Reading produces a very convincing feeling of understanding that evaporates the
moment you face an empty file. If you have to choose, read half the book and do
all the exercises rather than the reverse.

### When you get stuck

In order:

1. **Read the error message.** All of it, including the file and line at the end.
   Beginners skip error messages because they look frightening. They are usually
   telling you exactly what is wrong.
2. **Look the word up in Chapter 25, *Glossary*.**
3. **Open the file the book is citing and read the code around it.** Ten lines
   above and ten below.
4. **Print things.** `console.log()` is not a beginner's crutch. Professionals
   use it constantly.
5. **Change one thing at a time**, and re-run. Two changes at once, and you learn
   nothing from the result.

---
---

## Table of Contents

**Front matter** — Cover, Copyright and honest notices, Preface, How to Use This
Book, Table of Contents.

---

### Part I — Ground Floor

*Everything below the floor other books start from.*

**1. What Is Software?**
What a program actually is, what a computer does when it "runs" one, and why code
is only text that a machine has agreed to obey.

**2. How Websites Actually Work**
The full journey from typing an address to seeing a page: clients, servers, IP
addresses, DNS, HTTP requests and responses, and what the word "hosting" hides.

---

### Part II — This Project

*What we are going to spend the rest of the book taking apart.*

**3. Meet Intern Radar**
The whole system in one chapter — two programs, one folder, one database, one
website — and the real problem it was built to solve.

**4. The Shape of the Folder**
Every directory and file in the repository, why each one sits where it sits, and
how to navigate 8,712 lines without getting lost.

---

### Part III — The Browser Half

*The part a visitor can see.*

**5. HTML: The Skeleton**
What markup is, what "semantic" means, and a tag-by-tag reading of the real
`web/public/index.html`, including the metadata that makes a link preview appear
in WhatsApp.

**6. CSS: The Skin**
Selectors, the box model, layout with flexbox and grid, custom properties, dark
mode, and how 550 hand-written lines in `web/public/styles.css` control the whole
look with no framework.

**7. JavaScript: The Muscles**
The language from the beginning — values, functions, objects, arrays, scope,
`async`/`await`, modules — taught with examples pulled from the project's own
files.

**8. The DOM and How a Page Is Painted**
What the browser builds in memory from your HTML, how JavaScript changes it,
what events are, and what actually costs time when a page redraws.

**9. Frameworks, React, and the Road Not Taken**
React taught properly — components, props, state, hooks, the virtual DOM,
reconciliation, keys — then the same job done by hand in `web/public/app.js`, and
an honest accounting of what each approach costs and buys.

---

### Part IV — The Server Half

*The part that runs where nobody can see it.*

**10. Inside Node.js**
JavaScript outside the browser: what a runtime is, the event loop, blocking
versus non-blocking, the standard library, and why this project leans on it so
heavily.

**11. Modules, npm, and the One-Dependency Rule**
What a package is, what `npm install` really does, what a lockfile is for, the
true cost of a dependency, and why this project has exactly one.

**12. Servers From Scratch**
What a web server does, how Express does it, and how `web/serve.js` does the same
job in 100 lines on `node:http` — routing, content types, static files, and the
path-traversal guard.

**13. Serverless and the Tailor Endpoint**
What "serverless" actually means, cold starts, execution limits, and a full
reading of `web/api/tailor.js`: the résumé tailoring function, its rate limits,
and the check that stops it inventing skills.

---

### Part V — Remembering Things

*Where data goes when the program stops.*

**14. Databases and SQLite**
Tables, rows, keys, SQL, indexes, transactions and migrations — plus what MongoDB
is and why it would be the wrong tool here — followed by the real schema and
queries in `src/store.js`.

**15. APIs and REST**
What an API is, what REST means, HTTP verbs, status codes, JSON, authentication
with keys, and the two external APIs this project calls.

---

### Part VI — The Engine Room

*The interesting, difficult, slightly dangerous parts.*

**16. Web Scraping and Playwright**
Driving a real browser from code, selectors and waiting, why the pacing in
`src/human.js` is deliberately slow and imperfect, how `src/guard.js` detects a
block and stops — and a serious look at the ethics and the terms of service.

**17. Talking to a Language Model**
What a large language model is, prompts and tokens, getting structured JSON back,
why `thinkingBudget: 0` is set on every call, and why every AI call in this
project has an offline fallback that runs first.

**18. The Watcher, File by File**
Every module in `src/` and `bin/`, read closely and in the order a real run
touches them, from `src/index.js` down to the logger.

**19. The Site, File by File**
Everything in `web/` that reaches a visitor: the markup, the stylesheet, the
825-line browser application, the one serverless function, and the published
JSON that connects them.

---

### Part VII — Running It for Real

*The unglamorous half of engineering.*

**20. Every Configuration File**
`package.json`, `config.json`, `companies.json`, `vercel.json`, `.env`,
`.gitignore` and the rest — every setting, what it does, and what happens when
you set it wrong.

**21. Deployment, Scheduling, and Operations**
Git-push deploys on Vercel, environment variables and secrets, launchd and the
macOS permissions problem, DNS and the apex-versus-`www` incident that took the
site down, logs, and what to do at 2 a.m.

---

### Part VIII — Becoming the Author

*From reading someone else's system to writing your own.*

**22. Software Engineering Principles, Seen in This Code**
Naming, boundaries, single responsibility, failure modes, defensive design,
tests, comments that stay true, and trade-offs — each one pointed at a specific
real line rather than stated in the abstract.

**23. One Complete Journey Through the System**
One internship followed end to end: from a card on a LinkedIn results page,
through extraction, classification, storage and publishing, to a card on the
public site and a tailored résumé in a student's hands.

**24. Rebuild It From an Empty Folder**
A staged plan to build the whole system yourself without copying — what to build
first, what to get working before moving on, and a checkpoint at the end of each
stage.

---

### Back matter

**25. Glossary**
Every term this book defines, in one alphabetical list, in plain English, with
the chapter that explains it properly.

**26. Appendix**
Command reference, every configuration key, the complete file inventory with line
counts, further reading, and where to get help.

---
---

## Before you begin: an orientation quiz

This is not a test. It is a way of finding out what you do not know yet, which is
a genuinely useful thing to know before starting. Answer honestly, guess freely,
then read the answers.

If you get most of them wrong, you are exactly the reader this book was written
for. If you get most of them right, skip Part I and start at Chapter 3.

**Q1.** What is a *server*?
a) A very large computer owned by a company
b) A computer, anywhere, that waits for requests and answers them
c) A program that stores your files in the cloud
d) A room full of blinking machines

**Q2.** True or false: a website must have a program running somewhere at the
moment you visit it, or it cannot show you a page.

**Q3.** Your friend says "I built the front end in React." What does *front end*
mean?

**Q4.** What does `npm install` do, roughly?

**Q5.** Which of these is a database?
a) SQLite
b) MongoDB
c) Both
d) Neither — they are programming languages

**Q6.** A program on your laptop wants to publish something to a public website.
Name one way it could do that *without* the website having any always-on server
program of its own.

**Q7.** What is the difference between HTML, CSS and JavaScript, in one sentence
each?

**Q8.** Intern Radar has exactly one installed npm package. Guess which one, and
guess why that one could not reasonably be written by hand.

**Q9.** Why would a program that reads web pages automatically deliberately
insert random delays and imperfect mouse movements?

**Q10.** An AI model is asked to reply with strict JSON and sometimes replies with
something that will not parse. Name one way to make that failure harmless.

---

## Answers to the orientation quiz

**A1. (b).** A server is any computer that waits for requests from other
computers and answers them. Size is irrelevant — your own laptop becomes a server
the moment you run `npm run web`. Chapter 2, *How Websites Actually Work*, and
Chapter 12, *Servers From Scratch*.

**A2. False.** A site can be nothing but files sitting on a hard disk somewhere,
handed over exactly as they are. That is a **static site**, and it is what most
of Intern Radar's website is. The confusion is extremely common. Chapters 2 and
13.

**A3.** The *front end* is the part that runs inside the visitor's own browser —
the page structure, the styling, and the JavaScript that responds to clicks. The
*back end* is the part that runs on some other computer. Part III versus Part IV.

**A4.** It reads the list of packages in `package.json`, downloads them from the
npm registry into a folder called `node_modules`, and downloads everything those
packages themselves depend on, and so on. On most projects that is hundreds of
packages. On this one it is one. Chapter 11.

**A5. (c).** Both are databases with very different designs. SQLite is a
relational database that lives in a single file with no separate process.
MongoDB is a document database that normally runs as its own service. Chapter 14
teaches both and explains why this project chose the first.

**A6.** The way this project does it: the program writes a file, commits it to
git, and pushes it to GitHub. The hosting service notices the push and rebuilds
the site from the new files. No server on the site's side ever ran any of the
project's own code. Chapters 19 and 21.

**A7.** HTML says what things *are* — this is a heading, this is a list. CSS says
what they *look like* — this heading is large and yellow. JavaScript says what
happens when things *change* — when this button is clicked, do that. Chapters 5,
6 and 7.

**A8.** It is `playwright-core`, the library that starts and controls a real web
browser from code. Writing it by hand would mean implementing the protocol
browsers use for remote control, plus the waiting, screenshotting and process
management around it — realistically months of work. This is the book's standing
question ("did we need a library for this?") producing a rare yes. Chapters 11
and 16.

**A9.** Because behaving perfectly is what identifies you as a robot. Real people
pause unevenly, move the mouse in curves, and scroll a bit too far. Sites detect
automation partly by looking for inhuman regularity, and detection means a
blocked account. `src/human.js`, explained in Chapter 16.

**A10.** Have something else already produce an answer *before* the model is
called, so that a failed or unparseable reply just leaves the existing answer in
place. That is precisely what this project does: an offline classifier in
`src/roles.js` decides first, and the AI is only asked about the cases it could
not settle. Chapter 17.

---

*Turn to Chapter 1, "What Is Software?", and start from nothing.*
