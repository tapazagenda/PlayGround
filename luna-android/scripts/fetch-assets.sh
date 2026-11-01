#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for f in index.html styles.css app.js img/luna-hologram.jpg img/neon-city.jpg; do
  if [ ! -f "app/src/main/assets/ui/$f" ]; then
    echo "Missing bundled UI asset: $f" >&2
    exit 1
  fi
done

# ---- llama.cpp (pinned, integrity-checked) ----
LLAMA_TAG="b12032"
LLAMA_SHA256="2fbadc9cc8552352efbdf3cf5bc7b8c9cce84a12c876cca03c858cb062567e2a"
if [ ! -f vendor/llama.cpp/CMakeLists.txt ]; then
  mkdir -p vendor
  echo "Downloading llama.cpp ${LLAMA_TAG}..."
  curl -fsSL --retry 3 "https://codeload.github.com/ggml-org/llama.cpp/tar.gz/refs/tags/${LLAMA_TAG}" -o /tmp/llama.tar.gz
  echo "${LLAMA_SHA256}  /tmp/llama.tar.gz" | sha256sum -c -
  mkdir -p vendor/llama.cpp
  tar -xzf /tmp/llama.tar.gz -C vendor/llama.cpp --strip-components=1
fi
echo "llama.cpp ready: $(grep -m1 'project(' vendor/llama.cpp/CMakeLists.txt || true)"

# ---- Android NDK / CMake (best-effort; AGP can also auto-install) ----
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/usr/local/lib/android/sdk}}"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
if [ -x "$SDKMANAGER" ]; then
  yes | "$SDKMANAGER" --licenses >/dev/null 2>&1 || true
  "$SDKMANAGER" --install "ndk;27.0.12077973" "cmake;3.22.1" >/dev/null 2>&1 || \
    echo "sdkmanager install skipped/failed; relying on AGP auto-install"
fi

echo "LunaTz assets ready."
