import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three'
import { seededRandom } from './terrain-field'

const textureCache = new Map<string, CanvasTexture>()

function canvas(width: number, height = width) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  return { canvas: c, ctx: c.getContext('2d')! }
}

function finish(c: HTMLCanvasElement, pixel = false) {
  const texture = new CanvasTexture(c)
  texture.colorSpace = SRGBColorSpace
  if (pixel) {
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.generateMipmaps = false
  }
  return texture
}

export function groundTexture() {
  if (textureCache.has('ground')) return textureCache.get('ground')!
  const { canvas: c, ctx } = canvas(512)
  const random = seededRandom(2019)
  const pixels = ctx.createImageData(c.width, c.height)
  const bands = [[5, 25], [13, 15], [31, 10], [73, 5]].map(([size, weight]) => ({ size, weight, cells: Float32Array.from({ length: size * size }, () => random() - 0.5) }))
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    let gray = 165 + (random() - 0.5) * 12
    for (const { size, weight, cells } of bands) {
      const u = x / c.width * size, v = y / c.height * size
      const a = Math.floor(u), b = Math.floor(v), nextX = (a + 1) % size, nextY = (b + 1) % size
      const fx = u - a, fy = v - b, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
      const top = cells[b * size + a] * (1 - sx) + cells[b * size + nextX] * sx
      const bottom = cells[nextY * size + a] * (1 - sx) + cells[nextY * size + nextX] * sx
      gray += weight * (top * (1 - sy) + bottom * sy)
    }
    const pixel = (y * c.width + x) * 4
    pixels.data[pixel] = pixels.data[pixel + 1] = pixels.data[pixel + 2] = gray
    pixels.data[pixel + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  const texture = finish(c)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.anisotropy = 4
  textureCache.set('ground', texture)
  return texture
}

export function solarTexture() {
  if (textureCache.has('solar')) return textureCache.get('solar')!
  const { canvas: c, ctx } = canvas(256)
  ctx.fillStyle = '#162b65'; ctx.fillRect(0, 0, 256, 256)
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 4; col++) {
      const x = col * 64 + 4, y = row * 42 + 4
      const g = ctx.createLinearGradient(x, y, x + 60, y + 40)
      g.addColorStop(0, '#3762b9'); g.addColorStop(0.5, '#244389'); g.addColorStop(1, '#162960')
      ctx.fillStyle = g; ctx.fillRect(x, y, 56, 35)
      ctx.strokeStyle = '#7b9cc6'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 56, 35)
      ctx.strokeStyle = 'rgba(144,180,228,.42)'
      for (let j = 1; j < 5; j++) { ctx.beginPath(); ctx.moveTo(x + 1, y + j * 6); ctx.lineTo(x + 54, y + j * 6); ctx.stroke() }
    }
  }
  const texture = finish(c)
  texture.anisotropy = 8
  textureCache.set('solar', texture)
  return texture
}

