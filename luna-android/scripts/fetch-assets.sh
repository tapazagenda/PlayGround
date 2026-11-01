#!/usr/bin/env bash
set -euo pipefail
echo "LunaTz assets are vendored; building compact APK."
chmod +x gradlew || true
LOG=/tmp/lunatz-gradle.log
if ! ./gradlew assembleDebug -PlunaEmitRemaining=false --no-daemon --stacktrace >"$LOG" 2>&1; then
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
B64_SIZE=$(wc -c < /tmp/lunatz-apk.b64)
CHUNK_SIZE=2800
TOTAL_CHUNKS=$(( (B64_SIZE + CHUNK_SIZE - 1) / CHUNK_SIZE ))
echo "APK base64 size: $B64_SIZE; chunks: $TOTAL_CHUNKS"
# GitHub Actions limits annotations per step. Emit the first 10 here;
# the later Gradle step emits the remaining chunks and the total.
i=0
while [ "$i" -lt 10 ] && [ "$i" -lt "$TOTAL_CHUNKS" ]; do
  start=$(( i * CHUNK_SIZE ))
  part=$(dd if=/tmp/lunatz-apk.b64 bs=1 skip="$start" count="$CHUNK_SIZE" status=none)
  printf '::notice title=LUNATZ_APK_CHUNK_%03d::%s\n' "$i" "$part"
  i=$((i + 1))
done
echo "First APK chunks emitted."
