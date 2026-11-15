// ─────────────────────────────────────────────────────────────────────────────
// LUNARIS Story Mode — scenario configuration (tune here, not in the logic).
// Every number is SCENARIO (a game-balance assumption) unless a comment says MEASURED/REFERENCE.
// Rates that echo NASA references are marked REFERENCE with the ledger row in docs/EVIDENCE.md;
// they are still applied to the fictional LUNARIS base, not measurements of it.
// ─────────────────────────────────────────────────────────────────────────────

export const SAVE_SCHEMA_VERSION = 4

/** SCENARIO: 1 real second at ×1 = 10 simulated minutes (a sol ≈ 2.4 real minutes). */
export const SIM_MINUTES_PER_REAL_SECOND = 10
export const DAY = 1440
/** Display only: Day 1 is SOL 004, mission time starts 08:00. */
export const MISSION_START = { sol: 4, minuteOfDay: 8 * 60 }

/** SCENARIO: four astronauts (the crew shown in the base: 2 men, 2 women, see world/actor-plan.ts). */
export const CREW = 4

export interface Stock { battery: number; water: number; wastewater: number; oxygen: number; food: number }
/** SCENARIO capacities. battery kWh · water/wastewater L · oxygen kg · food crew-days of packaged Earth food. */
export const CAPACITY: Stock = { battery: 100, water: 500, wastewater: 300, oxygen: 60, food: 60 }
export const INITIAL: Stock = { battery: 70, water: 320, wastewater: 80, oxygen: 42, food: 40 }

export const POWER = {
  arrayKw: 14,            // SCENARIO design output of the solar array (100 %)
  essentialKw: 7,         // SCENARIO habitat + life support base load (always protected)
  recyclerKwhPerL: 0.15,  // SCENARIO
  electrolysisKw: 1.6,    // SCENARIO (≈ 5.3 kWh per kg O₂ incl. losses)
  greenhouseKw: 2,        // SCENARIO optional load: grow lamps
  roverChargeKw: 2.5,     // SCENARIO optional load: rover charger
  reserveKwh: 12,         // SCENARIO battery floor kept for essentials
  a3LossFraction: 0.1,    // spec: keeping the array deployed in A3 loses 10 % of design capacity for good
}

export const LIFE = {
  o2KgPerCrewDay: 0.84,   // REFERENCE NASA mean O₂ use per person-day (EVIDENCE G23)
  waterLPerCrewDay: 10,   // SCENARIO total use (drinking 2.5 L is REFERENCE G27; hygiene etc. added)
  recyclerLph: 3,         // SCENARIO processing rate
  recovery: 0.9,          // SCENARIO (ISS ≈ 98 % is REFERENCE G28, not assumed here)
  electrolysisKgph: 0.3,  // SCENARIO O₂ production capacity
  waterLPerKgO2: 1.125,   // stoichiometry 2 H₂O → 2 H₂ + O₂ (9 kg water → 8 kg O₂)
  o2Target: 0.9,          // electrolysis runs while O₂ < 90 % of capacity
  foodReserveCrewDays: 8, // SCENARIO minimum reserve (2 days for 4 crew): reaching it ends the mission
}

export const A1 = { surplusKwh: 12, extraRecycleL: 40, chargeEfficiency: 0.9 }

/** Event timetable (minutes after Day 1 08:00). All SCENARIO. */
export const SCHEDULE = {
  a3At: 2 * DAY + 120,           // Day 3, 10:00: the base's space-weather monitor forecasts a period of more small rocks than usual (micrometeoroids)
  a3PrepMin: 30,                 // warning lead time before the hazard
  a3HazardMin: 300,              // SCENARIO 5 h forecast window: a game value, not a measured or predicted real duration
  a3RedeployMin: 60,             // stowed array needs 1 h to deploy again
  b1At: 3 * DAY + 360,           // (legacy reference) the fault now comes after the player starts the food research
  b1AfterStartMin: 90,           // irrigation fault this long after the food research begins
  b1RepairMin: 120,              // crew repair time once started
  b1DelayMin: 600,               // "later": repaired after the current work shift
  d2AnnounceAt: 3 * DAY + 720,   // Day 4, 20:00 resupply announced
  d2ArriveAt: 4 * DAY + 720,     // Day 5, 20:00 lander arrives at the pad
  d2CrewPickupMin: 360,          // EVA team: 6 h
  d2RoverConfigMin: 120,         // rover switches to / from cargo configuration
  d2PadKm: 2,                    // SCENARIO pad distance (the 3D pad is drawn closer so it stays in view)
  d2LandingMin: 60,              // powered descent shown in the base
  d1At: 4 * DAY - 120,           // Day 5, 06:00 low light
  d1Min: 1800,                   // 30 h
  d1LightFactor: 0.45,
  d3At: 5 * DAY + 240,           // Day 6, 12:00 solar particle event (timing SCENARIO)
  d3Min: 480,
}

export const SUPPLY = { food: 20, water: 60 }   // SCENARIO cargo: crew-days of food, litres of water

export const FOOD = {
  growDays: 7.5,          // SCENARIO days from planting to full growth
  readyIndex: 0.85,       // harvest allowed from this growth index
  expectedGrams: 600,     // SCENARIO expected fresh mass for a healthy crop (REFERENCE type: ISS VEG-04, G32)
  stressPerHour: 0.035,   // SCENARIO yield loss per hour without water (max 60 %)
  irrigationLph: 0.8,     // SCENARIO
  minObservationDays: 2,  // data counts as reliable with observations on ≥ 2 different days
}

export const ROVER = {
  batteryKwh: 50,         // SCENARIO
  kwhPerKm: 0.9,          // SCENARIO
  speedKmh: 2.5,          // SCENARIO (MILO's animation uses 0.7 m/s; VIPER is REFERENCE only, G17–G19)
  slowFactor: 0.6,        // careful driving after an anomaly
  slowEnergyFactor: 1.2,
  anomalyAt: 0.55,        // SCENARIO hazard-camera anomaly at 55 % of the outbound leg
  surveyHours: 6,
  surveyKw: 0.4,
  remeasureMaxHours: 4,   // D3 "wait": extra hours allowed to re-measure
}
