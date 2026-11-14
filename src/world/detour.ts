// C3.1 detour check on the real NASA DEM. A detour is offered only if every 2 m sample of it lies on valid
// 5–10 m DEM data (no NoData) with a DEM slope at or under the route limit (15°). Otherwise it is not offered.
import * as THREE from 'three'
import { demSample, routeSlopeLimitDeg } from './dem'
import type { DemSample } from './dem'
import { surveyLegs } from './rover-plan'

const HALF = 40   // the boulder patch is bypassed over 80 m of the route

export function checkDetour(zone: string, fraction: number): { detourM: number | null; reason?: string } {
  const leg = surveyLegs().find((l) => l.site.id === zone)
  if (!leg) return { detourM: null, reason: 'Không có tuyến cho khu này.' }
  const centre = leg.curve.getPointAt(Math.min(1, Math.max(0, fraction)), new THREE.Vector3())
  const tangent = leg.curve.getTangentAt(Math.min(1, Math.max(0, fraction)), new THREE.Vector3()).setY(0).normalize()
  const normal = new THREE.Vector3(-tangent.z, 0, tangent.x)
  const limit = routeSlopeLimitDeg(), sample: DemSample = { y: 0, nx: 0, ny: 1, nz: 0, level: 0 }
  let coarse = false
  for (const offset of [15, 25, 35]) for (const side of [1, -1]) {
    let ok = true, length = 0, prev: THREE.Vector3 | null = null
    for (let s = -HALF; s <= HALF && ok; s += 2) {
      const lateral = offset * Math.sin(Math.PI * (s + HALF) / (2 * HALF))
      const p = centre.clone().addScaledVector(tangent, s).addScaledVector(normal, side * lateral)
      if (!demSample(p.x, p.z, sample)) { ok = false; break }
      if (sample.level > 1) { ok = false; coarse = true; break }
      if (Math.acos(Math.min(1, sample.ny)) * 180 / Math.PI > limit) { ok = false; break }
      p.y = sample.y
      if (prev) length += p.distanceTo(prev)
      prev = p
    }
    if (ok) return { detourM: Math.max(1, Math.round(length - 2 * HALF)) }
  }
  return { detourM: null, reason: coarse ? 'Dữ liệu 5 m quanh rover chưa tải xong, chưa kiểm tra được đường vòng.' : `Mọi đường vòng thử (lệch 15–35 m) đều có chỗ dốc hơn ${limit}° hoặc thiếu dữ liệu NASA.` }
}
