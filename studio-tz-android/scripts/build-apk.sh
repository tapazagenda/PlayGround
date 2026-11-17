#!/usr/bin/env bash
# Studio Tz — build do APK nativo sem Gradle/AGP.
#
# Usa apenas o toolchain oficial do Android (aapt2, d8, zipalign, apksigner)
# + JDK 17. Roda inteiro offline (o app web está embarcado nos assets).
#
# Variáveis de ambiente (com defaults para o layout padrão):
#   JAVA_HOME        — JDK 17+ (com javac e keytool)
#   ANDROID_SDK_ROOT — SDK com build-tools/34.0.0 e platforms/android-34
#
# Saída: app/build/outputs/apk/debug/app-debug.apk
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/app"
OUT="$APP/build/outputs/apk/debug"
WORK="$APP/build/manual"

JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}"
ANDROID_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"

if [ ! -x "$JAVA_HOME/bin/javac" ]; then
  echo "ERRO: JAVA_HOME invalido: $JAVA_HOME (precisa de JDK com javac)" >&2
  exit 1
fi
if [ ! -d "$ANDROID_SDK" ]; then
  echo "ERRO: Android SDK nao encontrado em $ANDROID_SDK" >&2
  echo "Defina ANDROID_SDK_ROOT para o local do SDK." >&2
  exit 1
fi

# localiza as ferramentas
BT="$(ls -d "$ANDROID_SDK"/build-tools/* | sort -V | tail -1)"
AAPT2="$BT/aapt2"
D8="$BT/d8"
ZIPALIGN="$BT/zipalign"
APKSIGNER="$BT/apksigner"
ANDROID_JAR="$(ls "$ANDROID_SDK"/platforms/android-*/android.jar | sort -V | tail -1)"

for f in "$AAPT2" "$D8" "$ZIPALIGN" "$APKSIGNER" "$ANDROID_JAR"; do
  [ -e "$f" ] || { echo "ERRO: ferramenta ausente: $f" >&2; exit 1; }
done

echo "==> Toolchain"
echo "    JAVA_HOME   = $JAVA_HOME"
echo "    SDK         = $ANDROID_SDK ($(basename "$BT"))"
echo "    android.jar = $ANDROID_JAR"
export JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"

rm -rf "$WORK" "$OUT"
mkdir -p "$WORK/res" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$OUT"

echo "==> 1/6 Compilando recursos (aapt2 compile)"
"$AAPT2" compile --dir "$APP/src/main/res" -o "$WORK/res.zip"

echo "==> 2/6 Linkando manifesto + recursos (aapt2 link)"
"$AAPT2" link \
  -o "$WORK/base.apk" \
  -I "$ANDROID_JAR" \
  --manifest "$APP/src/main/AndroidManifest.xml" \
  --java "$WORK/gen" \
  --version-code 1 --version-name 1.0 \
  "$WORK/res.zip"

echo "==> 3/6 Compilando Java (javac contra android.jar)"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -cp "$ANDROID_JAR" \
  -d "$WORK/classes" \
  $(find "$APP/src/main/java" -name '*.java')

echo "==> 4/6 Dexando (d8)"
"$D8" --debug --min-api 24 --lib "$ANDROID_JAR" \
  $(find "$WORK/classes" -name '*.class') \
  --output "$WORK/dex"

echo "==> 5/6 Empacotando dex + assets + zipalign"
( cd "$WORK" && zip -q base.apk dex/classes.dex )
( cd "$APP/src/main" && zip -qr "$WORK/base.apk" assets )
"$ZIPALIGN" -f 4 "$WORK/base.apk" "$WORK/aligned.apk"

echo "==> 6/6 Assinando (apksigner, chave debug)"
KEYSTORE="$WORK/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  "$JAVA_HOME/bin/keytool" -genkeypair -v \
    -keystore "$KEYSTORE" -alias studiotz \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android \
    -dname "CN=Studio Tz, OU=Tz, O=Tapazaki, L=BR, ST=Pernambuco, C=BR" \
    > /dev/null
fi
"$APKSIGNER" sign \
  --ks "$KEYSTORE" --ks-key-alias studiotz \
  --ks-pass pass:android --key-pass pass:android \
  --out "$OUT/app-debug.apk" \
  "$WORK/aligned.apk"

"$APKSIGNER" verify --print-certs "$OUT/app-debug.apk" | head -3
echo
echo "APK pronto: $OUT/app-debug.apk"
du -h "$OUT/app-debug.apk"
