import { BUILDINGS } from '../data.ts'
import { insideBuilding, TERRAIN_SEED } from './terrain-field.ts'
import { seededRandom } from './math.ts'

export interface RockPlacement { x: number; z: number; size: number; big: boolean; rotation: [number, number, number]; scale: [number, number, number]; shade: number }

/**
 * The worked area of the base (colony metres): no decorative rocks inside `inner`, a natural thinning out to `outer`,
 * untouched scatter beyond. Centre ≈ middle of the eight buildings, paths, lamps, cargo and landing pad.
 */
export const BASE_CLEARING = { center: [-0.5, 2.2] as const, inner: 19, outer: 26 }
const SCATTER_RADIUS = 50
// Same density as before outside the clearing (605 rocks in r ≤ 39 m), spread over r ≤ 50 m.
// Sparse on request (15/11/2026): about half the old density, and only medium 'big' rocks (no boulders).
const COUNTS = { small: 420, big: 26 }

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** True where a decorative rock may stand (outside buildings, thinned towards the base, never in the clearing). */
export function rockAllowed(x: number, z: number, big: boolean, keep: number) {
  const r = Math.hypot(x - BASE_CLEARING.center[0], z - BASE_CLEARING.center[1])
  if (r > SCATTER_RADIUS) return false
  if (keep > smooth(BASE_CLEARING.inner, BASE_CLEARING.outer, r)) return false
  return !insideBuilding(x, z, BUILDINGS, big ? 3.5 : 2.5)
}

// Seeded procedural scatter (decoration only: no collision, no terrain). Shared by the renderer and the tests.
export const ROCK_PLACEMENTS: RockPlacement[] = (() => {
  const random = seededRandom(TERRAIN_SEED + 73), placements: RockPlacement[] = []
  for (const [count, big] of [[COUNTS.small, false], [COUNTS.big, true]] as const) for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * 2 * SCATTER_RADIUS, z = (random() - 0.5) * 2 * SCATTER_RADIUS, keep = random()
    const size = big ? 0.3 + random() * 0.35 : 0.045 + random() * 0.22
    const rotation: [number, number, number] = [random() * 0.4, random() * Math.PI * 2, random() * 0.5]
    const scale: [number, number, number] = [size * (0.6 + random()), size, size * (0.7 + random() * 0.7)]
    const shade = 0.65 + random() * 0.5
    if (rockAllowed(x, z, big, keep)) placements.push({ x, z, size, big, rotation, scale, shade })
  }
  return placements
})()
export const SMALL_ROCKS = ROCK_PLACEMENTS.filter((r) => !r.big)
export const BIG_ROCKS = ROCK_PLACEMENTS.filter((r) => r.big)
