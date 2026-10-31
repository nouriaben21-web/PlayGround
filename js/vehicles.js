import * as THREE from 'three'

export const CAR_TYPES = {
  sedan: { l: 4.5, w: 1.86, roof: 1.32, accel: 12, brake: 24, maxSpeed: 27, grip: 7.0, steerRate: 1.9 },
  sports: { l: 4.4, w: 1.98, roof: 1.12, accel: 19, brake: 28, maxSpeed: 37, grip: 8.0, steerRate: 2.15 },
  police: { l: 4.6, w: 1.9, roof: 1.34, accel: 15, brake: 26, maxSpeed: 33, grip: 7.4, steerRate: 2.0 },
  taxi: { l: 4.5, w: 1.86, roof: 1.34, accel: 12, brake: 24, maxSpeed: 26, grip: 7.0, steerRate: 1.9 },
  van: { l: 5.2, w: 2.02, roof: 1.96, accel: 9.5, brake: 22, maxSpeed: 21, grip: 6.2, steerRate: 1.6 }
}

const PAINT = [0xd8d8d8, 0x1a1c20, 0x8c9298, 0x8c1f1f, 0x1f3f75, 0x2a5b3a, 0xc06a1c, 0x3a3d44, 0xd6c8a2, 0x6a1f2a]

function glowTex(text, fg = '#f6f6f6', bg = 'rgba(0,0,0,0)') {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 128
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 512, 128)
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 128)
  ctx.fillStyle = fg
  ctx.font = 'bold 82px Arial Black, Arial, sans-serif'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 68)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function extrudeProfile(points, width) {
  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1])
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2, steps: 1, curveSegments: 1
  })
  geo.translate(0, 0, -width / 2)
  geo.rotateY(-Math.PI / 2)
  return geo
}

