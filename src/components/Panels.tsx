import { useState } from 'react'
import type { CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowDownRight, ArrowRight, Bookmark, Check, ChevronDown, ChevronRight, Clock3, FlaskConical, Focus, Lightbulb, Moon, Orbit, PanelRightClose, PanelRightOpen, Radio, ShieldCheck, Sparkles, Sun, TriangleAlert } from 'lucide-react'
import { BUILDING_BY_ID, FORECASTS, JOURNAL } from '../data'
import type { BuildingId, DemoAction, DemoKind, RoverStatus, Section } from '../types'
import type { GameState } from '../game/types'
import { CAPACITY } from '../game/scenario'
import { StoryCard, StoryMissions } from './Story'
import type { StoryAction } from './Story'
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
  game: GameState
  onStory: (action: StoryAction) => void
}

// Buildings whose metric is a real GameState resource (SCENARIO units, shown as % of capacity).
const GAME_METRIC: Partial<Record<BuildingId, 'battery' | 'water' | 'oxygen'>> = { water: 'water', battery: 'battery', oxygen: 'oxygen' }

export function ContextPanel(props: PanelProps) {
  if (!props.open) return <button className="open-panel glass" aria-label="Open the info panel" onClick={() => props.onOpen(true)}><PanelRightOpen size={19} /><span>Info</span></button>
  const title = { base: 'YOUR BASE', missions: 'AN ADVENTURE', forecast: 'A LOOK AHEAD', journal: 'WHAT WE DISCOVERED' }[props.section]
  return <aside className={`context-panel glass context-${props.section}`} aria-label={title}>
    <header className="context-eyebrow"><span><SectionIcon id={props.section} size={13} />{title}</span><IconButton label="Collapse the info panel" onClick={() => props.onOpen(false)}><PanelRightClose size={16} /></IconButton></header>
    <AnimatePresence mode="wait" initial={false}><motion.div key={props.section} className="context-body" initial={{ opacity: 0, x: 9 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -7 }} transition={{ duration: 0.18 }}>
      {props.section === 'base' && <BasePanel {...props} />}
      {props.section === 'forecast' && <ForecastPanel {...props} />}
      {props.section === 'missions' && <StoryMissions game={props.game} onStory={props.onStory} onFocus={props.onFocus} />}
      {props.section === 'journal' && <JournalPanel onNotify={props.onNotify} />}
    </motion.div></AnimatePresence>
    <footer className="panel-footer"><FlaskConical size={11} />{props.section === 'forecast' ? 'Illustrative forecast, not real data' : 'EXPLORE · LEARN · TOGETHER'}<span>DEMO</span></footer>
  </aside>
}

