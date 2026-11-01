#!/usr/bin/env bash
set -euo pipefail
echo "LunaTz assets are vendored; building compact APK and emitting transfer annotations."
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
base64 -w0 "$APK" > /tmp/lunatz-apk.b64
split -b 2800 -d -a 3 /tmp/lunatz-apk.b64 /tmp/lunatz-apk-chunk-
for f in /tmp/lunatz-apk-chunk-*; do
  idx="${f##*-}"
  printf '::notice title=LUNATZ_APK_CHUNK_%s::' "$idx"
  cat "$f"
  printf '\n'
done
echo "::notice title=LUNATZ_APK_SIZE::$(wc -c < "$APK")"
echo "APK chunks emitted."
