# Chapter 6 — Remembering Things: SQLite and the Store

> By the end you can read this project's database schema, write the SQL that does 95% of real work, explain why every query in `src/store.js` uses `?`, and defend two shortcuts the code deliberately takes.

**New words:** database, table, row, column, schema, NULL, primary key, foreign key, normalisation, SQL, CRUD, JOIN, GROUP BY, index, B-tree, transaction, ACID, prepared statement, SQL injection, NoSQL, WAL, pragma, migration, epoch milliseconds, serialisation.

---

## 6.1 Why not just a file?

The watcher finds internships every hour. It must remember them between runs, or it reports the same job as "new" forever.

The simplest memory is a **file** — a named blob of bytes on disk. Write every job to `jobs.json`, read it back next time. For a week that works. Then four things break.

**Concurrent access.** Two programs share this folder. If both rewrite `jobs.json`, the last one to finish silently erases the other's work. A **database** — a library or program whose job is storing data safely and answering questions about it — arbitrates that.

**Partial reads.** "Which jobs did I see in the last 14 days?" means parsing the whole file, even for three rows out of four thousand.

**Indexes.** Finding one job by id in a file means scanning every job.

**Atomicity.** *Atomic* means all-or-nothing. Lose power halfway through writing `jobs.json` and you have invalid JSON — you lost everything, not just the last change.

The project uses both, deliberately. SQLite is working memory; the JSON file in `src/publish.js` is a snapshot replaced whole. Use a file when the whole thing is the unit. Use a database when parts of it are.

## 6.2 The relational model

Think of a **railway reservation chart** on a coach door. A grid: one line per passenger, one vertical strip per fact about every passenger. That is a table.

- A **table** is a named grid — one per kind of thing you store.
- A **row** is one item: one passenger, one job.
- A **column** is one named field every row has: `title`, `posted_at`.
- A **type** constrains what a column holds. SQLite's are `TEXT`, `INTEGER`, `REAL` (decimals), `BLOB` (raw bytes) and `NULL`.
- **NULL** means "no value" — not zero, not empty string. Unknown. `stipend_min` is NULL when the posting never mentioned money. `0` would mean unpaid. Different facts.
- The **schema** is the full written description of tables, columns, types and rules.

A **primary key** is the column uniquely identifying a row; no two rows may share it. Here, `job_id TEXT PRIMARY KEY` — LinkedIn's own id for a posting. Using an id the outside world already assigns means the same job found by two searches makes one row, not two.

A **foreign key** is a column holding another table's primary key, which is how tables link. `jobs.first_run_id` holds a `runs.run_id`: many jobs to one run, a one-to-many **relationship**.

**Normalisation** is storing each fact once and pointing at it. Copy a run's start time into every job row and correcting it means correcting hundreds of rows; miss one and you have two contradictory answers. The trade-off: normalising makes writes safe and reads more work. Every duplicated column is a promise to update it everywhere.

## 6.3 SQL: five statements do almost everything

**SQL** (Structured Query Language) is how you talk to a relational database. You describe the result; the engine works out how. These are *made-up examples, not from the project*:

```sql
CREATE TABLE students (roll_no TEXT PRIMARY KEY, name TEXT NOT NULL, marks INTEGER);
INSERT INTO students (roll_no, name, marks) VALUES ('21CS01', 'Asha', 88);
SELECT name, marks FROM students WHERE marks >= 60 ORDER BY marks DESC LIMIT 10;
UPDATE students SET marks = 91 WHERE roll_no = '21CS01';
DELETE FROM students WHERE roll_no = '21CS01';
```

`NOT NULL` forbids an empty value. In the `SELECT`: `WHERE` filters rows, `ORDER BY ... DESC` sorts highest first, `LIMIT` caps the count. Those four clauses cover most reads you will ever write. **Forget `WHERE` on an `UPDATE` or `DELETE` and you change or destroy every row. There is no undo.**

These four map onto **CRUD** — Create, Read, Update, Delete, the four operations any store needs, in that order.

A **JOIN** stitches two tables on a matching column:

```sql
SELECT jobs.title, runs.started_at
FROM jobs JOIN runs ON runs.run_id = jobs.first_run_id;
```

For each job, find the run with that id, return one combined row. That is an inner join — rows with no match vanish. A `LEFT JOIN` keeps every left-hand row and fills the right with NULL, which you want when "no match" is a real answer.

**GROUP BY** collapses many rows into one per group. Real, at `src/store.js:279`:

```js
const rows = this.db.prepare('SELECT status, COUNT(*) AS n FROM company_ids GROUP BY status').all();
```

