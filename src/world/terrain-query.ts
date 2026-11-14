import { CAP_RADIUS_M } from './space-config.ts'
import { surfacePointMeters } from './terrain-field.ts'

type Point = [number, number, number]
export interface SurfaceSample { point: Point; normal: Point; triangle: [number, number, number] }
let mesh: { positions: Float32Array; rings: number[]; segments: number } | null = null

/** Uses the exact CPU-owned vertex buffer sent to the renderer. No raycasts,
 * readbacks or approximate height-only placement on distant, coarser LOD. */
export function registerTerrainSurface(positions: Float32Array, rings: number[], segments: number) { mesh = { positions, rings, segments } }

function barycentric(x: number, z: number, a: [number, number], b: [number, number], c: [number, number]) {
  const denominator = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
  const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / denominator
  const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / denominator
  return [u, v, 1 - u - v]
}

export function sampleTerrain(x: number, z: number): SurfaceSample {
  if (!mesh || Math.hypot(x, z) > CAP_RADIUS_M * 0.997) return { point: surfacePointMeters(x, z), normal: [0, 1, 0], triangle: [-1, -1, -1] }
  const { rings, segments, positions } = mesh
  const angle = (Math.atan2(z, x) + Math.PI * 2) % (Math.PI * 2), step = Math.PI * 2 / segments
  const sector = Math.min(segments - 1, Math.floor(angle / step))
  const chord = Math.cos(step / 2) / Math.cos(angle - (sector + 0.5) * step)
  const radius = Math.hypot(x, z) / chord
  let low = 0, high = rings.length - 1
  while (low < high) { const mid = (low + high) >>> 1; if (rings[mid] < radius) low = mid + 1; else high = mid }
  const outer = low, stride = segments + 1
  const nominal = (ring: number, i: number): [number, number] => ring < 0 ? [0, 0] : [rings[ring] * Math.cos(i * step), rings[ring] * Math.sin(i * step)]
  const a = outer === 0 ? 0 : 1 + (outer - 1) * stride + sector
  const b = 1 + outer * stride + sector
  const c = outer === 0 ? b + 1 : a + 1, d = b + 1
  let ids: [number, number, number] = outer === 0 ? [0, c, b] : [a, c, b]
  let weights = barycentric(x, z, nominal(outer - 1, sector), nominal(outer === 0 ? outer : outer - 1, sector + 1), nominal(outer, sector))
  if (outer > 0 && weights.some((w) => w < -1e-7)) { ids = [b, c, d]; weights = barycentric(x, z, nominal(outer, sector), nominal(outer - 1, sector + 1), nominal(outer, sector + 1)) }
  const p: Point = [0, 0, 0]
  for (let i = 0; i < 3; i++) for (let axis = 0; axis < 3; axis++) p[axis] += positions[ids[i] * 3 + axis] * weights[i]
  const v = (index: number): Point => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]]
  const va = v(ids[0]), vb = v(ids[1]), vc = v(ids[2])
  const u = vb.map((value, i) => value - va[i]), w = vc.map((value, i) => value - va[i])
  const n: Point = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
  const length = Math.hypot(...n) || 1
  return { point: p, normal: n.map((value) => value / length) as Point, triangle: ids }
}

export function actualTerrainHeight(x: number, z: number) {
  let nx = x, nz = z, sample = sampleTerrain(nx, nz)
  for (let i = 0; i < 2; i++) { nx -= sample.point[0] - x; nz -= sample.point[2] - z; sample = sampleTerrain(nx, nz) }
  return sample.point[1]
}
