#!/usr/bin/env bash
# Capture desktop and mobile views of the running preview.
set -euo pipefail

timed() { /usr/bin/time -p "$@"; }

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$script_dir}"
cd "$PROJECT_DIR"

: "${CAPTURE_URL:?Set CAPTURE_URL to the exact preview URL.}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to an output directory outside the source tree.}"
export CAPTURE_URL CAPTURE_DIR

timed test -f scripts/capture.mjs
timed mkdir -p "$CAPTURE_DIR"

status=0
timed node scripts/capture.mjs || status=$?
exit "$status"
