import * as THREE from 'three'
import { buildHuman, buildPistol } from './character.js'

const _v = new THREE.Vector3()

function rand(a, b) { return a + Math.random() * (b - a) }
function damp(a, b, l, dt) { return a + (b - a) * (1 - Math.exp(-l * dt)) }

export class Actor {
  constructor(game, opts = {}) {
    this.game = game
    this.kind = opts.kind ?? 'civilian'
    this.hostile = opts.hostile ?? false
    this.maxHp = opts.hp ?? (this.kind === 'cop' ? 90 : this.kind === 'gang' ? 70 : 32)
    this.hp = this.maxHp
    this.dead = false
    this.deadTime = 0
    this.pos = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0)
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2
    this.speed = 0
    this.phase = Math.random() * Math.PI * 2
    this.fleeTime = 0
    this.fireCooldown = rand(0.4, 1.4)
    this.hitFlash = 0
    this.marker = null
    this.removeMe = false
    this.faction = opts.faction ?? (this.kind === 'cop' ? 'cop' : this.kind === 'gang' ? 'gang' : 'civ')

    const uniform = this.faction === 'cop'
    const c = buildHuman({
      skin: opts.skin,
      shirt: uniform ? 0x1b2c46 : opts.shirt,
      pants: uniform ? 0x141c27 : opts.pants,
      shoe: uniform ? 0x0d0f12 : opts.shoe,
      sunglasses: uniform ? true : (opts.sunglasses ?? Math.random() < 0.16),
      hat: opts.hat ?? false,
      scale: opts.scale
    })
    this.char = c
    this.group = c.group
    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw
    this.group.traverse(o => { if (o.isMesh) { o.castShadow = true } })
    game.scene.add(this.group)

