# Chapter 5 — Node.js, Modules, and Servers Without a Framework

> By the end you can explain Node's event loop crisply, read `package.json` and `package-lock.json` like a professional, and write an HTTP server from scratch — because this project did.

**New words:** runtime, V8, libuv, event loop, blocking, microtask, thread pool, module, CommonJS, ESM, npm, registry, semantic versioning, lock file, transitive dependency, supply chain, server, port, framework, middleware, MIME type, environment variable.

---

## 5.1 What Node.js is, and why it exists

JavaScript was born in 1995 to make web pages twitch. For fourteen years it ran only in a browser. It could not open a file, listen for a network connection, or be a program on its own.

In 2009 Ryan Dahl bolted two existing pieces together and called it **Node.js**. A **runtime** is the program that executes your code and supplies the doors to the outside world.

- **V8** — Google's JavaScript engine, the one inside Chrome. It compiles JavaScript to machine code. It knows nothing about files or networks; it only knows the language.
- **libuv** — a C library that talks to the operating system: files, sockets, timers, DNS. It also supplies the event loop.

Node = V8 + libuv + a standard library (`fs`, `http`, `path`, and now `node:sqlite`) + a module system.

Why anyone cared: web servers spend nearly all their time waiting — for a disk, a database, another server. The dominant model in 2009 gave every waiting request its own operating-system thread, and threads are expensive. Dahl's bet was that one thread which never waits beats a thousand that mostly do. That bet won for I/O-heavy work, which is most web work.

This project uses Node in two shapes. The watcher (`src/`) is a batch program: it starts at noon, drives a browser, writes to SQLite, exits. The site's preview (`web/serve.js`) is a long-running server. Same runtime, opposite lifetimes.

---

## 5.2 The event loop, taught properly

This is the most-asked Node interview question. Learn it once, exactly.

### Blocking versus non-blocking

**Blocking** means the current line does not return until the work finishes, and nothing else in your program runs meanwhile.

```js
// Made-up example, not from the project.
const a = readFileSync('big.json');   // blocking: nothing else runs for 200ms
readFile('big.json', (err, b) => {}); // non-blocking: returns immediately
```

`readFileSync` stops the world. `readFile` hands the job to libuv, returns instantly, and your callback runs later. `web/serve.js:12` imports `readFile` from `node:fs/promises` for exactly this reason.

### The mess queue

Picture the hostel mess at 8 p.m. One person at the counter takes orders. Behind him, four cooks. He takes your order, pushes the slip through the hatch, and turns immediately to the next student. He never stands watching your dosa cook. That is the event loop: **one counter, several cooks.** The failure mode is obvious — one student arguing at the counter for three minutes freezes the whole queue no matter how idle the cooks are. That argument is CPU-bound JavaScript, and it is the one thing Node cannot survive.

Use that picture once and keep it.

### The loop's phases

The **event loop** is a `while` loop inside libuv. Each turn walks fixed phases, running whatever is ready:

1. **timers** — `setTimeout` / `setInterval` callbacks whose deadline has passed.
2. **pending callbacks** — a few deferred system callbacks, e.g. some TCP errors.
3. **idle / prepare** — internal to libuv. Ignore them.
4. **poll** — the important one. Collect new I/O events and run their callbacks: a socket has data, a file finished reading. With nothing to do and no timer due, the loop *blocks here*, which is correct — waiting for "anything to happen" costs nothing.
5. **check** — `setImmediate` callbacks.
6. **close callbacks** — `socket.on('close', ...)` and friends.

Then round again. When no work remains, the process exits. That is why `src/index.js` ends by itself and `web/serve.js` does not: an open listening socket is permanent work.

### The microtask queues

Two queues jump ahead of all that. A **microtask** is a callback that runs at the first possible gap, before the loop moves on.

- The `process.nextTick` queue — drained first, completely.
- The promise queue — every `.then`, and everything after an `await` — drained next, completely.

Both drain after the running JavaScript finishes and between individual callbacks. So a resolved promise beats `setTimeout(fn, 0)` every time. And an endless chain of `process.nextTick` starves the loop forever, because the callbacks keep jumping the queue.

### The thread pool, and what uses it

libuv keeps **four** operating-system threads by default (`UV_THREADPOOL_SIZE` changes it). These are the cooks. They handle work the OS cannot do asynchronously by itself:

- file system operations (`fs.readFile` and friends)
- `dns.lookup`
- `zlib` compression
- some `crypto`: async `pbkdf2`, `scrypt`, `randomBytes`

What does **not** use the pool: network I/O. TCP and HTTP sockets use the kernel's own notification system — `kqueue` on macOS, `epoll` on Linux, IOCP on Windows. This detail separates a memorised answer from an understood one. Ten thousand idle HTTP connections cost Node almost nothing; five concurrent large `readFile` calls saturate the default pool.

