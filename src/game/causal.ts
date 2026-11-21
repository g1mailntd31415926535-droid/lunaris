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

const stamp = (minute: number) => { const t = MISSION_START.minuteOfDay + Math.floor(minute); return `Day ${Math.floor(minute / DAY) + 1} · ${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
const hours = (m: number) => { const h = m / 60; return h < 1 ? `${Math.round(m)} min` : `${Math.round(h * 10) / 10} h` }
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
  const out: ChainStep[] = [{ kind: 'choice', title: `${stamp(d1.atMinute)} · You put ${d1.choice === 'rover' ? 'rover charging first' : 'the greenhouse lights first'} (D1)` }]
  const lamp = amt(s, 'lamp.off.d1'), denied = amt(s, 'rover.chargeDenied.d1')
  if (lamp > 0) out.push({ kind: 'later', title: `Greenhouse lights off for ${hours(lamp)}`, detail: d1.choice === 'rover' ? 'Optional power went to charging the rover first.' : 'Even with the greenhouse first, there was not enough power for the whole low-light period.' })
  if (denied > 0) out.push({ kind: 'later', title: `MILO charged slowly: ${hours(denied)} extra wait for a full battery`, detail: d1.choice === 'greenhouse' ? 'Optional power went to the greenhouse lights first.' : 'There still was not enough power for charging.' })
  if (!lamp && !denied) out.push({ kind: 'avoided', title: 'Nothing was switched off', detail: 'There was enough power for both the greenhouse lights and rover charging during the low light.' })
  return out
}

/** Growth / harvest consequences of lamp-off time for one cause (d1 / a3 / other), only when measured. */
function lampResult(s: GameState, phase: 'd1' | 'a3' | 'other'): ChainStep[] {
  const lost = amt(s, `growth.lostLamp.${phase}`), h = find(s, 'b4.harvest')
  if (lost < 0.01) return []
  const grams = f(h, phase === 'd1' ? 'gramsLampD1' : phase === 'a3' ? 'gramsLampA3' : 'gramsLampOther')
  return [{ kind: 'result', title: `The plants grew about ${Math.round(lost * 100)} percentage points less`, detail: h ? (grams >= 1 ? `The harvested sample was about ${grams} g lighter than with the lights always on.` : 'The effect on sample weight was very small (under 1 g).') : 'You have not harvested yet, so the difference could not be weighed.' }]
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
      steps.push({ kind: 'choice', title: `${stamp(a3.atMinute)} · You kept the solar array open despite the rock-shower forecast (A3)` })
      const cap = find(s, 'a3.capacity')
      if (!cap) steps.push({ kind: 'unknown', title: 'The rock shower was not over when you submitted your reports', detail: 'It is not known whether the array got scratched.' })
      else {
        steps.push({ kind: 'change', title: `Maximum power dropped from 100% to ${100 - cap.amount}% (for good)`, detail: 'The rocks scratched the panel surface; it cannot be repaired during this mission.' })
        weight = 60
        if (!d1Check) steps.push({ kind: 'unknown', title: 'The low-light event (D1) had not happened before you submitted', detail: 'So we cannot tell what else losing 10% would have changed.' })
        else if (d1Check.amount <= 0) steps.push({ kind: 'avoided', title: 'At D1 there was still enough power for both the greenhouse and the rover', detail: `The array made only ${num(f(d1Check, 'productionKw'))} kW in the low light, but the battery made up the difference, so losing 10% caused no shortage.` })
        else {
          const share = d1Check.amount - f(d1Check, 'deficitIfFullArrayKwh')
          if (share < 0.5) steps.push({ kind: 'avoided', title: `At D1 power was ${num(d1Check.amount)} kWh short, but not because of A3`, detail: 'Even at 100% the array would have been just as short.' })
          else {
            d1Covered = true; weight = 100
            steps.push({ kind: 'later', title: `At D1 (${stamp(d1Check.atMinute)}), available power was ${num(d1Check.amount)} kWh short`, detail: `The greenhouse and rover needed ${num(f(d1Check, 'demandKwh'), 0)} kWh but only ${num(Math.max(0, f(d1Check, 'spareKwh')), 0)} kWh was spare. ` + (share >= d1Check.amount - 0.05 ? 'With the array at 100%, there would have been enough.' : `${num(share)} kWh of the shortage came from the lost 10%; the rest would have been missing even with an undamaged array.`) })
            const more = d1Consequences(s)
            steps.push(...more)
            for (const step of lampResult(s, 'd1')) { steps.push(step); target = 'food' }
            if (amt(s, 'rover.chargeDenied.d1') > 0) target = target === 'food' ? 'food' : 'ice'
          }
        }
      }
    } else {
      steps.push({ kind: 'choice', title: `${stamp(a3.atMinute)} · You folded the solar array before the rock shower (A3)` })
      const out = find(s, 'a3.stowOutage')
      if (!out || out.amount <= 0) steps.push({ kind: 'unknown', title: 'The array had not reopened when you submitted your reports' })
      else {
        steps.push({ kind: 'change', title: `No solar power for ${hours(out.amount)}`, detail: `The battery fell from ${num(f(out, 'batteryStartKwh'), 0)} kWh to a low of ${num(amt(s, 'a3.stowBattery'), 0)} kWh.` })
        steps.push({ kind: 'result', title: 'The array kept 100% of its power', detail: 'You traded a little power today to protect the array for the whole mission.' })
        weight = 55
        const lamp = amt(s, 'lamp.off.a3'), denied = amt(s, 'rover.chargeDenied.a3')
        if (lamp > 0) { steps.push({ kind: 'later', title: `The greenhouse lights had to go off for ${hours(lamp)}`, detail: 'The battery reached its reserve level, so optional power was cut first.' }, ...lampResult(s, 'a3')); weight = 75; target = 'food' }
        if (denied > 0) { steps.push({ kind: 'later', title: `MILO charged slowly for ${hours(denied)} because the battery was low` }); weight = 75; if (target === 'base') target = 'ice' }
        if (!lamp && !denied) steps.push({ kind: 'avoided', title: 'Nothing was switched off', detail: 'The battery had enough, so the greenhouse and rover charging were not affected.' })
      }
    }
    chains.push({ id: 'a3', title: 'The solar array and the rock shower', target, weight, steps })
  }

  // ── D1 on its own (when A3 did not already explain it) ───────────────────
  if (!d1Covered && d1Dec && d1Check) {
    const steps: ChainStep[] = [{ kind: 'later', title: `${stamp(d1Check.atMinute)} · Light dropped and available power was ${num(d1Check.amount)} kWh short (array at ${f(d1Check, 'capacityPercent')}%)` }, ...d1Consequences(s).slice(0)]
    const lampSteps = lampResult(s, 'd1'); steps.push(...lampSteps)
    const target: Chain['target'] = lampSteps.length || amt(s, 'lamp.off.d1') > 0 ? 'food' : amt(s, 'rover.chargeDenied.d1') > 0 ? 'ice' : 'base'
    chains.push({ id: 'd1', title: 'Low light and sharing the power', target, weight: target === 'base' ? 45 : 85, steps })
  }

  // ── B1 → B3 → B4 ─────────────────────────────────────────────────────────
  const b1 = dec(s, 'B1'), stress = find(s, 'b1.waterStress')
  if (b1 && stress) {
    const plan = find(s, 'b1.plan'), harvest = find(s, 'b4.harvest'), delay = amt(s, 'd3.repairDelay')
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(b1.atMinute)} · The watering system was blocked. You chose to ${b1.choice === 'now' ? 'fix it now' : 'fix it after the shift'} (B1)${plan?.facts.changedLater ? ', then changed your mind and fixed it sooner' : ''}` }]
    steps.push({ kind: 'change', title: `The plants went ${hours(stress.amount)} without water`, detail: delay > 0 ? `${hours(delay)} of that was extra waiting because a radiation storm sent the crew into the shelter.` : undefined })
    const obs = s.food.observations
    if (obs.length) steps.push({ kind: 'later', title: `The sensors logged ${obs.length} observations over ${new Set(obs.map((o) => o.day)).size} day(s)`, detail: `${obs.filter((o) => !o.irrigationOk).length} of them while the watering system was broken.` })
    let weight = 50
    if (harvest) {
      const g = f(harvest, 'gramsLostToWaterStress') + f(harvest, 'gramsLostToSlowerGrowthWater')
      if (g >= 1) { steps.push({ kind: 'result', title: `The harvested sample was about ${g} g lighter because of the lack of water`, detail: `It weighed ${harvest.amount} g (a healthy plant: about ${FOOD.expectedGrams} g).` }); weight = 90 }
      else steps.push({ kind: 'avoided', title: 'The plants were thirsty only briefly, so the sample weight barely changed', detail: `It weighed ${harvest.amount} g.` })
    } else steps.push({ kind: 'unknown', title: 'You have not harvested yet, so the effect of the lack of water on sample weight is unknown' })
    chains.push({ id: 'b1', title: 'The greenhouse watering fault', target: 'food', weight, steps })
  }

  // ── lamps off for another reason (low battery) ───────────────────────────
  const lampOther = amt(s, 'lamp.off.other')
  if (lampOther >= 60) {
    chains.push({ id: 'lamp', title: 'Greenhouse lights switched off when the battery ran low', target: 'food', weight: 40, steps: [
      { kind: 'change', title: `The battery hit its minimum, so the greenhouse lights were off for ${hours(lampOther)}` },
      ...(lampResult(s, 'other').length ? lampResult(s, 'other') : [{ kind: 'avoided' as StepKind, title: 'The effect on growth was very small' }]),
    ] })
  }

  // ── Ice route (C1 → C2 → C3.1 → C4) ──────────────────────────────────────
  const c1 = dec(s, 'C1'), route = find(s, 'c2.route')
  if (c1 && route) {
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(c1.atMinute)} · You chose Zone ${fs(route, 'zone') || c1.choice} and the ${num(route.amount / 1000)} km A* route (C1, C2)` }]
    steps.push({ kind: 'change', title: `MILO needed about ${num(f(route, 'needKwh'), 0)} of ${ROVER.batteryKwh} kWh and ${num(f(route, 'driveHours'))} hours of driving there and back`, detail: route.facts.inPsr ? 'The destination is inside a permanently shadowed region (NASA data).' : 'The destination is not inside a permanently shadowed region (NASA data).' })
    const wait = find(s, 'rover.chargeWait'), den = amt(s, 'rover.chargeDenied.d1') + amt(s, 'rover.chargeDenied.a3') + amt(s, 'rover.chargeDenied.other')
    if (wait && wait.amount >= 30) steps.push({ kind: 'later', title: `MILO charged for ${hours(wait.amount)} before setting off`, detail: den > 0 ? `For ${hours(den)} of that, charging power was cut, so the wait was longer.` : undefined })
    const c31 = dec(s, 'C31')
    if (c31) {
      if (c31.choice === 'slow') steps.push({ kind: 'later', title: `${stamp(c31.atMinute)} · You had MILO drive slowly through the rubble (C3.1)`, detail: `It cost an extra ${hours(amt(s, 'c31.slow.minutes'))} and ${num(amt(s, 'c31.slow.kwh'))} kWh of battery.` })
      else if (c31.choice === 'detour') { const d = find(s, 'c31.detour'); steps.push({ kind: 'later', title: `${stamp(c31.atMinute)} · You had MILO detour ${num(d?.amount ?? 0, 0)} m (C3.1)`, detail: `It cost about ${hours(f(d, 'extraMinutes'))} and ${num(f(d, 'extraKwh'))} kWh more, and avoided the rubble.` }) }
      else steps.push({ kind: 'later', title: `${stamp(c31.atMinute)} · You brought MILO back when it met the rubble (C3.1)`, detail: 'The survey stopped and no samples were collected at the chosen zone.' })
    }
    const r = s.ice.report
    steps.push(r ? { kind: 'result', title: `Ice report: ${r.validNeutron} valid neutron samples, ${r.confidence} confidence`, detail: 'Ice is still not confirmed.' } : { kind: 'unknown', title: 'The survey was not finished when you submitted your reports', detail: 'So there are no measurements yet.' })
    chains.push({ id: 'ice', title: 'Choosing MILO’s zone and route', target: 'ice', weight: c31 || den > 0 ? 75 : 65, steps })
  }

  // ── D2 resupply ──────────────────────────────────────────────────────────
  const d2 = dec(s, 'D2')
  if (d2) {
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(d2.atMinute)} · You chose to ${d2.choice === 'rover' ? 'send MILO the rover for the cargo' : 'send two astronauts for the cargo'} (D2)` }]
    let weight = 30, target: Chain['target'] = 'base'
    if (d2.choice === 'rover') {
      const cut = amt(s, 'd2.roverInterrupted')
      if (find(s, 'd2.recall')) { steps.push({ kind: 'change', title: `MILO was surveying (${hours(f(find(s, 'd2.recall'), 'surveyedMin'))} measured) when it was called back for the cargo` }); steps.push({ kind: 'later', title: `The ice survey paused for ${hours(cut)}`, detail: 'The samples already measured were kept.' }); weight = 80; target = 'ice' }
      else if (cut > 0) { steps.push({ kind: 'later', title: `The cargo run cut into the survey plan: paused for ${hours(cut)}` }); weight = 70; target = 'ice' }
      else steps.push({ kind: 'avoided', title: 'MILO was free, so no research was interrupted', detail: `The cargo run used about ${num(supplyTripKwh(), 0)} kWh of rover battery.` })
    } else {
      const o2 = amt(s, 'd2.crewO2')
      if (o2 > 0) steps.push({ kind: 'later', title: `The crew used about ${num(o2)} kg of extra oxygen while two of them were outside` })
      steps.push({ kind: 'avoided', title: 'MILO was not interrupted', detail: 'The ice research did not have to stop for the resupply.' })
    }
    steps.push(s.supply.stage === 'delivered' ? { kind: 'result', title: 'The supplies reached the store and were counted exactly once' } : { kind: 'unknown', title: 'The supplies had not reached the store when you submitted' })
    chains.push({ id: 'd2', title: 'The resupply', target, weight, steps })
  }

  // ── D3 radiation (rover branch) ──────────────────────────────────────────
  const d3 = dec(s, 'D3')
  if (d3) {
    const steps: ChainStep[] = [{ kind: 'choice', title: `${stamp(d3.atMinute)} · A radiation storm hit while MILO was measuring: you ${d3.choice === 'wait' ? 'had MILO wait and measure again' : 'brought MILO home early'} (D3)` }]
    const bad = amt(s, 'd3.invalidNeutron')
    if (d3.choice === 'wait') { steps.push({ kind: 'change', title: `MILO stayed ${hours(amt(s, 'd3.extraSurvey'))} longer${amt(s, 'd3.surveyHold') > 0 ? `, waiting ${hours(amt(s, 'd3.surveyHold'))} for the storm to end` : ''}` }) }
    else steps.push({ kind: 'change', title: `MILO came back with the ${amt(s, 'd3.earlyReturn')} valid neutron samples measured before` })
    if (bad > 0) steps.push({ kind: 'later', title: `${bad} neutron readings were rejected because of radiation noise`, detail: 'The thermometer and spectrometer were not affected.' })
    steps.push(s.ice.report ? { kind: 'result', title: `The ice report has ${s.ice.report.validNeutron} valid samples, ${s.ice.report.confidence} confidence` } : { kind: 'unknown', title: 'The survey was not finished when you submitted your reports' })
    chains.push({ id: 'd3', title: 'A radiation storm during MILO’s measurements', target: 'ice', weight: 60, steps })
  }
  return chains.sort((a, b) => b.weight - a.weight)
}