    if (this.faction === 'cop') {
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.02),
        new THREE.MeshStandardMaterial({ color: 0xd6b24a, metalness: .9, roughness: .3 })
      )
      badge.position.set(-0.16, 1.35, 0.14)
      this.group.add(badge)
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x101826, roughness: .8 }))
      cap.position.y = 1.75
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.1), new THREE.MeshStandardMaterial({ color: 0x0a1018 }))
      brim.position.set(0, 1.72, 0.12)
      this.group.add(cap, brim)
    }

    // weapon for hostile actors
    if (this.hostile) {
      const gun = buildPistol()
      gun.position.set(0, -0.58, 0.06)
      c.parts.armR.add(gun)
      this.gun = gun
    }

    // hit proxy (invisible sphere)
    const proxy = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false })
    )
    proxy.position.y = 1.05
    proxy.userData = { type: 'actor', ref: this }
    proxy.visible = false
    this.proxy = proxy
    this.group.add(proxy)

    this.walkPhase = Math.random() * Math.PI * 2
  }

  setMarker(color = 0xff3b30) {
    if (this.marker) this.group.remove(this.marker)
    const m = new THREE.Group()
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.34, 4), new THREE.MeshBasicMaterial({ color }))
    cone.rotation.x = Math.PI
    cone.position.y = 2.35
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.035, 6, 18), new THREE.MeshBasicMaterial({ color }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.06
    m.add(cone, ring)
    m.userData.spin = 0
    this.group.add(m)
    this.marker = m
  }

  assignPath(blocks) {
    const b = blocks[Math.floor(Math.random() * blocks.length)]
    const half = b.w / 2 - 3
    const halfD = b.d / 2 - 3
    const corners = [
      { x: b.x - half, z: b.z - halfD },
      { x: b.x + half, z: b.z - halfD },
      { x: b.x + half, z: b.z + halfD },
      { x: b.x - half, z: b.z + halfD }
    ]
    const start = Math.floor(Math.random() * 4)
    this.path = []
    for (let i = 0; i < 4; i++) this.path.push(corners[(start + i) % 4])
    this.pathIndex = 0
    this.pos.set(this.path[0].x + rand(-1.5, 1.5), 0, this.path[0].z + rand(-1.5, 1.5))
    this.yaw = Math.random() * Math.PI * 2
    this.group.position.copy(this.pos)
  }

  takeDamage(dmg, hitPoint, byPlayer = false) {
    if (this.dead) return
    this.hp -= dmg
    this.hitFlash = 0.12
    this.char.body.traverse(o => {
      if (o.isMesh && o.material && o.material.emissive) {
        o.material.emissive = new THREE.Color(0xff2211)
        o.material.emissiveIntensity = 0.7
      }
    })
    if (this.game.audio) this.game.audio.hitFlesh()
    if (this.hp <= 0) this.die(byPlayer)
    else {
      this.fleeTime = 8
      if (this.kind === 'civilian' && byPlayer) this.game.reportGunfire()
    }
  }

  die(byPlayer) {
    if (this.dead) return
    this.dead = true
    this.deadTime = 0
    this.hp = 0
    this.group.rotation.z = Math.PI / 2
    this.group.position.y = 0.12
    if (this.marker) this.marker.visible = false
    // blood pool
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 16),
      new THREE.MeshBasicMaterial({ color: 0x3d0a0a, transparent: true, opacity: 0.55 })
    )
    pool.rotation.x = -Math.PI / 2
    pool.position.set(this.pos.x, 0.34, this.pos.z)
    this.game.scene.add(pool)
    this.pool = pool
    if (byPlayer && this.kind === 'civilian') this.game.addWanted(2, 'murder')
    if (byPlayer && this.kind === 'gang') this.game.reportGunfire()
    if (this.kind === 'gang' && this.game.missions) this.game.missions.onActorKilled(this)
    if (this.faction === 'cop' && this.game.police) this.game.police.onOfficerDown(this)
  }

  update(dt) {
    if (this.dead) {
      this.deadTime += dt
      if (this.deadTime > 8) {
        this.group.visible = false
        if (this.pool) this.pool.material.opacity = Math.min(0.55, Math.max(0, 0.55 - (this.deadTime - 8) * 0.2))
      }
      if (this.deadTime > 14 && !this.removeMe) {
        this.removeMe = true
        this.game.scene.remove(this.group)
        if (this.pool) this.game.scene.remove(this.pool)
      }
      return
    }

    if (this.hitFlash > 0) {
      this.hitFlash -= dt
      if (this.hitFlash <= 0) {
        this.char.body.traverse(o => {
          if (o.isMesh && o.material && o.material.emissive) o.material.emissiveIntensity = 0
        })
      }
    }

    if (this.marker) {
      this.marker.rotation.y += dt * 2
      this.marker.position.y = Math.sin(performance.now() * 0.003) * 0.06
    }

    const player = this.game.player
    const dist = player ? this.pos.distanceTo(player.pos) : 999

    // gunshot panic
    if (this.game.lastGunshot && performance.now() - this.game.lastGunshot < 900 && this.kind === 'civilian') {
      if (dist < 26) this.fleeTime = Math.max(this.fleeTime, 5)
    }

    if (this.faction === 'cop' && this.game.wanted === 0 && !this.forceHostile) {
      // cops idle after chase
    }

    if (this.hostile || (this.faction === 'cop' && this.game.wanted > 0)) {
      const canFight = this.faction !== 'cop' || this.game.wanted > 0 || this.forceHostile
      if (canFight) this.updateCombat(dt, dist)
      else this.animate(dt)
    } else if (this.fleeTime > 0) {
      this.fleeTime -= dt
      this.updateFlee(dt, player)
    } else if (this.path) {
      this.updateWalk(dt)
    } else {
      this.speed = damp(this.speed, 0, 8, dt)
      this.animate(dt)
    }

    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw
  }

  updateWalk(dt) {
    if (!this.path) return
    const target = this.path[this.pathIndex]
    const dx = target.x - this.pos.x
    const dz = target.z - this.pos.z
    const d = Math.hypot(dx, dz)
    if (d < 1.4) {
      this.pathIndex = (this.pathIndex + 1) % this.path.length
      if (Math.random() < 0.12) this.idle = rand(1, 3)
    }
    if (this.idle > 0) {
      this.idle -= dt
      this.speed = damp(this.speed, 0, 8, dt)
    } else {
      const speed = 1.15
      this.speed = damp(this.speed, speed, 4, dt)
      const desired = Math.atan2(dx, dz)
      this.yaw = dampAngle(this.yaw, desired, 6, dt)
      this.pos.x += Math.sin(this.yaw) * this.speed * dt
      this.pos.z += Math.cos(this.yaw) * this.speed * dt
    }
    this.animate(dt)
  }

  updateFlee(dt, player) {
    if (!player) return
    const dx = this.pos.x - player.pos.x
    const dz = this.pos.z - player.pos.z
    const d = Math.hypot(dx, dz) || 1
    const speed = this.fleeTime > 0 ? 4.8 : 0
    this.speed = damp(this.speed, speed, 5, dt)
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 8, dt)
    this.pos.x += (dx / d) * this.speed * dt
    this.pos.z += (dz / d) * this.speed * dt
    this.game.world.resolveCircle(this.pos, 0.45)
    this.animate(dt)
  }

  updateCombat(dt, dist) {
    const player = this.game.player
    if (!player) return
    if (this.kind === 'gang' && dist > 60) {
      this.speed = damp(this.speed, 0, 6, dt)
      this.animate(dt)
      return
    }
    const dx = player.pos.x - this.pos.x
    const dz = player.pos.z - this.pos.z
    const desired = Math.atan2(dx, dz)
    this.yaw = dampAngle(this.yaw, desired, 10, dt)
    // move toward if far, strafe if close
    const speed = this.kind === 'gang' ? 2.1 : 2.8
    if (dist > (this.kind === 'cop' ? 13 : 16)) {
      this.speed = damp(this.speed, speed, 4, dt)
      this.pos.x += Math.sin(this.yaw) * this.speed * dt
      this.pos.z += Math.cos(this.yaw) * this.speed * dt
      this.game.world.resolveCircle(this.pos, 0.45)
    } else if (dist < 6) {
      this.speed = damp(this.speed, -1.2, 3, dt)
      this.pos.x += Math.sin(this.yaw) * this.speed * dt
      this.pos.z += Math.cos(this.yaw) * this.speed * dt
    } else {
      this.speed = damp(this.speed, 0, 6, dt)
    }

    // shoot
    this.fireCooldown -= dt
    const eye = _v.set(this.pos.x, 1.5, this.pos.z)
    const seen = dist < 42 && !this.game.world.lineBlocked(eye, new THREE.Vector3(player.pos.x, 1.2, player.pos.z))
    if (seen && this.fireCooldown <= 0 && this.game.state === 'playing') {
      this.fireCooldown = rand(0.9, 1.7)
      const from = new THREE.Vector3(this.pos.x, 1.35, this.pos.z)
      const to = new THREE.Vector3(player.pos.x, 1.1, player.pos.z)
      const miss = rand(-0.5, 0.5)
      to.x += miss; to.z += rand(-0.5, 0.5)
      this.game.effects.tracer(from, to)
      this.game.effects.flash(from, 0.5, 0.06)
      this.game.audio.gunshot('pistol')
      this.game.lastGunshot = performance.now()
      if (Math.random() < 0.55) player.takeDamage(rand(5, 10), 'gunfire')
      this.aimTime = 0.4
    }
    if (this.aimTime > 0) this.aimTime -= dt
    this.animate(dt, this.aimTime > 0)
  }

  animate(dt, aiming = false) {
    const parts = this.char.parts
    this.walkPhase += this.speed * dt * 2.6
    const moving = Math.abs(this.speed) > 0.2
    const swing = Math.sin(this.walkPhase)
    const amp = Math.min(0.75, Math.abs(this.speed) * 0.18)
    const targetLegL = moving ? swing * amp : 0
    const targetLegR = moving ? -swing * amp : 0
    parts.legL.rotation.x = damp(parts.legL.rotation.x, targetLegL, 14, dt)
    parts.legR.rotation.x = damp(parts.legR.rotation.x, targetLegR, 14, dt)
    const targetArmL = aiming ? -1.35 : (moving ? -swing * amp * 0.8 : 0)
    const targetArmR = aiming ? -1.5 : (moving ? swing * amp * 0.8 : 0)
    parts.armL.rotation.x = damp(parts.armL.rotation.x, targetArmL, 12, dt)
    parts.armR.rotation.x = damp(parts.armR.rotation.x, targetArmR, 12, dt)
    this.char.body.position.y = moving ? Math.abs(Math.sin(this.walkPhase * 2)) * 0.025 : Math.sin(performance.now() * 0.0016) * 0.006
    parts.torso.rotation.x = moving ? Math.min(0.12, Math.abs(this.speed) * 0.02) : 0
    if (aiming) {
      parts.armL.rotation.y = 0.35
      parts.armR.rotation.y = -0.15
    }
  }

  dispose() {
    this.game.scene.remove(this.group)
    if (this.pool) this.game.scene.remove(this.pool)
    this.removeMe = true
  }
}

