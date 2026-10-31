import { City, WORLD, CELL, ROAD_HALF, clamp, lerp } from './world.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { TAU, rand, pick, dist, angLerp, CAR_TYPES } from './defs.js';
import { installSystems } from './systems.js';
import { installRender } from './render.js';
import { installHud } from './hud.js';

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.city = new City(20131);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.state = 'menu';
    this.time = 0;
    this.shake = 0;
    this.cash = 0;
    this.wanted = 0;
    this.heat = 0;
    this.decayTimer = 0;
    this.copTimer = 0;
    this.mission = null;
    this.missionCooldown = 3;
    this.toastT = 0;
    this.deadTimer = 0;
    this.damageFlash = 0;
    this.dpr = 1;
    this.cssW = 1;
    this.cssH = 1;
    this.cam = { x: WORLD / 2, y: WORLD / 2, zoom: 1 };
    this.player = {
      x: WORLD / 2, y: WORLD / 2, angle: 0, aim: 0, onFoot: true, car: null,
      health: 100, shootCd: 0, lastHit: -99, walk: 0,
    };
    this.carId = 1;
    this.resize();
    this.resetWorld();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    // Very large high-DPI windows can otherwise allocate a gigantic backing
    // store (and a matching ground buffer) for a subtle sharpness gain.
    const maxPixels = 9_000_000;
    if (w * h * this.dpr * this.dpr > maxPixels) {
      this.dpr = Math.sqrt(maxPixels / (w * h));
    }
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  spawnPoint() {
    const base = 4 * CELL;
    const spots = [
      [base + ROAD_HALF + 11, base + ROAD_HALF + 140],
      [base - ROAD_HALF - 11, base - ROAD_HALF - 140],
      [base + ROAD_HALF + 140, base - ROAD_HALF - 11],
      [base - ROAD_HALF - 140, base + ROAD_HALF + 11],
    ];
    for (const [x, y] of spots) {
      if (!this.city.pointBlocked(x, y, 16)) return { x, y };
    }
    return { x: base, y: base };
  }

  resetWorld() {
    this.cars = [];
    this.peds = [];
    this.bullets = [];
    this.particles = [];
    this.pickups = [];
    this.cash = 0;
    this.wanted = 0;
    this.heat = 0;
    this.decayTimer = 0;
    this.copTimer = 0;
    this.mission = null;
    this.missionCooldown = 3.5;
    this.damageFlash = 0;
    this.shake = 0;
    const spawn = this.spawnPoint();
    Object.assign(this.player, {
      x: spawn.x, y: spawn.y, angle: 0, aim: 0, onFoot: true, car: null,
      health: 100, shootCd: 0, lastHit: -99, walk: 0,
    });
    this.cam.x = spawn.x;
    this.cam.y = spawn.y;
    this.cam.zoom = 1;
    this.spawnParkedCars();
    this.spawnInitialTraffic(36);
    this.spawnInitialPeds(104);
    this.spawnCashPickups(8);
  }

  makeCar(kind, x, y, angle, opts = {}) {
    const t = CAR_TYPES[kind] || CAR_TYPES.sedan;
    const car = {
      id: ++this.carId,
      kind,
      x, y, angle,
      speed: 0,
      l: t.len,
      w: t.wid,
      hp: t.hp,
      maxHp: t.hp,
      color: opts.color || pick(t.colors),
      driver: opts.driver ?? null,
      ai: opts.ai ?? null,
      isPolice: kind === 'police',
      burned: false,
      marker: false,
      hitCd: 0,
      shootCd: rand(0.8, 2.2),
      smokeT: 0,
    };
    this.cars.push(car);
    return car;
  }

  startNew() {
    this.resetWorld();
    this.state = 'playing';
    this.deadTimer = 0;
    this.audio.start();
    this.input.showTouch(this.input.touch);
    this.opts.onStart?.();
    this.toast('SUNSET CITY', 'Grab a ride. Take a job. Try not to die.', 3.6);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.opts.onPause?.();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.opts.onResume?.();
    this.audio.start();
  }

  respawn() {
    const spawn = this.spawnPoint();
    Object.assign(this.player, {
      x: spawn.x, y: spawn.y, angle: 0, aim: 0, onFoot: true, car: null,
      health: 100, shootCd: 0, lastHit: this.time, walk: 0,
    });
    this.cash = Math.max(0, this.cash - 250);
    this.wanted = 0;
    this.heat = 0;
    this.bullets.length = 0;
    this.cars = this.cars.filter((c) => !c.isPolice || c.burned);
    this.mission = null;
    this.missionCooldown = 3;
    this.cam.x = spawn.x;
    this.cam.y = spawn.y;
    this.cam.zoom = 1;
    this.state = 'playing';
    this.deadTimer = 0;
    this.opts.onRespawn?.();
    this.toast('BACK ON THE STREET', 'Hospital bill: $250', 2.4);
  }

  die() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.deadTimer = 0;
    this.player.health = 0;
    if (this.player.car) {
      this.player.car.driver = null;
      this.player.car.speed = 0;
      this.player.car = null;
    }
    this.player.onFoot = true;
    this.wanted = 0;
    this.heat = 0;
    this.bullets.length = 0;
    this.shake = 16;
    this.damageFlash = 1;
    this.audio.explosion();
    this.opts.onDead?.();
  }

  damagePlayer(n) {
    if (this.state !== 'playing') return;
    this.player.health -= n;
    this.player.lastHit = this.time;
    this.damageFlash = Math.min(1, this.damageFlash + n / 40);
    this.shake = Math.max(this.shake, Math.min(9, n * 0.5));
    if (n > 2) this.audio.hurt();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.die();
    }
  }

  toggleMute() {
    const muted = this.audio.toggleMute();
    this.toast(muted ? 'MUTED' : 'SOUND ON', '', 1.2);
  }

  frame(dt) {
    // Keep the simulation close to real time on slower (especially software
    // rendered) machines instead of slipping into permanent slow motion.
    dt = Math.min(dt || 0, 1 / 15);
    if (this.state !== 'paused') this.time += dt;
    this.input.update();
    this.shake = Math.max(0, this.shake - 30 * dt);
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.1);

    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'menu') this.updateAttract(dt);
    else if (this.state === 'dead') {
      this.deadTimer += dt;
      this.updateCamera(dt);
    }
    if (this.state !== 'paused') this.updateParticles(dt);
    this.updateToast(dt);

    this.render();

    const focus = this.player.car || this.player;
    let nearestCop = 9999;
    for (const c of this.cars) {
      if (c.isPolice && !c.burned) nearestCop = Math.min(nearestCop, dist(c.x, c.y, focus.x, focus.y));
    }
    const siren = this.state === 'playing' && this.wanted > 0 ? clamp(1 - nearestCop / 1200, 0, 1) : 0;
    this.audio.update(dt, {
      driving: this.state === 'playing' && !this.player.onFoot && !!this.player.car,
      speed: this.player.car ? this.player.car.speed : 0,
      siren,
    });
    this.input.endFrame();
  }

  updatePlaying(dt) {
    this.player.shootCd = Math.max(0, this.player.shootCd - dt);
    if (this.handleActions()) return;
    if (this.player.onFoot) this.updatePlayerOnFoot(dt);
    else this.updatePlayerCar(dt);
    this.updateTraffic(dt);
    this.updatePolice(dt);
    this.updateCarCollisions(dt);
    this.updatePeds(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateMission(dt);
    this.updateWanted(dt);
    this.updateCamera(dt);
    if (this.time - this.player.lastHit > 6) {
      this.player.health = Math.min(100, this.player.health + 3 * dt);
    }
    this.updateHUD();
  }

  updateAttract(dt) {
    this.cam.zoom = lerp(this.cam.zoom, 0.9, dt * 2);
    this.cam.x = WORLD / 2 + Math.cos(this.time * 0.055) * 1350;
    this.cam.y = WORLD / 2 + Math.sin(this.time * 0.041) * 1050;
    this.updateTraffic(dt);
    this.updatePeds(dt);
  }

  handleActions() {
    if (this.input.consume('pause')) {
      this.pause();
      return true;
    }
    if (this.input.consume('mute')) this.toggleMute();
    if (this.input.consume('enter')) {
      if (this.player.onFoot) this.enterCar();
      else this.exitCar();
    }
    const fireDown = this.input.fireHeld || this.input.keys.has('KeyF') || this.input.keys.has('Space');
    if (fireDown && this.player.onFoot && this.player.shootCd <= 0) this.shoot();
    return false;
  }

  nearestCar(maxDist = 80) {
    let best = null;
    let bd = maxDist;
    for (const car of this.cars) {
      if (car.burned || car.driver === 'player') continue;
      const d = dist(car.x, car.y, this.player.x, this.player.y);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  enterCar() {
    const car = this.nearestCar(100);
    if (!car) {
      this.toast('NO RIDE NEARBY', 'Walk up to a car and press E.', 1.6);
      return;
    }
    if (car.driver === 'ai') {
      this.ejectDriver(car);
      if (!car.isPolice) this.toast('CARJACKED', pick(['A classic.', 'Hope nobody saw that.', 'You needed it more.']), 1.7);
    }
    car.driver = 'player';
    car.ai = null;
    this.player.car = car;
    this.player.onFoot = false;
    this.player.x = car.x;
    this.player.y = car.y;
    this.player.angle = car.angle;
    if (car.isPolice) this.crime(2);
    this.audio.ping(520);
  }

  exitCar() {
    const car = this.player.car;
    if (!car) return;
    if (Math.abs(car.speed) > 110) {
      this.toast('SLOW DOWN', 'Stop the car before bailing out.', 1.4);
      return;
    }
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const options = [
      [car.x - s * 46, car.y + c * 46],
      [car.x + s * 46, car.y - c * 46],
    ];
    let placed = false;
    for (const [x, y] of options) {
      const res = this.city.resolveCircle(x, y, 13);
      if (!res.hit) {
        this.player.x = res.x;
        this.player.y = res.y;
        placed = true;
        break;
      }
    }
    if (!placed) {
      this.toast('NO ROOM', 'Pull over somewhere open.', 1.4);
      return;
    }
    car.driver = null;
    car.speed = 0;
    this.player.car = null;
    this.player.onFoot = true;
    this.player.angle = car.angle;
    this.player.aim = car.angle;
  }

  shoot() {
    const p = this.player;
    p.shootCd = 0.19;
    const aim = this.getAim();
    p.aim = aim;
    p.angle = aim;
    const bx = p.x + Math.cos(aim) * 20;
    const by = p.y + Math.sin(aim) * 20;
    this.bullets.push({
      x: bx, y: by,
      vx: Math.cos(aim) * 840,
      vy: Math.sin(aim) * 840,
      life: 0.8,
      owner: 'player',
      dmg: 18,
    });
    this.spawnBurst(bx, by, { count: 4, color: '#ffd27a', speed: 130, life: 0.18, size: 2.6, type: 'spark' });
    this.audio.gunshot();
    this.shake = Math.max(this.shake, 2.4);
  }

  getAim() {
    if (!this.input.touch && this.input.mouse.active) {
      const w = this.screenToWorld(this.input.mouse.x, this.input.mouse.y);
      const d = dist(w.x, w.y, this.player.x, this.player.y);
      if (d > 12) return Math.atan2(w.y - this.player.y, w.x - this.player.x);
    }
    const target = this.autoTarget(560);
    if (target) return Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const mx = this.input.moveX;
    const my = this.input.moveY;
    if (Math.hypot(mx, my) > 0.1) return Math.atan2(my, mx);
    return this.player.aim || this.player.angle;
  }

  autoTarget(range) {
    let best = null;
    let bd = range;
    for (const ped of this.peds) {
      if (ped.down) continue;
      const d = dist(ped.x, ped.y, this.player.x, this.player.y);
      if (d < bd + 24) { bd = d; best = ped; }
    }
    for (const car of this.cars) {
      if (car === this.player.car || car.burned) continue;
      const d = dist(car.x, car.y, this.player.x, this.player.y);
      if (d < bd) { bd = d; best = car; }
    }
    return best;
  }

  updatePlayerOnFoot(dt) {
    const p = this.player;
    const m = this.input;
    const moving = Math.hypot(m.moveX, m.moveY) > 0.06;
    const speed = m.sprint ? 330 : 210;
    if (moving) {
      p.x += m.moveX * speed * dt;
      p.y += m.moveY * speed * dt;
      p.angle = angLerp(p.angle, Math.atan2(m.moveY, m.moveX), 9 * dt);
      p.aim = p.angle;
      p.walk += speed * dt * 0.028;
    }
    const res = this.city.resolveCircle(p.x, p.y, 13);
    p.x = res.x;
    p.y = res.y;
  }

  updatePlayerCar(dt) {
    const car = this.player.car;
    if (!car) {
      this.player.onFoot = true;
      return;
    }
    const m = this.input;
    this.driveCar(car, m.throttle, m.steer, m.handbrake, dt);
    this.player.x = car.x;
    this.player.y = car.y;
    this.player.angle = car.angle;
    this.player.aim = car.angle;
    if (m.handbrake && Math.abs(car.speed) > 120 && Math.random() < 0.7) {
      this.spawnSkid(car);
    }
    if (car.hp < car.maxHp * 0.35 && Math.random() < dt * 14) {
      this.spawnSmoke(car.x, car.y, 0.5);
    }
  }

  driveCar(car, throttle, steer, brake, dt) {
    const t = CAR_TYPES[car.kind];
    if (throttle > 0) car.speed += t.accel * throttle * dt;
    else if (throttle < 0) car.speed += t.accel * 1.15 * throttle * dt;
    car.speed *= 1 - 0.85 * dt;
    if (brake) car.speed *= Math.pow(0.035, dt);
    if (car.speed > t.max) car.speed = lerp(car.speed, t.max, 3 * dt);
    if (car.speed < -t.rev) car.speed = -t.rev;

    const grip = clamp(Math.abs(car.speed) / 150, 0, 1) * (1 - 0.3 * clamp(Math.abs(car.speed) / t.max, 0, 1));
    car.angle += steer * t.turn * grip * dt * (car.speed < -4 ? -1 : 1);

    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    car.x += c * car.speed * dt;
    car.y += s * car.speed * dt;
    car.hitCd = Math.max(0, car.hitCd - dt);

    let px = 0;
    let py = 0;
    let hit = false;
    for (const o of [0.31, -0.31]) {
      const rr = car.w * 0.62;
      const res = this.city.resolveCircle(car.x + c * car.l * o, car.y + s * car.l * o, rr);
      if (res.hit) {
        hit = true;
        px += res.x - (car.x + c * car.l * o);
        py += res.y - (car.y + s * car.l * o);
      }
    }
    if (hit) {
      car.x += px;
      car.y += py;
      const impact = Math.abs(car.speed);
      car.speed = -car.speed * 0.16;
      if (impact > 170 && car.hitCd <= 0) {
        this.hitCar(car, impact * 0.055);
        this.audio.crash(clamp(impact / 500, 0.15, 1));
        this.shake = Math.max(this.shake, clamp(impact / 90, 1, 9));
        this.spawnBurst(car.x + c * car.l * 0.45, car.y + s * car.l * 0.45, {
          count: 8, color: '#ffcf7a', speed: 150, life: 0.35, size: 3, type: 'spark',
        });
        car.hitCd = 0.45;
        if (car === this.player.car && impact > 260) this.damagePlayer(impact * 0.012);
      }
    }
    car.speed = clamp(car.speed, -t.rev, t.max);
    car.x = clamp(car.x, 22, WORLD - 22);
    car.y = clamp(car.y, 22, WORLD - 22);
  }

  updateCamera(dt) {
    const car = this.player.car;
    const focus = car || this.player;
    const targetZoom = car ? clamp(1.06 - Math.abs(car.speed) / 2800, 0.7, 1.03) : 1.12;
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, 1 - Math.pow(0.002, dt));
    let tx = focus.x;
    let ty = focus.y;
    if (car) {
      tx += Math.cos(car.angle) * car.speed * 0.35;
      ty += Math.sin(car.angle) * car.speed * 0.35;
    }
    const k = 1 - Math.pow(0.0009, dt);
    this.cam.x = lerp(this.cam.x, tx, k);
    this.cam.y = lerp(this.cam.y, ty, k);
    const hw = this.cssW / (2 * this.cam.zoom);
    const hh = this.cssH / (2 * this.cam.zoom);
    this.cam.x = hw * 2 > WORLD ? WORLD / 2 : clamp(this.cam.x, hw, WORLD - hw);
    this.cam.y = hh * 2 > WORLD ? WORLD / 2 : clamp(this.cam.y, hh, WORLD - hh);
  }

  worldToScreen(x, y) {
    return {
      x: (x - this.cam.x) * this.cam.zoom + this.cssW / 2,
      y: (y - this.cam.y) * this.cam.zoom + this.cssH / 2,
    };
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.cssW / 2) / this.cam.zoom + this.cam.x,
      y: (y - this.cssH / 2) / this.cam.zoom + this.cam.y,
    };
  }
}

installSystems(Game);
installRender(Game);
installHud(Game);
