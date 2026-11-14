import { Component, Suspense, forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Globe2, RefreshCw } from 'lucide-react'
import type { BuildingId, CameraMode, CameraRequest, DemoAction, DemoPhase, Preferences, RoverStatus, WorldHandle } from '../types'
import { BUILDINGS } from '../data'
import { VisualClockContext, useVisualTime } from './clock'
import type { VisualTime } from './clock'
import { ColonyDecorations } from './Terrain'
import { DemGate, DemTerrain, ScienceZoneMarkers, terrainStats } from './DemTerrain'
import { colonyFrame, colonyToRegion } from './dem'
import type { CoverageClass } from './dem'
import { Buildings } from './Buildings'
import { Actors } from './Actors'
import { ExplorationRover } from './ExplorationRover'
import { ArtemisMarker, Earth, MoonGlobe, Starfield, Sun } from './Planet'
import { PlanetCameraRig } from './PlanetCameraRig'
import { UniverseContext, initialUniverseState, useUniverse } from './universe-context'
import { METRE, MOON_CENTER, MOON_RADIUS_KM, SPACE_FAR_KM, SUN_DISTANCE_KM } from './space-config'
import { heightAt } from './terrain-field'
import { actualTerrainHeight } from './terrain-query'
import { MATERIALS } from './model-kit'

interface WorldProps {
  mode: CameraMode
  cameraRequest: CameraRequest
  onDistanceMode: (mode: CameraMode) => void
  selected: BuildingId | null
  onSelect: (id: BuildingId) => void
  onMode: (mode: CameraMode) => void
  onCrew: () => void
  paused: boolean
  speed: number
  forecastHour: number
  demo: DemoAction | null
  onPhase: (phase: DemoPhase) => void
  preferences: Preferences
  onReady: () => void
  followRover: boolean
  onFollowRover: (follow: boolean) => void
  onRoverStatus: (status: RoverStatus) => void
  onCameraTravel: (moving: boolean, destination: CameraMode) => void
}

function ClockDriver({ clock, paused, speed, demo, onPhase, onReady }: { clock: MutableRefObject<VisualTime>; paused: boolean; speed: number; demo: DemoAction | null; onPhase: (phase: DemoPhase) => void; onReady: () => void }) {
  const ready = useRef(0), phase = useRef(''), pending = useRef(0)
  const universe = useUniverse()
  useEffect(() => { if (demo && demo.id !== clock.current.actionId) { pending.current = demo.id; phase.current = 'walking' } }, [demo, clock])
  useFrame((_, delta) => {
    clock.current.delta = paused ? 0 : Math.min(delta, 0.5) * speed
    clock.current.time += clock.current.delta
    if (ready.current < 3) { ready.current++; if (ready.current === 3) onReady() }
    if (pending.current && universe.current.altitudeM < 100) { clock.current.actionId = pending.current; clock.current.actionStart = clock.current.time; pending.current = 0 }
    if (demo && demo.id === clock.current.actionId && demo.phase !== 'complete') {
      const elapsed = clock.current.time - clock.current.actionStart
      const next: DemoPhase = elapsed >= 8.4 ? 'complete' : elapsed >= 2.3 ? 'working' : 'walking'
      if (phase.current !== next) { phase.current = next; onPhase(next) }
    }
  }, -4)
  return null
}

