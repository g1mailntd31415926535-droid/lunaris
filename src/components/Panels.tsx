import { useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownRight, ArrowRight, BadgeCheck, Bookmark, Check, ChevronDown, ChevronRight, CircleCheck, Clock3, FlaskConical, Focus, Lightbulb, LoaderCircle, Moon, Orbit, PanelRightClose, PanelRightOpen, Radio, ShieldCheck, Sparkles, Sun, TriangleAlert, Trophy } from 'lucide-react'
import { BUILDING_BY_ID, FORECASTS, JOURNAL, MISSIONS } from '../data'
import type { BuildingId, DemoAction, DemoKind, RoverStatus, Section } from '../types'
import { BuildingIcon, SectionIcon } from './Icons'
import { IconButton, Meter, StatusDot } from './Common'
import { MiniMap } from './MiniMap'

interface PanelProps {
  section: Section
  selected: BuildingId | null
  onSelect: (id: BuildingId) => void
  onAction: (kind: DemoKind) => void
  onFocus: (id: BuildingId) => void
  demo: DemoAction | null
  completed: Set<DemoKind>
  hour: number
  onHour: (hour: number) => void
  open: boolean
  onOpen: (open: boolean) => void
  onMission: (index: number) => void
  onNotify: (title: string, detail?: string) => void
  roverStatus: RoverStatus
  followRover: boolean
  onFollowRover: (follow: boolean) => void
}

export function ContextPanel(props: PanelProps) {
  if (!props.open) return <button className="open-panel glass" aria-label="Mở bảng thông tin" onClick={() => props.onOpen(true)}><PanelRightOpen size={19} /><span>Thông tin</span></button>
  const title = { base: 'CĂN CỨ CỦA BẠN', missions: 'MỘT CHUYẾN PHIÊU LƯU', forecast: 'NHÌN TRƯỚC MỘT CHÚT', journal: 'ĐIỀU MÌNH KHÁM PHÁ' }[props.section]
  return <aside className={`context-panel glass context-${props.section}`} aria-label={title}>
    <header className="context-eyebrow"><span><SectionIcon id={props.section} size={13} />{title}</span><IconButton label="Thu gọn bảng thông tin" onClick={() => props.onOpen(false)}><PanelRightClose size={16} /></IconButton></header>
    <AnimatePresence mode="wait" initial={false}><motion.div key={props.section} className="context-body" initial={{ opacity: 0, x: 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -7 }} transition={{ duration: 0.18 }}>
      {props.section === 'base' && <BasePanel {...props} />}
      {props.section === 'forecast' && <ForecastPanel {...props} />}
      {props.section === 'missions' && <MissionsPanel {...props} />}
      {props.section === 'journal' && <JournalPanel onNotify={props.onNotify} />}
    </motion.div></AnimatePresence>
    <footer className="panel-footer"><FlaskConical size={11} />{props.section === 'forecast' ? 'Dự báo minh họa, không phải số liệu thực' : 'KHÁM PHÁ · HỌC HỎI · CÙNG NHAU'}<span>DEMO</span></footer>
  </aside>
}

