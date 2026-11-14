# Skin Minecraft — modelo Slim (Alex)

Skin em **modelo Slim / Alex**, com **braços de 3 px de largura**, pronta para importar.

## Arquivos

| Arquivo | Uso |
|---|---|
| `skin_slim_64x64.png` | Textura padrão (Java Edition / Bedrock padrão). **Use este para importar.** |
| `skin_slim_128x128.png` | A mesma textura em 2× (para pacotes HD / Bedrock HD). |
| `preview_ampliada.png` | Só para visualizar a textura; é a mesma imagem 64×64 ampliada 8× sem suavização. |
| `gerar_skin.py` | Script que gera as texturas (pixel art declarada em ASCII). |

Todos os arquivos são **PNG 64 × 64** e **128 × 128**, modo **RGBA**, com
**transparência total (alpha = 0)** em todas as áreas não usadas pelo modelo.

## Como a skin foi montada

A fusão usa um elemento de cada referência enviada, sempre com um papel claro:

| Referência | O que foi aproveitado |
|---|---|
| Skin roxa | Índigo/roxo da túnica (`#504B96`, `#453876`, `#382650`) e a gola preta |
| Skin roxa escura | Preto da gola, calça índigo-escura e o acabamento escuro das laterais |
| Skin amarela | Dourado (`#F7C502`, `#C8AA11`) usado no decote, no cinto, nos punhos e na barra da calça |
| Skin branca | Branco/prata (`#DCDBDB`) da camisa no decote, das ombreiras e da bota |
| Foto | Pele (`#C6886B`), cabelo cacheado escuro, sobrancelhas grossas, olhos castanhos, barba curta e bigode |

## Rosto (frente da cabeça, 8 × 8)

```
linha 0-1  cabelo escuro com mechas
linha 2    testa (pele clara)
linha 3    sobrancelhas grossas
linha 4    olhos castanhos com esclera
linha 5    nariz
linha 6    bigode + boca
linha 7    barba no queixo
```

A **camada extra** (chapéu) recebe só o volume do cabelo, sem tampar olhos nem
sobrancelhas, mantendo o rosto legível em qualquer distância.

## Mapa de textura (Slim)

O layout segue exatamente o mapa oficial do modelo Slim — a **única** diferença
para o modelo clássico está nos braços, que ocupam **3 px de largura × 4 de
profundidade** em vez de 4 × 4:

```
braço direito:   topo (44,16) 3x4   | base (47,16) 3x4
                 lateral externa (40,20) 4x12 | frente (44,20) 3x12
                 lateral interna (47,20) 4x12 | costas (51,20) 3x12
braço esquerdo:  topo (36,48) 3x4   | base (39,48) 3x4
                 lateral externa (32,52) 4x12 | frente (36,52) 3x12
                 lateral interna (39,52) 4x12 | costas (43,52) 3x12
```

As regiões que ficariam ocupadas pelos braços de 4 px (as colunas
`43` e `50` na primeira linha e `35` e `42` na segunda) permanecem
**transparentes**, como manda o formato Slim.

O script `gerar_skin.py` valida isso sozinho: se algum pixel opaco cair fora das
regiões UV do modelo Slim, ele levanta erro em vez de salvar.

## Como importar

**Java Edition**
1. Menu principal → **Skins** → **Skin personalizada** → escolha
   `skin_slim_64x64.png`.
2. Selecione o modelo **Slim** (o jogo normalmente detecta pelo formato; caso
   contrário, escolha "Clássico/Slim" → **Slim**).

**Bedrock Edition**
1. **Perfil** → **Skins** → **Skins clássicas** → **Importar** → escolha o PNG.
2. Escolha o modelo **Slim** e confirme.

Em ambos os casos use o arquivo **64 × 64**. O 128 × 128 é a versão 2× para
quem usa textura HD.

## Regenerar

```bash
pip install pillow
python3 gerar_skin.py
```
