// Input: keyboard, mouse aim and touch controls.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.joy = { x: 0, y: 0, active: false, id: null };
    this.keyX = 0;
    this.keyY = 0;
    this.keyThrottle = 0;
    this.keySteer = 0;
    this.fireHeld = false;
    this.brakeHeld = false;
    this.mouse = { x: 0, y: 0, active: false, down: false };
    this.pressed = new Set();
    this.touch = matchMedia('(pointer: coarse)').matches;
    this.moveX = 0;
    this.moveY = 0;
    this.throttle = 0;
    this.steer = 0;

    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  bindKeyboard() {
    const block = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
    window.addEventListener('keydown', (e) => {
      if (block.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.pressed.add('enter');
      if (e.code === 'KeyF' || e.code === 'Space') this.pressed.add('fire');
      if (e.code === 'Escape' || e.code === 'KeyP') this.pressed.add('pause');
      if (e.code === 'KeyM') this.pressed.add('mute');
      if (e.code === 'Enter') this.pressed.add('start');
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.fireHeld = false;
      this.brakeHeld = false;
      this.joy.x = 0;
      this.joy.y = 0;
    });
  }

  bindMouse() {
    const c = this.canvas;
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (e.pointerType !== 'touch') this.mouse.active = true;
    });
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0) return;
      this.mouse.down = true;
      this.fireHeld = true;
      this.pressed.add('fire');
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return;
      this.mouse.down = false;
      this.fireHeld = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  bindTouch() {
    const base = document.getElementById('stick');
    const knob = document.getElementById('knob');
    if (!base || !knob) return;
    const rectOf = () => base.getBoundingClientRect();
    const move = (e) => {
      const r = rectOf();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.joy.x = dx;
      this.joy.y = dy;
      this.joy.active = true;
      knob.style.transform = `translate(${dx * 46}px, ${dy * 46}px)`;
    };
    const end = () => {
      this.joy.x = 0; this.joy.y = 0; this.joy.active = false; this.joy.id = null;
      knob.style.transform = 'translate(0px, 0px)';
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { base.setPointerCapture(e.pointerId); } catch (err) { /* synthetic/unsupported pointer */ }
      this.joy.id = e.pointerId;
      move(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (this.joy.id !== e.pointerId) return;
      e.preventDefault();
      move(e);
    });
    base.addEventListener('pointerup', (e) => {
      if (this.joy.id === e.pointerId) end();
    });
    base.addEventListener('pointercancel', end);
    base.addEventListener('lostpointercapture', end);

    for (const btn of document.querySelectorAll('[data-action]')) {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('down');
        const a = btn.dataset.action;
        if (a === 'fire') { this.fireHeld = true; this.pressed.add('fire'); }
        else if (a === 'enter') this.pressed.add('enter');
        else if (a === 'brake') { this.brakeHeld = true; this.pressed.add('handbrake'); }
        else if (a === 'pause') this.pressed.add('pause');
        else if (a === 'mute') this.pressed.add('mute');
      });
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('down');
        if (btn.dataset.action === 'fire') this.fireHeld = false;
        if (btn.dataset.action === 'brake') this.brakeHeld = false;
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }
  }

  update() {
    const k = this.keys;
    let kx = 0;
    let ky = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) kx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) kx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) ky -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) ky += 1;

    let jx = this.joy.x;
    let jy = this.joy.y;
    if (Math.hypot(jx, jy) < 0.16) { jx = 0; jy = 0; }

    this.moveX = Math.abs(jx) > Math.abs(kx) ? jx : kx;
    this.moveY = Math.abs(jy) > Math.abs(ky) ? jy : ky;
    const ml = Math.hypot(this.moveX, this.moveY);
    if (ml > 1) { this.moveX /= ml; this.moveY /= ml; }

    // Driving: analog stick (push up to accelerate) or keys.
    this.throttle = ky !== 0 ? -ky : -jy;
    this.steer = kx !== 0 ? kx : jx;
    this.throttle = Math.max(-1, Math.min(1, this.throttle));
    this.steer = Math.max(-1, Math.min(1, this.steer));

    this.handbrake = k.has('ShiftLeft') || k.has('ShiftRight') || this.brakeHeld || this.pressed.has('handbrake');
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  }

  consume(action) {
    if (!this.pressed.has(action)) return false;
    this.pressed.delete(action);
    return true;
  }

  endFrame() {
    this.pressed.clear();
  }

  showTouch(show) {
    const el = document.getElementById('touch');
    if (el) el.classList.toggle('hidden', !show);
  }
}
