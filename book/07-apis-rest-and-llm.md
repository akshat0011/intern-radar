# Chapter 7 — APIs, REST, and Talking to a Language Model

> By the end you can read `web/api/tailor.js` end to end, justify every status code it returns, and explain why this program knows its answer *before* it asks an AI.

**New words:** API, endpoint, resource, HTTP method, safe, idempotent, status code, path parameter, query parameter, header, REST, stateless, representation, GraphQL, gRPC, tRPC, API key, bearer token, JWT, rate limiting, pagination, cursor, versioning, serverless function, structured output, hallucination, fallback.

---

## 7.1 What an API actually is

An **API** (Application Programming Interface) is an agreed way for one program to ask another program to do something. That is the whole idea. It has nothing to do with the web by definition; it predates the web.

Think of the hostel mess. You do not walk into the kitchen and stir the dal. You stand at the counter, say "one thali", and a thali appears. The counter is the interface: a fixed set of things you may ask for, and a fixed shape for what comes back. The kitchen can change its cook and you never notice.

An API gives you a **contract** (these requests, those replies) and a **boundary** (you cannot reach past the counter). It takes away a freedom: you can only ask for what is on the menu. `Math.max(3, 7)` is an API call.

## 7.2 Web APIs, endpoints, resources, methods

A **web API** is one where the two programs are on different machines and the request travels over HTTP, the request-and-reply protocol of the web. One side is a **server** — a program listening on a network address, waiting for requests. The other is the **client**.

An **endpoint** is one addressable operation: a URL plus a method, like `POST https://internradar.online/api/tailor`. A **resource** is what the endpoint is about — a job, a user. Classically the URL names the resource as a noun and the method says what to do to it (made-up example, not from the project):

```
GET /jobs        list        POST   /jobs     create
GET /jobs/42     read one    PUT    /jobs/42  replace
DELETE /jobs/42  remove      PATCH  /jobs/42  change part
```

`HEAD` is `GET` without a body, for cheap existence checks. `OPTIONS` asks "what may I do here?"; browsers send it automatically before some cross-site requests.

Beginners write `/getJobs` and `/deleteJob42`. HTTP will not stop you, but you discard meaning that caches, proxies and browsers already understand. They know what `GET` means. They know nothing about `/getJobs`.

## 7.3 Safe, idempotent, and retries

**Safe** means the request changes no server state: `GET`, `HEAD`, `OPTIONS`. This is why a browser may prefetch a link. Build a `GET /deleteAccount` and something will crawl it and delete accounts.

**Idempotent** means doing it N times has the same effect as once. `GET`, `PUT`, `DELETE` are; `POST` is not. Pressing the lift button ten times is idempotent — the lift comes once. Feeding ten coins into a vending machine is not.

This matters because **networks lose replies**. Your request arrives, the work happens, the reply is lost. The client cannot tell "never arrived" from "arrived, reply lost", so it retries. Retrying an idempotent request is harmless; retrying a non-idempotent one double-charges someone. So retry logic may repeat safe and idempotent methods freely, and a `POST` that costs money needs an **idempotency key** — a unique id the client generates and the server remembers. `POST /api/tailor` has none: a retry costs one extra Gemini call, and nobody is charged money.

## 7.4 Status codes

Every reply starts with a three-digit **status code**.

| Class | Meaning | Ones to know |
|---|---|---|
| 2xx | It worked | 200 OK, 201 Created, 204 No Content |
| 3xx | Go elsewhere | 301, 302, 304 Not Modified |
| 4xx | **You** got it wrong | 400 Bad Request, 401, 403, 404, 405 Method Not Allowed, 422, 429 Too Many Requests |
| 5xx | **I** got it wrong | 500, 502 Bad Gateway, 503 Service Unavailable, 504 |

The 4xx/5xx split answers: whose fault, and should the client retry? 4xx means retrying unchanged is pointless. 5xx means a later retry might work.

Two confusing pairs. **401 vs 403:** 401 = I do not know who you are; 403 = I know, and you still may not. **502 vs 503:** 502 = I am a middleman and my upstream answered badly; 503 = I am here but temporarily cannot serve you.

## 7.5 Where the data goes

**Path parameters** identify which resource: `/jobs/42`. **Query parameters** filter or page a collection: `/jobs?tech=true&page=2`. **Headers** are metadata about the request — `content-type: application/json`, `x-goog-api-key: AIza...`. **The body** carries the payload for `POST`, `PUT`, `PATCH`.

Two hard rules. Sensitive things — a résumé, a key, a password — go in the body or a header, **never** the query string, because URLs are logged by every proxy and browser on the path. Anything you want cached or shareable goes in the URL, because a body cannot be bookmarked.

