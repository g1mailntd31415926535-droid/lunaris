// Pure game-state types. No React, no Three.js (Node tests import them). Erasable TS only.
import type { Stock } from './scenario.ts'

export type ResourceKey = keyof Stock
export type ResourceState = Stock
export type ResourceDelta = Partial<Record<ResourceKey, number>>
export type PlayMode = 'basic' | 'advanced'
export type GamePhase = 'opening' | 'playing' | 'returning' | 'ended'
export type TutorialStage = 'A1' | 'A2' | 'A3' | 'free'
export type Zone = 'A' | 'B' | 'C' | 'D'

/** Facts about a real A* route (public/lunar/task02/routes.json), passed in by the UI when the player chooses it. */
export interface RouteFacts { zone: Zone; name: string; lengthM: number; maxSlopeDeg: number; meanSlopeDeg: number; nearLimitPercent: number; uncertainPercent: number; inPsr: boolean; heightM: number; slopeDeg: number }

export type DecisionKey = 'A1' | 'A3' | 'B1' | 'C1' | 'C2' | 'C31' | 'D1' | 'D2' | 'D3'
export interface Decision { id: string; key: DecisionKey; atMinute: number; options: string[]; context: Record<string, number | string | boolean> }

/** The state of the base right before a decision (so the ending can say what the player was facing). */
export interface DecisionBefore { battery: number; water: number; oxygen: number; capacityPercent: number; roverBatteryKwh: number; lampOn: boolean }
export interface DecisionRecord { id: string; key: DecisionKey; choice: string; rejected: string[]; atMinute: number; deltas: ResourceDelta; causeIds: string[]; effectIds: string[]; before: DecisionBefore }
/**
 * A real change measured by the simulation (keyed: one record per effect, updated in place, so pausing, resuming or
 * re-rendering can never duplicate it). `causeIds` are the DecisionRecord ids that contributed. The ending is built
 * only from these records.
 */
export interface EffectRecord { key: string; unit: string; atMinute: number; lastMinute: number; amount: number; causeIds: string[]; facts: Record<string, number | string | boolean> }

export type EventLogKind = 'system' | 'decision' | 'stage' | 'event' | 'consequence' | 'research'
export interface EventLogEntry { id: string; atMinute: number; kind: EventLogKind; title: string; detail?: string; deltas?: ResourceDelta; causeIds: string[]; tag?: string; /** resources right after this entry (only when it has deltas) */ after?: ResourceState }

export interface PowerState {
  capacityFactor: number            // 1, or 0.9 after the A3 damage (permanent; no repair exists)
  stowedUntil: number | null
  lightFactor: number
  productionKw: number
  loadKw: number
  greenhouseOn: boolean
  roverChargingOn: boolean
  electrolysisOn: boolean
  d1Priority: 'greenhouse' | 'rover' | null
}

export interface Observation { atMinute: number; day: number; irrigationOk: boolean; lightPercent: number; growthPercent: number; heightCm: number }
export interface FoodState {
  started: boolean                  // the player began the research after the briefing (B1 is gated on it)
  startedAt: number | null
  stage: 'growing' | 'harvested' | 'reported'
  irrigation: 'ok' | 'fault' | 'repairing'
  repairStartsAt: number | null
  repairDoneAt: number | null
  waterStressMin: number
  lightDeficitMin: number           // minutes with grow lamps unpowered
  growth: number                    // 0..1
  observations: Observation[]
  lightLog: { atMinute: number; on: boolean; reason: string }[]
  harvestGrams: number | null
  report: { grams: number; expected: number; growthPercent: number; reliability: 'cao' | 'trung bình' | 'thấp'; reasons: string[] } | null
}

export interface Sample { atMinute: number; instrument: 'neutron' | 'nir' | 'thermal'; value: number; valid: boolean; flag?: string }
export type IceStage = 'locked' | 'idle' | 'site' | 'route' | 'charging' | 'outbound' | 'anomaly' | 'surveying' | 'returning' | 'recalled' | 'cargo' | 'done'
export interface IceState {
  stage: IceStage
  zone: Zone | null
  route: RouteFacts | null
  distanceM: number                 // along the outbound leg (0 = depot)
  slow: boolean
  detourM: number
  anomalyDone: boolean
  surveyMin: number
  surveyTargetMin: number
  samples: Sample[]
  roverBattery: number
  waitingRadiation: boolean
  report: { validNeutron: number; invalidNeutron: number; meanIndex: number; confidence: 'cao' | 'trung bình' | 'thấp'; reasons: string[] } | null
  chargeStartedAt: number | null    // when MILO began charging for the chosen route (departure wait is measured from here)
}

export interface SupplyState {
  stage: 'none' | 'announced' | 'landing' | 'waiting' | 'pickup' | 'delivered'
  method: 'rover' | 'crew' | null
  jobDoneAt: number | null
  roverPhase: 'none' | 'toBase' | 'config' | 'trip' | 'unconfig'
  landingEndsAt: number | null
  /** Start of the current carrying job (crew EVA or rover trip), so the 3D world can show real progress. */
  phaseStartedAt: number | null
}
export interface RadiationState { active: boolean; endsAt: number | null; roverChoice: 'wait' | 'return' | null }

export interface GameState {
  version: number
  phase: GamePhase
  mode: PlayMode | null
  stage: TutorialStage
  clock: { elapsedMinutes: number }
  isPaused: boolean
  resources: ResourceState
  power: PowerState
  a1Choice: string | null
  a2Enabled: boolean
  a3Choice: 'keep' | 'stow' | null
  a3HazardEndsAt: number | null
  food: FoodState
  ice: IceState
  supply: SupplyState
  radiation: RadiationState
  fired: string[]
  decisions: Decision[]
  history: DecisionRecord[]
  log: EventLogEntry[]
  /** Log entries the player must read and confirm (results, consequences, events). Basic: time waits for them. */
  inbox: string[]
  /** Measured consequences (see EffectRecord). */
  effects: EffectRecord[]
  foodWarned: boolean
  ending: { reason: 'submitted' | 'food'; atMinute: number } | null
  nextId: number
}

export type GameAction =
  | { type: 'game/start'; mode: PlayMode }
  | { type: 'clock/setPaused'; paused: boolean }
  | { type: 'clock/tick'; minutes: number }
  | { type: 'decide'; decisionId: string; choice: string; route?: RouteFacts; detourM?: number }
  | { type: 'a2/activate' }
  | { type: 'notice/ack'; id?: string }
  | { type: 'food/begin' }
  | { type: 'food/repairNow' }
  | { type: 'clock/skip'; maxMinutes: number }
  | { type: 'food/observe' }
  | { type: 'food/harvest' }
  | { type: 'food/report' }
  | { type: 'ice/start' }
  | { type: 'mission/submit' }
  | { type: 'mission/finishReturn' }
  | { type: 'game/restart' }
  | { type: 'game/load'; state: GameState }
