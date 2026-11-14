import type { CameraMode } from '../types'
import { minimumJerk } from './math.ts'

export interface CameraChannels {
  logAltitude: number
  yaw: number
  polar: number
  nearYaw: number
  nearPolar: number
  panX: number
  panZ: number
}

export interface CameraFlight {
  from: CameraChannels
  to: CameraChannels
  destination: CameraMode
  duration: number
  lead: number
  stagingLogAltitude: number
}

export function shortestAngle(from: number, to: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

/** One captured starting pose, two coordinated channels: align while high,
 * then dolly. This never substitutes geometry or writes a second camera pose. */
export function createCameraFlight(from: CameraChannels, to: CameraChannels, destination: CameraMode): CameraFlight {
  const goal = { ...to, yaw: shortestAngle(from.yaw, to.yaw), nearYaw: shortestAngle(from.nearYaw, to.nearYaw) }
  const descending = goal.logAltitude < from.logAltitude
  const headingDelta = Math.hypot(goal.yaw - from.yaw, goal.polar - from.polar)
  const longJourney = Math.abs(goal.logAltitude - from.logAltitude)
  const duration = Math.max(0.45, Math.min(2.35, 0.55 + longJourney * 0.15 + Math.min(headingDelta, 2) * 0.12))
  const lead = descending && from.logAltitude > Math.log(250_000) && headingDelta > 0.45 ? Math.min(0.55, duration * 0.28) : 0
  const stagingLogAltitude = lead ? Math.max(goal.logAltitude, Math.min(from.logAltitude, Math.log(1_500_000))) : from.logAltitude
  return { from: { ...from }, to: goal, destination, duration, lead, stagingLogAltitude }
}

export function sampleCameraFlight(flight: CameraFlight, elapsed: number): CameraChannels {
  if (elapsed <= 0) return { ...flight.from }
  if (elapsed >= flight.duration) return { ...flight.to }
  const headingDuration = flight.lead || Math.min(0.7, flight.duration)
  const heading = minimumJerk(elapsed / headingDuration)
  const pan = minimumJerk(elapsed / flight.duration)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  let logAltitude: number
  if (flight.lead && elapsed < flight.lead) logAltitude = lerp(flight.from.logAltitude, flight.stagingLogAltitude, minimumJerk(elapsed / flight.lead))
  else logAltitude = lerp(flight.stagingLogAltitude, flight.to.logAltitude, minimumJerk((elapsed - flight.lead) / (flight.duration - flight.lead)))
  return {
    logAltitude,
    yaw: lerp(flight.from.yaw, flight.to.yaw, heading),
    polar: lerp(flight.from.polar, flight.to.polar, heading),
    nearYaw: lerp(flight.from.nearYaw, flight.to.nearYaw, pan),
    nearPolar: lerp(flight.from.nearPolar, flight.to.nearPolar, pan),
    panX: lerp(flight.from.panX, flight.to.panX, pan),
    panZ: lerp(flight.from.panZ, flight.to.panZ, pan),
  }
}
