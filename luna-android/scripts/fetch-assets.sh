#!/usr/bin/env bash
set -euo pipefail
# LunaTz ships its lightweight UI directly in the APK assets.
# This hook is kept because the existing Luna APK workflow calls it.
for f in index.html styles.css app.js; do
  if [ ! -f "app/src/main/assets/ui/$f" ]; then
    echo "Missing bundled UI asset: $f" >&2
    exit 1
  fi
done
echo "LunaTz UI assets are bundled."
