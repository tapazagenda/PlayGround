# LunaTz Companion

APK Android de teste do projeto **LunaTz Companion** (Java nativo + interface leve em WebView).

- Pacote: `com.tapazaki.lunatz`
- Motor: `LunaTz Engine v1.0`
- Criadores: **Tapazaki & Assistente**
- Canal: **Tapazaki**

## O que este build faz

- Interface responsiva em retrato/paisagem com gaveta lateral.
- Abas: Início, Conversa, Jogos, Minecraft, Instruções, Arquivos, Histórico, Ajustes e Sobre.
- Importação da pasta `DADOS DE LUNA` via seletor de pasta do Android.
- Cópia e validação básica de `LunaTz.gguf`, `Luna_Voice.pth`, `LunaTz_Brain.json`, `luna_skin.png` e `voz_luna.mp3`.
- Voz de saída via TTS do Android em PT-BR.
- Entrada de voz via `SpeechRecognizer` quando disponível.
- Histórico local e prompt de personalidade.
- Diagnóstico Bedrock/RakNet por ping UDP e botão para abrir o Minecraft.

## O que este build ainda não faz

- Não executa inferência GGUF local.
- Não executa a voz neural `Luna_Voice.pth`.
- Não entra no mundo Bedrock como jogadora autônoma.
- Não minera, crafta, luta ou segue o jogador ainda.

Esses módulos dependem de integração nativa adicional e de testes no aparelho.

## Build

O workflow existente `.github/workflows/build-luna-apk.yml` gera o artefato `luna-debug-apk` com `LunaTz-debug.apk`.

Localmente, com JDK 17 e Android SDK:

```bash
cd luna-android
gradle assembleDebug
```

O APK de teste fica em:

```text
app/build/outputs/apk/debug/LunaTz-debug.apk
```
