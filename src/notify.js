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
