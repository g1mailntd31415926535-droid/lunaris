// Lists where draw calls and triangles come from (per named group), for reports/task02_performance.md.
// Usage: node scripts/scene_breakdown.mjs [url]
import { chromium } from 'playwright'
const url = process.argv[2] ?? 'http://localhost:5173/?debug=1'
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
await page.goto(url)
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true' && !!window.__LUNARIS__, null, { timeout: 120_000 })
const ok = page.getByRole('button', { name: /Mình hiểu rồi/ }); if (await ok.count()) await ok.first().click()
await page.waitForTimeout(4000)
const rows = await page.evaluate(() => {
  const scene = window.__LUNARIS_SCENE__
  const groups = new Map()
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return
    // pick-only meshes (invisible material) are never drawn
    let visible = !(o.material && !Array.isArray(o.material) && o.material.visible === false), top = '(scene)', path = []
    for (let n = o; n; n = n.parent) { if (!n.visible) visible = false; if (n.name) path.unshift(n.name) }
    top = [...path].reverse().find((p) => /^(interactive:|astronaut:|rover:MILO|illustrative-rocks|colony-decoration|living-colony|lunar-terrain|moon-surface|autonomous-exploration-system|science-zones|celestial:(earth|sun|stars))/.test(p)) ?? path[path.length - 1] ?? '(unnamed)'
    if (top.startsWith('interactive:')) top = 'buildings'
    if (top.startsWith('astronaut:') || top === 'living-colony') top = 'astronauts'
    const g = o.geometry, count = Math.min(g.index ? g.index.count : g.attributes.position.count, g.drawRange.count)
    const tris = o.isMesh ? Math.round(count / 3) * (o.isInstancedMesh ? o.count : 1) : 0
    const e = groups.get(top) ?? { group: top, objects: 0, visibleCalls: 0, triangles: 0, shadowCasters: 0, shadowTriangles: 0, materials: new Set() }
    e.objects++
    if (visible) { e.visibleCalls++; e.triangles += tris; if (o.castShadow) { e.shadowCasters++; e.shadowTriangles += tris } }
    e.materials.add(Array.isArray(o.material) ? 'multi' : o.material.uuid)
    groups.set(top, e)
  })
  return [...groups.values()].map((e) => ({ ...e, materials: e.materials.size })).sort((a, b) => b.triangles - a.triangles)
})
console.table(rows)
const total = rows.reduce((s, r) => ({ calls: s.calls + r.visibleCalls, tris: s.tris + r.triangles, sc: s.sc + r.shadowCasters, st: s.st + r.shadowTriangles }), { calls: 0, tris: 0, sc: 0, st: 0 })
console.log('scene totals (before frustum culling):', total, '· renderer.info this frame:', await page.evaluate(() => ({ calls: window.__LUNARIS__.drawCalls, triangles: window.__LUNARIS__.triangles })))
await browser.close()
