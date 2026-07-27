# Chapter 4 — JavaScript, and Why Async Is Hard

> By the end you can read any file in this project line by line, and explain why `await` inside a loop is sometimes a bug and sometimes the whole point.

**New words:** value, type, primitive, reference, scope, hoisting, closure, pure function, destructuring, template literal, optional chaining, nullish coalescing, truthy, strict equality, class, module, exception, JSON, regular expression, `Map`, `Set`, blocking, callback, Promise, `async`/`await`, `AbortController`, event loop.

Chapter 3 showed you the page. This chapter is the language that runs it — and the same language that, on the author's Mac, drives a browser and talks to Google's servers. The first half is the language, fast. The second half is asynchrony, which is what interviewers actually ask about.

## 4.1 Values, types, and variables

A **value** is a piece of data. A **type** is what kind it is.

```js
// made-up example, not from the project
const n = 40000;            // number  — no separate int/float
const s = 'Rs. 15,000';     // string
const b = true;             // boolean
const u = undefined;        // "nobody ever set this"
const z = null;             // "we looked; there is nothing"
```

Those, plus `bigint` and `symbol`, are the **primitives**: values copied whole when passed around. Everything else — objects, arrays, functions — is a **reference**: passing it hands over the address, so two variables can share one array and changing it through either changes both.

`null` versus `undefined` matters here. `parseRelativeTime` at `src/extract.js:270` returns `null` because it *looked* at LinkedIn's text and could not parse a date. The rest of the code relies on that. (`typeof null` is `'object'` — a twenty-year-old bug nobody can fix now.)

**Scope** is where a name is visible. Use `const` by default, `let` when you will reassign, never `var` — the old keyword ignores block boundaries. Any file in `src/` is `const` almost throughout, with `let` only for loop counters. `const` freezes the binding, not the contents: `const found = new Set()` at `src/extract.js:241` still lets you add to the set. A block is anything in `{ }`, and a `const` declared inside one does not exist outside it — reading it there is a `ReferenceError`.

**Hoisting** is JavaScript noticing declarations before running the code. Function declarations hoist completely, which is why `src/roles.js` can call `hasTerm` from a function written above it. `let` and `const` hoist into a "temporal dead zone": touching them before their line throws, turning a silent `undefined` into a loud error.

## 4.2 Functions, arrows, and `this`

An arrow `(n) => expr` returns `expr` with no `return` keyword. `src/extract.js:204` is exactly `const fmt = (n) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });`.

The one real difference from `function` is `this` — a hidden extra argument meaning "the object this function was called on". A normal function gets a fresh `this` decided by *how* it was called. An arrow has none of its own; it borrows the one from where it was written.

```js
// made-up example, not from the project
const counter = {
  n: 0,
  badTick()  { setTimeout(function () { this.n++; }, 100); },  // wrong `this`
  goodTick() { setTimeout(() => { this.n++; }, 100); },        // borrowed `this`
};
```

In `badTick` the timer calls the function, not `counter`, so `this.n` is `undefined`. That is the standard `this` question, and the answer is: arrows do not rebind `this`. This project barely uses `this` at all, because it keeps data in plain objects and behaviour in plain functions.

## 4.3 Closures — read this twice

A **closure** is a function that remembers the variables of the place where it was created, even after that place has finished running.

Think of a hostel locker. You get a key when you move in. Later you move out and the room is reassigned, but your key still opens *your* locker. The function is the key; the captured variables are the locker.

```js
// made-up example, not from the project
function makeCounter() {
  let n = 0;                            // the locker
  return () => { n += 1; return n; };   // the key
}
const next = makeCounter();
next();  // 1
next();  // 2
```

`makeCounter` has finished, so `n` should be gone. The returned arrow still references it, so JavaScript keeps it alive — privately. Nothing outside can read or corrupt `n`.

The project needs a closure the moment it does anything asynchronous. From `src/gemini.js:422`:

```js
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
```

`setTimeout` runs that arrow thirty seconds later, long after the line finished. It still reaches `controller` because it closed over it. A fresh controller per batch means each closure captures its own, so one request's timeout cannot cancel another's.

Closures are also why callbacks can see your local variables, and why the old `for (var i…)` bug exists — three `var` loops share one `i`, three `let` loops each get their own.

## 4.4 Objects, arrays, and five methods

