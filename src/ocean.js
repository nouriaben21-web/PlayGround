import * as THREE from 'three'

// Wave train. The same constants are mirrored in JS so the hull floats on the
// exact surface the shader draws.
const WAVES = [
  { dx: 0.94, dz: 0.34, k: (Math.PI * 2) / 118, amp: 0.52, omega: 0.40 },
  { dx: -0.42, dz: 0.91, k: (Math.PI * 2) / 71, amp: 0.34, omega: 0.53 },
  { dx: 0.72, dz: -0.69, k: (Math.PI * 2) / 43, amp: 0.19, omega: 0.71 },
  { dx: -0.97, dz: -0.24, k: (Math.PI * 2) / 26, amp: 0.085, omega: 0.95 }
]

function makeGeometry(rings = 150, segments = 176) {
  const positions = []
  const indices = []
  // center vertex
  positions.push(0, 0, 0)
  const radii = []
  const maxR = 4600
  const minR = 1.4
  for (let i = 0; i <= rings; i++) {
    const t = i / rings
    radii.push(minR * Math.pow(maxR / minR, t))
  }
  for (let i = 0; i < rings; i++) {
    const r = radii[i]
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2
      positions.push(Math.cos(a) * r, 0, Math.sin(a) * r)
    }
  }
  // inner fan
  for (let j = 0; j < segments; j++) {
    const a = 1 + j
    const b = 1 + ((j + 1) % segments)
    indices.push(0, b, a)
  }
  // rings
  for (let i = 0; i < rings - 1; i++) {
    const row = 1 + i * segments
    const next = row + segments
    for (let j = 0; j < segments; j++) {
      const a = row + j
      const b = row + ((j + 1) % segments)
      const c = next + j
      const d = next + ((j + 1) % segments)
      indices.push(a, b, c)
      indices.push(b, d, c)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), maxR * 1.2)
  return geo
}

const vert = /* glsl */ `
  uniform float uTime;
  uniform float uStorm;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vCrest;

  float waveHeight(vec2 p, float t) {
    float amp = 1.0 + uStorm * 1.15;
    float h = 0.0;
    h += 0.52 * amp * sin(dot(p, vec2(0.94, 0.34)) * 0.053239 - t * 0.40);
    h += 0.34 * amp * sin(dot(p, vec2(-0.42, 0.91)) * 0.088493 - t * 0.53 + 0.9);
    h += 0.19 * amp * sin(dot(p, vec2(0.72, -0.69)) * 0.146088 - t * 0.71 + 2.2);
    h += 0.085 * amp * sin(dot(p, vec2(-0.97, -0.24)) * 0.241661 - t * 0.95 + 4.1);
    return h;
  }

  void main() {
    vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
    float h = waveHeight(wp.xz, uTime);
    float e = 3.2;
    float hx = waveHeight(wp.xz + vec2(e, 0.0), uTime);
    float hz = waveHeight(wp.xz + vec2(0.0, e), uTime);
    wp.y += h;

    vec3 n = normalize(vec3(h - hx, e, h - hz));
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    vWorldPos = wp;
    vNormal = n;
    vHeight = h;
    vCrest = (h - waveHeight(wp.xz + vec2(0.0), uTime)) / max(abs(h), 0.001);
    gl_Position = projectionMatrix * mv;
  }
`

