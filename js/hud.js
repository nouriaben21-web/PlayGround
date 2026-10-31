export class HUD {
  constructor(game) {
    this.game = game
    const $ = id => document.getElementById(id)
    this.el = {
      money: $('money'),
      wanted: $('wanted'),
      weaponName: $('weapon-name'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
      ammo: $('ammo'),
      objective: $('objective'),
      objTitle: $('obj-title'),
      objText: $('obj-text'),
      timer: $('timer'),
      radar: $('radar'),
      hpfill: $('hpfill'),
      armorfill: $('armorfill'),
      hpbar: document.querySelector('.bar.hp'),
      speedo: $('speedo'),
      speedNum: $('speed-num'),
      gear: $('gear'),
      crosshair: $('crosshair'),
      prompt: $('prompt'),
      promptKey: $('prompt-key'),
      promptText: $('prompt-text'),
      toasts: $('toasts'),
      splash: $('mission-splash'),
      splashTitle: $('splash-title'),
      splashBrief: $('splash-brief'),
      banner: $('mission-banner'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      damage: $('damage-flash'),
      wasted: $('wasted'),
      wastedSub: $('wasted-sub'),
      pause: $('pause'),
      hint: $('hint'),
      statMissions: $('stat-missions'),
      statMoney: $('stat-money'),
      statWanted: $('stat-wanted'),
      rotate: $('rotate-hint')
    }
    this.ctx = this.el.radar.getContext('2d')
    this.marker = null
    this.timerVal = null
    this.driving = false
    this.money = 0
    this.wanted = 0
    this.splashTimer = null
    this.bannerTimer = null
    this.promptShown = null
    this.lastRadar = 0
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

    // wanted stars
    this.stars = []
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span')
      s.className = 'star'
      s.textContent = '★'
      this.el.wanted.appendChild(s)
      this.stars.push(s)
    }

    if (this.touch) {
      const h = document.getElementById('hint')
      if (h) h.textContent = 'DRAG TO LOOK · STICK TO MOVE · TAP FIRE'
    } else {
      this.el.hint.textContent = 'WASD MOVE · MOUSE LOOK · F ENTER CAR · CLICK SHOOT · ESC PAUSE'
    }
  }

  setMoney(v) {
    this.money = v
    this.el.money.textContent = '$' + Math.max(0, Math.round(v)).toLocaleString('en-US')
    this.el.statMoney.textContent = this.el.money.textContent
  }

  setWanted(n, pulse = false) {
    this.wanted = n
    this.stars.forEach((s, i) => s.classList.toggle('on', i < n))
    this.el.statWanted.textContent = n > 0 ? '★'.repeat(n) : 'CLEAN'
    if (pulse && n > 0) {
      document.body.classList.add('wanted-pulse')
      clearTimeout(this.wantedTimer)
      this.wantedTimer = setTimeout(() => document.body.classList.remove('wanted-pulse'), 500)
    }
  }

  setObjective(title, text, timer) {
    if (!title) { this.el.objective.classList.add('hidden'); return }
    this.el.objective.classList.remove('hidden')
    if (this.el.objTitle.textContent !== title) this.el.objTitle.textContent = title
    if (this.el.objText.textContent !== text) this.el.objText.textContent = text
    if (timer !== undefined) this.setTimer(timer)
  }

  setTimer(sec) {
    if (sec === null || sec === undefined) {
      this.el.timer.classList.add('hidden')
      this.timerVal = null
      return
    }
    this.el.timer.classList.remove('hidden')
    const s = Math.max(0, Math.ceil(sec))
    const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    if (this.el.timer.textContent !== txt) this.el.timer.textContent = txt
    this.el.timer.classList.toggle('hurry', s <= 10)
  }

  setRadarMarker(m) { this.marker = m }

  setDriving(b) {
    this.driving = b
    this.el.speedo.classList.toggle('hidden', !b)
    if (!b) this.el.crosshair.classList.add('hidden')
  }

  setSpeed(mph) {
    if (!this.driving) return
    const v = Math.round(Math.abs(mph))
    if (this.el.speedNum.textContent !== String(v)) this.el.speedNum.textContent = String(v)
  }

  setGear(g) { if (this.el.gear.textContent !== g) this.el.gear.textContent = g }

  setWeapon(name, mag, reserve) {
    this.el.weaponName.textContent = name
    this.el.ammoMag.textContent = mag
    this.el.ammoReserve.textContent = reserve
    this.el.ammo.classList.toggle('low', mag <= 3)
  }

  setCrosshair(mode) {
    const show = mode !== 'hidden' && !this.driving
    this.el.crosshair.classList.toggle('hidden', !show)
    this.el.crosshair.classList.toggle('aim', mode === 'aim')
  }

  setPrompt(text, key = 'F') {
    if (!text) {
      this.el.prompt.classList.add('hidden')
      this.promptShown = null
      return
    }
    if (this.promptShown === text) return
    this.promptShown = text
    this.el.prompt.classList.remove('hidden')
    this.el.promptKey.textContent = key
    this.el.promptText.textContent = text
  }

  flashDamage(intensity = 1) {
    this.el.damage.style.opacity = String(Math.min(0.85, 0.35 + intensity * 0.3))
    clearTimeout(this.damageTimer)
    this.damageTimer = setTimeout(() => { this.el.damage.style.opacity = '0' }, 120)
  }

  notify(text, color = '#f6c453') {
    const d = document.createElement('div')
    d.className = 'toast'
    d.textContent = text
    d.style.borderLeftColor = color
    this.el.toasts.appendChild(d)
    while (this.el.toasts.children.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild)
    setTimeout(() => {
      d.classList.add('out')
      setTimeout(() => d.remove(), 450)
    }, 2600)
  }

  missionSplash(title, brief) {
    clearTimeout(this.splashTimer)
    this.el.splash.classList.remove('hidden', 'out')
    this.el.splashTitle.textContent = title
    this.el.splashBrief.textContent = brief
    this.splashTimer = setTimeout(() => {
      this.el.splash.classList.add('out')
      this.splashTimer = setTimeout(() => this.el.splash.classList.add('hidden'), 600)
    }, 3600)
  }

  clearToasts() {
    if (this.el.toasts) this.el.toasts.replaceChildren()
  }

  missionComplete(title, reward) {
    this.showBanner('MISSION PASSED', `+$${Math.round(reward).toLocaleString('en-US')} · ${title}`, '#f6c453')
    this.notify('MISSION PASSED: ' + title, '#8dffb0')
  }

  missionFailed(reason) {
    this.showBanner('MISSION FAILED', reason, '#ff6a55')
  }

  showBanner(title, sub, color) {
    clearTimeout(this.bannerTimer)
    this.el.banner.classList.remove('hidden')
    this.el.bannerTitle.textContent = title
    this.el.bannerTitle.style.color = color
    this.el.bannerSub.textContent = sub || ''
    this.bannerTimer = setTimeout(() => this.el.banner.classList.add('hidden'), 3400)
  }

  showWasted(loss) {
    this.el.wastedSub.textContent = `Medical bills: -$${loss}`
    this.el.wasted.classList.remove('hidden')
  }
  hideWasted() { this.el.wasted.classList.add('hidden') }

  showPause(show) {
    this.el.pause.classList.toggle('hidden', !show)
    if (show) {
      this.el.statMissions.textContent = String(this.game.missions.completed)
      this.el.statMoney.textContent = '$' + Math.round(this.game.money).toLocaleString('en-US')
      this.el.statWanted.textContent = this.game.police.wanted > 0 ? '★'.repeat(this.game.police.wanted) : 'CLEAN'
    }
  }

  setHintGone() { this.el.hint.classList.add('gone') }

  update(dt) {
    const p = this.game.player
    if (p) {
      this.el.hpfill.style.width = Math.max(0, Math.min(100, p.hp)) + '%'
      this.el.armorfill.style.width = Math.max(0, Math.min(100, p.armor)) + '%'
      this.el.hpbar.classList.toggle('low', p.hp < 30)
    }
    // radar at ~30fps
    this.lastRadar += dt
    if (this.lastRadar > 1 / 30) {
      this.lastRadar = 0
      this.drawRadar()
    }
  }

  toScreen(wx, wz, px, pz, cos, sin, scale, cx, cy) {
    const dx = wx - px, dz = wz - pz
    return [cx + (-dx * cos + dz * sin) * scale, cy - (dx * sin + dz * cos) * scale]
  }

  drawRadar() {
    const ctx = this.ctx
    const W = 360, cx = 180, cy = 180, R = 178
    const game = this.game
    const player = game.player
    if (!player) return
    const pv = game.playerVehicle
    const px = pv ? pv.pos.x : player.pos.x
    const pz = pv ? pv.pos.z : player.pos.z
    const camYaw = game.camYaw || 0
    const speed = pv ? Math.abs(pv.speed) : 0
    const scale = pv ? Math.max(1.25, 1.75 - speed * 0.012) : 1.85
    const cos = Math.cos(camYaw), sin = Math.sin(camYaw)

    ctx.clearRect(0, 0, W, W)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, R, 0, Math.PI * 2)
    ctx.clip()

    // base
    const bg = ctx.createRadialGradient(cx, cy, 20, cx, cy, R)
    bg.addColorStop(0, '#1a241f')
    bg.addColorStop(1, '#121917')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, W)

    ctx.save()
    ctx.translate(cx, cy)
    ctx.transform(-cos * scale, -sin * scale, sin * scale, -cos * scale, 0, 0)

    // blocks
    ctx.fillStyle = '#232d27'
    for (const b of game.world.blocks) {
      ctx.fillRect(b.x - px - b.w / 2, b.z - pz - b.d / 2, b.w, b.d)
    }
    // buildings
    ctx.fillStyle = '#33413a'
    for (const b of game.world.buildings) {
      if (Math.abs(b.x - px) > 260 || Math.abs(b.z - pz) > 260) continue
      ctx.fillRect(b.x - px - b.w / 2, b.z - pz - b.d / 2, b.w, b.d)
    }
    // roads
    ctx.strokeStyle = '#4b5453'
    ctx.lineWidth = 16
    ctx.lineCap = 'butt'
    for (const line of game.world.lines) {
      ctx.beginPath()
      ctx.moveTo(-220 - px, line - pz)
      ctx.lineTo(220 - px, line - pz)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(line - px, -220 - pz)
      ctx.lineTo(line - px, 220 - pz)
      ctx.stroke()
    }
    // center lines
    ctx.strokeStyle = '#7d7a5e'
    ctx.lineWidth = 0.5
    for (const line of game.world.lines) {
      ctx.beginPath()
      ctx.moveTo(-220 - px, line - pz)
      ctx.lineTo(220 - px, line - pz)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(line - px, -220 - pz)
      ctx.lineTo(line - px, 220 - pz)
      ctx.stroke()
    }
    ctx.restore()

    // vehicle blips
    for (const v of game.vehicles.vehicles) {
      if (v === pv || v.destroyed || !v.group.visible) continue
      const d = Math.hypot(v.pos.x - px, v.pos.z - pz)
      if (d > 130) continue
      const [sx, sy] = this.toScreen(v.pos.x, v.pos.z, px, pz, cos, sin, scale, cx, cy)
      if (v.isPolice) {
        ctx.fillStyle = Math.sin(performance.now() * 0.01) > 0 ? '#6da6ff' : '#ff5a5a'
        ctx.beginPath(); ctx.arc(sx, sy, 2.6, 0, Math.PI * 2); ctx.fill()
      } else if (v.traffic) {
        ctx.fillStyle = 'rgba(210,216,210,0.55)'
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill()
      }
    }
    // peds
    ctx.fillStyle = 'rgba(230,220,200,0.4)'
    for (const a of game.peds.actors) {
      if (a.dead) continue
      const d = Math.hypot(a.pos.x - px, a.pos.z - pz)
      if (d > 65) continue
      const [sx, sy] = this.toScreen(a.pos.x, a.pos.z, px, pz, cos, sin, scale, cx, cy)
      ctx.beginPath(); ctx.arc(sx, sy, 1.1, 0, Math.PI * 2); ctx.fill()
    }

    // marker
    if (this.marker) {
      const [sx, sy] = this.toScreen(this.marker.x, this.marker.z, px, pz, cos, sin, scale, cx, cy)
      let dx = sx - cx, dy = sy - cy
      let dist = Math.hypot(dx, dy)
      const max = R * 0.86
      let clamped = false
      if (dist > max) {
        const k = max / (dist || 1)
        dx *= k; dy *= k
        dist = max
        clamped = true
      }
      const mx = cx + dx, my = cy + dy
      const color = this.marker.color || '#ffc84a'
      const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.12
      ctx.save()
      ctx.translate(mx, my)
      if (clamped) {
        ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2)
        ctx.fillStyle = color
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 2); ctx.lineTo(-7, 2); ctx.closePath(); ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.beginPath(); ctx.arc(0, 0, 9 * pulse, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = color
        ctx.beginPath(); ctx.arc(0, 0, 5.2 * pulse, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 1.4
        ctx.stroke()
      }
      ctx.restore()
    }

    // player arrow
    const heading = pv ? pv.yaw : player.yaw
    const rel = heading - camYaw
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(rel)
    ctx.beginPath()
    ctx.moveTo(0, -10)
    ctx.lineTo(7.5, 8)
    ctx.lineTo(0, 4.5)
    ctx.lineTo(-7.5, 8)
    ctx.closePath()
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 5
    ctx.fill()
    ctx.restore()

    // north marker
    const nx = cx - Math.sin(camYaw) * R * 0.9
    const ny = cy + Math.cos(camYaw) * R * 0.9
    ctx.fillStyle = 'rgba(246,196,83,0.9)'
    ctx.font = 'bold 15px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('N', nx, ny)

    ctx.restore()

    // inner border
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.stroke()
  }
}
