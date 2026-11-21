// Result review and "Tại sao điều này xảy ra?" text. Built only from the real log entry and the decisions
// it cites (causeIds → DecisionRecord), so an explanation never names a choice the player did not make.
import type { DecisionKey, DecisionRecord, EventLogEntry, GameState } from './types.ts'
import { A1, CAPACITY, CREW, FOOD, LIFE, POWER, SCHEDULE } from './scenario.ts'
const LIFE_RECOVERY = LIFE.recovery, A1_SURPLUS = A1.surplusKwh
import { roverEnergyNeed } from './reducer.ts'

export interface Review {
  eyebrow: string
  title: string
  /** "Bạn đã chọn gì?" (decisions only) */
  chose?: string
  /** "Điều gì xảy ra?" */
  happened: string[]
  /** "Vì sao xảy ra?" — tied to the player's earlier choices when there are any */
  why: string[]
  /** "Điều gì có thể ảnh hưởng tới tương lai?" */
  future?: string
  /** Resource bars before → after (percent of capacity) with the real change, from the entry's own snapshot */
  bars?: { key: 'battery' | 'water' | 'oxygen' | 'food'; before: number; after: number; delta: string }[]
  /** One key idea per event (STEM) */
  lesson?: string
  /** A short reflection question (not a quiz) */
  reflect?: string
  tone: 'decision' | 'event' | 'consequence' | 'good' | 'stage'
}

const LABEL: Record<string, string> = {
  'A1:recycle': 'Recycle more water', 'A1:battery': 'Charge the backup battery',
  'A3:keep': 'Keep the array open', 'A3:stow': 'Fold the array away',
  'B1:now': 'Fix the watering now', 'B1:later': 'Fix it after the shift',
  'C2:go': 'Take the checked A* route', 'C31:slow': 'Drive slowly through the rubble', 'C31:detour': 'Detour around the rubble', 'C31:return': 'Bring MILO back',
  'D1:greenhouse': 'Greenhouse lights first', 'D1:rover': 'Rover charging first',
  'D2:rover': 'MILO carries the cargo', 'D2:crew': 'Astronauts fetch the cargo',
  'D3:wait': 'MILO waits out the storm and measures again', 'D3:return': 'Bring MILO home early',
}
export const choiceLabel = (r: Pick<DecisionRecord, 'key' | 'choice'>) => r.key === 'C1' ? `Choose research zone ${r.choice}` : LABEL[`${r.key}:${r.choice}`] ?? r.choice

/** One key idea per event: the lesson the situation is built around. */
export const LESSON: Partial<Record<DecisionKey | 'A2' | 'B4' | 'C4' | 'D2L', string>> = {
  A1: 'Power is limited, so you have to choose what comes first.',
  A2: 'Electrolysis uses electricity to split water into breathable oxygen (and hydrogen). Making oxygen costs both water and power.',
  A3: 'Protecting equipment is also a resource decision: safety today in exchange for power today.',
  B1: 'Plants need water regularly. The longer they go without it, the weaker they get.',
  B4: 'An experiment is trustworthy when it has real measurements and observations over several days.',
  C1: 'Choosing where to survey is the first step of every research trip.',
  C2: 'A rover can only drive where the ground is gentle enough (slope ≤ 15°). The longer the trip, the more battery and time it takes.',
  C31: 'A map cannot show everything: rocks smaller than a 5 m cell are only seen by the rover’s camera.',
  C4: 'A measurement is indirect evidence: a high hydrogen index does not prove there is ice.',
  D1: 'When power is short, life support always comes first.',
  D2: 'Supplies are only useful once they reach the base. Moving them costs time and energy.',
  D3: 'Radiation disturbs the neutron detector. Noisy data must be thrown out, not used.',
}
const REFLECT: Partial<Record<DecisionKey | 'A2', string>> = {
  A1: 'If tomorrow stays dark for a long time, would you rather have more water or more power?',
  A2: 'Why does making oxygen use up water?',
  A3: 'Would you give up a few hours of power to protect the solar array?',
  B1: 'If these were your plants, would you let them stay thirsty all afternoon?',
  C1: 'Why can permanently shadowed regions keep ice?',
  C31: 'Why can even a very good map miss small rocks?',
  D1: 'If there is only a little power left, what must be kept running first?',
  D2: 'By rover or on foot: what does each way cost?',
  D3: 'How can one bad measurement lead to a wrong conclusion?',
}

