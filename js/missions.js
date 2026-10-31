import * as THREE from 'three'

const GRID = [-160, -96, -32, 32, 96, 160]

function rand(a, b) { return a + Math.random() * (b - a) }

function labelTexture(text, color = '#ffd76a') {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, 128, 128)
  ctx.beginPath()
  ctx.arc(64, 64, 54, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(10,10,12,0.72)'
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = color
  ctx.stroke()
  ctx.fillStyle = color
  ctx.font = 'bold 72px Arial Black, Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 70)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

class WorldMarker {
  constructor(scene, letter = 'M', color = 0xffc84a) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.visible = false
    const beamMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: 0.42 }
      },
      vertexShader: `
        varying float vH;
        void main() {
          vH = (position.y + 4.5) / 9.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vH;
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float a = uOpacity * pow(1.0 - clamp(vH, 0.0, 1.0), 1.7);
          gl_FragColor = vec4(uColor, a);
        }`
    })
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.72, 9, 20, 1, true), beamMat)
    this.beam.position.y = 4.5
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color }))
    this.ring.rotation.x = Math.PI / 2
    this.ring.position.y = 0.12
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(letter, '#' + new THREE.Color(color).getHexString()), transparent: true, depthTest: false, depthWrite: false }))
    this.sprite.scale.set(1.7, 1.7, 1)
    this.sprite.position.y = 3.1
    this.group.add(this.beam, this.ring, this.sprite)
    this.scene.add(this.group)
    this.time = 0
  }
  setText(letter, color) {
    this.sprite.material.map.dispose()
    this.sprite.material.map = labelTexture(letter, '#' + new THREE.Color(color).getHexString())
    this.sprite.material.needsUpdate = true
    this.beam.material.uniforms.uColor.value.setHex(color)
    this.ring.material.color.setHex(color)
  }
  setPosition(pos) { this.group.position.set(pos.x, 0, pos.z) }
  setVisible(v) { this.group.visible = v }
  update(dt) {
    if (!this.group.visible) return
    this.time += dt
    this.sprite.material.opacity = 0.75 + Math.sin(this.time * 3) * 0.2
    this.sprite.position.y = 3.1 + Math.sin(this.time * 2) * 0.12
    this.ring.scale.setScalar(1 + Math.sin(this.time * 2.6) * 0.06)
    this.beam.material.uniforms.uOpacity.value = 0.26 + Math.sin(this.time * 2) * 0.07
  }
}

export class MissionSystem {
  constructor(game) {
    this.game = game
    this.active = false
    this.mission = null
    this.stepIndex = -1
    this.missionTimer = 0
    this.startPos = new THREE.Vector3(43, 0, 84)
    this.startMarker = new WorldMarker(game.scene, 'M', 0xffc84a)
    this.startMarker.setPosition(this.startPos)
    this.startMarker.setVisible(true)
    this.objectiveMarker = new WorldMarker(game.scene, '!', 0x7dff9a)
    this.checkpointRings = []
    this.completed = 0
    this.failTimer = 0
    this.cooloff = 0
    this.missionFactories = [
      () => this.repoMission(),
      () => this.sweepMission(),
      () => this.raceMission(),
      () => this.getawayMission()
    ]
  }

  /* ------------------------------------------------------------- missions */
  repoMission() {
    const hero = this.game.vehicles.heroCar
    return {
      title: 'REPO MAN',
      brief: 'Simeon needs that red Banshee back. Grab it and bring it to the lockup.',
      reward: 650,
      steps: [
        { type: 'steal', vehicle: hero, label: 'Steal the red Banshee', radius: 5 },
        { type: 'deliver', vehicle: hero, pos: new THREE.Vector3(34, 0, 100), radius: 5.5, label: 'Deliver the Banshee to the lockup' }
      ]
    }
  }

  sweepMission() {
    const hideout = this.pickPoint(90, 140)
    return {
      title: 'STREET SWEEP',
      brief: 'A crew is muscling in on the block. Take out all three before they take you out.',
      reward: 900,
      steps: [
        { type: 'eliminate', pos: hideout, radius: 6, label: 'Reach the stash house' }
      ]
    }
  }

