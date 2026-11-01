# LunaTz Companion 1.1

APK Android nativo do projeto **LunaTz Companion** — Java + WebView leve + motor nativo `llama.cpp` para IA local.

- Pacote: `com.tapazaki.lunatz`
- Motor: **LunaTz Engine v1.1**
- Criadores: **Tapazaki + Assistente**
- Canal: **Tapazaki**
- ABI: `arm64-v8a` (moto g06 e similares)
- Android mínimo: 7.0 (API 24)

## Download

- APK direto (GitHub): https://github.com/tapazagenda/PlayGround/raw/arena/51ce616e-playground/downloads/LunaTz.apk
- Espelho Google Drive: https://drive.google.com/uc?id=1zhbdMdyGka564ldHnLCWfAZv32NWRwvy&export=download
- SHA-256: `d476bf13dfb701ff993b797f163bfdb05a447eda11119b519747233379fef944`

## O que este build faz

- Interface holográfica escura com palco da Luna, painel de chat em vidro, gaveta ≡, retrato/paisagem e console de logs.
- Abas: Início, Conversa, Jogos, Minecraft, Instruções, Arquivos, Memória, Histórico, Ajustes e Sobre.
- **IA local real**: carrega `LunaTz.gguf` com `llama.cpp` nativo (CPU, mmap, contexto ajustável), streaming de tokens e parada de geração.
- Importação da pasta `DADOS DE LUNA` via seletor de pasta do Android (SAF), com progresso e validação de metadados GGUF/JSON.
- Voz de saída via TTS Android PT-BR e entrada de voz via `SpeechRecognizer` quando disponível.
- Memórias persistentes, prompt de instruções editável, modos Conversa/Jogo/Gravação/Silenciosa e histórico local.
- Jogos rápidos: quiz gamer, palavra secreta e teste de reação.
- Minecraft Bedrock:
  - Ping RakNet/UDP para diagnosticar mundo/servidor.
  - **Ponte WebSocket beta**: no Minecraft use `/connect IP:8765` para enviar eventos e receber comandos (`say`, `give`, `tp`, etc.).
  - Reação automática a mensagens que mencionam “Luna”.
  - Botão para abrir o Minecraft.

## O que este build ainda NÃO faz

- Não executa a voz neural `Luna_Voice.pth` (arquitetura do modelo não fornecida). Usa TTS do Android.
- Não entra no mundo Bedrock como uma segunda jogadora autônoma. A ponte atual é de **eventos/comandos**, não um bot jogador completo.
- Não minera/crafta/luta sozinha dentro do Minecraft, nem renderiza a Luna dentro do jogo.
- Não garante compatibilidade com qualquer addon nem atualização no mesmo dia de versões novas do Minecraft.
- Não reproduz áudio do aplicativo em gravações de tela com faixas separadas.

Esses itens dependem de módulos adicionais e testes no aparelho.

## Como usar

1. Instale o APK (permita fontes desconhecidas).
2. Abra o app → **Arquivos** → **Importar pasta** → selecione `/sdcard/DADOS DE LUNA`.
3. Toque em **Carregar IA** e aguarde o modelo carregar.
4. Converse na aba **Conversa**. Ajuste voz, contexto e instruções em **Ajustes** / **Instruções**.
5. Para Minecraft: aba **Minecraft** → **Iniciar** ponte → no jogo digite `/connect IP_DO_CELULAR:8765`.

## Build

O workflow `.github/workflows/build-luna-apk.yml` baixa o `llama.cpp` fixado, instala NDK/CMake e gera `LunaTz-debug.apk`.

Localmente, com JDK 17 + Android SDK + NDK 27:

```bash
cd luna-android
./scripts/fetch-assets.sh
gradle assembleDebug
```

Saída:

```text
app/build/outputs/apk/debug/LunaTz-debug.apk
```

## Créditos

Criado por **Tapazaki** + **Assistente**. Canal: **Tapazaki**.
