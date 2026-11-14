# DEADZONE — APK Android

Casca nativa (WebView) que roda o jogo web `../deadzone` em **tela cheia imersiva,
paisagem e 100% offline**.

## Gerar o APK

O APK é compilado no GitHub Actions (não precisa de Android SDK local):

- Workflow: `.github/workflows/build-deadzone-apk.yml`
- Actions → **Build DEADZONE APK** → *Run workflow*
- Artefato: `deadzone-apk` → `DEADZONE.apk`

Localmente, com Android SDK + JDK 17 + Gradle 8.7:

```bash
node scripts/sync-assets.mjs --clean   # copia ../deadzone para app/src/main/assets
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

## Decisão de arquitetura

Os arquivos do jogo são servidos por **`WebViewAssetLoader`** em
`https://appassets.androidplatform.net/assets/deadzone/`, e não por `file://`.

Motivo: `file://` tem **origem opaca**, e módulos ES (`<script type="module">` +
`import`) são bloqueados por CORS nesse contexto no WebView moderno — o jogo
abriria em branco. Com o AssetLoader a página tem uma origem `https` sintética,
então `import`, `fetch`, `localStorage` (save/opções/recorde) e as texturas
geradas em canvas funcionam exatamente como no navegador.

## Tela cheia

- `WindowCompat.setDecorFitsSystemWindows(false)` + `hide(systemBars())` com
  `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` (barras reaparecem só ao deslizar).
- `layoutInDisplayCutoutMode = shortEdges` (usa a área do notch).
- `sensorLandscape` no manifest: nunca gira para retrato.
- `FLAG_KEEP_SCREEN_ON`: a tela não apaga durante a partida.

## Ciclo de vida

Em `onPause` o app pausa os timers do WebView e chama `__game.pause()`, então
voltar de outro app cai no menu de pausa em vez de continuar sendo atacado.