  raceMission() {
    const points = []
    const start = this.pickPoint(60, 110)
    points.push(start)
    let last = start
    for (let i = 0; i < 5; i++) {
      let p = this.pickPoint(55, 90)
      let tries = 0
      while (p.distanceTo(last) < 45 && tries++ < 20) p = this.pickPoint(55, 90)
      points.push(p)
      last = p
    }
    return {
      title: 'VINEWOOD RUN',
      brief: 'Hit every checkpoint before the clock runs out. A fast car would help.',
      reward: 1200,
      steps: [
        { type: 'checkpoints', points, radius: 4.6, time: 85, label: 'Hit the checkpoints' }
      ]
    }
  }

  getawayMission() {
    return {
      title: 'HEAT',
      brief: 'The LSPD is on you. Stay free until the heat dies down.',
      reward: 1500,
      steps: [
        { type: 'evade', time: 75, label: 'Lose the cops' }
      ]
    }
  }

  pickPoint(minFromPlayer = 60, maxFromPlayer = 120) {
    const p = this.game.player.pos
    for (let i = 0; i < 40; i++) {
      let x = rand(-140, 140)
      let z = rand(-140, 140)
      // put it near a sidewalk / road edge so it is reachable
      const gx = GRID.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a, GRID[0])
      const gz = GRID.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, GRID[0])
      if (Math.abs(x - gx) < Math.abs(z - gz)) x = gx + 11
      else z = gz + 11
      const d = Math.hypot(x - p.x, z - p.z)
      if (d < minFromPlayer || d > maxFromPlayer) continue
      return new THREE.Vector3(x, 0, z)
    }
    return new THREE.Vector3(p.x + 60, 0, p.z + 40)
  }

  /* --------------------------------------------------------------- control */
  startMission() {
    if (this.active) return
    const factory = this.missionFactories[this.completed % this.missionFactories.length]
    const m = factory()
    this.mission = m
    this.active = true
    this.stepIndex = -1
    this.startMarker.setVisible(false)
    this.game.hud.clearToasts()
    this.game.hud.setObjective(m.title, m.brief)
    this.game.hud.missionSplash(m.title, m.brief)
    this.game.audio.missionStart()
    this.setStep(0)
  }

  setStep(i) {
    const m = this.mission
    this.stepIndex = i
    if (i >= m.steps.length) { this.completeMission(); return }
    const step = m.steps[i]
    this.clearCheckpointRings()
    if (step.type === 'eliminate') {
      if (!step.spawned) {
        step.spawned = true
        step.actors = this.game.peds.spawnGang(step.pos.x, step.pos.z, 3)
        for (const a of step.actors) a.setMarker(0xff3b30)
      }
    }
    if (step.type === 'checkpoints') {
      step.cpIndex = 0
      this.missionTimer = step.time
      step.rings = step.points.map(pt => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(step.radius, 0.12, 6, 28),
          new THREE.MeshBasicMaterial({ color: 0x74ff9a, transparent: true, opacity: 0.85 })
        )
        ring.rotation.x = Math.PI / 2
        ring.position.set(pt.x, 0.3, pt.z)
        this.game.scene.add(ring)
        this.checkpointRings.push(ring)
        return ring
      })
    }
    if (step.type === 'evade') {
      this.missionTimer = step.time
      this.game.police.addWanted(3, 'heat')
    }
    this.game.hud.setObjective(m.title, step.label)
  }

  update(dt) {
    this.startMarker.update(dt)
    this.objectiveMarker.update(dt)
    for (const r of this.checkpointRings) {
      r.rotation.z += dt * 1.4
      r.material.opacity = 0.6 + Math.sin(performance.now() * 0.004) * 0.25
    }
    if (this.cooloff > 0) this.cooloff -= dt
    if (!this.active) {
      this.startMarker.setVisible(this.cooloff <= 0)
      if (this.cooloff <= 0) {
        const p = this.game.player
        if (!p.inCar && p.pos.distanceTo(this.startPos) < 2.9) {
          this.startMission()
        }
      }
      this.game.hud.setRadarMarker({ x: this.startPos.x, z: this.startPos.z, color: '#ffc84a', type: 'mission' })
      return
    }

    const step = this.mission.steps[this.stepIndex]
    if (!step) return
    const player = this.game.player
    const pv = this.game.vehicles.playerVehicle

    let objectivePos = step.pos
    let letter = '!'
    let color = 0x7dff9a

    if (step.type === 'steal') {
      if (step.vehicle && step.vehicle.destroyed) { this.failMission('The target vehicle was destroyed'); return }
      if (step.vehicle) {
        objectivePos = step.vehicle.pos
        if (pv === step.vehicle) {
          this.game.hud.notify('Now deliver it to the lockup', '#7dff9a')
          this.setStep(this.stepIndex + 1)
        }
      }
    } else if (step.type === 'deliver') {
      objectivePos = step.pos
      letter = '$'
      if (step.vehicle && step.vehicle.destroyed) { this.failMission('You wrecked the delivery car'); return }
      if (pv === step.vehicle) {
        const d = Math.hypot(pv.pos.x - step.pos.x, pv.pos.z - step.pos.z)
        if (d < step.radius) {
          this.setStep(this.stepIndex + 1)
        }
      }
    } else if (step.type === 'eliminate') {
      if (!step.actors || step.actors.every(a => a.dead)) {
        this.setStep(this.stepIndex + 1)
        return
      }
      const alive = step.actors.filter(a => !a.dead)
      let nearest = alive[0]
      for (const a of alive) {
        if (a.pos.distanceTo(player.pos) < nearest.pos.distanceTo(player.pos)) nearest = a
      }
      objectivePos = nearest.pos
      letter = 'X'
      color = 0xff5a4a
      if (player.pos.distanceTo(step.pos) < step.radius && !step.announced) {
        step.announced = true
        this.game.hud.notify('Targets spotted — take them down!', '#ff9a8a')
      }
    } else if (step.type === 'checkpoints') {
      const pt = step.points[step.cpIndex]
      objectivePos = pt
      this.missionTimer -= dt
      if (this.missionTimer <= 0) { this.failMission('Out of time'); return }
      const d = Math.hypot(player.pos.x - pt.x, player.pos.z - pt.z)
      if (d < step.radius + (pv ? 1.5 : 0)) {
        const ring = step.rings[step.cpIndex]
        if (ring) ring.visible = false
        step.cpIndex++
        this.game.audio.tone(880, 0.14, 0.12, 'triangle')
        this.game.effects.burst(new THREE.Vector3(pt.x, 1, pt.z), 20, 0x8dffb0, 6, 0.6, -6)
        if (step.cpIndex >= step.points.length) {
          this.setStep(this.stepIndex + 1)
        } else {
          this.game.hud.notify(`Checkpoint ${step.cpIndex}/${step.points.length}`, '#8dffb0')
          this.game.hud.setObjective(this.mission.title, step.label, this.missionTimer)
        }
      }
      this.game.hud.setRadarMarker({ x: pt.x, z: pt.z, color: '#7dff9a', type: 'checkpoint' })
    } else if (step.type === 'evade') {
      this.missionTimer -= dt
      objectivePos = player.pos
      letter = '!'
      color = 0x7db7ff
      this.game.hud.setObjective(this.mission.title, step.label, this.missionTimer)
      if (this.game.police.wanted === 0) {
        this.setStep(this.stepIndex + 1)
      } else if (this.missionTimer <= 0) {
        this.failMission('The cops caught up with you')
      }
    }

    // if the mission just completed or failed inside a branch above, stop here
    if (!this.active || !this.mission) return

    // marker + radar
    const marker = this.objectiveMarker
    if (objectivePos) {
      marker.setPosition(objectivePos)
      marker.setVisible(true)
      marker.setText(letter, color)
    }
    if (objectivePos) this.game.hud.setRadarMarker({ x: objectivePos.x, z: objectivePos.z, color: '#' + new THREE.Color(color).getHexString(), type: 'objective' })

    // distance readout
    if (this.stepIndex >= 0 && this.mission && this.mission.steps[this.stepIndex]) {
      const st = this.mission.steps[this.stepIndex]
      if (objectivePos && st.type !== 'evade' && st.type !== 'eliminate') {
        const dist = Math.round(Math.hypot(player.pos.x - objectivePos.x, player.pos.z - objectivePos.z))
        this.game.hud.setObjective(this.mission.title, `${st.label} · ${dist}m`, st.type === 'checkpoints' ? this.missionTimer : null)
      }
      if (st.type === 'deliver' && !pv) {
        this.game.hud.setObjective(this.mission.title, 'Get back in the delivery vehicle', null)
      }
    }

    // timer HUD
    if (step.type === 'checkpoints' || step.type === 'evade') this.game.hud.setTimer(this.missionTimer)
    else this.game.hud.setTimer(null)
  }

  onActorKilled(actor) {
    if (!this.active) return
    const step = this.mission?.steps[this.stepIndex]
    if (!step || step.type !== 'eliminate') return
    const alive = step.actors.filter(a => !a.dead)
    this.game.hud.notify(alive.length > 0 ? `${alive.length} targets left` : 'All targets down', '#ffb3a8')
  }

  notifyVehicleStolen(v) {
    if (!this.active) return
    const step = this.mission?.steps[this.stepIndex]
    if (step && step.type === 'steal' && step.vehicle === v) {
      this.game.hud.notify('Nice ride. Deliver it to the lockup.', '#7dff9a')
    }
  }

  completeMission() {
    const m = this.mission
    this.active = false
    this.objectiveMarker.setVisible(false)
    this.clearCheckpointRings()
    const reward = Math.round(m.reward * (1 + this.completed * 0.15))
    this.game.addMoney(reward)
    this.completed++
    this.game.hud.missionComplete(m.title, reward)
    this.game.audio.missionComplete()
    this.game.hud.setTimer(null)
    this.game.hud.setObjective(null, null)
    this.game.hud.setRadarMarker(null)
    this.cooloff = 4
    this.mission = null
    this.stepIndex = -1
    this.placeNextStart()
    // clear any mission gang markers
    this.game.police.evadeTimer = 0
  }

  failMission(reason) {
    if (!this.active) return
    this.active = false
    this.objectiveMarker.setVisible(false)
    this.clearCheckpointRings()
    this.game.hud.missionFailed(reason || 'Mission failed')
    this.game.audio.fail()
    this.game.hud.setTimer(null)
    this.game.hud.setObjective(null, null)
    this.game.hud.setRadarMarker(null)
    this.cooloff = 5
    const m = this.mission
    this.mission = null
    this.stepIndex = -1
    // cleanup gang
    if (m) {
      for (const st of m.steps) {
        if (st.actors) st.actors.forEach(a => { if (!a.dead) a.dispose() })
      }
      if (m.steps.some(s => s.type === 'evade')) this.game.police.clearWanted()
    }
    this.placeNextStart()
  }

  placeNextStart() {
    const p = this.game.player.pos
    const ang = Math.random() * Math.PI * 2
    let x = p.x + Math.cos(ang) * rand(8, 16)
    let z = p.z + Math.sin(ang) * rand(8, 16)
    const gx = GRID.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a, GRID[0])
    const gz = GRID.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a, GRID[0])
    if (Math.abs(x - gx) < Math.abs(z - gz)) x = gx + 11
    else z = gz + 11
    const pos = new THREE.Vector3(x, 0, z)
    this.game.world.resolveCircle(pos, 1.2)
    this.startPos.copy(pos)
    this.startMarker.setPosition(pos)
    this.startMarker.setText('M', 0xffc84a)
  }

  onPlayerDeath() {
    if (this.active) this.failMission('You were wasted')
  }

  clearCheckpointRings() {
    for (const r of this.checkpointRings) {
      this.game.scene.remove(r)
      r.geometry.dispose()
      r.material.dispose()
    }
    this.checkpointRings = []
  }

  forceStart() {
    if (!this.active && this.cooloff <= 0) this.startMission()
  }
}
