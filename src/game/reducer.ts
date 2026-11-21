// LUNARIS Story Mode engine: one pure reducer drives the clock, resources, scheduled events, decisions,
// the two research branches and the ending. The UI and the 3D world only read this state and dispatch actions.
import type { Decision, DecisionKey, DecisionRecord, EffectRecord, EventLogEntry, GameAction, GameState, IceState, ResourceDelta, ResourceKey, ResourceState, Sample } from './types.ts'
import { A1, CAPACITY, CREW, DAY, FOOD, INITIAL, LIFE, MISSION_START, POWER, ROVER, SAVE_SCHEMA_VERSION, SCHEDULE, SUPPLY } from './scenario.ts'

const KEYS: ResourceKey[] = ['battery', 'water', 'wastewater', 'oxygen', 'food']
const STEP = 10   // simulation sub-step (minutes) so events fire at the right moment at any speed

export function clampResources(r: ResourceState): ResourceState {
  const out = { ...r }
  for (const key of KEYS) out[key] = Math.min(CAPACITY[key], Math.max(0, Number.isFinite(out[key]) ? out[key] : 0))
  return out
}
export function resourceDelta(before: ResourceState, after: ResourceState): ResourceDelta {
  const d: ResourceDelta = {}
  for (const key of KEYS) { const v = Math.round((after[key] - before[key]) * 100) / 100; if (v !== 0) d[key] = v }
  return d
}

export function createInitialState(): GameState {
  return {
    version: SAVE_SCHEMA_VERSION, phase: 'opening', mode: null, stage: 'A1',
    clock: { elapsedMinutes: 0 }, isPaused: true,
    resources: { ...INITIAL },
    power: { capacityFactor: 1, stowedUntil: null, lightFactor: 1, productionKw: POWER.arrayKw, loadKw: POWER.essentialKw, greenhouseOn: true, roverChargingOn: false, electrolysisOn: false, d1Priority: null },
    a1Choice: null, a2Enabled: false, a3Choice: null, a3HazardEndsAt: null,
    food: { started: false, startedAt: null, stage: 'growing', irrigation: 'ok', repairStartsAt: null, repairDoneAt: null, waterStressMin: 0, lightDeficitMin: 0, growth: 0.15, observations: [], lightLog: [], harvestGrams: null, report: null },
    ice: { stage: 'locked', zone: null, route: null, distanceM: 0, slow: false, detourM: 0, anomalyDone: false, surveyMin: 0, surveyTargetMin: ROVER.surveyHours * 60, samples: [], roverBattery: 28, waitingRadiation: false, report: null, chargeStartedAt: null },
    supply: { stage: 'none', method: null, jobDoneAt: null, roverPhase: 'none', landingEndsAt: null, phaseStartedAt: null },
    radiation: { active: false, endsAt: null, roverChoice: null },
    fired: [], decisions: [], history: [],
    log: [{ id: 'evt-1', atMinute: 0, kind: 'system', title: 'Welcome to Artemis Base!', detail: 'You are taking charge of the base. The greenhouse plants were planted before you arrived.', causeIds: [] }],
    inbox: [], effects: [], foodWarned: false, ending: null, nextId: 2,
  }
}

