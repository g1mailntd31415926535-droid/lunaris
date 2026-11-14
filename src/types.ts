export type CameraMode = 'base' | 'region' | 'orbit'
export type Section = 'base' | 'missions' | 'forecast' | 'journal'
export type BuildingId = 'command' | 'solar' | 'water' | 'oxygen' | 'battery' | 'shelter' | 'greenhouse' | 'rover'
export type DemoKind = 'water' | 'battery' | 'solar' | 'radiation' | 'rover' | 'greenhouse' | 'oxygen' | 'command'
export type DemoPhase = 'walking' | 'working' | 'complete'
export type Quality = 'high' | 'balanced'
export type TerrainLayer = 'nasa' | 'game'
export interface CameraRequest { id: number; mode: CameraMode; /** Optional height above the observed point (m) for scripted views. */ altitudeM?: number }
export interface RoverStatus {
  phase: 'docked' | 'outbound' | 'scanning' | 'returning'
  site: string
  siteId: string
  trip: number
  distance: number
  speed: number
  /** Why MILO stops / what the route status is. Routes are never presented as safe. */
  note?: string
}

export interface BuildingData {
  id: BuildingId
  name: string
  shortName: string
  code: string
  category: string
  accent: string
  position: [number, number, number]
  radius: number
  description: string
  fact: string
  action: string
  metric: string
  unit: string
  value: number
}

export interface DemoAction {
  id: number
  kind: DemoKind
  phase: DemoPhase
}

export interface Notification {
  id: number
  title: string
  detail?: string
  tone: 'success' | 'info' | 'warning'
}

export interface Preferences {
  quality: Quality
  terrainLayer: TerrainLayer
  reducedMotion: boolean
  showLabels: boolean
  showRoutes: boolean
  sound: boolean
}

export interface WorldHandle {
  zoom: (direction: 'in' | 'out') => void
  reset: () => void
  focus: (id: BuildingId) => void
  focusCrew: (name: string) => void
  /** Flies to a region-local point (metres) and lets the camera pan around it. */
  focusPoint: (x: number, z: number) => void
}

export interface SceneDiagnostics {
  revision: string
  renderer: string
  camera: number[]
  target: number[]
  drawCalls: number
  drawCallsPeak?: number
  viewCentre?: number[]
  trianglesPeak?: number
  triangles: number
  geometries: number
  textures: number
  frameMs: number
  mode: CameraMode
  time: number
  actors: { name: string; position: number[] }[]
  sceneId: string
  moonId: string
  baseId: string
  earthId: string
  sunId: string
  terrainGeometryId: string
  moonGeometryId: string
  baseScale: number[]
  moonCenter: number[]
  baseAnchor: number[]
  earthPosition: number[]
  sunPosition: number[]
  altitudeM: number
  clearanceM: number
  styleDetail: number
  targets: { id: BuildingId; x: number; y: number }[]
  celestialVisibility: { moon: boolean; earth: boolean; sun: boolean }
  rover: RoverStatus & { position: number[]; nominal: number[]; screen: { x: number; y: number }; follow: boolean; groundError: number }
  cameraTravel: { moving: boolean; destination: CameraMode }
  terrain: { source: string; tiles: number; triangles: number; pending: number; levels: number[]; finestLevel: number; detailScale: number }
  terrainPending: number
  regional?: { nodes: number; triangles: number; grids: string; pending: number; failed: string }
  regionalPending?: number
}

declare global {
  interface Window {
    __LUNARIS__?: SceneDiagnostics
    __LUNARIS_CONTROLS__?: { orbit: (yaw: number, polar: number) => void; altitude: (metres: number) => void }
    __LUNARIS_ROVER__?: { seek: (seconds: number) => void }
    __LUNARIS_TEST_FOCUS__?: (x: number, z: number) => void
    __LUNARIS_SCENE__?: import('three').Scene
    __LUNARIS_THREE__?: typeof import('three')
    __LUNARIS_TEST_SELECT__?: (id: string) => void
  }
}
