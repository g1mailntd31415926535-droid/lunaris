// LUNARIS Story Mode engine: one pure reducer drives the clock, resources, scheduled events, decisions,
// the two research branches and the ending. The UI and the 3D world only read this state and dispatch actions.
import type { Decision, DecisionKey, DecisionRecord, EventLogEntry, GameAction, GameState, IceState, ResourceDelta, ResourceKey, ResourceState, Sample } from './types.ts'
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
    food: { stage: 'growing', irrigation: 'ok', repairStartsAt: null, repairDoneAt: null, waterStressMin: 0, lightDeficitMin: 0, growth: 0.15, observations: [], lightLog: [], harvestGrams: null, report: null },
    ice: { stage: 'locked', zone: null, route: null, distanceM: 0, slow: false, detourM: 0, anomalyDone: false, surveyMin: 0, surveyTargetMin: ROVER.surveyHours * 60, samples: [], roverBattery: 28, waitingRadiation: false, report: null },
    supply: { stage: 'none', method: null, jobDoneAt: null, roverPhase: 'none' },
    radiation: { active: false, endsAt: null, roverChoice: null },
    fired: [], decisions: [], history: [],
    log: [{ id: 'evt-1', atMinute: 0, kind: 'system', title: 'Chào mừng tới căn cứ Artemis!', detail: 'Bạn tiếp quản căn cứ. Cây trong nhà kính đã được trồng từ trước.', causeIds: [] }],
    foodWarned: false, ending: null, nextId: 2,
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
function log(state: GameState, entry: Omit<EventLogEntry, 'id' | 'atMinute'>): GameState {
  const [eid, next] = id(state, 'evt')
  const linked = entry.causeIds.length ? next.history.map((h) => entry.causeIds.includes(h.id) ? { ...h, effectIds: [...h.effectIds, eid] } : h) : next.history
  return { ...next, history: linked, log: [...next.log, { ...entry, id: eid, atMinute: state.clock.elapsedMinutes }] }
}
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

  // B2: the greenhouse records every change of its lamp supply by itself (no player journal).
  if (s.food.stage === 'growing' && wasGreenhouse !== p.greenhouseOn) {
    const causes = [...decisionId(s, 'D1'), ...decisionId(s, 'A3')]
    const reason = p.greenhouseOn ? 'đủ điện trở lại' : p.lightFactor < 1 ? 'ánh sáng giảm, điện tùy chọn bị cắt để bảo vệ hệ thống thiết yếu' : 'pin xuống mức dự trữ'
    s = { ...s, food: { ...s.food, lightLog: [...s.food.lightLog, { atMinute: now, on: p.greenhouseOn, reason }] } }
    s = log(s, { kind: 'research', tag: 'B2', title: p.greenhouseOn ? 'Đèn nhà kính bật lại' : 'Đèn nhà kính tắt', detail: `Nhà kính tự ghi: ${reason}.`, causeIds: causes })
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
  }

  // Rover: charge at the depot, drive the chosen verified route, survey, come back.
  s = roverStep(s, minutes)
  return s
}

