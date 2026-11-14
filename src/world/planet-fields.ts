import { fbm3, seededRandom, smoothstep } from './math.ts'
import { CAP_RADIUS_M, MOON_RADIUS_M } from './space-config.ts'

export interface LunarCrater { center: [number, number, number]; radius: number; depth: number; supportCos: number; inverseChordRadius: number }

// Shared, seeded geological causes. Meshes, baked textures and diagnostics all
// consume these records. They are fictional lunar geology, not NASA datasets.
export const MOON_CRATERS: LunarCrater[] = (() => {
  const random = seededRandom(1969072026)
  return Array.from({ length: 180 }, (_, i) => {
    const phi = random() * Math.PI * 2, y = random() * 2 - 1, r = Math.sqrt(1 - y * y)
    const radius = i < 12 ? 0.085 + random() * 0.085 : 0.008 + random() ** 1.6 * 0.065
    return { center: [Math.cos(phi) * r, y, Math.sin(phi) * r], radius, depth: radius * MOON_RADIUS_M * (0.035 + random() * 0.035), supportCos: Math.cos(radius * 1.65), inverseChordRadius: 1 / (2 * Math.sin(radius / 2)) }
  })
})()

export function moonHeightMeters(nx: number, ny: number, nz: number) {
  const distanceFromArtemis = MOON_RADIUS_M * Math.sqrt(Math.max(0, 2 * (1 - ny)))
  if (distanceFromArtemis <= 15_000) return 0
  let height = fbm3(nx * 4.3, ny * 4.3, nz * 4.3) * 2350 + fbm3(nx * 17.7, ny * 17.7, nz * 17.7, 3) * 430
  for (const crater of MOON_CRATERS) {
    const dot = nx * crater.center[0] + ny * crater.center[1] + nz * crater.center[2]
    if (dot < crater.supportCos) continue
    const q = Math.sqrt(Math.max(0, 2 * (1 - dot))) * crater.inverseChordRadius
    const bowl = -crater.depth * (1 - smoothstep(0.08, 1, q))
    const rim = crater.depth * 0.43 * Math.exp(-(((q - 0.98) / 0.145) ** 2))
    const peak = crater.radius > 0.07 ? crater.depth * 0.10 * Math.exp(-q * q / 0.018) : 0
    height += bowl + rim + peak
  }
  return height * smoothstep(15_000, 50_000, distanceFromArtemis)
}

export const REGIONAL_CRATERS = [
  [-420, -370, 190, 45], [610, 230, 265, 68], [-260, 540, 180, 42],
  [-5200, -7400, 2400, 350], [4800, 6400, 1700, 280], [11000, -4200, 3300, 510],
  [-14500, 3800, 2700, 390], [21000, 18000, 5300, 920], [-22000, -19000, 4800, 840],
]

export function regionalHeightMeters(x: number, z: number) {
  const radius = Math.hypot(x, z)
  if (radius > CAP_RADIUS_M) return 0
  if (radius < 100) return 0
  let height = (fbm3(x / 2300, 3.7, z / 2300, 4) * 105 + fbm3(x / 230, 11.1, z / 230, 3) * 17) * smoothstep(100, 450, radius)
  for (const [cx, cz, r, depth] of REGIONAL_CRATERS) {
    const q = Math.hypot(x - cx, z - cz) / r
    if (q > 1.65) continue
    height += -depth * (1 - smoothstep(0.15, 1.0, q)) + depth * 0.48 * Math.exp(-(((q - 1) / 0.12) ** 2))
  }
  return height * (1 - smoothstep(CAP_RADIUS_M * 0.75, CAP_RADIUS_M, radius))
}

export function directionAtTangent(x: number, z: number): [number, number, number] {
  const rr = Math.min(MOON_RADIUS_M ** 2 * 0.99, x * x + z * z)
  return [x / MOON_RADIUS_M, Math.sqrt(MOON_RADIUS_M ** 2 - rr) / MOON_RADIUS_M, z / MOON_RADIUS_M]
}
