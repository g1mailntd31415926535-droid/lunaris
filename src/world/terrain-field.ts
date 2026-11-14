import { minimumJerk } from './math.ts'
import { colonyHeight } from './dem.ts'
export { minimumJerk, seededRandom, smoothstep } from './math.ts'

// Task 02: the formula-generated craters, peaks and ripples that used to live here are gone.
// Every height now comes from the NASA LOLA 5 m DEM (see dem.ts). There is no procedural
// fallback: where there is no NASA data, there is no ground.
export const TERRAIN_SEED = 26061114

/**
 * Height of the real terrain at COLONY coordinates (x, z), measured from the colony plane
 * (the least-squares plane of the DEM around BASE that the authored base sits on).
 * Buildings, paths, rocks and crew use this so they rest on the real surface.
 */
export function heightAt(x: number, z: number) {
  return colonyHeight(x, z)
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
