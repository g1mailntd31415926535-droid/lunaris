// Reproducible BEFORE/AFTER screenshots for reports/task02_style_before_after.md.
// Usage:  node scripts/capture_views.mjs before|after  [url]
// Needs the dev/preview server running and installed Chrome (Playwright channel "chrome").
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const label = process.argv[2] ?? 'before'
const url = process.argv[3] ?? process.env.LUNARIS_URL ?? 'http://localhost:5173/?debug=1'
const out = 'reports/screenshots'
mkdirSync(out, { recursive: true })

// Camera views are set only through the game's own debug control (altitude in metres
// above the look-at point); yaw/polar stay at the game defaults. Same calls for BEFORE and AFTER.
const VIEWS = [
  { id: 'base', altitudeM: null, note: 'Góc mặc định khi mở game (Căn cứ)' },
  { id: 'near', altitudeM: 90, note: 'Cận cảnh địa hình quanh căn cứ' },
  { id: 'region', altitudeM: 900, note: 'Nhìn khu vực quanh căn cứ' },
  { id: 'wide', altitudeM: 6000, note: 'Nhìn rộng vùng cực Nam' },
]
const VIEWPORT = { width: 1366, height: 768 }
const DPR = 1

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
let terrainBytes = 0, terrainRequests = 0, totalBytes = 0
page.on('response', async (r) => { try { const n = (await r.body()).length; totalBytes += n; if (r.url().includes('/lunar/task02/')) { terrainBytes += n; terrainRequests++ } } catch { /* aborted */ } })
const t0 = Date.now()
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120_000 })
const readyMs = Date.now() - t0, initial = { readyMs, terrainBytes, terrainRequests, totalBytes }
// Fresh story state; closing the briefing leaves mission time paused, so scene time is fixed.
const understood = page.getByRole('button', { name: /Mình hiểu rồi/ })
if (await understood.count()) await understood.first().click()
await page.waitForTimeout(1500)

const shots = []
for (const view of VIEWS) {
  if (view.altitudeM !== null) await page.evaluate((m) => window.__LUNARIS_CONTROLS__.altitude(m), view.altitudeM)
  // Wait until the damped camera stops moving and any streamed terrain has settled.
  let last = ''
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500)
    const now = await page.evaluate(() => JSON.stringify([window.__LUNARIS__.camera.map((v) => +v.toFixed(7)), window.__LUNARIS__.terrainPending ?? 0]))
    if (now === last && !now.endsWith(',1]') && i > 4) break
    last = now
  }
  await page.waitForTimeout(1500)
  const info = await page.evaluate(() => { const d = window.__LUNARIS__; return { cameraPositionKm: d.camera, cameraTargetKm: d.target, viewCentreKm: d.viewCentre, altitudeM: d.altitudeM, clearanceM: d.clearanceM, mode: d.mode, sceneTimeS: d.time, drawCalls: d.drawCalls, triangles: d.triangles, drawCallsPeak: d.drawCallsPeak, trianglesPeak: d.trianglesPeak, terrain: d.terrain, frameMs: d.frameMs, renderer: d.renderer, threeRevision: d.revision } })
  const withUi = `${out}/${label}_${view.id}_ui.png`, worldOnly = `${out}/${label}_${view.id}_world.png`
  await page.screenshot({ path: withUi })
  await page.addStyleTag({ content: '.lunaris-app > *:not(.world){visibility:hidden!important}' }).then(async (tag) => { await page.waitForTimeout(300); await page.screenshot({ path: worldOnly }); await tag.evaluate((n) => n.remove()) })
  shots.push({ ...view, files: [withUi, worldOnly], ...info })
  console.log(view.id, 'alt', info.altitudeM.toFixed(1), 'tris', info.triangles, 'calls', info.drawCalls, 'peak', info.drawCallsPeak, info.trianglesPeak)
}
const gpu = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown' })
let commit = 'unknown'
try { commit = execSync('git rev-parse --short HEAD').toString().trim() + (execSync('git status --porcelain -- src public').toString().trim() ? ' + uncommitted changes' : '') } catch { /* not a git checkout */ }
writeFileSync(`${out}/${label}_views.json`, JSON.stringify({ label, capturedAt: new Date().toISOString(), url, commit, viewport: VIEWPORT, deviceScaleFactor: DPR, fovDeg: 40, cameraYawPolar: 'mặc định của game (yaw 0.61, nearPolar 0.925)', browser: `Chrome ${browser.version()} headless`, gpu, pageErrors: errors, initialLoad: { ...initial, note: 'localhost, không giới hạn băng thông, dev server (module chưa bundle); readyMs = từ lúc mở trang tới khi cảnh 3D sẵn sàng' }, streamedAfterAllViews: { terrainBytes, terrainRequests }, views: shots }, null, 2))
await browser.close()
console.log('saved', shots.length, 'views →', out, errors.length ? `(page errors: ${errors.length})` : '')
