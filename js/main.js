import * as THREE from 'three'
import { EffectComposer } from '../vendor/addons/postprocessing/EffectComposer.js'
import { RenderPass } from '../vendor/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from '../vendor/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from '../vendor/addons/postprocessing/ShaderPass.js'
import { OutputPass } from '../vendor/addons/postprocessing/OutputPass.js'
import { World } from './world.js'
import { Player } from './player.js'
import { VehicleSystem } from './vehicles.js'
import { PedSystem } from './peds.js'
import { PoliceSystem } from './police.js'
import { MissionSystem } from './missions.js'
import { HUD } from './hud.js'
import { Effects } from './effects.js'
import { AudioEngine } from './audio.js'

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window

/* --------------------------------------------------------------- renderer */
const container = document.getElementById('scene')
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance', stencil: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.0
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
container.appendChild(renderer.domElement)
renderer.domElement.style.touchAction = 'none'

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.12, 1500)

function makeEnvironment() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, '#3d78ad')
  g.addColorStop(0.42, '#a7c4d6')
  g.addColorStop(0.52, '#ffd0a1')
  g.addColorStop(0.6, '#c18a5d')
  g.addColorStop(1, '#3b3329')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 512, 256)
  const sun = ctx.createRadialGradient(365, 92, 2, 365, 92, 80)
  sun.addColorStop(0, 'rgba(255,250,228,1)')
  sun.addColorStop(0.3, 'rgba(255,208,140,0.7)')
  sun.addColorStop(1, 'rgba(255,170,80,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, 512, 256)
  const t = new THREE.CanvasTexture(c)
  t.mapping = THREE.EquirectangularReflectionMapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
scene.environment = makeEnvironment()
scene.environmentIntensity = 0.4

/* ------------------------------------------------------------------ game */
const game = {
  state: 'menu',
  scene, camera, renderer,
  isTouch,
  clock: new THREE.Clock(),
  time: 0,
  money: 500,
  wanted: 0,
  camYaw: 0,
  camPitch: 0.21,
  camRecoil: 0,
  lastGunshot: 0,
  lastCrimeReport: 0,
  mouseLocked: false,
  lockFailed: false,
  input: {
    moveX: 0, moveY: 0,
    joyX: 0, joyY: 0, joyActive: false,
    throttle: 0, brake: 0, steer: 0,
    fire: false, aim: false, sprint: false, handbrake: false,
    jumpPressed: false, reloadPressed: false, switchPressed: false
  }
}
window.__LOS_SANTOS__ = game

game.audio = new AudioEngine()
game.hud = new HUD(game)
game.world = new World(scene, game)
game.effects = new Effects(scene, game)
game.player = new Player(game)
game.vehicles = new VehicleSystem(scene, game, game.world)
game.peds = new PedSystem(game)
game.police = new PoliceSystem(game)
game.missions = new MissionSystem(game)

game.hud.setMoney(game.money)
game.hud.setWanted(0)
game.missions.startMarker.setVisible(true)

game.getShootTargets = () => {
  const list = []
  for (const a of game.peds.actors) if (!a.dead && !a.removeMe) list.push(a.proxy)
  for (const v of game.vehicles.vehicles) if (!v.destroyed && v.group.visible) list.push(v.proxy)
  return list
}

game.addMoney = v => {
  game.money = Math.max(0, game.money + v)
  game.hud.setMoney(game.money)
}

game.addWanted = (n, reason) => {
  if (game.state !== 'playing') return
  game.police.addWanted(n, reason)
  game.wanted = game.police.wanted
}

game.reportGunfire = () => {
  const now = performance.now()
  if (now - game.lastCrimeReport > 2600) {
    game.lastCrimeReport = now
    game.addWanted(1, 'gunfire')
  }
}

game.onInteract = () => {
  if (game.state !== 'playing') return
  if (game.player.inCar) {
    if (!game.vehicles.exit()) game.hud.notify('SLOW DOWN TO EXIT', '#ffcf8a')
  } else {
    const near = game.vehicles.findNearest(game.player.pos, 4.1)
    if (near) {
      game.vehicles.enter(near.vehicle)
      const label = near.vehicle.type.toUpperCase()
      game.hud.notify(label + ' ACQUIRED', '#f6c453')
    }
  }
}

game.playerDied = () => {
  if (game.state !== 'playing') return
  game.state = 'wasted'
  game.input.fire = false
  game.input.aim = false
  game.audio.fail()
  game.hud.setWanted(0)
  game.hud.setObjective(null, null)
  game.hud.setTimer(null)
  game.hud.setRadarMarker(null)
  game.hud.setCrosshair('hidden')
  game.hud.setPrompt(null)
  game.missions.onPlayerDeath()
  game.police.reset()
  if (game.vehicles.playerVehicle) {
    const v = game.vehicles.playerVehicle
    v.driver = null
    v.speed = 0
    v.vel.set(0, 0, 0)
    game.vehicles.playerVehicle = null
  }
  game.player.inCar = false
  game.hud.setDriving(false)
  const loss = Math.min(200, Math.round(game.money))
  game.addMoney(-loss)
  game.hud.showWasted(loss)
  if (document.pointerLockElement) document.exitPointerLock()
  clearTimeout(game.respawnTimer)
  game.respawnTimer = setTimeout(() => {
    game.player.respawn()
    game.state = 'playing'
    game.hud.hideWasted()
    game.camYaw = 0
    game.camPitch = 0.21
    game.camRecoil = 0
    game.police.reset()
    game.missions.cooloff = Math.max(game.missions.cooloff, 3)
    game.missions.placeNextStart()
    game.hud.notify('BACK ON THE STREETS', '#f6c453')
    camera.position.set(43, 4, 56)
  }, 3800)
}

/* ------------------------------------------------------------- composer */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.9 },
    saturation: { value: 1.22 },
    contrast: { value: 1.065 },
    warmth: { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float vignette, saturation, contrast, warmth;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      // cooler shadows, warmer highlights
      c += vec3(-0.006, 0.001, 0.010) * (1.0 - smoothstep(0.0, 0.45, l));
      c += vec3(0.030, 0.010, -0.010) * smoothstep(0.30, 1.30, l) * warmth;
      // gentle S-curve contrast around mid grey
      c = (c - 0.18) * contrast + 0.18;
      c = max(c, 0.0);
      // vignette
      vec2 d = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.34, 0.86, length(d));
      c *= mix(1.0 - vignette * 0.30, 1.0, vig);
      gl_FragColor = vec4(c, tex.a);
    }`
}

let composer = null
let bloomPass = null
try {
  composer = new EffectComposer(renderer)
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), isTouch ? 0.20 : 0.30, 0.55, 0.84)
  composer.addPass(bloomPass)
  composer.addPass(new ShaderPass(GradeShader))
  composer.addPass(new OutputPass())
} catch (err) {
  console.warn('Post-processing unavailable, rendering direct.', err)
  composer = null
}

/* ------------------------------------------------------------------ camera */
const camPos = new THREE.Vector3(43, 4, 56)
const camTarget = new THREE.Vector3()
let menuAngle = 0.6
let lastLook = 0

function dampAngle(a, b, l, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
  return a + d * (1 - Math.exp(-l * dt))
}

function updateCamera(dt) {
  if (game.state === 'menu') {
    menuAngle += dt * 0.035
    const r = 205
    camTarget.set(0, 26, 0)
    const want = new THREE.Vector3(
      Math.sin(menuAngle) * r,
      88 + Math.sin(menuAngle * 0.6) * 9,
      Math.cos(menuAngle) * r
    )
    camera.position.lerp(want, 1 - Math.exp(-2.2 * dt))
    camera.lookAt(camTarget)
    return
  }

  const p = game.player
  const v = game.vehicles.playerVehicle
  const driving = p.inCar && v
  const aim = game.input.aim && !driving
  const focus = new THREE.Vector3(p.pos.x, p.pos.y + 1.45, p.pos.z)
  const now = performance.now()

  if (driving) {
    focus.set(v.pos.x, 1.75, v.pos.z)
    if (now - lastLook > 1900) {
      game.camYaw = dampAngle(game.camYaw, v.yaw, 2.6, dt)
      game.camPitch = game.camPitch + (0.24 - game.camPitch) * (1 - Math.exp(-2 * dt))
    }
  } else if (now - lastLook > 6000 && !aim) {
    // gently settle the pitch
    game.camPitch = game.camPitch + (0.21 - game.camPitch) * (1 - Math.exp(-0.7 * dt))
  }

  const dist = driving ? 8.8 : aim ? 3.3 : 6.1
  const pitch = Math.max(0.03, Math.min(0.82, game.camPitch + (driving ? 0.05 : 0)))
  const cp = Math.cos(pitch), sp = Math.sin(pitch)
  const f = new THREE.Vector3(Math.sin(game.camYaw), 0, Math.cos(game.camYaw))
  const right = new THREE.Vector3(-Math.cos(game.camYaw), 0, Math.sin(game.camYaw))
  const offset = new THREE.Vector3(-f.x * cp, sp, -f.z * cp).multiplyScalar(dist)
  if (aim) {
    offset.addScaledVector(right, 0.72)
    focus.y += 0.12
  }
  const target = focus.clone()
  target.y += driving ? 0.55 : 0.15
  let desired = target.clone().add(offset)
  if (desired.y < 0.8) desired.y = 0.8

  // camera collision
  const dir = desired.clone().sub(target)
  const len = dir.length()
  if (len > 0.001) {
    dir.divideScalar(len)
    const hit = game.world.hitCollider(target, dir, len + 0.5)
    if (hit) {
      const d = Math.max(1.1, hit.dist - 0.35)
      desired = target.clone().addScaledVector(dir, d)
    }
  }

  const lerp = 1 - Math.exp(-(driving ? 7 : 11) * dt)
  camPos.lerp(desired, lerp)
  camera.position.copy(camPos)

  // shake
  const shake = game.effects.shake
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.7
    camera.position.y += (Math.random() - 0.5) * shake * 0.5
    camera.position.z += (Math.random() - 0.5) * shake * 0.7
  }
  if (game.camRecoil > 0) game.camRecoil = Math.max(0, game.camRecoil - dt * 0.65)

  const look = target.clone()
  look.y += game.camRecoil * 1.4
  if (driving) look.addScaledVector(f, 4.5)
  else if (aim) look.addScaledVector(f, 8)
  else look.addScaledVector(f, 1.6)
  camera.lookAt(look)
}

/* ------------------------------------------------------------------ input */
const keys = {}
const canvas = renderer.domElement
let joyPointer = null
let lookPointer = null
let lookLast = { x: 0, y: 0 }
let dragLook = null
let dragMoved = false

const touchFire = { value: false }

window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault()
  if (e.repeat) return
  keys[e.code] = true
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (game.state === 'playing' || game.state === 'paused') togglePause()
    return
  }
  if (e.code === 'KeyM') {
    toggleMute()
    return
  }
  if (game.state !== 'playing') return
  if (e.code === 'KeyF' || e.code === 'KeyE') game.onInteract()
  if (e.code === 'Space') {
    if (game.player.inCar) game.input.handbrake = true
    else game.input.jumpPressed = true
  }
  if (e.code === 'KeyR') game.input.reloadPressed = true
  if (e.code === 'KeyQ') game.input.switchPressed = true
  if (e.code === 'Digit1') game.player.selectWeapon(0)
  if (e.code === 'Digit2') game.player.selectWeapon(1)
})
window.addEventListener('keyup', e => {
  keys[e.code] = false
  if (e.code === 'Space') game.input.handbrake = false
})
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false
  game.input.fire = false
  game.input.aim = false
  game.input.handbrake = false
})

canvas.addEventListener('contextmenu', e => e.preventDefault())
canvas.addEventListener('mousedown', e => {
  if (game.state !== 'playing' || isTouch) return
  if (e.button === 0) {
    if (!game.mouseLocked) {
      if (!game.lockFailed) {
        requestLock()
      } else {
        dragLook = { x: e.clientX, y: e.clientY }
        dragMoved = false
        game.input.fire = true
      }
    } else {
      game.input.fire = true
    }
  }
  if (e.button === 2) game.input.aim = true
})
window.addEventListener('mouseup', e => {
  if (e.button === 0) { game.input.fire = false; dragLook = null }
  if (e.button === 2) game.input.aim = false
})
window.addEventListener('mousemove', e => {
  if (game.state !== 'playing') return
  if (game.mouseLocked) {
    game.camYaw -= e.movementX * 0.0023
    game.camPitch = Math.max(0.03, Math.min(0.82, game.camPitch + e.movementY * 0.0019))
    lastLook = performance.now()
    return
  }
  if (game.lockFailed && dragLook) {
    const dx = e.clientX - dragLook.x
    const dy = e.clientY - dragLook.y
    dragLook = { x: e.clientX, y: e.clientY }
    if (Math.abs(dx) + Math.abs(dy) > 1.5) { dragMoved = true; game.input.fire = false }
    game.camYaw -= dx * 0.0042
    game.camPitch = Math.max(0.03, Math.min(0.82, game.camPitch + dy * 0.0035))
    lastLook = performance.now()
  }
})
function requestLock() {
  if (isTouch || game.lockFailed) return
  try {
    const p = canvas.requestPointerLock()
    if (p && p.catch) p.catch(() => enableMouseFallback())
  } catch (err) {
    enableMouseFallback()
  }
  setTimeout(() => {
    if (!document.pointerLockElement) enableMouseFallback()
  }, 700)
}
function enableMouseFallback() {
  if (game.mouseLocked || game.lockFailed) return
  game.lockFailed = true
  if (game.state === 'playing') {
    game.hud.notify('DRAG TO LOOK · CLICK TO SHOOT', '#f6c453')
  }
}
document.addEventListener('pointerlockchange', () => {
  game.mouseLocked = document.pointerLockElement === canvas
})
document.addEventListener('pointerlockerror', () => { game.mouseLocked = false; enableMouseFallback() })

canvas.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || game.state !== 'playing') return
  if (lookPointer !== null) return
  lookPointer = e.pointerId
  lookLast = { x: e.clientX, y: e.clientY }
  try { canvas.setPointerCapture(e.pointerId) } catch (err) {}
})
canvas.addEventListener('pointermove', e => {
  if (lookPointer !== e.pointerId) return
  const dx = e.clientX - lookLast.x
  const dy = e.clientY - lookLast.y
  lookLast = { x: e.clientX, y: e.clientY }
  game.camYaw -= dx * 0.0052
  game.camPitch = Math.max(0.03, Math.min(0.82, game.camPitch + dy * 0.0042))
  lastLook = performance.now()
})
const endLook = e => {
  if (lookPointer === e.pointerId) lookPointer = null
}
canvas.addEventListener('pointerup', endLook)
canvas.addEventListener('pointercancel', endLook)

/* joystick */
const joyEl = document.getElementById('joystick')
const stickEl = document.getElementById('stick')
function joyUpdate(e) {
  const r = joyEl.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  let dx = e.clientX - cx
  let dy = e.clientY - cy
  const max = r.width * 0.34
  const m = Math.hypot(dx, dy)
  if (m > max) { dx = dx / m * max; dy = dy / m * max }
  stickEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`
  game.input.joyX = dx / max
  game.input.joyY = -dy / max
  game.input.joyActive = true
}
joyEl.addEventListener('pointerdown', e => {
  e.preventDefault()
  if (joyPointer !== null) return
  joyPointer = e.pointerId
  try { joyEl.setPointerCapture(e.pointerId) } catch (err) {}
  joyUpdate(e)
})
joyEl.addEventListener('pointermove', e => {
  if (joyPointer === e.pointerId) joyUpdate(e)
})
const endJoy = e => {
  if (joyPointer !== e.pointerId) return
  joyPointer = null
  game.input.joyX = 0
  game.input.joyY = 0
  game.input.joyActive = false
  stickEl.style.transform = 'translate(-50%, -50%)'
}
joyEl.addEventListener('pointerup', endJoy)
joyEl.addEventListener('pointercancel', endJoy)

