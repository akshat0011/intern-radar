# Chapter 9 — Shipping It: Deployment, Scheduling, and Operations

> By the end you can explain how code on one laptop becomes a website the world can open, how this project schedules itself, and what you check first when a run goes wrong.

**New words:** production, staging, build step, artifact, hosting, VPS, container, PaaS, serverless, deploy, preview deployment, HTTP header, cache, CI/CD, pipeline, cron, daemon, launchd, LaunchAgent, plist, exit code, environment variable, secret, rotation, log rotation, DNS, cache-buster.

---

## 9.1 Development versus production

**Development** is the copy of the program running on your own machine while you work on it. **Production** is the copy real people use. Chapter 5, *Node.js, Modules, and Servers Without a Framework*, showed the development side: you run `node web/serve.js`, open `localhost:3000`, and see the site. Production is `https://internradar.online`, opened by a student on a phone in a different city.

Think of a dish you cook in your hostel room for yourself. You know the burner runs hot on the left. You taste as you go. The same dish cooked in the mess for four hundred people has none of that: a different stove, no tasting, no fixing it once it is served. Development is your room. Production is the mess.

The gap between the two is where bugs are born, and the gap is always made of specific differences:

- **Different file paths.** Your machine has `/Users/akshatsaroha/...`. The production machine does not. Any hardcoded absolute path breaks.
- **Different case sensitivity.** macOS treats `Logo.png` and `logo.png` as the same file. The Linux machines Vercel runs on do not. A site that works locally can 404 in production purely over a capital letter.
- **Different protocol.** Locally you use `http://`. In production, `https://`. A page loaded over HTTPS that asks for an `http://` image gets the image blocked.
- **Different host.** `localhost` versus `internradar.online`. A relative URL like `/data/jobs.json` works in both. An absolute URL like `http://localhost:3000/data/jobs.json` works in exactly one. Section 9.13 shows what happened when this project got that wrong.
- **Different data.** Locally you might have three jobs in the database. Production has three hundred, some with a `null` where you never saw one.
- **Different environment variables.** Your `.env` file holds the Gemini API key. Vercel does not read your `.env`; it has its own copy, and if you forget to set it there, the tailor function fails in production only.

Some teams add a third copy called **staging** — a production-shaped environment used for final checks before real users see the change. This project does not have one. It has something cheaper that fills part of the same role, and Section 9.4 explains it.

The trade-off of having no staging: you find production-only bugs in production. The mitigation is that the site is read-only for visitors — the worst outcome is an ugly page, not lost data.

---

## 9.2 Build steps, and what it means to have none

A **build step** is a program that turns the files you write into different files that get served. Typical jobs it does:

- Compile TypeScript to JavaScript, because browsers cannot run TypeScript.
- Bundle two hundred small files into two big ones, because two hundred HTTP requests are slow.
- Minify — strip spaces, shorten variable names — so downloads are smaller.
- Compile Sass or Tailwind into plain CSS.
- Add a content hash to filenames, `app.7f3a91.js`, so a changed file gets a new URL and old caches cannot serve stale code.

The output of a build is called an **artifact**: the actual bytes that ship. In most modern projects the artifact is not what you edit. You edit `src/App.tsx`; the browser downloads `assets/index-8d2b.js`.

**This project has no build step.** `web/public/app.js` is 825 lines of plain JavaScript that a browser runs directly. `web/public/styles.css` is hand-written CSS. There is no compiler, no bundler, no minifier. The file you edit is the file that ships, byte for byte.

What that actually buys you:

- **The stack trace tells the truth.** When a user's browser reports an error at `app.js:412`, line 412 of the file in your editor is the bug. With a bundler you would be reading a line number from a generated file and needing a source map to translate it back.
- **Deploys cannot fail at build time.** There is no `npm run build` to go red because a transitive dependency published a broken version at 2 a.m.
- **No build configuration to maintain.** No `vite.config.js`, no `tsconfig.json`, no webpack loaders drifting out of date.
- **You can debug production directly.** View source on the live site and you are reading the real code.

What it costs, honestly:

- **No TypeScript.** Type errors that a compiler would catch become runtime errors. Chapter 4 covers how the project compensates with defensive checks.
- **No minification.** The files ship larger than they need to. At this size — one 825-line script, one 550-line stylesheet, both gzipped by the host — that is a few tens of kilobytes, which does not matter. At ten times the size it would.
- **No cache-busting filenames.** Because `app.js` keeps its name forever, a browser holding an old copy can keep it. This is handled with HTTP headers instead, which is weaker than a hashed filename. Section 9.5 shows the header.
- **No dead-code elimination and no npm packages in the browser.** If you want a charting library, you either hand-copy it into the repo or you write the chart yourself.

The rule this teaches: a build step is a tool for a problem. If you do not have the problem, the build step is pure cost — a thing to configure, upgrade, and debug for no gain.

---

## 9.3 Where code can live

A **server** is a computer that is always on, connected to the internet, and waiting to answer requests. **Hosting** means paying for one, or for a slice of one, or for something that behaves like one. There are six broad shapes, cheapest and least flexible first.

**Shared hosting.** One physical machine runs the websites of hundreds of customers. You upload files by FTP. Cheap, but you cannot install anything and a noisy neighbour slows you down. This is where most college club websites still live.

**VPS — virtual private server.** A slice of a real machine, given to you as if it were a whole Linux computer. You get root access, install what you want, and are responsible for everything: security updates, restarting your app when it crashes, backups, firewalls. Roughly ₹400–800 a month. Maximum control, maximum chores.

**Containers.** A **container** is a packaged filesystem plus a process, run in isolation on a shared kernel. Docker is the common tool for making them. The point is that the container has your exact Node version, your exact system libraries, so "works on my machine" also works on the server. You still need something to run the containers.

**PaaS — platform as a service.** You give the platform your code; it decides how to run it. Heroku, Render, Railway, Fly.io. You lose control over the machine and gain never having to patch a kernel.

**Static hosting.** Your site is just files — HTML, CSS, JS, images, JSON — and the host copies them to servers around the world and serves them. No process runs per request. Extremely cheap, extremely fast, and cannot do anything dynamic.

**Serverless functions.** A **serverless function** is one file exporting one handler. The platform runs it only when a request arrives, then throws the process away. You are billed per invocation and per millisecond, not per hour. There is still a server; you just never see it, never patch it, and never keep state in it between requests.

