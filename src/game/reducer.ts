import type { A1ChoiceId, DecisionRecord, EventLogEntry, GameAction, GameState, ResourceDelta, ResourceKey, ResourceState } from './types.ts'
import { A1_OPTIONS, A1_SURPLUS_POWER, CAPACITY, CHARGING_EFFICIENCY, HOURLY, INITIAL_RESOURCES, MISSION_START, RECYCLER_RECOVERY, SAVE_SCHEMA_VERSION } from './balance.ts'

const KEYS: ResourceKey[] = ['electricity', 'water', 'oxygen', 'wastewater']

/** Keeps every resource inside [0, capacity]. Also turns NaN into 0. */
export function clampResources(r: ResourceState): ResourceState {
  const out = { ...r }
  for (const key of KEYS) {
    const value = Number.isFinite(out[key]) ? out[key] : 0
    out[key] = Math.min(CAPACITY[key], Math.max(0, value))
  }
  return out
}

export function resourceDelta(before: ResourceState, after: ResourceState): ResourceDelta {
  const delta: ResourceDelta = {}
  for (const key of KEYS) {
    const d = Math.round((after[key] - before[key]) * 100) / 100
    if (d !== 0) delta[key] = d
  }
  return delta
}

export function createInitialState(): GameState {
  return {
    version: SAVE_SCHEMA_VERSION,
    mode: 'story',
    stage: 'A1',
    clock: { elapsedMinutes: 0 },
    // The A1 briefing is shown first, so mission time starts paused.
    isPaused: true,
    resources: { ...INITIAL_RESOURCES },
    surplusPower: A1_SURPLUS_POWER,
    a1: { phase: 'briefing', choiceId: null },
    history: [],
    log: [{ id: 'evt-1', atMinute: 0, kind: 'system', title: 'Chào mừng tới Artemis!', detail: 'Mọi hệ thống thiết yếu đang an toàn.', causeIds: [] }],
    pendingEvents: [],
    nextId: 2,
  }
}

/** Mission clock → "SOL 004 · 08:24" style parts. Display only. */
export function missionTime(state: GameState) {
  const total = MISSION_START.minuteOfDay + Math.floor(state.clock.elapsedMinutes)
  const sol = MISSION_START.sol + Math.floor(total / (24 * 60))
  const minute = total % (24 * 60)
  return { sol, label: `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` }
}

/** Continuous consumption for `minutes` of simulated time (see HOURLY in balance.ts). */
export function applyUsage(resources: ResourceState, minutes: number): ResourceState {
  const hours = minutes / 60
  const waterUsed = Math.min(resources.water, HOURLY.crewWaterUse * hours)
  return clampResources({
    electricity: resources.electricity + (HOURLY.solarSupplyWhileSafe - HOURLY.baseLoad) * hours,
    water: resources.water - waterUsed,
    oxygen: resources.oxygen - HOURLY.crewOxygenUse * hours,
    // Used water is moved, not created: it can only come from the clean-water tank.
    wastewater: resources.wastewater + waterUsed,
  })
}

/** Applies the real A1 outcome. Inputs are limited by what actually exists (no free resources). */
export function applyA1Outcome(resources: ResourceState, surplusPower: number, choiceId: A1ChoiceId): { resources: ResourceState; surplusPower: number } {
  const option = A1_OPTIONS[choiceId]
  const power = Math.min(surplusPower, option.powerUsed)
  if (choiceId === 'recycle-water') {
    const processed = Math.min(option.wastewaterProcessed, resources.wastewater, CAPACITY.water - resources.water)
    return { resources: clampResources({ ...resources, wastewater: resources.wastewater - processed, water: resources.water + processed * RECYCLER_RECOVERY }), surplusPower: surplusPower - power }
  }
  const stored = Math.min(power * CHARGING_EFFICIENCY, CAPACITY.electricity - resources.electricity)
  return { resources: clampResources({ ...resources, electricity: resources.electricity + stored }), surplusPower: surplusPower - power }
}

function log(state: GameState, entry: Omit<EventLogEntry, 'id' | 'atMinute'>): GameState {
  return { ...state, log: [...state.log, { ...entry, id: `evt-${state.nextId}`, atMinute: state.clock.elapsedMinutes }], nextId: state.nextId + 1 }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'tutorial/acknowledge':
      // The explanation is closed; the clock stays paused until the player presses Play.
      if (state.stage !== 'A1' || state.a1.phase !== 'briefing') return state
      return { ...state, a1: { ...state.a1, phase: 'choose' } }

    case 'clock/setPaused':
      return state.isPaused === action.paused ? state : { ...state, isPaused: action.paused }

    case 'clock/tick': {
      if (state.isPaused || !(action.minutes > 0)) return state
      return { ...state, clock: { elapsedMinutes: state.clock.elapsedMinutes + action.minutes }, resources: applyUsage(state.resources, action.minutes) }
    }

    case 'a1/commit': {
      // Exactly one A1 decision per game.
      if (state.stage !== 'A1' || state.a1.phase !== 'choose' || state.a1.choiceId !== null) return state
      // Committing is an active player action, so the work (and mission time) starts.
      return log({ ...state, isPaused: false, a1: { phase: 'executing', choiceId: action.choiceId } }, { kind: 'decision', title: `Đã chọn: ${A1_OPTIONS[action.choiceId].title}`, detail: 'Phi hành gia đang thực hiện.', choiceId: action.choiceId, causeIds: ['a1-surplus-power'] })
    }

    case 'a1/complete': {
      // Only when the in-world work has really finished, and only for the committed choice.
      if (state.stage !== 'A1' || state.a1.phase !== 'executing' || state.a1.choiceId !== action.choiceId) return state
      const outcome = applyA1Outcome(state.resources, state.surplusPower, action.choiceId)
      const deltas = resourceDelta(state.resources, outcome.resources)
      const id = `dec-${state.nextId}`
      const record: DecisionRecord = { id, stage: 'A1', choiceId: action.choiceId, rejectedChoiceIds: (Object.keys(A1_OPTIONS) as A1ChoiceId[]).filter((c) => c !== action.choiceId), atMinute: state.clock.elapsedMinutes, deltas, causeIds: ['a1-surplus-power'], effectEventIds: [] }
      let next: GameState = { ...state, nextId: state.nextId + 1, resources: outcome.resources, surplusPower: outcome.surplusPower, a1: { ...state.a1, phase: 'done' }, history: [...state.history, record] }
      next = log(next, { kind: 'decision', title: `Hoàn thành: ${A1_OPTIONS[action.choiceId].title}`, choiceId: action.choiceId, deltas, causeIds: [id] })
      next = log({ ...next, stage: 'A2' }, { kind: 'stage', title: 'Chặng A2 sẽ được triển khai ở bản sau', detail: 'Nước + điện → oxy.', causeIds: [] })
      return next
    }

    case 'game/restart':
      return createInitialState()

    case 'game/load':
      return action.state
  }
}