function roverStep(state: GameState, minutes: number): GameState {
  let s = state
  const ice = { ...s.ice }, h = minutes / 60, now = s.clock.elapsedMinutes
  if (s.power.roverChargingOn) ice.roverBattery = Math.min(ROVER.batteryKwh, ice.roverBattery + POWER.roverChargeKw * 0.9 * h)
  if (ice.stage === 'charging' && ice.route && ice.roverBattery >= roverEnergyNeed(ice.route.lengthM + ice.detourM)) {
    ice.stage = 'outbound'
    s = log({ ...s, ice }, { kind: 'research', tag: 'C2', title: 'MILO xuất phát', detail: `Pin rover đủ cho cả chuyến đi và về khu ${ice.zone}.`, causeIds: decisionId(s, 'C2') })
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
      s = log({ ...s, ice }, { kind: 'event', tag: 'C3.1', title: 'MILO dừng: địa hình bất thường', detail: 'Camera thấy một bãi đá vụn nhỏ hơn ô 5 m của bản đồ (tình huống giả định).', causeIds: decisionId(s, 'C2') })
      return ask(s, 'C31', ['slow', 'detour', 'return'], { atM: Math.round(ice.distanceM), zone: ice.zone ?? '' })
    }
    if (ice.distanceM >= total) {
      ice.stage = 'surveying'
      s = log({ ...s, ice }, { kind: 'research', tag: 'C3.2', title: `MILO tới khu ${ice.zone}`, detail: 'Rover tự khảo sát đúng vị trí đã chọn.', causeIds: decisionId(s, 'C1') })
      return s
    }
  } else if (ice.stage === 'surveying') {
    ice.roverBattery = Math.max(0, ice.roverBattery - ROVER.surveyKw * h)
    const before = Math.floor(ice.surveyMin / 60)
    ice.surveyMin += minutes
    for (let hour = before + 1; hour <= Math.floor(ice.surveyMin / 60); hour++) ice.samples = [...ice.samples, ...takeSamples(s, ice, now, hour)]
    if (ice.surveyMin >= ice.surveyTargetMin && !(ice.waitingRadiation && s.radiation.active)) {
      ice.stage = 'returning'; ice.waitingRadiation = false
      s = log({ ...s, ice }, { kind: 'research', tag: 'C3.3', title: 'Khảo sát xong, MILO quay về', detail: `${ice.samples.filter((x) => x.valid).length} mẫu đo hợp lệ.`, causeIds: decisionId(s, 'C1') })
      return s
    }
  } else if (ice.stage === 'returning' || ice.stage === 'recalled') {
    const before = ice.distanceM
    ice.distanceM = Math.max(0, ice.distanceM - speed * minutes)
    ice.roverBattery = Math.max(0, ice.roverBattery - energy(before - ice.distanceM))
    if (ice.distanceM <= 0) {
      if (ice.stage === 'recalled') {
        ice.stage = 'cargo'
        s = log({ ...s, ice, supply: { ...s.supply, roverPhase: 'config', jobDoneAt: now + SCHEDULE.d2RoverConfigMin } }, { kind: 'consequence', tag: 'D2', title: 'MILO về căn cứ để chở hàng', detail: 'Rover đổi sang cấu hình vận tải. Khảo sát băng tạm dừng; dữ liệu đã đo được giữ nguyên.', causeIds: decisionId(s, 'D2') })
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
    { atMinute: now, instrument: 'neutron', value: +(base + noise(seed) * 0.12).toFixed(3), valid: !rad, flag: rad ? 'nhiễu bức xạ' : undefined },
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
  if (ice.route) reasons.push(`Khu ${ice.zone} (${ice.route.name}): dữ liệu NASA cho biết ${ice.route.inPsr ? 'nằm trong vùng tối vĩnh cửu (PSR)' : 'không nằm trong PSR'}.`)
  if (neutron.length - valid.length) reasons.push(`${neutron.length - valid.length} lần đo neutron bị loại vì nhiễu bức xạ (D3); các mẫu đo trước đó vẫn giữ.`)
  if (ice.slow) reasons.push('Đi chậm sau đoạn địa hình bất thường nên tốn thêm thời gian và pin.')
  if (ice.detourM) reasons.push(`Đi vòng thêm ${Math.round(ice.detourM)} m quanh bãi đá.`)
  const confidence = valid.length >= 6 ? 'cao' : valid.length >= 3 ? 'trung bình' : 'thấp'
  ice.stage = 'done'; ice.report = { validNeutron: valid.length, invalidNeutron: neutron.length - valid.length, meanIndex: +meanIndex.toFixed(3), confidence, reasons }
  return log({ ...state, ice }, { kind: 'research', tag: 'C4', title: 'MILO đã về căn cứ an toàn', detail: `Báo cáo băng hoàn tất: ${valid.length} mẫu neutron hợp lệ, độ tin cậy ${confidence}.`, causeIds: [...decisionId(state, 'C1'), ...decisionId(state, 'D3')] })
}

// ── scheduled events ────────────────────────────────────────────────────────
function events(state: GameState): GameState {
  let s = state
  const now = s.clock.elapsedMinutes
  let f: GameState | null

  // A3: physical hazard to the array (SCENARIO; not a historical NASA event). Only after the A2 tutorial.
  if (s.stage === 'A3' && now >= SCHEDULE.a3At && (f = fire(s, 'A3'))) {
    s = log(f, { kind: 'event', tag: 'A3', title: 'Cảnh báo: bụi regolith có thể bắn vào giàn pin', detail: 'Tình huống giả định: một tàu đổ bộ sắp hạ cánh gần đó trong 5 giờ.', causeIds: [] })
    s = ask(s, 'A3', ['keep', 'stow'])
  }
  if (s.a3HazardEndsAt !== null && now >= s.a3HazardEndsAt && (f = fire(s, 'A3-end'))) {
    s = f
    if (s.a3Choice === 'keep') {
      s = { ...s, power: { ...s.power, capacityFactor: 1 - POWER.a3LossFraction } }
      s = log(s, { kind: 'consequence', tag: 'A3', title: 'Giàn pin bị hư: mất 10 % công suất vĩnh viễn', detail: 'Bụi làm trầy bề mặt pin. Không có cách sửa trong nhiệm vụ này.', causeIds: decisionId(s, 'A3') })
    } else s = log(s, { kind: 'consequence', tag: 'A3', title: 'Hết nguy hiểm, giàn pin mở lại đủ 100 %', causeIds: decisionId(s, 'A3') })
    s = log({ ...s, stage: 'free', ice: { ...s.ice, stage: s.ice.stage === 'locked' ? 'idle' : s.ice.stage } }, { kind: 'stage', title: 'Hoàn thành hướng dẫn! Bạn tự điều hành căn cứ', detail: 'Nghiên cứu thực phẩm và nghiên cứu băng đã mở.', causeIds: [] })
  }
  // B1: irrigation fault (not on the same moment as D2).
  if (now >= SCHEDULE.b1At && s.food.stage === 'growing' && (f = fire(s, 'B1'))) {
    s = log({ ...f, food: { ...f.food, irrigation: 'fault' } }, { kind: 'event', tag: 'B1', title: 'Hệ thống tưới nhà kính bị tắc', detail: 'Cây đang không được tưới.', causeIds: [] })
    s = ask(s, 'B1', ['now', 'later'])
  }
  const food = s.food
  if (food.irrigation === 'fault' && food.repairStartsAt !== null && now >= food.repairStartsAt && !crewSheltered(s)) s = { ...s, food: { ...food, irrigation: 'repairing', repairDoneAt: now + SCHEDULE.b1RepairMin } }
  if (s.food.irrigation === 'repairing' && s.food.repairDoneAt !== null && now >= s.food.repairDoneAt) {
    s = log({ ...s, food: { ...s.food, irrigation: 'ok' } }, { kind: 'consequence', tag: 'B1', title: 'Đã sửa xong hệ thống tưới', detail: `Cây đã thiếu nước tổng cộng ${Math.round(s.food.waterStressMin / 60)} giờ.`, causeIds: decisionId(s, 'B1') })
  }
  // D2: resupply announced a day ahead so the player can prepare.
  if (now >= SCHEDULE.d2AnnounceAt && s.stage === 'free' && (f = fire(s, 'D2'))) {
    s = log({ ...f, supply: { ...f.supply, stage: 'announced' } }, { kind: 'event', tag: 'D2', title: 'Tàu tiếp tế sẽ hạ cánh sau 24 giờ', detail: `Bãi đáp cách căn cứ ${SCHEDULE.d2PadKm} km. Hàng chỉ vào kho khi được chở về.`, causeIds: [] })
    s = ask(s, 'D2', ['rover', 'crew'], { roverAway: roverAway(s.ice) })
  }
  if (s.supply.stage === 'waiting' && now >= SCHEDULE.d2ArriveAt && (f = fire(s, 'D2-arrive'))) {
    s = log(f, { kind: 'event', tag: 'D2', title: 'Tàu tiếp tế đã hạ cánh', causeIds: decisionId(f, 'D2') })
    if (s.supply.method === 'crew') s = { ...s, supply: { ...s.supply, stage: 'pickup', jobDoneAt: now + SCHEDULE.d2CrewPickupMin } }
    else if (roverAway(s.ice)) s = log({ ...s, supply: { ...s.supply, stage: 'pickup', roverPhase: 'toBase' }, ice: { ...s.ice, stage: 'recalled' } }, { kind: 'consequence', tag: 'D2', title: 'MILO được gọi về căn cứ', detail: 'Rover phải về đổi cấu hình trước khi chở hàng.', causeIds: decisionId(s, 'D2') })
    else s = { ...s, supply: { ...s.supply, stage: 'pickup', roverPhase: 'config', jobDoneAt: now + SCHEDULE.d2RoverConfigMin }, ice: { ...s.ice, stage: s.ice.stage === 'done' ? 'done' : 'cargo' } }
  }
  s = supplyStep(s)
  // D1: light drops; optional loads must be prioritised if power cannot cover both.
  if (now >= SCHEDULE.d1At && s.stage === 'free' && (f = fire(s, 'D1'))) {
    s = { ...f, power: { ...f.power, lightFactor: SCHEDULE.d1LightFactor } }
    s = log(s, { kind: 'event', tag: 'D1', title: 'Ánh sáng giảm trong 30 giờ', detail: 'Mặt Trời xuống thấp sau dãy núi (tình huống giả định cho trò chơi).', causeIds: [] })
    const prod = POWER.arrayKw * s.power.capacityFactor * SCHEDULE.d1LightFactor
    const essential = POWER.essentialKw + (s.a2Enabled ? POWER.electrolysisKw : 0) + LIFE.recyclerLph * POWER.recyclerKwhPerL
    const hours = SCHEDULE.d1Min / 60
    const spare = s.resources.battery - POWER.reserveKwh + (prod - essential) * hours
    const demand = (s.food.stage === 'growing' ? POWER.greenhouseKw : 0) * hours + (s.ice.stage !== 'done' ? POWER.roverChargeKw * 6 : 0)
    if (spare < demand) s = ask(s, 'D1', ['greenhouse', 'rover'], { productionKw: +prod.toFixed(1), lost: s.power.capacityFactor < 1, spareKwh: Math.round(spare), demandKwh: Math.round(demand) })
    else s = log(s, { kind: 'consequence', tag: 'D1', title: 'Đủ điện cho cả nhà kính và sạc rover', causeIds: decisionId(s, 'A3') })
  }
  if (s.power.lightFactor < 1 && now >= SCHEDULE.d1At + SCHEDULE.d1Min && (f = fire(s, 'D1-end'))) s = log({ ...f, power: { ...f.power, lightFactor: 1 } }, { kind: 'event', tag: 'D1', title: 'Ánh sáng trở lại bình thường', causeIds: [] })
  // D3: solar particle event. Crew must shelter; the rover decides only if it is measuring.
  if (now >= SCHEDULE.d3At && s.stage === 'free' && (f = fire(s, 'D3'))) {
    s = { ...f, radiation: { active: true, endsAt: now + SCHEDULE.d3Min, roverChoice: null } }
    s = log(s, { kind: 'event', tag: 'D3', title: 'Bão bức xạ Mặt Trời: cả đội vào nơi trú ẩn', detail: 'Loại sự kiện có thật (NASA DONKI ghi nhận); thời điểm trong game là giả định. Việc ngoài trời tạm dừng 8 giờ.', causeIds: [] })
    if (s.ice.stage === 'surveying') s = ask(s, 'D3', ['wait', 'return'])
  }
  if (s.radiation.active && s.radiation.endsAt !== null && now >= s.radiation.endsAt) {
    s = log({ ...s, radiation: { ...s.radiation, active: false } }, { kind: 'event', tag: 'D3', title: 'Hết bức xạ, phi hành đoàn ra ngoài làm việc lại', causeIds: [] })
  }
  // Packaged food decides the mission length: warn a day before the reserve, then end.
  const daysLeft = (s.resources.food - LIFE.foodReserveCrewDays) / CREW
  if (s.stage === 'free' && !s.foodWarned && daysLeft <= 1) s = log({ ...s, foodWarned: true }, { kind: 'event', tag: 'END', title: 'Thực phẩm sắp chạm mức dự trữ', detail: 'Ngày mai nhiệm vụ phải kết thúc và cả đội trở về Trái Đất.', causeIds: [] })
  if (s.phase === 'playing' && s.resources.food <= LIFE.foodReserveCrewDays + 1e-6) s = log({ ...s, phase: 'returning', ending: { reason: 'food', atMinute: now }, isPaused: true, decisions: [] }, { kind: 'stage', tag: 'END', title: 'Kho thực phẩm chạm mức dự trữ: trở về Trái Đất', causeIds: [] })
  return s
}

function supplyStep(state: GameState): GameState {
  let s = state
  const now = s.clock.elapsedMinutes, sup = s.supply
  if (sup.stage !== 'pickup') return s
  if (sup.method === 'crew') {
    if (crewSheltered(s) && sup.jobDoneAt !== null) return { ...s, supply: { ...sup, jobDoneAt: sup.jobDoneAt + STEP } }   // EVA waits out the radiation
    if (sup.jobDoneAt !== null && now >= sup.jobDoneAt) return deliver(s)
    return s
  }
  if (sup.roverPhase === 'config' && sup.jobDoneAt !== null && now >= sup.jobDoneAt) s = { ...s, supply: { ...sup, roverPhase: 'trip', jobDoneAt: now + 2 * SCHEDULE.d2PadKm / ROVER.speedKmh * 60 + 60 } }
  else if (sup.roverPhase === 'trip' && sup.jobDoneAt !== null && now >= sup.jobDoneAt) {
    s = { ...s, ice: { ...s.ice, roverBattery: Math.max(0, s.ice.roverBattery - 2 * SCHEDULE.d2PadKm * ROVER.kwhPerKm * 1.4) } }
    s = deliver(s)
    s = { ...s, supply: { ...s.supply, roverPhase: 'unconfig', jobDoneAt: now + SCHEDULE.d2RoverConfigMin } }
  } else if (sup.roverPhase === 'unconfig' && sup.jobDoneAt !== null && now >= sup.jobDoneAt) {
    const resume: IceState['stage'] = s.ice.stage === 'cargo' ? (s.ice.route ? 'charging' : 'idle') : s.ice.stage
    s = log({ ...s, supply: { ...s.supply, roverPhase: 'none' }, ice: { ...s.ice, stage: resume, distanceM: 0 } }, { kind: 'consequence', tag: 'D2', title: 'MILO trở lại cấu hình khảo sát', detail: s.ice.route ? 'Rover sạc lại rồi tiếp tục chuyến khảo sát đã chọn.' : '', causeIds: decisionId(s, 'D2') })
  }
  return s
}

function deliver(state: GameState): GameState {
  const before = state.resources
  const after = clampResources({ ...before, food: before.food + SUPPLY.food, water: before.water + SUPPLY.water })
  return log({ ...state, resources: after, supply: { ...state.supply, stage: 'delivered', jobDoneAt: null } }, { kind: 'consequence', tag: 'D2', title: 'Hàng tiếp tế đã vào kho', detail: 'Thực phẩm và nước chỉ được cộng khi đã chở về căn cứ.', deltas: resourceDelta(before, after), causeIds: decisionId(state, 'D2') })
}

// ── decisions ───────────────────────────────────────────────────────────────
function record(state: GameState, decision: Decision, choice: string, deltas: ResourceDelta = {}): GameState {
  const rec: DecisionRecord = { id: `dec-${decision.key}-${state.nextId}`, key: decision.key, choice, rejected: decision.options.filter((o) => o !== choice), atMinute: state.clock.elapsedMinutes, deltas, causeIds: [], effectIds: [] }
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
      s = log(s, { kind: 'decision', tag: 'A1', title: action.choice === 'recycle' ? 'Đã dùng điện dư để tái chế nước' : 'Đã dùng điện dư để sạc pin dự trữ', deltas: resourceDelta(before, after), causeIds: decisionId(s, 'A1') })
      return log({ ...s, stage: 'A2' }, { kind: 'stage', tag: 'A2', title: 'Chặng A2: nước + điện → oxy', detail: 'Hãy bật máy điện phân ở trạm hỗ trợ sự sống.', causeIds: [] })
    }
    case 'A3': {
      const hazardEnd = now + SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin
      s = record({ ...s, a3Choice: action.choice as 'keep' | 'stow', a3HazardEndsAt: hazardEnd, power: { ...s.power, stowedUntil: action.choice === 'stow' ? hazardEnd + SCHEDULE.a3RedeployMin : null } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'A3', title: action.choice === 'keep' ? 'Giữ giàn pin mở' : 'Thu gọn giàn pin', detail: action.choice === 'keep' ? 'Vẫn phát điện, nhưng có thể bị hư.' : `Không phát điện khoảng ${Math.round((SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin + SCHEDULE.a3RedeployMin) / 60)} giờ.`, causeIds: decisionId(s, 'A3') })
    }
    case 'B1': {
      const startsAt = action.choice === 'now' ? now : now + SCHEDULE.b1DelayMin
      s = record({ ...s, food: { ...s.food, repairStartsAt: startsAt } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'B1', title: action.choice === 'now' ? 'Cử phi hành gia sửa ngay' : 'Để sửa sau ca làm việc', detail: action.choice === 'now' ? `Mất khoảng ${SCHEDULE.b1RepairMin / 60} giờ.` : `Cây thiếu nước thêm khoảng ${Math.round((SCHEDULE.b1DelayMin + SCHEDULE.b1RepairMin) / 60)} giờ.`, causeIds: decisionId(s, 'B1') })
    }
    case 'C1': {
      s = record({ ...s, ice: { ...s.ice, zone: action.choice as IceState['zone'], stage: 'route' } }, d, action.choice)
      s = log(s, { kind: 'decision', tag: 'C1', title: `Chọn khu nghiên cứu ${action.choice}`, causeIds: decisionId(s, 'C1') })
      return ask(s, 'C2', ['go', 'back'], { zone: action.choice })
    }
    case 'C2': {
      if (action.choice === 'back') return record({ ...s, ice: { ...s.ice, stage: 'idle', zone: null } }, d, 'back')
      const route = action.route
      if (!route || route.zone !== s.ice.zone || !(route.lengthM > 0) || roverEnergyNeed(route.lengthM) > ROVER.batteryKwh) return state   // only real, feasible routes
      s = record({ ...s, ice: { ...s.ice, route, stage: 'charging', distanceM: 0 } }, d, 'go')
      return log(s, { kind: 'decision', tag: 'C2', title: `Chọn tuyến A* tới khu ${route.zone}`, detail: `${(route.lengthM / 1000).toFixed(1)} km một chiều, cần khoảng ${Math.round(roverEnergyNeed(route.lengthM))} kWh pin rover.`, causeIds: decisionId(s, 'C2') })
    }
    case 'C31': {
      if (action.choice === 'detour' && !(action.detourM && action.detourM > 0)) return state   // detour only if it was checked on the DEM
      const ice = { ...s.ice, anomalyDone: true }
      if (action.choice === 'slow') { ice.slow = true; ice.stage = 'outbound' }
      else if (action.choice === 'detour') { ice.detourM = action.detourM ?? 0; ice.stage = 'outbound' }
      else ice.stage = 'returning'
      s = record({ ...s, ice }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'C3.1', title: action.choice === 'slow' ? 'Đi chậm qua bãi đá trên tuyến đã kiểm tra' : action.choice === 'detour' ? `Đi vòng ${Math.round(ice.detourM)} m (đã kiểm tra độ dốc trên DEM)` : 'Quay về căn cứ', causeIds: decisionId(s, 'C31') })
    }
    case 'D1': {
      s = record({ ...s, power: { ...s.power, d1Priority: action.choice as 'greenhouse' | 'rover' } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'D1', title: action.choice === 'greenhouse' ? 'Ưu tiên đèn nhà kính' : 'Ưu tiên sạc rover', detail: 'Điện thiết yếu luôn được bảo vệ trước.', causeIds: [...decisionId(s, 'D1'), ...decisionId(s, 'A3')] })
    }
    case 'D2': {
      s = record({ ...s, supply: { ...s.supply, stage: 'waiting', method: action.choice as 'rover' | 'crew' } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'D2', title: action.choice === 'rover' ? 'Dùng rover chở hàng' : 'Phân công phi hành đoàn nhận hàng', causeIds: decisionId(s, 'D2') })
    }
    case 'D3': {
      const ice = { ...s.ice }
      if (action.choice === 'wait') { ice.waitingRadiation = true; ice.surveyTargetMin = Math.min(ice.surveyMin + (s.radiation.endsAt ?? now) - now + 60 * 2, ice.surveyTargetMin + ROVER.remeasureMaxHours * 60 + SCHEDULE.d3Min) }
      else { ice.stage = 'returning' }
      s = record({ ...s, ice, radiation: { ...s.radiation, roverChoice: action.choice as 'wait' | 'return' } }, d, action.choice)
      return log(s, { kind: 'decision', tag: 'D3', title: action.choice === 'wait' ? 'MILO chờ hết bức xạ để đo lại' : 'MILO kết thúc khảo sát và quay về', causeIds: decisionId(s, 'D3') })
    }
  }
  return s
}

