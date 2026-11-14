import { minimumJerk, smoothstep } from './math.ts'
import { directionAtTangent, moonHeightMeters, regionalHeightMeters } from './planet-fields.ts'
import { MOON_RADIUS_M } from './space-config.ts'
export { minimumJerk, seededRandom, smoothstep } from './math.ts'

// A single surface function supports the cap mesh, colony, actors and camera.
// Inputs/outputs are metres in the fixed south-pole tangent frame.
export const TERRAIN_SEED = 26061114
export const CRATERS = [
  { x: -15.8, z: -8.7, radius: 3.8, depth: 1.9 },
  { x: 14.8, z: 13.6, radius: 4.6, depth: 2.4 },
  { x: -14.8, z: 13.8, radius: 4.1, depth: 1.9 },
  { x: 7.8, z: -19.7, radius: 4.2, depth: 2.2 },
  { x: 23.5, z: -7.8, radius: 3.8, depth: 1.8 },
  { x: -5.8, z: 20.8, radius: 3.3, depth: 1.5 },
  { x: -28, z: 1.5, radius: 5.2, depth: 2.8 },
  { x: 27.5, z: 22, radius: 5.3, depth: 2.7 },
  { x: -22, z: -26, radius: 5.5, depth: 2.4 },
  { x: 3, z: 30.8, radius: 3.4, depth: 1.8 },
]

const PEAKS = [
  [-20, -17.5, 6.7, 4.2], [-15, -20, 7.4, 3.7], [-24.5, -13, 4.6, 3.2],
  [18.8, -15.5, 5.9, 4.6], [23, -13, 7.0, 3.8], [27, -1.5, 4.9, 3.4],
  [-22, 6, 4.8, 3.7], [-23, 19, 5.9, 4.1], [19.5, 23, 4.5, 3.3],
  [-7, -28.5, 4.4, 5.3], [4, -30, 5.7, 4.6], [30, 8, 5.2, 4.6],
]
export const LUNAR_PEAKS = PEAKS

export function colonyReliefAt(x: number, z: number) {
  const r = Math.hypot(x, z)
  if (r >= 78) return 0
  const quiet = 1 - smoothstep(10, 18, r)
  let h = (Math.sin(x * 1.47 + z * 0.62) * Math.cos(z * 1.65) * 0.18 + Math.sin(x * 0.26 - z * 0.43) * 0.4) * (1 - quiet * 0.95)
  for (const crater of CRATERS) {
    const d = Math.hypot(x - crater.x, z - crater.z) / crater.radius
    if (d < 1.7) {
      const rim = Math.exp(-(((d - 1) / 0.13) ** 2)) * crater.depth * 0.52
      const bowl = -crater.depth * (1 - smoothstep(0.18, 1.0, d))
      h += rim + bowl
    }
  }
  for (const [px, pz, height, width] of PEAKS) {
    const d = Math.hypot((x - px) * 1.1, z - pz) / width
    const ridge = 1 + Math.sin(x * 2.9 + z * 0.7) * 0.075 + Math.cos(z * 2.3) * 0.08
    h += Math.max(0, 1 - d) ** 1.4 * height * ridge
  }
  return h * (1 - smoothstep(44, 78, r))
}

export function surfacePointMeters(x: number, z: number): [number, number, number] {
  const n = directionAtTangent(x, z)
  const height = moonHeightMeters(...n) + regionalHeightMeters(x, z) + colonyReliefAt(x, z)
  const radius = MOON_RADIUS_M + height
  // Subtract the large origin in CPU double precision BEFORE f32 GPU upload.
  return [n[0] * radius, n[1] * radius - MOON_RADIUS_M, n[2] * radius]
}

export function heightAt(x: number, z: number) {
  return surfacePointMeters(x, z)[1]
}

export function insideBuilding(x: number, z: number, plan: readonly { position: readonly number[]; radius: number }[], margin = 0.5) {
  return plan.some(({ position, radius }) => Math.hypot(x - position[0], z - position[2]) < radius + margin)
}

// A closed-form route sampler. No pathfinding, collision solver, or actor AI.
export function sampleRoute(points: readonly (readonly [number, number])[], elapsed: number, duration: number) {
  const progress = ((elapsed % duration) + duration) % duration / duration
  const distance = progress * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(distance))
  const t = minimumJerk(distance - i)
  return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t] as [number, number]
}
