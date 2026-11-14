import * as THREE from 'three'
import { BUILDINGS } from '../data.ts'
import { REGIONAL_CRATERS } from './planet-fields.ts'
import { CRATERS, LUNAR_PEAKS } from './terrain-field.ts'
import { seededRandom } from './math.ts'
import { sampleTerrain } from './terrain-query.ts'
import { ROCK_PLACEMENTS } from './rock-plan.ts'

export interface SurveySite { id: string; name: string; kind: 'crater' | 'mountain' | 'rocks' | 'distant'; position: [number, number] }
export const ROVER_DEPOT: [number, number] = [8.6, 11.2]
export const SURVEY_SITES: SurveySite[] = [
  { id: 'rim-01', name: 'Vành hố gần Artemis', kind: 'crater', position: [-165, -170] },
  { id: 'ridge-02', name: 'Sườn núi ánh sáng', kind: 'mountain', position: [-110, -310] },
  { id: 'rocks-03', name: 'Những viên đá bazan', kind: 'rocks', position: [220, -120] },
  { id: 'ridge-04', name: 'Gờ đá phía Đông', kind: 'mountain', position: [280, 350] },
  { id: 'rim-05', name: 'Miệng hố phía Đông', kind: 'crater', position: [980, 230] },
  { id: 'rim-06', name: 'Thung lũng phía Nam', kind: 'crater', position: [-260, 920] },
  { id: 'rocks-07', name: 'Vùng đá trong bóng núi', kind: 'rocks', position: [-570, 210] },
  { id: 'ridge-08', name: 'Dãy núi im lặng', kind: 'mountain', position: [-1350, -850] },
  { id: 'rocks-09', name: 'Bãi đá xa', kind: 'rocks', position: [1600, -1400] },
  { id: 'valley-10', name: 'Con đường giữa hai hố', kind: 'distant', position: [-2350, 1850] },
  { id: 'rim-11', name: 'Đài quan sát hố lớn', kind: 'crater', position: [2000, 5600] },
  { id: 'ridge-12', name: 'Sườn núi chân trời', kind: 'mountain', position: [7400, 2500] },
  { id: 'rim-13', name: 'Vành hố vùng tối', kind: 'crater', position: [-2800, -11000] },
  { id: 'rocks-14', name: 'Mỏm đá phía Bắc', kind: 'rocks', position: [16000, -9500] },
  { id: 'ridge-15', name: 'Đỉnh núi phía Tây', kind: 'mountain', position: [-18500, 9000] },
  { id: 'rim-16', name: 'Đồng bằng cạnh hố sâu', kind: 'crater', position: [12500, 16500] },
  { id: 'distant-17', name: 'Biên giới phía Tây', kind: 'distant', position: [-31000, -16500] },
  { id: 'distant-18', name: 'Vùng đất chưa ghé thăm', kind: 'distant', position: [33000, 9000] },
  { id: 'distant-19', name: 'Chân trời Tây Nam', kind: 'distant', position: [-36500, 24500] },
  { id: 'distant-20', name: 'Chân trời Đông Bắc', kind: 'distant', position: [32000, -33500] },
]
// A cozy, observable neighbourhood rather than time-compressed kilometre trips.
// Keep all 20 destinations and their varied bearings, but close to Artemis.
SURVEY_SITES.forEach((site, index) => {
  if (index === 2) { site.position = [12, 28]; return }
  const radius = Math.hypot(...site.position), localRadius = 65 + (index % 6) * 4
  site.position = [site.position[0] / radius * localRadius, site.position[1] / radius * localRadius]
})
export const ROVER_CRUISE_SPEED = 0.7
export const SURVEY_ROCKS = (() => {
  const random = seededRandom(261115)
  return SURVEY_SITES.filter((s) => s.kind === 'rocks').flatMap((site, i) => Array.from({ length: 6 }, (_, j) => {
    const size = 0.35 + random() * 1.1, shade = 0.8 + random() * 0.4
    let angle = j * 2.399 + i, x = site.position[0], z = site.position[1]
    for (let attempt = 0; attempt < 80; attempt++) {
      angle = random() * Math.PI * 2
      const distance = 5 + random() * 7
      x = site.position[0] + Math.sin(angle) * distance; z = site.position[1] + Math.cos(angle) * distance
      const radius = Math.hypot(x, z)
      if (Math.abs(radius - 55) < size + 1.5) continue
      if (BUILDINGS.some((b) => Math.hypot(x - b.position[0], z - b.position[2]) < b.radius + size + 0.8)) continue
      if (SURVEY_SITES.some((s) => {
        const a = Math.atan2(s.position[1], s.position[0])
        return segmentDistance([Math.cos(a) * 55, Math.sin(a) * 55], s.position, x, z) < size + 1.4
      })) continue
      break
    }
    return { x, z, size, angle, shade }
  }))
})()

