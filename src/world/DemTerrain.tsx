import { use, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { TerrainLayer } from '../types'
import { chunkStatus, circleLocal, coverageAt, demMeta, demOrigin, loadDem, pendingChunkCount, requestChunk, scienceZones, tickChunkCache } from './dem'
import type { CoverageClass, DemChunk, ScienceZone } from './dem'
import { lunarAlbedoDebugGLSL, lunarSurfaceGLSL, lunarTerrainColorGLSL, lunarTerrainShadeGLSL, useLunarSurface } from './terrain-material'
import { loadRegional } from './lunar-frame'
import { useUniverse } from './universe-context'
import { METRE, MOON_RADIUS_KM } from './space-config'

/** Suspends the scene until the NASA terrain metadata, coarse levels and the base-area tiles are in memory. */
export function DemGate({ children }: { children: ReactNode }) {
  use(loadDem())
  void loadRegional()      // the LOLA terrain around the 5 m data streams in afterwards; it never blocks the scene
  return <>{children}</>
}

export const terrainStats = { tiles: 0, triangles: 0, pending: 0, levels: [0, 0, 0, 0, 0, 0, 0], finestLevel: 6, detailScale: 1 }
const TILE = 32

/**
 * One render tile = 32 × 32 cells of one LOD level, vertices copied 1:1 from the DEM chunk
 * (no smoothing, no vertical scale). A cell is triangulated only if the build marked it valid,
 * i.e. every 5 m NASA pixel under it exists, so no triangle ever spans NoData.
 * Around it and in its NoData gaps the NASA LOLA 40–480 m grids (RegionalTerrain) continue the same surface.
 * These triangles remain strictly on 5 m NASA data, including along the coverage boundary.
 */
interface TileData { positions: Float32Array; normals: Float32Array; relief: Int8Array; indices: Uint16Array; used: number }
const TILE_VERTICES = (TILE + 1) * (TILE + 1)
function buildTileData(level: number, tx: number, ty: number, chunk: DemChunk, x0: number, z0: number): TileData {
  const d = (1 << level) * 5, n1 = 257, ci0 = (tx & 7) * TILE, cj0 = (ty & 7) * TILE, row = TILE + 1
  const positions = new Float32Array(TILE_VERTICES * 3)
  const normals = new Float32Array(TILE_VERTICES * 3)
  const relief = new Int8Array(TILE_VERTICES)
  const heights = chunk.heights
  for (let j = 0; j <= TILE; j++) for (let i = 0; i <= TILE; i++) {
    const o = (j * row + i) * 3
    const x = ci0 + i, z = cj0 + j
    // Absolute region-local coordinates: a vertex shared by two tiles gets bit-identical floats, so tiles are watertight.
    const elevation = heights[z * n1 + x]
    positions[o] = x0 + i * d; positions[o + 1] = elevation; positions[o + 2] = z0 + j * d
    // Smooth only the lighting, with finite differences of the original samples.
    const left = Math.max(0, x - 1), right = Math.min(n1 - 1, x + 1)
    const above = Math.max(0, z - 1), below = Math.min(n1 - 1, z + 1)
    const nx = (heights[z * n1 + left] - heights[z * n1 + right]) / ((right - left) * d)
    const nz = (heights[above * n1 + x] - heights[below * n1 + x]) / ((below - above) * d)
    const length = Math.hypot(nx, 1, nz)
    normals[o] = nx / length; normals[o + 1] = 1 / length; normals[o + 2] = nz / length
    // A signed change in slope highlights measured ridges and valleys in the Game material.
    // Keep copied heights across NoData edges out of the curvature estimate.
    const cell = z * (n1 - 1) + x
    if (x > 0 && x < n1 - 1 && z > 0 && z < n1 - 1 && chunk.cells[cell] && chunk.cells[cell - 1] && chunk.cells[cell - n1] && chunk.cells[cell - n1 + 1]) {
      const neighbours = heights[z * n1 + left] + heights[z * n1 + right] + heights[above * n1 + x] + heights[below * n1 + x]
      relief[j * row + i] = Math.round(127 * THREE.MathUtils.clamp(2.5 * (4 * elevation - neighbours) / d, -1, 1))
    }
  }
  const indices = new Uint16Array(chunk.tileCells[(ty & 7) * 8 + (tx & 7)] * 6)
  let n = 0
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
    if (chunk.cells[(cj0 + j) * 256 + ci0 + i] !== 1) continue
    const v = j * row + i
    // split along (i,j) → (i+1,j+1), as in the LOD error report
    indices[n++] = v; indices[n++] = v + row; indices[n++] = v + row + 1; indices[n++] = v; indices[n++] = v + row + 1; indices[n++] = v + 1
  }
  return { positions, normals, relief, indices, used: 0 }
}

