# Chapter 10 — Inside Node.js

> By the end of this chapter you will be able to explain what happens between typing `node src/index.js` and the program finishing, describe the event loop phase by phase, and read every `async`, `await`, `Promise` and `AbortController` in this repository and say exactly why it is written that way.

**Before this chapter you should have read:** Chapter 1, *What Is Software?*, Chapter 2, *How Websites Actually Work*, and Chapter 7, *JavaScript: The Muscles*.

**New words introduced here:** runtime, engine, V8, libuv, binding, process, thread, kernel, system call, I/O, blocking, non-blocking, event loop, phase, callback, callback queue, microtask, `process.nextTick`, promise job, starvation, thread pool, worker thread, concurrency, parallelism, callback hell, error-first callback, Promise, pending, fulfilled, rejected, settled, chaining, `Promise.all`, `Promise.allSettled`, `Promise.race`, `Promise.any`, `async`, `await`, rejection, unhandled rejection, `AbortController`, signal, timeout, fire-and-forget, back-pressure.

---

## 10.1 What a runtime is, and why the word matters

Start with the smallest possible definition, because everything else in this chapter hangs off it.

A **program** is a file of instructions. A **process** is one running copy of a program, with its own slice of the computer's memory, given to it by the operating system. The **operating system** (macOS, Windows, Linux) is the program that owns the machine and hands out memory, files and network connections to everybody else. The **kernel** is the innermost part of the operating system — the part that actually talks to the disk and the network card. When your program wants something from the kernel it makes a **system call**: a formal request, like "open this file", "read 4096 bytes from this socket".

Now: JavaScript, the language, cannot do any of that. The language itself knows about numbers, strings, objects, functions, `if`, `for` and arithmetic. It has no idea what a file is. It has no idea what a network is. It cannot print to your screen. `console.log` is not part of the JavaScript language — go and read the language specification and you will not find it.

So JavaScript always runs *inside* something bigger that lends it those abilities. That something is called a **runtime**: a program that contains a JavaScript engine plus a library of extra abilities, and hands both to your code.

An **engine** is the part that actually understands JavaScript text and turns it into machine instructions. A runtime is the engine *plus* everything else.

You have already used one runtime without noticing. The web browser is a JavaScript runtime. It gives your JavaScript `document`, `window`, `fetch`, `localStorage` and `alert`. None of those are JavaScript either; they are the browser's gifts. Chapter 8, *The DOM and How a Page Is Painted*, is entirely about one of those gifts.

Node.js is a *different* runtime. It gives your JavaScript files, sockets, child processes, timers, a `process` object and a standard library. It does not give you `document` or `window`, because there is no page.

Same language. Two different worlds bolted onto it.

> **The mess counter, once.** Think of the JavaScript language as a student who can read, write and do arithmetic, but who has never been inside a kitchen. Put that student behind a hostel mess counter and give them a token machine, a bell and a kitchen behind them, and suddenly they can serve two hundred people dinner. The student did not change. The counter did. Node.js is a counter. The browser is a different counter.

This chapter is about the counter.

---

## 10.2 The before: how servers worked, and why anyone wanted this

The Bible for this book insists that for each technology you learn how people managed before it existed. Otherwise you memorise a tool instead of understanding a problem.

A **server** is a computer, or a program on a computer, whose job is to wait for requests from other computers and answer them. When you open `internradar.online`, some machine somewhere receives a request that says "give me index.html" and sends the file back. That machine is running a server program.

In the 1990s and 2000s the standard way to write one was: **one process, or one thread, per connection.**

A **thread** is a strand of execution inside a process. One process can have many threads, all sharing the same memory, all making progress at roughly the same time because the operating system rapidly switches the CPU between them. Threads are how a single program does several things at once.

So the old design was: a visitor connects, and the server hands that visitor a whole thread of their own. The thread runs code like this — and this is a made-up example to show the idea, not from the project:

```js
// Illustration only. Not real code from this repository, and not real Node.
const request = readFromSocket(connection);   // waits here until bytes arrive
const rows    = queryDatabase(request.query); // waits here until the DB answers
const html    = renderPage(rows);
writeToSocket(connection, html);              // waits here until bytes are sent
```

Read it top to bottom. It is beautifully simple. Every line waits for the previous one to finish. This is exactly how you would write it as a beginner, and that instinct is correct — this code is easy to read.

The catch is the word "waits". While `queryDatabase` is waiting for the database, that thread is doing *nothing at all*. It is not calculating. It is not using the CPU. It is parked, occupying maybe half a megabyte to a megabyte of memory for its stack, and taking up a slot in the operating system's scheduler.

With ten visitors, fine. With ten thousand simultaneous visitors, you need ten thousand parked threads. The memory adds up to gigabytes. Worse, the operating system spends a growing share of its time simply switching between threads that are all doing nothing. This was famous enough to get a name: the **C10K problem** — how do you serve ten thousand concurrent connections on one machine?

The measured, uncomfortable fact behind Node's existence is this: for a typical web server, *almost all of the time is spent waiting, not computing.* Waiting for the disk. Waiting for the database. Waiting for another server's API. Waiting for a slow phone on a train to finish uploading a photo.

Ryan Dahl, the person who built Node, told the origin story many times: he was looking at a file-upload progress bar on Flickr, and realised the browser had no clean way to be *told* how the upload was going — it had to keep asking. The deeper irritation was that the tools of the day made "do something else while you wait" awkward, and made "wait right here" easy. He thought the defaults were backwards.

His idea was not new. Event-driven servers already existed — nginx was built that way, and so were libraries like libevent. What was new was the *language he attached it to*.

---

## 10.3 2009: JavaScript escapes the browser

Node.js was released in 2009, and Dahl presented it publicly at a JavaScript conference in Berlin in November of that year. The talk is on the internet and is worth watching once you finish this chapter.

Putting JavaScript on a server was not itself the innovation. Netscape shipped server-side JavaScript in 1996. It went nowhere. Rhino, a JavaScript engine written in Java, existed for years. It stayed a niche tool.

Two things made 2009 different.

**First, V8.** Google had released the Chrome browser in 2008 with a new JavaScript engine called V8, and V8 was dramatically faster than anything before it. For the first time, JavaScript was fast enough that writing a server in it was not absurd.

**Second, and more important: JavaScript had no I/O library, and that was an advantage.**

**I/O** means input/output: anything where your program talks to the world outside its own memory. Reading a file. Writing to the network. Reading the keyboard. Everything that is not pure calculation.

Every other language of the time — C, Java, Python, Ruby, PHP — had arrived with a large, mature, *blocking* standard library. `open()`, `read()`, `write()`, and every one of them waits. Millions of lines of existing code assumed waiting. If you wanted to build a non-blocking runtime for Python, you had to fight the entire existing ecosystem, because any library that called a blocking function would ruin everything.

JavaScript, having lived its whole life inside a browser, had *no* file functions and *no* socket functions to be compatible with. It was a blank slate. Dahl could define every single I/O operation in his new runtime as non-blocking from day one, and no existing JavaScript code would break, because no existing JavaScript code did I/O at all.

There was also a cultural fit. Browser programmers were already used to writing `button.addEventListener('click', doSomething)` — code that says "here is a function; call it later, when something happens". That style is unnatural in a language where waiting is normal. In JavaScript it was the only style anyone knew.

So: a fast new engine, a language with no blocking legacy, and a community already trained in callbacks. Node.js caught on quickly. **npm**, the package registry that Chapter 11, *Modules, npm, and the One-Dependency Rule*, is about, arrived in 2010 and made sharing code easy. Node had a difficult period around 2014 when the community forked the project as `io.js`, but the fork and the original reunited in 2015 under a neutral foundation, and Node has been on a predictable release schedule ever since.

This project requires Node 22 or newer for the watcher. You can see that stated in `package.json:9-11`:

```json
  "engines": {
    "node": ">=22"
  },
```

That line matters more here than in most projects. Chapter 14, *Databases and SQLite*, explains why: `node:sqlite`, the database this project uses, is built into Node itself and only exists from Node 22 onward. Declaring the requirement is how you turn a mysterious crash into a clear message.

---

## 10.4 What is actually inside Node

Open the Node binary and you would find, roughly, four layers. You will hear all four named in interviews.

### V8 — the engine

**V8** is Google's JavaScript engine, written in C++ and originally built for Chrome. Node embeds it. V8's job is: take JavaScript source text, and run it fast.

It does this in stages, which is worth knowing at a high level. V8 first parses your source into a tree structure. Then an interpreter (its name is Ignition) walks that tree and executes it immediately — this gets your program started quickly. While that runs, V8 watches which functions are called often and with what kinds of values. Functions that run hot get handed to an optimising compiler (the big one is called TurboFan), which compiles them into specialised machine code based on the assumptions it observed. If a later call violates those assumptions — you had been passing numbers and suddenly you pass a string — V8 throws away the optimised version and falls back to the interpreter. This is called **deoptimisation**.

V8 also owns memory. It allocates every object your JavaScript creates, and it runs the **garbage collector**: the routine that periodically finds objects nothing points at any more, and reclaims their memory. You never call `free()` in JavaScript. That is V8's job.

What V8 does *not* do: files, networks, timers, processes. V8 knows nothing about any of them.

### libuv — the I/O layer and the event loop

**libuv** is a C library that was written for Node (it is now used by other projects too). It provides everything V8 lacks: file operations, network sockets, timers, DNS, child processes, signal handling — and, at its centre, the **event loop**.

libuv exists mostly to hide the fact that every operating system does asynchronous I/O differently. Linux has a mechanism called `epoll`. macOS and the BSDs have `kqueue`. Windows has something structurally different again, called IOCP. These are not small differences. libuv wraps all of them behind one interface, so that the JavaScript you write runs identically on your Mac and on a Linux server in a data centre.

You are on a Mac reading this book. When this project makes an HTTPS request to Gemini, the notification that the reply has arrived comes through `kqueue`. You never see that word anywhere in the source, and that is the entire point of libuv.

### The bindings — the bridge

V8 speaks JavaScript. libuv speaks C. Something has to translate. The **bindings** are C++ code inside Node that exposes libuv's abilities as JavaScript functions.

When you call `fs.readFile('a.txt', cb)`, you are calling a JavaScript function in Node's standard library, which calls a C++ binding, which calls libuv, which calls the operating system. The answer travels back up the same staircase. Chapter 11 will show you that this same staircase is how *any* Node package with native code works.

### The standard library — the JavaScript you actually import

On top of the bindings sits a large body of JavaScript written by the Node team: `node:fs`, `node:path`, `node:http`, `node:url`, `node:os`, `node:child_process`, `node:util`, and in Node 22, `node:sqlite`. These are called **built-in modules**, and their names are prefixed with `node:` so you can tell at a glance that they came with the runtime rather than from the internet.

This project imports nine of them across the whole codebase. You can see the whole list by reading the imports:

