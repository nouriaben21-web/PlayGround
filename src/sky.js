import * as THREE from 'three'
import { clamp, smoothstep, lerp } from './noise.js'

const SWATCH = {
  dayTop: new THREE.Color('#2b6cb0'),
  dayHorizon: new THREE.Color('#b9dcf2'),
  dayFog: new THREE.Color('#a8c9dd'),
  daySun: new THREE.Color('#fff1d6'),
  goldenTop: new THREE.Color('#33507e'),
  goldenHorizon: new THREE.Color('#f6a35c'),
  goldenFog: new THREE.Color('#d99a70'),
  goldenSun: new THREE.Color('#ffab5f'),
  duskTop: new THREE.Color('#151d3d'),
  duskHorizon: new THREE.Color('#a8524a'),
  duskFog: new THREE.Color('#6f4a57'),
  duskSun: new THREE.Color('#ff7a45'),
  nightTop: new THREE.Color('#040817'),
  nightHorizon: new THREE.Color('#0a1526'),
  nightFog: new THREE.Color('#08111e'),
  nightSun: new THREE.Color('#95b4ff'),
  cloudLitDay: new THREE.Color('#fdf7ee'),
  cloudShadeDay: new THREE.Color('#8fa6b8'),
  cloudLitGold: new THREE.Color('#ffcf9a'),
  cloudShadeGold: new THREE.Color('#6e6f8a'),
  cloudLitNight: new THREE.Color('#3c4c6a'),
  cloudShadeNight: new THREE.Color('#131c30')
}

function makeGlowTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,244,214,1)')
  g.addColorStop(0.18, 'rgba(255,224,158,0.65)')
  g.addColorStop(0.45, 'rgba(255,190,110,0.18)')
  g.addColorStop(1, 'rgba(255,180,90,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`

const skyFrag = /* glsl */ `
  uniform vec3 uTopColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uGroundColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uTime;
  uniform float uNight;
  uniform float uStorm;
  uniform float uFlash;
  uniform float uCloudAmount;
  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm5(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec2(11.7, -7.3);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, -1.0, 1.0);

    vec3 col = mix(uHorizonColor, uTopColor, pow(clamp(h, 0.0, 1.0), 0.52));
    col = mix(col, uGroundColor, smoothstep(0.0, -0.16, h));

    // sun halo + disc
    float sd = max(dot(dir, uSunDir), 0.0);
    float halo = pow(sd, 5.0) * 0.32 + pow(sd, 42.0) * 0.55 + pow(sd, 260.0) * 1.3;
    col += uSunColor * halo * mix(0.7, 0.32, uStorm);
    float disc = smoothstep(0.99935, 0.99972, sd);
    col += uSunColor * disc * 3.0 * (1.0 - uStorm * 0.7);

    // moon
    float md = max(dot(dir, uMoonDir), 0.0);
    float moonDisc = smoothstep(0.99955, 0.99978, md);
    float moonGlow = pow(md, 160.0) * 0.35;
    float craters = 0.82 + 0.18 * vnoise(dir.xz * 900.0);
    col += vec3(0.78, 0.86, 1.0) * (moonDisc * craters * 1.35 + moonGlow) * uNight;

    // stars
    if (uNight > 0.01 && h > 0.0) {
      vec3 cell = floor(dir * 460.0);
      float star = step(0.9968, hash31(cell));
      float twinkle = 0.55 + 0.45 * sin(uTime * 2.4 + hash31(cell + 7.0) * 40.0);
      float band = fbm5(dir.xz * 5.0 + 3.0) * 0.06;
      col += vec3(0.82, 0.9, 1.0) * (star * twinkle * 0.9 + band) * uNight * smoothstep(0.0, 0.22, h);
    }

    // clouds
    float cloudMask = smoothstep(0.015, 0.16, h) * (1.0 - smoothstep(0.88, 1.0, h) * 0.35);
    vec2 cuv = dir.xz / (h + 0.16);
    cuv = cuv * 0.42 + vec2(uTime * 0.0035, uTime * 0.0016);
    float c1 = fbm5(cuv * 1.25);
    float c2 = fbm5(cuv * 3.4 + 8.0 - vec2(uTime * 0.01, 0.0));
    float c = c1 * 0.78 + c2 * 0.32;
    float cover = smoothstep(0.46 - uCloudAmount * 0.14, 0.78, c) * cloudMask;
    float lit = clamp(dot(dir, uSunDir) * 0.5 + 0.55, 0.0, 1.0);
    vec3 cloudCol = mix(uCloudShade, uCloudLit, pow(lit, 1.7));
    cloudCol = mix(cloudCol, uHorizonColor, (1.0 - smoothstep(0.02, 0.42, h)) * 0.32);
    cloudCol *= mix(1.0, 0.55, uStorm);
    col = mix(col, cloudCol, cover * 0.82);

    // storm
    col = mix(col, vec3(0.25, 0.29, 0.34), uStorm * 0.52);
    col *= mix(1.0, 0.62, uStorm);
    col += vec3(0.72, 0.8, 1.0) * uFlash * (0.55 + cover * 0.9);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export class Sky {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    this.group.renderOrder = -10
    scene.add(this.group)

    this.uniforms = {
      uTopColor: { value: new THREE.Color('#2b6cb0') },
      uHorizonColor: { value: new THREE.Color('#b9dcf2') },
      uGroundColor: { value: new THREE.Color('#0b2230') },
      uSunColor: { value: new THREE.Color('#fff1d6') },
      uSunDir: { value: new THREE.Vector3(0.4, 0.4, -0.8) },
      uMoonDir: { value: new THREE.Vector3(-0.4, -0.4, 0.8) },
      uCloudLit: { value: new THREE.Color('#fdf7ee') },
      uCloudShade: { value: new THREE.Color('#8fa6b8') },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uCloudAmount: { value: 0.55 }
    }

    const geo = new THREE.SphereGeometry(4600, 40, 24)
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false
    })
    this.dome = new THREE.Mesh(geo, mat)
    this.dome.frustumCulled = false
    this.dome.renderOrder = -100
    this.group.add(this.dome)

    // warm glow sprite near the sun for a soft, filmic flare
    const glowMat = new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false
    })
    this.glow = new THREE.Sprite(glowMat)
    this.glow.scale.set(1400, 1400, 1)
    this.glow.renderOrder = -90
    this.glow.frustumCulled = false
    this.group.add(this.glow)
  }

  update(camera, palette, { time, sunDir, moonDir, storm, flash }) {
    this.group.position.copy(camera.position)
    this.uniforms.uTime.value = time
    this.uniforms.uSunDir.value.copy(sunDir)
    this.uniforms.uMoonDir.value.copy(moonDir)
    this.uniforms.uTopColor.value.copy(palette.top)
    this.uniforms.uHorizonColor.value.copy(palette.horizon)
    this.uniforms.uGroundColor.value.copy(palette.fog).multiplyScalar(0.35)
    this.uniforms.uSunColor.value.copy(palette.sun)
    this.uniforms.uCloudLit.value.copy(palette.cloudLit)
    this.uniforms.uCloudShade.value.copy(palette.cloudShade)
    this.uniforms.uNight.value = palette.night
    this.uniforms.uStorm.value = storm
    this.uniforms.uFlash.value = flash
    this.uniforms.uCloudAmount.value = palette.cloudAmount

    this.glow.position.copy(sunDir).multiplyScalar(3800)
    this.glow.material.opacity = (0.42 * (1 - storm * 0.6)) * smoothstep(-0.1, 0.08, sunDir.y)
    this.glow.material.color.copy(palette.sun)
    this.dome.visible = true
  }
}

const palette = {
  top: new THREE.Color(),
  horizon: new THREE.Color(),
  fog: new THREE.Color(),
  sun: new THREE.Color(),
  cloudLit: new THREE.Color(),
  cloudShade: new THREE.Color(),
  night: 0,
  sunIntensity: 0,
  ambientIntensity: 0,
  ambientSky: new THREE.Color(),
  ambientGround: new THREE.Color(),
  cloudAmount: 0.55,
  exposure: 1
}

export function computePalette(sunDir, storm) {
  const e = sunDir.y
  const dayT = smoothstep(0.08, 0.62, e)
  const nightT = smoothstep(0.02, -0.24, e)

  if (e >= 0) {
    palette.top.copy(SWATCH.goldenTop).lerp(SWATCH.dayTop, dayT)
    palette.horizon.copy(SWATCH.goldenHorizon).lerp(SWATCH.dayHorizon, dayT)
    palette.fog.copy(SWATCH.goldenFog).lerp(SWATCH.dayFog, dayT)
    palette.sun.copy(SWATCH.goldenSun).lerp(SWATCH.daySun, dayT)
    palette.cloudLit.copy(SWATCH.cloudLitGold).lerp(SWATCH.cloudLitDay, dayT)
    palette.cloudShade.copy(SWATCH.cloudShadeGold).lerp(SWATCH.cloudShadeDay, dayT)
  } else {
    palette.top.copy(SWATCH.duskTop).lerp(SWATCH.nightTop, nightT)
    palette.horizon.copy(SWATCH.duskHorizon).lerp(SWATCH.nightHorizon, nightT)
    palette.fog.copy(SWATCH.duskFog).lerp(SWATCH.nightFog, nightT)
    palette.sun.copy(SWATCH.duskSun).lerp(SWATCH.nightSun, nightT)
    palette.cloudLit.copy(SWATCH.cloudLitGold).lerp(SWATCH.cloudLitNight, nightT)
    palette.cloudShade.copy(SWATCH.cloudShadeGold).lerp(SWATCH.cloudShadeNight, nightT)
  }

  palette.night = nightT
  const daylight = smoothstep(-0.06, 0.35, e)
  palette.sunIntensity = lerp(0.0, 3.1, daylight) * (1 - storm * 0.72)
  palette.ambientIntensity = lerp(0.2, 0.62, daylight) * (1 - storm * 0.35)
  palette.ambientSky.copy(palette.horizon).lerp(palette.top, 0.4)
  palette.ambientGround.copy(palette.fog).multiplyScalar(0.55)
  palette.cloudAmount = clamp(0.55 + storm * 0.3, 0, 1)
  palette.exposure = lerp(1.05, 1.28, nightT) * lerp(1, 0.9, storm)

  if (storm > 0.01) {
    palette.top.lerp(new THREE.Color('#2a3038'), storm * 0.7)
    palette.horizon.lerp(new THREE.Color('#4b525a'), storm * 0.66)
    palette.fog.lerp(new THREE.Color('#3d454e'), storm * 0.62)
    palette.cloudLit.lerp(new THREE.Color('#7b8188'), storm * 0.7)
    palette.cloudShade.lerp(new THREE.Color('#363c44'), storm * 0.7)
  }

  // atmospheric tint toward the sun for low light
  if (e > -0.05 && e < 0.3) {
    palette.horizon.lerp(palette.sun, 0.08 * (1 - Math.abs(e - 0.08) / 0.22))
  }

  return palette
}

export function sunDirection(hour, out = new THREE.Vector3()) {
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI) * (Math.PI * 0.42)
  const azimuth = (hour / 24) * Math.PI * 2 - 0.58
  const ce = Math.cos(elevation)
  out.set(Math.sin(azimuth) * ce, Math.sin(elevation), Math.cos(azimuth) * ce)
  return out.normalize()
}
