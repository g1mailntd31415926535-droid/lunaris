import type { CSSProperties } from 'react'
import { BatteryCharging, ChevronRight, Clock3, Droplets, Expand, Focus, Minus, Mouse, Play, Plus, Radio, RotateCcw, Settings2, Sparkles, UsersRound, Volume2, VolumeX, Wind, Pause } from 'lucide-react'
import { CAMERA_MODES, NAVIGATION } from '../data'
import type { BuildingId, CameraMode, DemoAction, Section, WorldHandle } from '../types'
import { CameraIcon, HelpIcon, MoonMark, SectionIcon } from './Icons'
import { IconButton, Meter, StatusDot } from './Common'
import { portraitUrl } from '../world/textures'

export function TopHUD({ resources, paused, onPause, speed, onSpeed, onSettings, onCrew, onActivity, sound, onSound, onFullscreen, time }: { resources: { electricity: number; water: number; oxygen: number }; paused: boolean; onPause: () => void; speed: number; onSpeed: () => void; onSettings: () => void; onCrew: () => void; onActivity: () => void; sound: boolean; onSound: () => void; onFullscreen: () => void; time: string }) {
  const readings = [
    { label: 'Điện', value: resources.electricity, color: '#ffd75e', icon: BatteryCharging },
    { label: 'Nước', value: resources.water, color: '#59c9ff', icon: Droplets },
    { label: 'Oxy', value: resources.oxygen, color: '#5edc88', icon: Wind },
  ]
  return <header className="top-hud">
    <div className="brand"><MoonMark className="brand-mark" /><div><span className="wordmark">LUNARIS</span><span className="brand-tagline">LITTLE STEPS. BIG DISCOVERIES.</span></div></div>
    <div className="status-hud glass" aria-label="Chỉ số minh họa của căn cứ">
      <div className="resource-cluster">{readings.map(({ label, value, color, icon: Icon }) => <div className="resource" key={label} style={{ '--resource-color': color } as CSSProperties}>
        <span className="resource-icon"><Icon size={21} strokeWidth={1.8} /></span><div className="resource-reading"><span className="resource-label">{label}</span><span className="resource-value">{value}<small>/100</small></span><Meter value={value} color={color} label={`${label} dự trữ`} /></div>
      </div>)}</div>
      <div className="time-controls"><div className="time-reading"><span><StatusDot pulse={!paused} /> SOL 004</span><strong><Clock3 size={13} />{time}</strong></div><IconButton label={paused ? 'Tiếp tục' : 'Tạm dừng'} className={paused ? 'play-toggle paused' : 'play-toggle'} onClick={onPause}>{paused ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}</IconButton><button className="speed-button" aria-label={`Tốc độ ${speed} lần. Đổi tốc độ`} onClick={onSpeed}>{speed}<span>×</span></button></div>
    </div>
    <div className="header-actions"><div className="header-status-row"><span className="challenge-tag"><span className="tiny-orbit" /> SPACE APPS <b>2026</b></span><button className="activity-button glass" onClick={onActivity} aria-label="Tín hiệu và thông báo" data-tooltip="ARTEMIS ONLINE · Tín hiệu căn cứ"><Radio size={14} /><span className="activity-label">ARTEMIS ONLINE</span><span className="activity-dot" /><ChevronRight size={12} /></button></div><div className="header-icon-cluster glass"><IconButton label="Đội phi hành gia" onClick={onCrew}><UsersRound size={18} /><span className="crew-number">6</span></IconButton><IconButton label={sound ? 'Tắt âm thanh' : 'Bật âm thanh'} onClick={onSound}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</IconButton><IconButton label="Toàn màn hình" className="fullscreen-button" onClick={onFullscreen}><Expand size={17} /></IconButton><IconButton label="Cài đặt" onClick={onSettings}><Settings2 size={18} /></IconButton></div></div>
  </header>
}

export function Sidebar({ section, onSection, onSettings, onHelp }: { section: Section; onSection: (section: Section) => void; onSettings: () => void; onHelp: () => void }) {
  return <aside className="sidebar"><nav className="nav-rail glass" aria-label="Điều hướng căn cứ">{NAVIGATION.map(({ id, label, tooltip, key }) => <button key={id} className={`nav-button ${section === id ? 'active' : ''}`} aria-current={section === id ? 'page' : undefined} aria-label={tooltip} data-tooltip={`${tooltip} · ${key}`} onClick={() => onSection(id)}><SectionIcon id={id} size={23} /><span>{label}</span>{id === 'missions' && <i className="nav-notification" />}</button>)}<div className="nav-divider" /><button className="nav-button nav-settings" aria-label="Mở cài đặt" data-tooltip="Cài đặt" onClick={onSettings}><Settings2 size={21} /></button></nav><IconButton label="Hướng dẫn khám phá" className="help-button glass" onClick={onHelp}><HelpIcon size={20} /></IconButton></aside>
}

