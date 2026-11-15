// Derives public/mascot/robot.png from the untouched reference: only background-coloured pixels (flood-filled from the
// border, plus pockets enclosed by the cable; colour within a small tolerance of the sampled background) become transparent. Every other pixel
// keeps its exact RGBA value. Usage: node scripts/mascot_make_transparent.mjs [tolerance]
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
const tol = Number(process.argv[2] ?? 6)
const b = await chromium.launch({ channel: 'chrome', headless: true }); const p = await b.newPage()
await p.goto('http://localhost:5173/mascot/robot-reference.webp')
const res = await p.evaluate(async (tol) => {
  const img = document.querySelector('img'); await img.decode()
  const W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas'); c.width = W; c.height = H
  const x = c.getContext('2d'); x.drawImage(img, 0, 0); const data = x.getImageData(0, 0, W, H), d = data.data
  // background colour = median of the border pixels
  const border = []; for (let i = 0; i < W; i += 7) border.push(i, (H - 1) * W + i); for (let j = 0; j < H; j += 7) border.push(j * W, j * W + W - 1)
  const ch = (k) => border.map((i) => d[i * 4 + k]).sort((a, b) => a - b)[border.length >> 1]
  const bg = [ch(0), ch(1), ch(2)]
  const near = (i) => Math.abs(d[i * 4] - bg[0]) <= tol && Math.abs(d[i * 4 + 1] - bg[1]) <= tol && Math.abs(d[i * 4 + 2] - bg[2]) <= tol
  const seen = new Uint8Array(W * H), stack = []
  for (let i = 0; i < W; i++) stack.push(i, (H - 1) * W + i); for (let j = 0; j < H; j++) stack.push(j * W, j * W + W - 1)
  let cleared = 0
  // The cable is a thin grey line (low saturation, mid value). The fill may pass through it, without clearing it,
  // so background pockets enclosed by the cable are reached; the navy outline of the body is never crossed.
  const cable = (i) => { const r = d[i * 4], g = d[i * 4 + 1], bl = d[i * 4 + 2], v = (r + g + bl) / 3; return v > 55 && v < 140 && Math.abs(r - g) < 14 && Math.abs(g - bl) < 16 }
  while (stack.length) { const i = stack.pop(); if (seen[i]) continue; const bgPx = near(i); if (!bgPx && !cable(i)) continue; seen[i] = 1; if (bgPx) { d[i * 4 + 3] = 0; cleared++ }
    const X = i % W, Y = (i / W) | 0; if (X > 0) stack.push(i - 1); if (X < W - 1) stack.push(i + 1); if (Y > 0) stack.push(i - W); if (Y < H - 1) stack.push(i + W) }
  x.putImageData(data, 0, 0)
  return { bg, cleared, total: W * H, png: c.toDataURL('image/png') }
}, tol)
writeFileSync('public/mascot/robot.png', Buffer.from(res.png.split(',')[1], 'base64'))
console.log(JSON.stringify({ bg: res.bg, cleared: res.cleared, total: res.total, tol }))
await b.close()
