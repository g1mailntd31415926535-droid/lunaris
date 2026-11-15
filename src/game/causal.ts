// Ending analysis: builds the cause → effect chains of one playthrough from the simulation's own records
// (GameState.history = the player's decisions, GameState.effects = measured consequences). Deterministic: no AI, no
// canned text per answer. A step is only written when its measured number exists; otherwise the chain says
// "avoided" (the risk existed but did not happen) or "unknown" (the event never happened before the report).
import type { DecisionRecord, EffectRecord, GameState } from './types.ts'
import { FOOD, MISSION_START, DAY, ROVER } from './scenario.ts'
import { supplyTripKwh } from './reducer.ts'

export type StepKind = 'choice' | 'change' | 'later' | 'result' | 'avoided' | 'unknown'
export interface ChainStep { kind: StepKind; title: string; detail?: string }
export interface Chain { id: string; title: string; target: 'food' | 'ice' | 'base'; weight: number; steps: ChainStep[] }
export interface BranchResult { done: boolean; status: string; result: string[] }
export interface EndingAnalysis { reason: string; food: BranchResult; ice: BranchResult; chains: Chain[]; why: { food: string[]; ice: string[] }; early: string[] }

const stamp = (minute: number) => { const t = MISSION_START.minuteOfDay + Math.floor(minute); return `Ngày ${Math.floor(minute / DAY) + 1} · ${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
const hours = (m: number) => { const h = m / 60; return h < 1 ? `${Math.round(m)} phút` : `${Math.round(h * 10) / 10} giờ`.replace('.', ',') }
const num = (v: number, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',')

const find = (s: GameState, key: string): EffectRecord | undefined => s.effects.find((e) => e.key === key)
const amt = (s: GameState, key: string) => find(s, key)?.amount ?? 0
const dec = (s: GameState, key: string): DecisionRecord | undefined => s.history.find((h) => h.key === key)
const f = (e: EffectRecord | undefined, k: string) => Number(e?.facts[k] ?? 0)
const fs = (e: EffectRecord | undefined, k: string) => String(e?.facts[k] ?? '')

/** What the lamps / MILO's charger lost in the D1 low-light window, and what it did to growth. */
function d1Consequences(s: GameState): ChainStep[] {
  const d1 = dec(s, 'D1')
  if (!d1) return []
  const out: ChainStep[] = [{ kind: 'choice', title: `${stamp(d1.atMinute)} · Bạn ${d1.choice === 'rover' ? 'ưu tiên sạc rover' : 'ưu tiên đèn nhà kính'} (D1)` }]
  const lamp = amt(s, 'lamp.off.d1'), denied = amt(s, 'rover.chargeDenied.d1')
  if (lamp > 0) out.push({ kind: 'later', title: `Đèn nhà kính tắt ${hours(lamp)}`, detail: d1.choice === 'rover' ? 'Điện tùy chọn được dành cho việc sạc rover trước.' : 'Dù bạn ưu tiên nhà kính, điện vẫn không đủ cho cả lúc ánh sáng yếu.' })
  if (denied > 0) out.push({ kind: 'later', title: `MILO sạc chậm: chờ thêm ${hours(denied)} mới đủ pin`, detail: d1.choice === 'greenhouse' ? 'Điện tùy chọn được dành cho đèn nhà kính trước.' : 'Điện vẫn không đủ cho việc sạc.' })
  if (!lamp && !denied) out.push({ kind: 'avoided', title: 'Không tải nào bị cắt', detail: 'Điện khả dụng đủ cho cả đèn nhà kính và sạc rover trong lúc ánh sáng yếu.' })
  return out
}

/** Growth / harvest consequences of lamp-off time for one cause (d1 / a3 / other), only when measured. */
function lampResult(s: GameState, phase: 'd1' | 'a3' | 'other'): ChainStep[] {
  const lost = amt(s, `growth.lostLamp.${phase}`), h = find(s, 'b4.harvest')
  if (lost < 0.01) return []
  const grams = f(h, phase === 'd1' ? 'gramsLampD1' : phase === 'a3' ? 'gramsLampA3' : 'gramsLampOther')
  return [{ kind: 'result', title: `Cây chậm lớn khoảng ${Math.round(lost * 100)} điểm % sinh trưởng`, detail: h ? (grams >= 1 ? `Mẫu thu hoạch nhẹ hơn khoảng ${grams} g so với khi đèn luôn sáng.` : 'Ảnh hưởng tới khối lượng mẫu rất nhỏ (dưới 1 g).') : 'Bạn chưa thu hoạch nên chưa cân được khác biệt.' }]
}

export function buildChains(s: GameState): Chain[] {
  const chains: Chain[] = []
  const a3 = dec(s, 'A3'), d1Check = find(s, 'd1.check'), d1Dec = dec(s, 'D1')
  let d1Covered = false

  // ── A3 ───────────────────────────────────────────────────────────────────
  if (a3) {
    const steps: ChainStep[] = []
    let weight = 35, target: Chain['target'] = 'base'
    if (a3.choice === 'keep') {
      steps.push({ kind: 'choice', title: `${stamp(a3.atMinute)} · Bạn giữ giàn pin mở khi có dự báo mảnh đá nhỏ (A3)` })
      const cap = find(s, 'a3.capacity')
      if (!cap) steps.push({ kind: 'unknown', title: 'Đợt mảnh đá chưa qua hết khi bạn nộp báo cáo', detail: 'Chưa biết giàn pin có bị trầy hay không.' })
      else {
        steps.push({ kind: 'change', title: `Công suất tối đa giảm từ 100% xuống ${100 - cap.amount}% (mãi mãi)`, detail: 'Mảnh đá làm trầy bề mặt pin; trong nhiệm vụ này không sửa được.' })
        weight = 60
        if (!d1Check) steps.push({ kind: 'unknown', title: 'Sự kiện ánh sáng giảm (D1) chưa xảy ra trước khi bạn nộp báo cáo', detail: 'Nên chưa thể nói việc mất 10% ảnh hưởng gì thêm.' })
        else if (d1Check.amount <= 0) steps.push({ kind: 'avoided', title: 'Đến D1, điện vẫn đủ cho cả nhà kính và rover', detail: `Giàn pin còn ${num(f(d1Check, 'productionKw'))} kW lúc ánh sáng yếu nhưng pin dự trữ bù được, nên mất 10% không gây thiếu điện.` })
        else {
          const share = d1Check.amount - f(d1Check, 'deficitIfFullArrayKwh')
          if (share < 0.5) steps.push({ kind: 'avoided', title: `Đến D1, điện thiếu ${num(d1Check.amount)} kWh, nhưng không phải do A3`, detail: 'Nếu giàn pin còn 100% thì vẫn thiếu như vậy.' })
          else {
            d1Covered = true; weight = 100
            steps.push({ kind: 'later', title: `Đến D1 (${stamp(d1Check.atMinute)}), điện khả dụng thiếu ${num(d1Check.amount)} kWh`, detail: `Nhà kính và rover cần ${num(f(d1Check, 'demandKwh'), 0)} kWh nhưng điện dư chỉ có ${num(Math.max(0, f(d1Check, 'spareKwh')), 0)} kWh. ` + (share >= d1Check.amount - 0.05 ? 'Nếu giàn pin còn 100%, điện vẫn đủ.' : `Trong đó ${num(share)} kWh thiếu là do mất 10% công suất; phần còn lại vẫn thiếu dù giàn pin nguyên vẹn.`) })
            const more = d1Consequences(s)
            steps.push(...more)
            for (const step of lampResult(s, 'd1')) { steps.push(step); target = 'food' }
            if (amt(s, 'rover.chargeDenied.d1') > 0) target = target === 'food' ? 'food' : 'ice'
          }
        }
      }
    } else {
      steps.push({ kind: 'choice', title: `${stamp(a3.atMinute)} · Bạn thu gọn giàn pin trước đợt mảnh đá (A3)` })
      const out = find(s, 'a3.stowOutage')
      if (!out || out.amount <= 0) steps.push({ kind: 'unknown', title: 'Giàn pin chưa kịp mở lại khi bạn nộp báo cáo' })
      else {
        steps.push({ kind: 'change', title: `Không có điện mặt trời ${hours(out.amount)}`, detail: `Pin dự trữ giảm từ ${num(f(out, 'batteryStartKwh'), 0)} kWh xuống thấp nhất ${num(amt(s, 'a3.stowBattery'), 0)} kWh.` })
        steps.push({ kind: 'result', title: 'Giàn pin vẫn giữ 100% công suất', detail: 'Bạn đổi một ít điện hôm nay để bảo vệ giàn pin cho cả nhiệm vụ.' })
        weight = 55
        const lamp = amt(s, 'lamp.off.a3'), denied = amt(s, 'rover.chargeDenied.a3')
        if (lamp > 0) { steps.push({ kind: 'later', title: `Nhà kính phải tắt đèn ${hours(lamp)}`, detail: 'Pin xuống mức dự trữ nên điện tùy chọn bị cắt trước.' }, ...lampResult(s, 'a3')); weight = 75; target = 'food' }
        if (denied > 0) { steps.push({ kind: 'later', title: `MILO sạc chậm ${hours(denied)} vì pin dự trữ thấp` }); weight = 75; if (target === 'base') target = 'ice' }
        if (!lamp && !denied) steps.push({ kind: 'avoided', title: 'Không tải nào bị cắt', detail: 'Pin dự trữ đủ nên nhà kính và việc sạc rover không bị ảnh hưởng.' })
      }
    }
    chains.push({ id: 'a3', title: 'Giàn pin và đợt mảnh đá nhỏ', target, weight, steps })
  }

  // ── D1 on its own (when A3 did not already explain it) ───────────────────
  if (!d1Covered && d1Dec && d1Check) {
    const steps: ChainStep[] = [{ kind: 'later', title: `${stamp(d1Check.atMinute)} · Ánh sáng giảm, điện khả dụng thiếu ${num(d1Check.amount)} kWh (giàn pin ${f(d1Check, 'capacityPercent')}%)` }, ...d1Consequences(s).slice(0)]
    const lampSteps = lampResult(s, 'd1'); steps.push(...lampSteps)
    const target: Chain['target'] = lampSteps.length || amt(s, 'lamp.off.d1') > 0 ? 'food' : amt(s, 'rover.chargeDenied.d1') > 0 ? 'ice' : 'base'
    chains.push({ id: 'd1', title: 'Ánh sáng giảm và việc chia điện', target, weight: target === 'base' ? 45 : 85, steps })
  }

  // ── B1 → B3 → B4 ─────────────────────────────────────────────────────────
  const b1 = dec(s, 'B1'), stress = find(s, 'b1.waterStress')
  if (b1 && stress) {
    const plan = find(s, 'b1.plan'), harvest = find(s, 'b4.harvest'), delay = amt(s, 'd3.repairDelay')
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(b1.atMinute)} · Hệ thống tưới tắc. Bạn chọn ${b1.choice === 'now' ? 'sửa ngay' : 'để sửa sau ca làm việc'} (B1)${plan?.facts.changedLater ? ', rồi đổi ý sửa sớm hơn' : ''}` }]
    steps.push({ kind: 'change', title: `Cây thiếu nước ${hours(stress.amount)}`, detail: delay > 0 ? `Trong đó ${hours(delay)} chờ thêm vì bão bức xạ buộc phi hành đoàn phải trú ẩn.` : undefined })
    const obs = s.food.observations
    if (obs.length) steps.push({ kind: 'later', title: `Thiết bị ghi lại ${obs.length} lần quan sát trong ${new Set(obs.map((o) => o.day)).size} ngày`, detail: `${obs.filter((o) => !o.irrigationOk).length} lần xảy ra khi hệ thống tưới đang hỏng.` })
    let weight = 50
    if (harvest) {
      const g = f(harvest, 'gramsLostToWaterStress') + f(harvest, 'gramsLostToSlowerGrowthWater')
      if (g >= 1) { steps.push({ kind: 'result', title: `Mẫu thu hoạch nhẹ hơn khoảng ${g} g do thiếu nước`, detail: `Cân được ${harvest.amount} g (cây khỏe mạnh khoảng ${FOOD.expectedGrams} g).` }); weight = 90 }
      else steps.push({ kind: 'avoided', title: 'Thiếu nước ít nên gần như không đổi khối lượng mẫu', detail: `Cân được ${harvest.amount} g.` })
    } else steps.push({ kind: 'unknown', title: 'Bạn chưa thu hoạch nên chưa biết thiếu nước ảnh hưởng thế nào tới khối lượng mẫu' })
    chains.push({ id: 'b1', title: 'Sự cố tưới nước trong nhà kính', target: 'food', weight, steps })
  }

  // ── lamps off for another reason (low battery) ───────────────────────────
  const lampOther = amt(s, 'lamp.off.other')
  if (lampOther >= 60) {
    chains.push({ id: 'lamp', title: 'Đèn nhà kính bị tắt khi pin xuống thấp', target: 'food', weight: 40, steps: [
      { kind: 'change', title: `Pin dự trữ xuống mức tối thiểu nên đèn nhà kính tắt ${hours(lampOther)}` },
      ...(lampResult(s, 'other').length ? lampResult(s, 'other') : [{ kind: 'avoided' as StepKind, title: 'Ảnh hưởng tới sinh trưởng rất nhỏ' }]),
    ] })
  }

  // ── Ice route (C1 → C2 → C3.1 → C4) ──────────────────────────────────────
  const c1 = dec(s, 'C1'), route = find(s, 'c2.route')
  if (c1 && route) {
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(c1.atMinute)} · Bạn chọn khu ${fs(route, 'zone') || c1.choice} và tuyến A* dài ${num(route.amount / 1000)} km (C1, C2)` }]
    steps.push({ kind: 'change', title: `MILO cần khoảng ${num(f(route, 'needKwh'), 0)} / ${ROVER.batteryKwh} kWh pin và ${num(f(route, 'driveHours'))} giờ lái đi về`, detail: route.facts.inPsr ? 'Đích nằm trong vùng tối vĩnh cửu (dữ liệu NASA).' : 'Đích không nằm trong vùng tối vĩnh cửu (dữ liệu NASA).' })
    const wait = find(s, 'rover.chargeWait'), den = amt(s, 'rover.chargeDenied.d1') + amt(s, 'rover.chargeDenied.a3') + amt(s, 'rover.chargeDenied.other')
    if (wait && wait.amount >= 30) steps.push({ kind: 'later', title: `MILO sạc ${hours(wait.amount)} trước khi xuất phát`, detail: den > 0 ? `Trong đó ${hours(den)} việc sạc bị cắt điện nên phải chờ lâu hơn.` : undefined })
    const c31 = dec(s, 'C31')
    if (c31) {
      if (c31.choice === 'slow') steps.push({ kind: 'later', title: `${stamp(c31.atMinute)} · Bạn cho MILO đi chậm qua bãi đá (C3.1)`, detail: `Tốn thêm ${hours(amt(s, 'c31.slow.minutes'))} và ${num(amt(s, 'c31.slow.kwh'))} kWh pin.` })
      else if (c31.choice === 'detour') { const d = find(s, 'c31.detour'); steps.push({ kind: 'later', title: `${stamp(c31.atMinute)} · Bạn cho MILO đi vòng ${num(d?.amount ?? 0, 0)} m (C3.1)`, detail: `Tốn thêm khoảng ${hours(f(d, 'extraMinutes'))} và ${num(f(d, 'extraKwh'))} kWh pin; tránh được bãi đá.` }) }
      else steps.push({ kind: 'later', title: `${stamp(c31.atMinute)} · Bạn cho MILO quay về khi gặp bãi đá (C3.1)`, detail: 'Chuyến khảo sát dừng lại, không thu được mẫu ở khu đã chọn.' })
    }
    const r = s.ice.report
    steps.push(r ? { kind: 'result', title: `Báo cáo băng: ${r.validNeutron} mẫu neutron hợp lệ, độ tin cậy ${r.confidence}`, detail: 'Băng vẫn chưa được xác nhận.' } : { kind: 'unknown', title: 'Chuyến khảo sát chưa hoàn thành khi bạn nộp báo cáo', detail: 'Nên chưa có kết quả đo.' })
    chains.push({ id: 'ice', title: 'Chọn khu và tuyến cho MILO', target: 'ice', weight: c31 || den > 0 ? 75 : 65, steps })
  }

  // ── D2 resupply ──────────────────────────────────────────────────────────
  const d2 = dec(s, 'D2')
  if (d2) {
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(d2.atMinute)} · Bạn chọn ${d2.choice === 'rover' ? 'dùng rover MILO chở hàng' : 'cho hai phi hành gia ra nhận hàng'} (D2)` }]
    let weight = 30, target: Chain['target'] = 'base'
    if (d2.choice === 'rover') {
      const cut = amt(s, 'd2.roverInterrupted')
      if (find(s, 'd2.recall')) { steps.push({ kind: 'change', title: `MILO đang khảo sát (đã đo ${hours(f(find(s, 'd2.recall'), 'surveyedMin'))}) thì được gọi về chở hàng` }); steps.push({ kind: 'later', title: `Khảo sát băng tạm dừng ${hours(cut)}`, detail: 'Các mẫu đã đo vẫn được giữ.' }); weight = 80; target = 'ice' }
      else if (cut > 0) { steps.push({ kind: 'later', title: `Việc chở hàng chen vào kế hoạch khảo sát: tạm dừng ${hours(cut)}` }); weight = 70; target = 'ice' }
      else steps.push({ kind: 'avoided', title: 'MILO đang rảnh nên không làm gián đoạn nghiên cứu nào', detail: `Chuyến chở hàng tốn khoảng ${num(supplyTripKwh(), 0)} kWh pin rover.` })
    } else {
      const o2 = amt(s, 'd2.crewO2')
      if (o2 > 0) steps.push({ kind: 'later', title: `Cả đội dùng thêm khoảng ${num(o2)} kg oxy trong lúc hai người ra ngoài` })
      steps.push({ kind: 'avoided', title: 'MILO không bị gián đoạn', detail: 'Nghiên cứu băng không phải dừng lại vì chuyến tiếp tế.' })
    }
    steps.push(s.supply.stage === 'delivered' ? { kind: 'result', title: 'Hàng về kho, được cộng đúng một lần' } : { kind: 'unknown', title: 'Hàng chưa về kho khi bạn nộp báo cáo' })
    chains.push({ id: 'd2', title: 'Chuyến tiếp tế', target, weight, steps })
  }

  // ── D3 radiation (rover branch) ──────────────────────────────────────────
  const d3 = dec(s, 'D3')
  if (d3) {
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(d3.atMinute)} · Bão bức xạ lúc MILO đang đo: bạn ${d3.choice === 'wait' ? 'cho MILO chờ rồi đo lại' : 'cho MILO về sớm'} (D3)` }]
    const bad = amt(s, 'd3.invalidNeutron')
    if (d3.choice === 'wait') { steps.push({ kind: 'change', title: `MILO ở lại thêm ${hours(amt(s, 'd3.extraSurvey'))}${amt(s, 'd3.surveyHold') > 0 ? `, chờ ${hours(amt(s, 'd3.surveyHold'))} cho hết bức xạ` : ''}` }) }
    else steps.push({ kind: 'change', title: `MILO về với ${amt(s, 'd3.earlyReturn')} mẫu neutron hợp lệ đã đo trước đó` })
    if (bad > 0) steps.push({ kind: 'later', title: `${bad} lần đo neutron bị loại vì nhiễu bức xạ`, detail: 'Máy đo nhiệt và quang phổ không bị ảnh hưởng.' })
    steps.push(s.ice.report ? { kind: 'result', title: `Báo cáo băng có ${s.ice.report.validNeutron} mẫu hợp lệ, độ tin cậy ${s.ice.report.confidence}` } : { kind: 'unknown', title: 'Chuyến khảo sát chưa hoàn thành khi bạn nộp báo cáo' })
    chains.push({ id: 'd3', title: 'Bão bức xạ khi MILO đang đo', target: 'ice', weight: 60, steps })
  }
  return chains.sort((a, b) => b.weight - a.weight)
}

/** Why each result came out as it did, from the measured numbers only. Empty when nothing measurable explains it. */
function whyFood(s: GameState): string[] {
  const out: string[] = [], h = find(s, 'b4.harvest')
  if (!h) { if (s.food.started) out.push(`Cây mới lớn ${Math.round(s.food.growth * 100)}% và chưa được thu hoạch, nên chưa có kết quả để giải thích.`); return out }
  out.push(`Mẫu thu hoạch cân được ${h.amount} g, trong khi cây khỏe mạnh khoảng ${FOOD.expectedGrams} g.`)
  const b1 = dec(s, 'B1'), water = f(h, 'gramsLostToWaterStress') + f(h, 'gramsLostToSlowerGrowthWater')
  if (b1 && water >= 1) out.push(`Bạn chọn ${b1.choice === 'now' ? 'sửa ngay' : 'sửa sau'} ở B1, nên cây thiếu nước ${hours(amt(s, 'b1.waterStress'))}. Khi thu hoạch, việc đó làm mẫu nhẹ hơn khoảng ${water} g.`)
  else if (b1) out.push('Hệ thống tưới có hỏng ở B1 nhưng được sửa kịp, nên gần như không làm mẫu nhẹ đi.')
  const lampCauses: [string, number, number, string][] = [
    ['d1', amt(s, 'lamp.off.d1'), f(h, 'gramsLampD1'), `lúc ánh sáng giảm (D1) ${dec(s, 'D1')?.choice === 'rover' ? 'bạn ưu tiên sạc rover' : 'điện không đủ cho cả hai việc'}`],
    ['a3', amt(s, 'lamp.off.a3'), f(h, 'gramsLampA3'), 'sau khi thu gọn giàn pin (A3) pin dự trữ xuống thấp'],
    ['other', amt(s, 'lamp.off.other'), f(h, 'gramsLampOther'), 'pin dự trữ xuống mức tối thiểu'],
  ]
  let lamp = 0
  for (const [, min, grams, why] of lampCauses) {
    if (min <= 0) continue
    lamp += grams
    out.push(grams >= 1 ? `Đèn nhà kính tắt ${hours(min)} vì ${why}, nên cây lớn chậm hơn và mẫu nhẹ hơn khoảng ${grams} g.` : `Đèn nhà kính tắt ${hours(min)} vì ${why}, nhưng ảnh hưởng tới khối lượng mẫu rất nhỏ.`)
  }
  const rest = Math.max(0, FOOD.expectedGrams - h.amount - water - lamp)
  if (rest >= 5) out.push(`Phần còn lại (khoảng ${Math.round(rest)} g) là do cây mới đạt ${f(h, 'growthPercent')}% sinh trưởng lúc bạn thu hoạch.`)
  const r = s.food.report
  if (r) out.push(`Bạn quan sát ${new Set(s.food.observations.map((o) => o.day)).size} ngày khác nhau, nên độ tin cậy của dữ liệu là ${r.reliability}.`)
  return out
}
function whyIce(s: GameState): string[] {
  const out: string[] = [], r = s.ice.report, route = find(s, 'c2.route')
  if (!route) return out
  if (!r) { out.push('MILO chưa hoàn thành chuyến khảo sát khi bạn nộp báo cáo, nên chưa có kết quả đo để giải thích.'); return out }
  out.push(`Bạn chọn khu ${fs(route, 'zone')} và tuyến ${num(route.amount / 1000)} km. Khu này ${route.facts.inPsr ? 'nằm trong' : 'không nằm trong'} vùng tối vĩnh cửu theo dữ liệu NASA, nên MILO đo được chỉ số hydro ${r.meanIndex} (mô phỏng của game).`)
  const c31 = dec(s, 'C31')
  if (c31?.choice === 'slow') out.push(`Ở C3.1 bạn cho đi chậm, nên chuyến đi tốn thêm ${hours(amt(s, 'c31.slow.minutes'))} và ${num(amt(s, 'c31.slow.kwh'))} kWh pin.`)
  if (c31?.choice === 'detour') out.push(`Ở C3.1 bạn cho đi vòng ${num(amt(s, 'c31.detour'), 0)} m, nên chuyến đi dài hơn nhưng tránh được bãi đá.`)
  const cut = amt(s, 'd2.roverInterrupted')
  if (dec(s, 'D2')?.choice === 'rover' && cut > 0) out.push(`Ở D2 bạn dùng MILO chở hàng, nên khảo sát bị tạm dừng ${hours(cut)}.`)
  const d1w = amt(s, 'rover.chargeDenied.d1')
  if (d1w > 0) out.push(dec(s, 'D1')?.choice === 'greenhouse' ? `Ở D1 bạn ưu tiên đèn nhà kính, nên việc sạc của MILO bị cắt ${hours(d1w)} và rover xuất phát muộn hơn.` : `Lúc ánh sáng giảm (D1), điện không đủ nên việc sạc của MILO bị cắt ${hours(d1w)} và rover xuất phát muộn hơn.`)
  const bad = amt(s, 'd3.invalidNeutron')
  out.push(bad > 0 ? `Bão bức xạ (D3) làm ${bad} lần đo neutron bị loại, nên chỉ còn ${r.validNeutron} mẫu hợp lệ và độ tin cậy là ${r.confidence}.` : `Có ${r.validNeutron} mẫu neutron hợp lệ nên độ tin cậy là ${r.confidence}.`)
  return out
}

export function endingAnalysis(s: GameState): EndingAnalysis {
  const fd = s.food, ic = s.ice
  const food: BranchResult = fd.report
    ? { done: true, status: 'Hoàn thành', result: [`Mẫu cân được ${fd.report.grams} g (cây khỏe mạnh khoảng ${fd.report.expected} g), sinh trưởng ${fd.report.growthPercent}%.`, `Độ tin cậy của dữ liệu: ${fd.report.reliability}.`, 'Đây là kết quả nghiên cứu, không phải nguồn thức ăn đủ nuôi cả đội.'] }
    : { done: false, status: !fd.started ? 'Chưa bắt đầu' : fd.stage === 'harvested' ? 'Đã thu hoạch, chưa lập báo cáo' : 'Chưa hoàn thành', result: fd.started ? [`Cây đã lớn ${Math.round(fd.growth * 100)}%${fd.growth < FOOD.readyIndex ? ' (chưa đủ để thu hoạch)' : ''}.`, `${fd.observations.length} lần quan sát.`] : ['Bạn chưa bắt đầu nghiên cứu thực phẩm.'] }
  const ice: BranchResult = ic.report
    ? { done: true, status: 'Hoàn thành', result: [`Khu ${ic.zone}${ic.route ? ` · ${ic.route.name}` : ''}: ${ic.route?.inPsr ? 'nằm trong vùng tối vĩnh cửu' : 'không nằm trong vùng tối vĩnh cửu'} (dữ liệu NASA).`, `Kết quả mô phỏng: chỉ số hydro ${ic.report.meanIndex} từ ${ic.report.validNeutron} mẫu hợp lệ (${ic.report.invalidNeutron} mẫu bị loại), độ tin cậy ${ic.report.confidence}.`, 'Băng vẫn CHƯA được xác nhận.'] }
    : { done: false, status: !ic.zone ? 'Chưa bắt đầu' : 'Chưa hoàn thành', result: ic.zone ? [`Khu đã chọn: ${ic.zone}.`, `${ic.samples.filter((x) => x.valid && x.instrument === 'neutron').length} mẫu neutron hợp lệ đã thu.`] : ['MILO chưa đi khảo sát.'] }
  const early: string[] = []
  const missed = [!d1Seen(s) && 'ánh sáng giảm (D1)', !dec(s, 'D2') && !s.fired.includes('D2') && 'chuyến tiếp tế (D2)', !s.fired.includes('D3') && 'bão bức xạ (D3)'].filter(Boolean)
  if (s.ending?.reason === 'submitted' && missed.length) early.push(`Bạn nộp báo cáo trước khi ${missed.join(', ')} xảy ra, nên các sự kiện đó không được tính vào kết quả.`)
  return {
    reason: s.ending?.reason === 'food' ? 'Kho thực phẩm đóng gói chạm mức dự trữ nên nhiệm vụ phải kết thúc.' : 'Bạn đã nộp báo cáo và cho cả đội trở về.',
    food, ice, chains: buildChains(s), why: { food: whyFood(s), ice: whyIce(s) }, early,
  }
}
const d1Seen = (s: GameState) => !!find(s, 'd1.check')

