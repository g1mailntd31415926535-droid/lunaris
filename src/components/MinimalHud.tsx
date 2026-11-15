// Minimal HUD: three life-support resources (top left), packaged food + time + one Settings button (top right).
// Values come from the game state only; nothing is hard-coded.
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { BatteryCharging, Clock3, Droplets, Expand, Flag, HelpCircle, History, Moon, Package, Pause, Play, Radio, Settings, Settings2, UsersRound, Volume2, VolumeX } from 'lucide-react'
import type { HudItem } from '../onboarding/script'
import type { CameraMode } from '../types'

export interface HudValues { battery: number; water: number; oxygen: number; foodDays: number; foodFraction: number }

const O2 = () => <span className="o2-icon" aria-hidden="true">O<sub>2</sub></span>
const ITEMS: Record<Exclude<HudItem, 'food'>, { color: string; label: string; icon: ReactNode }> = {
  battery: { color: '#ffd75e', label: 'Điện dự trữ', icon: <BatteryCharging size={17} strokeWidth={2} /> },
  water: { color: '#59c9ff', label: 'Nước sạch', icon: <Droplets size={17} strokeWidth={2} /> },
  oxygen: { color: '#46dc8a', label: 'Oxy', icon: <O2 /> },
}

export interface Float { id: number; key: string; value: number }
/** Floating "+2" / "-5" under a bar: own colour when rising, red when falling (the bar keeps its colour). */
function Floats({ items, color, onDone }: { items: Float[]; color: string; onDone: (id: number) => void }) {
  return <span className="hud-floats" aria-hidden="true">{items.map((f) => <motion.b key={f.id} style={{ color: f.value > 0 ? color : '#ff5d5d' }} initial={{ y: 10, opacity: 0 }} animate={{ y: -6, opacity: [0, 1, 1, 0] }} transition={{ duration: 1.7, ease: 'easeOut', times: [0, 0.15, 0.7, 1] }} onAnimationComplete={() => onDone(f.id)}>{f.value > 0 ? '+' : '-'}{Math.abs(f.value)}</motion.b>)}</span>
}

function Chip({ id, value, unit, fraction, color, label, icon, highlight, floats, onFloatDone }: { id: string; value: string; unit: string; fraction: number; color: string; label: string; icon: ReactNode; highlight: boolean; floats?: Float[]; onFloatDone?: (id: number) => void }) {
  return <motion.div className={`hud-chip ${highlight ? 'highlight' : ''}`} data-hud={id} style={{ '--chip-color': color } as CSSProperties} initial={{ opacity: 0, y: -8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} role="meter" aria-label={label} aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
    <span className="hud-chip-icon">{icon}</span>
    <span className="hud-chip-body"><strong>{value}<small>{unit}</small></strong><i><b style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} /></i></span>
    {floats && onFloatDone && <Floats items={floats} color={color} onDone={onFloatDone} />}
  </motion.div>
}

const KEYS = ['battery', 'water', 'oxygen'] as const
/**
 * Deltas come from the real displayed values (percentage points). A jump of ≥ 2 points (an event or a decision)
 * shows at once; slow drift from the running simulation is merged and shown at most every 2.5 s per resource.
 * `live` is false during the opening, on load and after a restart: the baseline is reset, so no fake delta appears.
 */
function useDeltas(values: HudValues, live: boolean) {
  const [floats, setFloats] = useState<Float[]>([])
  const base = useRef<Record<string, number> | null>(null), last = useRef<Record<string, number>>({}), ids = useRef(0)
  useEffect(() => {
    if (!live || !base.current) { base.current = { battery: values.battery, water: values.water, oxygen: values.oxygen }; if (!live) setFloats([]); return }
    const now = performance.now(), add: Float[] = []
    for (const k of KEYS) {
      const d = values[k] - base.current[k], since = now - (last.current[k] ?? 0)
      if (!d) continue
      if ((Math.abs(d) >= 2 && since > 900) || since > 2500) { add.push({ id: ++ids.current, key: k, value: d }); base.current[k] = values[k]; last.current[k] = now }
    }
    if (add.length) setFloats((f) => [...f.slice(-6), ...add])
  }, [values.battery, values.water, values.oxygen, live])   // eslint-disable-line react-hooks/exhaustive-deps
  const done = (id: number) => setFloats((f) => f.filter((x) => x.id !== id))
  return { floats, done }
}

export function ResourceHud({ values, visible, highlight, live = false }: { values: HudValues; visible: Set<HudItem>; highlight: HudItem | null; live?: boolean }) {
  const { floats, done } = useDeltas(values, live)
  return <div className="hud-resources" aria-label="Tài nguyên căn cứ (số giả định của trò chơi)">
    <AnimatePresence>{KEYS.filter((k) => visible.has(k)).map((k) => <Chip key={k} id={k} value={String(values[k])} unit="%" fraction={values[k] / 100} highlight={highlight === k} floats={floats.filter((f) => f.key === k)} onFloatDone={done} {...ITEMS[k]} />)}</AnimatePresence>
  </div>
}

