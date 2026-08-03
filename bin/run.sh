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

# ---------------------------------------------------------------------------
# ATS boards first, and deliberately so.
#
# This half needs no browser, no login and no pacing — it is JSON over HTTPS
# from endpoints built to be read — so it is both the cheapest and the most
# likely to succeed. Running it BEFORE the scan means a Brave that will not
# launch costs us the LinkedIn half of the slot and nothing else; run it after
# and a launch failure would take the whole slot down with it.
#
# --no-publish because the scan publishes once at the end, and publishing twice
# in a slot would mean two commits and two deploys for one round of collection.
# If the scan then fails before publishing, the next slot picks these up: they
# are already in the database.
# ---------------------------------------------------------------------------
"$NODE" --no-warnings=ExperimentalWarning "$HERE/bin/poll-ats.js" --no-publish >> "$LOG" 2>&1
# Capture before anything else runs. A command substitution in the echo below
# would overwrite $? with the exit status of `date`, which is always 0 — so
# every ATS failure was logged as a success.
ATS_STATUS=$?
echo "$(date '+%Y-%m-%d %H:%M:%S') [ATS EXIT $ATS_STATUS]" >> "$LOG"

"$NODE" --no-warnings=ExperimentalWarning "$HERE/src/index.js" "$@" >> "$LOG" 2>&1
STATUS=$?

echo "$(date '+%Y-%m-%d %H:%M:%S') [EXIT $STATUS]" >> "$LOG"
exit $STATUS
