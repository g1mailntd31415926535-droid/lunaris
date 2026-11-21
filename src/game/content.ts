// Player-facing text for every decision and the ending report (Vietnamese, for ages 7–12).
// Kept apart from the engine so wording can change without touching gameplay rules.
import type { Decision, GameState, RouteFacts, Zone } from './types.ts'
import { A1, CAPACITY, CREW, FOOD, LIFE, POWER, ROVER, SCHEDULE, SUPPLY } from './scenario.ts'
import { roverEnergyNeed } from './reducer.ts'

export interface ZoneInfo { zone: Zone; name: string; route: RouteFacts | null; reason?: string }
export interface WorldFacts { zones: ZoneInfo[]; detourM?: number | null; detourReason?: string }
/** Predicted resource level (percent of capacity) right after choosing, from the real state. */
export interface ResourcePreview { key: 'battery' | 'water' | 'oxygen' | 'food'; before: number; after: number }
export interface OptionCopy { id: string; label: string; gain: string; risk: string; disabled?: boolean; reason?: string; desc?: string; preview?: ResourcePreview[] }
export interface DecisionCopy { eyebrow: string; title: string; intro: string; options: OptionCopy[]; note?: string; building?: string; question?: string }
/** Short header topic per event (EventHeader: "A1 · ĐIỆN VÀ NƯỚC"). */
export const EVENT_TOPIC: Record<string, string> = { A1: 'POWER & WATER', A2: 'OXYGEN', A3: 'SOLAR ARRAY', B: 'GREENHOUSE', B1: 'GREENHOUSE', B4: 'HARVEST', C1: 'CHOOSE A SURVEY ZONE', C2: 'CHOOSE A ROUTE', C31: 'TROUBLE ON THE ROUTE', 'C3.1': 'TROUBLE ON THE ROUTE', 'C3.2': 'SURVEY', C4: 'ICE REPORT', D1: 'LIGHT DROPS', D2: 'RESUPPLY', D3: 'RADIATION', END: 'MISSION END', FREE: 'GUIDE' }
const pct = (v: number, cap: number) => Math.round(v / cap * 100)

const km = (m: number) => `${(m / 1000).toFixed(1)} km`

