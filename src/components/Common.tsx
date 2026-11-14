import { useEffect, useRef } from 'react'
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return <button type="button" aria-label={label} data-tooltip={label} className={`icon-button ${className}`} {...props}>{children}</button>
}

export function StatusDot({ color, pulse = false }: { color?: string; pulse?: boolean }) {
  return <span className={`status-dot ${pulse ? 'pulse' : ''}`} style={{ '--dot-color': color ?? '#7cdda2' } as CSSProperties} aria-hidden="true" />
}

export function Meter({ value, color, label, className = '' }: { value: number; color: string; label: string; className?: string }) {
  return <div className={`meter ${className}`} role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} style={{ '--meter-color': color } as CSSProperties}>
    <span style={{ width: `${value}%` }} /><i />
  </div>
}

export function Modal({ title, eyebrow, onClose, children, className = '' }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; className?: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const first = panel.current?.querySelector<HTMLElement>('button, input, select, [tabindex="0"]')
    first?.focus()
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current() }
      if (event.key === 'Tab') {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]') ?? [])
        const first = elements[0], last = elements[elements.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => { document.removeEventListener('keydown', handler, true); previous?.focus() }
  }, [])
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <motion.div ref={panel} className={`modal glass ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.2 }}>
      <header className="modal-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id="modal-title">{title}</h2></div><IconButton label="Đóng cửa sổ" onClick={onClose}><X size={20} /></IconButton></header>
      {children}
    </motion.div>
  </motion.div>
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" className={`toggle ${checked ? 'checked' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}
