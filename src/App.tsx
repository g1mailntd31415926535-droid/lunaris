import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { CarFront, Check, LoaderCircle, Pause, Play, ShieldCheck, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { BuildingId, CameraMode, CameraRequest, DemoAction, DemoKind, DemoPhase, Notification, Preferences, RoverStatus, Section, WorldHandle } from './types'
import { BUILDING_BY_ID } from './data'
import { World } from './world/World'
import { TopHUD, Sidebar, WorldHeading, CameraNavigation, CameraToolbar, Commander } from './components/HUD'
import { ContextPanel } from './components/Panels'
import { ActivityDialog, CrewDialog, HelpDialog, SettingsDialog } from './components/Dialogs'
import { playUiTone } from './audio'
import { useHudBounds } from './hooks/useHudBounds'

const DEMO_RESULTS: Record<DemoKind, { title: string; detail: string }> = {
  water: { title: 'Mỗi giọt nước đều quý!', detail: 'Hoạt ảnh tái chế đã hoàn tất. Nước dự trữ: 72% (minh họa).' },
  battery: { title: 'Một tia nắng đã được để dành!', detail: 'Hoạt ảnh sạc pin đã hoàn tất. Dung lượng minh họa: 88%.' },
  solar: { title: 'Những tấm pin sáng bóng!', detail: 'Kai và Linh đã lau pin. Hiệu suất minh họa được cập nhật.' },
  radiation: { title: 'Toàn đội đã an toàn!', detail: 'Diễn tập hoàn tất. MILO vẫn có thể khám phá ở bên ngoài.' },
  rover: { title: 'MILO đã sẵn sàng đi xa!', detail: 'Theo đường chấm sáng để cùng khám phá lộ trình dựng sẵn.' },
  greenhouse: { title: 'Những mầm xanh cảm ơn bạn!', detail: 'Hoạt ảnh chăm sóc vườn hoàn tất. Mọi cây đều khỏe mạnh.' },
  oxygen: { title: 'Một hơi thở thật trong lành!', detail: 'Hoạt ảnh kiểm tra thiết bị hoàn tất. Cả đội đã sẵn sàng.' },
  command: { title: 'Xin chào, Trái Đất!', detail: 'Một tín hiệu minh họa đã được gửi từ căn cứ Artemis.' },
}

function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: (id: number) => void }) {
  useEffect(() => { const timer = setTimeout(() => onDismiss(notification.id), notification.tone === 'warning' ? 6500 : 4800); return () => clearTimeout(timer) }, [notification.id, notification.tone, onDismiss])
  return <motion.div className={`toast glass toast-${notification.tone}`} initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 18 }} layout role={notification.tone === 'warning' ? 'alert' : 'status'}>
    <span className="toast-symbol">{notification.tone === 'success' ? <Check size={18} /> : notification.tone === 'warning' ? <TriangleAlert size={18} /> : <Sparkles size={18} />}</span><div><strong>{notification.title}</strong>{notification.detail && <p>{notification.detail}</p>}</div><button aria-label="Đóng thông báo" onClick={() => onDismiss(notification.id)}><X size={14} /></button><i className="toast-timer" /></motion.div>
}

