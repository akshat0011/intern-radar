# Chapter 11 — Modules, npm, and the One-Dependency Rule

> By the end of this chapter you will be able to split a program into files that import each other, read any `package.json` line by line, explain what `package-lock.json` protects you from, and defend — or attack — this project's decision to install exactly one library.

**Before this chapter you should have read:** Chapter 1, *What Is Software?*; Chapter 7, *JavaScript: The Muscles*; Chapter 10, *Inside Node.js*.

**New words introduced here:** module, global scope, namespace, name collision, IIFE, CommonJS, `require`, `module.exports`, AMD, bundler, ESM, `import`, `export`, named export, default export, re-export, specifier, bare specifier, module resolution, `node:` prefix, `type: module`, `.mjs`, `.cjs`, dual package, live binding, hoisting, top-level await, dynamic import, circular import, temporal dead zone, package, registry, npm, npm client, `package.json`, semantic versioning, caret range, tilde range, lockfile, integrity hash, `dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`, `engines`, `private`, npm scripts, `npx`, `node_modules`, transitive dependency, dependency tree, vendoring, supply-chain attack, typosquatting, install script, `npm audit`, CVE, headless browser, Chrome DevTools Protocol, CDP, WebDriver, vendor lock-in, NIH syndrome.

---

## 11.1 The problem that modules exist to solve

Start with a program small enough to fit in one file. Fifty lines. You can hold all of it in your head. Nothing in this chapter matters yet.

Now imagine that program grows. Intern Radar's watcher is 8,712 lines across roughly forty files. Suppose all of it were one file called `everything.js`. Three things break, and they break in a specific order.

**First, you cannot find anything.** Scrolling to line 5,400 to fix the stipend parser is miserable. You lose your place. You edit the wrong copy of a similar-looking block.

**Second, names start colliding.** A **name collision** is when two different parts of a program use the same name for different things, and one silently wins. In one file, everything you declare at the top lives in the same **scope** — the region of a program where a name is visible. Write `const clean = ...` near the top for cleaning a job description, then 3,000 lines later write `const clean = ...` for cleaning a company name, and JavaScript either throws an error or, in older styles, quietly overwrites the first one. In a real 8,000-line file this happens constantly. `log`, `parse`, `format`, `state`, `config`, `url` — every programmer reaches for the same short words.

**Third, you cannot test or reuse a piece on its own.** This project has a file `test/tailor.test.mjs` whose first line is:

```js
import { findInventedSkills } from '../web/api/tailor.js';
```

That is `test/tailor.test.mjs:1`. It reaches into the résumé-tailoring code and pulls out one function to test it in isolation. If the tailoring endpoint were glued into one enormous file with everything else, that test could not exist without dragging in a web server, an API key, and a browser.

A **module** is a file that keeps its own names to itself and publishes, on purpose, only the names it wants others to use. That is the whole idea. Everything else in the first half of this chapter is the history of programmers arguing about the syntax for it.

> **Analogy — the shared hostel register versus your own notebook.** Imagine one register kept on a table in the hostel common room, in which everyone writes their notes. Two students both write "Room 12 — key returned" on different days about different keys, and by the end of term nobody can tell which entry means what. Now imagine each student keeps a private notebook, and pins to the common notice board only the specific lines the rest of the hostel needs: "Anjali — mess coupon booth, 6pm". The private notebook is a module's internal scope. The notice board is its exports. The register is the **global scope** — the single shared namespace where everything written by anyone is visible to everyone.

---

## 11.2 The before: script tags and global variables

JavaScript was designed in 1995 in about ten days, for adding small effects to web pages. It had no modules. It did not need them; nobody was writing 8,000 lines of it.

For roughly the first fifteen years of the web, "using someone else's code" meant this, in your HTML:

```html
<!-- This is a made-up example to show the idea, not from the project. -->
<script src="jquery.js"></script>
<script src="carousel.js"></script>
<script src="my-page.js"></script>
```

The browser fetches each file in order and runs it. Every `var` and every `function` declared at the top level of any of those files lands in the same place: a single object the browser calls `window`. That is the **global scope**. `jquery.js` puts a variable called `$` on it. `carousel.js` reads `$` and puts `Carousel` on it. `my-page.js` reads both.

This "works" the way a shared register works. The failure modes are exactly what you would guess:

- **Order matters, invisibly.** Swap two `<script>` lines and `carousel.js` runs before `$` exists. You get `$ is not defined`, and nothing tells you the cause is line order in a file you were not looking at.
- **Collisions are silent.** Two libraries both define `$`. The second one wins. The first library's users get bizarre errors that look like bugs in their own code.
- **No file states its needs.** Nothing in `carousel.js` says "I require jQuery". You find out by breaking it.
- **Everything is public.** A helper function that was meant to be internal is reachable, and therefore someone somewhere starts depending on it, and now you can never change it.

Programmers noticed. The first fix used a feature JavaScript already had — functions make a new scope — and abused it.

```js
// This is a made-up example to show the idea, not from the project.
var Carousel = (function () {
  var slideCount = 0;           // private: nothing outside can see this
  function nextSlide() { slideCount++; }
  return { next: nextSlide };   // public: the one thing we hand out
})();
```

That pattern is an **IIFE** — an *immediately invoked function expression*, a function that is defined and called in the same breath, purely to create a private scope. Read it inside out: `function () { ... }` makes a function, the wrapping parentheses make it an expression, the final `()` calls it right now, and the result is assigned to `Carousel`. `slideCount` lives inside and is unreachable from outside. Only `next` escapes.

The IIFE solved privacy. It did not solve ordering, and it did not solve "state your dependencies". You still had one global name per library, and you still had to load the `<script>` tags in the right order by hand.

---

## 11.3 CommonJS: the first real module system

In 2009, JavaScript moved to the server. Node.js needed something better than global variables, because a server program has no HTML file to list `<script>` tags in.

Node adopted a design called **CommonJS** — a module convention where a file loads another file by calling `require()` and publishes values by assigning to `module.exports`.

```js
// This is a made-up example to show the idea, not from the project.

// maths.js
function add(a, b) { return a + b; }
const PI = 3.14159;
module.exports = { add, PI };

// app.js
const maths = require('./maths.js');
console.log(maths.add(2, 3));
```

Read it in two halves.

`maths.js` declares `add` and `PI`. Those names are private to the file — this is the key change from `<script>` tags. Node wraps every CommonJS file in an invisible function before running it, which is the IIFE trick done automatically for you. The last line assigns an object to `module.exports`, which is the file's notice board.

`app.js` calls `require('./maths.js')`. Node finds that file, runs it if it has not run already, and hands back whatever `module.exports` ended up holding.

Three properties of `require` matter, and two of them will bite you later:

1. **It is synchronous.** `require` reads the file from disk and runs it before the next line of your code executes. On a server, reading a file from a local disk takes microseconds, so this is fine. In a browser, where the file might be on a server in Singapore, it is not fine at all.
2. **It is cached.** Require the same file from ten places and it runs once. The other nine get the same object back. This is usually what you want and occasionally a source of deep confusion.
3. **It happens at run time, not before.** `require('./' + name + '.js')` is legal. A tool reading your code cannot always tell what you will load, which makes automatic analysis hard.

CommonJS is why Node could have a package ecosystem at all. It is still everywhere — millions of packages published to this day are CommonJS. This project does not write any CommonJS itself, but it *uses* some, as you will see in §11.6, and knowing what `require` is stops that being mysterious.

---

## 11.4 AMD and bundlers: the browser's decade of workarounds

Browser programmers wanted Node's module system. They could not have it, because `require` is synchronous and the browser cannot pause everything to fetch a file over the network.

Two answers appeared.

**AMD** — *Asynchronous Module Definition* — kept the idea but flipped it inside out. You declare your dependencies up front in an array, and pass a function that runs once they have all arrived:

```js
// This is a made-up example to show the idea, not from the project.
define(['jquery', 'carousel'], function ($, Carousel) {
  // runs only after both files have downloaded
});
```

The most-used AMD loader was RequireJS. It worked. It was also verbose, and it meant your source code looked different depending on whether it targeted the server or the browser. People wrote a hybrid pattern called UMD that tried to satisfy CommonJS *and* AMD *and* plain globals in one file, and it was as ugly as that sentence.

**Bundlers** took the other route. A **bundler** is a program that reads your entry file, follows every `require` at build time, and glues the whole graph into one big file the browser can load with a single `<script>` tag. Browserify did this from 2011, webpack from 2012, Rollup from 2015. Bundlers won, decisively, and they are why "run a build step before you deploy a website" became normal.

It is worth stopping on that, because Intern Radar deliberately does not do it. As Chapter 9, *Frameworks, React, and the Road Not Taken*, explains, this site has **no build step**: the file you edit at `web/public/app.js` is byte-for-byte the file the browser downloads. Bundlers exist to solve problems this project does not have — hundreds of small modules, dozens of npm packages in the browser, and code written in syntax browsers do not understand. Remove those problems and the bundler is machinery with nothing to do.

---

## 11.5 ESM: modules become part of the language

In June 2015 the JavaScript standard itself finally grew modules. The feature is called **ESM** — *ECMAScript Modules* — and it is the `import` / `export` syntax you will use for the rest of your career.

Here is real code from this project, `src/logger.js:39-45`:

```js
export const log = {
  debug: (m) => write('debug', m),
  info: (m) => write('info', m),
  ok: (m) => write('ok', m),
  warn: (m) => write('warn', m),
  error: (m) => write('error', m),
```

And here is a real import of it, `src/browser.js:1-6`:

```js
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { PATHS } from './paths.js';
import { log } from './logger.js';
```

Six lines, and every kind of import this project uses is in them. Take them one at a time.

- Lines 1–3 import from **built-in modules** — code that ships inside Node itself. `node:fs` is the filesystem, `node:path` joins and splits file paths, `node:child_process` runs other programs. The `node:` prefix is explained in §11.9.
- Line 4 imports from a **package** — third-party code installed from the internet into `node_modules`. This is the *only* line in the entire project that imports a third-party package. You can verify that yourself with one command; §11.17 does.
- Lines 5–6 import from the project's own files, by relative path.

The curly braces mean these are **named exports** — values exported under a specific name, imported by that same name. The names must match. `import { chromium }` works because `playwright-core` exports something called exactly `chromium`.

What ESM changed compared to `require`:

**It is static.** `import` declarations must be at the top level of a file, with a string literal. You cannot write `import x from './' + name`. That restriction feels annoying for about a week and then pays for itself forever, because now a tool — your editor, a bundler, Node itself — can know the full module graph without running your program.

**Imports are live bindings, not copies.** A **live binding** means the imported name points at the exporting module's variable, not at a snapshot of its value. If the exporter later reassigns it, you see the new value. With CommonJS you got whatever the object held at the moment you required it.

**Imports are hoisted.** **Hoisting** means the declaration is processed before the rest of the file runs. All of a module's imports are resolved and its dependencies executed *before* the first line of its own body runs. That is why `import` cannot be conditional.

**Top-level `await` is allowed.** A **top-level await** is `await` used outside any `async` function, straight in the body of a module. This is genuinely useful and it is real in this project. `bin/login.js:23` reads:

```js
const session = await launchBrave(cfg, { forLogin: true });
```