/** Why each result came out as it did, from the measured numbers only. Empty when nothing measurable explains it. */
function whyFood(s: GameState): string[] {
  const out: string[] = [], h = find(s, 'b4.harvest')
  if (!h) { if (s.food.started) out.push(`The plants had only grown ${Math.round(s.food.growth * 100)}% and were not harvested, so there is no result to explain yet.`); return out }
  out.push(`The harvested sample weighed ${h.amount} g, while a healthy plant is about ${FOOD.expectedGrams} g.`)
  const b1 = dec(s, 'B1'), water = f(h, 'gramsLostToWaterStress') + f(h, 'gramsLostToSlowerGrowthWater')
  if (b1 && water >= 1) out.push(`At B1 you chose to ${b1.choice === 'now' ? 'fix it now' : 'fix it later'}, so the plants went ${hours(amt(s, 'b1.waterStress'))} without water. At harvest, that made the sample about ${water} g lighter.`)
  else if (b1) out.push('The watering system broke at B1 but was fixed in time, so the sample was hardly any lighter.')
  const lampCauses: [string, number, number, string][] = [
    ['d1', amt(s, 'lamp.off.d1'), f(h, 'gramsLampD1'), `during the low light (D1) ${dec(s, 'D1')?.choice === 'rover' ? 'you put rover charging first' : 'there was not enough power for both jobs'}`],
    ['a3', amt(s, 'lamp.off.a3'), f(h, 'gramsLampA3'), 'the battery ran low after the array was folded (A3)'],
    ['other', amt(s, 'lamp.off.other'), f(h, 'gramsLampOther'), 'the battery hit its minimum level'],
  ]
  let lamp = 0
  for (const [, min, grams, why] of lampCauses) {
    if (min <= 0) continue
    lamp += grams
    out.push(grams >= 1 ? `The greenhouse lights were off for ${hours(min)} because ${why}, so the plants grew more slowly and the sample was about ${grams} g lighter.` : `The greenhouse lights were off for ${hours(min)} because ${why}, but the effect on sample weight was very small.`)
  }
  const rest = Math.max(0, FOOD.expectedGrams - h.amount - water - lamp)
  if (rest >= 5) out.push(`The rest (about ${Math.round(rest)} g) is because the plants had reached only ${f(h, 'growthPercent')}% growth when you harvested.`)
  const r = s.food.report
  if (r) out.push(`You observed on ${new Set(s.food.observations.map((o) => o.day)).size} different day(s), so the data reliability is ${r.reliability}.`)
  return out
}
function whyIce(s: GameState): string[] {
  const out: string[] = [], r = s.ice.report, route = find(s, 'c2.route')
  if (!route) return out
  if (!r) { out.push('MILO had not finished its survey when you submitted your reports, so there are no measurements to explain yet.'); return out }
  out.push(`You chose Zone ${fs(route, 'zone')} and the ${num(route.amount / 1000)} km route. According to NASA data this zone is ${route.facts.inPsr ? 'inside' : 'not inside'} a permanently shadowed region, so MILO measured a hydrogen index of ${r.meanIndex} (simulated by the game).`)
  const c31 = dec(s, 'C31')
  if (c31?.choice === 'slow') out.push(`At C3.1 you chose to drive slowly, so the trip took an extra ${hours(amt(s, 'c31.slow.minutes'))} and ${num(amt(s, 'c31.slow.kwh'))} kWh of battery.`)
  if (c31?.choice === 'detour') out.push(`At C3.1 you chose a ${num(amt(s, 'c31.detour'), 0)} m detour, so the trip was longer but avoided the rubble.`)
  const cut = amt(s, 'd2.roverInterrupted')
  if (dec(s, 'D2')?.choice === 'rover' && cut > 0) out.push(`At D2 you used MILO to carry the cargo, so the survey paused for ${hours(cut)}.`)
  const d1w = amt(s, 'rover.chargeDenied.d1')
  if (d1w > 0) out.push(dec(s, 'D1')?.choice === 'greenhouse' ? `At D1 you put the greenhouse lights first, so MILO’s charging was cut for ${hours(d1w)} and the rover left later.` : `During the low light (D1) there was not enough power, so MILO’s charging was cut for ${hours(d1w)} and the rover left later.`)
  const bad = amt(s, 'd3.invalidNeutron')
  out.push(bad > 0 ? `The radiation storm (D3) caused ${bad} neutron readings to be rejected, leaving ${r.validNeutron} valid samples and ${r.confidence} confidence.` : `There are ${r.validNeutron} valid neutron samples, so the confidence is ${r.confidence}.`)
  return out
}