**This project uses static hosting plus one serverless function.** `web/public/` is static files. `web/api/tailor.js` is the single function, which takes a résumé and a job and asks Gemini to tailor one to the other. There is no always-on server anywhere in the architecture. When nobody is on the site, nothing is running and nothing is being billed.

That is only possible because of the design decision in Chapter 1: the watcher does all the work on the author's Mac and publishes the result as a file. The site never queries a database. It downloads one JSON file.

---

## 9.4 Vercel, and what a git-connected deploy does

**Vercel** is a host that specialises in static sites and serverless functions. This project is connected to it from `github.com/akshat0011/intern-radar`.

A **git-connected deploy** works like this. You authorise Vercel to watch your GitHub repository. GitHub then sends Vercel a **webhook** — an HTTP request GitHub makes to a URL you registered, saying "something happened" — every time someone pushes commits. Vercel receives it, fetches that exact commit, runs the build (here: nothing to run), uploads the files to its edge network, and switches the live domain to point at the new upload.

Two properties matter.

**It is atomic.** The switch happens after all files are uploaded. There is no moment where the new `index.html` is live but the old `app.js` is still being served. Compare this with FTP, where you drag files over one at a time and a visitor arriving halfway gets a half-updated site.

**It is reversible.** Every deploy keeps its own immutable URL. Rolling back is repointing the domain at yesterday's deploy — seconds, no rebuild, no git revert.

**Preview deployments** are the third property. Push to a branch that is not `main`, or open a pull request, and Vercel builds it and gives you a separate URL, something like `intern-radar-git-fix-header.vercel.app`. It is the real production stack — same CDN, same functions, same headers — with different code. That is this project's substitute for a staging environment: instead of one permanent staging server, every branch gets a temporary one, free, for as long as it exists.

A **CDN — content delivery network** — is a set of servers in many cities that all hold a copy of your files. A visitor in Bengaluru is served from a machine near Bengaluru rather than from Virginia. Chapter 2, *How the Web Actually Works*, covers this; the operational consequence here is that when you deploy, you are updating many copies, and the rules for how long each copy may hold onto a file are set by headers.

---

## 9.5 `web/vercel.json`, line by line

This is the entire configuration file for the site. Twenty-six lines.

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), interest-cohort=()" }
      ]
    },
    {
      "source": "/data/jobs.json",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ],
  "functions": {
    "api/tailor.js": {
      "maxDuration": 60
    }
  }
}
```

`web/vercel.json:1-26`.

An **HTTP header** is a `Name: value` line the server sends alongside a file, telling the browser something about it that is not in the file itself.

**`$schema`** points at a JSON Schema document. It does nothing at deploy time. It exists so your editor can autocomplete keys and underline typos before you push. Free correctness.

**`"framework": null`** says explicitly: this is not Next.js, not Nuxt, not anything. Vercel auto-detects frameworks by sniffing `package.json`, and a wrong guess would make it try to run a build that does not exist. Writing `null` turns the guessing off. This one line is the "no build step" decision from Section 9.2, made explicit to the host.

**`"source": "/(.*)"`** is a path pattern. The `(.*)` is a regular-expression-style wildcard meaning "any characters", so this block applies to every path on the site. The four headers in it are security headers:

- **`X-Content-Type-Options: nosniff`** — the browser must believe the `Content-Type` the server declared and must not guess from the bytes. Without it, a browser that decides a `.json` file "looks like" JavaScript may execute it.
- **`X-Frame-Options: DENY`** — no other site may load this page inside an `<iframe>`. That blocks **clickjacking**, where an attacker layers an invisible copy of your page over their own so that a user clicking "Play" actually clicks your button.
- **`Referrer-Policy: strict-origin-when-cross-origin`** — when the browser follows a link off the site, it normally tells the destination which page you came from, full URL and all. This sends only the origin (`https://internradar.online`) to other sites, and nothing at all when going from HTTPS to HTTP.
- **`Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()`** — the empty parentheses mean "no one, including this page". The site never needs a camera, a microphone, or your location, so it gives up the right to ask. `interest-cohort=()` opts out of a browser ad-targeting scheme. This is defence in depth: if someone ever injected a script into the page, that script still could not turn on the microphone.

**The `Cache-Control` block on `/data/jobs.json`** is the interesting one, because it fights the problem Section 9.2 created.

`public, max-age=0, must-revalidate` means, in three parts:

- `public` — any cache, including the CDN, may store this file.
- `max-age=0` — it is stale immediately.
- `must-revalidate` — a cache must not serve it without checking with the server first.

So every visit asks: "do you still have this version?" The browser sends the `ETag` or `If-Modified-Since` it stored. If nothing changed, the server answers `304 Not Modified` — a tiny response, no file body — and the browser reuses its copy. If the watcher pushed new jobs, the server sends the new file.

This is exactly right for the one file that changes several times a day and must never be stale. Students seeing yesterday's list is the single worst failure this site can have. The cost is one small network round-trip per page load, which is a fair price.

Note what is *not* here: no `Cache-Control` for `app.js` or `styles.css`. Those fall back to Vercel's defaults for static assets. Because they have no content hash in their filename, this is the weakest point in the setup — a browser can hold an old `app.js` longer than you would like after a deploy. The honest answer in an interview is: hashed filenames would be strictly better, and that would require a build step, and the project judged the trade the other way.

**`"functions": { "api/tailor.js": { "maxDuration": 60 } }`** raises the execution time limit for the one serverless function to 60 seconds. The default is short — on the order of ten seconds — because serverless is designed for quick request handling. `tailor.js` calls Gemini and waits for a language model to write several paragraphs, which can take twenty or thirty seconds. Without this line the function would be killed mid-answer and the user would see a timeout error that no amount of code fixing would remove.

The trade-off: a long timeout means a stuck request occupies a function for a full minute and bills for a full minute. A tighter limit would fail faster. Sixty seconds is a bet that a slow answer is better than no answer.

---

## 9.6 CI/CD, and this project's one-line version

**CI — continuous integration** — means: every time anyone pushes code, a machine automatically checks out that code and runs the tests and checks. The point is to catch a broken merge in minutes rather than a week later.

**CD — continuous deployment** — means: if those checks pass, the same machine ships it to production without a human pressing anything.

Together they are called a **pipeline**. A normal pipeline is a YAML file describing steps: install dependencies, run linter, run tests, build, deploy. GitHub Actions, GitLab CI, and Jenkins are common runners.

This project's pipeline has one step, and it is not written in YAML. **The watcher pushes to git, and Vercel deploys on push.** That is the whole thing.

