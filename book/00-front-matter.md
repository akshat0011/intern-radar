# Intern Radar, Explained

### A Working Project, From First Principles to Interview

---

**A book about one real codebase.**

Two programs. One folder. One npm dependency.
No React. No Express. No MongoDB. No build step.

It watches LinkedIn for internships at 860 companies,
stores them in SQLite, and publishes them to
[internradar.online](https://internradar.online).

---

*Ten chapters, a glossary, and about 500 interview questions and answers.*
*Written to be finished in five evenings.*

---

\pagebreak

## Preface

You have a technical interview in one week. It is about this project. You need to walk in and explain every part of it, and defend every decision, and you may currently not be sure what a server is.

That is exactly who this book is written for. It teaches from zero. A **server** is a computer that sits somewhere else, stays switched on, and answers requests from other computers. You did not know that a paragraph ago; now you do; that is the pace. Every term gets defined the first time it appears, in one plain sentence, in bold. There is no assumed background beyond being able to read English and open a folder on a laptop.

The book is short on purpose. Ten chapters, each readable in under an hour. You can finish the whole thing in a few evenings, which is what you have. Every paragraph had to earn its place against that deadline. Where you feel a chapter is moving fast, it is because padding it would have cost you an evening you do not have.

### What this project is not

Here is the honest part, and you should read it before you read anything else.

If you came expecting **React** (a popular JavaScript library for building user interfaces), **Express** (a popular library for writing web servers in JavaScript), **MongoDB** (a popular database), **Tailwind**, **Docker**, or **TypeScript** — none of them are in this repository. Not one. The **repository**, or repo, is just the folder holding all the project's files and its history of changes.

What is here instead:

- The browser-side app is 825 lines of plain JavaScript talking directly to the page. No framework.
- The local development server is 100 lines written on Node's built-in HTTP module. No Express.
- The database is SQLite, reached through a module that ships inside Node itself. No installation, no ORM, no MongoDB.
- The styling is one hand-written CSS file. No Tailwind.
- There is no build step at all. The file you edit is the file that ships.
- The whole project has **exactly one npm dependency**: `playwright-core`, which drives a real browser.

Your instinct, reading that list, may be that this is a weakness — that a "real" project would have used the popular tools, and that an interviewer will mark you down for their absence.

That instinct is wrong, and understanding why it is wrong is most of what this book teaches.

Interviewers do not hire you for the logos on your résumé. They hire you because you can reason. A candidate who says "I used React" has told the interviewer nothing they could not have guessed. A candidate who says "I didn't use React, because this page renders one list from one JSON file and re-renders it when a filter changes — a framework would have added a build step, a dependency tree, and a class of bugs, to solve a problem I did not have" has demonstrated judgment. Judgment is the scarce thing. Frameworks are not.

The same argument runs through every chapter. Every dependency you add is code you did not write, cannot fully read, and are nonetheless responsible for when it breaks at 2 a.m. This project keeps asking one question — *did we actually need a library for this?* — and usually answers no. Sometimes the answer is yes: driving a real browser is genuinely hard, so `playwright-core` stays. Knowing the difference is the skill.

### What you will be able to do

By the last page you will be able to trace one internship posting from the moment LinkedIn renders it in a browser window on a Mac in India, through extraction, classification, and storage, into a JSON file, through a `git push`, onto a public website, and finally into a résumé tailored for it — and explain, at every step, what runs where, why, and what it costs.

You will also be able to answer the hard questions. Scraping LinkedIn is against their Terms of Service. The watcher only runs when one specific laptop is awake. The site cannot show anything the last run did not find. None of that is hidden in this book, because none of it can be hidden in an interview. An answer that names a real trade-off honestly beats an answer that pretends the trade-off is not there. Interviewers have heard the pretending version many times.

---

## How to Use This Book

**Read it in order.** The chapters are not independent essays. Chapter 6 assumes you met the database in Chapter 1 and understood asynchronous code in Chapter 4. Skipping ahead will cost you more time than it saves.

**The interview questions are the point.** Every chapter ends with 8 to 12 questions and full model answers. Those sections are not revision aids bolted on at the end — they are the reason the book exists, and the chapters exist to make them make sense. Some of the questions are hostile on purpose. They probe the genuine weak spots, and the answers admit them. Read the question first, try to answer it out loud in your own words, then read the model answer and see what you missed. Out loud matters. An answer that is clear in your head and mush in your mouth is not yet an answer.

**Do the quiz.** Six questions at the end of every chapter, answers in a block at the very bottom of the page. It takes four minutes. If you get two wrong, reread that section before moving on — you will not have time to fix the gap later in the week.

**Keep the repository open beside you.** Every code block in this book is quoted from real files, cited like `` `src/roles.js:175` ``, meaning line 175 of the file `roles.js` inside the `src` folder. Open the file. Scroll around it. Read the twenty lines above and below. The book shows you the interesting parts; the code contains the boring parts, and interviewers ask about those too. A project you have only read *about* sounds different from one you have read.

**Do at least the easy exercises.** Each chapter has three to five, ordered easy to hard, with the hardest marked 🔴. At minimum, do the first one in every chapter. It is usually five minutes and it converts reading into memory.

### A five-evening plan

You have a week. Use five of those evenings for reading and leave the last two for review and sleep.

| Evening | Read | Roughly |
|---|---|---|
| **1** | Chapter 1 (*The Project in Five Minutes*) and Chapter 2 (*How the Web Actually Works*) | The map, then the ground it sits on. End the evening able to say what happens when you type a web address and press Enter. |
| **2** | Chapter 3 (*The Page*) and Chapter 4 (*JavaScript, and Why Async Is Hard*) | The two chapters everything visible depends on. Chapter 4 is the hardest in the book. Read it when you are fresh, not last thing. |
| **3** | Chapter 5 (*Node.js, Modules, and Servers Without a Framework*) and Chapter 6 (*SQLite and the Store*) | Where the code moves off the page and onto a machine. |
| **4** | Chapter 7 (*APIs, REST, and Talking to a Language Model*) and Chapter 8 (*The Scraper*) | The two chapters most likely to generate follow-up questions in the interview. Budget extra time for the questions at the end of Chapter 8. |
| **5** | Chapter 9 (*Shipping It*) and Chapter 10 (*Engineering Judgment*) | How it reaches the world, and how you would rebuild it from an empty folder. Chapter 10 is the one to reread on the morning of the interview. |
| **6–7** | The Glossary and Interview Pack, plus every chapter's question section again | No new material. Just say the answers out loud. |

If you have fewer than five evenings, read Chapters 1, 4, 8, and 10, then the Interview Pack. That is the smallest set that still lets you hold a conversation.

Think of it the way you would think of a syllabus before an exam: reading the whole thing once badly is worse than reading four chapters properly and knowing which four you skipped.

---

## Table of Contents

**Front matter** — cover, this preface, how to use the book, and this table of contents.

**Chapter 1 — The Project in Five Minutes**
What Intern Radar does, the two-program architecture, and a guided tour of every folder in the repository.

**Chapter 2 — How the Web Actually Works**
The internet, DNS, HTTP and HTTPS, caching, CDNs, and what "deploying" really means — including the real incident where a domain silently lost its DNS records and broke the share card.

**Chapter 3 — The Page: HTML, CSS, and the DOM**
How a browser turns text into a page you can see, and two real layout bugs from this project: a flex item that pushed the page 150 pixels off a phone screen, and a sticky header that froze half the display.

**Chapter 4 — JavaScript, and Why Async Is Hard**
Variables, functions, objects, and then the part everyone struggles with — the event loop, callbacks, promises, and `async`/`await`, explained in terms of a single-threaded language that never waits.

**Chapter 5 — Node.js, Modules, and Servers Without a Framework**
Running JavaScript outside a browser, the ES module system, and a 100-line development server hand-rolled on `node:http` — with a plain explanation of what Express would have added and why it was not added.

**Chapter 6 — Remembering Things: SQLite and the Store**
What a database is, why this one is a single file, tables and queries and indexes, schema migrations, and the deduplication logic that stops the same internship being reported twice.

**Chapter 7 — APIs, REST, and Talking to a Language Model**
What an API is, how HTTP requests carry JSON, and how this project calls Google's Gemini model over plain `fetch` with no SDK — including why every AI call has an offline fallback that runs *first*, and why `thinkingBudget: 0` was measured rather than guessed.

**Chapter 8 — The Scraper: Playwright and Defensive Design**
Driving a real Brave browser with Playwright, why the scraper deliberately acts slowly and imperfectly, how it detects CAPTCHAs and blocks and stops rather than pushing through, and an honest treatment of the Terms of Service question.

**Chapter 9 — Shipping It: Deployment, Scheduling, and Operations**
Git, GitHub, and Vercel; how a JSON file committed to a repository becomes a live website in about a minute; scheduling with macOS launchd instead of cron; locks, cooldowns, logs, and what happens when the laptop is asleep.

**Chapter 10 — Engineering Judgment, and Rebuilding It From an Empty Folder**
The reasoning behind every major decision, the trade-offs each one cost, the weaknesses that remain — and a walkthrough of how you would build this again from nothing, which is the question interviewers ask when they want to know whether you understood it or memorised it.

**Glossary and Interview Pack**
Every technical term in the book defined in one place, plus a condensed set of the highest-value interview questions and answers pulled from all ten chapters — the last thing to read before you walk in.

---

One more thing before Chapter 1. You are going to meet code that is imperfect, decisions that were later reversed, and at least one bug that shipped to real users. That is not a flaw in the material. It is the material. Finished, tidy code teaches you nothing about how it got that way, and interviewers are hiring for the getting-there, not the tidiness.

Turn the page.
