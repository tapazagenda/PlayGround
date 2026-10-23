#!/usr/bin/env bash
# Build the Luna static shell and serve it in the foreground for the preview.
set -euo pipefail

cd "$(dirname "$0")"

PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
export PORT
: "${OPENCODE_WEB_DIR:?OPENCODE_WEB_DIR is required for deployment metadata}"

echo "[start] project=$PROJECT_DIR port=$PORT"
echo "[start] node $(node --version)"

if [[ -f "$PROJECT_DIR/package.json" ]]; then
  if [[ -f "$PROJECT_DIR/package-lock.json" ]]; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
  /usr/bin/time -p npm run build --if-present
else
  /usr/bin/time -p rm -rf "$PROJECT_DIR/dist"
  /usr/bin/time -p mkdir -p "$PROJECT_DIR/dist"
  /usr/bin/time -p cp -R "$PROJECT_DIR/site/." "$PROJECT_DIR/dist/"
fi

if [[ ! -f "$PROJECT_DIR/dist/index.html" ]]; then
  echo "[start] dist/index.html is missing" >&2
  exit 1
fi

/usr/bin/time -p node -e '
const fs = require("node:fs");
const [dir, out] = process.argv.slice(1);
fs.writeFileSync(out, JSON.stringify({ project: dir, directory: `${dir}/dist` }) + "\n");
' "$PROJECT_DIR" "$OPENCODE_WEB_DIR/deployment-output.json"

echo "[start] deployment-output written; serving foreground"
exec /usr/bin/time -p node "$PROJECT_DIR/scripts/serve.mjs" "$PROJECT_DIR/dist"