### "Node is single-threaded" — true and misleading

**True:** your JavaScript runs on one thread with one call stack. Two of your functions never execute at the same instant, so you never need a lock over your own variables. That removes an entire species of bug.

**Misleading:** the *runtime* is thoroughly multi-threaded. libuv has its pool. V8 runs garbage collection and compilation on helper threads. The kernel does network waiting. And you can start real threads with `node:worker_threads` or processes with `node:child_process`.

The honest one-liner: **JavaScript execution is single-threaded; the runtime around it is not.** The consequence is that CPU-heavy work — parsing 200 MB of JSON, hashing a password, resizing an image — must go to a worker or a child process, or everything else waits.

---

## 5.3 Modules: from globals to `import`

A **module** is a file whose contents are private unless it deliberately exports them.

**Era 1 — globals (1995–2009).** In the browser you wrote `<script src="a.js">` and everything landed on the shared `window` object. Two libraries defining `$` fought. There was no way to say "this variable is mine".

**Era 2 — CommonJS (Node, 2009).** Node needed modules on day one and the language had none, so Node invented them. `require()` is a plain function: it reads the file, runs it, caches the result, returns `module.exports`. It is synchronous, so it suits a server at startup and not a browser.

**Era 3 — ESM (standardised 2015, usable in Node from 12).** ECMAScript Modules are part of the language, so browser and server finally agree:

```js
import { createServer } from 'node:http';
export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
```

Both lines are real: `web/serve.js:11` and `src/paths.js:6`. ESM is *static* — imports are declarations, not function calls, resolved before any code runs. That is what lets an editor or bundler map your dependency graph without executing anything.

### `"type": "module"`

Node decides per file:

- `.mjs` → always ESM. `.cjs` → always CommonJS.
- `.js` → whatever the nearest `package.json` says. `"type": "module"` means ESM.

`package.json:7` is `"type": "module"`, so every `.js` file here is ESM. The three test files are still named `.mjs` (`package.json:18`) — belt and braces, and the intent is visible in the filename.

### Two ESM rules that bite

**File extensions are mandatory** in relative imports: `import { PATHS } from './paths.js'` (`src/logger.js:3`). Drop the `.js` and Node throws `ERR_MODULE_NOT_FOUND`. CommonJS guessed; ESM refuses to.

**`__dirname` does not exist.** CommonJS gave every module a variable holding its own folder. ESM gives you `import.meta.url` — the module's URL, like `file:///Users/.../web/serve.js`. Hence `web/serve.js:17`:

```js
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'public');
```

`fileURLToPath` converts URL to real path; `dirname` strips the filename. `src/paths.js:6` applies `dirname` twice, because `paths.js` sits one level down in `src/` and wants the project root.

### The `node:` prefix

Every built-in import here is written `node:http`, `node:fs/promises`, `node:path`, `node:url`, `node:os`. The prefix guarantees you get the built-in — a package called `http` in `node_modules` can never shadow `node:http`. It also tells the reader instantly which lines cost nothing to install. When your dependency count is one, that matters at a glance.

---

## 5.4 npm: registry, versions, lock files

**npm** ships with Node. It is a command and a **registry** — a public warehouse at `registry.npmjs.org` holding roughly three million packages that anyone may publish to.

```json
{
  "name": "linkedin-internship-watcher",
  "type": "module",
  "private": true,
  "engines": { "node": ">=22" },
  "scripts": {
    "start": "node --no-warnings=ExperimentalWarning src/index.js",
    "test": "node test/extract.test.mjs && node test/roles.test.mjs && node test/tailor.test.mjs",
    "web": "node web/serve.js"
  },
  "dependencies": { "playwright-core": "^1.56.0" }
}
```

(Abridged from `package.json`.)

- **`private: true`** — npm refuses to publish this package. A guardrail against an accidental `npm publish` putting your code on the registry forever.
- **`engines`** — declares the Node version, needed because `node:sqlite` only exists from Node 22. npm only warns, but hosts like Vercel read it and pick a matching runtime.
- **`scripts`** — named shortcuts. `npm run web` runs `node web/serve.js`; `npm test` and `npm start` need no `run`. Scripts put `node_modules/.bin` on the PATH.
- **`--no-warnings=ExperimentalWarning`** silences Node's warning that `node:sqlite` is experimental. Trade-off: it also hides a *different* experimental warning you might have wanted.
- **no `devDependencies`** — no test framework, no bundler, no linter. `npm test` runs three files against Node's built-in `assert`.

### Semantic versioning

**Semantic versioning** gives every release `MAJOR.MINOR.PATCH`. PATCH is a bug fix; MINOR adds features without breaking anything; MAJOR changes something you relied on.

- `^1.56.0` — "compatible with": `>=1.56.0 <2.0.0`. npm's default, and what this project uses.
- `~1.56.0` — patches only: `>=1.56.0 <1.57.0`.
- `1.56.0` — exactly that.

