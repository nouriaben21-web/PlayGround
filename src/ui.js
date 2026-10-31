import { clamp, mod, TAU } from './noise.js'

const CARDINALS = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }
const ARABIC_CARDINALS = { 0: 'ش', 90: 'ق', 180: 'ج', 270: 'غ' }

export class UI {
  constructor(game) {
    this.game = game
    this.el = {
      hud: document.getElementById('hud'),
      title: document.getElementById('titleScreen'),
      start: document.getElementById('startBtn'),
      boot: document.getElementById('boot'),
      gold: document.getElementById('statGold'),
      islands: document.getElementById('statIslands'),
      chests: document.getElementById('statChests'),
      speed: document.getElementById('speed'),
      sailFill: document.getElementById('sailFill'),
      sailPct: document.getElementById('sailPct'),
      windSpeed: document.getElementById('windSpeed'),
      time: document.getElementById('timeOfDay'),
      weather: document.getElementById('weather'),
      quest: document.getElementById('questText'),
      questDist: document.getElementById('questDist'),
      prompt: document.getElementById('prompt'),
      promptText: document.getElementById('promptText'),
      toasts: document.getElementById('toasts'),
      hint: document.getElementById('hintBar'),
      mute: document.getElementById('muteBtn'),
      victory: document.getElementById('victory'),
      vGold: document.getElementById('vGold'),
      vDist: document.getElementById('vDist'),
      vTime: document.getElementById('vTime'),
      again: document.getElementById('againBtn'),
      compass: document.getElementById('compass'),
      minimap: document.getElementById('minimap'),
      windRose: document.getElementById('windRose'),
      touchInteract: document.getElementById('touchInteract'),
      touchAnchor: document.getElementById('touchAnchor'),
      joystick: document.getElementById('joystick'),
      joystickKnob: document.getElementById('joystickKnob')
    }
    this.compassCtx = this.el.compass.getContext('2d')
    this.minimapCtx = this.el.minimap.getContext('2d')
    this.windCtx = this.el.windRose.getContext('2d')
    this.lastDom = 0
    this.lastMap = 0
    this.promptText = ''
    this.promptVisible = false
    this.toastCount = 0
    this.chestMarker = null
  }

  hideBoot() {
    this.el.boot.classList.add('is-hidden')
  }

  start() {
    this.el.title.classList.add('is-hidden')
    this.el.hud.classList.remove('is-hidden')
    setTimeout(() => this.el.hint?.classList.add('hide'), 26000)
  }

  iconSvg(kind) {
    const svg = {
      island: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 19c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 6 0"/><path d="M12 16V9"/><path d="M12 9c-3.5 0-5-1.4-5-3 3.4 0 5 1.2 5 3Z"/></svg>',
      chest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 10h16v9H4z"/><path d="M3 10a5 5 0 0118 0"/><path d="M10 10V8h4v2"/><path d="M4 14h16"/></svg>',
      coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="7.5"/><path d="M12 8v8M9.5 9.5h4a2 2 0 010 4h-3a2 2 0 000 4h4"/></svg>',
      wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 8h11a3 3 0 10-3-3"/><path d="M3 12h15a3 3 0 11-3 3"/><path d="M3 16h8"/></svg>',
      anchor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M5 13H19M6 13c0 4 2.7 7 6 7s6-3 6-7"/></svg>'
    }
    return svg[kind] || svg.island
  }

  toast(title, subtitle = '', kind = 'island') {
    const node = document.createElement('div')
    node.className = 'toast'
    node.innerHTML = `<span class="toast-ico">${this.iconSvg(kind)}</span><span class="toast-body"><b>${title}</b>${subtitle ? `<small>${subtitle}</small>` : ''}</span>`
    this.el.toasts.appendChild(node)
    this.toastCount++
    setTimeout(() => {
      node.classList.add('out')
      setTimeout(() => { node.remove(); this.toastCount-- }, 520)
    }, 3400)
    while (this.el.toasts.children.length > 3) this.el.toasts.firstElementChild?.remove()
  }

  setPrompt(text) {
    const visible = Boolean(text)
    if (text) this.el.promptText.textContent = text
    if (visible !== this.promptVisible) {
      this.promptVisible = visible
      this.el.prompt.classList.toggle('is-hidden', !visible)
    }
  }