/** "Ngày 3 · SOL 006 · 10:24". Display only. */
export function missionTime(state: GameState) {
  const total = MISSION_START.minuteOfDay + Math.floor(state.clock.elapsedMinutes)
  const day = Math.floor(state.clock.elapsedMinutes / DAY) + 1
  const minute = total % DAY
  return { day, sol: MISSION_START.sol + Math.floor(total / DAY), label: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` }
}
export const dayOf = (minute: number) => Math.floor(minute / DAY) + 1

// ── helpers ─────────────────────────────────────────────────────────────────
function id(state: GameState, prefix: string): [string, GameState] { return [`${prefix}-${state.nextId}`, { ...state, nextId: state.nextId + 1 }] }
/**
 * Adds a log entry. `important` entries also go to the inbox: the player reads and confirms them
 * (no timeout). In Basic mode an inbox item pauses the simulation until it is confirmed.
 */
function log(state: GameState, entry: Omit<EventLogEntry, 'id' | 'atMinute'>, important = false): GameState {
  const [eid, next] = id(state, 'evt')
  const linked = entry.causeIds.length ? next.history.map((h) => entry.causeIds.includes(h.id) ? { ...h, effectIds: [...h.effectIds, eid] } : h) : next.history
  const out = { ...next, history: linked, log: [...next.log, { ...entry, id: eid, atMinute: state.clock.elapsedMinutes, ...(entry.deltas ? { after: { ...state.resources } } : {}) }] }
  return important ? { ...out, inbox: [...out.inbox, eid], isPaused: out.mode === 'basic' ? true : out.isPaused } : out
}
/**
 * Records (or updates) one measured consequence. Keyed by `key`: `add` accumulates, `set` replaces, `min` keeps the lowest.
 * Called only from inside the simulation when something really happens, never from the UI.
 */
function effect(state: GameState, key: string, unit: string, o: { add?: number; set?: number; min?: number; causeIds?: string[]; facts?: EffectRecord['facts'] } = {}): GameState {
  const now = state.clock.elapsedMinutes
  const i = state.effects.findIndex((e) => e.key === key), prev = i >= 0 ? state.effects[i] : null
  const base = prev?.amount ?? 0
  const amount = o.set !== undefined ? o.set : o.min !== undefined ? (prev ? Math.min(base, o.min) : o.min) : base + (o.add ?? 0)
  const rec: EffectRecord = { key, unit, atMinute: prev?.atMinute ?? now, lastMinute: now, amount: +amount.toFixed(4), causeIds: [...new Set([...(prev?.causeIds ?? []), ...(o.causeIds ?? [])])], facts: { ...(prev?.facts ?? {}), ...(o.facts ?? {}) } }
  return { ...state, effects: i >= 0 ? state.effects.map((e, k) => k === i ? rec : e) : [...state.effects, rec] }
}
const effectAmount = (s: GameState, key: string) => s.effects.find((e) => e.key === key)?.amount ?? 0

/** Central pause rule for Basic: nothing time-based runs while a decision or an unread result is open. */
export const basicBlocked = (s: GameState) => s.mode === 'basic' && (s.decisions.length > 0 || s.inbox.length > 0)
/** Event gating (both modes): a new gameplay event waits until the current one is resolved and reviewed. */
export const eventBusy = (s: GameState) => s.decisions.length > 0 || (s.mode === 'basic' && s.inbox.length > 0) || s.supply.stage === 'landing' || s.supply.stage === 'pickup'
const decisionId = (state: GameState, key: DecisionKey) => state.history.filter((h) => h.key === key).map((h) => h.id)
function ask(state: GameState, key: DecisionKey, options: string[], context: Decision['context'] = {}): GameState {
  if (state.decisions.some((d) => d.key === key)) return state
  const [did, next] = id(state, 'ask')
  // Basic mode stops time for every important decision; Advanced keeps the clock running.
  return { ...next, decisions: [...next.decisions, { id: did, key, atMinute: state.clock.elapsedMinutes, options, context }], isPaused: next.mode === 'basic' ? true : next.isPaused }
}
const fire = (state: GameState, key: string) => state.fired.includes(key) ? null : { ...state, fired: [...state.fired, key] }
const roverAway = (ice: IceState) => ['outbound', 'anomaly', 'surveying', 'returning', 'recalled'].includes(ice.stage)
const crewSheltered = (state: GameState) => state.radiation.active
/** B2–B4 open only after B1 has been answered (one problem at a time). */
export const b1Resolved = (s: GameState) => s.fired.includes('B1') && s.history.some((h) => h.key === 'B1') && s.food.irrigation === 'ok'
const foodOpen = (s: GameState) => s.food.started && s.history.some((h) => h.key === 'B1')
export const supplyTripKwh = () => 2 * SCHEDULE.d2PadKm * ROVER.kwhPerKm * 1.4
export const roverEnergyNeed = (lengthM: number) => 2 * lengthM / 1000 * ROVER.kwhPerKm * 1.15 + ROVER.surveyHours * ROVER.surveyKw

/** Deterministic pseudo-noise for simulated instrument readings (same run → same numbers). */
function noise(seed: number) { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x) - 0.5 }

// ── simulation step ─────────────────────────────────────────────────────────
function simulate(state: GameState, minutes: number): GameState {
  const h = minutes / 60, now = state.clock.elapsedMinutes
  let s = state
  const r = { ...s.resources }
  const p = { ...s.power }

  // Solar array: design output × permanent capacity × light × (0 while stowed).
  const stowed = p.stowedUntil !== null && now < p.stowedUntil
  p.productionKw = POWER.arrayKw * p.capacityFactor * p.lightFactor * (stowed ? 0 : 1)

  // Life support (essential, protected): recycler and, after A2, electrolysis.
  const crewWater = Math.min(r.water, LIFE.waterLPerCrewDay * CREW * minutes / DAY)
  r.water -= crewWater; r.wastewater += crewWater
  r.oxygen -= LIFE.o2KgPerCrewDay * CREW * minutes / DAY * (s.supply.stage === 'pickup' && s.supply.method === 'crew' ? 1.25 : 1)
  r.food -= CREW * minutes / DAY
  const recycled = Math.min(r.wastewater, LIFE.recyclerLph * h, CAPACITY.water - r.water)
  let essential = POWER.essentialKw + recycled * POWER.recyclerKwhPerL / Math.max(h, 1e-9)
  p.electrolysisOn = s.a2Enabled && r.oxygen < CAPACITY.oxygen * LIFE.o2Target && r.water > 30
  if (p.electrolysisOn) essential += POWER.electrolysisKw

  // Optional loads, in priority order; shed when the battery would fall below the essential reserve.
  const roverNeedsCharge = !roverAway(s.ice) && s.supply.roverPhase === 'none' && s.ice.roverBattery < ROVER.batteryKwh - 0.01 && s.ice.stage !== 'locked'
  const order = p.d1Priority === 'rover' ? ['rover', 'greenhouse'] : ['greenhouse', 'rover']
  let surplus = p.productionKw - essential
  const on: Record<string, boolean> = { greenhouse: false, rover: false }
  for (const load of order) {
    const kw = load === 'greenhouse' ? POWER.greenhouseKw : POWER.roverChargeKw
    if (load === 'greenhouse' && s.food.stage !== 'growing') continue
    if (load === 'rover' && !roverNeedsCharge) continue
    const batteryCovers = r.battery + (surplus - kw) * h > POWER.reserveKwh
    if (surplus >= kw || batteryCovers) { on[load] = true; surplus -= kw }
  }
  const wasGreenhouse = p.greenhouseOn
  p.greenhouseOn = on.greenhouse; p.roverChargingOn = on.rover
  p.loadKw = essential + (on.greenhouse ? POWER.greenhouseKw : 0) + (on.rover ? POWER.roverChargeKw : 0)
  r.battery += (p.productionKw - p.loadKw) * h
  if (r.battery <= 0.5) { p.electrolysisOn = false }
  r.wastewater -= recycled; r.water += recycled * LIFE.recovery
  if (p.electrolysisOn) {
    const kg = Math.min(LIFE.electrolysisKgph * h, CAPACITY.oxygen - r.oxygen, r.water / LIFE.waterLPerKgO2)
    r.oxygen += kg; r.water -= kg * LIFE.waterLPerKgO2
  }
  s = { ...s, resources: clampResources(r), power: p }

  // ── Causal records: what really happened during this step ──
  const phase = p.lightFactor < 1 ? 'd1' : stowed ? 'a3' : 'other'
  const phaseCause = phase === 'd1' ? decisionId(s, 'D1') : phase === 'a3' ? decisionId(s, 'A3') : []
  if (stowed) {   // A3 "stow": no solar power; how far did the battery fall?
    if (!s.effects.some((e) => e.key === 'a3.stowOutage')) s = effect(s, 'a3.stowOutage', 'min', { set: 0, causeIds: decisionId(s, 'A3'), facts: { batteryStartKwh: +state.resources.battery.toFixed(1) } })
    s = effect(s, 'a3.stowOutage', 'min', { add: minutes })
    s = effect(s, 'a3.stowBattery', 'kWh', { min: +s.resources.battery.toFixed(1), causeIds: decisionId(s, 'A3') })
  }
  if (s.food.stage === 'growing' && !p.greenhouseOn) s = effect(s, `lamp.off.${phase}`, 'min', { add: minutes, causeIds: phaseCause, facts: phase === 'd1' ? { priority: p.d1Priority ?? 'none' } : {} })
  if (roverNeedsCharge && s.ice.stage === 'charging' && !on.rover) s = effect(s, `rover.chargeDenied.${phase}`, 'min', { add: minutes, causeIds: phaseCause, facts: phase === 'd1' ? { priority: p.d1Priority ?? 'none' } : {} })
  if (s.supply.stage === 'pickup' && s.supply.method === 'crew') s = effect(s, 'd2.crewO2', 'kg', { add: LIFE.o2KgPerCrewDay * CREW * minutes / DAY * 0.25, causeIds: decisionId(s, 'D2') })
  if (s.supply.method === 'rover' && (s.supply.stage === 'pickup' || s.supply.roverPhase === 'unconfig') && s.ice.zone && !s.ice.report) s = effect(s, 'd2.roverInterrupted', 'min', { add: minutes, causeIds: decisionId(s, 'D2') })

  // B2: the greenhouse records every change of its lamp supply by itself (no player journal).
  if (s.food.stage === 'growing' && wasGreenhouse !== p.greenhouseOn) {
    const causes = [...decisionId(s, 'D1'), ...decisionId(s, 'A3')]
    const reason = p.greenhouseOn ? 'enough power again' : p.lightFactor < 1 ? 'light dropped, optional power was cut to protect essential systems' : 'battery fell to its reserve level'
    s = { ...s, food: { ...s.food, lightLog: [...s.food.lightLog, { atMinute: now, on: p.greenhouseOn, reason }] } }
    s = log(s, { kind: 'research', tag: 'B2', title: p.greenhouseOn ? 'Greenhouse lights back on' : 'Greenhouse lights off', detail: `Greenhouse log: ${reason}.`, causeIds: causes })
  }

  // Greenhouse plants (research crop, never the crew's food supply).
  if (s.food.stage === 'growing') {
    const f = { ...s.food }
    const irrigated = f.irrigation === 'ok'
    if (irrigated) s = { ...s, resources: { ...s.resources, water: Math.max(0, s.resources.water - FOOD.irrigationLph * h) } }
    else f.waterStressMin += minutes
    if (!p.greenhouseOn) f.lightDeficitMin += minutes
    f.growth = Math.min(1, f.growth + minutes / (FOOD.growDays * DAY) * (irrigated ? 1 : 0.25) * (p.greenhouseOn ? 1 : 0.3))
    s = { ...s, food: f }
    // Growth lost, attributed in order: water first, then lamps (so the two parts add up exactly).
    const grow = minutes / (FOOD.growDays * DAY)
    if (!irrigated) {
      s = effect(s, 'b1.waterStress', 'min', { add: minutes, causeIds: decisionId(s, 'B1') })
      s = effect(s, 'growth.lostWater', 'index', { add: grow * 0.75, causeIds: decisionId(s, 'B1') })
    }
    const lampLoss = grow * (irrigated ? 1 : 0.25) * (p.greenhouseOn ? 0 : 0.7)
    if (lampLoss > 0) s = effect(s, `growth.lostLamp.${phase}`, 'index', { add: lampLoss, causeIds: phaseCause })
  }

  // Rover: charge at the depot, drive the chosen verified route, survey, come back.
  const ice0 = s.ice
  s = roverStep(s, minutes)
  // C3.1 "go slowly": the extra time and battery really spent on the legs driven this step.
  const driven = Math.abs(s.ice.distanceM - ice0.distanceM)
  if (s.ice.slow && driven > 0 && (ice0.stage === 'outbound' || ice0.stage === 'returning' || ice0.stage === 'recalled')) {
    const normal = ROVER.speedKmh * 1000 / 60, slow = normal * ROVER.slowFactor
    s = effect(s, 'c31.slow.minutes', 'min', { add: driven / slow - driven / normal, causeIds: decisionId(s, 'C31') })
    s = effect(s, 'c31.slow.kwh', 'kWh', { add: driven / 1000 * ROVER.kwhPerKm * (ROVER.slowEnergyFactor - 1), causeIds: decisionId(s, 'C31') })
  }
  return s
}

function roverStep(state: GameState, minutes: number): GameState {
  let s = state
  const ice = { ...s.ice }, h = minutes / 60, now = s.clock.elapsedMinutes
  if (s.power.roverChargingOn) ice.roverBattery = Math.min(ROVER.batteryKwh, ice.roverBattery + POWER.roverChargeKw * 0.9 * h)
  if (ice.stage === 'charging' && ice.route && ice.roverBattery >= roverEnergyNeed(ice.route.lengthM + ice.detourM)) {
    ice.stage = 'outbound'
    s = log(effect({ ...s, ice }, 'rover.chargeWait', 'min', { set: now - (ice.chargeStartedAt ?? now), causeIds: decisionId(s, 'C2') }), { kind: 'research', tag: 'C2', title: 'MILO sets off', detail: `The rover battery is enough for the round trip to Zone ${ice.zone}.`, causeIds: decisionId(s, 'C2') }, true)
    return s
  }
  const speed = ROVER.speedKmh * 1000 / 60 * (ice.slow ? ROVER.slowFactor : 1)           // m per minute
  const energy = (m: number) => m / 1000 * ROVER.kwhPerKm * (ice.slow ? ROVER.slowEnergyFactor : 1)
  const total = ice.route ? ice.route.lengthM + ice.detourM : 0
  if (ice.stage === 'outbound') {
    const before = ice.distanceM
    ice.distanceM = Math.min(total, ice.distanceM + speed * minutes)
    ice.roverBattery = Math.max(0, ice.roverBattery - energy(ice.distanceM - before))
    if (!ice.anomalyDone && ice.distanceM >= total * ROVER.anomalyAt) {
      ice.stage = 'anomaly'; ice.distanceM = total * ROVER.anomalyAt
      s = log({ ...s, ice }, { kind: 'event', tag: 'C3.1', title: 'MILO stops: unexpected ground', detail: 'The camera sees rubble smaller than the map’s 5 m cells (a made-up situation).', causeIds: decisionId(s, 'C2') })
      return ask(s, 'C31', ['slow', 'detour', 'return'], { atM: Math.round(ice.distanceM), zone: ice.zone ?? '' })
    }
    if (ice.distanceM >= total) {
      ice.stage = 'surveying'
      s = log({ ...s, ice }, { kind: 'research', tag: 'C3.2', title: `MILO reaches Zone ${ice.zone}`, detail: `The rover starts ${Math.round(ice.surveyTargetMin / 60)} hours of measurements at exactly the spot you chose.`, causeIds: [...decisionId(s, 'C1'), ...decisionId(s, 'C31')] }, true)
      return s
    }
  } else if (ice.stage === 'surveying') {
    ice.roverBattery = Math.max(0, ice.roverBattery - ROVER.surveyKw * h)
    const before = Math.floor(ice.surveyMin / 60)
    ice.surveyMin += minutes
    for (let hour = before + 1; hour <= Math.floor(ice.surveyMin / 60); hour++) ice.samples = [...ice.samples, ...takeSamples(s, ice, now, hour)]
    if (ice.surveyMin >= ice.surveyTargetMin && ice.waitingRadiation && s.radiation.active) s = effect(s, 'd3.surveyHold', 'min', { add: minutes, causeIds: decisionId(s, 'D3') })   // MILO keeps waiting for the radiation to end
    if (ice.surveyMin >= ice.surveyTargetMin && !(ice.waitingRadiation && s.radiation.active)) {
      ice.stage = 'returning'; ice.waitingRadiation = false
      s = log({ ...s, ice }, { kind: 'research', tag: 'C3.3', title: 'Survey done, MILO heads home', detail: `${ice.samples.filter((x) => x.valid).length} valid measurements.`, causeIds: decisionId(s, 'C1') })
      return s
    }
  } else if (ice.stage === 'returning' || ice.stage === 'recalled') {
    const before = ice.distanceM
    ice.distanceM = Math.max(0, ice.distanceM - speed * minutes)
    ice.roverBattery = Math.max(0, ice.roverBattery - energy(before - ice.distanceM))
    if (ice.distanceM <= 0) {
      if (ice.stage === 'recalled') {
        ice.stage = 'cargo'
        s = log({ ...s, ice, supply: { ...s.supply, roverPhase: 'config', jobDoneAt: now + SCHEDULE.d2RoverConfigMin } }, { kind: 'consequence', tag: 'D2', title: 'MILO returns to carry cargo', detail: 'The rover is refitted for hauling. The ice survey pauses; the data already measured is kept.', causeIds: decisionId(s, 'D2') }, true)
        return s
      }
      return finishIce({ ...s, ice })
    }
  }
  return { ...s, ice }
}

function takeSamples(s: GameState, ice: IceState, now: number, hour: number): Sample[] {
  const psr = ice.route?.inPsr ?? false
  // SIMULATED readings (SCENARIO): a relative hydrogen index that is higher in mapped PSRs. Never a detection of ice.
  const base = psr ? 1.32 : 1.06
  const seed = hour * 7 + (ice.zone ? ice.zone.charCodeAt(0) : 0)
  const rad = s.radiation.active
  return [
    { atMinute: now, instrument: 'neutron', value: +(base + noise(seed) * 0.12).toFixed(3), valid: !rad, flag: rad ? 'radiation noise' : undefined },
    { atMinute: now, instrument: 'nir', value: +(0.4 + noise(seed + 1) * 0.1).toFixed(3), valid: true },
    { atMinute: now, instrument: 'thermal', value: Math.round((psr ? 52 : 118) + noise(seed + 2) * 14), valid: true },
  ]
}

function finishIce(state: GameState): GameState {
  const ice = { ...state.ice }
  const neutron = ice.samples.filter((x) => x.instrument === 'neutron')
  const valid = neutron.filter((x) => x.valid)
  const meanIndex = valid.length ? valid.reduce((a, x) => a + x.value, 0) / valid.length : 0
  const reasons: string[] = []
  if (ice.route) reasons.push(`Zone ${ice.zone} (${ice.route.name}): NASA data shows it is ${ice.route.inPsr ? 'inside a permanently shadowed region (PSR)' : 'not inside a PSR'}.`)
  if (neutron.length - valid.length) reasons.push(`${neutron.length - valid.length} neutron readings were rejected because of radiation noise (D3); earlier samples were kept.`)
  if (ice.slow) reasons.push('Driving slowly after the rough ground cost extra time and battery.')
  if (ice.detourM) reasons.push(`Detoured an extra ${Math.round(ice.detourM)} m around the rubble.`)
  const confidence = valid.length >= 6 ? 'high' : valid.length >= 3 ? 'medium' : 'low'
  ice.stage = 'done'; ice.report = { validNeutron: valid.length, invalidNeutron: neutron.length - valid.length, meanIndex: +meanIndex.toFixed(3), confidence, reasons }
  let s2: GameState = { ...state, ice }
  if (neutron.length - valid.length) s2 = effect(s2, 'd3.invalidNeutron', 'samples', { set: neutron.length - valid.length, causeIds: decisionId(state, 'D3'), facts: { valid: valid.length } })
  return log(s2, { kind: 'research', tag: 'C4', title: 'MILO is safely back at base', detail: `Ice report complete: ${valid.length} valid neutron samples, ${confidence} confidence.`, causeIds: [...decisionId(state, 'C1'), ...decisionId(state, 'C31'), ...decisionId(state, 'D3')] }, true)
}

// ── scheduled events ────────────────────────────────────────────────────────
function events(state: GameState): GameState {
  let s = state
  const now = s.clock.elapsedMinutes
  let f: GameState | null

  // A3: physical hazard to the array (SCENARIO; not a historical NASA event). Only after the A2 tutorial.
  if (s.stage === 'A3' && now >= SCHEDULE.a3At && !eventBusy(s) && (f = fire(s, 'A3'))) {
    s = log(f, { kind: 'event', tag: 'A3', title: 'Forecast: a shower of tiny space rocks', detail: 'The base’s tracking system forecasts a period when more tiny space rocks than usual will pass near the Moon. The Moon has almost no air to burn them up, so the small grains can hit the solar array directly. (The timing in the game is an assumption.)', causeIds: [] })
    s = ask(s, 'A3', ['keep', 'stow'])
  }
  if (s.a3HazardEndsAt !== null && now >= s.a3HazardEndsAt && (f = fire(s, 'A3-end'))) {
    s = f
    if (s.a3Choice === 'keep') {
      s = { ...s, power: { ...s.power, capacityFactor: 1 - POWER.a3LossFraction } }
      s = effect(s, 'a3.capacity', '%', { set: POWER.a3LossFraction * 100, causeIds: decisionId(s, 'A3'), facts: { beforePercent: 100, afterPercent: Math.round((1 - POWER.a3LossFraction) * 100) } })
      s = log(s, { kind: 'consequence', tag: 'A3', title: 'Solar array damaged: 10 % of its power lost for good', detail: 'The array stayed open while the rocks passed and its surface got scratched. It cannot be repaired during this mission.', causeIds: decisionId(s, 'A3') }, true)
    } else s = log(s, { kind: 'consequence', tag: 'A3', title: 'The rock shower has passed, the array is unharmed', detail: 'The array was folded away in time. Now it opens again at full 100 % power.', causeIds: decisionId(s, 'A3') }, true)
    s = log({ ...s, stage: 'free', ice: { ...s.ice, stage: s.ice.stage === 'locked' ? 'idle' : s.ice.stage } }, { kind: 'stage', tag: 'FREE', title: 'Tutorial complete! You run the base now', detail: s.mode === 'basic' ? 'You know how to balance power, water and oxygen. Next we will do the research together, one project at a time: first, food research in the greenhouse.' : 'Food research (greenhouse) and the ice search (rover MILO) are now open.', causeIds: [] }, true)
  }
  if (s.power.stowedUntil !== null && now >= s.power.stowedUntil && (f = fire(s, 'A3-redeployed'))) s = effect(f, 'a3.stowOutage', 'min', { causeIds: decisionId(f, 'A3'), facts: { batteryEndKwh: +f.resources.battery.toFixed(1), capacityPercent: Math.round(f.power.capacityFactor * 100) } })
  // B1: irrigation fault (not on the same moment as D2).
  if (s.food.started && s.food.startedAt !== null && now >= s.food.startedAt + SCHEDULE.b1AfterStartMin && s.food.stage === 'growing' && !eventBusy(s) && (f = fire(s, 'B1'))) {
    s = log({ ...f, food: { ...f.food, irrigation: 'fault' } }, { kind: 'event', tag: 'B1', title: 'The greenhouse watering system is blocked', detail: 'The plants are not getting water.', causeIds: [] })
    s = ask(s, 'B1', ['now', 'later'])
  }
  const food = s.food
  if (food.irrigation === 'fault' && food.repairStartsAt !== null && now >= food.repairStartsAt && !crewSheltered(s)) s = { ...s, food: { ...food, irrigation: 'repairing', repairDoneAt: now + SCHEDULE.b1RepairMin } }
  else if (food.irrigation === 'fault' && food.repairStartsAt !== null && now >= food.repairStartsAt) s = effect(s, 'd3.repairDelay', 'min', { add: STEP, causeIds: decisionId(s, 'D3') })   // crew sheltering from radiation: the repair waits
  if (s.food.irrigation === 'repairing' && s.food.repairDoneAt !== null && now >= s.food.repairDoneAt) {
    s = log({ ...s, food: { ...s.food, irrigation: 'ok' } }, { kind: 'consequence', tag: 'B1', title: 'The watering system is fixed', detail: `In total the plants went without water for ${Math.round(s.food.waterStressMin / 60)} hours.`, causeIds: decisionId(s, 'B1') }, true)
  }
  // D2: resupply announced a day ahead so the player can prepare.
  // D2: announced a day ahead (prepare), the lander descends, then the player chooses who brings the cargo in.
  if (now >= SCHEDULE.d2AnnounceAt && s.stage === 'free' && !eventBusy(s) && (f = fire(s, 'D2'))) {
    s = log({ ...f, supply: { ...f.supply, stage: 'announced' } }, { kind: 'event', tag: 'D2', title: 'A supply lander arrives in about 24 hours', detail: 'It will land on a temporary pad outside the base. Food and water only count once they are brought in.', causeIds: [] }, true)
  }
  if (s.supply.stage === 'announced' && now >= SCHEDULE.d2ArriveAt && !eventBusy(s) && (f = fire(s, 'D2-arrive'))) {
    s = log({ ...f, supply: { ...f.supply, stage: 'landing', landingEndsAt: now + SCHEDULE.d2LandingMin } }, { kind: 'event', tag: 'D2', title: 'The supply lander is landing', detail: 'Braking engines slow its fall (the Moon has no air for parachutes). The pad is to the east, behind the buildings as seen from the solar array, so this time the array does not need to be folded.', causeIds: [] })
  }
  if (s.supply.stage === 'landing' && s.supply.landingEndsAt !== null && now >= s.supply.landingEndsAt) {
    s = log({ ...s, supply: { ...s.supply, stage: 'waiting' } }, { kind: 'event', tag: 'D2', title: 'The supply lander has landed safely', causeIds: [] })
    s = ask(s, 'D2', ['rover', 'crew'], { roverAway: roverAway(s.ice), roverBattery: Math.round(s.ice.roverBattery), tripKwh: Math.round(supplyTripKwh()) })
  }
  s = supplyStep(s)
  // D1: light drops; optional loads must be prioritised if power cannot cover both.
  if (now >= SCHEDULE.d1At && s.stage === 'free' && !eventBusy(s) && (f = fire(s, 'D1'))) {
    s = { ...f, power: { ...f.power, lightFactor: SCHEDULE.d1LightFactor } }
    s = log(s, { kind: 'event', tag: 'D1', title: 'Sunlight drops for 30 hours', detail: 'The Sun sinks low behind the mountains (a made-up situation for the game).', causeIds: [] })
    const prod = POWER.arrayKw * s.power.capacityFactor * SCHEDULE.d1LightFactor
    const essential = POWER.essentialKw + (s.a2Enabled ? POWER.electrolysisKw : 0) + LIFE.recyclerLph * POWER.recyclerKwhPerL
    const hours = SCHEDULE.d1Min / 60
    const spare = s.resources.battery - POWER.reserveKwh + (prod - essential) * hours
    const demand = (s.food.stage === 'growing' ? POWER.greenhouseKw : 0) * hours + (s.ice.stage !== 'done' ? POWER.roverChargeKw * 6 : 0)
    // The same check with a 100 % array: how much of any shortfall is due to the A3 loss?
    const prodFull = POWER.arrayKw * SCHEDULE.d1LightFactor
    const spareFull = s.resources.battery - POWER.reserveKwh + (prodFull - essential) * hours
    s = effect(s, 'd1.check', 'kWh', { set: +Math.max(0, demand - Math.max(0, spare)).toFixed(1), causeIds: s.power.capacityFactor < 1 ? decisionId(s, 'A3') : [], facts: { spareKwh: +spare.toFixed(1), demandKwh: +demand.toFixed(1), deficitIfFullArrayKwh: +Math.max(0, demand - Math.max(0, spareFull)).toFixed(1), capacityPercent: Math.round(s.power.capacityFactor * 100), productionKw: +prod.toFixed(1), batteryKwh: +s.resources.battery.toFixed(1) } })
    if (demand > 0 && spare < demand) s = ask(s, 'D1',   // (nothing optional left to prioritise: no question)
      ['greenhouse', 'rover'], { productionKw: +prod.toFixed(1), lost: s.power.capacityFactor < 1, spareKwh: Math.round(spare), demandKwh: Math.round(demand), batteryKwh: Math.round(s.resources.battery) })
    else s = log(s, { kind: 'consequence', tag: 'D1', title: 'Less light, but still enough power for the greenhouse and the rover', detail: `The array still makes ${prod.toFixed(1)} kW; the ${Math.round(s.resources.battery)} kWh battery covers the gap for 30 hours.`, causeIds: decisionId(s, 'A3') }, true)
  }
  if (s.power.lightFactor < 1 && now >= SCHEDULE.d1At + SCHEDULE.d1Min && (f = fire(s, 'D1-end'))) s = log({ ...f, power: { ...f.power, lightFactor: 1 } }, { kind: 'event', tag: 'D1', title: 'Sunlight is back to normal', causeIds: [] })
  // D3: solar particle event. Crew must shelter; the rover decides only if it is measuring.
  if (now >= SCHEDULE.d3At && s.stage === 'free' && !eventBusy(s) && (f = fire(s, 'D3'))) {
    s = { ...f, radiation: { active: true, endsAt: now + SCHEDULE.d3Min, roverChoice: null } }
    s = log(s, { kind: 'event', tag: 'D3', title: 'Solar radiation storm: the crew takes shelter', detail: 'A real type of event (recorded in NASA DONKI); its timing in the game is an assumption. Outdoor work stops for 8 hours.', causeIds: [] })
    if (s.ice.stage === 'surveying') s = ask(s, 'D3', ['wait', 'return'])
    else s = { ...s, inbox: [...s.inbox, s.log[s.log.length - 1].id], isPaused: s.mode === 'basic' ? true : s.isPaused }
  }
  if (s.radiation.active && s.radiation.endsAt !== null && now >= s.radiation.endsAt) {
    s = log({ ...s, radiation: { ...s.radiation, active: false } }, { kind: 'event', tag: 'D3', title: 'The storm is over, the crew goes back to work outside', causeIds: [] }, true)
  }
  // Packaged food decides the mission length: warn a day before the reserve, then end.
  const daysLeft = (s.resources.food - LIFE.foodReserveCrewDays) / CREW
  if (s.stage === 'free' && !s.foodWarned && daysLeft <= 1) s = log({ ...s, foodWarned: true }, { kind: 'event', tag: 'END', title: 'Food is nearly down to its reserve', detail: 'Tomorrow the mission must end and the crew returns to Earth.', causeIds: [] }, true)
  if (s.phase === 'playing' && s.resources.food <= LIFE.foodReserveCrewDays + 1e-6) s = log({ ...s, phase: 'returning', ending: { reason: 'food', atMinute: now }, isPaused: true, decisions: [], inbox: [] }, { kind: 'stage', tag: 'END', title: 'Food reserve reached: returning to Earth', causeIds: [] })
  return s
}

function supplyStep(state: GameState): GameState {
  let s = state
  const now = s.clock.elapsedMinutes, sup = s.supply
  // The rover still has to switch back after the cargo is delivered (stage 'delivered', roverPhase 'unconfig').
  if (sup.stage !== 'pickup' && sup.roverPhase !== 'unconfig') return s
  if (sup.method === 'crew') {
    if (crewSheltered(s) && sup.jobDoneAt !== null) return { ...s, supply: { ...sup, jobDoneAt: sup.jobDoneAt + STEP } }   // EVA waits out the radiation
    if (sup.jobDoneAt !== null && now >= sup.jobDoneAt) return deliver(s)
    return s
  }
  if (sup.roverPhase === 'config' && sup.jobDoneAt !== null && now >= sup.jobDoneAt) s = { ...s, supply: { ...sup, roverPhase: 'trip', phaseStartedAt: now, jobDoneAt: now + 2 * SCHEDULE.d2PadKm / ROVER.speedKmh * 60 + 60 } }
  else if (sup.roverPhase === 'trip' && sup.jobDoneAt !== null && now >= sup.jobDoneAt) {
    s = { ...s, ice: { ...s.ice, roverBattery: Math.max(0, s.ice.roverBattery - supplyTripKwh()) } }
    s = deliver(s)
    s = { ...s, supply: { ...s.supply, roverPhase: 'unconfig', jobDoneAt: now + SCHEDULE.d2RoverConfigMin } }
  } else if (sup.roverPhase === 'unconfig' && sup.jobDoneAt !== null && now >= sup.jobDoneAt) {
    const resume: IceState['stage'] = s.ice.stage === 'cargo' ? (s.ice.route ? 'charging' : 'idle') : s.ice.stage
    s = log({ ...s, supply: { ...s.supply, roverPhase: 'none' }, ice: { ...s.ice, stage: resume, distanceM: 0 } }, { kind: 'consequence', tag: 'D2', title: 'MILO is back in survey mode', detail: s.ice.route ? 'The rover recharges, then continues the survey you chose.' : '', causeIds: decisionId(s, 'D2') })
  }
  return s
}

function deliver(state: GameState): GameState {
  const before = state.resources
  const after = clampResources({ ...before, food: before.food + SUPPLY.food, water: before.water + SUPPLY.water })
  // Delivered exactly once: the supply leaves 'pickup' here, so no later step can add the cargo again.
  return log({ ...state, resources: after, supply: { ...state.supply, stage: 'delivered', jobDoneAt: null } }, { kind: 'consequence', tag: 'D2', title: 'The supplies are in the store', detail: `+${SUPPLY.food / CREW} days of food for the crew and +${SUPPLY.water} litres of water, added the moment the cargo reached the base.`, deltas: resourceDelta(before, after), causeIds: decisionId(state, 'D2') }, true)
}

// ── decisions ───────────────────────────────────────────────────────────────
function record(state: GameState, decision: Decision, choice: string, deltas: ResourceDelta = {}): GameState {
  const rec: DecisionRecord = { id: `dec-${decision.key}-${state.nextId}`, key: decision.key, choice, rejected: decision.options.filter((o) => o !== choice), atMinute: state.clock.elapsedMinutes, deltas, causeIds: [], effectIds: [], before: { battery: Math.round(state.resources.battery), water: Math.round(state.resources.water), oxygen: Math.round(state.resources.oxygen), capacityPercent: Math.round(state.power.capacityFactor * 100), roverBatteryKwh: Math.round(state.ice.roverBattery), lampOn: state.power.greenhouseOn } }
  return { ...state, nextId: state.nextId + 1, history: [...state.history, rec], decisions: state.decisions.filter((d) => d.id !== decision.id) }
}

function decide(state: GameState, action: Extract<GameAction, { type: 'decide' }>): GameState {
  const d = state.decisions.find((x) => x.id === action.decisionId)
  if (!d || !d.options.includes(action.choice)) return state
  const now = state.clock.elapsedMinutes
  let s = state
  switch (d.key) {
    case 'A1': {
      const before = s.resources, r = { ...before }
      if (action.choice === 'recycle') { const L = Math.min(A1.extraRecycleL, r.wastewater, CAPACITY.water - r.water); r.wastewater -= L; r.water += L * LIFE.recovery }
      else r.battery = Math.min(CAPACITY.battery, r.battery + A1.surplusKwh * A1.chargeEfficiency)
      const after = clampResources(r)
      s = record({ ...s, resources: after, a1Choice: action.choice }, d, action.choice, resourceDelta(before, after))
      s = log(s, { kind: 'decision', tag: 'A1', title: action.choice === 'recycle' ? 'Used the extra power to recycle water' : 'Used the extra power to charge the battery', deltas: resourceDelta(before, after), causeIds: decisionId(s, 'A1') })
      return log({ ...s, stage: 'A2' }, { kind: 'stage', tag: 'A2', title: 'Stage A2: water + power → oxygen', detail: 'Turn on the electrolyser at the life support station.', causeIds: [] })
    }
    case 'A3': {
      const hazardEnd = now + SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin
      s = record({ ...s, a3Choice: action.choice as 'keep' | 'stow', a3HazardEndsAt: hazardEnd, power: { ...s.power, stowedUntil: action.choice === 'stow' ? hazardEnd + SCHEDULE.a3RedeployMin : null } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'A3', title: action.choice === 'keep' ? 'Kept the array open' : 'Folded the array away', detail: action.choice === 'keep' ? 'Still making power, but it may get damaged.' : `No solar power for about ${Math.round((SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin + SCHEDULE.a3RedeployMin) / 60)} hours.`, causeIds: decisionId(s, 'A3') })
    }
    case 'B1': {
      const startsAt = action.choice === 'now' ? now : now + SCHEDULE.b1DelayMin
      s = record({ ...s, food: { ...s.food, repairStartsAt: startsAt } }, d, action.choice)
      s = effect(s, 'b1.plan', 'min', { set: startsAt - now, causeIds: decisionId(s, 'B1'), facts: { choice: action.choice } })
      return log(s, { kind: 'decision', tag: 'B1', title: action.choice === 'now' ? 'Sent an astronaut to fix it now' : 'Left the repair until after the shift', detail: action.choice === 'now' ? `Takes about ${SCHEDULE.b1RepairMin / 60} hours.` : `The plants go without water for about ${Math.round((SCHEDULE.b1DelayMin + SCHEDULE.b1RepairMin) / 60)} more hours.`, causeIds: decisionId(s, 'B1') })
    }
    case 'C1': {
      s = record({ ...s, ice: { ...s.ice, zone: action.choice as IceState['zone'], stage: 'route' } }, d, action.choice)
      s = log(s, { kind: 'decision', tag: 'C1', title: `Chose research zone ${action.choice}`, causeIds: decisionId(s, 'C1') })
      return ask(s, 'C2', ['go', 'back'], { zone: action.choice })
    }
    case 'C2': {
      if (action.choice === 'back') return record({ ...s, ice: { ...s.ice, stage: 'idle', zone: null } }, d, 'back')
      const route = action.route
      if (!route || route.zone !== s.ice.zone || !(route.lengthM > 0) || roverEnergyNeed(route.lengthM) > ROVER.batteryKwh) return state   // only real, feasible routes
      s = record({ ...s, ice: { ...s.ice, route, stage: 'charging', distanceM: 0, chargeStartedAt: now } }, d, 'go')
      s = effect(s, 'c2.route', 'm', { set: route.lengthM, causeIds: [...decisionId(s, 'C1'), ...decisionId(s, 'C2')], facts: { zone: route.zone, needKwh: +roverEnergyNeed(route.lengthM).toFixed(1), driveHours: +(2 * route.lengthM / 1000 / ROVER.speedKmh).toFixed(1), inPsr: route.inPsr } })
      return log(s, { kind: 'decision', tag: 'C2', title: `Chose the A* route to Zone ${route.zone}`, detail: `${(route.lengthM / 1000).toFixed(1)} km one way, needs about ${Math.round(roverEnergyNeed(route.lengthM))} kWh of rover battery.`, causeIds: decisionId(s, 'C2') })
    }
    case 'C31': {
      if (action.choice === 'detour' && !(action.detourM && action.detourM > 0)) return state   // detour only if it was checked on the DEM
      const ice = { ...s.ice, anomalyDone: true }
      if (action.choice === 'slow') { ice.slow = true; ice.stage = 'outbound' }
      else if (action.choice === 'detour') { ice.detourM = action.detourM ?? 0; ice.stage = 'outbound' }
      else ice.stage = 'returning'
      s = record({ ...s, ice }, d, action.choice)
      if (action.choice === 'detour') s = effect(s, 'c31.detour', 'm', { set: ice.detourM, causeIds: decisionId(s, 'C31'), facts: { extraMinutes: +(2 * ice.detourM / (ROVER.speedKmh * 1000 / 60)).toFixed(1), extraKwh: +(2 * ice.detourM / 1000 * ROVER.kwhPerKm).toFixed(2) } })
      if (action.choice === 'return') s = effect(s, 'c31.return', 'times', { set: 1, causeIds: decisionId(s, 'C31'), facts: { validNeutronSoFar: ice.samples.filter((x) => x.instrument === 'neutron' && x.valid).length } })
      return log(s, { kind: 'decision', tag: 'C3.1', title: action.choice === 'slow' ? 'Drove slowly through the rubble on the checked route' : action.choice === 'detour' ? `Detoured ${Math.round(ice.detourM)} m (slope checked on the DEM)` : 'Returned to base', causeIds: decisionId(s, 'C31') })
    }
    case 'D1': {
      s = record({ ...s, power: { ...s.power, d1Priority: action.choice as 'greenhouse' | 'rover' } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'D1', title: action.choice === 'greenhouse' ? 'Greenhouse lights first' : 'Rover charging first', detail: 'Essential power is always protected first.', causeIds: [...decisionId(s, 'D1'), ...decisionId(s, 'A3')] })
    }
    case 'D2': {
      if (action.choice === 'rover' && !roverAway(s.ice) && s.ice.roverBattery < supplyTripKwh()) return state   // not enough charge for the trip
      const method = action.choice as 'rover' | 'crew'
      s = record({ ...s, supply: { ...s.supply, method } }, d, action.choice)
      if (method === 'crew') s = { ...s, supply: { ...s.supply, stage: 'pickup', phaseStartedAt: now, jobDoneAt: now + SCHEDULE.d2CrewPickupMin } }
      else if (roverAway(s.ice)) s = { ...s, supply: { ...s.supply, stage: 'pickup', roverPhase: 'toBase' }, ice: { ...s.ice, stage: 'recalled' } }
      else s = { ...s, supply: { ...s.supply, stage: 'pickup', roverPhase: 'config', jobDoneAt: now + SCHEDULE.d2RoverConfigMin }, ice: { ...s.ice, stage: s.ice.stage === 'done' ? 'done' : 'cargo' } }
      const away = method === 'rover' && s.ice.stage === 'recalled'
      if (away) s = effect(s, 'd2.recall', 'times', { set: 1, causeIds: decisionId(s, 'D2'), facts: { surveyedMin: Math.round(state.ice.surveyMin), distanceM: Math.round(state.ice.distanceM) } })
      return log(s, { kind: 'decision', tag: 'D2', title: method === 'rover' ? 'MILO the rover carries the cargo' : 'Two astronauts fetch the cargo with a cart', detail: method === 'crew' ? `A walk outside the base of about ${SCHEDULE.d2CrewPickupMin / 60} hours; the crew uses extra oxygen meanwhile.` : away ? 'MILO is surveying, so it must come back and be refitted before fetching the cargo. The ice survey is interrupted.' : `MILO is refitted for cargo (${SCHEDULE.d2RoverConfigMin / 60} hours), fetches the supplies and returns; about ${Math.round(supplyTripKwh())} kWh of rover battery.`, causeIds: decisionId(s, 'D2') })
    }
    case 'D3': {
      const ice = { ...s.ice }
      if (action.choice === 'wait') { ice.waitingRadiation = true; ice.surveyTargetMin = Math.min(ice.surveyMin + (s.radiation.endsAt ?? now) - now + 60 * 2, ice.surveyTargetMin + ROVER.remeasureMaxHours * 60 + SCHEDULE.d3Min) }
      else { ice.stage = 'returning' }
      s = record({ ...s, ice, radiation: { ...s.radiation, roverChoice: action.choice as 'wait' | 'return' } }, d, action.choice)
      if (action.choice === 'wait') s = effect(s, 'd3.extraSurvey', 'min', { set: ice.surveyTargetMin - ROVER.surveyHours * 60, causeIds: decisionId(s, 'D3') })
      else s = effect(s, 'd3.earlyReturn', 'samples', { set: ice.samples.filter((x) => x.instrument === 'neutron' && x.valid).length, causeIds: decisionId(s, 'D3') })
      return log(s, { kind: 'decision', tag: 'D3', title: action.choice === 'wait' ? 'MILO waits for the storm to pass and measures again' : 'MILO ends the survey and heads home', causeIds: decisionId(s, 'D3') })
    }
  }
  return s
}

// ── reducer ─────────────────────────────────────────────────────────────────
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'game/start': {
      if (state.phase !== 'opening') return state
      const s = log({ ...state, phase: 'playing', mode: action.mode, isPaused: action.mode === 'basic' }, { kind: 'stage', tag: 'A1', title: 'Stage A1: extra power and water recycling', detail: action.mode === 'basic' ? 'Basic mode: Commander Luna guides you, and time pauses whenever a decision is needed.' : 'Advanced mode: time does not pause on its own.', causeIds: [] })
      return ask(s, 'A1', ['recycle', 'battery'])
    }
    case 'clock/setPaused':
      if (!action.paused && basicBlocked(state)) return state.isPaused ? state : { ...state, isPaused: true }   // Basic: confirm first
      return state.isPaused === action.paused || state.phase !== 'playing' ? state : { ...state, isPaused: action.paused }
    case 'notice/ack': {
      if (!state.inbox.length) return state
      const target = action.id ?? state.inbox[0]
      const inbox = state.inbox.filter((x) => x !== target)
      if (inbox.length === state.inbox.length) return state
      // Basic: time resumes only when the player has confirmed everything that was waiting.
      const resume = state.mode === 'basic' && state.phase === 'playing' && !inbox.length && !state.decisions.length
      return { ...state, inbox, isPaused: resume ? false : state.isPaused }
    }
    case 'clock/tick': {
      if (state.isPaused || state.phase !== 'playing' || !(action.minutes > 0)) return state
      // Basic mode never runs the clock with a decision or an unread result open (Advanced does).
      if (basicBlocked(state)) return state.isPaused ? state : { ...state, isPaused: true }
      let s = state, left = action.minutes
      while (left > 1e-9 && s.phase === 'playing') {
        const step = Math.min(STEP, left)
        s = simulate(s, step)
        s = { ...s, clock: { elapsedMinutes: s.clock.elapsedMinutes + step } }
        s = events(s)
        left -= step
        if (s.isPaused || basicBlocked(s)) break
      }
      return s
    }
    case 'decide': {
      const next = decide(state, action)
      if (next === state) return state
      // Result review: the decision's own log entry is shown to the player and must be confirmed.
      const entry = next.log.slice(state.log.length).find((e) => e.kind === 'decision')
      const reviewed = entry ? { ...next, inbox: [...next.inbox, entry.id] } : next
      return { ...reviewed, isPaused: reviewed.mode === 'basic' ? true : reviewed.isPaused }
    }
    case 'a2/activate': {
      if (state.stage !== 'A2' || state.a2Enabled) return state
      const s = log({ ...state, a2Enabled: true, stage: 'A3' }, { kind: 'stage', tag: 'A2', title: 'The electrolyser is on', detail: 'From now on it makes oxygen from water and power whenever oxygen drops below 90 %.', causeIds: [] }, true)
      return log(s, { kind: 'event', tag: 'A3', title: 'Let time run and keep an eye on the base', detail: 'The base’s space-watch system will warn you right away if anything threatens the solar array. Then you will be asked what to do.', causeIds: [] }, true)
    }
    case 'food/repairNow': {
      // "Sửa sau" can still be changed: the crew starts now. Hours already without water stay counted.
      const f = state.food, now = state.clock.elapsedMinutes
      if (f.irrigation !== 'fault' || f.repairStartsAt === null || f.repairStartsAt <= now || crewSheltered(state) || state.phase !== 'playing') return state
      return log(effect({ ...state, food: { ...f, repairStartsAt: now } }, 'b1.plan', 'min', { set: 0, causeIds: decisionId(state, 'B1'), facts: { changedLater: true } }), { kind: 'consequence', tag: 'B1', title: 'Change of plan: fixing the watering system now', detail: `An astronaut stops their work to fix it (about ${SCHEDULE.b1RepairMin / 60} hours). The ${Math.round(f.waterStressMin / 60)} hours the plants already went without water cannot be undone.`, causeIds: decisionId(state, 'B1') }, true)
    }
    case 'clock/skip': {
      // Fast-forward through pure waiting: stops at the first new decision or result, never answers for the player.
      if (state.phase !== 'playing' || state.decisions.length || state.inbox.length) return state
      let s = { ...state, isPaused: false }, left = Math.max(0, action.maxMinutes)
      while (left > 0 && s.phase === 'playing' && !s.decisions.length && !s.inbox.length) { s = gameReducer(s, { type: 'clock/tick', minutes: STEP }); left -= STEP }
      return s
    }
    case 'food/begin': {
      if (state.stage !== 'free' || state.food.started || state.phase !== 'playing') return state
      return log({ ...state, food: { ...state.food, started: true, startedAt: state.clock.elapsedMinutes } }, { kind: 'stage', tag: 'B', title: 'Food research begins', detail: `The greenhouse plants were planted earlier and have grown ${Math.round(state.food.growth * 100)} %.`, causeIds: [] })
    }
    case 'food/observe': {
      if (state.food.stage !== 'growing' || state.stage !== 'free' || crewSheltered(state) || !foodOpen(state)) return state
      const f = state.food, now = state.clock.elapsedMinutes
      const obs = { atMinute: now, day: dayOf(now), irrigationOk: f.irrigation === 'ok', lightPercent: state.power.greenhouseOn ? 100 : 0, growthPercent: Math.round(f.growth * 100), heightCm: +(4 + f.growth * 18 - Math.min(5, f.waterStressMin / 120)).toFixed(1) }
      return log({ ...state, food: { ...f, observations: [...f.observations, obs] } }, { kind: 'research', tag: 'B3', title: 'Observed the greenhouse plants', detail: `Sensor log: height ${obs.heightCm} cm, watering ${obs.irrigationOk ? 'normal' : 'broken'}, lights ${obs.lightPercent ? 'on' : 'off'}.`, causeIds: [] })
    }
    case 'food/harvest': {
      const f = state.food
      if (f.stage !== 'growing' || f.growth < FOOD.readyIndex || crewSheltered(state) || !foodOpen(state)) return state
      const stress = Math.min(0.6, f.waterStressMin / 60 * FOOD.stressPerHour)
      const grams = Math.round(FOOD.expectedGrams * f.growth * (1 - stress))
      const lostWater = effectAmount(state, 'growth.lostWater')
      const lampG = (phase: string) => Math.round(FOOD.expectedGrams * effectAmount(state, `growth.lostLamp.${phase}`) * (1 - stress))
      const harvested = effect({ ...state, food: { ...f, stage: 'harvested', harvestGrams: grams } }, 'b4.harvest', 'g', { set: grams, causeIds: [...decisionId(state, 'B1'), ...decisionId(state, 'D1')], facts: {
        expectedGrams: FOOD.expectedGrams, growthPercent: Math.round(f.growth * 100), stressPercent: Math.round(stress * 100),
        gramsLostToWaterStress: Math.round(FOOD.expectedGrams * f.growth * stress), gramsLostToSlowerGrowthWater: Math.round(FOOD.expectedGrams * lostWater * (1 - stress)), gramsLampD1: lampG('d1'), gramsLampA3: lampG('a3'), gramsLampOther: lampG('other'),
      } })
      return log(harvested, { kind: 'research', tag: 'B4', title: `Harvested and weighed the sample: ${grams} g`, detail: `A healthy plant is about ${FOOD.expectedGrams} g. These plants went ${Math.round(f.waterStressMin / 60)} hours without water and ${Math.round(f.lightDeficitMin / 60)} hours without light.`, causeIds: [...decisionId(state, 'B1'), ...decisionId(state, 'D1')] }, true)
    }
    case 'food/report': {
      const f = state.food
      if (f.stage !== 'harvested' || f.harvestGrams === null) return state
      const days = new Set(f.observations.map((o) => o.day)).size
      const reasons: string[] = []
      if (f.waterStressMin) reasons.push(`The plants went ${Math.round(f.waterStressMin / 60)} hours without water because the watering system broke (B1).`)
      if (f.lightDeficitMin) reasons.push(`The greenhouse lights were off for ${Math.round(f.lightDeficitMin / 60)} hours because of a power shortage (B2${state.power.d1Priority ? ', D1' : ''}${state.power.capacityFactor < 1 ? ', effect of A3' : ''}).`)
      reasons.push(days >= FOOD.minObservationDays ? `Observations on ${days} different days make the data more reliable.` : `Observations on only ${days} day(s) make it hard to know how the plants changed.`)
      const reliability = days >= 3 ? 'high' : days >= FOOD.minObservationDays ? 'medium' : 'low'
      return log({ ...state, food: { ...f, stage: 'reported', report: { grams: f.harvestGrams, expected: FOOD.expectedGrams, growthPercent: Math.round(f.growth * 100), reliability, reasons } } }, { kind: 'research', tag: 'B4', title: 'Food report complete', detail: `${f.harvestGrams} g of an expected ${FOOD.expectedGrams} g; data reliability: ${reliability}.`, causeIds: decisionId(state, 'B1') }, true)
    }
    case 'ice/start': {
      const ice = state.ice
      if (state.stage !== 'free' || state.supply.roverPhase !== 'none' || state.decisions.length || state.supply.stage === 'pickup') return state
      if (state.mode === 'basic' && !b1Resolved(state)) return state   // Basic guides one branch at a time: B1 first, then C
      if (ice.stage === 'idle') return ask({ ...state, ice: { ...ice, stage: 'site' } }, 'C1', ['A', 'B', 'C', 'D'])
      return state
    }
    case 'mission/submit':
      if (state.phase !== 'playing' || state.stage !== 'free') return state
      return log({ ...state, phase: 'returning', ending: { reason: 'submitted', atMinute: state.clock.elapsedMinutes }, isPaused: true, decisions: [], inbox: [] }, { kind: 'stage', tag: 'END', title: 'Reports submitted: the crew returns to Earth', causeIds: [] })
    case 'mission/finishReturn':
      return state.phase === 'returning' ? { ...state, phase: 'ended' } : state
    case 'game/restart': return createInitialState()
    case 'game/load': return action.state
  }
}
