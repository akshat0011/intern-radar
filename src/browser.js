import { existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { PATHS } from './paths.js';
import { log } from './logger.js';

export const BRAVE_PATH = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

/**
 * Playwright cannot drive your everyday Brave.
 *
 * Two independent blockers: Chromium 136+ refuses remote debugging on the
 * default user-data-dir, and a running Brave holds the profile lock so a second
 * launch just relays and exits. So the tool keeps its own profile, which you
 * sign into once via `npm run login`.
 */
function braveArgs(cfg) {
  const [w, h] = cfg.browser.windowSize;
  const [x, y] = cfg.browser.windowPosition ?? [40, 40];

  const args = [
    // Window geometry has to come through as a Chromium arg. Setting a
    // Playwright `viewport` instead decouples the CSS viewport from the real
    // window, producing an outerWidth/innerWidth mismatch no real browser has.
    `--window-size=${w},${h}`,
    `--window-position=${x},${y}`,

    // The one masking flag that matters. navigator.webdriver is true by
    // default even with a real Brave binary, a persistent profile and a headed
    // window; this clears it at the Blink level, leaving no JS artifact.
    '--disable-blink-features=AutomationControlled',

    '--no-first-run',
    '--no-default-browser-check',
    '--disable-brave-update',

    // If a previous run ended badly, Chromium offers to restore its tabs. The
    // bubble steals the viewport, and accepting it reopens a window of stale
    // job pages that the scan then treats as the current one. We always start
    // from a known URL, so there is nothing worth restoring.
    '--hide-crash-restore-bubble',
    '--restore-last-session=false',
  ];

  // Brave's Shields extension. Not normally needed: Playwright passes
  // --disable-component-update, and Brave ships its ad-block lists as an
  // updatable component, so a fresh profile has no filter data to match on.
  if (cfg.browser.disableBraveShields) args.push('--disable-brave-extension');

  // Deliberately NOT passed: --disable-features / --enable-features. Playwright
  // already sets both with long, load-bearing lists, and a second copy of the
  // switch replaces rather than extends them. The commonly cited Brave flags
  // (--disable-brave-rewards, --disable-brave-wallet) are not real switches
  // anyway, and Rewards shows no onboarding on a fresh profile with
  // --no-first-run.
  return args;
}

/** Which app currently owns the keyboard. Needs no accessibility permission. */
function frontmostApp() {
  try {
    const asn = execFileSync('/usr/bin/lsappinfo', ['front'], { encoding: 'utf8' }).trim();
    const info = execFileSync('/usr/bin/lsappinfo', ['info', '-only', 'name', asn], { encoding: 'utf8' });
    return (info.match(/"([^"]*)"$/m) || [])[1] || null;
  } catch {
    return null;
  }
}

/**
 * Hand focus back to whoever had it. Chromium calls
 * -[NSApp activateIgnoringOtherApps:] on launch, so a headed window always
 * steals focus — even positioned off-screen. The theft is a one-time event at
 * launch, so a single `open -a` settles it; later navigation and screenshots do
 * not re-steal. Uses `open` rather than osascript because LaunchServices needs
 * no Automation permission, while Apple Events do.
 */
function restoreFocus(appName) {
  if (!appName || appName === 'Brave Browser') return;
  try {
    execFileSync('/usr/bin/open', ['-a', appName], { stdio: 'ignore' });
  } catch { /* cosmetic only */ }
}

/**
 * Free the tool's Brave profile before launching.
 *
 * This is the fix for the failure mode that cost more runs than anything else:
 * `launchPersistentContext` hanging until its timeout with
 * "Timeout 180000ms exceeded ... <launching> /Applications/Brave". It looks like
 * a launch problem and reads like a CAPTCHA stall, but it is neither — a Brave
 * from an earlier run is still alive and holding the profile's singleton lock,
 * so the new launch waits forever for a profile it will never get. The symptom
 * you see is leftover windows full of about:blank tabs.
 *
 * Two rules keep this safe:
 *   1. Match on the profile path, never on the process name. Killing "Brave" by
 *      name would take the user's ordinary browser and every tab in it with it.
 *      Only a process whose command line carries `--user-data-dir=<our profile>`
 *      is ours to end.
 *   2. Terminate politely first. SIGKILL on Chromium leaves the profile marked
 *      unclean, which is what produces the "Brave didn't shut down correctly"
 *      restore-tabs bar on the next launch — another source of stray tabs.
 */
function releaseProfileLock() {
  let ours = [];
  try {
    const ps = execFileSync('/bin/ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 8 << 20 });
    ours = ps
      .split('\n')
      .filter((line) => line.includes(PATHS.profile))
      .map((line) => Number(line.trim().split(/\s+/)[0]))
      .filter((pid) => Number.isFinite(pid) && pid !== process.pid);
  } catch {
    return; // ps unavailable — fall through and let the launch try anyway.
  }

  if (ours.length) {
    log.warn(`Found ${ours.length} leftover Brave process${ours.length === 1 ? '' : 'es'} holding the tool profile — closing ${ours.length === 1 ? 'it' : 'them'} before launching.`);
    for (const pid of ours) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
    }
    // Give Chromium a moment to release the lock and write a clean profile.
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const alive = ours.filter((pid) => { try { process.kill(pid, 0); return true; } catch { return false; } });
      if (!alive.length) break;
      try { execFileSync('/bin/sleep', ['0.25']); } catch { break; }
    }
    for (const pid of ours) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* exited cleanly */ }
    }
  }

  // Stale singleton links survive a hard kill and block the next launch on
  // their own, so clear them whether or not we just killed anything.
  try {
    for (const name of readdirSync(PATHS.profile)) {
      if (name.startsWith('Singleton')) {
        rmSync(join(PATHS.profile, name), { force: true, recursive: true });
      }
    }
  } catch { /* profile not created yet */ }
}