export function buildCar(type = 'sedan', color) {
  const cfg = CAR_TYPES[type] || CAR_TYPES.sedan
  const l = cfg.l, w = cfg.w
  const group = new THREE.Group()
  const paintColor = color ?? (type === 'police' ? 0x1b1e24 : type === 'taxi' ? 0xe8b52a : PAINT[Math.floor(Math.random() * PAINT.length)])
  const paint = new THREE.MeshPhysicalMaterial({
    color: paintColor, metalness: 0.62, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.1
  })
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.4 })
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0b141c, metalness: 0.2, roughness: 0.06, clearcoat: 1, envMapIntensity: 1.5
  })
  const chrome = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.95, roughness: 0.18 })

  // lower body
  const bodyPts = [
    [-l * 0.47, 0.26], [-l * 0.49, 0.6], [-l * 0.36, 0.78],
    [l * 0.36, 0.78], [l * 0.49, 0.6], [l * 0.47, 0.3], [l * 0.3, 0.2], [-l * 0.3, 0.2]
  ]
  const lower = new THREE.Mesh(extrudeProfile(bodyPts, w - 0.08), paint)
  lower.castShadow = true
  lower.receiveShadow = true
  group.add(lower)

  // cabin
  const r = cfg.roof
  let cabinPts
  if (type === 'van') {
    cabinPts = [[-l * 0.4, 0.76], [-l * 0.4, r], [l * 0.18, r], [l * 0.34, 0.76]]
  } else if (type === 'sports') {
    cabinPts = [[-l * 0.24, 0.76], [-l * 0.1, r], [l * 0.14, r], [l * 0.3, 0.76]]
  } else {
    cabinPts = [[-l * 0.3, 0.76], [-l * 0.12, r], [l * 0.14, r], [l * 0.3, 0.76]]
  }
  const cabin = new THREE.Mesh(extrudeProfile(cabinPts, w - 0.16), glass)
  cabin.castShadow = true
  group.add(cabin)

  // roof panel
  const roofLen = type === 'van' ? l * 0.56 : l * 0.25
  const roofZ = type === 'van' ? -l * 0.11 : l * 0.005
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w - 0.24, 0.07, roofLen), paint)
  roof.position.set(0, r + 0.015, roofZ)
  roof.castShadow = true
  group.add(roof)

  // pillars + interior block
  const interior = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.42, l * 0.46), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: .9 }))
  interior.position.set(0, 0.95, 0)
  group.add(interior)

  // wheels
  const wheelR = type === 'sports' ? 0.35 : type === 'van' ? 0.38 : 0.34
  const wheelW = 0.26
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 18)
  wheelGeo.rotateZ(Math.PI / 2)
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.85, metalness: 0.05 })
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xbfc3c7, roughness: 0.25, metalness: 0.95 })
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 10)
  hubGeo.rotateZ(Math.PI / 2)
  const wheels = []
  const zOff = l * 0.3
  const xOff = w / 2 - 0.05
  for (const [sx, sz, front] of [[-1, 1, true], [1, 1, true], [-1, -1, false], [1, -1, false]]) {
    const pivot = new THREE.Group()
    pivot.position.set(sx * xOff, wheelR, sz * zOff)
    const tyre = new THREE.Mesh(wheelGeo, tyreMat)
    tyre.castShadow = true
    const hub = new THREE.Mesh(hubGeo, rimMat)
    hub.position.x = sx * 0.005
    pivot.add(tyre, hub)
    group.add(pivot)
    wheels.push({ pivot, tyre, front })
  }

  // lights
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d2, emissive: 0xfff0c0, emissiveIntensity: 2.2, roughness: .2 })
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a0f12, emissive: 0xff1d20, emissiveIntensity: 1.4, roughness: .3 })
  const headGeo = new THREE.BoxGeometry(0.36, 0.14, 0.06)
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(headGeo, headMat)
    h.position.set(sx * (w / 2 - 0.38), 0.6, l * 0.475)
    group.add(h)
    const t = new THREE.Mesh(headGeo, tailMat)
    t.position.set(sx * (w / 2 - 0.38), 0.62, -l * 0.475)
    group.add(t)
  }

  // bumpers + plate
  const bumperGeo = new THREE.BoxGeometry(w * 0.92, 0.18, 0.16)
  const fb = new THREE.Mesh(bumperGeo, trimMat)
  fb.position.set(0, 0.35, l * 0.48)
  const rb = new THREE.Mesh(bumperGeo, trimMat)
  rb.position.set(0, 0.35, -l * 0.48)
  group.add(fb, rb)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.03), new THREE.MeshStandardMaterial({ color: 0xe9e6da, roughness: .5 }))
  plate.position.set(0, 0.47, -l * 0.49)
  group.add(plate)

  // mirrors
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.2), paint)
    mirror.position.set(sx * (w / 2 + 0.03), 0.86, l * 0.16)
    group.add(mirror)
  }

  // grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.14, 0.05), chrome)
  grille.position.set(0, 0.52, l * 0.49)
  group.add(grille)

  let lightbar = null
  let sirenMats = null
  if (type === 'police') {
    // livery panels
    const blackPanel = new THREE.MeshStandardMaterial({ color: 0x101216, roughness: .45, metalness: .3 })
    for (const sx of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.34, 1.8), blackPanel)
      panel.position.set(sx * (w / 2 + 0.005), 0.56, 0.05)
      group.add(panel)
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.32), new THREE.MeshBasicMaterial({ map: glowTex('POLICE', '#f3f3ef'), transparent: true }))
      decal.position.set(sx * (w / 2 + 0.03), 0.66, 0.05)
      decal.rotation.y = sx * Math.PI / 2
      group.add(decal)
    }
    const hood = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.02, l * 0.26), blackPanel)
    hood.position.set(0, 0.79, l * 0.3)
    group.add(hood)
    // light bar
    lightbar = new THREE.Group()
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.07, 0.24), trimMat)
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff0000, emissiveIntensity: 2.5 })
    const blueMat = new THREE.MeshStandardMaterial({ color: 0x1a5bff, emissive: 0x0033ff, emissiveIntensity: 2.5 })
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.2), redMat)
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.2), blueMat)
    red.position.x = -0.24
    blue.position.x = 0.24
    lightbar.add(barBase, red, blue)
    lightbar.position.set(0, r + 0.1, -0.05)
    group.add(lightbar)
    sirenMats = { red: redMat, blue: blueMat }
    // push bar
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 0.08), trimMat)
    bar.position.set(0, 0.5, l * 0.51)
    group.add(bar)
  }
  if (type === 'taxi') {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.22, 0.28), new THREE.MeshStandardMaterial({ color: 0xe8c14a, emissive: 0x966d10, emissiveIntensity: 0.7 }))
    sign.position.set(0, r + 0.14, 0.1)
    group.add(sign)
    const decalMat = new THREE.MeshBasicMaterial({ map: glowTex('TAXI', '#1b1b1b'), transparent: true })
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.16), decalMat)
    d.position.set(0, r + 0.14, 0.245)
    group.add(d)
  }
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, 0.06, 0.34), paint)
    spoiler.position.set(0, 0.92, -l * 0.4)
    const strutGeo = new THREE.BoxGeometry(0.06, 0.18, 0.1)
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(strutGeo, trimMat)
      s.position.set(sx * w * 0.3, 0.82, -l * 0.4)
      group.add(s)
    }
    group.add(spoiler)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.008, l * 0.8), new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: .4 }))
    stripe.position.set(0, 0.795, 0)
    group.add(stripe)
  }
  if (type === 'van') {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.05, l * 0.4), trimMat)
    rack.position.set(0, r + 0.08, -l * 0.1)
    group.add(rack)
  }

  // shooting proxy
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(w, r, l), new THREE.MeshBasicMaterial())
  proxy.visible = false
  proxy.position.y = r / 2 + 0.2
  group.add(proxy)

  return { group, wheels, lightbar, sirenMats, headMat, tailMat, dims: { l, w, h: r }, proxy }
}