const frag = /* glsl */ `
  uniform float uTime;
  uniform float uFogDensity;
  uniform float uStorm;
  uniform vec3 uCamera;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uHorizon;
  uniform vec3 uTop;
  uniform vec3 uFogColor;
  uniform vec4 uIslands[8];
  uniform int uIslandCount;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vHeight;
  varying float vCrest;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
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
  float fbm3(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      s += a * vnoise(p);
      p = p * 2.07 + vec2(5.2, -3.7);
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec2 p = vWorldPos.xz;
    vec3 view = uCamera - vWorldPos;
    float dist = length(view);
    vec3 V = view / dist;
    vec3 N = normalize(vNormal);

    // fine ripples, faded with distance to avoid shimmering
    float rFade = 1.0 - smoothstep(120.0, 900.0, dist);
    vec2 q1 = p * 0.55 + vec2(uTime * 0.22, -uTime * 0.17);
    float n1 = vnoise(q1);
    float nx1 = vnoise(q1 + vec2(0.34, 0.0));
    float nz1 = vnoise(q1 + vec2(0.0, 0.34));
    vec2 q2 = p * 1.75 - vec2(uTime * 0.36, uTime * 0.28);
    float n2 = vnoise(q2);
    float nx2 = vnoise(q2 + vec2(0.28, 0.0));
    float nz2 = vnoise(q2 + vec2(0.0, 0.28));
    N = normalize(N + vec3(n1 - nx1, 0.0, n1 - nz1) * 0.85 * rFade + vec3(n2 - nx2, 0.0, n2 - nz2) * 0.35 * rFade);

    // shoreline + lagoon tint
    float shallow = 0.0;
    float shore = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= uIslandCount) break;
      vec4 isl = uIslands[i];
      float d = length(p - isl.xy) - isl.z;
      shallow = max(shallow, 1.0 - smoothstep(0.0, 110.0, max(d, 0.0)));
      if (d > -14.0) {
        shore = max(shore, 1.0 - smoothstep(-2.0, 26.0, d));
      }
    }

    vec3 water = mix(uDeep, uShallow, shallow * 0.9);
    // subtle depth variation
    water *= 0.94 + 0.06 * fbm3(p * 0.012 + 4.0);

    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
    fres = mix(0.035, 1.0, fres);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uHorizon, uTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
    float sd = max(dot(R, uSunDir), 0.0);
    float sunUp = smoothstep(-0.05, 0.12, uSunDir.y);
    vec3 spec = uSunColor * (pow(sd, 780.0) * 3.4 + pow(sd, 60.0) * 0.22) * sunUp;
    // glitter
    float sparkle = smoothstep(0.84, 0.99, fbm3(p * 1.6 + uTime * 0.35));
    spec += uSunColor * sparkle * pow(sd, 42.0) * 0.12 * sunUp;

    vec3 col = mix(water, sky, fres * 0.82);
    col += spec;

    // wave crest foam
    float crest = smoothstep(0.95, 1.55, vHeight * (1.0 + uStorm * 1.7));
    float foamNoise = fbm3(p * 0.42 + vec2(uTime * 0.13, -uTime * 0.09));
    float foam = crest * smoothstep(0.52, 0.86, foamNoise) * 0.3;

    // surf washing on the beaches
    float stripes = 0.5 + 0.5 * sin(vWorldPos.z * 0.32 + vWorldPos.x * 0.18 - uTime * 1.6);
    float surf = shore * smoothstep(0.42, 0.92, fbm3(p * 0.3 + uTime * 0.08)) * (0.45 + 0.55 * stripes);
    foam = clamp(foam + shore * 0.2 + surf * 0.32, 0.0, 0.72);

    vec3 foamCol = mix(vec3(0.72, 0.83, 0.86), vec3(1.0), 0.6);
    col = mix(col, foamCol, foam * 0.9);

    // storm dims and desaturates the sea
    col = mix(col, vec3(0.12, 0.19, 0.23), uStorm * 0.45);
    col *= mix(1.0, 0.75, uStorm);

    // atmospheric fog
    float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    col = mix(col, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export class Ocean {
  constructor(scene, islandSlots = 8, lowQuality = false) {
    this.scene = scene
    this.time = 0
    this.storm = 0
    this.uniforms = {
      uTime: { value: 0 },
      uStorm: { value: 0 },
      uFogDensity: { value: 0.00062 },
      uCamera: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8) },
      uSunColor: { value: new THREE.Color('#fff1d6') },
      uDeep: { value: new THREE.Color('#0a4f66') },
      uShallow: { value: new THREE.Color('#2ec4b6') },
      uHorizon: { value: new THREE.Color('#b9dcf2') },
      uTop: { value: new THREE.Color('#2b6cb0') },
      uFogColor: { value: new THREE.Color('#a8c9dd') },
      uIslands: { value: Array.from({ length: islandSlots }, () => new THREE.Vector4(0, 0, 100, 0)) },
      uIslandCount: { value: 0 }
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: vert,
      fragmentShader: frag,
      fog: false
    })
    this.mesh = new THREE.Mesh(lowQuality ? makeGeometry(84, 116) : makeGeometry(), mat)
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = true
    this.mesh.renderOrder = 1
    scene.add(this.mesh)

    this._offset = new THREE.Vector2()
  }

  setIslands(islands) {
    const list = this.uniforms.uIslands.value
    for (let i = 0; i < list.length; i++) {
      const isl = islands[i]
      if (isl) list[i].set(isl.position.x, isl.position.z, isl.waterRadius, isl.height)
      else list[i].set(0, 0, 0, 0)
    }
    this.uniforms.uIslandCount.value = Math.min(list.length, islands.length)
  }

  update(dt, camera, palette, sunDir, storm) {
    this.time += dt * (1 + storm * 0.35)
    this.storm = storm
    const u = this.uniforms
    u.uTime.value = this.time
    u.uStorm.value = storm
    u.uCamera.value.copy(camera.position)
    u.uSunDir.value.copy(sunDir)
    u.uSunColor.value.copy(palette.sun)
    u.uHorizon.value.copy(palette.horizon)
    u.uTop.value.copy(palette.top)
    u.uFogColor.value.copy(palette.fog)
    u.uDeep.value.setHex(0x0a4f66).lerp(palette.top, 0.12).multiplyScalar(1 - palette.night * 0.32)
    u.uShallow.value.setHex(0x2ec4b6).lerp(palette.sun, 0.1).multiplyScalar(1 - palette.night * 0.42)
    u.uFogDensity.value = 0.00062 + storm * 0.00125 + palette.night * 0.00012

    this.mesh.position.set(camera.position.x, 0, camera.position.z)
  }

  heightAt(x, z, time = this.time) {
    const amp = 1 + this.storm * 1.15
    let h = 0
    h += 0.52 * amp * Math.sin((x * 0.94 + z * 0.34) * 0.053239 - time * 0.40)
    h += 0.34 * amp * Math.sin((x * -0.42 + z * 0.91) * 0.088493 - time * 0.53 + 0.9)
    h += 0.19 * amp * Math.sin((x * 0.72 + z * -0.69) * 0.146088 - time * 0.71 + 2.2)
    h += 0.085 * amp * Math.sin((x * -0.97 + z * -0.24) * 0.241661 - time * 0.95 + 4.1)
    return h
  }

  normalAt(x, z, out = new THREE.Vector3()) {
    const e = 3.2
    const h = this.heightAt(x, z)
    const hx = this.heightAt(x + e, z)
    const hz = this.heightAt(x, z + e)
    return out.set(h - hx, e, h - hz).normalize()
  }
}

export { WAVES }