There is no wrapping `async function main()`. That line sits at the top level of the file. In CommonJS this is a syntax error, full stop. In ESM it works, because module evaluation is already asynchronous under the hood.

---

## 11.6 Named exports, default exports, and when to use which

There are two kinds of export and the difference trips up beginners constantly.

A **named export** attaches a name to a value. A file can have as many as it likes.

```js
export function findInventedSkills(resumeText, skills) { /* ... */ }
```

That is `web/api/tailor.js:156`. It is imported by name at `test/tailor.test.mjs:1`.

A **default export** is the one unnamed thing a file is "mainly about". A file can have at most one.

```js
export default async function handler(req, res) {
```

That is `web/api/tailor.js:174`. Note that this single file has both: a named export used by the test, and a default export that is the actual request handler.

Why a default at all? Because someone else's tooling requires it. Vercel — the hosting platform, covered in Chapter 13, *Serverless and the Tailor Endpoint* — takes any file in an `api/` folder and runs its default export as a function that answers HTTP requests. Vercel does not know or care what you named your function. It asks for the default.

And when this project runs the same file locally, it has to ask for the default explicitly. `web/serve.js:64`:

```js
const { default: handler } = await import('./api/tailor.js');
```

Read that carefully, because it is dense. `await import(...)` is a **dynamic import** — the function form of `import`, which loads a module while the program is running and returns a promise for its exports. The result is an object whose keys are the export names, and the default export sits under the literal key `default`. The `{ default: handler }` part is destructuring with a rename: "take the property called `default` and call it `handler` here". You cannot just write `const default = ...` because `default` is a reserved word.

There is one more form you will meet, though this project does not use it — the **re-export**, `export { thing } from './other.js'`, which passes a name straight through without importing it into the current file. It is how a library builds one public entry point out of many internal files.

**Which should you use?** The honest answer is that named exports are safer and defaults are convenient. With named exports, a typo is caught: `import { calcuateTotal }` fails loudly if the real export is `calculateTotal`. With a default export, the importer chooses the name, so nothing can be checked, and two files can call the same thing by two different names. This project's own habit is worth copying: named exports everywhere, a default only where an external system demands one.

---

## 11.7 How Node finds a module: the resolution algorithm

You write a string inside `import ... from '...'`. That string is called a **specifier**. Turning it into a real file on disk is called **module resolution**, and it follows rules you should know, because "cannot find module" is one of the errors you will see most often in your life.

There are three kinds of specifier.

**1. A `node:` specifier, like `'node:fs'`.** Node stops immediately: this is a built-in module, compiled into the Node binary. No disk is touched. Nothing in `node_modules` can shadow it.

**2. A relative or absolute specifier, like `'./paths.js'` or `'../src/store.js'`.** Node resolves it as a path relative to the file doing the importing, and opens that exact file. Two rules surprise everyone arriving from CommonJS:

- **The file extension is mandatory.** `import { PATHS } from './paths'` fails. It must be `'./paths.js'`. Look back at `src/browser.js:5` — the `.js` is there. In CommonJS, `require('./paths')` would have tried `./paths.js`, `./paths.json`, `./paths.node` in turn. ESM does not guess.
- **There is no automatic `index.js`.** `import './utils'` will not find `./utils/index.js`. You must say so.

Both rules exist for the same reason: guessing costs filesystem lookups, and the browser's module loader — which uses the same syntax — cannot guess at all over a network.

**3. A bare specifier, like `'playwright-core'`.** A **bare specifier** is one that starts with neither a dot nor a slash. This is the interesting case. Node does this:

1. Look for `node_modules/playwright-core` in the directory containing the importing file.
2. If it is not there, go up one directory and look again.
3. Keep going up until you reach the filesystem root.
4. Take the first match. If none, throw `ERR_MODULE_NOT_FOUND`.

`src/browser.js` lives in `<project>/src/`. Node looks for `<project>/src/node_modules/playwright-core` — not there — then `<project>/node_modules/playwright-core` — found. Done.

That climbing behaviour is why a package installed once at the project root is visible to every file in every subfolder, and why you can accidentally use a package you never installed, because a parent directory happened to have one.

**Then comes the second half of resolution**, which almost no tutorial explains: finding the file *inside* the package. Node opens the package's own `package.json` and reads its `exports` field. Here is the real one, from `node_modules/playwright-core/package.json`:

```json
"exports": {
  ".": {
    "types": "./index.d.ts",
    "import": "./index.mjs",
    "require": "./index.js",
    "default": "./index.js"
  },
  "./package.json": "./package.json",
  "./lib/bootstrap": "./lib/bootstrap.js",
  "./lib/coreBundle": "./lib/coreBundle.js",
  "./lib/utilsBundle": "./lib/utilsBundle.js",
  "./lib/tools/cli-client/program": "./lib/tools/cli-client/program.js"
}
```

Line by line:

- `"."` means the package itself — the specifier `'playwright-core'` with nothing after it.
- Inside it is a set of **conditions**. `"import"` is used when the importer used ESM `import`. `"require"` is used when the importer used CommonJS `require`. `"types"` is for TypeScript, which this project does not use. `"default"` is the fallback.
- The remaining keys are **subpath exports**: `import 'playwright-core/lib/bootstrap'` maps to a specific file. Anything not listed here cannot be imported at all, even if the file physically exists. `exports` is a fence, not just a map.

So `import { chromium } from 'playwright-core'` in `src/browser.js` lands on `node_modules/playwright-core/index.mjs`. And that file — 12 lines of real code plus a licence header — is worth seeing, because it is the neatest illustration of CommonJS/ESM interop you will find:

```js
import playwright from './index.js';

export const chromium = playwright.chromium;
export const firefox = playwright.firefox;
export const webkit = playwright.webkit;
export const selectors = playwright.selectors;
export const devices = playwright.devices;
export const errors = playwright.errors;
export const request = playwright.request;
export const _electron = playwright._electron;
export const _android = playwright._android;
export default playwright;
```

`./index.js` is CommonJS — its last line is `module.exports = require('./lib/coreBundle').inprocess.playwright;`. When ESM imports a CommonJS file, the whole `module.exports` object arrives as the default export, and nothing else. So this little `.mjs` file receives that object and hand-writes a named export for each property. That is how a package built in CommonJS gives ESM users clean named imports. A package shipping both shapes like this is called a **dual package**.

---

## 11.8 `"type": "module"`, `.mjs`, and `.cjs`

Here is the confusion everyone hits. A file ending in `.js` could be CommonJS or ESM. They have incompatible syntax. Node must decide which one it is *before* parsing the file. How?

Node walks up from the file, finds the nearest `package.json`, and reads its `type` field.

- `"type": "module"` → every `.js` file under it is ESM.
- `"type": "commonjs"`, or no `type` field at all → every `.js` file under it is CommonJS.

This project's root `package.json:7` says:

```json
"type": "module",
```

One line. It is the reason every file in `src/`, `bin/` and `web/` can use `import`. Remove it and the project does not start — you get `SyntaxError: Cannot use import statement outside a module` on the very first file.

Turning it on changes five things:

1. `import`/`export` work; `require` and `module.exports` do not exist.
2. `__dirname` and `__filename` — the CommonJS variables holding the current file's folder and full path — do not exist either. §11.10 shows what this project uses instead.
3. Top-level `await` becomes legal.
4. The file is in strict mode automatically.
5. Importing a JSON file needs an extra clause — `import data from './x.json' with { type: 'json' }` — which is newer and was experimental for a long time. This project sidesteps it entirely. `src/config.js:1` imports `readFileSync` from `node:fs` and parses the config by hand. Chapter 20, *Every Configuration File*, covers what it does with the result.

The extensions `.mjs` and `.cjs` exist to override all of that. `.mjs` is **always** ESM. `.cjs` is **always** CommonJS. Neither one consults any `package.json`. They are the escape hatch for when the surrounding folder has the wrong `type`, or when you want a file to be unambiguous no matter where it is copied.

This project's three test files use `.mjs`:

```
test/extract.test.mjs
test/roles.test.mjs
test/tailor.test.mjs
```

Under `"type": "module"` they would have been ESM as plain `.js` anyway. The `.mjs` is belt-and-braces: those files are run directly by `node test/extract.test.mjs`, and the extension guarantees the answer regardless of what any config says.

There is one more real `package.json` in this repository, at `web/package.json`, and it is worth reading in full because it does something clever:

```json
{
  "name": "intern-radar-web",
  "version": "1.0.0",
  "description": "Public site for the internship watcher: browse listings and tailor a resume to any of them.",
  "author": "akshat0011",
  "license": "MIT",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  }
}
```

Notice what is *not* there: any `dependencies` key at all. The site installs nothing. This file exists mainly to tell Vercel two facts — treat `.js` here as ESM, and this needs Node 20 or newer — because Vercel builds the `web/` folder on its own machines and never sees the root `package.json` at all.

---

## 11.9 The `node:` prefix

Every built-in import in this project is written with a prefix:

```js
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
```

Those are `web/serve.js:11`, `web/serve.js:12`, and `src/store.js:1`. Across the whole project the built-ins used are, by frequency: `node:path` (14 imports), `node:fs` (9), `node:child_process` (3), `node:url` (2), and one each of `node:util`, `node:sqlite`, `node:os`, `node:http` and `node:fs/promises`.

The plain form `'http'` still works. So why the prefix?

**It removes ambiguity.** Without the prefix, `import 'http'` first checks whether Node has a built-in called `http` — it does — but the rule is subtle and has shifted over the years, and any package published to npm under a name like `sqlite` sits one typo away from being loaded instead. With `node:`, Node never touches the filesystem. There is no package on earth that can shadow `node:fs`.

**It is self-documenting.** Reading `src/browser.js:1-6` you can tell at a glance which imports are Node itself, which are third-party, and which are this project's own files. Three visually distinct shapes, no memorisation.

**Some modules require it.** `node:test` and `node:sqlite` are only available with the prefix.

Make it a habit. It costs five characters and removes a class of problem.

---

## 11.10 What replaces `__dirname`

In CommonJS, `__dirname` gave you the folder containing the current file. In ESM it does not exist, and this catches everyone once. There are two replacements, and this project uses both, which is a small inconsistency worth noticing.

The portable, long-standing form is at `src/paths.js:1-6`:

```js
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
```

`import.meta` is an object Node gives every module about itself. `import.meta.url` is the module's own location as a URL string, like `file:///Users/.../app/src/paths.js`. `fileURLToPath` converts that URL into an ordinary path. The first `dirname` strips the filename, leaving `.../app/src`. The second strips one more level, leaving `.../app`. So `ROOT` is the project folder, computed from where this file physically sits rather than from where you happened to run the command. That distinction matters enormously here, because as Chapter 21, *Deployment, Scheduling, and Operations*, explains, macOS's scheduler launches this program from an unpredictable working directory.

The newer, shorter form is at `bin/enrich.js:23`:

```js
const ROOT = join(import.meta.dirname, '..');
```

`import.meta.dirname` is simply the folder, no conversion needed. It is a more recent addition to Node. Both are correct; the older form works on every version, the newer form is easier to read.

`web/serve.js:17-18` uses the older form too, and shows why you want it:

```js
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'public');
```

