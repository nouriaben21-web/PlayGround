import * as THREE from 'three'
import { mergeGeometries } from './../vendor/addons/BufferGeometryUtils.js'

const GRID = [-160, -96, -32, 32, 96, 160]
const S = 64
const ROAD_W = 16
const WALK = 5
const CITY = 176

const tmpV = new THREE.Vector3()
const tmpQ = new THREE.Quaternion()
const tmpM = new THREE.Matrix4()
const tmpS = new THREE.Vector3()

function rand(a, b) { return a + Math.random() * (b - a) }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  const ctx = c.getContext('2d')
  draw(ctx, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function tileTexture(base, line, size = 256, step = 64) {
  const t = canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * 0.05
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.7})`
      const s = 1 + Math.random() * 2
      ctx.fillRect(Math.random() * w, Math.random() * h, s, s)
    }
    ctx.strokeStyle = line
    ctx.lineWidth = 1.5
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

function asphaltTexture() {
  const t = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#26282b'
    ctx.fillRect(0, 0, w, h)
    for (let i = 0; i < 5000; i++) {
      const v = Math.random() < 0.5 ? 0 : 255
      ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.05})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5)
    }
    ctx.strokeStyle = 'rgba(10,10,12,0.35)'
    ctx.lineWidth = 1
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      let x = Math.random() * w, y = Math.random() * h
      ctx.moveTo(x, y)
      for (let k = 0; k < 4; k++) { x += (Math.random() - .5) * 50; y += (Math.random() - .5) * 50; ctx.lineTo(x, y) }
      ctx.stroke()
    }
  })
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(20, 20)
  return t
}

function windowTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#16181b'
    ctx.fillRect(0, 0, w, h)
    const g = ctx.createLinearGradient(0, 4, 0, h - 4)
    g.addColorStop(0, '#ffffff')
    g.addColorStop(0.35, '#cfd8e0')
    g.addColorStop(1, '#6c7a88')
    ctx.fillStyle = g
    ctx.fillRect(5, 5, w - 10, h - 10)
    ctx.fillStyle = 'rgba(20,22,26,0.85)'
    ctx.fillRect(w / 2 - 1, 5, 2, h - 10)
    ctx.fillRect(5, h / 2 - 1, w - 10, 2)
  })
}

export class World {
  constructor(scene, game) {
    this.scene = scene
    this.game = game
    this.colliders = []
    this.buildings = []
    this.blocks = []
    this.lines = GRID
    this.roadWidth = ROAD_W
    this.city = CITY
    this.lampLights = []
    this.time = 0

    this.root = new THREE.Group()
    this.root.name = 'city'
    scene.add(this.root)

    this.buildSky()
    this.buildGround()
    this.buildRoads()
    this.buildCityBlocks()
    this.buildProps()
    this.buildMountains()
    this.buildLandmark()
    this.buildPickups()
    this.sunTarget = new THREE.Object3D()
    scene.add(this.sunTarget)
  }

  /* ------------------------------------------------------------------ sky */
  buildSky() {
    const scene = this.scene
    scene.background = new THREE.Color(0x0e1420)
    scene.fog = new THREE.FogExp2(0xd8a179, 0.00118)

    const skyGeo = new THREE.SphereGeometry(1200, 40, 24)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x1b4674) },
        mid: { value: new THREE.Color(0x5b8cb5) },
        horizon: { value: new THREE.Color(0xffa968) },
        sun: { value: new THREE.Vector3(0.62, 0.2, 0.75).normalize() },
        sunColor: { value: new THREE.Color(0xffc178) }
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec3 vPos;
        uniform vec3 top, mid, horizon, sunColor, sun;
        void main(){
          vec3 d = normalize(vPos);
          float h = clamp(d.y, -0.1, 1.0);
          vec3 col = mix(horizon, mid, smoothstep(0.0, 0.26, h));
          col = mix(col, top, smoothstep(0.22, 0.9, h));
          float s = max(dot(d, sun), 0.0);
          col += sunColor * pow(s, 90.0) * 1.5;
          col += sunColor * pow(s, 7.0) * 0.20;
          float haze = 1.0 - smoothstep(-0.02, 0.18, h);
          col = mix(col, vec3(1.0, 0.62, 0.34), haze * 0.34);
          gl_FragColor = vec4(col, 1.0);
        }`
    })
    scene.add(new THREE.Mesh(skyGeo, skyMat))

    // Sun disc
    const sunTex = canvasTexture(128, 128, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2)
      g.addColorStop(0, 'rgba(255,248,228,1)')
      g.addColorStop(0.16, 'rgba(255,226,175,0.98)')
      g.addColorStop(0.4, 'rgba(255,170,95,0.4)')
      g.addColorStop(1, 'rgba(255,130,50,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    })
    const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }))
    sunSprite.scale.set(300, 300, 1)
    sunSprite.position.set(0.62, 0.2, 0.75).normalize().multiplyScalar(950)
    scene.add(sunSprite)

    const hemi = new THREE.HemisphereLight(0x8fb6dc, 0x3a2f24, 0.62)
    scene.add(hemi)
    scene.add(new THREE.AmbientLight(0x9fb8d0, 0.1))

    const sunDir = new THREE.Vector3(0.62, 0.2, 0.75).normalize()
    const sunLight = new THREE.DirectionalLight(0xffb27a, 4.0)
    sunLight.position.copy(sunDir).multiplyScalar(220)
    sunLight.castShadow = true
    sunLight.shadow.mapSize.set(this.game?.isTouch ? 1024 : 2048, this.game?.isTouch ? 1024 : 2048)
    sunLight.shadow.camera.near = 20
    sunLight.shadow.camera.far = 480
    sunLight.shadow.camera.left = -95
    sunLight.shadow.camera.right = 95
    sunLight.shadow.camera.top = 95
    sunLight.shadow.camera.bottom = -95
    sunLight.shadow.bias = -0.0004
    sunLight.shadow.normalBias = 0.4
    scene.add(sunLight)
    this.sun = sunLight
    this.sunDir = sunDir

    const fill = new THREE.DirectionalLight(0x6d94b8, 0.3)
    fill.position.set(-120, 80, -140)
    scene.add(fill)
  }

  /* --------------------------------------------------------------- ground */
  buildGround() {
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x8f7c5e, roughness: 1 })
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.45
    ground.receiveShadow = true
    this.scene.add(ground)

    // City slab
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(CITY * 2 + 40, 0.5, CITY * 2 + 40),
      new THREE.MeshStandardMaterial({ color: 0x756c5d, roughness: 0.95 })
    )
    slab.position.y = -0.25
    slab.receiveShadow = true
    this.scene.add(slab)
  }

  /* ---------------------------------------------------------------- roads */
  buildRoads() {
    const asphaltMap = asphaltTexture()
    const asphalt = new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphaltMap, roughness: 0.86, metalness: 0.1 })
    const roadGeo = new THREE.PlaneGeometry(1, 1)
    roadGeo.rotateX(-Math.PI / 2)

    const roads = new THREE.InstancedMesh(roadGeo, asphalt, 12)
    let idx = 0
    const span = CITY * 2 + 40
    for (const line of GRID) {
      for (const axis of [0, 1]) {
        tmpM.makeScale(axis ? ROAD_W : span, 1, axis ? span : ROAD_W)
        tmpM.setPosition(axis ? line : 0, 0.02, axis ? 0 : line)
        roads.setMatrixAt(idx++, tmpM)
      }
    }
    roads.receiveShadow = true
    this.root.add(roads)

    // Sidewalk blocks
    const walkMap = tileTexture('#a49a8a', 'rgba(70,64,56,0.35)', 256, 64)
    walkMap.repeat.set(7, 7)
    const walkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: walkMap, roughness: 0.95 })
    const walkGeo = new THREE.BoxGeometry(1, 0.26, 1)
    const walk = new THREE.InstancedMesh(walkGeo, walkMat, 25)
    let wi = 0
    this.blocks = []
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x0 = GRID[i], x1 = GRID[i + 1], z0 = GRID[j], z1 = GRID[j + 1]
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
        const w = x1 - x0 - ROAD_W
        const d = z1 - z0 - ROAD_W
        tmpM.makeScale(w, 1, d)
        tmpM.setPosition(cx, 0.13, cz)
        walk.setMatrixAt(wi++, tmpM)
        this.blocks.push({ x: cx, z: cz, w, d })
      }
    }
    walk.receiveShadow = true
    this.root.add(walk)

    // Center double-yellow lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd9b64c })
    const lineGeo = new THREE.BoxGeometry(1, 0.02, 0.14)
    const lines = new THREE.InstancedMesh(lineGeo, lineMat, 4 * 6 * 2)
    let li = 0
    for (const line of GRID) {
      for (let a = 0; a < 2; a++) {
        for (const off of [-0.32, 0.32]) {
          if (a === 0) {
            tmpM.makeScale(span, 1, 1)
            tmpM.setPosition(0, 0.045, line + off)
          } else {
            tmpM.makeScale(0.14 / 0.14, 1, 1)
            tmpM.makeRotationY(Math.PI / 2)
            tmpM.scale(tmpS.set(span, 1, 1))
            tmpM.setPosition(line + off, 0.045, 0)
          }
          lines.setMatrixAt(li++, tmpM)
        }
      }
    }
    lines.count = li
    this.root.add(lines)

    // Crosswalks at every intersection approach
    const markMat = new THREE.MeshBasicMaterial({ color: 0xd9d6cf })
    const markGeo = new THREE.BoxGeometry(0.7, 0.02, 3.4)
    const stripes = new THREE.InstancedMesh(markGeo, markMat, 36 * 4 * 7)
    let si = 0
    const addStripe = (x, z, rotY) => {
      tmpM.makeRotationY(rotY)
      tmpM.setPosition(x, 0.05, z)
      stripes.setMatrixAt(si++, tmpM)
    }
    for (const x of GRID) {
      for (const z of GRID) {
        const off = ROAD_W / 2 + 2.1
        for (let k = -3; k <= 3; k++) {
          addStripe(x + k * 1.45, z - off, 0)
          addStripe(x + k * 1.45, z + off, 0)
          addStripe(x - off, z + k * 1.45, Math.PI / 2)
          addStripe(x + off, z + k * 1.45, Math.PI / 2)
        }
      }
    }
    stripes.count = si
    this.root.add(stripes)

    // Lane dashes on wider avenues (visual rhythm)
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xbfc0bb })
    const dashGeo = new THREE.BoxGeometry(0.12, 0.02, 2.2)
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, 700)
    let di = 0
    for (const line of GRID) {
      for (let t = -CITY; t < CITY; t += 18) {
        let near = false
        for (const g of GRID) if (Math.abs(t - g) < 12) near = true
        if (near) continue
        for (const off of [-4, 4]) {
          tmpM.makeRotationY(0); tmpM.setPosition(t, 0.045, line + off)
          dashes.setMatrixAt(di++, tmpM)
          tmpM.makeRotationY(Math.PI / 2); tmpM.setPosition(line + off, 0.045, t)
          dashes.setMatrixAt(di++, tmpM)
        }
      }
    }
    dashes.count = di
    this.root.add(dashes)
  }

  /* ---------------------------------------------------------------- city */
  buildCityBlocks() {
    const bodyColors = [0xc7a98d, 0xb0604a, 0xd9cbb2, 0x8f9a9e, 0xb7a084, 0x7f8b8a, 0xd8c4a0, 0x9c8266, 0xc2b9a8, 0x8d6a52, 0xa9b2b0, 0xcbb9a2]
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1)
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.05 })
    const bodies = new THREE.InstancedMesh(buildingGeo, buildingMat, 240)
    bodies.castShadow = true
    bodies.receiveShadow = true
    bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3)

    const winTex = windowTexture()
    const windowGeo = new THREE.PlaneGeometry(1.55, 1.9)
    const windowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: winTex, toneMapped: true })
    const windows = new THREE.InstancedMesh(windowGeo, windowMat, 14000)
    windows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(14000 * 3), 3)

    const storeTex = canvasTexture(512, 192, (ctx, w, h) => {
      ctx.fillStyle = '#17191c'
      ctx.fillRect(0, 0, w, h)
      // signage band
      ctx.fillStyle = '#0d0f11'
      ctx.fillRect(0, 0, w, 34)
      const cols = 4
      const pw = w / cols
      for (let i = 0; i < cols; i++) {
        const g = ctx.createLinearGradient(0, 44, 0, h - 12)
        const warm = i % 2 === 0
        g.addColorStop(0, warm ? '#ffe9b0' : '#a8cede')
        g.addColorStop(0.5, warm ? '#e8a95e' : '#5b8397')
        g.addColorStop(1, warm ? '#6b3f1a' : '#1d2c35')
        ctx.fillStyle = g
        ctx.fillRect(i * pw + 9, 44, pw - 18, h - 58)
        // mullion
        ctx.fillStyle = 'rgba(8,10,12,0.6)'
        ctx.fillRect(i * pw + pw / 2 - 2, 44, 4, h - 58)
        ctx.fillStyle = 'rgba(8,10,12,0.35)'
        ctx.fillRect(i * pw + 9, 104, pw - 18, 6)
        // lit sign block
        ctx.fillStyle = warm ? 'rgba(255,196,96,0.95)' : 'rgba(122,214,236,0.9)'
        ctx.fillRect(i * pw + pw * 0.22, 10, pw * 0.56, 14)
      }
    })
    const storeGeo = new THREE.PlaneGeometry(1, 1)
    const storeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: storeTex, toneMapped: true })
    const stores = new THREE.InstancedMesh(storeGeo, storeMat, 320)
    stores.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(320 * 3), 3)

    const trimGeo = new THREE.BoxGeometry(1, 1, 1)
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })
    const cornices = new THREE.InstancedMesh(trimGeo, trimMat, 240)
    cornices.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3)
    cornices.castShadow = true
    const bases = new THREE.InstancedMesh(trimGeo, trimMat.clone(), 240)
    bases.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(240 * 3), 3)
    bases.receiveShadow = true

    const awningGeo = new THREE.BoxGeometry(1, 0.5, 1)
    const awningMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
    const awnings = new THREE.InstancedMesh(awningGeo, awningMat, 160)
    awnings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(160 * 3), 3)

    const acGeo = new THREE.BoxGeometry(1, 1, 1)
    const acMat = new THREE.MeshStandardMaterial({ color: 0x8f9195, roughness: 0.8 })
    const acs = new THREE.InstancedMesh(acGeo, acMat, 180)

    let bi = 0, wi = 0, ai = 0, aci = 0, sti = 0, ci = 0, bai = 0
    const color = new THREE.Color()
    const windowColors = [0x243444, 0x2c3f51, 0x1b2836, 0xffc06a, 0xffd694, 0xffb45e, 0x33465a, 0xfff0c0, 0x3b5062]

    const addWindow = (x, y, z, rotY, c) => {
      if (wi >= 14000) return
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)
      tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(1, 1, 1))
      windows.setMatrixAt(wi, tmpM)
      windows.setColorAt(wi, color.setHex(c))
      wi++
    }

    const addBuilding = (cx, cz, w, d, h, tone) => {
      if (bi >= 240) return
      tmpM.makeScale(w, h, d)
      tmpM.setPosition(cx, h / 2 + 0.26, cz)
      bodies.setMatrixAt(bi, tmpM)
      bodies.setColorAt(bi, color.setHex(tone))
      bi++
      this.buildings.push({ x: cx, z: cz, w, d, h })
      this.colliders.push({
        min: new THREE.Vector3(cx - w / 2, 0, cz - d / 2),
        max: new THREE.Vector3(cx + w / 2, h, cz + d / 2)
      })

      // top cornice + ground-floor base band
      if (ci < 240) {
        tmpM.makeScale(w + 0.55, 0.5, d + 0.55)
        tmpM.setPosition(cx, h + 0.06, cz)
        cornices.setMatrixAt(ci, tmpM)
        cornices.setColorAt(ci, color.setHex(tone).multiplyScalar(1.16))
        ci++
      }
      if (bai < 240) {
        tmpM.makeScale(w + 0.3, 0.62, d + 0.3)
        tmpM.setPosition(cx, 0.55, cz)
        bases.setMatrixAt(bai, tmpM)
        bases.setColorAt(bai, color.setHex(tone).multiplyScalar(0.58))
        bai++
      }

      const faces = [
        { n: [0, 0, 1], rot: 0, width: w, off: d / 2 + 0.015, x: cx },
        { n: [0, 0, -1], rot: Math.PI, width: w, off: d / 2 + 0.015, x: cx },
        { n: [1, 0, 0], rot: Math.PI / 2, width: d, off: w / 2 + 0.015, x: cz },
        { n: [-1, 0, 0], rot: -Math.PI / 2, width: d, off: w / 2 + 0.015, x: cz }
      ]
      for (const f of faces) {
        const cols = Math.max(1, Math.floor(f.width / 3.1))
        const rows = Math.max(1, Math.floor((h - 5) / 3.6))
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (wi >= 14000) break
            const along = (c - (cols - 1) / 2) * (f.width / cols)
            const y = 4.7 + r * 3.6
            if (f.n[2] !== 0) {
              addWindow(cx + along, y, cz + f.off * f.n[2], f.rot, pick(windowColors))
            } else {
              addWindow(cx + f.off * f.n[0], y, cz + along, f.rot, pick(windowColors))
            }
          }
        }

        // ground-floor storefront / lobby
        const shopChance = h > 55 ? 0.45 : 0.85
        if (Math.random() < shopChance && sti < 320) {
          const sw = Math.min(f.width * 0.7, 10.5)
          const sy = 2.45
          if (f.n[2] !== 0) {
            tmpM.makeRotationY(f.rot)
            tmpM.setPosition(cx, sy, cz + (d / 2 + 0.035) * f.n[2])
          } else {
            tmpM.makeRotationY(f.rot)
            tmpM.setPosition(cx + (w / 2 + 0.035) * f.n[0], sy, cz)
          }
          tmpM.scale(tmpS.set(sw, 3.15, 1))
          stores.setMatrixAt(sti, tmpM)
          stores.setColorAt(sti, color.setHex(pick([0xffffff, 0xfff1d8, 0xffe1bf, 0xdfeef4])))
          sti++

          // awning above the shopfront
          if (Math.random() < 0.8 && ai < 160) {
            const shopColor = pick([0x2f8c80, 0x9c3b35, 0xb07a2f, 0x2f659a, 0x84509a, 0x357a4a, 0xd8cdb8])
            tmpM.makeRotationY(f.rot)
            if (f.n[2] !== 0) tmpM.setPosition(cx, 4.28, cz + (d / 2 + 0.5) * f.n[2])
            else tmpM.setPosition(cx + (w / 2 + 0.5) * f.n[0], 4.28, cz)
            tmpM.scale(tmpS.set(sw * 0.9, 0.38, 1.15))
            awnings.setMatrixAt(ai, tmpM)
            awnings.setColorAt(ai, color.setHex(shopColor))
            ai++
          }
        }
      }

      // Rooftop clutter
      const n = Math.floor(rand(0, 3))
      for (let k = 0; k < n && aci < 180; k++) {
        const sw = rand(1.5, 3.4), sh = rand(0.8, 2.2), sd = rand(1.5, 3.4)
        tmpM.makeScale(sw, sh, sd)
        tmpM.setPosition(cx + rand(-w / 3, w / 3), h + 0.26 + sh / 2, cz + rand(-d / 3, d / 3))
        acs.setMatrixAt(aci++, tmpM)
      }
    }

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x0 = GRID[i], x1 = GRID[i + 1], z0 = GRID[j], z1 = GRID[j + 1]
        const bx0 = x0 + ROAD_W / 2 + WALK, bx1 = x1 - ROAD_W / 2 - WALK
        const bz0 = z0 + ROAD_W / 2 + WALK, bz1 = z1 - ROAD_W / 2 - WALK
        const isPark = (i === 0 && j === 3)
        if (isPark) { this.buildPark(bx0, bz0, bx1, bz1); continue }
        if (i === 2 && j === 2) { this.buildPlaza(bx0, bz0, bx1, bz1); continue }

        const lots = 2
        const gap = 3
        const lotW = (bx1 - bx0 - gap) / lots
        for (let l = 0; l < lots; l++) {
          const lx0 = bx0 + l * (lotW + gap)
          const lx1 = lx0 + lotW
          const w = Math.min(lotW - rand(1, 3.5), 17)
          const d = Math.min(bz1 - bz0 - rand(1, 5), 34)
          const cx = (lx0 + lx1) / 2 + rand(-1, 1)
          const cz = (bz0 + bz1) / 2 + rand(-1.5, 1.5)
          const dist = Math.hypot(cx, cz) / 220
          let h = 9 + Math.pow(1 - Math.min(dist, 1), 2) * rand(24, 70) + rand(0, 10)
          if (Math.random() < 0.12) h = rand(7, 12)
          addBuilding(cx, cz, w, d, h, pick(bodyColors))
        }
      }
    }

    bodies.count = bi
    bodies.instanceColor.needsUpdate = true
    windows.count = wi
    windows.instanceColor.needsUpdate = true
    stores.count = sti
    stores.instanceColor.needsUpdate = true
    cornices.count = ci
    cornices.instanceColor.needsUpdate = true
    bases.count = bai
    bases.instanceColor.needsUpdate = true
    awnings.count = ai
    awnings.instanceColor.needsUpdate = true
    acs.count = aci
    this.root.add(bodies, windows, stores, cornices, bases, awnings, acs)
    for (const m of [bodies, windows, stores, cornices, bases, awnings, acs]) m.computeBoundingSphere()
    this.windowMesh = windows
  }

  buildPark(x0, z0, x1, z1) {
    const grass = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, 0.2, z1 - z0),
      new THREE.MeshStandardMaterial({ color: 0x4e6b3a, roughness: 1 })
    )
    grass.position.set((x0 + x1) / 2, 0.28, (z0 + z1) / 2)
    grass.receiveShadow = true
    this.root.add(grass)
    const fountain = new THREE.Group()
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.8, 0.8, 24), new THREE.MeshStandardMaterial({ color: 0xb9b1a2, roughness: .8 }))
    basin.position.y = 0.7
    const water = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 0.15, 24), new THREE.MeshStandardMaterial({ color: 0x4c9bbd, roughness: .1, metalness: .3 }))
    water.position.y = 1.08
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 12), new THREE.MeshStandardMaterial({ color: 0xb9b1a2, roughness: .8 }))
    column.position.y = 1.7
    fountain.add(basin, water, column)
    fountain.position.set((x0 + x1) / 2, 0.2, (z0 + z1) / 2)
    fountain.traverse(o => { if (o.isMesh) o.castShadow = true })
    this.root.add(fountain)
    const spots = [[x0 + 7, z0 + 7], [x1 - 7, z0 + 8], [x0 + 8, z1 - 8], [x1 - 8, z1 - 7]]
    for (const [x, z] of spots) this.addPalm(x, z, rand(5, 8))
  }

  buildPlaza(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(x1 - x0, 0.18, z1 - z0),
      new THREE.MeshStandardMaterial({ color: 0xb0a68f, roughness: .9 })
    )
    plaza.position.set(cx, 0.28, cz)
    plaza.receiveShadow = true
    this.root.add(plaza)
    // Landmark tower
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: 0.25, metalness: 0.85 })
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e3444, roughness: 0.12, metalness: 0.9, emissive: 0x0b1b26, emissiveIntensity: 0.5 })
    const tower = new THREE.Mesh(new THREE.BoxGeometry(17, 92, 17), towerMat)
    tower.position.set(cx, 46, cz)
    tower.castShadow = true
    tower.receiveShadow = true
    this.root.add(tower)
    const glass = new THREE.Mesh(new THREE.BoxGeometry(17.4, 78, 17.4), glassMat)
    glass.position.set(cx, 43, cz)
    this.root.add(glass)
    const crown = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 11), new THREE.MeshStandardMaterial({ color: 0xd6b46a, roughness: .3, metalness: .9 }))
    crown.position.set(cx, 96, cz)
    this.root.add(crown)
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 24, 6), new THREE.MeshStandardMaterial({ color: 0xcfc7b8, metalness: .8, roughness: .3 }))
    spire.position.set(cx, 111, cz)
    this.root.add(spire)
    this.buildings.push({ x: cx, z: cz, w: 17, d: 17, h: 92 })
    this.colliders.push({ min: new THREE.Vector3(cx - 8.5, 0, cz - 8.5), max: new THREE.Vector3(cx + 8.5, 92, cz + 8.5) })
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3322 }))
    beacon.position.set(cx, 123.5, cz)
    this.root.add(beacon)
    this.beacon = beacon
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.addPalm(cx + sx * 11, cz + sz * 11, rand(6, 9))
    }
  }

  addPalm(x, z, h) {
    if (!this.palmPositions) this.palmPositions = []
    this.palmPositions.push({ x, z, h })
  }

  /* ---------------------------------------------------------------- props */
  buildProps() {
    // Palms along sidewalks and park
    this.palmPositions = this.palmPositions || []
    for (const line of GRID) {
      for (let t = -CITY + 18; t < CITY; t += 42) {
        let near = false
        for (const g of GRID) if (Math.abs(t - g) < 16) near = true
        if (near) continue
        this.addPalm(line + (ROAD_W / 2 + 3.3), t, rand(5.5, 9.5))
        this.addPalm(line - (ROAD_W / 2 + 3.3), t + 9, rand(5.5, 9.5))
      }
    }
    this.buildPalms()

    this.buildLamps()
    this.buildTrafficLights()
    this.buildBushes()
  }

  buildTrafficLights() {
    const parts = []
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 6.0, 6)
    pole.translate(0, 3.0, 0)
    parts.push(pole)
    const arm = new THREE.BoxGeometry(4.2, 0.1, 0.1)
    arm.translate(2.1, 5.9, 0)
    parts.push(arm)
    const brace = new THREE.BoxGeometry(1.8, 0.07, 0.07)
    brace.rotateZ(0.5)
    brace.translate(0.8, 5.55, 0)
    parts.push(brace)
    const head = new THREE.BoxGeometry(0.34, 0.95, 0.36)
    head.translate(4.0, 5.42, 0)
    parts.push(head)
    const geo = mergeGeometries(parts)
    const mat = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.6, metalness: 0.5 })

    const posts = []
    for (const x of GRID) {
      for (const z of GRID) {
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            posts.push({
              x: x + sx * (ROAD_W / 2 + 1.5),
              z: z + sz * (ROAD_W / 2 + 1.5),
              rot: sx > 0 ? Math.PI : 0
            })
          }
        }
      }
    }
    const signals = new THREE.InstancedMesh(geo, mat, posts.length)
    const lampGeo = new THREE.BoxGeometry(0.2, 0.2, 0.05)
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, posts.length * 3)
    const color = new THREE.Color()
    const lampColors = [0x401418, 0x4a3a10, 0x2fe06a]
    posts.forEach((p, i) => {
      tmpM.makeRotationY(p.rot)
      tmpM.setPosition(p.x, 0.26, p.z)
      signals.setMatrixAt(i, tmpM)
      for (let k = 0; k < 3; k++) {
        const ly = 5.72 - k * 0.28
        const lx = p.rot ? p.x - 4.0 : p.x + 4.0
        tmpM.makeRotationY(p.rot)
        tmpM.setPosition(lx, ly, p.z + 0.2)
        lamps.setMatrixAt(i * 3 + k, tmpM)
        lamps.setColorAt(i * 3 + k, color.setHex(lampColors[k]))
      }
    })
    signals.castShadow = true
    this.root.add(signals, lamps)
  }


  buildPalms() {
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.42, 1, 7, 6)
    // slight bend for palm trunks
    const pos = trunkGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const t = (y + 0.5)
      pos.setX(i, pos.getX(i) + Math.sin(t * 1.1) * 0.55)
    }
    trunkGeo.computeVertexNormals()
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7b6040, roughness: 1 })
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, this.palmPositions.length)

    // Build a merged frond crown: tapered blades drooping out and down
    const blades = []
    const n = 11
    for (let i = 0; i < n; i++) {
      const len = rand(3.0, 4.3)
      const blade = new THREE.ConeGeometry(rand(0.3, 0.46), len, 4, 1, true)
      blade.rotateX(Math.PI / 2)
      blade.scale(1, 0.55, 1)
      blade.translate(0, 0.12, len / 2)
      const m = new THREE.Matrix4()
      const e = new THREE.Euler(rand(0.16, 0.52), (i / n) * Math.PI * 2 + rand(-0.18, 0.18), 0, 'YXZ')
      m.makeRotationFromEuler(e)
      blade.applyMatrix4(m)
      blades.push(blade)
    }
    // upward center tuft
    for (let i = 0; i < 4; i++) {
      const len = rand(2.0, 2.9)
      const blade = new THREE.ConeGeometry(0.28, len, 4, 1, true)
      blade.rotateX(Math.PI / 2)
      blade.scale(1, 0.55, 1)
      blade.translate(0, 0.12, len / 2)
      const m = new THREE.Matrix4()
      m.makeRotationFromEuler(new THREE.Euler(-0.55, (i / 4) * Math.PI * 2 + 0.5, 0, 'YXZ'))
      blade.applyMatrix4(m)
      blades.push(blade)
    }
    const crownGeo = mergeGeometries(blades)
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide, flatShading: true,
      emissive: 0x16240e, emissiveIntensity: 0.35
    })
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, this.palmPositions.length)
    const color = new THREE.Color()
    this.palmPositions.forEach((p, i) => {
      tmpM.makeScale(1, p.h, 1)
      tmpM.setPosition(p.x, p.h / 2 + 0.26, p.z)
      trunks.setMatrixAt(i, tmpM)
      tmpM.makeScale(rand(0.9, 1.2), rand(0.9, 1.15), rand(0.9, 1.2))
      tmpM.setPosition(p.x + Math.sin(1.1) * 0.55, p.h + 0.02, p.z)
      crowns.setMatrixAt(i, tmpM)
      crowns.setColorAt(i, color.setHex(pick([0x6f9c4a, 0x7aa851, 0x628f42, 0x86b25c, 0x5c8a3d])))
    })
    trunks.castShadow = true; crowns.castShadow = true
    crowns.instanceColor.needsUpdate = true
    this.root.add(trunks, crowns)
  }

  buildLamps() {
    const parts = []
    const pole = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 6)
    pole.translate(0, 3.2, 0)
    parts.push(pole)
    const arm = new THREE.BoxGeometry(1.5, 0.12, 0.12)
    arm.translate(0.65, 6.35, 0)
    parts.push(arm)
    const head = new THREE.BoxGeometry(0.8, 0.18, 0.3)
    head.translate(1.3, 6.28, 0)
    parts.push(head)
    const geo = mergeGeometries(parts)
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: .6, metalness: .5 })
    const positions = []
    for (const line of GRID) {
      for (let t = -CITY + 12; t < CITY; t += 34) {
        let near = false
        for (const g of GRID) if (Math.abs(t - g) < 12) near = true
        if (near) continue
        positions.push({ x: line + ROAD_W / 2 + 1.1, z: t, rot: Math.PI })
        positions.push({ x: line - ROAD_W / 2 - 1.1, z: t + 17, rot: 0 })
      }
    }
    const lamps = new THREE.InstancedMesh(geo, mat, positions.length)
    const glowGeo = new THREE.BoxGeometry(0.6, 0.08, 0.24)
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd38a })
    const glows = new THREE.InstancedMesh(glowGeo, glowMat, positions.length)
    positions.forEach((p, i) => {
      tmpM.makeRotationY(p.rot)
      tmpM.setPosition(p.x, 0.26, p.z)
      lamps.setMatrixAt(i, tmpM)
      const dx = Math.cos(p.rot) * 1.3
      tmpM.makeRotationY(p.rot)
      tmpM.setPosition(p.x + dx, 6.28, p.z)
      glows.setMatrixAt(i, tmpM)
    })
    lamps.castShadow = true
    this.root.add(lamps, glows)
  }

  buildBushes() {
    const geo = new THREE.IcosahedronGeometry(1, 0)
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f5c32, roughness: 1, flatShading: true })
    const count = 120
    const bushes = new THREE.InstancedMesh(geo, mat, count)
    let i = 0
    for (const b of this.blocks) {
      if (i >= count) break
      // only around block edges
      for (let k = 0; k < 2; k++) {
        const x = b.x + rand(-1, 1) * (b.w / 2 - 1.5)
        const z = b.z + (k ? 1 : -1) * (b.d / 2 - 1.6)
        tmpM.makeScale(rand(.6, 1.4), rand(.5, 1.1), rand(.6, 1.4))
        tmpM.setPosition(x, 0.7, z + rand(-1, 1))
        bushes.setMatrixAt(i++, tmpM)
      }
    }
    bushes.count = i
    bushes.castShadow = true
    this.root.add(bushes)
  }

  /* ------------------------------------------------------------ mountains */
  hillGeo = null

  makeHill(x, z, sx, sy, sz, tint, rot = 0) {
    if (!this.hillGeo) {
      this.hillGeo = new THREE.SphereGeometry(1, 30, 18)
      // rough up the silhouette so domes don't read as perfect circles
      const pos = this.hillGeo.attributes.position
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i)
        const n = 1 + (Math.random() - 0.5) * 0.13
        v.multiplyScalar(n)
        pos.setXYZ(i, v.x, v.y, v.z)
      }
      this.hillGeo.computeVertexNormals()
    }
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 1, metalness: 0 })
    const m = new THREE.Mesh(this.hillGeo, mat)
    m.position.set(x, -sy * 0.24, z)
    m.scale.set(sx, sy, sz)
    m.rotation.y = rot
    return m
  }

  buildMountains() {
    const group = new THREE.Group()
    const farTints = [0x4f6157, 0x586550, 0x4a5b50, 0x5f6650, 0x556353]
    // distant ring of overlapping ridges
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rand(-0.1, 0.1)
      const r = rand(390, 600)
      const radius = rand(105, 210)
      const height = rand(48, 132)
      group.add(this.makeHill(
        Math.cos(a) * r,
        Math.sin(a) * r,
        radius,
        height,
        radius * rand(0.6, 1.15),
        pick(farTints),
        rand(0, Math.PI)
      ))
    }
    // nearer dry hills framing the basin, mostly to the north / west
    const near = [
      { x: 40, z: -420, sx: 190, sy: 82, sz: 130, t: 0x67664e },
      { x: 200, z: -330, sx: 150, sy: 62, sz: 115, t: 0x6f6d55 },
      { x: 355, z: -170, sx: 130, sy: 50, sz: 150, t: 0x5d6654 },
      { x: -370, z: -130, sx: 145, sy: 58, sz: 160, t: 0x62634f },
      { x: -360, z: 220, sx: 160, sy: 44, sz: 180, t: 0x68694f }
    ]
    for (const h of near) {
      group.add(this.makeHill(h.x, h.z, h.sx, h.sy, h.sz, h.t, rand(0, Math.PI)))
    }
    this.root.add(group)

    // scattered rocks in the desert
    const rockGeo = new THREE.DodecahedronGeometry(1, 0)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a7960, roughness: 1, flatShading: true })
    const rocks = new THREE.InstancedMesh(rockGeo, rockMat, 90)
    for (let i = 0; i < 90; i++) {
      const a = rand(0, Math.PI * 2)
      const r = rand(215, 520)
      const s = rand(1, 5)
      tmpM.makeRotationY(rand(0, 6))
      tmpM.scale(tmpS.set(s, s * rand(.4, .8), s))
      tmpM.setPosition(Math.cos(a) * r, s * 0.2, Math.sin(a) * r)
      rocks.setMatrixAt(i, tmpM)
    }
    rocks.castShadow = true
    this.root.add(rocks)
  }

  buildLandmark() {
    // Hillside sign
    const hill = this.makeHill(-205, -365, 210, 95, 145, 0x66634c, 0.3)
    this.root.add(hill)

    const tex = canvasTexture(1024, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#f6f2e6'
      ctx.font = 'bold 150px Impact, Arial Black, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.letterSpacing = '16px'
      ctx.fillText('LOS SANTOS', w / 2, h / 2)
    })
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(102, 25),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true })
    )
    sign.position.set(-177, 60, -272)
    sign.rotation.y = 0.42
    sign.rotation.z = 0.015
    this.root.add(sign)
    this.sign = sign
  }

  /* -------------------------------------------------------------- pickups */
  buildPickups() {
    this.pickups = []
    const spots = [
      { x: 43, z: 118, type: 'health' },
      { x: -53, z: 43, type: 'health' },
      { x: 107, z: -53, type: 'health' },
      { x: 43, z: -20, type: 'armor' },
      { x: -117, z: 107, type: 'armor' }
    ]
    for (const s of spots) {
      const g = new THREE.Group()
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.7, 0.035, 5, 24),
        new THREE.MeshBasicMaterial({ color: s.type === 'health' ? 0x6bff9d : 0x66b8ff, transparent: true, opacity: 0.75 })
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.06
      g.add(ring)
      const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 1.6, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: s.type === 'health' ? 0x3fbf6a : 0x3f7fbf, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
      )
      glow.position.y = 0.8
      g.add(glow)
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.34, 0.4),
        new THREE.MeshStandardMaterial({ color: s.type === 'health' ? 0xf0eee6 : 0x2c5f9e, roughness: .5, metalness: .2, emissive: s.type === 'health' ? 0x1a3a22 : 0x102b4a, emissiveIntensity: .6 })
      )
      box.position.y = 1.0
      box.castShadow = true
      g.add(box)
      if (s.type === 'health') {
        const crossMat = new THREE.MeshBasicMaterial({ color: 0x4ee083 })
        const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.42), crossMat)
        const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.42), crossMat)
        c1.position.y = 1.0; c2.position.y = 1.0
        g.add(c1, c2)
      } else {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.42), new THREE.MeshBasicMaterial({ color: 0x9fd4ff }))
        stripe.position.y = 1.0
        g.add(stripe)
      }
      g.position.set(s.x, 0.3, s.z)
      this.root.add(g)
      this.pickups.push({ group: g, ...s, active: true, timer: 0, spin: Math.random() * 6 })
    }
  }

  updatePickups(dt) {
    const p = this.game.player
    if (!p) return
    for (const item of this.pickups) {
      if (!item.active) {
        item.timer -= dt
        if (item.timer <= 0) {
          item.active = true
          item.group.visible = true
        }
        continue
      }
      item.spin += dt
      item.group.rotation.y = item.spin
      item.group.position.y = 0.3 + Math.sin(item.spin * 2) * 0.08
      const d = Math.hypot(p.pos.x - item.x, p.pos.z - item.z)
      if (d < 1.5 && !p.inCar) {
        if (item.type === 'health' && p.hp < p.maxHp) {
          p.hp = Math.min(p.maxHp, p.hp + 35)
          item.active = false; item.timer = 25; item.group.visible = false
          this.game.hud.notify('HEALTH RESTORED', '#8dffb0')
          this.game.audio.tone(660, 0.15, 0.12, 'triangle', 220)
        } else if (item.type === 'armor' && p.armor < 100) {
          p.armor = Math.min(100, p.armor + 50)
          item.active = false; item.timer = 30; item.group.visible = false
          this.game.hud.notify('ARMOR PICKED UP', '#9fd4ff')
          this.game.audio.tone(520, 0.18, 0.12, 'triangle', 180)
        }
      }
    }
  }

  /* -------------------------------------------------------------- physics */
  resolveCircle(pos, radius) {
    for (const c of this.colliders) {
      if (pos.x + radius < c.min.x || pos.x - radius > c.max.x) continue
      if (pos.z + radius < c.min.z || pos.z - radius > c.max.z) continue
      const cx = Math.max(c.min.x, Math.min(pos.x, c.max.x))
      const cz = Math.max(c.min.z, Math.min(pos.z, c.max.z))
      let dx = pos.x - cx, dz = pos.z - cz
      let d2 = dx * dx + dz * dz
      if (d2 > radius * radius) continue
      if (d2 < 0.0001) {
        // inside the box: push out the closest face
        const dl = pos.x - c.min.x, dr = c.max.x - pos.x
        const db = pos.z - c.min.z, dt = c.max.z - pos.z
        const m = Math.min(dl, dr, db, dt)
        if (m === dl) pos.x = c.min.x - radius
        else if (m === dr) pos.x = c.max.x + radius
        else if (m === db) pos.z = c.min.z - radius
        else pos.z = c.max.z + radius
        continue
      }
      const d = Math.sqrt(d2)
      pos.x = cx + (dx / d) * radius
      pos.z = cz + (dz / d) * radius
    }
    // keep in the playable edge
    const lim = CITY + 140
    pos.x = Math.max(-lim, Math.min(lim, pos.x))
    pos.z = Math.max(-lim, Math.min(lim, pos.z))
  }

  hitCollider(origin, dir, maxDist) {
    const ray = new THREE.Ray(origin.clone(), dir.clone())
    const box = new THREE.Box3()
    const hitPoint = new THREE.Vector3()
    let best = null
    for (const c of this.colliders) {
      box.min.copy(c.min); box.max.copy(c.max)
      const p = ray.intersectBox(box, hitPoint)
      if (p) {
        const d = ray.origin.distanceTo(p)
        if (d <= maxDist && (!best || d < best.dist)) {
          best = { point: p.clone(), dist: d, collider: c }
        }
      }
    }
    return best
  }

  lineBlocked(a, b) {
    const dir = tmpV.copy(b).sub(a)
    const dist = dir.length()
    if (dist < 0.001) return false
    dir.divideScalar(dist)
    const hit = this.hitCollider(a, dir, dist - 0.2)
    return !!hit
  }

  /* ---------------------------------------------------------------- frame */
  update(dt, focus) {
    this.time += dt
    if (this.beacon) this.beacon.visible = Math.sin(this.time * 3) > -0.2
    if (this.sun && focus) {
      this.sun.position.set(focus.x - 90, 130, focus.z + 120)
      this.sunTarget.position.copy(focus)
      this.sun.target = this.sunTarget
      this.sun.target.updateMatrixWorld()
    }
    this.updatePickups(dt)
  }
}
