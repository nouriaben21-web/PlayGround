import { WORLD, CELL, ROAD_HALF, clamp } from './world.js';
import { TAU, dist } from './defs.js';

export function installHud(Game) {
  Object.assign(Game.prototype, {
    ui() {
      if (!this._ui) {
        const byId = (id) => document.getElementById(id);
        this._ui = {
          hud: byId('hud'),
          healthFill: byId('healthFill'),
          healthText: byId('healthText'),
          cash: byId('cash'),
          stars: byId('stars'),
          speedo: byId('speedo'),
          speedVal: byId('speedVal'),
          mission: byId('mission'),
          missionTitle: byId('missionTitle'),
          missionDesc: byId('missionDesc'),
          missionMeta: byId('missionMeta'),
          prompt: byId('prompt'),
          toast: byId('toast'),
          toastTitle: byId('toastTitle'),
          toastSub: byId('toastSub'),
          minimap: byId('minimap'),
          damageFx: byId('damageFx'),
        };
      }
      return this._ui;
    },

    toast(title, sub = '', t = 2.4) {
      this.toastT = t;
      const ui = this.ui();
      if (!ui.toast) return;
      ui.toastTitle.textContent = title;
      ui.toastSub.textContent = sub;
      ui.toast.classList.add('show');
    },

    updateToast(dt) {
      if (this.toastT <= 0) return;
      this.toastT -= dt;
      if (this.toastT <= 0) {
        const ui = this.ui();
        if (ui.toast) ui.toast.classList.remove('show');
      }
    },

    updateHUD() {
      const ui = this.ui();
      if (!ui.healthFill) return;
      const health = clamp(this.player.health, 0, 100);
      ui.healthFill.style.width = health + '%';
      ui.healthFill.classList.toggle('low', health < 32);
      if (this._lastHealth !== Math.ceil(health)) {
        this._lastHealth = Math.ceil(health);
        ui.healthText.textContent = this._lastHealth;
      }

      if (this._lastCash !== this.cash) {
        this._lastCash = this.cash;
        ui.cash.textContent = '$' + this.cash.toLocaleString('en-US');
        ui.cash.classList.add('bump');
        setTimeout(() => ui.cash.classList.remove('bump'), 220);
      }

      if (this._lastWanted !== this.wanted) {
        this._lastWanted = this.wanted;
        ui.stars.innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < this.wanted ? 'on' : ''}">★</i>`).join('');
        ui.stars.classList.toggle('active', this.wanted > 0);
      }

      const inCar = !this.player.onFoot && !!this.player.car;
      const kmh = inCar ? Math.round(Math.abs(this.player.car.speed) * 0.36) : 0;
      ui.speedo.classList.toggle('on', inCar);
      if (this._lastSpeed !== kmh) {
        this._lastSpeed = kmh;
        ui.speedVal.textContent = kmh;
      }

      const m = this.mission;
      if (!m) {
        ui.mission.classList.add('hidden');
      } else {
        ui.mission.classList.remove('hidden');
        if (this._lastMission !== m || this._lastDesc !== m.desc) {
          this._lastMission = m;
          this._lastDesc = m.desc;
          ui.missionTitle.textContent = m.title;
          ui.missionDesc.textContent = m.desc;
        }
        const target = this.missionTarget();
        const d = target ? Math.round(dist(target.x, target.y, this.player.x, this.player.y) / 10) : 0;
        const meta = m.type === 'courier'
          ? `${Math.max(0, Math.ceil(m.timer))}s · ${m.collected}/${m.parcels.length}`
          : `${d} m`;
        if (this._lastMeta !== meta) {
          this._lastMeta = meta;
          ui.missionMeta.textContent = meta;
        }
      }

      let prompt = '';
      if (this.state === 'playing') {
        if (this.player.onFoot) {
          if (this.nearestCar(100)) prompt = this.input.touch ? 'TAP ENTER TO GRAB THE RIDE' : 'E — ENTER VEHICLE';
        } else if (this.player.car && Math.abs(this.player.car.speed) < 110) {
          prompt = this.input.touch ? 'TAP ENTER TO GET OUT' : 'E — EXIT VEHICLE';
        }
      }
      if (this._lastPrompt !== prompt) {
        this._lastPrompt = prompt;
        ui.prompt.textContent = prompt;
        ui.prompt.classList.toggle('show', !!prompt);
      }

      this.drawMinimap();
    },

    drawMinimap() {
      const ui = this.ui();
      const canvas = ui.minimap;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const R = W / 2;
      const focus = this.player.car || this.player;
      const range = 780;
      const scale = R / range;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, W);
      ctx.save();
      ctx.beginPath();
      ctx.arc(R, R, R - 3, 0, TAU);
      ctx.clip();
      ctx.fillStyle = '#343842';
      ctx.fillRect(0, 0, W, W);

      ctx.save();
      ctx.translate(R, R);
      ctx.scale(scale, scale);
      ctx.translate(-focus.x, -focus.y);

      const i0 = Math.max(0, Math.floor((focus.x - range) / CELL) - 1);
      const i1 = Math.min(CELL * 8, Math.ceil((focus.x + range) / CELL) + 1);
      const j0 = Math.max(0, Math.floor((focus.y - range) / CELL) - 1);
      const j1 = Math.min(CELL * 8, Math.ceil((focus.y + range) / CELL) + 1);

      ctx.strokeStyle = '#22252c';
      ctx.lineWidth = ROAD_HALF * 2;
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) {
        if (i * CELL < 0 || i * CELL > WORLD) continue;
        ctx.moveTo(i * CELL, focus.y - range);
        ctx.lineTo(i * CELL, focus.y + range);
      }
      for (let j = j0; j <= j1; j++) {
        if (j * CELL < 0 || j * CELL > WORLD) continue;
        ctx.moveTo(focus.x - range, j * CELL);
        ctx.lineTo(focus.x + range, j * CELL);
      }
      ctx.stroke();

      // city blocks
      ctx.fillStyle = '#3f444f';
      for (const block of this.city.blocks) {
        if (block.type === 'park') continue;
        if (block.x < focus.x - range || block.x > focus.x + range) continue;
        if (block.y < focus.y - range || block.y > focus.y + range) continue;
        ctx.fillRect(block.x, block.y, block.w, block.h);
      }

      // parks
      ctx.fillStyle = '#3f5a45';
      for (const block of this.city.blocks) {
        if (block.type !== 'park') continue;
        if (block.x < focus.x - range || block.x > focus.x + range) continue;
        if (block.y < focus.y - range || block.y > focus.y + range) continue;
        ctx.fillRect(block.x, block.y, block.w, block.h);
      }

      // traffic
      ctx.fillStyle = 'rgba(210,214,224,0.45)';
      for (const car of this.cars) {
        if (car.isPolice || car === this.player.car || car.burned) continue;
        if (dist(car.x, car.y, focus.x, focus.y) > range) continue;
        ctx.fillRect(car.x - 14, car.y - 14, 28, 28);
      }

      // cops
      ctx.fillStyle = '#ff4d5e';
      for (const car of this.cars) {
        if (!car.isPolice || car.burned) continue;
        if (dist(car.x, car.y, focus.x, focus.y) > range) continue;
        ctx.beginPath();
        ctx.arc(car.x, car.y, 26, 0, TAU);
        ctx.fill();
      }

      // mission target
      const target = this.missionTarget();
      if (target) {
        const dx = target.x - focus.x;
        const dy = target.y - focus.y;
        const d = Math.hypot(dx, dy);
        const maxR = range * 0.82;
        const k = d > maxR ? maxR / d : 1;
        const px = focus.x + dx * k;
        const py = focus.y + dy * k;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(px, py, 32, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,26,0.8)';
        ctx.lineWidth = 8;
        ctx.stroke();
      }

      // player arrow
      ctx.save();
      ctx.translate(focus.x, focus.y);
      ctx.rotate((this.player.car ? this.player.car.angle : this.player.angle) + Math.PI / 2);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(0, -64);
      ctx.lineTo(42, 46);
      ctx.lineTo(0, 24);
      ctx.lineTo(-42, 46);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,20,26,0.8)';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(R, R, R - 3, 0, TAU);
      ctx.stroke();
    },
  });
}
