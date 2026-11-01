#!/usr/bin/env bash
# LunaTz Companion ships its lightweight UI inside app/src/main/assets/ui.
# No external asset download is required for the test APK.
set -euo pipefail
echo "LunaTz assets are vendored; nothing to fetch."
