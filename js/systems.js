import { WORLD, CELL, ROAD_HALF, LANE, GRID, clamp, lerp } from './world.js';
import { TAU, rand, pick, dist, angLerp, CAR_TYPES, CAR_KINDS, PED_COLORS, SKIN_COLORS, fmtMoney } from './defs.js';

export function installSystems(Game) {
  Object.assign(Game.prototype, {
    // ---------- spawning ----------
    spawnParkedCars() {
      const spots = [...this.city.spots].sort(() => Math.random() - 0.5).slice(0, 24);
      for (const s of spots) {
        if (dist(s.x, s.y, this.player.x, this.player.y) < 160) continue;
        this.makeCar(pick(CAR_KINDS), s.x, s.y, s.angle);
      }
      // A guaranteed starter ride on the nearest road.
      const px = this.player.x;
      const py = this.player.y;
      const rx = Math.round(px / CELL) * CELL;
      let car;
      if (Math.abs(px - rx) < 220) car = this.makeCar('sport', rx, py + 40, -Math.PI / 2);
      else {
        const ry = Math.round(py / CELL) * CELL;
        car = this.makeCar('sport', px + 40, ry, 0);
      }
      car.color = '#ff5a3c';
    },

    randomTrafficPose(focus, minD = 400, maxD = 2200) {
      for (let t = 0; t < 26; t++) {
        const vertical = Math.random() < 0.5;
        const road = 1 + Math.floor(Math.random() * (GRID - 1));
        const along = rand(80, WORLD - 80);
        const dir = vertical
          ? (Math.random() < 0.5 ? { x: 0, y: 1 } : { x: 0, y: -1 })
          : (Math.random() < 0.5 ? { x: 1, y: 0 } : { x: -1, y: 0 });
        const right = { x: -dir.y, y: dir.x };
        const x = vertical ? road * CELL + right.x * LANE : along;
        const y = vertical ? along : road * CELL + right.y * LANE;
        const d = dist(x, y, focus.x, focus.y);
        if (d < minD || d > maxD) continue;
        const next = this.nextNodeFor(x, y, dir);
        if (!next) continue;
        return {
          x, y, dir,
          nextNode: next.node,
          target: this.laneTarget(next.node, dir),
          limit: rand(85, 150),
        };
      }
      return null;
    },

    nextNodeFor(x, y, dir) {
      let ni;
      let nj;
      if (dir.x > 0) ni = Math.floor(x / CELL) + 1;
      else if (dir.x < 0) ni = Math.ceil(x / CELL) - 1;
      else ni = Math.round(x / CELL);
      if (dir.y > 0) nj = Math.floor(y / CELL) + 1;
      else if (dir.y < 0) nj = Math.ceil(y / CELL) - 1;
      else nj = Math.round(y / CELL);
      if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) return null;
      return { node: { i: ni, j: nj } };
    },

    laneTarget(node, dir) {
      const right = { x: -dir.y, y: dir.x };
      return {
        x: node.i * CELL + right.x * LANE,
        y: node.j * CELL + right.y * LANE,
      };
    },

    spawnInitialTraffic(n) {
      for (let i = 0; i < n; i++) {
        const pose = this.randomTrafficPose(this.player, 200, 1500);
        if (!pose) continue;
        const car = this.makeCar(pick(CAR_KINDS), pose.x, pose.y, Math.atan2(pose.dir.y, pose.dir.x), { driver: 'ai' });
        car.ai = { mode: 'traffic', dir: pose.dir, node: null, nextNode: pose.nextNode, target: pose.target, limit: pose.limit, stall: 0 };
        if (car.kind === 'taxi') car.color = '#f0c020';
      }
    },

    recycleTraffic(car, focus) {
      const pose = this.randomTrafficPose(focus, 900, 2100);
      if (!pose) return;
      car.x = pose.x;
      car.y = pose.y;
      car.angle = Math.atan2(pose.dir.y, pose.dir.x);
      car.speed = 60;
      car.ai = { mode: 'traffic', dir: pose.dir, node: null, nextNode: pose.nextNode, target: pose.target, limit: pose.limit, stall: 0 };
    },

    randomStreetPoint(px, py, minD, maxD) {
      for (let t = 0; t < 60; t++) {
        const a = rand(0, TAU);
        const r = rand(minD, maxD);
        const x = clamp(px + Math.cos(a) * r, 50, WORLD - 50);
        const y = clamp(py + Math.sin(a) * r, 50, WORLD - 50);
        if (!this.city.pointBlocked(x, y, 18)) return { x, y };
      }
      return null;
    },

    spawnPedAt(x, y, scared = 0) {
      const res = this.city.resolveCircle(x, y, 8);
      const ped = {
        x: res.x, y: res.y,
        angle: rand(0, TAU),
        target: { x: res.x + rand(-60, 60), y: res.y + rand(-60, 60) },
        speed: rand(22, 44),
        down: false,
        downT: 0,
        grace: 0,
        scare: scared,
        scareX: res.x,
        scareY: res.y,
        phase: rand(0, TAU),
        color: pick(PED_COLORS),
        skin: pick(SKIN_COLORS),
        remove: false,
      };
      this.peds.push(ped);
      return ped;
    },

    spawnPedNear(px, py, radius = 1100) {
      for (let t = 0; t < 40; t++) {
        const bi = clamp(Math.floor(px / CELL) + Math.round(rand(-2, 2)), 0, GRID - 1);
        const bj = clamp(Math.floor(py / CELL) + Math.round(rand(-2, 2)), 0, GRID - 1);
        const block = this.city.blocks[bj * GRID + bi];
        const x = rand(block.x + 5, block.x + block.w - 5);
        const y = rand(block.y + 5, block.y + block.h - 5);
        if (this.city.pointBlocked(x, y, 12)) continue;
        if (dist(x, y, px, py) < radius * 0.25) continue;
        return this.spawnPedAt(x, y);
      }
      return null;
    },

    spawnInitialPeds(n) {
      for (let i = 0; i < n; i++) this.spawnPedNear(this.player.x, this.player.y, 1500);
    },

    spawnCashPickups(n) {
      for (let i = 0; i < n; i++) {
        const p = this.randomStreetPoint(this.player.x, this.player.y, 260, 1300);
        if (!p) continue;
        this.pickups.push({
          x: p.x, y: p.y,
          value: Math.round(rand(40, 160) / 10) * 10,
          phase: rand(0, TAU),
          taken: false,
        });
      }
    },

    spawnCop() {
      const focus = this.player.car || this.player;
      const pose = this.randomTrafficPose(focus, 650, 1250);
      if (!pose) return;
      const car = this.makeCar('police', pose.x, pose.y, Math.atan2(pose.dir.y, pose.dir.x), { driver: 'ai' });
      car.ai = { mode: 'police' };
      car.speed = 110;
    },

    ejectDriver(car) {
      const side = Math.random() < 0.5 ? 1 : -1;
      const a = car.angle + (Math.PI / 2) * side;
      const ped = this.spawnPedAt(car.x + Math.cos(a) * 52, car.y + Math.sin(a) * 52, 2.6);
      if (ped) {
        ped.scareX = car.x;
        ped.scareY = car.y;
      }
    },

    // ---------- traffic + police ----------
    updateTraffic(dt) {
      const focus = this.state === 'menu' ? this.cam : (this.player.car || this.player);
      const p = this.player;
      for (const car of this.cars) {
        if (car.driver !== 'ai' || car.isPolice || car.burned) continue;
        const ai = car.ai;
        if (!ai || ai.mode !== 'traffic') continue;
        if (dist(car.x, car.y, focus.x, focus.y) > 1900) {
          this.recycleTraffic(car, focus);
          continue;
        }
        if (dist(car.x, car.y, ai.target.x, ai.target.y) < 34) this.advanceTraffic(car);

        const ang = Math.atan2(ai.target.y - car.y, ai.target.x - car.x);
        car.angle = angLerp(car.angle, ang, 4 * dt);

        let desired = ai.limit;
        const fx = car.x + Math.cos(car.angle) * 76;
        const fy = car.y + Math.sin(car.angle) * 76;
        for (const other of this.cars) {
          if (other === car || other.burned) continue;
          if (dist(other.x, other.y, fx, fy) < 48) {
            desired = Math.min(desired, Math.max(0, (dist(other.x, other.y, car.x, car.y) - 52) * 2.4));
          }
        }
        for (const ped of this.peds) {
          if (ped.down) continue;
          if (Math.abs(ped.x - car.x) > 120 || Math.abs(ped.y - car.y) > 120) continue;
          if (dist(ped.x, ped.y, fx, fy) < 44) desired = Math.min(desired, 15);
        }
        if (this.player.onFoot && dist(car.x, car.y, p.x, p.y) < 90 && dist(car.x, car.y, p.x, p.y) > 40) {
          desired = Math.min(desired, 60);
        }
        car.speed = lerp(car.speed, desired, 1.8 * dt);
        const c = Math.cos(car.angle);
        const s = Math.sin(car.angle);
        car.x += c * car.speed * dt;
        car.y += s * car.speed * dt;

        const res = this.city.resolveCircle(car.x, car.y, car.w * 0.6);
        if (res.hit) {
          car.x = res.x;
          car.y = res.y;
          car.speed *= 0.45;
        }
        if (car.speed < 10) {
          car.ai.stall = (car.ai.stall || 0) + dt;
          if (car.ai.stall > 7) this.recycleTraffic(car, focus);
        } else car.ai.stall = 0;

        if (this.player.onFoot && Math.abs(car.speed) > 80 && dist(car.x, car.y, p.x, p.y) < 38 && car.hitCd <= 0) {
          car.hitCd = 1;
          this.damagePlayer(20);
          this.spawnBurst(p.x, p.y, { count: 6, color: '#cbbfa6', speed: 90, life: 0.4, size: 4, type: 'dust' });
        }
      }
    },

    advanceTraffic(car) {
      const ai = car.ai;
      ai.node = ai.nextNode;
      const straight = { x: ai.dir.x, y: ai.dir.y };
      const candidates = [
        { dir: straight, w: 4 },
        { dir: { x: -straight.y, y: straight.x }, w: 1.5 },
        { dir: { x: straight.y, y: -straight.x }, w: 1.5 },
      ];
      const options = [];
      let total = 0;
      for (const o of candidates) {
        const ni = ai.node.i + o.dir.x;
        const nj = ai.node.j + o.dir.y;
        if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) continue;
        options.push({ ...o, next: { i: ni, j: nj } });
        total += o.w;
      }
      if (!options.length) {
        const dir = { x: -straight.x, y: -straight.y };
        const ni = ai.node.i + dir.x;
        const nj = ai.node.j + dir.y;
        if (ni < 0 || ni > GRID || nj < 0 || nj > GRID) return;
        options.push({ dir, next: { i: ni, j: nj }, w: 1 });
        total = 1;
      }
      let r = Math.random() * total;
      let chosen = options[options.length - 1];
      for (const o of options) {
        r -= o.w;
        if (r <= 0) { chosen = o; break; }
      }
      ai.dir = chosen.dir;
      ai.nextNode = chosen.next;
      ai.target = this.laneTarget(chosen.next, chosen.dir);
    },

    updatePolice(dt) {
      this.copTimer -= dt;
      const cops = this.cars.filter((c) => c.isPolice && !c.burned && c.driver !== 'player').length;
      if (this.wanted > 0 && cops < Math.min(1 + this.wanted, 4) && this.copTimer <= 0) {
        this.spawnCop();
        this.copTimer = 2.6;
      }
      const p = this.player;
      const target = p.car || p;
      for (const car of this.cars) {
        if (!car.isPolice || car.burned || car.driver === 'player') continue;
        const d = dist(car.x, car.y, target.x, target.y);
        if (this.wanted === 0 && d > 900) {
          car.remove = true;
          continue;
        }
        const desired = Math.atan2(target.y - car.y, target.x - car.x);
        car.angle = angLerp(car.angle, desired, (1.9 + this.wanted * 0.4) * dt);
        let want = 195 + this.wanted * 28;
        if (d < 120) want = 50;
        car.speed = lerp(car.speed, want, 2.2 * dt);
        const c = Math.cos(car.angle);
        const s = Math.sin(car.angle);
        car.x += c * car.speed * dt;
        car.y += s * car.speed * dt;
        const res = this.city.resolveCircle(car.x, car.y, car.w * 0.6);
        if (res.hit) {
          car.x = res.x;
          car.y = res.y;
          car.speed *= 0.4;
        }
        // Cops only steer straight at the player, so one can get stuck behind a
        // block. Re-route it onto a nearby road after a few seconds.
        car.stuckT = car.speed < 30 ? (car.stuckT || 0) + dt : 0;
        if (car.stuckT > 3.5 && d > 260) {
          const pose = this.randomTrafficPose(target, 380, 760);
          if (pose) {
            car.x = pose.x;
            car.y = pose.y;
            car.angle = Math.atan2(pose.dir.y, pose.dir.x);
            car.speed = 150;
          }
          car.stuckT = 0;
        }
        car.shootCd -= dt;
        if (car.shootCd <= 0 && d < 440) {
          car.shootCd = 1.6;
          const a = Math.atan2(target.y - car.y, target.x - car.x) + rand(-0.09, 0.09);
          this.bullets.push({
            x: car.x + Math.cos(a) * 34,
            y: car.y + Math.sin(a) * 34,
            vx: Math.cos(a) * 640,
            vy: Math.sin(a) * 640,
            life: 0.8,
            owner: 'cop',
            dmg: 9,
          });
          this.audio.gunshot();
        }
      }
      this.cars = this.cars.filter((c) => !c.remove);
    },

    // ---------- peds ----------
    scarePeds(x, y, radius) {
      for (const ped of this.peds) {
        if (ped.down) continue;
        if (dist(ped.x, ped.y, x, y) < radius) {
          ped.scare = rand(2, 4);
          ped.scareX = x;
          ped.scareY = y;
        }
      }
    },

    pedDown(ped, car, byPlayer = false) {
      if (ped.down) return;
      ped.down = true;
      ped.downT = rand(4, 7);
      ped.grace = 4;
      ped.angle = car.angle + rand(-0.6, 0.6);
      this.spawnBurst(ped.x, ped.y, { count: 6, color: '#cbbfa6', speed: 70, life: 0.45, size: 4, type: 'dust' });
      this.audio.hurt();
      this.scarePeds(ped.x, ped.y, 190);
      if (byPlayer) {
        this.crime(1);
        this.opts.onCrime?.();
      }
    },

    updatePeds(dt) {
      const p = this.player;
      let removed = 0;
      for (const ped of this.peds) {
        if (ped.down) {
          ped.downT -= dt;
          if (ped.downT <= 0) {
            ped.down = false;
            ped.scare = rand(2, 3);
            ped.scareX = p.x;
            ped.scareY = p.y;
          }
          continue;
        }
        if (ped.grace > 0) ped.grace -= dt;
        if (dist(ped.x, ped.y, p.x, p.y) > 2100) {
          ped.remove = true;
          removed++;
          continue;
        }
        let speed = ped.speed;
        if (ped.scare > 0) {
          ped.scare -= dt;
          const a = Math.atan2(ped.y - ped.scareY, ped.x - ped.scareX);
          ped.angle = angLerp(ped.angle, a, 7 * dt);
          speed = 132;
        } else {
          if (dist(ped.x, ped.y, ped.target.x, ped.target.y) < 16) {
            ped.target.x = clamp(ped.x + rand(-120, 120), 30, WORLD - 30);
            ped.target.y = clamp(ped.y + rand(-120, 120), 30, WORLD - 30);
          }
          ped.angle = angLerp(ped.angle, Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x), 3 * dt);
        }
        ped.x += Math.cos(ped.angle) * speed * dt;
        ped.y += Math.sin(ped.angle) * speed * dt;
        const res = this.city.resolveCircle(ped.x, ped.y, 8);
        if (res.hit) {
          ped.x = res.x;
          ped.y = res.y;
          ped.target.x = clamp(ped.x + rand(-120, 120), 30, WORLD - 30);
          ped.target.y = clamp(ped.y + rand(-120, 120), 30, WORLD - 30);
        }
        ped.phase += dt * speed * 0.09;

        if (ped.grace <= 0) {
          for (const car of this.cars) {
            if (car.burned) continue;
            if (Math.abs(car.x - ped.x) > 90 || Math.abs(car.y - ped.y) > 90) continue;
            if (dist(car.x, car.y, ped.x, ped.y) < car.l * 0.42 && Math.abs(car.speed) > 55) {
              this.pedDown(ped, car, car === this.player.car);
              break;
            }
          }
        }
      }
      if (removed) this.peds = this.peds.filter((ped) => !ped.remove);
      for (let i = 0; i < removed; i++) this.spawnPedNear(p.x, p.y, 1200);
      if (this.peds.length < 44) this.spawnPedNear(p.x, p.y, 1000);
    },

    // ---------- damage, bullets, collisions ----------
    hitCar(car, dmg) {
      if (!car || car.burned) return;
      car.hp -= dmg;
      if (car.hp <= 0) {
        car.hp = 0;
        this.explodeCar(car);
      }
    },

    explodeCar(car) {
      if (car.burned) return;
      car.burned = true;
      car.speed = 0;
      car.driver = null;
      car.ai = null;
      if (car.marker) car.marker = false;
      this.spawnBurst(car.x, car.y, { count: 26, color: '#ffb347', speed: 280, life: 0.9, size: 7, type: 'fire' });
      this.spawnBurst(car.x, car.y, { count: 16, color: 'rgba(50,50,55,0.55)', speed: 120, life: 2.2, size: 12, type: 'smoke' });
      this.audio.explosion();
      this.shake = Math.max(this.shake, 15);
      for (const ped of this.peds) {
        if (!ped.down && dist(ped.x, ped.y, car.x, car.y) < 95) {
          this.pedDown(ped, { x: car.x, y: car.y, angle: rand(0, TAU), speed: 1 });
        }
      }
      for (const other of this.cars) {
        if (other !== car && !other.burned && dist(other.x, other.y, car.x, car.y) < 105) {
          this.hitCar(other, 45);
        }
      }
      if (this.player.car === car) {
        this.player.car = null;
        this.player.onFoot = true;
        this.player.x = car.x;
        this.player.y = car.y;
        this.damagePlayer(60);
      } else if (dist(this.player.x, this.player.y, car.x, car.y) < 100) {
        this.damagePlayer(28);
      }
    },

    updateCarCollisions() {
      const cars = this.cars;
      for (let i = 0; i < cars.length; i++) {
        const A = cars[i];
        for (let j = i + 1; j < cars.length; j++) {
          const B = cars[j];
          if (Math.abs(A.x - B.x) > 170 || Math.abs(A.y - B.y) > 170) continue;
          const ca = Math.cos(A.angle);
          const sa = Math.sin(A.angle);
          const cb = Math.cos(B.angle);
          const sb = Math.sin(B.angle);
          let hit = false;
          let ax = 0;
          let ay = 0;
          let bx = 0;
          let by = 0;
          for (const oa of [0.27, -0.27]) {
            for (const ob of [0.27, -0.27]) {
              const p1x = A.x + ca * A.l * oa;
              const p1y = A.y + sa * A.l * oa;
              const p2x = B.x + cb * B.l * ob;
              const p2y = B.y + sb * B.l * ob;
              const rr = (A.w + B.w) * 0.52;
              const dx = p2x - p1x;
              const dy = p2y - p1y;
              const d = Math.hypot(dx, dy);
              if (d < rr && d > 0.01) {
                hit = true;
                const push = (rr - d) * 0.5;
                ax -= (dx / d) * push;
                ay -= (dy / d) * push;
                bx += (dx / d) * push;
                by += (dy / d) * push;
              }
            }
          }
          if (!hit) continue;
          A.x += ax;
          A.y += ay;
          B.x += bx;
          B.y += by;
          const rel = Math.abs(A.speed) + Math.abs(B.speed);
          if (rel > 170 && A.hitCd <= 0 && B.hitCd <= 0) {
            A.hitCd = 0.4;
            B.hitCd = 0.4;
            A.speed *= 0.5;
            B.speed *= 0.5;
            this.hitCar(A, rel * 0.03);
            this.hitCar(B, rel * 0.03);
            if (A === this.player.car || B === this.player.car) {
              const other = A === this.player.car ? B : A;
              if (other.isPolice) this.crime(0.5);
              this.damagePlayer(rel * 0.006);
            }
            const mx = (A.x + B.x) / 2;
            const my = (A.y + B.y) / 2;
            this.spawnBurst(mx, my, { count: 7, color: '#ffcf7a', speed: 130, life: 0.4, size: 3, type: 'spark' });
            if (Math.random() < 0.4) this.audio.crash(clamp(rel / 700, 0.2, 1));
            this.shake = Math.max(this.shake, clamp(rel / 130, 1, 7));
          }
        }
      }
    },

    updateBullets(dt) {
      const p = this.player;
      for (const b of this.bullets) {
        b.life -= dt;
        if (b.life <= 0) continue;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (this.city.pointBlocked(b.x, b.y, 2)) {
          b.life = 0;
          this.spawnBurst(b.x, b.y, { count: 3, color: '#ffe2a8', speed: 80, life: 0.2, size: 2, type: 'spark' });
          continue;
        }
        if (b.owner === 'player') {
          let hit = false;
          for (const ped of this.peds) {
            if (ped.down) continue;
            if (dist(b.x, b.y, ped.x, ped.y) < 14) {
              this.pedDown(ped, { x: b.x, y: b.y, angle: Math.atan2(b.vy, b.vx), speed: 1 }, true);
              this.scarePeds(b.x, b.y, 220);
              b.life = 0;
              hit = true;
              break;
            }
          }
          if (hit) continue;
          for (const car of this.cars) {
            if (car === p.car || car.burned) continue;
            if (dist(b.x, b.y, car.x, car.y) < car.l * 0.44) {
              this.hitCar(car, b.dmg * 0.6);
              if (car.isPolice) this.crime(1);
              this.spawnBurst(b.x, b.y, { count: 4, color: '#ffcf7a', speed: 110, life: 0.25, size: 2.5, type: 'spark' });
              this.scarePeds(b.x, b.y, 180);
              b.life = 0;
              break;
            }
          }
        } else if (!p.onFoot && p.car) {
          if (dist(b.x, b.y, p.car.x, p.car.y) < p.car.l * 0.46) {
            this.hitCar(p.car, b.dmg);
            this.damagePlayer(b.dmg * 0.4);
            b.life = 0;
          }
        } else if (dist(b.x, b.y, p.x, p.y) < 14) {
          this.damagePlayer(b.dmg);
          b.life = 0;
        }
      }
      this.bullets = this.bullets.filter((b) => b.life > 0);
    },

    // ---------- heat ----------
    crime(n) {
      this.wanted = clamp(Math.ceil(this.wanted + n), 0, 5);
      this.heat = 0;
      this.decayTimer = 0;
      if (this.wanted > 0) this.copTimer = Math.min(this.copTimer, 0.4);
    },

    updateWanted(dt) {
      this.heat += dt;
      if (this.wanted <= 0) return;
      const focus = this.player.car || this.player;
      let nearest = 9999;
      for (const c of this.cars) {
        if (c.isPolice && !c.burned) nearest = Math.min(nearest, dist(c.x, c.y, focus.x, focus.y));
      }
      if (this.heat > 9 && nearest > 650) {
        this.decayTimer += dt;
        if (this.decayTimer > 5) {
          this.wanted = Math.max(0, this.wanted - 1);
          this.decayTimer = 0;
          if (this.wanted === 0) this.toast('HEAT CLEARED', 'You lost the cops.', 2.4);
        }
      } else {
        this.decayTimer = 0;
      }
    },

    // ---------- missions ----------
    missionTarget() {
      const m = this.mission;
      if (!m) return null;
      if (m.type === 'repo') {
        if (m.stage === 'steal') return m.car && !m.car.burned ? { x: m.car.x, y: m.car.y, icon: 'car' } : null;
        return m.dropoff ? { x: m.dropoff.x, y: m.dropoff.y, icon: 'drop' } : null;
      }
      if (m.type === 'courier') {
        let best = null;
        let bd = Infinity;
        for (const parcel of m.parcels) {
          if (parcel.taken) continue;
          const d = dist(parcel.x, parcel.y, this.player.x, this.player.y);
          if (d < bd) { bd = d; best = parcel; }
        }
        return best ? { x: best.x, y: best.y, icon: 'box' } : null;
      }
      return null;
    },

    pickDropoff(car) {
      for (let i = 0; i < 40; i++) {
        const p = this.city.randomRoadPoint();
        const d = dist(p.x, p.y, car.x, car.y);
        const dp = dist(p.x, p.y, this.player.x, this.player.y);
        if (d > 650 && d < 2100 && dp > 400) return p;
      }
      return this.city.randomRoadPoint();
    },

    startMission() {
      const p = this.player;
      this.missionCooldown = 6;
      if (Math.random() < 0.55) {
        const candidates = this.cars.filter((c) => !c.burned && c.driver === null && !c.isPolice && c !== p.car && !c.marker);
        let car = null;
        let bd = Infinity;
        for (const c of candidates) {
          const d = dist(c.x, c.y, p.x, p.y);
          if (d > 260 && d < 1800 && d < bd) { bd = d; car = c; }
        }
        if (!car) {
          const pose = this.city.randomRoadPoint();
          car = this.makeCar(pick(CAR_KINDS), pose.x, pose.y, 0);
        }
        car.marker = true;
        const reward = Math.round(rand(900, 1500) / 50) * 50;
        this.mission = {
          type: 'repo', stage: 'steal', car, reward,
          title: 'HOT WHEELS', desc: 'Steal the marked ride.',
          target: { x: car.x, y: car.y }, timer: 0,
        };
        this.toast('JOB OFFER', 'A client wants that marked car.', 3);
        this.audio.ping(620);
      } else {
        const parcels = [];
        for (let i = 0; i < 3; i++) {
          let pos = null;
          for (let t = 0; t < 40; t++) {
            const rp = this.city.randomRoadPoint();
            const d = dist(rp.x, rp.y, p.x, p.y);
            if (d > 260 && d < 1150 && !this.city.pointBlocked(rp.x, rp.y, 20)) { pos = rp; break; }
          }
          if (!pos) pos = this.city.randomRoadPoint();
          parcels.push({ x: pos.x, y: pos.y, taken: false, phase: rand(0, TAU) });
        }
        const reward = Math.round(rand(650, 1100) / 50) * 50;
        this.mission = {
          type: 'courier', stage: 'collect', parcels, collected: 0, reward,
          title: 'SPECIAL DELIVERY', desc: 'Collect 3 parcels.', timer: 150,
        };
        this.toast('JOB OFFER', 'Three parcels, and the clock is running.', 3);
        this.audio.ping(620);
      }
    },

    completeMission() {
      const m = this.mission;
      if (!m) return;
      if (m.car) m.car.marker = false;
      this.cash += m.reward;
      this.audio.mission();
      this.toast('MISSION PASSED', '+' + fmtMoney(m.reward), 3.4);
      this.spawnBurst(this.player.x, this.player.y - 10, {
        count: 22, color: '#ffe066', speed: 180, life: 1, size: 3.4, type: 'spark',
      });
      this.opts.onCash?.(this.cash);
      let prevBest = 0;
      try { prevBest = Number(localStorage.getItem('sunset-best') || 0) || 0; } catch (e) { /* ignore */ }
      const best = Math.max(prevBest, this.cash);
      try { localStorage.setItem('sunset-best', String(best)); } catch (e) { /* ignore */ }
      this.opts.onBest?.(best);
      this.mission = null;
      this.missionCooldown = 5;
    },

    failMission(reason) {
      if (!this.mission) return;
      if (this.mission.car) this.mission.car.marker = false;
      this.toast('MISSION FAILED', reason || 'Try again.', 3);
      this.mission = null;
      this.missionCooldown = 5;
    },

    updateMission(dt) {
      if (!this.mission) {
        this.missionCooldown -= dt;
        if (this.missionCooldown <= 0) this.startMission();
        return;
      }
      const m = this.mission;
      if (m.type === 'repo') {
        if (m.car && m.car.burned) { this.failMission('The car got wrecked.'); return; }
        if (m.stage === 'steal') {
          if (this.player.car === m.car) {
            m.stage = 'deliver';
            m.dropoff = this.pickDropoff(m.car);
            m.desc = 'Deliver the ride to the drop zone.';
            this.toast('NICE WORK', 'Now deliver it without wrecking it.', 2.8);
            this.audio.ping(720);
          }
        } else if (m.stage === 'deliver') {
          const d = dist(this.player.x, this.player.y, m.dropoff.x, m.dropoff.y);
          const speed = this.player.car ? Math.abs(this.player.car.speed) : 0;
          if (d < 72 && speed < 70) this.completeMission();
        }
      } else if (m.type === 'courier') {
        m.timer -= dt;
        if (m.timer <= 0) { this.failMission('Out of time.'); return; }
        for (const parcel of m.parcels) {
          if (parcel.taken) continue;
          if (dist(this.player.x, this.player.y, parcel.x, parcel.y) < 44) {
            parcel.taken = true;
            m.collected++;
            this.cash += 50;
            this.audio.ping(900);
            this.spawnBurst(parcel.x, parcel.y, { count: 12, color: '#7dffb0', speed: 120, life: 0.5, size: 3, type: 'spark' });
            this.toast('PARCEL SECURED', m.collected + ' / ' + m.parcels.length, 1.4);
            this.opts.onCash?.(this.cash);
          }
        }
        if (m.collected >= m.parcels.length) this.completeMission();
      }
    },

    // ---------- pickups + particles ----------
    updatePickups() {
      const p = this.player;
      for (const pk of this.pickups) {
        if (pk.taken) continue;
        if (dist(p.x, p.y, pk.x, pk.y) < 36) {
          pk.taken = true;
          this.cash += pk.value;
          this.audio.ping(1000);
          this.spawnBurst(pk.x, pk.y, { count: 9, color: '#ffe066', speed: 110, life: 0.5, size: 2.6, type: 'spark' });
          this.toast('CASH PICKED UP', '+' + fmtMoney(pk.value), 1.3);
          this.opts.onCash?.(this.cash);
          const np = this.randomStreetPoint(p.x, p.y, 500, 1600);
          if (np) {
            pk.x = np.x;
            pk.y = np.y;
            pk.value = Math.round(rand(40, 160) / 10) * 10;
            pk.taken = false;
          }
        }
      }
    },

    spawnBurst(x, y, opts = {}) {
      const count = opts.count ?? 8;
      const color = opts.color ?? '#fff';
      const speed = opts.speed ?? 120;
      const life = opts.life ?? 0.4;
      const size = opts.size ?? 3;
      const type = opts.type ?? 'spark';
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(speed * 0.25, speed);
        this.particles.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: rand(life * 0.5, life),
          max: life,
          size: rand(size * 0.5, size),
          color,
          type,
          angle: a,
        });
      }
    },

    spawnSmoke(x, y, scale = 1) {
      this.particles.push({
        x: x + rand(-8, 8),
        y: y + rand(-8, 8),
        vx: rand(-12, 12),
        vy: rand(-30, -14),
        life: rand(1, 2),
        max: 2,
        size: rand(5, 10) * scale,
        color: 'rgba(52,52,58,0.5)',
        type: 'smoke',
        angle: 0,
      });
    },

    spawnSkid(car) {
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      for (const side of [-1, 1]) {
        this.particles.push({
          x: car.x - c * car.l * 0.32 - s * side * car.w * 0.42 + rand(-2, 2),
          y: car.y - s * car.l * 0.32 + c * side * car.w * 0.42 + rand(-2, 2),
          vx: 0, vy: 0,
          life: 2.4, max: 2.4,
          size: 4.5,
          color: 'rgba(18,18,22,0.5)',
          type: 'skid',
          angle: car.angle,
        });
      }
    },

    updateParticles(dt) {
      for (const p of this.particles) {
        p.life -= dt;
        if (p.type === 'skid') continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === 'smoke' || p.type === 'fire') {
          p.vx *= 1 - 1.2 * dt;
          p.vy *= 1 - 1.2 * dt;
          p.size += dt * 9;
        } else {
          p.vx *= 1 - 3 * dt;
          p.vy *= 1 - 3 * dt;
        }
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      if (this.particles.length > 520) this.particles.splice(0, this.particles.length - 520);
    },
  });
}
