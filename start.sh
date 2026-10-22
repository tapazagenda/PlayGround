#!/usr/bin/env bash
# Build and serve the static app in the foreground.
set -euo pipefail

timed() { /usr/bin/time -p "$@"; }

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$script_dir}"
cd "$PROJECT_DIR"

PORT="${PORT:-${APP_PORT:-3000}}"
export PORT
export PROJECT_DIR

timed test -f package.json
timed npm install --no-audit --no-fund --ignore-scripts
timed node scripts/build.mjs

[[ -f "$PROJECT_DIR/dist/index.html" ]] || {
  echo 'Build did not produce dist/index.html.' >&2
  exit 1
}

# Write /home/runner/work/_temp/omgithub-web/deployment-output.json with the
# absolute project and built static directory.
timed node scripts/write-deployment-output.mjs

timed node scripts/serve.mjs
