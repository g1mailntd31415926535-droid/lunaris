// End-to-end check of the runtime terrain decoder against the built NASA DEM assets.
// Run: npm test   (needs public/lunar/task02 built by scripts/terrain/build_terrain.py)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as dem from '../src/world/dem.ts'
import { surveyLegs, surveySites } from '../src/world/rover-plan.ts'

const root = new URL('../public/lunar/task02/', import.meta.url)
const built = existsSync(new URL('metadata.json', root))
dem.setDemFetcher(async (path) => { const b = await readFile(new URL(path, root)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) })
const opts = { skip: built ? false : 'terrain assets not built' }

test('DEM loads; base is the local origin on real data', opts, async () => {
  await dem.loadDem()
  const meta = dem.demMeta()
  assert.deepEqual(meta.circle.center_xy_m, [-8500, -10500]); assert.equal(meta.circle.radius_m, 12500)
  assert.deepEqual(meta.base.xy_m, [-11000, -12000])
  const s = { y: 0, nx: 0, ny: 1, nz: 0, level: 9 }
  assert.equal(dem.demSample(0, 0, s), true)
  assert.equal(s.level, 0, 'base area is sampled from the 5 m level')
  assert.ok(Math.abs(s.y) < 1.5, `base height ${s.y} should be ~0 (local datum = DEM height at BASE)`)
})

test('decoded heights equal the offline values at A–D (no vertical scale, no smoothing)', opts, async () => {
  await dem.loadDem()
  const meta = dem.demMeta()
  for (const zone of dem.scienceZones()) {
    const [x, z] = zone.local_xz_m
    assert.deepEqual(dem.localToProjected(x, z), zone.anchor_xy_m, `anchor ${zone.id} keeps its published XY`)
    // nearest 5 m pixel centre, where the mesh vertex is the raw DEM sample
    const o = dem.demOrigin(), px = Math.round((x - o.x) / 5) * 5 + o.x, pz = Math.round((z - o.z) / 5) * 5 + o.z
    await Promise.all([0, 1].flatMap((level) => { const span = 256 * (1 << level) * 5; return [dem.loadChunk(level, Math.floor((px - o.x) / span), Math.floor((pz - o.z) / span))] }))
    const s = { y: 0, nx: 0, ny: 1, nz: 0, level: 9 }
    assert.equal(dem.demSample(px, pz, s), true, `${zone.id} is on valid DEM`)
    assert.equal(s.level, 0)
    assert.ok(Math.abs(s.y + meta.base.height_m - zone.height_m) <= meta.levels[0].quant_step_m / 2 + 1e-3, `${zone.id}: ${s.y + meta.base.height_m} vs ${zone.height_m}`)
  }
})

test('NoData and outside-circle queries return nothing (no procedural fallback)', opts, async () => {
  await dem.loadDem()
  const s = { y: 123, nx: 0, ny: 1, nz: 0, level: 0 }
  const c = dem.circleLocal()
  // inside the circle but north-west of both tiles: X = −18000, Y = −3000
  const nodata = [-18000 - -11000, -12000 - -3000]
  assert.equal(dem.insideCircle(...nodata), true); assert.equal(dem.coverageAt(...nodata), 1)
  assert.equal(dem.demSample(...nodata, s), false); assert.ok(Number.isNaN(dem.demHeight(...nodata)))
  assert.equal(dem.demSample(c.x + c.radius + 50, c.z, s), false, 'outside the 12.5 km circle')
  assert.equal(dem.coverageAt(c.x + c.radius + 50, c.z), 0)
  assert.equal(dem.coverageAt(0, 0), 2, 'BASE is on Site01')
})

test('colony plane follows the real slope at BASE', opts, async () => {
  await dem.loadDem()
  const f = dem.colonyFrame()
  assert.equal(f.ready, true)
  assert.ok(f.slopeDeg > 0.5 && f.slopeDeg < 10, `slope ${f.slopeDeg}`)
  assert.ok(Math.abs(dem.colonyHeight(0, 0)) < 1, 'colony origin sits on the DEM')
  const [x, y, z] = dem.colonyToRegion(5, dem.colonyHeight(5, -3), -3)
  assert.ok(Math.abs(y - dem.demHeight(x, z)) < 0.02, 'colony heights land on the real surface')
})

test('rover legs are the offline A* routes; zones without a route get no leg', opts, async () => {
  await dem.loadDem()
  const sites = surveySites(), routes = dem.roverRoutes()
  assert.deepEqual(sites.map((s) => s.id).sort(), ['A', 'B', 'C', 'D'])
  for (const site of sites) assert.ok(Math.hypot(...site.position) > 1500, `${site.id} is kilometres away, not pulled to the base`)
  const legs = surveyLegs()
  const found = Object.values(routes).filter((r) => r.route_status === 'NOMINAL_SLOPE_ROUTE_FOUND').map((r) => r.zone).sort()
  assert.deepEqual(legs.map((l) => l.site.id).sort(), found, 'exactly the zones with a nominal-slope route have a leg')
  assert.ok(found.length >= 1)
  const point = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this } }
  for (const leg of legs) {
    assert.notEqual(leg.status, 'SAFE_ROUTE')
    assert.ok(Math.abs(leg.length - leg.route.route_length_m) < 12, `${leg.site.id}: leg ${leg.length} vs route ${leg.route.route_length_m}`)
    leg.curve.getPointAt(1, point)
    assert.ok(Math.hypot(point.x - leg.site.position[0], point.z - leg.site.position[1]) < 3.6, `${leg.site.id}: the leg ends in the anchor pixel`)
    let onData = 0
    for (let i = 0; i <= 400; i++) { leg.curve.getPointAt(i / 400, point); if (dem.coverageAt(point.x, point.z) >= 2) onData++ }
    assert.equal(onData, 401, `${leg.site.id}: every sampled point is on NASA data`)
  }
})