An **object** is a bag of named values; an **array** is an ordered list. `const stipend = { min: 20000, max: 40000, currency: 'INR', period: 'month' }` is real — `extractStipend` returns those keys at `src/extract.js:195`.

Five array methods carry most real code. Each takes a function and calls it per element.

```js
// made-up example, not from the project
const jobs = [{ pay: 30000 }, { pay: 0 }, { pay: 50000 }];
jobs.map((j) => j.pay);                   // [30000, 0, 50000] — transform each
jobs.filter((j) => j.pay > 0);            // two objects        — keep some
jobs.find((j) => j.pay > 40000);          // {pay:50000}        — first match or undefined
jobs.some((j) => j.pay === 0);            // true               — is any true?
jobs.reduce((sum, j) => sum + j.pay, 0);  // 80000              — fold to one value
```

`map` and `filter` return new arrays. `reduce` takes an accumulator and a starting value and squeezes a list to one result.

Real code chains them. `src/extract.js:112` is `const haystack = texts.filter(Boolean).join('\n');`. `Boolean` is a function converting a value to true/false, so `filter(Boolean)` drops every empty string, `null` and `undefined` in one step; `join('\n')` glues the survivors together.

`src/extract.js:193` sorts with a comparator:

```js
plausible.sort((a, b) => b.score - a.score || b.max - a.max);
```

A comparator returns a negative number when `a` should come first. `b.score - a.score` sorts highest score first; on a tie that difference is `0`, which is falsy, so `||` falls through to the amount. Two sort keys in eleven characters. Unlike `map`, `sort` mutates in place — safe here only because `plausible` was freshly built by `filter`.

## 4.5 The syntax on every page

**Template literals** use backticks and embed expressions: `` `Title: ${it.title}` `` (`src/gemini.js:416`).

**Destructuring** pulls fields out by name — `const { verdict, matched } = classifyRole(title, options);` at `src/roles.js:215`. It works on arrays too: `for (const [re, period] of PERIOD_PATTERNS)` at `src/extract.js:61`.

**Default parameters** fill in missing arguments. `parseRelativeTime(text, now = Date.now())` lets callers omit `now` and lets a test pin the clock. That one choice is what makes the function testable.

**Optional chaining** `?.` reads through a possibly-missing value without crashing: `payload.promptFeedback?.blockReason` (`src/gemini.js:455`), or the longer `payload.candidates?.[0]?.content?.parts ?? []` on line 460.

**Nullish coalescing** `??` supplies a fallback only when the left side is `null` or `undefined`: `` `Company: ${it.company ?? 'unknown'}` `` (`src/gemini.js:417`).

**Truthiness.** Falsy values are exactly `false`, `0`, `-0`, `0n`, `''`, `null`, `undefined`, `NaN`. Everything else — including `'0'`, `[]` and `{}` — is truthy. This is why `??` exists and `||` is risky: `0 || 5` is `5`, but `0 ?? 5` is `0`. Use `||` for "or something better", `??` strictly for "or if absent".

**`==` versus `===`.** `===` compares type and value with no conversion. `==` converts first, with odd rules: `'' == 0` is true, `null == 0` is false, `null == undefined` is true. Use `===`. The one useful exception is `x == null`, true for both `null` and `undefined` — `src/extract.js:202` writes `stipend.min == null` for exactly that, and it cannot be confused with `0`.

## 4.6 Classes, modules, errors, JSON, regex, `Map`, `Set`

**Classes** are a template for objects with shared methods. This project defines none of its own; the ones it uses come from the platform — `AbortController` in `src/gemini.js`, `DatabaseSync` in `src/store.js`.

A **module** is one file with its own private scope; nothing leaks unless exported.

```js
export function classifyRole(title, options = {}) { ... }   // src/roles.js:175
import { classifyRole } from './roles.js';                  // src/gemini.js:17
```

`POSITIVE_SORTED` and `hasTerm` are not exported, so no other file can touch them. Chapter 5, *Node.js, Modules, and Servers Without a Framework*, covers how Node finds these files.

A failure **throws** an exception, which unwinds the call stack until someone catches it: `try { } catch (err) { } finally { }`. `finally` runs on every path, which is why `src/gemini.js:495` puts `clearTimeout(timer)` there.

**JSON** (JavaScript Object Notation) is text shaped like an object literal. `JSON.stringify` makes it; `JSON.parse` reads it and *throws* on malformed input — which is why the parse at `src/gemini.js:464` sits inside a `try`.

