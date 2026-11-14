import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { CarFront, Check, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { BuildingId, CameraMode, CameraRequest, DemoAction, DemoKind, DemoPhase, Notification, Preferences, RoverStatus, Section, WorldHandle } from './types'
import { World } from './world/World'
import type { RoverMission } from './world/ExplorationRover'
import { demReady, roverRoutes, scienceZones } from './world/dem'
import { checkDetour } from './world/detour'
import { CameraToolbar } from './components/HUD'
import { ResourceHud, SettingsMenu, TopRight } from './components/MinimalHud'
import { Caption, IntroCinematic, Mascot, ModeSelect, WelcomeScreen } from './components/Onboarding'
import { ADVANCED_TOUR, BASIC_TOUR } from './onboarding/script'
import type { HudItem } from './onboarding/script'
import { CAPACITY } from './game/scenario'
import { CREW as CREW_PLAN } from './world/actor-plan'
import { ContextPanel } from './components/Panels'
import { ActivityDialog, CrewDialog, HelpDialog, SettingsDialog } from './components/Dialogs'
import { RestartDialog, SubmitDialog } from './components/GameDialogs'
import { DecisionDialog, EndingScreen, MissionLogDialog, ReturnCinematic, lunaHint, resourcePercent } from './components/Story'
import type { StoryAction } from './components/Story'
import { playUiTone } from './audio'
import { useHudBounds } from './hooks/useHudBounds'
import { SIM_MINUTES_PER_REAL_SECOND, browserStorage, clearSave, createInitialState, decisionCopy, endingReport, gameReducer, loadGame, missionTime, saveGame } from './game'
import type { GameAction, GameState, RouteFacts, WorldFacts, Zone, ZoneInfo } from './game'

function initialGame(): { state: GameState; status: string } {
  const result = loadGame(browserStorage())
  return result.status === 'loaded' ? { state: result.state, status: 'loaded' } : { state: createInitialState(), status: result.status }
}

/** A–D and their A* routes, straight from public/lunar/task02 (NASA data). D has no route within the slope limit. */
function zoneFacts(): ZoneInfo[] {
  if (!demReady()) return []
  const routes = roverRoutes() as unknown as Record<string, Record<string, unknown>>
  return scienceZones().map((z) => {
    const r = routes[z.id]
    const ok = !!r && r.route_status === 'NOMINAL_SLOPE_ROUTE_FOUND' && r.reaches_anchor_pixel === true
    const route: RouteFacts | null = ok ? {
      zone: z.id as Zone, name: z.name, lengthM: Number(r.route_length_m), maxSlopeDeg: Number(r.max_slope_deg), meanSlopeDeg: Number(r.mean_slope_deg),
      nearLimitPercent: Number(r.percent_route_within_1deg_of_threshold ?? 0), uncertainPercent: Number(r.percent_route_where_slope_plus_slperr_exceeds_threshold ?? 0),
      inPsr: (z as unknown as { in_mapped_psr_pixel?: boolean }).in_mapped_psr_pixel === true, heightM: z.height_m, slopeDeg: z.slope_deg,
    } : null
    return { zone: z.id as Zone, name: z.name, route, reason: ok ? undefined : `Không có tuyến dốc ≤ 15° tới đúng điểm này (${String(r?.no_route_reason ?? 'chưa tính')}).` }
  })
}

// Small in-world animations that accompany real state changes (the result always comes from the reducer).
const DEMO_FOR: Record<string, DemoKind> = { 'A1:recycle': 'water', 'A1:battery': 'battery', 'A3:stow': 'solar', 'B1:now': 'greenhouse', a2: 'oxygen', observe: 'greenhouse', harvest: 'greenhouse' }

function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: (id: number) => void }) {
  useEffect(() => { const timer = setTimeout(() => onDismiss(notification.id), notification.tone === 'warning' ? 6500 : 4800); return () => clearTimeout(timer) }, [notification.id, notification.tone, onDismiss])
  return <motion.div className={`toast glass toast-${notification.tone}`} initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 18 }} layout role={notification.tone === 'warning' ? 'alert' : 'status'}>
    <span className="toast-symbol">{notification.tone === 'success' ? <Check size={18} /> : notification.tone === 'warning' ? <TriangleAlert size={18} /> : <Sparkles size={18} />}</span><div><strong>{notification.title}</strong>{notification.detail && <p>{notification.detail}</p>}</div><button aria-label="Đóng thông báo" onClick={() => onDismiss(notification.id)}><X size={14} /></button><i className="toast-timer" /></motion.div>
}

