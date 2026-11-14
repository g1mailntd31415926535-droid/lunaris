// Runtime access to the real NASA LOLA 5 m terrain (Task 02).
// Pure TypeScript: no React, no Three.js, so the Node unit tests can run it.
//
// Region-local frame (metres, origin = BASE):  x = X − X_base (east), y = h − h_base (up),
// z = Y_base − Y (south).  Inverse:  X = X_base + x,  Y = Y_base − z,  h = h_base + y.
// One unit is one metre on all three axes. There is no vertical scale and no smoothing.
//
// Nothing here invents terrain: a query on NoData, outside the circle, or where no
// chunk is loaded returns `false` / NaN. There is no procedural fallback.

export interface DemLevelMeta { level: number; stride_px: number; spacing_m: number; tile_size_m: number; quant_step_m: number; chunks: Record<string, { bytes: number; min_m: number; max_m: number; valid_cells: number }> }
export interface DemMeta {
  grid: { x_min: number; y_max: number; pixel_m: number; size_px: number }
  circle: { center_xy_m: [number, number]; radius_m: number }
  base: { xy_m: [number, number]; height_m: number; lat_deg: number; lon_east_deg: number }
  tiling: { levels: number; tile_cells: number; chunk_cells: number }
  coverage_in_circle: { site01_percent: number; site04_percent: number; nodata_percent: number; nodata_label: string }
  seam: { max_step_m: number; seam_length_km: number; rule: string }
  levels: DemLevelMeta[]
  lighting: string
}
export interface ScienceZone {
  id: string; name: string; anchor_xy_m: [number, number]; local_xz_m: [number, number]
  anchor_latlon: { lat_deg: number; lon_east_deg: number }
  valid_dem: boolean; source_tile: string; height_m: number; slope_deg: number
  ice_status: string; verification_needed: string; UI_label: string
  straight_line_from_base_m: number; route_status: string
  route_check: { route_nominal_slope_limit_deg: number; max_slope_deg: number; percent_over_limit: number; segments_over_limit_count: number; crosses_nodata: boolean; first_block_at_m: number | null; segments_over_limit: [number, number, number][] }
}
export interface DemChunk {
  level: number; cx: number; cy: number
  /** (cells + 1)² local heights in metres (h − h_base). Invalid vertices hold a copied neighbour and must be ignored. */
  heights: Float32Array
  /** cells² flags: 1 = every 5 m pixel under this cell is valid NASA data. */
  cells: Uint8Array
  /** per render tile (tiles × tiles): valid cell count, min and max local height. */
  tileCells: Uint16Array; tileMin: Float32Array; tileMax: Float32Array
  lastUsed: number
}
export interface DemSample { y: number; nx: number; ny: number; nz: number; level: number }
export type CoverageClass = 0 | 1 | 2 | 3   // 0 outside circle · 1 NoData inside circle · 2 Site01 · 3 Site04
export type ChunkStatus = 'ready' | 'pending' | 'absent'

type Fetcher = (path: string) => Promise<ArrayBuffer>
let fetcher: Fetcher = async (path) => {
  const response = await fetch(`/lunar/task02/${path}`)
  if (!response.ok) throw new Error(`Không tải được dữ liệu địa hình: ${path} (${response.status})`)
  return response.arrayBuffer()
}
/** Tests (and any future offline bundle) can supply their own loader. */
export function setDemFetcher(next: Fetcher) { fetcher = next }

let meta: DemMeta | null = null
let coverage: Uint8Array | null = null
let zones: ScienceZone[] = []
const chunks = new Map<string, DemChunk>()
const pending = new Map<string, Promise<DemChunk | null>>()
const pinned = new Set<string>()
let clock = 0
let CELLS = 256, TILE = 32, LEVELS = 7, PX = 5
let originX = 0, originZ = 0, circleX = 0, circleZ = 0, circleR2 = 0
const colony = { ready: false, c: 0, nx: 0, ny: 1, nz: 0, quaternion: [0, 0, 0, 1] as [number, number, number, number], slopeDeg: 0, rmsResidualM: 0 }

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer            // a server already decoded it
  return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}

const key = (level: number, cx: number, cy: number) => `${level}/${cx}_${cy}`

