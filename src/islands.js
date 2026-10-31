import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ISLAND_SPECS, islandHeight, islandSlope, averageWaterline, findWaterline } from './terrain.js'
import { mulberry32, TAU, clamp, smoothstep, lerp } from './noise.js'
import { makeRadialTexture } from './effects.js'

let lowQuality = false
export function setLowQuality(on) { lowQuality = Boolean(on) }

const C = (hex) => new THREE.Color(hex)

let palmGeo = null
let cypressGeo = null
let bushGeo = null
let rockGeo = null

function addVertexColor(geo, color) {
  const count = geo.attributes.position.count
  const arr = new Float32Array(count * 3)
  const c = color instanceof THREE.Color ? color : new THREE.Color(color)
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}

function buildPalmGeometry() {
  if (palmGeo) return palmGeo
  const parts = []
  const TRUNK_H = 8.2
  const trunk = new THREE.CylinderGeometry(0.18, 0.46, TRUNK_H, 7, 8, false)
  const pos = trunk.attributes.position
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + TRUNK_H / 2
    const t = y / TRUNK_H
    pos.setX(i, pos.getX(i) + Math.pow(t, 2.1) * 1.9)
    pos.setZ(i, pos.getZ(i) + Math.pow(t, 2.4) * 0.5)
    const shade = 0.55 + 0.25 * t
    col[i * 3] = 0.34 * shade
    col[i * 3 + 1] = 0.24 * shade
    col[i * 3 + 2] = 0.15 * shade
  }
  trunk.translate(0, TRUNK_H / 2, 0)
  trunk.setAttribute('color', new THREE.BufferAttribute(col, 3))
  trunk.deleteAttribute('uv')
  trunk.computeVertexNormals()
  parts.push(trunk)

  const topX = 1.9
  const topZ = 0.5
  const topY = TRUNK_H
  const leafPositions = []
  const leafColors = []
  const leafIndices = []
  let baseIndex = 0
  const leaves = 9
  for (let l = 0; l < leaves; l++) {
    const angle = (l / leaves) * TAU + (l % 2) * 0.2
    const dirX = Math.cos(angle)
    const dirZ = Math.sin(angle)
    const segs = 7
    const start = baseIndex
    for (let s = 0; s <= segs; s++) {
      const t = s / segs
      const dist = t * 3.9
      const y = topY + Math.sin(t * Math.PI) * 0.55 - Math.pow(t, 1.8) * 2.3
      const width = (1 - t) * 0.52 + 0.035
      const px = topX + dirX * dist
      const pz = topZ + dirZ * dist
      const perpX = -dirZ
      const perpZ = dirX
      leafPositions.push(px + perpX * width, y, pz + perpZ * width)
      leafPositions.push(px - perpX * width, y, pz - perpZ * width)
      const g = 0.3 + 0.22 * (1 - t)
      leafColors.push(0.09, g * 0.9, 0.07)
      leafColors.push(0.09, g * 0.9, 0.07)
      if (s < segs) {
        const a = start + s * 2
        leafIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    baseIndex += (segs + 1) * 2
  }
  const leavesGeo = new THREE.BufferGeometry()
  leavesGeo.setAttribute('position', new THREE.Float32BufferAttribute(leafPositions, 3))
  leavesGeo.setAttribute('color', new THREE.Float32BufferAttribute(leafColors, 3))
  leavesGeo.setIndex(leafIndices)
  leavesGeo.computeVertexNormals()
  parts.push(leavesGeo)

  // coconuts
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + 0.4
    const coco = new THREE.IcosahedronGeometry(0.19, 0)
    coco.translate(topX + Math.cos(a) * 0.4, topY - 0.25, topZ + Math.sin(a) * 0.4)
    addVertexColor(coco, C('#4a3320'))
    coco.deleteAttribute('uv')
    parts.push(coco)
  }

  palmGeo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)
  return palmGeo
}

function buildCypressGeometry() {
  if (cypressGeo) return cypressGeo
  const parts = []
  const trunk = new THREE.CylinderGeometry(0.14, 0.36, 6.4, 6, 4)
  trunk.translate(0, 3.2, 0)
  addVertexColor(trunk, C('#3a2a1c'))
  trunk.deleteAttribute('uv')
  parts.push(trunk)
  const tiers = [
    { y: 3.4, r: 2.0, h: 4.6 },
    { y: 5.8, r: 1.55, h: 4.0 },
    { y: 8.0, r: 1.05, h: 3.2 }
  ]
  for (const t of tiers) {
    const cone = new THREE.ConeGeometry(t.r, t.h, 8, 1)
    cone.translate(0, t.y + t.h / 2, 0)
    addVertexColor(cone, C('#1f3a24'))
    cone.deleteAttribute('uv')
    parts.push(cone)
  }
  cypressGeo = mergeGeometries(parts, false)
  return cypressGeo
}

function buildBushGeometry() {
  if (bushGeo) return bushGeo
  const parts = []
  const rng = mulberry32(7)
  for (let i = 0; i < 4; i++) {
    const s = 0.55 + rng() * 0.6
    const blob = new THREE.IcosahedronGeometry(s, 1)
    blob.translate((rng() - 0.5) * 1.2, s * 0.7 + rng() * 0.3, (rng() - 0.5) * 1.2)
    addVertexColor(blob, C(i % 2 === 0 ? '#2f5124' : '#3c612c'))
    blob.deleteAttribute('uv')
    parts.push(blob)
  }
  bushGeo = mergeGeometries(parts, false)
  return bushGeo
}

function buildRockGeometry() {
  if (rockGeo) return rockGeo
  const geo = new THREE.DodecahedronGeometry(1, 1)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const n = 1 + 0.22 * Math.sin(x * 3.1 + y * 2.7) * Math.cos(z * 2.3)
    pos.setXYZ(i, x * n, y * n * 0.72, z * n)
  }
  geo.computeVertexNormals()
  addVertexColor(geo, C('#6e685d'))
  geo.deleteAttribute('uv')
  rockGeo = geo
  return geo
}