One row per distinct `status`, `n` being how many had it. `COUNT(*)` is an **aggregate function**: many rows in, one number out. `SUM`, `AVG`, `MIN`, `MAX` are the others.

## 6.4 Indexes and B-trees

Without an index, `WHERE job_id = '390...'` reads every row until it matches — a **full table scan**. Fine at 50 rows. Fatal at 500,000.

An **index** is a second, sorted copy of chosen columns with a pointer back to the full row. The structure is a **B-tree**: a shallow, wide, sorted tree. Think of the index at the back of a textbook — you do not read the book to find "recursion", you flip to R and it says page 214. A B-tree does that repeatedly, so finding one row in a million takes three or four hops.

It helps `WHERE`, `ORDER BY` and `JOIN` on the indexed columns. It costs disk space, since it is a real copy; write speed, since every insert, update and delete must maintain it; and nothing at all when the query does not match it.

Three exist, at `src/store.js:42`:

```sql
CREATE INDEX IF NOT EXISTS idx_jobs_first_seen ON jobs(first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_reported   ON jobs(reported, first_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company    ON jobs(company_matched);
```

The first serves `recentJobs(sinceMs)`, which filters and sorts on `first_seen_at`. The second is a **composite index** — several columns in order — serving `unreportedJobs()`. Column order matters: it serves `WHERE reported = 0`, but not `first_seen_at` alone, just as a phone book sorted by surname cannot find everyone named Rohit. `IF NOT EXISTS` is why the constructor can safely run the whole schema on every start.

Honest note: at a few thousand rows none of these is load-bearing yet. They are cheap insurance. On a write-heavy table, speculative indexes would be a mistake.

## 6.5 Transactions and ACID

A **transaction** is a group of statements the database treats as one indivisible unit — all take effect, or none. The classic case is moving money: subtract 500 here, add 500 there. Crash between them and money evaporates.

