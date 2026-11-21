import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as THREE from 'three'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { CarFront, Check, Sparkles, TriangleAlert, X } from 'lucide-react'
import type { BuildingId, CameraMode, CameraRequest, DemoAction, DemoKind, DemoPhase, Notification, Preferences, RoverStatus, Section, WorldHandle } from './types'
import { World } from './world/World'
import type { RoverMission } from './world/ExplorationRover'
import { demReady, roverRoutes, scienceZones } from './world/dem'
import { checkDetour } from './world/detour'
import { CameraToolbar } from './components/HUD'
import { ObjectiveChip, ResourceHud, SettingsMenu, TopRight } from './components/MinimalHud'
import { Caption, IntroCinematic, Mascot, ModeSelect, ReadyFrame, WelcomeScreen } from './components/Onboarding'
import { ADVANCED_TOUR, BASIC_TOUR, BRIEFINGS } from './onboarding/script'
import type { HudItem } from './onboarding/script'
import { CAPACITY, SCHEDULE } from './game/scenario'
import { SUPPLY_PAD, SUPPLY_ROVER_PATH, tripPhase } from './world/SupplyOps'
import type { SupplyView } from './world/SupplyOps'
import { DEMO_ROUTES, LINEUP_CENTRE } from './world/actor-plan'
import { surveyLegs } from './world/rover-plan'
import { ContextPanel } from './components/Panels'
import { ActivityDialog, CrewDialog, HelpDialog, SettingsDialog } from './components/Dialogs'
import { RestartDialog, SubmitDialog } from './components/GameDialogs'
import { DecisionDialog, EndingScreen, MissionLogDialog, ReturnCinematic, ReviewPanel, RouteCard, lunaHint, resourcePercent } from './components/Story'
import type { StoryAction } from './components/Story'
import { playUiTone } from './audio'
import { useHudBounds } from './hooks/useHudBounds'
import { SIM_MINUTES_PER_REAL_SECOND, b1Resolved, currentObjective, browserStorage, clearSave, createInitialState, decisionCopy, endingAnalysis, gameReducer, loadGame, missionTime, saveGame } from './game'
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
    return { zone: z.id as Zone, name: z.name, route, reason: ok ? undefined : `No route with slope ≤ 15° reaches this exact point (${String(r?.no_route_reason ?? 'not computed')}).` }
  })
}

// Small in-world animations that accompany real state changes (the result always comes from the reducer).
const DEMO_FOR: Record<string, DemoKind> = { 'A1:recycle': 'water', 'A1:battery': 'battery', 'A3:stow': 'solar', 'B1:now': 'greenhouse', 'D1:greenhouse': 'greenhouse', 'D1:rover': 'rover', a2: 'oxygen', observe: 'greenhouse', harvest: 'greenhouse' }

function Toast({ notification, onDismiss }: { notification: Notification; onDismiss: (id: number) => void }) {
  // Ambient only (small confirmations). Anything the player must know goes to the review panel and the journal.
  useEffect(() => { const timer = setTimeout(() => onDismiss(notification.id), 3200); return () => clearTimeout(timer) }, [notification.id, onDismiss])
  return <motion.div className={`toast glass toast-${notification.tone}`} initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 18 }} layout role={notification.tone === 'warning' ? 'alert' : 'status'}>
    <span className="toast-symbol">{notification.tone === 'success' ? <Check size={18} /> : notification.tone === 'warning' ? <TriangleAlert size={18} /> : <Sparkles size={18} />}</span><div><strong>{notification.title}</strong>{notification.detail && <p>{notification.detail}</p>}</div><button aria-label="Close notification" onClick={() => onDismiss(notification.id)}><X size={14} /></button></motion.div>
}

