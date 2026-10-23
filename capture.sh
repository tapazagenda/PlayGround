#!/usr/bin/env bash
# Capture the exact preview URL at desktop and mobile sizes.
set -euo pipefail

cd "$(dirname "$0")"

: "${CAPTURE_URL:?CAPTURE_URL is required}"
: "${CAPTURE_DIR:?CAPTURE_DIR is required}"
: "${RUNTIME_DIR:?RUNTIME_DIR is required}"

echo "[capture] url=$CAPTURE_URL"
echo "[capture] out=$CAPTURE_DIR"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

set +e
/usr/bin/time -p env \
  CAPTURE_URL="$CAPTURE_URL" \
  CAPTURE_DIR="$CAPTURE_DIR" \
  CAPTURE_READY_SELECTOR="#app" \
  CAPTURE_AUTO_START=false \
  node "$RUNTIME_DIR/scripts/default-capture.mjs"
code=$?
set -e

echo "[capture] renderer exit=$code"

if [[ "$code" -ne 0 ]]; then
  case "$code" in
    75) exit 75 ;;
    *) exit 1 ;;
  esac
fi

/usr/bin/time -p node - "$CAPTURE_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const dir = process.argv[2];
const names = ["final-desktop.png", "final-mobile.png"];
for (const name of names) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    console.error(`[capture] missing ${name}`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(file);
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    console.error(`[capture] invalid PNG: ${name}`);
    process.exit(1);
  }
  console.log(`[capture] ${name} ok (${buffer.length} bytes)`);
}
NODE

echo "[capture] done"
