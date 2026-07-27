# Glossary and Interview Pack

> Read Part 1 once, slowly. Read Part 2 the night before.

---

# Part 1 — Glossary

Every term the book uses, in plain words.

**ACID** — Four promises a database makes about a transaction: it happens completely or not at all, it never leaves broken data, concurrent work does not interfere, and once saved it survives a crash.

**API (Application Programming Interface)** — An agreed way for one program to ask another program for something. A menu of things you may request, and the format for requesting them.

**Argument** — The actual value you pass into a function when you call it. `greet("Akshat")` passes the argument `"Akshat"`.

**Array** — An ordered list of values, numbered from zero.

**async / await** — Keywords that let you write code that waits for slow work without freezing everything else. `await` pauses only the function it is inside.

**Attribute** — Extra information written inside an HTML tag, like `class="row"`.

**B-tree** — The tree-shaped structure a database index uses so it can find a row in a few steps instead of reading every row.

**Binary** — Numbers written using only 0 and 1. What computers actually store.

**Browser** — A program that fetches web pages and draws them. Chrome, Safari, Brave, Firefox.

**Bundler** — A tool that combines many JavaScript files into fewer files for the browser. This project has none.

**Cache** — A copy of something kept closer to where it is needed, so you do not fetch it again.

**Cache-Control** — An HTTP header telling browsers and CDNs how long they may reuse a cached copy.

**Callback** — A function you hand to another function, to be run later when something finishes.

**CDN (Content Delivery Network)** — Servers spread around the world holding copies of your files, so users download from a nearby machine.

**Certificate** — A file proving a website really is who it claims to be, signed by an authority browsers trust.

**CI/CD** — Continuous Integration / Continuous Deployment. Automation that tests and ships your code when you push it.

**Class** — A template for making objects that share behaviour.

**CLI (Command Line Interface)** — Controlling a program by typing commands instead of clicking.

**Closure** — A function that remembers the variables from where it was created, even after that place has finished running.

**CommonJS** — Node's older module system, using `require()`. This project uses ESM instead.

**Compiler** — A program that translates source code into machine code before it runs.

**Cookie** — A small piece of data a website asks your browser to store and send back on later requests.

**CORS (Cross-Origin Resource Sharing)** — Browser rules controlling whether a page on one domain may call another domain.

**CPU (Central Processing Unit)** — The chip that executes instructions. The part that actually does the work.

**CRUD** — Create, Read, Update, Delete. The four basic things you do to stored data.

**CSS (Cascading Style Sheets)** — The language that describes how HTML should look.

**Cursor pagination** — Asking for "the next 20 after this item" rather than "rows 40 to 60". Stays correct when data changes underneath you.

**Database** — Organised storage that lets many readers and writers work safely and find things quickly.

**Dependency** — Somebody else's code that your project needs to run. This project has exactly one.

**Deployment** — Putting your code somewhere the public can reach it.

**DevTools** — The inspection panel built into browsers. Elements, Console, Network, Application.

**DNS (Domain Name System)** — The internet's phone book. Turns `internradar.online` into an IP address.

**DOM (Document Object Model)** — The live tree of objects the browser builds from your HTML. JavaScript changes the DOM, not the file.

**Element** — One node in an HTML document, like a paragraph or a button.

**Endpoint** — One specific address on an API that does one specific thing, like `POST /api/tailor`.

**Environment variable** — A setting passed to a program from outside it, used for secrets and per-machine configuration.

**ESM (ECMAScript Modules)** — The official JavaScript module system, using `import` and `export`.

**Event loop** — The mechanism that lets Node do one thing at a time while still handling thousands of slow operations, by running callbacks as work completes.

**fetch** — The built-in function for making HTTP requests, in both browsers and modern Node.

**Flexbox** — A CSS layout system for arranging items in a row or column with flexible sizing.

**Foreign key** — A column pointing at another table's primary key, linking two rows together.

**Function** — A named, reusable block of code that takes input and usually returns output.

**Git** — Software that records every version of your files and lets you move between them.

**GraphQL** — An alternative to REST where the client asks for exactly the fields it wants.

**Grid** — A CSS layout system for two-dimensional layouts, rows and columns together.

**Header** — A line of metadata attached to an HTTP request or response.

**Hoisting** — JavaScript moving declarations to the top of their scope before running. The cause of many confusing bugs.

**Hosting** — Paying someone to keep your files on a machine that is always on.

**HTML (HyperText Markup Language)** — The language describing the structure and meaning of a page.

**HTTP (HyperText Transfer Protocol)** — The request-and-response language browsers and servers speak.

**HTTPS** — HTTP wrapped in encryption, so nobody in between can read or change it.