// ── reducer ─────────────────────────────────────────────────────────────────
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'game/start': {
      if (state.phase !== 'opening') return state
      const s = log({ ...state, phase: 'playing', mode: action.mode, isPaused: action.mode === 'basic' }, { kind: 'stage', tag: 'A1', title: 'Chặng A1: điện dư và tái chế nước', detail: action.mode === 'basic' ? 'Chế độ Cơ bản: Commander Luna hướng dẫn, thời gian tự dừng khi cần quyết định.' : 'Chế độ Nâng cao: thời gian không tự dừng.', causeIds: [] })
      return ask(s, 'A1', ['recycle', 'battery'])
    }
    case 'clock/setPaused':
      return state.isPaused === action.paused || state.phase !== 'playing' ? state : { ...state, isPaused: action.paused }
    case 'clock/tick': {
      if (state.isPaused || state.phase !== 'playing' || !(action.minutes > 0)) return state
      // Basic mode never runs the clock with a decision open (Advanced does).
      if (state.mode === 'basic' && state.decisions.length) return { ...state, isPaused: true }
      let s = state, left = action.minutes
      while (left > 1e-9 && s.phase === 'playing') {
        const step = Math.min(STEP, left)
        s = simulate(s, step)
        s = { ...s, clock: { elapsedMinutes: s.clock.elapsedMinutes + step } }
        s = events(s)
        left -= step
        if (s.isPaused) break
      }
      return s
    }
    case 'decide': return decide(state, action)
    case 'a2/activate': {
      if (state.stage !== 'A2' || state.a2Enabled) return state
      const s = log({ ...state, a2Enabled: true, stage: 'A3' }, { kind: 'stage', tag: 'A2', title: 'Máy điện phân đã bật', detail: 'Từ giờ máy tự tạo oxy từ nước và điện, trong giới hạn công suất.', causeIds: [] })
      return log(s, { kind: 'stage', tag: 'A3', title: 'Chặng A3 sẽ đến vào ngày 3', detail: 'Hãy để thời gian trôi và theo dõi căn cứ.', causeIds: [] })
    }
    case 'food/observe': {
      if (state.food.stage !== 'growing' || state.stage !== 'free' || crewSheltered(state)) return state
      const f = state.food, now = state.clock.elapsedMinutes
      const obs = { atMinute: now, day: dayOf(now), irrigationOk: f.irrigation === 'ok', lightPercent: state.power.greenhouseOn ? 100 : 0, growthPercent: Math.round(f.growth * 100), heightCm: +(4 + f.growth * 18 - Math.min(5, f.waterStressMin / 120)).toFixed(1) }
      return log({ ...state, food: { ...f, observations: [...f.observations, obs] } }, { kind: 'research', tag: 'B3', title: 'Đã quan sát cây trong nhà kính', detail: `Thiết bị tự ghi: cao ${obs.heightCm} cm, tưới ${obs.irrigationOk ? 'bình thường' : 'đang hỏng'}, đèn ${obs.lightPercent ? 'bật' : 'tắt'}.`, causeIds: [] })
    }
    case 'food/harvest': {
      const f = state.food
      if (f.stage !== 'growing' || f.growth < FOOD.readyIndex || crewSheltered(state)) return state
      const stress = Math.min(0.6, f.waterStressMin / 60 * FOOD.stressPerHour)
      const grams = Math.round(FOOD.expectedGrams * f.growth * (1 - stress))
      return log({ ...state, food: { ...f, stage: 'harvested', harvestGrams: grams } }, { kind: 'research', tag: 'B4', title: `Đã thu hoạch và cân mẫu: ${grams} g`, causeIds: [...decisionId(state, 'B1'), ...decisionId(state, 'D1')] })
    }
    case 'food/report': {
      const f = state.food
      if (f.stage !== 'harvested' || f.harvestGrams === null) return state
      const days = new Set(f.observations.map((o) => o.day)).size
      const reasons: string[] = []
      if (f.waterStressMin) reasons.push(`Cây thiếu nước ${Math.round(f.waterStressMin / 60)} giờ do hệ thống tưới hỏng (B1).`)
      if (f.lightDeficitMin) reasons.push(`Đèn nhà kính tắt ${Math.round(f.lightDeficitMin / 60)} giờ vì thiếu điện (B2${state.power.d1Priority ? ', D1' : ''}${state.power.capacityFactor < 1 ? ', ảnh hưởng của A3' : ''}).`)
      reasons.push(days >= FOOD.minObservationDays ? `Có quan sát trong ${days} ngày khác nhau nên dữ liệu đáng tin hơn.` : `Chỉ quan sát trong ${days} ngày nên khó biết cây thay đổi thế nào.`)
      const reliability = days >= 3 ? 'cao' : days >= FOOD.minObservationDays ? 'trung bình' : 'thấp'
      return log({ ...state, food: { ...f, stage: 'reported', report: { grams: f.harvestGrams, expected: FOOD.expectedGrams, growthPercent: Math.round(f.growth * 100), reliability, reasons } } }, { kind: 'research', tag: 'B4', title: 'Báo cáo thực phẩm hoàn tất', detail: `${f.harvestGrams} g / kỳ vọng ${FOOD.expectedGrams} g; độ tin cậy dữ liệu: ${reliability}.`, causeIds: [] })
    }
    case 'ice/start': {
      const ice = state.ice
      if (state.stage !== 'free' || state.supply.roverPhase !== 'none') return state
      if (ice.stage === 'idle') return ask({ ...state, ice: { ...ice, stage: 'site' } }, 'C1', ['A', 'B', 'C', 'D'])
      return state
    }
    case 'mission/submit':
      if (state.phase !== 'playing' || state.stage !== 'free') return state
      return log({ ...state, phase: 'returning', ending: { reason: 'submitted', atMinute: state.clock.elapsedMinutes }, isPaused: true, decisions: [] }, { kind: 'stage', tag: 'END', title: 'Đã nộp báo cáo: cả đội trở về Trái Đất', causeIds: [] })
    case 'mission/finishReturn':
      return state.phase === 'returning' ? { ...state, phase: 'ended' } : state
    case 'game/restart': return createInitialState()
    case 'game/load': return action.state
  }
}