The dev server serves files out of `web/public`, located relative to the server file itself. Run `node web/serve.js` from anywhere on your machine and it still finds the right folder.

---

## 11.11 Circular imports

A **circular import** is when module A imports module B and module B imports module A, directly or through a chain. It is legal. It is also a reliable source of errors that make no sense.

Here is the shape, made up to show the idea, not from the project:

```js
// a.js
import { helperB } from './b.js';
export const nameA = 'A';
export function helperA() { return helperB(); }

// b.js
import { nameA } from './a.js';
export function helperB() { return `hello from ${nameA}`; }
```

Now run `node a.js`. Node starts `a.js`, sees the import of `b.js`, and pauses to run `b.js` first. `b.js` imports from `a.js`, which is already in progress, so Node does not re-run it — it hands back what exists so far. But `a.js` has not executed a single line of its own body yet, so `nameA` has been declared and not yet assigned. If `b.js` tries to *use* `nameA` at the top level right then, you get `ReferenceError: Cannot access 'nameA' before initialization`. That state — declared but not yet assigned — is called the **temporal dead zone**.

In the example above nothing breaks, because `nameA` is only read *inside* `helperB`, and by the time anyone calls `helperB` both modules have finished. That is the general escape: circular imports are survivable when the cycle is only used inside functions called later, and fatal when the cycle is used at module top level.

CommonJS fails differently: `require` on a partly-loaded module returns whatever `module.exports` holds at that instant, which is usually an empty object. You get `undefined is not a function` instead of a clear error. ESM's failure is at least honest.

**How this project avoids the problem entirely.** Look at the import graph. `src/paths.js` imports only built-ins. `src/logger.js` imports built-ins plus `paths.js`. Everything else imports `logger.js`. Nothing imports "upward". The graph has a layered shape — a strict one-way flow from leaves to orchestrator — and cycles are impossible by construction. `src/index.js` sits at the top and imports seventeen other modules; not one of them imports `index.js`.

That is not luck; it is the standard fix. When two modules genuinely need each other, the answer is almost always to pull the shared thing out into a third module that both import. Here, the shared thing was "where are the files?" and "how do I print a line?", and they became `paths.js` and `logger.js`.

---

## 11.12 What npm actually is

You now know how to split code into files and load them. The next question is how you get code that *someone else* wrote.

**npm** is three things wearing one name, and separating them clears up a lot.

1. **The registry** — a public server at `registry.npmjs.org` holding compressed archives of published JavaScript packages, along with their metadata. Well over two million packages. Free to publish to, free to download from.
2. **The client** — the `npm` command that comes with Node.js. It reads your `package.json`, talks to the registry, and puts files in `node_modules`. On the machine this book was written on, `node -v` reports v24.10.0 and `npm -v` reports 11.6.0.
3. **The company/organisation** running the registry. npm, Inc. was acquired by GitHub in 2020, which is owned by Microsoft. Worth knowing: one company operates the plumbing under most of the world's JavaScript.

A **package** is a folder with a `package.json` in it. That is the entire definition. Publish it and it becomes something anyone can install.

**What came before.** Until 2010 there was no npm. Installing a JavaScript library meant visiting a website, downloading a `.zip`, unzipping it, copying a `.js` file into your project, and adding a `<script>` tag. Upgrading meant doing it again and hoping nothing changed. There was no way to say "I depend on version 2 of this" other than a note in your README. Perl had CPAN from 1995 and Python had PyPI from 2003; JavaScript got its turn in January 2010, when Isaac Z. Schlueter released npm.

> **Analogy — the college store room.** Your department has a store room full of equipment. To borrow something you fill in a requisition slip listing what you need and which version. The storekeeper issues the items, notes the exact serial numbers in a ledger, and you carry them to your own shelf. `package.json` is your slip. The registry is the store room. The ledger with serial numbers is `package-lock.json`. Your shelf is `node_modules`. And — this is the part that matters later — some of the equipment you borrow contains parts that were themselves borrowed from somewhere else, and the slip does not mention them.

---

## 11.13 `package.json`, field by field

Here is this project's root `package.json` in full. Twenty-six lines. Read it once, then read the explanation of each field.

```json
{
  "name": "linkedin-internship-watcher",
  "version": "1.0.0",
  "description": "Watches LinkedIn for new internships at a watchlist of companies, twice daily, and reports them.",
  "author": "akshat0011",
  "license": "MIT",
  "type": "module",
  "private": true,
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "login": "node --no-warnings=ExperimentalWarning bin/login.js",
    "start": "node --no-warnings=ExperimentalWarning src/index.js",
    "dry-run": "node --no-warnings=ExperimentalWarning src/index.js --dry-run",
    "report": "node --no-warnings=ExperimentalWarning bin/show-report.js",
    "enrich": "node --no-warnings=ExperimentalWarning bin/enrich.js",
    "test": "node test/extract.test.mjs && node test/roles.test.mjs && node test/tailor.test.mjs",
    "web": "node web/serve.js",
    "install-schedule": "bash bin/install-schedule.sh",
    "uninstall-schedule": "bash bin/uninstall-schedule.sh"
  },
  "dependencies": {
    "playwright-core": "^1.56.0"
  }
}
```

**`name`** — the package's identifier. If you published to the registry this would have to be globally unique. Lowercase, no spaces.

**`version`** — the package's own version, in the three-number format explained in §11.14.

**`description`**, **`author`**, **`license`** — metadata. `MIT` is a permissive licence: anyone may use, modify and sell this code provided they keep the copyright notice. The full text is in `LICENSE` at the project root.

**`type": "module"`** — discussed at length in §11.8. Every `.js` file in this project is ESM because of this line.

**`private": true`** — a safety catch. With this set, `npm publish` refuses to run. It is impossible to accidentally push this code, including any secrets that crept into it, to the public registry. Set it on anything that is an application rather than a library. `web/package.json` sets it too.

**`engines`** — a declaration of which Node versions this works on. `">=22"` is not decorative here. This project stores data in SQLite through `node:sqlite`, a module that did not exist before Node 22. On Node 20, `src/store.js:1` fails at import. The field makes that requirement machine-readable: npm warns, and hosting platforms use it to pick a runtime. Note `web/package.json` says `">=20"` instead — the serverless function does not touch SQLite, so it can run on an older, more widely available runtime.

**`scripts`** — named shell commands, covered in §11.16.

**`dependencies`** — the entire third-party surface of this program. One entry. §11.17 is about that entry.

Fields you will meet elsewhere but which are absent here, and why: `main` and `exports` describe what a *library* hands to its importers, and this is an application nobody imports; `bin` declares command-line executables to install, and this project's commands are run through `npm run` instead; `devDependencies` is covered in §11.15 and is empty here for a reason; `repository`, `keywords` and `homepage` are for registry listings, which `private: true` rules out.

---

## 11.14 Semantic versioning, and what `^` really means

Look again at the dependency line:

```json
"playwright-core": "^1.56.0"
```

Two parts: a package name and a **range**. To read the range you first need the version format.

**Semantic versioning** — usually shortened to semver — is an agreement that a version number has three parts, `MAJOR.MINOR.PATCH`, and that each one means something specific:

- **PATCH** (the last number) goes up for a bug fix that changes no behaviour you were relying on. `1.56.0` → `1.56.1`.
- **MINOR** (the middle) goes up when something is *added* but everything old still works. `1.56.0` → `1.57.0`.
- **MAJOR** (the first) goes up when something old *stops* working. `1.56.0` → `2.0.0`. Upgrading may break your code.

It is a promise made by the package author, not a law of physics. Authors break it, sometimes by accident. But the whole ecosystem is built on it.

Now the range symbols:

| Range | Means | Matches |
|---|---|---|
| `1.56.0` | exactly this | only 1.56.0 |
| `^1.56.0` | caret: any version that promises compatibility | ≥1.56.0 and <2.0.0 |
| `~1.56.0` | tilde: patches only | ≥1.56.0 and <1.57.0 |
| `>=1.56.0` | this or anything newer | 1.56.0 upward, forever |
| `*` or `latest` | anything | whatever is newest today |

`^` is npm's default: type `npm install playwright-core` and you get a caret range written into your `package.json` automatically.

Here is the concrete proof of what that means, in this repository. `package.json` asks for `^1.56.0`. But `package-lock.json:18` records what is actually installed:

```json
"node_modules/playwright-core": {
  "version": "1.62.0",
```

Version **1.62.0**. Six minor versions past what was written down. Nobody edited `package.json`; the caret allowed it, and at some point an install picked up a newer release. That is the caret doing exactly its job: bug fixes and new features arrive without you asking, and the major-version wall stops anything that would break you.

One special case that catches people: for versions below 1.0.0, the caret behaves like a tilde. `^0.2.3` means ≥0.2.3 and <0.3.0, not <1.0.0. The reasoning is that pre-1.0 packages break things in minor releases all the time, so semver treats the *minor* number as the breaking one until you reach 1.0.

**Which should you choose?** The caret is a reasonable default for most projects, because you want security patches without manual work. Exact pins give you perfect reproducibility but mean you must upgrade by hand forever. In practice the lockfile — next section — gives you reproducibility anyway, which is why the caret is safe to use.

---

## 11.15 `package-lock.json`, and why it is committed

Here is a problem the caret creates. You write `^1.56.0`. You install today and get 1.56.0. Your friend clones the project next month and gets 1.62.0. Your code works, theirs crashes, and the difference is invisible in every file either of you can see.

The fix is a **lockfile** — a machine-generated record of the exact version of every package that was actually installed, including packages you never asked for. npm's is `package-lock.json`. This project's is 31 lines, so you can see all of it:

```json
{
  "name": "linkedin-internship-watcher",
  "version": "1.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "linkedin-internship-watcher",
      "version": "1.0.0",
      "dependencies": {
        "playwright-core": "^1.56.0"
      },
      "engines": {
        "node": ">=22"
      }
    },
    "node_modules/playwright-core": {
      "version": "1.62.0",
      "resolved": "https://registry.npmjs.org/playwright-core/-/playwright-core-1.62.0.tgz",
      "integrity": "sha512-nsNRyq0r2zsG8AcRHWknc9QRA5XCueC7gWMrs+Gx2tlZn9hcl8zudfh00lhJPY1DE7NmZ6bDsT9g2yey8mXljA==",
      "license": "Apache-2.0",
      "bin": {
        "playwright-core": "cli.js"
      },
      "engines": {
        "node": ">=20"
      }
    }
  }
}
```

Field by field on the interesting entry:

- **`"version": "1.62.0"`** — the exact version, no range. This is the number that matters.
- **`"resolved"`** — the precise URL the archive came from. Not "some registry", *that* file.
- **`"integrity"`** — an **integrity hash**: a fingerprint of the file's contents. `sha512-` says which algorithm; the rest is the fingerprint in base64. On every install npm downloads the archive, computes its fingerprint, and compares. If a single byte differs — corrupted download, tampered mirror, malicious replacement — the install fails instead of running. This one line is the strongest security feature in the whole npm system.
- **`"license"`** and **`"engines"`** — copied from the package for convenience.
- **`"bin"`** — the package ships an executable called `playwright-core`, which is why `node_modules/.bin/playwright-core` exists as a symbolic link to `../playwright-core/cli.js`.
- **`"lockfileVersion": 3`** — the format version. 3 is what npm 7 and later write.

