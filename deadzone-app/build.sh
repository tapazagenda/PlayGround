#!/usr/bin/env bash
# DEADZONE — compila o APK sem Android Studio e sem Gradle.
#
# Por que existe: o ambiente de build aqui não tem Java nem Android SDK, e
# dl.google.com / services.gradle.org / repo1.maven.org estão bloqueados. Este
# script monta o mesmo toolchain por caminhos que funcionam daqui:
#
#   JDK (java runtime) ... PyPI: jdk4py (Temurin, sem instalador)
#   compilador Java ...... --release do JDK; se for só um JRE, ecj (Eclipse)
#                          roda em compliance 1.8 e o D8 faz o desugaring
#   aapt2 ................ jar do apktool (traz o binário estático de linux)
#   android.jar .......... Sable/android-platforms (api 34)
#   D8 / R8 .............. jar do bundletool (carrega com.android.tools.r8)
#   assinatura ........... apkforge (assinador APK v2/v3 em Python puro)
#
# Uso:  ./build.sh            # APK release assinado (debug key)
#       ./build.sh --debug    # APK debug
# Saída: build/outputs/*.apk
#
# Se você tem Android SDK + Java de verdade, use ./gradlew assembleDebug no
# projeto deadzone-android/ — o resultado é o mesmo app.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
TOOLS="${DEADZONE_TOOLCHAIN:-$HOME/.deadzone-tools}"
mkdir -p "$TOOLS"

say() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*"; }

# ---------------------------------------------------------------- 1. Java
JAVA_HOME_LOCAL="$TOOLS/jdk"
if [ -x "$JAVA_HOME_LOCAL/bin/java" ]; then
  say "JDK já instalado em $JAVA_HOME_LOCAL"
else
  say "baixando JDK (jdk4py)…"
  python3 - "$TOOLS" <<'PY'
import json, sys, urllib.request, zipfile, os, glob
dest = sys.argv[1]
meta = json.load(urllib.request.urlopen("https://pypi.org/pypi/jdk4py/json"))
url = next(f["url"] for f in meta["urls"] if "manylinux_2_17_x86_64" in f["filename"])
whl = os.path.join(dest, "jdk4py.whl")
urllib.request.urlretrieve(url, whl)
with zipfile.ZipFile(whl) as z:
    z.extractall(os.path.join(dest, "_jdk"))
runtime = glob.glob(os.path.join(dest, "_jdk", "jdk4py", "java-runtime"))[0]
target = os.path.join(dest, "jdk")
if os.path.exists(target):
    import shutil; shutil.rmtree(target)
