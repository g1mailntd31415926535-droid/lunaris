// Share of the world-only frame that shows the plain dark backdrop (rgb(9,13,30) = #090D1E, ±6 per channel),
// i.e. "no NASA data" — at given camera heights. Usage: node scripts/dark_fraction.mjs <label> [alt_m ...]
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
const label = process.argv[2] ?? 'probe'
const alts = (process.argv.slice(3).length ? process.argv.slice(3) : ['6000', '60000', '400000']).map(Number)
const out = process.env.DARK_OUT ?? 'reports/screenshots'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
await page.goto(process.env.LUNARIS_URL ?? 'http://localhost:5173/?debug=1', { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120_000 })
const understood = page.getByRole('button', { name: /Mình hiểu rồi/ }); if (await understood.count()) await understood.first().click()
await page.addStyleTag({ content: '.lunaris-app > *:not(.world){visibility:hidden!important}' })
const rows = []
for (const alt of alts) {
  await page.evaluate((m) => window.__LUNARIS_CONTROLS__.altitude(m), alt)
  let last = ''
  for (let i = 0; i < 80; i++) { await page.waitForTimeout(500); const now = await page.evaluate(() => JSON.stringify([window.__LUNARIS__.camera.map((v) => +v.toFixed(7)), window.__LUNARIS__.terrainPending ?? 0])); if (now === last && !now.endsWith(',1]') && i > 4) break; last = now }
  await page.waitForTimeout(1000)
  const file = `${out}/${label}_dark_${alt}.png`
  await page.screenshot({ path: file })
  const dark = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data; let n = 0
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 9) <= 6 && Math.abs(d[i + 1] - 13) <= 6 && Math.abs(d[i + 2] - 30) <= 6) n++
    return n / (d.length / 4)
  }, (await import('node:fs')).readFileSync(file).toString('base64'))
  const info = await page.evaluate(() => ({ alt: window.__LUNARIS__.altitudeM, viewCentreKm: window.__LUNARIS__.viewCentre, cameraKm: window.__LUNARIS__.camera, nodata: !!document.querySelector('.nodata-chip') }))
  rows.push({ requestedAltitudeM: alt, darkPct: +(dark * 100).toFixed(1), ...info, file })
  console.log(alt, (dark * 100).toFixed(1) + '%', JSON.stringify(info.viewCentreKm))
}
writeFileSync(`${out}/${label}_dark.json`, JSON.stringify(rows, null, 2))
await browser.close()
