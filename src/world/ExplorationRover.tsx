import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { CameraMode, RoverStatus } from '../types'
import { useVisualTime } from './clock'
import { useUniverse } from './universe-context'
import { sampleTerrain } from './terrain-query'
import { createRoverModel } from './models'
import { MATERIALS as M } from './model-kit'
import { ROVER_DEPOT, roverPresentation } from './rover-plan'
import type { SurveyLeg } from './rover-plan'

type Polyline = [number, number, number][]

/** Samples a ground line on the real DEM; points over NoData are dropped, never interpolated. */
function groundLine(count: number, at: (t: number) => [number, number], lift: number): Polyline {
  const points: Polyline = []
  for (let i = 0; i <= count; i++) {
    const [x, z] = at(i / count), sample = sampleTerrain(x, z)
    if (sample.valid) points.push([x, sample.point[1] + lift, z])
  }
  return points
}

export function ExplorationRover({ selected, follow, mode, reducedMotion, showRoute, onSelect, onFollow, onStatus }: { selected: boolean; follow: boolean; mode: CameraMode; reducedMotion: boolean; showRoute: boolean; onSelect: () => void; onFollow: () => void; onStatus: (status: RoverStatus) => void }) {
  const clock = useVisualTime(), universe = useUniverse()
  const system = useRef<THREE.Group>(null), root = useRef<THREE.Group>(null), scanner = useRef<THREE.Group>(null)
  const tires = useRef<THREE.InstancedMesh>(null), hubs = useRef<THREE.InstancedMesh>(null), centres = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.LineLoop>(null), beam = useRef<THREE.Line>(null)
  const model = useMemo(createRoverModel, [])
  const [route, setRoute] = useState<{ driven: Polyline; beyond: Polyline }>({ driven: [], beyond: [] })
  const lastRoute = useRef(''), lastStatus = useRef(-1), seekOffset = useRef(0), groundY = useRef(0)
  const scratch = useMemo(() => ({ nominal: new THREE.Vector3(ROVER_DEPOT[0], 0, ROVER_DEPOT[1]), tangent: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(), right: new THREE.Vector3(), forward: new THREE.Vector3(), matrix: new THREE.Matrix4(), desired: new THREE.Quaternion(), dummy: new THREE.Object3D(), axle: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), spin: new THREE.Quaternion() }), [])
  const radarGeometry = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3)), [])
  const beamGeometry = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3)), [])
  const beamObject = useMemo(() => new THREE.Line(beamGeometry, new THREE.LineBasicMaterial({ color: '#a7f2dd', transparent: true, opacity: 0.8, depthWrite: false })), [beamGeometry])
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) window.__LUNARIS_ROVER__ = { seek(seconds) { seekOffset.current = seconds - clock.current.time } }
    return () => { delete window.__LUNARIS_ROVER__; model.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() }); radarGeometry.dispose(); beamGeometry.dispose(); (beamObject.material as THREE.Material).dispose() }
  }, [clock, model, radarGeometry, beamGeometry, beamObject])

  useFrame((_, delta) => {
    if (!root.current) return
    const u = universe.current
    if (system.current) system.current.visible = u.altitudeM < 20_000
    const presentation = roverPresentation(Math.max(0, clock.current.time + seekOffset.current))
    const { leg, phase, progress, speed, trip, phaseTime } = presentation
    const s = scratch
    if (leg) { leg.curve.getPointAt(progress, s.nominal); leg.curve.getTangentAt(progress, s.tangent) }
    // MILO stands on the real DEM. Over NoData (which no leg crosses) it would keep its last real height.
    const sample = sampleTerrain(s.nominal.x, s.nominal.z, groundY.current)
    if (sample.valid) groundY.current = sample.point[1]
    s.normal.fromArray(sample.normal)
    s.forward.copy(s.tangent).multiplyScalar(phase === 'returning' ? -1 : 1).addScaledVector(s.normal, -s.tangent.dot(s.normal) * (phase === 'returning' ? -1 : 1)).normalize()
    s.right.crossVectors(s.normal, s.forward).normalize(); s.forward.crossVectors(s.right, s.normal).normalize()
    s.matrix.makeBasis(s.right, s.normal, s.forward); s.desired.setFromRotationMatrix(s.matrix)
    root.current.quaternion.slerp(s.desired, 1 - Math.exp(-12 * Math.min(delta, 0.1)))
    root.current.position.fromArray(sample.point).addScaledVector(s.normal, -0.0835)
    u.roverPosition.fromArray(sample.point); u.roverNominal.copy(s.nominal); u.roverNormal.copy(s.normal)
    const limit = leg?.site.zone.route_check.slope_limit_deg_SCENARIO ?? 15
    const note = !leg ? 'Chưa có tuyến nào được kiểm chứng' : leg.reachesSite ? 'Tuyến chưa kiểm chứng · chỉ quan sát' : `Quay lại sau ${Math.round(leg.reachM)} m: phía trước dốc hơn ${limit}° (giả định) · tuyến chưa kiểm chứng`
    u.roverStatus = { phase, site: phase === 'docked' || !leg ? 'Căn cứ Artemis' : `Hướng tới ${leg.site.id} · ${leg.site.name}`, siteId: leg?.site.id ?? 'base', trip, distance: Math.hypot(sample.point[0], sample.point[2]), speed, note }
    if (Math.floor(clock.current.time * 2) !== lastStatus.current) { lastStatus.current = Math.floor(clock.current.time * 2); onStatus(u.roverStatus) }

    const length = leg?.length ?? 0
    const distance = phase === 'returning' ? length * (2 - progress) : phase === 'docked' ? 0 : length * progress
    s.spin.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -distance / (0.35 * 0.69))
    for (let side = 0; side < 2; side++) for (let i = 0; i < 3; i++) {
      const direction = side === 0 ? -1 : 1, index = side * 3 + i
      s.dummy.position.set(direction * 0.77, 0.5, (i - 1) * 0.75); s.dummy.quaternion.copy(s.spin).multiply(s.axle); s.dummy.scale.setScalar(1); s.dummy.updateMatrix(); tires.current?.setMatrixAt(index, s.dummy.matrix)
      s.dummy.position.x += direction * 0.18; s.dummy.updateMatrix(); hubs.current?.setMatrixAt(index, s.dummy.matrix)
      s.dummy.position.x += direction * 0.02; s.dummy.updateMatrix(); centres.current?.setMatrixAt(index, s.dummy.matrix)
    }
    for (const mesh of [tires.current, hubs.current, centres.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true
    if (scanner.current) scanner.current.rotation.y = phase === 'scanning' && !reducedMotion ? phaseTime * 1.1 : 0
    const scanning = phase === 'scanning'
    if (ring.current) ring.current.visible = scanning
    if (beam.current) beam.current.visible = scanning
    if (scanning) {
      const radius = 7.5, ringPositions = radarGeometry.getAttribute('position'), beamPositions = beamGeometry.getAttribute('position'), angle = reducedMotion ? 0.6 : phaseTime * 1.1
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const p = sampleTerrain(s.nominal.x + Math.cos(a) * radius, s.nominal.z + Math.sin(a) * radius, groundY.current).point; ringPositions.setXYZ(i, p[0], p[1] + 0.07, p[2]) }
      for (let i = 0; i < 9; i++) { const r = i / 8 * radius; const p = sampleTerrain(s.nominal.x + Math.cos(angle) * r, s.nominal.z + Math.sin(angle) * r, groundY.current).point; beamPositions.setXYZ(i, p[0], p[1] + 0.09, p[2]) }
      ringPositions.needsUpdate = true; beamPositions.needsUpdate = true
      radarGeometry.computeBoundingSphere(); beamGeometry.computeBoundingSphere()
    }
    const routeKey = leg ? `${leg.site.id}-${u.altitudeM > 400 ? 'far' : 'near'}` : ''
    if (leg && (selected || follow) && routeKey !== lastRoute.current) {
      lastRoute.current = routeKey
      setRoute(buildRoute(leg))
    }
  }, -3.5)

  const dash = Math.max(0.4, universe.current.altitudeM * 0.004), gap = Math.max(0.65, universe.current.altitudeM * 0.007)
  return <group ref={system} name="autonomous-exploration-system">
    {(selected || follow) && showRoute && route.driven.length > 1 && <Line name="milo-current-route" points={route.driven} color="#9bd8e0" lineWidth={1.1} dashed dashSize={dash} gapSize={gap} transparent opacity={0.4} />}
    {/* The rest of the straight check line is NOT driven: it contains stretches steeper than the scenario limit. */}
    {(selected || follow) && showRoute && route.beyond.length > 1 && <Line name="milo-unverified-line" points={route.beyond} color="#ff8f7d" lineWidth={1} dashed dashSize={dash * 0.6} gapSize={gap * 1.4} transparent opacity={0.42} />}
    <lineLoop ref={ring} geometry={radarGeometry} visible={false}><lineBasicMaterial color="#91e8d8" transparent opacity={0.5} depthWrite={false} /></lineLoop>
    <primitive ref={beam} object={beamObject} visible={false} />
    <group ref={root} name="rover:MILO" scale={0.69} onClick={(e) => { e.stopPropagation(); if (e.delta < 6) onSelect() }} onDoubleClick={(e) => { e.stopPropagation(); onSelect(); onFollow() }}>
      <primitive object={model} />
      <instancedMesh ref={tires} args={[undefined, undefined, 6]} castShadow><cylinderGeometry args={[0.35, 0.35, 0.31, 14]} /><primitive object={M.black} attach="material" /></instancedMesh>
      <instancedMesh ref={hubs} args={[undefined, undefined, 6]}><cylinderGeometry args={[0.19, 0.19, 0.03, 10]} /><primitive object={M.trim} attach="material" /></instancedMesh>
      <instancedMesh ref={centres} args={[undefined, undefined, 6]}><cylinderGeometry args={[0.095, 0.095, 0.035, 8]} /><primitive object={M.yellow} attach="material" /></instancedMesh>
      <group ref={scanner} position={[0.1, 2.24, -0.37]}><mesh position={[0.33, 0, 0]}><boxGeometry args={[0.07, 0.13, 0.22]} /><meshStandardMaterial color="#a2f6ce" emissive="#57dba8" emissiveIntensity={1.4} /></mesh></group>
      {(selected || follow || mode === 'region') && <Html center position={[0, 3.4, 0]} zIndexRange={[24, 10]}><button className={`rover-world-marker ${follow ? 'following' : ''}`} aria-label="Chọn MILO. Nhấp đúp để theo dõi" onClick={onSelect} onDoubleClick={onFollow}><span />MILO{follow && <small>THEO DÕI</small>}</button></Html>}
    </group>
  </group>
}

function buildRoute(leg: SurveyLeg) {
  const point = new THREE.Vector3()
  const driven = groundLine(Math.max(60, Math.min(900, Math.ceil(leg.length / 4))), (t) => { leg.curve.getPointAt(t, point); return [point.x, point.z] }, 0.35)
  const [sx, sz] = leg.site.position, ux = sx / leg.lineLengthM, uz = sz / leg.lineLengthM
  const rest = leg.lineLengthM - leg.reachM
  const beyond = leg.reachesSite ? [] : groundLine(Math.max(40, Math.min(900, Math.ceil(rest / 10))), (t) => [ux * (leg.reachM + rest * t), uz * (leg.reachM + rest * t)], 0.6)
  return { driven, beyond }
}
