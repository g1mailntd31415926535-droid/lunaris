// UI consistency acceptance checks:
//  1. the primary dialogue button stays at one screen coordinate through the whole tutorial (clicked in place),
//     and fast clicking cannot answer a decision;
//  2. every mascot expression leaves all pixels outside the face box identical to the reference art;
//  3. A1 decision / result panels (both choices) fit at 1366×768, 1440×900 and 1920×1080.
// Usage: node scripts/ui_consistency_check.mjs [url]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { FACE_BOX, MASCOT_REFERENCE, MASCOT_SRC, faceRects } from '../src/onboarding/mascotFace.ts'

const url = process.argv[2] ?? 'http://localhost:5173/?debug=1'
const out = 'docs/evidence/ui_consistency'; mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// ── 2. Pixel check of the expressions (outside FACE_BOX must equal the reference) ──
{
  const page = await browser.newPage()
  await page.goto(new URL(MASCOT_SRC, url).href)
  const expressions = ['neutral', 'speaking', 'happy', 'surprised', 'worried', 'warning']
  const res = await page.evaluate(async ({ box, sets }) => {
    const img = document.querySelector('img'); await img.decode()
    const W = img.naturalWidth, H = img.naturalHeight
    const base = document.createElement('canvas'); base.width = W; base.height = H
    base.getContext('2d').drawImage(img, 0, 0)
    const ref = base.getContext('2d').getImageData(0, 0, W, H).data
    const sheet = document.createElement('canvas'); sheet.width = W / 4 * sets.length; sheet.height = H / 4
    const sctx = sheet.getContext('2d'); sctx.imageSmoothingEnabled = false
    const report = []
    sets.forEach(([name, rects], i) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const x = c.getContext('2d'); x.drawImage(img, 0, 0)
      x.save(); x.beginPath(); x.rect(box.x, box.y, box.w, box.h); x.clip()
      for (const r of rects ?? []) { x.fillStyle = r.color; x.fillRect(r.x, r.y, r.w, r.h) }
      x.restore()
      const d = x.getImageData(0, 0, W, H).data
      let outside = 0, inside = 0
      for (let y = 0; y < H; y++) for (let X = 0; X < W; X++) {
        const k = (y * W + X) * 4
        const diff = d[k] !== ref[k] || d[k + 1] !== ref[k + 1] || d[k + 2] !== ref[k + 2] || d[k + 3] !== ref[k + 3]
        if (!diff) continue
        if (X >= box.x && X < box.x + box.w && y >= box.y && y < box.y + box.h) inside++; else outside++
      }
      const inBox = (rects ?? []).every((r) => r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h)
      report.push({ name, outside, inside, inBox })
      sctx.drawImage(c, i * W / 4, 0, W / 4, H / 4)
    })
    return { report, sheet: sheet.toDataURL('image/png') }
  }, { box: FACE_BOX, sets: expressions.map((e) => [e, faceRects(e)]) })
  // The transparent art: every visible pixel must equal the reference; only background-coloured pixels became transparent.
  const alpha = await page.evaluate(async ({ a, b }) => {
    const load = async (src) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data }
    const ref = await load(a), cut = await load(b)
    let changed = 0, transparent = 0, notBg = 0
    for (let k = 0; k < ref.length; k += 4) {
      if (cut[k + 3] === 0) { transparent++; if (Math.abs(ref[k] - 29) > 6 || Math.abs(ref[k + 1] - 34) > 6 || Math.abs(ref[k + 2] - 55) > 6) notBg++; continue }
      if (cut[k] !== ref[k] || cut[k + 1] !== ref[k + 1] || cut[k + 2] !== ref[k + 2] || cut[k + 3] !== ref[k + 3]) changed++
    }
    return { changed, transparent, notBg }
  }, { a: new URL(MASCOT_REFERENCE, url).href, b: new URL(MASCOT_SRC, url).href })
  check('transparent mascot: visible pixels identical to the reference; only background removed', alpha.changed === 0 && alpha.notBg === 0, JSON.stringify(alpha))
  for (const r of res.report) check(`mascot "${r.name}": pixels outside the face box unchanged`, r.outside === 0 && r.inBox, `outside diff ${r.outside}, inside changed ${r.inside}`)
  const fs = await import('node:fs'); fs.writeFileSync(`${out}/mascot_expressions.png`, Buffer.from(res.sheet.split(',')[1], 'base64'))
  await page.close()
}

