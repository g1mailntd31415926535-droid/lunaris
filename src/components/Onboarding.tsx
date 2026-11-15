// Opening flow and the robot mascot. Presentation only; the game starts when the tour ends.
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Gauge, Lightbulb, Rocket, X } from 'lucide-react'
import { MODES, WELCOME } from '../onboarding/script'
import type { TourStep } from '../onboarding/script'
import { robotPortraitUrl } from '../world/textures'
import type { RobotMood } from '../world/textures'

/**
 * The one primary action of a guidance / result dialog. Always drawn at the dialog's bottom-right corner
 * (same size and margin everywhere, see .dialogue-action in styles.css). Enter / Space press it when it is the
 * only dialogue action on screen and focus is not on a choice (see useDialogueKeys in App).
 */
export function DialogueActionButton({ label, onClick, disabled, icon }: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode }) {
  return <button className="dialogue-action" data-dialogue-action="" disabled={disabled} onClick={onClick}>{icon}{label}{!icon && <ArrowRight size={14} />}</button>
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

export function ModeSelect({ onReady }: { onReady: (mode: 'basic' | 'advanced') => void }) {
  const [mode, setMode] = useState<'basic' | 'advanced' | null>(null)
  return <motion.div className="onb-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="onb-card wide" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <span className="eyebrow">CHỌN CHẾ ĐỘ CHƠI</span>
      <div className="story-modes">{(['basic', 'advanced'] as const).map((m) => <button key={m} className={mode === m ? 'chosen' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'basic' ? <Lightbulb size={20} /> : <Gauge size={20} />}<strong>{MODES[m].title}</strong>{MODES[m].lines.map((l) => <span key={l}>{l}</span>)}</button>)}</div>
      <DialogueActionButton label="SẴN SÀNG" icon={<Rocket size={15} />} disabled={!mode} onClick={() => mode && onReady(mode)} />
    </motion.div>
  </motion.div>
}

/**
 * Journey cinematic. Today a placeholder countdown (1 → 0); pass `videoSrc` later to play the real film instead.
 * The video element is released (src cleared) on unmount so a replaced video never keeps decoding.
 */
export function IntroCinematic({ onDone, videoSrc, reducedMotion }: { onDone: () => void; videoSrc?: string; reducedMotion: boolean }) {
  const [count, setCount] = useState(1)
  const video = useRef<HTMLVideoElement>(null)
  const done = useRef(onDone); done.current = onDone
  useEffect(() => {
    if (videoSrc) return
    const step = reducedMotion ? 600 : 1100
    const a = setTimeout(() => setCount(0), step), b = setTimeout(() => done.current(), step * 2)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [videoSrc, reducedMotion])
  useEffect(() => () => { const v = video.current; if (v) { v.pause(); v.removeAttribute('src'); v.load() } }, [])
  return <motion.div className="onb-cinematic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
    {videoSrc ? <video ref={video} src={videoSrc} autoPlay playsInline onEnded={() => done.current()} onError={() => done.current()} /> : <AnimatePresence mode="wait"><motion.span key={count} className="onb-count" initial={{ opacity: 0, scale: 1.3 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>{count}</motion.span></AnimatePresence>}
    <button className="onb-skip" onClick={() => done.current()}>Bỏ qua<X size={13} /></button>
  </motion.div>
}

/** The robot mascot with a small speech bubble (Basic). `onNext` is shown as a continue button when given. */
export function Mascot({ text, mood = 'idle', onNext, nextLabel = 'Tiếp tục', compact = false, onToggle }: { text: string; mood?: RobotMood; onNext?: () => void; nextLabel?: string; compact?: boolean; onToggle?: () => void }) {
  const [talking, setTalking] = useState(true)
  useEffect(() => { setTalking(true); const t = setTimeout(() => setTalking(false), 1400); return () => clearTimeout(t) }, [text])
  const face = mood === 'idle' && talking ? 'speaking' : mood
  return <div className={`mascot ${compact ? 'compact' : ''}`}>
    <button className="mascot-robot" aria-label={compact ? 'Mở lời nhắn của robot trợ lý' : 'Thu gọn lời nhắn'} onClick={onToggle} tabIndex={onToggle ? 0 : -1}><img src={robotPortraitUrl(face)} alt="Robot trợ lý LUNA-01" /></button>
    <AnimatePresence mode="wait">{!compact && <motion.div key={text} className="mascot-bubble glass" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} aria-live="polite">
      <p>{text}</p>
      {onNext && <DialogueActionButton label={nextLabel} onClick={onNext} />}
    </motion.div>}</AnimatePresence>
  </div>
}

/** Advanced mode: a short caption instead of the mascot. */
export function Caption({ text, onNext, label = 'Tiếp tục' }: { text: string; onNext?: () => void; label?: string }) {
  return <motion.div className="onb-caption glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><p>{text}</p>{onNext && <DialogueActionButton label={label} onClick={onNext} />}</motion.div>
}

export type { TourStep }
