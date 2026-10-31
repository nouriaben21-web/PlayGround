import * as THREE from 'three'

function glowTexture(inner = 'rgba(255,240,200,1)', outer = 'rgba(255,120,30,0)', size = 128) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.4, 'rgba(255,170,70,0.55)')
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const _v = new THREE.Vector3()

export class Effects {
  constructor(scene, game) {
    this.scene = scene
    this.game = game
    this.group = new THREE.Group()
    scene.add(this.group)

    this.tracers = []
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const mat = new THREE.LineBasicMaterial({ color: 0xffd89a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
      const line = new THREE.Line(geo, mat)
      line.frustumCulled = false
      line.visible = false
      this.group.add(line)
      this.tracers.push({ line, life: 0, max: 0.08 })
    }

    this.maxParticles = 500
    const pGeo = new THREE.BufferGeometry()
    this.pPos = new Float32Array(this.maxParticles * 3)
    this.pCol = new Float32Array(this.maxParticles * 3)
    this.pVel = new Float32Array(this.maxParticles * 3)
    this.pLife = new Float32Array(this.maxParticles)
    this.pGrav = new Float32Array(this.maxParticles)
    pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3))
    pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3))
    const pMat = new THREE.PointsMaterial({
      size: 0.28, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    })
    this.points = new THREE.Points(pGeo, pMat)
    this.points.frustumCulled = false
    this.group.add(this.points)

    this.smoke = []
    for (let i = 0; i < 24; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('rgba(70,70,70,0.9)', 'rgba(20,20,20,0)', 64),
        transparent: true, opacity: 0, depthWrite: false, color: 0x333333
      }))
      s.visible = false
      this.group.add(s)
      this.smoke.push({ sprite: s, life: 0, max: 1.6, vel: new THREE.Vector3(), grow: 1 })
    }
    this.smokeIndex = 0

    this.flashes = []
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,245,220,1)', 'rgba(255,160,60,0)', 128),
        transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending
      }))
      s.visible = false
      this.group.add(s)
      this.flashes.push({ sprite: s, life: 0, max: 0.12, scale: 1 })
    }
    this.flashIndex = 0
    this.light = new THREE.PointLight(0xffa050, 0, 45, 2)
    this.group.add(this.light)
    this.lightLife = 0
    this.pIndex = 0
    this.shake = 0
  }

  tracer(a, b) {
    const t = this.tracers.find(t => t.life <= 0) || this.tracers[0]
    const pos = t.line.geometry.attributes.position
    pos.setXYZ(0, a.x, a.y, a.z)
    pos.setXYZ(1, b.x, b.y, b.z)
    pos.needsUpdate = true
    t.line.visible = true
    t.life = t.max
    t.line.material.opacity = 1
  }

  burst(pos, count = 12, color = 0xffc070, speed = 5, life = 0.45, gravity = -9) {
    const c = new THREE.Color(color)
    for (let i = 0; i < count; i++) {
      const idx = this.pIndex++ % this.maxParticles
      this.pPos[idx * 3] = pos.x
      this.pPos[idx * 3 + 1] = pos.y
      this.pPos[idx * 3 + 2] = pos.z
      const dir = _v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()))
      this.pVel[idx * 3] = dir.x
      this.pVel[idx * 3 + 1] = dir.y
      this.pVel[idx * 3 + 2] = dir.z
      this.pLife[idx] = life * (0.6 + Math.random() * 0.8)
      this.pGrav[idx] = gravity
      this.pCol[idx * 3] = c.r
      this.pCol[idx * 3 + 1] = c.g
      this.pCol[idx * 3 + 2] = c.b
    }
    this.points.geometry.attributes.position.needsUpdate = true
    this.points.geometry.attributes.color.needsUpdate = true
  }

  flash(pos, scale = 0.6, time = 0.09) {
    const f = this.flashes[this.flashIndex++ % this.flashes.length]
    f.sprite.position.copy(pos)
    f.sprite.visible = true
    f.sprite.material.opacity = 1
    f.scale = scale
    f.sprite.scale.setScalar(scale)
    f.life = time
    f.max = time
    this.light.position.copy(pos)
    this.light.intensity = 8
    this.lightLife = time
  }

  puff(pos, color = 0x3a3a3a, scale = 1) {
    const s = this.smoke[this.smokeIndex++ % this.smoke.length]
    s.sprite.position.copy(pos)
    s.sprite.visible = true
    s.sprite.material.color.setHex(color)
    s.sprite.material.opacity = 0.75
    s.sprite.scale.setScalar(scale)
    s.life = s.max
    s.grow = scale
    s.vel.set(Math.random() - 0.5, 1 + Math.random(), Math.random() - 0.5).multiplyScalar(0.5)
  }

  explosion(pos) {
    this.burst(pos, 60, 0xffa03a, 13, 0.9, -6)
    this.burst(pos, 30, 0xffe6a0, 7, 0.5, -3)
    this.flash(pos, 4.5, 0.35)
    for (let i = 0; i < 8; i++) this.puff(pos.clone().add(new THREE.Vector3((Math.random() - .5) * 3, Math.random() * 2, (Math.random() - .5) * 3)), 0x222222, 2 + Math.random() * 2)
    this.shake = Math.max(this.shake, 0.6)
    if (this.game.audio) this.game.audio.explosion()
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt
        t.line.material.opacity = Math.max(0, t.life / t.max)
        if (t.life <= 0) t.line.visible = false
      }
    }
    let any = false
    for (let i = 0; i < this.maxParticles; i++) {
      if (this.pLife[i] > 0) {
        any = true
        this.pLife[i] -= dt
        this.pPos[i * 3] += this.pVel[i * 3] * dt
        this.pPos[i * 3 + 1] += this.pVel[i * 3 + 1] * dt
        this.pPos[i * 3 + 2] += this.pVel[i * 3 + 2] * dt
        this.pVel[i * 3 + 1] += this.pGrav[i] * dt
        const k = Math.max(0, this.pLife[i])
        const f = Math.min(1, k * 2.2)
        this.pCol[i * 3] *= 0.995
        this.pCol[i * 3 + 1] *= 0.992
        this.pCol[i * 3 + 2] *= 0.99
        if (this.pLife[i] <= 0) {
          this.pPos[i * 3 + 1] = -1000
        }
        if (f < 1) {
          this.pCol[i * 3] *= 0.97
          this.pCol[i * 3 + 1] *= 0.97
          this.pCol[i * 3 + 2] *= 0.97
        }
      }
    }
    if (any) {
      this.points.geometry.attributes.position.needsUpdate = true
      this.points.geometry.attributes.color.needsUpdate = true
    }
    for (const s of this.smoke) {
      if (s.life > 0) {
        s.life -= dt
        const f = s.life / s.max
        s.sprite.position.addScaledVector(s.vel, dt)
        s.sprite.position.y += dt * 0.6
        s.sprite.material.opacity = Math.max(0, f) * 0.7
        s.sprite.scale.setScalar(s.grow * (1 + (1 - f) * 1.8))
        if (s.life <= 0) s.sprite.visible = false
      }
    }
    for (const f of this.flashes) {
      if (f.life > 0) {
        f.life -= dt
        const k = Math.max(0, f.life / f.max)
        f.sprite.material.opacity = k
        f.sprite.scale.setScalar(f.scale * (1 + (1 - k) * 0.8))
        if (f.life <= 0) f.sprite.visible = false
      }
    }
    if (this.lightLife > 0) {
      this.lightLife -= dt
      this.light.intensity = Math.max(0, this.lightLife * 30)
    }
    this.shake = Math.max(0, this.shake - dt * 1.5)
  }
}
