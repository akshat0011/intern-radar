# Chapter 1 — What Is Software?

> By the end of this chapter you will be able to explain, without hand-waving, what happens between a switch flipping inside a chip and a job listing appearing on a web page — and you will be able to point at the exact files in this project where each of those ideas lives.

**Before this chapter you should have read:** nothing. This is the first chapter of the book. It assumes you have used a computer and a phone, and nothing else.

**New words introduced here:** transistor, bit, binary, byte, CPU, machine code, instruction set, clock speed, memory, RAM, volatile, storage, disk, file, filesystem, path, directory, operating system, kernel, process, process ID, program, software, application, source code, programming language, syntax, compiler, interpreter, bytecode, virtual machine, JIT compilation, runtime, Node.js, V8, terminal, shell, command, npm, script, dependency, library, package, database, SQLite, client, server, port, localhost, network, internet, protocol, HTTP, request, response, browser, static site, deploy.

---

## 1.1 A machine that can only say yes or no

Start below the software. Start at the electricity.

Inside your laptop there is a small square of silicon called a chip. Inside that chip are switches. Not switches you can see — they are far too small — but switches in the ordinary sense: a thing that is either on or off, letting current through or not letting it through.

The switch is called a **transistor** — a tiny electronic switch with no moving parts, controlled by another electrical signal rather than by a finger. That last part is the whole trick. A light switch in your room needs a hand. A transistor is switched by electricity, which means one transistor can switch another, which means switches can control switches, in chains, forever, with nobody touching anything.

A modern laptop chip has on the order of ten to a hundred billion of them. That number is not a boast; it is the reason everything else in this book is possible. If you have billions of switches, and each one can be flipped by another one, you can build machinery that does arithmetic, that remembers, that compares, that decides.

Here is the uncomfortable truth you have to accept early: **the computer has no idea what anything means.** It cannot see a photograph. It cannot read a word. It has current, or it has no current. Everything else — this chapter, the photo of your friend, the internship listing on `internradar.online` — is a human interpretation laid on top of "current / no current". The gap between "a switch is on" and "a job at Google appeared on my screen" is not a gap of magic. It is a gap of *layers*. Each layer is simple. There are just a lot of them, and this chapter walks up the whole staircase.

> **Analogy — the hostel corridor.** Picture the corridor of a hostel with a hundred rooms. Every room's light is either on or off. Standing at the end of the corridor you cannot read anybody's mind, but if the whole floor agrees in advance — "lights on in rooms 1 and 3, off elsewhere, means the mess is serving dinner" — then a pattern of on/off lights carries a message. Nothing about the bulbs changed. The *agreement* did all the work. Every layer above this one is a more elaborate agreement about what patterns mean.

**What came before.** Before transistors, computers used vacuum tubes: glass bulbs the size of your thumb that did the same on/off job. A 1946 machine called ENIAC used about 17,000 of them, filled a room, and one tube burning out took the whole machine down. The transistor did not add a new idea. It made the same idea small, cheap and reliable enough to stack billions high.

---

## 1.2 Counting with two fingers

If a switch has two states, then the natural way to write down what a computer holds is a number system with two digits.

A **bit** is a single on/off value, written as `1` or `0`. That is the smallest piece of information a computer can hold — one switch's worth.

**Binary** is counting using only `0` and `1`. You already know how to count in ten digits: in the number 407, the 4 means four hundreds, the 0 means zero tens, the 7 means seven ones, because each position is worth ten times the position to its right. Binary is the same rule with two instead of ten. Each position is worth twice the position to its right: 1, 2, 4, 8, 16, 32, and so on.

So `1011` in binary is:

```
 1     0     1     1
 8  +  0  +  2  +  1   =  11
```

That is all binary is. There is no deeper secret. It is ordinary counting where you run out of digits sooner.

A **byte** is eight bits treated as one unit. Eight bits give 2 × 2 × 2 × 2 × 2 × 2 × 2 × 2 = 256 different patterns, so a byte can hold any number from 0 to 255. The byte became the standard chunk size because 256 patterns is roughly enough for the letters, digits and punctuation of a written language, with room to spare.

Once you have bytes, you need agreements about what a byte *means*. Two of them matter for this book:

- **Text.** There is a table that says the byte with value 72 means the letter `H`, 101 means `e`, and so on. The old table is called ASCII; the modern, much larger one that covers Devanagari, Tamil, emoji and everything else is called Unicode, usually stored in a scheme called UTF-8. You will see `charset=utf-8` written down in this project's own code, at `web/serve.js:22`, where the server tells a browser "the bytes I am sending you are text, decoded using UTF-8".
- **Numbers.** A number is stored as its binary form directly.

The same byte can be a letter, a number, part of a colour, or part of a sound. Nothing in the byte says which. The meaning always comes from the program that reads it. Hold on to that sentence — it explains half the bugs you will ever write.

Here is that idea made concrete inside this very project. The watcher's database lives in a single file. Ask the computer to show you the first sixteen bytes of that file and you get:

```
00000000: 5351 4c69 7465 2066 6f72 6d61 7420 3300  SQLite format 3.
```

On the left are the raw bytes written in a shorthand called hexadecimal. On the right is the same sixteen bytes read as text, using the table above: `SQLite format 3` followed by a byte with value zero. The file did not change between the left column and the right column. Only the *interpretation* changed. That file is discussed properly in Chapter 14, *Databases and SQLite*; for now it is just a very good demonstration that files are bytes and meaning is an agreement.

---

## 1.3 The CPU: an extremely fast clerk

Now put the switches to work.

The **CPU** (Central Processing Unit, also just "the processor") is the part of the computer that actually does things. Everything else stores, carries or displays. The CPU is where work happens.

What it does is much simpler and much stupider than most people imagine. In a loop, forever, it:

1. Fetches the next instruction from memory.
2. Works out what that instruction is.
3. Does it.
4. Moves to the next one.

That is called the fetch–decode–execute cycle, and it never stops while the machine is on.

The instructions themselves are tiny. Not "open Instagram". More like:

- copy the number at memory location 4,096 into internal slot A
- add the number in slot A to the number in slot B
- if the result is zero, jump to instruction number 812
- store slot A into memory location 4,100

Those internal slots are called registers — a handful of extremely fast holding places inside the CPU itself, usually only a few dozen of them. The complete list of instructions a particular CPU understands is its **instruction set**. Your Mac's chip (an Apple M-series) understands one instruction set, called ARM; most desktop PCs understand a different one, called x86-64. Same idea, different vocabulary, which is why a program built for one will not run on the other without translation.

**Clock speed** is how many times per second the CPU steps through its cycle, measured in gigahertz. Three gigahertz is three billion steps per second. It is worth pausing on that. The CPU is not clever. It is a clerk who can only do trivially simple things, but who does three billion of them every second, and never gets bored, and never makes a mistake.

