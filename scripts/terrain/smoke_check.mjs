// Browser smoke check for the Task 02 terrain (needs the dev/preview server and installed Chrome).
// Usage: node scripts/terrain/smoke_check.mjs [url]
import { chromium } from 'playwright'
import { onboard } from '../lib/onboard.mjs'
const url = process.argv[2] ?? 'http://localhost:5173/?debug=1'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url)
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120_000 })
// Story Mode: start in Advanced from the opening, answer the A1 tutorial question, pause the mission clock.
await onboard(page, 'advanced')
await page.locator('.story-option').first().click({ timeout: 15000 })
await page.locator('.review-panel .dialogue-action').click({ timeout: 5000 }).catch(() => null)   // read the A1 result
await page.locator('.objective-head').click({ timeout: 3000 }).catch(() => null)   // collapse the objective chip so it does not cover scene clicks
await page.waitForTimeout(800)
if (await page.locator('.hud-time button[aria-label^="Tạm dừng"]').count()) await page.locator('.hud-time button[aria-label^="Tạm dừng"]').click()
await page.keyboard.press('3'); await page.keyboard.press('b'); await page.waitForTimeout(10000)   // A1 astronaut walk finishes; default base view and the base panel after the A1 focus
// Mission time stays paused: the checks below are about the camera, terrain and clicks, not the simulation.
const results = []
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail ?? '') }
const diag = () => page.evaluate(() => { const d = window.__LUNARIS__; return { rover: d.rover, terrain: d.terrain, alt: d.altitudeM, clearance: d.clearanceM, calls: d.drawCalls, tris: d.triangles, targets: d.targets.length, actors: d.actors } })
const pose = () => page.evaluate(() => { const { camera, target, moonCenter } = window.__LUNARIS__; return { camera, target, moonCenter } })
const subtract = (a, b) => a.map((value, i) => value - b[i])
const displacement = (a, b) => Math.hypot(...subtract(a, b))
const angleDegrees = (a, b) => {
  const cosine = a.reduce((sum, value, i) => sum + value * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b))
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * 180 / Math.PI
}
const drag = async (from, to, button = 'left') => {
  await page.mouse.move(...from)
  await page.mouse.down({ button })
  await page.mouse.move(...to, { steps: 10 })
  await page.mouse.up({ button })
}

let d = await diag()
check('terrain source is the NASA DEM', d.terrain.source.includes('NASA LOLA'), d.terrain.source)
check('base view draws 5 m tiles', d.terrain.finestLevel === 0, `levels ${d.terrain.levels}`)
check('rover stands on the DEM at the depot', d.rover.groundError < 0.02, `error ${d.rover.groundError.toFixed(4)} m`)
const artemis = page.getByRole('button', { name: 'Về căn cứ Artemis' })
check('Artemis pin stays hidden when the base is visible', !(await artemis.isVisible()))

{
  const sceneId = await page.evaluate(() => window.__LUNARIS__.sceneId)
  const world = page.locator('.world')
  await page.waitForFunction(() => window.__LUNARIS__.terrainPending === 0)
  const terrainGeometry = () => page.evaluate(() => {
    const geometry = window.__LUNARIS_SCENE__.getObjectByName('dem-terrain-merged').geometry
    const vertices = geometry.getAttribute('position')
    const indices = geometry.getIndex()
    const baseHeights = new Map()
    for (let i = 0; i < geometry.drawRange.count; i++) {
      const vertex = indices.getX(i)
      const x = vertices.getX(vertex), z = vertices.getZ(vertex)
      if (Math.abs(x) < 15 && Math.abs(z) < 15) baseHeights.set(`${x},${z}`, vertices.getY(vertex))
    }
    return { id: geometry.uuid, heights: [...baseHeights.entries()].sort() }
  })
  const before = await terrainGeometry()
  await page.locator('.hud-gear').click(); await page.getByRole('menuitem', { name: /Hiển thị/ }).click()
  const nasa = page.getByRole('button', { name: /^NASA Layer/ })
  const game = page.getByRole('button', { name: /^Game Layer/ })
  await nasa.click()
  check('NASA Layer is selected exclusively and reaches the scene', await nasa.getAttribute('aria-pressed') === 'true' && await game.getAttribute('aria-pressed') === 'false' && await world.getAttribute('data-terrain-layer') === 'nasa')
  const nasaGeometry = await terrainGeometry()
  await game.click()
  check('Game Layer is selected exclusively in the same scene', await game.getAttribute('aria-pressed') === 'true' && await nasa.getAttribute('aria-pressed') === 'false' && await world.getAttribute('data-terrain-layer') === 'game' && await page.evaluate(() => window.__LUNARIS__.sceneId) === sceneId)
  check('changing layers keeps the same NASA terrain geometry and elevations', before.heights.length > 0 && JSON.stringify(before) === JSON.stringify(nasaGeometry) && JSON.stringify(nasaGeometry) === JSON.stringify(await terrainGeometry()))
  await page.getByRole('button', { name: 'Đóng cửa sổ' }).click(); await page.waitForTimeout(700)   // let the dialog fade out
}

