import type { A1ChoiceId, ResourceState } from './types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// gameplay_assumption — EVERY number in this file is a tunable balance value
// for a children's game. None of them is NASA data or a real measurement.
// Units are abstract "gameplay units". Replace/justify them only after the
// team's NASA data review (see README › "Gameplay balance").
// ─────────────────────────────────────────────────────────────────────────────

export const SAVE_SCHEMA_VERSION = 1

/** gameplay_assumption: storage capacity per resource. */
export const CAPACITY: ResourceState = { electricity: 100, water: 100, oxygen: 100, wastewater: 60 }

/** gameplay_assumption: starting stock for a new Story Mode game. */
export const INITIAL_RESOURCES: ResourceState = { electricity: 60, water: 56, oxygen: 68, wastewater: 24 }

/** gameplay_assumption: displayed mission start time (SOL 004, 08:24). Display only. */
export const MISSION_START = { sol: 4, minuteOfDay: 8 * 60 + 24 }

/** gameplay_assumption: 1 real second at 1× speed = 1 simulated minute. */
export const SIM_MINUTES_PER_REAL_SECOND = 1

/**
 * gameplay_assumption: continuous use per simulated HOUR.
 * - The crew uses clean water; used water goes to the wastewater tank (it is not destroyed).
 * - The crew uses oxygen. Producing oxygen (A2) is not implemented yet, so oxygen
 *   slowly decreases; rates are kept low so the tutorial never becomes unsafe.
 * - In A1 the base is "safe": sunlight on the panels exactly covers the base load,
 *   so stored electricity neither rises nor falls on its own. Nothing refills for free.
 */
export const HOURLY = {
  crewWaterUse: 0.6,
  crewOxygenUse: 0.4,
  baseLoad: 3,
  solarSupplyWhileSafe: 3,
}

/** gameplay_assumption: the one-off surplus solar energy available in A1. */
export const A1_SURPLUS_POWER = 12

/** gameplay_assumption: recycler recovers this share of the wastewater it processes. */
export const RECYCLER_RECOVERY = 0.9
/** gameplay_assumption: battery stores this share of the energy sent to it. */
export const CHARGING_EFFICIENCY = 0.9

export interface A1Option {
  id: A1ChoiceId
  title: string
  building: 'water' | 'battery'
  /** Child-friendly trade-off text. Both options are presented as valid. */
  gain: string
  cost: string
  powerUsed: number
  /** Wastewater processed (recycle option only). */
  wastewaterProcessed: number
}

export const A1_OPTIONS: Record<A1ChoiceId, A1Option> = {
  'recycle-water': {
    id: 'recycle-water',
    title: 'Tái chế thêm nước',
    building: 'water',
    gain: 'Biến bớt nước đã dùng thành nước sạch. Cả đội có thêm nước để uống, rửa và tưới cây.',
    cost: 'Điện dư sẽ dùng hết cho máy lọc. Pin dự phòng không được sạc thêm.',
    powerUsed: A1_SURPLUS_POWER,
    wastewaterProcessed: 18,
  },
  'charge-battery': {
    id: 'charge-battery',
    title: 'Sạc pin dự phòng',
    building: 'battery',
    gain: 'Cất điện dư vào pin để dùng khi trạm năng lượng vào bóng núi.',
    cost: 'Máy lọc không chạy thêm. Nước đã dùng vẫn nằm chờ trong bể.',
    powerUsed: A1_SURPLUS_POWER,
    wastewaterProcessed: 0,
  },
}