/* buttons */
const actionButtons = document.querySelectorAll('.mbtn')
actionButtons.forEach(btn => {
  const action = btn.dataset.action
  btn.addEventListener('pointerdown', e => {
    e.preventDefault()
    if (game.state !== 'playing') return
    btn.classList.add('down')
    try { btn.setPointerCapture(e.pointerId) } catch (err) {}
    if (action === 'fire') {
      touchFire.value = true
      game.input.fire = true
      game.input.aim = true
    } else if (action === 'jump') {
      game.input.jumpPressed = true
    } else if (action === 'car') {
      game.onInteract()
    } else if (action === 'reload') {
      game.player.startReload()
    } else if (action === 'switch') {
      game.player.cycleWeapon()
    }
  })
  const up = e => {
    btn.classList.remove('down')
    if (action === 'fire') {
      touchFire.value = false
      game.input.fire = false
      game.input.aim = false
    }
  }
  btn.addEventListener('pointerup', up)
  btn.addEventListener('pointercancel', up)
  btn.addEventListener('pointerleave', up)
})

/* ---------------------------------------------------------------- screens */
const startEl = document.getElementById('start')
const playBtn = document.getElementById('play-btn')
const pauseBtn = document.getElementById('pause-btn')
const muteBtn = document.getElementById('mute-btn')
const resumeBtn = document.getElementById('resume-btn')
const restartBtn = document.getElementById('restart-btn')
const loadingBar = document.getElementById('loading-bar')
const loadingFill = loadingBar.querySelector('i')

