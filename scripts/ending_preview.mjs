// Renders the REAL Ending screen from a state produced by scripts/ending_sample.mjs (injected as a save; no fake UI).
// Usage: node scripts/ending_preview.mjs [keep|stow] [baseUrl]
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const which = process.argv[2] ?? 'keep', base = process.argv[3] ?? 'http://localhost:5173'
const save = readFileSync(`docs/evidence/ending/sample_state_${which}.json`, 'utf-8')
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
await page.addInitScript((s) => localStorage.setItem('lunaris.story.save', s), save)
await page.goto(base + '/?debug=1')
await page.waitForSelector('.story-ending-card', { timeout: 120000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `docs/evidence/ending/ending_${which}_top.png` })
await page.evaluate(() => document.querySelector('.story-ending').scrollTo(0, 780)); await page.waitForTimeout(300)
await page.screenshot({ path: `docs/evidence/ending/ending_${which}_chains.png` })
await page.evaluate(() => document.querySelector('.story-ending').scrollTo(0, 99999)); await page.waitForTimeout(300)
await page.screenshot({ path: `docs/evidence/ending/ending_${which}_why.png` })
console.log(JSON.stringify({ chains: await page.locator('.chain').count(), steps: await page.locator('.chain .step').count(), errors }))
await browser.close()