export function TopRight({ values, visible, highlight, paused, onPause, speed, onSpeed, time, menu }: { values: HudValues; visible: Set<HudItem>; highlight: HudItem | null; paused: boolean; onPause: () => void; speed: number; onSpeed: () => void; time: string | null; menu: ReactNode }) {
  return <div className="hud-right">
    {time && <div className="hud-time"><Clock3 size={13} /><span>{time}</span><button aria-label={paused ? 'Tiếp tục thời gian' : 'Tạm dừng thời gian'} onClick={onPause}>{paused ? <Play size={13} fill="currentColor" /> : <Pause size={13} fill="currentColor" />}</button><button aria-label={`Tốc độ ${speed} lần. Đổi tốc độ`} className="speed-button" onClick={onSpeed}>{speed}×</button></div>}
    <AnimatePresence>{visible.has('food') && <Chip key="food" id="food" value={values.foodDays.toFixed(values.foodDays < 10 ? 1 : 0)} unit=" ngày" fraction={values.foodFraction} color="#ff6e5a" label="Thực phẩm đóng gói còn đủ (ngày)" icon={<Package size={17} strokeWidth={2} />} highlight={highlight === 'food'} />}</AnimatePresence>
    {menu}
  </div>
}

export interface MenuActions { onDisplay: () => void; onMissions: () => void; onTimeline: () => void; onCrew: () => void; onActivity: () => void; onSound: () => void; sound: boolean; onFullscreen: () => void; onHelp: () => void; onCamera: (mode: CameraMode) => void }
export function SettingsMenu(a: MenuActions) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    const click = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', key, true); document.addEventListener('mousedown', click)
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', click) }
  }, [open])
  const item = (icon: ReactNode, title: string, hint: string, run: () => void) => <button role="menuitem" onClick={() => { setOpen(false); run() }}>{icon}<span><b>{title}</b><small>{hint}</small></span></button>
  return <div className="hud-menu" ref={root}>
    <button className="hud-gear" aria-label="Cài đặt và công cụ" aria-expanded={open} onClick={() => setOpen(!open)}><Settings size={19} /></button>
    <AnimatePresence>{open && <motion.div className="hud-menu-list glass" role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
      {item(<Flag size={16} />, 'Nhiệm vụ', 'Tiến độ hướng dẫn, nghiên cứu và sự kiện', a.onMissions)}
      {item(<History size={16} />, 'Nhật ký nhân quả', 'Mỗi quyết định đã dẫn tới điều gì', a.onTimeline)}
      {item(<UsersRound size={16} />, 'Đội phi hành gia', 'Gặp và tìm từng người trong căn cứ', a.onCrew)}
      {item(<Radio size={16} />, 'Tín hiệu', 'Các thông báo gần đây', a.onActivity)}
      <div className="hud-menu-cams" role="group" aria-label="Góc nhìn">{(['orbit', 'region', 'base'] as const).map((m) => <button key={m} onClick={() => { setOpen(false); a.onCamera(m) }}><Moon size={13} />{m === 'orbit' ? 'Mặt Trăng' : m === 'region' ? 'Khu vực' : 'Căn cứ'}</button>)}</div>
      {item(<Settings2 size={16} />, 'Hiển thị', 'Chất lượng, lớp NASA/Game, nhãn, chơi lại', a.onDisplay)}
      {item(a.sound ? <Volume2 size={16} /> : <VolumeX size={16} />, a.sound ? 'Tắt âm thanh' : 'Bật âm thanh', 'Tiếng bấm nút và thông báo', a.onSound)}
      {item(<Expand size={16} />, 'Toàn màn hình', 'Mở rộng khung chơi', a.onFullscreen)}
      {item(<HelpCircle size={16} />, 'Trợ giúp', 'Cách xoay, phóng và phím tắt', a.onHelp)}
    </motion.div>}</AnimatePresence>
  </div>
}

/** Small persistent objective (top-left, under the resources): what to do now, or what is being waited for. */
export function ObjectiveChip({ objective, onLook, onSkip }: { objective: { title: string; detail?: string; progress?: number; building?: string; canSkip?: boolean } | null; onLook: (b: string) => void; onSkip: () => void }) {
  const [open, setOpen] = useState(true)
  if (!objective) return null
  return <div className={`objective-chip glass ${open ? '' : 'closed'}`} role="status" aria-live="polite">
    <button className="objective-head" onClick={() => setOpen(!open)} aria-expanded={open}><Flag size={13} /><span><small>MỤC TIÊU HIỆN TẠI</small><b>{objective.title}</b></span></button>
    {open && <>
      {objective.detail && <p>{objective.detail}</p>}
      {objective.progress !== undefined && <i className="objective-bar"><b style={{ width: `${Math.round(Math.min(1, Math.max(0, objective.progress)) * 100)}%` }} /><em>{Math.round(Math.min(1, Math.max(0, objective.progress)) * 100)} %</em></i>}
      <div className="objective-actions">
        {objective.building && <button onClick={() => onLook(objective.building!)}>Xem nơi này</button>}
        {objective.canSkip && <button onClick={onSkip} title="Cho thời gian trôi nhanh tới lúc cần bạn">Tua tới lúc cần bạn ⏩</button>}
      </div>
    </>}
  </div>
}