**This file must be committed to git.** Check that it is, in this repository:

```
$ git ls-files --error-unmatch package-lock.json
package-lock.json
```

It is tracked. `node_modules/` is not — the first line of `.gitignore` excludes it. That combination is the correct one, and the reasoning is worth stating plainly:

- **Commit the lockfile** because it is small text, it is the only record of what actually ran, and without it two people on the same commit can have different programs.
- **Ignore `node_modules`** because it is large, machine-generated, and fully reconstructible from the lockfile.

The command that uses the lockfile properly is `npm ci` — "clean install". It deletes `node_modules`, installs exactly what the lockfile says, and refuses to run at all if `package.json` and the lockfile disagree. Plain `npm install` may *update* the lockfile. Use `npm ci` on any machine that is building or deploying; use `npm install` when you are deliberately adding or changing a dependency.

A lockfile conflict in git looks frightening the first time — hundreds of lines of merge markers. Do not hand-edit it. Take either side, then run `npm install` and let npm regenerate a correct one.

---

## 11.16 `dependencies`, `devDependencies`, `peerDependencies`

npm sorts your requirements into buckets, and the bucket decides who installs what.

**`dependencies`** — needed to *run* the program. Anyone who installs your package gets these. Intern Radar has exactly one.

**`devDependencies`** — needed only to *develop* the program: test runners, linters, type checkers, bundlers. They install on your machine and are skipped when someone installs your package as a library, or when you run `npm install --omit=dev` on a production server. The point is to keep the deployed footprint small.

This project's `package.json` has no `devDependencies` field at all. That is unusual enough to deserve an explanation, and the explanation is in the `scripts` block:

```json
"test": "node test/extract.test.mjs && node test/roles.test.mjs && node test/tailor.test.mjs",
```

There is no Jest, no Vitest, no Mocha. Each test file is a plain program you run with `node`. `test/tailor.test.mjs` builds its own five-line assertion helper:

```js
let pass = 0, fail = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n         got:  ${a}\n         want: ${e}`); }
}
```

and ends with:

```js
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
```

`process.exit(1)` on failure is the part that makes it a real test: a non-zero exit code is how every automation tool on earth learns that something failed.

Is that the right call? For fourteen assertions about one pure function, yes — a test framework would be more configuration than test. Past a few hundred assertions you start wanting what Jest gives you: parallel runs, watch mode, only-run-what-changed, good diffs on deep objects, mocking. Node's own built-in `node:test` module now covers most of that with zero installs, which is what a project this size would reach for next. §11.20 comes back to this judgement.

**`peerDependencies`** — the strangest bucket, and the one interviews ask about. A **peer dependency** is a package your code needs but expects the *host application* to provide, so that everyone shares one copy.

The classic case is a plugin. A React component library needs React, but if it listed React under `dependencies`, npm might install a second, separate copy of React inside the library's own folder. Two copies of React in one page do not work — React keeps internal state that both copies would fight over. So the library declares `"peerDependencies": { "react": "^18.0.0" }`, meaning: "you must have React 18, and I will use yours."

npm 7 and later install missing peer dependencies automatically and error out if your version conflicts with what a plugin demands. That error — `ERESOLVE unable to resolve dependency tree` — is one you will meet. The correct response is to fix the version conflict, not to reach for `--force` or `--legacy-peer-deps`, which paper over it.

There is a fourth bucket, `optionalDependencies`, for packages whose failure to install should not fail the whole install. It is rare and mostly used for platform-specific native code.

---

## 11.17 npm scripts and `npx`

The `scripts` block turns long commands into short names. `npm run web` executes `node web/serve.js`. `npm test` and `npm start` are special-cased to work without the word `run`.

Two details in this project's scripts are worth explaining.

**The flag on almost every line.**

```json
"start": "node --no-warnings=ExperimentalWarning src/index.js",
```

`--no-warnings=ExperimentalWarning` silences one specific category of Node warning. It is there because `node:sqlite` is still marked experimental, and without the flag every single run prints a multi-line yellow warning about it before doing anything useful. Note the precision: it silences only `ExperimentalWarning`, not all warnings. A plain `--no-warnings` would also hide deprecation notices you actually want to see. This is a small thing, but it is the difference between suppressing noise and suppressing information.

**Scripts can chain.**

```json
"test": "node test/extract.test.mjs && node test/roles.test.mjs && node test/tailor.test.mjs",
```

`&&` in a shell means "run the next command only if the previous one succeeded". Because each test file exits non-zero on failure, the first failing test stops the chain, and `npm test` as a whole reports failure. Three separate programs behave like one test suite, with no test runner involved.

**What npm adds when it runs a script.** npm puts `node_modules/.bin` at the front of your `PATH` for the duration. That is why a script can say `playwright-core` and it resolves to `node_modules/.bin/playwright-core` even though nothing is installed system-wide.

**`npx`** does the same trick from your terminal. `npx some-tool` looks for `some-tool` in the local `node_modules/.bin`, and if it is not there, downloads the package temporarily, runs it, and does not permanently install it. It is how you run a one-off code generator without polluting your machine. Be careful with it: `npx` will happily download and execute a package you named by mistake, which is the typosquatting risk in §11.19 delivered straight to your shell.

In this project, `npx playwright-core --help` would work, because the lockfile's `bin` entry created that link. Nothing in the project uses it; the browser is driven through the library, not the CLI.

---

## 11.18 `node_modules` and how deep it usually goes

Run `npm install` and you get a folder called `node_modules`. It holds every package you asked for and every package *those* packages asked for, and so on, all the way down. A package pulled in by another package rather than by you is a **transitive dependency**. The whole shape is the **dependency tree**.

`node_modules` is a famous joke among programmers precisely because of how large it gets. A freshly generated React application typically installs somewhere on the order of a thousand packages and hundreds of megabytes — a **megabyte** being roughly a million bytes — for a page that says "Hello". Nobody chose those thousand packages. They arrived transitively, four and five levels deep.

Now measure this project. Every number below is from the repository as it stands:

```
$ npm ls --all
linkedin-internship-watcher@1.0.0
`-- playwright-core@1.62.0
```

That is the *entire* tree. One line. Not "one direct dependency with fifty children" — one package, total.

```
$ find node_modules -type f | wc -l
     112
$ du -sh node_modules
 13M	node_modules
```

112 files. 13 megabytes.

Compare that with the numbers in your head from every tutorial you have read, and the difference is not marginal. It is two orders of magnitude in file count.

**Why does playwright-core have no dependencies of its own?** Because Microsoft **vendored** them — copied the code of everything it needs into its own package and compiled it into a single file. Look at the largest files inside:

```
3.3M  node_modules/playwright-core/lib/coreBundle.js
3.1M  node_modules/playwright-core/lib/utilsBundle.js
1.1M  node_modules/playwright-core/types/types.d.ts
```

`coreBundle.js` starts with `"use strict";` followed by a wall of generated helper functions with names like `__toESM` — the signature of a bundler's output. Playwright's dependencies are all in there, pre-mixed.

That trade-off is worth naming honestly. Vendoring means Playwright's users never hit a version conflict and never get a surprise transitive package. It also means that if one of those bundled libraries has a security flaw, you cannot patch it yourself; you wait for Microsoft to ship a new Playwright. You have traded control for simplicity. For a library this widely used, with a large team behind it, that is usually the right trade.

**One historical note on the folder layout.** Old npm (before version 3) nested literally: if A needed B and C needed a different B, you got `node_modules/A/node_modules/B` and `node_modules/C/node_modules/B`. On Windows, paths got so long that the filesystem refused them. Modern npm *flattens* — it hoists everything it can to the top level and only nests when two packages genuinely need incompatible versions. That is why a modern `node_modules` is a wide, shallow folder with a thousand entries rather than a deep tree.

In this project the deepest path is `node_modules/playwright-core/lib/tools/skills/playwright-cli/references` — and that depth comes from Playwright's own internal folder structure, not from nesting packages at all.

---

## 11.19 Supply-chain risk: what you are actually agreeing to

When you type `npm install left-pad`, here is what you have agreed to, precisely:

You will download code written by a stranger, along with code written by strangers *they* trusted, and run all of it on your computer with your user's full permissions. Your `~/.ssh` keys, your browser profiles, your `.env` file with the API keys in it — all readable by anything in `node_modules` that decides to look. And npm packages may declare **install scripts**: commands that run automatically at install time, before you have executed a single line of your own code.

This is called **supply-chain risk**, and it is not theoretical. Two incidents, in detail, because they teach different lessons.

**left-pad, March 2016.** A developer named Azer Koçulu had a package called `kik`. The messaging company Kik wanted the name; a lawyer got involved; npm transferred the name away from him. In protest he unpublished all 250-odd of his packages from the registry. One of them was `left-pad`, an eleven-line function that pads a string with spaces on the left. It was a transitive dependency of Babel, of React Native, of thousands of build pipelines. Within hours, builds across the industry were failing with "module not found". npm took the unprecedented step of un-unpublishing it, and afterwards changed the rules so that a package other people depend on cannot simply vanish.

The lesson of left-pad is not "the maintainer was wrong". It is **availability**: your build depended on an eleven-line function remaining hosted on someone else's server, and you had never once thought about that.

**event-stream, November 2018.** `event-stream` was a widely used package with around two million downloads a week. Its original author had lost interest. A stranger volunteered to take over maintenance; the author, reasonably enough, handed it to them. Months later, the new maintainer published a version that added a new dependency, `flatmap-stream`, containing an encrypted payload. The payload only decrypted and activated inside one specific application — the Copay bitcoin wallet — where it attempted to steal private keys. It ran undetected for weeks.

The lesson of event-stream is **trust transitivity**: you audited `event-stream` when you installed it. You never audited the person who inherited it, and you never audited `flatmap-stream`, because you did not know it existed.

Since then the pattern has repeated in different shapes. In October 2021 `ua-parser-js`, a package with millions of weekly downloads, was hijacked through a compromised maintainer account and briefly shipped a cryptocurrency miner and a password stealer. In January 2022 the author of `colors` and `faker` deliberately sabotaged his own widely used packages with an infinite loop, in protest at unpaid maintenance work. In March 2022 `node-ipc` shipped code that overwrote files on machines it geolocated to particular countries — "protestware". In September 2025 a phishing campaign against maintainers of extremely common packages including `chalk` and `debug` pushed malicious releases, and a self-replicating worm nicknamed Shai-Hulud spread through npm by stealing credentials from one compromised package's install and using them to publish others.

Alongside deliberate attacks there is **typosquatting**: publishing `crossenv` and waiting for people who meant `cross-env`, or `reqeusts` for `requests`. It costs the attacker nothing and it works.

**What you can actually do about it.**

- **`npm audit`** cross-references your installed tree against a database of known vulnerabilities and prints what it finds. On this project the output is one line:

  ```
  $ npm audit
  found 0 vulnerabilities
  ```

  It is easy to have zero vulnerabilities when you have one dependency. That is not a coincidence; it is the whole argument of this chapter.

  Understand what audit does *not* do: it only knows about flaws somebody has already reported and published, usually with a **CVE** — a public identifier for a known security vulnerability. A brand-new malicious package has no CVE. Audit would not have caught event-stream on day one.