export function decisionCopy(d: Decision, _s: GameState, world: WorldFacts): DecisionCopy {
  switch (d.key) {
    case 'A1': {
      // Same arithmetic as the reducer (A1 case), so the preview equals what will happen.
      const r = _s.resources, litres = Math.min(A1.extraRecycleL, r.wastewater, CAPACITY.water - r.water)
      const charge = Math.min(CAPACITY.battery - r.battery, A1.surplusKwh * A1.chargeEfficiency)
      return {
      eyebrow: 'STAGE A1 · POWER & WATER', building: 'water',
      title: `Strong sunlight today: the panels made ${A1.surplusKwh} kWh of extra power`,
      question: 'Commander, where should this power go?',
      intro: '',
      options: [
        { id: 'recycle', label: 'Recycle more water', desc: `The tank holds ${Math.round(litres)} L of used water waiting to be cleaned`, gain: '', risk: '', preview: [{ key: 'water', before: pct(r.water, CAPACITY.water), after: pct(r.water + litres * LIFE.recovery, CAPACITY.water) }, { key: 'battery', before: pct(r.battery, CAPACITY.battery), after: pct(r.battery, CAPACITY.battery) }] },
        { id: 'battery', label: 'Charge the backup battery', desc: `Adds ${Math.round(charge)} kWh to the battery`, gain: '', risk: '', preview: [{ key: 'water', before: pct(r.water, CAPACITY.water), after: pct(r.water, CAPACITY.water) }, { key: 'battery', before: pct(r.battery, CAPACITY.battery), after: pct(r.battery + charge, CAPACITY.battery) }] },
      ],
      }
    }
    case 'A3': return {
      eyebrow: 'STAGE A3 · SOLAR ARRAY', building: 'solar',
      title: 'A shower of tiny space rocks is on its way!',
      intro: `The system forecasts a period when more tiny space rocks than usual will pass near the Moon. With no air to protect them, these fast little grains can scratch the solar panels. In the game this lasts ${Math.round(SCHEDULE.a3HazardMin / 60)} hours (an assumption).`,
      options: [
        { id: 'keep', label: 'Keep the array open', gain: 'Power keeps flowing during the danger.', risk: `The panels get scratched: ${POWER.a3LossFraction * 100} % of their power is lost for good and cannot be repaired.` },
        { id: 'stow', label: 'Fold the array away', gain: 'The panels stay safe and come back at full 100 %.', risk: `No solar power for about ${Math.round((SCHEDULE.a3PrepMin + SCHEDULE.a3HazardMin + SCHEDULE.a3RedeployMin) / 60)} hours; the base runs on its battery.` },
      ],
      note: 'Tiny space rocks (micrometeoroids) really do hit the Moon, but this forecast and its timing are game assumptions.',
    }
    case 'B1': return {
      eyebrow: 'FOOD RESEARCH · B1', building: 'greenhouse',
      title: 'The greenhouse watering pipe is blocked',
      intro: 'The plants are not getting water. The longer they go without it, the weaker they get.',
      options: [
        { id: 'now', label: 'Fix it now', gain: `The plants go without water for only about ${SCHEDULE.b1RepairMin / 60} more hours.`, risk: 'One astronaut has to stop what they are doing.' },
        { id: 'later', label: 'Fix it after the shift', gain: 'The crew finishes the work they started.', risk: `The plants go without water for about ${Math.round((SCHEDULE.b1DelayMin + SCHEDULE.b1RepairMin) / 60)} hours and may be smaller at harvest.` },
      ],
    }
    case 'C1': return {
      eyebrow: 'ICE RESEARCH · C1', building: 'rover',
      title: 'Choose a zone for MILO to survey',
      intro: 'The four zones A–D come from NASA data. A permanently shadowed region (PSR) is cold enough to hold ice, but nobody has confirmed ice here yet.',
      options: world.zones.map((z) => ({ id: z.zone, label: `Zone ${z.zone} · ${z.name}`, gain: z.route ? `${z.route.inPsr ? 'Inside a permanently shadowed region (PSR)' : 'Not inside a PSR'} · route ${km(z.route.lengthM)}.` : 'No safe route.', risk: z.route ? `A longer trip uses more battery and more time.` : z.reason ?? 'No checked route yet.', disabled: !z.route, reason: z.route ? undefined : z.reason })),
    }
    case 'C2': {
      const zone = world.zones.find((z) => z.zone === d.context.zone)
      const r = zone?.route
      const need = r ? roverEnergyNeed(r.lengthM) : 0
      return {
        eyebrow: 'ICE RESEARCH · C2', building: 'rover',
        title: `Route to Zone ${d.context.zone}`,
        intro: r ? 'This A* route was planned on NASA’s 5 m slope map: every cell is 15° or less, and it never crosses areas without data. It is the only feasible route that has been checked.' : 'There is no feasible route.',
        options: [
          ...(r ? [{ id: 'go', label: `Take the A* route · ${km(r.lengthM)}`, gain: `Needs about ${Math.round(need)} kWh of the rover’s ${ROVER.batteryKwh} kWh battery · about ${Math.round(r.lengthM / 1000 / ROVER.speedKmh * 2)} hours there and back.`, risk: `Steepest slope ${r.maxSlopeDeg.toFixed(1)}°; ${r.uncertainPercent.toFixed(0)} % of the way could exceed 15° once measurement error is included. Lighting, temperature and communications are not checked.`, disabled: need > ROVER.batteryKwh, reason: need > ROVER.batteryKwh ? 'The rover battery is not enough for the round trip.' : undefined }] : []),
          { id: 'back', label: 'Choose another zone', gain: 'Look at the zones again.', risk: 'MILO has not left yet.' },
        ],
      }
    }
    case 'C31': return {
      eyebrow: 'ICE RESEARCH · C3.1', building: 'rover',
      title: 'MILO finds a patch of rubble on the route',
      intro: 'The rover’s camera sees rubble smaller than the map’s 5 m cells, so the map could not show it. The planned route is still within the slope limit. (A made-up situation.)',
      options: [
        { id: 'slow', label: 'Drive on slowly along the route', gain: 'Stays on the slope-checked route.', risk: `Slower, and uses ${Math.round((ROVER.slowEnergyFactor - 1) * 100)} % more battery for the rest of the way.` },
        { id: 'detour', label: world.detourM ? `Detour ${Math.round(world.detourM)} m` : 'Detour', gain: 'Avoids the rubble completely.', risk: world.detourM ? 'A slightly longer way. The detour was checked on the 5 m DEM: slope ≤ 15°, no areas without data.' : '', disabled: !world.detourM, reason: world.detourReason ?? 'No safe enough detour was found on the NASA data.' },
        { id: 'return', label: 'Return to base', gain: 'The safest choice.', risk: 'Nothing has been measured at the chosen zone yet.' },
      ],
    }
    case 'D1': return {
      eyebrow: 'EVENT D1 · LIGHT DROPS', building: 'battery',
      title: 'Not enough power for everything',
      intro: `Sunlight drops for 30 hours. The array now makes only about ${d.context.productionKw} kW${d.context.lost ? ' (10 % of its power was already lost in A3)' : ''}. Power for life support always comes first. What is left is not enough for both of these:`,
      options: [
        { id: 'greenhouse', label: 'Keep the greenhouse lights on', gain: 'The plants keep growing and the food data stays continuous.', risk: 'The rover charges slowly or not at all; the survey may have to wait.' },
        { id: 'rover', label: 'Charge the rover first', gain: 'MILO has enough battery to go on its survey.', risk: 'The greenhouse lights may be off for hours, so the plants grow more slowly.' },
      ],
    }
    case 'D2': {
      const short = !d.context.roverAway && Number(d.context.roverBattery) < Number(d.context.tripKwh)
      return {
        eyebrow: 'EVENT D2 · RESUPPLY', building: 'rover',
        title: 'A supply lander has touched down outside the base',
        intro: `It carries ${SUPPLY.food / CREW} days of food for the whole crew and ${SUPPLY.water} litres of water. The cargo is heavy, so it must be moved by rover or by cart, and it only counts once it reaches the base. Who should fetch it?`,
        options: [
          { id: 'rover', label: 'Send MILO the rover', gain: 'The crew does not have to go outside.', risk: d.context.roverAway ? 'MILO is out surveying: it must come back and be refitted before carrying cargo. The ice survey is interrupted.' : `Refitting plus the round trip takes about ${Math.round((2 * SCHEDULE.d2RoverConfigMin) / 60 + 2 * SCHEDULE.d2PadKm / ROVER.speedKmh + 1)} hours and about ${d.context.tripKwh} kWh of rover battery.`, disabled: short, reason: short ? `MILO has ${d.context.roverBattery} kWh left, not the ${d.context.tripKwh} kWh this trip needs.` : undefined },
          { id: 'crew', label: 'Two astronauts with a cart', gain: 'The rover keeps doing its own job.', risk: `About ${SCHEDULE.d2CrewPickupMin / 60} hours outside; the crew uses extra oxygen.` },
        ],
      }
    }
    case 'D3': return {
      eyebrow: 'EVENT D3 · RADIATION', building: 'shelter',
      title: 'A radiation storm hits while MILO is measuring',
      intro: 'The crew is in the shelter. Radiation disturbs the neutron detector (used to look for hydrogen), but not the thermometer or the spectrometer. Samples measured earlier are kept.',
      options: [
        { id: 'wait', label: 'Wait for the storm to pass, then measure again', gain: 'More clean neutron samples.', risk: 'The survey takes longer and uses more rover battery.' },
        { id: 'return', label: 'End the survey and come home', gain: 'MILO comes back early and safe.', risk: 'Fewer neutron samples, so the report is less certain.' },
      ],
    }
  }
}

