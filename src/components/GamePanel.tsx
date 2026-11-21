// Shared design system for event panels (decision = reference image 5, result = reference image 7):
// one compact header (code · topic left, time right), modest title, labelled rows with thin dividers,
// resource bars before → after. The primary action is never inside the panel: it lives in the fixed
// action dock (DialogueActionButton), whose spot the panel's footer reserves.
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

export const RESOURCE_STYLE = {
  water: { label: 'WATER', color: '#59c9ff', soft: '#bfe9ff' },
  battery: { label: 'POWER', color: '#f4c76b', soft: '#ffe7b0' },
  oxygen: { label: 'O₂', color: '#46dc8a', soft: '#b5f3cf' },
  food: { label: 'FOOD', color: '#ff8a6e', soft: '#ffc9b9' },
} as const
export type ResourceKey = keyof typeof RESOURCE_STYLE

export function EventHeader({ code, topic, time, accent = '#f4c76b', onClose }: { code: string; topic?: string; time: string; accent?: string; onClose?: () => void }) {
  return <header className="gp-header">
    <span className="gp-tag"><i style={{ background: accent }} />{code}{topic ? ` · ${topic}` : ''}</span>
    <span className="gp-time">{time}</span>
    {onClose && <button className="gp-close" aria-label="Close and view the base" onClick={onClose}><X size={16} /></button>}
  </header>
}

export function GamePanel({ label, className = '', children, footer }: { label: string; className?: string; children: ReactNode; footer?: ReactNode }) {
  return <motion.section className={`game-panel ${className}`} role="dialog" aria-label={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.22 }}>
    <div className="gp-scroll">{children}</div>
    <footer className="gp-footer">{footer}</footer>
  </motion.section>
}

/** A labelled row (ĐÃ CHỌN, ĐÃ XẢY RA, VÌ SAO, SAU NÀY …). */
export function ResultSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="gp-row"><b className="gp-label">{label}</b><div className="gp-value">{children}</div></div>
}

/** One resource bar: base fill up to min(before, after), lighter segment for a gain; values on the right. */
export function ResourceBar({ k, before, after, emphasis = false, delta }: { k: ResourceKey; before: number; after: number; emphasis?: boolean; delta?: string }) {
  const st = RESOURCE_STYLE[k], lo = Math.max(0, Math.min(before, after)), hi = Math.min(100, Math.max(before, after))
  const changed = before !== after
  return <div className={`gp-bar ${changed && emphasis ? 'changed' : ''}`}>
    <span className="gp-bar-name">{st.label}</span>
    <i className="gp-bar-track"><b style={{ width: `${lo}%`, background: st.color }} />{changed && <b style={{ left: `${lo}%`, width: `${hi - lo}%`, background: after > before ? st.soft : '#ff6b6b' }} />}</i>
    <span className="gp-bar-values">{before} → <em style={changed ? { color: after > before ? st.soft : '#ff8d8d' } : undefined}>{after}%</em></span>
    {delta !== undefined && <span className="gp-bar-delta">{delta}</span>}
  </div>
}