- **Commit your lockfile**, so the integrity hashes pin exact bytes and an install cannot silently pick up a fresh malicious release.
- **Use `npm ci` in automation**, so builds cannot drift.
- **`npm install --ignore-scripts`** blocks install-time scripts. It breaks packages that genuinely need to compile something, but it removes the "malicious code runs before you even use the package" window.
- **Read what you install.** Not all of it — nobody reads three million lines. But before adding a package, look at its npm page: how many dependencies does it have, when was it last published, how many open issues, who maintains it, does it have a single maintainer with no organisation behind it.
- **Prefer fewer, larger, better-maintained dependencies over many small ones.** Ten small packages from ten strangers is ten trust relationships. One package from Microsoft is one.

---

## 11.20 The one dependency: `playwright-core`

Everything so far has been groundwork. Here is the thing this project actually installs.

**Who makes it.** Microsoft. `node_modules/playwright-core/package.json` lists the author as "Microsoft Corporation" and the repository as `github.com/microsoft/playwright`. The licence is Apache-2.0, a permissive open-source licence. The team that started it previously built Puppeteer at Google, which matters for §11.21.

**What it does.** Playwright drives a real web browser from code. Not a fake browser, not an HTTP client pretending to be one — an actual Chromium, Firefox or WebKit, with a real rendering engine, real JavaScript execution, real cookies. You tell it to open a page, click a button, read text, and it does those things the way a person would.

**How it does it.** This is worth understanding, because it demystifies the whole category. Chromium-based browsers ship with a built-in remote-control interface called the **Chrome DevTools Protocol**, usually shortened to **CDP**. It is the same interface your browser's own developer tools use. It speaks JSON messages: "navigate to this URL", "give me the DOM", "dispatch a mouse click at these coordinates", "take a screenshot". Playwright launches the browser with a flag that opens this channel — you can find the string `remote-debugging-pipe` inside `lib/coreBundle.js` — and then sends CDP messages down it and reads the replies. Method names from the protocol, like `Target.setAutoAttach`, appear in that bundle too.

So the picture is: your Node program → Playwright's JavaScript API → a driver process → CDP messages over a pipe → the browser. Chapter 16, *Web Scraping and Playwright*, walks through the parts of that API this project uses. Here we care about the packaging.

**Why `playwright-core` and not `playwright`.** There are two packages. The difference is not features — it is browsers.

Installing `playwright` runs an install step that downloads its own private copies of Chromium, Firefox and WebKit. Hundreds of megabytes. Those copies are pinned to versions Playwright has tested, which is exactly what you want in a test suite: everyone on the team, and the build server, runs the identical browser build.

Installing `playwright-core` downloads none of that. Its own README, all one line of it, says it is the "no-browser flavor of Playwright". It is the library without the browsers, meant for when you already have a browser you want to drive.

Which is precisely this project's situation. `src/browser.js:8`:

```js
export const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
```

and `src/browser.js:108-118`:

```js
const context = await chromium.launchPersistentContext(PATHS.profile, {
  executablePath: BRAVE_PATH,
  headless: false,
  viewport: null,
  args: braveArgs(cfg),
  // Playwright defaults to --no-sandbox, which makes Brave show a yellow
  // "unsupported command-line flag" banner across the top of every page.
  // Keeping the normal sandbox removes the banner and matches how the browser
  // ordinarily runs.
  chromiumSandbox: true,
});
```

`executablePath` points at the user's real Brave. `headless: false` means a real window opens on screen — a **headless browser** is one that runs with no visible window, and the file explains a few lines above exactly why that is refused here:

```js
if (cfg.browser.headed === false) {
  // Headless leaks "HeadlessChrome" in the user agent and collapses the
  // screen to 800x600 — both trivially detectable.
  throw new Error('browser.headed must stay true. Headless mode is detectable and will get the account flagged.');
}
```

`launchPersistentContext` is the method that reuses a profile folder on disk, so cookies survive between runs. That is the entire reason this design exists: you sign in to LinkedIn by hand once, with `npm run login`, and every scheduled run afterwards is already signed in. `src/browser.js:160-166` checks for the session cookie by name:

```js
export async function hasLinkedInSession(context) {
  const cookies = await context.cookies('https://www.linkedin.com');
  const liAt = cookies.find((c) => c.name === 'li_at');
  if (!liAt) return false;
  if (liAt.expires && liAt.expires > 0 && liAt.expires * 1000 < Date.now()) return false;
  return true;
}
```

If the project had installed `playwright` instead, it would have downloaded a Chromium it never uses, and a Firefox and a WebKit it never uses, purely as a side effect. `playwright-core` is the honest match for "I have a browser; drive it".

**Where it is used.** One file. Verify it:

```
$ grep -rn "playwright" src bin web test
src/browser.js:4:import { chromium } from 'playwright-core';
```

One import in the whole codebase. `src/browser.js` launches Brave and returns `{ context, page, previousApp }`. Every other module that touches the browser — `src/linkedin.js` navigating and reading pages, `src/guard.js` checking for CAPTCHAs, `src/human.js` moving the mouse — receives that `page` object as an ordinary function argument and never imports Playwright itself.

This is a design worth stealing. The dependency has exactly one point of contact with your code. If Playwright were abandoned tomorrow, or its API changed, you would rewrite one 166-line file. Compare that with a project that imports its browser library in twenty places: the same swap becomes a month of work. That situation — where a library has grown so far into your code that leaving it is impractical — is called **vendor lock-in**, and the cure is a thin layer of your own code between you and the library.

**Alternatives, and how they differ.**

- **Puppeteer** (Google, 2017). The original of this category, built by the same people who later built Playwright at Microsoft. Chromium-first, though Firefox support has improved. Simpler and older. Playwright added multi-browser support, better waiting behaviour, and browser contexts as a first-class idea. For this project either would work; Playwright's persistent-context API is nicer.
- **Selenium / WebDriver** (2004 onwards). The elder statesman. **WebDriver** is a W3C standard protocol for browser control, which is Selenium's great advantage — it is a real standard supported by browser vendors, with bindings in Java, Python, C#, Ruby and more. Its disadvantages are speed and the fact that you typically run a separate driver executable per browser. If your team is not JavaScript-based, Selenium is often the right answer.
- **Cypress**. A different shape entirely: it runs your test code *inside* the browser alongside the page. That gives excellent debugging and a great developer experience for testing your own web application. It is a poor fit here, because it is designed for testing a site you control, not for driving a signed-in session on somebody else's site.
- **Plain HTTP requests** — `fetch` in a loop, no browser. Enormously faster and lighter when it works. It does not work on LinkedIn, whose job listings are rendered by JavaScript after login and behind anti-automation checks. Chapter 16 goes into this properly.

**The trade-offs of choosing Playwright here.**

*What it buys:* a real browser means the page behaves exactly as it does for a human, JavaScript and all. The persistent profile means a login done once by hand lasts for months. The API is well documented and stable, and Microsoft maintains it actively.

*What it costs:* 13 megabytes and a large bundled codebase you cannot inspect line by line. A hard dependency on a browser being installed at a specific path — `src/browser.js:85-87` throws a clear error if Brave is missing, which is the right way to fail. It is slow: driving a real browser at human pace is thousands of times slower than an HTTP request. And it ties the project to a desktop machine that is switched on; you cannot run this on a cheap server without a display, because headless mode is explicitly refused.

Every one of those costs was accepted knowingly. That is what makes it a decision rather than an accident.

---

## 11.21 What this project wrote instead of installing

Now the interesting half. For each of the following, there is a popular npm package that does the job, and this project declined it. Some of those calls are clearly right. At least one is arguable. Judge honestly, and notice that the answer is different each time.

### An HTTP server: `web/serve.js` instead of Express

**Express** is the most-installed web framework for Node — routing, middleware, body parsing, static file serving. It is the default answer for "I need a server in Node", and it pulls in roughly 60–70 packages transitively.

This project's local development server is 100 lines and imports nothing but built-ins. The core of it, `web/serve.js:59-93`:

```js
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/tailor') {
    try {
      const { default: handler } = await import('./api/tailor.js');
      req.body = await readBody(req);
      return handler(req, shimResponse(res));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ error: `Local handler failed: ${err.message}` }));
    }
  }

  // Static files, with a traversal guard.
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!path.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }

  try {
    const body = await readFile(path);
    res.setHeader('content-type', TYPES[extname(path)] ?? 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<h1>404</h1>');
  }
});
```

In groups:

- `createServer(handler)` is Node's built-in HTTP server. The handler is called once per request with a request and a response object. Chapter 12, *Servers From Scratch*, takes this apart properly.
- The `/api/tailor` branch loads the same file Vercel runs in production and calls it. That is the point of the whole file: exercise the real handler locally.
- The static-file branch turns a URL path into a file path, reads the file, sets a content type from the extension table at `web/serve.js:21-36`, and sends it.
- The `404` branch handles "no such file" by treating any read error as not-found.

Two pieces of hand-written glue are worth singling out. First, `web/serve.js:49-57`:

