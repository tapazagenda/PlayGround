#!/usr/bin/env bash
# Baixa os arquivos do Luna (HTML + VRM + imagens) para app/src/main/assets/luna/
# mantendo a estrutura relativa usada pelo index.html.
set -euo pipefail

BASE="https://static.teamily.ai/sites/fa83f71f-2a77-43ac-b60e-8ad453367cc9/webpages/luna-preview-v11"
DEST="$(cd "$(dirname "$0")/.." && pwd)/app/src/main/assets/luna"

mkdir -p "$DEST/models" "$DEST/images"

fetch() {
  local rel="$1"
  local out="$DEST/$rel"
  echo "-> $rel"
  curl -fsSL --retry 3 --retry-delay 2 -o "$out" "$BASE/$rel"
  local size
  size=$(wc -c < "$out")
  if [ "$size" -lt 500 ]; then
    echo "ERRO: $rel veio com $size bytes (download invalido)" >&2
    exit 1
  fi
  echo "   ok ($size bytes)"
}

fetch "index.html"
fetch "models/luna.vrm"
fetch "images/luna_avatar.png"
fetch "images/luna_reference_web.webp"
fetch "images/luna_reference_v2_web.webp"

echo "Assets prontos em $DEST"
ls -la "$DEST" "$DEST/models" "$DEST/images"
