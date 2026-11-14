import * as THREE from 'three'
import { CAP_RADIUS_M, CAP_SEGMENTS, METRE, MOON_RADIUS_M } from './space-config.ts'
import { directionAtTangent, moonHeightMeters } from './planet-fields.ts'
import { surfacePointMeters } from './terrain-field.ts'
import { registerTerrainSurface } from './terrain-query.ts'

export function terrainRings() {
  const rings: number[] = []
  for (let r = 0.6; r <= 36.01; r += 0.6) rings.push(r)
  for (let r = 37.5; r <= 81; r += 1.5) rings.push(r)
  let radius = rings[rings.length - 1]
  while (radius < CAP_RADIUS_M) {
    radius = Math.min(CAP_RADIUS_M, radius * 1.10)
    rings.push(radius)
  }
  return rings
}

function globePosition(theta: number, phi: number): [number, number, number] {
  const n: [number, number, number] = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)]
  const radius = MOON_RADIUS_M + moonHeightMeters(...n)
  return [n[0] * radius * METRE, (n[1] * radius - MOON_RADIUS_M) * METRE, n[2] * radius * METRE]
}

function seamNormal(phi: number) {
  const x = Math.cos(phi) * CAP_RADIUS_M, z = Math.sin(phi) * CAP_RADIUS_M, e = 10
  const point = (xx: number, zz: number) => new THREE.Vector3(...globePosition(Math.asin(Math.hypot(xx, zz) / MOON_RADIUS_M), Math.atan2(zz, xx)))
  const dx = point(x + e, z).sub(point(x - e, z)), dz = point(x, z + e).sub(point(x, z - e))
  return dz.cross(dx).normalize()
}

export function buildMoonGlobe() {
  const width = CAP_SEGMENTS, rows = 112
  const thetaStart = Math.asin(CAP_RADIUS_M / MOON_RADIUS_M)
  const vertices = (width + 1) * rows + 1
  const position = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2)
  const indices: number[] = []
  for (let j = 0; j < rows; j++) {
    const theta = thetaStart + (Math.PI - thetaStart) * j / rows
    for (let i = 0; i <= width; i++) {
      const index = j * (width + 1) + i
      position.set(globePosition(theta, i / width * Math.PI * 2), index * 3)
      uv.set([i / width, 1 - theta / Math.PI], index * 2)
      if (j < rows - 1 && i < width) {
        const a = index, b = a + width + 1, c = a + 1, d = b + 1
        indices.push(a, c, b, b, c, d)
      }
    }
  }
  const pole = vertices - 1
  position.set(globePosition(Math.PI, 0), pole * 3); uv.set([0.5, 0], pole * 2)
  for (let i = 0; i < width; i++) {
    const a = (rows - 1) * (width + 1) + i
    indices.push(a, a + 1, pole)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geometry.setIndex(indices)
  geometry.computeVertexNormals()
  for (let i = 0; i <= width; i++) { const n = seamNormal(i / width * Math.PI * 2); geometry.getAttribute('normal').setXYZ(i, n.x, n.y, n.z) }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  geometry.userData = { owner: 'moon-global', units: 'km', capRadiusMetres: CAP_RADIUS_M, thetaStart, vertices, triangles: indices.length / 3 }
  return geometry
}

/** Fixed-topology polar LOD: metre-scale rings at Artemis grow continuously to
 * kilometre-scale rings at the 50 km seam. No meshes are swapped on zoom. */
export function buildSouthPoleCap() {
  const rings = terrainRings(), segments = CAP_SEGMENTS
  const vertices = 1 + rings.length * (segments + 1)
  const position = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2), groundUv = new Float32Array(vertices * 2), radiusAttribute = new Float32Array(vertices)
  const indices: number[] = []
  position.set(surfacePointMeters(0, 0)); uv.set([0.5, 1])
  for (let j = 0; j < rings.length; j++) {
    const r = rings[j]
    for (let i = 0; i <= segments; i++) {
      const phi = i / segments * Math.PI * 2, x = Math.cos(phi) * r, z = Math.sin(phi) * r
      const index = 1 + j * (segments + 1) + i
      position.set(surfacePointMeters(x, z), index * 3)
      const n = directionAtTangent(x, z)
      uv.set([i / segments, 1 - Math.acos(n[1]) / Math.PI], index * 2)
      groundUv.set([x * 0.16, z * 0.16], index * 2); radiusAttribute[index] = r
      if (i < segments) {
        if (j === 0) indices.push(0, index + 1, index)
        else {
          const a = index - (segments + 1), b = index, c = a + 1, d = index + 1
          indices.push(a, c, b, b, c, d)
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('groundUv', new THREE.BufferAttribute(groundUv, 2))
  geometry.setAttribute('patchRadius', new THREE.BufferAttribute(radiusAttribute, 1))
  geometry.setIndex(indices); geometry.computeVertexNormals()
  for (let i = 0; i <= segments; i++) { const n = seamNormal(i / segments * Math.PI * 2), index = 1 + (rings.length - 1) * (segments + 1) + i; geometry.getAttribute('normal').setXYZ(index, n.x, n.y, n.z) }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  geometry.userData = { owner: 'south-pole-cap', units: 'm', rings, segments, vertices, triangles: indices.length / 3, seamRadiusMetres: CAP_RADIUS_M }
  registerTerrainSurface(position, rings, segments)
  return geometry
}

export function capEdgePosition(phi: number) {
  return surfacePointMeters(Math.cos(phi) * CAP_RADIUS_M, Math.sin(phi) * CAP_RADIUS_M).map((v) => v * METRE)
}
export function globeEdgePosition(phi: number) { return globePosition(Math.asin(CAP_RADIUS_M / MOON_RADIUS_M), phi) }
