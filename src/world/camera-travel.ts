import type { CameraMode } from '../types'
import { Vector3 } from 'three'
import type { Quaternion } from 'three'
import { minimumJerk } from './math.ts'

export interface CameraChannels {
  logAltitude: number
  surface: Quaternion
  yaw: number
  tilt: number
}

export interface CameraFlight {
  from: CameraChannels
  to: CameraChannels
  destination: CameraMode
  duration: number
  lift: number
  lead: number
  stagingLogAltitude: number
}

export function shortestAngle(from: number, to: number) {
  return from + Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

/** One captured starting pose, two coordinated channels: align while high,
 * then dolly. This never substitutes geometry or writes a second camera pose. */
export function createCameraFlight(from: CameraChannels, to: CameraChannels, destination: CameraMode): CameraFlight {
  const goal = { ...to, yaw: shortestAngle(from.yaw, to.yaw) }
  const surfaceDelta = new Vector3(0, 1, 0).applyQuaternion(from.surface).angleTo(new Vector3(0, 1, 0).applyQuaternion(to.surface))
  const longJourney = Math.abs(goal.logAltitude - from.logAltitude)
  const distant = surfaceDelta > 0.06
  const duration = Math.max(distant ? 1.5 : 0.45, Math.min(2.35, 0.55 + longJourney * 0.15 + surfaceDelta * 0.18))
  // Lift before flying across the globe so a destination reached from a close-up
  // on the opposite side never sends the eye skimming along the surface.
  const stagingLogAltitude = distant ? Math.max(from.logAltitude, Math.log(Math.min(1_500_000, 240_000 * surfaceDelta))) : from.logAltitude
  const lift = distant && stagingLogAltitude > from.logAltitude ? duration * 0.3 : 0
  const lead = distant ? duration * (lift > 0 ? 0.36 : 0.32) : 0
  return { from, to: goal, destination, duration, lift, lead, stagingLogAltitude }
}

export function sampleCameraFlight(flight: CameraFlight, elapsed: number): CameraChannels {
  if (elapsed <= 0) return { ...flight.from }
  if (elapsed >= flight.duration) return { ...flight.to }
  const { from, to, duration, lift, lead, stagingLogAltitude } = flight
  const progress = minimumJerk(elapsed / duration)
  const surfaceProgress = lead ? minimumJerk((elapsed - lift) / lead) : progress
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const logAltitude = elapsed < lift
    ? lerp(from.logAltitude, stagingLogAltitude, minimumJerk(elapsed / lift))
    : lerp(stagingLogAltitude, to.logAltitude, minimumJerk((elapsed - lift - lead) / (duration - lift - lead)))
  return {
    logAltitude,
    surface: from.surface.clone().slerp(to.surface, surfaceProgress),
    yaw: lerp(from.yaw, to.yaw, progress),
    tilt: lerp(from.tilt, to.tilt, progress),
  }
}