So `^1.56.0` means a fresh install next month may quietly give you 1.61.0. That is the point (you get fixes) and the risk (you get changes you never read).

### `package-lock.json`, and why it is committed

The lock file records the **exact** version and an integrity hash for every package actually installed, including packages you never asked for. It is committed here, and it should be.

`package.json` describes a *range*; the lock file describes a *result*. Without it, you install today and your teammate installs Thursday and you run different code from an identical `package.json` — and "works on my machine" becomes literally true and completely useless. `npm ci` installs strictly from the lock file and fails if it disagrees with `package.json`.

### Dependencies, depth, supply chain

**`dependencies`** are needed to run. **`devDependencies`** are needed only to develop; production installs skip them with `npm install --omit=dev`. Wrong bucket, and it works locally and crashes on the host.

You install one package; it depends on others; those depend on others. Those are **transitive dependencies**. A conventional Express-plus-React project installs several hundred to well over a thousand packages, and you have read approximately none of them. Each is code running with your permissions, in your CI, with your environment variables.

- **left-pad, March 2016.** An eleven-line package that padded strings. Its author unpublished it in a dispute. Thousands of builds worldwide broke within minutes, because everyone depended on it four levels deep without knowing.
- **event-stream, November 2018.** Millions of weekly downloads. A tired maintainer handed publish rights to a helpful volunteer, who later added a dependency that stole cryptocurrency wallet keys. It ran for months.

Neither was a bug in anyone's own code. Both ran on their machines anyway.

---

## 5.5 The one dependency: `playwright-core`

`"dependencies": { "playwright-core": "^1.56.0" }`. That is the entire production dependency list.

**Playwright** is a browser automation library from Microsoft. It speaks a browser's remote-control protocol, so your JavaScript can open pages, click, type, wait for elements, and read the DOM of a real browser.

Two packages exist. **`playwright`** is the library plus a post-install step that downloads its own private Chromium, Firefox and WebKit — hundreds of megabytes, isolated and completely fresh. **`playwright-core`** is the identical library with no download; you tell it which browser to drive.

This project needs `-core` for a reason central to the design. LinkedIn shows listings only to a signed-in user and is good at spotting automation. A freshly downloaded Chromium has no cookies, no history and a suspiciously clean fingerprint. So `src/browser.js` (166 lines) launches the author's **real Brave** with a **persistent profile directory** — `PATHS.profile` at `src/paths.js:28`, which resolves to `~/Library/Application Support/linkedin-watcher/brave-profile`. You log in once with `npm run login`; the cookies live in that folder; every noon run is already signed in. Chapter 8, *The Scraper: Playwright and Defensive Design*, covers the rest.

The alternatives, honestly. **Puppeteer** (Google) has a very similar API, is Chromium-focused, and also downloads a browser by default; it would have worked, and the choice is close. **Selenium WebDriver** is older, cross-language, a W3C standard, and needs a separate driver binary — heavier for a one-language project. **No library at all** means speaking the Chrome DevTools Protocol over a WebSocket yourself: zero dependencies, and a month rebuilding element waiting, frames and navigation races.

The cost of `-core` is real. You must supply a browser path, and the browser is now *outside* your dependency graph. If Brave auto-updates and breaks something, you find out at 12:00, not at `npm install`. A lock file cannot protect you from a program it does not know about.

---

## 5.6 Written, not installed — and when that is wrong

| Built by hand | The obvious package | Size |
|---|---|---|
| `web/serve.js` — dev HTTP server | Express | 100 lines |
| `src/logger.js` — levelled logging | pino, winston | 54 lines |
| `src/store.js` — SQLite access | Prisma, Sequelize | 484 lines |

Here is the heart of `src/logger.js`:

