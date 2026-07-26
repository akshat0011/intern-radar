#!/usr/bin/env node
/**
 * One-time interactive LinkedIn sign-in.
 *
 * Opens the tool's own Brave profile and waits while YOU sign in by hand. The
 * script never types, reads, or stores your password — it only waits for the
 * session cookie to appear, after which the profile keeps you signed in for
 * every scheduled run.
 */
import { loadConfig } from '../src/config.js';
import { ensureDirs } from '../src/paths.js';
import { launchBrave, closeBrave, hasLinkedInSession } from '../src/browser.js';
import { log } from '../src/logger.js';
import { sleep } from '../src/human.js';

const WAIT_MINUTES = 10;

ensureDirs();
const cfg = loadConfig();

log.section('LinkedIn sign-in');

const session = await launchBrave(cfg, { forLogin: true });
const { context, page } = session;

try {
  if (await hasLinkedInSession(context)) {
    log.info('There is already a session cookie in this profile — checking it still works…');
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' });
    await sleep(4000);
    const url = page.url();
    if (/\/feed/.test(url)) {
      log.ok('Already signed in and the session is valid. Nothing to do.');
      log.info('Next: `npm run dry-run` to test a small scan.');
      await closeBrave(session);
      process.exit(0);
    }
    log.warn('The stored session is stale. Please sign in again.');
  }

  await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' });

  console.log(`
  ┌──────────────────────────────────────────────────────────────┐
  │  Sign in to LinkedIn in the Brave window that just opened.   │
  │                                                              │
  │  • Type your own email and password — this script does not   │
  │    touch them and never stores them.                         │
  │  • Complete 2FA or any security check if prompted.           │
  │  • Tick "Remember me" so the session lasts.                  │
  │                                                              │
  │  Waiting up to ${String(WAIT_MINUTES).padEnd(2)} minutes, then closing on its own.      │
  └──────────────────────────────────────────────────────────────┘
`);

  const deadline = Date.now() + WAIT_MINUTES * 60_000;
  let ok = false;

  while (Date.now() < deadline) {
    await sleep(3000);

    let url = '';
    try {
      url = page.url();
    } catch {
      log.error('The browser window was closed before sign-in finished.');
      process.exit(1);
    }

    if (/\/checkpoint\//.test(url)) {
      process.stdout.write('\r  Security check in progress — finish it in the window…      ');
      continue;
    }

    if (await hasLinkedInSession(context)) {
      // Confirm the cookie actually works rather than trusting its presence.
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(3000);
      if (/\/feed/.test(page.url())) {
        ok = true;
        break;
      }
    }

    const left = Math.ceil((deadline - Date.now()) / 60_000);
    process.stdout.write(`\r  Waiting for sign-in… ${left} min left     `);
  }

  process.stdout.write('\n');

  if (ok) {
    log.ok('Signed in. The session is saved in data/brave-profile and will be reused by every run.');
    log.info('Next: `npm run dry-run` to test a small scan, then `npm run install-schedule` for 12:00 / 18:00.');
  } else {
    log.error('Sign-in did not complete in time. Run `npm run login` again when you are ready.');
    process.exitCode = 1;
  }
} finally {
  await closeBrave(session);
}
