// Screenshots of the opening flow: welcome → mode → countdown → guided tour → game (Basic or Advanced).
// Usage: node scripts/onboarding_views.mjs [basic|advanced] [url]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const mode = process.argv[2] ?? 'basic', url = process.argv[3] ?? 'http://localhost:5173/?debug=1'
const out = 'docs/evidence/onboarding'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript(() => localStorage.clear())
await page.goto(url)
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 120000 })
let n = 0
const shot = async (name) => { await page.screenshot({ path: `${out}/${mode}_${String(n++).padStart(2, '0')}_${name}.png` }) }
await page.waitForSelector('.onb-card'); await page.waitForTimeout(1500); await shot('welcome')
await page.getByRole('button', { name: /Tiếp tục/ }).click(); await page.waitForTimeout(800); await shot('mode')
await page.locator('.story-modes button', { hasText: mode === 'basic' ? 'Cơ bản' : 'Nâng cao' }).click(); await shot('mode_chosen')
await page.getByRole('button', { name: /SẴN SÀNG/ }).click(); await page.waitForTimeout(500); await shot('countdown')
await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
await page.waitForTimeout(4000)
const hud = () => page.evaluate(() => [...document.querySelectorAll('[data-hud]')].map((e) => `${e.getAttribute('data-hud')}${e.classList.contains('highlight') ? '*' : ''}`).join(','))
const log = []
for (let i = 0; i < 40; i++) {
  const next = page.locator('#action-dock .dialogue-action')
  if (!(await next.count())) break
  const text = await page.locator('.mascot-bubble p, .onb-caption p').first().innerText().catch(() => '')
  log.push(`${text} | HUD: ${await hud()}`)
  await shot(`tour_${text.slice(0, 18).replace(/[^\p{L}\d]+/gu, '_')}`)
  const label = await next.first().innerText()
  await next.first().click()
  await page.waitForTimeout(text.includes('cực Nam') || label.includes('Bỏ qua') ? 11500 : 1200)
}
await page.waitForTimeout(2500)
await shot('game_start')
const decision = await page.locator('.story-decision').count()
console.log(log.join('\n'))
console.log(JSON.stringify({ mode, decisionShown: decision > 0, hud: await hud(), state: await page.evaluate(() => JSON.parse(localStorage.getItem('lunaris.story.save') ?? '{}').state?.phase), errors }, null, 1))
await browser.close()