## 7.6 REST, and what most "REST APIs" really are

**REST** — Representational State Transfer — comes from Roy Fielding's 2000 doctoral thesis. He was not proposing a JSON convention; he was explaining *why the web scales*. His constraints:

- **Client–server.** Interface and data store evolve separately.
- **Stateless.** Every request carries everything needed to understand it; the server remembers nothing between requests. Like the railway reservation counter: you cannot say "same as last time", you hand over the full form every time.
- **Cacheable.** Responses say whether they may be stored and reused.
- **Uniform interface.** Resources have URLs; you exchange **representations** of them (a JSON document is a representation of a job, not the job); messages describe themselves; and **HATEOAS** — the response carries links telling the client what it can do next, as an HTML page carries its own links.
- **Layered.** A client cannot tell the origin server from three caches in front of it.

Statelessness has the biggest practical consequence: it is why twenty identical servers can sit behind one address, and why this project's function can run on a machine that did not exist five seconds ago.

**Now the honest part.** Almost no "REST API" implements HATEOAS. Responses are plain JSON with no links; clients hard-code URL patterns. What industry means by REST is HTTP + nouns in URLs + standard method meanings + JSON + status codes. Fielding has complained publicly. In an interview, state the constraints accurately, then say which ones your API meets. `POST /api/tailor` is stateless, uses HTTP correctly and returns JSON — and has no hypermedia, and names an action rather than a resource. It is RESTish, and saying so shows you know the difference.

## 7.7 The alternatives, one line each

- **GraphQL** — one endpoint; the client's query names exactly the fields it wants, so no over-fetching. Costs a heavier server and hard caching.
- **gRPC** — binary protocol, functions declared in a schema file, both sides generate code; fast between servers, awkward from a browser.
- **tRPC** — TypeScript-only; the client calls server functions as if local, fully type-checked. Great in a TypeScript monorepo, useless elsewhere.

This project uses none. One endpoint, one method, one JSON body.

## 7.8 Practical concerns nobody teaches

**API keys.** A long random string identifying the calling *application*. Here it is `GEMINI_API_KEY`, read from an environment variable — a value handed to the process by its environment rather than written in the code. It goes in a header, never in a URL, never into git.

**Bearer tokens.** `Authorization: Bearer <token>` means what it says: whoever holds it, is you. No second factor, hence short lifetimes and HTTPS only.

**JWT** (JSON Web Token) is a token format: header, payload, signature, base64-encoded and dot-joined. The server signs it, so it can verify the payload was not edited without a database lookup. Two things are constantly misunderstood. It is **signed, not secret** — anyone holding it can read the payload. And it **cannot be revoked** before expiry without adding the very lookup it was meant to avoid; log a user out and their JWT still works. Teams adopt it for statelessness, bolt on a blocklist for logout, and end up with a session store plus extra complexity. This project has no login and no JWT.

**Rate limiting and 429.** A cap on requests per caller per window; over the cap you return **429 Too Many Requests**, ideally with `Retry-After`. You meet this from both sides here: the project imposes limits, and Google imposes limits on the project.

**Pagination.** *Offset* (`?limit=20&offset=40`) is simple and lets you jump to page 7, but breaks when rows are inserted mid-paging, so you see duplicates or skips. *Cursor* (`?limit=20&after=job_8812`) is stable and fast on large tables, but cannot jump. This project paginates nothing.

