import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TAU, mulberry32, clamp } from './noise.js'

let gullGeo = null
let gullMat = null
let gullWingL = null
let gullWingR = null
let gullWingMat = null
let dolphinGeo = null
let dolphinMat = null

function tinted(geo, hex) {
  const g = geo.clone()
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r
    arr[i * 3 + 1] = c.g
    arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  if (!g.index) return g
  return g.toNonIndexed()
}

function buildGullResources() {
  if (gullGeo) return
  const body = new THREE.SphereGeometry(0.22, 7, 6)
  body.scale(0.85, 0.72, 1.7)
  const head = new THREE.SphereGeometry(0.15, 7, 6)
  head.translate(0, 0.06, 0.38)
  const beak = new THREE.ConeGeometry(0.055, 0.2, 5)
  beak.rotateX(Math.PI / 2)
  beak.translate(0, 0.03, 0.55)
  const tail = new THREE.ConeGeometry(0.13, 0.34, 4)
  tail.rotateX(-Math.PI / 2)
  tail.translate(0, 0, -0.46)
  gullGeo = mergeGeometries([
    tinted(body, 0xf2f1ea),
    tinted(head, 0xf2f1ea),
    tinted(beak, 0xe0a04b),
    tinted(tail, 0x9aa5aa)
  ], false)
  gullMat = new THREE.MeshLambertMaterial({ vertexColors: true })
  gullWingL = makeWingGeometry(-1)
  gullWingR = makeWingGeometry(1)
  gullWingMat = new THREE.MeshLambertMaterial({ color: 0xe9e9e2, side: THREE.DoubleSide })
}

function makeWingGeometry(side) {
  const geo = new THREE.BufferGeometry()
  const s = side
  const verts = new Float32Array([
    0, 0, 0.16,
    s * 1.55, 0.06, 0.02,
    0, 0, -0.16,
    s * 1.55, 0.06, 0.02,
    s * 1.15, 0.03, -0.32,
    0, 0, -0.16,
    s * 1.55, 0.06, 0.02,
    s * 1.32, 0.05, -0.1,
    s * 1.15, 0.03, -0.32
  ])
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
  geo.computeVertexNormals()
  return geo
}

function buildDolphinResources() {
  if (dolphinGeo) return
  const body = new THREE.SphereGeometry(0.5, 10, 8)
  body.scale(0.85, 0.8, 2.1)
  const belly = body.clone()
  belly.scale(0.86, 0.5, 1.1)
  belly.translate(0, -0.22, 0)
  const snout = new THREE.ConeGeometry(0.22, 0.6, 7)
  snout.rotateX(Math.PI / 2)
  snout.translate(0, -0.02, 1.12)
  const fin = new THREE.ConeGeometry(0.32, 0.85, 4)
  fin.rotateX(-0.15)
  fin.translate(0, 0.62, -0.1)
  const tail = new THREE.ConeGeometry(0.42, 0.55, 5)
  tail.rotateX(-Math.PI / 2)
  tail.translate(0, 0, -1.2)
  dolphinGeo = mergeGeometries([
    tinted(body, 0x657b86),
    tinted(belly, 0xbfd0d4),
    tinted(snout, 0x657b86),
    tinted(fin, 0x4e626b),
    tinted(tail, 0x4e626b)
  ], false)
  dolphinMat = new THREE.MeshLambertMaterial({ vertexColors: true })
}

export class Wildlife {
  constructor(scene, islands) {
    buildGullResources()
    buildDolphinResources()
    this.scene = scene
    this.gulls = []
    this.dolphins = []
    this.rng = mulberry32(4242)

    for (const island of islands) {
      const count = island.type === 'home' ? 4 : island.type === 'volcanic' ? 1 : 2
      for (let i = 0; i < count; i++) {
        this.gulls.push(this.makeGull(island, i))
      }
    }
    // two pods of dolphins near the starting waters
    this.addPod(new THREE.Vector3(30, 0, -80), 3)
    this.addPod(new THREE.Vector3(-180, 0, 300), 2)
  }

