(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const stage = document.querySelector(".game-stage");
  const welcome = document.querySelector("#welcomeScreen");
  const pauseScreen = document.querySelector("#pauseScreen");
  const resultScreen = document.querySelector("#resultScreen");
  const seedLabel = document.querySelector("#seedCount");
  const timerLabel = document.querySelector("#timer");
  const livesLabel = document.querySelector("#lives");
  const progressFill = document.querySelector("#progressFill");
  const pauseButton = document.querySelector("#pauseButton");
  const toast = document.querySelector("#gameToast");
  const BEST_KEY = "jardim-estelar-best-v1";
  const GOAL = 12;
  const TAU = Math.PI * 2;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let state = "ready";
  let lastFrame = 0;
  let elapsed = 0;
  let remaining = 60;
  let collected = 0;
  let lives = 3;
  let invincible = 0;
  let soundOn = false;
  let audioContext = null;
  let toastTimer = 0;
  let particles = [];
  let seeds = [];
  let moths = [];
  let stars = [];
  const keys = new Set();
  const pointer = { active: false, x: 0 };
  const player = { x: 0, y: 0, radius: 22, speed: 350, targetX: 0 };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const bestScore = () => Number(localStorage.getItem(BEST_KEY) || 0);
  document.querySelector("#bestScore").textContent = `${bestScore()} sementes`;

  function resize() {
    const rect = stage.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    player.y = height - Math.max(80, height * 0.13);
    player.x = clamp(player.x || width / 2, 30, width - 30);
    player.targetX = player.x;
    stars = Array.from({ length: Math.round(width * height / 8500) }, () => ({ x: random(0, width), y: random(0, height), size: random(.5, 1.8), phase: random(0, TAU) }));
  }
  window.addEventListener("resize", resize);
  resize();

  function makeSeed(y = random(-height * .8, -24)) {
    return { x: random(30, width - 30), y, r: random(7, 10), speed: random(70, 125), phase: random(0, TAU), drift: random(-18, 18), glow: random(0, TAU) };
  }
  function makeMoth(y = random(0, height * .64)) {
    const direction = Math.random() < .5 ? 1 : -1;
    return { x: random(36, width - 36), y, r: random(15, 20), speed: random(65, 105) * direction, phase: random(0, TAU), flap: random(0, TAU) };
  }
  function startGame() {
    collected = 0; lives = 3; elapsed = 0; remaining = 60; invincible = 0;
    player.x = width / 2; player.targetX = player.x; player.y = height - Math.max(80, height * .13);
    seeds = Array.from({ length: 7 }, (_, i) => makeSeed(-i * (height / 7) - random(0, 55)));
    moths = Array.from({ length: 3 }, (_, i) => makeMoth(height * (.2 + i * .2)));
    particles = [];
    welcome.hidden = true; pauseScreen.hidden = true; resultScreen.hidden = true;
    document.querySelector("#stageCaption").classList.add("is-playing");
    pauseButton.disabled = false;
    state = "playing";
    updateHud();
    lastFrame = performance.now();
  }
  function updateHud() {
    seedLabel.textContent = collected;
    timerLabel.textContent = Math.ceil(remaining);
    timerLabel.classList.toggle("urgent", remaining <= 10);
    livesLabel.textContent = `${"♥ ".repeat(lives).trim()}${lives < 3 ? ` ${"♡ ".repeat(3 - lives).trim()}` : ""}`;
    livesLabel.setAttribute("aria-label", `${lives} ${lives === 1 ? "vida" : "vidas"}`);
    progressFill.style.width = `${(collected / GOAL) * 100}%`;
  }
  function pauseGame() {
    if (state !== "playing") return;
    state = "paused"; pauseScreen.hidden = false; pauseButton.setAttribute("aria-label", "Continuar jogo");
  }
  function resumeGame() {
    if (state !== "paused") return;
    state = "playing"; pauseScreen.hidden = true; pauseButton.setAttribute("aria-label", "Pausar jogo"); lastFrame = performance.now();
  }
  function finishGame(won) {
    state = "result";
    const record = Math.max(bestScore(), collected);
    localStorage.setItem(BEST_KEY, String(record));
    document.querySelector("#resultKicker").textContent = won ? "MISSÃO CUMPRIDA" : "A NOITE CONTINUA";
    document.querySelector("#resultStar").textContent = won ? "✦" : "☾";
    document.querySelector("#resultTitle").textContent = won ? "O jardim floresceu!" : "Quase, guardiã.";
    document.querySelector("#resultMessage").textContent = won ? "A noite ficou mais bonita com você." : collected ? "As estrelas ainda precisam de algumas sementes." : "As sementes esperam por uma nova tentativa.";
    document.querySelector("#finalSeeds").textContent = collected;
    document.querySelector("#finalTime").textContent = `${Math.ceil(remaining)}s`;
    document.querySelector("#finalBest").textContent = record;
    resultScreen.hidden = false; pauseScreen.hidden = true; pauseButton.disabled = true;
    document.querySelector("#bestScore").textContent = `${record} sementes`;
    document.querySelector("#stageCaption").classList.remove("is-playing");
    burst(player.x, player.y, won ? "#ffe18a" : "#b3a5db", 24);
  }
  function announce(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 1200);
  }
  function beep(frequency = 660, duration = .09) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.055, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + duration);
    } catch { /* Audio is an optional enhancement. */ }
  }
  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU); const speed = random(35, 155);
      particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: random(.35, .85), maxLife: .85, size: random(2, 5), color });
    }
  }
  function step(dt) {
    if (state !== "playing") return;
    elapsed += dt; remaining = Math.max(0, 60 - elapsed); invincible = Math.max(0, invincible - dt);
    let direction = (keys.has("ArrowRight") || keys.has("d") || keys.has("D") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") || keys.has("A") ? 1 : 0);
    if (direction) player.x += direction * player.speed * dt;
    else if (pointer.active) player.x += (pointer.x - player.x) * Math.min(1, dt * 12);
    player.x = clamp(player.x, 28, width - 28); player.y = height - Math.max(80, height * .13);

    for (const seed of seeds) {
      seed.y += seed.speed * dt; seed.x += Math.sin(elapsed * 1.5 + seed.phase) * seed.drift * dt;
      if (seed.y > height + 18) Object.assign(seed, makeSeed(-random(24, height * .32)));
      if (Math.hypot(seed.x - player.x, seed.y - player.y) < seed.r + player.radius) {
        collected++; burst(seed.x, seed.y, "#ffe18a", 12); beep(620 + collected * 28, .12);
        Object.assign(seed, makeSeed(-random(30, height * .35)));
        updateHud();
        if (collected >= GOAL) { finishGame(true); break; }
      }
    }
    for (const moth of moths) {
      moth.x += moth.speed * dt; moth.y += Math.sin(elapsed * 1.4 + moth.phase) * 22 * dt;
      if (moth.x < moth.r + 10 || moth.x > width - moth.r - 10) moth.speed *= -1;
      moth.y = clamp(moth.y, 65, height - 90);
      if (!invincible && Math.hypot(moth.x - player.x, moth.y - player.y) < moth.r + player.radius - 6) {
        lives--; invincible = 1.35; burst(player.x, player.y, "#d7a2e8", 18); beep(180, .2); updateHud();
        announce(lives ? "A mariposa apagou um pouquinho da luz!" : "A luz da Luna se apagou...");
        if (!lives) { finishGame(false); break; }
      }
    }
    for (const particle of particles) {
      particle.x += particle.vx * dt; particle.y += particle.vy * dt; particle.vy += 45 * dt; particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    if (Math.floor(elapsed / 16) > Math.floor((elapsed - dt) / 16) && moths.length < 5) moths.push(makeMoth(70));
    updateHud();
    if (remaining <= 0 && state === "playing") finishGame(false);
  }

  function drawBackground(time) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#111b36"); sky.addColorStop(.52, "#202b48"); sky.addColorStop(1, "#30334d");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .73, height * .2, 5, width * .73, height * .2, Math.max(width, height) * .55);
    glow.addColorStop(0, "rgba(113,119,178,.25)"); glow.addColorStop(1, "rgba(113,119,178,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    for (const star of stars) {
      const alpha = .35 + (Math.sin(time * .0014 + star.phase) + 1) * .28;
      ctx.globalAlpha = alpha; ctx.fillStyle = "#fff0c4"; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const moonX = width * .78, moonY = height * .18;
    ctx.fillStyle = "rgba(255,230,174,.1)"; ctx.beginPath(); ctx.arc(moonX, moonY, 42, 0, TAU); ctx.fill();
    ctx.fillStyle = "#f6e5bb"; ctx.beginPath(); ctx.arc(moonX, moonY, 22, 0, TAU); ctx.fill();
    ctx.fillStyle = "#17213b"; ctx.beginPath(); ctx.arc(moonX + 10, moonY - 7, 20, 0, TAU); ctx.fill();
    drawHill(height * .77, "#273149", .16, time); drawHill(height * .86, "#252b40", .1, time + 900);
    const floor = ctx.createLinearGradient(0, height * .83, 0, height);
    floor.addColorStop(0, "rgba(42,55,61,.05)"); floor.addColorStop(1, "rgba(16,28,34,.78)");
    ctx.fillStyle = floor; ctx.fillRect(0, height * .82, width, height * .18);
    drawFlowers(time);
  }
  function drawHill(base, color, amplitude, time) {
    ctx.beginPath(); ctx.moveTo(0, height);
    for (let x = 0; x <= width + 10; x += 10) {
      const y = base + Math.sin(x * .008 + time * .00012) * height * amplitude * .18 + Math.sin(x * .018 + 1.6) * height * amplitude * .07;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }
  function drawFlowers(time) {
    const spacing = Math.max(42, width / 18);
    for (let x = 15; x < width; x += spacing) {
      const h = 22 + (Math.sin(x * .47) + 1) * 15;
      const y = height - 6;
      ctx.strokeStyle = "rgba(130,167,135,.4)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(time * .001 + x) * 4, y - h / 2, x, y - h); ctx.stroke();
      ctx.fillStyle = x % 2 < 1 ? "rgba(238,181,189,.75)" : "rgba(239,211,144,.78)";
      for (let p = 0; p < 5; p++) { const a = p * TAU / 5; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y - h + Math.sin(a) * 4, 3.2, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#f6e4a6"; ctx.beginPath(); ctx.arc(x, y - h, 2.4, 0, TAU); ctx.fill();
    }
  }

  function drawSeed(seed, time) {
    const pulse = 1 + Math.sin(time * .004 + seed.glow) * .12;
    ctx.save(); ctx.translate(seed.x, seed.y); ctx.rotate(Math.sin(time * .0017 + seed.phase) * .18); ctx.scale(pulse, pulse);
    ctx.shadowColor = "rgba(255,221,130,.85)"; ctx.shadowBlur = 18;
    ctx.fillStyle = "#ffe39a"; ctx.beginPath(); ctx.moveTo(0, -seed.r); ctx.quadraticCurveTo(seed.r * 1.15, -seed.r * .15, 0, seed.r); ctx.quadraticCurveTo(-seed.r * 1.15, -seed.r * .15, 0, -seed.r); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,.82)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, seed.r * .45); ctx.quadraticCurveTo(2, 0, 0, -seed.r * .6); ctx.stroke();
    ctx.restore();
  }
  function drawMoth(moth, time) {
    ctx.save(); ctx.translate(moth.x, moth.y); ctx.rotate(Math.sin(time * .002 + moth.phase) * .08);
    const flap = Math.sin(time * .015 + moth.flap) * .45;
    ctx.shadowColor = "rgba(20,14,39,.7)"; ctx.shadowBlur = 16;
    ctx.fillStyle = "#82769c";
    ctx.save(); ctx.rotate(-.25 - flap); ctx.beginPath(); ctx.ellipse(-moth.r * .7, -3, moth.r * .78, moth.r * .42, -.35, 0, TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.rotate(.25 + flap); ctx.beginPath(); ctx.ellipse(moth.r * .7, -3, moth.r * .78, moth.r * .42, .35, 0, TAU); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#554e72"; ctx.beginPath(); ctx.ellipse(0, 2, 5, moth.r * .63, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(220,205,238,.64)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2, -moth.r * .38); ctx.quadraticCurveTo(-10, -moth.r * .9, -11, -moth.r * .82); ctx.moveTo(2, -moth.r * .38); ctx.quadraticCurveTo(10, -moth.r * .9, 11, -moth.r * .82); ctx.stroke();
    ctx.restore();
  }
  function drawPlayer(time) {
    const bob = Math.sin(time * .004) * 3;
    if (invincible > 0 && Math.floor(time / 90) % 2) return;
    ctx.save(); ctx.translate(player.x, player.y + bob);
    ctx.shadowColor = "rgba(176,218,255,.6)"; ctx.shadowBlur = 26;
    ctx.fillStyle = "rgba(212,233,255,.15)"; ctx.beginPath(); ctx.ellipse(0, 8, 28, 31, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    // Flowing hair and face
    ctx.fillStyle = "#75546b"; ctx.beginPath(); ctx.ellipse(0, -8, 20, 25, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#ffddce"; ctx.beginPath(); ctx.ellipse(0, -5, 14, 17, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#79566d"; ctx.beginPath(); ctx.moveTo(-14, -12); ctx.quadraticCurveTo(-11, -30, 7, -24); ctx.quadraticCurveTo(19, -20, 15, -3); ctx.quadraticCurveTo(8, -15, 1, -15); ctx.quadraticCurveTo(-6, -8, -15, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#91dff2"; ctx.beginPath(); ctx.ellipse(-5, -4, 2.4, 3.5, 0, 0, TAU); ctx.ellipse(5, -4, 2.4, 3.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#32405b"; ctx.beginPath(); ctx.arc(-5, -3, 1.1, 0, TAU); ctx.arc(5, -3, 1.1, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#c87882"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 2, 3, .15, Math.PI - .15); ctx.stroke();
    ctx.fillStyle = "#f4f1ff"; ctx.beginPath(); ctx.moveTo(-12, 12); ctx.quadraticCurveTo(0, 7, 12, 12); ctx.lineTo(17, 33); ctx.quadraticCurveTo(0, 40, -17, 33); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffdf8a"; ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(4, 19); ctx.lineTo(0, 24); ctx.lineTo(-4, 19); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "#ffddce"; ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-12, 18); ctx.lineTo(-19, 25); ctx.moveTo(12, 18); ctx.lineTo(19, 25); ctx.stroke();
    ctx.restore();
  }
  function render(time) {
    drawBackground(time);
    for (const seed of seeds) drawSeed(seed, time);
    for (const moth of moths) drawMoth(moth, time);
    if (state !== "ready") drawPlayer(time);
    for (const particle of particles) {
      ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function frame(time) {
    const dt = Math.min(.04, (time - (lastFrame || time)) / 1000);
    lastFrame = time;
    step(dt); render(time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.querySelector("#startButton").addEventListener("click", startGame);
  document.querySelector("#playAgainButton").addEventListener("click", startGame);
  document.querySelector("#restartPauseButton").addEventListener("click", startGame);
  document.querySelector("#resumeButton").addEventListener("click", resumeGame);
  document.querySelector("#homeButton").addEventListener("click", () => {
    state = "ready"; resultScreen.hidden = true; welcome.hidden = false; pauseButton.disabled = true;
  });
  pauseButton.addEventListener("click", () => state === "paused" ? resumeGame() : pauseGame());
  document.querySelector("#soundButton").addEventListener("click", (event) => {
    soundOn = !soundOn;
    document.querySelector("#soundIcon").textContent = soundOn ? "♫" : "♪";
    event.currentTarget.setAttribute("aria-label", soundOn ? "Desativar som" : "Ativar som");
    event.currentTarget.classList.toggle("is-on", soundOn);
    if (soundOn) beep(660, .16);
  });
  window.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
    keys.add(event.key);
    if ((event.key === "Escape" || event.key.toLowerCase() === "p") && !event.repeat) state === "playing" ? pauseGame() : resumeGame();
    if (event.key === "Enter" && state === "ready") startGame();
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key));
  window.addEventListener("blur", () => keys.clear());
  canvas.addEventListener("pointerdown", (event) => {
    if (state !== "playing") return;
    pointer.active = true; pointer.x = event.clientX - canvas.getBoundingClientRect().left;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointer.active) pointer.x = event.clientX - canvas.getBoundingClientRect().left;
  });
  const stopPointer = () => { pointer.active = false; };
  canvas.addEventListener("pointerup", stopPointer); canvas.addEventListener("pointercancel", stopPointer);
  document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") pauseGame(); });
})();