**Regular expressions** describe text patterns between slashes: `/\bstipend\b/i` means "the word stipend, case-insensitively", `\b` being a word boundary. `.test(s)` gives true/false; `.match()` and `.exec()` give the captured groups.

**`Map`** is a dictionary with keys of any type. `enrichJobs` returns `new Map()` keyed by array index (`src/gemini.js:399`); a plain object would turn those keys into strings. **`Set`** is a list with no duplicates — `src/extract.js:241` uses one so a description mentioning Python four times yields one skill, then `[...found]` spreads it back to an array.

## 4.7 Real code: `parseRelativeTime`

LinkedIn shows "3 hours ago", never a date. The database needs a number. `src/extract.js:270`:

```js
export function parseRelativeTime(text, now = Date.now()) {
  if (!text) return null;
  const s = String(text).toLowerCase();

  if (/just now|moments? ago|seconds? ago/.test(s)) return now;

  const m = s.match(/(\d+)\s*(minute|min|hour|hr|day|week|month|year)s?\s*ago/);
  if (!m) return null;

  const n = parseInt(m[1], 10);
  const unit = m[2];
  const MS = {
    minute: 60_000, min: 60_000,
    hour: 3_600_000, hr: 3_600_000,
    day: 86_400_000,
    week: 604_800_000,
    month: 2_592_000_000,
    year: 31_536_000_000,
  };
  return now - n * (MS[unit] ?? 0);
}
```

- **`now = Date.now()`** — milliseconds since 1 January 1970. Because the caller *may* pass it, a test can pin time and assert an exact answer.
- **`if (!text) return null`** — a guard clause; truthiness checks `undefined`, `null` and `''` at once.
- **`String(text).toLowerCase()`** — the scraper might hand over a non-string; `String()` never throws.
- **First regex** — the shapes with no number in them. `moments? ago` makes the `s` optional.
- **`s.match(...)`** — a number, optional space, a unit word, optional plural, then `ago`. The parentheses capture, so `m[1]` is the number and `m[2]` the unit.
- **`if (!m) return null`** — unparseable means `null`, not a guess. A wrong timestamp would sort a stale job to the top of the site.
- **`parseInt(m[1], 10)`** — text to number, base 10. Always pass the radix.
- **`MS`** — a lookup object instead of a chain of `if`s. The `_` in `60_000` is a separator JavaScript ignores; it exists so a human can count the zeroes.
- **`MS[unit] ?? 0`** — an unknown unit contributes zero, so the answer is `now`. `??` not `||`, because a real `0` would be legitimate.

Note what it does *not* do: no network, no database, no clock of its own unless you allow it. Same input, same output, no side effects. That is a **pure function**, and it is why this file has real tests while the browser code does not.

## 4.8 Real code: `classifyRole`

`src/roles.js:175` decides whether a title belongs on a software job board.

```js
export function classifyRole(title, options = {}) {
  const text = String(title ?? '').trim();
  if (!text) return { verdict: 'uncertain', matched: null };

  const positive = [...(options.extraPositive ?? []), ...POSITIVE_SORTED];
  const negative = [...(options.extraNegative ?? []), ...NEGATIVE_SORTED];

  const strongPositive = positive.find((t) => t.includes(' ') && hasTerm(text, t));

  const neg = firstMatch(text, negative);
  if (neg && !strongPositive) return { verdict: 'non-tech', matched: neg };

  const pos = strongPositive ?? firstMatch(text, positive);
  if (pos) return { verdict: 'tech', matched: pos };

  return { verdict: 'uncertain', matched: null };
}
```

- **`String(title ?? '')`** — `??` turns a missing title into `''` before `String()` can produce the text `"null"`.
- **`[...a, ...b]`** — spread unpacks arrays into a new one. Terms Gemini taught the classifier go first, so they win over the built-in list.
- **`.find(...)`** — the first positive phrase of two or more words. "Data Analyst" contains "analyst", which reads as commercial, so a specific phrase must be able to override a generic negative word.
- **Negative before positive** — the important line. "Software Sales Intern" contains "software"; checking positives first would put a sales job on a software board.
- **Three verdicts** — `tech`, `non-tech`, `uncertain`. Refusing to guess is the design; `needsDescription` at `src/roles.js:214` reads `uncertain`, plus generic words like `engineer` and `trainee`, to decide which jobs are worth a Gemini call.