export function WorldHeading({ mode, onMode, onMissions, completed }: { mode: CameraMode; onMode: (mode: CameraMode) => void; onMissions: () => void; completed: boolean }) {
  return <section className="world-heading">
    <div className="breadcrumbs"><button onClick={() => onMode('orbit')}><span className="breadcrumb-moon" /> Mặt Trăng</button><ChevronRight size={11} /><button onClick={() => onMode('region')}>Cực Nam</button>{mode === 'base' && <><ChevronRight size={11} /><span>Artemis</span></>}</div>
    <button className="chapter-heading" onClick={onMissions}><span className="chapter-number">01</span><span><small>CHUYẾN PHIÊU LƯU ĐẦU TIÊN</small><h1>{mode === 'orbit' ? 'Xin chào, Mặt Trăng.' : mode === 'region' ? 'Một nơi để bắt đầu.' : 'Ngôi nhà trên Mặt Trăng.'}</h1></span><span className="chapter-progress">{completed ? '4' : '3'}<small>/4</small><Sparkles size={12} /></span></button>
    <span className="region-tag"><StatusDot />{mode === 'orbit' ? 'KẾT NỐI ARTEMIS' : 'TIỀN ĐỒN ARTEMIS · 89.9°S'}</span>
  </section>
}

export function CameraNavigation({ mode, onMode }: { mode: CameraMode; onMode: (mode: CameraMode) => void }) {
  return <div className="camera-toolbar glass" role="group" aria-label="Góc quan sát">{CAMERA_MODES.map((camera) => <button key={camera.id} className={mode === camera.id ? 'active' : ''} aria-pressed={mode === camera.id} aria-label={`Góc nhìn ${camera.label}`} onClick={() => onMode(camera.id)}><CameraIcon id={camera.id} size={17} /><span>{camera.label}</span><kbd>{camera.key}</kbd></button>)}</div>
}

export function CameraToolbar({ mode, handle, onHelp, selected }: { mode: CameraMode; handle: WorldHandle | null; onHelp: () => void; selected: BuildingId | null }) {
  return <>
    <div className="world-tools"><div className="zoom-controls glass"><IconButton label="Phóng to" onClick={() => handle?.zoom('in')}><Plus size={19} /></IconButton><span /><IconButton label="Thu nhỏ" onClick={() => handle?.zoom('out')}><Minus size={19} /></IconButton></div><IconButton label="Về góc nhìn ban đầu" className="glass reset-camera" onClick={() => handle?.reset()}><RotateCcw size={17} /></IconButton>{selected && mode === 'base' && <IconButton label="Đến công trình đang chọn" className="glass focus-camera" onClick={() => handle?.focus(selected)}><Focus size={18} /></IconButton>}</div>
    <button className="camera-hint" onClick={onHelp}><Mouse size={14} /><span>Kéo để xoay <i /> Cuộn để phóng</span><kbd>?</kbd></button>
    <div className="bottom-status"><span className="scale-indicator"><i /><i /><i /></span><span>{mode === 'orbit' ? '1.737 km' : mode === 'region' ? '500 m' : '50 m'}</span><b>UI PROTOTYPE</b><StatusDot /></div>
  </>
}

export function Commander({ collapsed, onCollapse, onAction, demo, mode, onMode }: { collapsed: boolean; onCollapse: (collapsed: boolean) => void; onAction: (kind: 'battery' | 'water') => void; demo: DemoAction | null; mode: CameraMode; onMode: (mode: CameraMode) => void }) {
  const busy = demo && demo.phase !== 'complete'
  const text = busy ? demo.kind === 'radiation' ? 'Về nhà thôi! Đội của mình đang chạy vào nơi trú ẩn.' : demo.phase === 'walking' ? 'Linh đang đến trạm. Cùng nhìn bạn ấy nhé!' : 'Giỏi lắm! Thiết bị đang hoạt động. Mỗi lựa chọn đều có ý nghĩa.' : mode === 'orbit' ? 'Thấy đốm sáng nhỏ không? Đó là ngôi nhà mới của chúng mình!' : mode === 'region' ? 'Ngay gần cực Nam, một cuộc phiêu lưu đang chờ bạn.' : 'Điện đang dư! Bạn muốn làm gì?'
  if (collapsed) return <button className="commander-collapsed glass" aria-label="Mở lời nhắn của Commander Luna" onClick={() => onCollapse(false)}><img src={portraitUrl()} alt="Commander Luna" /><span /><i>!</i></button>
  return <section className={`commander-panel glass ${busy ? 'commander-busy' : ''}`} aria-label="Lời nhắn của Commander Luna">
    <button className="commander-avatar" onClick={() => onCollapse(true)} aria-label="Thu gọn lời nhắn"><img src={portraitUrl()} alt="Commander Luna, phi hành gia pixel" /><span className="avatar-orbit" /><StatusDot /></button>
    <div className="commander-content"><div className="commander-title"><span>COMMANDER <b>LUNA</b></span><span className="commander-hello">{busy ? 'CÙNG QUAN SÁT' : 'ĐẾN LƯỢT BẠN'}</span><button className="commander-hide" onClick={() => onCollapse(true)} aria-label="Ẩn lời nhắn">−</button></div><p>{text}</p><div className="commander-actions">{mode !== 'base' ? <><button className="commander-primary" onClick={() => onMode('base')}><Sparkles size={14} /> Đến căn cứ</button><button onClick={() => onMode(mode === 'orbit' ? 'region' : 'orbit')}><CameraIcon id={mode === 'orbit' ? 'region' : 'orbit'} size={14} />{mode === 'orbit' ? 'Khám phá cực Nam' : 'Ngắm Mặt Trăng'}</button></> : <><button className="commander-primary" disabled={!!busy} onClick={() => onAction('battery')}><BatteryCharging size={14} /> Sạc pin dự trữ</button><button disabled={!!busy} onClick={() => onAction('water')}><Droplets size={14} /> Sản xuất thêm nước</button></>}</div></div>
  </section>
}
