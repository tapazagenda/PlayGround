# BUILD — DEADZONE

Guia curto para mexer no projeto. Não existe etapa de build: os arquivos que estão no repositório
são exatamente os que rodam no navegador.

## Rodar localmente

```bash
node serve.mjs 8080     # servidor estático (necessário: ES modules não abrem via file://)
node validate.mjs       # checagem estática: sintaxe, imports, assets, IDs
```

Abrir `http://localhost:8080`. Para testar em celular na mesma rede, use o IP da máquina
(o servidor já faz bind em `0.0.0.0`).

## Arquitetura em uma tela

```
game.js  ── cria e orquestra ──►  world, player, weapons, zombies, pickups, props,
   │                              projectiles, quest, fx, hud, audio, controls, render
   └─ loop: update(dt) de cada sistema → render.render(scene, camera) → hud.update(dt)
```

- **Ordem de boot importa**: `render` → `world` → `player` → `weapons` → `hud` (o HUD precisa
  existir antes do `WeaponSystem`, que escreve munição no HUD no primeiro frame).
- **Estados** (`game.state`): `loading` → `menu` → `playing` ⇄ `paused` → `dead` / `victory`.
  Um único `requestAnimationFrame`; quando pausado o loop continua renderizando, mas com `dt = 0`
  nos sistemas de gameplay (o post-processing precisa de tempo para a vinheta respirar).
- **Câmera**: `player.camera` é filha de `player.rig`. Em 1ª pessoa o viewmodel (`weapons.viewRoot`)
  é filho dela; em 3ª pessoa ele é ocultado e o avatar (`player.avatar`) aparece com a arma na mão.

## Onde ajustar o quê

| Quero mudar… | Arquivo | Onde |
| --- | --- | --- |
| Dano/vida/velocidade dos zumbis | `js/zombies.js` | tabela `TYPES` |
| Dificuldade das ondas | `js/game.js` | `spawnWave()` / `waveTimer` |
| Armas (dano, cadência, munição, zoom) | `js/weapons.js` | tabela `WEAPONS` |
| Capítulos, objetivos e textos | `js/quest.js` | `CHAPTERS` |
| Tamanho/geometria da cidade | `js/world.js` | `WORLD_HALF`, `ROAD_W`, `ROAD_LINES`, `_buildCity()` |
| Iluminação, névoa, pós-processamento | `js/render.js` | `setupLights()`, shader `composite` |
| Layout do HUD e telas | `css/style.css` | variáveis no `:root` e media queries de altura |
| Sensibilidade padrão / opções | `js/game.js` | `DEFAULT_SETTINGS` |

## Desempenho

O gargalo em celular é **draw call**, não triângulo. Duas regras ao adicionar cenário:

1. Geometria estática nunca deve virar uma `Mesh` solta por peça. Monte num `THREE.Group` e passe
   em `world._bake(group)` (ou `mergeByMaterial()` de `models.js`) — ele funde tudo por material.
2. Repetições (faixas de rua, postes, barris) devem usar `InstancedMesh`.

Medição rápida no console, com o jogo rodando:

```js
const i = window.__game.renderer.renderer.info;
console.log(i.render.calls, i.render.triangles, i.memory.geometries, i.memory.textures);
```

Alvo atual: **~700 draw calls / ~50k triângulos** com a cidade inteira + zumbis em tela.

O modo **Baixa qualidade** (opções) desliga sombras e pós-processamento e reduz o pixel ratio.
Em retrato o jogo também reduz o DPR automaticamente e mostra o aviso de girar o aparelho
(com opção de continuar).

## Depuração

`window.__game` expõe o jogo inteiro (`player`, `zombies`, `weapons`, `quest`, `world`…).
Exemplos:

```js
__game.player.invuln = 1e9;              // sobreviver para testar objetivos
__game.zombies.spawn('brute');           // invocar um chefe na sua frente
__game.weapons.give('sniper', 60);       // liberar arma
__game.quest.completeObjective();         // concluir a etapa atual do capítulo
__game.player.toggleFlashlight(false);   // apagar a lanterna
```

## Convenções

- Módulos ES, sem transpiler, sem `npm install`. Só `three` vendorizado.
- Nada de asset binário novo: texturas são geradas em `textures.js`/`models.js` via canvas,
  áudio em `audio.js` via WebAudio.
- Toda string visível é **pt-BR**, em maiúsculas quando é rótulo de HUD.
- Antes de commitar: `node validate.mjs` e um teste real no navegador (menu → capítulo 1 → matar
  zumbis → interagir com a antena → pausa → retomar).