function BasePanel({ selected, onSelect, onAction, onFocus, demo, completed, roverStatus, followRover, onFollowRover }: PanelProps) {
  const [fact, setFact] = useState(false)
  const building = BUILDING_BY_ID[selected ?? 'command']
  const busy = demo && demo.phase !== 'complete'
  const operating = busy && (demo.kind === building.id || (building.id === 'shelter' && demo.kind === 'radiation'))
  const kind = building.id === 'shelter' ? 'radiation' : building.id
  const value = operating && demo.phase === 'working' ? Math.min(100, building.value + 16) : completed.has(kind) ? Math.min(100, building.value + 16) : building.value
  return <>
    <div className="base-title"><div><h2>Artemis <span>01</span></h2><p>Ngôi nhà nhỏ trên Mặt Trăng</p></div><span className="nominal-badge"><StatusDot /> Ổn định</span></div>
    <MiniMap selected={building.id} onSelect={onSelect} />
    <div className="colony-stats"><div><strong>08</strong><span>Công trình</span></div><div><strong>06</strong><span>Phi hành gia</span></div><div><ShieldCheck size={19} /><span>An toàn</span></div></div>
    <div className="panel-divider" />
    <AnimatePresence mode="wait" initial={false}><motion.section className="building-detail" key={building.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.16 }} style={{ '--building-accent': building.accent } as CSSProperties}>
      <div className="building-category"><span>{building.category}</span><small>{building.code}</small></div>
      <div className="building-title"><span className="building-icon"><BuildingIcon id={building.id} size={25} /></span><div><h3>{building.name}</h3><p><StatusDot color={operating ? building.accent : undefined} pulse={!!operating} />{operating ? 'Đang hoạt động' : 'Sẵn sàng khám phá'}</p></div></div>
      <p className="building-description">{building.description}</p>
      {building.id === 'rover' && <div className="rover-status-detail"><strong>MILO · TỰ ĐỘNG THÁM HIỂM</strong><span>{roverStatus.phase === 'scanning' ? 'Đang quét địa hình' : roverStatus.phase === 'returning' ? 'Đang trở về căn cứ' : roverStatus.phase === 'docked' ? 'Kiểm tra & nghỉ tại căn cứ' : 'Đang khám phá'}</span><p>{roverStatus.site}</p><small>20 điểm gần căn cứ · Cách căn cứ {Math.round(roverStatus.distance)} m · {roverStatus.speed.toFixed(1)} m/s</small></div>}
      <div className="building-metric"><span>{building.metric}</span><strong>{value}<small>{building.unit}</small></strong></div><Meter value={value} color={building.accent} label={building.metric} />
      <div className="system-status"><Radio size={12} /><span>{building.id === 'command' ? 'Đường truyền tốt' : building.id === 'solar' ? '6 tấm pin · đang đón nắng' : building.id === 'water' ? 'Hệ thống lọc sẵn sàng' : building.id === 'shelter' ? 'Đủ chỗ cho cả đội' : building.id === 'rover' ? 'MILO đang ở ngoài căn cứ' : 'Mọi thiết bị đều ổn định'}</span><Check size={13} /></div>
      <button className="building-action" disabled={!!busy} onClick={() => onAction(building.id === 'shelter' ? 'radiation' : building.id)}>{operating ? <LoaderCircle className="spin" size={15} /> : <BuildingIcon id={building.id} size={15} />}<span>{operating ? demo.phase === 'walking' ? 'Phi hành gia đang đến…' : 'Đang vận hành…' : building.action}</span>{!operating && <ArrowRight size={15} />}</button>
      <div className="building-secondary"><button onClick={() => onFocus(building.id)}><Focus size={13} /> Định vị</button><button className={fact ? 'active' : ''} onClick={() => setFact(!fact)}><Lightbulb size={13} /> Bạn có biết?<ChevronDown size={11} className={fact ? 'rotate' : ''} /></button></div>
      {building.id === 'rover' && <button className="rover-follow-button" onClick={() => onFollowRover(!followRover)}><BuildingIcon id="rover" size={15} />{followRover ? 'Dừng theo dõi MILO' : 'Theo dõi MILO'}<ArrowRight size={13} /></button>}
      <AnimatePresence>{fact && <motion.div className="science-note" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p><Sparkles size={13} />{building.fact}</p></motion.div>}</AnimatePresence>
    </motion.section></AnimatePresence>
  </>
}