```js
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

The serverless handler is written in the style Vercel expects — `res.status(400).json({...})`. Node's raw response object has neither method. Eight lines add them, and `web/api/tailor.js` runs unchanged in both places. That is a genuinely good piece of engineering: instead of adopting a framework so the handler's style matches, it added the two methods the handler actually uses.

Second, the traversal guard:

```js
const path = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
if (!path.startsWith(ROOT)) {
  res.statusCode = 403;
  return res.end('Forbidden');
}
```

Without it, a request for `/../../../../etc/passwd` would serve a file far outside the site folder. `normalize` collapses the `..` segments, the regular expression strips leading ones, and the `startsWith` check refuses anything that still escaped. This is called path traversal and it is one of the oldest bugs in web serving.

**Verdict: right, comfortably.** This server exists only on the author's laptop. In production, Vercel serves the files; this code is never deployed. It handles exactly one API path and a fixed folder of static files. Installing a framework and its ~65 transitive packages to save perhaps forty lines of code that will never face the public internet would be a poor trade.

**Where it would become wrong:** the moment this had to serve real users. Then you want sessions, compression, rate limiting per route, structured error handling, and a routing table that does not consist of `if` statements. Writing all that yourself *is* writing Express, only worse and untested.

### A database layer: `node:sqlite` instead of an ORM

`src/store.js:1`:

```js
import { DatabaseSync } from 'node:sqlite';
```

The alternatives here are `better-sqlite3` (a fast, popular SQLite binding that must be compiled for your machine on install), or an ORM — **object-relational mapper**, a library that lets you write `db.job.findMany()` instead of SQL — such as Prisma, Sequelize or Drizzle.

This is barely a decision, because `node:sqlite` is *built into Node 22*. It is not a dependency at all. It costs zero packages, zero install time, and zero native compilation. `better-sqlite3` would have meant a C++ build step on every install, which is exactly the kind of thing that breaks when you upgrade Node.

**Verdict: right, and it is not close.** Chapter 14, *Databases and SQLite*, covers what the module gives you.

The honest costs: the module is still marked experimental, which is why every npm script carries `--no-warnings=ExperimentalWarning`; the API could change. And you write SQL by hand — `src/store.js` is 484 lines of schema, migrations and queries, some of which an ORM would have generated. Whether writing SQL is a cost or a benefit is one of the longest-running arguments in this field. For a schema of five tables that one person owns, hand-written SQL is clear and debuggable.

### A logger: `src/logger.js` instead of Winston or Pino

The whole logger is 54 lines. Here is the part that does the work, `src/logger.js:24-37`:

```js
function write(level, msg) {
  const line = `${stamp()} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  const colour = LEVEL_STYLE[level] ?? '';
  process.stdout.write(`${colour}${line}${RESET}\n`);
  try {
    if (!logFile) {
      ensureDirs();
      logFile = fileFor();
    }
    appendFileSync(logFile, `${line}\n`);
  } catch {
    // Logging must never be the reason a run dies.
  }
}
```

Line by line:

- `stamp()` (defined at `src/logger.js:16-18`) produces a timestamp like `2026-07-27 08:43:11` by taking an ISO date string, swapping the `T` for a space, and cutting off the milliseconds.
- `padEnd(5)` pads the level name to five characters so `[INFO ]` and `[ERROR]` line up in a column. Small, and it makes a long log readable.
- `LEVEL_STYLE[level]` looks up an escape code from the table at `src/logger.js:5-11`. Those `\x1b[36m` strings are ANSI escape codes — a decades-old convention where a terminal interprets certain byte sequences as "switch to cyan" rather than printing them. `RESET` is `\x1b[0m`, "back to normal".
- `process.stdout.write` prints without adding a newline, so the `\n` is explicit.
- `appendFileSync` also writes the line, uncoloured, to a file named for today's date — `fileFor()` at line 20 builds `run-2026-07-27.log`.
- The empty `catch` is the most important part of the function, and the comment says why: **logging must never be the reason a run dies.** If the disk is full or the folder is unwritable, the program prints to the screen and carries on. A logger that throws is worse than no logger.

The exported object at line 39 gives five levels plus a `section` helper that prints a coloured horizontal rule.

The alternatives, Winston and Pino, offer things this does not: structured JSON output that log-analysis tools can query, log rotation, multiple transports (file, network, cloud service), sampling, child loggers that carry context, and serious performance work for high-volume servers.

**Verdict: right for this program, and it would be wrong for most others.** This is a program that runs twice a day on one laptop, and a human reads the output. Coloured, aligned, timestamped text is the ideal format for that reader. JSON logs would be strictly worse. Pino's headline feature — writing tens of thousands of log lines per second without blocking — solves a problem this program will never have, and note that `appendFileSync` is *synchronous*: it blocks until the write completes. In a busy web server that would be a real performance bug. Here, at a few hundred lines per run, it is invisible, and it has the advantage that a crash cannot lose buffered output.

The one thing it lacks that it will eventually want is log rotation. Today the daily filename limits growth per file but nothing ever deletes old ones — and interestingly, `bin/run.sh:14-17` does implement truncation for the launchd log, trimming it when it passes five megabytes. The logic exists; it just lives in the shell wrapper rather than the logger.

### A summarizer: `src/summarize.js` instead of an NLP library

`src/summarize.js` is 150 lines that reduce a long job description to about four sentences, with no library and no network call.

The method is called extractive summarisation: score every sentence, keep the best few, print them in their original order. The scoring tables are the whole idea, `src/summarize.js:26-35`:

```js
const SIGNAL = [
  [/\b(responsibilit|you will|you'll|your role|day.to.day|what you.ll do)\b/i, 3],
  [/\b(require|qualification|must have|looking for|we seek|ideal candidate|eligib)\b/i, 3],
  [/\b(stipend|salary|compensation|paid|pay)\b/i, 3],
```

paired with a table of things that should *lose* points, `src/summarize.js:17-24`:

```js
const ANTI_SIGNAL = [
  [/^we are (?:a|an|the)\b/i, -4],
  [/\b(fast|rapidly)[- ]growing\b/i, -3],
  [/\b(world|industry)[- ]lead(?:ing|er)\b/i, -3],
```

Each entry is a regular expression and a weight. Sentences mentioning stipend or eligibility gain three points. Sentences beginning "We are a fast-growing, industry-leading…" lose seven. The selection at `src/summarize.js:80-85` sorts by score, takes the top few, then **re-sorts by original position** so the result still reads in order:

```js
const picked = scored
  .sort((a, b) => b.score - a.score || a.index - b.index)
  .slice(0, maxSentences)
  .sort((a, b) => a.index - b.index)
  .map((s) => s.sentence.replace(/^[-•*–]\s*/, ''));
```

There is also an optional path through a language model, `src/summarize.js:95`, which calls an API over plain `fetch` — no SDK installed — and, critically, returns `null` on any failure so the offline summary is used instead. The public entry point, `src/summarize.js:144-150`, makes that explicit:

```js
export async function summarize(job, description, summarizerConfig) {
  if (summarizerConfig?.mode === 'claude') {
    const viaClaude = await claudeSummary(job, description, summarizerConfig);
    if (viaClaude) return viaClaude;
  }
  return offlineSummary(description);
}
```

The default mode in `src/config.js` is `'offline'`, so out of the box no network call happens at all.

**Verdict: right, and for an unusual reason.** There is no npm package that would have done this better. General-purpose summarisation libraries do not know that "Apply by 15 August" is the single most valuable sentence in an internship posting and that "We are a world-leading team" is worthless. The domain knowledge encoded in those two tables *is* the product. A library would have given you a generic summary; the point here was a specific one.

That said, the mechanism is crude — matching words, not meaning — and it will miss a sentence phrased unusually. The design accepts that by putting a real language model behind an optional flag, with the crude version as the floor.

### An argument parser: hand-rolled in two files

Command-line flags are parsed twice in this project, in two different styles. `src/index.js:25` and `:46-61`:

```js
const ARGS = new Set(process.argv.slice(2));
```

```js
function numArg(name) {
  for (const a of ARGS) {
    const m = a.match(new RegExp(`^--${name}=(\\d+(?:\\.\\d+)?)$`));
    if (m) return Number(m[1]);
  }
  return null;
}
```

`process.argv` is an array Node fills with the command line: element 0 is the path to node, element 1 is the path to your script, and everything after is the user's arguments — hence `slice(2)`. Putting them in a `Set` makes `ARGS.has('--dry-run')` a one-liner. `numArg('max-pages')` builds a regular expression matching `--max-pages=40` and returns 40 as a number, or `null` if the flag is absent.

`bin/enrich.js:25-28` does it differently:

```js
function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}
```

This one expects `--limit 500` — a space, not an equals sign — and finds the value by looking at the next element.

The alternatives are Commander or Yargs, which give you `--help` output, type coercion, subcommands, validation and aliases. And there is now a built-in: `parseArgs` from `node:util`, stable since Node 18, which handles the common cases with zero installs. This project imports `node:util` at `src/notify.js:2` but only for `promisify`.

**Verdict: acceptable, and the weakest of the five.** Twelve lines to parse seven optional flags for a program with one user is not an unreasonable trade. But notice the smell: two files parse arguments in two incompatible styles. `--limit 500` in one, `--max-pages=40` in the other. Nothing generates `--help`; the documentation is a comment block at `src/index.js:31-45`, which is good discipline but can drift out of date. Nothing validates that `--sort=banana` is nonsense.

If this were a program other people used, that inconsistency would be a real bug report. `parseArgs` from `node:util` would fix it for free — no dependency, one consistent style, unknown flags rejected. This is the one place in the chapter where the honest answer is "the hand-rolled version is a little worse, and the better option costs nothing".

That matters more than it sounds. The point of this section is not that writing it yourself always wins. It is that you should be able to say, for each case, *why*.

---

## 11.22 The dependency the browser has anyway

One more thing, because it undercuts any smugness about the count.

The site installs zero npm packages. But `web/public/app.js:479` does this:

```js
const pdfjs = await import(`${PDFJS_BASE}/pdf.min.mjs`);
```

with, at `web/public/app.js:3-4`:

```js
const PDFJS_VERSION = '4.6.82';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;
```

That is a dynamic import from a URL. When a student uploads a résumé as a PDF, the browser downloads Mozilla's pdf.js library from a content delivery network and runs it, in the student's browser, to extract the text. The site depends on pdf.js as surely as the watcher depends on Playwright. It simply does not go through npm.

Compare the risk profiles honestly:

- **Through npm:** the version is pinned in a lockfile, the bytes are checked against an integrity hash, and the code runs on your machine at build time.
- **Through a CDN URL:** the version is pinned in the URL — `4.6.82` is explicit, which is good — but there is no integrity check in this code, and the code runs in *your users'* browsers. If that CDN were compromised, every visitor would execute whatever it served.

The browser has a defence for this, called Subresource Integrity: you attach a hash to the tag, and the browser refuses code that does not match. It applies straightforwardly to `<script src="...">` tags; for a dynamic `import()` of a module you would need an import map with integrity metadata, which is newer ground. This project does neither. It is a real, if modest, gap — and a good illustration that "zero dependencies" is a claim about a package manager, not about trust.

The one genuine advantage of the CDN approach here: pdf.js is only downloaded if a student actually uploads a PDF. Most visitors just browse listings and never pay for it. A bundler would have shipped it to everyone.

---

## 11.23 A practical rule for adding a dependency

Here is a checklist you can actually use. Work down it before typing `npm install`.

**1. Can a built-in do it?** Node's standard library has grown enormously: `fetch`, `node:test`, `node:sqlite`, `node:util`'s `parseArgs`, `crypto.randomUUID()`, `structuredClone`, `AbortController`. A large fraction of small npm packages exist because their author did not know the built-in had arrived. Check first.

**2. How much of the library will you use?** If you need one function out of two hundred, and that function is under fifty lines and you understand it, write it. If you need forty of the two hundred, install it. The failure mode people fear — "left-pad, but I wrote it myself" — is not that they wrote eleven lines. It is that they installed eleven lines.

**3. What is the cost of getting it wrong yourself?** This is the question that overrides everything above. Some categories you must not hand-roll, regardless of how simple they look:

- **Anything cryptographic.** Password hashing, encryption, token signing. Use the built-in `node:crypto` or a well-reviewed library. A subtle mistake here is invisible and catastrophic.
- **Anything that parses hostile input.** HTML, XML, PDFs, images, archives. Parsers written casually are where security holes live. This project uses pdf.js rather than writing a PDF parser, and Playwright rather than parsing LinkedIn's HTML by hand.
- **Dates and time zones.** Every programmer who thinks date arithmetic is easy is about to learn otherwise.
- **Anything a standard defines precisely.** If there is an RFC, someone has already implemented it correctly.

Notice this project respects all four. Its hand-written pieces are a log formatter, a static file server for its own laptop, a sentence scorer and a flag parser. All four are low-stakes, and a bug in any of them is visible immediately.

**4. Check the package's own dependency count.** `npm ls` after installing, or the "Dependencies" tab on the npm page before. A package with 3 dependencies is a different proposition from one with 300. You are trusting all of them.

**5. Check that it is alive.** Last publish date, open issues, number of maintainers, whether an organisation stands behind it. A package last published in 2019 with one maintainer and 40 open issues is a liability you are adopting.

**6. Wrap it.** Whatever you install, put it behind one file of your own — the way `src/browser.js` is the only file in this project that has ever heard of Playwright. Then the library is a decision you can revisit rather than a marriage.

**7. Be honest about why you are refusing.** There is a real failure mode on this side too, called **NIH syndrome** — "Not Invented Here", the habit of rejecting outside code because you would rather write your own. Rewriting a battle-tested library because you find dependencies distasteful is not discipline; it is ego, and it produces software with all the same bugs the library fixed in 2018. The test is simple: can you state, in one sentence, what the library does that you do not need? If you cannot, you have not evaluated it. You have just refused it.

The one-dependency rule in this project is not "dependencies are bad". It is: **each dependency must earn its place, and you must be able to say out loud what it earned.** Playwright earns it by doing something that would take a team a decade to rebuild. A logger does not.

---

## Chapter summary

- A module is a file that keeps its own names private and publishes only what it chooses, which solves name collisions, unfindable code, and untestable code all at once.
- Before modules, browsers loaded code with ordered `<script>` tags into one shared global scope, where the load order was invisible and every library's names could collide.
- CommonJS gave Node synchronous `require` and `module.exports` in 2009; AMD and then bundlers gave the browser workarounds; ESM's `import`/`export`, standardised in 2015, is now the language's own answer and is what this project uses everywhere.
- Named exports are checked by name and are the safer default; a default export exists for the one thing a file is about, and `web/api/tailor.js` has both because Vercel requires a default while the test imports a named function.
- Node resolves a `node:` specifier to a built-in without touching disk, a relative specifier to an exact file with a mandatory extension, and a bare specifier by climbing `node_modules` folders and then consulting the package's `exports` map.
- `"type": "module"` in `package.json` makes every `.js` file ESM, removes `require`, `__dirname` and `__filename`, and enables top-level `await`; `.mjs` and `.cjs` force the answer regardless of any config.
- Circular imports are legal but fragile, and this project avoids them by keeping a strictly layered import graph in which `paths.js` and `logger.js` sit at the bottom and `index.js` at the top.
- npm is a registry of over two million packages, a client bundled with Node, and the organisation that runs the servers; before it existed you downloaded zip files by hand.
- Semantic versioning splits a version into major, minor and patch, and `^1.56.0` allows anything below 2.0.0 — which is why this project's lockfile records the installed version as 1.62.0.
- `package-lock.json` records the exact version, source URL and integrity hash of every installed package, must be committed to git, and is enforced strictly by `npm ci`.
- `dependencies` ship to production, `devDependencies` do not, and `peerDependencies` say "the host application must supply this so we share one copy".
- `node_modules` for a typical modern web app holds around a thousand packages; this project's holds one package, 112 files and 13 megabytes, because `playwright-core` vendors its own dependencies into two bundled files.
- Supply-chain attacks are real and repeated — left-pad in 2016, event-stream in 2018, `ua-parser-js` in 2021, `colors`/`faker` in 2022, the npm worm of 2025 — and your defences are a committed lockfile, `npm ci`, `npm audit`, `--ignore-scripts`, and installing less.
- `playwright-core` is Playwright without bundled browsers, chosen because this project drives the user's real Brave through the Chrome DevTools Protocol with a persistent profile, and it is imported in exactly one file, `src/browser.js:4`.
- The server, database layer, logger, summarizer and argument parser were all written by hand instead of installed; four of those five calls are clearly right for a program with one user, and the argument parser is the weak one because `node:util`'s `parseArgs` would do it better for free.

## Key takeaways

Every dependency is a trust relationship with a stranger, extended transitively to everyone that stranger trusted, and executed with your user account's full permissions — so the right question is never "is this package good?" but "what did this package earn?". A lockfile is not bureaucracy; it is the only record of what your program actually consisted of, which is why it belongs in git and `node_modules` does not. Writing something yourself is correct when it is small, low-stakes, and shaped by knowledge specific to your problem, and it is dangerous when it touches cryptography, hostile input, dates, or anything a standard already specifies. Keep every library behind one file of your own, the way `src/browser.js` is the only file in this project that has heard of Playwright, so that replacing it is a day's work and not a quarter's. And be as suspicious of refusing a dependency for pride as of adding one for convenience — both are decisions, and you should be able to defend either in a sentence.

## Real-life analogy revisited

The store room analogy holds all the way down, and the useful part is the ledger. `package.json` is the requisition slip: it says what you want, and it accepts a bit of vagueness — "a caret-1.56 oscilloscope, any model up to but not including version 2". `package-lock.json` is the storekeeper's ledger, and it is exact: this serial number, issued from this shelf, with this tamper seal. When your experiment behaves differently from your labmate's, the slip will not tell you why, because you both wrote the same slip. The ledger will, because you were issued different units.

The part of the analogy that stings is the borrowed-parts problem. When you sign for the oscilloscope, you are also, unknowingly, signing for the probe cable someone else lent to the lab, and the connector inside that cable, and the solder joint inside the connector. left-pad was a solder joint. event-stream was a cable somebody swapped out while nobody was watching. Intern Radar walks into the store room and comes out with a single item, made by a large department that machines its own parts, and carries it home on a shelf where exactly one file — `src/browser.js` — is ever allowed to touch it.

## Frequently asked questions

**Why can't I just use `require` in this project? It's shorter to type.**
Because `package.json:7` sets `"type": "module"`, and under that setting `require` is not defined at all — you get `ReferenceError: require is not defined`. That is not npm being awkward; ESM and CommonJS are genuinely different module systems with different loading rules, and a file has to be one or the other. If you truly need `require` in one file, name it `.cjs` and it will work, but in a project like this you would be swimming against the current for no gain.

**Do I really have to write `.js` at the end of every import? It feels like noise.**
Yes, in ESM, and it will feel like noise for about a week. The reason is that guessing costs work: to resolve `'./paths'` Node would have to try `./paths.js`, then `./paths.json`, then `./paths/index.js`, hitting the disk each time. Browsers, which use the same `import` syntax, cannot guess over a network at all. One explicit extension removes that entire category of ambiguity.

**Everyone's `node_modules` is huge. Is this project's one dependency actually realistic, or is it showing off?**
It is realistic for *this* program and would not be for many others. This is a command-line scraper and a static site with one API endpoint — no UI framework, no build step, no ORM, no test framework, no server framework. A team building a large web application with authentication, payments and a design system would legitimately have fifty direct dependencies. The transferable lesson is not the number one. It is that each of the five things this project could have installed got argued about individually, and four of those arguments came out in favour of writing it.

**If I delete `node_modules`, do I lose anything?**
No, provided `package-lock.json` is committed. Delete the folder, run `npm ci`, and you get byte-for-byte the same packages back, verified against the integrity hashes. That is exactly why `.gitignore` excludes `node_modules` and git tracks the lockfile — one is disposable, the other is not.

**What actually happens if I ignore `engines` and run this on Node 20?**
`src/store.js:1` imports `node:sqlite`, which does not exist before Node 22, so the program dies on its first database access with a module-not-found error. `engines` does not stop you; npm prints a warning and carries on. It is a declaration for humans and hosting platforms, not a lock. Note that `web/package.json` says `">=20"` because the serverless function never touches SQLite.

**Is `npm audit` reporting zero vulnerabilities the same as being safe?**
No. Audit compares your installed packages against a database of *already reported* flaws. A malicious package published an hour ago has no entry, so audit is silent. It would not have caught event-stream on day one. It is a useful floor and not a ceiling. Fewer dependencies, a committed lockfile and `npm ci` do more for you than audit does.

**Why does the site use pdf.js from a CDN instead of installing it?**
Because the site has no build step, so there is nothing to bundle an npm package into — the files you edit are the files that ship. Loading it from a URL when a student actually uploads a PDF also means most visitors never download it. The cost is that there is no integrity check on those bytes, which is a genuine, if small, gap that the npm route would have closed.

**Should I use `^` or pin exact versions?**
Use `^` in `package.json` and commit the lockfile. The caret describes what you would *accept*; the lockfile records what you actually *have*. Together you get reproducible builds plus a clear signal when you deliberately run `npm update`. Pinning exact versions everywhere without a lockfile is worse than it looks, because your transitive dependencies are still floating.

## Common beginner mistakes

**1. Committing `node_modules` to git.**
*What they do:* run `git add .` without a `.gitignore` and push 200 MB of packages.
*Why it seems right:* "I want my teammate to have exactly what I have."
*What actually happens:* the repository becomes enormous and slow, every merge conflicts inside generated files, and packages with compiled native code break on a different operating system anyway.
*The fix:* `node_modules/` in `.gitignore` — it is the first line of this project's — and commit `package-lock.json` instead. That achieves the goal properly.

**2. Adding `package-lock.json` to `.gitignore`.**
*What they do:* assume that because it is generated, it should be ignored like `node_modules`.
*Why it seems right:* it is machine-written and changes constantly.
*What actually happens:* two people on the same commit install different versions, and you get bugs that reproduce on one machine and not the other, with no visible difference in any file.
*The fix:* commit it. Never hand-edit it. Resolve conflicts by taking one side and re-running `npm install`.

**3. Putting everything in `dependencies`.**
*What they do:* `npm install jest` without `--save-dev`.
*Why it seems right:* it installed, the tests run, it works.
*What actually happens:* your production deployment installs a test framework, a linter and a bundler it will never run — slower builds, larger images, and more code with access to production secrets.
*The fix:* `npm install --save-dev` for anything used only while developing. Ask "does the running program need this?" — if no, it is a devDependency.

**4. Reaching for a package before checking the standard library.**
*What they do:* install a package to parse command-line flags, generate a unique ID, or make an HTTP request.
*Why it seems right:* every tutorial older than a couple of years does exactly that.
*What actually happens:* dependencies for jobs Node now does natively — `node:util`'s `parseArgs`, `crypto.randomUUID()`, global `fetch`. This project uses `fetch` directly for every Gemini call with no SDK installed at all.
*The fix:* search the Node documentation first. The standard library grew a lot between 2018 and now.

**5. Running `npm install --force` or `--legacy-peer-deps` to silence an error.**
*What they do:* hit `ERESOLVE unable to resolve dependency tree` and add whichever flag makes it stop.
*Why it seems right:* the error goes away and the install completes.
*What actually happens:* you have installed a combination the packages themselves declared incompatible. It usually fails later, at run time, in a confusing place.
*The fix:* read the error — it names the two packages and the versions in conflict. Upgrade or downgrade one of them until they agree.

**6. Forgetting the file extension in an ESM import.**
*What they do:* write `import { PATHS } from './paths'`.
*Why it seems right:* it is what CommonJS, webpack and TypeScript all allow.
*What actually happens:* `ERR_MODULE_NOT_FOUND`, with a message that names the file you meant, which makes it look like the file is missing.
*The fix:* always write the extension, as `src/browser.js:5` does.

**7. Reaching for `__dirname` in an ESM file.**
*What they do:* `const file = path.join(__dirname, 'data.json')`.
*Why it seems right:* every Node example written before about 2020 uses it.
*What actually happens:* `ReferenceError: __dirname is not defined in ES module scope`.
*The fix:* `dirname(fileURLToPath(import.meta.url))` as at `src/paths.js:6` and `web/serve.js:17`, or the newer `import.meta.dirname` as at `bin/enrich.js:23`.

**8. Installing `playwright` when you meant `playwright-core`.**
*What they do:* follow a tutorial, `npm install playwright`, and wait while hundreds of megabytes of browsers download.
*Why it seems right:* it is the more obvious name and most tutorials use it.
*What actually happens:* nothing breaks, but you have downloaded three browser builds you never launch, because your code sets `executablePath` to a browser already on the machine.
*The fix:* `playwright-core` when you supply the browser; `playwright` when you want Playwright's pinned, tested browser builds — which for a test suite is usually what you do want.

## Interview questions

**1. What is the difference between `dependencies` and `devDependencies`, and who enforces it?**
`dependencies` are packages the program needs at run time and are installed for anyone who installs your package. `devDependencies` are needed only while developing — test runners, linters, bundlers — and are skipped by `npm install --omit=dev` and by most production deployment pipelines. Nothing enforces correctness at run time; if you misfile a runtime package as a devDependency, it will work locally and crash in production. The practical test is "does the running program import this?"

**2. Why must `package-lock.json` be committed, given that `package.json` already lists the dependencies?**
Because `package.json` records *ranges*, not versions. `^1.56.0` matches anything below 2.0.0, so two installs weeks apart can produce different code — in this repository the lockfile records 1.62.0 for a `^1.56.0` range. The lockfile pins the exact version, the source URL and an integrity hash for every package including transitive ones, so `npm ci` reproduces an identical tree and a tampered download fails the hash check instead of executing.

**3. Explain how Node resolves `import { chromium } from 'playwright-core'`.**
It is a bare specifier, so Node looks for `node_modules/playwright-core` in the importing file's directory and then in each parent directory until the filesystem root, taking the first match. Having found the package, it reads that package's `package.json` `exports` field and applies the condition matching the caller — here `"import": "./index.mjs"`, because the caller used ESM. It then loads `index.mjs` and looks for a named export called `chromium`. Nothing outside the `exports` map is importable, even if the file exists on disk.

**4. What does `"type": "module"` change, and what are `.mjs` and `.cjs` for?**
It makes every `.js` file under that `package.json` an ES module: `import`/`export` work, `require`, `module.exports`, `__dirname` and `__filename` do not exist, the code is in strict mode, and top-level `await` becomes legal. `.mjs` and `.cjs` override that decision per file — `.mjs` is always ESM and `.cjs` is always CommonJS, regardless of any `package.json`. This project sets `"type": "module"` at the root and additionally names its three test files `.mjs` so they are unambiguous when run directly.

**5. What is a supply-chain attack in the npm ecosystem? Give a real example and say what defends against it.**
It is an attack that compromises code you depend on rather than code you wrote. In November 2018 the `event-stream` package, with roughly two million weekly downloads, was handed to a volunteer maintainer who added a dependency containing an encrypted payload that stole private keys from one specific bitcoin wallet application. Defences are layered: commit a lockfile so integrity hashes pin exact bytes, use `npm ci` so builds cannot drift, run `npm audit` for known reported flaws, consider `--ignore-scripts` to block install-time execution, and above all reduce the number of packages you trust.

**6. Why does this project depend on `playwright-core` rather than `playwright`?**
`playwright` runs an install step that downloads its own pinned copies of Chromium, Firefox and WebKit — hundreds of megabytes. `playwright-core` is the same library with no bundled browsers. This project drives the user's already-installed Brave, pointing `executablePath` at `/Applications/Brave Browser.app/...` in `src/browser.js`, and reuses a persistent profile so a manual LinkedIn login survives between runs. Downloading three browsers it would never launch would be pure waste.

**7. When is writing something yourself instead of installing a library the right call, and when is it arrogance?**
It is right when the thing is small, the stakes of a bug are low, and the requirement is specific to your problem — this project's 54-line logger prints coloured, aligned lines for a human reading one laptop's output, which is the ideal format and something Winston would not improve. It is arrogance when you rebuild something battle-tested, or when you touch cryptography, parsing of hostile input, dates and time zones, or anything a standard already specifies. The honest test is whether you can state in one sentence what the library does that you do not need; if you cannot, you have refused it rather than evaluated it.

**8. What is a circular import and what happens in ESM when you have one?**
It is a cycle in the import graph — A imports B and B imports A. ESM handles it by executing modules depth-first and, on re-entry, returning bindings that are declared but not yet initialised. Reading such a binding at module top level throws `ReferenceError: Cannot access 'x' before initialization`; reading it inside a function called later works fine, because by then both modules have finished. The usual fix is to extract the shared code into a third module, which is why this project's graph is layered with `paths.js` and `logger.js` at the bottom.

## Exercises

**1.** Open `package.json` and, without looking back at this chapter, write one sentence for each of its ten top-level fields explaining what would break if you deleted it. Then check yourself against §11.13.

**2.** In a scratch folder, create a file `a.js` containing `import { b } from './b.js'; export const a = 'A'; console.log(b);` and a file `b.js` containing `import { a } from './a.js'; export const b = 'B: ' + a;`. Add a `package.json` with `"type": "module"`. Run `node a.js` and record the exact error. Then change `b.js` so it exports a *function* that reads `a`, call that function from `a.js`, and observe that the error goes away. Explain why in two sentences.

**3.** In the real project, run `npm ls --all`, then `find node_modules -type f | wc -l`, then `du -sh node_modules`. Write down the three numbers. Now, in a separate empty folder, run `npm install express` and run the same three commands. Compare. Do not commit either folder.

**4.** Break resolution on purpose. In a copy of the project, edit `src/browser.js:5` to remove the `.js` from `'./paths.js'` and run `npm run dry-run`. Record the exact error text. Put it back. Then delete the `"type": "module"` line from `package.json` and run it again; record that error too. Restore both.

**5.** Replace the argument parser in `bin/enrich.js` with `parseArgs` from `node:util`. Keep the same three flags — `--limit`, `--dry-run`, `--all` — and make `--limit` accept `--limit=500` as well as `--limit 500`. Run `node bin/enrich.js --dry-run --limit=3` and confirm the behaviour is unchanged. Write two sentences on whether the result is better or worse than the twelve lines it replaced.

**6.** Read `web/serve.js` in full and list every feature Express would have given you that this file does not have. For each one, say in a sentence whether this project would actually use it. Aim for at least six.

**7.** Add a second production dependency to a throwaway copy of the project — any package with a large tree, `axios` or `chalk` will do — and then run `npm ls --all` and count the packages that arrived. Now open `package-lock.json` and count how many `integrity` lines appeared. Write a short paragraph on how many strangers you just trusted.

**8. 🔴** Write a replacement for `src/logger.js` that keeps the exact same exported shape — `log.debug`, `log.info`, `log.ok`, `log.warn`, `log.error`, `log.section` — but adds two features: log rotation, so that a log file larger than 5 MB is trimmed the way `bin/run.sh:14-17` trims its own log, and an optional `LOG_FORMAT=json` environment variable that switches the file output (not the terminal output) to one JSON object per line. It must remain dependency-free, must not change any calling file, and must preserve the rule at `src/logger.js:34-36` that a logging failure can never crash a run. Then argue in a paragraph whether at this point you should have installed Pino after all.

## Quiz

**Q1.** In ESM, what does `import { log } from './logger.js'` require of `logger.js`?
a) A default export
b) A named export called `log`
c) A `module.exports = { log }`
d) Any export at all; the name is chosen by the importer

