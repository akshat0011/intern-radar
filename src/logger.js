import { appendFileSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { PATHS, ensureDirs } from './paths.js';

const LEVEL_STYLE = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  ok: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

let logFile = null;

function stamp(d = new Date()) {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function fileFor(d = new Date()) {
  return join(PATHS.logs, `run-${d.toISOString().slice(0, 10)}.log`);
}

function write(level, msg) {
  const line = `${stamp()} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  const colour = LEVEL_STYLE[level] ?? '';
  process.stdout.write(`${colour}${line}${RESET}\n`);
  try {
    if (!logFile) {
      ensureDirs();
      logFile = fileFor();
    }
    appendFileSync(logFile, `${line}\n`);
  } catch {
    // Logging must never be the reason a run dies.
  }
}

export const log = {
  debug: (m) => write('debug', m),
  info: (m) => write('info', m),
  ok: (m) => write('ok', m),
  warn: (m) => write('warn', m),
  error: (m) => write('error', m),

  /** A visually distinct section header, so long runs stay readable. */
  section(title) {
    process.stdout.write(`\n\x1b[1m\x1b[35m${'─'.repeat(4)} ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}\x1b[0m\n`);
    try {
      if (!logFile) { ensureDirs(); logFile = fileFor(); }
      appendFileSync(logFile, `\n=== ${title} ===\n`);
    } catch {}
  },
};