function decodeChunk(buffer: ArrayBuffer, baseHeight: number): DemChunk {
  const view = new DataView(buffer)
  if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'LDEM') throw new Error('Tệp địa hình không đúng định dạng LDEM')
  const level = view.getUint16(6, true), cx = view.getUint16(8, true), cy = view.getUint16(10, true), n1 = view.getUint16(12, true)
  const min = view.getFloat64(14, true), step = view.getFloat64(22, true)
  const count = n1 * n1, cells = n1 - 1
  const low = new Uint8Array(buffer, 30, count), high = new Uint8Array(buffer, 30 + count, count)
  const cellBits = new Uint8Array(buffer, 30 + 2 * count + Math.ceil(count / 8), Math.ceil(cells * cells / 8))
  const heights = new Float32Array(count)
  for (let row = 0; row < n1; row++) {
    let value = 0
    for (let col = 0; col < n1; col++) {
      const i = row * n1 + col
      value = (value + (low[i] | (high[i] << 8))) & 0xffff           // undo the horizontal delta
      heights[i] = min + value * step - baseHeight
    }
  }
  const cellFlags = new Uint8Array(cells * cells)
  for (let i = 0; i < cells * cells; i++) cellFlags[i] = (cellBits[i >> 3] >> (i & 7)) & 1
  const tiles = cells / TILE
  const tileCells = new Uint16Array(tiles * tiles), tileMin = new Float32Array(tiles * tiles).fill(Infinity), tileMax = new Float32Array(tiles * tiles).fill(-Infinity)
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    if (!cellFlags[j * cells + i]) continue
    const t = Math.floor(j / TILE) * tiles + Math.floor(i / TILE)
    tileCells[t]++
    for (const h of [heights[j * n1 + i], heights[j * n1 + i + 1], heights[(j + 1) * n1 + i], heights[(j + 1) * n1 + i + 1]]) { if (h < tileMin[t]) tileMin[t] = h; if (h > tileMax[t]) tileMax[t] = h }
  }
  return { level, cx, cy, heights, cells: cellFlags, tileCells, tileMin, tileMax, lastUsed: clock }
}

export function chunkStatus(level: number, cx: number, cy: number): ChunkStatus {
  if (!meta || level < 0 || level >= LEVELS || cx < 0 || cy < 0 || !meta.levels[level].chunks[`${cx}_${cy}`]) return 'absent'
  return chunks.has(key(level, cx, cy)) ? 'ready' : 'pending'
}

/** Returns the chunk if it is in memory; otherwise starts loading it (once) and returns null. */
export function requestChunk(level: number, cx: number, cy: number): DemChunk | null {
  const k = key(level, cx, cy), ready = chunks.get(k)
  if (ready) { ready.lastUsed = clock; return ready }
  if (chunkStatus(level, cx, cy) === 'pending' && !pending.has(k)) void loadChunk(level, cx, cy)
  return null
}

export function loadChunk(level: number, cx: number, cy: number): Promise<DemChunk | null> {
  const k = key(level, cx, cy)
  if (chunks.has(k)) return Promise.resolve(chunks.get(k)!)
  if (chunkStatus(level, cx, cy) === 'absent') return Promise.resolve(null)
  let job = pending.get(k)
  if (!job) {
    job = fetcher(`L${level}/${cx}_${cy}.dem`).then(gunzip).then((raw) => { const chunk = decodeChunk(raw, meta!.base.height_m); chunks.set(k, chunk); return chunk })
      .catch((error) => { console.error(error); return null }).finally(() => pending.delete(k))
    pending.set(k, job)
  }
  return job
}

export const pendingChunkCount = () => pending.size
export const loadedChunkCount = () => chunks.size
/** Called once per terrain update; drops fine chunks that have not been touched for a while. */
export function tickChunkCache(maxFineChunks = 56) {
  clock++
  const fine = [...chunks.entries()].filter(([k, c]) => c.level <= 1 && !pinned.has(k))
  if (fine.length <= maxFineChunks) return
  fine.sort((a, b) => a[1].lastUsed - b[1].lastUsed)
  for (const [k] of fine.slice(0, fine.length - maxFineChunks)) chunks.delete(k)
}

