// Opening flow and the robot mascot. Presentation only; the game starts when the tour ends.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { FACE_BOX, MASCOT_SIZE, MASCOT_SRC, faceRects } from '../onboarding/mascotFace'
import type { Expression } from '../onboarding/mascotFace'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Gauge, Lightbulb, Lock, Rocket, X } from 'lucide-react'
import { MODES, WELCOME } from '../onboarding/script'
import type { TourStep } from '../onboarding/script'

/**
 * The one primary action of a guidance / result dialog. Always drawn at the dialog's bottom-right corner
 * (same size and margin everywhere, see .dialogue-action in styles.css). Enter / Space press it when it is the
 * only dialogue action on screen and focus is not on a choice (see useDialogueKeys in App).
 */
let lastPress = 0
/**
 * Rendered into the fixed action dock (#action-dock, bottom-right of the viewport) through a portal, so its
 * screen position never depends on the dialog's size, text animation, mascot face, camera or HUD.
 * The same <button> node is reused while a dialogue advances; only its label/handler change.
 * A short lock stops a fast double click from skipping two steps (and a decision's "Xác nhận" stays disabled
 * until an option is picked, so clicking through dialogue can never answer a decision).
 */
export function DialogueActionButton({ label, onClick, disabled, icon }: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode }) {
  const dock = typeof document !== 'undefined' ? document.getElementById('action-dock') : null
  const button = <button className="dialogue-action" data-dialogue-action="" disabled={disabled} onClick={(e) => { e.stopPropagation(); const now = performance.now(); if (now - lastPress < 320) return; lastPress = now; onClick() }}>{icon}<span>{label}</span>{!icon && <ArrowRight size={16} />}</button>
  return dock ? createPortal(button, dock) : button
}

export function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return <motion.div className="onb-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="onb-card" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3, duration: 0.7 }}>
      <h1 className="onb-logo">{WELCOME.title}</h1>
      {WELCOME.lines.map((l) => <p key={l}>{l}</p>)}
      <DialogueActionButton label="Tiếp tục" onClick={onNext} />
    </motion.div>
  </motion.div>
}

/**
 * Mode choice. Advanced is locked (small red padlock, not selectable) unless the page is opened with ?debug=1
 * (used by the automated tests). The SẴN SÀNG button is NOT in the action dock here: it sits right under the choices.
 */
export function ModeSelect({ onReady, advancedUnlocked = false }: { onReady: (mode: 'basic' | 'advanced') => void; advancedUnlocked?: boolean }) {
  const [mode, setMode] = useState<'basic' | 'advanced' | null>(null)
  return <motion.div className="onb-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="onb-card wide" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <span className="eyebrow">CHỌN CHẾ ĐỘ CHƠI</span>
      <div className="story-modes">{(['basic', 'advanced'] as const).map((m) => {
        const locked = m === 'advanced' && !advancedUnlocked
        return <button key={m} className={`${mode === m ? 'chosen' : ''} ${locked ? 'locked' : ''}`} aria-pressed={mode === m} aria-disabled={locked} title={locked ? 'Chế độ Nâng cao đang bị khóa' : undefined} onClick={() => { if (!locked) setMode(m) }}>
          {locked && <span className="mode-lock" aria-label="Đã khóa"><Lock size={15} strokeWidth={2.4} /></span>}
          {m === 'basic' ? <Lightbulb size={20} /> : <Gauge size={20} />}<strong>{MODES[m].title}</strong>{MODES[m].lines.map((l) => <span key={l}>{l}</span>)}</button>
      })}</div>
      <button className="onb-ready" data-dialogue-action="" disabled={!mode} onClick={() => mode && onReady(mode)}><Rocket size={16} /><span>SẴN SÀNG</span></button>
    </motion.div>
  </motion.div>
}

/** The journey film (30 s, with narration). Replaces the old 1 → 0 countdown. */
export const INTRO_VIDEO = '/intro/LUNARIS_intro.mp4'

/**
 * Plays the intro film full-screen right after SẴN SÀNG (that click is the user gesture that lets it start with sound;
 * if the browser still refuses, it retries muted). The tutorial starts when the film ends, on "Bỏ qua", or if the
 * file cannot be played. The video element is released on unmount so it never keeps decoding.
 */
