// End-to-end Story Mode playthrough in a real browser, using only the player's buttons.
// Usage: node scripts/story_playthrough.mjs [basic|advanced] [both|food|ice|early] [url]
import { chromium } from 'playwright'
import { onboard } from './lib/onboard.mjs'
import { mkdirSync } from 'node:fs'

const mode = process.argv[2] ?? 'basic', plan = process.argv[3] ?? 'both'
const url = process.argv[4] ?? 'http://localhost:5173/?debug=1'
const out = 'docs/evidence/story'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript(() => localStorage.clear())
await page.goto(url)
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 120000 })
const shot = (name) => page.screenshot({ path: `${out}/${mode}_${plan}_${name}.png` })
// A decision may pop up at any moment (time is running), so a click that gets covered just retries next loop.
const click = async (locator) => { try { if (await locator.count()) { await locator.first().click({ timeout: 1500 }); return true } } catch { /* covered by a new dialog */ } return false }
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('lunaris.story.save') ?? '{}').state)

await onboard(page, mode)
await shot('00_after_onboarding')
await page.waitForTimeout(2500)

const picks = { A1: 'Lọc thêm nước', A3: 'Thu gọn', B1: 'Sửa ngay', D1: 'nhà kính', D2: plan === 'ice' ? 'Phi hành đoàn' : 'rover', D3: 'Chờ', C31: 'Đi tiếp chậm' }
const seen = [], shots = new Set()
const t0 = Date.now()
let lastDay = 0
while (Date.now() - t0 < 12 * 60_000) {
  const s = await state()
  if (!s) { await page.waitForTimeout(500); continue }
  if (s.phase === 'ended') break
  const dialog = page.locator('.story-decision')
  if (await dialog.count()) {
    const key = s.decisions[0]?.key
    if (key && !shots.has(key)) { shots.add(key); await page.waitForTimeout(400); await shot(`decision_${key}`) }
    seen.push(key)
    let done = false
    if (key === 'C1') done = await click(page.locator('.story-option:not([disabled])', { hasText: plan === 'ice' || plan === 'both' ? 'Khu A' : 'Khu C' }))
    else if (key === 'C2') done = await click(page.locator('.story-option:not([disabled])', { hasText: 'Đi tuyến A*' }))
    else if (picks[key]) done = await click(page.locator('.story-option:not([disabled])', { hasText: picks[key] }))
    if (!done) await click(page.locator('.story-option:not([disabled])'))
    await page.waitForTimeout(600)
    continue
  }
  if (await page.locator('.hud-time').count() && !(await page.locator('.speed-button[aria-label^="Tốc độ 8"]').count())) { await click(page.locator('.hud-time .speed-button')); continue }   // ×8
  if (await page.locator('.hud-alert').count()) { await click(page.locator('.hud-alert')); continue }
  if (s.isPaused && s.phase === 'playing' && !s.decisions.length) await click(page.locator('.hud-time button[aria-label^="Tiếp tục"]'))
  // Player actions through the panels (the same buttons a child presses).
  const act = async (building, text) => {
    await page.evaluate((b) => window.__LUNARIS_TEST_SELECT__?.(b), building)
    await page.waitForTimeout(150)
    return click(page.locator('.building-action:not([disabled])', { hasText: text }))
  }
  if (s.stage === 'A2') { await act('oxygen', 'Bật máy điện phân'); await page.waitForTimeout(500); continue }
  if (s.stage === 'free') {
    const day = Math.floor(s.clock.elapsedMinutes / 1440) + 1
    if (plan !== 'ice' && s.food.stage === 'growing' && day !== lastDay) { if (await act('greenhouse', 'Quan sát cây')) lastDay = day }
    if (plan !== 'ice' && s.food.stage === 'growing' && s.food.growth >= 0.85) await act('greenhouse', 'Thu hoạch')
    if (plan !== 'ice' && s.food.stage === 'harvested') await act('greenhouse', 'Lập báo cáo')
    if (plan !== 'food' && s.ice.stage === 'idle' && !s.ice.report) await act('rover', 'Bắt đầu nghiên cứu băng')
    if (s.ice.stage === 'outbound' && !shots.has('rover')) { shots.add('rover'); await shot('rover_outbound') }
    const doneBoth = (plan === 'food' ? true : !!s.ice.report) && (plan === 'ice' ? true : !!s.food.report)
    if ((plan === 'early') || (plan === 'both' && doneBoth)) {
      await act('command', 'Nộp báo cáo')
      await click(page.locator('.modal .primary-button', { hasText: 'Nộp và trở về' }))
    }
  }
  await page.waitForTimeout(700)
}
await page.waitForSelector('.story-ending', { timeout: 60000 }).catch(() => null)
await page.waitForTimeout(1500)
await shot('99_ending')
const s = await state()
const ending = await page.locator('.story-ending').innerText().catch(() => '')
console.log(JSON.stringify({ mode, plan, phase: s?.phase, reason: s?.ending?.reason, day: Math.floor((s?.clock.elapsedMinutes ?? 0) / 1440) + 1, food: s?.food.report, ice: s?.ice.report, decisions: seen, errors }, null, 1))
console.log(ending.slice(0, 1500))
await browser.close()
