# DEADZONE v1.0 — APK para celular

**Arquivo:** `DEADZONE-v1.0.apk` (480 KB) · **pacote** `com.tapazagenda.deadzone`
**Download:** https://drive.google.com/file/d/15SEQujkbjSADaCNV_E-weOYs2j608hez/view

## Instalar no celular (Android 7 ou mais novo)

1. Abra o link no **celular** e baixe o APK.
2. Toque no arquivo baixado. O Android vai avisar que é de "fonte desconhecida":
   toque em **Configurações** → permita para o app usado no download
   (Chrome/Files) → **Instalar**.
3. Se aparecer "app não instalado" por causa do Play Protect, toque em
   **Instalar mesmo assim**. O APK é assinado com chave de desenvolvimento
   (sideload), não vem da Play Store.
4. Abra **DEADZONE** e **deite o celular** — o jogo já entra em tela cheia,
   sem barra de status nem de navegação.

## O que está no APK

- O jogo completo, **offline**: nada de internet, nenhuma permissão pedida.
- Tela cheia imersiva (swipe de borda revela as barras de passagem).
- Travado em paisagem (`sensorLandscape`): gira para os dois lados.
- Save, ajustes e recorde persistem entre sessões (`localStorage`).
- `minSdk 24` · `targetSdk 34` · GLES 2.0.

## Controles (celular)

| Ação | Onde |
|---|---|
| Andar | arraste na metade **esquerda** da tela |
| Olhar | arraste na metade **direita** |
| Atirar | botão vermelho (canto inferior direito) |
| Mirar | botão MIRA |
| Recarregar | botão RECARGA |
| Trocar arma | botão TROCAR |
| Ação / pegar item | botão AÇÃO |
| Correr | botão CORRER |
| Agachar | botão AGACHAR |
| Lanterna | botão LUZ |
| Mapa grande | botão MAP (ou toque no minimapa) |
| Pausa | botão de pausa |

Dica: **mire na cabeça** — infectado cai com um tiro certeiro.

## Verificação técnica

- `apksigner verify`: **Verifies** — APK Signature Scheme **v2 + v3**.
- Assets do jogo (48 arquivos) foram extraídos do próprio APK e testados na
  origem `https://appassets.androidplatform.net`: WebGL2 ok, `localStorage` ok,
  0 requisições faltando, 0 erros de console.
- sha256: `f349bcbfcda840b4f11070864dc9aae4b0e6db2a1ea0010504c62723149e748d`

## Recompilar

```bash
cd deadzone-app
./build.sh          # baixa o toolchain e gera build/outputs/*.apk
```

Não precisa de Android Studio, Gradle, SDK nem root — veja `deadzone-app/README.md`.
O projeto Gradle equivalente continua em `deadzone-android/`, para quem tiver o
SDK instalado.