// ── ending report ───────────────────────────────────────────────────────────
export interface BranchReport { done: boolean; status: string; result: string[]; events: string[]; why: string[] }
export function endingReport(s: GameState): { food: BranchReport; ice: BranchReport; reason: string; base: string[] } {
  const f = s.food, i = s.ice
  const tagged = (tags: string[]) => s.log.filter((e) => e.tag && tags.includes(e.tag) && ['decision', 'consequence', 'event'].includes(e.kind)).map((e) => e.title)
  const food: BranchReport = f.report ? {
    done: true, status: 'Complete',
    result: [`Sample weight: ${f.report.grams} g (a healthy plant: about ${f.report.expected} g).`, `Growth: ${f.report.growthPercent} %.`, `Data reliability: ${f.report.reliability}.`, 'This is a research result, not enough food to feed the crew.'],
    events: tagged(['B1', 'B2', 'D1', 'A3']), why: f.report.reasons,
  } : { done: false, status: f.stage === 'harvested' ? 'Harvested, report not written yet' : 'Not complete', result: [`The plants have grown ${Math.round(f.growth * 100)} %${f.growth < FOOD.readyIndex ? ' (not ready to harvest yet)' : ''}.`, `${f.observations.length} observations.`], events: tagged(['B1', 'B2', 'D1']), why: f.waterStressMin ? [`The plants went without water for ${Math.round(f.waterStressMin / 60)} hours.`] : [] }
  const ice: BranchReport = i.report ? {
    done: true, status: 'Complete',
    result: [`Zone ${i.zone}${i.route ? ` · ${i.route.name}` : ''}.`, `NASA data (real measurements): ${i.route?.inPsr ? 'inside a permanently shadowed region' : 'not inside a permanently shadowed region'}, slope at the point ${i.route?.slopeDeg.toFixed(1)}°.`, `Simulated result in the game: hydrogen index ${i.report.meanIndex} from ${i.report.validNeutron} valid samples (${i.report.invalidNeutron} rejected).`, `Confidence: ${i.report.confidence}. Ice is still NOT confirmed.`],
    events: tagged(['C3.1', 'D2', 'D3']), why: i.report.reasons,
  } : { done: false, status: i.stage === 'idle' || i.stage === 'locked' ? 'Not started' : 'Not complete', result: i.zone ? [`Chosen zone: ${i.zone}.`, `${i.samples.filter((x) => x.valid && x.instrument === 'neutron').length} valid neutron samples collected.`] : ['MILO has not gone surveying.'], events: tagged(['C3.1', 'D2', 'D3']), why: roverReason(s) }
  const base = [
    `Solar array: ${s.power.capacityFactor < 1 ? `${Math.round(s.power.capacityFactor * 100)} % power left because it stayed open in A3` : '100 % power'}.`,
    `Stores: power ${Math.round(s.resources.battery)}/${CAPACITY.battery} kWh · water ${Math.round(s.resources.water)} L · oxygen ${Math.round(s.resources.oxygen)} kg.`,
  ]
  return { food, ice, base, reason: s.ending?.reason === 'food' ? 'The packaged food reached its reserve level, so the mission had to end.' : 'You submitted your reports and sent the crew home.' }
}
function roverReason(s: GameState) {
  const out: string[] = []
  if (s.supply.method === 'rover') out.push('MILO had to carry the supplies (D2), so the survey was interrupted.')
  if (s.power.d1Priority === 'greenhouse') out.push('During the power shortage (D1) you put the greenhouse first, so the rover charged more slowly.')
  if (s.ice.stage === 'charging') out.push('MILO is waiting for enough charge for the round trip.')
  return out
}
