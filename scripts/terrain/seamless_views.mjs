// Seamless-terrain evidence: the same camera heights, rendered normally and with three diagnostic overrides.
// Usage:  node scripts/terrain/seamless_views.mjs <label> [url]
//   label  e.g. before | after       (screenshots go to docs/evidence/seamless/<label>_*.png)
// Diagnostics (applied through the ?debug=1 scene handle, never to the data):
//   wire   – every terrain/globe mesh drawn as wireframe (geometry joins, gaps, walls)
//   flat   – one uniform grey Lambert material, no textures (separates lighting from mesh faults)
//   albedo – unlit colour only (texture/colour seams without any lighting)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const label = process.argv[2] ?? 'before'
const url = process.argv[3] ?? 'http://localhost:5173/?debug=1'
const out = 'docs/evidence/seamless'
mkdirSync(out, { recursive: true })
const VIEWS = [
  { id: '00900m', altitudeM: 900 },
  { id: '06km', altitudeM: 6000 },
  { id: '30km', altitudeM: 30_000 },
  { id: '120km', altitudeM: 120_000 },
  { id: '600km', altitudeM: 600_000 },
]
const DIAG = (process.env.DIAG ?? 'none,wire,flat,albedo').split(',')

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120_000 })
const understood = page.getByRole('button', { name: /Mình hiểu rồi/ })
if (await understood.count()) await understood.first().click()
await page.addStyleTag({ content: '.lunaris-app > *:not(.world){visibility:hidden!important}' })

async function settle() {
  let last = ''
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(400)
    const now = await page.evaluate(() => JSON.stringify([window.__LUNARIS__.camera.map((v) => +v.toFixed(6)), window.__LUNARIS__.terrainPending ?? 0, window.__LUNARIS__.regionalPending ?? 0]))
    if (now === last && now.endsWith(',0,0]') && i > 3) break
    last = now
  }
  await page.waitForTimeout(800)
}

// Swap materials on every mesh whose name marks it as terrain or globe; restore afterwards.
async function diagnose(mode) {
  await page.evaluate((mode) => {
    const scene = window.__LUNARIS_SCENE__, THREE = window.__LUNARIS_THREE__
    const saved = (window.__LUNARIS_DIAG_SAVED__ ??= new Map())
    scene.traverse((node) => {
      if (!node.isMesh || !/^(dem-terrain|moon-|regional-terrain)/.test(node.name)) return
      if (!saved.has(node)) saved.set(node, node.material)
      const original = saved.get(node)
      if (mode === 'none') { node.material = original; return }
      if (mode === 'wire') { const m = original.clone(); m.onBeforeCompile = original.onBeforeCompile; m.customProgramCacheKey = original.customProgramCacheKey; m.wireframe = true; node.material = m; return }
      if (mode === 'flat') { node.material = new THREE.MeshLambertMaterial({ color: '#9a9a9a', side: THREE.DoubleSide }); return }
      if (mode === 'albedo') { const m = original.clone(); m.onBeforeCompile = original.onBeforeCompile; m.customProgramCacheKey = () => original.customProgramCacheKey() + '-albedo'; m.userData.albedoOnly = true; m.defines = { ...(m.defines ?? {}), LUNARIS_ALBEDO_ONLY: '' }; node.material = m }
    })
  }, mode)
}

const shots = []
for (const view of VIEWS) {
  await page.evaluate((m) => window.__LUNARIS_CONTROLS__.altitude(m), view.altitudeM)
  await settle()
  for (const mode of DIAG) {
    await diagnose(mode)
    await page.waitForTimeout(700)
    const file = `${out}/${label}_${view.id}_${mode}.png`
    await page.screenshot({ path: file })
    const info = await page.evaluate(() => { const d = window.__LUNARIS__; return { altitudeM: d.altitudeM, triangles: d.triangles, trianglesPeak: d.trianglesPeak, drawCalls: d.drawCalls, frameMs: d.frameMs, terrain: d.terrain, regional: d.regional ?? null } })
    shots.push({ view: view.id, mode, file, ...info })
    console.log(view.id, mode, 'tris', info.triangles, 'calls', info.drawCalls)
  }
  await diagnose('none')
}
writeFileSync(`${out}/${label}_views.json`, JSON.stringify({ label, url, when: new Date().toISOString(), errors, shots }, null, 2))
console.log(errors.length ? `page errors: ${errors.join(' | ')}` : 'no page errors')
await browser.close()