  showVictory(state) {
    this.el.vGold.textContent = state.gold
    this.el.vDist.textContent = Math.round(state.distance / 1852)
    this.el.vTime.textContent = Math.round(state.elapsed / 60)
    this.el.victory.classList.remove('is-hidden')
  }

  update(dt, game) {
    this.lastDom += dt
    this.lastMap += dt
    const ship = game.ship
    if (this.lastDom > 0.1) {
      this.lastDom = 0
      this.el.gold.textContent = game.state.gold
      this.el.islands.textContent = game.state.discoveredCount
      this.el.chests.textContent = game.state.chestCount
      this.el.speed.textContent = ship.getSpeedKnots().toFixed(1)
      this.el.sailFill.style.width = `${Math.round(ship.sail * 100)}%`
      this.el.sailPct.textContent = `${Math.round(ship.sail * 100)}%`
      this.el.windSpeed.textContent = (game.windStrength * 19).toFixed(0)
      this.el.time.textContent = game.timeLabel
      this.el.weather.textContent = game.weatherLabel
      this.el.quest.textContent = game.quest.text
      this.el.questDist.textContent = game.quest.distance > 0 ? `${Math.round(game.quest.distance)} م` : '—'
      this.el.touchAnchor.classList.toggle('active', ship.anchored)
    }
    if (this.lastMap > 0.05) {
      this.lastMap = 0
      this.drawCompass(game)
      this.drawMinimap(game)
      this.drawWindRose(game)
    }
  }

  drawCompass(game) {
    const ctx = this.compassCtx
    const w = this.el.compass.width
    const h = this.el.compass.height
    ctx.clearRect(0, 0, w, h)
    const heading = mod(game.ship.heading * 180 / Math.PI + 180, 360)
    const cx = w / 2
    const cy = h * 0.52

    // glass ribbon
    const radius = 18
    ctx.beginPath()
    ctx.roundRect(2, 2, w - 4, h - 4, radius)
    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, 'rgba(8, 28, 41, 0.62)')
    bg.addColorStop(1, 'rgba(3, 14, 22, 0.5)')
    ctx.fillStyle = bg
    ctx.fill()
    ctx.strokeStyle = 'rgba(226, 240, 244, 0.14)'
    ctx.lineWidth = 2
    ctx.stroke()

    // fade the ends
    const fade = ctx.createLinearGradient(0, 0, w, 0)
    fade.addColorStop(0, 'rgba(3, 14, 22, 0.92)')
    fade.addColorStop(0.14, 'rgba(3, 14, 22, 0)')
    fade.addColorStop(0.86, 'rgba(3, 14, 22, 0)')
    fade.addColorStop(1, 'rgba(3, 14, 22, 0.92)')

    const pxPerDeg = w / 130
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(2, 2, w - 4, h - 4, radius)
    ctx.clip()

    for (let d = Math.floor(heading - 72); d <= heading + 72; d++) {
      const deg = mod(d, 360)
      const x = cx + (d - heading) * pxPerDeg
      const major = deg % 30 === 0
      const mid = deg % 10 === 0
      if (!major && !mid && deg % 5 !== 0) continue
      const len = major ? 24 : mid ? 15 : 9
      ctx.strokeStyle = major ? 'rgba(255, 228, 172, 0.8)' : 'rgba(226, 240, 244, 0.34)'
      ctx.lineWidth = major ? 2 : 1.2
      ctx.beginPath()
      ctx.moveTo(x, cy - 4)
      ctx.lineTo(x, cy - 4 - len)
      ctx.stroke()

      if (major) {
        const label = CARDINALS[deg]
        if (label) {
          ctx.fillStyle = label === 'N' ? '#ffe4ac' : 'rgba(244, 250, 251, 0.92)'
          ctx.font = '600 26px Cairo, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(label, x, cy + 22)
        } else {
          ctx.fillStyle = 'rgba(226, 240, 244, 0.56)'
          ctx.font = '500 17px Cairo, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(String(deg).padStart(3, '0'), x, cy + 20)
        }
      }
    }

