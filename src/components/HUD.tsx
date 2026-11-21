import type { CSSProperties } from 'react'
import { Package, BatteryCharging, ChevronRight, Clock3, Droplets, Expand, Focus, History, Minus, Mouse, Play, Plus, Radio, RotateCcw, Settings2, Sparkles, UsersRound, Volume2, VolumeX, Wind, Pause } from 'lucide-react'
import type { GameState } from '../game/types'
import { CAMERA_MODES, NAVIGATION } from '../data'
import type { BuildingId, CameraMode, DemoAction, Section, WorldHandle } from '../types'
import { CameraIcon, HelpIcon, MoonMark, SectionIcon } from './Icons'
import { IconButton, Meter, StatusDot } from './Common'
import { portraitUrl } from '../world/textures'

export function TopHUD({ resources, paused, onPause, speed, onSpeed, onSettings, onCrew, onActivity, onTimeline, sound, onSound, onFullscreen, time, sol }: { resources: { battery: number; water: number; oxygen: number; foodDays: number }; paused: boolean; onPause: () => void; speed: number; onSpeed: () => void; onSettings: () => void; onCrew: () => void; onActivity: () => void; onTimeline: () => void; sound: boolean; onSound: () => void; onFullscreen: () => void; time: string; sol: number }) {
  const readings = [
    { label: 'Power', value: resources.battery, unit: '%', meter: resources.battery, color: '#ffd75e', icon: BatteryCharging },
    { label: 'Water', value: resources.water, unit: '%', meter: resources.water, color: '#59c9ff', icon: Droplets },
    { label: 'Oxygen', value: resources.oxygen, unit: '%', meter: resources.oxygen, color: '#5edc88', icon: Wind },
    { label: 'Food', value: +resources.foodDays.toFixed(1), unit: ' days', meter: Math.min(100, resources.foodDays / 15 * 100), color: '#ff9d6e', icon: Package },
  ]
  return <header className="top-hud">
    <div className="brand"><MoonMark className="brand-mark" /><div><span className="wordmark">LUNARIS</span><span className="brand-tagline">LITTLE STEPS. BIG DISCOVERIES.</span></div></div>
    <div className="status-hud glass" aria-label="Base levels (assumed game balance numbers)">
      <div className="resource-cluster">{readings.map(({ label, value, unit, meter, color, icon: Icon }) => <div className="resource" key={label} style={{ '--resource-color': color } as CSSProperties}>
        <span className="resource-icon"><Icon size={21} strokeWidth={1.8} /></span><div className="resource-reading"><span className="resource-label">{label}</span><span className="resource-value">{value}<small>{unit}</small></span><Meter value={meter} color={color} label={`${label} reserve`} /></div>
      </div>)}</div>
      <div className="time-controls"><div className="time-reading"><span><StatusDot pulse={!paused} /> SOL {String(sol).padStart(3, '0')}</span><strong><Clock3 size={13} />{time}</strong></div><IconButton label={paused ? 'Resume' : 'Pause'} className={paused ? 'play-toggle paused' : 'play-toggle'} onClick={onPause}>{paused ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}</IconButton><button className="speed-button" aria-label={`Speed ${speed}×. Change speed`} onClick={onSpeed}>{speed}<span>×</span></button></div>
    </div>
    <div className="header-actions"><div className="header-status-row"><span className="challenge-tag"><span className="tiny-orbit" /> SPACE APPS <b>2026</b></span><button className="activity-button glass" onClick={onActivity} aria-label="Signals and notifications" data-tooltip="ARTEMIS ONLINE · Base signals"><Radio size={14} /><span className="activity-label">ARTEMIS ONLINE</span><span className="activity-dot" /><ChevronRight size={12} /></button></div><div className="header-icon-cluster glass"><IconButton label="Mission timeline" onClick={onTimeline}><History size={18} /></IconButton><IconButton label="Astronaut crew" onClick={onCrew}><UsersRound size={18} /><span className="crew-number">6</span></IconButton><IconButton label={sound ? 'Mute sound' : 'Turn sound on'} onClick={onSound}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</IconButton><IconButton label="Full screen" className="fullscreen-button" onClick={onFullscreen}><Expand size={17} /></IconButton><IconButton label="Settings" onClick={onSettings}><Settings2 size={18} /></IconButton></div></div>
  </header>
}

export function Sidebar({ section, onSection, onSettings, onHelp }: { section: Section; onSection: (section: Section) => void; onSettings: () => void; onHelp: () => void }) {
  return <aside className="sidebar"><nav className="nav-rail glass" aria-label="Base navigation">{NAVIGATION.map(({ id, label, tooltip, key }) => <button key={id} className={`nav-button ${section === id ? 'active' : ''}`} aria-current={section === id ? 'page' : undefined} aria-label={tooltip} data-tooltip={`${tooltip} · ${key}`} onClick={() => onSection(id)}><SectionIcon id={id} size={23} /><span>{label}</span>{id === 'missions' && <i className="nav-notification" />}</button>)}<div className="nav-divider" /><button className="nav-button nav-settings" aria-label="Open settings" data-tooltip="Settings" onClick={onSettings}><Settings2 size={21} /></button></nav><IconButton label="How to explore" className="help-button glass" onClick={onHelp}><HelpIcon size={20} /></IconButton></aside>
}