/** Future impact of a choice, as the engine actually models it. */
function future(r: DecisionRecord, s: GameState): string | undefined {
  switch (`${r.key}:${r.choice}`) {
    case 'A1:recycle': return 'The extra clean water stays in the tank. The battery does not get this extra charge.'
    case 'A1:battery': return `The battery holds at most ${CAPACITY.battery} kWh: once it is full, extra charge cannot be stored. The used water is still waiting in the filter tank.`
    case 'A3:keep': return `If the rocks hit, the array loses ${POWER.a3LossFraction * 100} % of its power for good. When light is low (D1) there will be even less power.`
    case 'A3:stow': return `About ${Math.round((SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin + SCHEDULE.a3RedeployMin) / 60)} hours without solar power; the base runs on its battery. Afterwards the array is still at 100 %.`
    case 'B1:now': return 'The plants go without water for only about 2 more hours. The harvest weight will show this.'
    case 'B1:later': return `The plants go without water for about ${Math.round((SCHEDULE.b1DelayMin + SCHEDULE.b1RepairMin) / 60)} more hours, so the harvest may weigh less.`
    case 'C2:go': return 'MILO waits until it has enough charge for the round trip, then sets off.'
    case 'C31:slow': return 'The rest of the way is slower and uses more battery.'
    case 'C31:detour': return 'A slightly longer way, but it avoids the rubble completely.'
    case 'C31:return': return 'MILO comes back safely but has measured nothing at the chosen zone.'
    case 'D1:greenhouse': return 'The greenhouse lights stay on; the rover may charge slowly and the survey has to wait.'
    case 'D1:rover': return 'The rover charges first; the greenhouse lights may be off for hours and the plants grow more slowly.'
    case 'D2:rover': return s.ice.stage === 'recalled' ? 'The ice survey is interrupted until the cargo is delivered.' : 'MILO is busy carrying cargo for a few hours and uses a little battery.'
    case 'D2:crew': return `Two astronauts are outside for about ${SCHEDULE.d2CrewPickupMin / 60} hours; the crew uses extra oxygen meanwhile.`
    case 'D3:wait': return 'The survey takes longer, but you get more clean neutron samples.'
    case 'D3:return': return 'Home early and safe, but with fewer neutron samples.'
  }
  return r.key === 'C1' ? 'Next step: choose a safe route to this zone.' : undefined
}

/** "Vì sao" for an entry caused by earlier decisions: each cited decision, in the player's own words. */
function causes(e: EventLogEntry, s: GameState): string[] {
  const out: string[] = []
  for (const id of e.causeIds) {
    const r = s.history.find((h) => h.id === id)
    if (!r) continue
    const at = `Earlier you chose “${choiceLabel(r)}” (${r.key === 'C31' ? 'C3.1' : r.key}).`
    switch (`${e.tag}:${r.key}:${r.choice}`) {
      case 'A3:A3:keep': out.push(`${at} The array was still open when the rocks passed, so its surface got scratched.`); break
      case 'A3:A3:stow': out.push(`${at} The array was folded away, so the rocks did no damage.`); break
      case 'D1:A3:keep': out.push(`${at} The array had already lost 10 % of its power, so there is even less power while light is low.`); break
      case 'D1:A3:stow': out.push(`${at} The array still has 100 % of its power, so it makes more power while light is low.`); break
      case 'B1:B1:now': out.push(`${at} The repair started right away, so the plants were thirsty only briefly.`); break
      case 'B1:B1:later': out.push(`${at} The repair had to wait until the end of the shift, so the plants were thirsty for longer.`); break
      case 'B4:B1:now': case 'B4:B1:later': out.push(`${at} The plants went ${Math.round(s.food.waterStressMin / 60)} hours without water, and that affects their weight.`); break
      case 'B4:D1:greenhouse': case 'B4:D1:rover': out.push(`${at} The greenhouse lights were off for ${Math.round(s.food.lightDeficitMin / 60)} hours in total.`); break
      default: out.push(at)
    }
  }
  return out
}