export const SURVEY_OBSTACLES = [
  ...BUILDINGS.map((b) => ({ x: b.position[0], z: b.position[2], radius: b.radius + 0.85, kind: 'building' })),
  ...CRATERS.map((c) => ({ x: c.x, z: c.z, radius: c.radius * 1.26 + 0.8, kind: 'crater' })),
  ...LUNAR_PEAKS.map(([x, z, , width]) => ({ x, z, radius: width + 0.85, kind: 'mountain' })),
  ...REGIONAL_CRATERS.map(([x, z, radius]) => ({ x, z, radius: radius * (x === -260 && z === 540 ? 1.75 : 1.30), kind: 'crater' })),
  ...ROCK_PLACEMENTS.filter((r) => r.big).map((r) => ({ x: r.x, z: r.z, radius: Math.max(r.scale[0], r.scale[2]) * 0.9 + 0.70, kind: 'rock' })),
  ...SURVEY_ROCKS.map((r) => ({ x: r.x, z: r.z, radius: r.size + 0.75, kind: 'rock' })),
]

function segmentDistance(a: [number, number], b: [number, number], x: number, z: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / Math.max(0.0001, length2)))
  return Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z)
}

// A bounded, one-time repair of authored survey corridors. Runtime behavior
// selects from cached legs; there is no grid search, live pathfinding or AI.
function safeCorridor(input: [number, number][], seed: number) {
  const points = input.map((p) => [...p] as [number, number]), random = seededRandom(seed)
  for (let iteration = 0; iteration < 100; iteration++) {
    let changed = false
    for (let i = 0; i < points.length - 1 && !changed; i++) {
      const a = points[i], b = points[i + 1]
      for (const obstacle of SURVEY_OBSTACLES) {
        if (segmentDistance(a, b, obstacle.x, obstacle.z) >= obstacle.radius) continue
        // Endpoint sites and the depot are authored outside all exclusion zones.
        if (Math.hypot(a[0] - obstacle.x, a[1] - obstacle.z) < obstacle.radius || Math.hypot(b[0] - obstacle.x, b[1] - obstacle.z) < obstacle.radius) continue
        const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz)
        const candidates = [-1, 1].map((sign) => [obstacle.x - dz / length * obstacle.radius * 1.9 * sign, obstacle.z + dx / length * obstacle.radius * 1.9 * sign] as [number, number])
        const cost = (p: [number, number]) => SURVEY_OBSTACLES.reduce((score, other) => {
          const endpoint = Math.max(0, other.radius * 1.05 - Math.hypot(p[0] - other.x, p[1] - other.z))
          const first = Math.max(0, other.radius - segmentDistance(a, p, other.x, other.z)), second = Math.max(0, other.radius - segmentDistance(p, b, other.x, other.z))
          return score + endpoint * endpoint * 8 + first * first + second * second
        }, 0)
        const costs = candidates.map(cost)
        const choice = Math.abs(costs[0] - costs[1]) < 0.001 ? (random() > 0.5 ? 0 : 1) : costs[0] < costs[1] ? 0 : 1
        points.splice(i + 1, 0, candidates[choice])
        changed = true; break
      }
    }
    if (!changed) break
  }
  return points
}

export interface SurveyLeg { curve: THREE.CatmullRomCurve3; points: [number, number][]; length: number; duration: number; site: SurveySite }
const cache = new Map<number, SurveyLeg>()
export function surveyLeg(index: number): SurveyLeg {
  if (cache.has(index)) return cache.get(index)!
  const site = SURVEY_SITES[index]
  const input: [number, number][] = [ROVER_DEPOT, [5.3, 11.6], [3.6, 15], [0.4, 21.8], [-3, 27], [-4, 38], [0, 55]]
  let endAngle = Math.atan2(site.position[1], site.position[0]), angle = Math.PI / 2
  while (endAngle - angle > Math.PI) endAngle -= Math.PI * 2
  while (endAngle - angle < -Math.PI) endAngle += Math.PI * 2
  const arcSteps = Math.max(1, Math.ceil(Math.abs(endAngle - angle) / 0.22))
  for (let i = 1; i <= arcSteps; i++) { const a = angle + (endAngle - angle) * i / arcSteps; input.push([Math.cos(a) * 55, Math.sin(a) * 55]) }
  input.push(site.position)
  const points = safeCorridor(input, 261114 + index * 371)
  // Bounded spacing prevents a long regional leg from pulling a short base
  // corner into a building or crater. No route decisions occur at render time.
  const controls: THREE.Vector3[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], length = Math.hypot(b[0] - a[0], b[1] - a[1])
    const spacing = Math.hypot(...a) < 100 ? 1.2 : Math.min(500, Math.max(4, Math.hypot(...a) * 0.12)), steps = Math.ceil(length / spacing)
    for (let j = 0; j < steps; j++) { const t = j / steps; controls.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, 0, a[1] + (b[1] - a[1]) * t)) }
  }
  controls.push(new THREE.Vector3(site.position[0], 0, site.position[1]))
  const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal')
  curve.arcLengthDivisions = 1600; curve.updateArcLengths()
  const length = curve.getLength()
  const leg = { curve, points, length, duration: length / ROVER_CRUISE_SPEED + 3, site }
  cache.set(index, leg)
  return leg
}

