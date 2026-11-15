// The journey cinematic is now the real film (public/intro/LUNARIS_intro.mp4), not the 1 → 0 countdown.
// Checks: the video plays full-screen after SẴN SÀNG, has sound, the countdown is gone, "Bỏ qua" works,
// and the tutorial starts by itself when the film ends.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const out = 'docs/evidence/intro_video'; mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }
const DOCK = '#action-dock .dialogue-action'

async function toCinematic() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => localStorage.clear())
  await page.goto('http://localhost:5173/?debug=1')
  await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 120000 })
  await page.waitForSelector(DOCK); await page.locator(DOCK).click(); await page.waitForSelector('.story-modes')
  await page.locator('.story-modes button', { hasText: 'Cơ bản' }).click(); await page.locator('.onb-ready').click()
  await page.waitForSelector('.onb-cinematic video', { timeout: 5000 })
  return { page, errors }
}

// 1. plays, full screen, with sound, no countdown
{
  const { page, errors } = await toCinematic()
  await page.waitForTimeout(2500)
  const v = await page.evaluate(() => { const e = document.querySelector('.onb-cinematic video'); const r = e.getBoundingClientRect(); return { src: e.currentSrc, t: e.currentTime, paused: e.paused, muted: e.muted, dur: e.duration, w: Math.round(r.width), h: Math.round(r.height), vw: e.videoWidth, countdown: document.querySelectorAll('.onb-count').length } })
  check('the film plays after SẴN SÀNG', /LUNARIS_intro\.mp4$/.test(v.src) && !v.paused && v.t > 1, JSON.stringify(v))
  check('it plays with sound (not muted)', v.muted === false)
  check('the 1 → 0 countdown is gone', v.countdown === 0)
  check('video fills the screen', v.w === 1440 && v.h === 900)
  await page.screenshot({ path: `${out}/film_playing.png` })
  const objectFit = await page.evaluate(() => getComputedStyle(document.querySelector('.onb-cinematic video')).objectFit)
  check('whole picture is visible (object-fit: contain)', objectFit === 'contain', objectFit)
  // 2. the tutorial starts by itself when the film ends
  await page.evaluate(() => { const e = document.querySelector('.onb-cinematic video'); e.currentTime = e.duration - 0.4 })
  await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
  await page.waitForSelector('.mascot-bubble', { timeout: 8000 })
  check('when the film ends the robot tutorial begins', (await page.locator('.mascot-bubble p').innerText()).startsWith('Xin chào'))
  check('no page errors (film end)', errors.length === 0, errors.join(' | '))
  await page.close()
}
// 3. "Bỏ qua" skips it
{
  const { page, errors } = await toCinematic()
  await page.waitForTimeout(1200)
  await page.locator('.onb-skip').click()
  await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 10000 })
  await page.waitForSelector('.mascot-bubble', { timeout: 8000 })
  const stopped = await page.evaluate(() => !document.querySelector('.onb-cinematic video'))
  check('"Bỏ qua" skips the film and starts the tutorial', stopped)
  check('no page errors (skip)', errors.length === 0, errors.join(' | '))
  await page.close()
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
await browser.close(); process.exit(failed.length ? 1 : 0)
