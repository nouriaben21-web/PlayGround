'use strict';

/* ============================================================
   RIDGE RUNNER — a sunset motorcycle stunt game
   Vanilla canvas. No dependencies. Mobile + keyboard.
   ============================================================ */

(() => {
  // ---------------- helpers ----------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const fmt = (n) => Math.max(0, Math.floor(n)).toLocaleString('en-US');

  // ---------------- dom ----------------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = $('overlay');
  const screens = {
    start: $('screen-start'),
    over: $('screen-over'),
    pause: $('screen-pause'),
  };
  const el = {
    score: $('score'),
    distance: $('distance'),
    flips: $('flips'),
    best: $('best'),
    bestMenu: $('best-menu'),
    speedbar: $('speedbar'),
    toast: $('toast'),
    rScore: $('r-score'),
    rDist: $('r-dist'),
    rFlips: $('r-flips'),
    newBest: $('newbest'),
    mute: $('mute'),
    pause: $('pause'),
    gas: $('gas'),
    brake: $('brake'),
    play: $('play'),
    retry: $('retry'),
    resume: $('resume'),
  };

  // ---------------- constants ----------------
  const WHEELBASE = 96;
  const WHEEL_R = 21;
  const GRAVITY = 2000;
  const MAX_SPEED = 700;
  const STEP = 18;
  const START_X = 160;
  const STORAGE_BEST = 'ridgeRunner.best';
  const STORAGE_MUTE = 'ridgeRunner.muted';

  let W = 0;
  let H = 0;
  let DPR = 1;
  let PIXEL_RATIO = 1;
  let renderScale = 1;
  let BIKE_SCALE = 1;
  let backdrop = null;
  let backdropCtx = null;
  let groundGrad = null;
  let perfFrames = 0;
  let perfStart = 0;

  // ---------------- audio ----------------
  const audio = {
    ctx: null,
    master: null,
    engine: null,
    noiseBuffer: null,
    muted: false,

    load() {
      try {
        this.muted = localStorage.getItem(STORAGE_MUTE) === '1';
      } catch (e) {
        this.muted = false;
      }
    },

    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        const ac = new AC();
        this.ctx = ac;

        this.master = ac.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(ac.destination);

        const osc = ac.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        const filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;
        filter.Q.value = 2.5;
        const gain = ac.createGain();
        gain.gain.value = 0;
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);
        osc.start();

        const sub = ac.createOscillator();
        sub.type = 'triangle';
        sub.frequency.value = 28;
        const subGain = ac.createGain();
        subGain.gain.value = 0;
        sub.connect(subGain);
        subGain.connect(this.master);
        sub.start();

        this.engine = { osc, filter, gain, sub, subGain };

        const len = Math.floor(ac.sampleRate * 0.45);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buf;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    setEngine(speed, active) {
      if (!this.ctx || !this.engine) return;
      const t = this.ctx.currentTime;
      const n = clamp(Math.abs(speed) / MAX_SPEED, 0, 1);
      this.engine.osc.frequency.setTargetAtTime(46 + n * 132, t, 0.09);
      this.engine.sub.frequency.setTargetAtTime(23 + n * 34, t, 0.12);
      this.engine.filter.frequency.setTargetAtTime(220 + n * 1050, t, 0.1);
      this.engine.gain.gain.setTargetAtTime(active ? 0.055 + n * 0.075 : 0, t, 0.12);
      this.engine.subGain.gain.setTargetAtTime(active ? 0.03 + n * 0.04 : 0, t, 0.12);
    },

    blip(freq, dur, type = 'sine', vol = 0.2, slideTo = null) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime;
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(20, freq), t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    },

    noise(dur, vol, freq) {
      if (!this.ctx || !this.noiseBuffer) return;
      const ac = this.ctx;
      const t = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(freq, t);
      f.frequency.exponentialRampToValueAtTime(90, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    jump() {
      this.blip(260, 0.18, 'square', 0.09, 520);
    },
    land() {
      this.blip(110, 0.16, 'sine', 0.24, 48);
      this.noise(0.12, 0.1, 500);
    },
    crash() {
      this.noise(0.5, 0.34, 1800);
      this.blip(150, 0.4, 'sawtooth', 0.16, 38);
    },
    trick() {
      const notes = [523, 659, 784, 1046];
      notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.13), i * 75));
    },
  };

  audio.load();

  // ---------------- terrain ----------------
  class Terrain {
    constructor() {
      this.startX = -1800;
      this.step = STEP;
      this.ys = [];
      this.ramps = [];
      this.nextRamp = 1150;
      this.lastX = this.startX - this.step;
      this.extendTo(2000);
    }

    extendTo(x) {
      while (this.lastX < x) {
        this.lastX += this.step;
        const px = this.lastX;

        if (px > this.nextRamp) {
          const cx = px + 520 + Math.random() * 260;
          const amp = 105 + Math.random() * 90;
          const w = Math.max(95, amp * 0.78) * (0.9 + Math.random() * 0.2);
          this.ramps.push({ cx, amp, w });
          this.nextRamp = cx + 520 + Math.random() * 430;
        }

        const calm = smoothstep(150, 1050, px);
        let y = 0;
        y += calm * (52 * Math.sin(px * 0.00145 + 0.6) + 27 * Math.sin(px * 0.0037 + 2.1) + 10 * Math.sin(px * 0.0093 + 0.2));
        y += smoothstep(500, 1500, px) * 36 * Math.sin(px * 0.00051 + 2.6);

        for (let i = 0; i < this.ramps.length; i++) {
          const r = this.ramps[i];
          const d = (px - r.cx) / r.w;
          if (d > -2.7 && d < 2.7) y -= r.amp * Math.exp(-d * d);
        }

        this.ys.push(y);
      }
    }

    yAt(x) {
      this.extendTo(x + 1400);
      const f = (x - this.startX) / this.step;
      if (f <= 0) return this.ys[0];
      const i = Math.floor(f);
      if (i >= this.ys.length - 1) return this.ys[this.ys.length - 1];
      const t = f - i;
      return this.ys[i] * (1 - t) + this.ys[i + 1] * t;
    }

    slopeAt(x) {
      const d = 26;
      return Math.atan2(this.yAt(x + d) - this.yAt(x - d), d * 2);
    }
  }

  // ---------------- state ----------------
  let terrain = new Terrain();
  let state = 'menu';
  let time = 0;
  let last = 0;
  let best = 0;
  let particles = [];
  let streaks = [];
  let clouds = [];
  let dustAccum = 0;
  let shake = 0;
  let audioTick = 0;
  let hudCache = { score: -1, dist: -1, flips: -1, speed: -1 };
  let toastTimer = 0;
  let crashFlashTimer = 0;
  const telemetry = { launches: [], landings: [] };

  const cam = { x: 0, y: 0 };

  const bike = {
    x: START_X,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    angVel: 0,
    onGround: true,
    airRot: 0,
    spin: 0,
    airTime: 0,
    wheelSpin: 0,
    dead: false,
    deadTimer: 0,
  };

  let run = { distance: 0, trick: 0, air: 0, flips: 0, newBest: false };

  try {
    best = parseInt(localStorage.getItem(STORAGE_BEST) || '0', 10) || 0;
  } catch (e) {
    best = 0;
  }

  // ---------------- input ----------------
  const keyState = { gas: false, brake: false };
  const padState = { gas: false, brake: false };
  const gasOn = () => keyState.gas || padState.gas;
  const brakeOn = () => keyState.brake || padState.brake;

  function bindPad(node, key) {
    const press = (e) => {
      e.preventDefault();
      padState[key] = true;
      node.classList.add('active');
      try {
        node.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    };
    const release = (e) => {
      e.preventDefault();
      padState[key] = false;
      node.classList.remove('active');
    };
    node.addEventListener('pointerdown', press);
    node.addEventListener('pointerup', release);
    node.addEventListener('pointercancel', release);
    node.addEventListener('lostpointercapture', release);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindPad(el.gas, 'gas');
  bindPad(el.brake, 'brake');

  window.addEventListener('keydown', (e) => {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'ArrowRight' || c === 'ArrowUp' || c === 'ArrowDown' || c === 'Space' || c === 'Enter') {
      e.preventDefault();
    }
    if (c === 'ArrowRight' || c === 'KeyD' || c === 'ArrowUp') keyState.gas = true;
    if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowDown') keyState.brake = true;

    if (c === 'KeyP' || c === 'Escape') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    }
    if (c === 'KeyM') toggleMute();
    if (c === 'Space' || c === 'Enter') {
      if (state === 'menu' || state === 'over') startGame();
      else if (state === 'paused') resumeGame();
    }
  });

  window.addEventListener('keyup', (e) => {
    const c = e.code;
    if (c === 'ArrowRight' || c === 'KeyD' || c === 'ArrowUp') keyState.gas = false;
    if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowDown') keyState.brake = false;
  });

  function clearInputs() {
    keyState.gas = keyState.brake = false;
    padState.gas = padState.brake = false;
    el.gas.classList.remove('active');
    el.brake.classList.remove('active');
  }

  window.addEventListener('blur', () => {
    clearInputs();
    if (state === 'playing') pauseGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') pauseGame();
  });

  // ---------------- run lifecycle ----------------
  function resetRun() {
    terrain = new Terrain();
    bike.x = START_X;
    bike.y = terrain.yAt(bike.x) - WHEEL_R;
    bike.vx = 0;
    bike.vy = 0;
    bike.angle = terrain.slopeAt(bike.x);
    bike.angVel = 0;
    bike.onGround = true;
    bike.airRot = 0;
    bike.spin = 0;
    bike.airTime = 0;
    bike.wheelSpin = 0;
    bike.dead = false;
    bike.deadTimer = 0;
    run = { distance: 0, trick: 0, air: 0, flips: 0, newBest: false };
    particles = [];
    streaks = [];
    telemetry.launches.length = 0;
    telemetry.landings.length = 0;
    dustAccum = 0;
    shake = 0;
    cam.x = bike.x - W * 0.3;
    cam.y = bike.y - H * 0.6;
    hudCache = { score: -1, dist: -1, flips: -1, speed: -1 };
    updateHud(true);
  }

  function startGame() {
    clearInputs();
    resetRun();
    state = 'playing';
    document.body.dataset.state = 'playing';
    showScreen(null);
    audio.ensure();
    audio.setEngine(0, false);
    last = performance.now();
    accumulator = 0;
    perfFrames = 0;
    perfStart = performance.now();
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    document.body.dataset.state = 'paused';
    clearInputs();
    showScreen('pause');
    audio.setEngine(0, false);
    accumulator = 0;
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    document.body.dataset.state = 'playing';
    showScreen(null);
    last = performance.now();
    accumulator = 0;
    perfFrames = 0;
    perfStart = performance.now();
  }

  function gameOver() {
    if (state === 'over') return;
    state = 'over';
    clearInputs();
    document.body.dataset.state = 'over';
    const score = currentScore();
    if (score > best) {
      best = score;
      run.newBest = true;
      try {
        localStorage.setItem(STORAGE_BEST, String(best));
      } catch (e) {
        /* ignore */
      }
    } else {
      run.newBest = false;
    }
    el.rScore.textContent = fmt(score);
    el.rDist.textContent = fmt(run.distance) + ' m';
    el.rFlips.textContent = String(run.flips);
    el.newBest.classList.toggle('hidden', !run.newBest);
    el.bestMenu.textContent = fmt(best);
    updateHud(true);
    showScreen('over');
    audio.setEngine(0, false);
  }

  function showScreen(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('hidden', k !== name));
    overlay.classList.toggle('hidden', !name);
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    document.body.classList.toggle('muted', audio.muted);
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.5;
    el.mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
    el.mute.title = audio.muted ? 'Unmute sound' : 'Mute sound';
    try {
      localStorage.setItem(STORAGE_MUTE, audio.muted ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
  }

  function currentScore() {
    return Math.max(0, Math.floor(run.distance + run.trick + run.air));
  }

  // ---------------- hud ----------------
  function updateHud(force) {
    const dist = Math.max(0, Math.floor(run.distance));
    const score = currentScore();
    const flips = run.flips;

    if (force || hudCache.score !== score) {
      el.score.textContent = fmt(score);
      hudCache.score = score;
    }
    if (force || hudCache.dist !== dist) {
      el.distance.textContent = fmt(dist) + ' m';
      hudCache.dist = dist;
    }
    if (force || hudCache.flips !== flips) {
      el.flips.textContent = flips + (flips === 1 ? ' flip' : ' flips');
      hudCache.flips = flips;
    }

    const ratio = clamp(Math.abs(bike.vx) / MAX_SPEED, 0, 1);
    if (force || Math.abs(hudCache.speed - ratio) > 0.01) {
      el.speedbar.style.transform = 'scaleX(' + ratio.toFixed(3) + ')';
      hudCache.speed = ratio;
    }

    if (force) {
      el.best.textContent = fmt(best);
      el.bestMenu.textContent = fmt(best);
    }
  }

  function toast(text, warn) {
    el.toast.textContent = text;
    el.toast.classList.toggle('warn', !!warn);
    el.toast.classList.remove('show');
    void el.toast.offsetWidth;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1500);
  }

  // ---------------- particles ----------------
  function spawnDust(x, y, count, power) {
    const n = Math.min(30, Math.round(count));
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + rand(-10, 10),
        y: y + rand(-8, 4),
        vx: rand(-150, -30) - Math.max(0, bike.vx) * 0.12,
        vy: rand(-110, 20),
        life: rand(0.35, 0.9),
        max: 0.9,
        size: rand(2, 6.5) * power,
        color: '232,160,110',
        type: 'dust',
      });
    }
    if (particles.length > 420) particles.splice(0, particles.length - 420);
  }

  function spawnSparks(x, y, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x,
        y,
        vx: rand(-220, 220),
        vy: rand(-280, -40),
        life: rand(0.3, 0.75),
        max: 0.75,
        size: rand(1.5, 3.5),
        color: '255,200,87',
        type: 'spark',
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += (p.type === 'spark' ? 900 : 180) * dt;
      p.vx *= Math.exp(-(p.type === 'spark' ? 0.5 : 2.4) * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  function drawParticles(viewX, viewY, layer) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type !== layer) continue;
      const sx = p.x - viewX;
      const sy = p.y - viewY;
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
      const t = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = t * (p.type === 'spark' ? 0.95 : 0.42);
      ctx.fillStyle = 'rgb(' + p.color + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, p.size * (0.55 + 0.45 * t), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- streaks ----------------
  let streakAccum = 0;
  function updateStreaks(dt) {
    const speed = Math.abs(bike.vx);
    if (state === 'playing' && speed > 300) {
      streakAccum += dt * (speed - 250) * 0.045;
      while (streakAccum > 1) {
        streaks.push({
          x: W + rand(0, 120),
          y: rand(H * 0.08, H * 0.78),
          len: rand(18, 90),
          speed: speed * rand(0.9, 1.7),
          alpha: rand(0.04, 0.13),
        });
        streakAccum -= 1;
      }
    }
    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i];
      s.x -= (s.speed + 220) * dt;
      if (s.x + s.len < -20) streaks.splice(i, 1);
    }
    if (streaks.length > 80) streaks.splice(0, streaks.length - 80);
  }

  function drawStreaks() {
    ctx.lineCap = 'round';
    for (let i = 0; i < streaks.length; i++) {
      const s = streaks[i];
      ctx.strokeStyle = 'rgba(255,225,190,' + s.alpha + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + s.len, s.y);
      ctx.stroke();
    }
  }

  // ---------------- clouds ----------------
  function makeClouds() {
    clouds = [];
    for (let i = 0; i < 8; i++) {
      clouds.push({
        x: Math.random() * 1.3,
        y: 0.08 + Math.random() * 0.34,
        s: 0.45 + Math.random() * 1.1,
        v: 3 + Math.random() * 7,
        a: 0.04 + Math.random() * 0.07,
      });
    }
  }

  function updateClouds(dt) {
    for (const c of clouds) {
      c.x -= (c.v * dt) / Math.max(1, W);
      if (c.x < -0.2) {
        c.x = 1.2;
        c.y = 0.08 + Math.random() * 0.34;
      }
    }
  }

  // ---------------- physics ----------------
  function launch(groundVy) {
    bike.onGround = false;
    bike.vy = groundVy - 40;
    bike.angVel = 0;
    bike.airRot = 0;
    bike.spin = 0;
    bike.airTime = 0;
    telemetry.launches.push({ x: Math.round(bike.x), vx: Math.round(bike.vx), vy: Math.round(bike.vy), angle: +bike.angle.toFixed(2) });
    if (telemetry.launches.length > 40) telemetry.launches.shift();
    audio.jump();
    spawnDust(bike.x - 24, bike.y + WHEEL_R - 4, 9, 1);
  }

  function land(restY, slope, diff) {
    const impact = Math.abs(bike.vy);
    const rotation = Math.abs(bike.spin);
    const flips = Math.floor(rotation / (Math.PI * 1.15));

    bike.y = restY;
    bike.angle = slope;
    bike.vy = 0;
    bike.angVel = 0;
    bike.onGround = true;
    bike.vx *= 0.94;
    bike.airRot = 0;
    bike.spin = 0;
    bike.airTime = 0;
    telemetry.landings.push({ x: Math.round(bike.x), impact: Math.round(impact), diff: +diff.toFixed(2), rot: +rotation.toFixed(2) });
    if (telemetry.landings.length > 40) telemetry.landings.shift();

    shake = Math.min(0.7, impact / 1800);
    spawnDust(bike.x, bike.y + WHEEL_R, 8 + Math.min(18, impact / 70), 1);
    audio.land();

    if (flips > 0) {
      run.flips += flips;
      run.trick += 300 * flips;
      toast(flips > 1 ? flips + '\u00d7 FLIP!  +' + 300 * flips : 'FLIP!  +300');
      spawnSparks(bike.x, bike.y - 12, 14 + flips * 6);
      audio.trick();
      if (navigator.vibrate) navigator.vibrate(18);
    } else if (Math.abs(diff) < 0.12 && impact > 500) {
      shake = Math.min(0.5, impact / 2200);
    }
  }

  function crash() {
    if (bike.dead) return;
    bike.dead = true;
    bike.deadTimer = 1.15;
    bike.vy = Math.min(bike.vy, -280);
    bike.vx *= 0.42;
    bike.angVel = rand(4, 9) * (Math.random() < 0.5 ? -1 : 1);
    shake = 1;
    crashFlashTimer = 0.4;
    document.body.classList.add('crashed');
    audio.crash();
    spawnDust(bike.x, bike.y + WHEEL_R, 24, 1.4);
    spawnSparks(bike.x, bike.y, 12);
    if (navigator.vibrate) navigator.vibrate(90);
  }

  function updateCrash(dt) {
    bike.deadTimer -= dt;
    bike.vy += GRAVITY * 0.85 * dt;
    bike.x += bike.vx * dt;
    bike.y += bike.vy * dt;
    bike.angle = norm(bike.angle + bike.angVel * dt);
    bike.angVel *= Math.exp(-0.7 * dt);

    const gy = terrain.yAt(bike.x) - WHEEL_R * 0.4;
    if (bike.y > gy) {
      bike.y = gy;
      if (bike.vy > 160) spawnDust(bike.x, bike.y + 8, 6, 0.9);
      bike.vy *= -0.3;
      bike.vx *= 0.8;
      bike.angVel *= 0.72;
    }

    if (bike.deadTimer <= 0) gameOver();
  }

  function updateBike(dt) {
    const gas = gasOn();
    const brake = brakeOn();

    if (bike.onGround) {
      const slope = terrain.slopeAt(bike.x);
      let accel = 0;
      if (gas) accel += 920;
      if (brake) accel -= 1700;
      bike.vx += accel * dt;
      bike.vx += 720 * Math.sin(slope) * dt;
      bike.vx *= Math.exp(-0.72 * dt);
      bike.vx = clamp(bike.vx, -210, MAX_SPEED);

      const prevY = bike.y;
      const prevVy = bike.vy;
      bike.x += bike.vx * dt;

      const c = Math.cos(bike.angle) * WHEELBASE * 0.5;
      const xr = bike.x - c;
      const xf = bike.x + c;
      const yr = terrain.yAt(xr);
      const yf = terrain.yAt(xf);
      const gy = (yr + yf) * 0.5;
      const slopeNow = Math.atan2(yf - yr, Math.max(24, xf - xr));
      const restY = gy - WHEEL_R;
      const ballisticY = prevY + prevVy * dt + 0.5 * GRAVITY * dt * dt;

      if (restY > ballisticY + 0.6 && Math.abs(bike.vx) > 70) {
        launch(prevVy);
      } else {
        bike.y = restY;
        bike.vy = clamp((restY - prevY) / dt, -2400, 2400);
        bike.angle = norm(bike.angle + norm(slopeNow - bike.angle) * (1 - Math.exp(-16 * dt)));
        bike.wheelSpin += (bike.vx * dt) / WHEEL_R;

        if (Math.abs(bike.vx) > 90 && gas) {
          dustAccum += dt * Math.min(58, Math.abs(bike.vx) * 0.075);
          while (dustAccum > 1) {
            const rx = bike.x - Math.cos(bike.angle) * (WHEELBASE * 0.5);
            const ry = bike.y + Math.sin(bike.angle) * (WHEELBASE * 0.5) + WHEEL_R;
            spawnDust(rx, ry, 1, 0.8);
            dustAccum -= 1;
          }
        }
      }
    } else {
      bike.airTime += dt;
      bike.vy += GRAVITY * dt;
      bike.x += bike.vx * dt;
      bike.y += bike.vy * dt;

      let torque = 0;
      if (gas) {
        torque -= 18;
      } else if (brake) {
        torque += 18;
      } else {
        // landing assist: ease toward the slope below when hands are off
        const target = terrain.slopeAt(bike.x);
        const err = norm(target - bike.angle);
        torque = clamp(err * 28 - bike.angVel * 5, -30, 30);
      }
      bike.angVel = clamp(bike.angVel + torque * dt, -14, 14);
      bike.angVel *= Math.exp(-0.3 * dt);
      const dA = bike.angVel * dt;
      bike.angle = norm(bike.angle + dA);
      bike.airRot += dA;
      if (gas || brake) bike.spin += dA;
      bike.wheelSpin += ((bike.vx * dt) / WHEEL_R) * 0.6;

      let c = Math.cos(bike.angle) * WHEELBASE * 0.5;
      let gy = (terrain.yAt(bike.x - c) + terrain.yAt(bike.x + c)) * 0.5;
      let restY = gy - WHEEL_R;

      // close to touchdown with hands off: auto-correct toward the slope
      const clearance = restY - bike.y;
      if (!gas && !brake && bike.vy > 0 && clearance < 620) {
        const slope = terrain.slopeAt(bike.x);
        bike.angle = norm(bike.angle + norm(slope - bike.angle) * (1 - Math.exp(-10 * dt)));
        bike.angVel *= Math.exp(-10 * dt);
        c = Math.cos(bike.angle) * WHEELBASE * 0.5;
        gy = (terrain.yAt(bike.x - c) + terrain.yAt(bike.x + c)) * 0.5;
        restY = gy - WHEEL_R;
      }

      if (bike.y >= restY && bike.vy > 0) {
        const slope = terrain.slopeAt(bike.x);
        const diff = norm(bike.angle - slope);
        if (Math.abs(diff) > 1.25) crash();
        else land(restY, slope, diff);
      }
    }

    if (!bike.onGround) run.air += dt * 22;
    run.distance = Math.max(run.distance, (bike.x - START_X) / 12);
    updateHud(false);
  }

  function updateCamera(dt) {
    const targetX = bike.x - W * 0.3;
    const targetY = bike.y - H * 0.6;
    cam.x += (targetX - cam.x) * (1 - Math.exp(-9 * dt));
    cam.y += (targetY - cam.y) * (1 - Math.exp(-5.5 * dt));
    shake = Math.max(0, shake - dt * 2.2);
  }

  // ---------------- update ----------------
  function update(dt) {
    time += dt;

    if (state === 'playing') {
      if (bike.dead) updateCrash(dt);
      else updateBike(dt);
      updateCamera(dt);
      updateParticles(dt);
      updateStreaks(dt);
    } else if (state === 'menu') {
      bike.y = terrain.yAt(bike.x) - WHEEL_R + Math.sin(time * 2.1) * 1.3;
      bike.angle = terrain.slopeAt(bike.x) + Math.sin(time * 1.3) * 0.012;
      cam.x = bike.x - W * 0.18 + Math.sin(time * 0.42) * 10;
      cam.y = bike.y - H * 0.6;
      updateParticles(dt);
      updateStreaks(dt);
    } else if (state === 'over') {
      updateParticles(dt);
      updateStreaks(dt);
      updateCamera(dt);
    }

    if (state !== 'paused') updateClouds(dt);

    if (crashFlashTimer > 0) {
      crashFlashTimer -= dt;
      if (crashFlashTimer <= 0) document.body.classList.remove('crashed');
    }

    audioTick += dt;
    if (audioTick > 0.1) {
      audioTick = 0;
      const active = state === 'playing' && !bike.dead;
      audio.setEngine(active ? bike.vx : 0, active);
    }
  }

  // ---------------- rendering ----------------
  function drawSky(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f0822');
    g.addColorStop(0.34, '#2c123c');
    g.addColorStop(0.56, '#6a2750');
    g.addColorStop(0.72, '#c2465c');
    g.addColorStop(0.84, '#ff7a4d');
    g.addColorStop(1, '#ffc07a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  function drawSun(c) {
    const r = Math.min(W, H) * 0.072;
    const x = W * 0.73;
    const y = H * 0.33;

    const glow = c.createRadialGradient(x, y, r * 0.4, x, y, r * 4.2);
    glow.addColorStop(0, 'rgba(255, 190, 110, 0.38)');
    glow.addColorStop(0.4, 'rgba(255, 130, 80, 0.16)');
    glow.addColorStop(1, 'rgba(255, 100, 70, 0)');
    c.fillStyle = glow;
    c.fillRect(x - r * 4.2, y - r * 4.2, r * 8.4, r * 8.4);

    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fillStyle = '#ffe2a0';
    c.fill();
    c.clip();
    c.fillStyle = 'rgba(255, 122, 77, 0.3)';
    for (let i = 0; i < 4; i++) {
      const yy = y + r * 0.1 + i * r * 0.24;
      c.fillRect(x - r, yy, r * 2, r * (0.05 + i * 0.012));
    }
    c.restore();
  }

  function paintBackdrop() {
    if (!backdrop) {
      backdrop = document.createElement('canvas');
      backdropCtx = backdrop.getContext('2d', { alpha: false });
    }
    backdrop.width = Math.round(W * PIXEL_RATIO);
    backdrop.height = Math.round(H * PIXEL_RATIO);
    backdropCtx.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0);
    drawSky(backdropCtx);
    drawSun(backdropCtx);
  }

  function drawClouds() {
    for (const c of clouds) {
      const x = c.x * W;
      const y = c.y * H;
      const s = c.s * Math.min(W, H) * 0.11;
      ctx.fillStyle = 'rgba(255, 170, 140, ' + c.a + ')';
      ctx.beginPath();
      ctx.ellipse(x, y, s * 2.4, s * 0.42, 0, 0, TAU);
      ctx.ellipse(x + s * 1.1, y - s * 0.3, s * 1.2, s * 0.35, 0, 0, TAU);
      ctx.ellipse(x - s * 1.3, y - s * 0.12, s * 0.95, s * 0.3, 0, 0, TAU);
      ctx.fill();
    }
  }

  function ridge(viewX, factor, base, amp, color, seed, freq) {
    ctx.beginPath();
    ctx.moveTo(-20, H + 10);
    for (let sx = -20; sx <= W + 20; sx += 12) {
      const wx = (viewX * factor + sx) * 0.012;
      const y =
        base +
        Math.sin(wx * freq + seed) * amp +
        Math.sin(wx * freq * 2.6 + seed * 1.7) * amp * 0.18 +
        Math.sin(wx * freq * 0.47 + seed * 2.1) * amp * 0.55;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(W + 20, H + 10);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawMountains(viewX, viewY) {
    const drift = (viewY - bike.y + H * 0.6) * 0.04;
    ridge(viewX, 0.06, H * 0.68 + drift, H * 0.13, '#351a44', 1.7, 0.8);
    ridge(viewX, 0.14, H * 0.735 + drift, H * 0.1, '#472046', 4.3, 1.05);
    ridge(viewX, 0.28, H * 0.79 + drift, H * 0.072, '#5a2845', 8.9, 1.4);
  }

  function drawGround(viewX, viewY) {
    const pts = [];
    for (let sx = -30; sx <= W + 30; sx += 12) {
      const wx = viewX + sx;
      pts.push([sx, terrain.yAt(wx) - viewY]);
    }

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.lineTo(W + 30, H + 60);
    ctx.lineTo(-30, H + 60);
    ctx.closePath();
    ctx.fillStyle = groundGrad;
    ctx.fill();

    // warm rim light on the crest (no blur: cheaper on software renderers)
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = 'rgba(255, 120, 70, 0.16)';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 170, 110, 0.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // ground texture + tufts
    const start = Math.floor((viewX - 60) / 46) * 46;
    const end = viewX + W + 60;
    for (let wx = start; wx < end; wx += 46) {
      const n = hash(wx * 0.031);
      const gx = wx + (hash(wx * 0.07) - 0.5) * 34;
      const gy = terrain.yAt(gx) - viewY;

      if (gy < -20 || gy > H + 20) continue;

      if (n > 0.56) {
        const len = 4 + hash(wx * 0.13) * 8;
        ctx.strokeStyle = 'rgba(255, 150, 100, 0.2)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(gx - 2, gy + 1);
        ctx.lineTo(gx - 4, gy - len);
        ctx.moveTo(gx, gy + 1);
        ctx.lineTo(gx, gy - len * 1.15);
        ctx.moveTo(gx + 2, gy + 1);
        ctx.lineTo(gx + 4, gy - len * 0.8);
        ctx.stroke();
      } else if (n < 0.16) {
        ctx.fillStyle = 'rgba(255, 180, 130, 0.1)';
        ctx.beginPath();
        ctx.ellipse(gx, gy + 7, 4 + n * 20, 2.2, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawShadow(viewX, viewY) {
    const gy = terrain.yAt(bike.x) - viewY;
    const height = Math.max(0, gy - (bike.y - viewY + WHEEL_R));
    const alpha = clamp(0.4 - height / 900, 0.05, 0.4);
    const slope = terrain.slopeAt(bike.x);
    const sx = bike.x - viewX;

    ctx.save();
    ctx.translate(sx, gy + 2);
    ctx.rotate(slope);
    ctx.scale(1 + height / 800, 0.26);
    ctx.fillStyle = 'rgba(6, 2, 10, ' + alpha + ')';
    ctx.beginPath();
    ctx.arc(0, 0, 58 * BIKE_SCALE, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawWheel(x, spin) {
    ctx.save();
    ctx.translate(x, 0);

    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R, 0, TAU);
    ctx.fillStyle = '#150d18';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#09050c';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, WHEEL_R - 7, 0, TAU);
    ctx.strokeStyle = 'rgba(255, 178, 107, 0.9)';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.save();
    ctx.rotate(spin);
    ctx.strokeStyle = 'rgba(255, 220, 180, 0.5)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -(WHEEL_R - 9));
      ctx.stroke();
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, 3.4, 0, TAU);
    ctx.fillStyle = '#ffd9a0';
    ctx.fill();
    ctx.restore();
  }

  function line(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBike(viewX, viewY) {
    const sx = bike.x - viewX;
    const sy = bike.y - viewY;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(BIKE_SCALE, BIKE_SCALE);
    ctx.rotate(bike.angle);

    drawWheel(-WHEELBASE * 0.5, bike.wheelSpin);
    drawWheel(WHEELBASE * 0.5, bike.wheelSpin);

    // swingarm + shock
    line(-WHEELBASE * 0.5, 0, -10, -4, '#b98e6d', 5);
    line(-30, -3, -16, -22, '#6b4a5a', 3);

    // exhaust
    line(-8, 1, -45, 9, '#c9a27e', 4);
    line(-45, 9, -56, 7, '#8f6b5a', 5.5);

    // main body
    const bodyGrad = ctx.createLinearGradient(-30, -34, 24, -6);
    bodyGrad.addColorStop(0, '#ff8a4d');
    bodyGrad.addColorStop(0.55, '#f2502f');
    bodyGrad.addColorStop(1, '#b62a2b');
    ctx.beginPath();
    ctx.moveTo(-36, -16);
    ctx.quadraticCurveTo(-18, -35, 6, -33);
    ctx.lineTo(23, -26);
    ctx.quadraticCurveTo(7, -9, -14, -7);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // tank highlight
    ctx.beginPath();
    ctx.ellipse(5, -24, 15, 5.5, -0.16, 0, TAU);
    ctx.fillStyle = 'rgba(255, 228, 176, 0.3)';
    ctx.fill();

    // tail
    ctx.beginPath();
    ctx.moveTo(-46, -23);
    ctx.lineTo(-30, -21);
    ctx.lineTo(-30, -14);
    ctx.lineTo(-48, -16);
    ctx.closePath();
    ctx.fillStyle = '#d63a2e';
    ctx.fill();

    // seat
    ctx.fillStyle = '#2a1526';
    roundRect(-42, -29, 35, 9, 4);
    ctx.fill();

    // engine
    ctx.fillStyle = '#251426';
    ctx.strokeStyle = '#5b3444';
    ctx.lineWidth = 1.5;
    roundRect(-12, -12, 26, 19, 4);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 180, 130, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-7, -8);
    ctx.lineTo(-7, 3);
    ctx.moveTo(-2, -8);
    ctx.lineTo(-2, 3);
    ctx.moveTo(3, -8);
    ctx.lineTo(3, 3);
    ctx.stroke();

    // fork
    line(WHEELBASE * 0.5, 0, 30, -34, '#f0d2ac', 5);
    line(30, -34, 26, -39, '#c9a27e', 3);
    // handlebar
    line(26, -39, 40, -42, '#2a1526', 4);

    // headlight
    ctx.beginPath();
    ctx.arc(34, -30, 9, 0, TAU);
    ctx.fillStyle = 'rgba(255, 220, 140, 0.16)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(34, -30, 5, 0, TAU);
    ctx.fillStyle = '#ffe1a0';
    ctx.fill();

    // ---- rider ----
    const flutter = Math.sin(time * 13) * 2.4 + Math.min(9, Math.abs(bike.vx) * 0.012);
    ctx.beginPath();
    ctx.moveTo(8, -50);
    ctx.bezierCurveTo(-6, -50 + flutter, -20, -58 - flutter, -38, -52 + flutter);
    ctx.strokeStyle = 'rgba(255, 106, 61, 0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // leg
    line(-16, -28, -3, -16, '#1c1224', 8);
    line(-3, -16, -13, -6, '#1c1224', 6);
    // torso
    line(-13, -30, 7, -48, '#2b1630', 13);
    // jacket stripe
    line(-9, -33, 4, -45, '#ff6a3d', 3);
    // arm
    line(7, -48, 31, -41, '#2b1630', 6);
    ctx.beginPath();
    ctx.arc(32, -41, 3.2, 0, TAU);
    ctx.fillStyle = '#2b1630';
    ctx.fill();

    // helmet
    ctx.beginPath();
    ctx.arc(15, -56, 10.5, 0, TAU);
    ctx.fillStyle = '#f6d7ad';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(15, -56, 10.5, -0.4, 1.25);
    ctx.strokeStyle = '#ff6a3d';
    ctx.lineWidth = 3;
    ctx.stroke();
    // visor
    ctx.beginPath();
    ctx.moveTo(17, -60.5);
    ctx.quadraticCurveTo(25.5, -58.5, 24, -52);
    ctx.quadraticCurveTo(19.5, -52, 17, -54);
    ctx.closePath();
    ctx.fillStyle = '#221326';
    ctx.fill();

    ctx.restore();
  }

  function render() {
    ctx.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0);
    const shakeX = (Math.random() * 2 - 1) * shake * 9;
    const shakeY = (Math.random() * 2 - 1) * shake * 9;
    const viewX = cam.x + shakeX;
    const viewY = cam.y + shakeY;

    if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
    else {
      drawSky(ctx);
      drawSun(ctx);
    }
    drawClouds();
    drawMountains(viewX, viewY);
    drawGround(viewX, viewY);
    drawStreaks();
    drawShadow(viewX, viewY);
    drawParticles(viewX, viewY, 'dust');
    drawBike(viewX, viewY);
    drawParticles(viewX, viewY, 'spark');
  }

  // ---------------- resize / loop ----------------
  function applyCanvas() {
    PIXEL_RATIO = DPR * renderScale;
    canvas.width = Math.round(W * PIXEL_RATIO);
    canvas.height = Math.round(H * PIXEL_RATIO);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0);

    paintBackdrop();

    groundGrad = ctx.createLinearGradient(0, H * 0.5, 0, H + 40);
    groundGrad.addColorStop(0, '#3a172c');
    groundGrad.addColorStop(0.3, '#271021');
    groundGrad.addColorStop(1, '#0c0613');
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    BIKE_SCALE = clamp(Math.min(W, H * 0.78) / 700, 0.78, 1.12);
    applyCanvas();

    if (state === 'menu') {
      cam.x = bike.x - W * 0.3;
      cam.y = bike.y - H * 0.6;
    }
  }

  function adaptQuality(now) {
    if (state !== 'playing') return;
    perfFrames++;
    if (now - perfStart < 2000) return;
    const fps = (perfFrames * 1000) / (now - perfStart);
    perfFrames = 0;
    perfStart = now;
    if (fps < 26 && renderScale > 0.55) {
      renderScale = Math.max(0.55, +(renderScale - (fps < 18 ? 0.2 : 0.1)).toFixed(2));
      applyCanvas();
    } else if (fps > 54 && renderScale < 1) {
      renderScale = Math.min(1, +(renderScale + 0.08).toFixed(2));
      applyCanvas();
    }
  }

  const FIXED_DT = 1 / 60;
  let accumulator = 0;

  function frame(now) {
    let delta = (now - last) / 1000;
    last = now;
    if (!isFinite(delta) || delta < 0) delta = 0;
    delta = Math.min(delta, 0.2);

    accumulator += delta;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 12) {
      update(FIXED_DT);
      accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === 12) accumulator = 0;

    adaptQuality(now);
    render();
    requestAnimationFrame(frame);
  }

  // ---------------- boot ----------------
  el.play.addEventListener('click', startGame);
  el.retry.addEventListener('click', startGame);
  el.resume.addEventListener('click', resumeGame);
  el.pause.addEventListener('click', pauseGame);
  el.mute.addEventListener('click', toggleMute);

  document.body.classList.toggle('muted', audio.muted);
  el.mute.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');

  makeClouds();
  resize();
  resetRun();
  state = 'menu';
  document.body.dataset.state = 'menu';
  showScreen('start');
  el.bestMenu.textContent = fmt(best);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  last = performance.now();
  perfStart = performance.now();
  requestAnimationFrame(frame);

  // Exposed for automated smoke tests only.
  window.__ridge = {
    bike,
    cam,
    get run() {
      return run;
    },
    get terrain() {
      return terrain;
    },
    get state() {
      return state;
    },
    get particles() {
      return particles;
    },
    telemetry,
    render,
    update,
    start: startGame,
    pause: pauseGame,
    resume: resumeGame,
    setInput(gas, brake) {
      keyState.gas = !!gas;
      keyState.brake = !!brake;
    },
  };
})();
