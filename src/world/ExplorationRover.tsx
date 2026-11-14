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
import { roverPresentation, SURVEY_ROCKS } from './rover-plan'

function SurveyRocks() {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const dummy = new THREE.Object3D(), colour = new THREE.Color()
    SURVEY_ROCKS.forEach((rock, i) => {
        const { size, angle } = rock, surface = sampleTerrain(rock.x, rock.z)
        dummy.position.fromArray(surface.point).addScaledVector(new THREE.Vector3(...surface.normal), size * 0.4)
        dummy.scale.set(size, size * 0.65, size * 0.8); dummy.rotation.set(0.15, angle, 0.2); dummy.updateMatrix()
        ref.current?.setMatrixAt(i, dummy.matrix)
        colour.set('#898398').multiplyScalar(rock.shade); ref.current?.setColorAt(i, colour)
    })
    if (ref.current) { ref.current.instanceMatrix.needsUpdate = true; if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true; ref.current.computeBoundingSphere() }
  }, [])
  return <instancedMesh ref={ref} name="survey-rock-landmarks" args={[undefined, undefined, SURVEY_ROCKS.length]} castShadow receiveShadow><icosahedronGeometry args={[1, 0]} /><meshStandardMaterial color="#aaa1b3" roughness={0.95} flatShading /></instancedMesh>
}

export function ExplorationRover({ selected, follow, mode, reducedMotion, showRoute, onSelect, onFollow, onStatus }: { selected: boolean; follow: boolean; mode: CameraMode; reducedMotion: boolean; showRoute: boolean; onSelect: () => void; onFollow: () => void; onStatus: (status: RoverStatus) => void }) {
  const clock = useVisualTime(), universe = useUniverse()
  const root = useRef<THREE.Group>(null), scanner = useRef<THREE.Group>(null)
  const tires = useRef<THREE.InstancedMesh>(null), hubs = useRef<THREE.InstancedMesh>(null), centres = useRef<THREE.InstancedMesh>(null)
  const ring = useRef<THREE.LineLoop>(null), beam = useRef<THREE.Line>(null)
  const model = useMemo(createRoverModel, [])
  const [route, setRoute] = useState<[number, number, number][]>([])
  const lastRoute = useRef(''), lastStatus = useRef(-1), seekOffset = useRef(0)
  const scratch = useMemo(() => ({ nominal: new THREE.Vector3(), tangent: new THREE.Vector3(), normal: new THREE.Vector3(), right: new THREE.Vector3(), forward: new THREE.Vector3(), matrix: new THREE.Matrix4(), desired: new THREE.Quaternion(), dummy: new THREE.Object3D(), axle: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), spin: new THREE.Quaternion() }), [])
  const radarGeometry = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(48 * 3), 3)), [])
  const beamGeometry = useMemo(() => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3)), [])
  const beamObject = useMemo(() => new THREE.Line(beamGeometry, new THREE.LineBasicMaterial({ color: '#a7f2dd', transparent: true, opacity: 0.8, depthWrite: false })), [beamGeometry])
  useEffect(() => {
    if (new URLSearchParams(location.search).has('debug')) window.__LUNARIS_ROVER__ = { seek(seconds) { seekOffset.current = seconds - clock.current.time } }
    return () => { delete window.__LUNARIS_ROVER__; model.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() }); radarGeometry.dispose(); beamGeometry.dispose(); (beamObject.material as THREE.Material).dispose() }
  }, [clock, model, radarGeometry, beamGeometry, beamObject])

  useFrame((_, delta) => {
    if (!root.current) return
    const presentation = roverPresentation(Math.max(0, clock.current.time + seekOffset.current))
    const { leg, phase, progress, speed, trip, phaseTime } = presentation
    const s = scratch, u = universe.current
    leg.curve.getPointAt(progress, s.nominal); leg.curve.getTangentAt(progress, s.tangent)
    const sample = sampleTerrain(s.nominal.x, s.nominal.z)
    s.normal.fromArray(sample.normal)
    s.forward.copy(s.tangent).multiplyScalar(phase === 'returning' ? -1 : 1).addScaledVector(s.normal, -s.tangent.dot(s.normal) * (phase === 'returning' ? -1 : 1)).normalize()
    s.right.crossVectors(s.normal, s.forward).normalize(); s.forward.crossVectors(s.right, s.normal).normalize()
    s.matrix.makeBasis(s.right, s.normal, s.forward); s.desired.setFromRotationMatrix(s.matrix)
    root.current.quaternion.slerp(s.desired, 1 - Math.exp(-12 * Math.min(delta, 0.1)))
    root.current.position.fromArray(sample.point).addScaledVector(s.normal, -0.0835)
    u.roverPosition.fromArray(sample.point); u.roverNominal.copy(s.nominal); u.roverNormal.copy(s.normal)
    u.roverStatus = { phase, site: phase === 'docked' ? 'Căn cứ Artemis' : leg.site.name, siteId: leg.site.id, trip, distance: Math.hypot(sample.point[0], sample.point[2]), speed }
    if (Math.floor(clock.current.time * 2) !== lastStatus.current) { lastStatus.current = Math.floor(clock.current.time * 2); onStatus(u.roverStatus) }

    const distance = phase === 'returning' ? leg.length * (2 - progress) : phase === 'docked' ? 0 : leg.length * progress
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
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const p = sampleTerrain(s.nominal.x + Math.cos(a) * radius, s.nominal.z + Math.sin(a) * radius).point; ringPositions.setXYZ(i, p[0], p[1] + 0.07, p[2]) }
      for (let i = 0; i < 9; i++) { const r = i / 8 * radius; const p = sampleTerrain(s.nominal.x + Math.cos(angle) * r, s.nominal.z + Math.sin(angle) * r).point; beamPositions.setXYZ(i, p[0], p[1] + 0.09, p[2]) }
      ringPositions.needsUpdate = true; beamPositions.needsUpdate = true
      radarGeometry.computeBoundingSphere(); beamGeometry.computeBoundingSphere()
    }
    const routeKey = `${trip}-${phase === 'returning' ? 'return' : 'out'}`
    if ((selected || follow) && routeKey !== lastRoute.current) {
      lastRoute.current = routeKey
      const count = Math.max(100, Math.min(1800, Math.ceil(leg.length / 5))), points: [number, number, number][] = []
      for (let i = 0; i <= count; i++) { leg.curve.getPointAt(i / count, s.nominal); const p = sampleTerrain(s.nominal.x, s.nominal.z).point; points.push([p[0], p[1] + 0.15, p[2]]) }
      setRoute(points)
    }
  }, -3.5)

  return <group name="autonomous-exploration-system">
    <SurveyRocks />
    {route.length > 1 && (selected || follow) && showRoute && <Line name="milo-current-route" points={route} color="#9bd8e0" lineWidth={1.1} dashed dashSize={Math.max(0.4, universe.current.altitudeM * 0.004)} gapSize={Math.max(0.65, universe.current.altitudeM * 0.007)} transparent opacity={0.36} />}
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