interface Wanted { level: number; tx: number; ty: number; chunk: DemChunk; x0: number; z0: number; triangles: number }
// One merged mesh holds every visible tile, so the whole terrain is a single draw call.
const MAX_TILES = 192
/** Terrain triangle budget per frame (reports/task02_performance.md). The refinement distance shrinks until it fits. */
const TRIANGLE_BUDGET = { high: 84_000, balanced: 56_000 }

export function DemTerrain({ quality, layer, onCoverage }: { quality: 'high' | 'balanced'; layer: TerrainLayer; onCoverage: (coverage: CoverageClass) => void }) {
  const universe = useUniverse()
  const cache = useRef(new Map<string, TileData>())
  const state = useRef({ update: 1, hint: 0, tick: 0, lastCoverage: -1, signature: '', detailScale: 1 })
  const lunarSurface = useLunarSurface()
  const uniforms = useMemo(() => {
    const circle = circleLocal()
    return {
      uStyleWeight: { value: 1 }, uGame: { value: 0 },
      uCircle: { value: new THREE.Vector3(circle.x, circle.z, circle.radius) },
      ...lunarSurface,
    }
  }, [lunarSurface])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.98, side: THREE.DoubleSide })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float relief; varying float vRelief; varying vec3 vLunarWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvLunarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vRelief = relief;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          ${lunarSurfaceGLSL}
          uniform float uStyleWeight; uniform float uGame; uniform vec3 uCircle;
          varying vec3 vLunarWorld; varying float vRelief;
          const vec3 vLunarRadial = vec3(0.0, 1.0, 0.0);   // the 5 m DEM is planar (see dem.ts)`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float lunarRelief = vRelief;
          ${lunarTerrainColorGLSL}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // Part of the true triangle-face normal keeps 5 m facets crisp.
          vec3 lunarFace = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
          normal = normalize(mix(normal, lunarFace * sign(dot(lunarFace, normal) + 1e-6), mix(0.32, 0.4, uGame)));
          ${lunarTerrainShadeGLSL}`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
          if (distance(vLunarWorld.xz * 1000.0, uCircle.xy) > uCircle.z) discard;
          ${lunarAlbedoDebugGLSL}`)
    }
    m.customProgramCacheKey = () => 'lunaris-nasa-dem-terrain-v9'
    return m
  }, [uniforms])
  const mesh = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    const position = new THREE.BufferAttribute(new Float32Array(MAX_TILES * TILE_VERTICES * 3), 3)
    position.setUsage(THREE.DynamicDrawUsage)
    const normal = new THREE.BufferAttribute(new Float32Array(MAX_TILES * TILE_VERTICES * 3), 3)
    normal.setUsage(THREE.DynamicDrawUsage)
    const relief = new THREE.BufferAttribute(new Int8Array(MAX_TILES * TILE_VERTICES), 1, true)
    relief.setUsage(THREE.DynamicDrawUsage)
    const index = new THREE.BufferAttribute(new Uint32Array(MAX_TILES * TILE * TILE * 6), 1)
    index.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', position)
    geometry.setAttribute('normal', normal)
    geometry.setAttribute('relief', relief)
    geometry.setIndex(index)
    geometry.setDrawRange(0, 0)
    const m = new THREE.Mesh(geometry, material)
    m.name = 'dem-terrain-merged'
    m.frustumCulled = false            // tiles are frustum-culled on the CPU before they are merged
    m.layers.set(1)
    m.receiveShadow = true             // receives the colony's shadows; the terrain itself does not cast (lighting is artistic)
    m.userData = { source: 'NASA LOLA 5 m DEM (Site01 + Site04)', procedural: false }
    return m
  }, [material])
  const scratch = useMemo(() => ({ frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), sphere: new THREE.Sphere() }), [])
  useEffect(() => () => { material.dispose(); mesh.geometry.dispose(); cache.current.clear() }, [material, mesh])

  useFrame(({ camera, size: viewport }, delta) => {
    const t = state.current, u = universe.current
    uniforms.uStyleWeight.value = u.styleDetail
    uniforms.uGame.value = layer === 'game' ? 1 : 0
    t.update += delta; t.hint += delta
    if (t.hint > 0.25) {
      t.hint = 0
      // Label the display surface whenever the camera looks at or hovers over an area without NASA data.
      const observation = u.viewCentre
      let cls: CoverageClass = observation.y < -MOON_RADIUS_KM ? 0 : u.altitudeM < 60_000 ? coverageAt(observation.x / METRE, observation.z / METRE) : 2
      // "Hovering over" only counts close to the ground; higher up the map-centred view looks at the data from afar.
      if (cls >= 2 && u.altitudeM < 6_000) { const below = coverageAt(camera.position.x / METRE, camera.position.z / METRE); if (below < 2) cls = below }
      if (cls !== t.lastCoverage) { t.lastCoverage = cls; onCoverage(cls) }
    }
    if (t.update < 0.066) return
    t.update = 0; t.tick++
    tickChunkCache()
    const meta = demMeta()!, origin = demOrigin(), circle = circleLocal()
    const ex = camera.position.x / METRE, ey = camera.position.y / METRE, ez = camera.position.z / METRE
    const rx = u.roverPosition.x, rz = u.roverPosition.z
    // MILO always stands on 5 m data, even when the camera is far away and draws that area coarsely:
    // keep the fine height chunks under the rover in memory (data only, no extra triangles).
    for (const level of [0, 1]) {
      const span = 256 * (1 << level) * meta.grid.pixel_m
      for (const dz of [-60, 60]) for (const dx of [-60, 60]) requestChunk(level, Math.floor((rx + dx - origin.x) / span), Math.floor((rz + dz - origin.z) / span))
    }
    camera.updateMatrixWorld()
    scratch.frustum.setFromProjectionMatrix(scratch.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const inView = (x0: number, z0: number, size: number, min: number, max: number) => {
      scratch.sphere.center.set((x0 + size / 2) * METRE, (min + max) / 2 * METRE, (z0 + size / 2) * METRE)
      scratch.sphere.radius = (Math.hypot(size * 0.7072, (max - min) / 2) * 1.2 + 4) * METRE
      return scratch.frustum.intersectsSphere(scratch.sphere)
    }
    const top = meta.tiling.levels - 1, roots = Math.ceil(meta.grid.size_px / (TILE * (1 << top)))
    const budget = TRIANGLE_BUDGET[quality]
    // An overhead view uses one target spacing across the visible region, so adjacent tiles
    // shade the same slopes instead of alternating between fine and coarse normals.
    const regional = u.altitudeM > 1800
    const metresPerPixel = 2 * u.altitudeM / (viewport.height * camera.projectionMatrix.elements[5])
    const screenSpacing = metresPerPixel * (quality === 'high' ? 5.5 : 7)
    let wanted: Wanted[] = [], triangles = 0
    const select = (detail: number) => {
      wanted = []; triangles = 0
      const visit = (level: number, tx: number, ty: number) => {
        const size = TILE * (1 << level) * meta.grid.pixel_m, x0 = origin.x + tx * size, z0 = origin.z + ty * size
        const nx = Math.max(x0, Math.min(circle.x, x0 + size)), nz = Math.max(z0, Math.min(circle.z, z0 + size))
        if ((nx - circle.x) ** 2 + (nz - circle.z) ** 2 > circle.radius ** 2) return
        if (chunkStatus(level, tx >> 3, ty >> 3) === 'absent') return
        const chunk = requestChunk(level, tx >> 3, ty >> 3)
        if (!chunk) return
        const index = (ty & 7) * 8 + (tx & 7), cells = chunk.tileCells[index]
        if (!cells) return
        const min = chunk.tileMin[index], max = chunk.tileMax[index]
        // Tiles outside the view are skipped here (with a margin), so only what the camera sees is merged and drawn.
        if (!inView(x0, z0, size, min, max)) return
        if (level > 0) {
          const dx = Math.max(x0 - ex, 0, ex - x0 - size), dz = Math.max(z0 - ez, 0, ez - z0 - size), dy = Math.max(min - ey, 0, ey - max)
          const refine = regional ? (size / TILE) * detail > screenSpacing : Math.hypot(dx, dy, dz) < size * detail
          if (refine) {
            let ready = true
            for (let child = 0; child < 4; child++) {
              const cx = (tx * 2 + (child & 1)) >> 3, cy = (ty * 2 + (child >> 1)) >> 3
              if (chunkStatus(level - 1, cx, cy) === 'pending' && !requestChunk(level - 1, cx, cy)) ready = false
            }
            // A parent is replaced only when all four children can be drawn, so the ground never flickers out.
            if (ready) { for (let child = 0; child < 4; child++) visit(level - 1, tx * 2 + (child & 1), ty * 2 + (child >> 1)); return }
          }
        }
        wanted.push({ level, tx, ty, chunk, x0, z0, triangles: cells * 2 }); triangles += cells * 2
      }
      for (let ty = 0; ty < roots; ty++) for (let tx = 0; tx < roots; tx++) visit(top, tx, ty)
    }
    // Automatic detail: shrink the refinement distance until the visible terrain fits the triangle budget,
    // and let it grow back slowly when there is room. Only the mesh density changes, never the DEM values.
    const base = quality === 'high' ? 1.0 : 0.8
    select(base * t.detailScale)
    for (let i = 0; i < 6 && (triangles > budget || wanted.length > MAX_TILES) && t.detailScale > 0.3; i++) { t.detailScale *= 0.88; select(base * t.detailScale) }
    if (triangles < budget * 0.7 && t.detailScale < 1) t.detailScale = Math.min(1, t.detailScale * 1.04)
    if (wanted.length > MAX_TILES) wanted.length = MAX_TILES

    const signature = wanted.map((w) => `${w.level}:${w.tx}:${w.ty}`).join('|')
    let finest = top
    const levels = [0, 0, 0, 0, 0, 0, 0]
    for (const w of wanted) { levels[w.level]++; if (w.level < finest) finest = w.level }
    if (signature !== t.signature) {
      t.signature = signature
      const geometry = mesh.geometry, position = geometry.getAttribute('position') as THREE.BufferAttribute
      const normal = geometry.getAttribute('normal') as THREE.BufferAttribute, index = geometry.getIndex()!
      const relief = geometry.getAttribute('relief') as THREE.BufferAttribute
      const positions = position.array as Float32Array, normals = normal.array as Float32Array, indices = index.array as Uint32Array
      let vertexOffset = 0, indexOffset = 0
      for (const w of wanted) {
        const key = `${w.level}:${w.tx}:${w.ty}`
        let tile = cache.current.get(key)
        if (!tile) { tile = buildTileData(w.level, w.tx, w.ty, w.chunk, w.x0, w.z0); cache.current.set(key, tile) }
        tile.used = t.tick
        positions.set(tile.positions, vertexOffset * 3)
        normals.set(tile.normals, vertexOffset * 3)
        relief.array.set(tile.relief, vertexOffset)
        const source = tile.indices
        for (let i = 0; i < source.length; i++) indices[indexOffset + i] = source[i] + vertexOffset
        vertexOffset += TILE_VERTICES; indexOffset += source.length
      }
      position.clearUpdateRanges(); position.addUpdateRange(0, vertexOffset * 3); position.needsUpdate = true
      normal.clearUpdateRanges(); normal.addUpdateRange(0, vertexOffset * 3); normal.needsUpdate = true
      relief.clearUpdateRanges(); relief.addUpdateRange(0, vertexOffset); relief.needsUpdate = true
      index.clearUpdateRanges(); index.addUpdateRange(0, indexOffset); index.needsUpdate = true
      geometry.setDrawRange(0, indexOffset)
      if (cache.current.size > 700) {
        const idle = [...cache.current.entries()].sort((p, q) => p[1].used - q[1].used)
        for (const [key] of idle.slice(0, cache.current.size - 450)) cache.current.delete(key)
      }
    }
    terrainStats.tiles = wanted.length; terrainStats.triangles = triangles; terrainStats.pending = pendingChunkCount(); terrainStats.levels = levels; terrainStats.finestLevel = finest; terrainStats.detailScale = t.detailScale
  })
  return <group name="lunar-terrain" userData={{ source: 'NASA LOLA 5 m DEM (Site01 + Site04)', procedural: false }}><primitive object={mesh} /></group>
}