Here is a college notice board. The watcher is the student who prints a fresh list and pins it up. Vercel is the arrangement whereby the board is instantly visible to everyone in the hostel. Nobody has to be told; the board *is* the channel. The JSON file committed to git is the notice.

The code lives in `src/publish.js`. Start with the helper.

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

`src/publish.js:133-140`.

`execFileSync` runs another program and waits for it. Note it is `execFileSync`, not `execSync`. `execSync` hands a string to a shell, so a value containing `;` or backticks could execute arbitrary commands. `execFileSync` takes the program name and an **array** of arguments, which never passes through a shell. Since one of the arguments will be a commit message built from data, this matters.

`cwd: ROOT` runs git in the project directory. `stdio: ['ignore', 'pipe', 'pipe']` means: no input, capture output, capture errors. `allowFail` lets a caller ask a question where "no" is a valid answer rather than an exception.

Now the push itself.

```js
export function pushToSite(newJobCount) {
  if (!existsSync(join(ROOT, '.git'))) {
    log.warn('Not a git repository — skipping publish. Run `git init` and connect the GitHub remote first.');
    return false;
  }

  const status = git(['status', '--porcelain', 'web/public/data', 'web/public/logos'], { allowFail: true });
  if (!status) {
    log.info('Job list is unchanged — nothing to publish.');
    return false;
  }

  const remote = git(['remote'], { allowFail: true });
  if (!remote) {
    log.warn('No git remote configured — the jobs file was written but not published.');
    return false;
  }
```

`src/publish.js:146-162`.

Three guards, in order, each cheap and each with a specific message:

1. **Is this even a git repository?** If `.git` does not exist, say so and stop. No crash.
2. **Did anything change?** `git status --porcelain` prints a compact machine-readable list of modified files, scoped to just the two published directories. An empty string means nothing changed. This check is what stops the watcher committing an identical file eight times a day and triggering eight pointless deploys.
3. **Is there anywhere to push to?** A **remote** is a named URL for another copy of the repository, usually `origin` on GitHub. No remote, no publish.

```js
  try {
    git(['add', 'web/public/data', 'web/public/logos']);
    const message = newJobCount > 0
      ? `Add ${newJobCount} new internship${newJobCount === 1 ? '' : 's'}`
      : 'Refresh job listings';
    git(['commit', '-m', message]);

    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    git(['push', 'origin', branch]);
    log.ok(`Published to the site — Vercel will redeploy within a minute.`);
    return true;
  } catch (err) {
    // A publish failure must never fail the scrape; the data is safe locally.
    log.warn(`Could not publish: ${err.message}`);
    log.info('The jobs file is written locally. Push it by hand when convenient.');
    return false;
  }
}
```

`src/publish.js:164-181`.

`git add` stages **only** the two data directories. It is not `git add .` and it is not `git add -A`. A run that also touched a source file, a log, or a stray temp file will not sweep that into the commit. This is the single most important defensive line in the function.

The commit message is generated: `Add 3 new internships`, or `Refresh job listings` when the count is zero but something else changed — a logo, a corrected field. Look at the recent history of this repo and you see `Refresh job listings` over and over. That is the machine's handwriting.

`git rev-parse --abbrev-ref HEAD` asks git for the current **branch** name — a movable label pointing at a line of commits. The function pushes to whatever branch is checked out rather than assuming `main`. If you were on a feature branch when the schedule fired, it pushes there, and Vercel gives you a preview deployment instead of touching production. That is accidental but correct behaviour.

Finally, the `catch`. If the push fails — no network, expired credentials, someone else pushed first — the run logs a warning and returns `false`. It does not throw. The reasoning is in the comment on `src/publish.js:176`: a publishing failure must never fail the scrape. Two hours of careful browser work are already safely in SQLite. Losing the ability to publish is annoying; losing the data is not acceptable.

The caller wraps everything again:

```js
export async function publish(store, cfg, newJobCount) {
  if (cfg.publish?.enabled === false) return;

  try {
    const { count, techCount, path, withLogo, logoBytes } = await writeJobsFile(store, cfg);
    log.info(`Wrote ${count} jobs (${techCount} tech, ${count - techCount} other) to ${path.replace(ROOT, '.')} — ${withLogo} with a logo, ${Math.round(logoBytes / 1024)} KB stored`);
    if (cfg.publish?.autoPush !== false) pushToSite(newJobCount);
  } catch (err) {
    log.warn(`Publish step failed: ${err.message}`);
  }
}
```

`src/publish.js:184-194`.

Two switches. `publish.enabled === false` turns the whole step off. `publish.autoPush !== false` writes the file but skips the push — useful when you want to inspect the JSON before it goes live. Both default to on, because the common case should need no configuration.

---

## 9.7 The risk of a program that pushes to your main branch

An unattended process with write access to your production branch is a real risk, and you should be able to name the failure modes rather than wave them away.

**It could commit something it should not.** Mitigated by `git add` naming exactly two paths (`src/publish.js:165`). If it were `git add .`, a stray `.env` copy or a debug dump would be published to a public repository.

**It could publish wrong data.** Mitigated upstream: `writeJobsFile` re-runs the company match at publish time rather than trusting stored labels, because an early bug filed a SolarSquare posting under Ola (`src/publish.js:84-98`). And full job descriptions are deliberately stripped, since they are the employer's copyrighted text (`src/publish.js:13-21`).

**It could fight a human.** If you are editing the repo when the schedule fires, the push can be rejected because the remote has moved on. There is no auto-`pull` and no auto-rebase, which is the safe choice: the run gives up and tells you to push by hand.

**Its credentials are as strong as your own.** The push uses whatever git credential your Mac has. If that is a personal access token with full repo scope, the watcher inherits full repo scope. A deploy-scoped token limited to one repository would be tighter.

**Nobody reviews the commits.** There is no pull request, no approval. For a data-only commit produced by code you wrote, that is proportionate. For anything that changed executable code, it would not be.

The honest summary: this is safe because the blast radius is deliberately small — two directories, data only, one repository, one person. Scale any of those up and you would want the watcher to push to a `data` branch and open a pull request instead.

---

## 9.8 Scheduling: cron, then launchd

Something has to decide when the watcher runs. Running it by hand defeats the point.

**cron** is the classic Unix scheduler: a background program that reads a table of times and commands and runs each command at its time. A **daemon** is a program that runs in the background with no window, waiting for work. A cron line looks like this (made-up example, not from the project):

```
0 12,18 * * * /usr/local/bin/node /path/to/src/index.js
```