**Idempotent** — An operation you can safely repeat with the same result. Deleting the same thing twice leaves it deleted.

**Index** — A prepared lookup structure that makes finding rows fast, at the cost of slower writes.

**Interpreter** — A program that reads source code and runs it directly, without a separate compile step.

**IP address** — The numeric address of a machine on a network, like `216.198.79.1`.

**JIT (Just-In-Time compilation)** — Compiling code to machine code while the program runs, so hot paths get fast. What V8 does to JavaScript.

**JSON (JavaScript Object Notation)** — A plain-text format for structured data. Human-readable, machine-parseable, everywhere.

**JWT (JSON Web Token)** — A signed token carrying claims about a user. Commonly misused: it is signed, not encrypted, so anyone can read its contents.

**launchd** — macOS's scheduler for running programs at set times. This project uses it instead of cron.

**Library** — Reusable code you call. You are in charge.

**Framework** — Reusable code that calls you. It is in charge. That inversion is the real difference.

**Linter** — A tool that reads your code and flags likely mistakes and style problems.

**Load balancer** — A machine spreading incoming requests across several servers.

**Machine code** — Raw numeric instructions the CPU understands directly.

**Microtask** — A job the event loop runs immediately after the current operation, before timers. Promise callbacks are microtasks.

**Middleware** — In frameworks like Express, a function that sits between the request and the final handler.

**Migration** — A change to a database's structure, applied in a controlled way so existing data survives.

**MIME type** — A label saying what kind of file something is, like `image/jpeg`. Get it wrong and the browser refuses to display it.

**Module** — One file of code that exports things other files import.

**MongoDB** — A popular document database. Not used here.

**node_modules** — The folder where npm installs dependencies. Usually enormous. Never committed.

**Node.js** — A program that runs JavaScript outside the browser, on your machine or a server.

**npm** — Node's package manager and the registry it downloads from.

**NULL** — A database value meaning "no value here". Not zero, not empty string.

**Object** — A collection of named values, written `{ name: "Akshat", age: 20 }`.

**Operating system** — The program managing the machine and everything running on it. macOS, Windows, Linux.

**ORM (Object-Relational Mapper)** — A library that turns database rows into objects so you write less SQL. Not used here.

**package.json** — The file describing a Node project: its name, scripts, and dependencies.

**package-lock.json** — Records the exact version of every installed package, so everyone gets identical code. Always commit it.

**Packet** — A small chunk of data. Everything on the internet travels as packets.

**Parameter** — The named placeholder in a function definition. The argument is what fills it.

**Port** — A numbered door on a machine. Web servers usually listen on 80 or 443; this project's dev server uses 4321.

**Prepared statement** — A SQL query with `?` placeholders, where values are sent separately. The correct defence against SQL injection.

**Primary key** — The column uniquely identifying each row in a table.

**Process** — One running program, with its own memory.

**Promise** — An object representing work that will finish later, either successfully or with an error.

**Pure function** — A function that only uses its inputs and only returns a value, changing nothing else. Easy to test.

**Query** — A request to a database.

**Query parameter** — Extra data in a URL after `?`, like `?v=2`.

**RAM (Random Access Memory)** — Fast temporary memory. Empties when power goes.

**Reflow (layout)** — The browser recalculating where everything sits on the page. Expensive.

**Regular expression** — A compact pattern for matching text.

**Render** — To draw something on screen.

**Repository** — In git, a project whose history is tracked. In architecture, the layer that hides how data is stored.

**Request** — A message asking a server for something.

**Response** — The server's reply, with a status code, headers, and usually a body.

**REST** — A style of designing web APIs around resources and standard HTTP methods.

**Reverse proxy** — A server sitting in front of other servers, forwarding requests and often handling HTTPS and caching.

**Runtime** — The environment a program runs inside. Node is a runtime for JavaScript.

**Scope** — The region of code where a variable exists.

**Scraping** — Extracting data from a website's pages because it offers no API.

**Semantic versioning** — Version numbers as MAJOR.MINOR.PATCH, where MAJOR means a breaking change.

**Serverless** — Running code without managing a server. There are still servers; you just do not touch them.

**Server** — A role, not a machine: any program that waits for requests and answers them. Your laptop becomes one when you run a dev server.

**Session** — A server's memory of who you are across several requests.

**SQL (Structured Query Language)** — The language for talking to relational databases.

**SQLite** — A database that is a library, not a server, storing everything in one file. Built into Node 22 as `node:sqlite`.

**SSL / TLS** — The encryption underneath HTTPS.

**State** — Data that changes over time and that your code must keep track of.

**Static site** — A site made of files served as-is, with no server-side computation per request.