function SolarLighting({ hour, radiation, reducedMotion, quality }: { hour: number; radiation: boolean; reducedMotion: boolean; quality: Preferences['quality'] }) {
  const universe = useUniverse()
  const globalLight = useRef<THREE.DirectionalLight>(null), localLight = useRef<THREE.DirectionalLight>(null)
  const fill = useRef<THREE.HemisphereLight>(null), bounce = useRef<THREE.DirectionalLight>(null)
  const globalTarget = useMemo(() => { const target = new THREE.Object3D(); target.position.set(...MOON_CENTER); return target }, [])
  const localTarget = useMemo(() => new THREE.Object3D(), [])
  const currentElevation = useRef(28)
  const shadowAge = useRef(1), shadowElevation = useRef(28)
  const shadowPosition = useRef(new THREE.Vector3())
  const shadowMapSize = quality === 'high' ? 1536 : 1024
  useFrame((_, delta) => {
    currentElevation.current = THREE.MathUtils.damp(currentElevation.current, 28 - hour * 5, reducedMotion ? 12 : 2.8, Math.min(delta, 0.15))
    const elevation = currentElevation.current * Math.PI / 180, u = universe.current
    u.sunDirection.set(-0.79 * Math.cos(elevation), Math.sin(elevation), -0.613 * Math.cos(elevation)).normalize()
    u.sunPosition.set(...MOON_CENTER).addScaledVector(u.sunDirection, SUN_DISTANCE_KM)
    // Disjoint layers prevent duplicated illumination. Both light proxies have
    // the EXACT direction of the one world-space Sun. Only the metre-scale proxy
    // owns the bounded shadow map; no astronomical shadow-camera precision loss.
    globalLight.current?.position.set(...MOON_CENTER).addScaledVector(u.sunDirection, 5000)
    if (u.followRover && u.altitudeM < 2000) localTarget.position.copy(u.roverPosition).multiplyScalar(METRE)
    else localTarget.position.set(0, 0, 0)
    localLight.current?.position.copy(localTarget.position).addScaledVector(u.sunDirection, 0.10)
    if (localLight.current) { localLight.current.castShadow = u.altitudeM < 20_000; localLight.current.intensity = 2.7 }
    shadowAge.current += delta
    if (localLight.current && (shadowAge.current > 0.08 || Math.abs(currentElevation.current - shadowElevation.current) > 0.035 || shadowPosition.current.distanceToSquared(localTarget.position) > 0.0000000016)) {
      localLight.current.shadow.needsUpdate = true
      shadowAge.current = 0; shadowElevation.current = currentElevation.current
      shadowPosition.current.copy(localTarget.position)
    }
    if (fill.current) fill.current.intensity = u.styleDetail * 0.55 * (0.55 + Math.max(0, u.sunDirection.y) * 0.85)
    if (bounce.current) bounce.current.intensity = u.styleDetail * 0.5
    MATERIALS.redLight.emissiveIntensity = reducedMotion ? 1.4 : 1.25 + Math.sin(u.altitudeM * 0.00001 + performance.now() * 0.0012) * 0.16
  }, -2)
  return <>
    <primitive object={globalTarget} /><primitive object={localTarget} />
    <ambientLight intensity={0.055} color="#b9c8e7" layers-mask={1} />
    <directionalLight ref={globalLight} target={globalTarget} color="#fff0d7" intensity={2.7} layers-mask={1} />
    <ambientLight intensity={0.055} color="#b9c8e7" layers-mask={2} />
    <directionalLight ref={localLight} target={localTarget} color="#fff0d7" intensity={2.7} layers-mask={2} castShadow shadow-autoUpdate={false} shadow-mapSize={[shadowMapSize, shadowMapSize]} shadow-camera-left={-0.049} shadow-camera-right={0.049} shadow-camera-top={0.049} shadow-camera-bottom={-0.049} shadow-camera-near={0.0001} shadow-camera-far={0.26} shadow-bias={-0.00015} shadow-normalBias={0.00004} />
    <hemisphereLight ref={fill} args={['#b2c2ed', '#44415b', 0.4]} layers-mask={2} />
    <directionalLight ref={bounce} position={[0.008, 0.013, 0.022]} target={localTarget} color="#a7bee3" intensity={0.45} layers-mask={2} />
    <pointLight position={[-0.0008, 0.0019, 0.0015]} color="#ffbb66" intensity={5e-6} distance={0.006} decay={2} layers-mask={2} />
    <pointLight position={[0.0012, 0.002, 0.0077]} color="#65d2ff" intensity={2.7e-6} distance={0.005} decay={2} layers-mask={2} />
    <pointLight position={[0.008, 0.0018, 0.0002]} color="#aeeca2" intensity={2e-6} distance={0.005} decay={2} layers-mask={2} />
    <pointLight position={[0, 0.005, 0]} color="#ff665c" intensity={radiation ? 28e-6 : 0} distance={0.027} decay={1.4} layers-mask={2} />
  </>
}

