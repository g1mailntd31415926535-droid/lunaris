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

test('rover destinations are the real anchors and never certified as safe', opts, async () => {
  await dem.loadDem()
  const sites = surveySites()
  assert.deepEqual(sites.map((s) => s.id).sort(), ['A', 'B', 'C', 'D'])
  for (const site of sites) assert.ok(Math.hypot(...site.position) > 1500, `${site.id} is kilometres away, not pulled to the base`)
  for (const leg of surveyLegs()) {
    assert.notEqual(leg.status, 'SAFE_ROUTE')
    assert.equal(leg.site.zone.route_check.crosses_nodata, false)
    const first = leg.site.zone.route_check.first_block_at_m
    if (first !== null) assert.ok(leg.reachM < first, `${leg.site.id}: MILO stops before the first over-limit stretch`)
  }
})