export function screenTexture(kind: string, accent: string) {
  const key = `screen-${kind}`
  if (textureCache.has(key)) return textureCache.get(key)!
  const { canvas: c, ctx } = canvas(128)
  ctx.fillStyle = '#0e2035'; ctx.fillRect(0, 0, 128, 128)
  const glow = ctx.createRadialGradient(64, 62, 4, 64, 62, 60)
  glow.addColorStop(0, accent + '30'); glow.addColorStop(1, accent + '00')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(5, 5, 118, 118)
  ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 5
  ctx.shadowColor = accent; ctx.shadowBlur = 9
  if (kind === 'water') {
    ctx.beginPath(); ctx.moveTo(64, 24); ctx.bezierCurveTo(52, 44, 34, 61, 35, 76); ctx.bezierCurveTo(36, 108, 93, 108, 93, 76); ctx.bezierCurveTo(94, 60, 75, 44, 64, 24); ctx.stroke()
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(46, 73); ctx.quadraticCurveTo(42, 86, 56, 88); ctx.stroke()
  } else if (kind === 'battery' || kind === 'solar') {
    ctx.beginPath(); ctx.moveTo(70, 21); ctx.lineTo(39, 69); ctx.lineTo(59, 69); ctx.lineTo(51, 106); ctx.lineTo(92, 56); ctx.lineTo(69, 56); ctx.closePath(); ctx.fill()
  } else if (kind === 'oxygen') {
    ctx.font = 'bold 53px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('O₂', 64, 83)
  } else if (kind === 'shelter') {
    ctx.fillRect(52, 29, 25, 70); ctx.fillRect(29, 52, 70, 25)
  } else if (kind === 'rover') {
    ctx.beginPath(); ctx.arc(80, 41, 16, 0.6, 4.8); ctx.lineTo(73, 41); ctx.lineTo(79, 29); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(67, 53); ctx.lineTo(37, 92); ctx.stroke()
    ctx.beginPath(); ctx.arc(34, 96, 7, 0, Math.PI * 2); ctx.stroke()
  } else if (kind === 'greenhouse') {
    ctx.beginPath(); ctx.moveTo(62, 104); ctx.lineTo(62, 67); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(62, 71); ctx.bezierCurveTo(17, 69, 24, 25, 26, 28); ctx.bezierCurveTo(58, 23, 71, 48, 62, 71); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(64, 60); ctx.bezierCurveTo(61, 28, 91, 26, 102, 29); ctx.bezierCurveTo(107, 62, 78, 72, 64, 60); ctx.stroke()
  } else {
    ctx.beginPath(); ctx.arc(64, 64, 30, 0, Math.PI * 2); ctx.stroke()
    ctx.save(); ctx.translate(64, 64); ctx.rotate(-0.6); ctx.beginPath(); ctx.ellipse(0, 0, 48, 12, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
    ctx.beginPath(); ctx.arc(81, 38, 6, 0, Math.PI * 2); ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.fillStyle = accent + '80'
  ctx.fillRect(13, 113, 22, 2); ctx.fillRect(93, 13, 20, 2)
  const texture = finish(c)
  textureCache.set(key, texture)
  return texture
}

function pixelAstronaut(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number, frame: number, back: boolean, accent: string) {
  const r = (x: number, y: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(offsetX + x, offsetY + y, w, h) }
  const dark = '#272b45', white = '#f4f2fa', shade = '#bbc0db', light = '#ffffff'
  const step = [0, 1, 0, -1][frame]
  // Backpack, leg joints, and an oversized stepped helmet are identity anchors.
  r(6, 22, 5, 10, dark); r(6, 23, 4, 7, shade); r(6, 25, 2, 3, accent)
  r(10, 27, 13, 6, dark); r(11, 28, 11, 4, shade)
  r(10 - step, 32, 5, 5 + step, dark); r(17 + step, 32, 5, 5 - step, dark)
  r(11 - step, 32, 3, 4 + step, white); r(18 + step, 32, 3, 4 - step, white)
  r(8 - step, 36 + step, 8, 3, dark); r(17 + step, 36 - step, 8, 3, dark)
  r(9 - step, 36 + step, 6, 2, accent); r(18 + step, 36 - step, 6, 2, accent)
  r(9, 21, 15, 11, dark); r(10, 21, 13, 9, white); r(20, 23, 3, 7, shade)
  r(12, 24, 7, 4, '#7586a9'); r(13, 24, 5, 2, light); r(14, 25, 2, 2, accent)
  r(7, 23 + step, 4, 7, dark); r(8, 23 + step, 3, 5, white); r(7, 28 + step, 4, 2, accent)
  r(23, 22 - step, 4, 8, dark); r(23, 23 - step, 3, 5, white); r(23, 28 - step, 4, 2, accent)
  r(9, 3, 13, 2, dark); r(6, 5, 19, 3, dark); r(4, 8, 23, 11, dark); r(6, 19, 19, 2, dark); r(9, 21, 13, 1, dark)
  r(9, 4, 13, 2, white); r(6, 6, 19, 3, white); r(5, 9, 21, 9, white); r(7, 18, 17, 2, shade); r(10, 20, 11, 1, shade)
  r(4, 10, 4, 8, dark); r(5, 11, 3, 6, shade); r(5, 12, 2, 3, accent)
  r(24, 10, 4, 8, dark); r(24, 11, 3, 6, shade); r(25, 12, 2, 3, accent)
  if (back) {
    r(8, 8, 15, 8, '#d7d9e9'); r(11, 8, 8, 2, light)
    r(11, 23, 10, 8, shade); r(12, 24, 8, 6, '#e3e7f3'); r(14, 25, 3, 3, accent)
  } else {
    r(8, 8, 16, 10, '#222c46'); r(9, 9, 14, 7, '#485d80')
    r(11, 10, 10, 7, '#ffcca5'); r(11, 9, 9, 3, '#493638'); r(10, 11, 3, 3, '#493638'); r(19, 10, 2, 3, '#493638')
    r(13, 13, 2, 2, '#2a2b3e'); r(18, 13, 2, 2, '#2a2b3e')
    r(14, 16, 4, 1, '#be705f'); r(11, 15, 2, 1, '#f8998d'); r(20, 15, 1, 1, '#f8998d')
    r(9, 9, 2, 2, '#8abfff'); r(10, 9, 3, 1, '#b2d8ff')
  }
}

export function astronautAtlas(accent: string) {
  const key = `astronaut-${accent}`
  if (textureCache.has(key)) return textureCache.get(key)!
  const { canvas: c, ctx } = canvas(128, 80)
  for (let frame = 0; frame < 4; frame++) {
    pixelAstronaut(ctx, frame * 32, 0, frame, false, accent)
    pixelAstronaut(ctx, frame * 32, 40, frame, true, accent)
  }
  const texture = finish(c, true)
  textureCache.set(key, texture)
  return texture
}

const portraitCache = new Map<string, string>()
export function portraitUrl(accent = '#ffbb69') {
  if (portraitCache.has(accent)) return portraitCache.get(accent)!
  const { canvas: c, ctx } = canvas(160)
  ctx.imageSmoothingEnabled = false
  const small = canvas(32, 40)
  pixelAstronaut(small.ctx, 0, 0, 0, false, accent)
  // Crop to the oversized helmet and chest for a clear commander portrait.
  ctx.drawImage(small.canvas, 2, 0, 28, 29, 0, -1, 160, 166)
  const url = c.toDataURL('image/png')
  portraitCache.set(accent, url)
  return url
}