export default function App() {
  const [mode, setMode] = useState<CameraMode>('base')
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ id: 0, mode: 'base' })
  const [followRover, setFollowRover] = useState(false)
  const [, setCameraMoving] = useState<CameraMode | null>(null)
  const [roverStatus, setRoverStatus] = useState<RoverStatus>({ phase: 'docked', site: 'Căn cứ Artemis', siteId: 'base', trip: 0, distance: 0, speed: 0 })
  const [section, setSection] = useState<Section>('missions')
  const [selected, setSelected] = useState<BuildingId | null>('command')
  const [boot] = useState(initialGame)
  const [game, rawDispatch] = useReducer(gameReducer, boot.state)
  const gameRef = useRef(game)
  gameRef.current = game
  const [speed, setSpeed] = useState(1)
  const [panelOpen, setPanelOpen] = useState(false)
  const [, setCommanderCollapsed] = useState(() => window.innerWidth < 1000)
  const [hour, setHour] = useState(0)
  const [demo, setDemo] = useState<DemoAction | null>(null)
  const [completed, setCompleted] = useState(new Set<DemoKind>())
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [history, setHistory] = useState<Notification[]>([])
  const [modal, setModal] = useState<'settings' | 'crew' | 'help' | 'activity' | 'timeline' | 'restart' | 'submit' | null>(null)
  const [hiddenDecision, setHiddenDecision] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [preferences, setPreferences] = useState<Preferences>({ quality: 'high', terrainLayer: 'game', reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches, showLabels: false, showRoutes: true, sound: false })
  const world = useRef<WorldHandle>(null)
  const root = useRef<HTMLElement>(null), footer = useRef<HTMLDivElement>(null)
  useHudBounds(root, footer)
  const ids = useRef(0), demoIds = useRef(0), modalActive = useRef(false)
  modalActive.current = modal !== null

  const dispatch = useCallback((action: GameAction) => rawDispatch(action), [])
  const notify = useCallback((title: string, detail?: string, tone: Notification['tone'] = 'info') => {
    const notification = { id: ++ids.current, title, detail, tone }
    setNotifications((current) => [...current.slice(-1), notification])
    setHistory((current) => [...current.slice(-19), notification])
    if (preferences.sound) playUiTone(tone === 'info' ? 'click' : tone)
  }, [preferences.sound])
  const dismiss = useCallback((id: number) => setNotifications((current) => current.filter((item) => item.id !== id)), [])
  const changeMode = useCallback((next: CameraMode) => { setFollowRover(false); setCameraRequest((current) => ({ id: current.id + 1, mode: next })); if (preferences.sound) playUiTone() }, [preferences.sound])
  const changeSection = useCallback((next: Section) => { setSection(next); setPanelOpen(true); if (next === 'forecast' && mode === 'orbit') changeMode('region'); if (window.innerWidth < 1000) setCommanderCollapsed(true); if (preferences.sound) playUiTone() }, [mode, preferences.sound, changeMode])
  const selectBuilding = useCallback((id: BuildingId) => { setSelected(id); setSection('base'); setPanelOpen(true); if (window.innerWidth < 1000) setCommanderCollapsed(true); if (preferences.sound) playUiTone() }, [preferences.sound])
  const focusBuilding = useCallback((id: BuildingId) => { setFollowRover(false); setSelected(id); setSection('base'); setPanelOpen(true); world.current?.focus(id) }, [])
  const playDemo = useCallback((kind: DemoKind | undefined) => {
    if (!kind) return
    setDemo((current) => current && current.phase !== 'complete' && current.kind === 'radiation' ? current : { id: ++demoIds.current, kind, phase: 'walking' })
  }, [])
  const onPhase = useCallback((phase: DemoPhase) => {
    setDemo((current) => {
      if (!current || current.phase === phase) return current
      if (phase === 'complete') setCompleted((done) => new Set(done).add(current.kind))
      return { ...current, phase }
    })
  }, [])

  // Test-only (?debug=1): open a building's panel exactly as clicking it in the world does.
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('debug')) return
    window.__LUNARIS_TEST_SELECT__ = (id: string) => selectBuilding(id as BuildingId)
    return () => { delete window.__LUNARIS_TEST_SELECT__ }
  }, [selectBuilding])
  // ── facts from the NASA data for C1/C2 and the DEM detour check for C3.1 ──
  const decision = game.decisions[0] ?? null
  const [zones, setZones] = useState<ZoneInfo[]>([])
  useEffect(() => { if (ready) setZones(zoneFacts()) }, [ready])
  const detour = useMemo(() => {
    if (!decision || decision.key !== 'C31' || !game.ice.zone || !game.ice.route) return null
    return checkDetour(game.ice.zone, game.ice.distanceM / game.ice.route.lengthM)
  }, [decision?.id])   // eslint-disable-line react-hooks/exhaustive-deps
  const facts: WorldFacts = useMemo(() => ({ zones, detourM: detour?.detourM ?? null, detourReason: detour?.reason }), [zones, detour])

  const choose = useCallback((choice: string) => {
    const g = gameRef.current, d = g.decisions[0]
    if (!d) return
    const route = d.key === 'C2' && choice === 'go' ? facts.zones.find((z) => z.zone === g.ice.zone)?.route ?? undefined : undefined
    dispatch({ type: 'decide', decisionId: d.id, choice, route, detourM: d.key === 'C31' && choice === 'detour' ? facts.detourM ?? undefined : undefined })
    playDemo(DEMO_FOR[`${d.key}:${choice}`])
    if (['C31', 'D3'].includes(d.key)) setFollowRover(choice !== 'return')
    // Basic mode stopped time for the question; it continues once nothing else is waiting.
    if (g.mode === 'basic' && g.decisions.length === 1) dispatch({ type: 'clock/setPaused', paused: false })
  }, [dispatch, facts, playDemo])

  // When a question appears, show the real place in the base it is about.
  const lastDecision = useRef<string | null>(null)
  useEffect(() => {
    if (!decision || decision.id === lastDecision.current || !ready) return
    lastDecision.current = decision.id
    setHiddenDecision(null)
    const building = decisionCopy(decision, game, facts).building as BuildingId | undefined
    if (['C31', 'D3'].includes(decision.key)) setFollowRover(true)
    else if (building && mode !== 'orbit') { setSelected(building); world.current?.focus(building) }
  }, [decision, ready, game, facts, mode])

  const story = useCallback((action: StoryAction) => {
    const g = gameRef.current
    if (action === 'submit') { setModal('submit'); return }
    if (action === 'follow') { setSelected('rover'); setFollowRover(true); return }
    const type = { a2: 'a2/activate', observe: 'food/observe', harvest: 'food/harvest', report: 'food/report', ice: 'ice/start' }[action] as GameAction['type']
    dispatch({ type } as GameAction)
    playDemo(DEMO_FOR[action])
    if (action === 'ice' && g.mode === 'advanced') setSelected('rover')
  }, [dispatch, playDemo])

  // New log entries become short toasts (the full cause chain stays in the mission log).
  const seenLog = useRef(game.log.length)
  useEffect(() => {
    const fresh = game.log.slice(seenLog.current)
    seenLog.current = game.log.length
    for (const e of fresh.slice(-2)) if (e.kind !== 'decision') notify(e.title, e.detail, e.kind === 'event' ? 'warning' : e.kind === 'consequence' || e.kind === 'research' ? 'success' : 'info')
  }, [game.log, notify])
  // D3: the crew really moves into the shelter while the event lasts.
  useEffect(() => { if (game.radiation.active) playDemo('radiation') }, [game.radiation.active, playDemo])

  // ── Opening flow (presentation only): welcome → mode → ready → journey → guided arrival → the game starts ──
  type Onb = 'welcome' | 'mode' | 'cinematic' | 'tour' | 'done'
  const [onb, setOnb] = useState<Onb>(() => boot.state.phase === 'opening' ? 'welcome' : 'done')
  const [tourMode, setTourMode] = useState<'basic' | 'advanced'>('basic')
  const [step, setStep] = useState(0), [line, setLine] = useState(0)
  const [revealed, setRevealed] = useState<Set<HudItem>>(new Set())
  const [cycle, setCycle] = useState(0)
  const [touring, setTouring] = useState(false)
  const [mascotOpen, setMascotOpen] = useState(true)
  const tour = tourMode === 'basic' ? BASIC_TOUR : ADVANCED_TOUR
  const current = onb === 'tour' ? tour[step] : null
  const opened = useRef(false)
  useEffect(() => { if (ready && onb !== 'done' && !opened.current) { opened.current = true; changeMode('orbit') } }, [ready, onb, changeMode])
  const fly = useCallback((next: CameraMode, altitudeM?: number) => { setFollowRover(false); setCameraRequest((c) => ({ id: c.id + 1, mode: next, altitudeM })) }, [])
  const finishTour = useCallback((m: 'basic' | 'advanced') => {
    setOnb('done'); setRevealed(new Set(['battery', 'water', 'oxygen', 'food'])); setTouring(false)
    fly('base'); dispatch({ type: 'game/start', mode: m }); setMascotOpen(true)
  }, [dispatch, fly])
  // Each step's camera cue and HUD reveal run when the step starts.
  useEffect(() => {
    if (!current) return
    if (current.reveal) setRevealed((r) => new Set([...r, ...current.reveal!]))
    if (current.camera === 'base') fly('base')
    else if (current.camera === 'solar') world.current?.focus('solar')
    else if (current.camera === 'crew') world.current?.focusCrew(CREW_PLAN[0].name)
  }, [step, onb])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!current?.highlight || current.highlight.length < 2) return; const t = setInterval(() => setCycle((c) => c + 1), 900); return () => clearInterval(t) }, [current])
  const tourTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => tourTimers.current.forEach(clearTimeout), [])
  const nextStep = useCallback(() => {
    if (step + 1 >= tour.length) { finishTour(tourMode); return }
    setStep(step + 1); setLine(0)
  }, [step, tour, tourMode, finishTour])
  // The south-pole tour: zoom out over the real LOLA terrain, hold, come back to the base, then continue by itself.
  const runTour = useCallback(() => {
    setTouring(true); fly('region', 30_000)
    const back = setTimeout(() => fly('base'), preferences.reducedMotion ? 3000 : 6500)
    const done = setTimeout(() => { setTouring(false); nextStep() }, preferences.reducedMotion ? 5000 : 10500)
    tourTimers.current = [back, done]
  }, [fly, nextStep, preferences.reducedMotion])
  // Skipping cancels the timers and restores the base view before the tutorial goes on.
  const skipTourCamera = useCallback(() => { tourTimers.current.forEach(clearTimeout); setTouring(false); fly('base'); nextStep() }, [fly, nextStep])
  const advance = useCallback(() => {
    if (!current) return
    if (line + 1 < current.lines.length) { setLine(line + 1); return }
    if (current.camera === 'tour') { runTour(); return }
    nextStep()
  }, [current, line, runTour, nextStep])
  const hudHighlight: HudItem | null = current?.highlight ? current.highlight[cycle % current.highlight.length] : null
  const hudVisible = onb === 'done' ? new Set<HudItem>(['battery', 'water', 'oxygen', 'food']) : revealed
  // Return home: fly out to the whole Moon, then show the results.
  useEffect(() => {
    if (game.phase !== 'returning') return
    setFollowRover(false); setModal(null); changeMode('orbit')
    const timer = setTimeout(() => dispatch({ type: 'mission/finishReturn' }), 6500)
    return () => clearTimeout(timer)
  }, [game.phase, changeMode, dispatch])

  useEffect(() => { saveGame(game, browserStorage()) }, [game])
  const bootNotified = useRef(false)
  useEffect(() => {
    if (bootNotified.current) return
    bootNotified.current = true
    if (boot.status === 'loaded' && boot.state.phase !== 'opening') notify('Đã mở lại chuyến đi đã lưu.', 'Tiến trình được lưu ngay trên máy này.')
    else if (boot.status === 'incompatible' || boot.status === 'corrupt') notify('Bản lưu cũ không dùng được.', 'Một chuyến đi mới đã bắt đầu.', 'warning')
  }, [boot, notify])
  const restartGame = useCallback(() => {
    clearSave(browserStorage())
    dispatch({ type: 'game/restart' })
    setDemo(null); setCompleted(new Set()); setModal(null); setFollowRover(false); opened.current = false
    setSelected('command'); seenLog.current = 1
    setOnb('welcome'); setStep(0); setLine(0); setRevealed(new Set()); setPanelOpen(false); opened.current = false
  }, [dispatch])
  const updatePreferences = useCallback((next: Preferences) => { if (next.sound && !preferences.sound) playUiTone('success'); setPreferences(next) }, [preferences.sound])
  const toggleSound = useCallback(() => { setPreferences((current) => ({ ...current, sound: !current.sound })); if (!preferences.sound) playUiTone('success') }, [preferences.sound])
  const fullscreen = useCallback(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { notify('Góc nhìn rộng vẫn ở đây!', 'Trình duyệt hiện tại không cho phép toàn màn hình.') }
  }, [notify])
  const paused = game.isPaused
  const setPaused = useCallback((next: boolean) => dispatch({ type: 'clock/setPaused', paused: next }), [dispatch])

  // Mission clock: only `clock/tick` moves time. Never while paused, during the opening/ending, or with a menu open.
  const decisionBlocks = game.mode === 'basic' && game.decisions.length > 0
  useEffect(() => {
    if (paused || !ready || modal !== null || game.phase !== 'playing' || decisionBlocks) return
    const timer = setInterval(() => dispatch({ type: 'clock/tick', minutes: SIM_MINUTES_PER_REAL_SECOND * speed / 4 }), 250)
    return () => clearInterval(timer)
  }, [paused, ready, speed, modal, game.phase, decisionBlocks, dispatch])
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
      else if (event.code === 'Space') { event.preventDefault(); setPaused(!gameRef.current.isPaused) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [changeMode, changeSection, setPaused])

  const clock = missionTime(game)
  const resources = resourcePercent(game)
  // Food bar: days of packaged food left vs. the full store (CAPACITY.food crew-days), never an invented percentage.
  const hudValues = { battery: resources.battery, water: resources.water, oxygen: resources.oxygen, foodDays: resources.foodDays, foodFraction: game.resources.food / CAPACITY.food }
  const radiation = game.radiation.active
  const ice = game.ice, total = ice.route ? ice.route.lengthM + ice.detourM : 1
  const roverMission: RoverMission | null = ice.zone && ['outbound', 'anomaly', 'surveying', 'returning', 'recalled'].includes(ice.stage)
    ? { zone: ice.zone, phase: ice.stage === 'surveying' ? 'scanning' : ice.stage === 'returning' || ice.stage === 'recalled' ? 'returning' : 'outbound', progress: ice.stage === 'surveying' ? 1 : ice.distanceM / total }
    : null
  const onSceneReady = useCallback(() => setReady(true), [])
  const onRoverStatus = useCallback((status: RoverStatus) => setRoverStatus(status), [])
  const onCameraTravel = useCallback((moving: boolean, destination: CameraMode) => setCameraMoving(moving ? destination : null), [])
  const onPanelOpen = useCallback((open: boolean) => { setPanelOpen(open); if (open && window.innerWidth < 1000) setCommanderCollapsed(true) }, [])
  const showDecision = decision && hiddenDecision !== decision.id && modal === null && game.phase === 'playing' && onb === 'done'
  return <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}><main ref={root} className={`lunaris-app ${preferences.reducedMotion ? 'reduced-motion' : ''} ${radiation ? 'radiation-active' : ''} ${panelOpen ? 'panel-open' : ''} story-${game.phase}`}>
    <World ref={world} mode={mode} cameraRequest={cameraRequest} onDistanceMode={setMode} selected={selected} onSelect={selectBuilding} onMode={changeMode} onCrew={() => setModal('crew')} paused={(paused && !(demo && demo.phase !== 'complete')) || !!modal} speed={speed} forecastHour={section === 'forecast' ? hour : 0} demo={demo} onPhase={onPhase} preferences={preferences} onReady={onSceneReady} followRover={followRover} onFollowRover={setFollowRover} onRoverStatus={onRoverStatus} onCameraTravel={onCameraTravel} roverMission={roverMission} sheltered={radiation} />
    <ResourceHud values={hudValues} visible={hudVisible} highlight={hudHighlight} />
    <TopRight values={hudValues} visible={hudVisible} highlight={hudHighlight} paused={paused} onPause={() => setPaused(!paused)} speed={speed} onSpeed={() => setSpeed((s) => s === 8 ? 1 : s * 2)} time={onb === 'done' && game.phase === 'playing' ? `Ngày ${clock.day} · ${clock.label}` : null}
      menu={<>{decision && !showDecision && game.phase === 'playing' && onb === 'done' && <button className="hud-alert" aria-label="Mở lại quyết định đang chờ" onClick={() => setHiddenDecision(null)}><TriangleAlert size={16} /></button>}<SettingsMenu onDisplay={() => setModal('settings')} onMissions={() => changeSection('missions')} onTimeline={() => setModal('timeline')} onCrew={() => setModal('crew')} onActivity={() => setModal('activity')} onSound={toggleSound} sound={preferences.sound} onFullscreen={() => void fullscreen()} onHelp={() => setModal('help')} onCamera={changeMode} /></>} />
    {panelOpen && <ContextPanel section={section} selected={selected} onSelect={selectBuilding} onAction={(kind) => playDemo(kind)} onFocus={focusBuilding} game={game} demo={demo} completed={completed} hour={hour} onHour={setHour} open={panelOpen} onOpen={onPanelOpen} onMission={() => undefined} onNotify={(title, detail) => notify(title, detail, 'success')} roverStatus={roverStatus} followRover={followRover} onFollowRover={setFollowRover} onStory={story} />}
    <div ref={footer} className="bottom-hud">
      {current && tourMode === 'basic' && <Mascot text={current.lines[line]} mood={current.mood} onNext={touring ? skipTourCamera : advance} nextLabel={touring ? 'Bỏ qua' : step + 1 === tour.length && line + 1 === current.lines.length ? 'Sẵn sàng!' : 'Tiếp tục'} />}
      {current && tourMode === 'advanced' && <Caption text={current.lines[line]} onNext={touring ? skipTourCamera : advance} />}
      {onb === 'done' && game.mode === 'basic' && game.phase === 'playing' && <Mascot compact={!mascotOpen} onToggle={() => setMascotOpen(!mascotOpen)} text={lunaHint(game)} mood={radiation || decision ? 'warning' : 'idle'} onNext={decision && !showDecision ? () => setHiddenDecision(null) : undefined} nextLabel="Mở quyết định" />}
      <div className="camera-status-stack">
        {followRover && <div className="follow-rover-bar glass"><CarFront size={17} /><div><strong>ĐANG THEO DÕI MILO</strong><span>{roverStatus.site}</span></div><button aria-label="Dừng theo dõi rover" onClick={() => setFollowRover(false)}><X size={15} /></button></div>}
      </div>
    </div>
    <CameraToolbar mode={mode} handle={world.current} onHelp={() => setModal('help')} selected={selected} />
    <div className="toast-stack" aria-live="polite"><AnimatePresence>{notifications.map((item) => <Toast key={item.id} notification={item} onDismiss={dismiss} />)}</AnimatePresence></div>
    {radiation && <div className="radiation-vignette" aria-hidden="true" />}
    <AnimatePresence>
      {ready && onb === 'welcome' && <WelcomeScreen key="welcome" onNext={() => setOnb('mode')} />}
      {onb === 'mode' && <ModeSelect key="mode" onReady={(m) => { setTourMode(m); setOnb('cinematic') }} />}
      {onb === 'cinematic' && <IntroCinematic key="cinematic" reducedMotion={preferences.reducedMotion} onDone={() => { setOnb('tour'); setStep(0); setLine(0); fly('base') }} />}
      {showDecision && <DecisionDialog key={decision.id} decision={decision} game={game} world={facts} onChoose={choose} onInspect={() => setHiddenDecision(decision.id)} />}
      {game.phase === 'returning' && <ReturnCinematic key="return" reason={endingReport(game).reason} />}
      {game.phase === 'ended' && <EndingScreen key="ending" game={game} onRestart={restartGame} />}
      {modal === 'timeline' && <MissionLogDialog game={game} onClose={() => setModal(null)} />}
      {modal === 'restart' && <RestartDialog onConfirm={restartGame} onClose={() => setModal('settings')} />}
      {modal === 'submit' && <SubmitDialog foodDone={!!game.food.report} iceDone={!!game.ice.report} onConfirm={() => { setModal(null); dispatch({ type: 'mission/submit' }) }} onClose={() => setModal(null)} />}
    </AnimatePresence>
    <AnimatePresence>{modal === 'settings' && <SettingsDialog preferences={preferences} onChange={updatePreferences} onClose={() => setModal(null)} onRestart={() => setModal('restart')} />}{modal === 'crew' && <CrewDialog onClose={() => setModal(null)} onLocate={(name) => { setModal(null); setFollowRover(false); world.current?.focusCrew(name) }} />}{modal === 'help' && <HelpDialog onClose={() => setModal(null)} />}{modal === 'activity' && <ActivityDialog notifications={history} onClose={() => setModal(null)} onRadiation={() => { setModal(null); notify('Bức xạ chỉ xảy ra theo kịch bản nhiệm vụ.', 'Theo dõi Nhật ký nhân quả để xem khi nào.') }} />}</AnimatePresence>
    <span className="screen-reader-only">Story Mode, chặng {game.stage}. Điện, nước, oxy, thực phẩm là số giả định của trò chơi, không phải số liệu NASA.</span>
  </main></MotionConfig>
}