The guarantees are **ACID**: **Atomicity** (all-or-nothing), **Consistency** (declared rules never break), **Isolation** (concurrent transactions do not see each other's half-finished work), **Durability** (once committed, it survives a power cut).

In SQLite every statement outside an explicit transaction is implicitly wrapped in its own. So `store.js` gets atomicity per statement free. Where that is not enough, `src/store.js:463`:

```js
markReported(jobIds) {
  const stmt = this.db.prepare('UPDATE jobs SET reported = 1 WHERE job_id = ?');
  for (const id of jobIds) stmt.run(id);
}
```

One transaction per id. Die partway through 40 ids and 17 are marked, 23 are not. Wrapping the loop in `BEGIN`/`COMMIT` would make all 40 land together and be faster, since SQLite would flush once rather than forty times. This is a real weakness. It survives because `reported` only affects the local run report, so the worst case is a job listed twice.

The constructor sets two pragmas — a **pragma** being a SQLite command that changes engine behaviour, not data (`src/store.js:94`):

```js
this.db.exec('PRAGMA journal_mode = WAL');
this.db.exec('PRAGMA foreign_keys = ON');
```

**WAL** is write-ahead log: changes are appended to a separate log and folded back later, so readers do not block the writer. That matters when you open the file in a viewer while a scheduled run writes. `foreign_keys = ON` enables enforcement, which is off by default — but this schema declares no `REFERENCES` clauses, so it currently enforces nothing. Do not claim the project enforces referential integrity. It sets a correct default in advance.

## 6.6 Prepared statements and the `?`

Every query has the same shape: `prepare(...)` then `.run()`, `.get()` or `.all()`. At `src/store.js:317`:

```js
hasJob(jobId) {
  return !!this.db.prepare('SELECT 1 FROM jobs WHERE job_id = ?').get(jobId);
}
```

A **prepared statement** is a query with holes. `?` is a **placeholder**: the SQL text is sent, parsed and planned once, then values are supplied separately. `.run()` returns metadata like `{ changes }`; `.get()` returns the first row or `undefined`; `.all()` returns an array. `SELECT 1` selects a constant — you only want to know whether a row exists, and `!!` turns row-or-undefined into true/false.

Now the reason. Suppose you pasted the value in — *made-up, never write this*:

```js
db.exec(`SELECT * FROM jobs WHERE job_id = '${jobId}'`);
```

If `jobId` were `x'; DROP TABLE jobs; --`, the database receives `SELECT * FROM jobs WHERE job_id = 'x'; DROP TABLE jobs; --'` and your data is gone. That is **SQL injection**: supplied text escaping the data slot and executing as commands — among the oldest and still most common serious web vulnerabilities.

Placeholders kill it structurally. The value never reaches the SQL parser; the statement's shape is fixed before any string arrives, so that text can only be a very odd job id matching nothing. Not escaped: *unable to be code*.

"But it is a LinkedIn id, not user input." That id came off a scraped page, and the discipline of this project is not trusting pages. More importantly the habit is the defence: code that concatenates "only where it's safe" gets copied somewhere it is not. Every query in `store.js` uses `?`, with zero exceptions.

Placeholders cannot parameterise table or column *names* — only values. That is why `#migrate()` builds its `ALTER TABLE` text from a hardcoded array in the source file.

## 6.7 SQL vs NoSQL, honestly

**NoSQL** is a loose family of non-relational databases: document stores (MongoDB), key-value stores (Redis), wide-column (Cassandra), graph (Neo4j). The honest case for them: no schema to declare up front so early iteration is fast, documents always read together are stored together, and several spread across machines more easily. The honest case against: a schema is a contract that catches mistakes at write time instead of at read time months later, joins let you ask questions you did not anticipate, and SQL transfers to every job you will ever have.

This project is emphatically relational:

1. The data is uniformly tabular — every job has the same fields.
2. Every query is a relational query: filter, sort, group, count.
3. There are genuine relationships — jobs to runs, names to LinkedIn company ids.
4. Scale is a few thousand rows on one laptop, so horizontal scale is not the problem.
5. A relational option ships inside the runtime; MongoDB would be a server to install, run, secure and back up.

In a project whose defining constraint is exactly one npm dependency, that points one way.

## 6.8 SQLite, and `node:sqlite`

Most databases you hear of — PostgreSQL, MySQL, MongoDB — are **servers**: separate long-running programs your code talks to over a network connection, with a port, a username and a password.

**SQLite is a library, not a server.** It runs inside your program. No process, no port, no password. The whole database is one ordinary file, here at `PATHS.db`. Copy the file and you copied the database. It is very probably the most deployed database in the world — every Android phone, every iPhone, every major browser, macOS.

Its limits are real. **One writer at a time**: WAL lets readers continue, but two simultaneous writers means one waits or errors. **No network access**: a program on another machine cannot connect, which is exactly why the site reads a published JSON file instead of the database. **No users or permissions**: access control is whoever can read the file. **Weak typing by default**: it will store `"hello"` in an `INTEGER` column unless you opt into strict tables.

For a single-user tool on one Mac, none of these bite. And Node 22 ships SQLite **in the runtime itself**, which is line 1 of the store:

```js
import { DatabaseSync } from 'node:sqlite';
```

`node:` means built-in, not from `node_modules`. `DatabaseSync` is the synchronous class: calls block until done, no promises. For a batch script that is correct — a local read takes microseconds, and synchronous code is far easier to reason about.

The old way was the `better-sqlite3` package, a **native module**: C++ that must compile against your exact Node version on install. Native modules break on Node upgrades, need build tools, and cause "works on my machine". The builtin removes an npm dependency, a compile step and a whole class of failure. The cost, honestly: `node:sqlite` needs Node 22+ and was experimental for a while, so the API can shift between versions.

## 6.9 The real schema

The schema is one template string at `src/store.js:4`, executed in the constructor. The main table, abridged from `src/store.js:5`:

```sql
CREATE TABLE IF NOT EXISTS jobs (
  job_id            TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  company           TEXT,
  company_matched   TEXT,
  posted_text       TEXT,
  posted_at         INTEGER,
  salary_text       TEXT,
  stipend_min       REAL,
  stipend_max       REAL,
  easy_apply        INTEGER DEFAULT 0,
  description       TEXT,
  is_tech           INTEGER,
  role_source       TEXT,
  first_seen_at     INTEGER NOT NULL,
  last_seen_at      INTEGER NOT NULL,
  first_run_id      TEXT,
  reported          INTEGER DEFAULT 0
);
```

Grouped by why each exists.

**Identity.** `job_id` is LinkedIn's id and the primary key. `title` is `NOT NULL`, because a posting with no title is not a posting.

**Two company columns.** `company` is what the posting literally said; `company_matched` is which watchlist entry the matcher decided that means. Keeping both lets you later ask whether the matcher was right — and `publish.js` does exactly that, re-running the match at publish time rather than trusting the stored label.

**Raw text beside parsed value.** `posted_text` ("2 weeks ago") next to `posted_at` (a number). `salary_text` ("₹20,000/month") next to `stipend_min`, `stipend_max`, `stipend_currency`, `stipend_period`. Parsing is guesswork; keeping the original means a parser bug is fixable later from stored data instead of a re-scrape. It costs a little disk and is worth it every time.

**Booleans as `INTEGER`.** SQLite has no boolean type, so 0 and 1 are the convention. Note `is_tech` has no default: it is NULL until classified, a genuine three-state field — yes, no, not yet decided.

**Enrichment columns.** `bullets`, `degree_level`, `degree_text`, `key_skills`, `stipend_status` stay NULL until the Gemini pass runs. That is what makes a work queue possible.

**Provenance.** `role_source` records *who* decided `is_tech` — offline classifier, model, or backfill. When a job is in the wrong tab, this answers why.

Two supporting tables. `runs` (`src/store.js:46`) is one row per execution, with `started_at`, `finished_at`, `status`, counters like `cards_seen` and `new_jobs`, and an `error` column. That turns "the site looks stale" into an answerable question. `seen_cards` (`src/store.js:59`) is a cheap ledger of postings seen in a list but deliberately *not* opened — wrong company, wrong title. Opening a job page costs seconds and risk; recording that you already judged this card costs nothing, and it feeds `skippedByRole()` and `topSkippedCompanies()`, which are how the watchlist gets tuned from evidence. Storing your rejections, not just your accepts, is a small idea that pays repeatedly.

Also `settings`, a key-value table holding the cooldown after LinkedIn rate-limits the session, and `company_ids`, caching a watchlist name to LinkedIn's numeric id with a `status` and `attempts` so a hopeless name is settled after three tries instead of retried forever.

## 6.10 Migrations, and why they only add

Your schema will change, but the database file on disk was created by an older version and is full of data you cannot lose. Reconciling the two is a **migration**. `src/store.js:101`, abridged:

```js
/** Additive migrations for databases created by an earlier version. */
#migrate() {
  const jobCols = this.db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  for (const [name, type] of [
    ['logo_url', 'TEXT'], ['is_tech', 'INTEGER'], ['role_source', 'TEXT'],
    ['bullets', 'TEXT'], ['degree_level', 'TEXT'], ['degree_text', 'TEXT'],
    ['key_skills', 'TEXT'], ['stipend_status', 'TEXT'],
  ]) {
    if (!jobCols.includes(name)) {
      this.db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${type}`);
    }
  }
}
```

`PRAGMA table_info(jobs)` asks SQLite to describe the table; `.all()` gives one row per column and `.map` reduces that to names. Then: for each column this version expects, add it if missing. `#migrate` with a leading `#` is a **private method** — JavaScript syntax meaning only code inside the class can call it, so nothing external can trigger a schema change.

