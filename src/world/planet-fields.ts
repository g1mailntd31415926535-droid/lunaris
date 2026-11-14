import { fbm3, seededRandom, smoothstep } from './math.ts'
import { MOON_RADIUS_M } from './space-config.ts'

export interface LunarCrater { center: [number, number, number]; radius: number; depth: number; supportCos: number; inverseChordRadius: number }

// Seeded, FICTIONAL geology for the far-view Moon globe only (orbit view). It is not NASA data and
// it is never used inside the 50 km hole around Artemis: there the only terrain is the LOLA DEM
// (dem.ts). The regional/colony procedural relief that used to live here was removed in Task 02.
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
