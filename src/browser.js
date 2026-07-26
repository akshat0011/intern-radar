import { existsSync, mkdirSync } from 'node:fs';
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
  });

  if (cfg.browser.returnFocus !== false) restoreFocus(previousApp);

  // No fingerprint-spoofing init script here, deliberately. What keeps this
  // account safe is low volume and honest pacing, not pretending to be a
  // different browser. If LinkedIn challenges the session, the tool stops and
  // asks you — see src/guard.js.

  const page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);

  // Close any extra tabs Brave opened for itself.
  for (const p of context.pages()) {
    if (p !== page) await p.close().catch(() => {});
  }

  return { context, page, previousApp };
}

export async function closeBrave(session) {
  if (!session) return;
  try {
    await session.context.close();
    log.info('Closed Brave.');
  } catch (err) {
    log.warn(`Brave did not close cleanly: ${err.message}`);
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