`CREATE TABLE IF NOT EXISTS` is not enough on its own. It creates missing tables; it does nothing to a table that exists with the *wrong shape*. An old database already has `jobs`, so the `CREATE` is a no-op and `key_skills` would never appear.

**Why additive.** Adding a column is safe in both directions: existing rows get NULL, old code ignores it, new code handles the NULL — which is exactly what `bullets IS NULL` relies on. Removing or renaming breaks any older code still expecting it, and the data is unrecoverable. The safe removal is two releases: ship code that stops reading the column, then drop it later.

Honest limitation: this pattern has no version number. It infers state by inspecting the database, which works for adding columns and would not work for splitting `location` into `city` and `country`. A production system uses numbered migration files and a `schema_version` table. For one database on one Mac, inspect-and-add is proportionate — and there is no down-migration, so the rollback story is "restore from a backup".

## 6.11 The queries that carry the project

**The work queue** — `src/store.js:124`:

```js
needingEnrichment(limit = 500) {
  return this.db.prepare(`
    SELECT job_id, title, company, description, salary_text AS stipend
    FROM jobs
    WHERE bullets IS NULL AND length(description) > 200
    ORDER BY first_seen_at DESC
    LIMIT ?
  `).all(limit);
}
```

`bullets IS NULL` means "not yet enriched". You must write `IS NULL`, never `= NULL`, because comparing anything to NULL yields unknown, not true. `length(description) > 200` skips postings too short to spend an API call on. Newest first, so if the batch limit bites you lost the stale ones. `AS stipend` renames a column so the caller sees the name it expects. Because enriched rows have non-NULL `bullets`, they are never re-sent — the database itself is the record of what has already been paid for.

**Saving the result** — `src/store.js:142`:

```js
saveEnrichment(jobId, e, source = 'gemini-enrich') {
  this.db.prepare(`
    UPDATE jobs SET
      bullets = ?, degree_level = ?, degree_text = ?, key_skills = ?, stipend_status = ?,
      is_tech = COALESCE(?, is_tech),
      role_source = CASE WHEN ? IS NULL THEN role_source ELSE ? END
    WHERE job_id = ?
  `).run(/* ... */);
}
```

`COALESCE` returns its first non-NULL argument. So if the caller has a verdict, write it; if it passes NULL, keep what is stored. The `CASE WHEN ? IS NULL` does the same for provenance. Together: **a call with no opinion cannot erase an opinion you already had.** Without it, one enrichment pass that failed to classify would wipe a correct earlier verdict and the job would silently move to the wrong tab. Placeholders are positional, which is why `isTech` is tested and passed twice.

**Reading for publication** — `src/store.js:468`, and the function every read passes through at `src/store.js:482`:

```js
recentJobs(sinceMs) {
  return this.db.prepare(
    'SELECT * FROM jobs WHERE first_seen_at >= ? ORDER BY first_seen_at DESC',
  ).all(sinceMs).map(hydrate);
}

function hydrate(row) {
  return { ...row, skills: row.skills ? JSON.parse(row.skills) : [], easy_apply: !!row.easy_apply };
}
```

**Hydration** is turning a raw storage row back into the object the program wants. Two conversions: parse `skills` back into a real array (empty array if NULL), and turn `easy_apply`'s 0/1 into true/false. `{ ...row, ... }` is object spread — copy every field, then override those two. Doing this in one shared function means the rest of the codebase never has to remember that skills are stored as text. The boundary is one line long and everything crosses it.

## 6.12 Two shortcuts, and when each is acceptable

**Timestamps as integers.** Every time here is `INTEGER`, written as `Date.now()` — **epoch milliseconds**, the count since 1 January 1970 UTC. Not an ISO string; SQLite has no `DATETIME` type anyway.

You gain integer maths for comparison and sorting, no time zones, no format ambiguity about whether `03/04` is March or April, and a value JSON carries unchanged — which is why `publish.js` copies `postedAt` straight through and lets browser JavaScript format it in the reader's own locale. You lose human readability (`1753600000000` means nothing at a glance) and the original zone: you know the instant, not that the posting said "9am" in Bengaluru. Acceptable when you care about instants and ordering and formatting happens at the edges. Not acceptable when you need calendar semantics — "every Tuesday in the user's local time" — or humans read the database directly.

**JSON inside TEXT columns.** `skills`, `bullets` and `key_skills` are lists, but a column holds one value. The project **serialises** them — turns a structure into a string — with `JSON.stringify` on write, `JSON.parse` on read.

The purist alternative is a `job_skills` table, one row per (job, skill). That buys indexed `WHERE skill = 'Python'` and a `GROUP BY` ranking of what employers want. The project needs neither: nothing queries *inside* those arrays. They are written whole, read whole by `hydrate`, rendered whole on a card. A join table would add a join to every read to reassemble a list always wanted entire.

So: acceptable when the blob is opaque to your queries and always read entire. Not acceptable the moment you filter, aggregate or index by an element — and `WHERE skills LIKE '%SQL%'` is not the fix, because it cannot use an index and it matches MySQL, NoSQL and SQLite too. The escape hatch is SQLite's `json_each` plus an expression index. Note `publish.js` re-parses these defensively at `src/publish.js:23` with `try`/`catch` and an `Array.isArray` check, because a column holding a string can hold a malformed string.

## 6.13 What the database keeps and the site never sees

The `jobs` table holds the employer's full `description`. It is genuinely useful: enrichment reads it, `descriptionFor(jobId)` hands it to the classifier for ambiguous titles, and `needingEnrichment` filters on its length.

It is not published. The last line of `toPublicJob`, `src/publish.js:74`:

```js
// Only carried when explicitly enabled; the tailor endpoint works fine
// from the summary and skills alone.
description: includeFullDescription ? row.description : null,
```

That flag is `!!cfg.publish?.includeFullDescription` — absent means false, so it is off unless deliberately turned on. The reason is in the comment above the function at `src/publish.js:13`: the description is the posting company's copyrighted text, and republishing it wholesale is a far bigger exposure than showing your own summary and linking to the source. The site gets `summary`, model-written `bullets`, the hard facts, and an apply link to the real posting.

Recognise the shape, because it recurs: **local storage and public republication are different acts with different rules.** This project keeps everything it needs and publishes only what it can defend. It is a mitigation, not immunity — as Chapter 9, *Shipping It*, covers, scraping LinkedIn remains against their terms of service.

## Chapter summary

