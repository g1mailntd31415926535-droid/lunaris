// Unit tests for the pure game core. Run: npm test  (Node 24+, uses TS type stripping)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gameReducer, createInitialState, clampResources, applyUsage } from '../src/game/reducer.ts'
import { saveGame, loadGame, SAVE_KEY } from '../src/game/persistence.ts'
import { CAPACITY, SAVE_SCHEMA_VERSION } from '../src/game/balance.ts'

const run = (state, ...actions) => actions.reduce(gameReducer, state)
const ready = () => run(createInitialState(), { type: 'tutorial/acknowledge' })
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m } }
const inBounds = (r) => Object.entries(r).every(([k, v]) => Number.isFinite(v) && v >= 0 && v <= CAPACITY[k])

test('new game starts paused in the A1 briefing', () => {
  const s = createInitialState()
  assert.equal(s.stage, 'A1'); assert.equal(s.a1.phase, 'briefing'); assert.equal(s.isPaused, true)
  assert.equal(s.version, SAVE_SCHEMA_VERSION)
})

test('acknowledging the briefing does not unpause the clock', () => {
  const s = ready()
  assert.equal(s.a1.phase, 'choose'); assert.equal(s.isPaused, true)
})

test('cannot commit A1 before the briefing is acknowledged', () => {
  const s = run(createInitialState(), { type: 'a1/commit', choiceId: 'recycle-water' })
  assert.equal(s.a1.choiceId, null)
})

test('A1 can be chosen only once', () => {
  const s = run(ready(), { type: 'a1/commit', choiceId: 'recycle-water' }, { type: 'a1/commit', choiceId: 'charge-battery' })
  assert.equal(s.a1.choiceId, 'recycle-water'); assert.equal(s.a1.phase, 'executing')
  const done = run(s, { type: 'a1/complete', choiceId: 'recycle-water' }, { type: 'a1/commit', choiceId: 'charge-battery' }, { type: 'a1/complete', choiceId: 'charge-battery' })
  assert.equal(done.history.length, 1); assert.equal(done.history[0].choiceId, 'recycle-water')
})

test('resources change only when the work completes, then A1 → A2', () => {
  const committed = run(ready(), { type: 'a1/commit', choiceId: 'charge-battery' })
  assert.deepEqual(committed.resources, ready().resources)
  assert.equal(committed.stage, 'A1')
  const wrong = run(committed, { type: 'a1/complete', choiceId: 'recycle-water' })
  assert.equal(wrong.stage, 'A1', 'completing a different choice is ignored')
  const done = run(committed, { type: 'a1/complete', choiceId: 'charge-battery' })
  assert.equal(done.stage, 'A2'); assert.equal(done.a1.phase, 'done')
})

test('the two A1 branches have different outcomes', () => {
  const base = ready()
  const water = run(base, { type: 'a1/commit', choiceId: 'recycle-water' }, { type: 'a1/complete', choiceId: 'recycle-water' })
  const battery = run(base, { type: 'a1/commit', choiceId: 'charge-battery' }, { type: 'a1/complete', choiceId: 'charge-battery' })
  assert.ok(water.resources.water > base.resources.water)
  assert.ok(water.resources.wastewater < base.resources.wastewater)
  assert.equal(water.resources.electricity, base.resources.electricity)
  assert.ok(battery.resources.electricity > base.resources.electricity)
  assert.equal(battery.resources.water, base.resources.water)
  assert.equal(water.surplusPower, 0); assert.equal(battery.surplusPower, 0)
  // The decision record stores the real applied change and what was not prioritised.
  assert.deepEqual(Object.keys(water.history[0].deltas).sort(), ['wastewater', 'water'])
  assert.deepEqual(battery.history[0].rejectedChoiceIds, ['recycle-water'])
  assert.deepEqual(battery.history[0].effectEventIds, [], 'no future event is invented')
})

test('recycling cannot create water from nothing', () => {
  const dry = { ...ready(), resources: { ...ready().resources, wastewater: 0 } }
  const s = run(dry, { type: 'a1/commit', choiceId: 'recycle-water' }, { type: 'a1/complete', choiceId: 'recycle-water' })
  assert.equal(s.resources.water, dry.resources.water)
})

test('paused clock does not advance; running clock does', () => {
  const paused = run(ready(), { type: 'clock/tick', minutes: 30 })
  assert.equal(paused.clock.elapsedMinutes, 0); assert.deepEqual(paused.resources, ready().resources)
  const running = run(ready(), { type: 'clock/setPaused', paused: false }, { type: 'clock/tick', minutes: 30 })
  assert.equal(running.clock.elapsedMinutes, 30)
  assert.ok(running.resources.oxygen < ready().resources.oxygen)
  assert.ok(running.resources.water < ready().resources.water)
})

test('usage moves water to wastewater and never refills for free', () => {
  const r = { electricity: 50, water: 50, oxygen: 50, wastewater: 10 }
  const after = applyUsage(r, 120)
  assert.ok(after.water < r.water); assert.ok(after.wastewater > r.wastewater)
  assert.ok(after.oxygen < r.oxygen); assert.ok(after.electricity <= r.electricity)
})

test('resource invariants hold over a very long run and odd inputs', () => {
  let s = run(ready(), { type: 'clock/setPaused', paused: false })
  for (let i = 0; i < 2000; i++) s = gameReducer(s, { type: 'clock/tick', minutes: 60 })
  assert.ok(inBounds(s.resources), JSON.stringify(s.resources))
  assert.equal(s.resources.oxygen, 0)
  const neg = run(s, { type: 'clock/tick', minutes: -50 }, { type: 'clock/tick', minutes: Number.NaN })
  assert.equal(neg.clock.elapsedMinutes, s.clock.elapsedMinutes)
  assert.ok(inBounds(clampResources({ electricity: 500, water: -3, oxygen: Number.NaN, wastewater: 1e9 })))
  const full = { ...ready(), resources: { ...ready().resources, electricity: CAPACITY.electricity } }
  const charged = run(full, { type: 'a1/commit', choiceId: 'charge-battery' }, { type: 'a1/complete', choiceId: 'charge-battery' })
  assert.equal(charged.resources.electricity, CAPACITY.electricity)
})

test('save / load round-trips and rejects bad files', () => {
  const store = memoryStorage()
  const s = run(ready(), { type: 'a1/commit', choiceId: 'recycle-water' }, { type: 'a1/complete', choiceId: 'recycle-water' })
  assert.equal(saveGame(s, store), true)
  const loaded = loadGame(store)
  assert.equal(loaded.status, 'loaded'); assert.deepEqual(loaded.state, s)
  assert.deepEqual(run(createInitialState(), { type: 'game/load', state: loaded.state }), s)
  assert.equal(loadGame(memoryStorage()).status, 'empty')
  store.setItem(SAVE_KEY, '{not json'); assert.equal(loadGame(store).status, 'corrupt')
  store.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: 999, state: s })); assert.equal(loadGame(store).status, 'incompatible')
  store.setItem(SAVE_KEY, JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, state: { ...s, resources: { ...s.resources, water: 9999 } } }))
  assert.equal(loadGame(store).state.resources.water, CAPACITY.water)
  assert.equal(loadGame(null).status, 'unavailable')
})

test('restart returns a fresh game', () => {
  const s = run(ready(), { type: 'a1/commit', choiceId: 'charge-battery' }, { type: 'a1/complete', choiceId: 'charge-battery' }, { type: 'game/restart' })
  assert.deepEqual(s, createInitialState())
})