> **Analogy — the railway reservation clerk.** Picture a booking clerk behind a counter with a rule book. Every request is broken into painfully small steps: look at form, read the seat number, check the chart, cross out one line, write a new line, hand back the slip. The clerk never improvises and never understands *why*. Now imagine that clerk moving three billion times faster than a human, still doing only those tiny steps. The reservation chart gets filled correctly. The clerk still has no idea what a train is.

Real chips have several CPUs on one piece of silicon — those are the "cores" in "8-core processor". Eight cores means eight clerks at eight counters, which matters a great deal later, in Chapter 10, *Inside Node.js*, when we discuss why Node deliberately uses only one of them for your code.

---

## 1.4 Machine code, and why nobody writes it

Since the CPU fetches instructions from memory, and memory holds bytes, the instructions themselves must be bytes.

**Machine code** is the actual numeric instructions a CPU executes — patterns of bytes that mean "add", "compare", "jump". Not text. Not readable. A single instruction might be four bytes that, printed as text, look like meaningless punctuation.

For a few years in the 1940s and 1950s, people really did write this by hand. They looked up the numeric code for "add" in a manual, wrote it down, and fed it into the machine on punched cards or by flipping physical switches on a front panel. If you inserted an instruction in the middle, every jump address after it shifted by one and had to be recalculated by hand.

The first improvement was assembly language: instead of the number for "add", you write `ADD`, and a small program called an assembler translates your text into the numbers. It was, at the time, controversial — serious people argued that letting a machine write machine code would produce sloppy results. That argument has repeated at every layer since. Every step in this chapter follows the same shape: *humans do a mechanical thing by hand; someone writes a program to do the mechanical thing; people worry; the program wins because humans do not scale.*

**The trade-off, named honestly:** every layer of translation between you and the machine costs some speed and some control. Hand-written machine code can be faster than anything a translator produces. It also takes a hundred times longer to write and is nearly impossible to change. Almost everyone, almost always, correctly takes the trade. This project takes it several times over, and Chapter 22, *Software Engineering Principles, Seen in This Code*, comes back to when it is right to refuse.

---

## 1.5 Memory, RAM, and storage — and why the distinction matters

This is the single most common thing beginners are fuzzy about, and being fuzzy about it makes databases, servers and crashes impossible to understand later. So, slowly.

There are two completely different places a computer keeps bytes.

**Memory**, in the strict sense, means **RAM** — Random Access Memory, the fast working space the CPU reads from and writes to while a program runs. "Random access" means the CPU can reach any location in it equally quickly, the way you can open a book at any page without turning the previous ones.

RAM is **volatile**, which means its contents disappear the moment power is lost. Not "might be corrupted". Gone. Empty. A power cut, a crash, a shutdown, and everything in RAM is nothing.

**Storage** means the permanent space: the SSD or hard **disk** inside your laptop. It keeps its contents when power is off. It is much larger than RAM and much, much slower to reach.

Rough numbers for a modern laptop, which are worth memorising as shapes rather than exact figures:

| | RAM | SSD storage |
|---|---|---|
| Typical size | 8–32 GB | 256 GB – 2 TB |
| Time to fetch a small piece | ~100 nanoseconds | ~100 microseconds |
| Survives power off? | No | Yes |

That timing gap is about a thousand times. If reading from RAM took one second, reading from the SSD would take about seventeen minutes. This is why programs load things into RAM and work there, and why "it's slow" and "it's out of memory" are two different problems with two different fixes.

> **Analogy — the desk and the library.** RAM is the desk you are working at: whatever is spread out in front of you, reachable instantly, but swept clean by the cleaner every night. Storage is the college library: everything is there, permanently, but you must get up, walk over, find the shelf, and walk back. Nobody works directly out of the library. You fetch what you need onto the desk, work there, and put back anything you want to keep.

Every part of this project sits somewhere on that split, and knowing which side is which explains its behaviour:

- While the watcher is running, the job listings it has just read out of LinkedIn are in RAM. If you close the lid and the machine dies, those are gone.
- The moment it writes them to the database file at `~/Library/Application Support/linkedin-watcher/jobs.db`, they are on disk, and they survive. On the day I looked, that file was 1,089,536 bytes — about one megabyte, holding every job the tool has ever seen.
- The path to that file is not scattered through the code. It is declared once, in `src/paths.js`, and every other file asks that one module where things live.

```js
const STATE = join(homedir(), 'Library', 'Application Support', APP_ID);
const LOGS = join(homedir(), 'Library', 'Logs', APP_ID);

export const PATHS = {
  root: ROOT,
  config: join(ROOT, 'config.json'),

  state: STATE,
  db: join(STATE, 'jobs.db'),
  profile: join(STATE, 'brave-profile'),
  reports: join(STATE, 'reports'),
  screenshots: join(STATE, 'screenshots'),
  latestReport: join(STATE, 'reports', 'latest.html'),
```

That is `src/paths.js:18-30`, quoted exactly. Line by line:

- `homedir()` asks the operating system for your home folder — on this Mac, `/Users/akshatsaroha`. It is asked for rather than typed in, because the code must work on any machine and any username.
- `join(...)` glues folder names together with the right separator for the platform, giving `/Users/akshatsaroha/Library/Application Support/linkedin-watcher`. Writing `"a" + "/" + "b"` by hand works on a Mac and breaks on Windows; `join` is the boring, correct way.
- `APP_ID` is the string `'linkedin-watcher'`, defined one line earlier at `src/paths.js:7`.
- `PATHS` is then a single object listing every location the program will ever touch: the database, the browser profile, the reports folder, the screenshots folder.

The reason for gathering them in one file is stated in a comment right above, at `src/paths.js:9-17`, and it is a real production scar rather than a style preference: macOS protects `~/Desktop`, `~/Documents` and `~/Downloads` behind a permission system, and a program started automatically on a schedule does not get permission for those folders — so it works when you run it by hand and fails silently at noon. `~/Library/Application Support` carries no such restriction. Chapter 21, *Deployment, Scheduling, and Operations*, tells that story properly.

---

## 1.6 The operating system: the warden of the machine

You now have a CPU that executes instructions and two kinds of memory. Something has to decide *whose* instructions get executed and *which* bytes each program is allowed to touch. That something is the operating system.

An **operating system** (OS) is the program that starts when you press the power button and manages everything else: it shares the CPU between programs, hands out memory, owns the disk, and talks to the keyboard, screen, WiFi and speakers on every other program's behalf. macOS, Windows, Linux, Android and iOS are all operating systems.

The core of it is called the **kernel** — the innermost part of the OS, the part with unrestricted access to the hardware. Ordinary programs run in a restricted mode where they cannot touch hardware directly. When your program wants something real — read a file, send data over the network, get the current time — it asks the kernel, and the kernel does it. That request is called a system call.

This is not bureaucracy for its own sake. It buys three things:

1. **Sharing.** Dozens of programs want the CPU. The OS gives each a slice of a few milliseconds, then interrupts it and gives the next one a slice, fast enough that everything looks simultaneous.
2. **Isolation.** Each program gets its own view of memory and cannot read or scribble on another's. A crashing photo editor cannot corrupt your browser.
3. **A common vocabulary.** Your program says "open this file" in one standard way, and the OS deals with whether it is an SSD, a USB stick or a network drive.

