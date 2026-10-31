import * as THREE from 'three'
import { buildHuman, buildPistol, buildSMG } from './character.js'

const _v1 = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v3 = new THREE.Vector3()

function damp(a, b, lambda, dt) { return a + (b - a) * (1 - Math.exp(-lambda * dt)) }
function dampAngle(a, b, lambda, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
  return a + d * (1 - Math.exp(-lambda * dt))
}
function rand(a, b) { return a + Math.random() * (b - a) }

export class Player {
  constructor(game) {
    this.game = game
    this.char = buildHuman({
      skin: 0x7a4a28,
      shirt: 0x1c5e6e,
      pants: 0x1b2431,
      shoe: 0xe4e0d6,
      hair: 0x141210,
      sunglasses: true,
      scale: 1.0
    })
    this.group = this.char.group
    this.group.traverse(o => { if (o.isMesh) o.castShadow = true })
    game.scene.add(this.group)

    this.pos = new THREE.Vector3(43, 0, 64)
    this.group.position.copy(this.pos)
    this.vel = new THREE.Vector3()
    this.yaw = 0
    this.vy = 0
    this.onGround = true
    this.inCar = false
    this.maxHp = 100
    this.hp = 100
    this.armor = 0
    this.lastDamage = -999
    this.stepTimer = 0
    this.phase = Math.random() * 6
    this.recoil = 0
    this.reloading = false
    this.reloadTimer = 0
    this.fireCooldown = 0
    this.smgUnlocked = false
    this.shotsFired = 0
    this.dead = false

    this.weapons = [
      {
        id: 'pistol', name: 'PISTOL', mag: 12, magSize: 12, reserve: 96,
        damage: 24, rate: 0.24, auto: false, hipSpread: 0.045, aimSpread: 0.003,
        reloadTime: 1.05, unlocked: true, model: buildPistol()
      },
      {
        id: 'smg', name: 'SMG', mag: 30, magSize: 30, reserve: 180,
        damage: 14, rate: 0.085, auto: true, hipSpread: 0.06, aimSpread: 0.014,
        reloadTime: 1.35, unlocked: false, model: buildSMG()
      }
    ]
    this.weaponIndex = 0
    this.attachWeapon()
    this.hudUpdate()
  }

  get weapon() { return this.weapons[this.weaponIndex] }

  attachWeapon() {
    const arm = this.char.parts.armR
    for (const w of this.weapons) if (w.model.parent) w.model.parent.remove(w.model)
    const m = this.weapon.model
    m.rotation.x = Math.PI / 2
    m.position.set(0, -0.58, 0.055)
    m.scale.setScalar(0.92)
    arm.add(m)
  }

  hudUpdate() {
    const w = this.weapon
    this.game.hud.setWeapon(w.name, w.mag, w.reserve)
  }

  cycleWeapon() {
    if (this.reloading) this.cancelReload()
    for (let i = 1; i <= this.weapons.length; i++) {
      const idx = (this.weaponIndex + i) % this.weapons.length
      if (this.weapons[idx].unlocked) {
        this.weaponIndex = idx
        break
      }
    }
    this.attachWeapon()
    this.hudUpdate()
    this.game.audio.click()
    this.game.hud.notify(this.weapon.name, '#d8d2c4')
  }

  selectWeapon(index) {
    const w = this.weapons[index]
    if (!w || !w.unlocked) return
    if (this.reloading) this.cancelReload()
    this.weaponIndex = index
    this.attachWeapon()
    this.hudUpdate()
  }

  applyCameraRelativeMove() {
    const g = this.game
    const f = _v1.set(Math.sin(g.camYaw), 0, Math.cos(g.camYaw))
    const r = _v2.set(-Math.cos(g.camYaw), 0, Math.sin(g.camYaw))
    const dir = _v3.set(0, 0, 0).addScaledVector(f, g.input.moveY).addScaledVector(r, g.input.moveX)
    const len = dir.length()
    if (len > 1) dir.divideScalar(len)
    return dir
  }