**Q2.** `package.json` says `"playwright-core": "^1.56.0"`. Which of these versions could npm install?
a) 1.55.9
b) 1.62.0
c) 2.0.1
d) Both a and b

**Q3.** True or false: `node_modules` should be committed to git so that everyone gets identical packages.

**Q4.** What is the purpose of the `integrity` field in `package-lock.json`?

**Q5.** Which of these is *not* a consequence of setting `"type": "module"`?
a) `require` is undefined
b) `__dirname` is undefined
c) Top-level `await` becomes legal
d) `import` statements may be placed inside `if` blocks

**Q6.** In one sentence, why does this project depend on `playwright-core` rather than `playwright`?

**Q7.** How many files in this repository import a third-party package, and which file is it?

**Q8.** Name the two supply-chain incidents described in §11.19 and, in one clause each, the different lesson they teach.

**Q9.** A package you depend on needs React but expects your application to supply it, so there is only one copy. Which `package.json` field does it use?
a) `dependencies`
b) `devDependencies`
c) `peerDependencies`
d) `optionalDependencies`

**Q10.** `npm audit` prints "found 0 vulnerabilities". Does that mean your dependencies are safe? Answer in two sentences.

## Where this leads

You now know how this project loads code — its own files through ESM imports, Node's own capabilities through `node:` built-ins, and exactly one thing from the outside world. The next question is what those built-ins can actually build. Chapter 12, *Servers From Scratch*, takes `web/serve.js` apart line by line and shows what a web server really is underneath: a program that listens on a port, reads bytes, and writes bytes back — no framework required, and no mystery once you have seen it done in a hundred lines.