// Buildings are drawn by the merged colony batch; clicks must still reach each building's pick volume.
{
  const targets = await page.evaluate(() => window.__LUNARIS__.targets)
  const picked = []
  for (const t of targets) {
    if (t.x < 380 || t.x > 1000 || t.y < 200 || t.y > 530) continue          // skip spots under the HUD panels
    // Aim slightly above the door: the astronaut standing at the command door is clickable too.
    await page.mouse.click(t.x, t.y - 22); await page.waitForTimeout(400)
    if (await page.locator('.modal').count()) await page.keyboard.press('Escape')
    const title = await page.$eval('.building-title h3', (n) => n.textContent).catch(() => null)
    picked.push(`${t.id}→${title}`)
  }
  const titles = new Set(picked.map((p) => p.split('→')[1]))
  check('building clicks reach the pick volumes (batched models)', picked.length >= 3 && titles.size === picked.length && !titles.has('null'), picked.join(', '))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
}

{
  const before = await pose()
  await drag([685, 235], [685, 505])
  await page.waitForTimeout(1400)
  const above = await pose()
  const tilt = angleDegrees(subtract(above.camera, above.target), subtract(above.target, above.moonCenter))
  check('base drag can tilt the view almost straight down around its target', tilt < 14 && displacement(above.target, before.target) < 0.002, `tilt ${tilt.toFixed(1)}°`)

  for (let i = 0; i < 10; i++) await drag([850, 270], [420, 270], 'right')
  await page.waitForTimeout(1500)
  const panned = await pose()
  const panM = Math.hypot(panned.target[0] - above.target[0], panned.target[2] - above.target[2]) * 1000
  check('repeated base pans can move beyond the old 36 m boundary', panM > 58, `panned ${panM.toFixed(1)} m`)
  await page.mouse.wheel(0, 240)
  await page.waitForFunction(() => window.__LUNARIS__.altitudeM > 49)
  const zoomed = await pose()
  const driftM = displacement(zoomed.target, panned.target) * 1000
  check('zooming out after a base pan holds the chosen point', driftM < 2, `target moved ${driftM.toFixed(2)} m`)
  await page.keyboard.press('3')
  await page.waitForTimeout(1200)
}

// Drive: seek the presentation clock to mid-leg and to the turn-back point.
await page.waitForTimeout(1500)
d = await diag()
// Story Mode: MILO no longer tours by itself; it waits at the depot until the player sends it (scripts/story_playthrough.mjs drives it).
check('story mode: MILO waits at the depot until the player sends it', d.rover.phase === 'docked' && d.rover.distance < 30, `${d.rover.phase} · ${d.rover.site} · ${d.rover.distance.toFixed(0)} m from base`)
check('rover stays on the DEM', d.rover.groundError < 0.05, `error ${d.rover.groundError.toFixed(4)} m`)

// Science zone markers at region scale.
await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(3000)); await page.waitForTimeout(6000)
const zones = await page.$$eval('.zone-marker', (nodes) => nodes.map((n) => n.textContent))
check('four science zone markers exist', zones.length === 4, zones.map((z) => z.slice(0, 1)).join(''))
check('markers report the A* result per zone (A, B, C route; D none)', ['A', 'B', 'C'].every((id) => /có tuyến dốc ≤ 15°/.test(zones.find((z) => z.startsWith(id)) ?? '')) && /không có tuyến dốc ≤ 15°/.test(zones.find((z) => z.startsWith('D')) ?? ''))
check('markers say ice is unconfirmed and await the rover', zones.every((z) => /chưa xác nhận/.test(z) && /chờ rover xác minh/.test(z)))

// Zoom preserves the observed point from regional range into orbit.
{
  const centre = () => page.evaluate(() => window.__LUNARIS__.target.map((v) => v * 1000))
  const start = await centre()
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(6000)); await page.waitForTimeout(7000)
  const c = await centre()
  const off = Math.hypot(c[0] - start[0], c[2] - start[2])
  check('6 km view holds the original target', off < 60, `target moved ${off.toFixed(1)} m`)
  check('no "outside NASA data" label while focused on the base', (await page.$('.nodata-chip')) === null)

  await artemis.hover()
  await page.mouse.wheel(0, 240)
  await page.waitForFunction(() => window.__LUNARIS__.altitudeM > 8000)
  check('wheel zooms with the pointer over the Artemis pin', (await diag()).alt > 8000)

  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(60000)); await page.waitForTimeout(8000)
  const far = await centre(), clearance = (await diag()).clearance
  const farOff = Math.hypot(far[0] - start[0], far[2] - start[2])
  check('60 km view keeps clearance and the same focus', clearance > 54000 && farOff < 60, `clearance ${(clearance / 1000).toFixed(1)} km, target moved ${farOff.toFixed(1)} m`)
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(3e6))
  await page.waitForFunction(() => window.__LUNARIS__.mode === 'orbit' && window.__LUNARIS__.altitudeM > 2.8e6)
  const orbit = await centre()
  check('global zoom still frames the observed location', Math.hypot(orbit[0] - start[0], orbit[2] - start[2]) < 60)
  await artemis.click()
  await page.waitForFunction(() => window.__LUNARIS__.mode === 'base' && !window.__LUNARIS__.cameraTravel.moving)
  check('clicking the far pin returns to the base and hides the pin', !(await artemis.isVisible()))
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(520)); await page.waitForTimeout(5000)
  check('Artemis pin stays hidden while the base is still recognizable', !(await artemis.isVisible()))
}

