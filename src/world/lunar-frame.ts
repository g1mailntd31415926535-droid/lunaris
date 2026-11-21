// NASA LOLA terrain AROUND the 5 m sites, and the frame that places it in the scene.
// Pure TypeScript (no React, no Three.js) so the Node tests can check it.
//
// Data (public/lunar/regional, built by scripts/terrain/build_regional.py — never touches public/lunar/task02):
//   g0 40 m (48 km square around the 5 m circle) · g1 160 m (160 km around BASE) · g2 480 m (640 km around the pole)
//   all in the SAME south polar stereographic plane and on the SAME 1737.4 km sphere as the 5 m Site01/Site04 DEM;
//   LDEM_4 (0.25°) for the whole globe. Heights are metres above the 1737.4 km sphere.
//
// Scene frame (shared with dem.ts): region-local metres, origin = BASE, x = X − X_base (east), z = Y_base − Y,
// y = h − h_base. The Moon centre is at (0, −R, 0) km in the moon group, so a sphere point at radius R + h − h_base
// lies at height h − h_base above BASE's datum: every source uses one datum.
//
// Display rule: within PLANAR_R0 of BASE the stereographic plane is drawn flat, exactly like the 5 m DEM (which is
// planar and must not be moved: rover, markers and colony sit on it). Beyond PLANAR_R1 every point is placed on the
// true sphere. In between the two placements are blended (< 1° change of the display tilt, tests/regional.test.mjs). Heights are never
// changed, only where the plane meets the curved Moon.

export const MOON_R = 1_737_400
export const BASE_XY: readonly [number, number] = [-11_000, -12_000]
export const PLANAR_R0 = 18_000
export const PLANAR_R1 = 60_000
/** Polar grids are drawn out to this stereographic radius (≈ 80.1°S); the LDEM_4 globe continues from there. */
export const REGION_RHO_MAX = 300_000

export interface GridInfo { file: string; cols: number; rows: number; x0: number; y0: number; spacing_m: number; step_m: number; min_m: number; max_m: number; source: string; resample: string; coverage_distance?: { file: string } }
export interface RegionalManifest {
  provenance: string
  grids: { g0: GridInfo; g1: GridInfo; g2: GridInfo }
  global: { file: string; cols: number; rows: number; step_m: number; source: string }
  albedo: { file: string; credit: string; mean_srgb_75S_80S: [number, number, number] }
  checks: { g0_vs_5m_sites: { rms_m: number; mean_m: number; cells_compared: number } }
}
export interface Grid { name: 'g0' | 'g1' | 'g2'; info: GridInfo; heights: Float32Array; fade: number }

// ── frame ───────────────────────────────────────────────────────────────────
/** Body-fixed unit vector (x → 0°E, y → 90°E, z → north) of a south polar stereographic point. */
export function stereoToBody(X: number, Y: number, out: number[] = [0, 0, 0]) {
  const rho = Math.hypot(X, Y), c = 2 * Math.atan(rho / (2 * MOON_R)), s = Math.sin(c)
  out[0] = rho > 0 ? s * Y / rho : 0; out[1] = rho > 0 ? s * X / rho : 0; out[2] = -Math.cos(c)
  return out
}
export function bodyToStereo(u: readonly number[]): [number, number] {
  const c = Math.acos(Math.max(-1, Math.min(1, -u[2]))), rho = 2 * MOON_R * Math.tan(c / 2), l = Math.hypot(u[0], u[1])
  return l > 0 ? [rho * u[1] / l, rho * u[0] / l] : [0, 0]
}

/** Row-major 3 × 3 rotation, body → scene. Polar axes first (x ↔ +X, z ↔ −Y, up ↔ south pole), then the small
 *  rotation (0.54°) that puts BASE on the scene's +Y axis, where the scene has always had it. */