---

## Answers

**A1.** **b)** A named export called `log`. `src/logger.js:39` has `export const log = {...}`, and the curly braces in the import mean the names must match exactly.

**A2.** **b)** 1.62.0. The caret means "at least 1.56.0, below 2.0.0", so 1.55.9 is too old and 2.0.1 is a major version away. The lockfile in this repository records 1.62.0, which is the proof.

**A3.** **False.** Commit `package-lock.json` instead — it is small text and reproduces the tree exactly via `npm ci`. Committing `node_modules` bloats the repository, causes merge conflicts in generated files, and does not even work across operating systems for packages with compiled code.

**A4.** It is a cryptographic fingerprint of the package archive's contents. On every install npm re-computes the hash of what it downloaded and compares; a mismatch — from corruption, a tampered mirror or a malicious replacement — fails the install instead of running the code.

**A5.** **d)**. `import` declarations are static and hoisted, so they must be at the top level of a module and cannot sit inside an `if` block. If you need conditional loading, use the dynamic form `await import(...)`, as `web/serve.js:64` does. The other three are all real consequences.

**A6.** Because the project drives the user's already-installed Brave via `executablePath`, so the browser downloads that `playwright` performs at install time — hundreds of megabytes of Chromium, Firefox and WebKit — would be pure waste.

**A7.** One file: `src/browser.js`, at line 4, `import { chromium } from 'playwright-core';`. Everything else that touches the browser receives the `page` object as a function argument.

**A8.** **left-pad (March 2016)** — an eleven-line package was unpublished and thousands of builds worldwide broke, teaching that your build depends on someone else's server continuing to host code you never thought about. **event-stream (November 2018)** — a widely used package was handed to a volunteer who added a dependency containing a payload targeting a bitcoin wallet, teaching that trust is transitive and you never audited the maintainer who inherited the package or the dependency they added.

**A9.** **c)** `peerDependencies`. It declares "the host application must provide this version", so npm does not install a second, conflicting copy.

**A10.** No. Audit only checks your installed packages against a database of vulnerabilities somebody has already reported and published, so a package that turned malicious an hour ago is invisible to it; it would not have caught event-stream on day one. It is a useful floor, but a committed lockfile, `npm ci`, and simply depending on less code do more for your actual safety.