const tone = (e: EventLogEntry): Review['tone'] => e.kind === 'decision' ? 'decision' : e.kind === 'event' ? 'event' : e.kind === 'consequence' ? 'consequence' : e.kind === 'stage' ? 'stage' : 'good'

function baseReview(e: EventLogEntry, s: GameState): Review {
  const tag = e.tag === 'C3.1' ? 'C31' : e.tag
  const deltas = e.deltas ? Object.entries(e.deltas).filter(([k]) => k !== 'wastewater').map(([k, v]) => `${({ battery: 'Battery', water: 'Clean water', oxygen: 'Oxygen', food: 'Food' } as Record<string, string>)[k] ?? k} ${v > 0 ? '+' : ''}${k === 'food' ? `${Math.round(v / CREW * 10) / 10} days` : `${Math.round(v * 10) / 10} ${k === 'battery' ? 'kWh' : k === 'oxygen' ? 'kg' : 'L'}`}`) : []
  if (e.kind === 'decision') {
    const r = [...s.history].reverse().find((h) => (h.key === tag || (h.key === 'C1' && tag === 'C1')) && h.atMinute <= e.atMinute)
    return {
      eyebrow: `RESULT · ${e.tag}`, title: 'You decided', tone: 'decision',
      chose: r ? choiceLabel(r) : e.title,
      happened: [e.title + '.', ...(e.detail ? [e.detail] : []), ...(deltas.length ? [deltas.join(' · ')] : [])],
      why: r && r.rejected.length ? [`You did not choose: ${r.rejected.map((c) => choiceLabel({ key: r.key, choice: c })).join(', ')}. Every choice has something to gain and something to lose.`] : [],
      future: r ? future(r, s) : undefined,
      lesson: LESSON[tag as DecisionKey], reflect: REFLECT[tag as DecisionKey],
    }
  }
  const why = causes(e, s)
  if (e.tag === 'D1' && !why.length) why.push('The battery still has enough to cover the missing power.')
  if (e.tag === 'A2') return { eyebrow: 'STAGE A2 · OXYGEN', title: e.title, tone: 'good', happened: [e.detail ?? ''], why: ['The electrolyser uses electricity to split water into oxygen and hydrogen.'], future: 'From now on you will see water and power go down a little as oxygen goes up.', lesson: LESSON.A2, reflect: REFLECT.A2 }
  const lessonKey = e.tag === 'B4' ? 'B4' : e.tag === 'C4' ? 'C4' : undefined
  return {
    eyebrow: `${e.kind === 'event' ? 'EVENT' : e.kind === 'consequence' ? 'CONSEQUENCE' : e.kind === 'research' ? 'RESEARCH' : 'MISSION'}${e.tag && e.tag !== 'FREE' ? ` · ${e.tag}` : ''}`,
    title: e.title, tone: tone(e),
    happened: [...(e.detail ? [e.detail] : []), ...(deltas.length ? [deltas.join(' · ')] : [])],
    why, lesson: lessonKey ? LESSON[lessonKey] : e.kind === 'consequence' && e.tag ? LESSON[tag as DecisionKey] : undefined,
  }
}

