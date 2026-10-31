import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Sky, computePalette, sunDirection } from './sky.js'
import { Ocean } from './ocean.js'
import { createIslands, setLowQuality } from './islands.js'
import { Ship } from './ship.js'
import { Wildlife } from './wildlife.js'
import { ParticleField, makeRadialTexture } from './effects.js'
import { SeaAudio } from './audio.js'
import { UI } from './ui.js'
import { clamp, damp, mod, smoothstep, TAU } from './noise.js'

const START_POS = new THREE.Vector3(20, 0, 150)

class Game {
  constructor() {
    const canvas = document.getElementById('scene')
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false
    })
    const gl = this.renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ''
    this.software = /swiftshader|llvmpipe|software|basic render/i.test(String(gpu))
    this.gpuName = gpu
    if (this.software) document.documentElement.classList.add('is-software')
    this.renderScale = this.software ? 0.72 : 1
    this.renderer.setPixelRatio(this.software ? 1 : Math.min(window.devicePixelRatio || 1, 2))
    this.sizeRenderer()
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = !this.software
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.FogExp2(0xa8c9dd, 0.00062)
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.5, 14000)
    this.camera.position.set(START_POS.x + 14, 18, START_POS.z + 38)

    this.clock = new THREE.Clock()
    this.time = 0
    this.state = {
      started: false,
      ended: false,
      gold: 0,
      discoveredCount: 0,
      chestCount: 0,
      distance: 0,
      elapsed: 0,
      timeOfDay: 17.15,
      storm: 0,
      stormPhase: 'clear',
      stormTimer: 65,
      windAngle: Math.PI + 0.3,
      windTargetAngle: Math.PI + 0.3,
      windStrength: 1.0,
      flash: 0,
      thunderIn: 0
    }
    this.windAngle = this.state.windAngle
    this.windStrength = this.state.windStrength
    this.timeLabel = 'غروب'
    this.weatherLabel = 'صافٍ'
    this.quest = { text: 'أبحر نحو جزيرة النور', distance: 0 }
    this.flags = { hint1: false, hint2: false, hint3: false, grounded: 0, stormToast: false }

    this.buildWorld()
    if (window.__voyageDebug) (window.__initMarks ||= []).push(['world', Math.round(performance.now())])
    this.ui = new UI(this)
    this.audio = new SeaAudio()
    this.bindEvents()
    if (window.__voyageDebug) (window.__initMarks ||= []).push(['ui', Math.round(performance.now())])

    this.sunDir = new THREE.Vector3()
    this.moonDir = new THREE.Vector3()
    this.palette = computePalette(sunDirection(17.15), 0)
    this.onResize()
    this.updateWorld(0, 0)
    if (window.__voyageDebug) (window.__initMarks ||= []).push(['update', Math.round(performance.now())])
    // Compile and present the title backdrop while the document is still
    // loading, so the first (very expensive on software GL) frame cannot block
    // the Start button or an automated click.
    this.renderer.render(this.scene, this.camera)
    if (window.__voyageDebug) (window.__initMarks ||= []).push(['render', Math.round(performance.now())])
    // Force software GL to finish the first frame now (shader compilation and
    // rasterisation happen at present time) instead of stalling the first
    // interaction a few seconds later.
    this.renderer.getContext().finish()
    if (window.__voyageDebug) (window.__initMarks ||= []).push(['finish', Math.round(performance.now())])
    this.booted = true
    this.ui.hideBoot()
    window.__ready = true
    window.addEventListener('resize', () => this.onResize())
    this.loop = this.loop.bind(this)
    requestAnimationFrame(this.loop)
  }

  buildWorld() {
    const { scene } = this
    this.sky = new Sky(scene)

    this.hemi = new THREE.HemisphereLight(0xbcdcf2, 0x17313f, 0.55)
    scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xfff1d6, 3)
    this.sun.castShadow = !this.software
    this.sun.shadow.mapSize.set(this.software ? 1024 : 2048, this.software ? 1024 : 2048)
    this.sun.shadow.camera.near = 20
    this.sun.shadow.camera.far = 900
    this.sun.shadow.camera.left = -290
    this.sun.shadow.camera.right = 290
    this.sun.shadow.camera.top = 290
    this.sun.shadow.camera.bottom = -290
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 1.1
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.ocean = new Ocean(scene, 8, this.software)
    setLowQuality(this.software)
    this.islands = createIslands(scene)
    this.ocean.setIslands(this.islands)
    this.home = this.islands[0]
    this.home.discovered = true
    this.state.discoveredCount = 1

    this.ship = new Ship(scene, this.software)
    this.ship.root.position.copy(START_POS)
    this.ship.heading = Math.PI
    this.ship.sail = 0.5

    this.wildlife = new Wildlife(scene, this.islands)
    this.wake = new ParticleField(scene, { count: 760, color: '#f2fbfb', color2: '#d7ecee', opacity: 0.62, pixelScale: 250 })
    this.spray = new ParticleField(scene, { count: 240, color: '#f4fdfd', color2: '#ffffff', opacity: 0.7, pixelScale: 210 })
    this.goldBurst = new ParticleField(scene, {
      count: 260,
      color: '#ffd98a',
      color2: '#fff6cf',
      opacity: 1,
      blending: THREE.AdditiveBlending,
      pixelScale: 200
    })

    this.buildSalvage()
    this.updateSalvage(0)
    this.buildRain()

    this.camState = {
      orbitYaw: 0.34,
      orbitPitch: 0.3,
      distance: 33,
      lastDrag: -10,
      target: new THREE.Vector3(),
      look: new THREE.Vector3(START_POS.x, 5, START_POS.z - 40),
      shake: 0
    }
    this.controls = {
      steer: 0,
      sailDelta: 0,
      anchor: true,
      keys: new Set(),
      joyX: 0,
      joyY: 0,
      joyActive: false
    }
    this.touch = window.matchMedia('(pointer: coarse)').matches
    if (this.touch) document.body.classList.add('touch')
  }

  buildSalvage() {
    this.salvage = []
    const rng = (() => { let s = 12345; return () => (s = (s * 9301 + 49297) % 233280) / 233280 })()
    const glowTex = makeRadialTexture(96, 'rgba(255,225,160,1)', 'rgba(255,190,90,0)')

    // Bake the crate, bands and lid into one vertex-coloured geometry so the
    // whole salvage scatter costs a single draw call.
    const parts = []
    const addPart = (geo, color) => {
      const g = geo.toNonIndexed ? (geo.index ? geo.toNonIndexed() : geo) : geo
      const c = new THREE.Color(color)
      const n = g.attributes.position.count
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        arr[i * 3] = c.r
        arr[i * 3 + 1] = c.g
        arr[i * 3 + 2] = c.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      parts.push(g)
    }
    const box = (w, h, d, x, y, z, color) => {
      const g = new THREE.BoxGeometry(w, h, d)
      g.translate(x, y, z)
      addPart(g, color)
    }
    box(1.5, 1.2, 1.5, 0, 0.6, 0, 0x7a4c28)
    for (const yy of [-0.45, 0.45]) box(1.56, 0.1, 1.56, 0, 0.6 + yy, 0, 0xc9a15c)
    box(1.6, 0.1, 1.6, 0, 1.21, 0, 0xc9a15c)
    const crateGeo = mergeGeometries(parts, false)
    const crateMat = new THREE.MeshLambertMaterial({ vertexColors: true })

    const count = 22
    const mesh = new THREE.InstancedMesh(crateGeo, crateMat, count)
    mesh.frustumCulled = false
    mesh.castShadow = true
    this.scene.add(mesh)
    this.salvageMesh = mesh
    this.salvageDummy = new THREE.Object3D()

    const glowPositions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) glowPositions[i * 3 + 1] = -999
    const glowGeo = new THREE.BufferGeometry()
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3))
    glowGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    const glowMat = new THREE.PointsMaterial({
      map: glowTex,
      color: 0xffd28a,
      size: 7,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    })
    const glows = new THREE.Points(glowGeo, glowMat)
    glows.frustumCulled = false
    glows.renderOrder = 4
    this.scene.add(glows)
    this.salvageGlow = glows
    this.salvageGlowPositions = glowPositions

    for (let i = 0; i < count; i++) {
      const island = this.islands[i % this.islands.length]
      const angle = rng() * TAU
      const r = island.waterRadius + 45 + rng() * 170
      const x = island.position.x + Math.cos(angle) * r
      const z = island.position.z + Math.sin(angle) * r
      const y = this.ocean.heightAt(x, z) + 0.35
      this.salvage.push({
        position: new THREE.Vector3(x, y, z),
        baseY: y,
        phase: rng() * TAU,
        rot: rng() * TAU,
        collected: false,
        value: 35 + Math.floor(rng() * 45)
      })
    }
  }

  buildRain() {
    const count = this.software ? 340 : 900
    this.rainCount = count
    const positions = new Float32Array(count * 2 * 3)
    this.rainDrops = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 130
      const y = Math.random() * 70
      const z = (Math.random() - 0.5) * 130
      this.rainDrops[i * 3] = x
      this.rainDrops[i * 3 + 1] = y
      this.rainDrops[i * 3 + 2] = z
      positions[i * 6] = x
      positions[i * 6 + 1] = y
      positions[i * 6 + 2] = z
      positions[i * 6 + 3] = x + 0.3
      positions[i * 6 + 4] = y - 1.6
      positions[i * 6 + 5] = z + 0.18
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xcfe4ee, transparent: true, opacity: 0, depthWrite: false })
    this.rain = new THREE.LineSegments(geo, this.rainMat)
    this.rain.frustumCulled = false
    this.rain.visible = false
    this.scene.add(this.rain)
  }

  bindEvents() {
    const start = this.ui.el.start
    start.addEventListener('click', () => this.start())

    this.ui.el.again.addEventListener('click', () => window.location.reload())
    this.ui.el.mute.addEventListener('click', () => {
      const muted = !this.audio.muted
      this.audio.setMuted(muted)
      this.ui.el.mute.classList.toggle('muted', muted)
    })

    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
      if (e.repeat) {
        if (this.state.started) this.controls.keys.add(e.code)
        return
      }
      this.controls.keys.add(e.code)
      if (!this.state.started && (e.code === 'Enter' || e.code === 'NumpadEnter')) this.start()
      if (this.state.started && !this.state.ended) {
        if (e.code === 'KeyE') this.interact()
        if (e.code === 'Space') {
          this.controls.anchor = !this.controls.anchor
          this.ui.toast(this.controls.anchor ? 'أُلقيت المرساة' : 'رُفعت المرساة', this.controls.anchor ? 'السفينة ثابتة الآن' : 'أبحر بحرية', 'anchor')
          this.audio.tone(220, 0.3, 'triangle', 0.04)
        }
        if (e.code === 'KeyM') this.ui.el.mute.click()
      }
    })
    window.addEventListener('keyup', (e) => this.controls.keys.delete(e.code))
    window.addEventListener('blur', () => this.controls.keys.clear())

    // camera orbit
    let dragging = false
    let lastX = 0
    let lastY = 0
    let dragId = -1
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      dragId = e.pointerId
      lastX = e.clientX
      lastY = e.clientY
      this.canvas.setPointerCapture?.(e.pointerId)
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerId !== dragId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      this.camState.orbitYaw = clamp(this.camState.orbitYaw - dx * 0.0055, -1.4, 1.4)
      this.camState.orbitPitch = clamp(this.camState.orbitPitch + dy * 0.0032, 0.06, 1.02)
      this.camState.lastDrag = this.time
    })
    const endDrag = (e) => {
      if (e.pointerId === dragId) dragging = false
    }
    this.canvas.addEventListener('pointerup', endDrag)
    this.canvas.addEventListener('pointercancel', endDrag)
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.camState.distance = clamp(this.camState.distance + Math.sign(e.deltaY) * 3, 20, 78)
    }, { passive: false })

    // touch joystick
    const joy = this.ui.el.joystick
    const knob = this.ui.el.joystickKnob
    const updateJoy = (e) => {
      const rect = joy.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      let dx = (e.clientX - cx) / (rect.width * 0.42)
      let dy = (e.clientY - cy) / (rect.height * 0.42)
      const len = Math.hypot(dx, dy)
      if (len > 1) { dx /= len; dy /= len }
      this.controls.joyX = dx
      this.controls.joyY = dy
      this.controls.joyActive = true
      knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`
    }
    joy.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      joy.setPointerCapture(e.pointerId)
      updateJoy(e)
    })
    joy.addEventListener('pointermove', (e) => {
      if (!this.controls.joyActive) return
      e.preventDefault()
      updateJoy(e)
    })
    const endJoy = (e) => {
      this.controls.joyActive = false
      this.controls.joyX = 0
      this.controls.joyY = 0
      knob.style.transform = ''
    }
    joy.addEventListener('pointerup', endJoy)
    joy.addEventListener('pointercancel', endJoy)
    joy.addEventListener('lostpointercapture', endJoy)

    this.ui.el.touchInteract.addEventListener('click', () => this.interact())
    this.ui.el.touchAnchor.addEventListener('click', () => {
      if (!this.state.started) return
      this.controls.anchor = !this.controls.anchor
      this.audio.tone(220, 0.3, 'triangle', 0.04)
    })
  }

  start() {
    if (this.state.started) return
    this.state.started = true
    if (this.software && this.renderScale < 0.72) {
      // The title backdrop renders at a reduced buffer size so the Start button
      // stays responsive on software GL; gameplay gets the full low-quality res.
      this.renderScale = 0.72
      this.sizeRenderer()
    }
    this.audio.ensure()
    this.audio.horn()
    this.ui.start()
    this.controls.anchor = false
    this.ui.toast('مرحبًا بك في جزيرة النور', 'أبحر نحو الأفق واكتشف الجزر المنسية', 'island')
    setTimeout(() => this.audio.gull(), 1200)
    setTimeout(() => {
      if (this.state.started && !this.state.ended) this.ui.toast('ارفع الشراع', 'W / S لتعديل الشراع · A / D للتوجيه', 'wind')
    }, 6500)
  }

  interact() {
    if (!this.state.started || this.state.ended) return
    let best = null
    let bestD = Infinity
    for (const island of this.islands) {
      if (island.chestOpened || !island.discovered) continue
      const d = island.chestDistance(this.ship.position)
      if (d < bestD) { bestD = d; best = island }
    }
    if (best && bestD < 82) {
      this.openChest(best)
    } else if (best && bestD < 240) {
      this.ui.toast('اقترب من الشاطئ أكثر', `الكنز على بعد ${Math.round(bestD)} متر`, 'chest')
    }
  }

  openChest(island) {
    if (!island.openChest()) return
    const reward = 180 + Math.floor(Math.random() * 130)
    this.state.gold += reward
    this.state.chestCount += 1
    this.audio.chest()
    this.ui.toast(`كنز ${island.short}`, `+${reward} ذهب`, 'chest')
    const p = island.chestWorld
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * TAU
      const up = 3 + Math.random() * 7
      const sp = 2 + Math.random() * 6
      this.goldBurst.spawn(p.x, p.y + 1.1, p.z, Math.cos(a) * sp, up, Math.sin(a) * sp, 1.3 + Math.random() * 0.7, 1.4 + Math.random() * 1.2, { drag: 0.94, gravity: 5 })
    }
    if (this.state.chestCount >= this.islands.length && this.state.discoveredCount >= this.islands.length) {
      setTimeout(() => this.finish(), 1200)
    } else {
      setTimeout(() => {
        if (!this.state.ended) this.ui.toast('الكنز التالي ينتظر', 'تابع استكشاف الأرخبيل', 'island')
      }, 4200)
    }
  }

  discover(island) {
    island.discovered = true
    this.state.discoveredCount += 1
    this.state.gold += 80
    this.audio.discovery()
    this.ui.toast(`جزيرة جديدة · ${island.name}`, '+80 ذهب للاستكشاف', 'island')
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * TAU
      this.goldBurst.spawn(this.ship.position.x, this.ship.position.y + 2, this.ship.position.z, Math.cos(a) * 5, 4 + Math.random() * 5, Math.sin(a) * 5, 1.4, 1.2, { drag: 0.95, gravity: 4 })
    }
    if (this.state.discoveredCount === this.islands.length) {
      this.ui.toast('اكتشفت كل الجزر', 'الآن استعد كل الكنوز المتبقية', 'chest')
    }
  }

  finish() {
    if (this.state.ended) return
    this.state.ended = true
    this.controls.anchor = true
    this.audio.horn()
    this.audio.chime()
    this.ui.showVictory({
      gold: this.state.gold,
      distance: this.state.distance,
      elapsed: this.state.elapsed
    })
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * TAU
      this.goldBurst.spawn(this.ship.position.x, this.ship.position.y + 6, this.ship.position.z, Math.cos(a) * 12, 8 + Math.random() * 12, Math.sin(a) * 12, 2.4, 1.8, { drag: 0.96, gravity: 2 })
    }
  }

  updateWeather(dt) {
    const s = this.state
    if (!s.started) return
    s.stormTimer -= dt
    if (s.stormTimer <= 0) {
      if (s.stormPhase === 'clear') {
        s.stormPhase = 'building'
        s.stormTimer = 12
        this.ui.toast('سحب داكنة تقترب', 'قد تهبّ عاصفة قريبًا', 'wind')
      } else if (s.stormPhase === 'building') {
        s.stormPhase = 'storm'
        s.stormTimer = 34 + Math.random() * 16
        this.flags.stormToast = false
      } else if (s.stormPhase === 'storm') {
        s.stormPhase = 'clearing'
        s.stormTimer = 14
      } else {
        s.stormPhase = 'clear'
        s.stormTimer = 85 + Math.random() * 60
      }
    }
    let target = 0
    if (s.stormPhase === 'building') target = 0.55
    if (s.stormPhase === 'storm') target = 1
    s.storm = damp(s.storm, target, s.stormPhase === 'storm' ? 0.35 : 0.5, dt)

    if (s.storm > 0.55 && !this.flags.stormToast) {
      this.flags.stormToast = true
      this.ui.toast('عاصفة!', 'اخفض الشراع أو ألقِ المرساة', 'wind')
    }

    // wind slowly wanders, storms shift it faster
    if (Math.random() < dt * (0.04 + s.storm * 0.35)) {
      s.windTargetAngle = s.windAngle + (Math.random() - 0.5) * (0.7 + s.storm * 2.4)
    }
    s.windAngle = damp(s.windAngle, s.windTargetAngle, 0.12 + s.storm * 0.5, dt)
    s.windStrength = damp(s.windStrength, 0.9 + s.storm * 0.55 + Math.sin(this.time * 0.04) * 0.16, 0.2, dt)
    this.windAngle = s.windAngle
    this.windStrength = s.windStrength

    const labels = { clear: 'صافٍ', building: 'غيوم تتجمع', storm: 'عاصفة', clearing: 'انقشاع' }
    this.weatherLabel = labels[s.stormPhase]

    // lightning
    if (s.storm > 0.6 && Math.random() < dt * 0.16) {
      s.flash = 1
      s.thunderIn = 0.5 + Math.random() * 0.9
      this.camState.shake = 0.6
    }
    s.flash = Math.max(0, s.flash - dt * 4.5)
    if (s.thunderIn > 0) {
      s.thunderIn -= dt
      if (s.thunderIn <= 0) this.audio.thunder()
    }
    this.camState.shake = Math.max(0, this.camState.shake - dt * 1.5)
  }

  updateSunLights(dt) {
    const s = this.state
    sunDirection(s.timeOfDay, this.sunDir)
    this.moonDir.copy(this.sunDir).multiplyScalar(-1)
    const palette = computePalette(this.sunDir, s.storm)
    this.palette = palette

    const night = palette.night
    const useMoon = this.sunDir.y < -0.03
    const lightDir = useMoon ? this.moonDir : this.sunDir
    const shipPos = this.ship.position
    this.sun.position.copy(shipPos).addScaledVector(lightDir, 400)
    this.sun.target.position.copy(shipPos)
    this.sun.target.updateMatrixWorld()
    this.sun.color.copy(palette.sun)
    this.sun.intensity = useMoon ? 0.55 * night : palette.sunIntensity
    this.hemi.intensity = palette.ambientIntensity
    this.hemi.color.copy(palette.ambientSky)
    this.hemi.groundColor.copy(palette.ambientGround)

    this.scene.fog.color.copy(palette.fog)
    this.scene.fog.density = 0.00062 + s.storm * 0.00115 + night * 0.00012
    this.renderer.toneMappingExposure = palette.exposure
    this.sky.update(this.camera, palette, {
      time: this.time,
      sunDir: this.sunDir,
      moonDir: this.moonDir,
      storm: s.storm,
      flash: s.flash
    })

    const hour = s.timeOfDay
    let label = 'ليل'
    if (hour >= 4.5 && hour < 6.5) label = 'فجر'
    else if (hour >= 6.5 && hour < 11) label = 'صباح'
    else if (hour >= 11 && hour < 15) label = 'ظهر'
    else if (hour >= 15 && hour < 18.2) label = 'عصر'
    else if (hour >= 18.2 && hour < 20.2) label = 'غروب'
    const hh = Math.floor(hour)
    const mm = Math.floor((hour - hh) * 60)
    this.timeLabel = `${label} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
  }

  updateControls(dt) {
    const c = this.controls
    const k = c.keys
    let steer = 0
    if (k.has('KeyA') || k.has('ArrowLeft')) steer -= 1
    if (k.has('KeyD') || k.has('ArrowRight')) steer += 1
    let sailDelta = 0
    if (k.has('KeyW') || k.has('ArrowUp')) sailDelta += 1
    if (k.has('KeyS') || k.has('ArrowDown')) sailDelta -= 1
    if (Math.abs(c.joyX) > 0.12) steer += c.joyX
    if (Math.abs(c.joyY) > 0.1) sailDelta += -c.joyY * 0.85
    this.controls.steer = clamp(steer, -1, 1)
    this.controls.sailDelta = sailDelta * 0.65 * dt
  }

  updateSalvage(dt) {
    const mesh = this.salvageMesh
    const dummy = this.salvageDummy
    const glow = this.salvageGlowPositions
    let dirty = false
    for (let i = 0; i < this.salvage.length; i++) {
      const s = this.salvage[i]
      if (s.collected) {
        glow[i * 3 + 1] = -999
        continue
      }
      const y = this.ocean.heightAt(s.position.x, s.position.z, this.ocean.time)
      s.position.y = y + 0.35 + Math.sin(this.time * 1.6 + s.phase) * 0.18
      s.rot += dt * 0.35
      dummy.position.copy(s.position)
      dummy.rotation.set(Math.sin(this.time * 1.2 + s.phase) * 0.08, s.rot, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      glow[i * 3] = s.position.x
      glow[i * 3 + 1] = s.position.y + 0.6
      glow[i * 3 + 2] = s.position.z
      dirty = true
      if (!this.state.started) continue
      const d = s.position.distanceTo(this.ship.position)
      if (d < 10) {
        s.collected = true
        dummy.position.set(0, -999, 0)
        dummy.scale.setScalar(0.0001)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        glow[i * 3 + 1] = -999
        this.state.gold += s.value
        this.audio.coin()
        this.ui.toast('صندوق عائم', `+${s.value} ذهب`, 'coin')
        for (let j = 0; j < 14; j++) {
          const a = Math.random() * TAU
          this.goldBurst.spawn(s.position.x, s.position.y + 0.6, s.position.z, Math.cos(a) * 4, 3 + Math.random() * 4, Math.sin(a) * 4, 1.1, 1.0, { drag: 0.94, gravity: 4 })
        }
      }
    }
    if (dirty) {
      mesh.instanceMatrix.needsUpdate = true
      this.salvageGlow.geometry.attributes.position.needsUpdate = true
    }
  }

  updateShipWake(dt) {
    const ship = this.ship
    if (ship.speed < 2.2) return
    this.wakeAccum = (this.wakeAccum || 0) + dt
    const interval = clamp(0.07 - ship.speed * 0.0015, 0.018, 0.07)
    const stern = ship.stern(new THREE.Vector3())
    while (this.wakeAccum > interval) {
      this.wakeAccum -= interval
      const side = Math.random() > 0.5 ? 1 : -1
      const x = stern.x + ship.right.x * side * (1.2 + Math.random() * 0.8)
      const z = stern.z + ship.right.z * side * (1.2 + Math.random() * 0.8)
      const y = this.ocean.heightAt(x, z) + 0.12
      this.wake.spawn(
        x, y, z,
        ship.right.x * side * (0.8 + Math.random()) - ship.forward.x * 1.5,
        0.35 + Math.random() * 0.6,
        ship.right.z * side * (0.8 + Math.random()) - ship.forward.z * 1.5,
        1.6 + Math.random() * 1.0,
        1.8 + Math.random() * 2.0,
        { drag: 0.96, gravity: 0 }
      )
      if (ship.speed > 8 && Math.random() < 0.35) {
        const bow = ship.bow(new THREE.Vector3())
        this.spray.spawn(
          bow.x, y + 0.3, bow.z,
          ship.forward.x * 3 + (Math.random() - 0.5) * 3,
          2 + Math.random() * 3,
          ship.forward.z * 3 + (Math.random() - 0.5) * 3,
          0.9, 1.1, { drag: 0.93, gravity: 7 }
        )
      }
    }
  }

  updateDiscovery(dt) {
    const p = this.ship.position
    for (const island of this.islands) {
      if (island.discovered) continue
      const d = Math.hypot(island.position.x - p.x, island.position.z - p.z)
      if (d < island.waterRadius + 120) this.discover(island)
    }
  }

  updateCollision(dt, prevX, prevZ) {
    const ship = this.ship
    const p = ship.position
    for (const island of this.islands) {
      const bow = ship.bow(new THREE.Vector3())
      const hBow = island.heightAt(bow.x, bow.z)
      const hShip = island.heightAt(p.x, p.z)
      if (hShip > -1.1 || hBow > -1.4) {
        p.x = prevX
        p.z = prevZ
        ship.speed = Math.min(ship.speed * 0.25, 2.4)
        if (this.time - (this.flags.grounded || -10) > 4) {
          this.flags.grounded = this.time
          this.ui.toast('مياه ضحلة', 'ابتعد عن الشاطئ قبل أن تجنح السفينة', 'anchor')
          this.audio.tone(90, 0.5, 'triangle', 0.05)
          this.camState.shake = Math.min(1, this.camState.shake + 0.4)
        }
        break
      }
    }
  }

  updateQuest() {
    const p = this.ship.position
    let nearest = null
    let best = Infinity
    for (const island of this.islands) {
      if (island.discovered) continue
      const d = Math.hypot(island.position.x - p.x, island.position.z - p.z)
      if (d < best) { best = d; nearest = island }
    }
    if (nearest) {
      this.quest = { text: `اكتشف ${nearest.name}`, distance: Math.max(0, best - nearest.waterRadius) }
      return
    }
    let chest = null
    best = Infinity
    for (const island of this.islands) {
      if (island.chestOpened) continue
      const d = island.chestWorld.distanceTo(p)
      if (d < best) { best = d; chest = island }
    }
    if (chest) {
      this.quest = { text: `استعد كنز ${chest.short}`, distance: Math.max(0, best) }
      return
    }
    this.quest = { text: 'اكتملت الرحلة — أنت سيّد الأرخبيل', distance: 0 }
  }

  updatePrompt() {
    if (!this.state.started || this.state.ended) {
      this.ui.setPrompt(null)
      return
    }
    let best = null
    let bestD = Infinity
    for (const island of this.islands) {
      if (island.chestOpened || !island.discovered) continue
      const d = island.chestDistance(this.ship.position)
      if (d < bestD) { bestD = d; best = island }
    }
    if (best && bestD < 82) {
      this.ui.setPrompt(`افتح كنز ${best.short}`)
    } else if (best && bestD < 240) {
      this.ui.setPrompt(`اقترب من الشاطئ — الكنز على بعد ${Math.round(bestD)} م`)
    } else {
      this.ui.setPrompt(null)
    }
  }

  updateRain(dt) {
    const s = this.state
    const storm = s.storm
    this.rainMat.opacity = storm * 0.36
    this.rain.visible = storm > 0.03
    if (!this.rain.visible) return
    const pos = this.rain.geometry.attributes.position.array
    const drops = this.rainDrops
    const windX = Math.sin(s.windAngle) * 5
    const windZ = Math.cos(s.windAngle) * 5
    for (let i = 0; i < this.rainCount; i++) {
      drops[i * 3 + 1] -= dt * (38 + (i % 5) * 3)
      if (drops[i * 3 + 1] < -4) drops[i * 3 + 1] += 72
      drops[i * 3] += windX * dt
      drops[i * 3 + 2] += windZ * dt
      if (drops[i * 3] > 70) drops[i * 3] -= 140
      if (drops[i * 3] < -70) drops[i * 3] += 140
      if (drops[i * 3 + 2] > 70) drops[i * 3 + 2] -= 140
      if (drops[i * 3 + 2] < -70) drops[i * 3 + 2] += 140
      const x = drops[i * 3]
      const y = drops[i * 3 + 1]
      const z = drops[i * 3 + 2]
      pos[i * 6] = x
      pos[i * 6 + 1] = y
      pos[i * 6 + 2] = z
      pos[i * 6 + 3] = x - windX * 0.06
      pos[i * 6 + 4] = y - 1.7
      pos[i * 6 + 5] = z - windZ * 0.06
    }
    this.rain.geometry.attributes.position.needsUpdate = true
    this.rain.position.set(this.camera.position.x, 0, this.camera.position.z)
  }

  updateCamera(dt) {
    const c = this.camState
    const ship = this.ship
    const started = this.state.started
    if (started && this.time - c.lastDrag > 3.2) {
      c.orbitYaw = damp(c.orbitYaw, 0.34, 0.8, dt)
      c.orbitPitch = damp(c.orbitPitch, 0.3, 0.5, dt)
    }
    let angle = ship.heading + Math.PI + c.orbitYaw
    let distance = c.distance
    let pitch = c.orbitPitch
    if (!started) {
      c.orbitYaw = Math.sin(this.time * 0.06) * 0.24 + 0.34
      angle = ship.heading + Math.PI + c.orbitYaw
      const portrait = window.innerWidth / window.innerHeight < 0.82
      distance = portrait ? 56 : 44
      pitch = portrait ? 0.2 : 0.3
    }
    const horiz = Math.cos(pitch) * distance
    const desired = new THREE.Vector3(
      ship.position.x + Math.sin(angle) * horiz,
      ship.position.y + 3.2 + Math.sin(pitch) * distance,
      ship.position.z + Math.cos(angle) * horiz
    )
    // Establishing shot: slide the camera to port so the ship sits in the left
    // third and the home island + lighthouse fill the right.
    if (!started) desired.x += window.innerWidth / window.innerHeight < 0.82 ? 2 : 28
    if (c.shake > 0.01) {
      desired.x += (Math.random() - 0.5) * c.shake * 1.6
      desired.y += (Math.random() - 0.5) * c.shake * 1.2
      desired.z += (Math.random() - 0.5) * c.shake * 1.6
    }
    // The title backdrop is a single frame, so snap the establishing shot
    // instead of easing into it (players still get the smooth chase camera).
    if (!started) this.camera.position.copy(desired)
    else this.camera.position.lerp(desired, 1 - Math.exp(-3.4 * dt))
    const ahead = started ? 10 : 40
    const portraitTitle = !started && window.innerWidth / window.innerHeight < 0.82
    const look = new THREE.Vector3(
      ship.position.x + ship.forward.x * ahead + (started ? 0 : (portraitTitle ? 0 : -12)),
      ship.position.y + (started ? 3.0 : 6.5),
      ship.position.z + ship.forward.z * ahead
    )
    if (!started) c.look.copy(look)
    else c.look.lerp(look, 1 - Math.exp(-4.2 * dt))
    this.camera.lookAt(c.look)
  }

  sizeRenderer() {
    const w = window.innerWidth
    const h = window.innerHeight
    const s = this.software ? this.renderScale : 1
    this.renderer.setSize(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), false)
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
  }

  onResize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.fov = w / h < 0.82 ? 68 : 54
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(this.software ? 1 : Math.min(window.devicePixelRatio || 1, 2))
    this.sizeRenderer()
  }

  tick(dt) {
    this.time += dt
    const s = this.state
    const active = s.started && !s.ended
    if (s.started) {
      s.elapsed += dt
      s.timeOfDay = mod(s.timeOfDay + dt * 0.045, 24)
      this.updateWeather(dt)
    }
    this.updateSunLights(dt)
    this.ocean.update(dt, this.camera, this.palette, this.sunDir, s.storm)
    this.updateControls(dt)

    const prevX = this.ship.position.x
    const prevZ = this.ship.position.z
    this.ship.update(dt, {
      steer: active ? this.controls.steer : 0,
      sailDelta: active ? this.controls.sailDelta : 0,
      anchor: !active || this.controls.anchor
    }, {
      windAngle: this.windAngle,
      windStrength: this.windStrength,
      storm: s.storm,
      ocean: this.ocean,
      night: this.palette.night
    })
    if (active) {
      this.updateCollision(dt, prevX, prevZ)
      this.state.distance += Math.abs(this.ship.speed) * dt
      this.updateShipWake(dt)
      this.updateDiscovery(dt)
      this.updateSalvage(dt)
      this.updatePrompt()
      this.updateQuest()
    } else {
      this.ui.setPrompt(null)
    }

    for (const island of this.islands) island.update(dt, this.time, this.palette.night, s.storm)
    this.wildlife.update(dt, this.time, this.ocean, this.spray)
    this.wake.update(dt, this.ocean.time, this.ocean)
    this.spray.update(dt, this.ocean.time, this.ocean)
    this.goldBurst.update(dt, this.time, null)
    this.updateRain(dt)
    this.updateCamera(dt)
    this.updateSunFollow()
    this.audio.update(dt, {
      speed: this.ship.speed,
      storm: s.storm,
      night: this.palette.night,
      nearIsland: this.islands.some((i) => Math.hypot(i.position.x - this.ship.position.x, i.position.z - this.ship.position.z) < i.waterRadius + 200)
    })
    if (s.started) this.ui.update(dt, this)

    // tutorial nudges
    if (s.started && !s.ended) {
      if (!this.flags.hint2 && s.elapsed > 16) {
        this.flags.hint2 = true
        this.ui.toast('ابحث عن الأفق', 'الجزر غير المكتشفة تظهر بعلامة ؟ على الخريطة', 'island')
      }
      if (!this.flags.hint3 && s.elapsed > 30) {
        this.flags.hint3 = true
        this.ui.toast('الكنوز قريبة من الشواطئ', 'اقترب واضغط E أو زر التفاعل', 'chest')
      }
    }
  }

  updateSunFollow() {
    // keep shadows centered near the player and the sun target consistent
    this.sun.position.copy(this.ship.position).addScaledVector(this.sunDir.y < -0.03 ? this.moonDir : this.sunDir, 400)
    this.sun.target.position.copy(this.ship.position)
  }

  updateWorld() {
    this.updateSunLights(0)
    this.ocean.update(0, this.camera, this.palette, this.sunDir, 0)
    this.updateCamera(0.016)
  }

  loop() {
    requestAnimationFrame(this.loop)
    const mark = window.__voyageDebug ? performance.now() : 0
    const dt = Math.min(this.clock.getDelta(), 0.05)
    this.tick(dt)
    const mid = window.__voyageDebug ? performance.now() : 0
    // Software renderers pay a huge cost per presented WebGL frame. The title
    // backdrop is presented during init; afterwards only gameplay renders.
    if (this.state.started) this.renderer.render(this.scene, this.camera)
    if (mark) {
      ;(window.__loopStats ||= []).push([Math.round(mark), Math.round(mid - mark), Math.round(performance.now() - mid)])
    }
  }
}

const game = new Game()
window.__voyage = {
  game,
  teleport(x, z) {
    game.ship.root.position.set(x, 0, z)
    game.camera.position.set(x + 20, 20, z + 40)
  },
  setHour(h) {
    game.state.timeOfDay = h
  },
  setStorm(v) {
    game.state.storm = v
    game.state.stormPhase = v > 0.5 ? 'storm' : 'clear'
    game.state.stormTimer = 999
  },
  discoverAll() {
    for (const island of game.islands) if (!island.discovered) game.discover(island)
  },
  info() {
    return {
      gpu: game.gpuName,
      software: game.software,
      pos: game.ship.position.toArray(),
      heading: game.ship.heading,
      speed: game.ship.speed,
      discovered: game.state.discoveredCount,
      chests: game.state.chestCount,
      gold: game.state.gold,
      time: game.time
    }
  }
}
