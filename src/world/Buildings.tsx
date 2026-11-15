import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { BuildingData, BuildingId, CameraMode, DemoAction } from '../types'
import { BUILDINGS } from '../data'
import { BuildingIcon } from '../components/Icons'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SOLAR_HEAD_HEIGHT, SOLAR_TOWERS, createBuildingModel, solarTrackerHead } from './models'
import { useUniverse } from './universe-context'
import { createSettlementDetailsModel } from './Terrain'
import { screenTexture } from './textures'
import { heightAt } from './terrain-field'
import { MATERIALS as M } from './model-kit'
import { useVisualTime } from './clock'
import { METRE } from './space-config'

const SCREEN_PLACEMENT: Record<BuildingId, { position: [number, number, number]; size: [number, number] }> = {
  command: { position: [0, 2.38, 2.54], size: [0.53, 0.53] },
  solar: { position: [2.75, 0.72, 2.445], size: [0.4, 0.4] },
  water: { position: [0.5, 2.08, 0.744], size: [1.2, 1.04] },
  oxygen: { position: [-0.65, 1.92, 0.79], size: [0.77, 0.83] },
  battery: { position: [0, 1.33, 1.279], size: [1.29, 1.09] },
  shelter: { position: [0, 2.01, 1.5], size: [0.48, 0.4] },
  greenhouse: { position: [0, 0.58, 2.635], size: [0.4, 0.28] },
  rover: { position: [0, 3.01, 0.354], size: [1.15, 0.39] },
}

/**
 * The solar heads turn every frame to face the scene Sun (azimuth about the mast, then tilt up to its elevation).
 * The Sun direction is the game's artistic Sun (World.tsx SolarLighting), converted into the building's own frame.
 */
/** Sun tracking + A3 stow: `stowed` folds both wings on their hinges (deployed → folding → folded → deploying). */
function SolarTrackers({ reducedMotion, stowed }: { reducedMotion: boolean; stowed: boolean }) {
  const universe = useUniverse()
  const heads = useMemo(() => SOLAR_TOWERS.map(() => solarTrackerHead()), [])
  const root = useRef<THREE.Group>(null)
  const scratch = useMemo(() => ({ q: new THREE.Quaternion(), d: new THREE.Vector3(), yaw: Number.NaN, pitch: 0, fold: stowed ? 1 : 0 }), [])   // eslint-disable-line react-hooks/exhaustive-deps
  const wings = useMemo(() => heads.flatMap((h) => h.children.filter((c) => c.name === 'solar-wing')), [heads])
  useEffect(() => () => heads.forEach((h) => h.traverse((n) => { if (n instanceof THREE.Mesh) n.geometry.dispose() })), [heads])
  useFrame((_, delta) => {
    const group = root.current
    if (!group) return
    group.getWorldQuaternion(scratch.q).invert()
    const d = scratch.d.copy(universe.current.sunDirection).applyQuaternion(scratch.q).normalize()
    const yaw = Math.atan2(d.x, d.z), pitch = -THREE.MathUtils.clamp(Math.asin(d.y), 0, 1.2)
    if (Number.isNaN(scratch.yaw) || reducedMotion) { scratch.yaw = yaw; scratch.pitch = pitch }
    else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2.5)               // slow, motor-like slewing
      scratch.yaw += Math.atan2(Math.sin(yaw - scratch.yaw), Math.cos(yaw - scratch.yaw)) * k
      scratch.pitch += (pitch - scratch.pitch) * k
    }
    // Fold at a motor-like rate (~3 s); the head keeps tracking the Sun's azimuth and stands upright while folded.
    const target = stowed ? 1 : 0
    scratch.fold = reducedMotion ? target : scratch.fold + Math.sign(target - scratch.fold) * Math.min(Math.abs(target - scratch.fold), Math.min(delta, 0.1) / 3)
    const e = scratch.fold * scratch.fold * (3 - 2 * scratch.fold)
    for (const head of heads) head.rotation.set(scratch.pitch * (1 - e), scratch.yaw, 0, 'YXZ')
    for (const wing of wings) wing.rotation.y = -wing.userData.side * e * Math.PI / 2
    group.userData.fold = scratch.fold
  })
  return <group ref={root} name="solar-trackers">
    {heads.map((head, i) => <primitive key={i} object={head} position={[SOLAR_TOWERS[i][0], SOLAR_HEAD_HEIGHT, SOLAR_TOWERS[i][1]]} />)}
  </group>
}

