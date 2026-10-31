import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { clamp, damp, lerp, smoothstep } from './noise.js'

export const SHIP = { length: 16, beam: 5.4, draft: 0.55, mastHeight: 17 }

function makeWoodTexture(seed = 1, base = '#7c4a2a', dark = '#4a2a17') {
  const w = 512
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  let s = seed * 9301
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  // planks along the hull
  const rows = 8
  const rh = h / rows
  for (let r = 0; r < rows; r++) {
    const shade = 0.82 + rnd() * 0.26
    ctx.fillStyle = `rgba(${Math.floor(28 * shade)},${Math.floor(16 * shade)},${Math.floor(9 * shade)},0.35)`
    ctx.fillRect(0, r * rh, w, rh)
    // grain
    for (let g = 0; g < 26; g++) {
      const y = r * rh + rnd() * rh
      ctx.beginPath()
      ctx.strokeStyle = `rgba(30,16,8,${0.06 + rnd() * 0.12})`
      ctx.lineWidth = 0.6 + rnd() * 1.4
      ctx.moveTo(0, y)
      for (let x = 0; x <= w; x += 32) {
        ctx.lineTo(x, y + Math.sin(x * 0.03 + g) * 2.4 + (rnd() - 0.5) * 3)
      }
      ctx.stroke()
    }
    // plank seam
    ctx.fillStyle = 'rgba(25,12,7,0.55)'
    ctx.fillRect(0, r * rh, w, 2)
    ctx.fillStyle = 'rgba(255,214,160,0.08)'
    ctx.fillRect(0, r * rh + 2, w, 1)
  }
  // subtle sheen
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, 'rgba(255,220,180,0.10)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0)')
  grad.addColorStop(1, 'rgba(0,0,0,0.18)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeSailTexture() {
  const w = 512
  const h = 512
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#f4e7cd')
  grad.addColorStop(0.55, '#e9d7b7')
  grad.addColorStop(1, '#d8c19b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  // seams
  for (let x = 0; x < w; x += 64) {
    ctx.fillStyle = 'rgba(104,82,54,0.32)'
    ctx.fillRect(x, 0, 3, h)
    ctx.fillStyle = 'rgba(255,250,238,0.22)'
    ctx.fillRect(x + 3, 0, 2, h)
  }
  for (let y = 0; y < h; y += 128) {
    ctx.fillStyle = 'rgba(130,110,80,0.12)'
    ctx.fillRect(0, y, w, 2)
  }
  // weather stains and patches
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * w
    const y = Math.random() * h
    const r = 8 + Math.random() * 46
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(150,120,80,${0.03 + Math.random() * 0.07})`)
    g.addColorStop(1, 'rgba(150,120,80,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // emblem
  ctx.save()
  ctx.globalAlpha = 0.1
  ctx.strokeStyle = '#8a5a2a'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.42, 58, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(w * 0.5, h * 0.42, 34, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(w * 0.5 + Math.cos(a) * 40, h * 0.42 + Math.sin(a) * 40)
    ctx.lineTo(w * 0.5 + Math.cos(a) * 56, h * 0.42 + Math.sin(a) * 56)
    ctx.stroke()
  }
  ctx.restore()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function makeFlagTexture() {
  const w = 256
  const h = 144
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#124a5c')
  grad.addColorStop(1, '#0a2d3b')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#e9c88a'
  ctx.lineWidth = 6
  ctx.strokeRect(8, 8, w - 16, h - 16)
  ctx.strokeStyle = '#f3d9a0'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, 30, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(w / 2, h / 2 - 42)
  ctx.lineTo(w / 2, h / 2 + 42)
  ctx.moveTo(w / 2 - 36, h / 2)
  ctx.lineTo(w / 2 + 36, h / 2)
  ctx.stroke()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(w / 2 + Math.cos(a) * 34, h / 2 + Math.sin(a) * 34)
    ctx.lineTo(w / 2 + Math.cos(a) * 46, h / 2 + Math.sin(a) * 46)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function makeNameTexture() {
  const w = 512
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#e9c88a'
  ctx.font = '700 64px Amiri, serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('الأفق', w / 2, h / 2 - 2)
  ctx.strokeStyle = 'rgba(233,200,138,0.5)'
  ctx.lineWidth = 2
  ctx.strokeRect(60, 22, w - 120, h - 44)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function widthAt(u) {
  return (SHIP.beam / 2) * Math.pow(Math.sin(Math.PI * (0.14 + 0.86 * u)), 0.62)
}
function deckAt(u) {
  return 1.3 + 0.62 * Math.pow(u, 1.7)
}
function depthAt(u) {
  return 2.35 * (0.68 + 0.32 * Math.sin(Math.PI * u))
}

function buildHullGeometry() {
  const N = 46
  const M = 22
  const positions = []
  const uvs = []
  const indices = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const z = (u - 0.5) * SHIP.length
    const w = widthAt(u)
    const deck = deckAt(u)
    const depth = depthAt(u)
    for (let j = 0; j <= M; j++) {
      const v = j / M
      const phi = Math.PI * v
      const x = -Math.cos(phi) * w * (1 + 0.05 * Math.sin(phi))
      const y = deck - Math.pow(Math.sin(phi), 0.78) * depth
      positions.push(x, y, z)
      uvs.push(u * 3.2, v * 1.6)
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j
      const b = a + 1
      const c = a + (M + 1)
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildDeckGeometry() {
  const N = 34
  const M = 10
  const positions = []
  const uvs = []
  const indices = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const z = (u - 0.5) * SHIP.length * 0.985
    const w = widthAt(u) * 0.965
    const deck = deckAt(u) - 0.14
    for (let j = 0; j <= M; j++) {
      const x = (j / M - 0.5) * 2 * w
      const camber = 0.13 * (1 - Math.pow(x / Math.max(w, 0.01), 2))
      positions.push(x, deck + camber, z)
      uvs.push(u * 3.5, (j / M) * 1.2)
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j
      const b = a + 1
      const c = a + (M + 1)
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildMainsailGeometry() {
  const S = 14
  const T = 18
  const positions = []
  const uvs = []
  const indices = []
  const topY = 12.4
  const span = 7.4
  for (let j = 0; j <= T; j++) {
    const v = j / T
    for (let i = 0; i <= S; i++) {
      const u = i / S
      const z = -(u * span * (1 - 0.8 * v) + 0.18)
      const y = v * topY + Math.sin(v * Math.PI) * 0.22
      const billow = Math.sin(Math.PI * Math.min(1, u * 1.02)) * Math.sin(Math.PI * v * 0.92) * (0.95 - v * 0.42)
      const x = -billow + 0.03
      positions.push(x, y, z)
      uvs.push(u, v)
    }
  }
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i
      const b = a + 1
      const c = a + (S + 1)
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function buildJibGeometry() {
  const A = new THREE.Vector3(0, deckAt(1) + 0.5, 7.0)
  const B = new THREE.Vector3(0, deckAt(0.6) + 11.0, 2.3)
  const C = new THREE.Vector3(0, deckAt(0.6) + 2.6, 2.3)
  const S = 12
  const T = 16
  const positions = []
  const uvs = []
  const indices = []
  const luff = new THREE.Vector3()
  const leech = new THREE.Vector3()
  const p = new THREE.Vector3()
  for (let j = 0; j <= T; j++) {
    const v = j / T
    luff.copy(A).lerp(B, v)
    leech.copy(C).lerp(B, v)
    for (let i = 0; i <= S; i++) {
      const u = i / S
      p.copy(luff).lerp(leech, u)
      const billow = Math.sin(Math.PI * u) * Math.sin(Math.PI * v) * 0.95 * (0.45 + 0.55 * (1 - v))
      positions.push(p.x + billow, p.y + Math.sin(u * Math.PI) * 0.1, p.z)
      uvs.push(u, v)
    }
  }
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < S; i++) {
      const a = j * (S + 1) + i
      const b = a + 1
      const c = a + (S + 1)
      const d = c + 1
      indices.push(a, b, c, b, d, c)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function addCylinderBetween(group, a, b, radius, material, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const geo = new THREE.CylinderGeometry(radius, radius, len, radial)
  const mesh = new THREE.Mesh(geo, material)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize())
  group.add(mesh)
  return mesh
}

export class Ship {
  constructor(scene, lowQuality = false) {
    this.root = new THREE.Group()
    this.root.name = 'ship'
    this.tilt = new THREE.Group()
    this.root.add(this.tilt)
    scene.add(this.root)

    this.heading = Math.PI
    this.speed = 0
    this.sail = 0.72
    this.anchored = false
    this.pitch = 0
    this.roll = 0
    this.sailAngle = 0
    this.time = 0
    this.draft = SHIP.draft
    this.position = this.root.position
    this.forward = new THREE.Vector3(0, 0, -1)
    this.right = new THREE.Vector3(1, 0, 0)
    this._h = new THREE.Vector3()

    const wood = makeWoodTexture(3, '#7d4a2a')
    const deckWood = makeWoodTexture(7, '#b58a5c')
    const sailTex = makeSailTexture()
    const flagTex = makeFlagTexture()

    this.materials = {
      hull: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.68, metalness: 0.07 }),
      deck: new THREE.MeshStandardMaterial({ map: deckWood, roughness: 0.8, metalness: 0.03 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.7, metalness: 0.05 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xc9a15c, roughness: 0.32, metalness: 0.72 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2a2e31, roughness: 0.5, metalness: 0.75 }),
      sail: new THREE.MeshStandardMaterial({
        map: sailTex,
        color: 0xf7ead2,
        roughness: 0.96,
        metalness: 0,
        side: THREE.DoubleSide,
        emissive: 0x8a6a3e,
        emissiveIntensity: 0.4
      }),
      rope: new THREE.LineBasicMaterial({ color: 0x2b1c12, transparent: true, opacity: 0.9 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x2b1a0f, emissive: 0xffb45c, emissiveIntensity: 0.4, roughness: 0.3 }),
      flag: new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.9 }),
      name: new THREE.MeshBasicMaterial({ map: makeNameTexture(), transparent: true, depthWrite: false })
    }

    this.buildHull()
    this.buildDeck()
    this.buildMast()
    this.buildDetails()
    this.buildLights()
    this.buildWaterShadow()

    this.root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })

    this.flagBase = []
    this.flagGeo = null
    this.lanternIntensity = 0

    if (lowQuality) this.mergeStatics()
  }

  // The ship is a few dozen small meshes. On software renderers every draw call
  // is expensive, so bake all rigid parts into one mesh per material while
  // leaving the animated pieces (sail, jib, flag, lantern) untouched.
  mergeStatics() {
    this.tilt.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(this.tilt.matrixWorld).invert()
    const tmp = new THREE.Matrix4()
    const excluded = new Set([this.jib, this.flag, this.lantern, this.lanternGlass, this.lanternGlow, this.sailPivot])
    const groups = new Map()
    const remove = []
    this.tilt.traverse((obj) => {
      if (!obj.isMesh || obj.isSprite || obj.isInstancedMesh) return
      let p = obj
      while (p && p !== this.tilt) {
        if (excluded.has(p)) return
        p = p.parent
      }
      const mat = obj.material
      if (!mat || Array.isArray(mat) || mat.transparent) return
      let entry = groups.get(mat.uuid)
      if (!entry) {
        entry = { mat, geos: [] }
        groups.set(mat.uuid, entry)
      }
      const src = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()
      if (!src.attributes.position || !src.attributes.normal) return
      for (const name of Object.keys(src.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') src.deleteAttribute(name)
      }
      if (!src.attributes.uv) {
        src.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2))
      }
      tmp.copy(inv).multiply(obj.matrixWorld)
      src.applyMatrix4(tmp)
      entry.geos.push(src)
      remove.push(obj)
    })
    for (const { mat, geos } of groups.values()) {
      if (!geos.length) continue
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.tilt.add(mesh)
    }
    for (const obj of remove) obj.parent?.remove(obj)
  }

  buildHull() {
    const hull = new THREE.Mesh(buildHullGeometry(), this.materials.hull)
    this.tilt.add(hull)

    const deck = new THREE.Mesh(buildDeckGeometry(), this.materials.deck)
    deck.receiveShadow = true
    this.tilt.add(deck)

    // transom
    const w0 = widthAt(0)
    const d0 = depthAt(0)
    const y0 = deckAt(0)
    const shape = new THREE.Shape()
    shape.moveTo(-w0 * 0.98, y0 - 0.05)
    const segs = 18
    for (let i = 1; i <= segs; i++) {
      const v = i / segs
      const phi = Math.PI * (1 - v)
      shape.lineTo(-Math.cos(phi) * w0 * 0.98, y0 - Math.pow(Math.sin(phi), 0.78) * d0 + 0.02)
    }
    shape.lineTo(w0 * 0.98, y0 - 0.05)
    shape.closePath()
    const transomGeo = new THREE.ShapeGeometry(shape)
    const transom = new THREE.Mesh(transomGeo, this.materials.darkWood)
    transom.position.z = -SHIP.length / 2 + 0.02
    transom.rotation.y = Math.PI
    this.tilt.add(transom)

    // name plate on the transom
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.78), this.materials.name)
    plate.position.set(0, y0 - 0.85, -SHIP.length / 2 - 0.01)
    plate.rotation.y = Math.PI
    this.tilt.add(plate)

    // gold sheer stripe along both sides
    for (const side of [-1, 1]) {
      const pts = []
      for (let i = 0; i <= 24; i++) {
        const u = 0.06 + (i / 24) * 0.9
        const z = (u - 0.5) * SHIP.length
        const w = widthAt(u)
        const deck = deckAt(u) - 0.24
        pts.push(new THREE.Vector3(side * w * 0.985, deck, z))
      }
      const curve = new THREE.CatmullRomCurve3(pts)
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.085, 5, false), this.materials.trim)
      this.tilt.add(tube)
    }

    // rails
    const railPts = []
    for (let side of [1, -1]) {
      const pts = []
      for (let i = 0; i <= 28; i++) {
        const u = i / 28
        const z = (u - 0.5) * SHIP.length * 0.985
        const w = widthAt(u) * 0.955
        pts.push(new THREE.Vector3(side * w, deckAt(u) + 0.62, z))
      }
      if (side === 1) {
        for (let i = 28; i >= 0; i--) {
          const u = i / 28
          const z = (u - 0.5) * SHIP.length * 0.985
          const w = widthAt(u) * 0.955
          railPts.push(new THREE.Vector3(-w, deckAt(u) + 0.62, z))
        }
      }
    }
    // stern rail closes the loop
    railPts.push(new THREE.Vector3(widthAt(0) * 0.955, deckAt(0) + 0.62, -SHIP.length / 2 + 0.1))
    const railCurve = new THREE.CatmullRomCurve3(railPts, true)
    const rail = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 150, 0.1, 5, true), this.materials.darkWood)
    this.tilt.add(rail)

    // stanchions
    for (let side of [-1, 1]) {
      for (let i = 1; i < 10; i++) {
        const u = i / 10
        const z = (u - 0.5) * SHIP.length * 0.975
        const w = widthAt(u) * 0.94
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.6, 5), this.materials.darkWood)
        post.position.set(side * w, deckAt(u) + 0.31, z)
        this.tilt.add(post)
      }
    }
  }

  buildDeck() {
    const cabin = new THREE.Group()
    const cz = -3.6
    const cy = deckAt(0.24)
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.5, 3.4), this.materials.hull)
    body.position.set(0, cy + 0.75, cz)
    cabin.add(body)

    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 3.8), this.materials.darkWood)
    roof.position.set(0, cy + 1.62, cz)
    cabin.add(roof)

    const trim = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.12, 3.62), this.materials.trim)
    trim.position.set(0, cy + 1.5, cz)
    cabin.add(trim)

    // windows (glow at night)
    for (const side of [-1, 1]) {
      for (let i = -1; i <= 1; i++) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.52), this.materials.glass)
        win.position.set(side * 1.66, cy + 0.92, cz + i * 0.9)
        win.rotation.y = side * Math.PI / 2
        cabin.add(win)
      }
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), this.materials.darkWood)
    door.position.set(0, cy + 0.62, cz - 1.71)
    door.rotation.y = Math.PI
    cabin.add(door)
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), this.materials.trim)
    handle.position.set(0.26, cy + 0.62, cz - 1.75)
    cabin.add(handle)
    this.tilt.add(cabin)
    this.cabin = cabin
    this.windows = cabin.children.filter((c) => c.material === this.materials.glass)

    // helm wheel
    const wheelGroup = new THREE.Group()
    wheelGroup.position.set(0, deckAt(0.35) + 1.0, -1.3)
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.075, 7, 22), this.materials.darkWood)
    wheel.rotation.y = Math.PI / 2
    wheelGroup.add(wheel)
    for (let i = 0; i < 8; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.55, 4), this.materials.darkWood)
      spoke.rotation.z = (i / 8) * Math.PI
      wheelGroup.add(spoke)
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), this.materials.trim)
    wheelGroup.add(hub)
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 6), this.materials.darkWood)
    pedestal.position.y = -0.65
    wheelGroup.add(pedestal)
    this.tilt.add(wheelGroup)
  }

  buildMast() {
    const mastZ = 1.6
    const baseY = deckAt(0.6)
    this.mastZ = mastZ
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.28, SHIP.mastHeight, 10), this.materials.hull)
    mast.position.set(0, baseY + SHIP.mastHeight / 2, mastZ)
    this.tilt.add(mast)

    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 5, 12), this.materials.trim)
      band.rotation.x = Math.PI / 2
      band.position.set(0, baseY + 4.2 + i * 4.2, mastZ)
      this.tilt.add(band)
    }

    // crow's nest
    const nestY = baseY + 11.8
    const nestFloor = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.15, 0.16, 14), this.materials.darkWood)
    nestFloor.position.set(0, nestY, mastZ)
    this.tilt.add(nestFloor)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.05, 4), this.materials.darkWood)
      post.position.set(Math.cos(a) * 1.15, nestY + 0.55, mastZ + Math.sin(a) * 1.15)
      this.tilt.add(post)
    }
    const nestRail = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.045, 5, 20), this.materials.darkWood)
    nestRail.rotation.x = Math.PI / 2
    nestRail.position.set(0, nestY + 1.05, mastZ)
    this.tilt.add(nestRail)

    // sail pivot (boom + mainsail)
    this.sailPivot = new THREE.Group()
    this.sailPivot.position.set(0, baseY + 3.5, mastZ)
    this.tilt.add(this.sailPivot)

    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 7.6, 7), this.materials.darkWood)
    boom.rotation.x = Math.PI / 2
    boom.position.set(0, 0, -3.8)
    this.sailPivot.add(boom)
    const boomEnd = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), this.materials.trim)
    boomEnd.position.set(0, 0, -7.6)
    this.sailPivot.add(boomEnd)

    const mainsail = new THREE.Mesh(buildMainsailGeometry(), this.materials.sail)
    mainsail.castShadow = true
    this.sailPivot.add(mainsail)
    this.mainsail = mainsail

    // jib
    const jib = new THREE.Mesh(buildJibGeometry(), this.materials.sail)
    jib.castShadow = true
    this.tilt.add(jib)
    this.jib = jib
    this.jibBase = jib.geometry.attributes.position.array.slice()

    // bowsprit
    const bowsprit = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 3.6, 7), this.materials.darkWood)
    bowsprit.position.set(0, deckAt(1) + 0.5, 8.2)
    bowsprit.rotation.x = Math.PI / 2 - 0.12
    this.tilt.add(bowsprit)

    // rigging
    const mastTop = new THREE.Vector3(0, baseY + SHIP.mastHeight - 0.2, mastZ)
    const ropes = []
    const bowTip = new THREE.Vector3(0, deckAt(1) + 0.7, 9.4)
    const stern = new THREE.Vector3(0, deckAt(0) + 0.6, -7.6)
    const port = new THREE.Vector3(-widthAt(0.42) * 0.9, deckAt(0.42) + 0.6, -1.9)
    const starboard = new THREE.Vector3(widthAt(0.42) * 0.9, deckAt(0.42) + 0.6, -1.9)
    const midPort = new THREE.Vector3(-widthAt(0.72) * 0.92, deckAt(0.72) + 0.6, 3.4)
    const midStar = new THREE.Vector3(widthAt(0.72) * 0.92, deckAt(0.72) + 0.6, 3.4)
    for (const target of [bowTip, stern, port, starboard, midPort, midStar]) {
      ropes.push(mastTop, target)
    }
    ropes.push(new THREE.Vector3(0, baseY + 1.2, mastZ), bowTip)
    const ropeGeo = new THREE.BufferGeometry().setFromPoints(ropes)
    const lines = new THREE.LineSegments(ropeGeo, this.materials.rope)
    this.tilt.add(lines)

    // flag at the masthead
    const flagGeo = new THREE.PlaneGeometry(1.9, 1.05, 10, 5)
    flagGeo.translate(0.95, 0, 0)
    const flag = new THREE.Mesh(flagGeo, this.materials.flag)
    flag.position.set(0, baseY + SHIP.mastHeight - 0.1, mastZ)
    this.tilt.add(flag)
    this.flag = flag
    this.flagBase = flagGeo.attributes.position.array.slice()
    this.flagGeo = flagGeo

    // masthead light
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }))
    bulb.position.set(0, baseY + SHIP.mastHeight + 0.15, mastZ)
    this.tilt.add(bulb)
  }

  buildDetails() {
    const y = deckAt(0.26)
    // barrels
    for (let i = 0; i < 2; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.95, 9), this.materials.darkWood)
      barrel.position.set(-1.0 + i * 0.9, y + 0.48, -6.2 + i * 0.1)
      this.tilt.add(barrel)
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 4, 10), this.materials.iron)
      hoop.rotation.x = Math.PI / 2
      hoop.position.copy(barrel.position).y += 0.3
      this.tilt.add(hoop)
    }
    // crates
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), this.materials.deck)
      crate.position.set(1.2 - i * 0.2, y + 0.36, -5.2 + i * 0.85)
      crate.rotation.y = i * 0.3
      this.tilt.add(crate)
    }
    // rope coil
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 6, 14), this.materials.rope)
    coil.rotation.x = Math.PI / 2
    coil.position.set(1.1, deckAt(0.5) + 0.16, 4.2)
    this.tilt.add(coil)
    // capstan
    const capstan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.9, 9), this.materials.darkWood)
    capstan.position.set(0, deckAt(0.48) + 0.45, 4.6)
    this.tilt.add(capstan)
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.16, 9), this.materials.trim)
    capTop.position.set(0, deckAt(0.48) + 0.95, 4.6)
    this.tilt.add(capTop)
    // figurehead
    const figure = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.9, 6), this.materials.trim)
    figure.rotation.x = Math.PI / 2
    figure.position.set(0, deckAt(1) + 0.5, 8.7)
    this.tilt.add(figure)
  }

  buildLights() {
    this.lantern = new THREE.PointLight(0xffa95e, 0, 55, 2)
    this.lantern.position.set(0, deckAt(0) + 3.0, -6.4)
    this.tilt.add(this.lantern)

    const lanternGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc477, transparent: true, opacity: 0.95 })
    )
    lanternGlass.position.copy(this.lantern.position)
    this.tilt.add(lanternGlass)
    this.lanternGlass = lanternGlass

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 5), this.materials.iron)
    pole.position.set(0, deckAt(0) + 2.35, -6.4)
    this.tilt.add(pole)

    const spriteMat = new THREE.SpriteMaterial({
      map: makeGlowSprite(),
      color: 0xffb066,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
    this.lanternGlow = new THREE.Sprite(spriteMat)
    this.lanternGlow.scale.set(3.4, 3.4, 1)
    this.lanternGlow.position.copy(this.lantern.position)
    this.tilt.add(this.lanternGlow)
  }

  setHeading(h) {
    this.heading = h
  }

  buildWaterShadow() {
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(27, 11).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: makeShadowTexture(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    )
    shadow.position.y = -0.32
    shadow.renderOrder = 2
    this.root.add(shadow)
    this.waterShadow = shadow
  }

  update(dt, controls, world) {
    this.time += dt
    const { steer = 0, sailDelta = 0, anchor = false } = controls
    const { windAngle, windStrength, storm, ocean } = world

    if (sailDelta) this.sail = clamp(this.sail + sailDelta, 0, 1)
    this.anchored = anchor

    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.right.set(Math.cos(this.heading), 0, -Math.sin(this.heading))

    const wind = new THREE.Vector3(Math.sin(windAngle), 0, Math.cos(windAngle))
    const align = this.forward.dot(wind)
    const efficiency = clamp(0.24 + 0.76 * Math.pow(Math.max(0, align), 0.72), 0.24, 1)
    const targetSpeed = anchor ? 0 : this.sail * (3.2 + 18.5 * efficiency) * windStrength
    const lambda = targetSpeed > this.speed ? 0.55 : 0.85
    this.speed = damp(this.speed, targetSpeed, lambda, dt)
    if (this.speed < 0.02) this.speed = 0

    const turnAuthority = clamp(this.speed / 7, 0.22, 1)
    const turnRate = 0.52 * turnAuthority * (this.anchored ? 0.45 : 1)
    this.heading += steer * turnRate * dt

    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.right.set(Math.cos(this.heading), 0, -Math.sin(this.heading))
    this.root.position.x += this.forward.x * this.speed * dt
    this.root.position.z += this.forward.z * this.speed * dt

    // buoyancy sampled at bow, stern and both beams
    const px = this.root.position.x
    const pz = this.root.position.z
    const hCenter = ocean.heightAt(px, pz)
    const hBow = ocean.heightAt(px + this.forward.x * 6.5, pz + this.forward.z * 6.5)
    const hStern = ocean.heightAt(px - this.forward.x * 6.5, pz - this.forward.z * 6.5)
    const hStar = ocean.heightAt(px + this.right.x * 2.3, pz + this.right.z * 2.3)
    const hPort = ocean.heightAt(px - this.right.x * 2.3, pz - this.right.z * 2.3)

    const targetPitch = -Math.atan2(hBow - hStern, 13) - this.speed * 0.0016
    const targetRoll = Math.atan2(hStar - hPort, 4.6) + steer * this.speed * 0.0026
    this.pitch = damp(this.pitch, targetPitch, 3.2, dt)
    this.roll = damp(this.roll, targetRoll, 3.0, dt)
    const heave = (hCenter * 0.5 + (hBow + hStern + hStar + hPort) * 0.125)
    this.root.position.y = damp(this.root.position.y, heave + 0.36, 4.5, dt)

    this.tilt.rotation.x = this.pitch
    this.tilt.rotation.z = this.roll
    this.root.rotation.y = this.heading

    // sail swings with the apparent wind
    const rel = Math.atan2(wind.x, wind.z) - this.heading
    const targetSail = clamp(Math.sin(rel) * 0.55, -0.62, 0.62)
    this.sailAngle = damp(this.sailAngle, targetSail, 1.8, dt)
    this.sailPivot.rotation.y = this.sailAngle
    this.jib.rotation.y = this.sailAngle * 0.35

    // pennant flutter
    if (this.flagGeo) {
      const pos = this.flagGeo.attributes.position
      const base = this.flagBase
      const t = this.time * 9
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3]
        const y = base[i * 3 + 1]
        const k = x / 1.9
        pos.array[i * 3 + 2] = Math.sin(t + x * 2.2 + y * 0.8) * 0.17 * k + Math.sin(t * 0.6 + x) * 0.06 * k
      }
      pos.needsUpdate = true
      this.flagGeo.computeVertexNormals()
    }

    // gentle jib breathing
    if (this.jibBase) {
      const pos = this.jib.geometry.attributes.position
      const base = this.jibBase
      const t = this.time * 2.4
      for (let i = 0; i < pos.count; i++) {
        const y = base[i * 3 + 1]
        pos.array[i * 3] = base[i * 3] + Math.sin(t + y * 0.5) * 0.045 * Math.max(0, (y - 2) / 12)
      }
      pos.needsUpdate = true
    }

    // lights respond to the time of day
    const night = world.night ?? 0
    const glow = smoothstep(0.15, 0.75, night)
    this.lantern.intensity = glow * 22
    this.lanternGlow.material.opacity = 0.12 + glow * 0.62
    this.lanternGlass.material.color.setHex(glow > 0.4 ? 0xffc477 : 0x9a7a55)
    this.materials.glass.emissiveIntensity = 0.1 + glow * 1.4
  }

  getSpeedKnots() {
    return this.speed * 1.94
  }

  stern(out = new THREE.Vector3()) {
    return out.copy(this.root.position).addScaledVector(this.forward, -SHIP.length * 0.5)
  }

  bow(out = new THREE.Vector3()) {
    return out.copy(this.root.position).addScaledVector(this.forward, SHIP.length * 0.5)
  }
}

let shipShadowTex = null
function makeShadowTexture() {
  if (shipShadowTex) return shipShadowTex
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(2, 16, 20, 0.7)')
  g.addColorStop(0.5, 'rgba(2, 16, 20, 0.45)')
  g.addColorStop(1, 'rgba(2, 16, 20, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  shipShadowTex = new THREE.CanvasTexture(canvas)
  shipShadowTex.colorSpace = THREE.SRGBColorSpace
  return shipShadowTex
}

let glowTex = null
function makeGlowSprite() {  if (glowTex) return glowTex
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,224,170,0.95)')
  g.addColorStop(0.25, 'rgba(255,180,100,0.45)')
  g.addColorStop(0.6, 'rgba(255,150,70,0.12)')
  g.addColorStop(1, 'rgba(255,140,60,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  glowTex = new THREE.CanvasTexture(canvas)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}
