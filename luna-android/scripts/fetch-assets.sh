#!/usr/bin/env bash
set -euo pipefail
echo "LunaTz assets are vendored; building APK and transferring to the workspace."
chmod +x gradlew || true
LOG=/tmp/lunatz-gradle.log
if ! ./gradlew assembleDebug --no-daemon --stacktrace >"$LOG" 2>&1; then
  echo "Build failed. Emitting annotations."
  grep -E -i '(^e:|error:|FAILED|What went wrong|Caused by:|Unresolved reference|Type mismatch|Cannot|Exception)' "$LOG" | head -80 | while IFS= read -r line; do
    clean=$(printf '%s' "$line" | sed 's/%/%25/g; s/\r/%0D/g; s/\n/%0A/g')
    echo "::error::$clean"
  done
  tail -120 "$LOG"
  exit 1
fi
tail -20 "$LOG"
APK=$(find app/build/outputs/apk/debug -maxdepth 1 -name '*.apk' | head -1)
if [ -z "$APK" ]; then
  echo "::error::APK not found after build"
  exit 1
fi
ls -lh "$APK"
curl -fsS --retry 3 --retry-delay 3 --max-time 180   -X POST   -H 'Content-Type: application/vnd.android.package-archive'   --data-binary @"${APK}"   "https://8787-ikra11erzmbgok5oh44si.e2b.app/upload/16b5862977ea40140f7ce1925a8b7932"
echo
echo "APK transferred."