function dampAngle(a, b, l, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * (1 - Math.exp(-l * dt))
}

export class PedSystem {
  constructor(game) {
    this.game = game
    this.actors = []
    this.civilians = []
    this.maxCivilians = 18
    this.spawnTimer = 0
  }

  start() {
    for (let i = 0; i < this.maxCivilians; i++) this.spawnCivilian()
    // put a few locals on the sidewalks around the spawn so the block feels alive
    const locals = [
      { x: 25.4, z: 70, path: [{ x: 25.4, z: 70 }, { x: 25.4, z: 48 }] },
      { x: 43.4, z: 106, path: [{ x: 43.4, z: 106 }, { x: 43.4, z: 122 }] },
      { x: 43.5, z: 40, path: [{ x: 43.5, z: 40 }, { x: 43.5, z: 22 }] }
    ]
    for (let i = 0; i < locals.length && i < this.civilians.length; i++) {
      const a = this.civilians[i]
      const l = locals[i]
      a.path = l.path
      a.pathIndex = 1
      a.pos.set(l.x, 0, l.z)
      a.group.position.copy(a.pos)
      a.idle = 0
    }
  }

  spawnCivilian() {
    const a = new Actor(this.game, { kind: 'civilian', x: 0, z: 0 })
    a.assignPath(this.game.world.blocks)
    this.actors.push(a)
    this.civilians.push(a)
    return a
  }

