/* Studio Tz — sistema de skins (texturas de personagens Minecraft PE) */
(function (global) {
  'use strict';

  /* Layout classico do Minecraft PE: 64x32.
     Cada regiao: [x, y, largura, altura] */
  const REGIONS_6432 = {
    head: [8, 8, 8, 8],
    body: [20, 8, 16, 12],
    armL: [44, 8, 4, 12],
    armR: [52, 8, 4, 12],
    legL: [8, 20, 8, 12],
    legR: [16, 20, 8, 12]
  };

  /* Layout do Java (tambem aceito): 64x64 */
  const REGIONS_6464 = {
    head: [8, 8, 8, 8],
    body: [20, 16, 16, 24],
    armL: [0, 16, 4, 24],
    armR: [40, 16, 4, 24],
    legL: [8, 40, 8, 24],
    legR: [16, 40, 8, 24]
  };

  function detectLayout(w, h) {
    if (w === 64 && h === 32) return REGIONS_6432;
    if (w === 64 && h === 64) return REGIONS_6464;
    if (w === 32 && h === 16) {
      // resize 2x para o layout classico
      return { upscale: 2, regions: REGIONS_6432 };
    }
    return null;
  }

  /* ---------- Skins nativas (geradas, sem precisar de nada) ---------- */
  function drawBaseSkin(ctx, opts) {
    const W = 64, H = 32, R = REGIONS_6432;
    ctx.clearRect(0, 0, W, H);

    const fill = (r, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(r[0], r[1], r[2], r[3]);
    };
    const skinTone = opts.skin;
    const hair = opts.hair;
    const shirt = opts.shirt;
    const pants = opts.pants;

    fill(R.head, skinTone);
    // cabelo (topo da cabeça)
    ctx.fillStyle = hair;
    ctx.fillRect(R.head[0], R.head[1], R.head[2], 3);
    ctx.fillRect(R.head[0], R.head[1], 1, R.head[3]);
    ctx.fillRect(R.head[0] + R.head[2] - 1, R.head[1], 1, R.head[3]);
    // olhos
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(R.head[0] + 2, R.head[1] + 3, 2, 2);
    ctx.fillRect(R.head[0] + 4, R.head[1] + 3, 2, 2);
    // boca
    ctx.fillStyle = 'rgba(120,40,40,.8)';
    ctx.fillRect(R.head[0] + 3, R.head[1] + 5, 2, 1);

    fill(R.body, shirt);
    // detalhes da blusa
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(R.body[0], R.body[1] + 2, R.body[2], 2);
    fill(R.armL, skinTone);
    fill(R.armR, skinTone);
    fill(R.legL, pants);
    fill(R.legR, pants);
    // sapatos
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(R.legL[0], R.legL[1] + R.legL[3] - 2, R.legL[2], 2);
    ctx.fillRect(R.legR[0], R.legR[1] + R.legR[3] - 2, R.legR[2], 2);
  }

  function makeBuiltin(id, name, opts) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    drawBaseSkin(c.getContext('2d'), opts);
    return { id, name, dataUrl: c.toDataURL('image/png'), builtin: true, width: 64, height: 32 };
  }

  const BUILTINS = [
    makeBuiltin('default:1', 'Herói', { skin: '#F2C9A0', hair: '#6B4423', shirt: '#3A6EE8', pants: '#2B2B45' }),
    makeBuiltin('default:2', 'Steve', { skin: '#F5D6B0', hair: '#8B5A2B', shirt: '#3FA34D', pants: '#4A6B8A' }),
    makeBuiltin('default:3', 'Vilão', { skin: '#E8B48C', hair: '#1c1c1c', shirt: '#8E2B2B', pants: '#1c1c1c' }),
    makeBuiltin('default:4', 'Exploradora', { skin: '#FFD9B3', hair: '#E3C15A', shirt: '#2E9E5B', pants: '#7A5C3E' })
  ];

  /* ---------- Importação de skin do usuário ---------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Falha ao ler a imagem.'));
      img.src = src;
    });
  }

  async function makeFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const layout = detectLayout(img.naturalWidth, img.naturalHeight);
      if (!layout) {
        throw new Error('Skin inválida. Use uma skin PNG do Minecraft PE (64x32 ou 64x64).');
      }
      const is6464 = img.naturalWidth === 64 && img.naturalHeight === 64;
      const scale = layout.upscale || 1;
      const cw = 64, ch = 32;
      const c = document.createElement('canvas');
      c.width = is6464 ? 64 : cw;
      c.height = is6464 ? 64 : ch;
      const cx = c.getContext('2d');
      cx.imageSmoothingEnabled = false;
      // layout java 64x64: guarda a imagem integral — as regiões do
      // 64x64 sao cortadas na hora de criar as texturas.
      cx.drawImage(img, 0, 0, c.width, c.height);
      const skin = {
        id: 'skin-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: (file.name || 'Skin importada').replace(/\.[^.]+$/, '').slice(0, 28),
        dataUrl: c.toDataURL('image/png'),
        builtin: false,
        width: img.naturalWidth,
        height: img.naturalHeight,
        layout: is6464 ? '6464' : '6432'
      };
      return skin;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function regionsFor(skin) {
    if (skin.layout === '6464') return REGIONS_6464;
    return REGIONS_6432;
  }

  /* Retorna o THREE.CanvasTexture de uma regiao da skin */
  function regionTexture(THREE, skin, regionKey) {
    const img = new Image();
    const regions = regionsFor(skin);
    const r = regions[regionKey];
    const scale = skin.layout === '6464' ? 2 : 1; // 64x64: regiões são maiores, normaliza
    const c = document.createElement('canvas');
    const sw = r[2] * (skin.layout === '6464' ? 1 : 1);
    const sh = r[3];
    c.width = Math.max(1, sw);
    c.height = Math.max(1, sh);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // espera o imagem carregar (cache via dataUrl é rápido)
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;

    const src = new Image();
    src.onload = () => {
      // Para 64x64, as regiões já estão nas coordenadas 64x64 corretas.
      cx.drawImage(src, r[0], r[1], r[2], r[3], 0, 0, c.width, c.height);
      tex.needsUpdate = true;
    };
    src.src = skin.dataUrl;
    return tex;
  }

  function previewImg(dataUrl) {
    return dataUrl;
  }

  global.StudioSkins = {
    BUILTINS,
    makeFromFile,
    regionsFor,
    regionTexture,
    detectLayout,
    previewImg
  };
})(window);