export function IntroCinematic({ onDone, videoSrc = INTRO_VIDEO }: { onDone: () => void; videoSrc?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const done = useRef(onDone); done.current = onDone
  useEffect(() => {
    const v = video.current
    // Only an autoplay-policy refusal (NotAllowedError) falls back to muted; an interrupted play() (re-mount) does not.
    if (v) v.play().catch((e: Error) => { if (e?.name !== 'NotAllowedError') return; v.muted = true; v.play().catch(() => done.current()) })
    // Stop at unmount; free the file only if the element is really gone (React dev re-mounts the same element once).
    return () => { if (v) { v.pause(); setTimeout(() => { if (!v.isConnected) { v.removeAttribute('src'); v.load() } }, 1000) } }
  }, [])
  return <motion.div className="onb-cinematic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
    <video ref={video} src={videoSrc} playsInline preload="auto" onEnded={() => done.current()} onError={() => done.current()} />
    <button className="onb-skip" onClick={() => done.current()}>Bỏ qua<X size={13} /></button>
  </motion.div>
}

/** The robot mascot with a small speech bubble (Basic). `onNext` is shown as a continue button when given. */
/** The original robot art (never redrawn) with the face-screen overlay for the expression. */
export function MascotArt({ expression }: { expression: Expression }) {
  const rects = faceRects(expression)
  return <span className="mascot-art" data-expression={expression}>
    <img className="mascot-image" src={MASCOT_SRC} width={MASCOT_SIZE.w} height={MASCOT_SIZE.h} alt="Robot trợ lý LUNA-01" draggable={false} />
    {rects && <svg className="mascot-face" viewBox={`0 0 ${MASCOT_SIZE.w} ${MASCOT_SIZE.h}`} shapeRendering="crispEdges" aria-hidden="true">
      <clipPath id="mascot-face-box"><rect x={FACE_BOX.x} y={FACE_BOX.y} width={FACE_BOX.w} height={FACE_BOX.h} /></clipPath>
      <g clipPath="url(#mascot-face-box)">{rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />)}</g>
    </svg>}
  </span>
}
export type MascotMood = 'idle' | Expression
export function Mascot({ text, mood = 'idle', onNext, nextLabel = 'Tiếp tục', compact = false, onToggle }: { text: string; mood?: MascotMood; onNext?: () => void; nextLabel?: string; compact?: boolean; onToggle?: () => void }) {
  const [talking, setTalking] = useState(true)
  useEffect(() => { setTalking(true); const t = setTimeout(() => setTalking(false), 1400); return () => clearTimeout(t) }, [text])
  const face: Expression = mood === 'idle' ? (talking ? 'speaking' : 'neutral') : mood
  return <div className={`mascot ${compact ? 'compact' : ''}`}>
    <button className="mascot-robot" aria-label={compact ? 'Mở lời nhắn của robot trợ lý' : 'Thu gọn lời nhắn'} onClick={onToggle} tabIndex={onToggle ? 0 : -1}><MascotArt expression={face} /></button>
    <AnimatePresence mode="wait">{!compact && <motion.div key={text} className="mascot-bubble glass" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} aria-live="polite">
      <p>{text}</p>
      {onNext && <DialogueActionButton label={nextLabel} onClick={onNext} />}
    </motion.div>}</AnimatePresence>
  </div>
}

/** The last tutorial message, in the middle of the screen: "ready to start the first mission?" (button in the dock). */
export function ReadyFrame({ text, onNext, label }: { text: string; onNext: () => void; label: string }) {
  return <motion.div className="ready-frame" role="dialog" aria-label="Sẵn sàng bắt đầu nhiệm vụ" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
    <span className="ready-art"><MascotArt expression="happy" /></span>
    <p>{text}</p>
    <DialogueActionButton label={label} onClick={onNext} />
  </motion.div>
}

/** Advanced mode: a short caption instead of the mascot. */
export function Caption({ text, onNext, label = 'Tiếp tục' }: { text: string; onNext?: () => void; label?: string }) {
  return <motion.div className="onb-caption glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><p>{text}</p>{onNext && <DialogueActionButton label={label} onClick={onNext} />}</motion.div>
}

export type { TourStep }
