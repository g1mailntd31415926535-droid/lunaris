// Base clean-up evidence: default base view, close-up of the solar station, medium and wide views.
// Usage: node scripts/base_cleanup_views.mjs <label> [url]
import { chromium } from 'playwright'
const label = process.argv[2] ?? 'after', url = process.argv[3] ?? 'http://localhost:5173/?debug=1'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []; p.on('pageerror', (e) => errors.push(String(e)))
await p.goto(url)
await p.waitForFunction(() => document.querySelector('.world')?.dataset.ready === 'true' && window.__LUNARIS__, null, { timeout: 120000 })
const u = p.getByRole('button', { name: /Mình hiểu rồi/ }); if (await u.count()) await u.first().click()
await p.waitForTimeout(4000)
await p.screenshot({ path: `docs/evidence/base_cleanup/${label}_base_ui.png` })
await p.addStyleTag({ content: '.lunaris-app > *:not(.world){visibility:hidden!important}' })
for (const [id, alt] of [['base', null], ['near', 45], ['medium', 140], ['wide', 600]]) {
  if (alt) await p.evaluate((m) => window.__LUNARIS_CONTROLS__.altitude(m), alt)
  await p.waitForTimeout(6000)
  await p.screenshot({ path: `docs/evidence/base_cleanup/${label}_${id}_world.png` })
  console.log(id, await p.evaluate(() => [window.__LUNARIS__.trianglesPeak, window.__LUNARIS__.drawCallsPeak].join(' ')))
}
// Solar station close-up: fly to the station (colony (−9, −5.2) m) with the game's own focus, then zoom in.
await p.evaluate(() => window.__LUNARIS_TEST_FOCUS__(-9, -5.2)); await p.waitForTimeout(6000)
await p.evaluate(() => window.__LUNARIS_CONTROLS__.altitude(12)); await p.waitForTimeout(5000)
await p.screenshot({ path: `docs/evidence/base_cleanup/${label}_solar_world.png` })
// Sun tracking: angle between each panel head's facing (+z) and the scene Sun direction.
console.log('tracking', await p.evaluate(() => {
  const s = window.__LUNARIS_SCENE__, T = window.__LUNARIS_THREE__, out = []
  const sun = new T.Vector3(); s.traverse((n) => { if (n.isDirectionalLight && n.castShadow) sun.copy(n.position).sub(n.target.getWorldPosition(new T.Vector3())).normalize() })
  s.getObjectByName('solar-trackers')?.children.forEach((h) => { const f = new T.Vector3(0, 0, 1).applyQuaternion(h.getWorldQuaternion(new T.Quaternion())); out.push((Math.acos(Math.min(1, f.dot(sun))) * 180 / Math.PI).toFixed(2) + '°') })
  return out.join(', ')
}))
console.log(errors.length ? errors.join(' | ') : 'no page errors')
await b.close()