function WaterActivity({ demo, reducedMotion }: { demo: DemoAction | null; reducedMotion: boolean }) {
  const clock = useVisualTime()
  const liquid = useRef<THREE.Mesh>(null)
  const bubbles = useRef<THREE.InstancedMesh>(null)
  const wheel = useRef<THREE.Group>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const t = reducedMotion ? 0 : clock.current.time
    const active = demo?.kind === 'water' && demo.phase !== 'complete' && demo.id === clock.current.actionId
    const elapsed = active ? clock.current.time - clock.current.actionStart : 0
    const level = demo?.kind === 'water' && demo.phase === 'complete' ? 0.82 : active && elapsed > 2.3 ? Math.min(0.82, 0.58 + (elapsed - 2.3) * 0.07) : 0.58
    if (liquid.current) { liquid.current.scale.y = level; liquid.current.position.y = 0.56 + level * 0.75 }
    if (wheel.current) wheel.current.rotation.z = active && elapsed > 2.3 ? t * 2.8 : t * 0.08
    for (let i = 0; i < 9; i++) {
      const y = 0.6 + ((t * (active ? 0.38 : 0.08) + i * 0.17) % Math.max(0.1, level * 1.4))
      dummy.position.set(-1.35 + Math.sin(i * 3) * 0.38, y, 0.2 + Math.cos(i * 3) * 0.31)
      const size = 0.025 + (i % 3) * 0.017
      dummy.scale.setScalar(size); dummy.updateMatrix(); bubbles.current?.setMatrixAt(i, dummy.matrix)
    }
    if (bubbles.current) bubbles.current.instanceMatrix.needsUpdate = true
  })
  return <group>
    <mesh position={[-1.35, 1.3, 0.2]}><cylinderGeometry args={[0.65, 0.65, 1.65, 24, 1, true]} /><meshPhysicalMaterial color="#9eeaff" transparent opacity={0.25} roughness={0.08} metalness={0.18} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <mesh ref={liquid} position={[-1.35, 0.99, 0.2]}><cylinderGeometry args={[0.61, 0.61, 1.5, 24]} /><meshStandardMaterial color="#37b8eb" emissive="#1498d4" emissiveIntensity={0.95} transparent opacity={0.78} roughness={0.15} /></mesh>
    <instancedMesh ref={bubbles} args={[undefined, undefined, 9]}><sphereGeometry args={[1, 7, 5]} /><meshBasicMaterial color="#c9faff" /></instancedMesh>
    <group ref={wheel} position={[1.55, 1.88, 0.23]}><mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.18, 0.036, 6, 12]} /><primitive object={M.cyan} attach="material" /></mesh><mesh><boxGeometry args={[0.3, 0.045, 0.045]} /><primitive object={M.trim} attach="material" /></mesh></group>
  </group>
}

/** Position-only merge of a building model: never drawn (invisible material), only raycast for picking. */
function buildingPickGeometry(id: BuildingId) {
  const model = createBuildingModel(id), parts: THREE.BufferGeometry[] = []
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return
    const g = node.geometry as THREE.BufferGeometry, part = new THREE.BufferGeometry()
    part.setAttribute('position', g.attributes.position); if (g.index) part.setIndex(g.index)
    parts.push(part.index ? part.toNonIndexed() : part)
  })
  const merged = mergeGeometries(parts, false)!
  merged.computeBoundingSphere(); merged.computeBoundingBox()
  model.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() })
  return merged
}

