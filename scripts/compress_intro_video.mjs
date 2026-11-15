// Re-encodes the intro film to fit Cloudflare Pages' 25 MiB per-file limit, using Chrome's own encoder
// (no extra download): plays public/intro/LUNARIS_intro.mp4 and records it with MediaRecorder at a lower bitrate.
// The original film is never modified; the result is written to public/intro/LUNARIS_intro_web.mp4 (H.264 + AAC) or .webm.
// Usage: node scripts/compress_intro_video.mjs [videoKbps] [audioKbps]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const vk = Number(process.argv[2] ?? 3000), ak = Number(process.argv[3] ?? 128)
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage()
await page.goto('http://localhost:5173/intro/LUNARIS_intro.mp4')
const res = await page.evaluate(async ({ vk, ak }) => {
  const v = document.querySelector('video')
  await new Promise((r) => v.readyState >= 3 ? r() : v.addEventListener('canplaythrough', r, { once: true }))
  const types = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus']
  const type = types.find((t) => MediaRecorder.isTypeSupported(t))
  if (!type) return { error: 'no supported recorder type' }
  v.currentTime = 0; v.muted = false; v.volume = 1
  const stream = v.captureStream()
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: vk * 1000, audioBitsPerSecond: ak * 1000 })
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const stopped = new Promise((r) => { rec.onstop = r })
  rec.start(1000)
  await v.play()
  await new Promise((r) => v.addEventListener('ended', r, { once: true }))
  await new Promise((r) => setTimeout(r, 300))
  rec.stop(); await stopped
  const blob = new Blob(chunks, { type: type.split(';')[0] })
  const buf = new Uint8Array(await blob.arrayBuffer())
  let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return { type, bytes: buf.length, b64: btoa(bin), tracks: stream.getTracks().map((t) => t.kind) }
}, { vk, ak })
if (res.error) { console.error(res.error); process.exit(1) }
const ext = res.type.startsWith('video/mp4') ? 'mp4' : 'webm'
writeFileSync(`public/intro/LUNARIS_intro_web.${ext}`, Buffer.from(res.b64, 'base64'))
console.log(JSON.stringify({ type: res.type, MB: +(res.bytes / 1048576).toFixed(2), tracks: res.tracks, file: `public/intro/LUNARIS_intro_web.${ext}` }))
await browser.close()
