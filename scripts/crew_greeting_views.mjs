// Close-up frames of the crew greeting (wave ×3, low-gravity hop) during the Basic onboarding.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = 'docs/evidence/onboarding'; mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
await page.addInitScript(() => localStorage.clear())
await page.goto('http://localhost:5173/?debug=1')
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 120000 })
await page.getByRole('button', { name: /Tiếp tục/ }).first().click()
await page.locator('.story-modes button', { hasText: 'Cơ bản' }).click()
await page.getByRole('button', { name: /SẴN SÀNG/ }).click()
await page.locator('.onb-skip').click({ timeout: 5000 }).catch(() => null)
await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
for (let i = 0; i < 60; i++) {
  const text = await page.locator('.mascot-bubble p').innerText().catch(() => '')
  if (text.startsWith('Và đây là đội ngũ')) break
  await page.locator('.mascot-bubble .dialogue-action').click({ timeout: 3000 }).catch(() => null)
  await page.waitForTimeout(text.includes('cực Nam') ? 11500 : 600)
}
await page.waitForTimeout(2500)
const actors = await page.evaluate(() => window.__LUNARIS__?.actors?.filter((a) => a.name.startsWith('astronaut:')).map((a) => a.name))
for (let k = 0; k < 8; k++) { await page.screenshot({ path: `${out}/crew_greet_${k}.png`, clip: { x: 520, y: 250, width: 360, height: 220 } }); await page.waitForTimeout(700) }
console.log(JSON.stringify({ actors }))
await browser.close()