> **Analogy — the hostel warden.** Two hundred students want the two washing machines, the hot water, and the one good study room. Nobody negotiates directly; everyone goes through the warden, who keeps a roster and enforces it. It is slower than grabbing what you want, and there are forms. But the alternative is not freedom — the alternative is a permanent fight in the corridor and a flooded bathroom.

**What came before.** Early computers had no operating system. You booked the machine for two hours, loaded your program, it had the whole machine, and when it finished someone else loaded theirs. A bug that overwrote the wrong memory overwrote all of it. Operating systems appeared because that arrangement wasted enormous amounts of extremely expensive machine time.

**The trade-off:** every system call crosses a boundary and costs time. A program that reads a file one byte at a time, making a million system calls, is far slower than one that reads a million bytes in one call — and nothing about the source code looks different. This is a standard reason a program is mysteriously slow.

Everything in this project is written against macOS specifically, and does not pretend otherwise: the schedule uses macOS's own scheduler, notifications go through macOS's notification system in `src/notify.js`, and the state directory follows the macOS convention you saw above. That narrowing buys simplicity and costs portability, which is exactly the kind of trade this book keeps asking you to notice.

---

## 1.7 A process: a program that is currently alive

Here is a distinction that sounds like word-play until the first time it saves you an hour of confusion.

A **program** is a file on disk containing instructions. It is inert. It just sits there.

A **process** is a running instance of a program: the instructions loaded into memory, currently being executed, with its own memory, its own open files, and its own place in the OS's roster.

A recipe in a book is a program. A person actually cooking from it, right now, with real onions and a real pan, is a process. One recipe, many cooks: the same program can be running as five separate processes at once, each with its own onions.

The OS gives every process a **process ID** (PID) — a number identifying it while it lives. When you "force quit" something, you are telling the OS to stop a process by its ID.

In this project, a process is born the moment you type this:

```bash
node src/index.js
```

Read that as three separate things:

- `node` is the name of a program installed on the machine. The OS finds it on disk, loads it into memory, and starts a process.
- `src/index.js` is not run by the OS at all. The OS has no idea what JavaScript is. It is a piece of text handed to the `node` process as an argument, and it is `node` that reads that file and does something with it.
- When the work finishes, the process exits. Its memory is reclaimed. Nothing it kept only in RAM survives.

That last point is the reason the tool has a database at all. Section 1.5 established that RAM is wiped; a process that ends takes its RAM with it. Anything the watcher wants to remember between runs — every job it has already seen, so that tomorrow's run knows what is new — must be written to a file before the process ends. Chapter 14, *Databases and SQLite*, is entirely about that file.

You will not usually type `node src/index.js` yourself. This project keeps its commands in `package.json`:

```json
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
}
```

That is `package.json:12-22`, exactly as written. Every one of those lines starts a process:

- `start` runs the whole watcher. `npm start` is a shortcut for typing that command.
- `dry-run` runs the same file with an extra word, `--dry-run`, tacked on. The program reads that word and behaves differently — it looks but does not save. Words passed to a program this way are called arguments, and `src/index.js:25` collects them with `process.argv.slice(2)`.
- `--no-warnings=ExperimentalWarning` is an instruction to `node` itself, not to this project's code. It silences a notice Node prints because the project uses a feature Node still labels experimental. Chapter 11, *Modules, npm, and the One-Dependency Rule*, explains which feature and why it is worth the label.
- `test` runs three processes one after another, joined by `&&`, which means "run the next one only if the previous one succeeded".
- `web` is the one this chapter builds towards. Hold it.

Note what is *not* in that list: no build step, no bundler, no compiler. The files in this repository are the files that run.

---

## 1.8 A file: a named box of bytes

You have been using the word "file" since section 1.2. Now define it, because the definition is smaller than most people expect.

A **file** is a named sequence of bytes stored on disk. That is the entire definition. Not "a document". Not "a thing with an icon". A name, and some bytes, in order.

The **filesystem** is the OS's index of every file: where each one's bytes physically live, what it is called, who may open it, when it was last changed. A **directory** (or folder) is a file that lists other files — the drawer, not the card. A **path** is the full address of a file as a chain of directory names, like `/Users/akshatsaroha/Library/Application Support/linkedin-watcher/jobs.db`.

> **Analogy — the library index card drawer.** The books are the bytes, sitting on shelves somewhere. The drawer of index cards is the filesystem: each card carries a title, a shelf position, and a date. Renaming a book means writing a new card, not moving the book. Deleting it usually means throwing away the card and marking the shelf reusable — which is exactly why "deleted" files can sometimes be recovered, and why a full disk suddenly has free space the moment you empty the trash.

Two things about file names that trip up every beginner:

**The extension is a hint, not a fact.** `.js`, `.json`, `.png` are just the last few characters of the name. Nothing enforces them. You can rename a photograph to `notes.txt` and the bytes are unchanged; only the programs that open it get confused. The reason extensions matter at all is that programs use them to guess. This project does exactly that guessing, in `web/serve.js:21-36`:

```js
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  // The company logos in public/logos and the og: card are all .jpg. Without these
  // they fell through to application/octet-stream, which the browser will not paint.
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
```

This is a lookup table: given a file extension, produce a label describing what the bytes are. The comment in the middle is a genuine bug report left in the code by its author. The `.jpg` and `.jpeg` lines were missing at first, so company logo files were sent out with the label `application/octet-stream`, which means "unknown lump of bytes", and the browser refused to draw them. The bytes were correct. The *description* of the bytes was wrong, and that was enough. Section 1.2 warned you that meaning is an agreement; this is what it costs when the two sides disagree.

**Folders are just names too.** There is nothing special about `src` or `web`. They are conventions this project follows so a human can find things. Chapter 4, *The Shape of the Folder*, walks the whole layout.

---

## 1.9 Program, software, application: three words for overlapping things

These get used interchangeably, and that is mostly fine, but the shades of difference are worth twenty seconds.

**Software** is the general word for instructions a computer follows, as opposed to hardware, which is the physical machinery. Software is not a thing you can drop on your foot. It is pattern and instruction — which is exactly why it can be copied a million times for free, and why the entire industry works the way it does.

A **program** is one specific set of those instructions with a job: `node` is a program, `web/serve.js` is a program, your calculator is a program.

An **application** (or "app") is a program aimed at a person, with a way for that person to use it. The distinction is about audience, not technology. A program that runs at midnight, writes to a file and tells nobody is software but not really an application.

This project contains both kinds, which is one reason it is a good thing to learn from:

- The watcher (`src/`, `bin/`) is software with no user interface at all. It runs on a schedule, prints lines to a log, and writes to a database. Nobody watches it work.
- The site (`web/`) is an application. A student opens it in a browser, scrolls, filters, clicks a button, and gets something back.