  spawnGang(x, z, count = 3) {
    const list = []
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2
      const px = x + Math.cos(ang) * rand(2, 5)
      const pz = z + Math.sin(ang) * rand(2, 5)
      const a = new Actor(this.game, { kind: 'gang', hostile: true, x: px, z: pz, hp: 75, shirt: 0x5a1520, pants: 0x1b1d22 })
      a.setMarker(0xff3b30)
      this.actors.push(a)
      list.push(a)
    }
    return list
  }

  spawnCop(x, z, forceHostile = false) {
    const a = new Actor(this.game, { kind: 'cop', hostile: true, x, z, hp: 95, faction: 'cop' })
    a.forceHostile = forceHostile
    this.actors.push(a)
    return a
  }

  update(dt) {
    for (const a of this.actors) a.update(dt)
    // car hits
    const pv = this.game.vehicles?.playerVehicle
    if (pv && Math.abs(pv.speed) > 4 && !pv.destroyed) {
      for (const a of this.actors) {
        if (a.dead) continue
        const d = Math.hypot(a.pos.x - pv.pos.x, a.pos.z - pv.pos.z)
        if (d < 2.4) {
          a.takeDamage(60, null, true)
          a.stagger = new THREE.Vector3(pv.vel.x * 0.5, 0, pv.vel.z * 0.5)
          pv.vel.multiplyScalar(0.92)
          this.game.effects.burst(new THREE.Vector3(a.pos.x, 1, a.pos.z), 8, 0xaa1f1f, 3, 0.4, -8)
          this.game.audio.crash(0.6)
          this.game.addWanted(2, 'hit and run')
        }
      }
    }
    // cleanup and respawn
    this.actors = this.actors.filter(a => !a.removeMe)
    this.civilians = this.civilians.filter(a => !a.removeMe && !a.dead)
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0 && this.civilians.length < this.maxCivilians) {
      this.spawnTimer = 3
      this.spawnCivilian()
    }
  }

  clearGang() {
    for (const a of this.actors) if (a.kind === 'gang' && !a.dead) a.dispose()
  }
}