The helper `hasTerm` builds `\b`-bounded regexes and caches them, because plain substring matching finds "ai" inside "maintain" and "dev" inside "device". Both functions are pure — the sort of thing you can be handed on a whiteboard.

## 4.9 Why blocking is the problem

JavaScript runs your code on **one thread** — a single line of execution, one instruction at a time. There is exactly one, and it also runs the timers, the clicks, and the page redraw.

Picture the hostel mess at 8 p.m. with one server. If the student at the front asks for a fresh roti and the server stands there waiting for it to cook, the whole queue stops. That is **blocking**: an operation that holds the thread while it waits.

The waits here are enormous. A Gemini call takes seconds; loading a LinkedIn page takes seconds. If those blocked, the watcher would spend its life frozen and a browser page would not even scroll during a request. So JavaScript does the other thing: take the order, hand it to the kitchen, serve the next student, deliver the roti when it is ready.

## 4.10 Callbacks, and callback hell

The original mechanism was the **callback**: a function you hand to another function, to be called later.

```js
// made-up example, not from the project
readFile('config.json', (err, data) => { console.log(data); });
console.log('this line runs FIRST');
```

The last line runs first, because `readFile` returns immediately. That inversion is the whole idea, and it is what beginners get wrong.

Callbacks nest. Three dependent steps make a staircase — `login(… search(… enrich(… save(…))))` — known as **callback hell**. It is not only ugly: error handling repeats at every level, `try/catch` cannot reach across the boundary because the outer `try` has already exited, and returning a value out of the middle is impossible.

## 4.11 Promises

A **Promise** is an object representing a value that is not ready yet. It has three states and moves at most once:

- **pending** — still waiting
- **fulfilled** — succeeded, carries a value
- **rejected** — failed, carries an error

This is a railway waitlist. You book and get a PNR; right now it is WL. Later, exactly once, it becomes confirmed or cancelled, and never flips back. Meanwhile you can do other things, and you can register in advance what you will do in either case.

```js
// made-up example, not from the project
fetch(url)
  .then((res) => res.json())        // on fulfilment; its return feeds the next link
  .catch((err) => null)             // on rejection anywhere above
  .finally(() => clearTimeout(t));  // either way
```

`.then` returns a *new* Promise, which is what flattens the staircase into a list. `.finally` runs on both paths and does not change the value. Two traps: a rejection nobody catches becomes an unhandled rejection, which crashes Node 22; and `throw` inside a `.then` produces a rejection, not a synchronous error, so a surrounding `try/catch` will not see it.

## 4.12 `Promise.all`, `allSettled`, `race`

```js
// made-up example, not from the project
await Promise.all([a, b, c]);        // array of values; rejects the moment ANY rejects
await Promise.allSettled([a, b, c]); // never rejects; {status, value|reason} per entry
await Promise.race([a, b]);          // first to settle wins, success or failure
await Promise.any([a, b]);           // first to SUCCEED wins
```

`all` suits work where you need every result and one failure makes the rest pointless; its failure mode is that the others keep running, you just stop listening. `allSettled` suits partial success — nine of ten pages loaded is still nine jobs. `race` is how people hand-rolled timeouts before `AbortController`, and it is inferior, because the loser is not cancelled: the request continues, the socket stays open, the response arrives to nobody.

## 4.13 `async` / `await`, and the loop mistake

`async`/`await` is Promise chaining written to *look* sequential. An `async` function always returns a Promise. `await` pauses that function until a Promise settles, then gives you the value — or throws the rejection, so ordinary `try/catch` works again.

```js
// made-up example, not from the project
async function load(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  }
}
```

The mental model that matters: `await` pauses *this function*, not the program. The thread goes back to serving other students.

Now the bug interviewers plant. `for (const url of urls) { pages.push(await fetch(url)); }` runs ten 400 ms requests in four seconds, because each `await` waits for the previous one. If they are independent, that is waste, and the parallel form starts all ten at once:

```js
// made-up example, not from the project
const pages = await Promise.all(urls.map((url) => fetch(url)));   // ~400 ms
```

Note the shape: `map` creates the Promises, so the requests are already in flight, and `Promise.all` waits for the set.

But "parallel is faster" is not "parallel is correct". Sequential is right when each step depends on the previous one, when the service rate-limits you, when you want to stop early on failure, or when you are deliberately unhurried so you do not look like a robot. This project has all four reasons somewhere.

## 4.14 The real pattern: `AbortController` and a 30-second timeout