export default function App() {
  const [mode, setMode] = useState<CameraMode>('base')
  const [cameraRequest, setCameraRequest] = useState<CameraRequest>({ id: 0, mode: 'base' })
  const [followRover, setFollowRover] = useState(false)
  const [, setCameraMoving] = useState<CameraMode | null>(null)
  const [roverStatus, setRoverStatus] = useState<RoverStatus>({ phase: 'docked', site: 'Artemis Base', siteId: 'base', trip: 0, distance: 0, speed: 0 })
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
    // Basic: time stays stopped; the result review's "Tiếp tục" (notice/ack) resumes it.
  }, [dispatch, facts, playDemo])

  // When a question appears, show the real place in the base it is about.
  const lastDecision = useRef<string | null>(null)
  useEffect(() => {
    if (!decision || decision.id === lastDecision.current || !ready) return
    lastDecision.current = decision.id
    setHiddenDecision(null)
    const building = decisionCopy(decision, game, facts).building as BuildingId | undefined
    if (['C31', 'D3'].includes(decision.key)) setFollowRover(true)
    else if (['C1', 'C2'].includes(decision.key)) setSelected('rover')   // keep the map view from the briefing
    else if (building && mode !== 'orbit') { setSelected(building); world.current?.focus(building) }
  }, [decision, ready, game, facts, mode])

  const story = useCallback((action: StoryAction) => {
    const g = gameRef.current
    if (action === 'submit') { setModal('submit'); return }
    if (action === 'follow') { setSelected('rover'); setFollowRover(true); return }
    if (action === 'repair') { dispatch({ type: 'food/repairNow' }); playDemo('greenhouse'); return }
    if (action === 'food' || action === 'ice') { if (new URLSearchParams(location.search).has('debug')) console.info('[brief]', action); openBriefing(action); return }
    const type = { a2: 'a2/activate', observe: 'food/observe', harvest: 'food/harvest', report: 'food/report' }[action] as GameAction['type']
    dispatch({ type } as GameAction)
    playDemo(DEMO_FOR[action])
    void g
  }, [dispatch, playDemo])   // eslint-disable-line react-hooks/exhaustive-deps

  // New log entries become short toasts (the full cause chain stays in the mission log).
  const seenLog = useRef(game.log.length)
  useEffect(() => {
    const fresh = game.log.slice(seenLog.current)
    seenLog.current = game.log.length
    // Important entries wait in the review panel (game.inbox); only small ambient confirmations become a short toast.
    for (const e of fresh.slice(-2)) if (e.kind === 'research' && !game.inbox.includes(e.id) && e.tag !== 'B2') notify(e.title, undefined, 'success')
  }, [game.log, notify])   // eslint-disable-line react-hooks/exhaustive-deps
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
    else if (current.camera === 'crew') world.current?.focusArea(LINEUP_CENTRE[0], LINEUP_CENTRE[1], 13)
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
  // ── Research briefings (B and C): the mascot (Basic) or a caption (Advanced) introduces the branch;
  // its first event can only start from the button at the end. Basic stops the clock while it is read.
  const [brief, setBrief] = useState<{ id: 'food' | 'ice'; line: number } | null>(null)
  const openBriefing = useCallback((id: 'food' | 'ice', fromReview = false) => {
    const g = gameRef.current
    if (g.stage !== 'free' || g.phase !== 'playing' || (id === 'food' && g.food.started) || (id === 'ice' && (g.ice.stage !== 'idle' || !!g.ice.report || g.supply.roverPhase !== 'none' || g.supply.stage === 'pickup')) || g.decisions.length > 0 || g.inbox.length > (fromReview ? 1 : 0)) return
    setPanelOpen(false); setBrief({ id, line: 0 })
    if (g.mode === 'basic') dispatch({ type: 'clock/setPaused', paused: true })
  }, [dispatch])
  useEffect(() => {
    if (!brief) return
    const cue = BRIEFINGS[brief.id].camera[brief.line]
    if (cue === 'map') fly('region', 14_000)
    else { setFollowRover(false); setSelected(cue); world.current?.focus(cue) }
  }, [brief, fly])
  const startResearch = useCallback(() => {
    if (!brief) return
    const g = gameRef.current
    setBrief(null)
    if (brief.id === 'food') { dispatch({ type: 'food/begin' }); if (g.mode === 'basic') dispatch({ type: 'clock/setPaused', paused: false }) }
    else dispatch({ type: 'ice/start' })
  }, [brief, dispatch])
  const nextBriefLine = useCallback(() => { if (brief) { if (brief.line + 1 < BRIEFINGS[brief.id].lines.length) setBrief({ ...brief, line: brief.line + 1 }); else startResearch() } }, [brief, startResearch])
  // Advanced: time keeps running, so an open decision is shown before unread results (they wait in the panel queue).
  // While a crew member really carries out the task (demo), the panels step aside so the player can watch.
  const demoBusy = !!demo && demo.phase !== 'complete' && demo.kind !== 'radiation'
  const demoFrame = useRef(0)
  useEffect(() => {
    if (!demo || demo.kind === 'radiation' || demo.phase === 'complete') return
    const route = DEMO_ROUTES[demo.kind]
    if (demoFrame.current !== demo.id) {
      demoFrame.current = demo.id
      setSpeed(1); setPanelOpen(false); setFollowRover(false)       // normal speed, nothing covering the scene
      const xs = route.map((p) => p[0]), zs = route.map((p) => p[1])
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
      world.current?.focusArea((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...zs) + Math.min(...zs)) / 2, Math.max(15, span * 1.25))   // the whole walk in view
    } else if (demo.phase === 'working') {
      const end = route[route.length - 1]
      world.current?.focusArea(end[0], end[1], 11)                   // closer while the work is done
    }
  }, [demo?.id, demo?.phase, demo?.kind])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // safety: never leave the panels hidden if a demo cannot finish
    if (!demoBusy) return
    const t = setTimeout(() => setDemo((d) => d && d.phase !== 'complete' ? { ...d, phase: 'complete' } : d), 18000)
    return () => clearTimeout(t)
  }, [demoBusy, demo?.id])
  const review = game.phase === 'playing' && onb === 'done' && !brief && !demoBusy && !(game.mode === 'advanced' && game.decisions.length > 0) ? game.inbox[0] ?? null : null
  const ack = useCallback(() => { const id = gameRef.current.inbox[0]; if (id) dispatch({ type: 'notice/ack', id }) }, [dispatch])
  const reviewEntry = review ? game.log.find((e) => e.id === review) : null
  // Basic: the mascot leads one branch at a time — food first (after the tutorial), ice after B1 is resolved.
  const offered = useRef<Set<string>>(new Set())
  useEffect(() => {
    const g = game
    if (g.mode !== 'basic' || g.phase !== 'playing' || onb !== 'done' || brief || g.inbox.length || g.decisions.length || g.stage !== 'free' || modal) return
    if (!g.food.started && !offered.current.has('food')) { offered.current.add('food'); openBriefing('food') }
    else if (g.ice.stage === 'idle' && !g.ice.report && b1Resolved(g) && !offered.current.has('ice')) { offered.current.add('ice'); openBriefing('ice') }
  }, [game, onb, brief, modal, openBriefing])
  const objective = onb === 'done' && !brief && !review && !demoBusy ? currentObjective(game) : null
  const look = useCallback((b: string) => { setFollowRover(false); selectBuilding(b as BuildingId); world.current?.focus(b as BuildingId) }, [selectBuilding])
  const skip = useCallback(() => dispatch({ type: 'clock/skip', maxMinutes: 3 * 1440 }), [dispatch])
  // Enter / Space press the single dialogue action on screen (never a choice button or a menu item).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.code !== 'Space') return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, .story-option, [role="menuitem"], .story-decision')) return
      const actions = [...document.querySelectorAll<HTMLButtonElement>('[data-dialogue-action]')].filter((b) => !b.disabled && b.offsetParent !== null)
      if (actions.length !== 1 || document.querySelector('.story-decision')) return
      if (target.tagName === 'BUTTON' && target !== actions[0]) return
      e.preventDefault(); e.stopPropagation(); actions[0].click()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
  // C2: look at the whole real route before deciding.
  const c2Seen = useRef<string | null>(null)
  useEffect(() => {
    if (!decision || decision.key !== 'C2' || c2Seen.current === decision.id || !ready) return
    c2Seen.current = decision.id
    const leg = surveyLegs().find((l) => l.site.id === decision.context.zone)
    if (!leg) return
    const v = leg.curve.getPointAt(0.5, new THREE.Vector3())
    setFollowRover(false); world.current?.focusArea(v.x, v.z, Math.max(1600, leg.length * 0.95), 'region')
  }, [decision, ready])

  // Return home: fly out to the whole Moon, then show the results.
  useEffect(() => {
    if (game.phase !== 'returning') return
    setFollowRover(false); setModal(null); changeMode('orbit')
    const timer = setTimeout(() => dispatch({ type: 'mission/finishReturn' }), 6500)
    return () => clearTimeout(timer)
  }, [game.phase, changeMode, dispatch])

  // Progress is saved on this device only (localStorage; no account, no server). Nothing is kept while the game is at its
  // opening, so pressing Restart leaves no old progress behind (reload starts from the welcome screen).
  useEffect(() => { if (game.phase === 'opening') clearSave(browserStorage()); else saveGame(game, browserStorage()) }, [game])
  const bootNotified = useRef(false)
  useEffect(() => {
    if (bootNotified.current) return
    bootNotified.current = true
    if (boot.status === 'loaded' && boot.state.phase !== 'opening') notify('Your saved mission is back.', 'Progress is saved right on this device.')
    else if (boot.status === 'incompatible' || boot.status === 'corrupt') notify('The old save could not be used.', 'A new mission has started.', 'warning')
  }, [boot, notify])
  const restartGame = useCallback(() => {
    clearSave(browserStorage())
    dispatch({ type: 'game/restart' })
    setDemo(null); setCompleted(new Set()); setModal(null); setFollowRover(false); opened.current = false
    setSelected('command'); seenLog.current = 1
    setOnb('welcome'); setStep(0); setLine(0); setRevealed(new Set()); setPanelOpen(false); opened.current = false; setBrief(null); offered.current = new Set()
  }, [dispatch])
  const updatePreferences = useCallback((next: Preferences) => { if (next.sound && !preferences.sound) playUiTone('success'); setPreferences(next) }, [preferences.sound])
  const toggleSound = useCallback(() => { setPreferences((current) => ({ ...current, sound: !current.sound })); if (!preferences.sound) playUiTone('success') }, [preferences.sound])
  const fullscreen = useCallback(async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { notify('The wide view is still here!', 'This browser does not allow full screen.') }
  }, [notify])
  const paused = game.isPaused
  const setPaused = useCallback((next: boolean) => dispatch({ type: 'clock/setPaused', paused: next }), [dispatch])

  // Mission clock: only `clock/tick` moves time. Never while paused, during the opening/ending, or with a menu open.
  const decisionBlocks = game.mode === 'basic' && (game.decisions.length > 0 || game.inbox.length > 0 || !!brief)
  useEffect(() => {
    if (paused || !ready || modal !== null || game.phase !== 'playing' || decisionBlocks) return
    const timer = setInterval(() => dispatch({ type: 'clock/tick', minutes: SIM_MINUTES_PER_REAL_SECOND * speed / 4 }), 250)
    return () => clearInterval(timer)
  }, [paused, ready, speed, modal, game.phase, decisionBlocks, dispatch])
  // Advanced: the D2 lander still needs a decision after landing; nothing else changes here.
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
  // D2 in the 3D world: real progress from the game state (landing, the carrier's trip, delivery once).
  const sup = game.supply, nowMin = game.clock.elapsedMinutes
  const jobT = sup.stage === 'pickup' && sup.phaseStartedAt !== null && sup.jobDoneAt !== null && sup.jobDoneAt > sup.phaseStartedAt ? Math.min(1, Math.max(0, (nowMin - sup.phaseStartedAt) / (sup.jobDoneAt - sup.phaseStartedAt))) : 0
  const carrier = sup.stage === 'pickup' ? (sup.method === 'crew' ? 'crew' : sup.roverPhase === 'trip' ? 'rover' : null) : null
  const supplyView: SupplyView | null = ['landing', 'waiting', 'pickup', 'delivered'].includes(sup.stage) ? {
    landing: sup.stage === 'landing' && sup.landingEndsAt !== null ? Math.min(1, Math.max(0, 1 - (sup.landingEndsAt - nowMin) / SCHEDULE.d2LandingMin)) : 1,
    carrier, progress: carrier ? jobT : 0, delivered: sup.stage === 'delivered',
  } : null
  const supplyTrip = carrier === 'rover' ? tripPhase(jobT) : null
  const roverForStory: RoverMission | null = supplyTrip ? { zone: null, phase: supplyTrip.leg === 'back' ? 'returning' : 'outbound', progress: supplyTrip.along, path: SUPPLY_ROVER_PATH } : roverMission
  void SUPPLY_PAD
  const solarStowed = game.power.stowedUntil !== null && nowMin < game.power.stowedUntil
  const onSceneReady = useCallback(() => setReady(true), [])
  const onRoverStatus = useCallback((status: RoverStatus) => setRoverStatus(status), [])
  const onCameraTravel = useCallback((moving: boolean, destination: CameraMode) => setCameraMoving(moving ? destination : null), [])
  const onPanelOpen = useCallback((open: boolean) => { setPanelOpen(open); if (open && window.innerWidth < 1000) setCommanderCollapsed(true) }, [])
  const showDecision = decision && hiddenDecision !== decision.id && modal === null && game.phase === 'playing' && onb === 'done' && !review && !brief && !demoBusy
  return <MotionConfig reducedMotion={preferences.reducedMotion ? 'always' : 'user'}><main ref={root} className={`lunaris-app ${preferences.reducedMotion ? 'reduced-motion' : ''} ${radiation ? 'radiation-active' : ''} ${panelOpen ? 'panel-open' : ''} story-${game.phase}`}>
    <World ref={world} mode={mode} cameraRequest={cameraRequest} onDistanceMode={setMode} selected={selected} onSelect={selectBuilding} onMode={changeMode} onCrew={() => setModal('crew')} paused={(paused && !(demo && demo.phase !== 'complete')) || !!modal} speed={speed} forecastHour={section === 'forecast' ? hour : 0} demo={demo} onPhase={onPhase} preferences={preferences} onReady={onSceneReady} followRover={followRover} onFollowRover={setFollowRover} onRoverStatus={onRoverStatus} onCameraTravel={onCameraTravel} roverMission={roverForStory} sheltered={radiation} solarStowed={solarStowed} supply={supplyView} crewGreeting={!!current?.crewGreeting} routeZone={decision?.key === 'C2' && showDecision ? String(decision.context.zone) : null} />
    <ResourceHud values={hudValues} visible={hudVisible} highlight={hudHighlight} live={ready && onb === 'done' && game.phase === 'playing'} />
    <TopRight values={hudValues} visible={hudVisible} highlight={hudHighlight} paused={paused} onPause={() => setPaused(!paused)} speed={speed} onSpeed={() => setSpeed((s) => s === 8 ? 1 : s * 2)} time={onb === 'done' && game.phase === 'playing' ? `Day ${clock.day} · ${clock.label}` : null}
      menu={<>{decision && !showDecision && game.phase === 'playing' && onb === 'done' && <button className="hud-alert" aria-label="Reopen the pending decision" onClick={() => setHiddenDecision(null)}><TriangleAlert size={16} /></button>}<SettingsMenu onDisplay={() => setModal('settings')} onMissions={() => changeSection('missions')} onTimeline={() => setModal('timeline')} onCrew={() => setModal('crew')} onActivity={() => setModal('activity')} onSound={toggleSound} sound={preferences.sound} onFullscreen={() => void fullscreen()} onHelp={() => setModal('help')} onCamera={changeMode} /></>} />
    {panelOpen && !demoBusy && <ContextPanel section={section} selected={selected} onSelect={selectBuilding} onAction={(kind) => playDemo(kind)} onFocus={focusBuilding} game={game} demo={demo} completed={completed} hour={hour} onHour={setHour} open={panelOpen} onOpen={onPanelOpen} onMission={() => undefined} onNotify={(title, detail) => notify(title, detail, 'success')} roverStatus={roverStatus} followRover={followRover} onFollowRover={setFollowRover} onStory={story} />}
    <ObjectiveChip objective={objective} onLook={look} onSkip={skip} />
    {/* Fixed action dock: every primary dialogue button (Tiếp tục, Xác nhận, Bắt đầu…) is portalled here. */}
    <div id="action-dock" className="action-dock" />
    <div ref={footer} className="bottom-hud">
      {current && tourMode === 'basic' && (current.id === 'go' && line === current.lines.length - 1
        ? <ReadyFrame text={current.lines[line]} onNext={advance} label="Start the mission" />
        : <Mascot text={current.lines[line]} mood={current.mood} onNext={touring ? skipTourCamera : advance} nextLabel={touring ? 'Skip' : 'Continue'} />)}
      {current && tourMode === 'advanced' && <Caption text={current.lines[line]} onNext={touring ? skipTourCamera : advance} />}
      {brief && game.mode === 'basic' && <Mascot text={BRIEFINGS[brief.id].lines[brief.line]} mood="happy" onNext={nextBriefLine} nextLabel={brief.line + 1 < BRIEFINGS[brief.id].lines.length ? 'Continue' : BRIEFINGS[brief.id].start} />}
      {brief && game.mode === 'advanced' && <Caption text={BRIEFINGS[brief.id].caption} onNext={startResearch} label={BRIEFINGS[brief.id].start} />}
      {!brief && !demoBusy && onb === 'done' && game.mode === 'basic' && game.phase === 'playing' && <Mascot compact={!mascotOpen || !!review} onToggle={() => setMascotOpen(!mascotOpen)} text={lunaHint(game)} mood={radiation || decision ? 'warning' : 'idle'} onNext={decision && !showDecision ? () => setHiddenDecision(null) : undefined} nextLabel="Open the decision" />}
      <div className="camera-status-stack">
        {followRover && <div className="follow-rover-bar glass"><CarFront size={17} /><div><strong>FOLLOWING MILO</strong><span>{roverStatus.site}</span></div><button aria-label="Stop following the rover" onClick={() => setFollowRover(false)}><X size={15} /></button></div>}
      </div>
    </div>
    <CameraToolbar mode={mode} handle={world.current} onHelp={() => setModal('help')} selected={selected} />
    <div className="toast-stack" aria-live="polite"><AnimatePresence>{notifications.map((item) => <Toast key={item.id} notification={item} onDismiss={dismiss} />)}</AnimatePresence></div>
    {radiation && <div className="radiation-vignette" aria-hidden="true" />}
    <AnimatePresence>
      {ready && onb === 'welcome' && <WelcomeScreen key="welcome" onNext={() => setOnb('mode')} />}
      {onb === 'mode' && <ModeSelect key="mode" advancedUnlocked={new URLSearchParams(location.search).has('debug')} onReady={(m) => { setTourMode(m); setOnb('cinematic') }} />}
      {onb === 'cinematic' && <IntroCinematic key="cinematic" onDone={() => { setOnb('tour'); setStep(0); setLine(0); fly('base') }} />}
      {reviewEntry && <ReviewPanel key={reviewEntry.id} entryId={reviewEntry.id} game={game} onContinue={ack} />}
      {showDecision && decision.key === 'C2' && <RouteCard key={decision.id} decision={decision} world={facts} game={game} onChoose={choose} />}
      {showDecision && decision.key !== 'C2' && <DecisionDialog key={decision.id} decision={decision} game={game} world={facts} onChoose={choose} onInspect={() => setHiddenDecision(decision.id)} />}
      {game.phase === 'returning' && <ReturnCinematic key="return" reason={endingAnalysis(game).reason} />}
      {game.phase === 'ended' && <EndingScreen key="ending" game={game} onRestart={restartGame} />}
      {modal === 'timeline' && <MissionLogDialog game={game} onClose={() => setModal(null)} />}
      {modal === 'restart' && <RestartDialog onConfirm={restartGame} onClose={() => setModal('settings')} />}
      {modal === 'submit' && <SubmitDialog foodDone={!!game.food.report} iceDone={!!game.ice.report} onConfirm={() => { setModal(null); dispatch({ type: 'mission/submit' }) }} onClose={() => setModal(null)} />}
    </AnimatePresence>
    <AnimatePresence>{modal === 'settings' && <SettingsDialog preferences={preferences} onChange={updatePreferences} onClose={() => setModal(null)} onRestart={() => setModal('restart')} />}{modal === 'crew' && <CrewDialog onClose={() => setModal(null)} onLocate={(name) => { setModal(null); setFollowRover(false); world.current?.focusCrew(name) }} />}{modal === 'help' && <HelpDialog onClose={() => setModal(null)} />}{modal === 'activity' && <ActivityDialog notifications={history} onClose={() => setModal(null)} onRadiation={() => { setModal(null); notify('Radiation only happens as part of the mission story.', 'Check the cause-and-effect log to see when.') }} />}</AnimatePresence>
    <span className="screen-reader-only">Story Mode, stage {game.stage}. Power, water, oxygen and food are assumed game numbers, not NASA data.</span>
  </main></MotionConfig>
}