if (isTouch) document.body.classList.add('touch')

function startGame() {
  if (game.state !== 'menu') return
  game.audio.init()
  game.state = 'playing'
  startEl.classList.add('hidden')
  document.getElementById('ui').classList.remove('hidden')
  game.hud.setHintGone()
  game.hud.notify('LOS SANTOS · STREETS', '#f6c453')
  setTimeout(() => {
    if (game.state === 'playing' && !game.missions.active) game.hud.notify('Find the gold M to start a job', '#f6c453')
  }, 1600)
  setTimeout(() => {
    if (game.state === 'playing' && !game.missions.active) game.hud.notify('Steal any car · outrun the LSPD', '#cfc6b6')
  }, 4200)
  if (isTouch) {
    try {
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {})
    } catch (err) {}
  } else {
    requestLock()
  }
  camera.position.set(43, 4, 56)
  game.camYaw = 0
}

playBtn.addEventListener('click', startGame)

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused'
    game.input.fire = false
    game.input.aim = false
    touchFire.value = false
    game.hud.showPause(true)
    if (document.pointerLockElement) document.exitPointerLock()
  } else if (game.state === 'paused') {
    game.state = 'playing'
    game.hud.showPause(false)
    game.audio.init()
    if (!isTouch) requestLock()
  }
}
pauseBtn.addEventListener('click', togglePause)
resumeBtn.addEventListener('click', togglePause)
restartBtn.addEventListener('click', () => location.reload())
function toggleMute() {
  game.audio.setMuted(!game.audio.muted)
  muteBtn.textContent = game.audio.muted ? '✕' : '♪'
  muteBtn.style.color = game.audio.muted ? '#ff7a66' : ''
}
muteBtn.addEventListener('click', toggleMute)

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') togglePause()
})