`fetch` is the built-in function for an HTTP request. Left alone it has **no timeout**, so a hung server means a hung program. Here is the core of `enrichJobs`, which sends batches of job descriptions to Gemini (`src/gemini.js:398`):

```js
  for (let start = 0; start < items.length; start += PER_CALL) {
    const slice = items.slice(start, start + PER_CALL);
    // ...build `body` from the slice...

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ /* prompt, schema, thinkingConfig */ }),
        signal: controller.signal,
      });

      if (!res.ok) {
        // ...classify the status, warn, and keep what we have...
        return out;
      }

      const payload = await res.json();
      // ...validate and fill `out`...
    } catch (err) {
      const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
      log.warn(`Gemini enrichment failed (${why}) — remaining postings keep their plain-text summary.`);
      return out;
    } finally {
      clearTimeout(timer);
    }
  }
```

- **`new AbortController()`** — an object with two halves: a `signal` you give to `fetch`, and an `abort()` method. Calling `abort()` makes the request reject *and* tears down the connection. That is what `Promise.race` cannot do.
- **`setTimeout(() => controller.abort(), TIMEOUT_MS)`** — `TIMEOUT_MS` is `30_000` (`src/gemini.js:20`): generous for a language-model call, short enough that a twice-daily run is never left hanging. The arrow is a closure over `controller`, and each batch gets a fresh one.
- **`signal: controller.signal`** — the wiring. Without this line the controller does nothing.
- **`if (!res.ok)`** — `fetch` rejects only on network failure or abort. An HTTP 429 or 403 is a *successful* round trip with a bad status, so you must check yourself. The real code separates 400 (our bug — print the API's own message), 429 (free quota gone) and 403 (bad key).
- **`catch (err)`** — one handler for network failure, abort, and `JSON.parse` throwing on a malformed reply. `err.name === 'AbortError'` distinguishes "we cancelled it" from everything else.
- **`return out`, not `throw`** — `out` is a `Map` of whatever succeeded, so finished batches keep their AI summaries and the rest fall back to the offline plain-text summary. Nothing is blanked. This is the project's central rule: the offline path runs first and always produces a result; Gemini only improves it.
- **`finally { clearTimeout(timer) }`** — cancels the timer on every exit path. Skip it and a pending timer keeps Node alive for up to thirty seconds after the work is done.

## 4.15 Why this loop is sequential on purpose

The loop walks six postings at a time (`PER_CALL = 6`) and `await`s each batch before the next. By section 4.13 that looks like the bug. It is not:

1. **Rate limits.** This runs on Gemini's free tier, where requests per minute are the scarce resource. Firing every batch at once is the fastest route to a 429 and losing the run's enrichment.
2. **Early exit is the point.** On 429 or 403 the code does `return out` and keeps what it has. With `Promise.all` every batch is already in flight, so you burn the remaining quota discovering the same failure repeatedly.
3. **Nothing is waiting.** A background job, twice a day, on maybe forty postings: seven batches at a few seconds each is half a minute, with nobody watching a spinner.
4. **Batching already parallelised it.** Six postings ride in one request. The comment at `src/gemini.js:12` makes the same case for titles — forty candidates should cost one request, not forty.

The honest trade-off: at a thousand postings for many users this would be too slow, and the right fix is a small concurrency limit — say three at a time — not unbounded `Promise.all`.

## 4.16 The event loop, in one paragraph

Who decides when a paused function resumes? The **event loop**: a cycle inside Node, and inside the browser, that asks "is the call stack empty? then run the next queued callback". Timers, finished requests and settled Promises all queue work for it. Promise callbacks live in a microtask queue that drains before timers, which is why `Promise.resolve().then(f)` runs before `setTimeout(f, 0)`. Chapter 5, *Node.js, Modules, and Servers Without a Framework*, teaches it properly — phases, microtasks versus macrotasks, and why blocking the loop with heavy synchronous work is the one thing you must never do.

## Chapter summary

- Primitives copy when passed; objects, arrays and functions are references, so two names can share one value.
- Use `const` by default and `let` when you reassign; `var` ignores block scope and should not appear in new code.
- A closure keeps the variables of the place it was created, which is what makes `setTimeout(() => controller.abort(), 30_000)` in `src/gemini.js:423` work at all.
- Arrow functions have no `this` of their own; they borrow the surrounding one, which is why they are safe inside callbacks.
- `map`, `filter`, `find`, `some` and `reduce` replace most loops, and `filter(Boolean)` at `src/extract.js:112` drops every empty value in one call.
- Use `===` always, and prefer `??` over `||` for defaults, because `||` also replaces `0` and `''`.
- `parseRelativeTime` and `classifyRole` are pure functions, which is exactly why they are the parts of this project with real tests.
- A Promise is pending, then fulfilled or rejected, once and permanently; `async`/`await` is that machinery written top to bottom with `try/catch` working normally.
- `Promise.all` fails fast, `allSettled` never rejects and reports each outcome, `race` returns the first to settle without cancelling the loser.
- `fetch` has no timeout, so `src/gemini.js` pairs every call with an `AbortController` and a 30-second `setTimeout`, clearing the timer in `finally`.

## Key takeaways

Asynchrony exists because JavaScript has one thread and the outside world is slow; every Promise and `await` is a way of not standing at the counter while the roti cooks. Closures are the mechanism underneath all of it — a function that outlives its surroundings and still remembers them. The interview trap is assuming parallel is always better: `enrichJobs` awaits inside a loop deliberately, because a free-tier rate limit and the ability to stop early are worth more than thirty seconds of wall clock. The pattern to memorise is `AbortController` plus `setTimeout` plus `clearTimeout` in `finally`, because a `fetch` with no timeout is a program that can hang forever.

## Interview questions

**1. What is a closure, and where does this project rely on one?**
A closure is a function that keeps access to the variables of the scope where it was defined, even after that scope has finished. JavaScript keeps those variables alive because the function still references them. The clearest use is `src/gemini.js:423`: `setTimeout(() => controller.abort(), TIMEOUT_MS)`. That arrow runs up to thirty seconds later and still reaches `controller` because it closed over it. A fresh controller is created per batch, so each closure captures its own — without closures you would need a shared variable and overlapping requests would abort each other.

**2. Difference between `==` and `===`, and between `||` and `??`?**
`===` compares type and value with no conversion; `==` converts first, using rules that make `'' == 0` true and `null == 0` false. Use `===`, unless you specifically want `x == null` to catch both `null` and `undefined`. `||` returns the right side whenever the left is falsy, which includes `0`, `''` and `false`; `??` fires only on `null` and `undefined`. That distinction is load-bearing here: `MS[unit] ?? 0` in `parseRelativeTime` must not treat a legitimate `0` as missing.

**3. Walk me through a Promise's lifecycle.**
It starts pending and settles exactly once — fulfilled with a value or rejected with an error — and can never change again. `.then` registers a fulfilment handler and returns a *new* Promise, which is what makes chaining flat instead of nested. `.catch` handles a rejection from anywhere earlier in the chain, and `.finally` runs on both paths without altering the value. Two gotchas: an uncaught rejection crashes Node 22, and a `throw` inside `.then` becomes a rejection, so a surrounding synchronous `try/catch` never sees it.

**4. `Promise.all` versus `allSettled` versus `race`?**
`all` waits for every Promise and rejects the instant one rejects, so you get all the values or nothing. `allSettled` never rejects: it waits for all and returns `{status, value}` or `{status, reason}` per entry, which is what you want when partial success is useful. `race` settles with whichever finishes first, success or failure. The caveat is that none of them cancel anything — with `all` the others keep running after the first rejection, and with `race` the loser still completes to nobody. That is why real timeouts use `AbortController` instead of racing a timer.

**5. Why `AbortController` rather than `Promise.race` with a timer?**
`fetch` has no built-in timeout, so without something the program can hang indefinitely on a stalled server. `Promise.race` would let you stop waiting, but the request would stay open, the connection held, and the response discarded. `AbortController` actually cancels: the `signal` is passed into `fetch`, and `abort()` tears the request down and rejects it with an `AbortError`. `src/gemini.js` creates one controller per batch, arms a 30-second `setTimeout`, and calls `clearTimeout(timer)` in `finally` so the timer never outlives the request. The `catch` then checks `err.name === 'AbortError'` to log an accurate reason.

**6. Hostile: you `await` inside a `for` loop in `enrichJobs`. That is the textbook async bug. Defend it.**
It is the textbook bug when the iterations are independent and the only cost is latency — then `Promise.all` over a `map` is correct. Here they are not independent in the way that matters. It runs on Gemini's free tier where requests per minute are the scarce resource, so firing all batches at once is the quickest way to a 429 and losing the run's enrichment. The loop also exits early on 429 or 403 with `return out`, which buys nothing if everything is already in flight. The workload is about forty postings twice a day with nobody watching, and six postings already ride in each request. I would change it if it had to scale, and the fix would be a concurrency limit of about three, not unbounded parallelism.

**7. Hostile: `extractStipend` is eighty lines of regexes and hand-tuned scores. Isn't that an unmaintainable hack when you already have a language model?**
It is genuinely fragile and it grew from bugs, not from a design — the filter at `src/extract.js:91` exists because "$410 million in funding" was once published as an intern stipend. But the alternative is worse for this field specifically. Money is the number a student acts on, and a model that hallucinates a stipend is more dangerous than no stipend, whereas a regex fails in ways I can read and reproduce. It is also free, offline, instant and testable, so it works when the key is missing or the quota is spent. The real cost is that every new posting format is another special case; if I rewrote it I would keep the regex layer and use the model to *check* it, not replace it.

**8. Why are `parseRelativeTime` and `classifyRole` easy to test when the browser code is not?**
Both are pure: arguments in, value out, no network, no database, no clock they were not given. `parseRelativeTime` accepts `now = Date.now()` as a default, so a test can pin the clock and assert an exact millisecond result. That is why the tests are three `.mjs` files using Node's built-in `assert`, with no framework and no mocking. The browser code in `web/public/app.js` is the opposite — it reads and writes the DOM, so testing it needs a simulated browser. That is an honest gap: there are no automated tests for the front end.

**9. Why does `classifyRole` check negative terms before positive ones?**
Because "Software Sales Intern" and "Sales Engineer Intern" contain strong software words but are not software jobs, and a positive-first order would put them on a software job board. Checking negatives first means "sales" wins. That over-corrects for titles like "Data Analyst", where "analyst" reads as commercial, so there is one deliberate override: a positive phrase of two or more words beats a negative single word, computed as `strongPositive` before the negative check. Anything matching neither list returns `uncertain` rather than a guess, and `needsDescription` uses that to decide which jobs are worth a Gemini call.

**10. What is the event loop, in one minute?**
JavaScript runs your code on a single thread, so any long wait would freeze everything. Slow work — network, timers, file reads — is handed to the platform, and a callback is queued for when it finishes. The event loop is the cycle that checks whether the call stack is empty and, if so, runs the next queued callback. Promise callbacks sit in a microtask queue that drains before timers, which is why `Promise.resolve().then(f)` runs before `setTimeout(f, 0)`. The practical consequence is that a heavy synchronous computation blocks everything, including timers and, in a browser, rendering.

**11. Hostile: your error handling swallows failures — you `catch` and `return out`. Aren't you hiding bugs?**
It is a real trade-off and it is deliberate. Every failure path calls `log.warn` with a specific reason — `timed out`, `HTTP 400` with the API's own message, `daily free quota exhausted`, `API key rejected` — so nothing is silent; it is downgraded, not hidden. Returning the partial `Map` means enriched postings keep their bullets and the rest fall back to the offline summary, instead of one bad batch blanking a whole run. The cost is that a permanently broken key degrades quietly twice a day, and I only find out by reading logs, because there is no alerting. If I added one thing it would be a notification when zero batches succeed, since that is the case that looks like success but is not.

**12. Why plain functions and modules instead of classes?**
The project keeps data in plain objects and behaviour in exported functions, so a module's exports are its API and everything else — `POSITIVE_SORTED`, `hasTerm`, the cached regexes — is private to the file. That removes `this` binding bugs, makes each function independently testable, and means importing one function does not drag an object graph with it. The classes it does use come from the platform: `AbortController`, `DatabaseSync`, `Map`, `Set`. The trade-off is that shared state must be passed explicitly, which makes some signatures longer than a method would be. For two dozen small modules that is a fair price.

## Common beginner mistakes

**Treating `await` as "pause the program".** It looks like a full stop, and the happy path works. In fact it pauses only the enclosing async function and returns the thread to the event loop. This bites when you assume ordering between two independent async functions — there is none unless you create it. Use `Promise.all` when you need a join point.

**Forgetting that `fetch` does not reject on HTTP errors.** Code goes straight from `await fetch(...)` to `await res.json()` and works in testing. But a 429 or 500 is a successful round trip; `fetch` rejects only on network failure or abort. You then parse an error page as JSON and get a crash far from the cause. Check `res.ok` first, as `src/gemini.js:442` does.

**Awaiting inside a loop when the steps are independent.** Ten sequential requests at 400 ms take four seconds instead of four hundred milliseconds, and the code reads perfectly. Use `await Promise.all(urls.map(fn))` when the calls do not depend on each other — but only then, and comment the loop when it is deliberate, because the next reader will assume it is a bug.

**Using `||` for default values.** `const port = input || 3000` looks like "use 3000 if nothing was given", and works until someone passes `0`, `''` or `false` — all falsy, all silently replaced. Use `??`, which fires only on `null` and `undefined`.

**Forgetting `clearTimeout` after a timeout-guarded request.** The request succeeds, the code moves on, and the abandoned timer keeps the Node process alive for up to thirty seconds — or aborts a controller that has been reused. Locally you just notice the process taking a moment to exit. Cancel it in `finally`, which runs on success, on throw, and on early `return` alike.

**Mutating an array you thought you copied.** `const b = a` copies the reference, so pushing to `b` changes `a`. `map` and `filter` return new arrays, but `sort`, `push` and `splice` modify in place. Copy with `[...a]` when you need independence.

## Exercises

1. **Truthiness drill.** Predict `0 || 'x'`, `0 ?? 'x'`, `'' || 'x'`, `null ?? 'x'`, `[] ? 'yes' : 'no'`, and `'0' == 0` before running anything. Check in `node`, then explain each answer you got wrong.

2. **Read the real code.** Open `src/extract.js` and find `extractSkills`. Explain why line 245 computes `boundary` conditionally instead of always using `\b`, and why lines 251–252 delete `react` and `spring`. Predict what `extractSkills('We use React Native and Spring Boot')` returns.

3. **Make it testable.** Write five `assert` checks in a `.mjs` file for `parseRelativeTime` — a fixed `now`, then `'3 hours ago'`, `'Just now'`, `'Reposted 45 minutes ago'` and `'sometime last Diwali'` — asserting exact values. Run it with `node`.

4. **Sequential versus parallel, measured.** Write a `delay(ms)` helper returning a Promise. Call it ten times with 200 ms, first in a `for` loop with `await`, then via `Promise.all`. Print elapsed time with `Date.now()` and explain the two numbers.

5. 🔴 **Add a concurrency limit.** Without changing `src/gemini.js`, write `mapLimit(items, limit, fn)` that runs at most `limit` async calls at once and resolves to results in the original order. Then argue in five sentences whether `enrichJobs` should use it with `limit: 3`, addressing the free-tier rate limit and the early `return out`. Either answer is defensible; the argument is the exercise.

## Quiz

1. What are the three states of a Promise, and how many times can one change state?
2. What does `filter(Boolean)` do, and where does `src/extract.js` use it?
3. Give one value for which `||` and `??` differ, and say which this project prefers for defaults.
4. Does `fetch` reject when the server returns HTTP 429? What must your code do instead?
5. Why is `clearTimeout(timer)` in a `finally` block rather than after the `await fetch(...)` line?
6. Name two reasons the batching loop in `enrichJobs` is sequential rather than `Promise.all`.

---

### Quiz answers

1. **Pending, fulfilled, rejected.** It settles at most once and never changes again — like a PNR going from WL to confirmed or cancelled, permanently.
2. `Boolean` converts a value to true/false, so `filter(Boolean)` removes every falsy element. `src/extract.js:112` uses `texts.filter(Boolean).join('\n')` to drop missing arguments before joining the rest into one searchable block.
3. `0` (also `''` and `false`). `0 || 5` gives `5`; `0 ?? 5` gives `0`. The project prefers `??`, as in `MS[unit] ?? 0` at `src/extract.js:289`, because a real zero must survive.
4. **No.** `fetch` rejects only on network failure or abort; a 429 is a successful round trip with a bad status. You must check `res.ok` or `res.status` yourself, which `src/gemini.js:442` does before reading the body.
5. Because `finally` runs on every exit path — success, thrown error, and the early `return out` inside the `try`. Placing it after the `await` would skip it whenever the request failed, leaving a live timer that keeps the process alive and could abort a later request.
6. Any two of: the free-tier rate limit makes concurrency the fastest route to a 429; the early `return out` on 429/403 preserves quota only if later batches have not started; the workload is small enough that the saving is invisible; batching six postings per request already captures most of the parallelism.