function ZoneMarker({ zone, onFocus }: { zone: ScienceZone; onFocus: (x: number, z: number) => void }) {
  const label = useRef<HTMLDivElement>(null)
  const universe = useUniverse()
  const artemis = useMemo(() => new THREE.Vector3(), [])
  const site = useMemo(() => new THREE.Vector3(), [])
  const y = zone.height_m - demMeta()!.base.height_m
  useFrame(({ camera, size }) => {
    const marker = label.current
    if (!marker) return

    const h = universe.current.altitudeM
    let compact = h > 6_000
    let visible = h > 140 && h < 400_000
    if (visible) {
      camera.updateMatrixWorld()
      artemis.set(0, 0, 0).project(camera)
      if (Math.abs(artemis.x) < 1 && Math.abs(artemis.y) < 1) {
        // Keep the name and the compact badge clear of Artemis as they converge on screen.
        site.set(zone.local_xz_m[0], y + 6, zone.local_xz_m[1]).multiplyScalar(METRE).project(camera)
        const distancePx = Math.hypot((site.x - artemis.x) * size.width, (site.y - artemis.y) * size.height) / 2
        compact ||= distancePx < 175
        visible = distancePx > 36
      }
    }
    marker.toggleAttribute('data-visible', visible)
    marker.toggleAttribute('data-compact', compact)
  })
  const route = zone.route
  const routeText = !route ? 'route not computed' : route.route_status === 'NOMINAL_SLOPE_ROUTE_FOUND' ? `route with slope ≤ 15°: ${(route.route_length_m / 1000).toFixed(1)} km` : 'no route with slope ≤ 15° to this point'
  return <Html center position={[zone.local_xz_m[0], y + 6, zone.local_xz_m[1]]} zIndexRange={[26, 11]} style={{ pointerEvents: 'none' }}>
    <div ref={label} className="zone-marker-anchor">
      <button type="button" className="zone-marker" onClick={() => onFocus(zone.local_xz_m[0], zone.local_xz_m[1])} aria-label={`Point ${zone.id}: ${zone.name}. ${zone.UI_label}. ${zone.verification_needed}`}>
        <b>{zone.id}</b>
        <span>{zone.name}<small>{zone.UI_label}</small><small>{zone.verification_needed} · {(zone.straight_line_from_base_m / 1000).toFixed(1)} km from base in a straight line · {routeText}</small></span>
      </button>
    </div>
  </Html>
}

/** A–D at their published coordinates. A marker exists only where the point sits on valid DEM; nothing is moved. */
export function ScienceZoneMarkers({ onFocus }: { onFocus: (x: number, z: number) => void }) {
  return <group name="science-zones">{scienceZones().filter((zone) => zone.valid_dem).map((zone) => <ZoneMarker key={zone.id} zone={zone} onFocus={onFocus} />)}</group>
}
