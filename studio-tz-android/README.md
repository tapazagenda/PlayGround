# Studio Tz — app Android

App nativo Android (Kotlin + WebView) que carrega o **Studio Tz**, o estúdio de
animação cinematográfica estilo Minecraft, embarcado em
`app/src/main/assets/studio-tz/`. Tudo roda **offline, inteiramente no
celular** — sem PC, sem servidor.

## O que o Studio Tz faz

- **Roteiro → cenas automáticas** — um parser entende comandos
  (`cena:`, `personagem:`, `camera:`, `falar:`, `anima:`, `musica:`, `efeito:`,
  `escena:`, `corte`) e monta a linha do tempo. Há também um **diretor**
  que transforma um prompt livre em esboço de roteiro.
- **Motor 3D voxel** (three.js) — cenários procedurais: plains, floresta,
  deserto, vila, nether e oceano, com texturas geradas em código.
- **Personagens com skin** — importe **qualquer skin PNG do Minecraft PE**
  (64x32 ou 64x64), mais skins nativas geradas. Skins são armazenadas no
  app, mantendo o personagem **consistente por toda a série**.
- **Animações** — idle, andar, ataque, golpe, aceno, olhar; **piscar** os
  olhos; **sincronia labial** sem voz (a fala vem com subtítulo na tela).
- **Câmera cinematográfica** — close, médio, geral, orbit e follow, com
  transições suaves entre planos.
- **Trilha sintetizada** — épica, ação e triste (WebAudio, sem arquivos
  externos) + efeitos (hit, portal, fogo). Vídeo **sem voz**, como pedido.
- **Render** — gravação em tempo real do canvas + áudio via MediaRecorder,
  exporta **WebM** (vide YouTube aceitável), em **16:9 (deitado)** ou
  **9:16 (em pé)**. O vídeo é salvo direto no celular (DownloadManager).
- **Projetos guardados** no próprio app (IndexedDB).

## Estrutura

```
studio-tz-android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradle/wrapper/gradle-wrapper.properties
├── scripts/build-apk.sh                # build do APK sem Gradle
└── app/
    ├── build.gradle.kts
    ├── proguard-rules.pro
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/tapazagenda/studiotz/MainActivity.java  # WebView + ponte de download
        ├── assets/studio-tz/                                # o app web (offline)
        │   ├── index.html
        │   ├── css/app.css
        │   └── js/  (three.min.js vendorado + motor do Studio Tz)
        └── res/    # strings, themes, cores, ícone
```

## Build

O APK é construído **sem Gradle**, só com o toolchain oficial do Android
(aapt2 + d8 + zipalign + apksigner) e um JDK 17:

```bash
cd studio-tz-android
JAVA_HOME=/caminho/do/jdk-17 \
ANDROID_SDK_ROOT=/caminho/do/android-sdk \
./scripts/build-apk.sh
# saída: app/build/outputs/apk/debug/app-debug.apk
```

O script compila os recursos (aapt2), compila o Java puro (javac contra
`android.jar`), dexa (d8), empacota dex + assets e assina (apksigner,
chave de debug). O app é 100% offline — nada é baixado no build.

> Também existe um workflow `.github/workflows/build-studio-tz-apk.yml`
> (build via GitHub Actions) pronto para quando a conexão do GitHub
> tiver a permissão `workflows` liberada.

## Notas técnicas

- `minSdk 24`, `targetSdk 34`, `compileSdk 34`, AGP 8.5.2, Gradle 8.7, JDK 17.
- WebView com `javaScriptEnabled`, `domStorageEnabled`, `allowFileAccess`,
  `allowFileAccessFromFileURLs`, `allowUniversalAccessFromFileURLs`,
  `mediaPlaybackRequiresUserGesture = false`,
  `mixedContentMode = MIXED_CONTENT_ALWAYS_ALLOW`.
- `usesCleartextTraffic="true"` + `hardwareAccelerated` + `largeHeap`
  (WebGL para o motor 3D).
- Ponte JS `StudioBridge.download(url, filename)` salva o vídeo renderizado
  via `DownloadManager` na pasta `Download/`.
- Render é em **tempo real**: um roteiro de X segundos leva ~X segundos
  (o app mostra a porcentagem). A exportação é WebM (VP8/VP9 + Opus).

## Instalação no celular

1. Baixe o artifact `studio-tz-debug-apk` no GitHub (é um .zip — extraia o APK).
2. Copie para o celular (ou baixe direto nele).
3. Configurações → Apps → Acesso especial → **Instalar apps desconhecidos** →
   permita para o app usado (Arquivos / Chrome).
4. Abra o APK e toque em **Instalar**.