Five fields: minute, hour, day-of-month, month, day-of-week, then the command. `0 12,18 * * *` means "at minute 0 of hours 12 and 18, every day". `*` is a wildcard.

cron exists on macOS but is deprecated. Apple's replacement is **launchd**, the process that starts and supervises everything on a Mac from boot onwards. You describe a job to it in a **plist** — a property list, Apple's XML format for configuration. A **LaunchAgent** is a job that runs as you, in your login session, and can therefore touch your GUI.

Why launchd and not cron here:

- **It catches up after sleep.** cron simply misses a slot if the machine was off. launchd fires shortly after wake. That matters enormously for a laptop.
- **It knows about GUI sessions.** This job drives a real Brave browser window. A job must be in a logged-in graphical session for that to work at all.
- **It manages logs, working directory, environment, and process priority** declaratively.
- **It is what macOS actually supervises.** A launchd job appears in System Settings, where the user can see and disable it. cron is invisible.

`bin/install-schedule.sh` writes this plist. Here is the heart of it:

```bash
    <key>StartCalendarInterval</key>
    <array>
        <dict><key>Minute</key><integer>0</integer></dict>
    </array>

    <key>RunAtLoad</key>
    <false/>

    <!-- Only load in a logged-in GUI session; this job opens a browser. -->
    <key>LimitLoadToSessionType</key>
    <string>Aqua</string>

    <!-- The launchd default throttles CPU and I/O, which is wrong for a job
         whose whole purpose is driving a GUI browser. -->
    <key>ProcessType</key>
    <string>Interactive</string>
```

`bin/install-schedule.sh:139-160`.

`StartCalendarInterval` with only `Minute: 0` and no `Hour` key means every hour on the hour — an omitted field is a wildcard, exactly like cron's `*`. `RunAtLoad: false` stops it firing the moment you install it. `Aqua` is the name of the macOS graphical session type. `ProcessType: Interactive` opts out of launchd's default throttling, which is tuned for background maintenance and would slow a browser to a crawl.

(One honest detail: the comment at the top of the file, `bin/install-schedule.sh:2`, still says "runs the watcher at 12:00 and 18:00 daily". The plist it writes is hourly. That is a stale comment — documentation drifting away from code, in a repository of about 5,000 lines. It costs nothing to fix and is worth noticing.)

The environment block matters more than it looks:

```bash
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
```

`bin/install-schedule.sh:167-171`. A launchd job does not inherit your shell's environment. It gets a minimal one. Your `.zshrc` never runs. This is the number-one reason scheduled jobs fail: works in Terminal, silent at noon.

The installer also refuses to install into `~/Desktop`, `~/Documents`, or `~/Downloads` (`bin/install-schedule.sh:29-70`). Those are **TCC**-protected — Transparency, Consent and Control, Apple's permission system. A launchd-spawned process is a bare interpreter with no stable code signature, so macOS grants it nothing, and the job fails silently in a way that is extremely hard to diagnose. Rather than let that happen, the script prints an explanation and offers `--relocate`, which copies the project to `~/Library/Application Support/linkedin-watcher/app`, verifies the copy landed, deletes the original, and leaves a symlink so your old `cd` path still works (`bin/install-schedule.sh:72-101`). A **symlink** is a file that is a pointer to another path.

Registration is three commands:

```bash
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID_NUM" "$PLIST"
launchctl enable "gui/$UID_NUM/$LABEL"
```

`bin/install-schedule.sh:183-188`. `bootstrap` loads a job, but it will not reload an edited plist, so you must `bootout` (unload) first — the `|| true` makes that harmless when nothing was loaded. `enable` clears a "disabled" flag that launchd stores *outside* the plist and that survives reboots and even deleting the plist file. People lose hours to that flag.

### `bin/run.sh` — the wrapper

launchd does not run `src/index.js` directly. It runs a small generated script that runs `bin/run.sh`, and that file exists for one reason, stated at the top:

```bash
# Wrapper that launchd invokes. launchd hands every job a minimal PATH of
# /usr/bin:/bin:/usr/sbin:/sbin — Homebrew is not on it, so a bare `node` is
# "command not found". Locating node explicitly is the whole point of this file.
```

`bin/run.sh:2-4`. So it searches:

```bash
find_node() {
  for candidate in \
    /opt/homebrew/bin/node \
    /usr/local/bin/node \
    "$HOME/.volta/bin/node" \
    "$HOME"/.nvm/versions/node/*/bin/node \
    "$HOME"/.local/share/fnm/*/installation/bin/node \
    /usr/bin/node
  do
    [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  command -v node 2>/dev/null && return 0
  return 1
}
```

`bin/run.sh:19-34`. Homebrew on Apple Silicon, Homebrew on Intel, Volta, nvm, fnm, system. `-x` tests "exists and is executable". The comment at `bin/run.sh:20-21` explains why it points at `/opt/homebrew/bin/node` rather than the versioned Cellar path it links to: the symlink survives `brew upgrade node`, the versioned path does not.

If nothing is found, it does not fail quietly:

```bash
  echo "$(date '+%Y-%m-%d %H:%M:%S') [FATAL] node not found on PATH=$PATH" >> "$LOG"
  /usr/bin/osascript -e 'display alert "Internship watcher failed" message "node could not be found, so the scan did not run." giving up after 120' >/dev/null 2>&1
  exit 1
```

`bin/run.sh:38-42`. `osascript` runs AppleScript. The comment above it records a real finding: a modal alert is the only thing that reliably reaches the user from a launchd context, because notification banners are commonly swallowed. `giving up after 120` auto-dismisses so an unattended Mac is not left with a stuck dialog.

The run itself, and the exit code:

```bash
echo "$(date '+%Y-%m-%d %H:%M:%S') [START] node=$NODE args=$*" >> "$LOG"

"$NODE" --no-warnings=ExperimentalWarning "$HERE/src/index.js" "$@" >> "$LOG" 2>&1
STATUS=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') [EXIT $STATUS]" >> "$LOG"
exit $STATUS
```

`bin/run.sh:45-51`. `>>` appends to the log; `2>&1` sends error output to the same place. `--no-warnings=ExperimentalWarning` silences Node's notice about `node:sqlite` being experimental, so the log stays readable. An **exit code** is a number a program returns: 0 means success, anything else means failure. `$?` reads it, and the wrapper passes it back to launchd unchanged, so launchd's own records agree with the log.

And log rotation, which almost nobody remembers to write:

```bash
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then
  tail -c 1000000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
```

