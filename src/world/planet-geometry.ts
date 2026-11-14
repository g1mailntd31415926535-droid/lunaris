import * as THREE from 'three'
import { METRE, MOON_RADIUS_M } from './space-config.ts'
import { MOON_R, bodyHeight, bodyToStereo, sceneFromBody } from './lunar-frame.ts'

// Far-view Moon globe from NASA LOLA: LDEM_4 (0.25°) everywhere, the 480 m polar grid south of ≈ 79.5°S.
// Body-fixed latitude/longitude are rotated into the scene with SCENE_FROM_BODY, so Artemis sits on +Y as before
// and the polar LOLA terrain (RegionalTerrain) lines up with this globe in position and datum.
// Before the data arrives (or if it fails) the globe is the plain 1737.4 km sphere: smooth, never invented relief.

/** Latitude rows (deg): 0.5° from the south pole to 72°S, where the polar terrain meets the globe, 1.5° beyond. */
function latitudes() {
  const rows: number[] = []
  for (let lat = -90; lat < -72; lat += 0.5) rows.push(lat)
  for (let lat = -72; lat <= 90.0001; lat += 1.5) rows.push(Math.min(90, lat))
  return rows
}

export function buildMoonGlobe(baseHeight: number) {
  const lats = latitudes(), width = 256
  const vertices = lats.length * (width + 1)
  const position = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2), rho = new Float32Array(vertices)
  const indices: number[] = []
  const u = [0, 0, 0], s = [0, 0, 0]
  let measured = 0
  for (let j = 0; j < lats.length; j++) {
    const lat = lats[j] * Math.PI / 180
    for (let i = 0; i <= width; i++) {
      const lonDeg = i / width * 360 - 180, lon = lonDeg * Math.PI / 180
      u[0] = Math.cos(lat) * Math.cos(lon); u[1] = Math.cos(lat) * Math.sin(lon); u[2] = Math.sin(lat)
      let h = bodyHeight(u)
      if (Number.isFinite(h)) measured++
      else h = baseHeight                                  // no data yet: a smooth sphere at the same datum
      sceneFromBody(u, s)
      const radius = MOON_R + h - baseHeight, index = j * (width + 1) + i
      // Rebased to Artemis (the mesh sits at +R in the Moon group), in kilometres.
      position[index * 3] = s[0] * radius * METRE
      position[index * 3 + 1] = (s[1] * radius - MOON_RADIUS_M) * METRE
      position[index * 3 + 2] = s[2] * radius * METRE
      uv[index * 2] = (lonDeg + 180) / 360; uv[index * 2 + 1] = (lats[j] + 90) / 180
      rho[index] = lats[j] < -60 ? Math.hypot(...bodyToStereo(u)) : 1e9
      if (j < lats.length - 1 && i < width) {
        const a = index, b = a + width + 1
        indices.push(a, a + 1, b, a + 1, b + 1, b)      // counter-clockwise seen from outside
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('rho', new THREE.BufferAttribute(rho, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  geometry.userData = { owner: 'moon-global', units: 'km', source: measured ? 'NASA LOLA LDEM_4 + PGDA 480 m polar grid' : 'plain sphere (LOLA not loaded)', measuredVertices: measured, vertices, triangles: indices.length / 3 }
  return geometry
}