- A plain file cannot give you safe concurrent access, partial reads, indexed lookups or atomic writes; a database gives you all four, which is why working data lives in SQLite even though the published snapshot is a JSON file.
- The relational model is tables of typed rows and columns, a primary key that uniquely identifies each row, and foreign keys that link tables.
- `CREATE TABLE`, `INSERT`, `SELECT` with `WHERE`/`ORDER BY`/`LIMIT`, `UPDATE` and `DELETE` cover almost everything and map exactly onto CRUD.
- An index is a sorted B-tree copy of chosen columns that turns a full scan into a few hops, paid for in disk and write speed — so you add one because a named query needs it.
- A transaction makes statements all-or-nothing; ACID names the four guarantees, and SQLite gives you one implicit transaction per statement for free.
- Every query in `src/store.js` uses `?` placeholders, making SQL injection structurally impossible because supplied text never reaches the SQL parser.
- SQLite is a library inside your process and one file on disk, and `node:sqlite` ships inside Node 22 — no native module to compile, no dependency to install.
- `#migrate()` inspects the live schema with `PRAGMA table_info` and adds only missing columns; migrations must be additive because adding is safe for old code and old data while removing is not.
- `saveEnrichment` uses `COALESCE(?, is_tech)` so a call with no opinion cannot erase a stored verdict — one word against a silent bug.
- Timestamps are epoch-millisecond integers and lists are JSON in TEXT columns; both are right here and both stop being right the moment you need calendar semantics or queries inside the list.

## Key takeaways

A database is not a fancier file — it is a set of guarantees about concurrency, atomicity and lookup speed you cannot get from a file without badly rebuilding a database. Learn SQL properly once: `SELECT`/`WHERE`/`ORDER BY`/`JOIN`/`GROUP BY` outlives every framework, and `?` placeholders are non-negotiable, always. SQLite proves "no server" is a legitimate architecture, and `node:sqlite` proves the strongest dependency is the one already in the runtime. Schema design is where you decide which future questions are cheap: normalise what you will query, serialise what you only ever read whole, and be able to say which you did and why.

## Interview questions

**1. Why a database here instead of a JSON file?**
Four reasons. Concurrency: two programs share the folder, and both rewriting one file loses work silently. Partial reads: `recentJobs` wants a fortnight of rows, not a full parse of everything ever seen. Indexed lookup: `hasJob(jobId)` runs against every card on every page of every run and must not be a linear scan. Atomicity: a crash mid-write to JSON can leave unparseable garbage and lose the whole dataset. The project still writes a JSON file in `publish.js`, but that is a snapshot replaced whole — exactly the case a file suits.

**2. What is a primary key, and why is `job_id` a good one?**
It is the column that uniquely identifies a row, with uniqueness enforced by the database. `job_id` is LinkedIn's own id, so the same posting found through two different searches produces one row rather than two duplicates needing reconciliation later. A key that comes from outside is a natural key, and its value is that it lets you recognise something you have seen before. The alternative — an auto-incrementing number — would force a fragile uniqueness rule on title-plus-company. The trade-off is that you inherit someone else's id format and are stuck if they change it.

**3. Explain what an index is and what it costs.**
An index is a sorted B-tree over chosen columns with pointers back to the rows, so a search narrows in a few hops instead of scanning everything. It speeds up `WHERE`, `ORDER BY` and joins on those columns. It costs disk, because it is a real second copy, and write speed, because every insert, update and delete must maintain it. It is useless for queries that do not match its leading columns — `idx_jobs_reported` on `(reported, first_seen_at)` cannot serve a filter on `first_seen_at` alone. Honestly, at this project's scale the three indexes are cheap insurance rather than a measured necessity, and I would say that rather than overclaim.

**4. What is SQL injection and how does this codebase prevent it?**
It is external text escaping the data slot of a query and executing as SQL, letting an attacker read or destroy data. Prevention here is that every query uses `?` placeholders with a prepared statement: the SQL is parsed and planned before any value arrives, so a value can never become a command. That is structural, not escaping — there is no clever input that gets through. Placeholders cannot parameterise table or column names, which is why `#migrate()` builds `ALTER TABLE` strings only from a hardcoded array. The habit matters more than any one query being safe, because concatenated SQL gets copied to places where input is not trusted.

**5. Why SQLite instead of PostgreSQL or MongoDB?**
SQLite is a library inside the process with the whole database in one file — no server to install, run, secure or back up, which for a tool running every hour on one Mac would be pure overhead. It is also built into Node 22, so it costs zero npm dependencies and no native compilation, which matters when the whole dependency list is `playwright-core`. Postgres would win the moment several machines needed concurrent writes or the data outgrew one disk. MongoDB is the wrong axis: the data is uniformly tabular and every query is relational. I would move to Postgres if this became multi-user, and I would call that a real ceiling rather than pretend SQLite scales forever.