function ForecastPanel({ hour, onHour, onAction, onFocus, demo }: PanelProps) {
  const forecast = [...FORECASTS].reverse().find((f) => hour >= f.hour)!
  const time = `${String(8 + hour).padStart(2, '0')}:24`
  return <>
    <div className="panel-title"><div><h2>Dự báo Mặt Trăng</h2><p>Chuẩn bị cho một ngày mới.</p></div><span className="small-round-icon"><Sun size={19} /></span></div>
    <MiniMap variant="forecast" hour={hour} />
    <div className="forecast-time"><span><Clock3 size={12} />08:24 <small>HIỆN TẠI</small></span><ArrowRight size={14} /><strong>{time}<small>+{hour}H</small></strong></div>
    <div className="forecast-slider"><label htmlFor="forecast-range">Kéo để nhìn vào tương lai<span>{hour === 0 ? 'Bây giờ' : `Sau ${hour} giờ`}</span></label><input id="forecast-range" aria-label="Thời gian dự báo" type="range" min="0" max="8" step="1" value={hour} onChange={(event) => onHour(Number(event.target.value))} style={{ '--slider-progress': `${hour / 8 * 100}%` } as CSSProperties} /><div className="timeline-ticks">{[0, 2, 4, 8].map((h) => <button key={h} onClick={() => onHour(h)} className={h === hour ? 'active' : ''}>{h === 0 ? 'Bây giờ' : `+${h}h`}</button>)}</div></div>
    <div className="forecast-now" style={{ '--forecast-color': forecast.color } as CSSProperties}><span className="forecast-weather">{hour < 4 ? <Sun size={23} /> : hour < 8 ? <Orbit size={23} /> : <Moon size={23} />}</span><div><h3>{forecast.title}</h3><p>{forecast.description}</p></div></div>
    <div className="building-metric"><span>Ánh sáng trên tấm pin</span><strong>{forecast.power}<small>%</small></strong></div><Meter value={forecast.power} color={forecast.color} label="Ánh sáng minh họa" />
    <div className="forecast-events">{FORECASTS.slice(1).map((f, i) => <button key={f.hour} className={hour >= f.hour ? 'reached' : ''} onClick={() => onHour(f.hour)}><span className="event-hour">+{f.hour}h</span><span className="event-node">{i === 0 ? <Sun size={12} /> : i === 1 ? <ArrowDownRight size={12} /> : <Moon size={12} />}</span><span>{i === 0 ? 'Bóng núi đến gần trạm pin' : i === 1 ? 'Ánh nắng bắt đầu giảm' : 'Căn cứ bước vào bóng tối'}</span><ChevronRight size={12} /></button>)}</div>
    <button className="secondary-action" onClick={() => { onHour(4); onFocus('solar') }}><Sun size={15} />Xem bóng núi trên trạm pin<ArrowRight size={14} /></button>
    <button className="radiation-demo" disabled={!!demo && demo.phase !== 'complete'} onClick={() => onAction('radiation')}><TriangleAlert size={14} />Thử cảnh báo bức xạ<span>DEMO</span></button>
  </>
}

