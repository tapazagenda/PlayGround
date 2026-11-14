# DEADZONE — Sobrevivência em Cinas

Jogo de apocalipse zumbi em **primeira e terceira pessoa**, feito para **celular deitado** (paisagem),
rodando direto no navegador com WebGL2. Sem build, sem dependências externas: three.js r160 e as fontes
estão vendorizados dentro de `assets/`.

## Jogar

```bash
node serve.mjs          # http://localhost:8080
# ou
python3 -m http.server 8080
```

Abrir no celular em paisagem (ou apertar F11 no desktop). O jogo precisa de **WebGL2**;
se o dispositivo não suportar, aparece um aviso na tela de carregamento.

## Controles

| Ação | Desktop | Toque |
| --- | --- | --- |
| Mover | `WASD` | joystick esquerdo |
| Olhar | mouse (clique para travar) | arrastar na metade direita |
| Atirar | botão esquerdo / `Ctrl` | botão **ATIRAR** |
| Mira | botão direito | botão **MIRA** |
| Recarregar | `R` | **RECARGA** |
| Trocar arma | `1`–`5`, roda do mouse | **TROCAR** / slots |
| Agachar | `C` | **AGACHAR** |
| Correr | `Shift` | **CORRER** |
| Interagir / saquear | `E` (segurar) | **AÇÃO** (segurar) |
| Granada | `G` | slot de granada |
| Kit médico | `H` | slot de kit |
| Lanterna | `L` | **LUZ** |
| Câmera 1ª/3ª pessoa | `V` | **1ª/3ª** |
| Mapa ampliado | `M` | **MAP** |
| Pausa | `Esc` | **❚❚** |

## O que tem no jogo

**Campanha em 3 capítulos** com objetivos encadeados (eliminar, destruir ninhos, coletar
documentos, alcançar ponto de evacuação, matar o chefe), briefing, telas de morte/vitória,
pontuação, recorde salvo e progresso retomável.

- **Cidade aberta** de 216 × 216 m: quarteirões, ruas, becos, prédios com escombros, carros
  queimados, postes, barricadas, contêineres, sacos de areia, praça central, torre de rádio,
  muro de contenção com holofotes e névoa volumétrica.
- **4 tipos de zumbi** com IA de percepção (visão em cone, audição, cheiro), animação procedural
  de caminhada/corrida/ataque, hitboxes por parte do corpo (cabeça = crítico), sangue e morte ragdoll-ish.
  *Walker*, *Runner*, *Brute* (chefe) e hordas por onda.
- **5 armas + faca**: pistola M9, SMG MP5, fuzil AK-74, escopeta e sniper — cada uma com cadência,
  recuo, dispersão, penetração, mira (zoom), viewmodel com mãos e troca animada. Sistema de
  munição por pente + reserva, recarga automática, munição de reserva dropada por inimigos.
- **Granadas de fragmentação** com física de arremesso, raio de explosão, dano por distância e
  onda de choque visual.
- **Lanterna** com cone de luz real (spotlight) e economia de luz para mobile.
- **Loot interativo**: caixas de armas, kits médicos, granadas e suprimentos — segurar para abrir,
  emite barulho que atrai zumbis.
- **Sistemas de sobrevivência**: vida com regeneração lenta pós-dano, sangramento na tela,
  medkits, mira assistida com alcance ajustável, agachar/correr, colisão com o mundo.
- **HUD profissional**: búscula, minimapa com objetivos/inimigos, objetivo atual, onda e tempo,
  munição, slots de arma, gadgets, mensagens, contador de FPS e botões de toque grandes.

## Qualidade e desempenho

- Geometria estática da cidade é **fundida por material** e as faixas de rua usam `InstancedMesh`,
  o que derrubou as draw calls de ~1400 para **~700** (≈50k triângulos) mantendo o visual.
- Modo **Baixa qualidade** nas opções (sem sombras dinâmicas e sem post-processing) e redução
  automática de `devicePixelRatio` em retrato / telas pequenas.
- Efeitos de tela (bloom, vinheta, grão, aberração cromática) em um único passe `ShaderPass`.
- Áudio 100% procedural (WebAudio): tiros por arma, recargas, passos, gemidos, explosões,
  ambiência e música de tensão — nenhum arquivo de som.

## Estrutura

```
index.html            shell + todas as telas (menu, briefing, opções, ajuda, pausa, morte, vitória)
css/style.css         design system e HUD responsivo (inclui reflow para altura < 560px / 430px)
js/game.js            boot, loop, ondas, capítulos, save/continue, entrada de UI
js/world.js           cidade, colisão/raycast, iluminação, fusão de geometria
js/player.js          movimento, câmera 1ª/3ª, vida, granadas, lanterna, avatar
js/zombies.js         IA, ondas, animação procedural, dano/hitboxes
js/weapons.js         tabela de armas, viewmodel, disparo, recarga, viewmodel de luz
js/props.js           props saqueáveis
js/pickups.js         itens no chão
js/projectiles.js     granadas e projéteis
js/quest.js           objetivos dos capítulos
js/hud.js             toda a atualização do HUD
js/render.js          renderer, pós-processamento, céu
js/models.js          modelos procedurais (prédios, carros, zumbis, humanos, props)
js/textures.js        texturas em canvas
js/fx.js              partículas, decals, explosões, sangue
js/audio.js           síntese de áudio
js/controls.js        teclado, mouse, toque, pointer lock, háptica
js/util.js            matemática, rng, ruído, pools
serve.mjs             servidor estático local com headers corretos
```

## Notas técnicas

- ES modules puros; `import` de três via `assets/vendor/three.module.js`.
- Nenhum asset binário além das fontes: tudo o resto é gerado em canvas na inicialização,
  o que mantém o download em ~1,3 MB.
- `deadzone.settings.v1` / `deadzone.save.v1` / `deadzone.best.v1` no `localStorage`.
