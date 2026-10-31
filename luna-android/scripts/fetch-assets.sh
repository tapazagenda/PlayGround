#!/usr/bin/env bash
# Baixa os arquivos do Luna (HTML + VRM + imagens) para app/src/main/assets/luna/
# mantendo a estrutura relativa usada pelo index.html.
#
# Fonte primaria: espelho publico (filebin) — o CDN original exige token de
# acesso e responde 403 para runners do GitHub Actions.
# Fallback: CDN original (funciona quando o token/ambiente permitir).
set -euo pipefail

MIRROR="https://filebin.net/lunaassets1793478752"
ORIGIN="https://static.teamily.ai/sites/fa83f71f-2a77-43ac-b60e-8ad453367cc9/webpages/luna-preview-v11"

DEST="$(cd "$(dirname "$0")/.." && pwd)/app/src/main/assets/luna"
mkdir -p "$DEST/models" "$DEST/images"

fetch() {
  local rel="$1"
  local flat="${rel//\//_}"
  local out="$DEST/$rel"
  local size=0

  echo "-> $rel"
  if curl -fsSL --retry 3 --retry-delay 2 -o "$out" "$MIRROR/$flat"; then
    size=$(wc -c < "$out")
  fi

  if [ "$size" -lt 500 ]; then
    echo "   espelho falhou, tentando origem..."
    curl -fsSL --retry 3 --retry-delay 2 -o "$out" "$ORIGIN/$rel" || true
    size=$(wc -c < "$out" 2>/dev/null || echo 0)
  fi

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