```js
function write(level, msg) {
  const line = `${stamp()} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  const colour = LEVEL_STYLE[level] ?? '';
  process.stdout.write(`${colour}${line}${RESET}\n`);
  try {
    if (!logFile) { ensureDirs(); logFile = fileFor(); }
    appendFileSync(logFile, `${line}\n`);
  } catch {
    // Logging must never be the reason a run dies.
  }
}
```

`src/logger.js:24–37`. `LEVEL_STYLE` maps a level to an ANSI escape code — `\x1b[31m` means "make the terminal red", `RESET` turns it off. `write` builds a timestamped line, prints the coloured version to the terminal, appends the plain version to today's file. `fileFor` (`src/logger.js:20`) names it `run-2026-07-27.log`. The empty `catch` is deliberate, and the comment says why: a failed log write must never abort a scraping run.

**When writing it yourself is right.** The surface you need is small and will not grow. The library would drag a tree of transitive dependencies for that small surface. The thing is not security-critical. And you are the only user. All four hold for a five-level logger printing to one laptop.

**When it is arrogance.** When you reimplement anything from the "one subtle mistake is a breach" family: password hashing, session cookies, CSRF tokens, HTML escaping, TLS, timezone arithmetic. When the library has ten thousand tests and yours has none. When you keep bolting on features the library already had. When a second person joins and must learn your conventions instead of Express's.

The honest cost is visible in the file: `src/logger.js:1` imports `createWriteStream` and never uses it. A linter would have flagged that in a second — but there is no linter, because there are no devDependencies. That is the policy's bill, paid in a small denomination. The logger also has no rotation, no size cap and no structured JSON output. On a fleet that is wrong. Here, one file per day *is* the rotation.

The rule to carry away: **judge the decision against the actual requirements, not a hypothetical future** — but decide your switching point in advance. Here it is a second machine or a second person.

---

## 5.7 What a server actually does

A **server** is a program that waits for other programs to connect and answers them. (The word also means the computer it runs on; context tells you which.)

It claims a **port** — a number from 0 to 65535 that lets one machine run many listening programs, the way one street address holds many flat numbers. The OS routes an incoming connection to whichever program claimed that number.

Every HTTP server does six things: **bind** (claim address and port), **listen** (let the OS queue connections), **accept** (take one off the queue), **parse** (decode the request line `GET /jobs HTTP/1.1`, headers, body), **route** (pick the function that handles this method and path), **respond** (status code, headers, body).

`node:http` does the first four. It hands your callback `req`, a readable stream carrying the request, and `res`, a writable stream for the reply. Routing and responding are yours.

```js
// Made-up example, not from the project.
import { createServer } from 'node:http';

createServer((req, res) => {
  if (req.url === '/time') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ now: Date.now() }));
  }
  res.statusCode = 404;
  res.end('Not found');
}).listen(3000);
```

Twelve lines and you have a web server. That is the baseline every framework is measured against.

---

## 5.8 Express, which this project does not use

You will be asked about **Express** whether or not you use it. Express is a **framework** — a library that supplies the structure of your program and calls your code, rather than the other way round. It sits on `node:http` and adds three things.

**Routing**, instead of an if-chain over `req.url`:

```js
// Made-up example, not from the project.
app.get('/jobs/:id', (req, res) => res.json({ id: req.params.id }));
```

**Middleware** — a function that runs on the way in, in order, with the signature `(req, res, next)`:

```js
// Made-up example, not from the project.
app.use((req, res, next) => { console.log(req.method, req.url); next(); });
app.use(express.json());   // parses a JSON body into req.body
```

`next()` is the whole idea. Call it and the request moves on; do not call it and you own the response — which is how authentication middleware rejects a request before any route sees it. Error middleware takes four arguments, `(err, req, res, next)`, and Express recognises it by the count.

**Conveniences:** `res.json()`, `res.status()`, `res.send()`, `req.query`, `express.static(folder)`.

Why not here? The site is static files plus one function. Express would add a package and its dependency tree to save perhaps thirty lines in a file that only ever runs on `localhost`. On a real multi-route API with auth, sessions and uploads the answer flips: write Express, do not rebuild it.

---

## 5.9 The real server: `web/serve.js`, 100 lines

Two jobs: serve `web/public`, and answer `/api/tailor` by running **the same handler Vercel runs in production**.

### Setup

```js
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'public');
const PORT = Number(process.env.PORT || 4321);
```

`web/serve.js:17–19`. `ROOT` is the folder served. `PORT` comes from the environment with a default; `Number(...)` because everything in `process.env` is a string.

### Reading the body

```js
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
  });
}
```

`web/serve.js:38–46`. `req` is a stream: `'data'` fires per chunk of bytes, `'end'` when the body is complete. This is what `express.json()` does for you.

Two honest defects. There is **no size limit**, so a client sending a gigabyte grows `raw` until the process dies — a denial of service on a public server, acceptable on localhost. And `raw += c` converts each `Buffer` chunk to a string separately, so a multi-byte character split across a chunk boundary is corrupted; the fix is one line, `req.setEncoding('utf8')`. A third, softer flaw: invalid JSON resolves to `{}` rather than rejecting, turning a malformed request into a confusing empty one.

### The shim — the reason this file exists

```js
/** Minimal shim so the Vercel-style handler runs unchanged here. */
function shimResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}
```

`web/serve.js:48–57`. Vercel's Node runtime hands your function a response object with Express-style helpers, so `web/api/tailor.js` (278 lines) is written as `res.status(400).json({...})`. A plain `node:http` `ServerResponse` has neither method, so that handler would work in production and crash locally.

Rather than fork the handler, this attaches the two missing methods to the real response object. `status` sets `res.statusCode` and returns `res` so calls chain; `json` sets the content type, serialises, ends. Nine lines, and one file of business logic runs identically in both places.

The general lesson: when two environments differ in a small, well-understood way, **adapt the environment, not the logic**. Two copies of a handler drift apart; a nine-line shim cannot.

### Routing and dynamic import

```js
const url = new URL(req.url, `http://localhost:${PORT}`);

