// Checks for: locked Advanced + in-flow SẴN SÀNG, HUD pointer arrow, centered frames, ready announcement,
// and the "crew member really does the task" presentation (camera, glow, hidden panels, speed reset).
// Part 1 runs WITHOUT ?debug=1 (the lock); part 2 uses ?debug=1 (scene hook).
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = 'docs/evidence/ui_round3'; mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }
const DOCK = '#action-dock .dialogue-action'

async function open(url, vp = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport: vp }); const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => localStorage.clear())
  await page.goto(url)
  await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 120000 })
  return { page, errors }
}
const centre = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? { dx: Math.round(r.left + r.width / 2 - innerWidth / 2), dy: Math.round(r.top + r.height / 2 - innerHeight / 2) } : null }, sel)
const nextText = (page) => page.locator('.mascot-bubble p, .ready-frame p').first().innerText().catch(() => '')

// ── 1: lock, pointer arrow, ready announcement, centered A1 (no debug flag) ──
{
  const { page, errors } = await open('http://localhost:5173/')
  await page.waitForSelector(DOCK); await page.locator(DOCK).click(); await page.waitForSelector('.story-modes')
  const adv = page.locator('.story-modes button', { hasText: 'Nâng cao' })
  check('Advanced shows a red padlock and is aria-disabled', (await adv.locator('.mode-lock').count()) === 1 && (await adv.getAttribute('aria-disabled')) === 'true')
  const lockColor = await adv.locator('.mode-lock').evaluate((e) => getComputedStyle(e).color)
  check('padlock is red', /rgb\(255, 93, 93\)/.test(lockColor), lockColor)
  await adv.click({ force: true })
  check('clicking the locked Advanced does not select it', (await adv.getAttribute('aria-pressed')) === 'false' && await page.locator('.onb-ready').isDisabled())
  await page.locator('.story-modes button', { hasText: 'Cơ bản' }).click()
  const pos = await page.evaluate(() => { const b = document.querySelector('.onb-ready').getBoundingClientRect(), m = document.querySelector('.story-modes').getBoundingClientRect(); return { below: b.top >= m.bottom, inDock: !!document.querySelector('#action-dock .onb-ready'), cx: Math.round(b.left + b.width / 2 - innerWidth / 2) } })
  check('SẴN SÀNG sits directly under the choices (not in the corner dock)', pos.below && !pos.inDock && Math.abs(pos.cx) < 3, JSON.stringify(pos))
  await page.screenshot({ path: `${out}/mode_select_locked.png` })
  await page.locator('.onb-ready').click()
  await page.locator('.onb-skip').click({ timeout: 5000 }).catch(() => null)
  await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
  let arrow = null, ready = null
  for (let i = 0; i < 80 && !ready; i++) {
    const text = await nextText(page)
    if (!arrow && text.startsWith('Đầu tiên là điện năng')) {
      await page.waitForTimeout(900)
      arrow = await page.evaluate(() => { const el = document.querySelector('.hud-chip.highlight'); if (!el) return null; const a = getComputedStyle(el, '::after'); return { border: a.borderBottomWidth, content: a.content, anim: a.animationName } })
      await page.screenshot({ path: `${out}/hud_arrow_battery.png` })
    }
    if (await page.locator('.ready-frame').count()) {
      await page.waitForTimeout(700)
      ready = { text: await page.locator('.ready-frame p').innerText(), c: await centre(page, '.ready-frame'), label: await page.locator(DOCK).innerText() }
      await page.screenshot({ path: `${out}/ready_frame_centered.png` }); break
    }
    await page.locator(DOCK).click({ timeout: 3000 }).catch(() => null)
    await page.waitForTimeout(text.includes('cực Nam') ? 11500 : 500)
  }
  check('arrow points at the highlighted HUD chip (14 px triangle, animated)', arrow && arrow.border === '14px' && arrow.content !== 'none', JSON.stringify(arrow))
  check('"bắt đầu nhiệm vụ đầu tiên … sẵn sàng chưa?" is announced before the game', !!ready && /bắt đầu nhiệm vụ đầu tiên/.test(ready.text) && /sẵn sàng chưa/.test(ready.text), ready?.text)
  check('ready frame is in the middle of the screen', ready && Math.abs(ready.c.dx) <= 2 && Math.abs(ready.c.dy) <= 2, JSON.stringify(ready?.c))
  check('ready frame button is "Bắt đầu nhiệm vụ"', ready?.label.trim() === 'Bắt đầu nhiệm vụ', ready?.label)
  await page.locator(DOCK).click()
  await page.waitForSelector('.game-panel', { timeout: 10000 })
  await page.waitForTimeout(700)
  const dc = await centre(page, '.game-panel')
  check('A1 decision panel is centered on the screen', dc && Math.abs(dc.dx) <= 2 && Math.abs(dc.dy) <= 2, JSON.stringify(dc))
  await page.screenshot({ path: `${out}/decision_centered.png` })
  check('no page errors (lock / tutorial)', errors.length === 0, errors.join(' | '))
  await page.close()
}