```js
import { existsSync, mkdirSync } from 'node:fs';        // src/browser.js:1
import { join } from 'node:path';                        // src/browser.js:2
import { execFileSync } from 'node:child_process';       // src/browser.js:3
import { promisify } from 'node:util';                   // src/notify.js:2
import { DatabaseSync } from 'node:sqlite';              // src/store.js:1
import { homedir } from 'node:os';                       // src/paths.js:4
import { createServer } from 'node:http';                // web/serve.js:11
import { readFile } from 'node:fs/promises';             // web/serve.js:12
import { fileURLToPath } from 'node:url';                // src/paths.js:1
```

That is nine built-in modules, plus exactly one module downloaded from npm — `playwright-core`, declared at `package.json:24`. The ratio is the point. A very large amount of this program is built out of things the runtime already contained.

---

## 10.5 How a Node process starts

You type this in a terminal:

```bash
node src/index.js
```

Here is what happens, in order. Nothing here is magic, and knowing the order explains several bugs later in the chapter.

**1. The operating system starts a process.** It loads the `node` binary — a compiled C++ program of roughly a hundred megabytes containing V8 and libuv — into memory and starts running it. Your JavaScript has not been touched yet.

**2. Node initialises itself.** It creates a V8 *isolate* (an independent instance of the engine, with its own heap of memory) and a *context* (the global scope your code will see). It creates the default libuv event loop. It builds the `process` object, which is how your JavaScript learns about the outside world: `process.argv` for command-line arguments, `process.env` for environment variables, `process.exitCode` for the code you leave behind when you finish.

You can see all three used in this project. `src/index.js:25` reads the arguments:

```js
const ARGS = new Set(process.argv.slice(2));
```

`process.argv` is an array whose first entry is the path to the `node` binary and whose second is the path to your script. `slice(2)` drops both and keeps only the flags you typed. Putting them in a `Set` — a collection that answers "do you contain this?" instantly — makes the checks on the next lines cheap and readable:

```js
const DRY_RUN = ARGS.has('--dry-run');
const NO_OPEN = ARGS.has('--no-open');
const SCHEDULED = ARGS.has('--scheduled');
```

**3. Node runs its own bootstrap JavaScript.** A surprising amount of Node is written in JavaScript, compiled into the binary. This step sets up `console`, timers, the module loader, and the rest of the globals.

**4. Node resolves your entry file and decides which module system it is in.** This project sets `"type": "module"` at `package.json:7`, which tells Node that every `.js` file in this folder is an **ES module** — the modern `import`/`export` system. Chapter 11 covers this properly. The relevant fact here is that ES modules load in two distinct passes.

**5. The link pass.** Node reads `src/index.js`, finds all of its `import` statements, fetches those files, finds *their* imports, and continues until it has the entire graph. `src/index.js:6-23` imports sixteen modules; each of those imports more. Every file in that web is read and parsed *before a single line of any of them executes.* This is why you cannot compute an import path at runtime with a plain `import` statement — the imports are resolved before your code runs at all.

**6. The evaluation pass.** Now the module bodies run, deepest dependency first. Top-level constants get their values. `src/gemini.js:19-21` runs here:

```js
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 30_000;
const MAX_TITLES_PER_CALL = 60;
```

(Those underscores are just visual separators for readability. `30_000` is the number thirty thousand. JavaScript ignores them.)

Then finally the body of `src/index.js` itself runs, and the last two statements in the file are executed, at `src/index.js:677-680`:

```js
// Make sure an unexpected crash still leaves a trace in the log file.
main().catch((err) => {
  log.error(`Unhandled: ${err.stack ?? err.message}`);
  process.exitCode = 1;
});
```

**7. `main()` is called — and returns almost immediately.** This is the part that trips everyone. `main` is declared `async function main()` at `src/index.js:101`. An `async` function does not run to completion before returning. It runs until it hits its first `await` that actually has to wait, and then it *returns a promise* to whoever called it. The rest of `main` is scheduled to continue later.

So `main()` returns after a few milliseconds, `.catch(...)` attaches an error handler to the returned promise, and the last line of the file is done. The program has, in a sense, finished.

**8. Node enters the event loop.** Having run your file, Node asks: is there anything still outstanding? A timer waiting to fire? A network connection open? A file read in progress? If yes, it goes round the loop, servicing them, until there is nothing left.

**9. The process exits.** When the loop has no work and nothing is holding it open, Node emits an `exit` event and the process terminates with whatever number is in `process.exitCode` — set to `1` by `src/index.js:673` if the run failed, and by the `.catch` above if something escaped entirely.

Notice what step 9 implies, because it is a genuinely useful and slightly alarming fact: **an unresolved promise does not keep Node alive.** If every timer and socket disappeared while `main` was still waiting on a promise that nothing would ever resolve, Node would simply exit, silently, with your code half-finished and no error at all. The program stays alive because of the *timers and sockets underneath* the promises, not because of the promises.

---

## 10.6 Blocking and non-blocking, properly

Now the central idea. Take it slowly; everything after this depends on it.

### The mess counter

You are in the hostel mess at 8pm. There is one person behind the counter. Two hundred students want dinner.

**The blocking counter.** You ask for dal, rice and two rotis. The server writes it down, walks into the kitchen, stands at the stove, and waits until your rotis come off the tawa. Then he walks back, hands you your plate, and calls the next student. The queue behind you does not move for four minutes. Everyone is stuck behind whoever is currently waiting.

The counter is not busy. The server is not doing work. He is *standing still, holding the queue hostage*, because the design says he finishes one order completely before starting the next.

**The non-blocking counter.** You ask for the same thing. The server writes it on a chit, spikes the chit on the kitchen rail, hands you token number 47, and immediately calls the next student. He takes twelve more orders in the next minute. When the kitchen finishes an order they ring a bell and put the plate on the pass with its token number. The server, between taking orders, glances at the pass, calls "47!", and you collect.

Same one server. Same one kitchen. Enormously more students fed. Nothing got faster — your rotis still took four minutes. What changed is that *nobody waits on behalf of anybody else.*

That is the whole of Node in one paragraph.

### In code

**Blocking** means: this function does not return until the work is finished, and while it has not returned, this thread cannot do anything else.

**Non-blocking** means: this function returns immediately, having only *started* the work, and you will be told when it is done.

Node's standard library gives you both. The blocking versions have `Sync` in the name.

Here is a blocking read from this project, `src/publish.js:127`:

```js
writeFileSync(JOBS_FILE, next);
```

That call does not return until the bytes are on the disk. Everything else in the process stops.

Here is a non-blocking read, `web/serve.js:84`:

```js
const body = await readFile(path);
```

Same idea, different shape. `readFile` from `node:fs/promises` returns instantly with a promise. The `await` suspends *this function* while letting the rest of the process carry on. When the file's contents are ready, this function resumes.

The distinction people get wrong is this: **`await` does not block. `Sync` blocks.** `await` pauses one function and lets the loop keep running. `readFileSync` freezes the entire process. They look similar in the source — both make the next line wait — and they are opposite in effect.

### The cost of blocking, made concrete

Suppose your server takes 50 milliseconds to read a file, and you use `readFileSync`. One visitor: 50ms, fine. But the hundredth visitor in a queue waits 5 seconds, because the process could only ever be reading one file at a time.

Now make it non-blocking. All hundred reads are handed to the operating system almost at once. They complete roughly in parallel, because the disk can service several requests at once and the CPU was never the bottleneck. Total wall-clock time: not much more than 50ms.

Nothing got faster. The waiting simply stopped being serialised.

---

## 10.7 The event loop, phase by phase

The event loop is a `while` loop inside libuv. It goes round and round, and on each lap it visits a fixed sequence of **phases**, in a fixed order. Each phase has its own queue of callbacks waiting to run.

A **callback** is a function you hand to something else, to be called later, when a condition is met. The word is exact: you are asking to be called back.

Here are the phases, in the order libuv visits them.

### 1. Timers

Runs the callbacks of `setTimeout` and `setInterval` whose scheduled time has arrived.

This phase explains a fact that confuses everyone once: **timers are not precise.** `setTimeout(fn, 100)` means "run `fn` no *earlier* than 100ms from now". If the loop is busy when 100ms passes — because some other callback is running long — your function runs late. Nobody interrupts a running callback.

`setTimeout(fn, 0)` is quietly turned into `setTimeout(fn, 1)` by Node. There is no true zero.

This project's `sleep` function lives entirely in this phase. `src/human.js:33-35`:

```js
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Three lines, and they are worth reading carefully because this pattern appears constantly in real Node code.

- `new Promise((resolve) => ...)` creates a promise and immediately runs the function you passed in, handing it a function called `resolve`. Calling `resolve` is what turns the promise from "waiting" into "done".
- `setTimeout(resolve, ms)` says: after `ms` milliseconds, call `resolve`.
- So the promise stays unresolved for exactly `ms` milliseconds, and then finishes.

The result is that `await sleep(2000)` pauses the calling function for two seconds without blocking anything else. Compare with a **busy-wait**, which is the wrong way to do this and which a beginner sometimes writes — a made-up example, not from the project:

```js
// WRONG. Never write this. Made-up example.
function sleepBadly(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}
```

That version burns 100% of a CPU core for the whole duration and freezes the entire process. `src/human.js`'s version costs nothing at all.

### 2. Pending callbacks

A small, internal phase. It runs certain system-level callbacks that libuv deferred from the previous lap — typically some kinds of TCP errors, such as a connection being refused. You will almost never think about this phase. It is on the list because interviewers ask for all five.

### 3. Idle and prepare

Internal to libuv. Not something you can reach from JavaScript. Mentioned for completeness.

### 4. Poll

The most important phase, and where the loop spends most of its life.

Two things happen here. First, the loop asks the operating system: "of the file reads, socket reads, and network requests I told you about, which have finished?" and runs the callbacks for those. Second — and this is the clever bit — **if there is nothing else to do, the loop sleeps here.**

Not a busy-wait. A real sleep: the process is suspended by the kernel and consumes no CPU whatsoever until either an I/O event arrives or the nearest timer is about to come due. libuv works out exactly how long it may safely sleep before it needs to be back for the timers phase.

This is why an idle Node server sitting there with a thousand open connections uses effectively no CPU. It is genuinely asleep. The mess counter has no students; the server sits down.

### 5. Check

Runs `setImmediate` callbacks. `setImmediate(fn)` means "run `fn` on the next lap of the loop, right after the poll phase". It is Node-specific — it does not exist in browsers.

This gives a clean rule that turns up in interviews. In your main module, `setTimeout(fn, 0)` versus `setImmediate(fn)` is a coin toss: the order depends on how long the process took to start up. But *inside an I/O callback*, `setImmediate` always runs first, because check comes immediately after poll on the same lap, whereas timers has to wait for the next lap.

This project uses neither. It is worth knowing anyway.

### 6. Close callbacks

Runs cleanup callbacks for things that have just been closed — for example a `'close'` event on a socket.

### And then round again

After close callbacks, the loop checks whether there is anything left to do. If there are pending timers, open sockets, in-flight file reads, or a listening server, it goes round again. If there is nothing, the loop exits, and so does Node.

That "if there is nothing" is why `web/serve.js` stays running forever after `server.listen(PORT, ...)` at `web/serve.js:95`: a listening server is a **handle** that keeps the loop alive by definition. And it is why `src/index.js` exits on its own when the run finishes — nothing is left holding it open.

---

## 10.8 Microtasks: the queues that jump the queue

Now the part that separates people who have read a blog post from people who understand this.

There are two queues that are **not** phases of the event loop, and that get drained *between* everything else.

### The two microtask queues

A **microtask** is a very small piece of work that Node promises to run at the earliest possible moment — before returning to the loop's normal business.

There are two of them, and they are drained in this order:

1. **The `process.nextTick` queue.** Anything you passed to `process.nextTick(fn)`.
2. **The promise microtask queue** (also called the "promise job queue"). Every `.then`, `.catch`, `.finally` callback, and every resumption of an `async` function after an `await`.

The rules:

- Both queues are drained **completely** after the currently running JavaScript finishes, and before the loop moves on.
- `nextTick` is drained entirely first. Only when it is empty does the promise queue get a turn.
- If draining the promise queue *adds* something to the `nextTick` queue, `nextTick` is drained again before continuing.
- In modern Node (version 11 and later), this draining happens after **each individual callback**, not merely between phases. So after each timer callback, microtasks drain. After each I/O callback, microtasks drain.

> **The counter, again, briefly.** The server's round of the counter — take order, glance at the pass, check the complaint book — is the event loop. Microtasks are the tiny errands he does after *every single* action: hand over the change, tear the receipt. He always finishes his errands before moving to the next part of his round.

### Why this matters: starvation

**Starvation** is when one part of a system never gets a turn because another part will not stop.

Because microtasks are drained *completely*, and because a microtask can add another microtask, you can write a loop the event loop can never escape. Here is the classic demonstration — a made-up example to show the idea, not from the project:

```js
// Made-up example. Do not run this in something you care about.
function forever() {
  process.nextTick(forever);
}
forever();
setTimeout(() => console.log('I will never be printed'), 0);
```

`forever` schedules itself. Node drains the `nextTick` queue completely before proceeding — but the queue refills as fast as it drains. The timer never fires. No file read ever completes. The process is alive, pinned at 100% CPU, and permanently deaf. There is no maximum depth on the `nextTick` queue and no escape hatch.

The same thing happens with a self-scheduling promise chain, though promises are marginally more forgiving in practice.

Contrast with `setImmediate`, which behaves itself:

```js
// Made-up example.
function polite() {
  setImmediate(polite);
}
polite();
setTimeout(() => console.log('This one does print'), 0);
```

`setImmediate` puts you in the *check phase queue*, which is a real phase. The loop finishes its lap, visits timers, and your `setTimeout` fires. The rule of thumb: **use `setImmediate` when you want to yield to the loop; use `nextTick` only when you truly must run before anything else, and never recursively.**

This project uses neither `process.nextTick` nor `setImmediate` anywhere. Search the source and you will not find them. That is normal for application code — they are tools for library authors and for people fixing subtle ordering problems. But microtasks are running constantly in this codebase whether you name them or not: every `await` in `src/index.js` resumes as a promise microtask.

---

## 10.9 The thread pool, and what actually runs on it

Here is a question that should bother you. If Node runs your JavaScript on one thread, and reading a file is a blocking operation at the operating-system level, how does `readFile` manage not to block?

The answer is that libuv keeps a small pool of extra threads for exactly this.

The **thread pool** is a group of worker threads — by default **four** of them — that libuv creates at startup. When you call an operation that has no non-blocking form at the OS level, libuv hands the job to one of these threads. That thread blocks, happily, because it is not the thread running your JavaScript. When it finishes, it signals the event loop, and your callback is queued for the poll phase.

You can change the size with the environment variable `UV_THREADPOOL_SIZE`. The default of four is a compromise; it is not a law of nature.

### What uses the pool

- **The file system.** Most of `node:fs`. Reading, writing, stat, readdir. `await readFile(path)` at `web/serve.js:84` goes to the pool.
- **`dns.lookup`.** The one that translates a hostname to an IP address using your operating system's own resolver. The underlying system call, `getaddrinfo`, is blocking and has no async version, so it goes to the pool. (The other DNS functions, `dns.resolve4` and friends, use a bundled library that speaks DNS over the network directly — those are ordinary network I/O and do *not* use the pool. This distinction catches people out.)
- **`crypto`** for the deliberately expensive functions: `pbkdf2`, `scrypt`, `randomBytes`, and similar, when called in their asynchronous form.
- **`zlib`** compression and decompression, in its asynchronous form.

### What does *not* use the pool

**Network I/O.** This is the one everybody gets wrong.

TCP sockets, HTTP requests, HTTPS requests, and therefore every `fetch` call in this project, do **not** use the thread pool. Operating systems have had proper non-blocking network I/O for decades — that is exactly what `epoll` and `kqueue` and IOCP are for. libuv registers the socket with the kernel's notification mechanism and gets told when data arrives. No thread is needed to wait, because nobody is waiting.

> **Back to the mess.** The thread pool is the four cooks. If five students order something that must be cooked from scratch, the fifth order sits on the rail until a cook is free. The milk delivery from outside, though, needs no cook at all — the gate guard rings a bell when the van arrives. Network I/O is the milk van.

### Why this matters here

`src/gemini.js` makes HTTPS requests. There could be a hundred of them in flight and the thread pool would be entirely idle, because network I/O never touches it.

`src/logos.js` does something more interesting. It downloads images over the network — pool-free — and then writes each one to disk with `writeFileSync` at `src/logos.js:115`, which is the *blocking* form and runs on the main thread. That is a deliberate choice, and a defensible one: the files are at most 400 KB (`src/logos.js:20` caps them), there are only a handful per run, and nothing else in the process needs the loop at that instant.

The lesson is not "never block". It is "know when you are blocking, and know who is waiting."

---

## 10.10 Worker threads, and when you would want them

The thread pool is libuv's private property. You cannot put your own JavaScript on it.

For that, Node has **worker threads**, available from the built-in module `node:worker_threads`. A worker thread is a genuinely separate thread with **its own V8 isolate, its own memory heap, and its own event loop**. It is very nearly a second Node process living inside the same process.

Because each worker has its own heap, they do not share variables. You communicate by sending messages, which are copied between the two sides. If you need genuinely shared memory you must use a `SharedArrayBuffer`, which is a raw block of bytes both sides can see. There is no way to accidentally share an object.

A tiny illustration — this is a made-up example to show the shape, not from the project:

```js
// main.js — made-up example
import { Worker } from 'node:worker_threads';

const worker = new Worker('./heavy.js');
worker.postMessage({ numbers: [1, 2, 3] });
worker.on('message', (result) => console.log('worker said', result));
```

```js
// heavy.js — made-up example
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ numbers }) => {
  const total = numbers.reduce((a, b) => a + b, 0);  // pretend this is expensive
  parentPort.postMessage(total);
});
```

**When to use one:** when you have work that is *CPU-bound* — resizing images, parsing a very large file, hashing passwords, running a machine-learning model, computing something numerically heavy. Work where the CPU is genuinely busy, not waiting.

**When not to use one:** for I/O. If your work is waiting on a network or a disk, a worker thread adds overhead and buys you nothing, because the event loop was already handling that concurrently for free.

**This project uses none.** Search for `worker_threads` in `src/`, `bin/`, `web/` and `test/` and there are no results. That is the correct answer for this program. Every slow thing it does is waiting: waiting for LinkedIn to render a page, waiting for Gemini, waiting for a deliberate two-second human-like pause from `src/human.js`. There is no expensive calculation anywhere. `src/summarize.js:61-89` scores sentences with regular expressions — the most CPU-heavy thing in the codebase — and it operates on a few kilobytes of text and finishes in under a millisecond.

Adding a worker thread here would be more code, more failure modes, and no faster.

---

## 10.11 "Node is single-threaded" — true and misleading at once

You will hear this sentence constantly. It is worth being able to unpack it properly, because it is half right in a way that causes real bugs.

**What is true:** your JavaScript runs on one thread. There is exactly one call stack. Two of your functions never run at the same instant. You never need a lock, a mutex, or a semaphore to protect a variable. Two callbacks cannot half-update the same object simultaneously, because a callback always runs to completion before the next one starts. Whole categories of bug that dominate multithreaded C++ and Java simply do not exist in Node.

**What is misleading:** the Node *process* is not single-threaded at all. Start any Node program and look at it in Activity Monitor and you will see a handful of threads: the main thread, four thread-pool threads, V8's background compilation and garbage-collection helper threads. Meanwhile the operating system is servicing dozens of network operations for you in the kernel, on nobody's thread at all.

The precise statement is: **one thread runs your JavaScript; many things happen concurrently around it.**

### Concurrency versus parallelism

Two words that get used interchangeably and should not be.

**Concurrency** is dealing with many things at once — making progress on several tasks whose lifetimes overlap. **Parallelism** is doing many things at the same instant, which requires more than one CPU core.

One mess counter server taking twelve orders while the kitchen cooks is *concurrency*. Twelve counters open at once is *parallelism*.

Node gives you extraordinary concurrency and, by default, no parallelism for your own code. That is exactly the right shape for a program that mostly waits, and exactly the wrong shape for a program that mostly computes.

### The failure mode

Because there is only one thread for your code, **any long-running synchronous function freezes everything.**

Not "slows down". Freezes. Timers do not fire. Incoming requests are not accepted. Nothing at all happens until your function returns.

A made-up example to show the idea, not from the project:

```js
// Made-up example. This makes a server stop answering for two full seconds.
function slowHash(input) {
  let total = 0;
  for (let i = 0; i < 2_000_000_000; i++) total += i % 7;
  return total;
}
```

Put that inside a request handler and every other visitor waits two seconds. There is no thread free to serve them.

This is the price of the design, and the honest trade-off to state in an interview: Node bought you the ability to hold ten thousand idle connections cheaply, and it charged you the ability to run one expensive calculation without consequences.

---

## 10.12 Callbacks, and the pit they dug

Now to the second half of the chapter: how you actually write this stuff.

Node's original and only mechanism was the callback. You hand a function in; it gets called later.

Node standardised a convention called the **error-first callback**: the callback's first argument is an error (or `null` if there was none), and any results come after. A made-up example:

```js
// Made-up example showing the classic Node style.
import { readFile } from 'node:fs';