    // island bearings
    for (const island of game.islands) {
      if (!island.discovered) continue
      const dx = island.position.x - game.ship.position.x
      const dz = island.position.z - game.ship.position.z
      const bearing = mod(Math.atan2(dx, -dz) * 180 / Math.PI, 360)
      let rel = bearing - heading
      rel = mod(rel + 180, 360) - 180
      if (Math.abs(rel) > 66) continue
      const x = cx + rel * pxPerDeg
      ctx.save()
      ctx.translate(x, cy - 36)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = 'rgba(233, 200, 138, 0.9)'
      ctx.fillRect(-4, -4, 8, 8)
      ctx.restore()
    }

    ctx.fillStyle = fade
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // center pointer
    ctx.fillStyle = '#ffe4ac'
    ctx.beginPath()
    ctx.moveTo(cx, 5)
    ctx.lineTo(cx - 8, -1)
    ctx.lineTo(cx + 8, -1)
    ctx.closePath()
    ctx.fill()
  }

  drawMinimap(game) {
    const ctx = this.minimapCtx
    const size = this.el.minimap.width
    const dpr = size / this.el.minimap.clientWidth || 1
    const c = size / 2
    const radius = c - 2 * dpr
    const range = 1500
    const scale = radius / range
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.beginPath()
    ctx.arc(c, c, radius, 0, TAU)
    ctx.clip()

    const bg = ctx.createRadialGradient(c, c, 0, c, c, radius)
    bg.addColorStop(0, '#0b3246')
    bg.addColorStop(0.65, '#082435')
    bg.addColorStop(1, '#041521')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, size, size)

    // range rings
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.arc(c, c, (radius / 3) * i, 0, TAU)
      ctx.strokeStyle = 'rgba(143, 227, 214, 0.09)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(c, 0)
    ctx.lineTo(c, size)
    ctx.moveTo(0, c)
    ctx.lineTo(size, c)
    ctx.strokeStyle = 'rgba(233, 200, 138, 0.07)'
    ctx.stroke()

    const ship = game.ship
    const sx = ship.position.x
    const sz = ship.position.z

    // wind streaks
    ctx.save()
    const windA = Math.atan2(Math.sin(game.windAngle), Math.cos(game.windAngle))
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + game.time * 0.02
      const r = 40 + (i % 4) * 48
      const x = c + Math.cos(a) * r
      const y = c + Math.sin(a) * r
      ctx.strokeStyle = 'rgba(143, 227, 214, 0.1)'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.sin(windA) * 10, y + Math.cos(windA) * 10)
      ctx.stroke()
    }
    ctx.restore()

    for (const island of game.islands) {
      const dx = island.position.x - sx
      const dz = island.position.z - sz
      const x = c + dx * scale
      const y = c + dz * scale
      const rr = Math.max(3.5 * dpr, island.waterRadius * scale)
      if (Math.hypot(x - c, y - c) > radius + rr) continue
      const grad = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr)
      if (island.discovered) {
        grad.addColorStop(0, 'rgba(144, 205, 141, 0.95)')
        grad.addColorStop(0.55, 'rgba(66, 145, 107, 0.9)')
        grad.addColorStop(1, 'rgba(20, 70, 72, 0.25)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = 'rgba(233, 200, 138, 0.5)'
        ctx.lineWidth = 1.2 * dpr
        ctx.stroke()
      } else {
        ctx.fillStyle = 'rgba(20, 44, 55, 0.85)'
        ctx.beginPath()
        ctx.arc(x, y, rr, 0, TAU)
        ctx.fill()
        ctx.strokeStyle = 'rgba(143, 227, 214, 0.25)'
        ctx.lineWidth = 1 * dpr
        ctx.stroke()
        ctx.fillStyle = 'rgba(200, 224, 228, 0.45)'
        ctx.font = `600 ${Math.max(10, rr * 0.9)}px Cairo, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('?', x, y)
      }
      if (island.chest && !island.chestOpened && island.discovered) {
        const cx = c + (island.chestWorld.x - sx) * scale
        const cy = c + (island.chestWorld.z - sz) * scale
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(Math.PI / 4)
        ctx.fillStyle = 'rgba(255, 214, 140, 0.95)'
        ctx.fillRect(-3 * dpr, -3 * dpr, 6 * dpr, 6 * dpr)
        ctx.restore()
      }
    }

    // floating salvage
    for (const s of game.salvage) {
      if (s.collected) continue
      const x = c + (s.position.x - sx) * scale
      const y = c + (s.position.z - sz) * scale
      if (Math.hypot(x - c, y - c) > radius) continue
      ctx.fillStyle = 'rgba(255, 232, 180, 0.75)'
      ctx.beginPath()
      ctx.arc(x, y, 2.1 * dpr, 0, TAU)
      ctx.fill()
    }

    // ship arrow
    const h = ship.heading
    const fx = Math.sin(h)
    const fy = Math.cos(h)
    const rx = Math.cos(h)
    const ry = -Math.sin(h)
    const tipX = c + fx * 10 * dpr
    const tipY = c + fy * 10 * dpr
    const blX = c - fx * 5 * dpr + rx * 6 * dpr
    const blY = c - fy * 5 * dpr + ry * 6 * dpr
    const brX = c - fx * 5 * dpr - rx * 6 * dpr
    const brY = c - fy * 5 * dpr - ry * 6 * dpr
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(blX, blY)
    ctx.lineTo(brX, brY)
    ctx.closePath()
    ctx.fillStyle = '#ffe4ac'
    ctx.shadowColor = 'rgba(255, 214, 140, 0.9)'
    ctx.shadowBlur = 8 * dpr
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(6, 22, 33, 0.7)'
    ctx.lineWidth = 1 * dpr
    ctx.stroke()

    ctx.restore()

    // outer bezel
    ctx.beginPath()
    ctx.arc(c, c, radius, 0, TAU)
    ctx.strokeStyle = 'rgba(233, 200, 138, 0.3)'
    ctx.lineWidth = 1.4 * dpr
    ctx.stroke()
  }

  drawWindRose(game) {
    const ctx = this.windCtx
    const size = this.el.windRose.width
    const c = size / 2
    const radius = c - 8
    ctx.clearRect(0, 0, size, size)
    ctx.save()
    ctx.translate(c, c)
    const bg = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
    bg.addColorStop(0, 'rgba(10, 35, 48, 0.7)')
    bg.addColorStop(1, 'rgba(4, 17, 26, 0.35)')
    ctx.fillStyle = bg
    ctx.beginPath()
    ctx.arc(0, 0, radius, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = 'rgba(233, 200, 138, 0.2)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU
      const inner = i % 6 === 0 ? radius - 10 : radius - 5
      ctx.beginPath()
      ctx.moveTo(Math.sin(a) * inner, -Math.cos(a) * inner)
      ctx.lineTo(Math.sin(a) * (radius - 1), -Math.cos(a) * (radius - 1))
      ctx.strokeStyle = i % 6 === 0 ? 'rgba(255, 228, 172, 0.55)' : 'rgba(226, 240, 244, 0.18)'
      ctx.lineWidth = i % 6 === 0 ? 2 : 1
      ctx.stroke()
    }

    // arrow
    const bearing = mod(game.windAngle * 180 / Math.PI + 180, 360) * Math.PI / 180
    ctx.rotate(bearing)
    const strength = clamp(game.windStrength / 1.4, 0.35, 1)
    const len = radius * (0.35 + strength * 0.42)
    ctx.strokeStyle = 'rgba(143, 227, 214, 0.85)'
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, len)
    ctx.lineTo(0, -len * 0.75)
    ctx.stroke()
    ctx.fillStyle = 'rgba(143, 227, 214, 0.95)'
    ctx.beginPath()
    ctx.moveTo(0, -len * 0.78 - 7)
    ctx.lineTo(-6, -len * 0.6)
    ctx.lineTo(6, -len * 0.6)
    ctx.closePath()
    ctx.fill()
    // tail feathers
    ctx.strokeStyle = 'rgba(143, 227, 214, 0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, len)
    ctx.lineTo(-6, len + 7)
    ctx.moveTo(0, len)
    ctx.lineTo(6, len + 7)
    ctx.stroke()
    ctx.restore()

    ctx.fillStyle = 'rgba(255, 228, 172, 0.7)'
    ctx.font = '600 14px Cairo, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('N', c, 12)
  }
}
