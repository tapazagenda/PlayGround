#!/usr/bin/env bash
set -euo pipefail
echo "LunaTz assets are vendored; running a diagnostic build to surface CI annotations."
chmod +x gradlew || true
LOG=/tmp/lunatz-gradle.log
if ./gradlew assembleDebug --no-daemon --stacktrace >"$LOG" 2>&1; then
  echo "Diagnostic build succeeded."
  tail -20 "$LOG"
  exit 0
fi
echo "Diagnostic build failed. Emitting annotations."
# Emit compact GitHub annotations for the most useful error lines.
grep -E -i '(^e:|error:|FAILED|What went wrong|Caused by:|Unresolved reference|Type mismatch|Cannot|Exception)' "$LOG" | head -80 | while IFS= read -r line; do
  clean=$(printf '%s' "$line" | sed 's/%/%25/g; s/\r/%0D/g; s/\n/%0A/g')
  echo "::error::$clean"
done
tail -120 "$LOG"
exit 1
