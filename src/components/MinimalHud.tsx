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

function Chip({ id, value, unit, fraction, color, label, icon, highlight }: { id: string; value: string; unit: string; fraction: number; color: string; label: string; icon: ReactNode; highlight: boolean }) {
  return <motion.div className={`hud-chip ${highlight ? 'highlight' : ''}`} data-hud={id} style={{ '--chip-color': color } as CSSProperties} initial={{ opacity: 0, y: -8, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} role="meter" aria-label={label} aria-valuenow={Math.round(fraction * 100)} aria-valuemin={0} aria-valuemax={100}>
    <span className="hud-chip-icon">{icon}</span>
    <span className="hud-chip-body"><strong>{value}<small>{unit}</small></strong><i><b style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} /></i></span>
  </motion.div>
}

export function ResourceHud({ values, visible, highlight }: { values: HudValues; visible: Set<HudItem>; highlight: HudItem | null }) {
  return <div className="hud-resources" aria-label="Tài nguyên căn cứ (số giả định của trò chơi)">
    <AnimatePresence>{(['battery', 'water', 'oxygen'] as const).filter((k) => visible.has(k)).map((k) => <Chip key={k} id={k} value={String(values[k])} unit="%" fraction={values[k] / 100} highlight={highlight === k} {...ITEMS[k]} />)}</AnimatePresence>
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
