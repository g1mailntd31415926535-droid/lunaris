import * as THREE from 'three'
import { demMeta, roverRoutes, scienceZones } from './dem.ts'
import type { RoverRoute, ScienceZone } from './dem.ts'

// Task 02: the 20 invented survey points that were pulled to 65–85 m from the base are gone, and so
// are the procedural crater/peak obstacles. MILO's only destinations are the four published science
// anchors A–D at their real coordinates (kilometres away). Nothing is snapped, offset or shortened.
//
// Routes are NOT made up here. They come from public/lunar/task02/routes.json, computed offline by
// scripts/terrain/plan_routes.py: A* on the native 5 m NASA slope layer, entering only pixels with
// slope ≤ 15° (NASA VIPER nominal operating slope, docs/EVIDENCE.md G17, used as a planning
// threshold) and never crossing NoData. A zone without such a route gets no leg at all — MILO is
// not sent part-way and nothing is forced. "Route found" covers slope and data coverage only
// (not lighting, heat, comms or the vehicle footprint), so no leg is ever called a safe route.

export const ROVER_DEPOT: [number, number] = [8.6, 11.2]
/**
 * Presentation speed inherited from the UI prototype. docs/EVIDENCE.md G18 keeps the LUNARIS rover speed
 * UNSET (NASA VIPER's typical speed is ≈0.72 km/h ≈ 0.2 m/s), so this value only drives the animation
 * and is never used to publish travel times.
 */
export const ROVER_CRUISE_SPEED = 0.7
// (di, dj) per move code in routes.json: i = column (east, +x), j = row (south, +z).
const MOVES: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]

/** A piecewise-linear path through 5 m pixel centres, with the two curve calls the rover uses. */
export class PolylinePath {
  readonly length: number
  private readonly cumulative: Float64Array
  private readonly xz: Float64Array
  constructor(xz: Float64Array) {
    this.xz = xz
    const count = xz.length / 2
    this.cumulative = new Float64Array(count)
    for (let i = 1; i < count; i++) this.cumulative[i] = this.cumulative[i - 1] + Math.hypot(xz[i * 2] - xz[i * 2 - 2], xz[i * 2 + 1] - xz[i * 2 - 1])
    this.length = this.cumulative[count - 1]
  }
  private at(distance: number, target: THREE.Vector3) {
    const d = Math.max(0, Math.min(this.length, distance)), c = this.cumulative
    let low = 0, high = c.length - 1
    while (high - low > 1) { const mid = (low + high) >> 1; if (c[mid] <= d) low = mid; else high = mid }
    const span = c[high] - c[low] || 1, t = (d - c[low]) / span
    return target.set(this.xz[low * 2] + (this.xz[high * 2] - this.xz[low * 2]) * t, 0, this.xz[low * 2 + 1] + (this.xz[high * 2 + 1] - this.xz[low * 2 + 1]) * t)
  }
  getPointAt(u: number, target: THREE.Vector3) { return this.at(u * this.length, target) }
  /** Heading averaged over ±6 m so the 45° grid steps do not make the rover twitch. */
  getTangentAt(u: number, target: THREE.Vector3) {
    const d = u * this.length
    const ahead = this.at(d + 6, new THREE.Vector3())
    this.at(d - 6, target)
    return target.subVectors(ahead, target).normalize()
  }
}

export interface SurveySite { id: string; name: string; position: [number, number]; zone: ScienceZone; route: RoverRoute | null }
export interface SurveyLeg { curve: PolylinePath; length: number; duration: number; site: SurveySite; route: RoverRoute; status: string }

let cache: { sites: SurveySite[]; legs: SurveyLeg[] } | null = null
function plan() {
  if (cache) return cache
  const meta = demMeta()!, routes = roverRoutes()
  const sites: SurveySite[] = scienceZones().filter((zone) => zone.valid_dem).map((zone) => ({ id: zone.id, name: zone.name, position: [zone.local_xz_m[0], zone.local_xz_m[1]], zone, route: routes[zone.id] ?? null }))
  const legs: SurveyLeg[] = []
  for (const site of sites) {
    const route = site.route
    if (!route || route.route_status !== 'NOMINAL_SLOPE_ROUTE_FOUND' || !route.reaches_anchor_pixel) continue   // no route: no leg
    const { x_min, y_max, pixel_m } = meta.grid, [baseX, baseY] = meta.base.xy_m
    let [row, col] = route.start_pixel_rc
    const xz = new Float64Array((route.moves.length + 2) * 2)
    xz[0] = ROVER_DEPOT[0]; xz[1] = ROVER_DEPOT[1]
    const put = (index: number) => { xz[index * 2] = x_min + (col + 0.5) * pixel_m - baseX; xz[index * 2 + 1] = baseY - (y_max - (row + 0.5) * pixel_m) }
    put(1)
    for (let i = 0; i < route.moves.length; i++) { const [di, dj] = MOVES[route.moves.charCodeAt(i) - 48]; col += di; row += dj; put(i + 2) }
    const curve = new PolylinePath(xz)
    legs.push({ curve, length: curve.length, duration: curve.length / ROVER_CRUISE_SPEED + 3, site, route, status: route.route_status })
  }
  legs.sort((a, b) => a.length - b.length)
  cache = { sites, legs }
  return cache
}
export const surveySites = () => plan().sites
export const surveyLegs = () => plan().legs

export type RoverPhase = 'docked' | 'outbound' | 'scanning' | 'returning'
export interface RoverPresentation { leg: SurveyLeg | null; phase: RoverPhase; progress: number; speed: number; trip: number; phaseTime: number }

function gentleTravel(time: number, duration: number, length: number) {
  const ramp = 3, speed = ROVER_CRUISE_SPEED
  if (time < ramp) return { progress: 0.5 * speed / ramp * time * time / length, speed: speed * time / ramp }
  if (time > duration - ramp) { const left = duration - time; return { progress: 1 - 0.5 * speed / ramp * left * left / length, speed: speed * left / ramp } }
  return { progress: speed * (time - ramp / 2) / length, speed }
}

/** Seekable presentation schedule, not an agent or a task-planning system. */
export function roverPresentation(seconds: number): RoverPresentation {
  const legs = surveyLegs()
  if (seconds < 5 || !legs.length) return { leg: legs[0] ?? null, phase: 'docked', progress: 0, speed: 0, trip: 0, phaseTime: seconds }
  const total = legs.reduce((sum, leg) => sum + leg.duration * 2 + 15, 0)
  let time = (seconds - 5) % total
  for (let trip = 0; trip < legs.length; trip++) {
    const leg = legs[trip], duration = leg.duration
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
  return { leg: legs[0], phase: 'docked', progress: 0, speed: 0, trip: 0, phaseTime: 0 }
}