function ActionEffects({ demo, clock, reducedMotion }: { demo: DemoAction | null; clock: MutableRefObject<VisualTime>; reducedMotion: boolean }) {
  const signals = useRef<THREE.Group>(null), glints = useRef<THREE.Group>(null)
  useFrame(() => {
    const time = clock.current.time
    signals.current?.children.forEach((node, i) => { const t = (time * 0.6 + i * 0.33) % 1; node.scale.setScalar(reducedMotion ? 1.4 : 0.3 + t * 2.6); node.position.y = reducedMotion ? 5 : 4.4 + t * 4; ((node as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.4 })
    glints.current?.children.forEach((node, i) => { node.rotation.y = time + i; node.scale.setScalar(0.07 + (reducedMotion ? 0.03 : Math.max(0, Math.sin(time * 2.5 + i)) * 0.06)) })
  })
  return <>
    <group ref={signals} position={[-0.8, 0, -2]} visible={demo?.kind === 'command' && demo.phase === 'working'}>{[0, 1, 2].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.95, 0.99, 48]} /><meshBasicMaterial color="#bc9fff" transparent opacity={0.3} depthWrite={false} side={THREE.DoubleSide} /></mesh>)}</group>
    <group ref={glints} visible={demo?.kind === 'solar' && demo.phase === 'working'}>{[0, 1, 2, 3, 4, 5].map((i) => <mesh key={i} position={[-10.9 + (i % 3) * 2.1, 1.7, -6.4 + Math.floor(i / 3) * 2.4]}><octahedronGeometry args={[1, 0]} /><meshBasicMaterial color="#fff0ae" toneMapped={false} /></mesh>)}</group>
  </>
}

function SouthPoleRegion({ props, clock, onCoverage, onFocusPoint }: { props: WorldProps; clock: MutableRefObject<VisualTime>; onCoverage: (coverage: CoverageClass) => void; onFocusPoint: (x: number, z: number) => void }) {
  const root = useRef<THREE.Group>(null), settlement = useRef<THREE.Group>(null)
  // The authored colony stands on the least-squares plane of the real DEM around BASE (see dem.ts):
  // the terrain is not flattened; the whole base follows the measured slope instead.
  const frame = colonyFrame()
  const universe = useUniverse()
  useEffect(() => { root.current?.traverse((node) => node.layers.set(1)) }, [])
  useFrame(() => {
    // Only subpixel objects are culled. They remain in the scene graph with the
    // same transforms/identities; terrain never switches or changes topology.
    if (settlement.current) settlement.current.visible = universe.current.altitudeM < 20_000
  })
  return <group ref={root} name="south-pole-region" position={[0, MOON_RADIUS_KM, 0]} scale={METRE}>
    <DemTerrain quality={props.preferences.quality} onCoverage={onCoverage} />
    <ScienceZoneMarkers onFocus={onFocusPoint} />
    <ExplorationRover selected={props.selected === 'rover'} follow={props.followRover} mode={props.mode} reducedMotion={props.preferences.reducedMotion} showRoute={props.preferences.showRoutes} onSelect={() => props.onSelect('rover')} onFollow={() => props.onFollowRover(true)} onStatus={props.onRoverStatus} />
    <group ref={settlement} name="artemis-base" position={[0, frame.c, 0]} quaternion={frame.quaternion}>
      <ColonyDecorations />
      <Buildings selected={props.selected} onSelect={props.onSelect} mode={props.mode} labels={props.preferences.showLabels} demo={props.demo} reducedMotion={props.preferences.reducedMotion} onHover={propsHover} />
      <Actors demo={props.demo} reducedMotion={props.preferences.reducedMotion} onCrew={props.onCrew} />
      <ActionEffects demo={props.demo} clock={clock} reducedMotion={props.preferences.reducedMotion} />
    </group>
  </group>
}
// Cursor enhancement stays outside the scene-state contract.
function propsHover(hover: boolean) { document.querySelector('.world')?.classList.toggle('world-hover', hover) }

