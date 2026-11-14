// Regional NASA LOLA terrain around the 5 m DEM: frame, datum and agreement with the 5 m data.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as dem from '../src/world/dem.ts'
import * as frame from '../src/world/lunar-frame.ts'

const task02 = new URL('../public/lunar/task02/', import.meta.url)
const regionalRoot = new URL('../public/lunar/regional/', import.meta.url)
const load = (root) => async (path) => { const b = await readFile(new URL(path, root)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
dem.setDemFetcher(load(task02))
frame.setRegionalFetcher(load(regionalRoot))
const opts = { skip: existsSync(new URL('manifest.json', regionalRoot)) && existsSync(new URL('metadata.json', task02)) ? false : 'terrain assets not built' }

test('scene frame: BASE is the +Y point, stereographic axes map to scene x and −z', () => {
  const s = frame.sceneFromBody(frame.stereoToBody(...frame.BASE_XY))
  assert.ok(Math.abs(s[0]) < 1e-12 && Math.abs(s[2]) < 1e-12 && Math.abs(s[1] - 1) < 1e-12)
  const east = frame.displayPosition(frame.BASE_XY[0] + 100_000, frame.BASE_XY[1], 0, 0)
  const north = frame.displayPosition(frame.BASE_XY[0], frame.BASE_XY[1] + 100_000, 0, 0)
  assert.ok(east[0] > 99_000 && Math.abs(east[2]) < 200, `+X → +x ${east}`)
  assert.ok(north[2] < -99_000 && Math.abs(north[0]) < 200, `+Y → −z ${north}`)
  const [X, Y] = frame.bodyToStereo(frame.stereoToBody(-123_456, 78_901))
  assert.ok(Math.abs(X + 123_456) < 1e-6 && Math.abs(Y - 78_901) < 1e-6)
})

test('display: planar exactly like the 5 m DEM near BASE, the true sphere far away', () => {
  const p = frame.displayPosition(frame.BASE_XY[0] + 5_000, frame.BASE_XY[1] - 7_000, 2_100, 1_944.7671)
  assert.deepEqual(p.map((v) => +v.toFixed(6)), [5000, +(2_100 - 1_944.7671).toFixed(6), 7000])
  // Far: radius from the Moon centre equals R + h − h_base (one datum for every source).
  const far = frame.displayPosition(200_000, 50_000, 1_000, 1_944.7671)
  const radius = Math.hypot(far[0], far[1] + frame.MOON_R, far[2])
  assert.ok(Math.abs(radius - (frame.MOON_R + 1_000 - 1_944.7671)) < 1e-3, `${radius}`)
  // The blend between them only adds a small tilt beyond the range between the plane (0°) and the sphere (−r/R).
  let worst = 0
  for (let r = 10_000; r < 80_000; r += 500) {
    const a = frame.displayPosition(frame.BASE_XY[0] + r, frame.BASE_XY[1], 0, 0), b = frame.displayPosition(frame.BASE_XY[0] + r + 500, frame.BASE_XY[1], 0, 0)
    const slope = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, sphere = -(r + 250) / frame.MOON_R * 180 / Math.PI
    worst = Math.max(worst, sphere - slope, slope)
  }
  assert.ok(worst < 1, `display tilt error ${worst.toFixed(3)}°`)
})

test('LOLA 40 m agrees with the 5 m NASA DEM at A–D and BASE (same place, same datum)', opts, async () => {
  await dem.loadDem()
  await frame.loadRegional()
  assert.deepEqual(frame.regional.failed, [])
  const meta = dem.demMeta()
  for (const zone of dem.scienceZones()) {
    const [X, Y] = zone.anchor_xy_m
    const lola = frame.polarHeight(X, Y)
    assert.ok(Math.abs(lola - zone.height_m) < 15, `${zone.id}: LOLA 40 m ${lola.toFixed(1)} m vs 5 m ${zone.height_m.toFixed(1)} m`)
  }
  const base = frame.polarHeight(...frame.BASE_XY)
  assert.ok(Math.abs(base - meta.base.height_m) < 10, `BASE: ${base} vs ${meta.base.height_m}`)
  const manifest = frame.regional.manifest
  assert.ok(manifest.checks.g0_vs_5m_sites.rms_m < 1.5, `RMS ${manifest.checks.g0_vs_5m_sites.rms_m}`)
})

test('every grid is NASA data without gaps inside the drawn region; the globe uses LDEM_4', opts, async () => {
  await frame.loadRegional()
  for (const name of ['g0', 'g1', 'g2']) {
    const g = frame.regional.grids[name]
    assert.ok(g, name)
    assert.ok(g.info.source.startsWith('https://pgda.gsfc.nasa.gov/'), `${name} source ${g.info.source}`)
    assert.equal(g.heights.some((h) => Number.isNaN(h)), false, `${name} has NoData`)
  }
  for (let a = 0; a < 360; a += 15) {
    const X = Math.sin(a * Math.PI / 180) * frame.REGION_RHO_MAX, Y = Math.cos(a * Math.PI / 180) * frame.REGION_RHO_MAX
    assert.ok(Number.isFinite(frame.polarHeight(X, Y)), `polar grid at ${a}°`)
  }
  // South pole region: LDEM_4 and the 480 m grid agree to a few hundred metres at 85°S (different resolutions).
  const u = [Math.cos(-85 * Math.PI / 180), 0, Math.sin(-85 * Math.PI / 180)]
  const [X, Y] = frame.bodyToStereo(u)
  assert.ok(Math.abs(frame.globalHeight(-85, 0) - frame.polarHeight(X, Y)) < 800)
})
