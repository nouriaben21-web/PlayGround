import * as THREE from 'three'

function rand(a, b) { return a + Math.random() * (b - a) }

const GRID = [-160, -96, -32, 32, 96, 160]

export class PoliceSystem {
  constructor(game) {
    this.game = game
    this.wanted = 0
    this.units = []
    this.spawnTimer = 2
    this.evadeTimer = 0
    this.recentCrime = 0
    this.totalCopsDown = 0
  }

  addWanted(n, reason = '') {
    const before = this.wanted
    this.wanted = Math.min(5, this.wanted + n)
    this.evadeTimer = 0
    this.recentCrime = 3
    this.spawnTimer = Math.min(this.spawnTimer, 0.6)
    if (this.wanted > before) {
      this.game.hud.setWanted(this.wanted, true)
      if (this.game.audio) {
        if (before === 0) this.game.audio.sirenGain && this.game.audio.tone(720, 0.3, 0.05, 'square', 120)
      }
      if (reason && this.wanted >= 2) this.game.hud.notify(`WANTED: ${reason}`, '#ffb4a0')
    }
  }

  clearWanted() {
    this.wanted = 0
    this.recentCrime = 0
    this.evadeTimer = 0
    this.game.hud.setWanted(0)
    for (const u of this.units) u.retiring = true
  }

  activeUnits() {
    return this.units.filter(u => !u.dead)
  }

  update(dt) {
    if (this.game.state !== 'playing') return
    if (this.recentCrime > 0) this.recentCrime -= dt

    if (this.wanted > 0) {
      // maintain units
      this.spawnTimer -= dt
      const maxUnits = Math.min(4, Math.ceil(this.wanted / 1.4))
      if (this.spawnTimer <= 0 && this.activeUnits().length < maxUnits) {
        this.spawnUnit()
        this.spawnTimer = rand(3.5, 5.5)
      }
    }

    let nearest = Infinity
    for (const u of this.units) {
      if (u.dead) continue
      const car = u.car
      const d = car.pos.distanceTo(this.game.player.pos)
      nearest = Math.min(nearest, d)

      if (!u.deployed) {
        const carAlive = !car.destroyed
        if (!carAlive) {
          u.dead = true
          for (const o of u.officers) o.forceHostile = true
          continue
        }
        if (d < 26 || car.ai.stopped || car.speed < 1.5) {
          this.deployOfficers(u)
        }
      } else {
        // if all officers down and wanted is low, retire the car
        const alive = u.officers.filter(o => !o.dead && !o.removeMe)
        if (!alive.length) {
          u.dead = true
          car.ai = null
          car.driver = null
        }
      }

      if (u.retiring) {
        u.retireTimer = (u.retireTimer || 0) + dt
      }
    }

    // cleanup units
    this.units = this.units.filter(u => {
      if (u.dead) {
        if (u.car && !u.car.destroyed) {
          u.car.ai = null
          u.car.driver = null
        }
        return false
      }
      if (u.retiring) {
        if (u.car && !u.car.destroyed && (u.car.pos.distanceTo(this.game.player.pos) > 70 || u.retireTimer > 12)) {
          u.car.pos.y = -50
          u.car.group.visible = false
          u.car.destroyed = true
        }
        for (const o of u.officers) {
          if (!o.dead && (o.pos.distanceTo(this.game.player.pos) > 45 || u.retireTimer > 12)) o.dispose()
        }
        if (u.retireTimer > 12) return false
      }
      return true
    })

    // evade logic
    if (this.wanted > 0) {
      const seen = nearest < 58
      if (seen) this.evadeTimer = 0
      else {
        this.evadeTimer += dt
        if (this.evadeTimer > 9 && this.recentCrime <= 0) {
          this.wanted = Math.max(0, this.wanted - 1)
          this.game.hud.setWanted(this.wanted, true)
          this.game.hud.notify(this.wanted > 0 ? 'You lost a wanted star' : 'You lost the cops', '#9fd8ff')
          this.evadeTimer = 3
          if (this.wanted === 0) {
            for (const u of this.units) u.retiring = true
          }
        }
      }
    }

    // update cops' siren audio distance
    this.nearestDist = nearest
  }

  spawnUnit() {
    const p = this.game.player
    const angle = Math.random() * Math.PI * 2
    const dist = rand(70, 100)
    let x = p.pos.x + Math.cos(angle) * dist
    let z = p.pos.z + Math.sin(angle) * dist
    // snap to nearest road
    const gx = GRID.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a, GRID[0])
    const gz = GRID.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, GRID[0])
    if (Math.abs(x - gx) < Math.abs(z - gz)) x = gx
    else z = gz
    x = Math.max(-160, Math.min(160, x))
    z = Math.max(-160, Math.min(160, z))
    // keep a little away from the player's exact spot
    if (Math.hypot(x - p.pos.x, z - p.pos.z) < 40) return
    const yaw = Math.atan2(p.pos.x - x, p.pos.z - z)
    const car = this.game.vehicles.addVehicle('police', 0xd9dde2, x, z, yaw, { driver: 'ai', hp: 220 })
    car.ai = { mode: 'police', speed: 2 }
    car.isPolice = true
    const unit = { car, officers: [], deployed: false, dead: false, retiring: false }
    this.units.push(unit)
    this.game.hud.notify('LSPD units responding', '#9fc9ff')
  }

  deployOfficers(u) {
    u.deployed = true
    u.car.ai.stopped = true
    const car = u.car
    const fwd = new THREE.Vector3(Math.sin(car.yaw), 0, Math.cos(car.yaw))
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x)
    for (const s of [-1, 1]) {
      const pos = car.pos.clone().addScaledVector(right, s * 1.7).addScaledVector(fwd, 0.6)
      const cop = this.game.peds.spawnCop(pos.x, pos.z, true)
      cop.setMarker(0x4d9bff)
      u.officers.push(cop)
    }
  }

  onOfficerDown(actor) {
    this.totalCopsDown++
    this.game.addWanted(2, 'cop killer')
    for (const u of this.units) {
      u.officers = u.officers.filter(o => o !== actor)
    }
  }

  onUnitDestroyed(car) {
    for (const u of this.units) {
      if (u.car === car) u.dead = true
    }
  }

  reset() {
    this.wanted = 0
    this.evadeTimer = 0
    this.game.hud.setWanted(0)
    for (const u of this.units) {
      if (u.car && !u.car.destroyed) {
        u.car.driver = null
        u.car.ai = null
      }
      for (const o of u.officers) if (!o.dead) o.dispose()
    }
    this.units = []
  }
}
