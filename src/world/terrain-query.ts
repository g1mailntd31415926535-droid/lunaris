import { demSample } from './dem.ts'
import type { DemSample } from './dem.ts'

type Point = [number, number, number]
export interface SurfaceSample { point: Point; normal: Point; valid: boolean; level: number }
const scratch: DemSample = { y: 0, nx: 0, ny: 1, nz: 0, level: 0 }

/**
 * Real-terrain sample at region-local (x, z) in metres, from the finest DEM level in memory.
 * `valid` is false on NoData / outside the circle; the returned height is then `fallbackY`
 * (the caller's last known height) and must not be treated as ground.
 */
export function sampleTerrain(x: number, z: number, fallbackY = 0): SurfaceSample {
  if (demSample(x, z, scratch)) return { point: [x, scratch.y, z], normal: [scratch.nx, scratch.ny, scratch.nz], valid: true, level: scratch.level }
  return { point: [x, fallbackY, z], normal: [0, 1, 0], valid: false, level: -1 }
}

/** Terrain height in metres, or −Infinity where there is no valid NASA data (so "stay above ground" checks do nothing there). */
export function actualTerrainHeight(x: number, z: number) {
  return demSample(x, z, scratch) ? scratch.y : Number.NEGATIVE_INFINITY
}
