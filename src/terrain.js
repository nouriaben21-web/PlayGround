import { fbm2, ridged2, smoothstep, clamp, lerp } from './noise.js'

// Pure terrain sampling shared by the mesh, prop placement, collision and the
// minimap. Keeping one function avoids floating islands and buried chests.
export function islandHeight(spec, x, z) {
  const R = spec.radius
  const H = spec.height
  const seed = spec.seed
  const r = Math.hypot(x, z)
  const ang = Math.atan2(z, x)
  const coast = fbm2(Math.cos(ang) * 3.2 + seed * 0.9, Math.sin(ang) * 3.2 - seed * 0.6, 3) - 0.5
  const rr = r / R + coast * 0.065

  const falloff = smoothstep(1.02, 0.02, rr)
  if (falloff <= 0) return -2.8 + (fbm2(x * 0.02 + seed, z * 0.02 - seed, 2) - 0.5) * 2

  const ridge = ridged2(x * 0.0155 + seed * 2.3, z * 0.0155 - seed * 1.7, 4)
  const shape = 0.42 + 0.58 * ridge
  let h = H * falloff * shape
  h += (fbm2(x * 0.042 + seed, z * 0.042 - seed, 3) - 0.5) * H * 0.17 * falloff
  h += (fbm2(x * 0.085 + seed * 3.1, z * 0.085 - seed * 2.3, 2) - 0.5) * 1.15 * falloff

  const beach = smoothstep(0.2, 3.1, h)
  h *= 0.58 + 0.42 * beach
  h -= 2.1 * (1 - falloff) + 0.55
  h += (fbm2(x * 0.21 + seed * 4, z * 0.21 - seed * 4, 2) - 0.5) * 0.72 * falloff
  return h
}

export function islandSlope(spec, x, z, e = 1.5) {
  const h = islandHeight(spec, x, z)
  const hx = islandHeight(spec, x + e, z)
  const hz = islandHeight(spec, x, z + e)
  return Math.max(Math.abs(hx - h), Math.abs(hz - h)) / e
}

export function findWaterline(spec, angle) {
  // binary search the shoreline radius on a given bearing
  let lo = spec.radius * 0.55
  let hi = spec.radius * 1.16
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    const h = islandHeight(spec, Math.cos(angle) * mid, Math.sin(angle) * mid)
    if (h > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export function averageWaterline(spec, samples = 72) {
  let sum = 0
  for (let i = 0; i < samples; i++) sum += findWaterline(spec, (i / samples) * Math.PI * 2)
  return sum / samples
}

const PALETTES = {
  tropical: {
    wet: [0.55, 0.47, 0.34],
    sand: [0.83, 0.73, 0.52],
    sandDark: [0.68, 0.58, 0.4],
    grass: [0.23, 0.4, 0.16],
    grassDark: [0.14, 0.27, 0.11],
    rock: [0.44, 0.41, 0.35],
    high: [0.33, 0.31, 0.28],
    volcanic: false
  },
  cliff: {
    wet: [0.5, 0.43, 0.32],
    sand: [0.74, 0.65, 0.48],
    sandDark: [0.58, 0.5, 0.36],
    grass: [0.3, 0.37, 0.19],
    grassDark: [0.18, 0.24, 0.12],
    rock: [0.5, 0.46, 0.4],
    high: [0.38, 0.36, 0.33],
    volcanic: false
  },
  ruins: {
    wet: [0.52, 0.45, 0.34],
    sand: [0.78, 0.7, 0.52],
    sandDark: [0.62, 0.54, 0.4],
    grass: [0.36, 0.42, 0.22],
    grassDark: [0.22, 0.27, 0.14],
    rock: [0.54, 0.5, 0.43],
    high: [0.4, 0.38, 0.34],
    volcanic: false
  },
  volcanic: {
    wet: [0.2, 0.19, 0.18],
    sand: [0.3, 0.28, 0.26],
    sandDark: [0.2, 0.19, 0.18],
    grass: [0.2, 0.26, 0.16],
    grassDark: [0.11, 0.15, 0.09],
    rock: [0.24, 0.23, 0.22],
    high: [0.14, 0.13, 0.13],
    volcanic: true
  }
}

export function islandColor(spec, x, z, h, slope, out) {
  const p = PALETTES[spec.palette] || PALETTES.tropical
  const H = spec.height
  let c
  if (h < 0.35) {
    c = p.wet
  } else if (h < 1.4) {
    c = p.sandDark
  } else if (h < 3.4) {
    c = p.sand
  } else if (h < 5.2) {
    const t = smoothstep(3.4, 5.2, h)
    c = mixColor(p.sand, p.grassDark, t)
  } else {
    const t = smoothstep(6, 16, h)
    c = mixColor(p.grassDark, p.grass, t)
  }

  const rockT = smoothstep(0.52, 1.05, slope)
  if (rockT > 0) c = mixColor(c, p.rock, rockT * 0.9)
  const highT = smoothstep(H * 0.62, H * 0.95, h)
  if (highT > 0) c = mixColor(c, p.high, highT * 0.85)

  const n = fbm2(x * 0.18 + spec.seed, z * 0.18 - spec.seed, 2) - 0.5
  const n2 = fbm2(x * 0.72 + spec.seed * 3, z * 0.72 - spec.seed * 2, 2) - 0.5
  const v = 1 + n * 0.22 + n2 * 0.1
  out[0] = clamp(c[0] * v, 0, 1)
  out[1] = clamp(c[1] * v, 0, 1)
  out[2] = clamp(c[2] * v, 0, 1)
  return out
}

function mixColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export const ISLAND_SPECS = [
  { id: 'lighthouse', name: 'جزيرة النور', short: 'النور', x: 0, z: -250, radius: 214, height: 47, seed: 11, type: 'home', palette: 'tropical' },
  { id: 'coral', name: 'خليج المرجان', short: 'المرجان', x: 430, z: -880, radius: 172, height: 27, seed: 23, type: 'tropical', palette: 'tropical' },
  { id: 'falcons', name: 'جزيرة الصقور', short: 'الصقور', x: -760, z: -540, radius: 202, height: 61, seed: 37, type: 'cliff', palette: 'cliff' },
  { id: 'oldharbor', name: 'المرسى القديم', short: 'المرسى', x: -1090, z: 270, radius: 184, height: 34, seed: 49, type: 'ruins', palette: 'ruins' },
  { id: 'mist', name: 'جزيرة الضباب', short: 'الضباب', x: -430, z: 990, radius: 232, height: 64, seed: 61, type: 'volcanic', palette: 'volcanic' },
  { id: 'palms', name: 'رأس النخيل', short: 'النخيل', x: 730, z: 760, radius: 194, height: 35, seed: 73, type: 'tropical', palette: 'tropical' },
  { id: 'stars', name: 'أرخبيل النجوم', short: 'النجوم', x: 1190, z: -260, radius: 164, height: 29, seed: 85, type: 'tropical', palette: 'tropical' },
  { id: 'sun', name: 'جزيرة الشمس', short: 'الشمس', x: 630, z: -1330, radius: 242, height: 54, seed: 97, type: 'cliff', palette: 'cliff' }
]