export function validateSurveyLeg(leg: SurveyLeg) {
  const violations: string[] = []
  const samples = Math.max(450, Math.min(4500, Math.ceil(leg.length / 8)))
  const point = new THREE.Vector3()
  const check = (t: number) => {
    leg.curve.getPointAt(t, point)
    const obstacle = SURVEY_OBSTACLES.find((o) => Math.hypot(point.x - o.x, point.z - o.z) < o.radius * 0.96)
    if (obstacle) violations.push(`${obstacle.kind}@${point.x.toFixed(1)},${point.z.toFixed(1)}`)
    if (sampleTerrain(point.x, point.z).normal[1] < Math.cos(25 * Math.PI / 180)) violations.push(`slope@${point.x.toFixed(1)},${point.z.toFixed(1)}`)
  }
  for (let i = 0; i <= samples; i++) check(i / samples)
  for (let metres = 0; metres < Math.min(120, leg.length); metres += 0.35) check(metres / leg.length)
  return violations
}

export function surveySequence(seed = 261114) {
  const random = seededRandom(seed), order = SURVEY_SITES.map((_, index) => index)
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
  // Start with the closest rock survey, then visit the shuffled neighbourhood.
  const nearby = order.indexOf(2); [order[0], order[nearby]] = [order[nearby], order[0]]
  return order
}

export type RoverPhase = 'docked' | 'outbound' | 'scanning' | 'returning'
export interface RoverPresentation { leg: SurveyLeg; phase: RoverPhase; progress: number; speed: number; trip: number; phaseTime: number }
const order = surveySequence()

function gentleTravel(time: number, duration: number, length: number) {
  const ramp = 3, speed = ROVER_CRUISE_SPEED
  if (time < ramp) return { progress: 0.5 * speed / ramp * time * time / length, speed: speed * time / ramp }
  if (time > duration - ramp) { const left = duration - time; return { progress: 1 - 0.5 * speed / ramp * left * left / length, speed: speed * left / ramp } }
  return { progress: speed * (time - ramp / 2) / length, speed }
}

/** Seekable presentation schedule, not an agent or a task-planning system. */
export function roverPresentation(seconds: number): RoverPresentation {
  if (seconds < 5) return { leg: surveyLeg(order[0]), phase: 'docked', progress: 0, speed: 0, trip: 0, phaseTime: seconds }
  const total = order.reduce((sum, index) => sum + surveyLeg(index).duration * 2 + 15, 0)
  let time = (seconds - 5) % total
  for (let trip = 0; trip < order.length; trip++) {
    const leg = surveyLeg(order[trip]), duration = leg.duration
    if (time > duration * 2 + 15) { time -= duration * 2 + 15; continue }
    if (time < duration) {
      const travel = gentleTravel(time, duration, leg.length)
      return { leg, phase: 'outbound', progress: travel.progress, speed: travel.speed, trip, phaseTime: time }
    }
    if (time < duration + 7) return { leg, phase: 'scanning', progress: 1, speed: 0, trip, phaseTime: time - duration }
    if (time < duration * 2 + 7) {
      const elapsed = time - duration - 7, travel = gentleTravel(elapsed, duration, leg.length)
      return { leg, phase: 'returning', progress: 1 - travel.progress, speed: travel.speed, trip, phaseTime: elapsed }
    }
    return { leg, phase: 'docked', progress: 0, speed: 0, trip, phaseTime: time - duration * 2 - 7 }
  }
  return { leg: surveyLeg(order[0]), phase: 'docked', progress: 0, speed: 0, trip: 0, phaseTime: 0 }
}
