import * as THREE from 'three'

const pointVert = /* glsl */ `
  attribute float aLife;
  attribute float aSize;
  attribute float aSeed;
  varying float vLife;
  varying float vSeed;
  uniform float uPixelScale;
  void main() {
    vLife = aLife;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uPixelScale / max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const pointFrag = /* glsl */ `
  varying float vLife;
  varying float vSeed;
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uOpacity;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.08, d);
    float core = smoothstep(0.32, 0.0, d);
    vec3 col = mix(uColor, uColor2, core * 0.55 + vSeed * 0.2);
    float a = soft * vLife * uOpacity;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`

export class ParticleField {
  constructor(scene, {
    count = 520,
    color = '#eaf6f7',
    color2 = '#ffffff',
    opacity = 0.8,
    blending = THREE.NormalBlending,
    pixelScale = 220
  } = {}) {
    this.count = count
    this.cursor = 0
    this.particles = new Array(count)
    for (let i = 0; i < count; i++) {
      this.particles[i] = {
        active: false,
        x: 0, y: -999, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1, drag: 1, gravity: 0, wave: 0
      }
    }
    this.positions = new Float32Array(count * 3)
    this.life = new Float32Array(count)
    this.sizes = new Float32Array(count)
    this.seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      this.positions[i * 3 + 1] = -999
      this.sizes[i] = 1
      this.seeds[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    this.uniforms = {
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color2) },
      uOpacity: { value: opacity },
      uPixelScale: { value: pixelScale }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: pointVert,
      fragmentShader: pointFrag,
      transparent: true,
      depthWrite: false,
      blending,
      fog: false
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    scene.add(this.points)
    this.geo = geo
  }

  spawn(x, y, z, vx, vy, vz, maxLife, size, { drag = 0.9, gravity = 0, wave = 0 } = {}) {
    const p = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.count
    p.active = true
    p.x = x; p.y = y; p.z = z
    p.vx = vx; p.vy = vy; p.vz = vz
    p.life = maxLife
    p.maxLife = maxLife
    p.size = size
    p.drag = drag
    p.gravity = gravity
    p.wave = wave
    return p
  }

  update(dt, time, ocean) {
    const pos = this.positions
    const lifeAttr = this.life
    const sizeAttr = this.sizes
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i]
      if (!p.active) continue
      p.life -= dt
      if (p.life <= 0) {
        p.active = false
        pos[i * 3 + 1] = -999
        lifeAttr[i] = 0
        continue
      }
      const dragK = Math.pow(p.drag, dt * 60)
      p.vx *= dragK
      p.vz *= dragK
      p.vy = p.vy * dragK - p.gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (ocean && p.y < ocean.heightAt(p.x, p.z, time) + 0.05) {
        p.y = ocean.heightAt(p.x, p.z, time) + 0.05
        p.vy *= 0.3
      }
      const l = p.life / p.maxLife
      lifeAttr[i] = l
      sizeAttr[i] = p.size * (0.35 + 0.65 * Math.sqrt(l))
      pos[i * 3] = p.x
      pos[i * 3 + 1] = p.y
      pos[i * 3 + 2] = p.z
    }
    this.geo.attributes.position.needsUpdate = true
    this.geo.attributes.aLife.needsUpdate = true
    this.geo.attributes.aSize.needsUpdate = true
  }
}

export function makeRadialTexture(size = 128, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(1, outer)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