export function WorldHeading({ mode, onMode, onMissions, completed }: { mode: CameraMode; onMode: (mode: CameraMode) => void; onMissions: () => void; completed: boolean }) {
  return <section className="world-heading">
    <div className="breadcrumbs"><button onClick={() => onMode('orbit')}><span className="breadcrumb-moon" /> Moon</button><ChevronRight size={11} /><button onClick={() => onMode('region')}>South Pole</button>{mode === 'base' && <><ChevronRight size={11} /><span>Artemis</span></>}</div>
    <button className="chapter-heading" onClick={onMissions}><span className="chapter-number">01</span><span><small>THE FIRST ADVENTURE</small><h1>{mode === 'orbit' ? 'Hello, Moon.' : mode === 'region' ? 'A place to begin.' : 'A home on the Moon.'}</h1></span><span className="chapter-progress">{completed ? '4' : '3'}<small>/4</small><Sparkles size={12} /></span></button>
    <span className="region-tag"><StatusDot />{mode === 'orbit' ? 'ARTEMIS LINK' : 'ARTEMIS OUTPOST · 89.9°S'}</span>
  </section>
}

export function CameraNavigation({ mode, onMode }: { mode: CameraMode; onMode: (mode: CameraMode) => void }) {
  return <div className="camera-toolbar glass" role="group" aria-label="Camera view">{CAMERA_MODES.map((camera) => <button key={camera.id} className={mode === camera.id ? 'active' : ''} aria-pressed={mode === camera.id} aria-label={`${camera.label} view`} onClick={() => onMode(camera.id)}><CameraIcon id={camera.id} size={17} /><span>{camera.label}</span><kbd>{camera.key}</kbd></button>)}</div>
}

export function CameraToolbar({ mode, handle, onHelp, selected }: { mode: CameraMode; handle: WorldHandle | null; onHelp: () => void; selected: BuildingId | null }) {
  return <>
    <div className="world-tools"><div className="zoom-controls glass"><IconButton label="Zoom in" onClick={() => handle?.zoom('in')}><Plus size={19} /></IconButton><span /><IconButton label="Zoom out" onClick={() => handle?.zoom('out')}><Minus size={19} /></IconButton></div><IconButton label="Reset the view" className="glass reset-camera" onClick={() => handle?.reset()}><RotateCcw size={17} /></IconButton>{selected && mode === 'base' && <IconButton label="Go to the selected building" className="glass focus-camera" onClick={() => handle?.focus(selected)}><Focus size={18} /></IconButton>}</div>
    <button className="camera-hint" onClick={onHelp}><Mouse size={14} /><span>Drag to rotate <i /> Scroll to zoom</span><kbd>?</kbd></button>
    <div className="bottom-status"><span className="scale-indicator"><i /><i /><i /></span><span>{mode === 'orbit' ? '1,737 km' : mode === 'region' ? '500 m' : '50 m'}</span><b data-tooltip="Terrain: NASA LOLA 5 m · rocks and small details: illustrative reconstruction">NASA LOLA 5 m TERRAIN</b><StatusDot /></div>
  </>
}

export function Commander({ collapsed, onCollapse, game, demo, mode, onMode, hint, onTimeline }: { collapsed: boolean; onCollapse: (collapsed: boolean) => void; game: GameState; demo: DemoAction | null; mode: CameraMode; onMode: (mode: CameraMode) => void; hint: string; onTimeline: () => void }) {
  const busy = demo && demo.phase !== 'complete'
  const text = busy && demo.phase === 'walking' ? 'An astronaut is heading to the equipment. Let’s watch!' : mode === 'orbit' ? 'See that tiny light? That’s our home!' : hint
  if (collapsed) return <button className="commander-collapsed glass" aria-label="Open Commander Luna’s message" onClick={() => onCollapse(false)}><img src={portraitUrl()} alt="Commander Luna" /><span /><i>!</i></button>
  return <section className={`commander-panel glass ${busy ? 'commander-busy' : ''}`} aria-label="Message from Commander Luna">
    <button className="commander-avatar" onClick={() => onCollapse(true)} aria-label="Collapse the message"><img src={portraitUrl()} alt="Commander Luna, pixel astronaut" /><span className="avatar-orbit" /><StatusDot /></button>
    <div className="commander-content"><div className="commander-title"><span>COMMANDER <b>LUNA</b></span><span className="commander-hello">{game.stage === 'free' ? 'ON YOUR OWN' : `STAGE ${game.stage}`}</span><button className="commander-hide" onClick={() => onCollapse(true)} aria-label="Hide the message">−</button></div><p>{text}</p><div className="commander-actions">{mode !== 'base' ? <button className="commander-primary" onClick={() => onMode('base')}><Sparkles size={14} /> Go to the base</button> : <button className="commander-primary" onClick={onTimeline}><History size={14} /> Cause-and-effect log</button>}</div></div>
  </section>
}
