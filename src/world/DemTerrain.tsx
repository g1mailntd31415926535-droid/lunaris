import { use, useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { chunkStatus, circleLocal, coverageAt, coverageGrid, demMeta, demOrigin, loadDem, pendingChunkCount, requestChunk, scienceZones, tickChunkCache } from './dem'
import type { CoverageClass, DemChunk, ScienceZone } from './dem'
import { groundTexture } from './textures'
import { useUniverse } from './universe-context'
import { METRE } from './space-config'

/** Suspends the scene until the NASA terrain metadata, coarse levels and the base-area tiles are in memory. */
export function DemGate({ children }: { children: ReactNode }) {
  use(loadDem())
  return <>{children}</>
}

export const terrainStats = { tiles: 0, triangles: 0, pending: 0, levels: [0, 0, 0, 0, 0, 0, 0], finestLevel: 6 }
// Same colour as the canvas background: areas without NASA data simply show the dark backdrop.
const MATTE: [number, number, number] = [9 / 255, 13 / 255, 30 / 255]
const TILE = 32

/**
 * One render tile = 32 × 32 cells of one LOD level, vertices copied 1:1 from the DEM chunk
 * (no smoothing, no vertical scale). A cell is triangulated only if the build marked it valid,
 * i.e. every 5 m NASA pixel under it exists, so no triangle ever spans NoData.
 * There are no skirts or filler strips: the only geometry is the DEM surface itself. Where two LOD
 * levels meet, sub-pixel gaps can show the dark backdrop; tiles of the same level are watertight.
 */
function buildTileGeometry(level: number, tx: number, ty: number, chunk: DemChunk, x0: number, z0: number) {
  const d = (1 << level) * 5, n1 = 257, ci0 = (tx & 7) * TILE, cj0 = (ty & 7) * TILE, row = TILE + 1
  const positions: number[] = new Array(row * row * 3)
  for (let j = 0; j <= TILE; j++) for (let i = 0; i <= TILE; i++) {
    const o = (j * row + i) * 3
    // Absolute region-local coordinates: a vertex shared by two tiles gets bit-identical floats, so tiles are watertight.
    positions[o] = x0 + i * d; positions[o + 1] = chunk.heights[(cj0 + j) * n1 + ci0 + i]; positions[o + 2] = z0 + j * d
  }
  const indices: number[] = []
  const valid = (i: number, j: number) => chunk.cells[(cj0 + j) * 256 + ci0 + i] === 1
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
    if (!valid(i, j)) continue
    const a = j * row + i, b = a + 1, c = a + row, e = c + 1
    indices.push(a, c, e, a, e, b)                       // split along (i,j) → (i+1,j+1), as in the LOD error report
  }
  const terrainTriangles = indices.length / 3
  if (!terrainTriangles) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  // Lighting uses the true face normals (flat shading). This constant attribute only feeds the shadow normal-bias.
  const normals = new Float32Array(positions.length)
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  geometry.userData = { terrainTriangles, level }
  return geometry
}

function blurredValidity() {
  const source = coverageGrid()!, size = Math.round(Math.sqrt(source.length)), radius = 4
  let a = new Float32Array(source.length), b = new Float32Array(source.length)
  for (let i = 0; i < source.length; i++) a[i] = source[i] >= 2 ? 1 : 0
  for (const horizontal of [true, false]) {
    for (let line = 0; line < size; line++) {
      let sum = 0
      const at = (k: number) => a[horizontal ? line * size + k : k * size + line]
      for (let k = -radius; k <= radius; k++) sum += at(Math.max(0, Math.min(size - 1, k)))
      for (let k = 0; k < size; k++) {
        b[horizontal ? line * size + k : k * size + line] = sum / (radius * 2 + 1)
        sum += at(Math.min(size - 1, k + radius + 1)) - at(Math.max(0, k - radius))
      }
    }
    ;[a, b] = [b, a]
  }
  const bytes = new Uint8Array(source.length)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(a[i] * 255)
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RedFormat, THREE.UnsignedByteType)
  texture.magFilter = texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

interface Wanted { level: number; tx: number; ty: number; chunk: DemChunk; x0: number; z0: number }