if (url.pathname === '/api/tailor') {
  const { default: handler } = await import('./api/tailor.js');
  req.body = await readBody(req);
  return handler(req, shimResponse(res));
}
```

`web/serve.js:59–66`, condensed. `req.url` is only the path and query, not a full URL, so `new URL` needs a base. `await import(...)` is a **dynamic import** — the ESM equivalent of `require` at runtime, returning a promise. The benefit: the server starts even if `tailor.js` has a syntax error, and the surrounding `try/catch` returns a clean 500 instead of crashing at boot. The catch: ESM caches modules by URL, so editing `tailor.js` still needs a restart.

### Static files and the traversal guard

```js
let rel = decodeURIComponent(url.pathname);
if (rel.endsWith('/')) rel += 'index.html';
const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
if (!path.startsWith(ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
```

`web/serve.js:75–81`. A **path traversal attack** is a request like `/../../../../etc/passwd`, designed to escape the served folder and read private files. Four layers, and the order matters: decode first (because `%2e%2e%2f` is also `../`), collapse with `normalize`, strip any leading `../`, then the load-bearing check — refuse anything not starting with `ROOT`.

One subtlety: a bare `startsWith` would also accept a *sibling* folder sharing the prefix, like `/public-secret`. It is not reachable here, because `join(ROOT, ...)` always produces a path under `ROOT`, but the sturdier idiom compares against `ROOT + path.sep`.

```js
const body = await readFile(path);
res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
res.setHeader('cache-control', 'no-store');
res.end(body);
```

`web/serve.js:84–87`. Read the file without blocking, label it, forbid caching. `no-store` is deliberately the opposite of production: locally you never want to debug a stale file. A missing file throws, and the `catch` returns a 404.

---

## 5.10 MIME types, environment variables, and secrets

### MIME types

A **MIME type** (also "media type" or "content type") is a label like `text/html` or `image/jpeg`, sent in the `content-type` header, telling the browser what kind of bytes it just received. Over the network there is no file and no extension — only bytes and that header. `application/octet-stream` means "unknown binary", and browsers download it instead of rendering it.

The real bug, recorded in the source at `web/serve.js:29–32`:

```js
  // The company logos in public/logos and the og: card are all .jpg. Without these
  // they fell through to application/octet-stream, which the browser will not paint.
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
```

`.jpg` was missing from `TYPES`. Every company logo and the social share card were served as unknown binary, and every logo on the page was blank. Two things make it a good story. The failure was silent — no console error, just nothing. And it happened only **locally**: Vercel's static server has a complete MIME table, so the deployed site was fine. A bug that appears only in development is the least dangerous kind and the most confusing.

### Environment variables and secrets

An **environment variable** is a named value the operating system hands a program when it starts. Node exposes them as `process.env`, always as strings.

```js
const PORT = Number(process.env.PORT || 4321);
// ...
if (!process.env.GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY is not set — resume tailoring will return an error until it is.');
}
```

`web/serve.js:19` and `97–99`. `PORT` is configuration: a sensible default, overridable without editing code. `GEMINI_API_KEY` is a **secret** — a credential proving you are you. Notice the server does not refuse to start without it; it prints one clear line and keeps serving the site. Failing helpfully beats failing hard when only one feature is affected.

Secrets never go in git, for three reasons. **Git keeps history** — committing a key and deleting it next commit does not remove it; it is in every clone forever until you rewrite history. **Public repositories are scraped continuously** — bots find committed keys in minutes and you pay the bill. **The value differs per machine** — your laptop, a teammate's and Vercel each need a different value for the same name.

So the real key lives in `.env`, which is listed in `.gitignore`; a committed `.env.example` shows the *names* with no values; Vercel keeps its own copy in the dashboard. The `.gitignore` comment gives a non-obvious extra reason: the key lives there "so it reaches launchd-spawned runs, which get almost no environment of their own." A program started by the macOS scheduler does not inherit your shell's variables. Chapter 9, *Shipping It*, covers that scheduler.

### One more module worth seeing

`src/paths.js` is 51 lines and owns every filesystem path in the project; nothing else calls `join(homedir(), ...)`. Its comment (`src/paths.js:9–17`) explains why the database and browser profile live in `~/Library/Application Support` and not the project folder: macOS **TCC** — the permission system behind "wants to access your Documents" — denies a scheduler-spawned process access to Desktop, Documents and Downloads. The tool works in Terminal and then fails silently at noon. That is what a single-responsibility module looks like: one file, one decision, one place to change it.

---

## Chapter summary

- Node.js is V8 (the JavaScript engine) plus libuv (the event loop and OS access), released in 2009 so JavaScript could be a program instead of only a page.
- The event loop runs fixed phases — timers, pending, poll, check, close — and drains the `process.nextTick` and promise microtask queues between every callback.
- "Node is single-threaded" means your JavaScript runs on one thread; libuv's four-thread pool, V8's helpers and the kernel's socket handling mean the runtime is not.
- The thread pool serves file I/O, `dns.lookup`, zlib and some crypto — **not** network sockets, which the kernel handles directly.
- Modules went globals → CommonJS (`require`) → ESM (`import`); `"type": "module"` at `package.json:7` makes every `.js` file here ESM, which is why relative imports need extensions and `__dirname` is replaced by `fileURLToPath(import.meta.url)`.
- `^1.56.0` allows any 1.x release, which is exactly why `package-lock.json` — exact versions and integrity hashes for the whole tree — is committed.
- Every transitive dependency is code running with your permissions; left-pad and event-stream are what that costs when it goes wrong.
- The single production dependency is `playwright-core`: Playwright without a bundled browser, so it can drive the author's real Brave with a persistent logged-in profile.
- `web/serve.js` is a 100-line `node:http` server whose `shimResponse` adds `status()` and `json()` so one copy of `web/api/tailor.js` runs locally and on Vercel.
- Content type comes from the `content-type` header, not the file extension: a missing `.jpg` entry served every logo as `application/octet-stream` and painted nothing.

## Key takeaways

Node's single JavaScript thread is a gift and a trap: no locks and no data races, but any CPU-heavy work blocks every other request until it finishes. Dependencies are not free — each is code you run, a lock file you must commit, and a supply chain you cannot audit; one dependency is defensible here and would not be on a team of ten. Frameworks like Express earn their place when routing and middleware get real, and a hundred lines of `node:http` is enough when they do not. When two environments differ in a small, understood way, write a shim and keep one copy of the logic.

## Interview questions

**1. What is Node.js, and what is it made of?**

Node.js is a JavaScript runtime — a program that executes JavaScript outside a browser. It is V8, Google's engine from Chrome, which compiles JavaScript to machine code but knows nothing about files or networks; plus libuv, a C library providing the event loop, non-blocking I/O and a thread pool; plus a standard library like `fs`, `http` and `path`. Ryan Dahl released it in 2009 against a specific problem: servers spend most of their time waiting, and giving every waiting request an OS thread is expensive. The bet was that one thread which never waits beats a thousand that mostly do. That pays off for I/O-heavy work and loses for CPU-heavy work.

**2. Explain the event loop.**

It is a loop inside libuv running fixed phases each tick: timers (expired `setTimeout` callbacks), pending callbacks, poll (new I/O events and their callbacks, where the loop blocks when idle), check (`setImmediate`), and close callbacks. Between every callback, two microtask queues drain completely — `process.nextTick` first, then resolved promises — which is why a resolved promise always runs before `setTimeout(fn, 0)`. When no pending work of any kind remains, the process exits; that is why a batch script ends by itself and a server with an open listening socket does not. The one thing the loop cannot survive is a callback that does not return, because nothing else runs until it does.

**3. Is Node single-threaded?**

Your JavaScript is: one call stack, one thing executing at a time, so you never need a mutex over your own variables. The runtime is not. libuv keeps a four-thread pool by default, V8 runs garbage collection and compilation on helper threads, the kernel handles socket waiting, and you can start real threads with `node:worker_threads` or processes with `node:child_process`. The accurate sentence is "JavaScript execution is single-threaded; the runtime around it is not." The practical consequence is that CPU-heavy work must move to a worker or a child process, or every pending request queues behind it.

**4. What actually uses libuv's thread pool?**

File system operations, `dns.lookup`, zlib compression, and async crypto like `pbkdf2` and `scrypt`. Network I/O does not — TCP and HTTP sockets use the kernel's own event notification, `kqueue` on macOS and `epoll` on Linux. That matters practically: ten thousand idle HTTP connections cost almost nothing, but a handful of concurrent large file reads saturate the default four threads and queue behind each other. `UV_THREADPOOL_SIZE` raises it. Most people who say they know the event loop cannot answer this part, so it is worth being precise.

**5. CommonJS versus ESM, and what does `"type": "module"` do?**

CommonJS is Node's original system: `require()` is a synchronous function that reads, runs and caches a file and returns `module.exports`. ESM is the language standard: `import` and `export` are static declarations resolved before any code runs, which lets tools map your dependency graph without executing it, and it works in browsers too. Node picks per file — `.mjs` is always ESM, `.cjs` always CommonJS, `.js` follows the nearest `package.json`, where `"type": "module"` means ESM. This project sets it at `package.json:7`. Two consequences bite beginners: relative imports need the file extension, and `__dirname` is gone, replaced by the `fileURLToPath(import.meta.url)` idiom at `web/serve.js:17`.

**6. Why `node:http` rather than `http`?**

Both work, but the prefix is unambiguous. It guarantees the built-in — a package named `http` in `node_modules` can shadow the bare specifier but never the prefixed one. It also documents intent: someone scanning the imports sees instantly which lines cost an install and which are free. In a project whose whole point is one dependency, that is worth five characters. Every built-in import in this codebase is written that way.

**7. What does `^1.56.0` mean, and why is `package-lock.json` committed?**

`^1.56.0` means any version from 1.56.0 up to but excluding 2.0.0, so patches and minors are accepted automatically and majors are not. The same `package.json` can therefore install different code on different days — good for security fixes, bad for reproducibility. `package-lock.json` closes the gap by recording the exact resolved version and integrity hash of every package in the tree, including transitive ones you never named. It is committed so every person and every deployment installs byte-identical dependencies, and `npm ci` installs strictly from it. Not committing it is how "works on my machine" becomes literally true and useless.

**8. Your project has one dependency and hand-writes a server, a logger and a database layer. Isn't that reinventing wheels?**

Sometimes, and I will name where. The server is 100 lines and runs only on localhost, so Express would add a dependency tree to save thirty lines — that one I defend. The logger is 54 lines with no rotation, no size cap and no structured output, printing to one laptop every hour, so a file per day is the rotation it needs; defensible at this scale and wrong on a fleet. The proof of the cost is in the file: `src/logger.js:1` imports `createWriteStream` and never uses it, which a linter would have caught instantly, except there is no linter because there are no devDependencies. That is the policy's bill and I paid it. My switching point is stated in advance: a second person or a second machine, and I take the library.

**9. Isn't hand-rolling `readBody` a security problem? Walk me through what is wrong with it.**

Yes, two things. It accumulates the body into a string with no size limit, so a client sending an enormous body grows memory until the process dies — a trivial denial of service. And `raw += chunk` stringifies each `Buffer` separately, so a multi-byte UTF-8 character split across a chunk boundary is corrupted; the fix is `req.setEncoding('utf8')`. A third, softer flaw is that invalid JSON resolves to `{}` instead of rejecting, so a malformed request looks like an empty one. The mitigation is that this file binds to localhost as a development tool and the production path is Vercel's own server, which parses the body itself — but if it ever faced the internet, those are release blockers, not nitpicks.

**10. What does `shimResponse` do, and why not write two versions of the handler?**

Vercel's Node runtime gives a response object with Express-style helpers, so `web/api/tailor.js` is written as `res.status(400).json({...})`. A plain `node:http` `ServerResponse` has neither method, so the same handler would crash locally. `shimResponse` at `web/serve.js:49` attaches those two methods to the real response object — `status` sets `statusCode` and returns `res` so calls chain, `json` sets the content type, serialises and ends. Nine lines, and 278 lines of business logic run identically in both environments. Two copies would drift within a month and the local one would stop being a real test of production; a shim cannot drift, because there is only one thing to change.

**11. What is a MIME type, and tell me about one you got wrong.**

A MIME type is the label in the `content-type` header — `text/html`, `image/jpeg` — telling the browser what kind of bytes it just received. It matters because over the network there is no file and no extension, only bytes and that header. In `web/serve.js` the `TYPES` table was missing `.jpg`, so every company logo and the social share card fell through to `application/octet-stream`, which means unknown binary, and the browser refused to paint them. The failure was silent — no console error, just blanks — and it only happened locally, because Vercel's static server has a complete MIME table. The fix is the two lines at `web/serve.js:31–32`, with a comment above so nobody deletes them again.

**12. Why `playwright-core` instead of `playwright`, and why Playwright at all?**

The full `playwright` package downloads its own Chromium, Firefox and WebKit — hundreds of megabytes of pristine, never-logged-in browsers. That is exactly wrong here. LinkedIn shows listings only to a signed-in user and actively detects automation, so the scraper drives the author's real Brave with a persistent profile at `~/Library/Application Support/linkedin-watcher/brave-profile`: log in once, cookies survive, every scheduled run is already authenticated. `playwright-core` is the identical library without the download, which is what makes that possible. Puppeteer would also have worked and it is a close call; Selenium is heavier and needs a separate driver. The trade-off is that the browser now sits outside my dependency graph, so a Brave auto-update can break the noon run and the lock file cannot warn me.

## Common beginner mistakes

**Calling a `Sync` function inside a request handler.** You write `readFileSync` because it is shorter and needs no callback, and it works perfectly while you are the only visitor. Under real load it blocks the single JavaScript thread, so every other request — including ones needing no files at all — waits behind it. Use the promise versions from `node:fs/promises`, as `web/serve.js:12` does.

**Dropping the file extension in a relative import.** `import { PATHS } from './paths'` is what every CommonJS tutorial shows, because CommonJS guessed the extension for you. ESM does not guess: you get `ERR_MODULE_NOT_FOUND`, and the message names the importing file rather than the missing one, so it reads like a broken installation. Write `'./paths.js'`.

**Reaching for `__dirname` in ESM.** You need your file's folder, you type `__dirname`, and it is simply not defined — a `ReferenceError` that looks like a Node bug. It never existed in ESM. Use `dirname(fileURLToPath(import.meta.url))`.

**Putting a runtime package in `devDependencies`.** You install with `--save-dev` because you were only testing, and it works, because `npm install` on your laptop installs both groups. The host installs with `--omit=dev`, the package is absent, and deployment crashes on the first import. If production code imports it, it is a dependency.

**Committing `node_modules` and ignoring `package-lock.json`.** It feels safer: the code is right there in git, and the lock file looks like generated noise. In fact you have added tens of thousands of files to every clone while removing the one file that pins exact versions, so installs are now enormous *and* non-reproducible. `node_modules/` belongs in `.gitignore`; the lock file belongs in git.

**Building a string from stream chunks with `+=`.** It reads naturally and works in every test you run with ASCII. Each chunk is a `Buffer` converted independently, so a multi-byte character split across two chunks becomes mojibake. Call `req.setEncoding('utf8')` first, or collect buffers and use `Buffer.concat`.

## Exercises

1. **See a MIME type break something.** Run `npm run web` and open `http://localhost:4321`. In DevTools → Network, reload and note the `content-type` of a `.png` request. Delete the `'.png'` line from `TYPES` in `web/serve.js`, restart, reload, and watch the header become `application/octet-stream` and the image vanish. Put the line back.

2. **Prove the loop blocks.** Write a `node:http` server with two routes: `/fast` returns JSON immediately, `/slow` runs `const end = Date.now() + 5000; while (Date.now() < end) {}` first. Open both at once in two tabs. Explain in one sentence why `/fast` waits, and what you would do about it in a real service.

3. **Count your supply chain.** Run `npm ls --all` in this repository and count the packages. Do the same in any project of yours that uses a framework. Write down both numbers and one sentence on what each package is allowed to do on your machine.

4. **Add a route through the shim.** Add `/api/uptime` to `web/serve.js`, responding `{ uptime: process.uptime() }` via `shimResponse`, so the same handler function could be dropped into `web/api/` as a Vercel function unchanged.

5. 🔴 **Harden `readBody`.** Rewrite it to call `req.setEncoding('utf8')`, abort with HTTP 413 when the body exceeds 100 KB, and reject rather than resolve `{}` on invalid JSON so the caller can answer 400. Confirm `/api/tailor` still works end to end, and test the limit with an oversized `curl` body. Explain why the 413 path must destroy the request stream rather than merely stop appending.

## Quiz

1. What are the two major pieces Node.js is built from, and what does each provide?
2. Which runs first: a callback passed to `setTimeout(fn, 0)`, or a `.then` on an already-resolved promise? Why?
3. Name two things that use libuv's thread pool and one common thing that does not.
4. What does `"type": "module"` change, and which file extension ignores it entirely?
5. With `"playwright-core": "^1.56.0"`, which of 1.56.4, 1.61.0 and 2.0.1 may `npm install` choose?
6. Why does `shimResponse` exist, and what breaks without it?

---

### Quiz answers

1. **V8**, Google's JavaScript engine, which compiles and executes the language; and **libuv**, a C library providing the event loop, non-blocking I/O against the operating system, and a four-thread pool. Node adds a standard library and the module system on top.

2. The **promise callback**. Promise callbacks are microtasks, drained completely after the current JavaScript finishes and between every event-loop callback. `setTimeout` callbacks run in the timers phase of the loop, which comes later — so even a zero-millisecond timer loses.

3. Uses the pool: file system operations, `dns.lookup`, zlib compression, async `pbkdf2`/`scrypt`. Does **not**: network I/O — TCP and HTTP sockets are handled by the kernel's own notification system (`kqueue`, `epoll`, IOCP).

4. It makes every `.js` file in that package ESM instead of CommonJS, so `import`/`export` work, relative imports need file extensions, and `__dirname` is gone. `.mjs` (always ESM) and `.cjs` (always CommonJS) ignore the field entirely.

5. **1.56.4 and 1.61.0.** The caret allows `>=1.56.0 <2.0.0`; 2.0.1 is excluded. This is exactly why `package-lock.json` is committed — it pins which of the allowed versions you actually got.

6. Vercel's runtime gives handlers a response object with `res.status()` and `res.json()`; a plain `node:http` `ServerResponse` has neither. `shimResponse` attaches both so `web/api/tailor.js` runs unchanged in either place. Without it the local server throws `res.status is not a function` on the first `/api/tailor` call, and you would maintain two copies of the handler.
