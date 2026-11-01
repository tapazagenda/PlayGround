(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const native = window.LunaNative || null;
  const isNative = !!native;
  const state = {
    page: 'home',
    settings: { voice: true, screen: true, motion: true, orientation: 'auto', rate: 1, pitch: 1.08, prompt: '' },
    files: [],
    history: [],
    brain: null,
    listening: false,
    speaking: false,
    logs: []
  };
  const pages = {
    home: ['Início', 'LunaTz Engine v1.0'],
    chat: ['Conversa', 'voz, texto e modo gravação'],
    games: ['Jogos', 'adaptadores e companheira'],
    minecraft: ['Minecraft', 'diagnóstico Bedrock LAN'],
    instructions: ['Instruções', 'personalidade e regras'],
    files: ['Arquivos', '/sdcard/DADOS DE LUNA'],
    history: ['Histórico', 'conversas salvas'],
    settings: ['Ajustes', 'voz, tela e orientação'],
    about: ['Sobre', 'créditos e versão']
  };
  const navIcons = { home: '🌙', chat: '💬', games: '🎮', minecraft: '⛏️', instructions: '🧠', files: '📁', history: '🕘', settings: '⚙️', about: '❤️' };
  const defaultPrompt = 'Você é Luna, 18 anos, companheira virtual de gameplay do Tapazaki. Fale PT-BR natural, com frases curtas, humor gamer e carinho. Reaja apenas a eventos confirmados. Não invente itens, posições ou ações. Em gravação, seja coapresentadora. Quando ouvir "encerrar vídeo", faça uma despedida curta.';
  const presets = {
    gamer: defaultPrompt,
    gravacao: 'Você é Luna, coapresentadora do canal Tapazaki. Fale com o público, peça like de forma espontânea, reaja a mortes engraçadas e encerre vídeos com carinho. Não narre o tempo todo.',
    doce: 'Você é Luna, doce, brincalhona e corajosa. Chame o usuário de Tapazaki. Use frases curtas, naturais e acolhedoras. Evite excesso de emojis e nunca finja ações que não aconteceram.'
  };

  function log(message, level) {
    const item = { t: new Date().toLocaleTimeString(), message, level: level || 'info' };
    state.logs.push(item);
    if (state.logs.length > 200) state.logs.shift();
    const line = document.createElement('div');
    line.className = 'log-line ' + item.level;
    line.textContent = '[' + item.t + '] ' + message;
    const box = $('#console-log');
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    $('#console-count').textContent = String(state.logs.length);
    if (isNative) native.log(message);
  }

  function safeCall(fn, fallback) {
    try { return fn(); } catch (e) { log('native: ' + e.message, 'warn'); return fallback; }
  }
  function parseJson(text, fallback) { try { return JSON.parse(text); } catch (_) { return fallback; } }

  function loadSettings() {
    const raw = isNative ? safeCall(() => native.getSettings(), '{}') : localStorage.getItem('lunatz.settings') || '{}';
    Object.assign(state.settings, parseJson(raw, {}));
    if (!state.settings.prompt) state.settings.prompt = defaultPrompt;
    $('#prompt').value = state.settings.prompt;
    $('#set-voice').checked = !!state.settings.voice;
    $('#set-screen').checked = !!state.settings.screen;
    $('#set-motion').checked = !!state.settings.motion;
    $('#set-orientation').value = state.settings.orientation || 'auto';
    $('#set-rate').value = state.settings.rate || 1;
    $('#set-pitch').value = state.settings.pitch || 1.08;
    applySettings();
  }
  function saveSettings() {
    state.settings.voice = $('#set-voice').checked;
    state.settings.screen = $('#set-screen').checked;
    state.settings.motion = $('#set-motion').checked;
    state.settings.orientation = $('#set-orientation').value;
    state.settings.rate = parseFloat($('#set-rate').value);
    state.settings.pitch = parseFloat($('#set-pitch').value);
    state.settings.prompt = $('#prompt').value.trim() || defaultPrompt;
    const raw = JSON.stringify(state.settings);
    if (isNative) safeCall(() => native.saveSettings(raw)); else localStorage.setItem('lunatz.settings', raw);
    applySettings();
    log('Ajustes salvos.');
  }
  function applySettings() {
    document.body.classList.toggle('reduce-motion', !state.settings.motion);
    if (isNative) {
      safeCall(() => native.setOrientation(state.settings.orientation));
      safeCall(() => native.keepScreenOn(state.settings.screen));
      safeCall(() => native.setVoice(state.settings.rate, state.settings.pitch));
    }
  }

  function loadHistory() {
    const raw = isNative ? safeCall(() => native.getHistory(), '[]') : localStorage.getItem('lunatz.history') || '[]';
    state.history = parseJson(raw, []);
    renderHistory();
    state.history.slice(-30).forEach(m => addMessage(m.role, m.text, false));
  }
  function saveHistory() {
    const raw = JSON.stringify(state.history.slice(-200));
    if (isNative) safeCall(() => native.saveHistory(raw)); else localStorage.setItem('lunatz.history', raw);
    renderHistory();
  }
  function renderHistory() {
    const box = $('#history-list');
    box.innerHTML = '';
    if (!state.history.length) { box.innerHTML = '<div class="card note">Sem histórico ainda.</div>'; return; }
    state.history.slice().reverse().forEach(m => {
      const div = document.createElement('div');
      div.className = 'card file-item';
      div.innerHTML = '<div><b>' + (m.role === 'user' ? 'Você' : 'Luna') + '</b><small>' + escapeHtml(m.text) + '</small></div><small>' + new Date(m.t).toLocaleString() + '</small>';
      box.appendChild(div);
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function loadFiles() {
    const raw = isNative ? safeCall(() => native.getFilesManifest(), '[]') : localStorage.getItem('lunatz.files') || '[]';
    state.files = parseJson(raw, []);
    renderFiles();
    const brainRaw = isNative ? safeCall(() => native.readBrain(), '{}') : localStorage.getItem('lunatz.brain') || '{}';
    state.brain = parseJson(brainRaw, null);
  }
  function renderFiles() {
    const expected = ['LunaTz.gguf', 'Luna_Voice.pth', 'LunaTz_Brain.json', 'luna_skin.png', 'voz_luna.mp3'];
    const box = $('#files-list');
    box.innerHTML = '';
    expected.forEach(name => {
      const f = state.files.find(x => x.name === name);
      const div = document.createElement('div');
      div.className = 'card file-item';
      const status = f ? f.status || 'importado' : 'não importado';
      const cls = f ? 'ok' : 'warn';
      div.innerHTML = '<div><b>' + escapeHtml(name) + '</b><small>' + (f ? humanSize(f.size) + ' · ' : '') + '<span class="' + cls + '">' + escapeHtml(status) + '</span></small></div>';
      box.appendChild(div);
    });
    const extras = state.files.filter(f => !expected.includes(f.name));
    extras.forEach(f => {
      const div = document.createElement('div');
      div.className = 'card file-item';
      div.innerHTML = '<div><b>' + escapeHtml(f.name) + '</b><small>' + humanSize(f.size) + ' · ' + escapeHtml(f.status || f.kind || '') + '</small></div>';
      box.appendChild(div);
    });
  }
  function humanSize(n) { if (!n && n !== 0) return ''; if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB'; if (n > 1024) return (n / 1024).toFixed(1) + ' KB'; return n + ' B'; }

  function addMessage(role, text, save) {
    const div = document.createElement('div');
    div.className = 'msg ' + role;
    div.innerHTML = escapeHtml(text) + '<small>' + (role === 'user' ? 'você' : 'Luna') + ' · ' + new Date().toLocaleTimeString() + '</small>';
    $('#messages').appendChild(div);
    $('#messages').scrollTop = $('#messages').scrollHeight;
    if (save !== false) {
      state.history.push({ role, text, t: Date.now() });
      saveHistory();
    }
  }
  function lunaSay(text, speak) {
    addMessage('luna', text);
    $('#home-speech').textContent = text;
    if (state.settings.voice && speak !== false) {
      if (isNative) safeCall(() => native.speak(text));
      else if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(text); u.lang = 'pt-BR'; speechSynthesis.speak(u); }
    }
  }
  function answer(input) {
    const t = input.toLowerCase();
    const filesOk = state.files.some(f => f.name === 'LunaTz.gguf' && /válido/i.test(f.status || ''));
    if (/encerrar vídeo|despedida|tchau/.test(t)) return pick([
      'Bora fechar por hoje, gente! Se curtiu, deixa o like e acompanha o Tapazaki. Eu volto no próximo… se ele não me prender numa caverna de novo.',
      'Valeu por jogar com a gente! Comenta o próximo addon. Eu vou cobrar, hein. Tchau!'
    ]);
    if (/status/.test(t)) return 'Tô pronta por aqui. ' + (filesOk ? 'Detectei um GGUF válido. ' : 'Ainda não validei o GGUF. ') + 'Este build usa voz do sistema e respostas locais de teste; o módulo Bedrock autônomo ainda não está conectado.';
    if (/addon/.test(t)) return 'Addons de textura e animação geralmente aparecem no jogador. Addons com itens, chefes e regras novas precisam de conhecimento e adaptadores. Não vou fingir que sei tudo: a gente testa e aprende.';
    if (/gravação|gravar/.test(t)) return 'Modo gravação armado. Vou falar menos, reagir nos momentos bons e deixar o encerramento comigo quando você pedir.';
    if (/minecraft|bedrock|mundo/.test(t)) return 'Abre seu mundo, deixa o multiplayer/LAN ativo e testa a porta na aba Minecraft. Se 19132 não responder, tenta 19332. Por enquanto eu faço o diagnóstico; entrar e andar vem com o cliente Bedrock completo.';
    if (/oi|olá|boa noite|bom dia/.test(t)) return pick(['Oi, Tapazaki! Bora fazer caos organizado?', 'Boa noite! Tô aqui. Qual é a missão de hoje?', 'Caraca, você chegou. Bora jogar?']);
    if (/nome|quem é você/.test(t)) return 'Sou Luna, sua companheira virtual de gameplay. Tapazaki & Assistente estão construindo meu motor com carinho.';
    return pick([
      'Entendi. Vamos por partes: primeiro garantir conexão e arquivos, depois autonomia. Sem pressa e sem inventar moda.',
      'Boa. Eu gosto desse plano. Só não vou prometer magia antes de testar no seu Moto g06.',
      'Tamo junto. Se der ruim, a gente lê o console, ajusta e tenta de novo.'
    ]);
  }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function sendChat(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    addMessage('user', clean);
    setTimeout(() => lunaSay(answer(clean)), 250);
  }

  function go(page) {
    if (!pages[page]) return;
    state.page = page;
    $$('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
    $('#page-title').textContent = pages[page][0];
    $('#page-sub').textContent = pages[page][1];
    closeDrawer();
    if (page === 'files') loadFiles();
    if (page === 'history') renderHistory();
  }
  function openDrawer() { $('#drawer').classList.add('open'); $('#scrim').classList.add('show'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#scrim').classList.remove('show'); }

  function buildNav() {
    const nav = $('#nav');
    Object.keys(pages).forEach(key => {
      const b = document.createElement('button');
      b.className = 'nav-item';
      b.dataset.page = key;
      b.innerHTML = '<span>' + navIcons[key] + '</span><span>' + pages[key][0] + '</span>';
      b.onclick = () => go(key);
      nav.appendChild(b);
    });
  }

  window.LunaNativeEvents = {
    dispatch(event, data) {
      if (event === 'onFolderPicked') {
        if (data.ok) { state.files = data.files || []; localStorage.setItem('lunatz.files', JSON.stringify(state.files)); renderFiles(); log('Pasta importada: ' + state.files.length + ' arquivo(s).'); }
        else log('Importação cancelada/falhou: ' + (data.error || ''), 'warn');
      } else if (event === 'onSpeechResult') {
        if (data.text) sendChat(data.text);
      } else if (event === 'onSpeechPartial') {
        $('#chat-input').value = data.text || '';
      } else if (event === 'onListening') {
        state.listening = !!data.listening;
        $('#btn-mic').classList.toggle('listening', state.listening);
      } else if (event === 'onSpeaking') {
        state.speaking = !!data.speaking;
        document.body.classList.toggle('speaking', state.speaking);
      } else if (event === 'onSpeechError') {
        log('Voz: ' + data.error, 'warn');
      } else if (event === 'onBedrockPing') {
        const box = $('#mc-result');
        if (data.ok) { box.textContent = 'PONG OK · ' + data.latencyMs + ' ms\n' + data.motd; box.className = 'result ok'; log('Bedrock respondeu: ' + data.motd); }
        else { box.textContent = 'Sem pong: ' + data.error + '\nTente outra porta ou abra o mundo em LAN.'; box.className = 'result bad'; log('Bedrock sem resposta: ' + data.error, 'warn'); }
      } else if (event === 'onSample') {
        log(data.ok ? 'Amostra: ' + (data.playing ? 'tocando' : 'fim') : 'Amostra falhou: ' + data.error, data.ok ? 'info' : 'warn');
      } else if (event === 'onTtsReady') {
        log('TTS ' + (data.ready ? 'pronto' : 'indisponível'), data.ready ? 'info' : 'warn');
      } else if (event === 'onLog') {
        log(data.message, data.level);
      }
    }
  };

  function bind() {
    $('#btn-menu').onclick = openDrawer;
    $('#scrim').onclick = closeDrawer;
    $('#btn-console').onclick = () => $('#console').classList.toggle('collapsed');
    $('#console-toggle').onclick = () => $('#console').classList.toggle('collapsed');
    $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    $('#chat-form').onsubmit = e => { e.preventDefault(); const i = $('#chat-input'); sendChat(i.value); i.value = ''; };
    $('#btn-mic').onclick = () => {
      if (isNative) { if (state.listening) native.stopListening(); else native.startListening(); }
      else log('Microfone nativo só está disponível no APK.', 'warn');
    };
    $$('[data-say]').forEach(b => b.onclick = () => sendChat(b.dataset.say));
    $('#btn-pick-folder').onclick = () => { if (isNative) native.pickLunaFolder(); else log('Seleção de pasta só está disponível no APK.', 'warn'); };
    $('#btn-refresh-files').onclick = loadFiles;
    $('#btn-play-sample').onclick = () => { if (isNative) native.playReferenceSample(); else log('Amostra só está disponível no APK.', 'warn'); };
    $('#btn-ping').onclick = () => {
      const host = $('#mc-host').value.trim() || '127.0.0.1';
      const port = parseInt($('#mc-port').value, 10) || 19132;
      $('#mc-result').textContent = 'Enviando ping RakNet para ' + host + ':' + port + '...';
      if (isNative) native.pingBedrock(host, port);
      else setTimeout(() => window.LunaNativeEvents.dispatch('onBedrockPing', { ok: false, error: 'preview sem UDP nativo' }), 400);
    };
    $('#btn-launch-mc').onclick = () => { if (isNative) native.launchMinecraft(); else log('Abrir Minecraft só está disponível no APK.', 'warn'); };
    $('#btn-save-prompt').onclick = saveSettings;
    $$('[data-preset]').forEach(b => b.onclick = () => { $('#prompt').value = presets[b.dataset.preset] || defaultPrompt; });
    $('#btn-save-settings').onclick = saveSettings;
    $('#btn-clear-history').onclick = () => { state.history = []; saveHistory(); $('#messages').innerHTML = ''; if (isNative) safeCall(() => native.clearHistory()); else localStorage.removeItem('lunatz.history'); log('Histórico limpo.'); };
    window.LunaUI = { back() { if ($('#drawer').classList.contains('open')) { closeDrawer(); return true; } if (state.page !== 'home') { go('home'); return true; } return false; } };
  }

  buildNav();
  bind();
  loadSettings();
  loadHistory();
  loadFiles();
  go('home');
  log(isNative ? 'APK nativo iniciado.' : 'Preview web iniciado (sem ponte nativa).');
  if (!state.history.length) lunaSay('Boa noite, Tapazaki. Eu sou a Luna. Este é o primeiro build de teste: vamos validar arquivos, voz e conexão antes de eu entrar no mundo.', false);
})();