// Fly to zone D (Site04) through its marker; the camera must end over valid data near D.
await page.$$eval('.zone-marker', (nodes) => nodes.find((n) => n.textContent.startsWith('D')).click()); await page.waitForTimeout(7000)
d = await diag()
const target = await page.evaluate(() => window.__LUNARIS__.target.map((v) => v * 1000))
check('focus on D moves the camera ~10 km from base', Math.abs(Math.hypot(target[0], target[2]) - 10034) < 60, `target ${target.map((v) => v.toFixed(0))}`)
check('no "outside NASA data" label over D', (await page.$('.nodata-chip')) === null)

{
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(11000))
  await page.waitForFunction(() => window.__LUNARIS__.altitudeM > 10950)
  const before = await pose()
  await drag([685, 260], [735, 140])
  await page.waitForTimeout(1800)
  const tilted = await pose()
  const viewAngle = angleDegrees(subtract(tilted.camera, tilted.target), subtract(before.camera, before.target))
  const panKm = displacement(tilted.target, before.target)
  check('drag responds at regional zoom where the camera used to feel locked', viewAngle > 8 || panKm > 0.5, `view turned ${viewAngle.toFixed(1)}°, target shifted ${panKm.toFixed(2)} km`)
}

// Look at a NoData area inside the circle (north-west of both tiles).
await page.evaluate(() => window.__LUNARIS__ && document.querySelector('.zone-marker'))
await page.evaluate(() => { const w = window.__LUNARIS_TEST_FOCUS__; if (w) w(-7000, -9000) }); await page.waitForTimeout(7000)
const chip = await page.$eval('.nodata-chip', (n) => n.textContent).catch(() => null)
check('NoData area is labelled as outside the 5 m DEM and shown with coarser NASA LOLA', !!chip && /Ngoài vùng DEM 5 m/i.test(chip) && /LOLA 40/.test(chip), chip ?? 'no chip')

{
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(3e6))
  await page.waitForFunction(() => window.__LUNARIS__.altitudeM > 2.99e6)
  const before = await pose()
  await drag([680, 275], [910, 375])
  await page.waitForTimeout(2500)
  const rotated = await pose()
  check('dragging in orbit changes the observed lunar region', displacement(rotated.target, before.target) > 100)

  await drag([700, 265], [835, 325], 'right')
  await page.waitForTimeout(3000)
  const panned = await pose()
  const panKm = displacement(panned.target, rotated.target)
  check('right drag can pan freely across the Moon from orbit', panKm > 60, `panned ${panKm.toFixed(1)} km`)

  await page.mouse.wheel(0, -180)
  await page.waitForFunction(() => window.__LUNARIS__.altitudeM < 2e6)
  const after = await pose()
  const driftM = displacement(panned.target, after.target) * 1000
  check('wheel zoom retains the observed location after orbit rotation and pan', driftM < 200, `target moved ${driftM.toFixed(1)} m`)
}

// Free camera at regional height: the tilt is kept (not forced top-down) and a left drag orbits around the observed point.
{
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(30000)); await page.waitForTimeout(9000)
  const read = () => page.evaluate(() => ({ eye: window.__LUNARIS__.camera, target: window.__LUNARIS__.target }))
  const before = await read()
  const offAxis = (v) => { const dx = v.eye[0] - v.target[0], dy = v.eye[1] - v.target[1], dz = v.eye[2] - v.target[2]; return Math.atan2(Math.hypot(dx, dz), dy) * 180 / Math.PI }
  await page.mouse.move(683, 560); await page.mouse.down(); for (let i = 1; i <= 10; i++) await page.mouse.move(683 + i * 22, 560); await page.mouse.up()
  await page.waitForTimeout(2500)
  const after = await read()
  const targetMoved = Math.hypot(after.target[0] - before.target[0], after.target[2] - before.target[2]) * 1000
  const eyeMoved = Math.hypot(after.eye[0] - before.eye[0], after.eye[2] - before.eye[2]) * 1000
  check('30 km view keeps an oblique tilt (not forced top-down)', offAxis(before) > 30, `${offAxis(before).toFixed(0)}° from vertical`)
  check('left drag at 30 km orbits around the observed point', targetMoved < 50 && eyeMoved > 5000, `target moved ${targetMoved.toFixed(0)} m, eye moved ${(eyeMoved / 1000).toFixed(1)} km`)
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