export const SCENE_FROM_BODY: number[] = (() => {
  const A = [0, 1, 0, 0, 0, -1, -1, 0, 0]
  const u = stereoToBody(BASE_XY[0], BASE_XY[1])
  const a = [A[0] * u[0] + A[1] * u[1] + A[2] * u[2], A[3] * u[0] + A[4] * u[1] + A[5] * u[2], A[6] * u[0] + A[7] * u[1] + A[8] * u[2]]
  // Rodrigues: rotation taking unit vector a onto (0, 1, 0).
  const v = [-a[2], 0, a[0]], c = a[1], k = 1 / (1 + c)
  const B = [
    1 - (v[2] * v[2]) * k, -v[2], (v[0] * v[2]) * k,
    v[2], 1 - (v[0] * v[0] + v[2] * v[2]) * k, -v[0],
    (v[0] * v[2]) * k, v[0], 1 - (v[0] * v[0]) * k,
  ]
  const M: number[] = []
  for (let r = 0; r < 3; r++) for (let col = 0; col < 3; col++) M.push(B[r * 3] * A[col] + B[r * 3 + 1] * A[3 + col] + B[r * 3 + 2] * A[6 + col])
  return M
})()
export function sceneFromBody(u: readonly number[], out: number[] = [0, 0, 0]) {
  const M = SCENE_FROM_BODY
  out[0] = M[0] * u[0] + M[1] * u[1] + M[2] * u[2]; out[1] = M[3] * u[0] + M[4] * u[1] + M[5] * u[2]; out[2] = M[6] * u[0] + M[7] * u[1] + M[8] * u[2]
  return out
}
export function bodyFromScene(s: readonly number[], out: number[] = [0, 0, 0]) {
  const M = SCENE_FROM_BODY // transpose
  out[0] = M[0] * s[0] + M[3] * s[1] + M[6] * s[2]; out[1] = M[1] * s[0] + M[4] * s[1] + M[7] * s[2]; out[2] = M[2] * s[0] + M[5] * s[1] + M[8] * s[2]
  return out
}

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** Weight of the true-sphere placement at a planar distance r (m) from BASE. */
export const sphereWeight = (r: number) => smooth(PLANAR_R0, PLANAR_R1, r)

/** Display position (region-local metres) of the surface point at stereographic (X, Y) with height h above the sphere. */
export function displayPosition(X: number, Y: number, h: number, baseHeight: number, out: number[] = [0, 0, 0]) {
  const x = X - BASE_XY[0], z = BASE_XY[1] - Y, w = sphereWeight(Math.hypot(x, z))
  out[0] = x; out[1] = h - baseHeight; out[2] = z
  if (w > 0) {
    const s = sceneFromBody(stereoToBody(X, Y)), r = MOON_R + h - baseHeight
    out[0] += (s[0] * r - out[0]) * w; out[1] += (s[1] * r - MOON_R - out[1]) * w; out[2] += (s[2] * r - out[2]) * w
  }
  return out
}

// ── data ────────────────────────────────────────────────────────────────────
type Fetcher = (path: string) => Promise<ArrayBuffer>
let fetcher: Fetcher = async (path) => {
  const response = await fetch(`/lunar/regional/${path}`)
  if (!response.ok) throw new Error(`Could not load regional LOLA terrain: ${path} (${response.status})`)
  return response.arrayBuffer()
}
export function setRegionalFetcher(next: Fetcher) { fetcher = next }

async function gunzip(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer
  return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
}

export const regional = {
  manifest: null as RegionalManifest | null,
  grids: { g0: null, g1: null, g2: null } as Record<'g0' | 'g1' | 'g2', Grid | null>,
  global: null as Float32Array | null,
  coverageDistance: null as Uint8Array | null,
  failed: [] as string[],
  version: 0,
}
const listeners = new Set<() => void>()
export function onRegionalChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
function changed() { regional.version++; for (const l of listeners) l() }
export const regionalPending = () => loadingJobs

let loading: Promise<void> | null = null
let loadingJobs = 0
const FADE: Record<'g0' | 'g1' | 'g2', number> = { g0: 3_000, g1: 10_000, g2: 0 }

async function decodeInt16(path: string, step: number) {
  const raw = new Int16Array(await gunzip(await fetcher(path)))
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] === -32768 ? Number.NaN : raw[i] * step
  return out
}

/** Progressive: the coarse polar grid and the globe arrive first, then 160 m, then 40 m. Never blocks the scene;
 *  a file that fails simply leaves the next coarser NASA grid in place (listed in `regional.failed`). */
export function loadRegional(): Promise<void> {
  loading ??= (async () => {
    let manifest: RegionalManifest
    try { manifest = JSON.parse(new TextDecoder().decode(await fetcher('manifest.json'))) as RegionalManifest }
    catch (error) { console.error(error); regional.failed.push('manifest.json'); changed(); return }
    regional.manifest = manifest
    const job = async (name: string, run: () => Promise<void>) => {
      loadingJobs++
      try { await run() } catch (error) { console.error(error); regional.failed.push(name) } finally { loadingJobs--; changed() }
    }
    const grid = (name: 'g0' | 'g1' | 'g2') => job(name, async () => {
      const info = manifest.grids[name]
      regional.grids[name] = { name, info, heights: await decodeInt16(info.file, info.step_m), fade: FADE[name] }
    })
    await Promise.all([
      grid('g2'),
      job('global', async () => { regional.global = await decodeInt16(manifest.global.file, manifest.global.step_m) }),
    ])
    await grid('g1')
    await Promise.all([
      grid('g0'),
      job('coverage', async () => { const f = manifest.grids.g0.coverage_distance; if (f) regional.coverageDistance = new Uint8Array(await gunzip(await fetcher(f.file))) }),
    ])
  })()
  return loading
}