readFile('config.json', 'utf8', (err, text) => {
  if (err) {
    console.error('could not read it:', err.message);
    return;
  }
  console.log(text);
});
```

Note `if (err) { ... return; }`. Every single callback needs that. Forget the `return` and you carry on with undefined data.

This works fine for one operation. The trouble starts when operations depend on each other. A made-up example, deliberately painful:

```js
// Made-up example. This shape has a nickname for a reason.
readFile('config.json', 'utf8', (err, text) => {
  if (err) return done(err);
  parseConfig(text, (err, cfg) => {
    if (err) return done(err);
    connectToDatabase(cfg, (err, db) => {
      if (err) return done(err);
      db.query('SELECT * FROM jobs', (err, rows) => {
        if (err) return done(err);
        writeFile('out.json', JSON.stringify(rows), (err) => {
          if (err) return done(err);
          done(null, rows.length);
        });
      });
    });
  });
});
```

That sideways triangle is **callback hell**, sometimes called the pyramid of doom. Its problems are not aesthetic:

1. **Error handling is manual and repetitive.** Six `if (err)` lines, and missing one is silent.
2. **`try`/`catch` does not work.** By the time the innermost callback runs, the outer function has long since returned. There is no enclosing `try` block left to catch anything — the call stack that contained it is gone.
3. **The order of operations is hard to see.** The sequence reads top-to-bottom-and-rightward, and cleanup code has to appear in every branch.
4. **You cannot easily do two things at once.** Running two independent operations in parallel and waiting for both requires hand-written counting.

This is exactly what the promise was invented to fix.

---

## 10.13 Promises

A **Promise** is an object representing a value that is not available yet, but will be — or an explanation of why it never will be.

> **The token slip.** You order at the mess counter and get token 47. The token is not your food. It is a *claim* on food. Right now it is **pending**. In four minutes it becomes **fulfilled** and you exchange it for a plate. Or the kitchen runs out of dal and it becomes **rejected**, and you are given a reason instead. A token is a promise.

### The three states

- **Pending** — not finished yet.
- **Fulfilled** — finished successfully, carrying a value.
- **Rejected** — failed, carrying a reason (almost always an `Error` object).

**Settled** means "fulfilled or rejected". The critical rule: **a promise settles at most once, and can never change afterwards.** Once token 47 has been redeemed it cannot un-redeem. This one-way property is why promises are safe to pass around.

### Making one

You already read the project's only hand-built promise, `src/human.js:33-35`:

```js
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

`new Promise` takes a function with up to two arguments, conventionally `resolve` and `reject`. Calling `resolve(value)` fulfils the promise; calling `reject(error)` rejects it. This one never rejects, because a timer cannot fail.

The other hand-built promise in the repository wraps an older event-based interface, `web/serve.js:38-46`:

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

Line by line:

- An incoming HTTP request arrives in pieces, not all at once. Node exposes it as a **stream**, which announces `'data'` events as chunks arrive and one `'end'` event when there are no more.
- `req.on('data', ...)` registers a callback for each chunk, appending it to `raw`.
- `req.on('end', ...)` fires once, at the end. It tries to parse the accumulated text as JSON and resolves the promise with the result.
- If parsing fails — someone posted nonsense — it resolves with an empty object rather than rejecting. That is a design decision: the handler at `web/api/tailor.js:191` reads `req.body ?? {}` and validates properly, so a malformed body should produce a clear 400 response, not an exception.

This is the standard recipe: **wrap an event-based API once, in a promise, and never think about its events again.**

### Consuming one

Three methods:

- `.then(onFulfilled)` — run this when it succeeds. Returns a *new* promise.
- `.catch(onRejected)` — run this when it fails. Returns a new promise.
- `.finally(onEither)` — run this whichever way it goes. Useful for cleanup.

Because each returns a new promise, you can **chain** them, and the pyramid flattens. The same made-up example from the previous section, rewritten:

```js
// Made-up example. Same work, promise style.
readFile('config.json', 'utf8')
  .then((text) => parseConfig(text))
  .then((cfg) => connectToDatabase(cfg))
  .then((db) => db.query('SELECT * FROM jobs'))
  .then((rows) => writeFile('out.json', JSON.stringify(rows)).then(() => rows.length))
  .catch((err) => console.error('something in that chain failed:', err.message));
```

Two enormous improvements. It reads top to bottom. And **one `.catch` at the end handles a failure at any step**, because a rejection skips every `.then` until it finds a handler — exactly like an exception unwinding a stack, which is precisely the analogy promises were designed around.

You can see chained `.then` and `.catch` used for real at `src/linkedin.js:115-116`:

```js
    page.waitForSelector(LIST_CONTAINERS.join(', '), { timeout: 25_000 }).then(() => true).catch(() => false),
```

`waitForSelector` returns a promise that fulfils with an element handle, or rejects on timeout. This line converts both outcomes into a plain boolean: `.then(() => true)` throws away the element and yields `true`; `.catch(() => false)` swallows the timeout and yields `false`. After this line, the promise cannot reject at all. That is a deliberate move, and the next section shows why it was needed.

---

## 10.14 The four combinators

Sometimes you have several promises and need to combine them. There are four standard functions, and knowing which is which is a reliable interview question.

### `Promise.all(promises)`

Waits for **all** of them. Fulfils with an array of results in the same order as the input. **Rejects immediately if any one rejects** — the others keep running, but their results are discarded.

A made-up example:

```js
// Made-up example.
const [users, jobs, config] = await Promise.all([
  fetchUsers(),
  fetchJobs(),
  fetchConfig(),
]);
```

All three requests start at once. Total time is the slowest of the three, not the sum. Use this when you need every result and any failure means you cannot proceed.

### `Promise.allSettled(promises)`

Waits for all of them, and **never rejects**. Fulfils with an array of objects, each `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`.

Use it when partial success is acceptable — downloading twenty logos where four might 404 and you would still like the sixteen.

### `Promise.race(promises)`

Settles as soon as the **first** one settles — whether it fulfils *or rejects*. That word "or" is the trap.

This project uses `race` twice. `src/linkedin.js:114-117`:

```js
  const appeared = await Promise.race([
    page.waitForSelector(LIST_CONTAINERS.join(', '), { timeout: 25_000 }).then(() => true).catch(() => false),
    page.waitForSelector('a[href*="/jobs/view/"]', { timeout: 25_000 }).then(() => true).catch(() => false),
  ]);
```

LinkedIn has changed the markup of its job list several times, so the code watches for two different things: a known results container, or simply any link that points at a job. Whichever appears first wins.

Now look again at those `.catch(() => false)` calls. They are not decoration. Without them, if the first selector timed out at 25 seconds and the second was going to appear at 25.1 seconds, `race` would settle with the **rejection** — because `race` settles on the first *settled* promise, not the first *successful* one. Converting both to non-rejecting booleans makes the race mean what the author intended: `true` if either selector shows up, `false` only if both time out.

(There is a function that does mean "first success": `Promise.any`, below. Using it here would express the intent more directly, at the cost of a different error shape. With both timeouts set to the same 25 seconds, the code as written behaves correctly.)

The second use is a race against a clock, `src/linkedin.js:376-383`:

```js
  await Promise.race([
    page.waitForFunction(
      (id) => location.href.includes(id) || document.querySelector('#job-details, .jobs-description__content'),
      card.jobId,
      { timeout: 15_000 },
    ).catch(() => {}),
    sleep(6000),
  ]);
```

"Wait until the detail pane actually shows this job — but give up after six seconds and carry on regardless." The `waitForFunction` has its own 15-second limit and swallows its rejection; `sleep(6000)` from `src/human.js` is the real ceiling.

This is worth pausing on, because it teaches something important. **`Promise.race` does not cancel the losers.** When `sleep(6000)` wins, `waitForFunction` keeps waiting in the background for up to another nine seconds. Nobody is listening to it, but it is still there, and its timer still exists. Racing means *you* stop waiting. It does not mean the work stops.

If you want the work to actually stop, you need something else — and that something is the subject of section 10.17.

### `Promise.any(promises)`

Settles with the first one that **fulfils**, ignoring rejections. Only if *all* of them reject does it reject, with a special `AggregateError` carrying every individual reason.

This is `race`'s more forgiving cousin: "give me the first that works" rather than "give me the first that finishes".

### A memory aid

| Function | Waits for | Fails when |
|---|---|---|
| `all` | every one to fulfil | any one rejects |
| `allSettled` | every one to settle | never |
| `race` | the first to settle | the first to settle is a rejection |
| `any` | the first to fulfil | all of them reject |

---

## 10.15 async / await

Promise chains are much better than callbacks. They are still not as easy to read as ordinary code. `async`/`await` fixes that.

Two keywords:

- `async` before a function declaration means "this function always returns a promise", and permits `await` inside it.
- `await` before a promise means "pause this function until that promise settles; then give me the fulfilled value, or throw the rejection reason as an exception".

That second half is the magic. A rejected promise becomes a *thrown exception*, which means `try`/`catch` — the thing that never worked with callbacks — works perfectly again.

The same made-up example, third and final version:

```js
// Made-up example. Same work, async/await style.
async function build() {
  try {
    const text = await readFile('config.json', 'utf8');
    const cfg  = await parseConfig(text);
    const db   = await connectToDatabase(cfg);
    const rows = await db.query('SELECT * FROM jobs');
    await writeFile('out.json', JSON.stringify(rows));
    return rows.length;
  } catch (err) {
    console.error('something failed:', err.message);
  }
}
```

That is the callback pyramid, flat. It reads exactly like the blocking code from section 10.2 — and it does not block anything.

### It is still promises underneath

`await` is not a new mechanism. It is a way of writing `.then`. When a function hits an `await` that must wait, the function is suspended, and its remaining body is registered as a callback on the promise — a *promise microtask*, as section 10.8 described. When the promise settles, the microtask queue runs, and the function resumes.

Two consequences worth remembering:

1. Because `async` functions always return promises, `main()` at `src/index.js:677` returns a promise, and that is why `.catch(...)` can be attached to it.
2. Because resumption goes through the microtask queue, an `async` function that does no real waiting *still* yields briefly. `await Promise.resolve(1)` does not run instantly in place; it defers to a microtask.

### Every async function in this project

Look at the shape of `src/gemini.js:180`:

```js
export async function classifyRoles(items, cfg) {
```

`async` on the declaration. Every caller must `await` it or handle the promise. You can see the caller at `src/index.js:544`:

```js
      const answers = await classifyFromDescriptions(withDesc, cfg);
```

And `src/index.js:422`:

```js
          job.summary = await summarize(job, description, cfg.summarizer);
```

That last line is a nice small illustration. `summarize` at `src/summarize.js:144` is `async`, but it might not do any waiting at all — if the config does not ask for the Claude path, it returns `offlineSummary(description)`, which is entirely synchronous. The function is `async` because it *might* need to wait. The `await` at the call site is correct either way: awaiting a non-promise value is harmless, and awaiting an `async` function that returned immediately just costs one microtask.

### `async` is contagious

The uncomfortable structural fact: if a function needs to `await` something, it must itself be `async`, and then *its* callers must `await` it, and so on all the way up. This is sometimes called "function colouring" and it is a real design cost. Look at the import list at `src/index.js:6-23` and then at the call chain: `main` is async because it awaits `launchBrave`, which is async because Playwright's launch is async, and so on. You cannot `await` in the top-level body of a CommonJS module (though you *can* at the top level of an ES module, which this project uses — it just chooses not to).

The escape hatch used here is the one at `src/index.js:677`: define one `async main()`, call it once at the bottom, and attach a `.catch`. That pattern appears twice in this repository, identically. `bin/enrich.js:92-95`:

