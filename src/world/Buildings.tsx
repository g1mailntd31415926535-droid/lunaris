import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { BuildingData, BuildingId, CameraMode, DemoAction } from '../types'
import { BUILDINGS } from '../data'
import { BuildingIcon } from '../components/Icons'
import { createBuildingModel } from './models'
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

function Building({ data, selected, onSelect, mode, labels, demo, reducedMotion, onHover }: { data: BuildingData; selected: boolean; onSelect: (id: BuildingId) => void; mode: CameraMode; labels: boolean; demo: DemoAction | null; reducedMotion: boolean; onHover: (hover: boolean) => void }) {
  const [hover, setHover] = useState(false)
  const model = useMemo(() => createBuildingModel(data.id), [data.id])
  const screen = useMemo(() => screenTexture(data.id, data.accent), [data.id, data.accent])
  const ring = useRef<THREE.Mesh>(null)
  const activity = useRef<THREE.MeshStandardMaterial>(null)
  const clock = useVisualTime()
  const screenPlacement = SCREEN_PLACEMENT[data.id]
  const operating = demo?.phase === 'working' && (demo.kind === data.id || (demo.kind === 'radiation' && data.id === 'shelter'))
  useEffect(() => () => { model.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() }) }, [model])
  useFrame(() => {
    if (ring.current) {
      const pulse = reducedMotion ? 0 : Math.sin(clock.current.time * 2.0) * 0.008
      ring.current.scale.setScalar(1 + pulse)
    }
    if (activity.current) activity.current.emissiveIntensity = operating ? 2 + (reducedMotion ? 0 : Math.sin(clock.current.time * 3.5) * 0.45) : 0.85
  })
  const height = heightAt(data.position[0], data.position[2]) + 0.02
  return <group name={`interactive:${data.id}`} position={[data.position[0], height, data.position[2]]}
    onClick={(event) => { event.stopPropagation(); if (event.delta < 6) onSelect(data.id) }}
    onPointerOver={(event) => { event.stopPropagation(); setHover(true); onHover(true) }}
    onPointerOut={() => { setHover(false); onHover(false) }}>
    <primitive object={model} />
    <mesh position={screenPlacement.position}><planeGeometry args={screenPlacement.size} /><meshStandardMaterial ref={activity} map={screen} emissiveMap={screen} emissive="#ffffff" emissiveIntensity={0.85} roughness={0.5} /></mesh>
    {data.id === 'water' && <WaterActivity demo={demo} reducedMotion={reducedMotion} />}
    {data.id === 'greenhouse' && <mesh position={[0, 0.83, 0]}><sphereGeometry args={[2.5, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshPhysicalMaterial color="#a1e2dc" roughness={0.13} metalness={0.25} transparent opacity={0.17} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
    {(selected || hover) && <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.075, 0]}><ringGeometry args={[data.radius + 0.2, data.radius + 0.25, 64]} /><meshBasicMaterial color={data.accent} transparent opacity={selected ? 0.78 : 0.4} depthWrite={false} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.065, 0]}><circleGeometry args={[data.radius + 0.2, 64]} /><meshBasicMaterial color={data.accent} transparent opacity={0.045} depthWrite={false} /></mesh>
      {[0, 1, 2, 3].map((i) => <mesh key={i} rotation={[-Math.PI / 2, 0, i * Math.PI / 2]} position={[0, 0.08, 0]}><ringGeometry args={[data.radius + 0.29, data.radius + 0.37, 12, 1, 0.22, 0.19]} /><meshBasicMaterial color={data.accent} transparent opacity={0.8} depthWrite={false} /></mesh>)}
    </group>}
    {mode === 'base' && (selected || hover || labels) && <Html center position={[0, data.id === 'command' ? 5.35 : data.id === 'solar' ? 2.35 : data.id === 'rover' ? 4.05 : 3.85, 0]} distanceFactor={47 * METRE} zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <button className={`world-label ${selected ? 'selected' : ''}`} style={{ color: data.accent, pointerEvents: 'auto' }} onClick={(e) => { e.stopPropagation(); onSelect(data.id) }} aria-label={`Xem ${data.name}`}><BuildingIcon id={data.id} size={13} /><span>{data.shortName}</span><i /></button>
      {operating && <span className="world-working">Đang hoạt động<span>···</span></span>}
    </Html>}
    {data.id === 'water' && operating && <Html center position={[-2.25, 1.6, 1]} distanceFactor={37 * METRE} zIndexRange={[18, 9]} style={{ pointerEvents: 'none' }}><div className="world-resource-meter"><span>H₂O <b>72%</b></span><i><em /></i><small>+16 · minh họa</small></div></Html>}
  </group>
}

export function Buildings({ selected, onSelect, mode, labels, demo, reducedMotion, onHover }: { selected: BuildingId | null; onSelect: (id: BuildingId) => void; mode: CameraMode; labels: boolean; demo: DemoAction | null; reducedMotion: boolean; onHover: (hover: boolean) => void }) {
  return <group name="artemis-colony">{BUILDINGS.map((data) => <Building key={data.id} data={data} selected={selected === data.id} onSelect={onSelect} mode={mode} labels={labels} demo={demo} reducedMotion={reducedMotion} onHover={onHover} />)}</group>
}