// ── coordinate helpers ──────────────────────────────────────────────────────
/** Local x/z of L0 vertex (pixel-centre) index 0. Vertex i of level k sits at originX + i · 2^k · 5. */
export const demOrigin = () => ({ x: originX, z: originZ })
export const demMeta = () => meta
export const demReady = () => meta !== null
export const scienceZones = () => zones
export function localToProjected(x: number, z: number): [number, number] { return [meta!.base.xy_m[0] + x, meta!.base.xy_m[1] - z] }
export function insideCircle(x: number, z: number) { const dx = x - circleX, dz = z - circleZ; return dx * dx + dz * dz <= circleR2 }
export const circleLocal = () => ({ x: circleX, z: circleZ, radius: Math.sqrt(circleR2) })

export function coverageAt(x: number, z: number): CoverageClass {
  if (!coverage || !meta) return 0
  const size = meta.grid.size_px / 4
  const ci = Math.floor((x - originX + PX / 2) / (PX * 4)), cj = Math.floor((z - originZ + PX / 2) / (PX * 4))
  if (ci < 0 || cj < 0 || ci >= size || cj >= size) return 0
  return coverage[cj * size + ci] as CoverageClass
}
export const coverageGrid = () => coverage

/**
 * Height and face normal of the real terrain at a region-local position, taken from the
 * finest level that is in memory. Returns false on NoData, outside the circle, or before
 * data arrives. The interpolation is the same two-triangle split the renderer draws.
 */
export function demSample(x: number, z: number, out: DemSample): boolean {
  if (!meta || !insideCircle(x, z)) return false
  const gi = (x - originX) / PX, gj = (z - originZ) / PX
  if (gi < 0 || gj < 0) return false
  for (let level = 0; level < LEVELS; level++) {
    const s = 1 << level, li = gi / s, lj = gj / s, I = Math.floor(li), J = Math.floor(lj)
    const chunk = chunks.get(key(level, Math.floor(I / CELLS), Math.floor(J / CELLS)))
    if (!chunk) continue
    chunk.lastUsed = clock
    const ci = I % CELLS, cj = J % CELLS
    // A loaded cell that is not fully valid means NoData touches it: never fall back to a coarser guess.
    if (!chunk.cells[cj * CELLS + ci]) return false
    const n1 = CELLS + 1, H = chunk.heights, u = li - I, v = lj - J, d = s * PX
    const h00 = H[cj * n1 + ci], h10 = H[cj * n1 + ci + 1], h01 = H[(cj + 1) * n1 + ci], h11 = H[(cj + 1) * n1 + ci + 1]
    let dhdx: number, dhdz: number
    if (u >= v) { out.y = h00 + u * (h10 - h00) + v * (h11 - h10); dhdx = h10 - h00; dhdz = h11 - h10 }
    else { out.y = h00 + v * (h01 - h00) + u * (h11 - h01); dhdx = h11 - h01; dhdz = h01 - h00 }
    const length = Math.hypot(dhdx, d, dhdz)
    out.nx = -dhdx / length; out.ny = d / length; out.nz = -dhdz / length; out.level = level
    return true
  }
  return false
}

const scratch: DemSample = { y: 0, nx: 0, ny: 1, nz: 0, level: 0 }
/** Local terrain height in metres, or NaN where there is no valid NASA data. */
export function demHeight(x: number, z: number) { return demSample(x, z, scratch) ? scratch.y : NaN }

