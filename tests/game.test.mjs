// Story Mode engine tests: real playthroughs through the pure reducer (no UI).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gameReducer, createInitialState, clampResources, CAPACITY, DAY, LIFE, SCHEDULE, POWER, saveGame, loadGame, SAVE_KEY } from '../src/game/index.ts'

const ROUTE_C = { zone: 'C', name: 'Connecting Ridge C1', lengthM: 1885.1, maxSlopeDeg: 14.28, meanSlopeDeg: 5.18, nearLimitPercent: 0.68, uncertainPercent: 1.35, inPsr: false, heightM: 1869, slopeDeg: 6.84 }
const ROUTE_A = { zone: 'A', name: 'PSR #1470', lengthM: 19296.6, maxSlopeDeg: 14.99, meanSlopeDeg: 9.87, nearLimitPercent: 6.15, uncertainPercent: 13.36, inPsr: true, heightM: 1295, slopeDeg: 10 }

/** Plays with a simple policy: answer each decision with `choose(decision)`, keep the clock running. */
function play(mode, choose, { until = 20 * DAY, step = 30, extra = () => null } = {}) {
  let s = gameReducer(createInitialState(), { type: 'game/start', mode })
  const seen = []
  for (let guard = 0; guard < 100000 && s.phase === 'playing' && s.clock.elapsedMinutes < until; guard++) {
    if (s.decisions.length) {
      const d = s.decisions[0]
      const pick = choose(d, s)
      seen.push(`${d.key}:${pick.choice}`)
      const next = gameReducer(s, { type: 'decide', decisionId: d.id, ...pick })
      assert.notEqual(next, s, `decision ${d.key} → ${pick.choice} was rejected`)
      s = next
      continue
    }
    if (s.stage === 'A2') { s = gameReducer(s, { type: 'a2/activate' }); continue }
    const a = extra(s)
    if (a) { const n = gameReducer(s, a); if (n !== s) { s = n; continue } }
    s = gameReducer({ ...s, isPaused: false }, { type: 'clock/tick', minutes: step })
    for (const k of Object.keys(CAPACITY)) assert.ok(s.resources[k] >= 0 && s.resources[k] <= CAPACITY[k] + 1e-9, `${k} out of range: ${s.resources[k]}`)
  }
  return { s, seen }
}
const defaults = (pref = {}) => (d) => {
  if (d.key === 'C1') return { choice: pref.zone ?? 'C' }
  if (d.key === 'C2') return { choice: 'go', route: pref.route ?? ROUTE_C }
  if (d.key === 'C31') return { choice: pref.c31 ?? 'slow', detourM: pref.detourM }
  return { choice: pref[d.key] ?? d.options[0] }
}
const research = (opts = {}) => (s) => {
  if (s.stage !== 'free') return null
  if (opts.ice !== false && s.ice.stage === 'idle' && !s.ice.report) return { type: 'ice/start' }
  if (opts.food !== false) {
    const day = Math.floor(s.clock.elapsedMinutes / DAY) + 1
    if (s.food.stage === 'growing' && !s.food.observations.some((o) => o.day === day)) return { type: 'food/observe' }
    if (s.food.stage === 'growing' && s.food.growth >= 0.85) return { type: 'food/harvest' }
    if (s.food.stage === 'harvested') return { type: 'food/report' }
  }
  if (opts.submitWhenDone && s.food.report && s.ice.report) return { type: 'mission/submit' }
  return null
}

test('opening → mode select; Basic pauses for decisions, Advanced does not', () => {
  const basic = gameReducer(createInitialState(), { type: 'game/start', mode: 'basic' })
  assert.equal(basic.phase, 'playing'); assert.equal(basic.decisions[0].key, 'A1'); assert.equal(basic.isPaused, true)
  const ticked = gameReducer({ ...basic, isPaused: false }, { type: 'clock/tick', minutes: 60 })
  assert.equal(ticked.clock.elapsedMinutes, 0, 'Basic never runs time with a decision open')
  const adv = gameReducer(createInitialState(), { type: 'game/start', mode: 'advanced' })
  assert.equal(adv.isPaused, false)
  assert.equal(gameReducer(adv, { type: 'clock/tick', minutes: 60 }).clock.elapsedMinutes, 60, 'Advanced keeps time running')
})

test('full run (both branches, submitted): tutorial A1–A3, B1, C1–C4, D1–D3, report', () => {
  const { s, seen } = play('basic', defaults(), { extra: research({ submitWhenDone: true }) })
  for (const key of ['A1', 'A3', 'B1', 'C1', 'C2', 'C31', 'D2']) assert.ok(seen.some((x) => x.startsWith(key + ':')), `${key} happened (${seen})`)
  assert.equal(s.phase, 'returning'); assert.equal(s.ending.reason, 'submitted')
  assert.ok(s.food.report && s.ice.report, 'both reports exist')
  assert.equal(new Set(seen).size, seen.length, `no decision repeats: ${seen}`)
})

test('food-only and ice-only runs end by the food reserve; nothing is stuck', () => {
  const food = play('advanced', defaults(), { extra: research({ ice: false }) }).s
  assert.equal(food.ending.reason, 'food'); assert.ok(food.food.report); assert.equal(food.ice.report, null)
  const ice = play('advanced', defaults({ zone: 'A', route: ROUTE_A }), { extra: research({ food: false }) }).s
  assert.equal(ice.ending.reason, 'food'); assert.ok(ice.ice.report, `ice stage ${ice.ice.stage}`); assert.equal(ice.food.report, null)
})

