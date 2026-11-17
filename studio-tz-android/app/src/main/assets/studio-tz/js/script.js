/* Studio Tz — parser de roteiro + diretor (prompt → esboço) */
(function (global) {
  'use strict';

  const PRESET_ALIASES = {
    plains: 'plains', pasto: 'plains', campo: 'plains', plain: 'plains',
    floresta: 'forest', forest: 'forest', arvore: 'forest', arvores: 'forest',
    deserto: 'desert', desert: 'desert', areia: 'desert',
    vila: 'village', village: 'village', cidade: 'village', casa: 'village',
    nether: 'nether', inferno: 'nether',
    oceano: 'ocean', ocean: 'ocean', mar: 'ocean', praia: 'ocean'
  };

  const SHOT_ALIASES = {
    close: 'close', closeup: 'close', perto: 'close',
    medium: 'medium', medio: 'medium', medio2: 'medium',
    wide: 'wide', largo: 'wide', geral: 'wide',
    orbit: 'orbit', orbital: 'orbit', roda: 'orbit',
    follow: 'follow', seguir: 'follow'
  };

  const ANIM_ALIASES = {
    idle: 'idle', parado: 'idle',
    walk: 'walk', andar: 'walk', caminhar: 'walk',
    attack: 'attack', ataque: 'attack',
    hit: 'hit', golpe: 'hit', sergolpeado: 'hit',
    wave: 'wave', acenar: 'wave', aceno: 'wave',
    look: 'look', olhar: 'look'
  };

  const MUSIC_ALIASES = {
    epica: 'epica', épica: 'epica', epic: 'epica',
    triste: 'triste', sad: 'triste', melancolia: 'triste',
    acao: 'acao', action: 'acao', acção: 'acao',
    off: 'off', semmusica: 'off', silencio: 'off'
  };

  const FX_ALIASES = {
    hit: 'hit', impacto: 'hit',
    portal: 'portal', portal: 'portal',
    fogo: 'fogo', fire: 'fogo', chamas: 'fogo'
  };

  function normalize(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /* ---------- parser ---------- */
  function parse(text) {
    const lines = (text || '').split('\n');
    const result = {
      preset: 'plains',
      duration: 5,
      camera: 'medium',
      cut: false,
      music: null,
      beats: [],
      cast: []
    };
    const scenes = [result];
    let cur = result;

    for (let raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const idx = line.search(/[:：]/);
      const cmd = normalize(idx === -1 ? line : line.slice(0, idx));
      const argRaw = idx === -1 ? '' : line.slice(idx + 1).trim();

      switch (cmd) {
        case 'cena':
        case 'scene': {
          const key = normalize(argRaw) || 'plains';
          const preset = PRESET_ALIASES[key] || 'plains';
          cur = {
            preset, duration: 5, camera: 'medium', cut: false,
            music: null, beats: []
          };
          scenes.push(cur);
          break;
        }
        case 'personagem':
        case 'character': {
          // Nome, skinId
          const parts = argRaw.split(',');
          const name = (parts[0] || 'Personagem').trim().slice(0, 24) || 'Personagem';
          const skinId = (parts[1] || 'default:2').trim();
          if (!result.cast.find(c => c.name === name)) {
            result.cast.push({ name, skinId });
          }
          break;
        }
        case 'camera': {
          cur.camera = SHOT_ALIASES[normalize(argRaw)] || 'medium';
          break;
        }
        case 'escena':
        case 'sceneduration': {
          const n = parseFloat(argRaw);
          if (n > 0.5) cur.duration = Math.min(60, n);
          break;
        }
        case 'musica':
        case 'music': {
          cur.music = MUSIC_ALIASES[normalize(argRaw)] || null;
          break;
        }
        case 'falar':
        case 'say':
        case 'dialogo': {
          // Nome: texto
          const sp = argRaw.indexOf(':');
          const name = sp === -1 ? 'Narrador' : argRaw.slice(0, sp).trim();
          const text = sp === -1 ? argRaw : argRaw.slice(sp + 1).trim();
          if (text) cur.beats.push({ type: 'falar', name, text });
          break;
        }
        case 'anima':
        case 'anim':
        case 'action': {
          const anim = ANIM_ALIASES[normalize(argRaw).split(':').pop()] || 'idle';
          const target = normalize(argRaw).split(':')[0];
          cur.beats.push({ type: 'anima', anim, name: target || null });
          break;
        }
        case 'efeito':
        case 'fx': {
          const fx = FX_ALIASES[normalize(argRaw)] || 'hit';
          cur.beats.push({ type: 'efeito', fx });
          break;
        }
        case 'corte':
        case 'cut': {
          cur.cut = true;
          break;
        }
        default:
          // linha livre: trata como fala se contém dois pontos, senão ignora
          if (idx !== -1 && argRaw.length > 1) {
            cur.beats.push({ type: 'falar', name: argRaw.slice(0, idx).trim(), text: argRaw.slice(idx + 1).trim() });
          }
      }
    }

    // remove cenas vazias sem beats nem duração insignificante
    const clean = scenes.filter(s => s.beats.length > 0 || s.duration >= 1.5);
    return { scenes: clean.length ? clean : [result], cast: result.cast, music: result.music };
  }

  /* ---------- durações dos beats ---------- */
  function beatDuration(beat) {
    if (beat.type === 'falar') {
      return Math.max(1.1, (beat.text.length || 10) * 0.055) + 0.4;
    }
    if (beat.type === 'anima') {
      return beat.anim === 'walk' ? 2.2 : 1.5;
    }
    if (beat.type === 'efeito') return 1.0;
    return 1.5;
  }

  function sceneDuration(scene) {
    let d = scene.duration || 5;
    let beats = 0;
    for (let b of scene.beats) beats += beatDuration(b);
    return Math.max(d, beats + 0.6);
  }

  function estimateDuration(scriptObj) {
    const p = typeof scriptObj === 'string' ? parse(scriptObj) : scriptObj;
    return p.scenes.reduce((acc, s) => acc + sceneDuration(s), 0);
  }

  /* ---------- diretor: prompt → esboço do roteiro ---------- */
  const CAMERA_CYCLE = ['wide', 'medium', 'close', 'orbit'];

  function detectPreset(sentence) {
    const s = normalize(sentence);
    if (/nether|inferno|portal|lava/.test(s)) return 'nether';
    if (/floresta|arvore|floresta/.test(s)) return 'floresta';
    if (/deserto|desert|areia|deserto/.test(s)) return 'deserto';
    if (/oceano|ocean|mar |praia|rio/.test(s)) return 'oceano';
    if (/vila|cidade|casa|povo/.test(s)) return 'vila';
    return 'plains';
  }

  function detectMusic(sentence) {
    const s = normalize(sentence);
    if (/luta|batalha|guerra|ataque|combate|acao|ação/.test(s)) return 'acao';
    if (/triste|morte|choro|desespero|perda/.test(s)) return 'triste';
    if (/epic|epic|guerra|grande|heroi|heroica/.test(s)) return 'epica';
    return 'epica';
  }

  function sketchFromPrompt(prompt, castNames) {
    const names = (castNames || []).map(n => n.toLowerCase());
    const sentences = prompt
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 4)
      .slice(0, 24);

    const lines = [];
    let i = 0;
    for (const sent of sentences) {
      lines.push('cena:' + detectPreset(sent));
      const cam = CAMERA_CYCLE[i % CAMERA_CYCLE.length];
      lines.push('camera:' + cam);
      lines.push('musica:' + detectMusic(sent));

      // fala se a frase começa com "Nome: texto" ou menciona um personagem
      const match = sent.match(/^([^:：]{2,20})[：:](.+)$/);
      if (match && names.includes(match[1].trim().toLowerCase())) {
        lines.push('falar: ' + match[1].trim() + ': ' + match[2].trim().slice(0, 80));
      } else if (match && match[2].trim().length <= 80) {
        lines.push('falar: Narrador: ' + match[2].trim());
      } else if (names.length) {
        lines.push('falar: ' + names[0] + ': ' + sent.slice(0, 70));
      } else {
        lines.push('falar: Narrador: ' + sent.slice(0, 70));
      }
      lines.push('escena: 5');
      i++;
    }
    return lines.join('\n');
  }

  global.StudioScript = { parse, sceneDuration, beatDuration, estimateDuration, sketchFromPrompt };
})(window);
