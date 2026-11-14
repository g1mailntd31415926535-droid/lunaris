import { createContext, useContext } from 'react'
import type { MutableRefObject } from 'react'
import { Vector3 } from 'three'
import type { CameraMode, RoverStatus } from '../types'
import { CAMERA_ALTITUDES_M, MOON_CENTER } from './space-config'

export interface UniverseState {
  altitudeM: number
  clearanceM: number
  mode: CameraMode
  styleDetail: number
  cameraTarget: Vector3
  /** Where the centre of the screen meets the base level (km, world). Differs from cameraTarget once the orbit blend starts. */
  viewCentre: Vector3
  sunDirection: Vector3
  sunPosition: Vector3
  roverPosition: Vector3
  roverNominal: Vector3
  roverNormal: Vector3
  roverStatus: RoverStatus
  followRover: boolean
  cameraTravel: { moving: boolean; destination: CameraMode }
}

export function initialUniverseState(): UniverseState {
  return { altitudeM: CAMERA_ALTITUDES_M.base, clearanceM: 27, mode: 'base', styleDetail: 1, cameraTarget: new Vector3(0.0022, 0, -0.0005), viewCentre: new Vector3(0.0022, 0, -0.0005), sunDirection: new Vector3(-0.76, 0.4, -0.51).normalize(), sunPosition: new Vector3(...MOON_CENTER), roverPosition: new Vector3(8.6, 0, 11.2), roverNominal: new Vector3(8.6, 0, 11.2), roverNormal: new Vector3(0, 1, 0), roverStatus: { phase: 'docked', site: 'Artemis', siteId: 'base', trip: 0, distance: 0, speed: 0 }, followRover: false, cameraTravel: { moving: false, destination: 'base' } }
}

export const UniverseContext = createContext<MutableRefObject<UniverseState> | null>(null)
export function useUniverse() {
  const value = useContext(UniverseContext)
  if (!value) throw new Error('UniverseContext is missing')
  return value
}