`bin/run.sh:15-17`. **Log rotation** is trimming a log so it does not grow forever. Over 5 MB, keep the last 1 MB. Without this, an hourly job fills a disk in a year.

---

## 9.9 What happens when the Mac is asleep

This is a guaranteed interview question, and the answer is a limitation, not a feature.

**Asleep at a slot:** launchd fires once shortly after the lid opens. If four slots were missed, it does not replay four runs — it coalesces them into one. The plist comment says exactly this at `bin/install-schedule.sh:140-143`.

**Powered off at a slot:** that slot is simply dropped, and the next hour is the recovery.

**The application-level fix:** the same comment notes that the scan widens its own lookback window to cover the gap — `filters.adaptiveWindow`. So a run after a long gap searches further back in time than a run that follows an hour after the last one.

It is like the railway reservation chart. It is prepared at a fixed time before departure. If the clerk's office was shut, the chart is not prepared four times over when it reopens; it is prepared once, covering everything that accumulated.

The residual weakness is real and you should say it plainly: **if the Mac is closed for three days, three days of data are late.** Jobs posted and closed within that window are missed entirely. The site keeps serving the last published JSON, so it is never blank — just stale, and the page shows when it was generated (`generatedAt` in the payload, `src/publish.js:115`). The fix would be to run the watcher on an always-on machine, which would mean giving up the real logged-in Brave profile that makes the scraping work at all. That trade is discussed in Chapter 8.

---

## 9.10 Environment variables and secrets

An **environment variable** is a named value the operating system hands to a program when it starts. A **secret** is any value that grants access — an API key, a token, a password.

Secrets must not be in source code, for a simple reason: source code goes into git, git goes to GitHub, and GitHub is forever. Even a private repository is one accidental setting away from public, and collaborators, forks, and CI logs multiply the copies.

So the Gemini API key lives in a file called `.env` at the project root, in `KEY=value` form. Node 22 can read it natively with `process.loadEnvFile()`, which parses the file and puts its contents into `process.env`. No `dotenv` package needed — consistent with the project's one-dependency rule.

`.env` is listed in `.gitignore`, so git refuses to track it. The convention is to commit a `.env.example` with the key *names* and empty values, so a new person knows what to set without receiving anyone's secret.

Production is separate. Vercel does not see your `.env`. The Gemini key used by `web/api/tailor.js` is set in the Vercel dashboard, stored encrypted, and injected into the function's environment at runtime. Two places, two copies, one common failure: it works locally and 500s in production because you set it in one place only.

**If a key leaks, in this order:**

1. **Revoke and rotate first.** Go to the provider, delete the key, issue a new one. This takes a minute and it is the only step that actually stops the bleeding.
2. **Update every place that used it** — your `.env`, the Vercel dashboard, any other machine.
3. **Then, optionally, scrub history** with `git filter-repo` or BFG and force-push. Understand that this does not undo the leak: GitHub keeps unreachable objects, forks keep their own copies, and scrapers index public repositories within minutes.
4. **Check usage and billing** on the provider dashboard for anything you did not do.
5. **Assume it was used.** Treat any data the key could reach as touched.

The mistake beginners make is doing step 3 first, feeling relieved, and never doing step 1. Deleting the commit does not delete the key.

---

## 9.11 Operations: logs, reports, alerts, backups

**Operations** is everything after the code is correct: knowing it ran, knowing it worked, and getting it back when it does not.

**Logs.** Three streams, deliberately separate. `bin/run.sh` writes `~/Library/Logs/linkedin-watcher/run.log` — timestamped `[START]`, the program's entire output, then `[EXIT n]`. launchd separately writes `launchd.out.log` and `launchd.err.log` in the same directory (`bin/install-schedule.sh:161-164`). The distinction matters when diagnosing: if `run.log` has no `[START]` line for a slot, the job never began — that is a launchd or permissions problem. If it has a `[START]` and an `[EXIT 1]`, the program ran and failed — that is a code or network problem. `src/logger.js` provides levelled, coloured logging inside the program itself (`log.info`, `log.warn`, `log.ok`, `log.debug`), so the same output is readable in a terminal and plain in a file.

**The run report.** `src/report.js` writes a local HTML page summarising a run — what was searched, what was found, what was skipped. `bin/show-report.js` opens it. This is a deliberate choice: a scrape produces too much detail for a log line and not enough for a dashboard, and an HTML file you can open, scroll, and keep is exactly the middle. It is local only. It is not published.

**Alerts.** `src/notify.js` posts macOS notifications through AppleScript when something goes wrong. Combined with the modal alert in `bin/run.sh:41`, that gives two levels: a banner for "the run had a problem", a modal dialog for "the run could not start at all".

**When a run goes wrong, check in this order:**

1. `tail -f ~/Library/Logs/linkedin-watcher/run.log` — did it start, and what was the exit code?
2. `launchctl print gui/$(id -u)/com.akshat0011.linkedin-watcher` — is the job still registered? (`bin/install-schedule.sh:194`)
3. System Settings → General → Login Items & Extensions — macOS lets the user switch the agent off, and it stays off. The installer warns about this at `bin/install-schedule.sh:200-202`.
4. Is the LinkedIn session still valid? `src/guard.js` detects logouts and captchas and aborts safely rather than thrashing. Re-login with `bin/login.js`.
5. Did the publish step run? Look for `Published to the site` or `Could not publish` in the log.
6. Reproduce on demand: `launchctl kickstart -k gui/$(id -u)/com.akshat0011.linkedin-watcher` (`bin/install-schedule.sh:195`).

**Backups.** This is the part people skip. **The SQLite database file is the entire state of this project.** Every job ever seen, every classification, every enrichment. The code is on GitHub and can be re-cloned. The database cannot be recovered — re-scraping cannot bring back a posting that has been taken down.

The backup procedure is: copy the file. It lives in the watcher's state directory, `~/Library/Application Support/linkedin-watcher` (`bin/install-schedule.sh:17`); `src/paths.js` decides the exact filename. One caveat: copying a SQLite file while the watcher is mid-write can catch it between two writes. Copy when no run is in progress, or use `sqlite3 file.db ".backup out.db"`, which takes a consistent snapshot of a live database. A `cp` in a daily script, plus Time Machine on the folder, is enough for a project of this size — and it is infinitely better than the zero backups most side projects have.

---

## 9.12 Docker, monitoring, and scaling — none of which this project uses

Naming what you did *not* build, and why, is a stronger answer than pretending the question does not apply.

