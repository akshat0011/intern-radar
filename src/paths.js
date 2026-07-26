import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const APP_ID = 'linkedin-watcher';

/**
 * Runtime state deliberately lives OUTSIDE the project directory.
 *
 * macOS puts ~/Desktop, ~/Documents and ~/Downloads behind TCC. A process
 * spawned by launchd is attributed to a bare interpreter with no stable code
 * signature, so it gets no grant for those folders — the tool works when you
 * run it in Terminal (which already has a grant) and then fails silently at
 * 12:00. ~/Library/Application Support carries no such restriction.
 */
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

  logs: LOGS,

  /** Where install-schedule.sh puts the script launchd actually executes. */
  launchScriptDir: join(homedir(), 'Library', 'Application Scripts', `com.akshat0011.${APP_ID}`),
};

/** Directories that must exist before use. launchd never creates them for us. */
const MANAGED = ['state', 'profile', 'reports', 'screenshots', 'logs'];

export function ensureDirs() {
  for (const key of MANAGED) {
    mkdirSync(PATHS[key], { recursive: true });
  }
}

/** True when the project sits in a TCC-protected folder. */
export function inProtectedFolder(path = ROOT) {
  const home = homedir();
  return ['Desktop', 'Documents', 'Downloads'].some((d) => path.startsWith(join(home, d)));
}