function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)) }

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)) }

export class VehicleSystem {
  constructor(scene, game, world) {
    this.scene = scene
    this.game = game
    this.world = world
    this.vehicles = []
    this.playerVehicle = null
    this.root = new THREE.Group()
    scene.add(this.root)
    this.spawnTimer = 0
  }

  addVehicle(type, color, x, z, yaw, options = {}) {
    const built = buildCar(type, color)
    const spec = CAR_TYPES[type] || CAR_TYPES.sedan
    const v = {
      type,
      ...built,
      ...spec,
      pos: new THREE.Vector3(x, 0, z),
      yaw,
      speed: 0,
      vel: new THREE.Vector3(),
      steer: 0,
      hp: options.hp ?? (type === 'police' ? 160 : 120),
      maxHp: options.hp ?? (type === 'police' ? 160 : 120),
      driver: options.driver ?? null,
      traffic: options.traffic ?? false,
      destroyed: false,
      ai: options.ai ?? null,
      isPolice: type === 'police',
      brakeLight: false,
      color: color ?? null,
      cruise: options.cruise ?? 9 + Math.random() * 4,
      sirenPhase: Math.random() * Math.PI * 2,
      damageSmoke: 0,
      stuck: 0
    }
    v.group.position.copy(v.pos)
    v.group.rotation.y = yaw
    v.proxy.userData = { type: 'vehicle', ref: v }
    this.root.add(v.group)
    this.vehicles.push(v)
    return v
  }

  /* ------------------------------------------------------------- spawning */
  start() {
    this.spawnParked()
    for (let i = 0; i < 12; i++) this.spawnTraffic()
  }

  spawnParked() {
    const spots = []
    const grid = [-160, -96, -32, 32, 96, 160]
    for (let k = 0; k < 18; k++) {
      const line = grid[1 + Math.floor(Math.random() * 4)]
      const along = -150 + Math.random() * 300
      const side = Math.random() < 0.5 ? -1 : 1
      const axis = Math.random() < 0.5 ? 0 : 1
      let x, z, yaw
      if (axis === 0) {
        x = line + side * (8 - 1.3)
        z = along
        yaw = side > 0 ? Math.PI : 0
      } else {
        x = along
        z = line + side * (8 - 1.3)
        yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2
      }
      if (spots.some(s => Math.hypot(s.x - x, s.z - z) < 9)) continue
      spots.push({ x, z })
      const types = ['sedan', 'sedan', 'sports', 'van', 'taxi']
      const t = types[Math.floor(Math.random() * types.length)]
      this.addVehicle(t, undefined, x, z, yaw)
    }
    // Hero sports car near spawn for the first mission
    this.heroCar = this.addVehicle('sports', 0xd8321f, 38.5, 56, Math.PI, {})
    this.heroCar.hero = true
    // a little life on the block around the player's start
    this.addVehicle('sedan', 0x365a86, 38.6, 79, Math.PI, {})
    this.addVehicle('taxi', 0xe8b52a, 25.4, 47, 0, {})
    this.addVehicle('van', 0x38404a, 63, 89.3, Math.PI / 2, {})
    // Simeon's garage marker car / delivery van landmarks
    this.addVehicle('van', 0x2d3a4a, 34.2, 104, 0, {})
  }