```js
main().catch((err) => {
  log.error(err.stack || err.message);
  process.exitCode = 1;
});
```

Learn it. It is the standard shape of a Node command-line program.

---

## 10.16 Errors, and the ones that get away

`try`/`catch` around `await` catches rejections. Good. Here is everything else you need to know.

### `finally` runs either way

Look at the full shape of `classifyBatch` in `src/gemini.js:116-172`. Stripped to its skeleton:

```js
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(/* ... */);
    // ... parse and return
  } catch (err) {
    const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
    log.warn(`Gemini unavailable (${why}) — using the offline classifier for this run.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
```

`finally` runs on *every* exit path: normal return, thrown error, even a `return` from inside the `try`. That is exactly what you want for cleanup. Section 10.17 explains why forgetting the `clearTimeout` would be a real bug rather than a tidiness issue.

### Catching narrowly

`src/index.js:386-393` catches around one specific operation and continues the loop:

```js
          let detail;
          try {
            detail = await li.openAndExtract(page, card, cfg);
          } catch (err) {
            counters.failedDetails++;
            log.warn(`Could not read "${card.title}" — ${err.message.split('\n')[0]}`);
            await ensureHealthy(page, cfg, { context: `job ${card.jobId}` });
            continue;
          }
```

One job failing to load should not end a run that has already collected fifty. The `catch` counts it, logs one line, checks the page is still healthy, and `continue`s to the next card. Compare that with the outer `catch` at `src/index.js:469`, which handles the fatal cases — a CAPTCHA, an expired login, a rate limit — and ends the run.

The general principle: **catch at the level where you can actually do something about it.** A `try`/`catch` that only logs and rethrows is usually noise.

### Empty catch blocks are sometimes correct

Ordinarily, swallowing an error silently is bad. This project does it in several places, on purpose, and each one has a comment explaining why. `src/human.js:119-135`:

```js
export async function idleFidget(page) {
  try {
    if (Math.random() < 0.35) {
      await page.mouse.wheel(0, -rand(80, 260));
      await sleep(rand(300, 1200));
    }
    // ...
  } catch {
    // Page or browser gone. The next real interaction will surface that
    // properly; a failed flourish is not itself news.
  }
}
```

The comment block above the function, at `src/human.js:111-118`, tells you this is not laziness:

> This is decoration, so it must never be able to fail a run. It once did: a mouse.wheel on a browser that had just crashed threw, and aborted a run that had already collected 51 jobs. Anything purely cosmetic swallows its errors.

Fifty-one real jobs were lost to a decorative mouse movement. That is the standard for when an empty `catch` is justified: the operation is genuinely optional, and something else will report the real problem.

`src/logger.js:28-37` does the same for logging — "Logging must never be the reason a run dies."

### Unhandled rejections

An **unhandled rejection** happens when a promise rejects and nobody ever attached a `.catch` or awaited it inside a `try`.

This is the promise equivalent of an uncaught exception, and Node treats it seriously. Since Node 15, an unhandled rejection **crashes the process** by default. That is why the `main().catch(...)` at the bottom of `src/index.js` exists: without it, any error escaping `main` would kill the program with a raw stack trace and nothing in the log file.

### Fire and forget, done properly

Sometimes you genuinely want to start something and not wait for it. `src/guard.js:173` does this:

```js
    soundAlarm({ times: 3 }).catch(() => {});
```

`soundAlarm` at `src/notify.js:54-63` plays a sound four times by default, once per `await`. That takes several seconds. The code here is telling the user that a CAPTCHA is blocking the run; it does not want to spend seconds waiting for beeps before starting the poll loop that watches for the human to solve it.

So it calls the function and does not `await` it. But note the `.catch(() => {})` bolted on the end. **That is not optional.** Without it, if `soundAlarm` ever rejected, nobody would be listening, and Node would crash the whole process with an unhandled rejection — while trying to sound an alarm.

The same pattern appears four lines later at `src/guard.js:176-180`, with a comment saying exactly what it is doing:

```js
    // A dialog that persists until dismissed, in case the banner was missed.
    // Deliberately not awaited: the poll loop below is the real mechanism.
    blockingAlert(
      'LinkedIn security check',
      'The internship watcher hit a CAPTCHA in Brave.\n\nSolve it in the browser window, then this dialog can be ignored — the run resumes automatically.',
      { confirmLabel: 'OK', timeoutSeconds: waitMinutes * 60 },
    ).catch(() => {});
```

`blockingAlert` shows a macOS dialog that can sit there for twelve minutes. Awaiting it would freeze the run for twelve minutes. So it is launched and abandoned, safely.

**Rule to memorise: if you do not `await` a promise, you must `.catch` it.**

---

## 10.17 Sequential and parallel, and the mistake everybody makes

Here is the single most common performance bug in Node code.

```js
// Made-up example. This is the mistake.
const contents = [];
for (const file of files) {
  contents.push(await readFile(file, 'utf8'));
}
```

Fifty files, each taking 20ms. Total: one full second. Every read waits for the previous one, even though they have nothing to do with each other.

The fix, when the operations are truly independent:

```js
// Made-up example. This is the fix.
const contents = await Promise.all(files.map((f) => readFile(f, 'utf8')));
```

`files.map(...)` calls `readFile` fifty times *without awaiting*, producing an array of fifty promises — all fifty reads are now in flight. `Promise.all` then waits for the lot. Total: roughly 20ms plus overhead.

The distinction to internalise: **`await` inside a loop is sequential. Starting everything first and awaiting the collection is parallel.**

### So why does this project await in a loop?

Look at `src/gemini.js:208-223`:

```js
  for (let start = 0; start < items.length; start += MAX_TITLES_PER_CALL) {
    const slice = items.slice(start, start + MAX_TITLES_PER_CALL);
    const byId = await classifyBatch(slice, model, process.env.GEMINI_API_KEY);
    if (!byId) break; // offline verdicts stand for the rest of the run

    for (let i = 0; i < slice.length; i++) {
      const v = byId.get(i);
      if (!v) continue;
      const target = verdicts[start + i];
      if (target.isTech !== v.isTech) disagreed++;
      target.isTech = v.isTech;
      target.source = 'gemini';
      target.reason = v.reason ?? null;
      refined++;
    }
  }
```

This is exactly the shape described as a mistake. It is not a mistake here. There are four reasons, and they compound.

**Reason one: the batches are already large.** `MAX_TITLES_PER_CALL` is 60, from `src/gemini.js:21`. A run typically produces a few dozen candidate titles, so this loop usually executes *once*. There is nothing to parallelise. The file's own header comment, `src/gemini.js:11-14`, explains the batching decision:

> Titles are sent as ONE batched call rather than one call per job. On a free tier the per-day request count is the scarce resource, and a run with forty candidates should cost one request, not forty.

**Reason two: rate limits.** Gemini's free tier limits requests per minute as well as per day. Firing every batch simultaneously is precisely the traffic shape that earns an HTTP 429. Sequential requests, spaced by the time each one takes, keep you inside the limit without needing any explicit throttling code.

**Reason three — and this is the load-bearing one — the `break`.** Line 211 says: if a batch comes back `null`, stop entirely. `classifyBatch` returns `null` when the quota is exhausted, the key is rejected, the network failed, or the response was unparseable. If your daily quota just ran out, the next four calls are guaranteed to fail too. Sequential execution lets you find out and stop.

**You cannot `break` out of a `Promise.all`.** By the time `Promise.all` tells you one of them rejected, all of them have already been sent. The requests are gone. The quota is spent. Sequential-with-early-exit is not a slower version of parallel; it is a different algorithm with different semantics.

**Reason four: the failure has to be quiet.** When the loop breaks, the function does not throw. It falls through to `src/gemini.js:225-228` and returns the array of verdicts it already had. Those verdicts were filled in at `src/gemini.js:182-194` by the *offline* classifier before Gemini was contacted at all:

```js
  // Offline first, so every item has a verdict no matter what happens next.
  const verdicts = items.map(({ title }) => {
    const r = classifyRole(title, { /* ... */ });
    return {
      isTech: r.verdict === 'tech',
      source: 'offline',
      reason: r.matched ? `matched "${r.matched}"` : 'no vocabulary match',
    };
  });
```

Every job already has an answer. Gemini only *improves* answers. A break mid-loop means "the rest keep their offline verdict", which is a perfectly acceptable outcome. The header comment at `src/gemini.js:5-10` states this as a design rule: there is no path where a job ends up unclassified because an API was unavailable.

The same sequential-with-early-exit shape appears twice more in the same file — `src/gemini.js:255` for description-based classification, and `src/gemini.js:412` for enrichment — for identical reasons. Note that those two use smaller batch sizes: `PER_CALL = 8` at line 254 and `PER_CALL = 6` at line 410, with comments explaining that descriptions run about 3,000 characters each, so a truncated response should cost as little as possible.

### The other deliberate loop

`src/logos.js:108-118` awaits in a loop too:

```js
  let fetched = 0;
  for (const [slug, url] of wanted) {
    const got = (await download(upscale(url))) ?? (await download(url));
    if (!got) {
      log.debug(`No logo for ${slug} — the site will show initials instead.`);
      continue;
    }
    const file = `${slug}.${got.ext}`;
    writeFileSync(join(LOGO_DIR, file), got.bytes);
    have.set(slug, file);
    fetched++;
  }
