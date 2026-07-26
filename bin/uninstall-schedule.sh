#!/bin/bash
# Removes the 12:00 / 18:00 LaunchAgent. Leaves data/ and config.json alone.
set -uo pipefail

LABEL="com.akshat0011.linkedin-watcher"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_DIR="$HOME/Library/Application Scripts/$LABEL"
UID_NUM="$(id -u)"

launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null && echo "Unloaded $LABEL." || echo "$LABEL was not loaded."

[ -f "$PLIST" ] && rm "$PLIST" && echo "Removed $PLIST"
[ -d "$SCRIPT_DIR" ] && rm -rf "$SCRIPT_DIR" && echo "Removed $SCRIPT_DIR"

echo
echo "Schedule removed. Your collected jobs, reports and LinkedIn session are"
echo "untouched in ~/Library/Application Support/linkedin-watcher/."