  update(dt) {
    if (this.dead) return
    const input = this.game.input
    const g = this.game
    if (this.fireCooldown > 0) this.fireCooldown -= dt
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 2.4)

    if (this.reloading) {
      this.reloadTimer -= dt
      if (this.reloadTimer <= 0) this.finishReload()
    }

    if (this.inCar) {
      this.group.visible = false
      const veh = g.vehicles.playerVehicle
      if (veh) this.pos.set(veh.pos.x, 0.6, veh.pos.z)
      this.hudUpdate()
      return
    }
    this.group.visible = true

    // unlock SMG after first job
    if (!this.smgUnlocked && g.missions.completed >= 1) {
      this.smgUnlocked = true
      this.weapons[1].unlocked = true
      this.weapons[1].reserve = Math.max(120, this.weapons[1].reserve)
      g.hud.notify('SMG UNLOCKED · press 2 or SWAP', '#9fe39a')
      g.audio.tone(760, 0.2, 0.1, 'triangle')
    }

    const aim = input.aim || input.fire
    const dir = this.applyCameraRelativeMove()
    const moving = dir.lengthSq() > 0.01
    const sprint = input.sprint && !aim && moving
    const speed = aim ? 3.4 : sprint ? 9.4 : 5.9
    const targetVel = _v1.copy(dir).multiplyScalar(speed)
    this.vel.x = damp(this.vel.x, targetVel.x, moving ? 13 : 16, dt)
    this.vel.z = damp(this.vel.z, targetVel.z, moving ? 13 : 16, dt)
    if (moving) {
      const targetYaw = aim ? g.camYaw : Math.atan2(dir.x, dir.z)
      this.yaw = dampAngle(this.yaw, targetYaw, aim ? 22 : 14, dt)
    } else if (aim) {
      this.yaw = dampAngle(this.yaw, g.camYaw, 20, dt)
    }

    this.pos.x += this.vel.x * dt
    this.pos.z += this.vel.z * dt
    g.world.resolveCircle(this.pos, 0.42)
    this.collideVehicles()

    // vertical
    if (input.jumpPressed && this.onGround) {
      this.vy = 6.1
      this.onGround = false
      input.jumpPressed = false
    }
    this.vy -= 18.5 * dt
    this.pos.y += this.vy * dt
    if (this.pos.y <= 0) {
      if (!this.onGround && this.vy < -5) g.audio.footstep()
      this.pos.y = 0
      this.vy = 0
      this.onGround = true
    }

    this.group.position.copy(this.pos)
    this.group.rotation.y = this.yaw

    this.updateAnimation(dt, speed, aim, moving)

    // footsteps
    if (this.onGround && moving) {
      this.stepTimer -= dt * (sprint ? 2.1 : 1.45)
      if (this.stepTimer <= 0) {
        this.stepTimer = 1
        g.audio.footstep()
      }
    }

    // shooting
    const firing = input.fire
    if (firing && !this.reloading && this.fireCooldown <= 0) {
      if (this.weapon.mag > 0) this.shoot(aim)
      else if (this.weapon.reserve > 0) this.startReload()
      else {
        this.fireCooldown = 0.3
        g.audio.click()
      }
    }
    if (firing && this.weapon.mag === 0 && this.weapon.reserve > 0 && !this.reloading) this.startReload()
    if (input.reloadPressed) { input.reloadPressed = false; this.startReload() }
    if (input.switchPressed) { input.switchPressed = false; this.cycleWeapon() }