```

Two awaits worth noticing on line 109. `??` is the **nullish coalescing operator**: it evaluates the left side, and only if that is `null` or `undefined` does it evaluate the right. So the code asks LinkedIn's CDN for an upscaled 200×200 version of the logo (`upscale` at `src/logos.js:58-60` rewrites the URL), and *only if that fails* does it fall back to the original URL. Those two awaits are genuinely sequential — the second depends on the first having failed. `Promise.all` would be wrong here, not merely different.

The outer loop, though, is a real choice. These downloads are independent, and `Promise.all` would work. It is sequential because a run adds at most a handful of new logos, because hammering LinkedIn's CDN with twenty simultaneous requests is exactly the behaviour this project spends `src/human.js` avoiding, and because each iteration does a blocking `writeFileSync` anyway.

### How to decide

Ask three questions:

1. **Are the operations independent?** If B needs A's result, you have no choice; sequential is the only correct answer.
2. **Does an early failure mean the rest are pointless?** If yes, sequential with a `break` saves real resources.
3. **Would firing them all at once be rude, or hit a limit?** Rate limits, connection caps, and open-file limits are all real. Unbounded parallelism is not free.

If all three answers are no, use `Promise.all`. Otherwise, a loop is not a bug.

---

## 10.18 AbortController: cancelling things that are already running

You now know that `Promise.race` lets you stop *waiting*. It does not stop the *work*. The work is the problem: an HTTP request that hangs forever holds a socket, holds memory, and — through the socket handle — keeps the event loop alive, so your process will not exit.

**`AbortController`** is the standard mechanism for actually cancelling. It is not specific to Node; browsers have the same object.

It has two parts. The controller has an `.abort()` method. The controller also has a `.signal` property — an **AbortSignal** — which you pass to whatever operation you want to be cancellable. Calling `abort()` on the controller makes the signal fire, and any operation holding that signal gives up and rejects with an error whose `name` is `'AbortError'`.

This project uses it five times: `src/gemini.js:119`, `src/gemini.js:264`, `src/gemini.js:422`, `src/summarize.js:115`, and `src/logos.js:63`. All five are the same pattern. Here is the first, in full, from `src/gemini.js:119-171`:

```js
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ /* ... prompt and schema ... */ }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const why = res.status === 429 ? 'daily free quota exhausted'
        : res.status === 400 || res.status === 403 ? 'API key rejected'
        : `HTTP ${res.status}`;
      log.warn(`Gemini unavailable (${why}) — using the offline classifier for this run.`);
      return null;
    }

    // ... parse the JSON reply ...
  } catch (err) {
    const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
    log.warn(`Gemini unavailable (${why}) — using the offline classifier for this run.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
```

Walk through it.

**`const controller = new AbortController();`** — create the cancel button.

**`const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);`** — schedule the button to be pressed in 30 seconds (`TIMEOUT_MS` is `30_000`, from `src/gemini.js:20`). Keep the timer's handle, because you will need to cancel *it*.

**`signal: controller.signal`** inside the `fetch` options — this is what connects the button to the request. Without this line the controller would exist and do nothing.

**The `if (!res.ok)` block** — note that a request which *completes* with an error status is a completely different thing from a timeout. `res.ok` is `false` for any status from 400 upward. A 429 means the free quota is spent for the day. A 400 or 403 means the API key was rejected. Each gets its own human-readable phrase, and the function returns `null`, which the caller at `src/gemini.js:211` interprets as "stop, keep the offline verdicts".

**The `catch`** — this is where an aborted request lands. `err.name === 'AbortError'` is how you distinguish "we gave up after 30 seconds" from "DNS failed" or "the connection was refused". Notice `err.message.split('\n')[0]`: Node's network errors often carry multi-line messages, and only the first line is useful in a log.

**The `finally { clearTimeout(timer); }`** — the part beginners omit, and the reason it matters is the event loop.

If the request finishes in two seconds, the 30-second timer is still sitting in the timers phase, still scheduled, and **a pending timer keeps the event loop alive**. Without `clearTimeout`, the process would refuse to exit for up to 28 seconds after all its real work was done. Multiply that across three call sites and a run that should end cleanly hangs around confusing everyone. `finally` guarantees the cleanup happens on every path — success, HTTP error, thrown exception, or abort.

### A shorter modern alternative

Recent versions of Node provide `AbortSignal.timeout(ms)`, which builds the controller and the timer for you, and — importantly — uses a timer that does **not** keep the process alive. The five call sites here could be written:

```js
// Made-up example showing an alternative, not the code in this repository.
const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
```

Shorter, and no `finally` needed. The trade-off is that you lose the controller: you can no longer abort for a reason *other* than time — a user cancelling, a shutdown signal, a related request having already failed. The explicit form in this repository keeps that door open, and makes the mechanism visible to anyone reading the file. Both are defensible. The Bible for this book asks that every choice name its cost; this one costs four extra lines per call site and buys clarity plus future flexibility.

### Where this project deliberately does *not* use it

`web/api/tailor.js:206` calls `fetch` with no signal at all:

```js
    const upstream = await fetch(`${API_BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      // ... no signal ...
    });
```

That is not an oversight, and it is worth understanding. This file is a **serverless function** — Chapter 13, *Serverless and the Tailor Endpoint*, covers this properly. The short version: this code does not run on a machine you own. Vercel starts a container, runs the handler, and *kills the container* when its own time limit expires. The platform is the timeout. Adding a 30-second `AbortController` here would only change the error message the student sees, and only in the window before the platform's own limit. In the watcher, which runs on the author's Mac with no supervisor, the timeout has to be in the code, because nothing else is going to enforce one.

---

## 10.19 Where this project blocks on purpose

The last piece. Node's whole design is about not blocking — and this codebase blocks in several places, deliberately. Knowing why is the difference between following a rule and understanding one.

**The database.** `src/store.js:1`:

```js
import { DatabaseSync } from 'node:sqlite';
```

The class name says it: every query is synchronous and blocks the event loop until it returns. Chapter 14 goes into this. Here, the relevant question is whether that is acceptable, and it is: this is a single-user program that runs twice a day. There are no other requests queued behind a query. The database file is a few megabytes on a local SSD, and queries return in microseconds. There is nobody to starve.

If this were a public web server handling a hundred requests per second, `DatabaseSync` would be an obvious mistake, because every query would freeze every other visitor. The same code is correct in one context and wrong in another. That is what "it depends" actually means.

**Git.** `src/publish.js:133-140`:

```js
function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`git ${args[0]} failed: ${(err.stderr || err.message).toString().split('\n')[0]}`);
  }
}
```

`execFileSync` runs an external program and blocks until it exits. `pushToSite` at `src/publish.js:146` calls it six times in sequence: `status`, `remote`, `add`, `commit`, `rev-parse`, `push`. Each one must finish before the next makes sense — you cannot commit before you add. And this is the very last thing a run does. Blocking here delays nothing, because there is nothing else left to do. Using async child processes would add complexity and buy zero.

**Logging.** `src/logger.js:33`:

```js
    appendFileSync(logFile, `${line}\n`);
```

Blocking, once per log line. The trade-off is honest: an async logger could lose the last few lines if the process died unexpectedly, which is exactly when you most want them. A blocking append guarantees that if the line was logged, it is on disk. For a program that writes a few hundred lines per run, the cost is invisible.

**Contrast with the notification module.** `src/notify.js:1-5` does the opposite:

```js
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from './logger.js';

const exec = promisify(execFile);
```

`promisify` from `node:util` is a small utility that takes an old-style error-first callback function and returns a version that gives you a promise instead. It exists precisely because Node's standard library was designed in the callback era and promises arrived later.

So `exec` is the promise-returning form of `execFile`, and `src/notify.js:41` can write:

```js
    await exec('/usr/bin/osascript', ['-e', script]);
```

That call shows a macOS notification banner. Showing a banner takes a moment, and there is no reason to freeze the process for it — especially since `blockingAlert` at `src/notify.js:70-81` can sit on screen for up to ten minutes and *must* be non-blocking, or nothing else could happen while the dialog was up.

Meanwhile, two lines up in the same file, `src/notify.js:12` uses the blocking form:

```js
    execFileSync('/usr/bin/which', ['terminal-notifier'], { stdio: 'ignore' });