  randomTrafficStart() {
    const grid = [-160, -96, -32, 32, 96, 160]
    const i = 1 + Math.floor(Math.random() * 4)
    const j = 1 + Math.floor(Math.random() * 4)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const d = dirs[Math.floor(Math.random() * 4)]
    const x = grid[i] + d[0] * (10 + Math.random() * 30)
    const z = grid[j] + d[1] * (10 + Math.random() * 30)
    const yaw = Math.atan2(d[0], d[1])
    return { x, z, yaw, i, j, d }
  }

  spawnTraffic() {
    const s = this.randomTrafficStart()
    const types = ['sedan', 'sedan', 'taxi', 'sports', 'van', 'sedan']
    const v = this.addVehicle(types[Math.floor(Math.random() * types.length)], undefined, s.x, s.z, s.yaw, { driver: 'ai', traffic: true })
    v.ai = {
      mode: 'traffic',
      i: s.i, j: s.j,
      dir: { x: s.d[0], z: s.d[1] },
      target: new THREE.Vector3(),
      speed: 8,
      next: null
    }
    this.chooseTrafficTarget(v, true)
    // avoid spawning on top of the player
    const p = this.game.player
    if (p && p.pos.distanceTo(v.pos) < 25) {
      v.pos.x *= 1.35; v.pos.z *= 1.35
      v.group.position.copy(v.pos)
    }
    return v
  }