**Status code** — A three-digit number summarising what happened. 200 fine, 404 not found, 429 too many requests, 500 server broke.

**Storage** — Permanent memory. Survives power loss. Your SSD.

**String** — Text, in code.

**TCP** — A protocol guaranteeing data arrives complete and in order.

**Thread** — One sequence of execution. Node runs your JavaScript on one.

**Transaction** — A group of database changes that all succeed or all fail together.

**TTL (Time To Live)** — How long a cached answer may be reused. Why DNS changes take hours.

**UDP** — A protocol that sends data without guaranteeing arrival. Faster, used for video calls and games.

**URL** — The full address of a resource on the web.

**UTF-8** — The standard way of storing text so every language's characters work.

**V8** — Google's JavaScript engine, used by Chrome and Node.

**Variable** — A named box holding a value.

**Vercel** — The hosting platform this project deploys to, connected to GitHub.

**Virtual DOM** — React's in-memory copy of the page, compared against the previous version to work out the smallest real change. This project has none.

**Web server** — A program that answers HTTP requests.

**XSS (Cross-Site Scripting)** — An attack where someone's text is treated as code by your page. Prevented here by using `textContent` everywhere instead of `innerHTML`.

---

# Part 2 — The Interview Pack

## The 60-second pitch

Memorise the shape, not the words.

> "Intern Radar is a job board for engineering internships in India. The problem it solves is timing — popular internships collect hundreds of applicants within a day, so being early matters more than having a perfect résumé.
>
> It's two programs sharing one database. The first is a watcher that runs on my Mac every hour. It drives a real Brave browser through Playwright, searches LinkedIn for internships at a watchlist of companies, extracts the details, classifies each role as technical or not, and stores everything in SQLite.
>
> The second is the website. The watcher writes a JSON file, commits it to git and pushes. Vercel deploys on push. So the site is completely static — no backend server, no database calls at request time. The only dynamic piece is one serverless function that tailors a résumé to a job using Gemini.
>
> The thing I'd point to is that it has exactly one npm dependency. Almost everything else is built on what Node gives you — including the database, because SQLite is built into Node 22 now."

Then stop. Let them ask.

## The 10 most likely questions

**1. Walk me through the architecture.**
Two programs, one shared SQLite file. The watcher scrapes and stores; the site displays. They connect through a JSON file in git, not a network call. Vercel redeploys whenever that file changes. There's no always-on server, so hosting is free and there's nothing to patch or keep alive.

**2. Why no framework?**
The site renders one list from one JSON file. There's no routing and almost no interactive state. React would add a build step, a bundler, and hundreds of packages to maintain, and the payoff — declarative state management — isn't needed at this size. I'd reach for a framework the moment I had multiple pages, shared state across components, or a team.

**3. Why only one dependency?**
Every dependency is code I'm responsible for but didn't write, plus a supply-chain risk. I used `playwright-core` because writing browser automation myself is genuinely unreasonable. Everything else — the dev server, the logger, the database layer — was small enough that writing it was less work than evaluating and maintaining a library.

**4. How does the classification work?**
Two layers. An offline vocabulary classifier reads the job title and gives every job a verdict first. Then Gemini refines it using the full description. The offline pass runs first deliberately, so if the API key is missing, the quota is spent, or the network is down, every job still has a verdict. The program never depends on an API being up.

**5. What's the database schema?**
One main `jobs` table keyed by LinkedIn's job ID, plus `runs` for run history and `seen_cards` for jobs deliberately skipped. Migrations are additive only — new columns get added, nothing is ever renamed or dropped, so an old database file keeps working.

**6. How do you handle errors from the AI?**
I never trust the output. Responses go through a schema, then get cleaned in code — trimmed, deduplicated, length-capped. If fewer than two usable bullets come back, the job keeps its plain summary rather than showing a thin card. And for résumé tailoring there's a function that checks the model didn't invent skills the candidate never claimed.

**7. What was the hardest bug?**
Structured JSON from Gemini kept coming back empty. It looked like truncation, so I raised the token limit — no change. It turned out the model was spending its reply budget on internal thinking tokens before emitting JSON. With thinking on, zero of six items parsed; with `thinkingBudget: 0`, all six. The lesson was that "increase the limit" was a guess, and measuring the actual token counts is what found it.

**8. How is it deployed?**
Git-connected to Vercel. The watcher runs `git push` at the end of a successful run and Vercel builds automatically. There's no build step — the files I edit are the files that ship.

**9. How do you keep it running?**
macOS launchd triggers it every hour. Failures produce a desktop notification and a local HTML report.

