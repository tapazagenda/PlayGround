/* Studio Tz — controller da interface */
(function (global) {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let engine = null;
  let audio = null;
  let skins = [];
  let projects = [];
  let current = null;
  let selectedSkinId = 'default:1';

  /* ---------- helpers ---------- */
  function toast(msg, ms) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* Confirm via modal próprio (o confirm() nativo não aparece no WebView Android) */
  function studioConfirm(message) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML =
        '<div class="modal-card"><h3>Atenção</h3>' +
        '<p style="color:var(--text-dim);font-size:14px;line-height:1.5">' + message + '</p>' +
        '<div class="modal-actions"><button class="btn ghost" id="cf-cancel">Cancelar</button>' +
        '<button class="btn primary" id="cf-ok">OK</button></div></div>';
      document.body.appendChild(modal);
      const close = (v) => { modal.remove(); resolve(v); };
      modal.querySelector('#cf-cancel').addEventListener('click', () => close(false));
      modal.querySelector('#cf-ok').addEventListener('click', () => close(true));
    });
  }

  function resolveSkins(cast) {
    return (cast || []).map(c => {
      const skin = skins.find(s => s.id === c.skinId) || skins.find(s => s.id === 'default:2') || skins[0];
      return { name: c.name, skin };
    }).filter(c => c.skin);
  }

  function outputSize(orient) {
    return orient === 'portrait' ? [720, 1280] : [1280, 720];
  }

  /* ---------- inicialização ---------- */
  async function init() {
    audio = new StudioAudio();

    if (typeof THREE === 'undefined') {
      toast('Motor 3D não carregou. Reinicie o app.');
      return;
    }

    // skins nativas + importadas
    skins = StudioSkins.BUILTINS.slice();
    try {
      const imported = await StudioIDB.getSkins();
      imported.forEach(s => { if (!skins.find(k => k.id === s.id)) skins.push(s); });
    } catch (e) { /* first run */ }

    // motor 3D
    engine = new StudioEngine($('stage'), audio);
    if (!engine.init()) {
      toast('Seu aparelho não tem suporte a WebGL 3D.');
      return;
    }
    engine.setOutputSize(1280, 720);
    engine.setStudioIdle([{ name: 'Herói', skin: skins[0] }], 'orbit');

    bindUI();
    await refreshProjects();
    showScreen('home');
  }

  /* ---------- telas ---------- */
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
    $('topbar-title').innerHTML = name === 'home' ? 'Studio <span>Tz</span>' : '<span>Studio Tz</span>';
  }

  /* ---------- projetos ---------- */
  async function refreshProjects() {
    projects = await StudioIDB.getProjects();
    projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const grid = $('projects-grid');
    grid.innerHTML = '';
    if (!projects.length) {
      grid.innerHTML = '<div class="empty-card" id="projects-empty">Nenhum projeto ainda.<br>Crie o primeiro e comece a animar.</div>';
      return;
    }
    for (const p of projects) {
      const card = document.createElement('div');
      card.className = 'project-card';
      card.innerHTML =
        '<div class="pc-thumb">🎬</div>' +
        '<div class="pc-orient">' + (p.orientation === 'portrait' ? '📱 9:16' : '🖥 16:9') + '</div>' +
        '<h3></h3><div class="pc-meta"></div>' +
        '<button class="pc-delete">Apagar</button>';
      card.querySelector('h3').textContent = p.name;
      card.querySelector('.pc-meta').textContent = fmtTime(StudioScript.estimateDuration(p.script || '')) + ' · ' + new Date(p.updatedAt || Date.now()).toLocaleDateString('pt-BR');
      card.querySelector('.pc-delete').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await studioConfirm('Apagar o projeto "' + p.name + '"?')) {
          await StudioIDB.deleteProject(p.id);
          await refreshProjects();
        }
      });
      card.addEventListener('click', () => openProject(p.id));
      grid.appendChild(card);
    }
  }

  async function openProject(id) {
    current = projects.find(p => p.id === id);
    if (!current) return;
    showScreen('project');
    $('project-name').value = current.name;
    setOrientation(current.orientation, false);
    $('script-editor').value = current.script || '';
    renderSkinsTab();
    renderCast();
    renderMusicTab();
    applyOutputSize();
    engine.setStudioIdle(resolveSkins(current.cast || []).length ? resolveSkins(current.cast) : [{ name: 'Herói', skin: skins[0] }], 'medium');
    saveSoon();
  }

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProject, 500);
  }

  async function saveProject() {
    if (!current) return;
    current.script = $('script-editor').value;
    current.updatedAt = Date.now();
    await StudioIDB.putProject(current);
  }

  async function createProject(name, orient) {
    const proj = {
      id: 'proj-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: name || 'Projeto novo',
      orientation: orient,
      script: 'cena:plains\npersonagem: Herói, default:1\ncamera:wide\nmusica:epica\nescena: 5\nfalar: Herói: A história começa aqui.\n',
      cast: [{ name: 'Herói', skinId: 'default:1' }],
      music: 'epica',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await StudioIDB.putProject(proj);
    await refreshProjects();
    openProject(proj.id);
  }

  /* ---------- orientação ---------- */
  function setOrientation(orient, persist) {
    document.querySelectorAll('.orientation-pills .pill').forEach(p => {
      p.classList.toggle('active', p.dataset.orient === orient);
    });
    if (current) current.orientation = orient;
    applyOutputSize();
    if (persist) saveSoon();
  }

  function applyOutputSize() {
    const orient = current ? current.orientation : 'landscape';
    const [w, h] = outputSize(orient);
    if (engine) engine.setOutputSize(w, h);
  }

  /* ---------- abas ---------- */
  function bindTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        $('tab-' + tab.dataset.tab).classList.add('active');
      });
    });
  }

  /* ---------- roteiro ---------- */
  function insertAtCursor(text) {
    const ta = $('script-editor');
    const start = ta.selectionStart, end = ta.selectionEnd;
    const val = ta.value;
    const lineStart = val.lastIndexOf('\n', start - 1) + 1;
    const insert = (val[lineStart] === undefined || val[lineStart] === '\n' ? '' : '\n') + text;
    ta.value = val.slice(0, lineStart) + insert + val.slice(end);
    const pos = lineStart + insert.length;
    ta.selectionStart = ta.selectionEnd = pos;
    ta.focus();
    saveSoon();
  }

  function showPromptModal(title, defValue, onOk) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML =
      '<div class="modal-card">' +
      '<h3></h3>' +
      '<label class="field"><span>Descreva a história em um parágrafo</span>' +
      '<textarea id="prompt-input" rows="4" style="width:100%;background:var(--bg-3);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;color:var(--text);font-size:15px;"></textarea></label>' +
      '<div class="modal-actions"><button class="btn ghost" id="prompt-cancel">Cancelar</button>' +
      '<button class="btn primary" id="prompt-ok">Gerar esboço</button></div>' +
      '</div>';
    modal.querySelector('h3').textContent = title;
    document.body.appendChild(modal);
    const input = modal.querySelector('#prompt-input');
    input.value = defValue || '';
    input.focus();
    const close = () => modal.remove();
    modal.querySelector('#prompt-cancel').addEventListener('click', close);
    modal.querySelector('#prompt-ok').addEventListener('click', () => {
      const v = input.value.trim();
      if (v) { close(); onOk(v); }
    });
  }

  function runPlayback(render) {
    if (!engine) return;
    const text = $('script-editor').value;
    if (!text.trim()) {
      toast('Escreva um roteiro primeiro.');
      return;
    }
    audio.resume();
    const parsed = StudioScript.parse(text);
    if (!parsed.scenes.length) {
      toast('Roteiro vazio.');
      return;
    }
    const cast = resolveSkins(parsed.cast);
    engine._castSkins = cast;
    const total = StudioScript.estimateDuration(parsed);
    const overlay = $('stage-overlay');
    const modeLabel = $('stage-mode-label');
    const progressWrap = $('render-progress-wrap');
    const progressFill = $('stage-progress-fill');
    const timeLabel = $('stage-time');

    overlay.classList.remove('hidden');
    modeLabel.textContent = render ? '🎬 Renderizando' : '▶ Pré-visualização';
    $('btn-pause').textContent = '⏸ Pausar';
    progressFill.style.width = '0%';
    timeLabel.textContent = '0:00 / ' + fmtTime(total);

    if (render) {
      progressWrap.classList.remove('hidden');
    } else {
      progressWrap.classList.add('hidden');
    }

    engine.play(parsed, {
      render: render,
      music: (current && current.music) || 'epica',
      onProgress: (p, elapsed, totalDur) => {
        progressFill.style.width = (p * 100).toFixed(1) + '%';
        timeLabel.textContent = fmtTime(elapsed) + ' / ' + fmtTime(totalDur);
      },
      onDone: (url) => {
        overlay.classList.add('hidden');
        engine.setStudioIdle(cast.length ? cast : [{ name: 'Herói', skin: skins[0] }], 'medium');
        if (render) {
          if (url) {
            finishRender(url);
          } else {
            toast('Renderização falhou. Tente de novo.');
          }
        } else {
          toast('Pré-visualização concluída.');
        }
      }
    });
  }

  function finishRender(url) {
    const video = $('render-video');
    video.src = url;
    $('render-status').textContent = 'Vídeo pronto! Baixe ou compartilhe.';
    $('render-result').classList.remove('hidden');
    const dl = $('btn-download');
    dl.href = url;
    dl.setAttribute('download', 'studio-tz.webm');
    $('render-progress-wrap').classList.add('hidden');
    // envio para DownloadManager (Android)
    if (window.StudioBridge && window.StudioBridge.download) {
      try { window.StudioBridge.download(url, 'studio-tz.webm'); } catch (e) {}
    }
    toast('Vídeo renderizado!');
  }

  /* ---------- skins ---------- */
  function renderSkinsTab() {
    const list = $('skin-list');
    list.innerHTML = '';
    skins.forEach(s => {
      const card = document.createElement('div');
      card.className = 'skin-card' + (s.id === selectedSkinId ? ' selected' : '');
      card.innerHTML =
        '<div class="sk-preview"><img src="' + s.dataUrl + '" alt=""></div>' +
        '<h4></h4><div class="sk-meta"></div>';
      card.querySelector('h4').textContent = s.name;
      card.querySelector('.sk-meta').textContent = (s.builtin ? 'Nativa' : 'Importada') + ' · ' + s.width + '×' + s.height;
      card.addEventListener('click', () => {
        selectedSkinId = s.id;
        renderSkinsTab();
        engine.setStudioIdle([{ name: s.name, skin: s }], 'medium');
        toast('Skin selecionada: ' + s.name);
      });
      list.appendChild(card);
    });
  }

  async function importSkin(file) {
    try {
      const skin = await StudioSkins.makeFromFile(file);
      skins.push(skin);
      await StudioIDB.putSkin(skin);
      renderSkinsTab();
      toast('Skin importada: ' + skin.name);
    } catch (e) {
      toast(e.message || 'Falha ao importar a skin.');
    }
  }

  function renderCast() {
    const box = $('cast-list');
    box.innerHTML = '';
    if (!current) return;
    const parsed = StudioScript.parse(current.script || '');
    if (!parsed.cast.length) {
      box.innerHTML = '<div class="empty-card">Adicione personagens no roteiro com comandos <code>personagem:</code>.</div>';
      return;
    }
    parsed.cast.forEach(c => {
      const skin = skins.find(s => s.id === c.skinId);
      const item = document.createElement('div');
      item.className = 'cast-item';
      item.innerHTML =
        '<div class="cast-avatar">🧑</div>' +
        '<div class="cast-info"><b></b><span></span></div>';
      item.querySelector('b').textContent = c.name;
      item.querySelector('span').textContent = skin ? skin.name : 'skin: ' + c.skinId;
      box.appendChild(item);
    });
  }

  /* ---------- música ---------- */
  const MUSIC_OPTIONS = [
    { id: 'epica', icon: '⚔️', name: 'Épica', desc: 'Cordas, baixo e bumbo — aventura e grandiosidade' },
    { id: 'acao', icon: '💥', name: 'Ação', desc: 'Batida acelerada — batalhas e combate' },
    { id: 'triste', icon: '🌧️', name: 'Triste', desc: 'Piano melancólico — drama e emoção' },
    { id: 'off', icon: '🔇', name: 'Sem música', desc: 'Silêncio total' }
  ];

  function renderMusicTab() {
    const list = $('music-list');
    list.innerHTML = '';
    const cur = (current && current.music) || 'epica';
    MUSIC_OPTIONS.forEach(m => {
      const card = document.createElement('div');
      card.className = 'music-card' + (m.id === cur ? ' active' : '');
      card.innerHTML =
        '<div class="mc-icon">' + m.icon + '</div>' +
        '<div class="mc-info"><b>' + m.name + '</b><span>' + m.desc + '</span></div>' +
        '<button class="btn ghost small">Audição</button>';
      card.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        audio.resume();
        audio.setMusic(m.id === cur ? 'off' : m.id);
        toast('Audição: ' + m.name);
      });
      card.addEventListener('click', () => {
        if (current) { current.music = m.id; saveSoon(); }
        renderMusicTab();
      });
      list.appendChild(card);
    });
  }

  /* ---------- binds ---------- */
  function bindUI() {
    bindTabs();

    $('btn-home').addEventListener('click', () => {
      saveSoon();
      engine.stop();
      engine.setStudioIdle([{ name: 'Herói', skin: skins[0] }], 'orbit');
      showScreen('home');
    });

    $('btn-orientation').addEventListener('click', () => {
      if (!current) { toast('Abra um projeto primeiro.'); return; }
      setOrientation(current.orientation === 'landscape' ? 'portrait' : 'landscape', true);
      toast('Tela: ' + (current.orientation === 'landscape' ? 'deitado 16:9' : 'em pé 9:16'));
    });

    $('btn-new-project').addEventListener('click', () => $('modal-new').classList.remove('hidden'));
    $('modal-cancel').addEventListener('click', () => $('modal-new').classList.add('hidden'));
    $('modal-create').addEventListener('click', () => {
      const name = $('new-name').value.trim();
      const orient = document.querySelector('#modal-new .pill.active')?.dataset.orient || 'landscape';
      document.querySelectorAll('#modal-new .pill').forEach(p => p.classList.toggle('active', p.dataset.orient === orient));
      $('modal-new').classList.add('hidden');
      createProject(name, orient);
    });
    document.querySelectorAll('#modal-new .pill').forEach(p => {
      p.addEventListener('click', () => {
        document.querySelectorAll('#modal-new .pill').forEach(q => q.classList.remove('active'));
        p.classList.add('active');
      });
    });

    // orientação do projeto
    document.querySelectorAll('#screen-project .pill').forEach(p => {
      p.addEventListener('click', () => setOrientation(p.dataset.orient, true));
    });

    $('project-name').addEventListener('input', () => {
      if (current) { current.name = $('project-name').value; saveSoon(); }
    });

    $('script-editor').addEventListener('input', () => saveSoon());

    document.querySelectorAll('.tool-btn').forEach(b => {
      b.addEventListener('click', () => insertAtCursor(b.dataset.insert));
    });

    $('btn-sketch').addEventListener('click', () => {
      const names = (current && StudioScript.parse(current.script || '').cast.map(c => c.name)) || [];
      showPromptModal('Gerar esboço do roteiro', '', (promptText) => {
        const sketch = StudioScript.sketchFromPrompt(promptText, names);
        $('script-editor').value = sketch;
        saveSoon();
        toast('Esboço gerado — revise e renderize.');
      });
    });

    $('btn-preview').addEventListener('click', () => runPlayback(false));
    $('btn-render').addEventListener('click', async () => {
      const total = StudioScript.estimateDuration($('script-editor').value || '');
      if (total > 120) {
        if (!await studioConfirm('O roteiro tem ~' + Math.round(total) + 's. A renderização é em tempo real e pode levar alguns minutos. Continuar?')) return;
      }
      runPlayback(true);
    });

    $('btn-stop').addEventListener('click', () => {
      engine.stop();
      $('stage-overlay').classList.add('hidden');
      $('render-progress-wrap').classList.add('hidden');
      if (current) engine.setStudioIdle(resolveSkins(StudioScript.parse($('script-editor').value).cast).length ? resolveSkins(StudioScript.parse($('script-editor').value).cast) : [{ name: 'Herói', skin: skins[0] }], 'medium');
      toast('Encerrado.');
    });

    $('btn-pause').addEventListener('click', () => {
      const btn = $('btn-pause');
      if (engine.paused) {
        engine.resume();
        btn.textContent = '⏸ Pausar';
      } else {
        engine.pause();
        btn.textContent = '▶ Continuar';
      }
    });

    $('btn-import-skin').addEventListener('click', () => $('skin-file').click());
    $('skin-file').addEventListener('change', (e) => {
      if (e.target.files.length) importSkin(e.target.files[0]);
      e.target.value = '';
    });

    $('btn-share-render').addEventListener('click', () => {
      const video = $('render-video');
      if (!video.src) return;
      if (navigator.share) {
        fetch(video.src).then(r => r.blob()).then(b => {
          navigator.share({ files: [new File([b], 'studio-tz.webm', { type: 'video/webm' })] }).catch(() => {});
        }).catch(() => {});
      } else {
        video.scrollIntoView({ behavior: 'smooth' });
        toast('Use o botão Baixar para salvar o vídeo.');
      }
    });

    window.addEventListener('resize', () => {
      if (engine) engine.renderer.setSize(engine.outW, engine.outH, false);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
