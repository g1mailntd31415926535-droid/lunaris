// Probes a video URL in Chrome: duration, size, whether audio and video actually decode, and saves a frame.
// Usage: node scripts/probe_video.mjs <url> [frameOut.png]
import { chromium } from 'playwright'
const url = process.argv[2], frame = process.argv[3]
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const p = await b.newPage({ viewport: { width: 1280, height: 720 } })
await p.goto(url)
const r = await p.evaluate(async () => {
  const v = document.querySelector('video')
  await new Promise((res) => v.readyState >= 3 ? res() : v.addEventListener('canplaythrough', res, { once: true }))
  v.muted = false; await v.play(); await new Promise((res) => setTimeout(res, 3000))
  return { duration: v.duration, w: v.videoWidth, h: v.videoHeight, played: v.currentTime, audioBytes: v.webkitAudioDecodedByteCount, videoBytes: v.webkitVideoDecodedByteCount }
})
console.log(JSON.stringify(r))
if (frame) { await p.evaluate(() => { const v = document.querySelector('video'); v.currentTime = 12 }); await p.waitForTimeout(1000); await p.screenshot({ path: frame }) }
await b.close()