export default function App() {
  const [mode, setMode] = useState<CameraMode>('base')
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ id: 0, mode: 'base' })
  const [followRover, setFollowRover] = useState(false)
  const [cameraMoving, setCameraMoving] = useState<CameraMode | null>(null)
  const [roverStatus, setRoverStatus] = useState<RoverStatus>({ phase: 'docked', site: 'Căn cứ Artemis', siteId: 'base', trip: 0, distance: 0, speed: 0 })
  const [section, setSection] = useState<Section>('base')
  const [selected, setSelected] = useState<BuildingId | null>('command')
  const [paused, setPaused] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1050)
  const [commanderCollapsed, setCommanderCollapsed] = useState(() => window.innerWidth < 1000)
  const [hour, setHour] = useState(0)
  const [demo, setDemo] = useState<DemoAction | null>(null)
  const [completed, setCompleted] = useState(new Set<DemoKind>())
  const [resources, setResources] = useState({ electricity: 72, water: 56, oxygen: 68 })
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [history, setHistory] = useState<Notification[]>([{ id: -1, title: 'Chào mừng tới Artemis!', detail: 'Đội phi hành gia và tám công trình đang chờ bạn.', tone: 'success' }, { id: -2, title: 'Mọi hệ thống đã sẵn sàng', detail: 'Một ngày khám phá mới bắt đầu.', tone: 'info' }])
  const [modal, setModal] = useState<'settings' | 'crew' | 'help' | 'activity' | null>(null)
  const [ready, setReady] = useState(false)
  const [mockSeconds, setMockSeconds] = useState(0)
  const [preferences, setPreferences] = useState<Preferences>({ quality: 'high', reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, showLabels: false, showRoutes: true, sound: false })
  const world = useRef<WorldHandle>(null)
  const root = useRef<HTMLElement>(null), footer = useRef<HTMLDivElement>(null)
  useHudBounds(root, footer)
  const ids = useRef(0)
  const demoIds = useRef(0)
  const modalActive = useRef(false)
  modalActive.current = modal !== null

  const notify = useCallback((title: string, detail?: string, tone: Notification['tone'] = 'info') => {
    const notification = { id: ++ids.current, title, detail, tone }
    setNotifications((current) => [...current.slice(-1), notification])
    setHistory((current) => [...current.slice(-9), notification])
    if (preferences.sound) playUiTone(tone === 'info' ? 'click' : tone)
  }, [preferences.sound])
  const dismiss = useCallback((id: number) => setNotifications((current) => current.filter((item) => item.id !== id)), [])
  const changeMode = useCallback((next: CameraMode) => { setFollowRover(false); setCameraRequest((current) => ({ id: current.id + 1, mode: next })); if (preferences.sound) playUiTone() }, [preferences.sound])
  const changeSection = useCallback((next: Section) => { setSection(next); setPanelOpen(true); if (next === 'forecast' && mode === 'orbit') changeMode('region'); if (window.innerWidth < 1000) setCommanderCollapsed(true); if (preferences.sound) playUiTone() }, [mode, preferences.sound, changeMode])
  const selectBuilding = useCallback((id: BuildingId) => { setSelected(id); setSection('base'); setPanelOpen(true); if (window.innerWidth < 1000) setCommanderCollapsed(true); if (preferences.sound) playUiTone() }, [preferences.sound])
  const focusBuilding = useCallback((id: BuildingId) => {
    setFollowRover(false)
    if (mode === 'orbit') notify('Đến gần thêm một chút.', BUILDING_BY_ID[id].name)
    setSelected(id)
    world.current?.focus(id)
  }, [mode, notify])
  const startDemo = useCallback((kind: DemoKind) => {
    if (kind === 'rover') { setSelected('rover'); setFollowRover(true); notify('Cùng đi khám phá với MILO!', 'Nhấp đúp vào rover hoặc dùng nút theo dõi để cùng quan sát hành trình.'); return }
    if (demo && demo.phase !== 'complete') return
    setPaused(false); changeMode('base'); setSection('base')
    setSelected(kind === 'radiation' ? 'shelter' : kind)
    setDemo({ id: ++demoIds.current, kind, phase: 'walking' })
    if (kind === 'water') setResources((r) => ({ ...r, water: 56 }))
    if (kind === 'solar') setResources((r) => ({ ...r, electricity: 72 }))
    if (kind === 'radiation') notify('Cảnh báo bức xạ!', 'Diễn tập minh họa: cả đội đang về nhà trú ẩn.', 'warning')
    else notify('Linh đã nhận lời nhắn!', 'Cùng nhìn phi hành gia và thiết bị trong thế giới 3D nhé.')
    if (window.innerWidth < 1000) { setCommanderCollapsed(true); setPanelOpen(false) }
  }, [demo, notify, changeMode])
  const onPhase = useCallback((phase: DemoPhase) => {
    if (!demo || demo.phase === phase) return
    setDemo({ ...demo, phase })
    if (phase === 'working') {
      if (demo.kind === 'water') setResources((r) => ({ ...r, water: 72 }))
      if (demo.kind === 'solar') setResources((r) => ({ ...r, electricity: 86 }))
      if (demo.kind === 'oxygen') setResources((r) => ({ ...r, oxygen: 80 }))
    }
    if (phase === 'complete') {
      setCompleted((current) => new Set(current).add(demo.kind))
      notify(DEMO_RESULTS[demo.kind].title, DEMO_RESULTS[demo.kind].detail, 'success')
    }
  }, [demo, notify])
  const updatePreferences = useCallback((next: Preferences) => { if (next.sound && !preferences.sound) playUiTone('success'); setPreferences(next) }, [preferences.sound])
  const toggleSound = useCallback(() => { setPreferences((current) => ({ ...current, sound: !current.sound })); if (!preferences.sound) playUiTone('success') }, [preferences.sound])
  const fullscreen = useCallback(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { notify('Góc nhìn rộng vẫn ở đây!', 'Trình duyệt hiện tại không cho phép toàn màn hình.') }
  }, [notify])
  const mission = (index: number) => {
    if (index === 1) { changeSection('forecast'); setHour(2); changeMode('base'); notify('Hãy nhìn bóng của ngọn núi.', 'Kéo thanh dự báo tới +4h, rồi thử sạc pin dự trữ.'); return }
    const id = index === 2 ? 'rover' : 'water'
    selectBuilding(id); changeMode('base'); notify(index === 2 ? 'MILO đang chờ bạn!' : 'Mỗi giọt nước đều quý.', 'Chọn nút hành động trong bảng thông tin để thử một hoạt ảnh.')
  }
  useEffect(() => {
    if (paused || !ready || modal) return
    const timer = setInterval(() => setMockSeconds((seconds) => seconds + speed), 1000)
    return () => clearInterval(timer)
  }, [paused, ready, speed, modal])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (modalActive.current || target.closest('input, textarea, select, [contenteditable="true"]') || event.ctrlKey || event.metaKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === '1') changeMode('orbit')
      else if (key === '2') changeMode('region')
      else if (key === '3') changeMode('base')
      else if (key === 'b') changeSection('base')
      else if (key === 'm') changeSection('missions')
      else if (key === 'f') changeSection('forecast')
      else if (key === 'j') changeSection('journal')
      else if (key === 'r') world.current?.reset()
      else if (key === '+' || key === '=') world.current?.zoom('in')
      else if (key === '-') world.current?.zoom('out')
      else if (key === '?') setModal('help')
      else if (key === 'escape') { setSelected(null); setPanelOpen(false); setFollowRover(false) }
      else if (event.code === 'Space') { event.preventDefault(); setPaused((p) => !p) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [changeMode, changeSection])
  const mockMinutes = 8 * 60 + 24 + Math.floor(mockSeconds / 60)
  const time = `${String(Math.floor(mockMinutes / 60) % 24).padStart(2, '0')}:${String(mockMinutes % 60).padStart(2, '0')}`
  const radiation = demo?.kind === 'radiation' && demo.phase !== 'complete'
  const onSceneReady = useCallback(() => setReady(true), [])
  const onRoverStatus = useCallback((status: RoverStatus) => setRoverStatus(status), [])
  const onCameraTravel = useCallback((moving: boolean, destination: CameraMode) => setCameraMoving(moving ? destination : null), [])
  const onPanelOpen = useCallback((open: boolean) => { setPanelOpen(open); if (open && window.innerWidth < 1000) setCommanderCollapsed(true) }, [])
  return <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}><main ref={root} className={`lunaris-app ${preferences.reducedMotion ? 'reduced-motion' : ''} ${radiation ? 'radiation-active' : ''} ${panelOpen ? 'panel-open' : ''}`}>
    <World ref={world} mode={mode} cameraRequest={cameraRequest} onDistanceMode={setMode} selected={selected} onSelect={selectBuilding} onMode={changeMode} onCrew={() => setModal('crew')} paused={paused || !!modal} speed={speed} forecastHour={section === 'forecast' ? hour : 0} demo={demo} onPhase={onPhase} preferences={preferences} onReady={onSceneReady} followRover={followRover} onFollowRover={setFollowRover} onRoverStatus={onRoverStatus} onCameraTravel={onCameraTravel} />
    <TopHUD resources={resources} paused={paused} onPause={() => setPaused((p) => !p)} speed={speed} onSpeed={() => setSpeed((s) => s === 4 ? 1 : s * 2)} onSettings={() => setModal('settings')} onCrew={() => setModal('crew')} onActivity={() => setModal('activity')} sound={preferences.sound} onSound={toggleSound} onFullscreen={() => void fullscreen()} time={time} />
    <Sidebar section={section} onSection={changeSection} onSettings={() => setModal('settings')} onHelp={() => setModal('help')} />
    <WorldHeading mode={mode} onMode={changeMode} onMissions={() => changeSection('missions')} completed={completed.has('water')} />
    <ContextPanel section={section} selected={selected} onSelect={selectBuilding} onAction={startDemo} onFocus={focusBuilding} demo={demo} completed={completed} hour={hour} onHour={setHour} open={panelOpen} onOpen={onPanelOpen} onMission={mission} onNotify={(title, detail) => notify(title, detail, 'success')} roverStatus={roverStatus} followRover={followRover} onFollowRover={setFollowRover} />
    <div ref={footer} className="bottom-hud">
      <Commander collapsed={commanderCollapsed} onCollapse={(collapsed) => { setCommanderCollapsed(collapsed); if (!collapsed && window.innerWidth < 1000) setPanelOpen(false) }} onAction={startDemo} demo={demo} mode={mode} onMode={changeMode} />
      <div className="camera-status-stack">
        {cameraMoving && <div className="camera-moving-status glass" role="status" aria-live="polite"><LoaderCircle size={14} className="spin" /><span>Đang di chuyển camera…</span><small>{cameraMoving === 'orbit' ? 'Mặt Trăng' : cameraMoving === 'region' ? 'Khu vực' : 'Căn cứ'}</small></div>}
        {followRover && <div className="follow-rover-bar glass"><CarFront size={17} /><div><strong>ĐANG THEO DÕI MILO</strong><span>{roverStatus.phase === 'scanning' ? 'Đang quét' : roverStatus.phase === 'returning' ? 'Về căn cứ' : roverStatus.phase === 'docked' ? 'Kiểm tra tại căn cứ' : 'Khám phá'} · {roverStatus.site}</span></div><button aria-label="Dừng theo dõi rover" onClick={() => setFollowRover(false)}><X size={15} /></button></div>}
        {paused && <button className="pause-banner glass" onClick={() => setPaused(false)}><Pause size={13} /> Khám phá đang tạm dừng <span>Tiếp tục <Play size={11} /></span></button>}
      </div>
      <CameraNavigation mode={mode} onMode={changeMode} />
    </div>
    <CameraToolbar mode={mode} handle={world.current} onHelp={() => setModal('help')} selected={selected} />
    <div className="toast-stack" aria-live="polite"><AnimatePresence>{notifications.map((item) => <Toast key={item.id} notification={item} onDismiss={dismiss} />)}</AnimatePresence></div>
    {radiation && <div className="radiation-vignette" aria-hidden="true" />}
    {radiation && <motion.div className="radiation-banner glass" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}><ShieldCheck size={18} /><div><strong>CẢNH BÁO BỨC XẠ</strong><span>Diễn tập minh họa · cùng về nhà trú ẩn!</span></div><LoaderCircle className="spin" size={16} /></motion.div>}
    <AnimatePresence>{modal === 'settings' && <SettingsDialog preferences={preferences} onChange={updatePreferences} onClose={() => setModal(null)} />}{modal === 'crew' && <CrewDialog onClose={() => setModal(null)} onLocate={(name) => { setModal(null); setFollowRover(false); world.current?.focusCrew(name); notify(`Xin chào, ${name}!`, 'Đội của mình đang ở trong căn cứ. Nhấp vào phi hành gia để gặp cả đội.') }} />}{modal === 'help' && <HelpDialog onClose={() => setModal(null)} />}{modal === 'activity' && <ActivityDialog notifications={history} onClose={() => setModal(null)} onRadiation={() => { setModal(null); startDemo('radiation') }} />}</AnimatePresence>
    <span className="screen-reader-only">Bản thử nghiệm giao diện tương tác. Chỉ số và dự báo là minh họa, không có mô phỏng tài nguyên thực.</span>
  </main></MotionConfig>
}