os.rename(runtime, target)
os.remove(whl)
PY
  chmod +x "$JAVA_HOME_LOCAL"/bin/* 2>/dev/null || true
fi
export JAVA_HOME="$JAVA_HOME_LOCAL"
export PATH="$JAVA_HOME/bin:$PATH"
say "java: $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"

# ------------------------------------------------------ 2. compilador Java
ECJ="$TOOLS/ecj.jar"
if [ ! -f "$ECJ" ]; then
  say "baixando ecj (compilador Eclipse)…"
  curl -fsSL -o "$ECJ" \
    "https://raw.githubusercontent.com/eclipse-jdt/eclipse.jdt.core/master/org.eclipse.jdt.core/ecj.jar" \
    || curl -fsSL -o "$ECJ" "https://github.com/NorbertXYZ/eclipse-maven/raw/master/org/eclipse/jdt/ecj/3.46.100/ecj-3.46.100.jar"
fi
export ECJ_JAR="$ECJ"

# ---------------------------------------------------------------- 3. aapt2
AAPT2="$TOOLS/aapt2"
if [ ! -x "$AAPT2" ]; then
  say "extraindo aapt2 do apktool…"
  APKTOOL_JAR="$TOOLS/apktool.jar"
  if [ ! -f "$APKTOOL_JAR" ]; then
    npm pack apktool-jar --pack-destination "$TOOLS" >/dev/null 2>&1
    tar xzf "$TOOLS"/apktool-jar-*.tgz -C "$TOOLS" package/bin/apktool_*.jar
    mv "$TOOLS"/package/bin/apktool_*.jar "$APKTOOL_JAR"
    rm -rf "$TOOLS/package" "$TOOLS"/apktool-jar-*.tgz
  fi
  python3 - "$APKTOOL_JAR" "$AAPT2" <<'PY'
import sys, zipfile
jar, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(jar) as z:
    names = [n for n in z.namelist() if n.startswith("prebuilt/linux/aapt2")]
    pick = "prebuilt/linux/aapt2" if "prebuilt/linux/aapt2" in names else names[0]
    open(out, "wb").write(z.read(pick))
PY
  chmod +x "$AAPT2"
fi
export APKFORGE_AAPT2="$AAPT2"
say "aapt2: $("$AAPT2" version)"

# ------------------------------------------------------------- 4. android.jar
ANDROID_JAR="$TOOLS/android-34.jar"
if [ ! -f "$ANDROID_JAR" ]; then
  say "baixando android.jar (API 34)…"
  curl -fsSL -H "Accept: application/vnd.github.raw" -o "$ANDROID_JAR" \
    "https://api.github.com/repos/Sable/android-platforms/contents/android-34/android.jar"
fi
export APKFORGE_ANDROID_JAR="$ANDROID_JAR"

# --------------------------------------------------------------- 5. D8 / R8
DEXER="$TOOLS/d8.jar"
if [ ! -f "$DEXER" ]; then
  say "baixando D8/R8 (do bundletool)…"
  npm pack node-bundletool --pack-destination "$TOOLS" >/dev/null 2>&1
  tar xzf "$TOOLS"/node-bundletool-*.tgz -C "$TOOLS" package/bundletool.jar
  mv "$TOOLS/package/bundletool.jar" "$DEXER"
  rm -rf "$TOOLS/package" "$TOOLS"/node-bundletool-*.tgz
fi
export APKFORGE_R8_JAR="$DEXER"
say "D8: $("$JAVA_HOME/bin/java" -cp "$DEXER" com.android.tools.r8.D8 --version 2>&1 | head -1)"

# ------------------------------------------------------------------ 6. apkforge
APKFORGE_PY="$TOOLS/apkforge"
if [ ! -d "$APKFORGE_PY" ]; then
  say "instalando apkforge (assinador APK em Python puro)…"
  python3 -m pip install --quiet --target "$APKFORGE_PY" apkforge
fi
export PYTHONPATH="$APKFORGE_PY${PYTHONPATH:+:$PYTHONPATH}"
export APKFORGE_HOME="${APKFORGE_HOME:-$TOOLS/apkforge-home}"
mkdir -p "$APKFORGE_HOME"

# ------------------------------------------------------- 7. javac -> ecj shim
# O JDK baixado é só runtime (não tem javac, nem ct.sym do Java 17). O ecj
# compila em compliance 1.8; o D8 roda o desugaring do resto.
SHIM_DIR="$TOOLS/shim"
mkdir -p "$SHIM_DIR"
cat > "$SHIM_DIR/javac" <<'SHIM'
#!/usr/bin/env python3
"""javac -> ecj: traduz os argumentos que o build usa."""
import os, sys, subprocess
JAVA = os.path.join(os.environ["JAVA_HOME"], "bin", "java")
ECJ = os.environ.get("ECJ_JAR")
raw = []
for a in sys.argv[1:]:
    if a.startswith("@"):
        for line in open(a[1:]):
            line = line.strip()
            if not line:
                continue
            if line.startswith('"') and line.endswith('"'):
                line = line[1:-1].replace('\\"', '"').replace("\\\\", "\\")
            raw.append(line)
    else:
        raw.append(a)
out, cps, srcs, skip = [], [], [], False
i = 0
while i < len(raw):
    a = raw[i]
    if skip:
        skip = False
    elif a in ("-d", "-cp", "-classpath"):
        skip = True
        if a == "-d":
            out = ["-d", raw[i + 1]]
        else:
            cps = ["-cp", raw[i + 1]]
    elif a in ("--release", "-source", "-target", "-s", "-processorpath", "-Xmaxerrs"):
        skip = True
    elif a.startswith("-J") or a.startswith("-Xlint") or a.startswith("-proc") \
            or a.startswith("-encoding") or a in ("-g", "-nowarn", "-parameters"):
        pass
    elif a.endswith(".java"):
        srcs.append(a)
    i += 1
cmd = [JAVA, "-Xmx1g", "-cp", ECJ, "org.eclipse.jdt.internal.compiler.batch.Main",
       "-source", "1.8", "-target", "1.8", "-nowarn", "-proc:none", "-encoding", "UTF-8"]
sys.exit(subprocess.call(cmd + out + cps + srcs))
SHIM
chmod +x "$SHIM_DIR/javac"
if [ ! -x "$JAVA_HOME/bin/javac" ]; then
  cp "$SHIM_DIR/javac" "$JAVA_HOME/bin/javac"
  say "javac: ecj 1.8 (desugaring pelo D8)"
fi

# ------------------------------------------------------------ 8. build
say "sincronizando o jogo para os assets…"
node "$HERE/scripts/sync-assets.mjs" --clean

MODE="--release"
[ "${1:-}" = "--debug" ] && MODE=""

cd "$HERE"
say "compilando o APK ($MODE)…"
python3 -m apkforge build "$HERE" $MODE

APK="$(ls -t "$HERE"/build/outputs/*.apk | head -1)"
say "APK: $APK"
ls -lh "$APK"