function Diagnostics() {
  const { gl, scene, camera, size } = useThree(), universe = useUniverse()
  const clock = useVisualTime()
  const timer = useRef(0), average = useRef(16.7)
  // Peak over the 0.12 s reporting window (> the 0.08 s shadow refresh), so frames that also render the shadow pass are counted.
  const peak = useRef({ calls: 0, triangles: 0 })
  useEffect(() => {
    // Test-only handle for scripts/scene_breakdown.mjs (present only with ?debug=1).
    if (!new URLSearchParams(location.search).has('debug')) return
    window.__LUNARIS_SCENE__ = scene
    return () => { delete window.__LUNARIS_SCENE__ }
  }, [scene])
  const point = useMemo(() => new THREE.Vector3(), [])
  const frustum = useMemo(() => new THREE.Frustum(), []), projection = useMemo(() => new THREE.Matrix4(), [])
  useFrame((_, delta) => {
    timer.current += delta; average.current = average.current * 0.95 + delta * 1000 * 0.05
    peak.current.calls = Math.max(peak.current.calls, gl.info.render.calls); peak.current.triangles = Math.max(peak.current.triangles, gl.info.render.triangles)
    if (timer.current < 0.12) return
    timer.current = 0
    const peakCalls = peak.current.calls, peakTriangles = peak.current.triangles
    peak.current.calls = 0; peak.current.triangles = 0
    scene.updateMatrixWorld(); camera.updateMatrixWorld()
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projection)
    const moon = scene.getObjectByName('celestial:moon')!, base = scene.getObjectByName('artemis-base')!, earth = scene.getObjectByName('celestial:earth')!, sun = scene.getObjectByName('celestial:sun')!
    const globe = scene.getObjectByName('moon-surface') as THREE.Mesh
    const visible = (node: THREE.Object3D) => { node.getWorldPosition(point); return frustum.containsPoint(point) && point.clone().sub(camera.position).dot(camera.getWorldDirection(new THREE.Vector3())) > 0 }
    const actors: { name: string; position: number[] }[] = []
    scene.traverse((node) => { if (node.name.startsWith('astronaut:') || node.name === 'rover:MILO') actors.push({ name: node.name, position: node.position.toArray() }) })
    const targets = BUILDINGS.map((b) => { point.fromArray(colonyToRegion(b.position[0], heightAt(b.position[0], b.position[2]) + 1, b.position[2])).multiplyScalar(METRE).project(camera); return { id: b.id, x: (point.x * 0.5 + 0.5) * size.width, y: (0.5 - point.y * 0.5) * size.height } })
    const u = universe.current
    point.copy(u.roverPosition).multiplyScalar(METRE); point.y += 0.0008; point.project(camera)
    const rover = { ...u.roverStatus, position: u.roverPosition.toArray(), nominal: u.roverNominal.toArray(), screen: { x: (point.x * 0.5 + 0.5) * size.width, y: (0.5 - point.y * 0.5) * size.height }, follow: u.followRover, groundError: Math.abs(u.roverPosition.y - actualTerrainHeight(u.roverPosition.x, u.roverPosition.z)) || 0 }
    window.__LUNARIS__ = { revision: THREE.REVISION, renderer: 'WebGL2 / logarithmic depth', camera: camera.position.toArray(), target: u.cameraTarget.toArray(), viewCentre: u.viewCentre.toArray(), drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles, drawCallsPeak: peakCalls, trianglesPeak: peakTriangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, frameMs: average.current, mode: u.mode, time: clock.current.time, actors, sceneId: scene.uuid, moonId: moon.uuid, baseId: base.uuid, earthId: earth.uuid, sunId: sun.uuid, terrainGeometryId: 'nasa-lola-dem-tiles', moonGeometryId: globe.geometry.uuid, baseScale: base.getWorldScale(new THREE.Vector3()).toArray(), moonCenter: moon.getWorldPosition(new THREE.Vector3()).toArray(), baseAnchor: base.getWorldPosition(new THREE.Vector3()).toArray(), earthPosition: earth.getWorldPosition(new THREE.Vector3()).toArray(), sunPosition: sun.getWorldPosition(new THREE.Vector3()).toArray(), altitudeM: u.altitudeM, clearanceM: u.clearanceM, styleDetail: u.styleDetail, targets, celestialVisibility: { moon: visible(moon), earth: visible(earth), sun: visible(sun) }, rover, cameraTravel: { ...u.cameraTravel }, terrain: { source: 'NASA LOLA 5 m DEM (Site01 + Site04)', ...terrainStats }, terrainPending: terrainStats.pending > 0 ? 1 : 0 }
  })
  return null
}

class SceneErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <div className="webgl-fallback glass"><Globe2 size={44} /><h2>Cùng trở lại Mặt Trăng</h2><p>Hãy bật tăng tốc phần cứng và thử lại trong Chrome hoặc Edge để mở vũ trụ 3D.</p><button className="primary-button" onClick={() => location.reload()}><RefreshCw size={16} /> Thử lại</button></div> : this.props.children }
}

