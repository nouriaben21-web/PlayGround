import { WORLD, clamp, roundRect, shade } from './world.js';
import { TAU, CAR_TYPES, dist } from './defs.js';

export function installRender(Game) {
  Object.assign(Game.prototype, {
    render() {
      const ctx = this.ctx;
      const { cssW, cssH, dpr } = this;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#191b20';
      ctx.fillRect(0, 0, cssW, cssH);

      const shakeX = (Math.random() - 0.5) * this.shake;
      const shakeY = (Math.random() - 0.5) * this.shake;

      ctx.save();
      ctx.translate(cssW / 2 + shakeX, cssH / 2 + shakeY);
      ctx.scale(this.cam.zoom, this.cam.zoom);
      ctx.translate(-this.cam.x, -this.cam.y);

      const zoom = this.cam.zoom;
      const view = {
        x: this.cam.x - cssW / (2 * zoom) - 60,
        y: this.cam.y - cssH / (2 * zoom) - 60,
        w: cssW / zoom + 120,
        h: cssH / zoom + 120,
      };
      this.view = view;

      this.drawGroundCached(ctx, view);
      this.drawSkids(ctx, view);
      this.drawMissionMarkers(ctx, view);
      this.drawPickups(ctx, view);

      for (const car of this.cars) {
        if (car.x < view.x - 90 || car.x > view.x + view.w + 90) continue;
        if (car.y < view.y - 90 || car.y > view.y + view.h + 90) continue;
        this.drawCar(ctx, car, this.time);
      }
      for (const ped of this.peds) {
        if (!ped.down) continue;
        if (ped.x < view.x - 40 || ped.x > view.x + view.w + 40) continue;
        if (ped.y < view.y - 40 || ped.y > view.y + view.h + 40) continue;
        this.drawPed(ctx, ped);
      }
      for (const ped of this.peds) {
        if (ped.down) continue;
        if (ped.x < view.x - 40 || ped.x > view.x + view.w + 40) continue;
        if (ped.y < view.y - 40 || ped.y > view.y + view.h + 40) continue;
        this.drawPed(ctx, ped);
      }

      if (this.state !== 'menu' && this.player.onFoot) this.drawPlayer(ctx);
      this.drawBullets(ctx);
      this.drawParticles(ctx);

      ctx.restore();

      if (this.state !== 'menu') this.drawObjectiveArrow();
      this.drawScreenFX();
    },

    // The city is static, so paint it into a viewport-sized offscreen buffer and
    // blit that each frame. Rebuilding it costs tens of milliseconds; blitting
    // costs a fraction of one. This matters a lot for software-rendered browsers.
    drawGroundCached(ctx, view) {
      // Render the static layer at the current zoom so the per-frame blit is
      // close to a 1:1 pixel copy instead of an expensive full-screen rescale.
      const zoom = Math.round(this.cam.zoom * 16) / 16;
      let scale = this.dpr * zoom;
      const margin = 320;
      const need = {
        x: view.x - margin,
        y: view.y - margin,
        w: view.w + margin * 2,
        h: view.h + margin * 2,
      };
      const maxPixels = 6_000_000;
      if (need.w * need.h * scale * scale > maxPixels) {
        scale = Math.sqrt(maxPixels / (need.w * need.h));
      }
      let cache = this.groundCache;
      const stale = !cache
        || cache.scale !== scale
        || need.x < cache.x || need.y < cache.y
        || need.x + need.w > cache.x + cache.w
        || need.y + need.h > cache.y + cache.h;

      if (stale) {
        if (!cache) {
          cache = this.groundCache = { canvas: document.createElement('canvas') };
        }
        cache.x = need.x;
        cache.y = need.y;
        cache.w = need.w;
        cache.h = need.h;
        cache.scale = scale;
        cache.canvas.width = Math.max(1, Math.ceil(need.w * scale));
        cache.canvas.height = Math.max(1, Math.ceil(need.h * scale));
        const g = cache.canvas.getContext('2d');
        g.setTransform(scale, 0, 0, scale, -need.x * scale, -need.y * scale);
        this.city.drawGround(g, need);
      }

      ctx.save();
      ctx.imageSmoothingEnabled = Math.abs(cache.scale - this.dpr * this.cam.zoom) > 0.05;
      // Crop to the visible part of the buffer. This keeps the per-frame blit
      // close to 1:1 instead of asking the compositor to rescale the whole
      // oversized buffer every frame.
      const sx = (view.x - cache.x) * cache.scale;
      const sy = (view.y - cache.y) * cache.scale;
      const sw = Math.min(cache.canvas.width - sx, view.w * cache.scale);
      const sh = Math.min(cache.canvas.height - sy, view.h * cache.scale);
      ctx.drawImage(cache.canvas, sx, sy, sw, sh, view.x, view.y, sw / cache.scale, sh / cache.scale);
      ctx.restore();
    },

    drawCar(ctx, car, time) {
      const t = CAR_TYPES[car.kind] || CAR_TYPES.sedan;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);

      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      roundRect(ctx, -car.l / 2 + 6, -car.w / 2 + 8, car.l, car.w, 11);
      ctx.fill();

      // wheels
      ctx.fillStyle = '#131519';
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          roundRect(ctx, sx * car.l * 0.27 - 6, sy * car.w * 0.5 - 4, 13, 8, 2);
          ctx.fill();
        }
      }

      const body = car.burned ? '#38332e' : car.color;
      ctx.fillStyle = body;
      roundRect(ctx, -car.l / 2, -car.w / 2, car.l, car.w, car.kind === 'van' ? 5 : 10);
      ctx.fill();

      if (!car.burned) {
        // lower-body shading
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        roundRect(ctx, -car.l / 2 + 2, 1, car.l - 4, car.w / 2 - 3, 6);
        ctx.fill();

        // roof
        ctx.fillStyle = shade(car.color, -34);
        roundRect(ctx, -car.l * 0.24, -car.w * 0.36, car.l * 0.5, car.w * 0.72, 7);
        ctx.fill();

        // windscreens
        ctx.fillStyle = 'rgba(22,32,46,0.88)';
        roundRect(ctx, car.l * 0.10, -car.w * 0.31, car.l * 0.14, car.w * 0.62, 3);
        ctx.fill();
        roundRect(ctx, -car.l * 0.36, -car.w * 0.29, car.l * 0.10, car.w * 0.58, 3);
        ctx.fill();

        // roof rim
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1.2;
        roundRect(ctx, -car.l * 0.23, -car.w * 0.35, car.l * 0.48, car.w * 0.7, 6);
        ctx.stroke();

        // headlights / tail lights
        ctx.fillStyle = 'rgba(255,236,170,0.95)';
        ctx.fillRect(car.l / 2 - 3, -car.w / 2 + 5, 3, 7);
        ctx.fillRect(car.l / 2 - 3, car.w / 2 - 12, 3, 7);
        ctx.fillStyle = 'rgba(255,70,60,0.95)';
        ctx.fillRect(-car.l / 2, -car.w / 2 + 5, 3, 6);
        ctx.fillRect(-car.l / 2, car.w / 2 - 11, 3, 6);
      }

      if (car.kind === 'taxi' && !car.burned) {
        ctx.fillStyle = '#23252b';
        roundRect(ctx, -7, -5, 14, 10, 2);
        ctx.fill();
        ctx.fillStyle = '#ffd54a';
        ctx.fillRect(-5, -3, 10, 6);
      }

      if (car.isPolice && !car.burned) {
        // High-contrast black-and-white livery.
        ctx.fillStyle = '#1d2531';
        roundRect(ctx, -car.l * 0.31, -car.w / 2 + 2, car.l * 0.19, car.w - 4, 3);
        ctx.fill();
        roundRect(ctx, car.l * 0.12, -car.w / 2 + 2, car.l * 0.17, car.w - 4, 3);
        ctx.fill();
        ctx.fillStyle = 'rgba(80,135,255,0.9)';
        ctx.fillRect(-car.l * 0.32, -car.w / 2 + 2, car.l * 0.64, 2.5);
        ctx.fillRect(-car.l * 0.32, car.w / 2 - 4.5, car.l * 0.64, 2.5);

        // Roof badge.
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = 'bold 8px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('POLICE', -2, 1);

        // Wide light bar across the roof. A soft painted halo keeps the retro
        // look without the huge cost of a blurred shadow on software canvas.
        const flash = Math.sin(time * 16 + car.id) > 0;
        const bx = 7;
        const by = -car.w / 2 + 3;
        const bh = car.w - 6;
        ctx.fillStyle = '#14161c';
        roundRect(ctx, bx, by, 12, bh, 3);
        ctx.fill();
        ctx.fillStyle = flash ? 'rgba(255,59,78,0.20)' : 'rgba(77,125,255,0.20)';
        roundRect(ctx, bx - 5, by - 4, 22, bh + 8, 6);
        ctx.fill();
        ctx.fillStyle = flash ? '#ff3b4e' : '#ffb3ba';
        roundRect(ctx, bx + 2, by + 2, 8, bh / 2 - 3, 2);
        ctx.fill();
        ctx.fillStyle = flash ? '#9db9ff' : '#4d7dff';
        roundRect(ctx, bx + 2, by + bh / 2 + 1, 8, bh / 2 - 3, 2);
        ctx.fill();
      }
      ctx.restore();
    },

    drawPed(ctx, ped) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      if (ped.down) {
        ctx.rotate(ped.angle);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(3, 4, 17, 9, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = ped.color;
        roundRect(ctx, -13, -7, 26, 14, 7);
        ctx.fill();
        ctx.fillStyle = ped.skin;
        ctx.beginPath();
        ctx.arc(11, 0, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
      }
      const bob = Math.sin(ped.phase) * 1.2;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(3, 5, 9, 6, 0, 0, TAU);
      ctx.fill();

      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.arc(0, bob, 7.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(-2, bob - 2, 4, 0, TAU);
      ctx.fill();

      const hx = Math.cos(ped.angle) * 2.4;
      const hy = Math.sin(ped.angle) * 2.4;
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(hx, hy + bob, 4.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2a2420';
      ctx.beginPath();
      ctx.arc(hx - Math.cos(ped.angle) * 1.6, hy - Math.sin(ped.angle) * 1.6 + bob, 3.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    },

    drawPlayer(ctx) {
      const p = this.player;
      ctx.save();
      ctx.translate(p.x, p.y);

      // ground ring
      ctx.strokeStyle = 'rgba(255,186,84,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,186,84,0.18)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,0.34)';
      ctx.beginPath();
      ctx.ellipse(3, 6, 11, 7.5, 0, 0, TAU);
      ctx.fill();

      const bob = Math.sin(p.walk) * 1.3;
      const side = p.angle + Math.PI / 2;
      const sx = Math.cos(side);
      const sy = Math.sin(side);

      // arms
      ctx.fillStyle = '#d8532a';
      for (const o of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sx * o * 7, sy * o * 7 + bob, 3.2, 0, TAU);
        ctx.fill();
      }

      // torso
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.arc(0, bob, 9.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,18,10,0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.beginPath();
      ctx.arc(-2.6, bob - 2.6, 4.2, 0, TAU);
      ctx.fill();

      // head and hair
      const hx = Math.cos(p.angle) * 2.4;
      const hy = Math.sin(p.angle) * 2.4;
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(hx, hy + bob, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#241f1b';
      ctx.beginPath();
      ctx.arc(hx - Math.cos(p.angle) * 2.4, hy - Math.sin(p.angle) * 2.4 + bob, 4, 0, TAU);
      ctx.fill();

      // arm + pistol toward aim
      ctx.strokeStyle = '#2b2b31';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(p.aim) * 6, Math.sin(p.aim) * 6);
      ctx.lineTo(Math.cos(p.aim) * 16, Math.sin(p.aim) * 16);
      ctx.stroke();
      ctx.fillStyle = '#ffcf7a';
      ctx.beginPath();
      ctx.arc(Math.cos(p.aim) * 17, Math.sin(p.aim) * 17, 1.7, 0, TAU);
      ctx.fill();

      // you-marker
      const my = -28 + Math.sin(this.time * 4) * 2;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.shadowColor = 'rgba(255,180,80,0.9)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(-5, my - 6);
      ctx.lineTo(5, my - 6);
      ctx.lineTo(0, my + 2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();
    },

    drawBullets(ctx) {
      ctx.save();
      ctx.lineCap = 'round';
      for (const b of this.bullets) {
        const len = 16;
        const nl = Math.hypot(b.vx, b.vy) || 1;
        ctx.strokeStyle = b.owner === 'player' ? 'rgba(255,240,170,0.95)' : 'rgba(255,150,120,0.95)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - (b.vx / nl) * len, b.y - (b.vy / nl) * len);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawPickups(ctx, view) {
      for (const pk of this.pickups) {
        if (pk.taken) continue;
        if (pk.x < view.x - 30 || pk.x > view.x + view.w + 30) continue;
        if (pk.y < view.y - 30 || pk.y > view.y + view.h + 30) continue;
        const bob = Math.sin(this.time * 3 + pk.phase) * 3;
        ctx.save();
        ctx.translate(pk.x, pk.y + bob);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(2, 8, 10, 5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2f9e5f';
        roundRect(ctx, -9, -9, 18, 18, 5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,255,210,0.7)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.fillStyle = '#d9ffe6';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 1);
        ctx.restore();
      }
    },

    drawMissionMarkers(ctx, view) {
      const target = this.missionTarget();
      const m = this.mission;
      if (!m) return;

      if (m.type === 'courier') {
        for (const parcel of m.parcels) {
          if (parcel.taken) continue;
          this.drawMarker(ctx, parcel.x, parcel.y, '#7dffb0', 'box', 0.72);
        }
        return;
      }
      if (!target) return;
      const delivering = m.type === 'repo' && m.stage === 'deliver';
      this.drawMarker(ctx, target.x, target.y, delivering ? '#6ee7ff' : '#ffd166', target.icon, delivering ? 1 : 0.9);
    },

    drawMarker(ctx, x, y, color, icon, scale = 1) {
      const pulse = (this.time * 0.8) % 1;
      const bob = Math.sin(this.time * 3) * 5;
      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = 0.9;

      // ground rings
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 38 * scale, 24 * scale, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.45 * (1 - pulse);
      ctx.beginPath();
      ctx.ellipse(0, 0, (38 + pulse * 40) * scale, (24 + pulse * 25) * scale, 0, 0, TAU);
      ctx.stroke();

      // beam
      ctx.globalAlpha = 0.5;
      const grad = ctx.createLinearGradient(0, -150 * scale, 0, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.moveTo(-14 * scale, 0);
      ctx.lineTo(-5 * scale, -150 * scale);
      ctx.lineTo(5 * scale, -150 * scale);
      ctx.lineTo(14 * scale, 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';

      // icon
      ctx.globalAlpha = 1;
      ctx.translate(0, -86 * scale + bob);
      ctx.fillStyle = color;
      if (icon === 'box') {
        roundRect(ctx, -10, -10, 20, 20, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(10, 0);
        ctx.moveTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.stroke();
      } else if (icon === 'car') {
        roundRect(ctx, -14, -8, 28, 16, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(20,20,24,0.55)';
        ctx.fillRect(-6, -5, 12, 10);
      } else {
        // down chevron
        ctx.beginPath();
        ctx.moveTo(-12, -8);
        ctx.lineTo(12, -8);
        ctx.lineTo(0, 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },

    drawSkids(ctx, view) {
      for (const p of this.particles) {
        if (p.type !== 'skid') continue;
        if (p.x < view.x - 20 || p.x > view.x + view.w + 20) continue;
        if (p.y < view.y - 20 || p.y > view.y + view.h + 20) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.55;
        ctx.fillStyle = p.color;
        ctx.fillRect(-7, -p.size / 2, 14, p.size);
        ctx.restore();
      }
    },

    drawParticles(ctx) {
      for (const p of this.particles) {
        if (p.type === 'skid') continue;
        const a = Math.max(0, p.life / p.max);
        ctx.save();
        ctx.globalAlpha = p.type === 'smoke' ? a * 0.55 : a;
        ctx.fillStyle = p.color;
        if (p.type === 'smoke') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        } else if (p.type === 'spark') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * a + 0.6, 0, TAU);
          ctx.fill();
        } else if (p.type === 'fire') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + a * 0.6), 0, TAU);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    },

    drawObjectiveArrow() {
      if (!this.mission) return;
      const target = this.missionTarget();
      if (!target) return;
      const ctx = this.ctx;
      const s = this.worldToScreen(target.x, target.y);
      const m = 74;
      const inside = s.x > m && s.x < this.cssW - m && s.y > m && s.y < this.cssH - m;
      if (inside) {
        // floating distance bubble above the objective
        const d = Math.round(dist(target.x, target.y, this.player.x, this.player.y) / 10);
        ctx.save();
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const label = d + ' m';
        const w = ctx.measureText(label).width + 18;
        ctx.fillStyle = 'rgba(12,14,20,0.72)';
        roundRect(ctx, s.x - w / 2, s.y - 190, w, 22, 11);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        ctx.fillText(label, s.x, s.y - 175);
        ctx.restore();
        return;
      }
      const cx = this.cssW / 2;
      const cy = this.cssH / 2;
      const angle = Math.atan2(s.y - cy, s.x - cx);
      const px = clamp(s.x, m, this.cssW - m);
      const py = clamp(s.y, m, this.cssH - m);
      const d = Math.round(dist(target.x, target.y, this.player.x, this.player.y) / 10);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.shadowColor = 'rgba(255,200,90,0.8)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-10, -11);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-10, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(d + ' m', px - Math.cos(angle) * 30, py - Math.sin(angle) * 30);
      ctx.restore();
    },

    drawScreenFX() {
      if (this.state === 'menu') return;
      const ui = this.ui();
      const damage = Math.min(1, this.damageFlash * 1.15);
      if (ui.damageFx && Math.abs((this._lastDamageFx || 0) - damage) > 0.02) {
        this._lastDamageFx = damage;
        ui.damageFx.style.opacity = damage.toFixed(2);
      }
    },
  });
}