```

Blocking on purpose, because it runs once — the result is cached in `hasTerminalNotifier` at `src/notify.js:7` and never checked again — and because the answer is needed immediately to decide which notification method to use.

One file, both styles, each chosen for a reason. That is what good Node code looks like.

---

## Chapter summary

- JavaScript the language has no ability to read files, open network connections or print to a screen; a **runtime** supplies those, and the browser and Node.js are two different runtimes wrapping the same language.
- Node.js was released in 2009 by Ryan Dahl, at a moment when V8 had made JavaScript fast and when JavaScript's complete lack of a blocking I/O library was an advantage rather than a gap.
- Before Node, the standard server design was one thread per connection, which wastes memory and scheduler time on threads that are merely parked, waiting.
- Node is built from four layers: **V8** (runs the JavaScript), **libuv** (provides the event loop and hides every operating system's different I/O mechanism), the **C++ bindings** that connect them, and a large **standard library** written in JavaScript.
- Starting a Node process means initialising V8 and libuv, resolving and linking the whole ES module graph before any of it runs, evaluating the modules, running your entry file, and only then entering the event loop.
- **Blocking** means a function does not return until the work is done and nothing else can proceed; `await` is not blocking, and any function ending in `Sync` is.
- The **event loop** visits fixed phases in a fixed order — timers, pending callbacks, idle/prepare, poll, check, close callbacks — and sleeps in the poll phase when there is nothing to do, which is why an idle Node process costs no CPU.
- **Microtasks** — the `process.nextTick` queue and then the promise queue — are drained completely after every callback, which makes them powerful and makes recursive microtasks capable of starving the loop forever.
- libuv's **thread pool** (four threads by default) handles file system operations, `dns.lookup`, some `crypto` functions and `zlib`; **network I/O does not use it**, because operating systems already offer non-blocking sockets.
- **Worker threads** give you real parallelism for CPU-bound work, each with its own V8 isolate and event loop; this project has none because everything slow it does is waiting, not computing.
- "Node is single-threaded" is true of *your JavaScript* and false of the *process*, and the practical consequence is that one long synchronous function freezes everything.
- **Promises** replaced callback pyramids: three states (pending, fulfilled, rejected), one-way settlement, chaining with `.then`/`.catch`/`.finally`, and four combinators — `all`, `allSettled`, `race`, `any` — each with a different failure rule.
- **`async`/`await`** is a readable syntax over promises that restores `try`/`catch`, and it is contagious: an awaiting function must be `async`, and so must its callers.
- Awaiting inside a loop is sequential and is often a performance bug, but in `src/gemini.js` it is deliberate: it respects the API's rate limit, and it allows a `break` that a `Promise.all` could never provide.
- **`AbortController`** cancels work that is already running, unlike `Promise.race`, which only stops you waiting for it; every one of the five uses in this project pairs it with a `setTimeout` and a `finally { clearTimeout(...) }`, because a stray timer keeps the process alive.

---

## Key takeaways

Node exists because most server work is waiting, and waiting is the one thing a program should never do on the thread that could be serving somebody else. Everything about the runtime — the event loop, the callbacks, the promises, the awkwardness of `async` spreading through your call graph — is the price paid for that single idea.

There is exactly one thread running your JavaScript, and one function always runs to completion before the next begins. That gives you freedom from an entire universe of concurrency bugs, and it makes any long synchronous function a catastrophe. Both halves of that sentence matter.

`await` in a loop is sequential, and sequential is sometimes the correct answer. Before you replace a loop with `Promise.all`, ask whether the operations are truly independent, whether an early failure makes the rest pointless, and whether the other end would mind being hit all at once. In `src/gemini.js` the answer to all three is no, and the loop stays.

Stopping waiting and stopping work are different things. `Promise.race` does the first. `AbortController` does the second. When you cancel with a timer, clear the timer in a `finally`, or your process will sit there refusing to exit long after it has finished.

---

## Real-life analogy revisited

The mess counter had one server and two hundred hungry students, and the whole chapter is that scene.

The **blocking** server walks into the kitchen with each chit and stands at the stove until the food is ready. He is not lazy and he is not slow. He is simply following a rule that says finish one thing before starting the next, and that rule makes the queue behind him irrelevant to how fast he works.

The **non-blocking** server spikes your chit on the rail and calls the next student. He is the **event loop**. His round of the counter — check the pass, check the rail, check the complaint book, back to the queue — is the loop's phases, in a fixed order, forever. When there is nobody in the queue and nothing on the pass, he sits down and rests, which is the **poll phase** sleeping and costing no CPU at all.

Your token slip is a **promise**. Pending while the food is cooking. Fulfilled when you collect a plate. Rejected when the dal runs out and you are given a reason instead. It settles once and never changes.

The four cooks behind him are the **thread pool**. There are only four, and a fifth from-scratch order waits. But the milk van arriving from outside needs no cook at all — the gate guard rings a bell when it comes. That is **network I/O**, handled by the operating system, never touching the pool. This is why `fetch` in `src/gemini.js` and `readFile` in `web/serve.js` are the same shape in the source and completely different machinery underneath.

The small errands the server does after every single action — hand over change, tear the receipt — are the **microtask queue**, always drained before he moves on. And if one student stood there generating an endless supply of tiny errands, the server would never get back to the counter, and everyone else would starve. That is `process.nextTick` calling itself.

Finally: `Promise.race` in `src/linkedin.js:376` is the server deciding he has waited long enough for table four's order and moving on. The kitchen is still cooking it. `AbortController` in `src/gemini.js:120` is him walking into the kitchen and saying *stop making it* — which is the only version that actually frees a cook.

---

## Frequently asked questions

**Why can't I just use `readFileSync` everywhere? It reads so much better.**

In a command-line script that runs once and exits, you often can, and this project does exactly that in `src/logger.js`, `src/publish.js` and `src/store.js`. The rule is: blocking is fine when nobody is waiting behind you. It becomes a serious bug the moment your program serves more than one thing at a time, because every blocked millisecond is a millisecond stolen from every other visitor. The habit worth building is not "never block" but "know who is behind you in the queue".

**If Node is single-threaded, how is it faster than a multithreaded server?**

It usually is not faster at *computing*. It is better at *waiting*. A thread-per-connection server with ten thousand idle connections spends gigabytes of memory and a lot of scheduler time on threads doing nothing. Node holds the same ten thousand connections as ten thousand entries in a kernel notification list and one sleeping process. For work that is genuinely CPU-heavy, a multithreaded server on eight cores will beat single-threaded Node roughly eightfold, and you should use one.

**What is the actual difference between `await` and `.then`?**

None, mechanically. `await` compiles down to registering the rest of your function as a promise callback. The difference is entirely in readability and in error handling: `await` lets you use ordinary `try`/`catch` and ordinary top-to-bottom control flow, including `if`, `for`, `break` and `return`. Try writing `src/gemini.js:208-223`, with its `break` on failure, as a `.then` chain and you will feel the difference immediately.

**Why does this project use `await` in a `for` loop when everyone says that is slow?**

Because "slow" assumes the operations are independent and that firing them all at once is welcome. Neither holds in `src/gemini.js`. The API has a per-minute rate limit that parallel calls would trip. And line 211's `break` — stop calling a service that has told you your quota is spent — is impossible with `Promise.all`, which has already sent every request by the time it reports a failure. The loop is not a slower version of the parallel code; it is a different, better algorithm for this situation.

**Why does `finally { clearTimeout(timer) }` matter? The request already finished.**

Because a scheduled timer is a reason for Node to stay alive. The event loop exits only when nothing is outstanding, and an uncancelled 30-second timer is outstanding for the full 30 seconds even though nobody will care when it fires. Without the `clearTimeout` in `src/gemini.js:170`, a run that finished in two seconds would sit there for another 28 before the process ended.

**What happens if I forget to `await` an async function?**

The function still runs. You get a promise back that you ignore. Two things go wrong: your code continues immediately, so anything depending on the result sees nothing; and if the promise rejects, nobody is listening, and Node crashes the process with an unhandled rejection. If you genuinely want fire-and-forget, do what `src/guard.js:173` does and attach `.catch(() => {})` explicitly.

**Is `process.nextTick` ever the right tool?**

Rarely, in application code. It exists for library authors who need to guarantee that a callback runs after the current operation but before any I/O — for example, to make sure an event listener attached immediately after creating an object does not miss an event. If you find yourself reaching for it, `setImmediate` is almost always the safer choice, because it yields to the loop instead of jumping the whole queue.

**How would I know if my program is blocking the loop?**

The simplest test is a heartbeat: `setInterval(() => console.log(Date.now()), 100)`. If the gaps between printed numbers stretch to 400ms or 2 seconds, something synchronous is holding the thread. Node also has built-in tools — `--prof` for CPU profiling, and the `perf_hooks` module's event-loop-delay monitor — but the heartbeat catches most real cases in thirty seconds.

---

## Common beginner mistakes

**1. Forgetting `await`, and getting a Promise where you expected a value.**

*What they do:* `const data = fetchJobs();` then `data.length`.
*Why it seems right:* the function looks like it returns data. Its name says so.
*What actually happens:* `data` is a Promise object. `data.length` is `undefined`. Worse, if `fetchJobs` rejects, there is no handler and the process crashes.
*The fix:* `const data = await fetchJobs();`, inside an `async` function. If you see `Promise { <pending> }` in your output, this is what happened.

**2. Using `await` inside `.forEach`.**

*What they do:*
```js
// Made-up example of the mistake.
items.forEach(async (item) => {
  await save(item);
});
console.log('all saved');   // prints immediately, and it is lying
```
*Why it seems right:* it looks exactly like a `for` loop with an `await` in it.
*What actually happens:* `forEach` was designed before promises existed. It calls your function and throws away the returned promise. All the saves start at once and `forEach` returns immediately, so "all saved" prints before anything is saved. Any rejection is unhandled.
*The fix:* use `for (const item of items) { await save(item); }` for sequential, or `await Promise.all(items.map(save))` for parallel. Never `forEach` with `async`.

**3. Assuming `setTimeout(fn, 1000)` runs after exactly one second.**

*What they do:* build timing logic on the assumption that timers are precise.
*Why it seems right:* the argument is in milliseconds and the name says "timeout".
*What actually happens:* the callback runs no *earlier* than 1000ms. If a synchronous function is running when the moment arrives, the timer waits. Under load, delays of hundreds of milliseconds are ordinary.
*The fix:* treat timers as a minimum, never a guarantee. If you need elapsed time, measure it with `Date.now()`, which is what `budget()` at `src/index.js:77-85` does — it compares `Date.now()` against a stored deadline rather than trusting a timer.

**4. Wrapping a callback API in a promise that can never reject.**

*What they do:* write `new Promise((resolve) => { thing.on('done', resolve); })` and stop there.
*Why it seems right:* it works in testing, where nothing fails.
*What actually happens:* if the underlying thing emits `'error'` instead of `'done'`, the promise stays pending forever. The awaiting function never resumes. If nothing else keeps the loop alive, the process exits silently with the work unfinished and no error message anywhere.
*The fix:* handle the error path too — `thing.on('error', reject)` — or make the resolution unconditional. `web/serve.js:38-46` takes the second route deliberately: it resolves with `{}` on a parse failure rather than leaving the promise hanging.

**5. Catching an error and continuing as though nothing happened.**

*What they do:* `try { ... } catch {}` around anything that looks risky.
*Why it seems right:* it makes the crash go away.
*What actually happens:* the program continues with missing or wrong data, and fails later somewhere unrelated and much harder to diagnose.
*The fix:* an empty `catch` needs a written justification, and this project provides one every time — see `src/human.js:111-118`, where a decorative mouse movement once aborted a run that had already collected 51 jobs. If the operation is genuinely optional, swallow the error and say so in a comment. Otherwise, handle it or let it propagate.

**6. Using a worker thread for something that is waiting, not computing.**

*What they do:* move a batch of HTTP requests into `node:worker_threads` to "speed them up".
*Why it seems right:* threads sound like the answer to slowness.
*What actually happens:* it gets slower. Starting a worker costs memory and startup time, messages must be copied between heaps, and the requests were already concurrent on the main loop for free.
*The fix:* use workers only when a CPU profile shows one of *your* functions burning CPU. If the profile shows the process idle while waiting on the network, a worker will not help.

**7. Doing `Promise.all` over a thousand things.**

*What they do:* `await Promise.all(thousandUrls.map(fetch))`.
*Why it seems right:* the parallel version was supposed to be the fast one.
*What actually happens:* a thousand simultaneous connections. You exhaust file descriptors, get rate-limited or blocked by the other end, and memory spikes because a thousand responses are buffering at once.
*The fix:* batch it, as `src/gemini.js:208` and `src/gemini.js:412` do, or use a concurrency limit. Parallelism needs a ceiling.

**8. Believing `await` blocks the whole program.**

*What they do:* avoid `await` in anything performance-sensitive, reaching for callbacks instead.
*Why it seems right:* `await` reads exactly like a blocking call, and you were told blocking is bad.
*What actually happens:* nothing bad — they just wrote uglier code for no reason.
*The fix:* remember which one blocks. `await` suspends *one function* and hands the thread back to the loop. `readFileSync` freezes *the process*. The visual similarity is a trap; the behaviour is opposite.

---

## Interview questions

**1. What is Node.js, and what is it made of?**

Node.js is a JavaScript runtime for outside the browser. It has four parts: V8, Google's engine, which parses and runs the JavaScript and manages memory and garbage collection; libuv, a C library that provides the event loop, timers, file system access, networking and a thread pool, while hiding the differences between `epoll` on Linux, `kqueue` on macOS and IOCP on Windows; a layer of C++ bindings that lets JavaScript call into libuv; and a standard library of built-in modules written mostly in JavaScript, imported with the `node:` prefix. The key idea is that JavaScript itself has no I/O at all, so the runtime supplies every bit of it.

**2. Describe the event loop's phases.**

libuv's loop visits six phases in a fixed order on each lap. **Timers** runs `setTimeout` and `setInterval` callbacks whose time has come. **Pending callbacks** handles a small set of system callbacks deferred from the previous lap, such as certain TCP errors. **Idle and prepare** are internal to libuv. **Poll** is where most time goes: it collects completed I/O events, runs their callbacks, and sleeps there if there is nothing else to do, waking on I/O or on the next timer's deadline. **Check** runs `setImmediate` callbacks. **Close callbacks** runs cleanup for things that have just closed. Then the loop asks whether anything is outstanding and either goes round again or exits, which is why an idle Node process consumes no CPU and why a program with no pending work exits on its own.

**3. What are microtasks, and how can they break your program?**

Microtasks are two queues that are not phases of the loop: the `process.nextTick` queue, and the promise job queue that holds `.then`/`.catch`/`.finally` callbacks and the resumption of `async` functions after an `await`. Both are drained completely after every individual callback, with `nextTick` always drained first. Because they are drained completely and a microtask can schedule another microtask, a function that calls `process.nextTick(itself)` will pin the process at 100% CPU forever: timers never fire, I/O callbacks never run, and there is no depth limit or escape. `setImmediate` avoids this because it queues into the check phase, which is a real phase the loop gets past.

**4. What runs on Node's thread pool, and what does not?**

libuv keeps four threads by default, sized by `UV_THREADPOOL_SIZE`. They handle operations with no non-blocking equivalent at the OS level: most `node:fs` operations, `dns.lookup` (because the underlying `getaddrinfo` call blocks), the expensive `crypto` functions like `pbkdf2` and `scrypt` in async form, and `zlib` compression. Network I/O does **not** use the pool — TCP, HTTP and HTTPS, and therefore `fetch`, are registered directly with the kernel's own notification mechanism, so no thread waits for them. This is the most common misconception: people assume "async means a thread is doing it", and for network work no thread is doing anything.

**5. In what sense is Node single-threaded, and in what sense is that misleading?**

Your JavaScript runs on exactly one thread, with one call stack, and a callback always runs to completion before the next one starts — so shared state needs no locks, and whole classes of race condition cannot occur. But the process is not single-threaded: there are four thread-pool threads, V8's background compiler and garbage-collector threads, and the kernel servicing network operations on nobody's thread. The accurate framing is that Node gives you excellent **concurrency** with no **parallelism** for your own code. The consequence is that any long synchronous function freezes the entire process, which is why CPU-heavy work belongs in a worker thread or a separate process.

**6. Explain the difference between `Promise.all`, `allSettled`, `race` and `any`.**

`Promise.all` waits for every promise to fulfil and gives you an array of results in input order, but rejects as soon as any one rejects — the others keep running and their results are lost. `allSettled` waits for every promise to settle and never rejects; you get an array of `{status, value}` or `{status, reason}` objects, which is right when partial success is acceptable. `race` settles with the first promise to settle, whether that is a fulfilment or a rejection, which makes it useful for timeouts but dangerous if a fast failure can beat a slow success. `any` settles with the first promise to *fulfil*, ignoring rejections, and only rejects if all of them do, with an `AggregateError`.

**7. Why does `src/gemini.js` await inside a `for` loop instead of using `Promise.all`?**

Three reasons. The API has a per-minute rate limit, and firing all batches at once is the traffic shape that earns a 429. The loop contains `if (!byId) break;` — if a batch fails because the daily quota is spent, the remaining calls are certain to fail too, and `Promise.all` cannot help because it has already sent every request by the time it reports the failure. And the batches are already large — 60 titles per call — so a typical run makes one call and there is nothing to parallelise. The loop is not a slow version of the parallel code; it has different failure semantics, and those semantics are the point.

**8. What is `AbortController` for, and why is `clearTimeout` in a `finally` block?**

`AbortController` cancels work that is already in flight. You create a controller, pass its `.signal` to something like `fetch`, and calling `.abort()` makes that operation reject with an error named `AbortError`. This is different from `Promise.race`, which only makes *you* stop waiting while the underlying work continues. The usual pattern pairs it with `setTimeout(() => controller.abort(), ms)` to build a timeout, and the `clearTimeout` must go in a `finally` block because a pending timer keeps Node's event loop alive — otherwise a request that finished in two seconds would keep the process running for the remaining 28.

---

## Exercises

**1. Watch the loop breathe.**

Create a scratch file `scratch/heartbeat.mjs` anywhere outside this project and run it with `node`:

```js
const start = Date.now();
setInterval(() => console.log(Date.now() - start), 100);
```

Let it run for a few seconds. Now add a synchronous busy-wait after the `setInterval` — a `while` loop spinning for two seconds on `Date.now()` — and run it again. Explain the gap you see in the numbers, in terms of the timers phase.

**2. Prove that microtasks starve the loop.**

Write a file that schedules `process.nextTick` recursively and also sets a `setTimeout(..., 0)`. Confirm the timeout never fires. Then change `process.nextTick` to `setImmediate` and confirm the timeout does fire. Write two sentences explaining the difference in terms of queues and phases.

**3. Measure sequential versus parallel, honestly.**

Using `sleep` copied from `src/human.js:33-35`, write a script that awaits five 200ms sleeps in a `for` loop, and another that runs the same five through `Promise.all`. Time both with `Date.now()`. Then answer in writing: which of the three tests in section 10.17 would have to be true before you would convert `src/gemini.js:208` to the parallel form?

**4. Find every await in the orchestrator.**

Open `src/index.js` and list every `await` in `main()` with its line number. For each one, write a few words on what the process is waiting for — a browser action, a network request, a timer, a file. Then answer: which of those, if it hung forever with no timeout, would wedge the run? Compare your answer against the `budget()` helper at `src/index.js:77-85`.

**5. Break a timeout, on purpose, in the real project.**

In a scratch copy of `src/gemini.js`, change `TIMEOUT_MS` at line 20 from `30_000` to `1`. Run `npm run dry-run` with a valid `GEMINI_API_KEY` in `.env`. You should see the log line from `src/gemini.js:167` reporting `timed out`. Then delete the `finally { clearTimeout(timer); }` and set `TIMEOUT_MS` to `30_000` again, and observe how long the process takes to exit after the last log line. Restore the file afterwards.

**6. Add a timeout to the serverless handler, and argue about it.**

In `web/api/tailor.js`, add an `AbortController` with a 25-second timeout to the `fetch` at line 206, following the pattern from `src/gemini.js:119-171`, and return a clear 504 error on `AbortError`. Test it with `npm run web` and a request through `http://localhost:4321`. Then write a short paragraph arguing either that this is an improvement or that section 10.18's reasoning is right and the platform's own timeout is sufficient. There is a defensible answer either way; the argument is the exercise.