// ── Persistent objective: what the player should do or is waiting for, from the real state only ──
export interface Objective {
  title: string
  detail?: string
  /** 0..1 when something is in progress */
  progress?: number
  /** building the player can click / look at */
  building?: 'oxygen' | 'greenhouse' | 'rover' | 'command' | 'solar' | 'shelter' | 'battery'
  /** pure waiting: offer fast-forward to the next moment that needs the player */
  canSkip?: boolean
}
const hhmm = (minute: number) => { const t = 480 + Math.floor(minute); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
const frac = (a: number, b: number, now: number) => b > a ? Math.min(1, Math.max(0, (now - a) / (b - a))) : 1

export function currentObjective(g: GameState): Objective | null {
  if (g.phase !== 'playing' || g.decisions.length || g.inbox.length) return null
  const now = g.clock.elapsedMinutes, f = g.food, i = g.ice, sup = g.supply
  if (g.stage === 'A1') return null
  if (g.stage === 'A2') return { title: 'Turn on the electrolyser', detail: 'Tap the life support station.', building: 'oxygen' }
  if (g.stage === 'A3' && g.a3Choice === null) return { title: 'Watch the base', detail: 'The space-watch system will warn you if the solar array is at risk.', canSkip: true, building: 'solar' }
  if (g.a3HazardEndsAt !== null && now < g.a3HazardEndsAt) return { title: g.a3Choice === 'stow' ? 'The array is folded, waiting for the rocks to pass' : 'The rock shower is passing and the array is open', detail: `The shower ends at ${hhmm(g.a3HazardEndsAt)} (assumed time).`, progress: frac(g.a3HazardEndsAt - SCHEDULE.a3HazardMin - SCHEDULE.a3PrepMin, g.a3HazardEndsAt, now), canSkip: true, building: 'solar' }
  if (g.radiation.active && g.radiation.endsAt) return { title: 'Radiation storm: the crew is sheltering', detail: `Ends at ${hhmm(g.radiation.endsAt)}. Outdoor work is paused.`, progress: frac(g.radiation.endsAt - SCHEDULE.d3Min, g.radiation.endsAt, now), canSkip: true, building: 'shelter' }
  if (sup.stage === 'landing' && sup.landingEndsAt) return { title: 'The supply lander is landing', progress: frac(sup.landingEndsAt - SCHEDULE.d2LandingMin, sup.landingEndsAt, now), canSkip: true }
  if (sup.stage === 'pickup') {
    const p = sup.phaseStartedAt !== null && sup.jobDoneAt ? frac(sup.phaseStartedAt, sup.jobDoneAt, now) : undefined
    return { title: sup.method === 'crew' ? 'Two astronauts are bringing the cargo in' : sup.roverPhase === 'toBase' ? 'MILO is heading back to carry the cargo' : sup.roverPhase === 'trip' ? 'MILO is carrying the supplies' : 'MILO is being refitted for cargo', detail: 'The supplies count once they reach the base.', progress: p, canSkip: true, building: 'rover' }
  }
  if (f.irrigation === 'fault' && f.repairStartsAt !== null && f.repairStartsAt > now) return { title: 'The watering system is still broken', detail: `The repair is planned for ${hhmm(f.repairStartsAt)}. Tap the greenhouse to fix it sooner.`, building: 'greenhouse' }
  if (f.irrigation !== 'ok') return { title: 'Fixing the watering system', progress: f.repairDoneAt ? frac(f.repairDoneAt - SCHEDULE.b1RepairMin, f.repairDoneAt, now) : undefined, canSkip: true, building: 'greenhouse' }
  if (i.stage === 'charging' && i.route) return { title: 'MILO is charging for the trip', detail: `Needs ${Math.round(roverEnergyNeed(i.route.lengthM + i.detourM))} kWh for the round trip.`, progress: Math.min(1, i.roverBattery / roverEnergyNeed(i.route.lengthM + i.detourM)), canSkip: true, building: 'rover' }
  if ((i.stage === 'outbound' || i.stage === 'returning' || i.stage === 'recalled') && i.route) { const total = i.route.lengthM + i.detourM; return { title: i.stage === 'outbound' ? `MILO is driving to Zone ${i.zone}` : 'MILO is driving back to base', progress: i.stage === 'outbound' ? i.distanceM / total : 1 - i.distanceM / total, canSkip: true, building: 'rover' } }
  if (i.stage === 'surveying') return { title: `MILO is surveying Zone ${i.zone}`, progress: Math.min(1, i.surveyMin / i.surveyTargetMin), canSkip: true, building: 'rover' }
  if (f.started && !g.fired.includes('B1')) return { title: 'Watch the greenhouse', detail: 'The plants are growing. Let time run.', canSkip: true, building: 'greenhouse' }
  if (f.stage === 'harvested') return { title: 'Write the food report', detail: 'Tap the greenhouse.', building: 'greenhouse' }
  const day = Math.floor(now / 1440) + 1
  if (f.started && f.stage === 'growing' && !f.observations.some((o) => o.day === day)) return { title: 'Observe the plants today', detail: 'Tap the greenhouse and choose “Observe plants”.', building: 'greenhouse' }
  if (f.started && f.stage === 'growing' && f.growth >= FOOD.readyIndex) return { title: 'Harvest and weigh a sample', detail: 'The plants are big enough.', building: 'greenhouse' }
  if (g.stage === 'free' && !f.started) return { title: 'Start food research', detail: 'Tap the greenhouse.', building: 'greenhouse' }
  if (g.stage === 'free' && i.stage === 'idle' && !i.report && (g.mode === 'advanced' || g.history.some((h) => h.key === 'B1'))) return { title: 'Start the ice search', detail: 'Tap the rover station.', building: 'rover' }
  if (f.report && i.report) return { title: 'Submit your reports and return', detail: 'Tap the command center.', building: 'command' }
  if (f.started && f.stage === 'growing') return { title: `Wait for the plants to reach ${Math.round(FOOD.readyIndex * 100)} %`, detail: `Now ${Math.round(f.growth * 100)} %. Observing every day makes the data more reliable.`, progress: f.growth / FOOD.readyIndex, canSkip: true, building: 'greenhouse' }
  return { title: 'Watch the base', detail: 'You will be told when the next event happens.', canSkip: true }
}

const UNIT: Record<string, string> = { battery: 'kWh', water: 'L', oxygen: 'kg', food: 'days' }
/** Result review with before → after bars and, for A1, the exact litres / kWh of this run. */
export function reviewFor(e: EventLogEntry, s: GameState): Review {
  const r = baseReview(e, s)
  if (e.after && e.deltas) {
    const keys = (['water', 'battery', 'oxygen', 'food'] as const).filter((k) => e.deltas![k] !== undefined || (e.tag === 'A1' && (k === 'water' || k === 'battery')))
    r.bars = keys.map((k) => {
      const d = e.deltas![k] ?? 0, after = e.after![k], v = k === 'food' ? d / CREW : d
      return { key: k, before: Math.round((after - d) / CAPACITY[k] * 100), after: Math.round(after / CAPACITY[k] * 100), delta: Math.abs(v) < 0.05 ? '±0' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 10) / 10} ${UNIT[k]}` }
    })
    r.happened = r.happened.filter((x) => !/(Battery|Clean water|Oxygen|Food) [+−-]/.test(x))
  }
  if (e.kind === 'decision' && e.tag === 'A1' && e.deltas && e.after) {
    const water = e.deltas.water ?? 0, battery = e.deltas.battery ?? 0, batteryPct = Math.round(e.after.battery / CAPACITY.battery * 100)
    if (water > 0) {
      const litres = water / LIFE_RECOVERY
      r.title = `The commander used ${A1_SURPLUS} kWh of extra power to recycle more water`
      r.happened = [`The filter turned ${Math.round(litres)} L of used water into ${Math.round(water)} L of clean water`]
      r.why = [`The other ${Math.round(litres - water)} L is waste trapped in the filter core and cannot be used`]
      r.future = `The backup battery got no extra charge, so if tomorrow stays dark for long, the base has only ${batteryPct}% battery to use`
    } else {
      r.title = `The commander used ${A1_SURPLUS} kWh of extra power to charge the backup battery`
      r.happened = [`The backup battery gained ${Math.round(battery * 10) / 10} kWh`]
      r.why = [`About ${Math.round((A1_SURPLUS - battery) * 10) / 10} kWh was lost as heat while charging (90 % charging efficiency, a game assumption)`]
      r.future = `The used water is still waiting in the filter tank. Once the battery is full, extra charge cannot be stored`
    }
  } else if (e.kind === 'decision') r.title = e.title
  return r
}