/**
 * Launch Brave with the tool's persistent profile.
 * Returns { context, page }. Pass `{ forLogin: true }` for the sign-in flow,
 * which must not assume a session already exists.
 */
export async function launchBrave(cfg, { forLogin = false } = {}) {
  if (!existsSync(BRAVE_PATH)) {
    throw new Error(`Brave is not at ${BRAVE_PATH}. Install Brave, or edit BRAVE_PATH in src/browser.js.`);
  }
  if (cfg.browser.headed === false) {
    // Headless leaks "HeadlessChrome" in the user agent and collapses the
    // screen to 800x600 — both trivially detectable.
    throw new Error('browser.headed must stay true. Headless mode is detectable and will get the account flagged.');
  }

  mkdirSync(PATHS.profile, { recursive: true });
  const firstEver = !existsSync(join(PATHS.profile, 'Default'));

  if (!forLogin && firstEver) {
    throw new Error('No LinkedIn session yet. Run `npm run login` once to sign in.');
  }

  const previousApp = frontmostApp();

  // Must happen before the launch, not after: the whole point is that the
  // profile is free by the time Playwright asks for it.
  releaseProfileLock();

  log.info('Launching Brave…');

  // Only these four options, plus args. Overriding locale, timezoneId or
  // userAgent can only create a mismatch between JS values, HTTP headers and
  // the real IP geolocation — on the user's own machine the natural values are
  // correct by definition.
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
    // Default is 180s. With the profile lock released above, a launch either
    // works in a few seconds or is never going to — and on a 15-minute schedule
    // a 3-minute hang eats a fifth of the slot before the run even starts.
    timeout: 45_000,
  });

  if (cfg.browser.returnFocus !== false) restoreFocus(previousApp);

  // No fingerprint-spoofing init script here, deliberately. What keeps this
  // account safe is low volume and honest pacing, not pretending to be a
  // different browser. If LinkedIn challenges the session, the tool stops and
  // asks you — see src/guard.js.

  // Pick the real tab, not a placeholder. Brave can come up with a restored
  // session or its own new-tab page, and `pages()[0]` is then an about:blank
  // that every later health check reads as a broken or challenged page — the
  // run stops on a page that was never LinkedIn to begin with.
  const realPage = context.pages().find((p) => {
    const u = p.url();
    return u && u !== 'about:blank' && !u.startsWith('chrome://') && !u.startsWith('brave://');
  });
  const page = realPage ?? context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  // Close the tabs Brave opened for itself. A single sweep is not enough: the
  // restore-session tab can arrive a moment after launch, so anything that
  // shows up later gets closed too. Without this they accumulate across runs,
  // which is where the window full of about:blank tabs comes from.
  const closeStray = (p) => {
    if (p === page) return;
    p.close().catch(() => {});
  };
  for (const p of context.pages()) closeStray(p);
  context.on('page', closeStray);

  return { context, page, previousApp };
}

export async function closeBrave(session) {
  if (!session) return;
  try {
    // A close that never resolves is how a Brave survives its own run and then
    // blocks the next one. Bound the wait, then fall through to the same
    // profile-lock cleanup the next launch would do — better to end it here,
    // while we still know it is ours, than to leave it for a run 15 minutes
    // from now to discover.
    await Promise.race([
      session.context.close(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('close timed out after 20s')), 20_000)),
    ]);
    log.info('Closed Brave.');
  } catch (err) {
    log.warn(`Brave did not close cleanly (${err.message}) — releasing the profile by hand.`);
    releaseProfileLock();
  }
}

/** Bring the automation window forward — used when a CAPTCHA needs a human. */
export function focusBrave() {
  try {
    execFileSync('/usr/bin/open', ['-a', 'Brave Browser'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Is there a usable LinkedIn session cookie in the profile? */
export async function hasLinkedInSession(context) {
  const cookies = await context.cookies('https://www.linkedin.com');
  const liAt = cookies.find((c) => c.name === 'li_at');
  if (!liAt) return false;
  if (liAt.expires && liAt.expires > 0 && liAt.expires * 1000 < Date.now()) return false;
  return true;
}