// ── 2: the crew member really does the task (debug build for the scene hook) ──
{
  const { page, errors } = await open('http://localhost:5173/?debug=1')
  await page.waitForSelector(DOCK); await page.locator(DOCK).click(); await page.waitForSelector('.story-modes')
  await page.locator('.story-modes button', { hasText: 'Cơ bản' }).click(); await page.locator('.onb-ready').click()
  await page.locator('.onb-skip').click({ timeout: 5000 }).catch(() => null)
  await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
  for (let i = 0; i < 80 && !(await page.locator('.game-panel').count()); i++) {
    const text = await nextText(page)
    await page.locator(DOCK).click({ timeout: 2500 }).catch(() => null)
    await page.waitForTimeout(text.includes('cực Nam') ? 11500 : 450)
  }
  await page.waitForSelector('.game-panel')
  // speed ×8 first, to prove the task resets it to ×1
  for (let i = 0; i < 4 && !(await page.locator('.speed-button[aria-label^="Tốc độ 8"]').count()); i++) await page.locator('.hud-time .speed-button').click()
  const pre = await page.locator('.hud-time .speed-button').innerText()
  await page.locator('.story-option', { hasText: 'Lọc thêm nước' }).click()
  await page.waitForTimeout(250)
  await page.locator(DOCK).click()
  const sample = () => page.evaluate(() => {
    const scene = window.__LUNARIS_SCENE__
    let actor = null; scene.traverse((o) => { if (o.name === 'astronaut:Linh') actor = o })
    const glow = []; actor?.traverse((o) => { if (o.name.startsWith('glow')) glow.push(o.visible) })
    const L = window.__LUNARIS__
    return { glowVisible: glow.length === 2 && glow.every(Boolean), speed: document.querySelector('.hud-time .speed-button')?.innerText, panels: ['.game-panel', '.objective-chip', '.mascot-bubble', '.context-panel'].map((s) => document.querySelectorAll(s).length), altitude: Math.round(L.altitudeM), pos: L.actors.find((a) => a.name === 'astronaut:Linh')?.position.map((v) => Math.round(v * 10) / 10) }
  })
  const where = () => page.evaluate(() => window.__LUNARIS__.actors.find((a) => a.name === 'astronaut:Linh')?.position)
  await page.waitForTimeout(350); const p0 = await where()
  await page.waitForTimeout(700); const p1 = await where()
  await page.waitForTimeout(750)
  const walking = await sample(); await page.screenshot({ path: `${out}/task_walking.png` })
  await page.waitForTimeout(2200)
  const working = await sample(); await page.screenshot({ path: `${out}/task_working.png` })
  check(`speed reset to ×1 (was ${pre.trim()})`, walking.speed.trim() === '1×' && pre.trim() === '8×', JSON.stringify([pre, walking.speed]))
  check('crew member glows while doing the task', walking.glowVisible && working.glowVisible, JSON.stringify([walking.glowVisible, working.glowVisible]))
  check('panels (decision, objective, mascot bubble, side panel) are hidden during the task', walking.panels.every((n) => n === 0) && working.panels.every((n) => n === 0), JSON.stringify([walking.panels, working.panels]))
  check('camera is zoomed onto the base work area', walking.altitude < 40 && working.altitude < 20, `${walking.altitude} m → ${working.altitude} m`)
  const step = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]), toSite = Math.hypot(walking.pos[0] - p0[0], walking.pos[2] - p0[2])
  check('astronaut walks (continuous movement, not a teleport)', step > 0.4 && step < 8 && toSite > step, `${step.toFixed(1)} m in 0.7 s, ${toSite.toFixed(1)} m to the site`)
  await page.waitForSelector('.result-panel', { timeout: 15000 })
  await page.waitForTimeout(600)   // let the panel's own 0.22 s entrance finish
  const after = await sample(); const rc = await centre(page, '.result-panel')
  check('result panel returns after the task, centered, glow off', Math.abs(rc.dx) <= 2 && Math.abs(rc.dy) <= 2 && !after.glowVisible, JSON.stringify([rc, after.glowVisible]))
  await page.screenshot({ path: `${out}/result_centered.png` })
  check('no page errors (task)', errors.length === 0, errors.join(' | '))
  await page.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
await browser.close(); process.exit(failed.length ? 1 : 0)