function gridHeight(g: Grid, X: number, Y: number) {
  const { cols, rows, x0, y0, spacing_m: d } = g.info
  const gx = (X - x0) / d, gy = (y0 - Y) / d
  const i = Math.max(0, Math.min(cols - 2, Math.floor(gx))), j = Math.max(0, Math.min(rows - 2, Math.floor(gy)))
  const fx = Math.max(0, Math.min(1, gx - i)), fy = Math.max(0, Math.min(1, gy - j)), H = g.heights
  const a = H[j * cols + i], b = H[j * cols + i + 1], c = H[(j + 1) * cols + i], e = H[(j + 1) * cols + i + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy
}
/** 0 outside the grid, 1 more than `fade` metres inside it (same rule as the shader). */
function gridWeight(g: Grid, X: number, Y: number) {
  const { cols, x0, y0, spacing_m: d } = g.info, size = (cols - 1) * d
  const inside = Math.min(X - x0, x0 + size - X, Y - (y0 - size), y0 - Y) - d
  return g.fade > 0 ? smooth(0, g.fade, inside) : inside >= 0 ? 1 : 0
}

/** LOLA height (m above the 1737.4 km sphere) at a stereographic point from the finest polar grid in memory; NaN if none. */
export function polarHeight(X: number, Y: number) {
  const { g0, g1, g2 } = regional.grids
  let h = Number.NaN
  if (g2 && Math.hypot(X, Y) <= REGION_RHO_MAX + 4_000 && gridWeight(g2, X, Y) > 0) h = gridHeight(g2, X, Y)
  for (const g of [g1, g0]) {
    if (!g) continue
    const w = gridWeight(g, X, Y)
    if (w > 0) h = Number.isNaN(h) || w >= 1 ? gridHeight(g, X, Y) : h + (gridHeight(g, X, Y) - h) * w
  }
  return h
}

/** LDEM_4 height (m) at latitude/longitude in degrees (bilinear, longitude wraps); NaN before it loads. */
export function globalHeight(latDeg: number, lonDeg: number) {
  const H = regional.global
  if (!H) return Number.NaN
  const gx = (((lonDeg % 360) + 360) % 360) * 4 - 0.5, gy = (90 - latDeg) * 4 - 0.5
  const j = Math.max(0, Math.min(718, Math.floor(gy))), fy = Math.max(0, Math.min(1, gy - j))
  const i = Math.floor(gx), fx = gx - i, i0 = (i + 1440) % 1440, i1 = (i + 1441) % 1440
  return (H[j * 1440 + i0] * (1 - fx) + H[j * 1440 + i1] * fx) * (1 - fy) + (H[(j + 1) * 1440 + i0] * (1 - fx) + H[(j + 1) * 1440 + i1] * fx) * fy
}

/** Best NASA height (m above the sphere) for a body-fixed unit vector: polar LOLA grids near the pole, LDEM_4 elsewhere. */
export function bodyHeight(u: readonly number[]) {
  if (u[2] < -0.98) {
    const [X, Y] = bodyToStereo(u)
    const h = polarHeight(X, Y)
    if (Number.isFinite(h)) return h
  }
  return globalHeight(Math.asin(Math.max(-1, Math.min(1, u[2]))) * 180 / Math.PI, Math.atan2(u[1], u[0]) * 180 / Math.PI)
}

/** Height of the displayed NASA surface above BASE's datum (m) along a scene direction from the Moon centre; NaN before data. */
export function sceneDirectionHeight(sx: number, sy: number, sz: number, baseHeight: number) {
  const l = Math.hypot(sx, sy, sz)
  return bodyHeight(bodyFromScene([sx / l, sy / l, sz / l])) - baseHeight
}

/** 40 m vertex distance (m) to the nearest place without 5 m data (0 there), from g0_5m_coverage_distance. */
export function coverageDistanceAt(X: number, Y: number) {
  const g = regional.grids.g0, d = regional.coverageDistance
  if (!g || !d) return 0
  const i = Math.round((X - g.info.x0) / g.info.spacing_m), j = Math.round((g.info.y0 - Y) / g.info.spacing_m)
  if (i < 0 || j < 0 || i >= g.info.cols || j >= g.info.rows) return 0
  return d[j * g.info.cols + i] * 10
}