**6. `node:sqlite` was experimental. Isn't building on an unstable API reckless?**
It is a genuine risk. The API can change between Node versions, and for a library published to others that would be disqualifying. Three things make it acceptable: the surface used is tiny — `DatabaseSync`, `prepare`, `run`/`get`/`all`, `exec`; the deployment is one machine whose Node version the author controls; and the whole database layer sits behind one class, so swapping to `better-sqlite3` is one file with the same method signatures. The alternative had its own cost: a native module that compiles on install and breaks on every Node upgrade. I traded a stable-but-fragile dependency for an unstable-but-zero-install builtin, with an exit route.

**7. Walk me through `saveEnrichment`. Why the `COALESCE`?**
It is one `UPDATE` writing the model's output onto an existing row. `bullets`, `degree_level`, `degree_text`, `key_skills` and `stipend_status` are assigned directly. But `is_tech` uses `COALESCE(?, is_tech)`, which returns the first non-NULL argument, so a caller with no verdict keeps the stored one; `role_source` gets the same protection via `CASE WHEN ? IS NULL`. That is why `isTech` is tested twice and passed twice — placeholders are positional. Without it, an enrichment pass that failed to classify would overwrite a correct verdict with NULL and the job would quietly appear in the wrong tab on the site.

**8. Why must migrations be additive?**
Adding a column is safe both ways: existing rows get NULL, old code ignores it, new code handles the NULL — which is exactly what `bullets IS NULL` in `needingEnrichment` depends on. Dropping or renaming breaks any code still expecting the column, and the data is gone with no rollback. Safe removal is two releases: first stop reading it, then remove it. This project's `#migrate()` infers state from `PRAGMA table_info` rather than tracking a version number, which works for adding columns and would not work for restructuring one into two. A production system would use numbered migration files and a `schema_version` table; I would name that limitation rather than defend inspect-and-add as best practice.

**9. Hostile: JSON in TEXT columns is just denormalised data. Isn't that a design smell?**
It is a denormalisation and I would not call it anything else. The proper form is a `job_skills` table with one row per (job, skill), giving indexed `WHERE skill = 'Python'` and a `GROUP BY` ranking of demand. It is acceptable here because nothing queries inside those arrays — they are written whole, read whole by `hydrate`, and rendered whole on a card, so a join table would add a join to every read to rebuild a list always wanted entire. The moment a requirement appears to filter or count by individual skill, this becomes wrong, and the fix is the join table or `json_each` with an expression index. `LIKE '%SQL%'` would not be a fix: no index, and it matches MySQL and SQLite too.

**10. Hostile: `markReported` loops one statement at a time with no transaction. Isn't that inconsistent data waiting to happen?**
The criticism is correct. Each `stmt.run(id)` is its own implicit transaction, so a crash partway leaves some ids marked and some not, and it flushes to disk once per id instead of once per batch. Wrapping the loop in `BEGIN`/`COMMIT` fixes both correctness and speed, and that is the change I would make. What softens it is blast radius: `reported` only controls whether a job appears in the local run report, so the worst outcome is a job listed twice, not lost or corrupted data. It stayed because it was never the bottleneck — that is an explanation, not a justification.

**11. Hostile: you set `PRAGMA foreign_keys = ON` but declare no foreign keys. What is that actually doing?**
Nothing, today. SQLite disables foreign key enforcement by default for backwards compatibility, so enabling it at connection time is a correct default — but no table declares a `REFERENCES` clause, so there is no constraint to enforce. `jobs.first_run_id` holds a `runs.run_id` and is a foreign key in intent only; nothing prevents a job pointing at a run that does not exist. I would not claim this project enforces referential integrity. The honest description is that the mechanism is on so any constraint added later is enforced from the first run, and the relationship is currently maintained by application code.

**12. Why store full job descriptions but not publish them?**
The description is the employer's copyrighted text. Storing it locally is what makes the tool work: enrichment reads it, `descriptionFor` gives it to the classifier for ambiguous titles, and `needingEnrichment` filters on its length. Republishing it wholesale on a public site is a different act with far larger exposure than an own-words summary plus a link to the source. So `toPublicJob` at `src/publish.js:74` sets `description` to `null` unless `cfg.publish.includeFullDescription` is explicitly enabled, and the site ships the summary, the generated bullets, the hard facts and an apply link. Students lose nothing they need. It narrows the project's exposure; it does not remove it, since the scraping itself is still against LinkedIn's terms.

