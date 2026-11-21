// Story Mode UI: opening, decisions, research cards, mission log, return and ending.
// Everything here reads the one GameState; actions go back through the reducer.
import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, BatteryCharging, BookOpen, ChevronRight, Wrench, Check, CircleAlert, Clock3, Eye, FlaskConical, Gauge, Lightbulb, Microscope, Rocket, Scale, ScrollText, Send, ShieldCheck, Sprout, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Modal } from './Common'
import { EventHeader, GamePanel, ResourceBar, ResultSection } from './GamePanel'
import { DialogueActionButton } from './Onboarding'
import { CAPACITY, CREW, DAY, FOOD, LIFE, MISSION_START, ROVER, b1Resolved, decisionCopy, missionTime, reviewFor, roverEnergyNeed, EVENT_TOPIC, endingAnalysis } from '../game'
import type { BranchResult, Chain, Decision, GameState, PlayMode, StepKind, WorldFacts } from '../game'

export type StoryAction = 'a2' | 'observe' | 'harvest' | 'report' | 'ice' | 'food' | 'repair' | 'submit' | 'follow'

const clock = (minute: number) => { const t = MISSION_START.minuteOfDay + Math.floor(minute); return `Day ${Math.floor(minute / DAY) + 1} · ${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }

// ── opening ─────────────────────────────────────────────────────────────────
export function OpeningCinematic({ onStart }: { onStart: (mode: PlayMode) => void }) {
  return <motion.div className="story-opening" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div className="story-opening-card glass" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6, duration: 0.8 }}>
      <span className="eyebrow">LUNARIS · STORY MODE</span>
      <h1>Welcome to Artemis Base</h1>
      <p>You will run a small base at the Moon’s South Pole with a crew of 6 astronauts. Keep power, water and oxygen topped up, look after the research garden, and help MILO the rover search for signs of ice.</p>
      <p className="story-muted">The terrain is real NASA LOLA data. The power, water, oxygen and food numbers are game assumptions.</p>
      <div className="story-modes">
        <button onClick={() => onStart('basic')}><Lightbulb size={20} /><strong>Basic</strong><span>Commander Luna guides you. Time pauses whenever a decision is needed.</span></button>
        <button onClick={() => onStart('advanced')}><Gauge size={20} /><strong>Advanced</strong><span>No guide. Time keeps running while you think.</span></button>
      </div>
    </motion.div>
  </motion.div>
}

// ── decisions ───────────────────────────────────────────────────────────────
export function DecisionDialog({ decision, game, world, onChoose, onInspect }: { decision: Decision; game: GameState; world: WorldFacts; onChoose: (choice: string) => void; onInspect: () => void }) {
  const copy = decisionCopy(decision, game, world)
  const [picked, setPicked] = useState<string | null>(null)
  const code = decision.key === 'C31' ? 'C3.1' : decision.key
  return <GamePanel label={copy.title} className="decision-panel story-decision" footer={<button className="gp-secondary" onClick={onInspect}><Eye size={14} /> View the base</button>}>
    <EventHeader code={code} topic={EVENT_TOPIC[decision.key]} time={clock(decision.atMinute).toUpperCase()} onClose={onInspect} />
    <h2 className="gp-title">{copy.title}</h2>
    {copy.intro && <p className="gp-intro">{copy.intro}</p>}
    {copy.question && <p className="gp-question">{copy.question}</p>}
    <div className="gp-options" role="radiogroup" aria-label="Choices">{copy.options.map((o) => <button key={o.id} role="radio" aria-checked={picked === o.id} className={`gp-option story-option ${picked === o.id ? 'selected' : ''}`} disabled={o.disabled} onClick={() => setPicked(o.id)}>
      <span className="gp-option-text"><strong>{o.label}</strong>
        {o.desc && <small>{o.desc}</small>}
        {!o.desc && o.gain && <small className="gain"><Check size={12} /> {o.gain}</small>}
        {!o.desc && o.risk && <small className="risk"><TriangleAlert size={12} /> {o.risk}</small>}
        {o.disabled && o.reason && <small className="blocked"><CircleAlert size={12} /> {o.reason}</small>}</span>
      {o.preview && <span className="gp-option-bars">{o.preview.map((p) => <ResourceBar key={p.key} k={p.key} before={p.before} after={p.after} emphasis={picked === o.id || picked === null} />)}</span>}
    </button>)}</div>
    {copy.note && <p className="gp-note"><FlaskConical size={12} /> {copy.note}</p>}
    {game.mode === 'advanced' && <p className="gp-note"><Clock3 size={12} /> Time is still running</p>}
    <DialogueActionButton label="Confirm" disabled={!picked} onClick={() => picked && onChoose(picked)} />
  </GamePanel>
}

export function PendingDecisionChip({ decision, game, world, onOpen }: { decision: Decision; game: GameState; world: WorldFacts; onOpen: () => void }) {
  return <button className="story-pending glass" onClick={onOpen}><TriangleAlert size={15} /><span><small>WAITING FOR YOUR DECISION</small>{decisionCopy(decision, game, world).title}</span><ArrowRight size={14} /></button>
}

// ── building cards (inside the base panel) ──────────────────────────────────
export function StoryCard({ building, game, onStory }: { building: string; game: GameState; onStory: (a: StoryAction) => void }) {
  const f = game.food, i = game.ice, free = game.stage === 'free', sheltered = game.radiation.active
  if (building === 'oxygen') return <div className="a1-card"><small>STAGE A2 · WATER + POWER → OXYGEN</small>{game.a2Enabled ? <p><Check size={13} /> The electrolyser is {game.power.electrolysisOn ? 'running' : 'waiting (oxygen is full, or power/water is short)'}. Each kg of oxygen needs {LIFE.waterLPerKgO2} litres of water.</p> : <><p>The electrolyser splits water into breathable oxygen and hydrogen.</p><button className="building-action" disabled={game.stage !== 'A2'} onClick={() => onStory('a2')}><Sprout size={15} /><span>{game.stage === 'A2' ? 'Turn on the electrolyser' : 'Unlocks at stage A2'}</span><ArrowRight size={15} /></button></>}</div>
  if (building === 'greenhouse') return <div className="a1-card"><small>FOOD RESEARCH · B1–B4</small>
    <p>Growth {Math.round(f.growth * 100)} % · watering: {f.irrigation === 'ok' ? 'normal' : f.irrigation === 'repairing' ? 'being fixed' : 'BROKEN'} · lights: {game.power.greenhouseOn ? 'on' : 'OFF'} · {f.observations.length} observations</p>
    {!f.started && <button className="building-action" disabled={!free} onClick={() => onStory('food')}><Sprout size={15} /><span>{free ? 'Start food research' : 'Unlocks after the tutorial'}</span><ArrowRight size={15} /></button>}
    {f.started && !game.history.some((h) => h.key === 'B1') && <p className="game-muted">Watching the plants. Let time run.</p>}
    {f.irrigation === 'fault' && f.repairStartsAt !== null && f.repairStartsAt > game.clock.elapsedMinutes && <><p className="game-warn"><TriangleAlert size={13} /> The watering system is broken. The repair is planned for {clock(f.repairStartsAt).split(' · ')[1]}.</p>
      <button className="building-action" disabled={sheltered} onClick={() => onStory('repair')}><Wrench size={15} /><span>{sheltered ? 'Sheltering from radiation, cannot go out to fix it' : 'Fix it right now'}</span><ArrowRight size={15} /></button>
      <p className="game-muted">One astronaut stops their work for about 2 hours. The hours the plants already went without water cannot be undone.</p></>}
    {f.irrigation === 'repairing' && <p className="game-muted"><Wrench size={12} /> Fixing the watering system.</p>}
    {f.stage === 'growing' && f.started && game.history.some((h) => h.key === 'B1') && <><button className="building-action" disabled={!free || sheltered} onClick={() => onStory('observe')}><Microscope size={15} /><span>{sheltered ? 'Sheltering from radiation' : 'Observe plants (sensors log it)'}</span><ArrowRight size={15} /></button>
      <button className="building-action" disabled={!free || f.growth < FOOD.readyIndex || sheltered} onClick={() => onStory('harvest')}><Scale size={15} /><span>{f.growth < FOOD.readyIndex ? `Harvest at ${Math.round(FOOD.readyIndex * 100)} % growth` : 'Harvest and weigh a sample'}</span><ArrowRight size={15} /></button></>}
    {f.stage === 'harvested' && <button className="building-action" onClick={() => onStory('report')}><ScrollText size={15} /><span>Write the food report</span><ArrowRight size={15} /></button>}
    {f.report && <p><Check size={13} /> Report done: {f.report.grams} g, {f.report.reliability} reliability.</p>}
    <p className="game-muted">Research plants, not the crew’s food supply.</p></div>
  if (building === 'rover') return <div className="a1-card"><small>ICE RESEARCH · C1–C4</small>
    <p>{iceText(game)}</p>
    <p className="game-muted"><BatteryCharging size={12} /> MILO battery {Math.round(i.roverBattery)}/{ROVER.batteryKwh} kWh{game.power.roverChargingOn ? ' · charging' : ''}</p>
    {i.stage === 'idle' && !i.report && (() => { const wait = game.mode === 'basic' && !b1Resolved(game); return <><button className="building-action" disabled={!free || game.supply.roverPhase !== 'none' || wait} onClick={() => onStory('ice')}><Rocket size={15} /><span>Start the ice search</span><ArrowRight size={15} /></button>{wait && free && <p className="game-muted">Unlocks after you deal with the first greenhouse problem (B1): we take the missions one at a time.</p>}</> })()}
    {['outbound', 'surveying', 'returning', 'recalled', 'anomaly'].includes(i.stage) && <button className="building-action" onClick={() => onStory('follow')}><Eye size={15} /><span>Follow MILO</span><ArrowRight size={15} /></button>}</div>
  if (building === 'command') return <div className="a1-card"><small>END THE MISSION</small><p>After the tutorial you can submit your reports and bring the crew home to Earth at any time.</p><button className="building-action" disabled={!free || game.phase !== 'playing'} onClick={() => onStory('submit')}><Send size={15} /><span>Submit reports and return</span><ArrowRight size={15} /></button></div>
  if (building === 'solar') { const stowed = game.power.stowedUntil !== null && game.clock.elapsedMinutes < game.power.stowedUntil; return <div className="a1-card"><small>SOLAR ARRAY</small>
    <p>Status: {stowed ? `folded away, reopens at ${clock(game.power.stowedUntil ?? 0).split(' · ')[1]}` : game.power.capacityFactor < 1 ? 'surface scratched, 90 % power left' : 'working normally'}.</p>
    <p>Producing {game.power.productionKw.toFixed(1)} kW{game.power.lightFactor < 1 ? ' · light is low' : ''}.</p>
    {game.power.capacityFactor < 1 && <p className="game-muted"><Wrench size={12} /> Cannot be repaired during this mission: scratched panels must be replaced with new ones from Earth. The consequence of your A3 choice stays.</p>}</div> }
  if (building === 'battery') return <div className="a1-card"><small>BASE POWER</small><p>Producing {game.power.productionKw.toFixed(1)} kW · using {game.power.loadKw.toFixed(1)} kW. Essential power is always protected; greenhouse lights and rover charging are optional loads.</p></div>
  if (building === 'shelter' && sheltered) return <div className="a1-card"><small>RADIATION</small><p><ShieldCheck size={13} /> The crew is sheltering until {clock(game.radiation.endsAt ?? 0)}.</p></div>
  return null
}

export function iceText(g: GameState) {
  const i = g.ice
  const km = (m: number) => (m / 1000).toFixed(1)
  switch (i.stage) {
    case 'locked': return 'Unlocks after the tutorial.'
    case 'idle': return i.report ? `Zone ${i.zone} surveyed.` : 'MILO is ready. Choose a research zone.'
    case 'site': case 'route': return 'Waiting for you to choose a zone and route.'
    case 'charging': return `Charging for the trip to Zone ${i.zone}.`
    case 'outbound': return `Driving to Zone ${i.zone}: ${km(i.distanceM)} / ${km((i.route?.lengthM ?? 0) + i.detourM)} km${i.slow ? ' (slow)' : ''}.`
    case 'anomaly': return 'Stopped at the rubble, waiting for a decision.'
    case 'surveying': return `Surveying Zone ${i.zone}: ${Math.floor(i.surveyMin / 60)}/${Math.ceil(i.surveyTargetMin / 60)} h · ${i.samples.filter((x) => x.valid).length} valid samples.`
    case 'returning': return `Driving back to base: ${km(i.distanceM)} km to go.`
    case 'recalled': return `Called back to carry cargo: ${km(i.distanceM)} km to go.`
    case 'cargo': return 'Working as a cargo rover for the resupply.'
    case 'done': return `Finished surveying Zone ${i.zone}.`
  }
}

// ── missions panel ──────────────────────────────────────────────────────────
type Step = { tag: string; label: string; state: 'done' | 'active' | 'todo' }
export function StoryMissions({ game, onStory, onFocus }: { game: GameState; onStory: (a: StoryAction) => void; onFocus: (id: 'greenhouse' | 'rover' | 'oxygen' | 'command' | 'solar') => void }) {
  const has = (tag: string) => game.log.some((e) => e.tag === tag)
  const decided = (key: string) => game.history.some((h) => h.key === key)
  const st = (done: boolean, active: boolean): Step['state'] => done ? 'done' : active ? 'active' : 'todo'
  const tutorial: Step[] = [
    { tag: 'A1', label: 'Extra power: recycle water or charge the battery', state: st(decided('A1'), game.stage === 'A1') },
    { tag: 'A2', label: 'Turn on the electrolyser to make oxygen', state: st(game.a2Enabled, game.stage === 'A2') },
    { tag: 'A3', label: 'Protect the solar array from tiny space rocks', state: st(game.stage === 'free', game.stage === 'A3') },
  ]
  const f = game.food, i = game.ice
  const food: Step[] = [
    { tag: 'B1', label: 'Watering fault', state: st(decided('B1'), has('B1')) },
    { tag: 'B2', label: 'Greenhouse lights follow the power supply', state: st(f.stage !== 'growing', game.stage === 'free') },
    { tag: 'B3', label: `Observe the plants (${f.observations.length} times, ${new Set(f.observations.map((o) => o.day)).size} day(s))`, state: st(new Set(f.observations.map((o) => o.day)).size >= FOOD.minObservationDays, game.stage === 'free') },
    { tag: 'B4', label: 'Harvest, weigh, report', state: st(!!f.report, f.stage === 'harvested' || f.growth >= FOOD.readyIndex) },
  ]
  const ice: Step[] = [
    { tag: 'C1', label: `Choose a research zone${i.zone ? `: ${i.zone}` : ''}`, state: st(!!i.zone, i.stage === 'site') },
    { tag: 'C2', label: 'Choose a feasible route', state: st(!!i.route, i.stage === 'route') },
    { tag: 'C3', label: 'Drive, handle surprises, survey', state: st(['returning', 'done'].includes(i.stage) || !!i.report, ['charging', 'outbound', 'anomaly', 'surveying'].includes(i.stage)) },
    { tag: 'C4', label: 'Return safely, ice report', state: st(!!i.report, i.stage === 'returning') },
  ]
  const events: Step[] = [
    { tag: 'D1', label: 'Low light', state: st(game.fired.includes('D1-end'), game.power.lightFactor < 1) },
    { tag: 'D2', label: 'Resupply', state: st(game.supply.stage === 'delivered', ['announced', 'waiting', 'pickup'].includes(game.supply.stage)) },
    { tag: 'D3', label: 'Solar radiation', state: st(game.fired.includes('D3') && !game.radiation.active, game.radiation.active) },
  ]
  const daysLeft = Math.max(0, (game.resources.food - LIFE.foodReserveCrewDays) / CREW)
  const list = (title: string, steps: Step[], action?: { label: string; onClick: () => void; disabled?: boolean }) => <section className="story-steps"><h4>{title}</h4><ul>{steps.map((s) => <li key={s.tag} className={s.state}><span>{s.state === 'done' ? <Check size={11} /> : s.tag}</span>{s.label}</li>)}</ul>{action && <button className="secondary-action" disabled={action.disabled} onClick={action.onClick}>{action.label}<ArrowRight size={13} /></button>}</section>
  return <>
    <div className="panel-title"><div><h2>Artemis Mission</h2><p>{game.mode === 'basic' ? 'Basic mode' : game.mode === 'advanced' ? 'Advanced mode' : ''} · {missionTime(game).label} · day {missionTime(game).day}</p></div></div>
    <div className="story-food-days" style={{ '--days': `${Math.min(100, daysLeft / 8 * 100)}%` } as CSSProperties}><span>Packaged food left for</span><strong>{daysLeft.toFixed(1)} days</strong><small>before the minimum reserve · this sets the mission length</small></div>
    {list('Tutorial', tutorial, game.stage === 'A2' ? { label: 'Go to life support', onClick: () => onFocus('oxygen') } : undefined)}
    {list('Food research', food, !f.started ? { label: 'Start research', onClick: () => onStory('food'), disabled: game.stage !== 'free' } : { label: 'Go to the greenhouse', onClick: () => onFocus('greenhouse') })}
    {list('Ice research', ice, i.stage === 'idle' && !i.report ? { label: 'Start exploring', onClick: () => onStory('ice'), disabled: game.stage !== 'free' } : { label: 'Go to the rover station', onClick: () => onFocus('rover') })}
    {list('Base events', events)}
    <button className="primary-button story-submit" disabled={game.stage !== 'free' || game.phase !== 'playing'} onClick={() => onStory('submit')}><Send size={15} /> Submit reports and return to Earth</button>
  </>
}

// ── result review (reference 7; no timeout: waits for "Tiếp tục") ──────────
export function ReviewPanel({ entryId, game, onContinue }: { entryId: string; game: GameState; onContinue: () => void }) {
  const entry = game.log.find((e) => e.id === entryId)
  if (!entry) return null
  const r = reviewFor(entry, game)
  const kind = entry.kind === 'decision' ? 'RESULT' : entry.kind === 'event' ? 'EVENT' : entry.kind === 'consequence' ? 'CONSEQUENCE' : entry.kind === 'research' ? 'RESEARCH' : 'MISSION'
  const accent = entry.kind === 'decision' ? '#59c9ff' : entry.kind === 'event' ? '#ffb45a' : entry.kind === 'consequence' ? '#b8a0ff' : '#5edc88'
  const happened = r.happened.filter(Boolean)
  return <GamePanel label={r.title} className={`result-panel tone-${r.tone}`}>
    <EventHeader code={kind} topic={entry.tag && entry.tag !== 'FREE' ? entry.tag : undefined} time={clock(entry.atMinute).toUpperCase()} accent={accent} />
    <h2 className="gp-title">{r.title}</h2>
    {r.chose && <ResultSection label="YOU CHOSE"><strong>{r.chose}</strong></ResultSection>}
    {(happened.length > 0 || r.bars?.length) && <ResultSection label="WHAT HAPPENED">{happened.map((x) => <p key={x}>{x}</p>)}{r.bars?.map((b) => <ResourceBar key={b.key} k={b.key} before={b.before} after={b.after} delta={b.delta} emphasis />)}</ResultSection>}
    {r.why.length > 0 && <ResultSection label="WHY">{r.why.map((x) => <p key={x}>{x}</p>)}</ResultSection>}
    {r.future && <ResultSection label="LATER ON"><p>{r.future}</p></ResultSection>}
    {r.lesson && <ResultSection label="LESSON"><p className="gp-lesson">{r.lesson}</p></ResultSection>}
    <DialogueActionButton label={game.mode === 'basic' ? 'Continue' : 'Got it'} onClick={onContinue} />
  </GamePanel>
}

// ── mission journal (decisions, results, causes, lessons) ───────────────────
export function MissionLogDialog({ game, onClose }: { game: GameState; onClose: () => void }) {
  const shown = game.log.filter((e) => e.kind !== 'system')
  return <Modal title="Mission log" eyebrow="DECISIONS · RESULTS · LESSONS" onClose={onClose} className="game-modal timeline-modal">
    <ol className="story-log">{[...shown].reverse().map((e) => { const r = reviewFor(e, game); return <li key={e.id} className={`kind-${e.kind}`}>
      <small>{clock(e.atMinute)}{e.tag && e.tag !== 'FREE' ? ` · ${e.tag}` : ''}</small><strong>{r.chose ? `You chose: ${r.chose}` : e.title}</strong>
      {r.happened.filter(Boolean).map((x) => <p key={x}>{x}</p>)}
      {r.why.length > 0 && <p className="story-cause"><b>Why:</b> {r.why.join(' ')}</p>}
      {r.future && <p className="story-cause"><b>Later effect:</b> {r.future}</p>}
      {r.lesson && <p className="story-lesson"><BookOpen size={12} /> {r.lesson}</p>}
    </li> })}</ol>
    <button className="primary-button" onClick={onClose}>Close<ArrowRight size={14} /></button>
  </Modal>
}

// ── return + ending ─────────────────────────────────────────────────────────
export function ReturnCinematic({ reason }: { reason: string }) {
  return <motion.div className="story-return" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}><Rocket size={34} /><h2>The crew is heading back to Earth</h2><p>{reason}</p></motion.div>
  </motion.div>
}

const STEP_LABEL: Record<StepKind, string> = { choice: 'You chose', change: 'Change', later: 'Then', result: 'Result', avoided: 'Avoided', unknown: 'Unknown' }
function ChainView({ chain }: { chain: Chain }) {
  return <article className={`chain target-${chain.target}`}>
    <h4>{chain.title}<span>{chain.target === 'food' ? 'affects Food research' : chain.target === 'ice' ? 'affects Ice research' : 'affects the base'}</span></h4>
    <ol>{chain.steps.map((st, i) => <li key={i} className={`step step-${st.kind}`}>
      <small>{STEP_LABEL[st.kind]}</small><strong>{st.title}</strong>{st.detail && <p>{st.detail}</p>}
      {i < chain.steps.length - 1 && <ChevronRight className="chain-arrow" size={18} aria-hidden="true" />}
    </li>)}</ol>
  </article>
}

/** Ending: results, the cause → effect chains of this playthrough, and a plain explanation. All from the game's own records. */
export function EndingScreen({ game, onRestart }: { game: GameState; onRestart: () => void }) {
  const a = endingAnalysis(game)
  const main = a.chains.slice(0, 5), more = a.chains.slice(5)
  const branch = (title: string, icon: ReactNode, b: BranchResult) => <section className={`story-branch ${b.done ? 'done' : 'todo'}`}>
    <header>{icon}<h3>{title}</h3><span>{b.status}</span></header>
    <ul>{b.result.map((r) => <li key={r}>{r}</li>)}</ul>
  </section>
  const why = (title: string, lines: string[]) => <section className="why-block"><h4>{title}</h4>{lines.length ? <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p className="story-muted">There is not enough measured data yet to explain this result.</p>}</section>
  return <motion.div className="story-ending" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
    <div className="story-ending-card glass ending-wide">
      <span className="eyebrow">MISSION RESULTS · {clock(game.ending?.atMinute ?? game.clock.elapsedMinutes)}</span>
      <h1>Welcome home!</h1><p>{a.reason}</p>
      {a.early.map((e) => <p key={e} className="ending-early"><Clock3 size={13} /> {e}</p>)}
      <h2 className="ending-part">1 · Mission results</h2>
      <div className="story-branches">{branch('Food research', <Sprout size={18} />, a.food)}{branch('Ice research', <Microscope size={18} />, a.ice)}</div>
      <h2 className="ending-part">2 · The decisions that changed your mission</h2>
      {main.length ? main.map((c) => <ChainView key={c.id} chain={c} />) : <p className="story-muted">You have not made enough decisions yet to form a chain of cause and effect.</p>}
      {more.length > 0 && <details className="chain-more"><summary>Show {more.length} more chain(s)</summary>{more.map((c) => <ChainView key={c.id} chain={c} />)}</details>}
      <h2 className="ending-part">3 · Why did this happen?</h2>
      <div className="why-grid">{why('Food research', a.why.food)}{why('Ice research', a.why.ice)}</div>
      <p className="story-muted">The terrain, permanently shadowed regions and rover routes use NASA data. Power, water, oxygen, food, events and MILO’s measurements are simulated by the game. Ice has not been confirmed in any zone.</p>
      <button className="primary-button" onClick={onRestart}>Play again<ArrowRight size={14} /></button>
    </div>
  </motion.div>
}

/** Commander Luna (Basic mode only): one hint about what to do next, from the state. */
export function lunaHint(g: GameState): string {
  if (g.inbox.length) return 'Read the result next to me, then press “Continue”. Time is paused for you.'
  if (g.decisions[0]?.key === 'C2') return 'This is the route MILO plans to take to the research zone. Hover over the route to see details before you decide.'
  if (g.decisions.length) return 'A decision is waiting for you. Read carefully what you gain and what you lose!'
  if (g.stage === 'A2') return 'The electrolyser turns water into oxygen. Tap the life support station and switch it on!'
  if (g.stage === 'A3') return 'Everything is running on its own. Let time run (▶) and keep an eye on power, water and oxygen.'
  if (g.radiation.active) return 'Radiation storm! The crew stays safe in the shelter. The rover does not need to hide.'
  if (g.food.irrigation === 'fault' && g.food.repairStartsAt !== null && g.food.repairStartsAt > g.clock.elapsedMinutes) return 'Commander, the watering system is still broken. Tap the greenhouse to check on it!'
  if (g.food.irrigation !== 'ok') return 'The plants are thirsty. The longer they go without water, the weaker they get.'
  if (g.stage === 'free' && !g.food.started && g.ice.stage === 'idle' && !g.ice.report) return 'Pick a research project to start: the greenhouse (food) or MILO the rover (water ice).'
  if (g.food.started && !g.history.some((h) => h.key === 'B1')) return 'The plants are being watched. Let time run (▶) and see what happens in the greenhouse.'
  if (g.supply.stage === 'pickup') return g.supply.method === 'crew' ? 'Two astronauts are pushing a cart out to the landing pad for the cargo.' : 'MILO is carrying the supplies. They only count once they reach the base.'
  if (g.food.stage === 'growing' && g.food.started && !g.food.observations.some((o) => o.day === Math.floor(g.clock.elapsedMinutes / DAY) + 1)) return 'Nobody has observed the plants today. Go to the greenhouse and press “Observe plants”.'
  if (g.food.stage === 'harvested') return 'Harvested! Write the food report at the greenhouse.'
  if (g.ice.stage === 'idle' && !g.ice.report) return 'MILO is waiting. Go to the rover station and press “Start the ice search”.'
  if (!g.food.started) return 'The greenhouse is still waiting: tap it to start food research.'
  if (g.food.report && g.ice.report) return 'Both research projects are done! You can submit your reports at the command center.'
  return `There is food for about ${Math.max(0, (g.resources.food - LIFE.foodReserveCrewDays) / CREW).toFixed(1)} more days. Finish your research before you have to go home.`
}
export const resourcePercent = (g: GameState) => ({
  battery: Math.round(g.resources.battery / CAPACITY.battery * 100),
  water: Math.round(g.resources.water / CAPACITY.water * 100),
  oxygen: Math.round(g.resources.oxygen / CAPACITY.oxygen * 100),
  foodDays: Math.max(0, g.resources.food / CREW),
})

// ── C2 on the map: the real A* route is drawn in 3D; this panel separates measured data from estimates ──
export function RouteCard({ decision, world, onChoose }: { decision: Decision; world: WorldFacts; game: GameState; onChoose: (choice: string) => void }) {
  const zone = world.zones.find((z) => z.zone === decision.context.zone), r = zone?.route
  const need = r ? roverEnergyNeed(r.lengthM) : 0, tooMuch = need > ROVER.batteryKwh
  return <GamePanel label={`Route to Zone ${decision.context.zone}`} className="route-card" footer={<button className="gp-secondary" onClick={() => onChoose('back')}>Choose another zone</button>}>
    <EventHeader code="C2" topic={EVENT_TOPIC.C2} time={clock(decision.atMinute).toUpperCase()} />
    <h2 className="gp-title">Route to Zone {decision.context.zone}{zone ? ` · ${zone.name}` : ''}</h2>
    {r ? <>
      <p className="gp-question">The yellow line on the map is the real A* route. Hover over it to inspect each section.</p>
      <ResultSection label="MEASURED BY NASA"><p>{(r.lengthM / 1000).toFixed(1)} km one way · steepest nominal slope {r.maxSlopeDeg.toFixed(1)}°, mean {r.meanSlopeDeg.toFixed(1)}° (limit 15°)</p><p>Including measurement error: about {r.uncertainPercent.toFixed(0)} % of the way could exceed 15° · destination {r.inPsr ? 'inside' : 'outside'} a permanently shadowed region</p></ResultSection>
      <ResultSection label="ESTIMATE"><p>About {Math.round(need)} of {ROVER.batteryKwh} kWh rover battery · {Math.round(r.lengthM / 1000 / ROVER.speedKmh * 2)} hours of driving there and back (game model)</p></ResultSection>
      <ResultSection label="NOT CHECKED"><p>Lighting, temperature, communications, rocks smaller than a 5 m cell. This route is feasible by slope; it is not guaranteed safe. Only one route to this zone was found.</p></ResultSection>
      {tooMuch && <p className="game-warn">The rover battery is not enough for the round trip.</p>}
    </> : <p>There is no feasible route to this zone.</p>}
    {r && <DialogueActionButton label="Confirm route" disabled={tooMuch} onClick={() => onChoose('go')} />}
  </GamePanel>
}
