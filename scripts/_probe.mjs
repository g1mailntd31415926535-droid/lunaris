import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
await page.goto('http://localhost:5173/?debug=1')
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120000 })
for (const a of process.argv.slice(2).map(Number)) {
  await page.evaluate((m) => window.__LUNARIS_CONTROLS__.altitude(m), a); await page.waitForTimeout(8000)
  const r = await page.evaluate(() => { const d = window.__LUNARIS__; const f = (x) => x.map((v) => +v.toFixed(3)); return { alt: Math.round(d.altitudeM), cam: f(d.camera), tgt: f(d.target), vc: f(d.viewCentre), clr: Math.round(d.clearanceM), terr: d.terrain?.triangles, tiles: d.terrain?.tiles, dc: d.drawCalls } })
  console.log(a, JSON.stringify(r))
}
await browser.close()