**Versioning.** Once someone depends on your shape you cannot change it. Put a version in the path (`/v1/jobs` — note `v1beta` in Google's URL below), or a header, or practise additive-only change: adding a field is safe, removing or renaming one is not.

**Error design.** Errors are part of the contract. A good error is machine-readable (a stable status), human-readable (an actionable sentence), and honest about whose fault it is.

---

## 7.9 The API this project serves: `POST /api/tailor`

The site is static files plus exactly one **serverless function**: a JavaScript function the host (Vercel) runs on demand when a request arrives, then discards. No machine to manage, and nothing runs between requests — remember that.

The file is `web/api/tailor.js`, 278 lines. Its path *is* its URL. No routing table, no `app.get(...)`, no Express.

```js
export default async function handler(req, res) {
```
`web/api/tailor.js:174`

Vercel imports the file, takes the **default export**, and calls it with `req` (the request) and `res` (the reply you build) — the same shape as Node's built-in `http` module, which Chapter 5, *Node.js, Modules, and Servers Without a Framework*, covers. `req.body` arrives already parsed from JSON; that is the one convenience the platform adds.

### Guard clauses, in order

```js
  if (req.method === 'OPTIONS') { res.setHeader('Allow', 'POST'); return res.status(204).end(); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
  if (process.env.TAILOR_DISABLED === 'true') return res.status(503).json({ ... });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'The site is missing its API key. ...' });
```
`web/api/tailor.js:175` (line breaks condensed)

- **OPTIONS → 204 No Content**, with `Allow: POST` — the browser's pre-flight question, answered.
- **Wrong method → 405**, not 404. The endpoint exists; the verb is wrong.
- **A kill switch.** `TAILOR_DISABLED=true` turns the feature off in seconds without a deploy, returning **503**: "I exist, come back later." Anything that spends money needs one.
- **Missing key → 500.** The operator's fault, not the caller's, so 5xx. The message names no configuration detail.

Each guard returns immediately. No `else`, no nesting: read top to bottom and you have every way to be rejected before work begins.

### Validating the body

```js
  const { resumeText, job } = req.body ?? {};
  if (typeof resumeText !== 'string' || resumeText.trim().length < 200) {
    return res.status(400).json({ error: 'That resume looks too short to work with. If it is a scanned image, the text could not be read — try a PDF exported from a document editor.' });
  }
  if (!job?.title) return res.status(400).json({ error: 'No job was selected.' });
```
`web/api/tailor.js:191`

`req.body ?? {}` uses **nullish coalescing**: if the body is `null` or `undefined`, destructure an empty object instead of throwing. Both failures are **400** — the caller sent something wrong, and retrying it unchanged fails again.

The 200-character floor does real product work. The browser extracts text from an uploaded PDF, and a scanned photograph has no text layer, so extraction returns almost nothing. Rather than send three characters to a model and get a fabricated résumé back, the endpoint refuses and names the likely cause.

### Rate limiting, honestly

```js
  const limit = rateLimit(clientIp(req), Date.now());
  if (!limit.ok) return res.status(limit.status).json({ error: limit.message });
```
`web/api/tailor.js:200`

`clientIp` reads `x-forwarded-for` — the header a proxy adds naming the original caller — takes the first entry, then falls back to `x-real-ip`, then `'unknown'` (`:168`). `rateLimit` keeps timestamps in a plain `Map` and enforces 5 per IP per hour, 15 per IP per day, 200 site-wide per day (`:31`). Per-IP breaches return **429**; the site-wide cap returns **503**, because that one is not the caller's fault.

The file does not pretend this is airtight: "Serverless instances recycle, so this is a speed bump rather than a vault" (`:37`). Each instance has its own `Map`; instances start, stop and multiply, so rotating IPs defeats it. A real fix needs shared storage. The trade taken: a speed bump costing zero infrastructure, on a feature whose worst case is a spent free quota.

### The prompt

`SYSTEM` (`:73`) states one rule four ways: invent nothing. It pre-empts the model's favourite dodges — no placeholders like `[add metric]`, no inflated durations, no upgraded titles — and asks for a `gaps` list naming what the job wants that the résumé does not show. Truth beats flattery.

`buildUserPrompt` (`:126`) assembles job facts as an array of strings-or-`null` and drops the nulls with `.filter(Boolean)`, so there is never a `Location: undefined` line. The résumé is appended, capped at 18,000 characters (`:203`).

`RESPONSE_SCHEMA` (`:90`) declares the exact reply shape: `name`, `contact`, `summary`, `sections` (heading plus items), `skills`, `changeNotes`, `gaps`. This is **structured output** — the API constrains generation to match the schema. The comment states the payoff: it "removes a whole class of parsing failure" (`:89`). Without it you write brittle code that strips code fences and hunts for the first `{`.

### The call, and every way it fails

```js
    const upstream = await fetch(`${API_BASE}/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ /* systemInstruction, contents, generationConfig */ }),
    });
