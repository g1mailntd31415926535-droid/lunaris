// Celestial coordinates are kilometres. Colony geometry is authored in metres.
// The fixed render origin is Artemis, not the Moon centre. This leaves all
// close-up vertices small without moving, rescaling, or replacing the universe.
export const METRE = 0.001
export const MOON_RADIUS_KM = 1737.4
export const MOON_RADIUS_M = MOON_RADIUS_KM * 1000
export const MOON_CENTER: [number, number, number] = [0, -MOON_RADIUS_KM, 0]
export const BASE_ANCHOR: [number, number, number] = [0, 0, 0]
export const CAP_RADIUS_M = 50_000
export const EARTH_RADIUS_KM = 6371
export const EARTH_DISTANCE_KM = 384_400
export const SUN_RADIUS_KM = 696_340
export const SUN_DISTANCE_KM = 149_600_000
export const STAR_DISTANCE_KM = 300_000_000
export const SPACE_FAR_KM = 450_000_000

// Expressed in the south-pole tangent frame. Earth is slightly above Artemis's
// horizon. It is NOT camera-relative and is allowed to leave the camera view.
const earthDirection = [0.86, 0.115, -0.497] as const
const earthLength = Math.hypot(...earthDirection)
export const EARTH_POSITION: [number, number, number] = [
  earthDirection[0] / earthLength * EARTH_DISTANCE_KM,
  MOON_CENTER[1] + earthDirection[1] / earthLength * EARTH_DISTANCE_KM,
  earthDirection[2] / earthLength * EARTH_DISTANCE_KM,
]

export const CAMERA_ALTITUDES_M = { base: 27, region: 520, orbit: MOON_RADIUS_M * 2.60 } as const
export const MIN_ALTITUDE_M = 8
export const MAX_ALTITUDE_M = MOON_RADIUS_M * 14
export const SURFACE_CLEARANCE_M = 6
