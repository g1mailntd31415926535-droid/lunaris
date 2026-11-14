export function seededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function smoothstep(a: number, b: number, v: number) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function minimumJerk(t: number) {
  const u = Math.max(0, Math.min(1, t))
  return u * u * u * (10 + u * (-15 + 6 * u))
}

function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

export function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = smoothstep(0, 1, x - ix), fy = smoothstep(0, 1, y - iy), fz = smoothstep(0, 1, z - iz)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const a = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx)
  const b = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx)
  const c = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx)
  const d = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx)
  return lerp(lerp(a, b, fy), lerp(c, d, fy), fz) * 2 - 1
}

export function fbm3(x: number, y: number, z: number, octaves = 4) {
  let total = 0, amplitude = 0.55, scale = 1
  for (let i = 0; i < octaves; i++) {
    total += noise3(x * scale + 19.1, y * scale - 7.3, z * scale + 11.8) * amplitude
    scale *= 2.07; amplitude *= 0.5
  }
  return total
}