```
`web/api/tailor.js:206`

`fetch` is built into Node 18+. No `axios`, no Google SDK. The key travels in a header.

Then the failure ladder (`:224`). Google's status is **not** passed through; it is re-mapped to what is true from the caller's point of view:

| Google says | We return | Why |
|---|---|---|
| 429 (our quota is spent) | **503** | The visitor did nothing wrong; our service is temporarily unavailable. |
| 400 / 403 (our key is bad) | **500** | Our misconfiguration, our fault. |
| anything else | **502** | We are a middleman; our upstream misbehaved. |

Returning Google's 429 would tell a student "you are sending too many requests" when they sent one. A status code describes *this* request on *this* API.

The remaining paths (`:236`–`261`):

- `promptFeedback?.blockReason` → **422 Unprocessable**: well-formed request, content the filter refused.
- `candidate?.finishReason === 'MAX_TOKENS'` → **502**, telling the student to trim. Without this you hand back truncated JSON and blame the parser.
- Text is joined from `candidate?.content?.parts` — a reply can arrive in several parts — then trimmed. Empty → **502**.
- `JSON.parse` throws → **502**, "unreadable". Note `catch {` with no binding: legal modern JavaScript when you do not need the error.

Every branch returns a sentence a nervous student can act on. None prints a stack trace.

## 7.10 `findInventedSkills` — not trusting the model

The prompt says invent nothing; the schema forces the shape. Neither guarantees the *content* is true. Models **hallucinate**: they produce fluent text not grounded in their input. Here the failure is specific and serious — a skill on a real student's résumé that they never claimed, sent to a real employer.

```js
export function findInventedSkills(resumeText, skills) {
  const haystack = String(resumeText).toLowerCase().replace(/[^a-z0-9+#./ ]/g, ' ');
  return (skills ?? []).filter((skill) => {
    const s = String(skill).toLowerCase().trim();
    if (s.length < 2) return false;
    // Multi-word skills count as present if every significant word is present.
    const words = s.split(/[\s/,]+/).filter((w) => w.length > 2);
    if (words.length > 1) return !words.every((w) => haystack.includes(w));
    return !haystack.includes(s);
  });
}
```
`web/api/tailor.js:156`

1. **Build the haystack.** Lowercase the résumé, then replace every character that is not a letter, digit, space, `+`, `#`, `.` or `/` with a space. Keeping those four means `c++`, `c#` and `node.js` survive; turning hyphens and commas into spaces makes "Machine-Learning" and "Python,Java" searchable.
2. **Skip one-character skills.** "R" or "C" match inside almost any text, so checking them is worse than useless. They pass unchecked — fewer false accusations.
3. **Split multi-word skills** on whitespace, `/` and `,`, keeping words longer than two characters.
4. **Multi-word rule:** present if *every* significant word appears somewhere, not necessarily together. Deliberately loose — the model may rephrase, not add.
5. **Single-word rule:** plain substring test. The function returns the skills that are **not** supported.

The caller strips rather than fails (`:263`): unsupported skills are filtered out and returned as `tailored.removedSkills`, so the student can be told exactly what was removed while the rest of the rewrite stays useful. Verification runs against the truncated `resume` actually sent, not the full upload — check against what the model saw.

**Where it is weak, honestly.** Substring matching over-accepts: "Go" appears inside "Django". For a skill like `AWS S3` the words filter drops `s3` (two characters), leaving one word, so the code falls to the single-word branch and searches for the literal `"aws s3"` — a résumé saying "S3 buckets on AWS" is wrongly flagged. And it checks only the `skills` array: a technology slipped into a bullet is not caught.

The comment says it: "Catches the obvious cases; it is a safety net under the prompt, not a replacement for it" (`:153`). That is the lesson of the chapter. **You do not trust a model's output. You verify what you can, cheaply, and you say what you did not verify.** Note also that its imperfections mostly point toward over-caution. That is the direction a safety check should fail in.

## 7.11 The API this project consumes: Gemini `generateContent`

`src/gemini.js` (501 lines) is the watcher's side: classify by title, classify an ambiguous job by description, enrich a job into a card. No SDK — the whole client is `fetch`.

The base URL is `https://generativelanguage.googleapis.com/v1beta/models` (`src/gemini.js:19`). Read it: host, then `v1beta` (Google warning you the shape may change), then `models`. The endpoint is `` `${API_BASE}/${model}:generateContent` ``. That `:generateContent` suffix is Google's convention for an action on a resource — a deliberate departure from noun-only REST.

```js
      const res = await fetch(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: `Label these ${titles.length} job titles:\n\n${numbered}` }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4_000,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: NO_THINKING,
          },
        }),
        signal: controller.signal,
      });
```
`src/gemini.js:122`

- **`systemInstruction`** — standing rules, separate from the conversation. Here, a precise definition of a tech role, down to "'Software Sales' is sales" (`:65`).
- **`contents`** — the actual turns, each with a `role` and `parts`.
- **`generationConfig`** — the knobs. `temperature: 0` takes the most likely token every time: for labelling you want the same answer for the same input, not creativity. `responseMimeType` plus `responseSchema` is structured output again.
- **`signal`** wires in an **AbortController** — an object whose `.abort()` cancels an in-flight `fetch`. A `setTimeout` fires it at 30 seconds and `clearTimeout` runs in a `finally`, so the timer never leaks (`:119`, `:169`). Without it, one hung connection stalls the whole nightly run.

**Batching.** Titles go 60 per call, descriptions 8, enrichment 6 (`:21`, `:254`, `:410`). The reason is stated: "On a free tier the per-day request count is the scarce resource, and a run with forty candidates should cost one request, not forty" (`:12`). Batch size shrinks as payloads grow, so one truncated reply costs little.

**Per-status handling** has one shape everywhere (`:139`): 429 becomes "daily free quota exhausted", 400/403 becomes "API key rejected", anything else is logged as `HTTP <n>` — then a warning is written and `null` returned. `enrichJobs` goes further: on a 400 it reads the response text and logs 200 characters of it, because "A 400 is almost always a malformed request on our side" (`:444`). Blaming the key for your own bad request wastes an hour.

Even after a clean 200, nothing is trusted. `tidyList` (`:369`) trims, de-duplicates, lowercases, drops over-long entries and caps counts — "the model is asked for this shape, not trusted for it" (`:368`). Bullets that review the advert rather than describe the job ("this posting is vague") are dropped by a regex, and if fewer than two survive, the enrichment is skipped and the plain-text summary stands (`:470`). A stipend the scraper read off the page overrides the model's guess (`:478`).

## 7.12 `thinkingBudget: 0`, and the measurement behind it

```js
const NO_THINKING = { thinkingBudget: 0 };
```
`src/gemini.js:31`

Gemini 2.5 models reason internally before answering, spending part of the reply budget on thought tokens. Useful for hard problems; here it destroyed the results. The comment records the experiment (`:25`): on a batch of six postings, thinking on produced 1,533 thought tokens and **zero** parseable items; thinking off produced **all six**. Raising `maxOutputTokens` did not help, so it was not truncation — the structured reply does not survive the thinking pass.

Three things to take from this: it is a measurement, not a belief; the obvious explanation was tested and rejected; and it fits the task, which is schema-constrained labelling, not reasoning. Write comments like this — six months later nobody remembers why a magic zero is there, and someone deletes it.

**An inconsistency worth naming:** `web/api/tailor.js` does *not* set `thinkingConfig`. Tailoring is longer, more open-ended, and its schema is nested rather than a flat list, so the same failure may not apply — but no measurement is recorded for it. Two files, two settings, one unjustified. If an interviewer finds it, agree with them.

## 7.13 The best decision in the codebase: offline first

In `classifyRoles`, the offline classifier runs **before** the network is touched:

```js
  // Offline first, so every item has a verdict no matter what happens next.
  const verdicts = items.map(({ title }) => {
    const r = classifyRole(title, { ... });
    return { isTech: r.verdict === 'tech', source: 'offline', reason: ... };
  });
```
`src/gemini.js:180`

`classifyRole` comes from `src/roles.js` and decides tech vs non-tech from a vocabulary — no network, no key, no cost. Every job now has a verdict. Only then does Gemini get a chance to improve it:

```js
    const byId = await classifyBatch(slice, model, process.env.GEMINI_API_KEY);
    if (!byId) break; // offline verdicts stand for the rest of the run
```
`src/gemini.js:210`

`classifyBatch` returns `null` for *every* failure — bad status, content-filter refusal, empty text, unparseable JSON, timeout, network error. One check covers all of them. Nothing throws; nothing is left blank. The `source` field records which brain decided, so the log can report how many verdicts Gemini changed (`:226`). Same contract elsewhere: `classifyFromDescriptions` returns `null` so callers keep offline verdicts (`:239`), and `enrichJobs` returns whatever it managed, so "a spent quota degrades the cards back to plain text instead of emptying them" (`:391`).

**Why this is the best decision here.** Invert it and picture the ordinary version: call Gemini, and if it fails, fall back. Now every failure needs its own catch. A timeout is one path, a 429 another, malformed JSON a third — and the one nobody writes is the response that arrives *valid but partial*, covering five of six ids, leaving fields half-written. A 3am run with an exhausted quota produces blank cards and you hear about it from a user.

Offline-first makes the API **strictly additive**. The program is correct before the call and correct after it; Gemini can only improve it. Ask this of every external dependency: *what is true if it never answers?* If the answer is "we are broken", you have built a dependency, not a feature.

The cost, plainly: the offline classifier is worse. It matches vocabulary and cannot read nuance, so on a quota-exhausted day some jobs land in the wrong section. Degraded is not free — but degraded beats absent.

## 7.14 The thing that is not an API: `jobs.json`

The browser needs the job list. There is no `GET /api/jobs`. There is a file. The watcher finishes a run; `src/publish.js` turns SQLite rows into a public JSON file, commits it to git and pushes; Vercel deploys on the push; the browser fetches that file like any other static asset.

**Why a file beats an API here.** The data changes every hour and is byte-identical for every visitor, so an API would recompute the same bytes on every request. A static file cannot crash, sits on a CDN (a network of servers worldwide holding copies near users), costs nothing per request, has no query surface to attack, and is versioned in git — you can see what the site showed last Tuesday and roll back with a revert. It is the college notice board: printed once, pinned up, two hundred students read the same sheet.

**What it gives up**, which matters more: freshness, since nothing appears between runs; server-side search, filtering and sorting, so every filter is JavaScript over the whole array in the visitor's browser; pagination, since the whole file downloads every time, which breaks at 50,000 jobs; personalisation, since everyone gets identical bytes, so saved jobs cannot live here; and anything dynamic, since the site cannot show what the file does not contain.

Which is the honest summary of the architecture: it fits *this* problem — one person's watchlist, every hour, public data. Change any of those and the file stops being the answer. Knowing where your clever choice breaks is worth more than the choice.

---

## Chapter summary

- An API is a contract between two programs: fixed requests, fixed replies, and a boundary you cannot reach past.
- HTTP methods carry precise meanings — `GET` is safe, `PUT` and `DELETE` idempotent, `POST` neither — and all retry logic depends on those properties.
- Status codes split on fault and retryability: 4xx means the caller must change something, 5xx means a later retry may work.
- REST is Fielding's set of constraints, of which statelessness matters most and HATEOAS is almost universally ignored, so most "REST APIs" including this one are REST-flavoured HTTP.
- `POST /api/tailor` is one serverless function whose file path is its URL, with guards first, validation second, rate limiting third, and a distinct status for every failure.
- It re-maps Google's statuses instead of passing them through, because a status describes *this* request on *this* API.
- `findInventedSkills` checks every skill in the output against the résumé it was given, strips the unsupported ones and reports them, because a hallucinated skill is a lie sent to a real employer.
- `thinkingBudget: 0` comes from a recorded measurement — thinking on returned zero parseable items of six, off returned all six — with truncation explicitly ruled out.
- Every Gemini call computes its offline answer first, so the API is strictly additive and no failure of Google's leaves a job unclassified.
- The job list is a static JSON file published by git push, trading freshness, search and personalisation for a site that cannot go down and costs nothing.

## Key takeaways

An API is a promise about shape, and this project takes that seriously in both directions: the endpoint it serves states exactly how it can fail, and the endpoint it consumes is never assumed to succeed. The pattern worth stealing is offline-first — compute the answer you can compute, then let the external service improve it, so a dependency is additive rather than load-bearing. Never trust a language model's output: prompts and schemas control shape, not truth, so verify the claims you can verify cheaply and say which ones you did not. And before building an API, check whether a file would do.

## Interview questions

**1. What is the difference between a safe method and an idempotent method, and why do you care?**
Safe means the request changes no server state — `GET`, `HEAD`, `OPTIONS`. Idempotent means doing it many times has the same effect as once — `GET`, `PUT`, `DELETE`, but not `POST`. You care because networks lose replies: a client with no answer cannot tell whether the work happened, so it retries. Retrying an idempotent request is harmless; retrying a non-idempotent one duplicates the effect, which is how people get double-charged. Operations that cost money need an idempotency key the server remembers. `POST /api/tailor` has none, so a retry costs one extra Gemini call — acceptable because no money changes hands.

**2. Is `POST /api/tailor` RESTful?**
Partly, and precision beats claiming yes. It is stateless — each request carries the résumé and the job and the function keeps nothing between calls, which is what lets a serverless platform run it anywhere. It uses HTTP properly: `POST` for a state-changing action, JSON body, meaningful codes, 405 for the wrong verb. But it fails the uniform-interface constraint twice: the URL names an action rather than a resource, and the response has no hypermedia links. Fielding's REST requires HATEOAS and almost nothing implements it, so this is REST-flavoured HTTP, which is what most people mean by REST.

**3. Google returns 429. Why return 503 rather than passing it through?**
Because a status code describes what happened to *this* request on *this* API. A 429 to the browser means "you sent too many requests", but the student sent one — the truth from their side is that our service is temporarily unavailable, which is 503. The same logic maps Google's 400 and 403 to 500, since a rejected key is our misconfiguration, and everything else to 502, the code for a middleman whose upstream misbehaved. Passing upstream codes through leaks your architecture and misdirects the caller's retry behaviour. It also matters because this endpoint legitimately returns 429 from its own per-IP limiter, and that code should mean one thing.

**4. Walk me through `findInventedSkills` and why it exists.**
It takes the résumé text and the skills array the model produced and returns the skills the résumé does not support. It lowercases the text and replaces punctuation with spaces, keeping `+`, `#`, `.` and `/` so `c++` and `node.js` survive. Skills under two characters are skipped because single letters match anything. Multi-word skills count as present when every word longer than two characters appears somewhere; single-word skills are a substring check. It exists because a prompt and a schema control shape, not truth — a hallucinated skill would go onto a real student's résumé and reach a real employer. Rather than failing, the handler strips unsupported skills and returns them as `removedSkills` so the student is told what was removed.

**5. (Hostile) That check only reads the `skills` array. What about a technology invented inside a bullet?**
Nothing catches it, and the file admits as much — its own comment calls it a safety net under the prompt, not a replacement. The mitigation is that the skills array is where invented technologies overwhelmingly appear, since that is the field the model most wants to align with the job description. Extending it to bullets is much noisier: bullets are prose, so you would need to extract technology names first, and a false accusation that deletes a student's sentence is worse than the current gap. If I hardened it, I would match bullets against a technology dictionary and surface anything unmatched as a warning rather than editing text. There is also a real false-positive bug: for `AWS S3` the two-character word is filtered out, so the code searches for the literal string "aws s3".

**6. (Hostile) Your rate limiter is an in-memory `Map` on a serverless platform. That does not work, does it?**
Not reliably, and the code says so — the comment calls it a speed bump rather than a vault. Each serverless instance has its own `Map`, instances are created and destroyed constantly, and traffic spreads across several, so the effective ceiling is above the configured five per hour. Rotating IPs or catching cold starts defeats it. A correct version needs shared state such as Redis keyed by IP, plus the platform's edge rate limiting. I accepted it because the worst case is a spent free quota with a clear message, there is a 200-per-day site-wide cap as a second line, and a `TAILOR_DISABLED` kill switch that stops everything without a deploy. If money were at stake I would not have made that call.

**7. Explain `thinkingBudget: 0`. Is that not cargo-culting a setting you saw somewhere?**
No, it is recorded from a measurement in `src/gemini.js`. On a batch of six postings, thinking on produced 1,533 thought tokens and zero parseable items; thinking off produced all six. The obvious explanation — that thinking ate the output budget — was tested by raising `maxOutputTokens`, which did not help, so it was not truncation. It also fits the task, since these calls are schema-constrained labelling rather than reasoning, and off is faster and cheaper. The honest caveat is that `web/api/tailor.js` does not set it and no measurement is recorded there, so the two files are inconsistent for reasons that are plausible but undocumented.

**8. Describe the offline-first pattern and argue for it.**
Every Gemini call has an offline answer computed before the network is touched. In `classifyRoles` the vocabulary classifier in `src/roles.js` labels every job first, and only then does Gemini get a chance to overwrite those labels. `classifyBatch` returns `null` for every possible failure — bad status, content filter, empty text, unparseable JSON, timeout, network error — so one check handles all of them and the offline verdicts stand. This makes the dependency strictly additive: correct before the call, correct after, with no path where a job goes unclassified because an API had a bad night. Invert the order and you owe a separate recovery path per failure mode, including the nasty one where a valid response covers only some ids and your fields end up half-written.

**9. (Hostile) What does offline-first cost? Do not tell me it is free.**
It is not. The offline classifier matches vocabulary and cannot read nuance, so a genuinely ambiguous title lands in the wrong section on a day the quota is spent. It also means maintaining two classifiers and keeping them roughly aligned, which the project only partly answers by having Gemini return a `keyTerm` the offline vocabulary can absorb. There is a subtler cost: because failures degrade silently, a broken key can go unnoticed for days, which is why every failure path logs a named reason. The trade accepted is that degraded output beats absent output — but you must actually read the logs, and that depends on a human.

**10. Why is the job list a static file rather than a real endpoint? That looks like avoiding the hard part.**
It is right for these constraints and wrong for many others. The data changes every hour and is identical for every visitor, so an API would recompute the same bytes per request for no gain. A static file sits on a CDN, cannot crash, costs nothing per request, has no query surface to attack, and is versioned in git so you can see and revert what the site showed last week. What it gives up is real: no freshness between runs, no server-side search or pagination, no personalisation, and the whole file downloads every time. At fifty thousand jobs or with per-user saved lists this breaks and you need a database behind an endpoint.

**11. What is a JWT and why is there none here?**
A JWT is a token of three base64 parts — header, payload, signature — signed by the server so it can verify the contents without a database lookup. Two things are widely misunderstood: it is signed but not encrypted, so anyone holding it can read the payload, and it cannot be revoked before expiry without adding exactly the lookup it was meant to remove. Teams adopt it for statelessness, bolt on a blocklist for logout, and end up with a session store plus extra complexity. This project has no accounts and no per-user data, so there is nothing to authenticate; the only secret is a server-side API key that never leaves the function.

**12. (Hostile) You send a student's résumé to Google's free tier, which may train on it. Is that acceptable?**
It is a genuine trade-off, handled by disclosure rather than denial. Google's free tier permits them to use submitted data to improve their models, the comment at the top of `web/api/tailor.js` says so, and students are told on the upload screen before they choose a file. On our side the résumé is never written to disk, never logged and never stored — it lives in memory for one request. The honest alternative is a paid tier with data-use guarantees, which would mean charging students. Given that, informed consent plus zero retention is the best available position, and burying the term in a policy nobody reads would not have been.

## Common beginner mistakes

**1. Returning 200 with an `error` field.** It looks tidy — one shape for everything. But monitoring counts 200 as success, retry logic sees no reason to retry, and caches may store your error as a valid answer, so dashboards show a healthy service while every user fails. Use the status as the machine-readable signal and the body for the human sentence.

**2. Passing an upstream error straight through.** Google says 429 so you return 429. It feels honest, but the caller sent one request and their client may now back off for an hour over your quota. Translate every upstream status into what is true from the caller's side, as the table in §7.9 does.

**3. Trusting the model because the schema validated.** A schema guarantees you get a `skills` array of strings; it says nothing about whether those strings are true. Beginners see clean JSON and ship. The fix is verification over what matters: `findInventedSkills` checks skills against the source, and `tidyList` trims, de-duplicates and caps every list.

**4. Calling the API first and treating the fallback as error handling.** It reads naturally — try, then catch. Then you find the failures are six cases, including a valid response covering half your items, and your fields are half-written at 3am. Compute the offline answer first so every item already has a value; failure then needs no handling beyond "keep what you had".

**5. Secrets or personal data in the query string.** `?apiKey=...` works on the first try, which is the problem: URLs are logged by every proxy and browser and leak through `Referer` headers. Keys go in headers, payloads in bodies — which is why the key here is `x-goog-api-key` and the résumé is a POST body.

**6. `fetch` with no timeout.** It looks complete and passes every test, because tests hit a fast server. In production a connection hangs and your process waits, blocking a scheduled run or holding a serverless function open until the platform kills it. `src/gemini.js` wires an `AbortController` to a 30-second timer and clears it in a `finally`.

## Exercises

1. **Read the ladder.** List every distinct HTTP status `web/api/tailor.js` can return, with the triggering condition and the line number. For each, say whether the caller should retry.

2. **Test the guard.** `findInventedSkills` is exported. Write a `.mjs` file that imports it and asserts with Node's built-in `assert`: a skill present verbatim is not flagged; a multi-word skill whose words appear separately is not flagged; `"Kubernetes"` against a résumé that never mentions it *is* flagged.

3. **Find the false positive.** Using the same import, build a résumé and a skill where the function flags something the student genuinely claimed. Hint: what happens to a two-character word inside a multi-word skill? Write the failing assertion, propose a one-line fix, and say what new false *negatives* it introduces.

4. **Design the missing endpoint.** Specify `GET /api/search` on paper: path versus query parameters, response shape, cursor pagination, which status codes it returns and when, and its cache headers. Then write one paragraph on why the project does not have it.

5. 🔴 **Invert the pattern and count the cost.** Rewrite `classifyRoles` as API-first — call Gemini, fall back only on failure. Do not run it; just write it. Enumerate every failure case your version must now handle explicitly, including a response with verdicts for only some ids. Compare branch counts with the current version and state what the offline-first ordering bought.

## Quiz

1. A client sends `DELETE /jobs/42` twice because the first reply was lost. Is that a problem, and which property makes your answer true?
2. Google returns 403 because the key is wrong. What does `POST /api/tailor` return to the browser, and why not 403?
3. Which REST constraint lets a serverless platform run this function on a different machine every request?
4. Why does `findInventedSkills` return `false` for a one-character skill instead of checking it?
5. What evidence is recorded for `thinkingBudget: 0`, and which alternative explanation was ruled out?
6. Name two capabilities the site gives up by serving `jobs.json` as a static file.

---

### Quiz answers

1. **Not a problem.** `DELETE` is idempotent: deleting job 42 twice leaves the same end state as once, so the retry is safe. Had it been `POST /api/tailor`, the retry would have cost a second Gemini call and a second unit of quota.

2. **500.** A rejected API key is the site's own misconfiguration, not the caller's fault, so it belongs in the 5xx family. Returning 403 would tell the visitor they are forbidden when they did nothing wrong (`web/api/tailor.js:224`).

3. **Statelessness.** Every request carries everything needed to process it and the server keeps no memory between requests, so any instance can serve any request.

4. Because one character matches inside almost any text — "R" in "React", "C" in "Cloud" — so the check would be meaningless or falsely accusing (`web/api/tailor.js:160`).

5. On six postings, thinking on gave 1,533 thought tokens and **zero** parseable items; off gave all six. Truncation was ruled out because raising `maxOutputTokens` did not help (`src/gemini.js:25`).

6. Any two of: freshness between runs; server-side search, filtering or sorting; pagination for a large list; personalisation such as per-user saved jobs; anything dynamic the file does not contain.