/* ------------------------------------------------------------- main loop */
function readInput() {
  const input = game.input
  const p = game.player
  const kx = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0)
  const ky = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0)
  const joyMag = Math.hypot(input.joyX, input.joyY)
  let mx = kx, my = ky
  if (input.joyActive && joyMag > 0.1) {
    mx = input.joyX
    my = input.joyY
  }
  input.moveX = mx
  input.moveY = my
  input.sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']) || (input.joyActive && joyMag > 0.92)
  if (p.inCar) {
    input.throttle = Math.max(0, my)
    input.brake = Math.max(0, -my)
    input.steer = -mx
    input.handbrake = !!(keys['Space'])
  } else {
    input.throttle = 0
    input.brake = 0
    input.steer = 0
    input.handbrake = false
    if (!keys['Space']) { /* jump is edge triggered */ }
  }
  if (!isTouch && !game.mouseLocked && !game.lockFailed) {
    input.fire = false
    input.aim = false
  }
}

let hudTick = 0
function updatePlaying(dt) {
  readInput()
  const p = game.player
  p.update(dt)
  game.vehicles.update(dt)
  game.peds.update(dt)
  game.police.update(dt)
  game.missions.update(dt)
  game.wanted = game.police.wanted

  updateCamera(dt)

  // HUD
  game.hud.update(dt)
  hudTick += dt
  if (hudTick > 0.08) {
    hudTick = 0
    const v = game.vehicles.playerVehicle
    if (v) {
      game.hud.setSpeed(Math.abs(v.speed) * 2.23694)
      game.hud.setGear(v.speed < -0.4 ? 'R' : 'D')
    }
    const aiming = game.input.aim || game.input.fire
    game.hud.setCrosshair(p.inCar ? 'hidden' : aiming ? 'aim' : 'hidden')
    game.hud.setPrompt(null)
    if (p.inCar) {
      const veh = game.vehicles.playerVehicle
      if (veh && Math.abs(veh.speed) < 6) game.hud.setPrompt('EXIT VEHICLE', isTouch ? 'C' : 'F')
    } else {
      const near = game.vehicles.findNearest(p.pos, 4.1)
      if (near) game.hud.setPrompt('ENTER VEHICLE', isTouch ? 'C' : 'F')
    }
    const nearPolice = game.vehicles.nearestPoliceDist(p.pos)
    game.audio.update(dt, {
      driving: !!v,
      speed: v ? v.speed : 0,
      throttle: game.input.throttle > 0,
      wanted: game.police.wanted,
      sirenDist: Number.isFinite(nearPolice) ? nearPolice : null,
      paused: false
    })
  }
}