function foamTexture() {
  const w = 512
  const h = 128
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, w, h)
  let s = 99
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = 2 + rnd() * 14
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(255,255,255,${0.18 + rnd() * 0.4})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // streaks along the shore direction
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.35})`
    ctx.lineWidth = 1 + rnd() * 4
    ctx.beginPath()
    const y = rnd() * h
    ctx.moveTo(0, y)
    for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 6)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

let sharedFoamTex = null
let glowTexture = null
let sharedShadowTex = null
let sharedShadowMat = null
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)

function shadowTexture() {
  if (sharedShadowTex) return sharedShadowTex
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(4, 12, 10, 0.72)')
  g.addColorStop(0.55, 'rgba(4, 12, 10, 0.4)')
  g.addColorStop(1, 'rgba(4, 12, 10, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  sharedShadowTex = new THREE.CanvasTexture(canvas)
  sharedShadowTex.colorSpace = THREE.SRGBColorSpace
  sharedShadowMat = new THREE.MeshBasicMaterial({
    map: sharedShadowTex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  })
  return sharedShadowTex
}

function glowSpriteTexture() {
  if (!glowTexture) glowTexture = makeRadialTexture(128, 'rgba(255,232,180,1)', 'rgba(255,190,90,0)')
  return glowTexture
}

export class Island {
  constructor(spec, scene) {
    this.spec = spec
    this.name = spec.name
    this.short = spec.short
    this.type = spec.type
    this.seed = spec.seed
    this.radius = spec.radius
    this.height = spec.height
    this.position = new THREE.Vector3(spec.x, 0, spec.z)
    this.waterRadius = averageWaterline(spec, 48)
    this.discovered = false
    this.chestOpened = false
    this.chest = null
    this.chestAngle = 0
    this.group = new THREE.Group()
    this.group.position.copy(this.position)
    scene.add(this.group)
    this.rng = mulberry32(spec.seed * 7919)
    this.time = 0
    this.smoke = []
    this.mist = []
    this.fireflies = null
    this.birds = []
    this.beamGroup = null

    this.buildTerrain()
    this.buildFoam()
    this.buildProps()
    this.buildLandmarks()
    this.buildChest()
    this.buildAtmosphere()
    if (lowQuality) {
      this.mergeStatics()
      this.simplifyMaterials()
    }
  }

  mergeStatics() {
    this.group.updateMatrixWorld(true)
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert()
    const tmp = new THREE.Matrix4()
    const excluded = new Set([this.foam, this.chest, this.beamGroup, this.volcano, this.crystal, this.lighthouseLight, this.shrineLight, this.lavaGlow])
    const geos = []
    const remove = []
    const color = new THREE.Color()
    this.group.traverse((obj) => {
      if (!obj.isMesh || obj.isInstancedMesh || obj.isSprite) return
      let p = obj
      while (p && p !== this.group) {
        if (excluded.has(p)) return
        p = p.parent
      }
      if (obj === this.terrain) return
      const mat = obj.material
      if (!mat || Array.isArray(mat)) return
      if (mat.transparent && (mat.opacity ?? 1) < 0.99) return
      const src = obj.geometry.index ? obj.geometry.toNonIndexed() : obj.geometry.clone()
      if (!src.attributes.position || !src.attributes.normal) return
      tmp.copy(inv).multiply(obj.matrixWorld)
      src.applyMatrix4(tmp)
      for (const name of Object.keys(src.attributes)) {
        if (name !== 'position' && name !== 'normal') src.deleteAttribute(name)
      }
      color.copy(mat.color || new THREE.Color(0xffffff))
      if (mat.emissive) {
        const e = mat.emissiveIntensity ?? 0
        color.r += mat.emissive.r * e
        color.g += mat.emissive.g * e
        color.b += mat.emissive.b * e
      }
      const n = src.attributes.position.count
      const arr = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        arr[i * 3] = color.r
        arr[i * 3 + 1] = color.g
        arr[i * 3 + 2] = color.b
      }
      src.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      geos.push(src)
      remove.push(obj)
    })
    if (geos.length > 1) {
      const merged = mergeGeometries(geos, false)
      if (merged) {
        const mesh = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }))
        mesh.castShadow = true
        mesh.receiveShadow = true
        this.group.add(mesh)
        for (const obj of remove) obj.parent?.remove(obj)
      }
    }
  }

  simplifyMaterials() {
    const cache = new Map()
    this.group.traverse((obj) => {
      if (!obj.isMesh || !obj.material || Array.isArray(obj.material)) return
      if (obj.material.isMeshLambertMaterial || obj.material.isMeshBasicMaterial) return
      const src = obj.material
      let mat = cache.get(src.uuid)
      if (!mat) {
        mat = new THREE.MeshLambertMaterial({
          color: src.color ? src.color.clone() : 0xffffff,
          map: src.map || null,
          vertexColors: Boolean(src.vertexColors),
          emissive: src.emissive ? src.emissive.clone() : 0x000000,
          emissiveIntensity: src.emissiveIntensity ?? 1,
          transparent: src.transparent,
          opacity: src.opacity,
          alphaTest: src.alphaTest,
          side: src.side,
          flatShading: src.flatShading,
          depthWrite: src.depthWrite,
          fog: src.fog
        })
        cache.set(src.uuid, mat)
      }
      obj.material = mat
    })
  }

  heightAt(worldX, worldZ) {
    return islandHeight(this.spec, worldX - this.position.x, worldZ - this.position.z)
  }

  localHeight(x, z) {
    return islandHeight(this.spec, x, z)
  }

  localSlope(x, z, e = 1.6) {
    const h = islandHeight(this.spec, x, z)
    const hx = islandHeight(this.spec, x + e, z)
    const hz = islandHeight(this.spec, x, z + e)
    return Math.max(Math.abs(hx - h), Math.abs(hz - h)) / e
  }

  buildTerrain() {
    const size = this.radius * 2.6
    const seg = lowQuality ? 76 : 132
    const geo = new THREE.PlaneGeometry(size, size, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position
    const colors = new Float32Array(pos.count * 3)
    const color = [0, 0, 0]
    const h = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const y = islandHeight(this.spec, x, z)
      pos.setY(i, y)
      h[i] = y
    }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const e = 2.2
      const hx = islandHeight(this.spec, x + e, z)
      const hz = islandHeight(this.spec, x, z + e)
      const slope = Math.max(Math.abs(hx - h[i]), Math.abs(hz - h[i])) / e
      this.colorAt(x, z, h[i], slope, color)
      colors[i * 3] = color[0]
      colors[i * 3 + 1] = color[1]
      colors[i * 3 + 2] = color[2]
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0,
      flatShading: false
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.receiveShadow = true
    mesh.castShadow = false
    this.terrain = mesh
    this.group.add(mesh)

    // dark underwater shelf so the terrain never shows a bright gap under waves
    const shelf = new THREE.Mesh(
      new THREE.CircleGeometry(this.radius * 1.12, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x0a3544, transparent: true, opacity: 0.85, depthWrite: false })
    )
    shelf.position.y = -2.4
    this.group.add(shelf)
  }

  colorAt(x, z, h, slope, out) {
    // lazy import-free duplication to keep terrain construction hot loop tight
    const p = PALETTES[this.spec.palette] || PALETTES.tropical
    let c
    if (h < 0.35) c = p.wet
    else if (h < 1.4) c = p.sandDark
    else if (h < 3.4) c = p.sand
    else if (h < 5.2) c = mix(p.sand, p.grassDark, smoothstep(3.4, 5.2, h))
    else c = mix(p.grassDark, p.grass, smoothstep(6, 16, h))
    const rockT = smoothstep(0.5, 1.0, slope)
    if (rockT > 0) c = mix(c, p.rock, rockT * 0.9)
    const highT = smoothstep(this.height * 0.62, this.height * 0.95, h)
    if (highT > 0) c = mix(c, p.high, highT * 0.85)
    const n = valueNoise(x * 0.18 + this.seed, z * 0.18 - this.seed) - 0.5
    const n2 = valueNoise(x * 0.72 + this.seed * 3, z * 0.72 - this.seed * 2) - 0.5
    const v = 1 + n * 0.22 + n2 * 0.1
    out[0] = clamp(c[0] * v, 0, 1)
    out[1] = clamp(c[1] * v, 0, 1)
    out[2] = clamp(c[2] * v, 0, 1)
  }

  buildFoam() {
    if (!sharedFoamTex) sharedFoamTex = foamTexture()
    const segs = 200
    const positions = []
    const uvs = []
    const indices = []
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU
      const wl = findWaterline(this.spec, a)
      const variation = (valueNoise(Math.cos(a) * 6 + this.seed, Math.sin(a) * 6 - this.seed) - 0.5) * 5
      const inner = wl - 7 - variation
      const outer = wl + 11 + variation * 1.4
      const cx = Math.cos(a)
      const sz = Math.sin(a)
      positions.push(cx * inner, 0.12, sz * inner)
      positions.push(cx * outer, 0.12, sz * outer)
      uvs.push((i / segs) * 22, 0)
      uvs.push((i / segs) * 22, 1)
      if (i < segs) {
        const b = i * 2
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const mat = new THREE.MeshBasicMaterial({
      map: sharedFoamTex,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      color: 0xdff5f6
    })
    this.foam = new THREE.Mesh(geo, mat)
    this.foam.renderOrder = 3
    this.group.add(this.foam)
  }

  buildProps() {
    const rng = this.rng
    const avoid = [{ x: 0, z: 0, r: 14 }]
    if (this.type === 'home') avoid.push({ x: 0, z: 0, r: 22 })

    const palmCount = {
      home: 34,
      tropical: 46,
      ruins: 14,
      cliff: 5,
      volcanic: 0
    }[this.type] ?? 26
    const cypressCount = this.type === 'cliff' || this.type === 'volcanic' ? 34 : 0
    const bushCount = this.type === 'tropical' || this.type === 'home' ? 64 : this.type === 'ruins' ? 34 : 22

    if (palmCount > 0) {
      const palmMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide })
      const spots = this.sampleSpots(palmCount, { minH: 1.5, maxH: this.height * 0.78, maxSlope: 0.62, minR: 0.16, maxR: 0.84, avoid })
      this.addInstances(buildPalmGeometry(), palmMat, spots, 0.95, 1.65, 0.5, 4.2)
    }
    if (cypressCount > 0) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 })
      const spots = this.sampleSpots(cypressCount, { minH: 3, maxH: this.height * 0.9, maxSlope: 0.95, minR: 0.12, maxR: 0.86, avoid })
      this.addInstances(buildCypressGeometry(), mat, spots, 0.85, 1.55, 0.3, 3.4)
    }
    {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })
      const spots = this.sampleSpots(bushCount, { minH: 2.2, maxH: this.height * 0.85, maxSlope: 0.7, minR: 0.2, maxR: 0.82, avoid })
      this.addInstances(buildBushGeometry(), mat, spots, 0.7, 1.7, 0, 2.4)
    }
    {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, flatShading: true })
      const spots = this.sampleSpots(this.type === 'cliff' ? 74 : 52, { minH: -0.8, maxH: this.height * 0.92, maxSlope: 1.9, minR: 0.08, maxR: 0.95, avoid })
      this.addInstances(buildRockGeometry(), mat, spots, 0.5, 2.6, 0, 3.0)
    }

    // beach driftwood + small stones
    const driftMat = new THREE.MeshStandardMaterial({ color: 0x8d7a5f, roughness: 0.95 })
    const driftGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6)
    driftGeo.rotateZ(Math.PI / 2 + 0.2)
    for (let i = 0; i < 8; i++) {
      const a = rng() * TAU
      const wl = findWaterline(this.spec, a)
      const r = wl - 3 - rng() * 9
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const y = islandHeight(this.spec, x, z)
      if (y < 0.4 || y > 3.5) continue
      const log = new THREE.Mesh(driftGeo, driftMat)
      log.position.set(x, y + 0.15, z)
      log.rotation.y = rng() * TAU
      this.group.add(log)
    }

    // sea stacks on cliff islands
    if (this.type === 'cliff') {
      const stackMat = new THREE.MeshStandardMaterial({ color: 0x5e594f, roughness: 0.95, flatShading: true })
      for (let i = 0; i < 5; i++) {
        const a = rng() * TAU
        const wl = findWaterline(this.spec, a)
        const r = wl + 18 + rng() * 40
        const h = 9 + rng() * 16
        const stack = new THREE.Mesh(new THREE.CylinderGeometry(2.2 + rng() * 2, 4 + rng() * 3, h, 7), stackMat)
        stack.position.set(Math.cos(a) * r, h / 2 - 1.5, Math.sin(a) * r)
        stack.rotation.y = rng() * TAU
        stack.rotation.z = (rng() - 0.5) * 0.1
        stack.castShadow = true
        stack.receiveShadow = true
        this.group.add(stack)
      }
    }
  }

  sampleSpots(count, { minH, maxH, maxSlope, minR, maxR, avoid = [] }) {
    const rng = this.rng
    const spots = []
    let attempts = 0
    while (spots.length < count && attempts < count * 60) {
      attempts++
      const a = rng() * TAU
      const rr = Math.sqrt(rng()) * maxR
      if (rr < minR) continue
      const x = Math.cos(a) * rr * this.radius
      const z = Math.sin(a) * rr * this.radius
      const h = islandHeight(this.spec, x, z)
      if (h < minH || h > maxH) continue
      if (this.localSlope(x, z, 1.8) > maxSlope) continue
      let blocked = false
      for (const av of avoid) {
        if (Math.hypot(x - av.x, z - av.z) < av.r) { blocked = true; break }
      }
      if (!blocked) {
        for (const s of spots) {
          if (Math.hypot(x - s.x, z - s.z) < 3.4) { blocked = true; break }
        }
      }
      if (blocked) continue
      spots.push({ x, y: h, z, rot: rng() * TAU, scale: 0.8 + rng() * 0.5 })
    }
    return spots
  }

  addInstances(geo, mat, spots, minScale, maxScale, sink, shadowSize = 0) {
    if (!spots.length) return null
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]
      const sc = lerp(minScale, maxScale, (s.scale - 0.8) / 0.5)
      dummy.position.set(s.x, s.y - sink, s.z)
      dummy.rotation.set(0, s.rot, 0)
      dummy.scale.set(sc, sc * (0.92 + (i % 5) * 0.035), sc)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.group.add(mesh)

    if (shadowSize > 0) {
      shadowTexture()
      const shadows = new THREE.InstancedMesh(shadowGeo, sharedShadowMat, spots.length)
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i]
        const sc = lerp(minScale, maxScale, (s.scale - 0.8) / 0.5)
        dummy.position.set(s.x, s.y + 0.05, s.z)
        dummy.rotation.set(0, s.rot + i * 0.7, 0)
        dummy.scale.set(shadowSize * sc, 1, shadowSize * sc * 0.8)
        dummy.updateMatrix()
        shadows.setMatrixAt(i, dummy.matrix)
      }
      shadows.instanceMatrix.needsUpdate = true
      shadows.renderOrder = 2
      this.group.add(shadows)
    }
    return mesh
  }

  buildLandmarks() {
    if (this.type === 'home') {
      this.buildLighthouse()
      this.buildDock()
      this.buildHut(22, -28, 0.7)
      this.buildHut(-30, -18, -0.5)
      this.buildCampfire(-12, 24)
    }
    if (this.type === 'tropical') {
      this.buildHut(-24, 16, 0.4)
      this.buildHut(26, 22, -0.8)
      this.buildCampfire(-6, 38)
      this.buildDock(true)
    }
    if (this.type === 'ruins') {
      this.buildRuins()
      this.buildDock(true)
    }
    if (this.type === 'volcanic') {
      this.buildVolcano()
    }
    if (this.type === 'stars' || this.spec.id === 'stars') {
      this.buildStoneCircle()
    }
    if (this.type === 'cliff') {
      this.buildCliffShrine()
    }
  }

  buildLighthouse() {
    let best = { x: 0, z: 0, h: -999 }
    for (let i = 0; i < 200; i++) {
      const a = this.rng() * TAU
      const r = this.rng() * this.radius * 0.42
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = islandHeight(this.spec, x, z)
      if (h > best.h) best = { x, z, h }
    }
    const baseY = best.h
    const g = new THREE.Group()
    g.position.set(best.x, baseY, best.z)
    const stone = new THREE.MeshStandardMaterial({ color: 0x9c9484, roughness: 0.92 })
    const white = new THREE.MeshStandardMaterial({ color: 0xece5d6, roughness: 0.8 })
    const red = new THREE.MeshStandardMaterial({ color: 0xa8473b, roughness: 0.78 })
    const foundation = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 6.2, 2.2, 14), stone)
    foundation.position.y = -0.3
    g.add(foundation)

    let y = 0.9
    let rTop = 3.0
    let rBottom = 3.5
    for (let i = 0; i < 6; i++) {
      const mat = i % 2 === 0 ? white : red
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, 4.0, 16), mat)
      seg.position.y = y + 2.0
      seg.castShadow = true
      seg.receiveShadow = true
      g.add(seg)
      // window slits
      if (i % 2 === 1) {
        const win = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.1), new THREE.MeshBasicMaterial({ color: 0xffd28a }))
        win.position.set(0, y + 2.0, rBottom * 0.92)
        g.add(win)
      }
      y += 4.0
      rBottom = rTop
      rTop = Math.max(2.15, rTop - 0.22)
    }
    const topR = rBottom
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.1, 0.5, 16), stone)
    gallery.position.y = y + 0.25
    g.add(gallery)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.0, 4), new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0.5 }))
      post.position.set(Math.cos(a) * 3.3, y + 1.0, Math.sin(a) * 3.3)
      g.add(post)
    }
    const lanternGlassMat = new THREE.MeshStandardMaterial({
      color: 0x40301c,
      emissive: 0xffbe66,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2
    })
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 2.7, 12), lanternGlassMat)
    lantern.position.y = y + 1.85
    g.add(lantern)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.9, 12), red)
    roof.position.y = y + 4.1
    roof.castShadow = true
    g.add(roof)
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8b06a, metalness: 0.8, roughness: 0.3 }))
    finial.position.y = y + 5.2
    g.add(finial)

    const light = new THREE.PointLight(0xffc777, 0, 260, 1.7)
    light.position.y = y + 2.0
    g.add(light)
    this.lighthouseLight = light
    this.lanternGlassMat = lanternGlassMat

    // rotating beams
    const beamGroup = new THREE.Group()
    beamGroup.position.y = y + 2.0
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffd28a,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
    for (const dir of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(9, 95, 20, 1, true), beamMat)
      cone.rotation.z = dir * Math.PI / 2
      cone.position.x = dir * 47
      beamGroup.add(cone)
    }
    g.add(beamGroup)
    this.beamGroup = beamGroup
    this.beamMat = beamMat

    // keeper's house
    const house = new THREE.Group()
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 6), white)
    wall.position.y = 1.8
    wall.castShadow = true
    wall.receiveShadow = true
    house.add(wall)
    const hRoof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.8, 4), red)
    hRoof.rotation.y = Math.PI / 4
    hRoof.position.y = 5.0
    house.add(hRoof)
    const hDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x3c2918, roughness: 0.8 }))
    hDoor.position.set(0, 1.1, 3.01)
    house.add(hDoor)
    house.position.set(13, 0, 4)
    g.add(house)

    g.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow ?? true; o.receiveShadow = true } })
    this.group.add(g)
    this.lighthouse = g
    this.lighthouseBaseY = baseY
  }

  buildDock(small = false) {
    const start = new THREE.Vector3(0, 0, 150).sub(this.position)
    const angle = Math.atan2(start.z, start.x)
    const wl = findWaterline(this.spec, angle)
    const dockGroup = new THREE.Group()
    const dirX = Math.cos(angle)
    const dirZ = Math.sin(angle)
    const length = small ? 32 : 46
    const inner = wl - 8
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.88 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b2818, roughness: 0.9 })
    const plankCount = Math.floor(length / 2.1)
    for (let i = 0; i < plankCount; i++) {
      const r = inner + i * (length / plankCount)
      const plank = new THREE.Mesh(new THREE.BoxGeometry(small ? 4.6 : 6.0, 0.26, 2.0), wood)
      plank.position.set(dirX * r, 1.85 + Math.sin(i * 0.7) * 0.04, dirZ * r)
      plank.rotation.y = Math.atan2(dirX, dirZ)
      plank.castShadow = true
      plank.receiveShadow = true
      dockGroup.add(plank)
    }
    for (let i = 0; i < 5; i++) {
      const r = inner + 3 + i * ((length - 5) / 4)
      for (const side of [-1, 1]) {
        const px = dirX * r + Math.cos(angle + Math.PI / 2) * (small ? 2.3 : 3.0) * side
        const pz = dirZ * r + Math.sin(angle + Math.PI / 2) * (small ? 2.3 : 3.0) * side
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 6.5, 6), dark)
        post.position.set(px, -0.8, pz)
        post.castShadow = true
        dockGroup.add(post)
      }
    }
    // dock lantern
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.2, 5), dark)
    const lampR = inner + length - 2
    lampPost.position.set(dirX * lampR + Math.cos(angle + Math.PI / 2) * 3, 3.5, dirZ * lampR + Math.sin(angle + Math.PI / 2) * 3)
    dockGroup.add(lampPost)
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc477 }))
    lamp.position.copy(lampPost.position).y += 1.6
    dockGroup.add(lamp)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSpriteTexture(), color: 0xffb066, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }))
    glow.scale.set(3, 3, 1)
    glow.position.copy(lamp.position)
    dockGroup.add(glow)
    this.dock = dockGroup
    this.group.add(dockGroup)
  }

  buildHut(x, z, rot) {
    const y = islandHeight(this.spec, x, z)
    if (y < 0.8) return
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.rotation.y = rot
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a6, roughness: 0.92 })
    const wood = new THREE.MeshStandardMaterial({ color: 0x5b3c22, roughness: 0.9 })
    const thatch = new THREE.MeshStandardMaterial({ color: 0xb08a4d, roughness: 0.95, flatShading: true })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.5, 9), wood)
    base.position.y = 0.25
    g.add(base)
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.6, 2.5, 9), wallMat)
    wall.position.y = 1.7
    wall.castShadow = true
    wall.receiveShadow = true
    g.add(wall)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.9, 3.1, 9), thatch)
    roof.position.y = 4.3
    roof.castShadow = true
    g.add(roof)
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.9), wood)
    door.position.set(0, 1.2, 2.52)
    g.add(door)
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffc477 })
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.55), windowMat)
    win.position.set(1.2, 1.9, 2.24)
    win.rotation.y = 0.5
    g.add(win)
    this.group.add(g)
  }

  buildCampfire(x, z) {
    const y = islandHeight(this.spec, x, z)
    if (y < 0.5) return
    const g = new THREE.Group()
    g.position.set(x, y, z)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b675f, roughness: 0.95 })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), stoneMat)
      s.position.set(Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9)
      g.add(s)
    }
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3c2918, roughness: 0.95 })
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.4, 5), logMat)
      log.rotation.z = Math.PI / 2
      log.rotation.y = (i / 3) * Math.PI
      log.position.y = 0.2
      g.add(log)
    }
    const flameMat = new THREE.SpriteMaterial({ map: glowSpriteTexture(), color: 0xff9147, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    const flame = new THREE.Sprite(flameMat)
    flame.scale.set(1.6, 2.1, 1)
    flame.position.y = 0.9
    g.add(flame)
    const light = new THREE.PointLight(0xff8a3d, 0, 32, 2)
    light.position.y = 1.2
    g.add(light)
    this.group.add(g)
    this.campfires = this.campfires || []
    this.campfires.push({ flame, light })
  }

  buildRuins() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x968d7d, roughness: 0.92, flatShading: true })
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x726a5c, roughness: 0.95 })
    const center = { x: 0, z: 0 }
    // find a reasonably flat spot
    for (let i = 0; i < 80; i++) {
      const a = this.rng() * TAU
      const r = this.radius * (0.3 + this.rng() * 0.3)
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (this.localSlope(x, z, 3) < 0.5 && islandHeight(this.spec, x, z) > 4) { center.x = x; center.z = z; break }
    }
    const baseY = islandHeight(this.spec, center.x, center.z)
    const g = new THREE.Group()
    g.position.set(center.x, baseY, center.z)
    // platform
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(13, 13.6, 0.8, 8), darkStone)
    plat.position.y = 0.2
    plat.receiveShadow = true
    g.add(plat)
    // columns
    const cols = 6
    for (let i = 0; i < cols; i++) {
      const a = (i / cols) * TAU
      const broken = i === 2 || i === 5
      const h = broken ? 2.4 : 5.4
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, h, 10), stoneMat)
      col.position.set(Math.cos(a) * 8.4, h / 2 + 0.6, Math.sin(a) * 8.4)
      col.castShadow = true
      col.receiveShadow = true
      g.add(col)
      if (!broken) {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), stoneMat)
        cap.position.set(Math.cos(a) * 8.4, h + 0.9, Math.sin(a) * 8.4)
        g.add(cap)
      }
    }
    // arch
    const archGroup = new THREE.Group()
    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.4, 1.2), stoneMat)
      col.position.set(side * 4.6, 3.6, 0)
      col.castShadow = true
      archGroup.add(col)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(11, 1.0, 1.5), stoneMat)
    lintel.position.y = 7.2
    lintel.castShadow = true
    archGroup.add(lintel)
    archGroup.position.set(0, 0.4, -11)
    g.add(archGroup)
    // fallen blocks
    for (let i = 0; i < 8; i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(1 + this.rng() * 1.4, 0.6 + this.rng() * 0.8, 1 + this.rng() * 1.2), stoneMat)
      const a = this.rng() * TAU
      const r = 5 + this.rng() * 12
      block.position.set(Math.cos(a) * r, 0.55, Math.sin(a) * r)
      block.rotation.set(this.rng() * 0.4, this.rng() * TAU, this.rng() * 0.3)
      g.add(block)
    }
    // central altar
    const altar = new THREE.Mesh(new THREE.BoxGeometry(3, 1.2, 3), stoneMat)
    altar.position.y = 1.1
    g.add(altar)
    this.group.add(g)
    this.ruins = g
  }

  buildVolcano() {
    const g = new THREE.Group()
    const peak = { x: 0, z: 0, h: -999 }
    for (let i = 0; i < 120; i++) {
      const a = this.rng() * TAU
      const r = this.rng() * this.radius * 0.25
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = islandHeight(this.spec, x, z)
      if (h > peak.h) { peak.x = x; peak.z = z; peak.h = h }
    }
    g.position.set(peak.x, peak.h - 2, peak.z)
    const lavaMat = new THREE.MeshStandardMaterial({ color: 0x371b12, emissive: 0xff5a1f, emissiveIntensity: 1.4, roughness: 0.7 })
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x221f1e, roughness: 0.95, flatShading: true })
    const crater = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 3, 12, 1, true), rockMat)
    crater.position.y = 1.4
    crater.castShadow = true
    g.add(crater)
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7.2, 20).rotateX(-Math.PI / 2), lavaMat)
    pool.position.y = 2.1
    g.add(pool)
    const glow = new THREE.PointLight(0xff6324, 8, 80, 2)
    glow.position.y = 8
    g.add(glow)
    this.lavaGlow = glow
    this.group.add(g)
    this.volcano = g

    // smoke plumes
    const smokeTex = makeRadialTexture(128, 'rgba(120,120,120,0.8)', 'rgba(90,90,90,0)')
    for (let i = 0; i < 7; i++) {
      const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0x6b6b6b, transparent: true, opacity: 0.22, depthWrite: false })
      const sprite = new THREE.Sprite(mat)
      const s = 14 + this.rng() * 20
      sprite.scale.set(s, s, 1)
      sprite.position.set(peak.x + (this.rng() - 0.5) * 8, peak.h + 6 + this.rng() * 25, peak.z + (this.rng() - 0.5) * 8)
      this.group.add(sprite)
      this.smoke.push({ sprite, baseY: sprite.position.y, speed: 1.2 + this.rng() * 1.6, drift: (this.rng() - 0.5) * 2, size: s, phase: this.rng() * TAU })
    }
  }

  buildStoneCircle() {
    const base = { x: 0, z: 0, h: -999 }
    for (let i = 0; i < 120; i++) {
      const a = this.rng() * TAU
      const r = this.rng() * this.radius * 0.3
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = islandHeight(this.spec, x, z)
      if (h > base.h) { base.x = x; base.z = z; base.h = h }
    }
    const g = new THREE.Group()
    g.position.set(base.x, base.h, base.z)
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6f7580, roughness: 0.9, flatShading: true })
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU
      const stone = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4 + (i % 3) * 0.7, 1.0), stoneMat)
      stone.position.set(Math.cos(a) * 17, 2.2, Math.sin(a) * 17)
      stone.rotation.y = -a
      stone.rotation.z = (this.rng() - 0.5) * 0.12
      stone.castShadow = true
      g.add(stone)
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.6), new THREE.MeshBasicMaterial({ color: 0x8fe3d6, transparent: true, opacity: 0.5 }))
      rune.position.set(Math.cos(a) * 16.45, 2.5, Math.sin(a) * 16.45)
      rune.rotation.y = -a + Math.PI / 2
      g.add(rune)
    }
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 1.0, 8), stoneMat)
    altar.position.y = 0.5
    g.add(altar)
    const crystalMat = new THREE.MeshStandardMaterial({ color: 0x8fe3d6, emissive: 0x4fe0d0, emissiveIntensity: 1.8, transparent: true, opacity: 0.9, roughness: 0.15, metalness: 0.2 })
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), crystalMat)
    crystal.position.y = 3.0
    g.add(crystal)
    const light = new THREE.PointLight(0x6fe6da, 0, 70, 2)
    light.position.y = 3.2
    g.add(light)
    this.crystal = crystal
    this.crystalLight = light
    this.group.add(g)
  }

  buildCliffShrine() {
    const base = { x: 0, z: 0, h: -999 }
    for (let i = 0; i < 150; i++) {
      const a = this.rng() * TAU
      const r = this.rng() * this.radius * 0.35
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      const h = islandHeight(this.spec, x, z)
      if (h > base.h) { base.x = x; base.z = z; base.h = h }
    }
    const g = new THREE.Group()
    g.position.set(base.x, base.h, base.z)
    const mat = new THREE.MeshStandardMaterial({ color: 0x7c7468, roughness: 0.95, flatShading: true })
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 9, 7), mat)
    pillar.position.y = 4.5
    pillar.castShadow = true
    g.add(pillar)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 3.4), mat)
    cap.position.y = 9.1
    g.add(cap)
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc477 }))
    beacon.position.y = 10.0
    g.add(beacon)
    const light = new THREE.PointLight(0xffb066, 0, 60, 2)
    light.position.y = 10.2
    g.add(light)
    this.shrineLight = light
    this.group.add(g)
  }

  buildChest() {
    const angle = this.chestAngle = (this.seed * 1.7) % TAU
    const wl = findWaterline(this.spec, angle)
    let r = wl - 16
    let x = Math.cos(angle) * r
    let z = Math.sin(angle) * r
    let h = islandHeight(this.spec, x, z)
    let attempts = 0
    while ((h < 0.6 || h > 6) && attempts < 40) {
      r -= 4
      x = Math.cos(angle) * r
      z = Math.sin(angle) * r
      h = islandHeight(this.spec, x, z)
      attempts++
    }
    h = Math.max(h, 0.5)
    const g = new THREE.Group()
    g.position.set(x, h, z)
    g.rotation.y = angle + Math.PI
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3517, roughness: 0.8 })
    const gold = new THREE.MeshStandardMaterial({ color: 0xe0b25f, metalness: 0.85, roughness: 0.28, emissive: 0x2a1a06, emissiveIntensity: 0.4 })
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.15), wood)
    base.position.y = 0.45
    base.castShadow = true
    g.add(base)
    const bands = []
    for (const zz of [-0.36, 0.36]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.12, 0.12), gold)
      band.position.set(0, 0.45, zz)
      g.add(band)
    }
    const lid = new THREE.Group()
    lid.position.set(0, 0.88, -0.575)
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.32, 1.18), wood)
    lidMesh.position.set(0, 0.16, 0.575)
    lidMesh.castShadow = true
    lid.add(lidMesh)
    for (const zz of [-0.36, 0.36]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.1, 0.12), gold)
      band.position.set(0, 0.16, 0.575 + zz)
      lid.add(band)
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.14), gold)
    lock.position.set(0, 0.02, 1.17)
    lid.add(lock)
    g.add(lid)
    this.chestLid = lid

    const glowMat = new THREE.SpriteMaterial({ map: glowSpriteTexture(), color: 0xffcf7a, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const glow = new THREE.Sprite(glowMat)
    glow.scale.set(7, 7, 1)
    glow.position.y = 1.2
    g.add(glow)
    this.chestGlow = glow

    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffd28a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.3, 26, 10, 1, true), beamMat)
    beam.position.y = 13
    g.add(beam)
    this.chestBeam = beam

    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }))
    ring.position.y = 0.06
    g.add(ring)
    this.chestRing = ring

    this.group.add(g)
    this.chest = g
    this.chestLocal = new THREE.Vector3(x, h, z)
    this.chestWorld = new THREE.Vector3(x + this.position.x, h, z + this.position.z)
    this.chestOpenT = 0
  }

  buildAtmosphere() {
    // fireflies for palm / star islands
    if (this.type === 'tropical' || this.type === 'stars' || this.spec.id === 'stars') {
      const count = 70
      const positions = new Float32Array(count * 3)
      const bases = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        const a = this.rng() * TAU
        const r = this.rng() * this.radius * 0.6
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const h = Math.max(islandHeight(this.spec, x, z), 0.6) + 1 + this.rng() * 6
        positions[i * 3] = x
        positions[i * 3 + 1] = h
        positions[i * 3 + 2] = z
        bases[i * 3] = x
        bases[i * 3 + 1] = h
        bases[i * 3 + 2] = z
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const mat = new THREE.PointsMaterial({
        map: makeRadialTexture(64, 'rgba(255,239,180,1)', 'rgba(255,200,90,0)'),
        color: 0xffdf9a,
        size: 1.0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true
      })
      const pts = new THREE.Points(geo, mat)
      this.group.add(pts)
      this.fireflies = { points: pts, bases, phase: this.rng() * TAU }
    }

    // coastal mist on the mist island
    if (this.type === 'volcanic') {
      const mistTex = makeRadialTexture(128, 'rgba(210,225,230,0.5)', 'rgba(200,216,222,0)')
      for (let i = 0; i < 14; i++) {
        const mat = new THREE.SpriteMaterial({ map: mistTex, color: 0xc9d6da, transparent: true, opacity: 0.13, depthWrite: false })
        const sprite = new THREE.Sprite(mat)
        const a = this.rng() * TAU
        const r = this.radius * (0.55 + this.rng() * 0.55)
        const s = 35 + this.rng() * 55
        sprite.scale.set(s, s * 0.45, 1)
        sprite.position.set(Math.cos(a) * r, 3 + this.rng() * 10, Math.sin(a) * r)
        this.group.add(sprite)
        this.mist.push({ sprite, baseX: sprite.position.x, baseZ: sprite.position.z, phase: this.rng() * TAU, speed: 0.5 + this.rng() })
      }
    }
  }

  openChest() {
    if (this.chestOpened) return false
    this.chestOpened = true
    this.chestOpenT = 0.001
    return true
  }

  update(dt, time, night, storm) {
    this.time = time
    if (this.foam) {
      this.foam.material.opacity = 0.2 + 0.07 * Math.sin(time * 0.8 + this.seed) + storm * 0.18
      this.foam.material.map.offset.x = (time * 0.0035) % 1
    }
    if (this.beamGroup) {
      this.beamGroup.rotation.y = time * 0.42 + this.seed
      const vis = smoothstep(0.25, 0.7, night)
      this.beamMat.opacity = 0.075 * vis
      this.beamGroup.visible = vis > 0.01
      if (this.lighthouseLight) this.lighthouseLight.intensity = 6 + vis * 100
      this.lanternGlassMat.emissiveIntensity = 0.6 + vis * 2.2
    }
    if (this.campfires) {
      for (const c of this.campfires) {
        c.light.intensity = night * 26
        c.flame.material.opacity = 0.25 + night * 0.7
        c.flame.scale.setScalar(1.5 + Math.sin(time * 9 + this.seed) * 0.12)
      }
    }
    if (this.volcano) {
      this.lavaGlow.intensity = 3 + night * 12 + Math.sin(time * 1.7) * 2
      for (const s of this.smoke) {
        s.sprite.position.y += s.speed * dt
        s.sprite.position.x += s.drift * dt
        if (s.sprite.position.y > s.baseY + 55) {
          s.sprite.position.y = s.baseY
          s.sprite.position.x -= s.drift * 40
        }
        const k = (s.sprite.position.y - s.baseY) / 55
        s.sprite.material.opacity = 0.28 * (1 - k) * (1 - k * 0.5)
        s.sprite.scale.setScalar(s.size * (1 + k * 1.2))
      }
    }
    if (this.crystal) {
      this.crystal.rotation.y = time * 0.5
      this.crystal.position.y = 3.0 + Math.sin(time * 1.3) * 0.18
      this.crystalLight.intensity = 6 + night * 30 + Math.sin(time * 2) * 3
    }
    if (this.shrineLight) this.shrineLight.intensity = night * 40
    if (this.fireflies) {
      const pts = this.fireflies.points
      const arr = pts.geometry.attributes.position.array
      const bases = this.fireflies.bases
      const p = this.fireflies.phase + time
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = bases[i * 3] + Math.sin(p * 0.7 + i) * 1.1
        arr[i * 3 + 1] = bases[i * 3 + 1] + Math.sin(p * 1.3 + i * 0.7) * 0.6
        arr[i * 3 + 2] = bases[i * 3 + 2] + Math.cos(p * 0.6 + i * 0.3) * 1.1
      }
      pts.geometry.attributes.position.needsUpdate = true
      pts.material.opacity = night * 0.9
      pts.visible = night > 0.02
    }
    if (this.mist.length) {
      for (const m of this.mist) {
        m.sprite.position.x = m.baseX + Math.sin(time * 0.05 * m.speed + m.phase) * 14
        m.sprite.position.z = m.baseZ + Math.cos(time * 0.045 * m.speed + m.phase) * 14
      }
    }
    if (this.chestOpenT > 0) {
      this.chestOpenT = Math.min(1, this.chestOpenT + dt * 1.6)
      const t = this.chestOpenT
      this.chestLid.rotation.x = -1.35 * smoothstep(0, 1, t)
      this.chestGlow.material.opacity = 0.55 * (1 - smoothstep(0.3, 1, t))
      this.chestBeam.material.opacity = 0.1 * (1 - t)
      this.chestRing.material.opacity = 0.22 * (1 - t)
    } else if (this.chest && !this.chestOpened) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2 + this.seed)
      this.chestGlow.material.opacity = 0.4 + pulse * 0.2
      this.chestGlow.scale.setScalar(6.6 + pulse * 1.4)
      this.chestBeam.material.opacity = 0.06 + pulse * 0.04
      this.chestRing.material.opacity = 0.16 + pulse * 0.1
      this.chestRing.rotation.z = time * 0.4
    }
  }

  chestDistance(pos) {
    return this.chestWorld.distanceTo(pos)
  }
}

const PALETTES = {
  tropical: {
    wet: [0.52, 0.45, 0.33],
    sand: [0.84, 0.74, 0.53],
    sandDark: [0.68, 0.58, 0.4],
    grass: [0.24, 0.41, 0.17],
    grassDark: [0.14, 0.27, 0.11],
    rock: [0.44, 0.41, 0.35],
    high: [0.33, 0.31, 0.28]
  },
  cliff: {
    wet: [0.5, 0.43, 0.32],
    sand: [0.74, 0.65, 0.48],
    sandDark: [0.58, 0.5, 0.36],
    grass: [0.3, 0.37, 0.19],
    grassDark: [0.18, 0.24, 0.12],
    rock: [0.5, 0.46, 0.4],
    high: [0.38, 0.36, 0.33]
  },
  ruins: {
    wet: [0.52, 0.45, 0.34],
    sand: [0.78, 0.7, 0.52],
    sandDark: [0.62, 0.54, 0.4],
    grass: [0.36, 0.42, 0.22],
    grassDark: [0.22, 0.27, 0.14],
    rock: [0.54, 0.5, 0.43],
    high: [0.4, 0.38, 0.34]
  },
  volcanic: {
    wet: [0.2, 0.19, 0.18],
    sand: [0.3, 0.28, 0.26],
    sandDark: [0.2, 0.19, 0.18],
    grass: [0.2, 0.26, 0.16],
    grassDark: [0.11, 0.15, 0.09],
    rock: [0.24, 0.23, 0.22],
    high: [0.14, 0.13, 0.13]
  }
}

function mix(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

// value noise is imported late to keep module init simple
import { valueNoise2 as valueNoise } from './noise.js'

export function createIslands(scene) {
  return ISLAND_SPECS.map((spec) => new Island(spec, scene))
}
