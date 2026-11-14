import { BUILDINGS } from '../data.ts'
import { insideBuilding, TERRAIN_SEED } from './terrain-field.ts'
import { seededRandom } from './math.ts'

export interface RockPlacement { x: number; z: number; size: number; big: boolean; rotation: [number, number, number]; scale: [number, number, number]; shade: number }
// Shared by the renderer and the authored survey-corridor compiler.
export const ROCK_PLACEMENTS: RockPlacement[] = (() => {
  const random = seededRandom(TERRAIN_SEED + 73), placements: RockPlacement[] = []
  for (const [count, big] of [[550, false], [55, true]] as const) for (let i = 0; i < count; i++) {
    let x = 0, z = 0
    do { x = (random() - 0.5) * 71; z = (random() - 0.5) * 68 } while (Math.hypot(x, z) > 39 || insideBuilding(x, z, BUILDINGS, big ? 1.7 : 0.8) || (Math.abs(z - 3) < 0.8 && Math.abs(x) < 10))
    const size = big ? 0.35 + random() * 0.9 : 0.045 + random() * 0.29
    const rotation: [number, number, number] = [random() * 0.4, random() * Math.PI * 2, random() * 0.5]
    const scale: [number, number, number] = [size * (0.6 + random()), size, size * (0.7 + random() * 0.7)]
    placements.push({ x, z, size, big, rotation, scale, shade: 0.65 + random() * 0.5 })
  }
  return placements
})()