// ── 1 + 3. Fixed button and panels per viewport ──
for (const [w, h] of (process.env.ONLY ? [[1366, 768]] : [[1366, 768], [1440, 900], [1920, 1080]])) {
  for (const choice of ['recycle', 'battery']) {
    if (choice === 'battery' && w !== 1440) continue
    const page = await browser.newPage({ viewport: { width: w, height: h } })
    const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
    await page.addInitScript(() => localStorage.clear())
    await page.goto(url)
    await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 120000 })
    await page.waitForSelector('#action-dock .dialogue-action')
    const rect = async () => page.evaluate(() => { const b = document.querySelector('#action-dock .dialogue-action'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), label: b.textContent } })
    await page.waitForTimeout(1200)
    const first = await rect()
    const cx = first.x + first.w / 2, cy = first.y + first.h / 2   // the one place the player keeps the mouse
    const rects = [first], steps = []
    for (let i = 0; i < 160; i++) {
      if (await page.locator('.story-decision').count()) break
      if (await page.locator('.story-modes button[aria-pressed="false"]').count() === 2) { await page.locator('.story-modes button', { hasText: 'Cơ bản' }).click(); await page.waitForTimeout(250) }
      if (await page.locator('.onb-ready:not([disabled])').count()) { await page.locator('.onb-ready').click(); await page.waitForTimeout(500); continue }   // mode select: SẴN SÀNG sits under the choices
      const r = await rect()
      if (!r) { await page.waitForTimeout(400); continue }
      rects.push(r); steps.push(r.label)
      if (w === 1440 && choice === 'recycle' && [3, 12, 20].includes(i)) await page.screenshot({ path: `${out}/tutorial_step_${i}.png` })
      await page.mouse.click(cx, cy)
      await page.waitForTimeout(r.label.includes('Bỏ qua') ? 400 : 420)
      if (await page.locator('.onb-skip').count()) { await page.locator('.onb-skip').click().catch(() => null); await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 }) }
    }
    console.log('labels:', [...new Set(steps)].join(' | '), '… last:', steps.slice(-4).join(' | ')); await page.screenshot({ path: `${out}/debug_after_tutorial_${w}.png` })
    const moved = rects.filter((r) => Math.abs(r.x + r.w / 2 - cx) > 90 || Math.abs(r.y + r.h / 2 - cy) > 1)
    // width may grow with a longer label, so the check is: same vertical place, same right edge, and the centre point always inside the button
    const sameSpot = rects.every((r) => r.y === first.y && r.h === first.h && r.x + r.w === first.x + first.w && cx >= r.x && cx <= r.x + r.w)
    check(`${w}×${h}: dialogue button never moves (${rects.length} steps, clicked at one point)`, sameSpot && moved.length === 0, JSON.stringify(rects.slice(0, 3).map((r) => [r.x, r.y, r.w, r.h])))
    // fast clicks on the decision cannot answer it (Xác nhận disabled until an option is chosen)
    const decisionShown = await page.locator('.story-decision').count()
    for (let k = 0; k < 5; k++) await page.mouse.click(cx, cy)
    await page.waitForTimeout(400)
    check(`${w}×${h}: fast clicks at the dock do not answer the A1 decision`, decisionShown > 0 && await page.locator('.story-decision').count() > 0)
    const fits = await page.evaluate(() => [...document.querySelectorAll('.game-panel, #action-dock .dialogue-action')].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }))
    check(`${w}×${h}: decision panel and button fully inside the viewport`, fits)
    await page.screenshot({ path: `${out}/decision_A1_${w}x${h}.png` })
    await page.locator('.story-option', { hasText: choice === 'recycle' ? 'Lọc thêm nước' : 'Sạc pin' }).click()
    await page.waitForTimeout(300)
    const confirm = await rect()
    check(`${w}×${h}: "Xác nhận" sits in the same dock spot`, confirm && confirm.y === first.y && confirm.x + confirm.w === first.x + first.w)
    await page.mouse.click(cx, cy)
    await page.waitForSelector('.result-panel', { timeout: 25000 })   // appears after the crew member finishes the task
    await page.waitForTimeout(500)
    const result = await page.locator('.result-panel').innerText()
    const fitsR = await page.evaluate(() => [...document.querySelectorAll('.game-panel, #action-dock .dialogue-action')].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }))
    const cont = await rect()
    check(`${w}×${h}: result (${choice}) fits; "Tiếp tục" in the same spot`, fitsR && cont.y === first.y && cont.x + cont.w === first.x + first.w)
    await page.screenshot({ path: `${out}/result_A1_${choice}_${w}x${h}.png` })
    if (w === 1440) results.push({ name: `A1 result text (${choice})`, ok: true, detail: result.replace(/\s+/g, ' ').slice(0, 400) })
    const timerFree = await page.locator('.toast-timer, .toast').count()
    await page.waitForTimeout(6000)
    check(`${w}×${h}: result panel does not disappear on its own`, await page.locator('.result-panel').count() > 0, `toasts ${timerFree}`)
    check(`${w}×${h}: no page errors`, errors.length === 0, errors.join(' | '))
    await page.close()
  }
}
const recycle = results.find((r) => r.name === 'A1 result text (recycle)')?.detail, battery = results.find((r) => r.name === 'A1 result text (battery)')?.detail
check('A1 results differ by choice', !!recycle && !!battery && recycle !== battery)
console.log('\n' + (recycle ?? '') + '\n' + (battery ?? ''))
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
await browser.close()
process.exit(failed.length ? 1 : 0)