export const World = forwardRef<WorldHandle, WorldProps>(function World(props, ref) {
  const [canvasReady, setCanvasReady] = useState(false)
  const [coverage, setCoverage] = useState<CoverageClass>(2)
  const focusPoint = useCallback((x: number, z: number) => rig.current?.focusPoint(x, z), [])
  useEffect(() => {
    // Test-only hook (like the other ?debug=1 helpers): fly to a region-local point.
    if (!new URLSearchParams(location.search).has('debug')) return
    window.__LUNARIS_TEST_FOCUS__ = focusPoint
    return () => { delete window.__LUNARIS_TEST_FOCUS__ }
  }, [focusPoint])
  const clock = useRef<VisualTime>({ time: 0, delta: 0, actionId: 0, actionStart: 0 })
  const universe = useRef(initialUniverseState()), rig = useRef<WorldHandle>(null), ready = useRef(false)
  const onReady = useCallback(() => { if (!ready.current) { ready.current = true; setCanvasReady(true); props.onReady() } }, [props.onReady])
  useImperativeHandle(ref, () => ({ zoom: (d) => rig.current?.zoom(d), reset: () => rig.current?.reset(), focus: (id) => rig.current?.focus(id), focusCrew: (name) => rig.current?.focusCrew(name), focusPoint: (x, z) => rig.current?.focusPoint(x, z) }), [])
  return <div className="world" data-camera-mode={props.mode} data-unified-scene="true" data-ready={canvasReady}>
    <SceneErrorBoundary>
      <Canvas shadows="percentage" dpr={[1, props.preferences.quality === 'high' ? 1.5 : 1]} camera={{ position: [0.0232, 0.027, 0.0295], fov: 40, near: 0.00002, far: SPACE_FAR_KM }} gl={{ antialias: true, alpha: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' }} onCreated={({ gl, camera, raycaster }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.08; gl.outputColorSpace = THREE.SRGBColorSpace; camera.layers.enable(1); raycaster.layers.enable(1) }}>
        <color attach="background" args={['#090d1e']} />
        <VisualClockContext.Provider value={clock}><UniverseContext.Provider value={universe}>
          <Suspense fallback={null}><DemGate>
            <ClockDriver clock={clock} paused={props.paused} speed={props.speed} demo={props.demo} onPhase={props.onPhase} onReady={onReady} />
            <PlanetCameraRig ref={rig} request={props.cameraRequest} followRover={props.followRover} onStopFollow={() => props.onFollowRover(false)} reducedMotion={props.preferences.reducedMotion} onMode={props.onDistanceMode} onTravel={props.onCameraTravel} />
            <SolarLighting hour={props.forecastHour} radiation={props.demo?.kind === 'radiation' && props.demo.phase !== 'complete'} reducedMotion={props.preferences.reducedMotion} quality={props.preferences.quality} />
            <Starfield /><Earth reducedMotion={props.preferences.reducedMotion} /><Sun reducedMotion={props.preferences.reducedMotion} />
            <group name="celestial:moon" position={MOON_CENTER}>
              <MoonGlobe />
              <SouthPoleRegion props={props} clock={clock} onCoverage={setCoverage} onFocusPoint={focusPoint} />
              <group position={[0, MOON_RADIUS_KM, 0]}><ArtemisMarker onFocus={() => props.onMode('base')} /></group>
            </group>
            <Diagnostics />
          </DemGate></Suspense>
        </UniverseContext.Provider></VisualClockContext.Provider>
      </Canvas>
    </SceneErrorBoundary>
    <div className="world-vignette" />
    {!canvasReady && <div className="terrain-loading" role="status">Đang tải địa hình NASA LOLA…</div>}
    {canvasReady && coverage < 2 && props.mode !== 'orbit' && <div className="nodata-chip glass" role="status"><b>Ngoài vùng dữ liệu NASA</b><span>{coverage === 1 ? 'Chưa có DEM LOLA 5 m cho khu này — không hiển thị địa hình, rover không đi vào.' : 'Ngoài bản đồ 25 km — không hiển thị địa hình.'}</span></div>}
  </div>
})