**7. Replace the race with something more precise.**

`src/linkedin.js:114-117` uses `Promise.race` with two `.catch(() => false)` wrappers. Rewrite it using `Promise.any` so that "first success" is expressed directly, and handle the `AggregateError` that results when both selectors time out. Then explain, in three sentences, what behaviour changes if the two timeouts are not equal.

**8. 🔴 Turn the logo downloader into a bounded parallel pipeline.**

`src/logos.js:108-118` downloads logos one at a time. Rewrite it to run at most three downloads concurrently — no more — while keeping every existing behaviour: the upscale-then-fallback retry on line 109, the `writeFileSync`, the `have` map, and the `fetched` counter. Do not add an npm dependency; this project has exactly one and Chapter 11 explains why. You will need to write a small concurrency limiter by hand. Then measure a real run against the original and write down whether the added complexity earned its place, given that a typical run downloads a handful of logos.

---

## Quiz

1. What are the two main C/C++ components inside Node.js, and what does each one do?

2. Put these event loop phases in the order libuv visits them: check, timers, close callbacks, poll, pending callbacks.

3. True or false: `await` blocks the event loop.

4. Which of these uses libuv's thread pool?
   a) An HTTPS request made with `fetch`
   b) `readFile` from `node:fs/promises`
   c) A TCP socket receiving data
   d) A `setTimeout` callback

5. In what order do these two queues drain, and when? (a) the promise microtask queue, (b) the `process.nextTick` queue.

6. `Promise.race([a, b])` where `a` rejects after 1 second and `b` fulfils after 2 seconds. What does the race do, and after how long? Which combinator would you use instead if you wanted `b`'s value?

7. Why does `src/gemini.js:170` call `clearTimeout(timer)` inside a `finally` block rather than after the `fetch`?

8. Give one reason `src/gemini.js:208` awaits inside a `for` loop rather than using `Promise.all`, and name the specific line that makes the parallel version impossible.

9. Short answer: what is the difference between `Promise.race` and `AbortController` when you want to give up on a slow HTTP request?

10. This project uses `DatabaseSync` from `node:sqlite`, whose every query blocks the event loop. Give one reason that is acceptable here, and one situation in which it would be a serious bug.

---

## Where this leads

You now know what runs your JavaScript and how it decides what to do next. The next question is where the JavaScript itself comes from: how one file gets to say `import { log } from './logger.js'` and have that mean something, what npm is, and how a project with 8,712 lines of code manages to depend on exactly one package from the internet. That is Chapter 11, *Modules, npm, and the One-Dependency Rule*.

After that, Chapter 12, *Servers From Scratch*, takes the `node:http` module you saw in `web/serve.js:11` and builds a working web server out of it by hand — no Express, no framework — so that the event loop you just learned about stops being theory and starts answering real requests.

---

## Answers

**1.** **V8** is Google's JavaScript engine: it parses and executes JavaScript, compiles hot functions to machine code, and manages memory including garbage collection. **libuv** is a C library providing the event loop, timers, the thread pool, file system access, networking, DNS and child processes, while hiding the differences between `epoll` (Linux), `kqueue` (macOS/BSD) and IOCP (Windows).

**2.** timers → pending callbacks → poll → check → close callbacks. (Idle and prepare sit between pending callbacks and poll, but they are internal to libuv and were not in the list.)

**3.** **False.** `await` suspends the *one function* it is in and hands control back to the event loop, which is free to run everything else. The things that block the loop are functions ending in `Sync` — `readFileSync`, `execFileSync`, `appendFileSync` — and any long-running synchronous calculation.

**4.** **(b)** only. `readFile` goes to the thread pool because most file system calls have no non-blocking form at the OS level. Network I/O (a and c) uses the kernel's own notification mechanism directly on the loop, and timers (d) are handled by the loop's timers phase.

**5.** The `process.nextTick` queue (b) drains first, completely; then the promise microtask queue (a) drains, completely. Both drain after the currently running JavaScript finishes and, in Node 11 and later, after *each individual* callback — not merely between phases. If draining the promise queue adds a `nextTick`, the `nextTick` queue is drained again before the loop proceeds.

**6.** `Promise.race` settles on the first promise to **settle**, regardless of outcome. So it rejects after **1 second**, with `a`'s reason, and `b`'s eventual value is discarded — though `b` keeps running in the background, because `race` does not cancel anything. To get `b`'s value you would use **`Promise.any`**, which ignores rejections and settles with the first fulfilment.

**7.** Because `finally` runs on every exit path — normal return, `return null` from inside the `try`, a thrown exception, or an abort — whereas code placed after the `fetch` would be skipped by any of those. It matters because a pending timer keeps Node's event loop alive: without the `clearTimeout`, a request that succeeded in 2 seconds would leave a 30-second timer scheduled, and the process would refuse to exit for another 28 seconds.

**8.** Any one of: the API's per-minute rate limit, which parallel calls would trip; the fact that batches already hold 60 titles (`src/gemini.js:21`) so a typical run makes only one call; or the ability to stop early. The line that makes the parallel version impossible is **`src/gemini.js:211`** — `if (!byId) break;` — because `Promise.all` has already sent every request by the time it reports a failure, so there is nothing left to skip.

**9.** `Promise.race` makes *you* stop waiting; the request itself keeps running, keeps its socket open, and keeps the event loop alive. `AbortController` makes the *request* stop: passing `controller.signal` to `fetch` and calling `.abort()` tears down the connection and rejects the promise with an `AbortError`. Race is about your patience; abort is about the work.

**10.** Acceptable here because this is a single-user program that runs twice a day: no other request is queued behind a query, the database is a small local file, and queries return in microseconds, so there is nobody to starve. It would be a serious bug in a public web server handling many simultaneous requests, where every synchronous query would freeze every other visitor for its full duration.
