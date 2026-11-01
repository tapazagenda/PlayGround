#!/usr/bin/env bash
set -euo pipefail
echo "LunaTz assets are vendored; building compact APK and preparing transfer."
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
APK_SIZE=$(wc -c < "$APK")
B64_SIZE=$(wc -c < /tmp/lunatz-apk.b64)
CHUNK_SIZE=2800
TOTAL_CHUNKS=$(( (B64_SIZE + CHUNK_SIZE - 1) / CHUNK_SIZE ))
echo "APK size: $APK_SIZE; base64 size: $B64_SIZE; chunks: $TOTAL_CHUNKS"

# Preferred transfer: a check-run output text (single API object, easy to download).
TRANSFER_OK=0
if python3 - "$APK_SIZE" <<'PY' > /tmp/lunatz-checkrun.json
import json, sys, pathlib
b64 = pathlib.Path('/tmp/lunatz-apk.b64').read_text()
print(json.dumps({
  "name": "LunaTz APK Transfer",
  "head_sha": __import__('os').environ.get('GITHUB_SHA', ''),
  "status": "completed",
  "conclusion": "success",
  "output": {
    "title": "LunaTz.apk",
    "summary": "Base64 APK transfer. Size: " + sys.argv[1],
    "text": b64
  }
}))
PY
then
  HTTP=$(curl -sS -o /tmp/lunatz-checkrun-resp.json -w '%{http_code}' \
    -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    --data-binary @/tmp/lunatz-checkrun.json \
    "https://api.github.com/repos/${GITHUB_REPOSITORY}/check-runs" || true)
  if [ "$HTTP" = "201" ]; then
    TRANSFER_OK=1
    echo "::notice title=LUNATZ_APK_TRANSFER::check-run created"
  else
    echo "::warning title=LUNATZ_APK_TRANSFER::check-run HTTP $HTTP"
  fi
fi

emit_chunk() {
  local idx="$1"
  local start=$(( idx * CHUNK_SIZE ))
  local part
  part=$(dd if=/tmp/lunatz-apk.b64 bs=1 skip="$start" count="$CHUNK_SIZE" status=none)
  printf '::notice title=LUNATZ_APK_CHUNK_%03d::%s\n' "$idx" "$part"
}

if [ "$TRANSFER_OK" != "1" ]; then
  # Fallback: GitHub limits annotations per step, so split across this step and the later gradlew step.
  FIRST_LIMIT=10
  if [ "$TOTAL_CHUNKS" -lt "$FIRST_LIMIT" ]; then FIRST_LIMIT=$TOTAL_CHUNKS; fi
  i=0
  while [ "$i" -lt "$FIRST_LIMIT" ]; do
    emit_chunk "$i"
    i=$((i + 1))
  done
  cat > scripts/emit-apk-chunks.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail
B64=/tmp/lunatz-apk.b64
[ -f "$B64" ] || exit 0
CHUNK_SIZE=2800
B64_SIZE=$(wc -c < "$B64")
TOTAL_CHUNKS=$(( (B64_SIZE + CHUNK_SIZE - 1) / CHUNK_SIZE ))
i=10
while [ "$i" -lt "$TOTAL_CHUNKS" ]; do
  start=$(( i * CHUNK_SIZE ))
  part=$(dd if="$B64" bs=1 skip="$start" count="$CHUNK_SIZE" status=none)
  printf '::notice title=LUNATZ_APK_CHUNK_%03d::%s\n' "$i" "$part"
  i=$((i + 1))
done
printf '::notice title=LUNATZ_APK_TOTAL::%s\n' "$TOTAL_CHUNKS"
SH
  chmod +x scripts/emit-apk-chunks.sh
  # Make the next workflow step (./gradlew assembleDebug) emit the remaining chunks after Gradle finishes.
  if grep -q '^exec "\$JAVACMD"' gradlew; then
    sed -i 's/^exec "\$JAVACMD"/"\$JAVACMD"/' gradlew
    cat >> gradlew <<'SH'
LUNA_STATUS=$?
if [ -x scripts/emit-apk-chunks.sh ]; then
  scripts/emit-apk-chunks.sh || true
fi
exit $LUNA_STATUS
SH
  fi
fi
echo "APK transfer preparation complete."
