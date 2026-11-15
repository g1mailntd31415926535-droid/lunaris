// LUNA-01 mascot: the original pixel-art PNG/WebP supplied by the user (public/mascot/robot-reference.webp,
// 1205 × 1306, kept byte-for-byte) is the only body art. Expressions are an overlay that repaints ONLY the
// inside of the face screen (FACE_BOX, in the original image's pixel coordinates). Everything outside the box
// is never drawn over, so it stays identical to the reference (checked by scripts/ui_consistency_check.mjs).
export const MASCOT_REFERENCE = '/mascot/robot-reference.webp'
/** Same art with only the background made transparent (scripts/mascot_make_transparent.mjs); every visible pixel equals the reference. */
export const MASCOT_SRC = '/mascot/robot.png'
export const MASCOT_SIZE = { w: 1205, h: 1306 }
/** Repaint area: around both eyes, inside the dark screen (x 408–792, y 518–733), clear of the top-left highlight. */
export const FACE_BOX = { x: 466, y: 562, w: 280, h: 150 }
export const SCREEN = '#2c3554'          // sampled screen colour rgb(44, 53, 84)
export const EYE = '#80fbfd'             // sampled LED colour rgb(128, 251, 253)
export const AMBER = '#ffb347'

export type Expression = 'neutral' | 'speaking' | 'happy' | 'surprised' | 'worried' | 'warning'
export interface FaceRect { x: number; y: number; w: number; h: number; color: string }

// Measured eyes in the reference: 43 × 103 px at x 489 / 680, y 585 → one art pixel ≈ 21 px.
const U = 21, CY = 636, EYES = [510, 701]
const block = (cx: number, cy: number, w: number, h: number, color = EYE): FaceRect => ({ x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, color })

/** Rects for one expression, or null for "neutral" (the reference pixels are shown unchanged). */
export function faceRects(e: Expression): FaceRect[] | null {
  if (e === 'neutral') return null
  const out: FaceRect[] = [{ ...FACE_BOX, color: SCREEN }]                      // clear the screen interior first
  for (const cx of EYES) {
    if (e === 'speaking') out.push(block(cx, CY, 2 * U, 3 * U))                  // eyes narrow while talking
    if (e === 'happy') out.push(block(cx - U, CY + U / 2, U, U), block(cx, CY - U / 2, U, U), block(cx + U, CY + U / 2, U, U))   // ^ ^
    if (e === 'surprised') out.push(block(cx, CY, 3 * U, 3 * U), block(cx, CY, U, 5 * U), block(cx, CY, 3 * U, U), block(cx, CY, U, U, SCREEN))   // wide round eyes
    if (e === 'worried') { const s = cx < 600 ? 1 : -1; out.push(block(cx, CY + U, 2 * U, 2 * U), block(cx - s * U / 2, CY - 1.5 * U, U, U), block(cx + s * U / 2, CY - 2.5 * U, U, U)) }   // brows rising inward
    if (e === 'warning') out.push(block(cx, CY + U, 2 * U, U, AMBER))
  }
  if (e === 'warning') out.push(block(605, CY - 0.5 * U, U, 3 * U, AMBER), block(605, CY + 2 * U, U, U, AMBER))   // "!" on the screen
  return out
}