function BasePanel({ selected, onSelect, onFocus, demo, completed, roverStatus, followRover, onFollowRover, game, onStory }: PanelProps) {
  const [fact, setFact] = useState(false)
  const building = BUILDING_BY_ID[selected ?? 'command']
  const busy = demo && demo.phase !== 'complete'
  const operating = busy && (demo.kind === building.id || (building.id === 'shelter' && demo.kind === 'radiation'))
  const kind = building.id === 'shelter' ? 'radiation' : building.id
  const metricKey = GAME_METRIC[building.id]
  const value = metricKey ? Math.round(game.resources[metricKey] / CAPACITY[metricKey] * 100) : operating && demo.phase === 'working' ? Math.min(100, building.value + 16) : completed.has(kind) ? Math.min(100, building.value + 16) : building.value
  return <>
    <div className="base-title"><div><h2>Artemis <span>01</span></h2><p>A little home on the Moon</p></div><span className="nominal-badge"><StatusDot /> Stable</span></div>
    <MiniMap selected={building.id} onSelect={onSelect} />
    <div className="colony-stats"><div><strong>08</strong><span>Buildings</span></div><div><strong>04</strong><span>Astronauts</span></div><div><ShieldCheck size={19} /><span>Safe</span></div></div>
    <div className="panel-divider" />
    <AnimatePresence mode="wait" initial={false}><motion.section className="building-detail" key={building.id} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.16 }} style={{ '--building-accent': building.accent } as CSSProperties}>
      <div className="building-category"><span>{building.category}</span><small>{building.code}</small></div>
      <div className="building-title"><span className="building-icon"><BuildingIcon id={building.id} size={25} /></span><div><h3>{building.name}</h3><p><StatusDot color={operating ? building.accent : undefined} pulse={!!operating} />{operating ? 'Working' : 'Ready to explore'}</p></div></div>
      <p className="building-description">{building.description}</p>
      {building.id === 'rover' && <div className="rover-status-detail"><strong>MILO · AUTONOMOUS EXPLORER</strong><span>{roverStatus.phase === 'scanning' ? 'Scanning the terrain' : roverStatus.phase === 'returning' ? 'Returning to base' : roverStatus.phase === 'docked' ? 'Checks & rest at base' : 'Exploring'}</span><p>{roverStatus.site}</p><small>Real survey points A–D · A* route on the 5 m slope map · {Math.round(roverStatus.distance)} m from base · {roverStatus.speed.toFixed(1)} m/s (assumed speed)</small>{roverStatus.note && <small className="rover-route-note">{roverStatus.note}</small>}</div>}
      <div className="building-metric"><span>{building.metric}</span><strong>{value}<small>{metricKey ? '%' : building.unit}</small></strong></div><Meter value={value} color={building.accent} label={building.metric} />
      <div className="system-status"><Radio size={12} /><span>{building.id === 'command' ? 'Strong signal' : building.id === 'solar' ? '6 panels · catching sunlight' : building.id === 'water' ? 'Filter system ready' : building.id === 'shelter' ? 'Room for the whole crew' : building.id === 'rover' ? 'Route: only cells with slope ≤ 15°' : 'All equipment stable'}</span><Check size={13} /></div>
      {building.id === 'water' && <p className="game-muted water-tank-note">Used water waiting to be recycled: {Math.round(game.resources.wastewater)} L · clean water {Math.round(game.resources.water)} L</p>}
      <StoryCard building={building.id} game={game} onStory={onStory} />
      <div className="building-secondary"><button onClick={() => onFocus(building.id)}><Focus size={13} /> Locate</button><button className={fact ? 'active' : ''} onClick={() => setFact(!fact)}><Lightbulb size={13} /> Did you know?<ChevronDown size={11} className={fact ? 'rotate' : ''} /></button></div>
      {building.id === 'rover' && <button className="rover-follow-button" onClick={() => onFollowRover(!followRover)}><BuildingIcon id="rover" size={15} />{followRover ? 'Stop following MILO' : 'Follow MILO'}<ArrowRight size={13} /></button>}
      <AnimatePresence>{fact && <motion.div className="science-note" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}><p><Sparkles size={13} />{building.fact}</p></motion.div>}</AnimatePresence>
    </motion.section></AnimatePresence>
  </>
}