function MissionsPanel({ onMission, completed }: PanelProps) {
  const [active, setActive] = useState(0)
  const mission = MISSIONS[active]
  const progress = active === 0 && completed.has('water') ? 4 : active === 1 && completed.has('battery') ? 3 : active === 2 && completed.has('rover') ? 2 : mission.progress
  return <>
    <div className="panel-title"><div><h2>Đi xa hơn một chút.</h2><p>Mỗi bước nhỏ đều đáng tự hào.</p></div><span className="small-round-icon"><Sparkles size={18} /></span></div>
    <div className="mission-hero"><span className="mission-orbit orbit-one" /><span className="mission-orbit orbit-two" /><div className="mission-medal"><Trophy size={33} strokeWidth={1.3} /><i /><b>01</b></div><span className="mission-hero-tag">NHÀ THÁM HIỂM TẬP SỰ</span><p>Bạn đã sẵn sàng cho<br /><strong>những điều thật kỳ diệu.</strong></p></div>
    <div className="mission-list">{MISSIONS.map((item, index) => <button className={`mission-nav ${active === index ? 'selected' : ''}`} key={item.id} onClick={() => setActive(index)}><span style={{ color: item.color }}>{item.number}</span><div><strong>{item.name}</strong><small>{item.subtitle}</small></div>{active === index ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>)}</div>
    <div className="mission-details"><div className="mission-progress-heading"><span>NHIỆM VỤ CỦA BẠN</span><strong>{progress}<small>/{mission.total}</small></strong></div><div className="mission-progress-dots">{Array.from({ length: mission.total }, (_, i) => <span className={i < progress ? 'done' : ''} key={i}>{i < progress ? <Check size={12} /> : i + 1}</span>)}</div><ul>{mission.tasks.map((task, i) => <li className={i < progress ? 'done' : ''} key={task}>{i < progress ? <CircleCheck size={15} /> : <span className="task-circle" />}<span>{task}</span></li>)}</ul><div className="mission-reward"><BadgeCheck size={18} /><div><small>HUY HIỆU KHÁM PHÁ</small><strong>{mission.reward}</strong></div><Sparkles size={14} /></div><button className="primary-button" onClick={() => onMission(active)}>{progress === mission.total ? <Check size={15} /> : <Sparkles size={15} />}{progress === mission.total ? 'Khám phá lại nhiệm vụ' : 'Cùng bắt đầu nhé!'}<ArrowRight size={14} /></button></div>
  </>
}

function JournalPanel({ onNotify }: { onNotify: PanelProps['onNotify'] }) {
  const [active, setActive] = useState('moon')
  const [bookmarked, setBookmarked] = useState(new Set<string>())
  const entry = JOURNAL.find((item) => item.id === active)!
  return <>
    <div className="panel-title"><div><h2>Sổ tay khoa học</h2><p>Tò mò một chút, hiểu thêm thật nhiều.</p></div><span className="journal-count">03</span></div>
    <div className={`journal-art journal-art-${active}`}><div className="journal-planet" /><div className="journal-orbit" /><span className="journal-art-star s1" /><span className="journal-art-star s2" /><span className="journal-art-star s3" /><span className="journal-art-tag"><Sparkles size={11} />MỘT ĐIỀU MỚI HÔM NAY</span></div>
    <div className="journal-topics">{JOURNAL.map((item) => <button key={item.id} className={item.id === active ? 'active' : ''} style={{ '--topic-color': item.color } as CSSProperties} onClick={() => setActive(item.id)}>{item.id === 'moon' ? <Moon size={13} /> : item.id === 'water' ? <FlaskConical size={13} /> : <Orbit size={13} />}{item.id === 'moon' ? 'Mặt Trăng' : item.id === 'water' ? 'Sự sống' : 'Trái Đất'}</button>)}</div>
    <AnimatePresence mode="wait"><motion.article key={active} className="journal-entry" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}><span className="journal-entry-tag" style={{ color: entry.color }}>{entry.tag}</span><h3>{entry.title}</h3><p>{entry.text}</p><div className="journal-did-you-know"><Lightbulb size={17} /><p>{entry.extra}</p></div></motion.article></AnimatePresence>
    <button className={`bookmark-button ${bookmarked.has(active) ? 'bookmarked' : ''}`} onClick={() => { const next = new Set(bookmarked); if (next.has(active)) next.delete(active); else next.add(active); setBookmarked(next); onNotify(next.has(active) ? 'Đã đánh dấu khám phá!' : 'Đã bỏ đánh dấu', 'Sổ tay minh họa, chỉ lưu trong lần mở này.') }}><Bookmark size={15} fill={bookmarked.has(active) ? 'currentColor' : 'none'} />{bookmarked.has(active) ? 'Đã đánh dấu trong sổ tay' : 'Đánh dấu điều khám phá'}{bookmarked.has(active) && <Check size={14} />}</button>
    <div className="journal-source"><Orbit size={12} /><span>Kiến thức STEM · dành cho bạn</span></div>
  </>
}