export function endingAnalysis(s: GameState): EndingAnalysis {
  const fd = s.food, ic = s.ice
  const food: BranchResult = fd.report
    ? { done: true, status: 'Complete', result: [`The sample weighed ${fd.report.grams} g (a healthy plant: about ${fd.report.expected} g), growth ${fd.report.growthPercent}%.`, `Data reliability: ${fd.report.reliability}.`, 'This is a research result, not enough food to feed the crew.'] }
    : { done: false, status: !fd.started ? 'Not started' : fd.stage === 'harvested' ? 'Harvested, report not written yet' : 'Not complete', result: fd.started ? [`The plants have grown ${Math.round(fd.growth * 100)}%${fd.growth < FOOD.readyIndex ? ' (not ready to harvest yet)' : ''}.`, `${fd.observations.length} observations.`] : ['You have not started food research.'] }
  const ice: BranchResult = ic.report
    ? { done: true, status: 'Complete', result: [`Zone ${ic.zone}${ic.route ? ` · ${ic.route.name}` : ''}: ${ic.route?.inPsr ? 'inside a permanently shadowed region' : 'not inside a permanently shadowed region'} (NASA data).`, `Simulated result: hydrogen index ${ic.report.meanIndex} from ${ic.report.validNeutron} valid samples (${ic.report.invalidNeutron} rejected), ${ic.report.confidence} confidence.`, 'Ice is still NOT confirmed.'] }
    : { done: false, status: !ic.zone ? 'Not started' : 'Not complete', result: ic.zone ? [`Chosen zone: ${ic.zone}.`, `${ic.samples.filter((x) => x.valid && x.instrument === 'neutron').length} valid neutron samples collected.`] : ['MILO has not gone surveying.'] }
  const early: string[] = []
  const missed = [!d1Seen(s) && 'the low light (D1)', !dec(s, 'D2') && !s.fired.includes('D2') && 'the resupply (D2)', !s.fired.includes('D3') && 'the radiation storm (D3)'].filter(Boolean)
  if (s.ending?.reason === 'submitted' && missed.length) early.push(`You submitted your reports before ${missed.join(', ')} happened, so those events are not part of the result.`)
  return {
    reason: s.ending?.reason === 'food' ? 'The packaged food reached its reserve level, so the mission had to end.' : 'You submitted your reports and sent the crew home.',
    food, ice, chains: buildChains(s), why: { food: whyFood(s), ice: whyIce(s) }, early,
  }
}
const d1Seen = (s: GameState) => !!find(s, 'd1.check')

