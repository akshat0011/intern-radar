import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from './logger.js';

const exec = promisify(execFile);

let hasTerminalNotifier = null;

function terminalNotifierAvailable() {
  if (hasTerminalNotifier !== null) return hasTerminalNotifier;
  try {
    execFileSync('/usr/bin/which', ['terminal-notifier'], { stdio: 'ignore' });
    hasTerminalNotifier = true;
  } catch {
    hasTerminalNotifier = false;
  }
  return hasTerminalNotifier;
}

/** AppleScript string literal escaping: backslashes and double quotes. */
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * A standard macOS notification banner.
 * Notification Centre can silently swallow these if the delivering app has not
 * been granted permission, so anything urgent should also use `soundAlarm`.
 */
export async function notify(title, message, { sound = 'Ping', subtitle = '' } = {}) {
  try {
    if (terminalNotifierAvailable()) {
      const args = ['-title', title, '-message', message, '-sound', sound];
      if (subtitle) args.push('-subtitle', subtitle);
      await exec('terminal-notifier', args);
      return true;
    }
    const script = subtitle
      ? `display notification "${esc(message)}" with title "${esc(title)}" subtitle "${esc(subtitle)}" sound name "${esc(sound)}"`
      : `display notification "${esc(message)}" with title "${esc(title)}" sound name "${esc(sound)}"`;
    await exec('/usr/bin/osascript', ['-e', script]);
    return true;
  } catch (err) {
    log.warn(`Notification failed (${err.message.split('\n')[0]})`);
    return false;
  }
}

/**
 * Play an audible alert several times. Unlike notification banners this needs
 * no permissions and cannot be missed, which is what we want when a CAPTCHA is
 * blocking the run and a human is needed.
 */
export async function soundAlarm({ times = 4, sound = 'Sosumi' } = {}) {
  const file = `/System/Library/Sounds/${sound}.aiff`;
  for (let i = 0; i < times; i++) {
    try {
      await exec('/usr/bin/afplay', [file]);
    } catch {
      return;
    }
  }
}

/**
 * A blocking dialog that stays on screen until dismissed, with a hard timeout
 * so an unattended run can never wedge forever. Resolves true if the user
 * clicked the confirm button, false on timeout/dismissal.
 */
export async function blockingAlert(title, message, { confirmLabel = 'Done', timeoutSeconds = 600 } = {}) {
  const script = `display dialog "${esc(message)}" with title "${esc(title)}" buttons {"Ignore", "${esc(confirmLabel)}"} default button "${esc(confirmLabel)}" with icon caution giving up after ${timeoutSeconds}`;
  try {
    const { stdout } = await exec('/usr/bin/osascript', ['-e', script], {
      timeout: (timeoutSeconds + 30) * 1000,
    });
    return stdout.includes(`button returned:${confirmLabel}`);
  } catch {
    // osascript cannot always draw a dialog from a background launchd context.
    return false;
  }
}

/**
 * Bring an application to the front so the user lands on the CAPTCHA.
 *
 * Uses `open -a` rather than `tell application … to activate`: the AppleScript
 * form sends an Apple Event, which triggers an Automation permission prompt
 * attributed to /usr/bin/osascript. `open` goes through LaunchServices and
 * needs no permission at all.
 */
export async function focusApp(appName = 'Brave Browser') {
  try {
    await exec('/usr/bin/open', ['-a', appName]);
  } catch {
    /* non-fatal */
  }
}

/** Open a file or URL with the default handler. */
export async function open(target) {
  try {
    await exec('/usr/bin/open', [target]);
    return true;
  } catch {
    return false;
  }
}

/* ---------------- phone push ---------------- */

const NTFY_TIMEOUT_MS = 8_000;

/**
 * Push a notification to the phone via ntfy.sh.
 *
 * A macOS banner is useless when you are not at the machine, which is most of the
 * time — and the entire point of this project is being early. ntfy needs no account
 * and no API key: the topic name IS the credential, which is why it belongs in .env
 * beside the Gemini key and not in config.json.
 *
 * Silent no-op when NTFY_TOPIC is unset, so the watcher runs unchanged for anyone
 * who has not set it up. Never throws: a missed notification must not fail a run
 * that has already done the expensive work.
 *
 * @param {string} title  Notification title.
 * @param {string} body   Notification body. Newlines render as separate lines.
 * @param {{url?: string, tags?: string[], priority?: number}} [opts]
 *        url      makes the notification tappable, opening that link
 *        tags     ntfy renders known tag names as emoji
 *        priority 1 (min) to 5 (max); 4+ breaks through a silent phone
 * @returns {Promise<boolean>} true only if ntfy accepted it
 */
export async function pushToPhone(title, body, { url, tags, priority } = {}) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return false;

  // A topic is a URL path segment and anyone who knows it can publish to it.
  // Reject anything that could escape the path rather than POSTing somewhere odd.
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(topic)) {
    log.warn('NTFY_TOPIC must be 4-64 characters of letters, digits, hyphen or underscore — skipping phone push.');
    return false;
  }

  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NTFY_TIMEOUT_MS);

  try {
    // Headers must be latin-1 safe: ntfy carries the title and tags as headers, and
    // a company name with an em dash or a rupee sign would otherwise throw here.
    const headers = { 'content-type': 'text/plain; charset=utf-8' };
    const asciiTitle = String(title).replace(/[^\x20-\x7E]/g, ' ').trim();
    if (asciiTitle) headers.Title = asciiTitle;
    if (tags?.length) headers.Tags = tags.join(',');
    if (priority) headers.Priority = String(priority);
    if (url) headers.Click = url;

    const res = await fetch(`${server}/${topic}`, {
      method: 'POST',
      headers,
      body: String(body).slice(0, 4000),
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn(`Phone push failed (HTTP ${res.status}) — the run itself is unaffected.`);
      return false;
    }
    return true;
  } catch (err) {
    const why = err.name === 'AbortError' ? 'timed out' : err.message.split('\n')[0];
    log.warn(`Phone push failed (${why}) — the run itself is unaffected.`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
