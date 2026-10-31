import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

const menu = $('menu');
const hud = $('hud');
const pauseEl = $('pause');
const deadEl = $('dead');
const bestEl = $('bestMenu');

const show = (el) => el.classList.remove('hidden');
const hide = (el) => el.classList.add('hidden');

function readBest() {
  let best = 0;
  try { best = Number(localStorage.getItem('sunset-best') || 0) || 0; } catch (e) { /* ignore */ }
  return best;
}

function setBest(value) {
  if (bestEl) bestEl.textContent = '$' + Math.max(0, Math.round(value)).toLocaleString('en-US');
}

setBest(readBest());

let deadInterval = null;

function clearDeadCountdown() {
  if (deadInterval) {
    clearInterval(deadInterval);
    deadInterval = null;
  }
}

function startDeadCountdown() {
  clearDeadCountdown();
  let left = 5;
  const label = $('deadCount');
  if (label) label.textContent = `RESPAWNING IN ${left}…`;
  deadInterval = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearDeadCountdown();
      hide(deadEl);
      game.respawn();
    } else if (label) {
      label.textContent = `RESPAWNING IN ${left}…`;
    }
  }, 1000);
}

const game = new Game(document.getElementById('game'), {
  onStart: () => {
    show(hud);
    hideOnce(menu);
  },
  onPause: () => show(pauseEl),
  onResume: () => hide(pauseEl),
  onDead: () => {
    show(deadEl);
    const bill = $('deadCash');
    if (bill) bill.textContent = '$250';
    startDeadCountdown();
  },
  onBest: (value) => setBest(value),
});

function hideOnce(el) {
  if (el) hide(el);
}

function startRun() {
  clearDeadCountdown();
  hide(menu);
  hide(pauseEl);
  hide(deadEl);
  show(hud);
  game.startNew();
}

$('startBtn').addEventListener('click', startRun);

$('resumeBtn').addEventListener('click', () => {
  hide(pauseEl);
  game.resume();
});

$('restartBtn').addEventListener('click', startRun);

$('respawnBtn').addEventListener('click', () => {
  clearDeadCountdown();
  hide(deadEl);
  game.respawn();
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game.state === 'paused') {
    e.preventDefault();
    game.input.consume('pause');
    hide(pauseEl);
    game.resume();
    return;
  }
  if (e.code === 'Enter' && !menu.classList.contains('hidden')) {
    e.preventDefault();
    startRun();
  }
  if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Space') {
    if (!menu.classList.contains('hidden')) e.preventDefault();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.pause();
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose for debugging in the console without polluting the global namespace much.
window.__sunset = game;
