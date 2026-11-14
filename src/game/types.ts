// Pure game-state types. No React, no Three.js. Imported by the reducer, the UI
// and the Node unit tests (Node type stripping: keep to erasable TS syntax only).

export type TutorialStage = 'A1' | 'A2' | 'A3' | 'free'

/** Resources stored in the base. Units are abstract gameplay units, NOT NASA measurements. */
export interface ResourceState {
  /** Điện dự trữ trong pin (gameplay units). Shown as "Điện" in the HUD. */
  electricity: number
  /** Nước sạch dự trữ (gameplay units). */
  water: number
  /** Oxy dự trữ (gameplay units). */
  oxygen: number
  /** Nước đã dùng, chờ tái chế (gameplay units). Recycling can only turn THIS into clean water. */
  wastewater: number
}
export type ResourceKey = keyof ResourceState
export type ResourceDelta = Partial<Record<ResourceKey, number>>

/**
 * Simulation time ≠ render time.
 * - `elapsedMinutes` is mission (simulation) time. It advances only through the
 *   `clock/tick` action and never while `GameState.isPaused` is true.
 * - Render/visual time lives in `src/world/clock.ts` (VisualTime) and drives
 *   animation only. The camera never depends on either clock.
 */
export interface MissionClock {
  elapsedMinutes: number
}

export type A1ChoiceId = 'recycle-water' | 'charge-battery'
export type A1Phase = 'briefing' | 'choose' | 'executing' | 'done'

export interface A1State {
  phase: A1Phase
  /** Set once, when the player confirms. Never changes afterwards in this run. */
  choiceId: A1ChoiceId | null
}

/** A recorded player decision. `causeIds` = why the decision existed; `effectEventIds` = later events it caused (filled only by real events). */
export interface DecisionRecord {
  id: string
  stage: TutorialStage
  choiceId: A1ChoiceId
  rejectedChoiceIds: A1ChoiceId[]
  atMinute: number
  /** Actual applied change, measured as after − before (after clamping). */
  deltas: ResourceDelta
  causeIds: string[]
  effectEventIds: string[]
}

/**
 * A future mission event that can point back to the decisions that caused it.
 * Task 01 defines the shape only; no event is generated yet, so no past choice
 * is ever blamed for anything.
 */
export interface MissionEvent {
  id: string
  atMinute: number
  kind: string
  title: string
  causeIds: string[]
}

export type EventLogKind = 'system' | 'decision' | 'stage'
export interface EventLogEntry {
  id: string
  atMinute: number
  kind: EventLogKind
  title: string
  detail?: string
  choiceId?: A1ChoiceId
  deltas?: ResourceDelta
  causeIds: string[]
}
export type EventLog = EventLogEntry[]

export interface GameState {
  /** Save-schema version. Bump when the shape changes. */
  version: number
  mode: 'story'
  stage: TutorialStage
  clock: MissionClock
  isPaused: boolean
  resources: ResourceState
  /** One-off surplus solar energy available for the A1 decision (gameplay units). */
  surplusPower: number
  a1: A1State
  history: DecisionRecord[]
  log: EventLog
  pendingEvents: MissionEvent[]
  nextId: number
}

export type GameAction =
  | { type: 'tutorial/acknowledge' }
  | { type: 'clock/setPaused'; paused: boolean }
  | { type: 'clock/tick'; minutes: number }
  | { type: 'a1/commit'; choiceId: A1ChoiceId }
  | { type: 'a1/complete'; choiceId: A1ChoiceId }
  | { type: 'game/restart' }
  | { type: 'game/load'; state: GameState }
