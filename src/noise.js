// Deterministic noise / math helpers shared by terrain, props and effects.

export function mulberry32(seed) {
  let a = seed >>> 0
  return function random() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const smoothstepInv = (a, b, x) => smoothstep(b, a, x)
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt))
export const mod = (n, m) => ((n % m) + m) % m
export const TAU = Math.PI * 2

export function hash2(x, y) {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

export function valueNoise2(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = smooth(xf)
  const v = smooth(yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(fx, fy)
    norm += amp
    amp *= gain
    fx = fx * lacunarity + 11.7
    fy = fy * lacunarity - 7.3
  }
  return sum / norm
}

export function ridged2(x, y, octaves = 4) {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let fx = x
  let fy = y
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise2(fx, fy) * 2 - 1)
    sum += amp * n * n
    norm += amp
    amp *= 0.5
    fx = fx * 2.07 + 3.1
    fy = fy * 2.07 - 1.7
  }
  return sum / norm
}

export function angleLerp(a, b, t) {
  let d = mod(b - a + Math.PI, TAU) - Math.PI
  return a + d * t
}

export function randomRange(rng, a, b) {
  return a + rng() * (b - a)
}