  makeGull(island, index) {
    const group = new THREE.Group()
    group.add(new THREE.Mesh(gullGeo, gullMat))
    const left = new THREE.Mesh(gullWingL, gullWingMat)
    const right = new THREE.Mesh(gullWingR, gullWingMat)
    left.position.set(-0.08, 0.06, 0.02)
    right.position.set(0.08, 0.06, 0.02)
    group.add(left, right)
    group.scale.setScalar(1.4 + this.rng() * 0.4)
    this.scene.add(group)
    const radius = island.waterRadius + 20 + this.rng() * 55
    return {
      group, left, right,
      center: island.position,
      radius,
      height: 18 + this.rng() * 26,
      angle: this.rng() * TAU,
      speed: 0.12 + this.rng() * 0.12,
      dir: this.rng() > 0.5 ? 1 : -1,
      phase: this.rng() * TAU,
      bank: 0
    }
  }

  addPod(center, count) {
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group()
      group.add(new THREE.Mesh(dolphinGeo, dolphinMat))
      group.scale.setScalar(1.3)
      this.scene.add(group)
      this.dolphins.push({
        group,
        center: center.clone().add(new THREE.Vector3((this.rng() - 0.5) * 40, 0, (this.rng() - 0.5) * 40)),
        angle: this.rng() * TAU,
        radius: 12 + this.rng() * 26,
        speed: 0.18 + this.rng() * 0.12,
        timer: this.rng() * 10,
        period: 8 + this.rng() * 9,
        jumping: false,
        jumpT: 0,
        prevY: 0,
        scale: 1.2 + this.rng() * 0.4
      })
    }
  }

  update(dt, time, ocean, effectField) {
    for (const g of this.gulls) {
      g.angle += g.speed * g.dir * dt
      const speedFactor = 1
      const x = g.center.x + Math.cos(g.angle) * g.radius
      const z = g.center.z + Math.sin(g.angle) * g.radius
      const y = g.height + Math.sin(time * 0.5 + g.phase) * 2.2
      g.group.position.set(x, y, z)
      const heading = g.dir > 0 ? -g.angle : Math.PI - g.angle
      g.group.rotation.y = heading
      g.group.rotation.z = -0.18 * g.dir
      const flapSpeed = 7 + Math.sin(time * 0.4 + g.phase) * 2
      const flap = Math.sin(time * flapSpeed + g.phase)
      const glide = 0.5 + 0.5 * Math.sin(time * 0.25 + g.phase * 2)
      const amp = 0.18 + (1 - glide) * 0.55
      g.left.rotation.z = flap * amp + 0.08
      g.right.rotation.z = -flap * amp - 0.08
    }

    for (const d of this.dolphins) {
      d.angle += d.speed * dt * 0.5
      const baseX = d.center.x + Math.cos(d.angle) * d.radius
      const baseZ = d.center.z + Math.sin(d.angle) * d.radius
      const waterY = ocean.heightAt(baseX, baseZ, time)
      d.timer += dt
      if (!d.jumping && d.timer > d.period) {
        d.timer = 0
        d.jumping = true
        d.jumpT = 0
      }
      if (d.jumping) {
        d.jumpT += dt * 0.55
        const t = clamp(d.jumpT, 0, 1)
        const arc = Math.sin(t * Math.PI)
        const forwardX = -Math.sin(d.angle)
        const forwardZ = Math.cos(d.angle)
        const jumpForward = 10 * (t - 0.15)
        d.group.position.set(
          baseX + forwardX * jumpForward,
          waterY + arc * 3.6,
          baseZ + forwardZ * jumpForward
        )
        d.group.rotation.y = Math.atan2(forwardX, forwardZ)
        d.group.rotation.x = -Math.cos(t * Math.PI) * 0.8
        if (d.prevY < 0.5 && arc > 0.4 && effectField && Math.random() < 0.5) {
          effectField.spawn(baseX, waterY + 0.1, baseZ, (Math.random() - 0.5) * 3, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 1.1, 0.9, { drag: 0.94, gravity: 6 })
        }
        d.prevY = arc
        if (t >= 1) {
          d.jumping = false
          d.prevY = 0
          if (effectField) {
            for (let i = 0; i < 10; i++) {
              effectField.spawn(
                d.group.position.x, waterY + 0.2, d.group.position.z,
                (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5,
                1.4, 1.2, { drag: 0.93, gravity: 7 }
              )
            }
          }
        }
      } else {
        d.group.position.set(baseX, waterY - 1.6 + Math.sin(time * 1.2 + d.angle) * 0.2, baseZ)
        d.group.rotation.y = Math.atan2(-Math.sin(d.angle), Math.cos(d.angle))
        d.group.rotation.x = 0
      }
      d.group.scale.setScalar(d.scale)
    }
  }
}