    // health regen
    if (performance.now() - this.lastDamage > 7000 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 5 * dt)
    }
    this.hudUpdate()
  }

  collideVehicles() {
    for (const v of this.game.vehicles.vehicles) {
      if (v.destroyed) continue
      const dx = this.pos.x - v.pos.x
      const dz = this.pos.z - v.pos.z
      if (Math.abs(dx) > 3.5 || Math.abs(dz) > 3.5) continue
      const cos = Math.cos(-v.yaw), sin = Math.sin(-v.yaw)
      const lx = dx * cos - dz * sin
      const lz = dx * sin + dz * cos
      const hw = v.dims.w / 2 + 0.35
      const hl = v.dims.l / 2 + 0.35
      const cx = Math.max(-hw, Math.min(lx, hw))
      const cz = Math.max(-hl, Math.min(lz, hl))
      let ox = lx - cx, oz = lz - cz
      let d = Math.hypot(ox, oz)
      const r = 0.4
      if (d < r) {
        if (d < 0.001) { ox = 1; oz = 0; d = 1 }
        const push = r - d
        const wx = ox * cos + oz * sin
        const wz = -ox * sin + oz * cos
        this.pos.x += (ox / d) * push * cos + (oz / d) * push * sin
        this.pos.z += -(ox / d) * push * sin + (oz / d) * push * cos
      }
    }
  }

  updateAnimation(dt, speed, aim, moving) {
    const parts = this.char.parts
    this.phase += Math.abs(this.vel.length()) * dt * 1.7
    const amp = Math.min(0.72, Math.abs(this.vel.length()) * 0.1)
    const swing = Math.sin(this.phase)
    const targetLegL = moving ? swing * amp : 0
    const targetLegR = moving ? -swing * amp : 0
    parts.legL.rotation.x = damp(parts.legL.rotation.x, targetLegL, 16, dt)
    parts.legR.rotation.x = damp(parts.legR.rotation.x, targetLegR, 16, dt)
    const targetArmR = aim ? -1.48 : (moving ? swing * amp * 0.9 : -0.06)
    const targetArmL = aim ? -1.3 : (moving ? -swing * amp * 0.9 : 0.06)
    parts.armR.rotation.x = damp(parts.armR.rotation.x, targetArmR - this.recoil * 0.5, 18, dt)
    parts.armL.rotation.x = damp(parts.armL.rotation.x, targetArmL, 14, dt)
    parts.armL.rotation.y = damp(parts.armL.rotation.y, aim ? 0.46 : 0, 12, dt)
    parts.armR.rotation.y = damp(parts.armR.rotation.y, aim ? -0.12 : 0, 12, dt)
    parts.torso.rotation.y = aim ? -0.1 : 0
    this.char.body.position.y = moving ? Math.abs(Math.sin(this.phase * 2)) * 0.035 : Math.sin(performance.now() * 0.0018) * 0.007
    this.char.body.rotation.x = moving && !aim ? Math.min(0.1, Math.abs(this.vel.length()) * 0.012) : 0
  }

  shoot(aim) {
    const g = this.game
    const w = this.weapon
    this.fireCooldown = w.rate
    w.mag--
    this.shotsFired++
    this.recoil = Math.min(1, this.recoil + (w.id === 'smg' ? 0.35 : 0.7))
    g.camRecoil = Math.min(0.12, g.camRecoil + (w.id === 'smg' ? 0.012 : 0.03))
    g.audio.gunshot(w.id === 'smg' ? 'smg' : 'pistol')
    g.lastGunshot = performance.now()
    g.effects.shake = Math.max(g.effects.shake, w.id === 'smg' ? 0.06 : 0.14)

    propsUpdate(g)

    // muzzle position
    const muzzle = w.model.userData.muzzle
    const muzzlePos = new THREE.Vector3()
    muzzle.getWorldPosition(muzzlePos)

    // aim from camera center
    const camDir = new THREE.Vector3()
    g.camera.getWorldDirection(camDir)
    const spread = aim ? w.aimSpread : w.hipSpread
    const camTarget = new THREE.Vector3().copy(g.camera.position).addScaledVector(camDir, 120)
    camTarget.x += rand(-1, 1) * spread * 120
    camTarget.y += rand(-1, 1) * spread * 120
    camTarget.z += rand(-1, 1) * spread * 120
    const dir = camTarget.sub(muzzlePos).normalize()

    const raycaster = new THREE.Raycaster(muzzlePos, dir, 0, 160)
    const targets = g.getShootTargets()
    g.scene.updateMatrixWorld()
    const hits = raycaster.intersectObjects(targets, false)
    const worldHit = g.world.hitCollider(muzzlePos, dir, 160)
    let hit = hits.length ? hits[0] : null
    let end = muzzlePos.clone().addScaledVector(dir, 90)
    let impact = null

    if (hit && (!worldHit || hit.distance < worldHit.dist)) {
      end = hit.point.clone()
      impact = hit
    } else if (worldHit) {
      end = worldHit.point.clone()
      impact = { point: worldHit.point, userData: null, world: true }
    }

    g.effects.flash(muzzlePos, 0.55, 0.06)
    g.effects.tracer(muzzlePos, end)
    g.effects.puff(muzzlePos, 0x777777, 0.22)

    if (impact) {
      const ud = impact.userData
      if (ud && ud.type === 'actor') {
        const actor = ud.ref
        if (!actor.dead) {
          actor.takeDamage(w.damage, impact.point, true)
          g.effects.burst(impact.point, 5, 0x9c1a1a, 2.2, 0.3, -8)
          if (actor.kind === 'gang') g.addWanted(1, 'shots fired')
        }
      } else if (ud && ud.type === 'vehicle') {
        const v = ud.ref
        g.effects.burst(impact.point, 6, 0xffd070, 4, 0.3, -8)
        g.effects.puff(impact.point, 0x555555, 0.3)
        g.vehicles.damageVehicle(v, w.damage * 0.55)
        g.audio.bulletImpact()
        if (v.driver === 'ai') {
          // driver panics and bails out is out of scope; car slows
        }
        g.addWanted(1, 'reckless gunfire')
      } else {
        g.effects.burst(impact.point, 6, 0xffcc88, 3.5, 0.35, -10)
        g.effects.puff(impact.point, 0x8a8175, 0.25)
        g.audio.bulletImpact()
      }
    }

    if (w.mag === 0 && w.reserve > 0) this.startReload()
    this.hudUpdate()
  }

  startReload() {
    const w = this.weapon
    if (this.reloading || w.mag >= w.magSize || w.reserve <= 0) return
    this.reloading = true
    this.reloadTimer = w.reloadTime
    this.game.audio.reload()
    this.game.hud.notify('RELOADING', '#cfc6b6')
  }

  cancelReload() {
    this.reloading = false
    this.reloadTimer = 0
  }

  finishReload() {
    const w = this.weapon
    const need = w.magSize - w.mag
    const take = Math.min(need, w.reserve)
    w.mag += take
    w.reserve -= take
    this.reloading = false
    this.hudUpdate()
  }

  takeDamage(amount, source = 'hit', quiet = false) {
    if (this.dead || this.game.state !== 'playing') return
    if (this.inCar && source !== 'explosion' && source !== 'crash') amount *= 0.55
    gDamage(this, amount, quiet)
  }

  respawn() {
    this.dead = false
    this.hp = 100
    this.armor = 0
    this.pos.set(43, 0, 64)
    this.vel.set(0, 0, 0)
    this.yaw = 0
    this.onGround = true
    this.vy = 0
    this.inCar = false
    this.group.visible = true
    this.group.position.copy(this.pos)
    const w = this.weapon
    w.mag = w.magSize
    w.reserve = Math.max(w.reserve, 60)
    this.reloading = false
    this.dead = false
  }
}

function gDamage(player, amount, quiet) {
  const g = player.game
  let rest = amount
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, rest * 0.65)
    player.armor -= absorbed
    rest -= absorbed
  }
  player.hp -= rest
  player.lastDamage = performance.now()
  if (!quiet) {
    g.hud.flashDamage(amount / 30)
    g.effects.shake = Math.max(g.effects.shake, Math.min(0.5, amount / 90))
  }
  if (player.hp <= 0) {
    player.hp = 0
    player.dead = true
    g.playerDied()
  }
}

function propsUpdate(g) {
  g.hud.setWeapon(g.player.weapon.name, g.player.weapon.mag, g.player.weapon.reserve)
}
