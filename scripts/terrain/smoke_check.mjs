// Browser smoke check for the Task 02 terrain (needs the dev/preview server and installed Chrome).
// Usage: node scripts/terrain/smoke_check.mjs [url]
import { chromium } from 'playwright'
const url = process.argv[2] ?? 'http://localhost:5173/?debug=1'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url)
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120_000 })
const ok = page.getByRole('button', { name: /Mình hiểu rồi/ }); if (await ok.count()) await ok.first().click()
await page.keyboard.press('Space')                       // resume mission + visual time
const results = []
const check = (name, pass, detail) => { results.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail ?? '') }
const diag = () => page.evaluate(() => { const d = window.__LUNARIS__; return { rover: d.rover, terrain: d.terrain, alt: d.altitudeM, clearance: d.clearanceM, calls: d.drawCalls, tris: d.triangles, targets: d.targets.length, actors: d.actors } })

let d = await diag()
check('terrain source is the NASA DEM', d.terrain.source.includes('NASA LOLA'), d.terrain.source)
check('base view draws 5 m tiles', d.terrain.finestLevel === 0, `levels ${d.terrain.levels}`)
check('rover stands on the DEM at the depot', d.rover.groundError < 0.02, `error ${d.rover.groundError.toFixed(4)} m`)

// Buildings are drawn by the merged colony batch; clicks must still reach each building's pick volume.
{
  const targets = await page.evaluate(() => window.__LUNARIS__.targets)
  const picked = []
  for (const t of targets) {
    if (t.x < 380 || t.x > 1000 || t.y < 200 || t.y > 530) continue          // skip spots under the HUD panels
    await page.mouse.click(t.x, t.y); await page.waitForTimeout(400)
    const title = await page.$eval('.building-title h3', (n) => n.textContent).catch(() => null)
    picked.push(`${t.id}→${title}`)
  }
  const titles = new Set(picked.map((p) => p.split('→')[1]))
  check('building clicks reach the pick volumes (batched models)', picked.length >= 3 && titles.size === picked.length && !titles.has('null'), picked.join(', '))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
}

// Drive: seek the presentation clock to mid-leg and to the turn-back point.
await page.evaluate(() => window.__LUNARIS_ROVER__.seek(400)); await page.waitForTimeout(4000)
d = await diag()
check('rover is driving toward a real anchor', d.rover.phase === 'outbound' && /Hướng tới [ABCD]/.test(d.rover.site), `${d.rover.phase} · ${d.rover.site} · ${d.rover.distance.toFixed(0)} m from base`)
check('rover stays on the DEM away from the camera', d.rover.groundError < 0.05, `error ${d.rover.groundError.toFixed(4)} m`)
check('rover status names the A* route and its limits', /Tuyến A\*/.test(await page.evaluate(() => window.__LUNARIS__.rover.note ?? '')) , await page.evaluate(() => window.__LUNARIS__.rover.note))
check('rover speed is the 0.7 m/s scenario value', Math.abs(d.rover.speed - 0.7) < 0.01, `${d.rover.speed}`)

// Science zone markers at region scale.
await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(3000)); await page.waitForTimeout(6000)
const zones = await page.$$eval('.zone-marker', (nodes) => nodes.map((n) => n.textContent))
check('four science zone markers exist', zones.length === 4, zones.map((z) => z.slice(0, 1)).join(''))
check('markers report the A* result per zone (A, B, C route; D none)', ['A', 'B', 'C'].every((id) => /có tuyến dốc ≤ 15°/.test(zones.find((z) => z.startsWith(id)) ?? '')) && /không có tuyến dốc ≤ 15°/.test(zones.find((z) => z.startsWith('D')) ?? ''))
check('markers say ice is unconfirmed and await the rover', zones.every((z) => /chưa xác nhận/.test(z) && /chờ rover xác minh/.test(z)))

// Zoomed out, the screen centre frames the middle of the NASA data circle (local (2500, −1500) m), not empty backdrop.
{
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(6000)); await page.waitForTimeout(7000)
  const c = await page.evaluate(() => window.__LUNARIS__.viewCentre.map((v) => v * 1000))
  const off = Math.hypot(c[0] - 2500, c[2] + 1500)
  check('6 km view is centred on the map circle', off < 250, `screen centre at (${c[0].toFixed(0)}, ${c[2].toFixed(0)}) m, ${off.toFixed(0)} m from circle centre`)
  check('no "outside NASA data" label at the centred 6 km view', (await page.$('.nodata-chip')) === null)
  // At 60 km the framing is still on (it fades 60 → 250 km): the camera must stay 60 km up, not be dragged to the ground.
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(60000)); await page.waitForTimeout(8000)
  const far = await page.evaluate(() => ({ c: window.__LUNARIS__.viewCentre.map((v) => v * 1000), clearance: window.__LUNARIS__.clearanceM }))
  const farOff = Math.hypot(far.c[0] - 2500, far.c[2] + 1500)
  check('60 km view keeps its height and the map circle in the centre', far.clearance > 54000 && farOff < 250 && (await page.$('.nodata-chip')) === null, `clearance ${(far.clearance / 1000).toFixed(1)} km, screen centre ${farOff.toFixed(0)} m from circle centre`)
  await page.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(520)); await page.waitForTimeout(6000)
  const t = await page.evaluate(() => window.__LUNARIS__.viewCentre.map((v) => v * 1000))
  check('region view (520 m) still frames the base', Math.hypot(t[0], t[2]) < 60, `screen centre at (${t[0].toFixed(0)}, ${t[2].toFixed(0)}) m`)
}

// Fly to zone D (Site04) through its marker; the camera must end over valid data near D.
await page.$$eval('.zone-marker', (nodes) => nodes.find((n) => n.textContent.startsWith('D')).click()); await page.waitForTimeout(7000)
d = await diag()
const target = await page.evaluate(() => window.__LUNARIS__.target.map((v) => v * 1000))
check('focus on D moves the camera ~10 km from base', Math.abs(Math.hypot(target[0], target[2]) - 10034) < 60, `target ${target.map((v) => v.toFixed(0))}`)
check('no "outside NASA data" label over D', (await page.$('.nodata-chip')) === null)

// Look at a NoData area inside the circle (north-west of both tiles).
await page.evaluate(() => window.__LUNARIS__ && document.querySelector('.zone-marker'))
await page.evaluate(() => { const w = window.__LUNARIS_TEST_FOCUS__; if (w) w(-7000, -9000) }); await page.waitForTimeout(7000)
const chip = await page.$eval('.nodata-chip', (n) => n.textContent).catch(() => null)
check('NoData area is labelled "ngoài vùng dữ liệu NASA"', !!chip && /Ngoài vùng dữ liệu NASA/i.test(chip), chip ?? 'no chip')
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
await browser.close()
const failed = results.filter((r) => !r.pass).length
console.log(`${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