test('early submit is possible after the tutorial; packaged food ends the mission with a warning first', () => {
  const { s } = play('advanced', defaults(), { until: 3 * DAY })
  assert.equal(gameReducer(s, { type: 'mission/submit' }).phase, 'returning')
  const end = play('advanced', defaults(), {}).s
  const warn = end.log.find((e) => e.title.startsWith('Thực phẩm sắp chạm')), stop = end.log.find((e) => e.tag === 'END' && e.kind === 'stage')
  assert.ok(warn && stop && stop.atMinute - warn.atMinute >= DAY - 60 && stop.atMinute - warn.atMinute <= DAY + 60, 'warned about a day ahead')
  assert.ok(end.resources.food >= LIFE.foodReserveCrewDays - 0.5)
})

test('A3: keeping the array open loses 10 % for good and traces into D1; stowing keeps 100 %', () => {
  const keep = play('advanced', defaults({ A3: 'keep', D1: 'rover' }), { until: SCHEDULE.d1At + SCHEDULE.d1Min, extra: research() }).s
  const stow = play('advanced', defaults({ A3: 'stow', D1: 'rover' }), { until: SCHEDULE.d1At + SCHEDULE.d1Min, extra: research() }).s
  assert.equal(keep.power.capacityFactor, 1 - POWER.a3LossFraction); assert.equal(stow.power.capacityFactor, 1)
  assert.ok(keep.log.some((e) => e.tag === 'D1' && e.causeIds.some((c) => c.startsWith('dec-A3'))), 'D1 traces back to A3')
  // Inside the D1 window only (stowing has its own short-term cost earlier, during A3).
  const before = (pref) => play('advanced', defaults(pref), { until: SCHEDULE.d1At, extra: research() }).s.food.lightDeficitMin
  const keepD1 = keep.food.lightDeficitMin - before({ A3: 'keep', D1: 'rover' }), stowD1 = stow.food.lightDeficitMin - before({ A3: 'stow', D1: 'rover' })
  assert.ok(keepD1 >= stowD1, `D1 lamp outage with the damaged array ${keepD1} min vs ${stowD1} min`)
})

test('B1 consequences depend on real time without water', () => {
  const now = play('advanced', defaults({ B1: 'now' }), { until: SCHEDULE.b1At + 2 * DAY }).s
  const later = play('advanced', defaults({ B1: 'later' }), { until: SCHEDULE.b1At + 2 * DAY }).s
  assert.ok(later.food.waterStressMin > now.food.waterStressMin + 400, `${later.food.waterStressMin} vs ${now.food.waterStressMin}`)
})

test('D2: cargo counts only after delivery; by rover the rover must come back first', () => {
  const r = play('advanced', defaults({ zone: 'A', route: ROUTE_A, D2: 'rover', D3: 'wait' }), { until: SCHEDULE.d3At + DAY, extra: research({ food: false }) }).s
  const delivered = r.log.find((e) => e.title === 'Hàng tiếp tế đã vào kho')
  assert.ok(delivered && delivered.atMinute > SCHEDULE.d2ArriveAt && delivered.deltas.food > 0, 'delivered after arrival')
  const crew = play('advanced', defaults({ D2: 'crew' }), { until: SCHEDULE.d2ArriveAt + DAY }).s
  assert.ok(crew.log.find((e) => e.title === 'Hàng tiếp tế đã vào kho').atMinute >= SCHEDULE.d2ArriveAt + SCHEDULE.d2CrewPickupMin - 10)
})

test('save / load round-trips and rejects bad files; resources are clamped', () => {
  const store = new Map(), storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  const s = play('basic', defaults(), { until: 2 * DAY }).s
  assert.equal(saveGame(s, storage), true)
  assert.deepEqual(loadGame(storage).state.clock, s.clock)
  store.set(SAVE_KEY, '{bad'); assert.equal(loadGame(storage).status, 'corrupt')
  assert.deepEqual(clampResources({ battery: -5, water: 1e9, wastewater: NaN, oxygen: 3, food: 2 }), { battery: 0, water: CAPACITY.water, wastewater: 0, oxygen: 3, food: 2 })
})

test('base clearing: no decorative rock in the worked area or near a building; a sparse scatter remains outside', async () => {
  const { ROCK_PLACEMENTS, BASE_CLEARING } = await import('../src/world/rock-plan.ts')
  const { BUILDINGS } = await import('../src/data.ts')
  assert.equal(ROCK_PLACEMENTS.filter((r) => Math.hypot(r.x - BASE_CLEARING.center[0], r.z - BASE_CLEARING.center[1]) < BASE_CLEARING.inner).length, 0)
  for (const r of ROCK_PLACEMENTS) for (const b of BUILDINGS) assert.ok(Math.hypot(r.x - b.position[0], r.z - b.position[2]) >= b.radius + 2.5)
  assert.ok(ROCK_PLACEMENTS.length > 100 && ROCK_PLACEMENTS.length < 400, `${ROCK_PLACEMENTS.length} rocks`)
  assert.ok(Math.max(...ROCK_PLACEMENTS.map((r) => r.size)) <= 0.65, 'no boulders')
})