// ── colony frame ────────────────────────────────────────────────────────────
// The authored base (buildings, paths, crew) assumes level ground. Instead of flattening the
// real terrain, the whole colony is placed on the least-squares plane of the DEM around BASE.
function fitColonyPlane() {
  let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0
  const samples: [number, number, number][] = []
  for (let z = -14; z <= 14; z += 2) for (let x = -14; x <= 14; x += 2) {
    if (Math.hypot(x, z) > 14 || !demSample(x, z, scratch)) continue
    const y = scratch.y; samples.push([x, y, z])
    n++; sx += x; sz += z; sy += y; sxx += x * x; szz += z * z; sxz += x * z; sxy += x * y; szy += z * y
  }
  if (n < 12) return
  // Solve [sxx sxz sx; sxz szz sz; sx sz n] · [a b c] = [sxy szy sy]
  const det = sxx * (szz * n - sz * sz) - sxz * (sxz * n - sz * sx) + sx * (sxz * sz - szz * sx)
  const a = (sxy * (szz * n - sz * sz) - sxz * (szy * n - sz * sy) + sx * (szy * sz - szz * sy)) / det
  const b = (sxx * (szy * n - sz * sy) - sxy * (sxz * n - sz * sx) + sx * (sxz * sy - szy * sx)) / det
  const c = (sxx * (szz * sy - sz * szy) - sxz * (sxz * sy - szy * sx) + sxy * (sxz * sz - szz * sx)) / det
  const length = Math.hypot(a, 1, b)
  colony.nx = -a / length; colony.ny = 1 / length; colony.nz = -b / length; colony.c = c
  const angle = Math.acos(colony.ny), axis = Math.hypot(colony.nz, colony.nx) || 1, sin = Math.sin(angle / 2)
  colony.quaternion = [colony.nz / axis * sin, 0, -colony.nx / axis * sin, Math.cos(angle / 2)]
  colony.slopeDeg = angle * 180 / Math.PI
  colony.rmsResidualM = Math.sqrt(samples.reduce((sum, [x, y, z]) => sum + (y - (a * x + b * z + c)) ** 2, 0) / n)
  colony.ready = true
}
export const colonyFrame = () => colony

/** Colony-frame point (x, y, z) → region-local point. */
export function colonyToRegion(x: number, y: number, z: number): [number, number, number] {
  const [qx, , qz, qw] = colony.quaternion
  // Rotate by the unit quaternion (qx, 0, qz, qw):  v' = v + 2w(q × v) + 2 q × (q × v)
  const cx = -qz * y, cy = qz * x - qx * z, cz = qx * y
  const ccx = -qz * cy, ccy = qz * cx - qx * cz, ccz = qx * cy
  return [x + 2 * (qw * cx + ccx), colony.c + y + 2 * (qw * cy + ccy), z + 2 * (qw * cz + ccz)]
}

/** Height of the real terrain above the colony plane at colony coordinates (x, z). 0 where there is no data. */
export function colonyHeight(x: number, z: number) {
  if (!colony.ready) return 0
  let t = 0
  for (let i = 0; i < 2; i++) {
    const [px, py, pz] = colonyToRegion(x, t, z)
    if (!demSample(px, pz, scratch)) return t
    t += (scratch.y - py) / colony.ny
  }
  return t
}

// ── loading ─────────────────────────────────────────────────────────────────
let loading: Promise<void> | null = null
/** Loads metadata, the coverage map, science zones, every coarse level (20–320 m) and the 5–10 m chunks around BASE. */
export function loadDem(): Promise<void> {
  loading ??= (async () => {
    const text = new TextDecoder()
    const [metaRaw, coverageRaw, zonesRaw] = await Promise.all([fetcher('metadata.json'), fetcher('coverage_20m.bin').then(gunzip), fetcher('science_zones.json')])
    const m = JSON.parse(text.decode(metaRaw)) as DemMeta
    CELLS = m.tiling.chunk_cells; TILE = m.tiling.tile_cells; LEVELS = m.tiling.levels; PX = m.grid.pixel_m
    originX = m.grid.x_min + PX / 2 - m.base.xy_m[0]
    originZ = m.base.xy_m[1] - m.grid.y_max + PX / 2
    circleX = m.circle.center_xy_m[0] - m.base.xy_m[0]; circleZ = m.base.xy_m[1] - m.circle.center_xy_m[1]; circleR2 = m.circle.radius_m ** 2
    meta = m
    coverage = new Uint8Array(coverageRaw)
    zones = (JSON.parse(text.decode(zonesRaw)) as { zones: ScienceZone[] }).zones
    const jobs: Promise<unknown>[] = []
    for (let level = 2; level < LEVELS; level++) for (const name of Object.keys(m.levels[level].chunks)) { const [cx, cy] = name.split('_').map(Number); jobs.push(loadChunk(level, cx, cy)) }
    for (const level of [0, 1]) {
      const span = CELLS * (1 << level) * PX
      for (const dz of [-160, 160]) for (const dx of [-160, 160]) {
        const cx = Math.floor((dx - originX) / span), cy = Math.floor((dz - originZ) / span)
        pinned.add(key(level, cx, cy)); jobs.push(loadChunk(level, cx, cy))
      }
    }
    await Promise.all(jobs)
    fitColonyPlane()
  })()
  return loading
}