function updateMenu(dt) {
  // living city background
  if (game.player) {
    game.player.updateAnimation(dt, 0, false, false)
    game.player.group.position.copy(game.player.pos)
  }
  game.vehicles.update(dt)
  game.peds.update(dt)
  game.missions.startMarker.update(dt)
  updateCamera(dt)
  game.hud.update(dt)
}

function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(game.clock.getDelta(), 0.05)
  game.time += dt

  if (game.state === 'playing') {
    updatePlaying(dt)
  } else if (game.state === 'menu') {
    updateMenu(dt)
  } else if (game.state === 'wasted') {
    updateCamera(dt)
  }

  if (game.state !== 'paused') {
    game.effects.update(dt)
  }
  game.world.update(dt, game.player.pos)
  if (game.state !== 'playing' && game.state !== 'menu') {
    game.hud.update(dt)
  }

  if (composer) composer.render()
  else renderer.render(scene, camera)
}

/* ----------------------------------------------------------------- resize */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 2))
  renderer.setSize(w, h)
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio())
    composer.setSize(w, h)
  }
}
window.addEventListener('resize', onResize)
window.addEventListener('orientationchange', () => setTimeout(onResize, 250))

/* -------------------------------------------------------------- bootstrap */
game.vehicles.start()
game.peds.start()
requestAnimationFrame(() => {
  loadingFill.style.width = '100%'
  loadingBar.classList.add('done')
  playBtn.disabled = false
  playBtn.textContent = 'ENTER THE CITY'
  game.clock.getDelta()
  frame()
})