function Building({ data, selected, onSelect, mode, labels, demo, reducedMotion, onHover, solarStowed }: { data: BuildingData; selected: boolean; onSelect: (id: BuildingId) => void; mode: CameraMode; labels: boolean; demo: DemoAction | null; reducedMotion: boolean; onHover: (hover: boolean) => void; solarStowed: boolean }) {
  const [hover, setHover] = useState(false)
  const screen = useMemo(() => screenTexture(data.id, data.accent), [data.id, data.accent])
  const ring = useRef<THREE.Mesh>(null)
  const activity = useRef<THREE.MeshStandardMaterial>(null)
  const clock = useVisualTime()
  const screenPlacement = SCREEN_PLACEMENT[data.id]
  const operating = demo?.phase === 'working' && (demo.kind === data.id || (demo.kind === 'radiation' && data.id === 'shelter'))
  useFrame(() => {
    if (ring.current) {
      const pulse = reducedMotion ? 0 : Math.sin(clock.current.time * 2.0) * 0.008
      ring.current.scale.setScalar(1 + pulse)
    }
    if (activity.current) activity.current.emissiveIntensity = operating ? 2 + (reducedMotion ? 0 : Math.sin(clock.current.time * 3.5) * 0.45) : 0.85
  })
  const height = heightAt(data.position[0], data.position[2]) + 0.02
  const pick = useMemo(() => buildingPickGeometry(data.id), [data.id])
  useEffect(() => () => pick.dispose(), [pick])
  return <group name={`interactive:${data.id}`} position={[data.position[0], height, data.position[2]]}
    onClick={(event) => { event.stopPropagation(); if (event.delta < 6) onSelect(data.id) }}
    onPointerOver={(event) => { event.stopPropagation(); setHover(true); onHover(true) }}
    onPointerOut={() => { setHover(false); onHover(false) }}>
    {/* The visible model lives in the merged colony batch; an unseen copy of its exact shape keeps the building clickable. */}
    <mesh geometry={pick}><meshBasicMaterial visible={false} /></mesh>
    <mesh position={screenPlacement.position}><planeGeometry args={screenPlacement.size} /><meshStandardMaterial ref={activity} map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={0.85} roughness={0.5} /></mesh>
    {data.id === 'water' && <WaterActivity demo={demo} reducedMotion={reducedMotion} />}
    {data.id === 'solar' && <SolarTrackers reducedMotion={reducedMotion} stowed={solarStowed} />}
    {data.id === 'greenhouse' && <mesh position={[0, 0.83, 0]}><sphereGeometry args={[2.5, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshPhysicalMaterial color="#a1e2dc" roughness={0.13} metalness={0.25} transparent opacity={0.17} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
    {(selected || hover) && <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}><ringGeometry args={[data.radius + 0.2, data.radius + 0.25, 64]} /><meshBasicMaterial color={data.accent} transparent opacity={selected ? 0.78 : 0.4} depthWrite={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}><circleGeometry args={[data.radius + 0.2, 64]} /><meshBasicMaterial color={data.accent} transparent opacity={0.045} depthWrite={false} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, i * Math.PI / 2]} position={[0, 0.08, 0]}><ringGeometry args={[data.radius + 0.29, data.radius + 0.37, 12, 1, 0.22, 0.19]} /><meshBasicMaterial color={data.accent} transparent opacity={0.8} depthWrite={false} /></mesh>)}
    </group>}
    {mode === 'base' && (selected || hover || labels) && <Html center position={[0, data.id === 'command' ? 5.35 : data.id === 'solar' ? 4.3 : data.id === 'rover' ? 4.05 : 3.85, 0]} distanceFactor={47 * METRE} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <button className={`world-label ${selected ? 'selected' : ''}`} style={{ color: data.accent, pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); onSelect(data.id) }} aria-label={`Xem ${data.name}`}><BuildingIcon id={data.id} size={13} /><span>{data.shortName}</span><i /></button>
      {operating && <span className="world-working">Đang hoạt động<span>···</span></span>}
    </Html>}
    {data.id === 'water' && operating && <Html center position={[-2.25, 1.6, 1]} distanceFactor={37 * METRE} zIndexRange={[18, 9]} style={{ pointerEvents: 'none' }}><div className="world-resource-meter"><span>H₂O <b>72%</b></span><i><em /></i><small>+16 · minh họa</small></div></Html>}
  </group>
}

/**
 * Every static part of the base (eight building models, paths, lamps, cargo, landing pad) merged into one
 * mesh per shared material. The models and their look are unchanged; only the number of draw calls drops
 * (from one mesh per building per material to one mesh per material).
 */
function ColonyStaticBatch() {
  const batch = useMemo(() => {
    const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
    const collect = (model: THREE.Group, x = 0, y = 0, z = 0) => {
      for (const child of model.children) {
        const mesh = child as THREE.Mesh, geometry = mesh.geometry
        if (x || y || z) geometry.translate(x, y, z)
        const material = mesh.material as THREE.Material, bucket = buckets.get(material) ?? []
        bucket.push(geometry); buckets.set(material, bucket)
      }
    }
    for (const data of BUILDINGS) collect(createBuildingModel(data.id), data.position[0], heightAt(data.position[0], data.position[2]) + 0.02, data.position[2])
    collect(createSettlementDetailsModel())
    const group = new THREE.Group()
    group.name = 'colony-static-batch'
    for (const [material, parts] of buckets) {
      const merged = mergeGeometries(parts, false)!
      merged.computeBoundingBox(); merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      const emissive = material instanceof THREE.MeshStandardMaterial && material.emissiveIntensity > 0.8 && material.emissive.getHex() !== 0
      mesh.castShadow = !emissive; mesh.receiveShadow = true      // same rule as ModelKit.build()
      group.add(mesh)
      parts.forEach((part) => part.dispose())
    }
    return group
  }, [])
  useEffect(() => () => { batch.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() }) }, [batch])
  return <primitive object={batch} />
}

export function Buildings({ selected, onSelect, mode, labels, demo, reducedMotion, onHover, solarStowed = false }: { selected: BuildingId | null; onSelect: (id: BuildingId) => void; mode: CameraMode; labels: boolean; demo: DemoAction | null; reducedMotion: boolean; onHover: (hover: boolean) => void; solarStowed?: boolean }) {
  return <group name="artemis-colony"><ColonyStaticBatch />{BUILDINGS.map((data) => <Building key={data.id} data={data} selected={selected === data.id} onSelect={onSelect} mode={mode} labels={labels} demo={demo} reducedMotion={reducedMotion} onHover={onHover} solarStowed={solarStowed} />)}</group>
}
