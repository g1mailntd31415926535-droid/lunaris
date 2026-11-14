import * as THREE from 'three'
import { CAP_RADIUS_M, CAP_SEGMENTS, METRE, MOON_RADIUS_M } from './space-config.ts'

// Far-view Moon globe (fictional relief, orbit view only). It starts 50 km from Artemis, so it has a
// hole over the whole Task 02 data circle; the procedural south-pole cap that used to fill that
// hole was removed. Inside the hole the only geometry is the NASA LOLA DEM (DemTerrain.tsx).
import { moonHeightMeters } from './planet-fields.ts'

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

/** Smooth, unlit stand-in for the globe at close range: same centre, same 50 km hole, no relief. */
export function buildMoonMatteShell() {
  const width = 40, rows = 10, thetaStart = Math.asin(CAP_RADIUS_M / MOON_RADIUS_M), radius = MOON_RADIUS_M * METRE
  const position: number[] = [], indices: number[] = []
  for (let j = 0; j <= rows; j++) {
    const theta = thetaStart + (Math.PI - thetaStart) * j / rows
    for (let i = 0; i <= width; i++) {
      const phi = i / width * Math.PI * 2
      position.push(Math.sin(theta) * Math.cos(phi) * radius, (Math.cos(theta) - 1) * radius, Math.sin(theta) * Math.sin(phi) * radius)
      if (j < rows && i < width) { const a = j * (width + 1) + i, b = a + width + 1; indices.push(a, a + 1, b, b, a + 1, b + 1) }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
