(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const app = $("#app");
  const avatar = $("#avatar");
  const head = $("#avatar-head");
  const speechText = $("#speechText");
  const speechMeta = $("#speechMeta");
  const input = $("#input");
  const messages = $("#messages");
  const micBtn = $("#btnMic");
  const attachBtn = $("#btnAttach");
  const attachMenu = $("#attachMenu");
  const toastEl = $("#toast");
  const STORE_KEY = "luna.ui.v1";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const defaults = {
    theme: "dark",
    accent: "#64dcff",
    bg: "",
    animations: !prefersReduced,
    speak: true,
    voice: "",
    rate: 1,
    pitch: 1,
    apiEnabled: { "API local": true },
    localUrl: "http://127.0.0.1:11434"
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
        apiEnabled: { ...defaults.apiEnabled, ...(parsed.apiEnabled || {}) }
      };
    } catch {
      return { ...defaults };
    }
  }

  const state = loadState();
  const sessionKeys = Object.create(null);
  let camStream = null;
  let recognition = null;
  let listening = false;
  let toastTimer = 0;
  let replyTimer = 0;

  function saveState() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage can be unavailable in private mode */
    }
  }

  function toast(message, ms = 2800) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("show"), ms);
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
    const n = parseInt(full, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixWhite(hex, amount) {
    const { r, g, b } = hexToRgb(hex);
    const mix = (v) => Math.round(v + (255 - v) * amount);
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  }

  function applyAccent(hex) {
    const { r, g, b } = hexToRgb(hex);
    state.accent = hex;
    app.style.setProperty("--accent", hex);
    app.style.setProperty("--accent-strong", mixWhite(hex, 0.55));
    app.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.16)`);
    app.style.setProperty("--accent-line", `rgba(${r}, ${g}, ${b}, 0.38)`);
    $$(".accent").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.accent === hex);
    });
  }

  function applyTheme(theme) {
    state.theme = theme;
    app.dataset.theme = theme;
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#eef6fd" : "#050810";
    $$("[data-theme-set]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.themeSet === theme);
    });
  }

  function applyBackground(dataUrl) {
    state.bg = dataUrl || "";
    if (state.bg) {
      app.classList.add("has-bg");
      app.style.setProperty("--bg-image", `url("${state.bg}")`);
    } else {
      app.classList.remove("has-bg");
      app.style.removeProperty("--bg-image");
    }
  }

  function applyMotion() {
    app.classList.toggle("no-motion", !state.animations);
    const toggle = $("#toggleAnims");
    if (toggle) {
      toggle.classList.toggle("on", state.animations);
      toggle.setAttribute("aria-pressed", String(state.animations));
    }
    startStars();
  }

  function activeChip(view) {
    $$(".chip").forEach((chip) => chip.classList.toggle("active", chip.dataset.view === view));
  }

  /* ---------- speech bubble + transcript ---------- */

  function setSpeech(text, meta = "Luna · agora") {
    speechText.textContent = text;
    speechMeta.textContent = meta;
  }

  function setTyping() {
    speechText.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    speechMeta.textContent = "Luna · pensando";
  }

  function addMessage(role, text, imageUrl) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    const who = document.createElement("span");
    who.className = "msg-who";
    who.textContent = role === "luna" ? "Luna" : "Você";
    const p = document.createElement("p");
    p.textContent = text;
    wrap.append(who, p);
    if (imageUrl) {
      const img = document.createElement("img");
      img.src = imageUrl;
      img.alt = "Imagem enviada";
      img.className = "msg-image";
      wrap.append(img);
    }
    messages.append(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  /* ---------- voice output ---------- */

  function speak(text) {
    if (!state.speak || !("speechSynthesis" in window) || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";
    utterance.rate = Number(state.rate) || 1;
    utterance.pitch = Number(state.pitch) || 1;
    const voices = synth.getVoices();
    const chosen =
      voices.find((voice) => voice.voiceURI === state.voice) ||
      voices.find((voice) => /pt[-_]BR/i.test(voice.lang)) ||
      voices.find((voice) => /^pt/i.test(voice.lang));
    if (chosen) utterance.voice = chosen;
    utterance.onstart = () => avatar.classList.add("talking");
    utterance.onend = () => avatar.classList.remove("talking");
    utterance.onerror = () => avatar.classList.remove("talking");
    synth.speak(utterance);
  }

  function fillVoices() {
    const select = $("#voiceSelect");
    if (!select || !("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    while (select.options.length > 1) select.remove(1);
    voices
      .slice()
      .sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name))
      .forEach((voice) => {
        const option = document.createElement("option");
        option.value = voice.voiceURI;
        option.textContent = `${voice.name} · ${voice.lang}`;
        select.append(option);
      });
    select.value = state.voice || "";
    if (select.value !== (state.voice || "")) select.value = "";
  }

  /* ---------- camera ---------- */

  async function toggleCamera() {
    if (camStream) {
      stopCamera();
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Câmera indisponível neste navegador.");
      return;
    }
    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      const video = $("#cameraVideo");
      video.srcObject = camStream;
      $("#cameraPip").hidden = false;
      setSpeech("Estou te vendo, Marcos. Quando a câmera estiver ligada, meu avatar acompanha o seu rosto.", "câmera ativa");
      toast("Câmera ligada. Nada é enviado para fora do aparelho.");
    } catch {
      toast("Não consegui abrir a câmera. Confira a permissão do navegador.");
    }
  }

  function stopCamera() {
    if (camStream) {
      camStream.getTracks().forEach((track) => track.stop());
      camStream = null;
    }
    const video = $("#cameraVideo");
    if (video) video.srcObject = null;
    $("#cameraPip").hidden = true;
  }

  /* ---------- replies ---------- */

  const intros = [
    "Boa madrugada, Marcos. Sou a Luna. Fale comigo pelo microfone ou escreva abaixo.",
    "Bom dia, Marcos. Sou a Luna. Fale comigo pelo microfone ou escreva abaixo.",
    "Boa tarde, Marcos. Sou a Luna. Fale comigo pelo microfone ou escreva abaixo.",
    "Boa noite, Marcos. Sou a Luna. Fale comigo pelo microfone ou escreva abaixo."
  ];

  function replyFor(text) {
    const value = text.toLowerCase();
    if (/quem (é|e) você|seu nome|o que você é|se apresent/.test(value)) {
      return {
        text: "Sou a Luna. Minha interface e meu avatar já estão de pé, mas meu núcleo LunaTz ainda está em modo base. A meta é ser uma companheira que conversa, lembra e cria junto — no celular, online e offline.",
        meta: "Luna · identidade"
      };
    }
    if (/câmera|camera|me vê|me ve|selfie/.test(value)) {
      return {
        text: "Vou abrir a câmera frontal. No app final, eu uso o rosto para acompanhar você com a cabeça e os olhos, sem gravar nada sem permissão.",
        meta: "Luna · câmera",
        camera: true
      };
    }
    if (/estúdio|estudio|vídeo|video/.test(value)) {
      return {
        text: "Abrindo o Estúdio. Lá está desenhado o fluxo de vídeo longo: referências, primeira cena, último frame como base da próxima e montagem no final.",
        meta: "Luna · estúdio",
        studio: true
      };
    }
    if (/offline|internet|sem conexão|sem conexao/.test(value)) {
      return {
        text: "Meu desenho é offline-first: o essencial fica no aparelho e a internet só entra para o que pesa. Quando a conexão cai, a Luna continua respondendo com o núcleo local e sincroniza depois.",
        meta: "Luna · offline-first"
      };
    }
    if (/música|musica|beijo doce|toca|arquivo|foto/.test(value)) {
      return {
        text: "Ainda não tenho acesso à sua biblioteca nesta base. Quando o módulo de arquivos entrar, eu procuro, mostro um card do que achei e só reproduzo depois do seu sim.",
        meta: "Luna · arquivos"
      };
    }
    if (/memória|memoria|lembra|aprende/.test(value)) {
      return {
        text: "A memória será local, em /sdcard/DADOS DE LUNA. Cada conversa que você autorizar vira uma lembrança que pode ser revista ou apagada. Aprender não é sair rasgando a internet: é curadoria, memória e treino com qualidade.",
        meta: "Luna · memória"
      };
    }
    if (/voz|fala|clone|clonar/.test(value)) {
      return {
        text: "A voz desta base usa a síntese do sistema em pt-BR. O motor LunaTz Voice e a clonagem com consentimento são a próxima camada de áudio.",
        meta: "Luna · voz"
      };
    }
    if (/obrigad|valeu|te amo|linda|boa noite|bom dia|boa tarde/.test(value)) {
      return {
        text: "Estou aqui, Marcos. Ainda somos uma base, mas já é o começo da Luna de verdade. Quer desenhar a próxima peça comigo?",
        meta: "Luna · presença"
      };
    }
    return {
      text: "Anotei. Nesta base eu ainda não raciocino de verdade, mas a estrutura para memória, voz e Estúdio já está desenhada. Quer abrir o Estúdio ou ajustar a aparência?",
      meta: "Luna · modo base"
    };
  }

  function respond(text) {
    const reply = replyFor(text);
    setSpeech(reply.text, reply.meta);
    addMessage("luna", reply.text);
    speak(reply.text);
    if (reply.camera) toggleCamera();
    if (reply.studio) window.setTimeout(() => openOverlay("studioOverlay"), 450);
  }

  function send(text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    addMessage("user", clean);
    input.value = "";
    setTyping();
    clearTimeout(replyTimer);
    const delay = Math.min(1500, 650 + clean.length * 14);
    replyTimer = window.setTimeout(() => respond(clean), delay);
  }

  /* ---------- recognition ---------- */

  function toggleMic() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      toast("Reconhecimento de voz não disponível aqui. No app Android, o motor nativo entra neste ponto.");
      return;
    }
    if (listening) {
      recognition && recognition.stop();
      return;
    }
    recognition = new Recognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      listening = true;
      micBtn.classList.add("listening");
      setSpeech("Estou ouvindo...", "microfone ativo");
    };
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      input.value = transcript.trim();
    };
    recognition.onerror = () => {
      toast("Não consegui ouvir. Tente de novo ou escreva.");
    };
    recognition.onend = () => {
      listening = false;
      micBtn.classList.remove("listening");
      const value = input.value.trim();
      if (value) send(value);
      else setSpeech("Não ouvi nada. Pode falar de novo?", "microfone");
    };
    try {
      recognition.start();
    } catch {
      listening = false;
      micBtn.classList.remove("listening");
      toast("Microfone indisponível no momento.");
    }
  }

  /* ---------- fullscreen ---------- */

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("Tela cheia indisponível neste navegador.");
    }
  }

  /* ---------- overlays ---------- */

  function openOverlay(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.hidden = false;
    if (id === "studioOverlay") activeChip("studio");
    if (id === "memoryOverlay") activeChip("memory");
    if (id === "settingsSheet") activeChip("settings");
    const focusable = el.querySelector("button, input, select");
    if (focusable) window.setTimeout(() => focusable.focus({ preventScroll: true }), 60);
  }

  function closeOverlay(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
    if (id === "settingsSheet" || id === "studioOverlay" || id === "memoryOverlay") activeChip("chat");
  }

  function closeAll() {
    ["settingsSheet", "studioOverlay", "memoryOverlay"].forEach(closeOverlay);
    attachMenu.hidden = true;
    attachBtn.setAttribute("aria-expanded", "false");
  }

  /* ---------- background image ---------- */

  function handleBackground(file) {
    if (!file || !file.type.startsWith("image/")) {
      toast("Escolha um arquivo de imagem.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        try {
          localStorage.setItem("luna.probe", "1");
          localStorage.removeItem("luna.probe");
        } catch {
          /* ignore */
        }
        if (dataUrl.length > 3.6 * 1024 * 1024) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.6);
        }
        applyBackground(dataUrl);
        saveState();
        toast("Fundo atualizado.");
      };
      img.onerror = () => toast("Não consegui ler essa imagem.");
      img.src = String(reader.result || "");
    };
    reader.onerror = () => toast("Não consegui ler esse arquivo.");
    reader.readAsDataURL(file);
  }

  /* ---------- stars ---------- */

  const canvas = $("#stars");
  const ctx = canvas.getContext("2d");
  let stars = [];
  let starFrame = 0;
  let starWidth = 0;
  let starHeight = 0;
  let starDpr = 1;

  function buildStars() {
    const count = Math.round(Math.min(90, Math.max(34, starWidth / 18)));
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * starWidth,
      y: Math.random() * starHeight,
      r: 0.4 + Math.random() * 1.5,
      a: 0.15 + Math.random() * 0.55,
      v: 0.08 + Math.random() * 0.25,
      p: Math.random() * Math.PI * 2
    }));
  }

  function resizeStars() {
    starDpr = Math.min(window.devicePixelRatio || 1, 2);
    starWidth = window.innerWidth;
    starHeight = window.innerHeight;
    canvas.width = Math.round(starWidth * starDpr);
    canvas.height = Math.round(starHeight * starDpr);
    canvas.style.width = `${starWidth}px`;
    canvas.style.height = `${starHeight}px`;
    ctx.setTransform(starDpr, 0, 0, starDpr, 0, 0);
    buildStars();
  }

  function drawStars(time) {
    ctx.clearRect(0, 0, starWidth, starHeight);
    const t = (time || 0) / 1000;
    for (const star of stars) {
      const y = (star.y + t * star.v * 6) % starHeight;
      const twinkle = 0.65 + Math.sin(t * 1.4 + star.p) * 0.35;
      ctx.beginPath();
      ctx.arc(star.x, y, star.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190, 232, 255, ${(star.a * twinkle).toFixed(3)})`;
      ctx.fill();
    }
  }

  function starLoop(time) {
    drawStars(time);
    starFrame = window.requestAnimationFrame(starLoop);
  }

  function startStars() {
    window.cancelAnimationFrame(starFrame);
    starFrame = 0;
    if (!state.animations) {
      drawStars(0);
      return;
    }
    starFrame = window.requestAnimationFrame(starLoop);
  }

  /* ---------- head tracking ---------- */

  function trackHead(event) {
    if (!state.animations) return;
    const rect = avatar.getBoundingClientRect();
    if (!rect.width) return;
    const dx = Math.max(-1, Math.min(1, (event.clientX - (rect.left + rect.width / 2)) / rect.width));
    const dy = Math.max(-1, Math.min(1, (event.clientY - (rect.top + rect.height * 0.3)) / rect.height));
    head.style.transform = `translate(${(dx * 9).toFixed(1)}px, ${(dy * 5).toFixed(1)}px) rotate(${(dx * 7).toFixed(1)}deg)`;
  }

  function resetHead() {
    head.style.transform = "";
  }

  /* ---------- init ---------- */

  function applyStoredState() {
    applyTheme(state.theme);
    applyAccent(state.accent);
    applyBackground(state.bg);
    applyMotion();

    const speakToggle = $("#toggleSpeak");
    speakToggle.classList.toggle("on", state.speak);
    speakToggle.setAttribute("aria-pressed", String(state.speak));

    const rate = $("#rate");
    const pitch = $("#pitch");
    rate.value = String(state.rate);
    pitch.value = String(state.pitch);
    $("#rateValue").textContent = `${Number(state.rate).toFixed(1)}x`;
    $("#pitchValue").textContent = Number(state.pitch).toFixed(1);

    const localInput = $('.api-row.local input[type="url"]');
    if (localInput) localInput.value = state.localUrl;

    $$(".api-row").forEach((row) => {
      const name = $(".api-name", row)?.textContent?.trim() || "";
      const toggle = $(".switch", row);
      if (!toggle) return;
      const on = state.apiEnabled[name] === true;
      toggle.classList.toggle("on", on);
      toggle.setAttribute("aria-pressed", String(on));
    });
  }

  function initialGreeting() {
    const hour = new Date().getHours();
    const index = hour < 6 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3;
    const greeting = intros[index];
    setSpeech(greeting, "Luna · pronta");
    const first = messages.querySelector(".msg.luna p");
    if (first) first.textContent = greeting;
  }

  function updateClock() {
    const now = new Date();
    $("#clock").textContent = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  function bind() {
    $("#btnCamera").addEventListener("click", toggleCamera);
    $("#btnCameraClose").addEventListener("click", stopCamera);
    $("#btnFullscreen").addEventListener("click", toggleFullscreen);
    $("#btnFullscreen2").addEventListener("click", toggleFullscreen);
    $("#btnSettings").addEventListener("click", () => openOverlay("settingsSheet"));
    $("#btnSpeak").addEventListener("click", () => speak(speechText.textContent || ""));

    $("#composer").addEventListener("submit", (event) => {
      event.preventDefault();
      send(input.value);
    });

    micBtn.addEventListener("click", toggleMic);

    attachBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = attachMenu.hidden;
      attachMenu.hidden = !open;
      attachBtn.setAttribute("aria-expanded", String(open));
    });

    attachMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-attach]");
      if (!button) return;
      const kind = button.dataset.attach;
      attachMenu.hidden = true;
      attachBtn.setAttribute("aria-expanded", "false");
      if (kind === "image") $("#fileImage").click();
      else if (kind === "file") $("#fileAny").click();
      else if (kind === "camera") toggleCamera();
      else toast("A pasta /sdcard/DADOS DE LUNA entra com o módulo Android.");
    });

    $("#fileImage").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleAttachment(file, true);
      event.target.value = "";
    });

    $("#fileAny").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleAttachment(file, false);
      event.target.value = "";
    });

    $("#fileBg").addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleBackground(file);
      event.target.value = "";
    });

    $("#btnBgUpload").addEventListener("click", () => $("#fileBg").click());
    $("#btnBgReset").addEventListener("click", () => {
      applyBackground("");
      saveState();
      toast("Fundo removido.");
    });

    $$("[data-theme-set]").forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.themeSet);
        saveState();
      });
    });

    $$("[data-accent]").forEach((button) => {
      button.addEventListener("click", () => {
        applyAccent(button.dataset.accent);
        saveState();
      });
    });

    $("#toggleAnims").addEventListener("click", () => {
      state.animations = !state.animations;
      applyMotion();
      saveState();
    });

    $("#toggleSpeak").addEventListener("click", () => {
      state.speak = !state.speak;
      $("#toggleSpeak").classList.toggle("on", state.speak);
      $("#toggleSpeak").setAttribute("aria-pressed", String(state.speak));
      saveState();
    });

    $("#rate").addEventListener("input", (event) => {
      state.rate = Number(event.target.value);
      $("#rateValue").textContent = `${state.rate.toFixed(1)}x`;
      saveState();
    });

    $("#pitch").addEventListener("input", (event) => {
      state.pitch = Number(event.target.value);
      $("#pitchValue").textContent = state.pitch.toFixed(1);
      saveState();
    });

    $("#voiceSelect").addEventListener("change", (event) => {
      state.voice = event.target.value;
      saveState();
    });

    $("#btnTestVoice").addEventListener("click", () => {
      speak("Oi, Marcos. Esta é a voz da Luna nesta base. Ainda vou ganhar um motor próprio.");
    });

    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".tab").forEach((item) => {
          item.classList.toggle("active", item === tab);
          item.setAttribute("aria-selected", String(item === tab));
        });
        $$(".tab-panel").forEach((panel) => {
          panel.hidden = panel.dataset.panel !== tab.dataset.tab;
        });
      });
    });

    $$("[data-close]").forEach((button) => {
      button.addEventListener("click", () => closeOverlay(button.dataset.close));
    });

    $$(".api-row .switch").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const name = $(".api-name", toggle.closest(".api-row"))?.textContent?.trim() || "";
        const on = !toggle.classList.contains("on");
        toggle.classList.toggle("on", on);
        toggle.setAttribute("aria-pressed", String(on));
        state.apiEnabled[name] = on;
        saveState();
        toast(`${name} ${on ? "ativada" : "desativada"}.`);
      });
    });

    $$('.api-row input[data-key]').forEach((field) => {
      field.addEventListener("input", () => {
        sessionKeys[field.dataset.key] = field.value;
      });
    });

    const localInput = $('.api-row.local input[type="url"]');
    if (localInput) {
      localInput.addEventListener("input", () => {
        state.localUrl = localInput.value.trim();
        saveState();
      });
    }

    $$(".memory-settings .switch").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const on = !toggle.classList.contains("on");
        toggle.classList.toggle("on", on);
        toggle.setAttribute("aria-pressed", String(on));
        toast(on ? "Ativado para esta sessão." : "Desativado.");
      });
    });

    $$(".studio-card").forEach((card) => {
      card.addEventListener("click", () => {
        toast(`${card.dataset.module}: arquitetura desenhada, módulo entra na próxima fase.`);
      });
    });

    $$(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const view = chip.dataset.view;
        if (view === "chat") {
          closeAll();
          activeChip("chat");
          input.focus({ preventScroll: true });
        } else if (view === "studio") {
          closeOverlay("settingsSheet");
          closeOverlay("memoryOverlay");
          openOverlay("studioOverlay");
        } else if (view === "memory") {
          closeOverlay("settingsSheet");
          closeOverlay("studioOverlay");
          openOverlay("memoryOverlay");
        } else if (view === "settings") {
          closeOverlay("studioOverlay");
          closeOverlay("memoryOverlay");
          openOverlay("settingsSheet");
        }
      });
    });

    $$("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => send(button.dataset.prompt));
    });

    document.addEventListener("click", (event) => {
      if (!attachMenu.hidden && !event.target.closest(".attach-wrap")) {
        attachMenu.hidden = true;
        attachBtn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        const open = ["settingsSheet", "studioOverlay", "memoryOverlay"].find((id) => {
          const el = document.getElementById(id);
          return el && !el.hidden;
        });
        if (open) closeOverlay(open);
        else if (!attachMenu.hidden) {
          attachMenu.hidden = true;
          attachBtn.setAttribute("aria-expanded", "false");
        }
      }
    });

    window.addEventListener("pointermove", trackHead);
    document.addEventListener("pointerleave", resetHead);

    window.addEventListener("resize", () => {
      resizeStars();
      startStars();
    });

    if ("speechSynthesis" in window) {
      window.speechSynthesis.addEventListener("voiceschanged", fillVoices);
    }
  }

  function handleAttachment(file, isImage) {
    const size = file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    const kind = isImage ? "imagem" : "arquivo";
    addMessage("user", `Enviei uma ${kind}: ${file.name} (${size}).`);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => addMessage("luna", `Recebi a imagem ${file.name}. Nesta base eu só exibo; a leitura visual entra com o núcleo multimodal.`, String(reader.result || ""));
      reader.readAsDataURL(file);
    } else {
      addMessage("luna", `Recebi ${file.name}. A indexação de arquivos locais será ligada em /sdcard/DADOS DE LUNA.`);
    }
    setSpeech(isImage ? "Recebi sua imagem. Ainda não consigo interpretar, mas já consigo guardar o contexto." : "Recebi o arquivo. Vou tratá-lo quando a memória local estiver ativa.");
  }

  applyStoredState();
  initialGreeting();
  bind();
  fillVoices();
  updateClock();
  window.setInterval(updateClock, 20000);
  resizeStars();
  startStars();
})();