  chooseTrafficTarget(v, first = false) {
    const grid = [-160, -96, -32, 32, 96, 160]
    const ai = v.ai
    let ni = ai.i + ai.dir.x
    let nj = ai.j + ai.dir.z
    if (first || ni < 0 || ni > 5 || nj < 0 || nj > 5 || Math.random() < 0.18) {
      const candidates = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => {
        if (dx === -ai.dir.x && dz === -ai.dir.z) return false
        const x = ai.i + dx, z = ai.j + dz
        return x >= 0 && x <= 5 && z >= 0 && z <= 5
      })
      if (!candidates.length) {
        ai.dir = { x: -ai.dir.x, z: -ai.dir.z }
      } else {
        const straight = candidates.find(([dx, dz]) => dx === ai.dir.x && dz === ai.dir.z)
        let pick
        if (straight && Math.random() < 0.55) pick = straight
        else pick = candidates[Math.floor(Math.random() * candidates.length)]
        ai.dir = { x: pick[0], z: pick[1] }
      }
      ni = ai.i + ai.dir.x
      nj = ai.j + ai.dir.z
      ai.i = clamp(ai.i, 0, 5)
      ai.j = clamp(ai.j, 0, 5)
      if (ni < 0 || ni > 5 || nj < 0 || nj > 5) {
        ai.dir = { x: ai.dir.x * -1, z: ai.dir.z * -1 }
        ni = ai.i + ai.dir.x
        nj = ai.j + ai.dir.z
      }
    }
    ai.next = { i: ni, j: nj }
    const right = { x: ai.dir.z, z: -ai.dir.x }
    ai.target.set(grid[ni] + right.x * 4, 0, grid[nj] + right.z * 4)
    ai.node = { i: ai.i, j: ai.j }
  }

  /* -------------------------------------------------------------- driver */
  findNearest(pos, maxDist = 4.2) {
    let best = null
    for (const v of this.vehicles) {
      if (v.destroyed) continue
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z)
      if (d < maxDist && (!best || d < best.dist)) best = { vehicle: v, dist: d }
    }
    return best
  }

  enter(v) {
    if (!v || v.destroyed) return false
    this.playerVehicle = v
    v.driver = 'player'
    v.traffic = false
    v.ai = null
    this.game.player.inCar = true
    this.game.player.group.visible = false
    this.game.hud.setDriving(true)
    this.game.audio.init()
    if (v.hero) this.game.missions.notifyVehicleStolen(v)
    return true
  }

  exit() {
    const v = this.playerVehicle
    if (!v) return false
    if (Math.abs(v.speed) > 8) return false
    const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw))
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x)
    const p = this.game.player
    p.pos.copy(v.pos).addScaledVector(right, -2.2)
    p.pos.y = 0
    this.world.resolveCircle(p.pos, 0.5)
    p.vel.set(0, 0, 0)
    p.group.position.copy(p.pos)
    p.group.visible = true
    p.inCar = false
    p.yaw = v.yaw
    v.driver = null
    v.traffic = false
    v.ai = null
    v.vel.set(0, 0, 0)
    v.speed = 0
    this.playerVehicle = null
    this.game.hud.setDriving(false)
    return true
  }

  /* -------------------------------------------------------------- update */
  update(dt) {
    const input = this.game.input
    if (this.playerVehicle) this.updatePlayerVehicle(dt, input)
    for (const v of this.vehicles) {
      if (v === this.playerVehicle) continue
      if (v.driver === 'ai' && v.ai) {
        if (v.ai.mode === 'traffic') this.updateTraffic(dt, v)
        else if (v.ai.mode === 'police') this.updatePoliceCar(dt, v)
      }
      if (v.destroyed) continue
      this.updateVisual(dt, v)
    }
    if (this.playerVehicle) this.updateVisual(dt, this.playerVehicle, true)
    this.collideVehicles(dt)
    this.maintainTraffic(dt)
  }

  updatePlayerVehicle(dt, input) {
    const v = this.playerVehicle
    if (!v) return
    const throttle = input.throttle
    const brake = input.brake
    const steerIn = input.steer
    const handbrake = input.handbrake
    v.steer = damp(v.steer, steerIn, 7, dt)

    const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw))
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x)
    let fSpeed = v.vel.dot(fwd)
    let rSpeed = v.vel.dot(right)

    if (throttle > 0) {
      const max = v.maxSpeed
      fSpeed += v.accel * throttle * dt * Math.max(0.08, 1 - Math.abs(fSpeed) / max * 0.75)
    }
    if (brake > 0) {
      if (fSpeed > 0.4) fSpeed -= v.brake * brake * dt
      else fSpeed -= v.accel * 0.55 * brake * dt
    }
    // rolling resistance
    const roll = 1.4 + Math.abs(fSpeed) * 0.04
    if (Math.abs(fSpeed) < 0.15 && !throttle) fSpeed = 0
    else fSpeed -= Math.sign(fSpeed) * Math.min(Math.abs(fSpeed), roll * dt)
    // air drag
    fSpeed -= fSpeed * Math.abs(fSpeed) * 0.0018 * dt * 60
    fSpeed = clamp(fSpeed, -v.maxSpeed * 0.34, v.maxSpeed)

    // lateral grip
    const grip = handbrake ? 1.1 : v.grip
    rSpeed *= Math.exp(-grip * dt)

    // steering
    const sf = Math.min(1, Math.abs(fSpeed) / 5.5)
    const dirSign = fSpeed >= 0 ? 1 : -1
    v.yaw += v.steer * v.steerRate * sf * dirSign * dt * (handbrake ? 1.3 : 1)

    const fwd2 = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw))
    const right2 = new THREE.Vector3(fwd2.z, 0, -fwd2.x)
    v.vel.copy(fwd2).multiplyScalar(fSpeed).addScaledVector(right2, rSpeed)
    v.speed = fSpeed

    const prev = v.pos.clone()
    v.pos.addScaledVector(v.vel, dt)
    this.world.resolveCircle(v.pos, 1.15)
    const moved = v.pos.distanceTo(prev)
    if (moved < v.vel.length() * dt * 0.55 && v.vel.length() > 4) {
      // crashed into a wall
      const impact = v.vel.length()
      v.vel.multiplyScalar(0.15)
      v.speed *= 0.15
      if (impact > 6) {
        this.game.effects.burst(new THREE.Vector3(v.pos.x, 0.7, v.pos.z), 10, 0xffb060, 5, 0.5, -12)
        this.game.audio.crash(impact / 20)
        this.game.effects.shake = Math.max(this.game.effects.shake, Math.min(0.5, impact / 50))
        this.damageVehicle(v, impact * 0.7)
        if (this.game.player.inCar) this.game.player.takeDamage(impact * 0.4, 'crash', true)
      }
    }

    // traffic avoidance: stop if a car is directly ahead
    // (handled by collideVehicles)

    if (v.hp <= 0 && !v.destroyed) this.explodeVehicle(v)
  }

  updateTraffic(dt, v) {
    const ai = v.ai
    const dx = ai.target.x - v.pos.x
    const dz = ai.target.z - v.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 7) {
      ai.i = ai.next.i
      ai.j = ai.next.j
      this.chooseTrafficTarget(v)
    }
    const desiredYaw = Math.atan2(ai.target.x - v.pos.x, ai.target.z - v.pos.z)
    const diff = Math.abs(((desiredYaw - v.yaw + Math.PI) % (Math.PI * 2)) - Math.PI)
    let targetSpeed = v.cruise * (diff > 0.5 ? 0.45 : 1)
    // yield to player
    const p = this.game.player
    if (p) {
      const pd = p.pos.distanceTo(v.pos)
      if (!p.inCar && pd < 6) targetSpeed = 0
    }
    // stop for player's car ahead
    if (this.playerVehicle) {
      const toP = this.playerVehicle.pos.clone().sub(v.pos)
      const fwd = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw))
      if (toP.length() < 13 && toP.dot(fwd) > 0) targetSpeed = Math.min(targetSpeed, Math.max(0, (toP.length() - 4) * 0.8))
    }
    ai.speed = damp(ai.speed, targetSpeed, 1.5, dt)
    v.yaw = angleLerp(v.yaw, desiredYaw, Math.min(1, dt * 3.2))
    v.pos.x += Math.sin(v.yaw) * ai.speed * dt
    v.pos.z += Math.cos(v.yaw) * ai.speed * dt
    v.speed = ai.speed
    v.vel.set(Math.sin(v.yaw) * ai.speed, 0, Math.cos(v.yaw) * ai.speed)
  }

  updatePoliceCar(dt, v) {
    const ai = v.ai
    const p = this.game.player
    const target = p.inCar && this.playerVehicle ? this.playerVehicle.pos : p.pos
    const dx = target.x - v.pos.x
    const dz = target.z - v.pos.z
    const dist = Math.hypot(dx, dz)
    const desiredYaw = Math.atan2(dx, dz)
    const diff = Math.abs(((desiredYaw - v.yaw + Math.PI) % (Math.PI * 2)) - Math.PI)
    if (dist < 18) {
      ai.speed = damp(ai.speed, 0, 3, dt)
    } else {
      ai.speed = damp(ai.speed, diff > 0.7 ? 6 : 17, 1.5, dt)
    }
    v.yaw = angleLerp(v.yaw, desiredYaw, Math.min(1, dt * 2.4))
    v.pos.x += Math.sin(v.yaw) * ai.speed * dt
    v.pos.z += Math.cos(v.yaw) * ai.speed * dt
    this.world.resolveCircle(v.pos, 1.2)
    v.speed = ai.speed
    v.vel.set(Math.sin(v.yaw) * ai.speed, 0, Math.cos(v.yaw) * ai.speed)
    ai.stopped = dist < 20
  }

  updateVisual(dt, v, isPlayer = false) {
    v.group.position.copy(v.pos)
    v.group.rotation.y = v.yaw
    const spin = (v.speed || 0) * dt / 0.34
    for (const w of v.wheels) {
      w.tyre.rotation.x += spin
      if (w.front) w.pivot.rotation.y = v.steer * 0.5
    }
    // brake lights
    const braking = isPlayer ? this.game.input.brake > 0 : v.ai && v.ai.speed < 3
    if (v.tailMat) v.tailMat.emissiveIntensity = braking ? 4 : 1.2
    // siren blinking
    if (v.sirenMats) {
      v.sirenPhase += dt * 7
      const on = Math.sin(v.sirenPhase) > 0
      v.sirenMats.red.emissiveIntensity = on ? 4 : 0.6
      v.sirenMats.blue.emissiveIntensity = on ? 0.6 : 4
    }
    // smoke damage
    if (v.hp < v.maxHp * 0.35 && !v.destroyed) {
      v.damageSmoke -= dt
      if (v.damageSmoke <= 0) {
        v.damageSmoke = 0.18
        this.game.effects.puff(new THREE.Vector3(v.pos.x + (Math.random() - .5), 0.9, v.pos.z + (Math.random() - .5)), 0x2a2a2a, 0.5)
      }
    }
  }

  collideVehicles(dt) {
    const pv = this.playerVehicle
    if (!pv) return
    for (const v of this.vehicles) {
      if (v === pv || v.destroyed) continue
      const dx = v.pos.x - pv.pos.x
      const dz = v.pos.z - pv.pos.z
      const d = Math.hypot(dx, dz)
      const minD = 2.6
      if (d > 0.001 && d < minD) {
        const nx = dx / d, nz = dz / d
        const overlap = minD - d
        v.pos.x += nx * overlap * 0.5
        v.pos.z += nz * overlap * 0.5
        pv.pos.x -= nx * overlap * 0.5
        pv.pos.z -= nz * overlap * 0.5
        const rel = pv.vel.length()
        if (rel > 8) {
          this.damageVehicle(v, rel * 0.8)
          this.damageVehicle(pv, rel * 0.45)
          pv.vel.multiplyScalar(0.55)
          pv.speed *= 0.55
          this.game.effects.burst(new THREE.Vector3(pv.pos.x, 0.7, pv.pos.z), 8, 0xffc070, 4, 0.4, -10)
          this.game.audio.crash(rel / 20)
          this.game.player.takeDamage(rel * 0.15, 'crash', true)
        }
        if (v.ai) v.ai.speed *= 0.3
      }
    }
  }

  damageVehicle(v, amount) {
    if (v.destroyed) return
    v.hp -= amount
    if (v.hp <= 0 && !v.destroyed) this.explodeVehicle(v)
  }

  explodeVehicle(v) {
    v.destroyed = true
    v.hp = 0
    const pos = new THREE.Vector3(v.pos.x, 0.8, v.pos.z)
    this.game.effects.explosion(pos)
    this.game.effects.shake = Math.max(this.game.effects.shake, 0.8)
    v.paint = null
    v.group.traverse(o => {
      if (o.isMesh && o.material && o.material.color && o !== v.proxy) {
        o.material = o.material.clone()
        o.material.color.setHex(0x171614)
        if (o.material.emissive) o.material.emissiveIntensity = 0
      }
    })
    v.group.rotation.z = (Math.random() - .5) * 0.08
    if (v === this.playerVehicle) {
      this.game.player.takeDamage(55, 'explosion')
      this.playerVehicle = null
      this.game.player.inCar = false
      this.game.player.group.visible = true
      this.game.player.pos.set(v.pos.x + 2, 0, v.pos.z + 2)
      this.game.hud.setDriving(false)
    }
    if (v.ai && v.ai.mode === 'police') this.game.police.onUnitDestroyed(v)
    this.game.addWanted(1, 'destroyed a vehicle')
  }

  maintainTraffic(dt) {
    this.spawnTimer -= dt
    if (this.spawnTimer > 0) return
    this.spawnTimer = 2
    const traffic = this.vehicles.filter(v => v.traffic && v.ai && !v.destroyed)
    if (traffic.length < 11) this.spawnTraffic()
    // remove distant wrecks occasionally
    const p = this.game.player
    for (const v of this.vehicles) {
      if (v.destroyed && v.pos.distanceTo(p.pos) > 160 && v !== this.playerVehicle) {
        v.pos.y = -50
        v.group.visible = false
      }
    }
  }

  nearestPoliceDist(pos) {
    let best = Infinity
    for (const v of this.vehicles) {
      if (v.isPolice && !v.destroyed) best = Math.min(best, v.pos.distanceTo(pos))
    }
    return best
  }
}