**Docker.** A container packages your app with its exact runtime and libraries, so the same image runs identically anywhere. This project does not use it. The watcher must drive the user's real Brave browser with their real logged-in profile on their real Mac — the thing Docker is for, isolating from the host, is precisely the thing that would break it. The site has nothing to containerise: static files and one function that Vercel runs. **You would need Docker when** you have more than one runtime dependency to pin, more than one machine to deploy to, or a team who each need an identical environment. If this ever moved to a Linux server with a headless browser, Docker would be the right first step.

**Monitoring.** Automatically watching a running system and alerting when it misbehaves — uptime pings, error trackers like Sentry, dashboards. This project has notifications and a log file, which is monitoring for an audience of one. Nothing tells the author if the site is down; they would find out by opening it. **You would need real monitoring when** other people depend on the service, when downtime costs something, or when the system is too large to check by eye. The cheapest real upgrade here would be an uptime checker hitting `/data/jobs.json` and emailing if `generatedAt` is more than a day old — that single check would catch nearly every failure mode described in this chapter.

**Scaling.** Handling more load. The site scales already, for free, because it is static: a CDN serving one JSON file to ten thousand people is the easy case. The `tailor` function scales too — serverless platforms run more copies on demand, though at Gemini's rate limits and cost. **What does not scale is the watcher.** It is one watchlist, one browser, one Mac, one person. Ten users with different watchlists would need a real backend, a queue, a job runner, per-user auth, and an answer for the fact that ten times the scraping is ten times the chance of being blocked. That is not a small change; it is a different project. Saying so is more credible than claiming the architecture "would scale with minor changes".

---

## 9.13 The DNS incident: verify from outside your own machine

**DNS — the Domain Name System** — is the internet's phone book. It turns `internradar.online` into an IP address. Chapter 2 covers the lookup path; here is what it feels like when it breaks.

The project previously used a different domain, `interneadar.in`. Its DNS records silently stopped existing — the registration lapsed at the registrar. Nothing crashed. No error appeared in any log. The name simply stopped resolving.

The visible symptom was not "the site is down". It was that **the share card broke**. When you paste a link into WhatsApp or LinkedIn, the app fetches the page and reads `<meta property="og:image">` — the Open Graph tag naming the preview image. That tag held an absolute URL on the dead hostname. So the crawler looked up a name that no longer resolved, got nothing, and rendered a bare grey link.

Three lessons, in order of importance.

**One: your machine is the worst place to test.** The author's browser had the old DNS answer cached, and the site itself had been opened from `localhost` during development. Both hid the failure. The fix in general is to check from somewhere that shares nothing with you: mobile data with WiFi off, `dig internradar.online` from a different network, a friend's phone, or a platform's own preview debugger. If your only evidence that production works is that it works on your laptop, you have no evidence.

**Two: `og:image` must be an absolute URL, and it must be the right one.** A relative path like `/card.png` works fine for a browser rendering the page and fails for a crawler that needs a full address. Moving to `internradar.online` meant rewriting that tag to the new hostname in full, including `https://`.

**Three: crawlers cache hard, and you cannot clear their cache.** Once WhatsApp or LinkedIn has fetched a preview image for a URL, it holds it — sometimes for weeks — and a corrected tag pointing at the same image URL changes nothing. The fix was a **cache-buster**: append a meaningless query parameter, `?v=2`, so the URL is new as far as the cache is concerned and must be fetched again. Same file, different key. It is a blunt trick and it works everywhere.

The general operations principle behind all three: **a failure you cannot see is worse than one that crashes.** A crash gets logged, alerted, and fixed within a day. A DNS record quietly disappearing produces no signal at all — until someone shares the link and gets a grey box. That is why Section 9.12's suggestion of an external check matters more than it sounds.

---

## Chapter summary

- Development is your machine and production is everyone else's; the bugs live in the differences — paths, filename case, protocol, hostname, data volume, and environment variables.
- This project has no build step, so the file you edit is the file that ships: real line numbers in stack traces and no build that can fail, at the cost of no TypeScript, no minification, and no hashed filenames for cache-busting.
- Hosting ranges from shared hosting through VPS, containers, PaaS, static hosting, and serverless; this project uses static hosting plus exactly one serverless function, so nothing runs when nobody is visiting.
- A git-connected Vercel deploy is atomic and reversible, and every non-`main` branch gets a free preview deployment that stands in for a staging environment.
- `web/vercel.json` is 26 lines: four security headers on every path, `must-revalidate` on `jobs.json` so students never see a stale list, `"framework": null` to stop framework auto-detection, and `maxDuration: 60` because a language model takes longer to answer than a serverless default allows.
- The CI/CD pipeline is `git push` inside `src/publish.js` plus Vercel's webhook — no YAML, no runner — and it is safe mainly because `git add` names exactly two data directories.
- macOS `launchd` is used instead of cron because it catches up after sleep, understands GUI sessions, and is what macOS actually supervises; `bin/run.sh` exists because launchd gives a job a minimal `PATH` in which `node` cannot be found.
- If the Mac is asleep the run fires after wake and missed slots coalesce into one; if it is off, that data is simply late, and the scan widens its own lookback window to compensate.
- Secrets live in a gitignored `.env` read by `process.loadEnvFile()` locally and in the Vercel dashboard in production; if a key leaks, rotate it first and treat history-scrubbing as optional cleanup.
- The SQLite file is the whole state and is the only thing that cannot be rebuilt — back it up, ideally with `sqlite3 ".backup"` rather than a plain copy of a live database.

## Key takeaways

Shipping is not a step at the end; it is a set of design decisions that start at the first line of code. This project chose the smallest deployment story that could work — files in git, a host that watches git, an OS scheduler that runs a script — and every piece of that is legible and debuggable by one person on a Saturday. The price is honest and specific: no staging, no monitoring, no redundancy, and a system that stops when a laptop closes. What survives a year later is the operating principle behind the DNS incident: verify from outside your own machine, because the failures that hurt are the ones that never raise an error.

## Interview questions

**1. What is a build step, and why does this project not have one?**
A build step transforms the files you write into the files that get served — compiling TypeScript, bundling modules, minifying, adding content hashes to filenames. This project ships plain ES modules and hand-written CSS that browsers run directly, so `web/public/app.js` is byte-for-byte what a visitor downloads. The benefits are concrete: stack traces point at real line numbers in files I can open, and a deploy can never fail because a build broke. The costs are equally concrete: no type checking, larger downloads, and no hashed filenames, so cache invalidation has to be handled with HTTP headers instead. At 825 lines of browser code with zero browser dependencies, the build step would be pure overhead. If the codebase tripled or I wanted TypeScript, I would add one.

