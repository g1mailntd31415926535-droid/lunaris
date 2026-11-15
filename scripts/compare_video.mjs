// Compares two videos by mean luminance at the same timestamps (catches wrong content / time shift after re-encoding).
// Usage: node scripts/compare_video.mjs <urlA> <urlB>
import { chromium } from 'playwright'
const [a, b] = [process.argv[2], process.argv[3]]
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const lum = async (url) => {
  const page = await browser.newPage()
  await page.goto(url)
  const out = await page.evaluate(async () => {
    const v = document.querySelector('video'); v.muted = true
    await new Promise((r) => v.readyState >= 2 ? r() : v.addEventListener('loadeddata', r, { once: true }))
    const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d', { willReadFrequently: true })
    const res = []
    for (let t = 0.5; t < v.duration - 0.3; t += 2.5) {
      v.currentTime = t; await new Promise((r) => v.addEventListener('seeked', r, { once: true })); await new Promise((r) => setTimeout(r, 120))
      x.drawImage(v, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3
      res.push([+t.toFixed(1), Math.round(s / (d.length / 4))])
    }
    return res
  })
  await page.close(); return out
}
const A = await lum(a), B = await lum(b)
console.log('t     A    B'); A.forEach(([t, l], i) => console.log(String(t).padEnd(5), String(l).padEnd(4), B[i]?.[1]))
await browser.close()