**10. What would you change?**
Move the watcher off my Mac to a machine that's always on — that's the biggest weakness. Add tests for the browser-side code, which currently has none. And if it ever served more than one person, the single hardcoded watchlist would have to become per-user data, which needs a real backend.

## The 5 hardest questions

These probe real weaknesses. Concede the limitation, then show your reasoning. A confident honest answer beats a defensive one every time.

**1. Isn't scraping LinkedIn against their Terms of Service?**
> Yes, it is. I'm not going to pretend otherwise. What I did was reduce the harm: it runs every hour rather than continuously, it paces itself like a human with randomised delays instead of hammering the site, it uses my own logged-in profile rather than fake accounts, and it deliberately doesn't republish the job descriptions because those are the employer's copyrighted text — it links back to the original posting. That's mitigation, not permission. If I were building this commercially I'd need a licensed data source or a partnership, and I'd have started there.

**2. Your whole system dies when your laptop is closed. Isn't that a fatal flaw?**
> For a production product, yes. For this one it's a deliberate trade: it costs nothing, there are no credentials sitting on a server, and there's no infrastructure to patch. The cost is real — a missed run means missed jobs, and the data is only as fresh as the last run. The fix is straightforward if it mattered: move the watcher to a small always-on machine. Nothing in the design prevents that, because the watcher already communicates through a file rather than sharing memory with anything.

**3. You have no tests on the front end. Why should I trust it?**
> You shouldn't trust it as much as the back end, and that's a genuine gap. What is tested is the part where bugs are subtle and silent — the pure text-parsing functions that pull stipend, duration and dates out of messy text, and the role classifier. Those have real tests because a wrong answer there is invisible. The front-end code is mostly DOM construction where mistakes are immediately obvious on screen. That reasoning explains the gap; it doesn't excuse it. If I extended this, Playwright tests on the site would be first.

**4. Why SQLite? Isn't that a toy database?**
> It's the most widely deployed database in the world — it's in every phone and every browser. The "toy" reputation comes from one real limitation: it's a library, not a server, so it doesn't handle many machines writing at once. This project has exactly one writer, on one machine, at two scheduled times. That's precisely the workload SQLite is best at. Using Postgres would have meant running a server, managing connections and credentials, for zero benefit. If I ever had concurrent writers, I'd migrate.

**5. Aren't you just calling an AI API? Where's the engineering?**
> The API call is about ten lines. The engineering is everything around it. Every AI call has an offline fallback computed *before* the API is touched, so a spent quota degrades the output instead of breaking the program. Responses are schema-constrained and then re-validated in code, because a schema is a request, not a guarantee. Batches are sized so one bad response costs little. And there's a specific guard that checks the model hasn't invented résumé skills, because that would put a lie on a student's application. Treating the model as an unreliable component you design around is the actual work.

## Numbers worth memorising

| Number | What it is |
|---|---|
| **1** | npm production dependencies |
| **8,712** | lines of code across 40 files |
| **~180** | jobs currently published |
| **hourly** | how often the watcher runs (launchd, on the hour) |
| **21** | modules in `src/` |
| **150px** | how far the phone layout overflowed, from one missing `min-width: 0` |
| **353px** | screen frozen by the sticky header before the fix — about half a phone |
| **0 of 6 → 6 of 6** | items parsed with Gemini thinking on, then off |
| **~3,000** | average characters in a stored job description |
| **1 of 142** | descriptions that mention a graduation year — why there's no batch field |

## Ten things that make you sound like an engineer

Each is a real trade-off from this project. Say them as sentences.

1. "I chose X, and the cost of that choice is Y."
2. "The offline path runs first, so the API being down degrades the output instead of breaking the program."
3. "I measured it rather than guessed — raising the token limit was my first theory and it was wrong."
4. "Migrations are additive only, so an old database file still opens."
5. "I don't trust the model's output; it goes through a schema and then through validation in code."
6. "That's a real limitation. Here's what I'd do if it mattered."
7. "I used `textContent` everywhere because I'm displaying text scraped from a site I don't control."
8. "The scraper deliberately acts slowly and imperfectly, because acting like a robot gets you blocked."
9. "The two halves communicate through a file, not shared memory, so either can be moved without touching the other."
10. "I didn't add that because I didn't need it yet."

## The night before

- Re-read this pack and the summary of each chapter. Skip the chapter bodies.
- Say the 60-second pitch aloud three times. Out loud, not in your head.
- Open the repo and look at `src/index.js` top to bottom once, so the flow is fresh.
- Pick your favourite bug — the `thinkingBudget` one or the flexbox overflow — and be ready to tell it as a story: what you saw, what you assumed, how you found the truth, what you changed.
- Sleep. You know this project better than anyone in the room.
