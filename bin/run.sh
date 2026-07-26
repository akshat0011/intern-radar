#!/bin/bash
# Wrapper that launchd invokes. launchd hands every job a minimal PATH of
# /usr/bin:/bin:/usr/sbin:/sbin — Homebrew is not on it, so a bare `node` is
# "command not found". Locating node explicitly is the whole point of this file.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$HOME/Library/Logs/linkedin-watcher"
LOG="$LOG_DIR/run.log"

mkdir -p "$LOG_DIR"
cd "$HERE" || exit 1

# StandardOutPath appends forever with no rotation. Keep this one bounded.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 5000000 ]; then
  tail -c 1000000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

find_node() {
  # /opt/homebrew/bin/node is a symlink that survives `brew upgrade node`;
  # never hardcode the versioned Cellar path it points at.
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

NODE="$(find_node || true)"
if [ -z "${NODE:-}" ]; then
  echo "$(date '+%Y-%m-%d %H:%M:%S') [FATAL] node not found on PATH=$PATH" >> "$LOG"
  # A modal dialog is the only alert that reliably reaches the user from a
  # launchd context; notification banners are commonly swallowed.
  /usr/bin/osascript -e 'display alert "Internship watcher failed" message "node could not be found, so the scan did not run." giving up after 120' >/dev/null 2>&1
  exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [START] node=$NODE args=$*" >> "$LOG"

"$NODE" --no-warnings=ExperimentalWarning "$HERE/src/index.js" "$@" >> "$LOG" 2>&1
STATUS=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') [EXIT $STATUS]" >> "$LOG"
exit $STATUS
