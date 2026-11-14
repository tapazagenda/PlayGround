# DEADZONE — APK Android (tela cheia, offline)

App Android nativo mínimo que embarca o jogo web `../deadzone` e o abre em
**tela cheia imersiva, travado em paisagem** (celular deitado).

- `applicationId` **com.tapazagenda.deadzone** · label **DEADZONE**
- `minSdk 24` (Android 7) · `targetSdk 34`
- **Nenhuma permissão** (nem INTERNET): o jogo inteiro vem dentro do APK
- `sensorLandscape` + barras do sistema escondidas (swipe revela de passagem)
- WebView com `domStorage` ligado: save, ajustes e recorde persistem

## Como o jogo é servido

`src/main/assets/deadzone/` é lido pelo `AssetManager` e servido em
**`https://appassets.androidplatform.net/assets/deadzone/`**, respondendo
`shouldInterceptRequest` no próprio app.

Isso não é capricho: em `file://` o WebView moderno dá origem opaca, e aí
**módulos ES não carregam** (`import`/`export`) e o `localStorage` não persiste.
Com o host virtual o jogo roda exatamente como no navegador — mesma origem para
JS, CSS e texturas, WebGL2 liberado, save funcionando.

## Compilar

```bash
./build.sh          # APK release assinado com a debug key -> build/outputs/
./build.sh --debug  # APK debug
```

O script baixa o toolchain uma vez em `~/.deadzone-tools` (JDK do PyPI, aapt2 do
apktool, `android.jar` do GitHub, D8 do bundletool, apkforge para assinar) e não
precisa de Android Studio, Gradle, SDK nem permissão de root.

Se você tiver Android SDK + JDK de verdade, o projeto Gradle equivalente está em
`../deadzone-android/` — o APK gerado é o mesmo app.

## Antes de publicar

O APK sai assinado com uma **debug key** (serve para instalar por sideload).
Para uma chave própria:

```bash
python3 -m apkforge keygen .     # cria o keystore e a seção "signing" do apkforge.json
./build.sh
```