**2. Explain what happens between `git push` and the site being updated.**
The push sends commits to GitHub. GitHub fires a webhook — an HTTP request to a URL Vercel registered — telling Vercel that the repository changed. Vercel fetches that exact commit, runs the build (nothing, since `"framework": null` in `web/vercel.json:3`), and uploads the resulting files to its CDN edge nodes. When all files are in place it atomically switches the domain to point at the new deployment, so no visitor ever sees a half-updated site. The whole thing takes under a minute, and because each deploy keeps its own immutable URL, rolling back is repointing the domain rather than reverting code.

**3. Walk me through `pushToSite` in `src/publish.js`.**
It starts with three guards: is there a `.git` directory, did anything actually change under `web/public/data` and `web/public/logos` according to `git status --porcelain`, and is a remote configured. Each failure logs a specific message and returns `false` instead of throwing. Then it stages only those two directories — never `git add .` — builds a commit message from the new-job count, reads the current branch with `git rev-parse --abbrev-ref HEAD`, and pushes to that branch rather than assuming `main`. Everything from `git add` onward is inside a `try`, and the `catch` logs a warning and returns `false`. That last part is deliberate: a failed push must never fail the scrape, because the data is already safely in SQLite and a publish can be retried by hand.

**4. Why `execFileSync` and not `execSync`?**
`execSync` passes a single string to a shell, so any shell metacharacter inside it — a semicolon, backticks, `$()` — is interpreted as a command. `execFileSync` takes the program name and an array of arguments and does not involve a shell at all, so an argument containing `;` is just text. In `src/publish.js:135` one of the arguments is a commit message built from program data, and while the current inputs are a number and fixed words, the safe form costs nothing today and protects the day someone interpolates a job title into that message. It is the same reasoning as using parameterised SQL queries instead of string concatenation.

**5. What is `Cache-Control: public, max-age=0, must-revalidate` doing on `jobs.json`?**
It allows any cache, including the CDN, to store the file, but marks it stale immediately and forbids serving it without checking with the origin. So every page load sends a conditional request with the stored `ETag`, and the server either replies `304 Not Modified` — a few bytes, no body — or sends the new file. The point is that `jobs.json` is the one thing that changes several times a day, and a student seeing yesterday's internships is the worst failure this site can produce. The cost is one round-trip per visit, which is cheap compared to being wrong.

**6. Why launchd rather than cron?**
cron is deprecated on macOS and, more importantly, it just misses a slot if the machine was asleep, which is most of the time for a laptop. launchd fires shortly after wake and coalesces several missed slots into one run. It also understands GUI sessions — `LimitLoadToSessionType: Aqua` in the plist ensures the job only loads inside a logged-in graphical session, which matters because this job opens a real browser window. And it handles logging, working directory, environment, and process priority declaratively, including `ProcessType: Interactive` to opt out of launchd's default CPU throttling.

**7. Hostile: your watcher pushes to your main branch, unattended, with your credentials. Why is that not reckless?**
It is a real risk and the mitigations are narrow rather than absolute. The strongest one is that `git add` names exactly two data directories, so the process cannot sweep in a stray `.env` or debug file the way `git add .` would. The commit contains data only — never executable code — so an unreviewed commit cannot change what the site does, only what it shows. What I would criticise honestly: it uses my own git credentials, so it inherits my full access, and a deploy-scoped token would be tighter; there is no review step; and if I am editing the repo when it fires, the push can be rejected and the run just gives up. For a one-person data feed that is proportionate. If anyone else depended on this, I would have it push to a `data` branch and open a pull request.

**8. Hostile: your site is stale whenever your laptop is closed. Isn't the whole architecture broken?**
It is a genuine limitation and I will not dress it up. If the Mac is off for three days, three days of postings are late, and jobs that opened and closed inside that window are missed entirely. The site never goes blank — it keeps serving the last published JSON and shows its `generatedAt` timestamp — but stale is stale. Two things reduce the damage: launchd fires after wake instead of skipping, and the scan widens its own lookback window after a gap. The reason I accept it is that the scraper's viability depends on driving a real, logged-in Brave profile with human-like pacing; moving it to an always-on server means a headless browser on a data-centre IP, which is exactly the profile that gets blocked. I chose freshness risk over blocking risk, and I would revisit that if the site had real users.

**9. What is a serverless function, and why does `web/api/tailor.js` need `maxDuration: 60`?**
A serverless function is a single handler the platform starts when a request arrives and discards afterwards; you pay per invocation and per millisecond, and you cannot keep state between requests. Vercel's default timeout is short — around ten seconds — because the model use case is a quick request-response. `tailor.js` calls Gemini and waits for it to write several paragraphs, which regularly takes twenty to thirty seconds, so without `maxDuration: 60` in `web/vercel.json:21-25` the function would be killed mid-answer and no amount of application-level fixing would help. The trade-off is that a genuinely stuck request now occupies and bills a function for a full minute; I judged a slow answer better than a guaranteed failure.

**10. A scheduled run produced nothing overnight. How do you debug it?**
First `tail` the run log at `~/Library/Logs/linkedin-watcher/run.log` and look for a `[START]` line at the expected hour. No `[START]` means the program never launched, which points at launchd, at the Login Items toggle in System Settings that macOS lets a user flip, or at TCC permissions — so I check `launchctl print` next. A `[START]` followed by `[EXIT 1]` means the program ran and failed, so I read its own output for the reason, most often a LinkedIn session that `src/guard.js` detected as logged out or captcha-gated. Then I check whether the publish step reported `Published to the site` or `Could not publish`, since the scrape and the push fail independently. Finally I reproduce on demand with `launchctl kickstart -k`, at the keyboard, so any permission prompt appears where I can see it.

**11. Hostile: you have no tests in your deploy pipeline and no monitoring. How would you even know the site is broken?**
Today, honestly, I would find out by opening it — and the DNS incident proved that is not good enough, because the domain stopped resolving and nothing anywhere raised an error. There are three tests run with Node's built-in `assert`, but they are run by hand and nothing gates the deploy on them, and there are no tests at all for the browser code. The cheapest real fix is not a test suite: it is one external check that fetches `/data/jobs.json` from outside my network and alerts if the request fails or if `generatedAt` is more than a day old. That single check catches a dead domain, a dead deploy, a broken publish step, and a laptop that has been shut for a week. Adding it is on the list, and I would rather say that than claim the current setup is adequate.

