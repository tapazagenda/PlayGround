# Luna — app Android (WebView)

App nativo Android (Kotlin, sem Compose) que carrega o Luna HTML embutido em
`app/src/main/assets/luna/index.html` dentro de um WebView.

## Estrutura

```
luna-android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
├── scripts/fetch-assets.sh      # baixa index.html + luna.vrm + imagens
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/tapazagenda/luna/MainActivity.kt
        ├── assets/luna/         # gerado no build (index.html, models/, images/)
        └── res/                 # strings, themes, ícone adaptativo
```

## Build

O APK é gerado pelo GitHub Actions (`.github/workflows/build-luna-apk.yml`):

- Actions → **Build Luna APK** → *Run workflow*, ou um push em `luna-android/**`.
- O artifact **luna-debug-apk** contém `app-debug.apk`.

Localmente (com Android SDK instalado):

```bash
cd luna-android
./scripts/fetch-assets.sh
gradle wrapper --gradle-version 8.7
./gradlew assembleDebug
# saída: app/build/outputs/apk/debug/app-debug.apk
```

### Sobre os assets

O CDN original (`static.teamily.ai/sites/...`) exige token de acesso e responde
**403** para runners do GitHub Actions. Por isso `scripts/fetch-assets.sh` baixa
de um espelho público (filebin) e só cai para o CDN original como fallback.
Se o espelho expirar, suba os 5 arquivos de novo e atualize a variável `MIRROR`
no script.

## Notas técnicas

- `minSdk 24`, `targetSdk 34`, `compileSdk 34`, AGP 8.5.2, Gradle 8.7, JDK 17.
- WebView com `javaScriptEnabled`, `domStorageEnabled`, `allowFileAccess`,
  `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs`,
  `mediaPlaybackRequiresUserGesture = false`,
  `mixedContentMode = MIXED_CONTENT_ALWAYS_ALLOW`.
- `WebChromeClient.onPermissionRequest` concede `RESOURCE_AUDIO_CAPTURE` (microfone).
- Permissão runtime de `RECORD_AUDIO` pedida no início.
- `usesCleartextTraffic="true"` + `hardwareAccelerated` + `largeHeap`.
- Botão voltar navega no histórico do WebView; se não houver, fecha o app.

### API local (Ollama em `http://127.0.0.1:11434`)

A página roda em `file:///android_asset/...`, ou seja, **não é HTTPS**. No HTML:

```js
var IS_HTTPS = (location.protocol === "https:");          // false em file://
function mixedContentBlocked(u){ return IS_HTTPS && isHttpUrl(u); }  // sempre false
```

Logo nada é bloqueado por conteúdo misto, e o WebView também está com
`MIXED_CONTENT_ALWAYS_ALLOW`.

O que ainda pode barrar é **CORS**: a origem enviada é `null` (file://). No
Ollama, inicie com:

```bash
OLLAMA_ORIGINS=* ollama serve
```

## Instalação no Moto G06

1. Baixe o artifact `luna-debug-apk` no GitHub (é um .zip — extraia o APK).
2. Copie para o celular (ou baixe direto nele).
3. Configurações → Apps → Acesso especial → **Instalar apps desconhecidos** →
   permita para o app usado (Arquivos / Chrome).
4. Abra o APK e toque em **Instalar**.
5. Ao abrir o Luna, aceite a permissão de **microfone**.