export function DemTerrain({ quality, onCoverage }: { quality: 'high' | 'balanced'; onCoverage: (coverage: CoverageClass) => void }) {
  const universe = useUniverse()
  const group = useRef<THREE.Group>(null)
  const active = useRef(new Map<string, THREE.Mesh>())
  const cache = useRef(new Map<string, { geometry: THREE.BufferGeometry | null; used: number }>())
  const timers = useRef({ update: 1, hint: 0, tick: 0, lastCoverage: -1 })
  const ground = useMemo(groundTexture, [])
  const validity = useMemo(blurredValidity, [])
  const uniforms = useMemo(() => {
    const circle = circleLocal(), origin = demOrigin(), meta = demMeta()!
    return {
      uStyleWeight: { value: 1 }, uGroundTexture: { value: ground }, uValidity: { value: validity },
      uCircle: { value: new THREE.Vector3(circle.x, circle.z, circle.radius) },
      uFrame: { value: new THREE.Vector3(origin.x - 2.5, origin.z - 2.5, 1 / (meta.grid.size_px * meta.grid.pixel_m)) },
      uMatte: { value: new THREE.Vector3(...MATTE) },
    }
  }, [ground, validity])
  const material = useMemo(() => {
    // Low-poly look: flat shading from the real triangle faces. Colour and grain are render styling only;
    // heights, slopes and distances are untouched NASA data.
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.98, metalness: 0.01, flatShading: true, side: THREE.DoubleSide })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLunarWorld;').replace('#include <project_vertex>', '#include <project_vertex>\nvLunarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uStyleWeight; uniform sampler2D uGroundTexture; uniform sampler2D uValidity; uniform vec3 uCircle; uniform vec3 uFrame; uniform vec3 uMatte; varying vec3 vLunarWorld;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 lunarXZ = vLunarWorld.xz * 1000.0;                       // region-local metres
          float lunarRadius = distance(lunarXZ, uCircle.xy);
          if (lunarRadius > uCircle.z) discard;                          // exact clip at the 12.5 km circle
          vec3 lunarGrain = texture2D(uGroundTexture, lunarXZ * 0.16).rgb;
          vec3 lunarNear = lunarGrain * vec3(0.49, 0.48, 0.73);          // colony lavender (unchanged style)
          vec3 lunarFar = vec3(0.56, 0.535, 0.49) * (0.86 + 0.14 * texture2D(uGroundTexture, lunarXZ * 0.0031).g);
          diffuseColor.rgb = mix(lunarFar, lunarNear, uStyleWeight);
          float lunarData = texture2D(uValidity, (lunarXZ - uFrame.xy) * uFrame.z).r;
          float lunarFade = max(smoothstep(uCircle.z - 700.0, uCircle.z - 30.0, lunarRadius), (1.0 - smoothstep(0.5, 0.92, lunarData)) * 0.9);`)
        .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uMatte, lunarFade);')
    }
    m.customProgramCacheKey = () => 'lunaris-nasa-dem-terrain-v1'
    return m
  }, [uniforms])
  useEffect(() => () => {
    material.dispose(); validity.dispose()
    for (const entry of cache.current.values()) entry.geometry?.dispose()
    cache.current.clear(); active.current.clear()
  }, [material, validity])

  useFrame(({ camera }, delta) => {
    uniforms.uStyleWeight.value = universe.current.styleDetail
    const t = timers.current, u = universe.current
    t.update += delta; t.hint += delta
    if (t.hint > 0.25) {
      t.hint = 0
      // Label the dark backdrop whenever the camera looks at, or hovers over, an area without NASA data.
      let cls: CoverageClass = u.altitudeM < 60_000 ? coverageAt(u.cameraTarget.x / METRE, u.cameraTarget.z / METRE) : 2
      if (cls >= 2 && u.altitudeM < 60_000) { const below = coverageAt(camera.position.x / METRE, camera.position.z / METRE); if (below < 2) cls = below }
      if (cls !== t.lastCoverage) { t.lastCoverage = cls; onCoverage(cls) }
    }
    const pendingNow = pendingChunkCount()
    if (t.update < 0.1 && pendingNow === terrainStats.pending) return
    t.update = 0; t.tick++
    tickChunkCache()
    const root = group.current
    if (!root) return
    const meta = demMeta()!, origin = demOrigin(), circle = circleLocal()
    const ex = camera.position.x / METRE, ey = camera.position.y / METRE, ez = camera.position.z / METRE
    const rx = u.roverPosition.x, rz = u.roverPosition.z
    // A tile is refined when the camera is closer than `detail` × its size (see reports/task02_performance.md
    // for the measured triangle counts); the lower value is the lighter "Mượt mà" setting.
    const detail = quality === 'high' ? 1.0 : 0.8
    const wanted = new Map<string, Wanted>()
    // MILO always stands on 5 m data, even when the camera is far away and draws that area coarsely:
    // keep the fine height chunks under the rover in memory (data only, no extra triangles).
    for (const level of [0, 1]) {
      const span = 256 * (1 << level) * meta.grid.pixel_m
      for (const dz of [-60, 60]) for (const dx of [-60, 60]) requestChunk(level, Math.floor((rx + dx - origin.x) / span), Math.floor((rz + dz - origin.z) / span))
    }
    const visit = (level: number, tx: number, ty: number) => {
      const size = TILE * (1 << level) * meta.grid.pixel_m, x0 = origin.x + tx * size, z0 = origin.z + ty * size
      const nx = Math.max(x0, Math.min(circle.x, x0 + size)), nz = Math.max(z0, Math.min(circle.z, z0 + size))
      if ((nx - circle.x) ** 2 + (nz - circle.z) ** 2 > circle.radius ** 2) return
      if (chunkStatus(level, tx >> 3, ty >> 3) === 'absent') return
      const chunk = requestChunk(level, tx >> 3, ty >> 3)
      if (!chunk) return
      const index = (ty & 7) * 8 + (tx & 7)
      if (!chunk.tileCells[index]) return
      if (level > 0) {
        const dx = Math.max(x0 - ex, 0, ex - x0 - size), dz = Math.max(z0 - ez, 0, ez - z0 - size), dy = Math.max(chunk.tileMin[index] - ey, 0, ey - chunk.tileMax[index])
        if (Math.hypot(dx, dy, dz) < size * detail) {
          let ready = true
          for (let child = 0; child < 4; child++) {
            const cx = (tx * 2 + (child & 1)) >> 3, cy = (ty * 2 + (child >> 1)) >> 3
            if (chunkStatus(level - 1, cx, cy) === 'pending' && !requestChunk(level - 1, cx, cy)) ready = false
          }
          // A parent is replaced only when all four children can be drawn, so the ground never flickers out.
          if (ready) { for (let child = 0; child < 4; child++) visit(level - 1, tx * 2 + (child & 1), ty * 2 + (child >> 1)); return }
        }
      }
      wanted.set(`${level}:${tx}:${ty}`, { level, tx, ty, chunk, x0, z0 })
    }
    const top = meta.tiling.levels - 1, roots = Math.ceil(meta.grid.size_px / (TILE * (1 << top)))
    for (let ty = 0; ty < roots; ty++) for (let tx = 0; tx < roots; tx++) visit(top, tx, ty)

    for (const [key, mesh] of active.current) if (!wanted.has(key)) { root.remove(mesh); active.current.delete(key) }
    let triangles = 0, finest = top
    const levels = [0, 0, 0, 0, 0, 0, 0]
    for (const [key, tile] of wanted) {
      let entry = cache.current.get(key)
      if (!entry) { entry = { geometry: buildTileGeometry(tile.level, tile.tx, tile.ty, tile.chunk, tile.x0, tile.z0), used: t.tick }; cache.current.set(key, entry) }
      entry.used = t.tick
      if (!entry.geometry) continue
      triangles += entry.geometry.userData.terrainTriangles; levels[tile.level]++; finest = Math.min(finest, tile.level)
      if (active.current.has(key)) continue
      const mesh = new THREE.Mesh(entry.geometry, material)
      mesh.name = `dem-tile:${key}`
      mesh.layers.set(1)
      mesh.receiveShadow = true    // receives the colony's shadows; the terrain itself does not cast (lighting is artistic)
      root.add(mesh); active.current.set(key, mesh)
    }
    if (cache.current.size > 420) {
      const idle = [...cache.current.entries()].filter(([key]) => !active.current.has(key)).sort((a, b) => a[1].used - b[1].used)
      for (const [key, entry] of idle.slice(0, cache.current.size - 300)) { entry.geometry?.dispose(); cache.current.delete(key) }
    }
    terrainStats.tiles = active.current.size; terrainStats.triangles = triangles; terrainStats.pending = pendingChunkCount(); terrainStats.levels = levels; terrainStats.finestLevel = finest
  })
  return <group ref={group} name="lunar-terrain" userData={{ source: 'NASA LOLA 5 m DEM (Site01 + Site04)', procedural: false }} />
}

function ZoneMarker({ zone, onFocus }: { zone: ScienceZone; onFocus: (x: number, z: number) => void }) {
  const label = useRef<HTMLDivElement>(null)
  const universe = useUniverse()
  const y = zone.height_m - demMeta()!.base.height_m
  useFrame(() => {
    const h = universe.current.altitudeM, visible = h > 140 && h < 400_000
    if (label.current) { label.current.style.opacity = visible ? '1' : '0'; label.current.style.pointerEvents = visible ? 'auto' : 'none' }
  })
  const blocked = zone.route_status !== 'UNVERIFIED'
  return <Html center position={[zone.local_xz_m[0], y + 6, zone.local_xz_m[1]]} zIndexRange={[26, 11]} style={{ pointerEvents: 'none' }}>
    <div ref={label} className="zone-marker-anchor">
      <button className="zone-marker" onClick={() => onFocus(zone.local_xz_m[0], zone.local_xz_m[1])} aria-label={`Điểm ${zone.id}: ${zone.name}. ${zone.UI_label}. ${zone.verification_needed}`}>
        <b>{zone.id}</b>
        <span>{zone.name}<small>{zone.UI_label}</small><small>{zone.verification_needed} · cách căn cứ {(zone.straight_line_from_base_m / 1000).toFixed(1)} km{blocked ? ' · tuyến thẳng có đoạn quá dốc' : ' · tuyến chưa kiểm chứng'}</small></span>
      </button>
    </div>
  </Html>
}

/** A–D at their published coordinates. A marker exists only where the point sits on valid DEM; nothing is moved. */
export function ScienceZoneMarkers({ onFocus }: { onFocus: (x: number, z: number) => void }) {
  return <group name="science-zones">{scienceZones().filter((zone) => zone.valid_dem).map((zone) => <ZoneMarker key={zone.id} zone={zone} onFocus={onFocus} />)}</group>
}