**12. Where do secrets live, and what would you do if the Gemini key leaked?**
Locally in a `.env` file at the project root, read by Node's built-in `process.loadEnvFile()` — no `dotenv` package, consistent with the project having exactly one npm dependency — and `.env` is gitignored so git will not track it. In production the key is set in the Vercel dashboard, stored encrypted, and injected into the function's environment, so there are two copies and a classic failure where it works locally and 500s in production. If it leaked, I would revoke and reissue the key first, then update `.env` and Vercel, then check the provider's usage dashboard for calls I did not make. Scrubbing git history with `filter-repo` comes last and is cleanup, not a fix — GitHub retains unreachable objects, forks keep copies, and public repositories are scraped within minutes. Deleting the commit does not delete the key.

## Common beginner mistakes

**Testing production only from your own browser.** It looks right because your machine has cached DNS answers, cached files, a logged-in session, and possibly a `localhost` tab you forgot about. What actually happens is that your evidence is contaminated by everything your machine already knows. The fix: check from mobile data with WiFi off, from a different network with `dig` or `curl`, or from a friend's phone. If it works only where you are, you have tested nothing.

**Committing `.env` "just this once, it's a private repo".** It looks fine because the repository is private and only you can see it. What actually happens is that private repos become public by accident, collaborators get added, forks are made, CI logs echo the environment, and automated scrapers index new public repositories within minutes. The fix: `.env` in `.gitignore` from the first commit, a `.env.example` with names and blank values committed instead, and if it ever slips through, rotate the key rather than just deleting the commit.

**Using `git add .` in an automated script.** It looks convenient — stage everything, why enumerate paths. What actually happens is that an unattended process publishes whatever happened to be lying around: a log file, a database dump, a scratch copy of `.env`, a half-finished edit. `src/publish.js:165` names two directories precisely for this reason. The fix: in any script that commits, always name the exact paths, and add nothing else.

**Assuming a scheduled job inherits your shell environment.** It looks correct because `node src/index.js` runs perfectly when you type it. What actually happens is that launchd gives the job a minimal `PATH` and never runs your `.zshrc`, so `node` is "command not found" and the job fails silently at noon. That is the entire reason `bin/run.sh` exists, as its opening comment states. The fix: locate interpreters by absolute path, set `PATH` explicitly in the plist, and log the failure loudly instead of exiting quietly.

**Expecting a changed `og:image` tag to update an old share preview.** It looks fixed because the page source is now correct and the image URL loads in your browser. What actually happens is that WhatsApp, LinkedIn, and Slack cached the preview against the URL and will keep serving the old grey box for weeks. The fix: change the URL itself with a cache-buster like `?v=2`, so caches treat it as a new resource, and check with the platform's own link preview debugger rather than by resharing to friends.

**Backing up code but not data.** It looks safe because everything is on GitHub. What actually happens is that the SQLite file — the only irreplaceable thing in the project — was never in git and is not backed up anywhere, so a disk failure loses every posting ever collected, including ones that have since been taken down and can never be re-scraped. The fix: a scheduled `sqlite3 file.db ".backup out.db"` into a folder Time Machine or a cloud drive watches.

## Exercises

1. **Read the headers.** Open a terminal and run `curl -I https://internradar.online/data/jobs.json`. Write down every response header you get and say what each one does. Then run it again with `-H 'If-None-Match: <the etag you just got>'` and explain why the status code changes.

2. **Find the drift.** `bin/install-schedule.sh:2` says the watcher runs at 12:00 and 18:00. The plist it writes says something else. Find the exact lines that disagree, decide which is true, and write the one-line change that would make the comment correct — or the plist change that would make the comment true.

3. **Trace a failure path.** Starting at `src/publish.js:184`, list every distinct way the publish step can end without the site being updated, and for each one write the exact log line the user would see. There are at least six.

4. 🔴 **Add the missing check.** Design an external uptime check for this project. Specify: what URL it fetches, what it inspects in the response (be precise about which field and what threshold), how often it runs, where it runs from and why that must not be the author's Mac, and what it does when the check fails. Then explain which of the failure modes in Section 9.11 it would catch and which it would miss.

5. 🔴 **Cost out the container.** Write the case for and against moving the watcher into Docker on a rented VPS. Address specifically: the real Brave profile, LinkedIn's blocking behaviour toward data-centre IP addresses, what would replace the macOS notifications, where the SQLite file would live, and what the monthly cost would be. Reach a recommendation and defend it.

## Quiz

1. What does `"framework": null` in `web/vercel.json` prevent?
2. Why does `pushToSite` run `git status --porcelain` before committing?
3. Name two things launchd does that cron does not, and say why each matters to this project.
4. What is the single purpose of `bin/run.sh`, according to its own opening comment?
5. Why does `web/api/tailor.js` need `maxDuration: 60`, and what does that cost?
6. Your Gemini key appears in a public commit. What is the first action, and why is deleting the commit not it?

---

### Quiz answers

1. It stops Vercel auto-detecting a framework from `package.json` and trying to run a build that does not exist. The project has no build step, so the correct build is no build.
2. To avoid committing an identical file when nothing changed. Without it, every scheduled run would produce a commit and trigger a pointless redeploy, filling the history with noise. An empty `--porcelain` output means nothing changed, and the function returns early with `Job list is unchanged — nothing to publish.`
3. (a) launchd fires a missed job shortly after the Mac wakes and coalesces several missed slots into one run; cron simply skips them — this matters because the watcher runs on a laptop that is asleep most of the day. (b) launchd understands GUI sessions via `LimitLoadToSessionType: Aqua`, so the job only runs where it can open a real browser window; cron has no such concept. (Also acceptable: declarative logging, working directory, environment, and `ProcessType` priority control.)
4. To locate the `node` binary. launchd hands every job a minimal `PATH` of `/usr/bin:/bin:/usr/sbin:/sbin`, which does not include Homebrew, so a bare `node` is "command not found". `find_node()` checks Homebrew (both architectures), Volta, nvm, fnm, and the system path in order.
5. Because it waits for Gemini to write a tailored résumé, which regularly takes twenty to thirty seconds, while the platform default is around ten. Without it the function is killed mid-answer. The cost is that a stuck request occupies and bills a function invocation for a full minute before failing.
6. Revoke the key at the provider and issue a new one. Deleting the commit does not help, because GitHub retains unreachable objects, forks and clones keep their own copies, and public repositories are scraped by bots within minutes of a push. Rotation is the only step that actually stops the key from working; history scrubbing is cleanup afterwards.