function ForecastPanel({ hour, onHour, onAction, onFocus, demo }: PanelProps) {
  const forecast = [...FORECASTS].reverse().find((f) => hour >= f.hour)!
  const time = `${String(8 + hour).padStart(2, '0')}:24`
  return <>
    <div className="panel-title"><div><h2>Moon forecast</h2><p>Get ready for a new day.</p></div><span className="small-round-icon"><Sun size={19} /></span></div>
    <MiniMap variant="forecast" hour={hour} />
    <div className="forecast-time"><span><Clock3 size={12} />08:24 <small>NOW</small></span><ArrowRight size={14} /><strong>{time}<small>+{hour}H</small></strong></div>
    <div className="forecast-slider"><label htmlFor="forecast-range">Drag to look into the future<span>{hour === 0 ? 'Now' : `In ${hour} h`}</span></label><input id="forecast-range" aria-label="Forecast time" type="range" min="0" max="8" step="1" value={hour} onChange={(event) => onHour(Number(event.target.value))} style={{ '--slider-progress': `${hour / 8 * 100}%` } as CSSProperties} /><div className="timeline-ticks">{[0, 2, 4, 8].map((h) => <button key={h} onClick={() => onHour(h)} className={h === hour ? 'active' : ''}>{h === 0 ? 'Now' : `+${h}h`}</button>)}</div></div>
    <div className="forecast-now" style={{ '--forecast-color': forecast.color } as CSSProperties}><span className="forecast-weather">{hour < 4 ? <Sun size={23} /> : hour < 8 ? <Orbit size={23} /> : <Moon size={23} />}</span><div><h3>{forecast.title}</h3><p>{forecast.description}</p></div></div>
    <div className="building-metric"><span>Light on the panels</span><strong>{forecast.power}<small>%</small></strong></div><Meter value={forecast.power} color={forecast.color} label="Illustrative light" />
    <div className="forecast-events">{FORECASTS.slice(1).map((f, i) => <button key={f.hour} className={hour >= f.hour ? 'reached' : ''} onClick={() => onHour(f.hour)}><span className="event-hour">+{f.hour}h</span><span className="event-node">{i === 0 ? <Sun size={12} /> : i === 1 ? <ArrowDownRight size={12} /> : <Moon size={12} />}</span><span>{i === 0 ? 'A mountain shadow nears the solar station' : i === 1 ? 'Sunlight starts to fade' : 'The base enters darkness'}</span><ChevronRight size={12} /></button>)}</div>
    <button className="secondary-action" onClick={() => { onHour(4); onFocus('solar') }}><Sun size={15} />See the shadow on the solar station<ArrowRight size={14} /></button>
    <button className="radiation-demo" disabled={!!demo && demo.phase !== 'complete'} onClick={() => onAction('radiation')}><TriangleAlert size={14} />Try a radiation alert<span>DEMO</span></button>
  </>
}

function JournalPanel({ onNotify }: { onNotify: PanelProps['onNotify'] }) {
  const [active, setActive] = useState('moon')
  const [bookmarked, setBookmarked] = useState(new Set<string>())
  const entry = JOURNAL.find((item) => item.id === active)!
  return <>
    <div className="panel-title"><div><h2>Science notebook</h2><p>A little curiosity, a lot of understanding.</p></div><span className="journal-count">03</span></div>
    <div className={`journal-art journal-art-${active}`}><div className="journal-planet" /><div className="journal-orbit" /><span className="journal-art-star s1" /><span className="journal-art-star s2" /><span className="journal-art-star s3" /><span className="journal-art-tag"><Sparkles size={11} />SOMETHING NEW TODAY</span></div>
    <div className="journal-topics">{JOURNAL.map((item) => <button key={item.id} className={item.id === active ? 'active' : ''} style={{ '--topic-color': item.color } as CSSProperties} onClick={() => setActive(item.id)}>{item.id === 'moon' ? <Moon size={13} /> : item.id === 'water' ? <FlaskConical size={13} /> : <Orbit size={13} />}{item.id === 'moon' ? 'The Moon' : item.id === 'water' ? 'Life' : 'Earth'}</button>)}</div>
    <AnimatePresence mode="wait"><motion.article key={active} className="journal-entry" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: 0.15 }}><span className="journal-entry-tag" style={{ color: entry.color }}>{entry.tag}</span><h3>{entry.title}</h3><p>{entry.text}</p><div className="journal-did-you-know"><Lightbulb size={17} /><p>{entry.extra}</p></div></motion.article></AnimatePresence>
    <button className={`bookmark-button ${bookmarked.has(active) ? 'bookmarked' : ''}`} onClick={() => { const next = new Set(bookmarked); if (next.has(active)) next.delete(active); else next.add(active); setBookmarked(next); onNotify(next.has(active) ? 'Discovery bookmarked!' : 'Bookmark removed', 'Illustrative notebook, saved only for this visit.') }}><Bookmark size={15} fill={bookmarked.has(active) ? 'currentColor' : 'none'} />{bookmarked.has(active) ? 'Bookmarked in your notebook' : 'Bookmark this discovery'}{bookmarked.has(active) && <Check size={14} />}</button>
    <div className="journal-source"><Orbit size={12} /><span>STEM knowledge · just for you</span></div>
  </>
}
