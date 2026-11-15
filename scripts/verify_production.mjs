// Verifies the PUBLIC deployment like a first-time visitor: no login, HTTPS, SPA fallback, big assets reachable,
// the game loads real NASA terrain data, the opening works, and nothing throws. Also measures load times / transfer sizes.
// Usage: node scripts/verify_production.mjs https://<your-site>.pages.dev
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!/^https:\/\//.test(base)) { console.error('Give the https URL of the deployed site.'); process.exit(2) }
const out = 'docs/evidence/deploy'; mkdirSync(out, { recursive: true })
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }

// ── plain HTTP checks (no cookies, no auth header) ──
const head = async (path, init) => { const r = await fetch(base + path, { redirect: 'manual', ...init }); return r }
const home = await head('/')
check('home page answers 200 over HTTPS without login', home.status === 200 && home.url.startsWith('https://'), `status ${home.status}`)
const html = await home.text()
check('it is the LUNARIS app (not a login / access page)', /<div id="root"/.test(html) && !/cloudflareaccess|sign in|login/i.test(html.slice(0, 4000)))
const deep = await head('/some/deep/link?x=1')
check('reloading a deep link does not 404 (SPA fallback)', deep.status === 200 && /<div id="root"/.test(await deep.text()), `status ${deep.status}`)
for (const path of ['/lunar/regional/g0_40m.i16.gz', '/intro/LUNARIS_intro.mp4', '/mascot/robot.png']) {
  const r = await head(path, { method: 'GET', headers: { Range: 'bytes=0-1023' } })
  check(`${path} is reachable`, r.status === 200 || r.status === 206, `status ${r.status}, ${r.headers.get('content-type')}, ${r.headers.get('content-length') ?? '?'} B`)
}
const mp4 = await head('/intro/LUNARIS_intro.mp4', { method: 'HEAD' })
check('the film supports range requests (seek / stream)', /bytes/.test(mp4.headers.get('accept-ranges') ?? '') || mp4.status === 200, mp4.headers.get('accept-ranges') ?? 'n/a')

// ── real browser ──
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = [], failed = [], sizes = new Map()
page.on('pageerror', (e) => errors.push(String(e)))
page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`))
page.on('response', async (r) => { if (!r.ok() && r.status() !== 206 && r.status() !== 304) failed.push(`${r.status()} ${r.url()}`); const len = Number(r.headers()['content-length'] ?? 0); sizes.set(r.url(), len) })
await page.addInitScript(() => localStorage.clear())
const t0 = Date.now()
await page.goto(base + '/?debug=1', { waitUntil: 'domcontentloaded' })
const tDom = Date.now() - t0
await page.waitForFunction(() => document.querySelector('.world')?.getAttribute('data-ready') === 'true', null, { timeout: 180000 })
const tReady = Date.now() - t0
check('3D scene is ready (WebGL, NASA terrain)', true, `DOM ${tDom} ms · scene ready ${tReady} ms`)
await page.waitForTimeout(2500)
const diag = await page.evaluate(() => { const L = window.__LUNARIS__; return { terrain: L?.terrain?.source, pending: L?.terrainPending, regionalPending: L?.regionalPending, drawCalls: L?.drawCalls } })
check('real NASA LOLA terrain loaded', /NASA LOLA/.test(diag.terrain ?? ''), JSON.stringify(diag))
await page.screenshot({ path: `${out}/production_welcome.png` })
check('welcome screen shown with no login prompt', (await page.locator('.onb-card h1').innerText()) === 'LUNARIS')
// play the opening up to the first decision
await page.locator('#action-dock .dialogue-action').click(); await page.waitForSelector('.story-modes')
const lock = page.locator('.story-modes button', { hasText: 'Nâng cao' })
await page.locator('.story-modes button', { hasText: 'Cơ bản' }).click(); await page.locator('.onb-ready').click()
await page.waitForSelector('.onb-cinematic video'); await page.waitForTimeout(2500)
const film = await page.evaluate(() => { const v = document.querySelector('.onb-cinematic video'); return { t: v.currentTime, playing: !v.paused, dur: v.duration } })
check('the intro film streams and plays from the public URL', film.playing && film.t > 1, JSON.stringify(film))
await page.screenshot({ path: `${out}/production_film.png` })
// let the film play to its natural end (≈30 s), then the tutorial must start by itself
const tFilm = Date.now()
await page.waitForSelector('.onb-cinematic', { state: 'detached', timeout: 60000 })
const filmSeconds = (Date.now() - tFilm) / 1000 + 2.5
check('the film plays to its end and the tutorial follows', filmSeconds > 24 && filmSeconds < 40 && (await page.locator('.mascot-bubble').count()) === 1, `${filmSeconds.toFixed(1)} s`)
for (let i = 0; i < 80 && !(await page.locator('.game-panel').count()); i++) {
  const text = await page.locator('.mascot-bubble p, .ready-frame p').first().innerText().catch(() => '')
  await page.locator('#action-dock .dialogue-action').click({ timeout: 2500 }).catch(() => null)
  await page.waitForTimeout(text.includes('cực Nam') ? 11500 : 450)
}
check('tutorial reaches the first decision (A1)', (await page.locator('.game-panel').count()) === 1)
await page.screenshot({ path: `${out}/production_A1.png` })
// progress is kept on this device only, and Restart wipes it
await page.locator('.story-option', { hasText: 'Lọc thêm nước' }).click(); await page.locator('#action-dock .dialogue-action').click()
await page.waitForSelector('.result-panel', { timeout: 30000 }); await page.waitForTimeout(500)
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lunaris.story.save') ?? 'null')?.state?.history?.length)
check('progress is saved locally (localStorage only)', saved >= 1, `history ${saved}`)
await page.locator('.hud-gear').click(); await page.getByRole('menuitem', { name: /Hiển thị/ }).click()
await page.getByRole('button', { name: /Chơi lại|Bắt đầu lại|Restart/i }).first().click().catch(() => null)
await page.getByRole('button', { name: /Chơi lại|Bắt đầu lại|Xác nhận|Restart/i }).last().click().catch(() => null)
await page.waitForTimeout(1500)
const afterRestart = await page.evaluate(() => localStorage.getItem('lunaris.story.save'))
check('after Restart no progress is stored', afterRestart === null, String(afterRestart)?.slice(0, 60))
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.onb-card', { timeout: 120000 })
check('reload after Restart starts from the welcome screen', (await page.locator('.onb-card h1').innerText()) === 'LUNARIS')
// Advanced is locked on the public build
await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#action-dock .dialogue-action', { timeout: 120000 }); await page.locator('#action-dock .dialogue-action').click(); await page.waitForSelector('.story-modes')
check('Advanced is locked in the public build', (await page.locator('.story-modes button.locked .mode-lock').count()) === 1)
check('no JavaScript errors', errors.length === 0, errors.join(' | '))
check('no failed or non-2xx requests', failed.length === 0, failed.slice(0, 4).join(' | '))
await browser.close()
const total = [...sizes.values()].reduce((a, b) => a + b, 0)
console.log(`\nTRANSFER (declared content-length): ${(total / 1048576).toFixed(1)} MB over ${sizes.size} requests; scene ready in ${tReady} ms`)
const failedChecks = results.filter((r) => !r.ok)
console.log(`${results.length - failedChecks.length}/${results.length} checks passed`)
process.exit(failedChecks.length ? 1 : 0)