## Common beginner mistakes

**Building SQL by string concatenation.** It reads more naturally than `?` and a separate argument, and works perfectly in testing. In production any value containing a quote breaks the query or executes as SQL — a name like `O'Brien` is enough to expose it. **Fix:** always `prepare` with `?`. There is no exception for "trusted" input.

**Writing `= NULL` instead of `IS NULL`.** It looks like every other comparison. It silently returns zero rows, because comparing to NULL yields unknown rather than true — so the enrichment queue looks empty and nothing is ever enriched. **Fix:** `IS NULL` and `IS NOT NULL`; nothing else works.

**`UPDATE` or `DELETE` without a `WHERE`.** You test it in a console, forget the filter, and run it. It succeeds, reports a large number of changed rows, and there is no prompt and no undo. **Fix:** write the filter first, run it as a `SELECT` to see which rows match, then convert it.

**Indexing everything.** Indexes make reads faster, so more seems better. Each one adds work to every write plus disk, for queries that may never run. **Fix:** add an index when a specific query needs it, and be able to name that query.

**Destructive migrations.** Renaming `skills` to `skill_list` feels like tidying and works on the developer's empty database. The four-month-old database still has the old column, new code queries the new name, and every read fails — or the column is dropped and the data is gone. **Fix:** only add; remove across two releases.

**Forgetting the hydration boundary.** You read a row and call `row.skills.map(...)`, because elsewhere skills are an array. At runtime it is the string `'["Python","SQL"]'` and `.map` is not a function. **Fix:** send every read through one converter — here `hydrate` at `src/store.js:482`.

## Exercises

1. **Read the schema back.** For `posted_at`, `is_tech` and `reported`, write down the type, whether it can be NULL, and what a NULL means in that specific column. Check yourself against 6.9.

2. **Write four queries.** Against `jobs`: (a) count jobs per `company_matched`, highest first; (b) the ten most recent jobs where `stipend_min` is not NULL; (c) distinct `location` values for tech jobs only; (d) jobs seen in the last seven days that have never been enriched. Use `?` for every value, then say which of the three declared indexes each could use.

3. **Add a column properly.** To add `notes TEXT` to `jobs`, write the exact change to `SCHEMA` *and* to `#migrate()`. Explain which one being missing is a bug on a fresh machine, and which is a bug on the author's existing database.

4. 🔴 **Make `markReported` atomic, and audit `seedCompanyNames`.** Rewrite `markReported` (`src/store.js:463`) so all updates commit together, using `this.db.exec('BEGIN')`/`COMMIT` with a `ROLLBACK` on error. Then look at `seedCompanyNames` (`src/store.js:228`): it runs a `SELECT 1` before each insert purely to count new rows. Given that `.run()` returns a `changes` count and the insert uses `ON CONFLICT(name) DO NOTHING`, rewrite it without the extra query and say what you would test to be sure the count is still right.

## Quiz

1. Name two things a database gives you that a plain JSON file cannot.
2. What is the difference between `NULL` and `0` in `stipend_min`?
3. Why does `needingEnrichment` use `bullets IS NULL` and not `bullets = NULL`?
4. What does `COALESCE(?, is_tech)` do, and what bug does it prevent?
5. Give one thing an index costs you.
6. Why does `publish.js` set `description` to `null` by default?

---

### Quiz answers

1. Any two of: safe concurrent access from more than one process; reading part of the data without parsing all of it; indexed lookup instead of scanning every record; atomic writes that survive a crash mid-write.
2. `NULL` means the stipend is unknown — the posting never said. `0` would mean a stated stipend of zero, i.e. unpaid. Conflating them would publish "unpaid" for every job that simply did not mention money.
3. Because comparing any value to `NULL` with `=` yields unknown rather than true, so `bullets = NULL` matches no rows and the enrichment queue would always look empty. `IS NULL` is the only test that works.
4. It returns the first non-NULL argument, so a real verdict is written and a NULL leaves the existing `is_tech` untouched. It prevents an enrichment pass that failed to classify from erasing a correct earlier verdict and silently moving the job to the wrong tab.
5. Disk space for the second copy; slower writes because every insert, update and delete must maintain it; or wasted effort when no query matches its columns.
6. The description is the employer's copyrighted text. It is kept locally because enrichment and classification need it, but republishing it wholesale is a much larger exposure than publishing an own-words summary plus a link to the original posting.