They share a folder and a database, and they are otherwise completely different beasts. Chapter 3, *Meet Intern Radar*, introduces both properly.

---

## 1.10 Programming, and what source code actually is

**Programming** is writing down instructions precisely enough that a machine can follow them without ever asking a clarifying question. That last clause is the hard part. A human colleague fills gaps with common sense. The machine has none. It will do exactly what you wrote, at three billion steps a second, including the part you got wrong.

A **programming language** is a set of rules for writing those instructions as text, designed so that humans can read it and a translator program can turn it into machine code. **Syntax** is the grammar of that language: which arrangements of characters are legal.

**Source code** is the text you write. It is nothing more exotic than a text file. You can open `src/paths.js` in any text editor and see the same characters the machine sees. Here is real source code from this project, `src/logger.js:24-27`:

```js
function write(level, msg) {
  const line = `${stamp()} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  const colour = LEVEL_STYLE[level] ?? '';
  process.stdout.write(`${colour}${line}${RESET}\n`);
```

Even without knowing JavaScript, you can see the shape:

- `function write(level, msg) {` names a reusable block of instructions `write`, which expects two pieces of information: a `level` (like `info` or `error`) and a `msg`.
- The second line builds one line of text out of three parts: a timestamp from `stamp()`, the level in capital letters padded to five characters so the columns line up, and the message.
- `const colour = LEVEL_STYLE[level] ?? ''` looks up a colour code for that level, and falls back to an empty string if there isn't one. `LEVEL_STYLE` is the table defined at `src/logger.js:5-11`, where `info` maps to `'\x1b[36m'` — a special sequence of characters that terminals interpret as "print the following in cyan".
- `process.stdout.write(...)` sends those characters to the terminal.

Two lessons hide in four lines. Source code is written to be read by humans — the padding to five characters exists purely so that a person scanning a log sees straight columns. And "printing to the screen" is itself an agreement about bytes: `\x1b[36m` is not colour, it is a few bytes that a terminal program has agreed to treat as a colour instruction.

---

## 1.11 Compilers: translate the whole book, then hand it over

A CPU cannot read `function write(level, msg)`. Something has to turn source code into machine code. There are two classical answers, and the difference between them is the last big idea before we get to JavaScript.

A **compiler** is a program that reads your entire source code and produces a separate file of machine code, before the program is ever run. C, C++, Rust, Go and Swift work this way.

The sequence is:

1. You write `hello.c`.
2. You run the compiler. It reads the whole file, checks the grammar, complains about mistakes, and writes out `hello` — a file of machine code.
3. Later, you or anyone else runs `hello`. The compiler is not involved and does not need to be installed.

The advantages are real. The machine code is produced once, so no time is spent translating while the program runs. The compiler sees the whole program at once, so it can rearrange and optimise. And whole categories of mistakes are caught *before* the program ever runs; misspell a function name and the compiler refuses to produce anything.

The costs are also real. There is a wait between writing and running — for a large program, minutes. The output is built for one instruction set and one operating system, so a program compiled for a Mac will not run on Windows without being compiled again. And the file you ship is not the file you wrote.

> **Analogy — the translated textbook.** A publisher takes an English textbook, translates the whole thing into Hindi, prints it, and ships the Hindi edition. Students read it at full speed with no translator in the room. But translation took weeks, and if the author fixes a sentence, the whole edition must be reprinted.

---

## 1.12 Interpreters: translate a line at a time, live

An **interpreter** is a program that reads your source code and carries out its instructions directly, line by line, as the program runs. There is no separate machine-code file. Python, Ruby and classic JavaScript work this way.

The sequence is:

1. You write `hello.py`.
2. You run `python hello.py`. The `python` program starts, reads your file, and does what it says as it goes.

The advantages mirror the compiler's costs. There is no wait: change a line, run it, see the result. The same source file runs anywhere the interpreter is installed, because the interpreter — not your code — deals with the machine underneath. And the program you ship is the program you wrote, which is readable.

The costs mirror the compiler's advantages. The work of understanding your code is redone every time the program runs, so pure interpretation is slower — historically ten to a hundred times slower. Mistakes are found only when the line is reached: a typo inside a rarely-used branch can sit undetected for months and then break at 3 a.m.

> **Analogy — the live interpreter at a lecture.** A visiting professor speaks English; an interpreter beside her renders each sentence into Hindi as it is spoken. Nothing had to be prepared in advance and a change of topic is handled instantly. But the interpreter is standing there for the entire lecture, and everything is a fraction slower than reading a printed translation would be.

Notice that "compiled" and "interpreted" describe *implementations*, not languages. There is nothing in JavaScript's grammar that forces either. Which brings us to what actually happens.

---

## 1.13 Where JavaScript and Node.js sit: interpret first, compile the hot parts

Modern JavaScript is not purely interpreted and not purely compiled. It is both, in stages, and the arrangement is one of the more elegant ideas in computing.

Start with the pieces.

**JavaScript** is a programming language created in 1995 to make web pages interactive. For its first fifteen years it lived only inside browsers, and it was slow enough that it was used for small decorations — a dropdown menu, a form check.

**V8** is the JavaScript engine Google wrote for Chrome in 2008. An engine is the program that actually runs JavaScript. V8 was many times faster than what came before, and the technique it used is the subject of this section.

**Node.js** is V8 taken out of the browser and given the ability to touch the operating system: read files, listen on the network, start other processes. Before Node, JavaScript could not open a file, because inside a browser it must not be allowed to. Node's insight, in 2009, was that if the language were given those powers it could be used to write servers and tools — which is why this project, a tool that scrapes web pages and writes to a database on a Mac, is written in the language of web pages.

A **runtime** is the surrounding program that executes your code and provides everything your code can call. Node.js is a runtime: it is V8, plus the file system, plus networking, plus timers, plus the standard library. Chapter 10, *Inside Node.js*, opens it up.

Now the technique. **JIT compilation** — Just-In-Time compilation — means compiling code into machine code while the program is running, rather than before it starts. Here is what V8 actually does when Node runs `src/index.js`:

1. **Parse.** It reads your text and checks the grammar, building an internal tree that represents the structure of the code.
2. **Compile to bytecode.** It turns that tree into **bytecode** — compact, simple instructions for an imaginary machine rather than for a real CPU. Bytecode is not machine code; no chip can run it. It is a halfway form, quick to produce and quick to step through.
3. **Interpret the bytecode.** V8 has an interpreter that runs the bytecode straight away. This gets your program started almost instantly.
4. **Watch.** While interpreting, V8 counts. Which functions are being called thousands of times? What kinds of values do they actually receive?
5. **Optimise the hot parts.** A function that runs constantly — that is the term of art, a "hot" function — gets sent to an optimising compiler that produces real machine code for your real CPU, specialised to the value types it has been observing. From then on, calls to that function run at compiled speed.
6. **Un-optimise if the guess breaks.** If a function that has only ever received numbers is suddenly handed a piece of text, the specialised machine code is thrown away and V8 drops back to the bytecode interpreter. This is called deoptimisation.

> **Analogy — the mess queue.** The mess cook does not pre-cook a hundred different dishes at 5 a.m. on the chance someone orders them. He cooks each order as it comes — that is interpretation. But by the third week he has noticed that ninety students order the same thali every single day, so *that* one he batch-prepares in advance. Ordinary orders stay slow; the common one becomes fast. And on the day the menu changes, the batch he prepared is wasted and he is back to cooking to order.

So the honest answer to "is JavaScript compiled or interpreted?" is: it is interpreted first so that it can start immediately, and then compiled where compiling pays for itself. You get the fast feedback loop of an interpreted language and, for the code that matters, something within striking distance of compiled speed.

**The trade-off, named:** JIT compilation costs memory (V8 holds the source, the bytecode, and the machine code) and costs a warm-up period (the first few hundred runs of a function are slow). For a program that starts, runs for ninety minutes and exits — which is exactly what this project's watcher does — the warm-up is irrelevant. For a program that starts, does one tiny thing, and exits immediately, the warm-up can be most of the total time. That is a real consideration in Chapter 13, *Serverless and the Tailor Endpoint*.

One more consequence worth stating plainly, because it shapes this whole project: **there is no build step here.** Nothing converts this repository into some other, shipped form. `src/index.js` is the file Node reads. `web/public/app.js` is the file the browser reads. Edit it, reload, that is the change. Chapter 9, *Frameworks, React, and the Road Not Taken*, explains what most projects do instead and what it buys them.

---

## 1.14 Clients and servers: a role, not a kind of machine

Now the word this book was named around. If you take only one idea from this chapter, take this one, because almost everyone starts out with it wrong.

**A server is not a special machine.** A server is a role: any program that waits for requests and answers them. A **client** is any program that sends a request and waits for an answer. Both are just programs. Both can be on the same laptop.

The picture in most people's heads — a cold room, blinking racks, someone else's building — is a picture of *where servers are usually kept*, not of what a server is. Those racks are full of ordinary computers, running ordinary operating systems, running programs that happen to sit in a loop waiting to be asked things.

> **Analogy — the college notice board and the peon.** The notice board is a static thing; anyone who walks past can read it. Now imagine instead a clerk sitting at a window: you write your question on a slip, push it through, he reads it, fetches the answer, and pushes it back. He does nothing until asked. He answers whoever asks, in the order they arrive. That is a server. He is not a different species of person. He is a person doing the job of answering.

Two more definitions and the picture is complete:

A **port** is a number that identifies which program on a machine a request is meant for. One computer has one network address, but might be running twenty programs that all want to receive requests. The port sorts them out — like a building having one street address and many flat numbers.

**localhost** is a name that always means "this same computer". A request to `localhost` never leaves the machine. It goes out of the program, down to the OS's networking layer, and straight back up into another program on the same laptop.

Here is the moment the abstraction becomes real. Run this in the project folder:

```bash
npm run web
```

`npm` looks up `web` in the `scripts` block you read in section 1.7, finds `node web/serve.js`, and starts that process. Your Mac is now a server. Not metaphorically — the actual, complete, technical sense of the word. It is waiting for requests and answering them.

The file that does it is exactly one hundred lines long. Here is its final block, `web/serve.js:95-100`:

```js
server.listen(PORT, () => {
  console.log(`Intern Radar preview → http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.log('GEMINI_API_KEY is not set — resume tailoring will return an error until it is.');
  }
});
```

- `server.listen(PORT, ...)` is the sentence that changes the machine's role. It tells the operating system: from now on, any request arriving on this port belongs to me. `PORT` is set at `web/serve.js:19` to `Number(process.env.PORT || 4321)` — use the port named in the environment if there is one, otherwise 4321.
- The function in the second argument runs once, after listening has successfully started, and prints the address you should open.
- The `if` block checks whether a secret key for the AI service is present in the environment, and warns you now rather than letting you discover it later when a button fails. That is a small kindness and a good habit.

And here is what the server does when a request arrives, `web/serve.js:59-61` and `web/serve.js:83-92`:

```js
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
```

```js
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
```

Read it as a clerk's routine:

- `createServer` takes a function and promises to run it once for every request that arrives. `req` describes what was asked for; `res` is the pad on which the reply is written.
- `new URL(req.url, ...)` turns the raw requested address into a structured object, so the code can ask for just the path portion rather than picking the string apart by hand.
- `readFile(path)` asks the OS for the bytes of a file on disk. This is a system call, exactly as described in section 1.6.
- `res.setHeader('content-type', ...)` attaches the label from the `TYPES` table of section 1.8 — "these bytes are an HTML page", "these bytes are a JPEG".
- `res.end(body)` sends the bytes and finishes the reply.
- If `readFile` fails — usually because the file does not exist — the `catch` block runs instead and sends the reply everyone has seen: status 404, and a tiny page saying so. `404` is a number from a shared table of reply codes; Chapter 2, *How Websites Actually Work*, and Chapter 15, *APIs and REST*, cover that table.

Notice what is *not* there. There is no framework. `createServer` comes from `node:http`, which is built into Node itself — imported at `web/serve.js:11`. This project has exactly one installed dependency in total, and it is not this. Chapter 12, *Servers From Scratch*, takes this file apart line by line and shows what a framework like Express would have added and what it would have cost.

**One honest caveat.** Being a server does not mean the rest of the world can reach you. Your laptop sits behind a home router, on a college network, behind a firewall, with an address that changes. `npm run web` makes your Mac a server *for your Mac*. Making a server reachable by strangers is a separate problem, and Chapter 21 explains why this project sidesteps it entirely.

---

## 1.15 The internet, at first glance

You now have everything needed for a one-paragraph model of the internet, which Chapter 2 will replace with a real one.

A **network** is two or more computers connected so they can send bytes to each other. The **internet** is the enormous, worldwide network of networks — cables under oceans, fibre in the ground, radio towers, and a very large number of machines whose whole job is to pass parcels of bytes towards their destination.

A **protocol** is an agreed set of rules for a conversation: who speaks first, what a message looks like, how you say "didn't understand". Human protocols work the same way — you say "hello" before you say what you want, and the other person expects that.

**HTTP** (HyperText Transfer Protocol) is the protocol browsers and websites use. It has a shape so simple it is almost disappointing: the client sends a **request** ("GET me the file at /index.html"), and the server sends back a **response** (a status number, some labels, and some bytes). One request, one response, then done. Every page you have ever loaded is dozens of those exchanges.

That is the same conversation `web/serve.js` is holding, except that both ends are on your desk. When you type `http://localhost:4321` into a browser, the browser is the client, `serve.js` is the server, HTTP is the protocol, and the bytes travel about thirty centimetres.

---

## 1.16 The browser is just another program

One last de-mystification, and it matters as much as the one about servers.

A **browser** — Chrome, Safari, Firefox, Brave — is a program on your computer, like any other. It is a big one, but there is nothing else special about it. Its job is: fetch bytes over HTTP, decide what they are, and draw them.

Inside it there are roughly four parts:

1. A networking part that speaks HTTP.
2. A parser that reads HTML — the text format that describes a page's structure — and CSS, the text format that describes how it should look. Chapters 5 and 6 are those two.
3. A rendering engine that turns that into actual coloured pixels. Chapter 8, *The DOM and How a Page Is Painted*, is that.
4. A JavaScript engine — V8 in Chrome and Brave, the same one section 1.13 described — that runs the code the page brings with it.

Because a browser is just a program, other programs can drive it. That is not a trick or a loophole; it is a feature browsers deliberately expose. This project uses it as its central mechanism: the watcher starts a real Brave browser and controls it, using a tool called Playwright — the single npm dependency this project has. The whole `node_modules` folder here holds one package and about 13 MB. Chapter 16, *Web Scraping and Playwright*, is the full story.

The reason it drives a real browser rather than fetching pages directly is worth stating now. Modern web pages are not delivered as finished documents. They arrive as a small shell plus a large amount of JavaScript, and the actual content is built on your machine, by that JavaScript, after the page loads. Ask for a LinkedIn jobs page with a plain HTTP request and you get a shell with no jobs in it. To see what a human sees, you must run what a human's browser runs — so the tool uses a browser, because a browser is the thing that does that job.

---

## 1.17 This project, seen through every layer at once

Put the whole staircase together on one concrete example. When the watcher runs, here is what is true at every level simultaneously.

**At the hardware level.** Transistors switch. A CPU fetches, decodes and executes machine-code instructions billions of times a second. RAM holds the working data. The SSD holds everything that must survive.

**At the OS level.** macOS is running. When the schedule fires, macOS's own scheduler — `launchd` — starts a shell script. That script is `bin/run.sh`, and it exists for a reason that is pure operating-system reality, stated in its own opening comment at `bin/run.sh:2-4`: a scheduled job is handed a bare minimum environment, Node is not on the list of places it looks, and a plain `node` command would simply fail with "command not found". So the script hunts for Node in the handful of places it is usually installed, at `bin/run.sh:19-34`, and then runs it by full path:

```bash
"$NODE" --no-warnings=ExperimentalWarning "$HERE/src/index.js" "$@"
```

That single line is the seam between the operating system and this project. Everything to its left is macOS; everything to its right is JavaScript.

**At the process level.** A `node` process is born. It gets a process ID, its own memory, and a slice of CPU time. It will live for anywhere from a few seconds to about an hour and a half, and then exit.

**At the runtime level.** V8 parses `src/index.js`, turns it into bytecode, starts interpreting immediately, and quietly compiles the hot functions to machine code as the run goes on. Node supplies everything V8 cannot do alone: reading `config.json` off the disk, opening the database, starting the browser, talking over the network.

**At the program level.** `src/index.js` loads the configuration, opens the store, launches Brave, walks LinkedIn's search results, extracts jobs, classifies them, and writes them down. Its own opening comment, at `src/index.js:2-5`, describes it in two lines: one scan of LinkedIn for new internships at the watchlist companies. Chapter 18, *The Watcher, File by File*, is the guided tour.

**At the file level.** New rows land in `jobs.db` — one file, about a megabyte, at `~/Library/Application Support/linkedin-watcher/jobs.db`, whose first fifteen bytes you read back in section 1.2. There is no database server running anywhere. The "database" is a file, and the code that reads and writes it runs inside this same process, using `node:sqlite`, which — like `node:http` — is built into Node and needed no installation. That import is the first line of `src/store.js`:

```js
import { DatabaseSync } from 'node:sqlite';
```

**At the publishing level.** The finished listings are written out as a single JSON file at `web/public/data/jobs.json` — on the day I looked, 268,161 bytes, about a quarter of a megabyte — and the tool commits and pushes that file to git. A hosting service called Vercel notices the push and puts the updated files on the public internet. That is why there is no always-on server behind `internradar.online`: the site is **static**, meaning it is a set of pre-made files that get handed out unchanged, not built fresh for each visitor. Chapter 21 covers the whole pipeline.

**At the your-laptop-is-a-server level.** When you want to see the site before the world does, you run `npm run web`, `web/serve.js` calls `server.listen(4321)`, and your Mac takes on the server role for as long as that process lives. Press Ctrl-C, the process dies, the role evaporates.

One honesty note, since this book promises never to prettify the repository. The comment at the top of `src/index.js:4` says the tool is invoked "at 12:00 and 18:00", but `bin/install-schedule.sh` actually installs a schedule that fires every hour on the hour — its own message at `bin/install-schedule.sh:191` says so plainly. When a comment and the code disagree, believe the code. Comments are written once and drift; this one drifted when the schedule got more frequent. You will meet this in every codebase you ever read, including your own, six months later.

---

## Chapter summary

- A computer is built from transistors, which are switches with no moving parts that can be switched by other switches, and everything else is layers of agreement stacked on top of "on or off".
- A bit is one on/off value, a byte is eight bits and can hold 256 different patterns, and the meaning of any byte comes entirely from the program reading it — the first sixteen bytes of `jobs.db` spell "SQLite format 3" only because a program agrees to read them as text.
- The CPU does one absurdly simple thing — fetch an instruction, decode it, execute it — a few billion times a second, and machine code is those instructions written as numbers.
- RAM is fast, small and wiped when power is lost; disk storage is slow, large and permanent, and the roughly thousand-fold speed gap between them explains most of what programs do about data.
- The operating system shares the CPU between programs, isolates their memory, and owns the hardware, so every real action a program takes — reading a file, sending bytes over a network — is a request to the kernel.
- A program is a file of instructions sitting on disk; a process is one running instance of it, with its own memory and its own process ID, and everything a process keeps only in RAM dies with it.
- A file is nothing but a named sequence of bytes, and its extension is a hint that programs use to guess what those bytes mean — a guess this project makes explicitly in the `TYPES` table at `web/serve.js:21-36`.
- A compiler translates all of your source code into machine code ahead of time, while an interpreter carries it out line by line as the program runs.
- Modern JavaScript does both: V8 turns your code into bytecode and starts interpreting it immediately, then compiles the frequently-used functions into real machine code while the program is running, which is called JIT compilation.
- Node.js is V8 plus the ability to touch the operating system, which is why a language invented for web pages can drive a browser, read a disk and open a database on a Mac.
- A server is a role, not a machine: any program that waits for requests and answers them, which your own laptop becomes the moment `npm run web` starts `web/serve.js` and it calls `server.listen(4321)`.
- A browser is just another program — networking, an HTML parser, a renderer and a JavaScript engine — which is precisely why another program can drive one, as this project does with Playwright and Brave.
- This project has no build step and is two programs sharing one folder: a watcher that writes to a SQLite file on a Mac, and a static site published to Vercel by a git push.

## Key takeaways

Every abstraction in software is a layer of agreement over something simpler, and if you can name each layer you can debug at the right one instead of guessing. The distinction between RAM and disk — between what a running process is holding and what has actually been written down — is the single idea that makes databases, crashes and caches make sense, and it is why this project has a `jobs.db` at all. A server is a role that any program can take on, so "deploying a website" is not about acquiring a magic machine; it is about arranging for some program somewhere to be listening. And JavaScript is neither compiled nor interpreted but staged: interpreted first so it starts instantly, compiled where compiling earns its keep.

## Real-life analogy revisited

The hostel corridor of a hundred lights is still the right picture, and now you can see the whole stack in it. The bulbs are transistors: on or off, meaning nothing by themselves. The floor's agreement about which pattern means "dinner is served" is the byte and its encoding — the same agreement that lets fifteen bytes at the start of a file announce "SQLite format 3". The warden who decides who gets the washing machine is the operating system, arbitrating a scarce resource so that two hundred people can share it without a fight in the corridor. The mess cook who eventually batch-prepares the one thali everybody orders is V8's JIT compiler, learning what is hot and pre-cooking exactly that. And the clerk at the window who does nothing at all until somebody pushes a slip through, then fetches the answer and pushes it back — that is `web/serve.js`, sitting in `server.listen`, being a server, on a laptop, on your desk.

## Frequently asked questions

**Why can't I just say "the computer runs my code"? Why does the layering matter?**
Because when something goes wrong you have to know which layer to look at. "The page is blank" could be a file that doesn't exist (filesystem), a wrong content-type label (the `TYPES` table), a process that isn't running (the OS), or JavaScript that threw an error (the runtime). Each has a different fix and a different place to look. People who cannot name the layers debug by changing random things.

**Is a server a computer or a program?**
A program. The word is used loosely for the computer that program runs on, and even more loosely for the rack in a data centre, but the precise meaning is "a program that waits for requests and answers them". Your Mac is a server whenever `web/serve.js` is running and stops being one the moment you press Ctrl-C.

**If JavaScript gets compiled anyway, why isn't it as fast as C?**
Because the compilation happens under time pressure, with no chance to think for thirty seconds, and because JavaScript lets a variable hold a number now and a piece of text later. V8 has to guess what types a function will see, specialise for that guess, and undo the specialisation when the guess breaks. C's compiler knows every type in advance and has all the time in the world. JavaScript trades a few times the speed for instant feedback and no build step, and for most work that is the right trade.

**Why does this project write to a file instead of just keeping everything in memory?**
Because the process exits. A run of the watcher lasts up to about ninety minutes and then ends, and everything it held in RAM is reclaimed by the operating system. Tomorrow's run needs to know which jobs were already seen yesterday, and the only way to carry information across the death of a process is to write it to disk.

**Does `npm run web` put my site on the internet?**
No. It makes your own machine answer requests at `http://localhost:4321`, and `localhost` means "this same computer" — the bytes never leave your desk. Publishing to the internet is a separate step, and in this project it happens by pushing files to git, which Vercel then serves. Chapter 21 covers it.

**Everyone says you need a framework and a database server. This has neither. Is it a toy?**
It is a live site with real users, so no. It is small on purpose. `node:http` and `node:sqlite` are both built into Node, so the entire installed dependency list here is one package, `playwright-core`. That is a deliberate choice with real costs, and this book names them every time — Chapter 11 and Chapter 12 make the case for and against.

## Common beginner mistakes

**1. Believing the file extension determines the file's contents.**
The beginner renames `photo.png` to `photo.jpg` and expects a conversion. It seems right because macOS and Windows change the icon, which looks like something happened. What actually happens is that the bytes are untouched and the program that opens it is now misinformed — sometimes it copes, sometimes it shows nothing. The fix: treat the extension as a label humans and programs use to guess, and convert files with a program that actually rewrites the bytes.

**2. Confusing "the program is saved" with "the data is saved".**
The beginner writes code that collects results into a variable, sees them printed on screen, and assumes they are stored. It seems right because the output is visibly there. What actually happens is that those results were in RAM, the process exited, and they are gone — the next run starts empty. The fix: be able to point at the line that writes to disk. In this project that line is inside `src/store.js`, and if it never runs, nothing was saved.

**3. Thinking a server must be a remote machine.**
The beginner runs `npm run web`, sees `http://localhost:4321`, and sends the link to a friend, who gets an error. It seems right because it is a URL and URLs work on the internet. What actually happens is that `localhost` resolves to the friend's own computer, where nothing is listening. The fix: understand that the URL is an instruction to look on *this* machine, and that reaching another machine is a different problem with a different solution.

**4. Editing a file and expecting a running process to notice.**
The beginner changes `web/serve.js` while the server is running, reloads the browser, and sees no change. It seems right because editing HTML and reloading does work. What actually happens is that the running process read `serve.js` once, at startup, and is executing what it read then. Editing the source on disk does not reach into a live process. The fix: stop the process and start it again. Files served *by* that process, like `index.html`, do update on reload, because they are read fresh for each request — see `readFile(path)` at `web/serve.js:84`.

**5. Assuming an interpreted language checks your whole file before running it.**
The beginner writes a typo in an error-handling branch, runs the program, sees it work, and ships it. It seems right because it ran. What actually happens is that the broken line was never reached, and it fails the first time something goes wrong in production — the worst possible moment. The fix: tests, which is why `package.json:18` runs three test files, and why Chapter 22 argues for them.

**6. Treating "it works on my machine" as evidence.**
The beginner runs the tool from a terminal, it works, and concludes the scheduled version will work too. It seems right because it is the same code and the same computer. What actually happens is that a scheduled job runs with a different environment and different permissions — no Homebrew on its search path, no grant for protected folders — which is precisely why `bin/run.sh` exists and why the state directory is where it is. The fix: test the thing you actually ship, in the way it actually runs.

## Interview questions

**1. What is the difference between a program and a process?**
A program is a set of instructions stored as a file on disk; it is inert and does nothing on its own. A process is one running instance of that program: the instructions loaded into memory and currently being executed, with its own memory space, its own open files and its own process ID from the operating system. The same program can be running as several independent processes at once. The practical consequence is that anything a process keeps only in RAM disappears when it exits, which is why programs that need to remember things write them to disk.

**2. Explain RAM versus disk storage, and why the difference shapes program design.**
RAM is the fast working memory the CPU reads and writes while a program runs, and it is volatile — its contents vanish when power is lost or the process ends. Disk storage is permanent, far larger, and roughly a thousand times slower to reach. Programs therefore load what they need into RAM, work there, and deliberately write back anything that must survive. In this project that write is to a single SQLite file, so that today's run knows which jobs yesterday's run already saw.

**3. Is JavaScript compiled or interpreted?**
Both, in stages. The V8 engine parses the source and turns it into bytecode, which an interpreter starts executing immediately so the program begins with no build wait. While that runs, V8 counts how often each function is called and what types of values it receives, and sends the hot functions to an optimising compiler that emits real machine code specialised to those types. If a specialised function later receives an unexpected type, the machine code is discarded and execution falls back to the bytecode. That is JIT — just-in-time — compilation, and it buys fast startup and fast steady-state at the cost of memory and a warm-up period.

**4. What is Node.js, and what problem did it solve?**
Node.js is a runtime: Google's V8 JavaScript engine taken out of the browser and combined with the ability to use the operating system — read and write files, listen on network ports, start other processes, set timers. Before it, JavaScript could only run inside a browser, where it is deliberately forbidden from touching your disk. Node made it possible to write servers and command-line tools in the same language as web pages. This project is a Node program: `node src/index.js` starts it, and it reads a config file, drives a browser and writes a database — all things browser JavaScript cannot do.

**5. What does it mean to say "a server is a role, not a machine"?**
It means that "server" describes what a program is doing — waiting for requests and answering them — not what kind of hardware it runs on. Any computer can host a server program, including a laptop. In this project, running `npm run web` starts `web/serve.js`, which calls `server.listen(4321)` and from that moment answers HTTP requests, making the Mac a server for as long as the process lives. The mental picture of racks in a data centre describes where servers are commonly kept, not what they are.

**6. Why does this project drive a real browser instead of just fetching web pages?**
Because a modern page is not delivered as a finished document. The server sends a small shell plus a large amount of JavaScript, and the visible content is constructed on the client afterwards. A plain HTTP fetch of a LinkedIn jobs page returns the shell with no jobs in it. Running an actual browser executes the page's own JavaScript, so the program sees what a human sees. The cost is that it is far slower and heavier than a fetch, which is why the tool is careful about how often it runs.

**7. What is a file?**
A named sequence of bytes on a storage device, tracked by the filesystem, which records where the bytes live, what the file is called, who may open it and when it changed. The name and the extension carry no enforced meaning; interpretation is entirely up to the program that opens it. A good demonstration is that this project's database file begins with bytes that, read as text, say "SQLite format 3" — the file announces its own format in its contents, because the name alone proves nothing.

## Exercises

**1.** Convert by hand, on paper: `1101` and `100000` from binary to ordinary decimal, and 37 and 200 from decimal to binary. Then explain in one sentence why a byte can hold 256 different values but the largest number it can store is 255.

**2.** Open a terminal and run `ls -l ~/Library/Application\ Support/linkedin-watcher/`. Write down the size of `jobs.db` in bytes, and divide by 1,024 twice to get megabytes. Then run `file` on the same path and explain what its output proves about how that command decides what a file is — it never looked at the name.

**3.** Read `package.json` and, without running anything, write down for each of the nine entries in `scripts` exactly which program the operating system will start and which file that program will be handed. Then check yourself by running `npm run report`.

**4.** Run `npm run web`. Open `http://localhost:4321` in a browser. Now open a second terminal and run `npm run web` again while the first is still going. Read the error carefully and explain, using the definition of a port from section 1.14, why two processes cannot both be listening on 4321.

**5.** With the local server running, edit the heading text in `web/public/index.html`, save, and reload the page — the change appears. Now edit the port number at `web/serve.js:19` from `4321` to `4322`, save, and reload — nothing changes. Explain the difference in terms of processes and when each file is read. Then make the port change take effect.

**6.** Add one line to the `TYPES` table in `web/serve.js` for the extension `.txt`, mapping it to `text/plain; charset=utf-8`. Create a file `web/public/hello.txt` with any text in it. Restart the server and open `http://localhost:4321/hello.txt`. Then delete your `TYPES` line, restart, and reload — describe exactly what changes, and connect it to the `.jpg` comment already in that table.

**7.** 🔴 Write a program in fewer than forty lines, using only `node:http` and `node:fs`, that listens on port 5000 and, for any request, replies with the plain-text contents of a single fixed file on your disk. You may look at `web/serve.js` for the shape of `createServer` and `server.listen`, but do not copy its static-file logic, its `TYPES` table or its API branch. Then answer in writing: what does your program do if the file does not exist, and what *should* it do?

## Quiz

1. What is a transistor, in one sentence?
2. How many different values can a single byte hold, and what is the largest number it can represent?
3. True or false: the file extension `.json` guarantees the file contains JSON.
4. Which of these disappears when a process exits? (a) the contents of RAM it was using (b) a file it wrote to disk (c) its process ID (d) all of a and c
5. In the command `node src/index.js`, which part does the operating system actually load and run as a program?
6. What is the difference between a compiler and an interpreter?
7. In one sentence, what does "JIT compilation" mean, and why does V8 not simply compile everything up front?
8. After you run `npm run web`, what role is your Mac playing, and what exact line of `web/serve.js` makes it so?
9. Why is this project's database stored in `~/Library/Application Support/linkedin-watcher/` rather than inside the project folder?
10. Name one thing a browser can do that a plain HTTP fetch of the same URL cannot, and say why that matters to this project.

## Where this leads

You now know what software is, what a process is, and that a server is a role your own laptop can play — which is exactly the ground Chapter 2, *How Websites Actually Work*, is built on. It takes the one-paragraph model of HTTP from section 1.15 and turns it into the real thing: what a URL is made of, what actually travels over the wire when you press Enter, what DNS does, and why a "static site" like `internradar.online` needs no running program behind it at all. After that, Chapter 3, *Meet Intern Radar*, finally introduces the project itself, end to end.

---

## Answers

1. A transistor is a tiny electronic switch with no moving parts that is turned on and off by an electrical signal rather than by hand, which is what allows switches to control other switches.
2. 256 different values, and the largest number it can represent is 255 — because the count starts at 0.
3. False. The extension is only a hint used by humans and programs to guess; nothing enforces it, and the bytes inside can be anything.
4. (d) — the contents of its RAM are reclaimed and its process ID is released, but files it wrote to disk survive. That is the whole reason the tool has a database.
5. `node`. The OS loads and runs the `node` program; `src/index.js` is just a piece of text passed to it as an argument, which `node` then reads and executes.
6. A compiler translates the entire source into a separate machine-code file before the program runs, so nothing is translated during execution. An interpreter reads the source and carries out its instructions directly while the program runs, translating as it goes.
7. JIT compilation means compiling code into machine code while the program is already running. V8 does not compile everything up front because that would delay startup and because most functions run only once or twice — it interprets first for instant start, then compiles only the functions that turn out to be called often, specialised to the value types actually observed.
8. Your Mac is playing the role of a server: a program on it is waiting for requests and answering them. The line is `server.listen(PORT, ...)` at `web/serve.js:95`, with `PORT` set to 4321 at `web/serve.js:19`.
9. Because macOS restricts access to `~/Desktop`, `~/Documents` and `~/Downloads`, and a job started automatically by the system scheduler does not receive permission for those folders — so the tool would work when run by hand and fail silently when run on schedule. The reasoning is written down at `src/paths.js:9-17`.
10. A browser runs the page's own JavaScript, so it sees the content that is built on the client after loading; a plain fetch returns only the initial shell. It matters because LinkedIn's job listings are constructed that way, so the watcher must drive a real Brave browser via Playwright to see any jobs at all.
