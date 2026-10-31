import * as THREE from 'three'

const hairColors = [0x1b1512, 0x2c1f17, 0x4a3320, 0x111111, 0x6a4b2a, 0x3a2a1c]
const skins = [0x8d5524, 0xa8713c, 0xc68642, 0x6b4423, 0xe0ac69, 0x8a5a33]
const shirts = [0x1f6f8b, 0xb23b3b, 0x2f4f4f, 0xd9d4c7, 0x345c8a, 0x7a4f9e, 0x2c7a55, 0xc47a2a, 0x222429, 0xd8c36a]
const pants = [0x222b3a, 0x2d2d2d, 0x3f4a5a, 0x584a3a, 0x1c222b, 0x44525f]

function mat(color, rough = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 })
}

export function buildHuman(opts = {}) {
  const skin = opts.skin ?? skins[Math.floor(Math.random() * skins.length)]
  const shirt = opts.shirt ?? shirts[Math.floor(Math.random() * shirts.length)]
  const pant = opts.pants ?? pants[Math.floor(Math.random() * pants.length)]
  const hair = opts.hair ?? hairColors[Math.floor(Math.random() * hairColors.length)]
  const shoe = opts.shoe ?? 0x15171a
  const scale = opts.scale ?? (0.94 + Math.random() * 0.12)
  const sunglasses = opts.sunglasses ?? false
  const hat = opts.hat ?? false

  const group = new THREE.Group()
  const body = new THREE.Group()
  group.add(body)
  body.scale.setScalar(scale)

  const skinMat = mat(skin, 0.72)
  const shirtMat = mat(shirt, 0.88)
  const pantMat = mat(pant, 0.92)
  const shoeMat = mat(shoe, 0.5)
  const hairMat = mat(hair, 0.95)
  const darkMat = mat(0x101216, 0.5)

  // hips + belt
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.345, 0.19, 0.235), pantMat)
  hips.position.y = 0.965
  hips.castShadow = true
  body.add(hips)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.055, 0.25), darkMat)
  belt.position.y = 1.045
  body.add(belt)

  // rounded torso, broader at the chest
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.14, 4, 12), shirtMat)
  torso.scale.set(1, 1, 0.66)
  torso.position.y = 1.26
  torso.castShadow = true
  body.add(torso)
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), shirtMat)
  chest.scale.set(1.07, 0.76, 0.68)
  chest.position.y = 1.345
  body.add(chest)
  // shoulder caps
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.098, 10, 8), shirtMat)
    shoulder.position.set(s * 0.196, 1.435, 0)
    shoulder.scale.set(1, 0.92, 0.9)
    shoulder.castShadow = true
    body.add(shoulder)
  }
  // collar
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 5, 12), mat(0xffffff, 0.7))
  collar.rotation.x = Math.PI / 2
  collar.position.y = 1.525
  body.add(collar)

  // neck + head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.07, 0.1, 8), skinMat)
  neck.position.y = 1.55
  body.add(neck)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.144, 16, 14), skinMat)
  head.scale.set(0.9, 1.06, 0.94)
  head.position.y = 1.69
  head.castShadow = true
  body.add(head)
  // jaw / chin
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), skinMat)
  jaw.scale.set(0.92, 0.62, 0.82)
  jaw.position.set(0, 1.625, 0.035)
  body.add(jaw)
  // nose + ears
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.07, 5), skinMat)
  nose.rotation.x = Math.PI / 2
  nose.position.set(0, 1.685, 0.139)
  body.add(nose)
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), skinMat)
    ear.position.set(s * 0.131, 1.695, 0)
    ear.scale.set(0.6, 1, 0.9)
    body.add(ear)
  }

  // hair
  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.151, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.64), hairMat)
  hairMesh.position.y = 1.70
  hairMesh.scale.set(0.93, 1.02, 0.98)
  hairMesh.rotation.x = -0.1
  body.add(hairMesh)

  if (sunglasses) {
    const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.055, 0.028), darkMat)
    glasses.position.set(0, 1.715, 0.132)
    body.add(glasses)
  }
  if (hat) {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.015, 14), mat(opts.hatColor ?? 0x20242a, 0.8))
    brim.position.y = 1.79
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.1, 12), mat(opts.hatColor ?? 0x20242a, 0.8))
    top.position.y = 1.84
    body.add(brim, top)
  }

  // arms (upper + forearm + hand)
  const makeArm = (side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.232, 1.43, 0)
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.15, 3, 8), skinMat)
    upper.position.y = -0.145
    upper.castShadow = true
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.068, 0.15, 8), shirtMat)
    sleeve.position.y = -0.075
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.16, 3, 8), skinMat)
    forearm.position.y = -0.44
    forearm.castShadow = true
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.058, 9, 8), skinMat)
    hand.position.y = -0.61
    hand.scale.set(0.85, 1.15, 0.7)
    pivot.add(upper, sleeve, forearm, hand)
    body.add(pivot)
    return pivot
  }
  const armL = makeArm(-1)
  const armR = makeArm(1)

  // legs
  const makeLeg = (side) => {
    const pivot = new THREE.Group()
    pivot.position.set(side * 0.105, 0.88, 0)
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.084, 0.17, 3, 8), pantMat)
    thigh.position.y = -0.17
    thigh.castShadow = true
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.068, 0.2, 3, 8), pantMat)
    shin.position.y = -0.5
    shin.castShadow = true
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.18, 8), darkMat)
    ankle.position.y = -0.72
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.3), shoeMat)
    foot.position.set(0, -0.835, 0.055)
    foot.castShadow = true
    pivot.add(thigh, shin, ankle, foot)
    body.add(pivot)
    return pivot
  }
  const legL = makeLeg(-1)
  const legR = makeLeg(1)

  return { group, body, parts: { hips, torso, head, armL, armR, legL, legR, hairMesh } }
}

export function buildPistol() {
  const g = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.35, metalness: 0.85 })
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.8 })
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.26), metal)
  slide.position.set(0, 0.03, 0.06)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), metal)
  frame.position.set(0, -0.02, 0.02)
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), grip)
  handle.position.set(0, -0.1, -0.035)
  handle.rotation.x = 0.16
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.03, 0.2)
  g.add(slide, frame, handle, muzzle)
  g.userData.muzzle = muzzle
  return g
}

export function buildSMG() {
  const g = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.4, metalness: 0.8 })
  const polymer = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.8 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), metal)
  body.position.set(0, 0.02, 0.1)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8), metal)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.035, 0.33)
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.07), polymer)
  mag.position.set(0, -0.1, 0.09)
  mag.rotation.x = -0.08
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), polymer)
  grip.position.set(0, -0.08, -0.04)
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.18), polymer)
  stock.position.set(0, 0.01, -0.14)
  const muzzle = new THREE.Object3D()
  muzzle.position.set(0, 0.035, 0.42)
  g.add(body, barrel, mag, grip, stock, muzzle)
  g.userData.muzzle = muzzle
  return g
}
