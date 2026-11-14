import * as THREE from 'three'
import { scienceZones } from './dem.ts'
import type { ScienceZone } from './dem.ts'

// Task 02: the 20 invented survey points that were pulled to 65–85 m from the base are gone, and so
// are the procedural crater/peak obstacles. MILO's only destinations are the four published science
// anchors A–D at their real coordinates (kilometres away). Nothing is snapped, offset or shortened.
//
// No route is certified. The straight BASE → site line is checked offline against the native 5 m
// NASA slope layer (scripts/terrain/build_terrain.py → reports/task02_route_slope.*). MILO only
// drives the part of that line before its first stretch steeper than the 15° nominal threshold
// (NASA VIPER nominal operating slope, docs/EVIDENCE.md G17; a planning threshold for LUNARIS), never
// crosses NoData, and the leg is always presented as UNVERIFIED — an observation demo, not a safe route.

export const ROVER_DEPOT: [number, number] = [8.6, 11.2]
/**
 * Presentation speed inherited from the UI prototype. docs/EVIDENCE.md G18 keeps the LUNARIS rover speed
 * UNSET (NASA VIPER's typical speed is ≈0.72 km/h ≈ 0.2 m/s), so this value only drives the animation
 * and is never used to publish travel times.
 */
export const ROVER_CRUISE_SPEED = 0.7
const STOP_BEFORE_STEEP_M = 15
const JOIN_LINE_AT_M = 30
const MIN_USEFUL_REACH_M = 60

export interface SurveySite { id: string; name: string; position: [number, number]; zone: ScienceZone }
export interface SurveyLeg {
  curve: THREE.CatmullRomCurve3; length: number; duration: number; site: SurveySite
  /** Distance along the BASE → site line where MILO turns back. */
  reachM: number
  lineLengthM: number
  reachesSite: boolean
  stopReason: 'steep' | null
  status: string
}

let cache: { sites: SurveySite[]; legs: SurveyLeg[] } | null = null
function plan() {
  if (cache) return cache
  const sites: SurveySite[] = scienceZones().filter((zone) => zone.valid_dem).map((zone) => ({ id: zone.id, name: zone.name, position: [zone.local_xz_m[0], zone.local_xz_m[1]], zone }))
  const legs: SurveyLeg[] = []
  for (const site of sites) {
    const check = site.zone.route_check, full = Math.hypot(...site.position)
    if (check.crosses_nodata) continue                                   // never plan across missing data
    const reach = check.first_block_at_m === null ? full : Math.max(0, check.first_block_at_m - STOP_BEFORE_STEEP_M)
    if (reach < MIN_USEFUL_REACH_M) continue
    const ux = site.position[0] / full, uz = site.position[1] / full
    const controls = [new THREE.Vector3(ROVER_DEPOT[0], 0, ROVER_DEPOT[1])]
    for (let along = JOIN_LINE_AT_M; along < reach - 20; along += 60) controls.push(new THREE.Vector3(ux * along, 0, uz * along))
    controls.push(new THREE.Vector3(ux * reach, 0, uz * reach))
    const curve = new THREE.CatmullRomCurve3(controls, false, 'centripetal')
    curve.arcLengthDivisions = Math.min(4000, Math.max(200, Math.ceil(reach / 2))); curve.updateArcLengths()
    const length = curve.getLength(), reachesSite = check.first_block_at_m === null
    legs.push({ curve, length, duration: length / ROVER_CRUISE_SPEED + 3, site, reachM: reach, lineLengthM: full, reachesSite, stopReason: reachesSite ? null : 'steep', status: site.zone.route_status })
  }
  legs.sort((a, b) => a.lineLengthM - b.lineLengthM)
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
