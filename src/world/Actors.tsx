import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { DemoAction } from '../types'
import { astronautAtlas, atlasRow, ATLAS_ROWS } from './textures'
import { heightAt, sampleRoute } from './terrain-field'
import { useVisualTime } from './clock'
import { CREW, DEMO_ROUTES, LINEUP, pointOnPath } from './actor-plan'
import { METRE } from './space-config'

let glowTexture: THREE.CanvasTexture | null = null
function haloTexture() {
  if (glowTexture) return glowTexture
  const c = document.createElement('canvas'); c.width = c.height = 128
  const x = c.getContext('2d')!, g = x.createRadialGradient(64, 64, 4, 64, 64, 62)
  g.addColorStop(0, 'rgba(255,232,160,0.95)'); g.addColorStop(0.45, 'rgba(255,214,120,0.38)'); g.addColorStop(1, 'rgba(255,200,100,0)')
  x.fillStyle = g; x.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(c); glowTexture.colorSpace = THREE.SRGBColorSpace
  return glowTexture
}

function Astronaut({ index, demo, reducedMotion, onInspect, greet, away }: { index: number; demo: DemoAction | null; reducedMotion: boolean; onInspect: () => void; greet: boolean; away: boolean }) {
  const crew = CREW[index]
  const root = useRef<THREE.Group>(null)
  const sprite = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null), ground = useRef<THREE.Mesh>(null)
  const clock = useVisualTime()
  const texture = useMemo(() => {
    const t = astronautAtlas(crew.color).clone()
    t.repeat.set(0.25, 1 / ATLAS_ROWS); t.offset.set(0, atlasRow(0)); t.needsUpdate = true
    return t
  }, [crew.color])
  const previous = useRef<[number, number]>([crew.route[0][0], crew.route[0][1]])
  const greetStart = useRef<number | null>(null)
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(({ camera }) => {
    if (!root.current) return
    const time = clock.current.time
    const isActive = demo && demo.phase !== 'complete' && demo.id === clock.current.actionId
    let position: [number, number]
    let walking = true
    if (greet) {
      // Greeting row: stand in the slot, face the camera, wave 3 times, one slow low-gravity hop, land, stand.
      // Real time: the mission clock is still stopped during the onboarding.
      const real = performance.now() / 1000
      if (greetStart.current === null) greetStart.current = real
      const slot = LINEUP[crew.lineup]
      root.current.visible = true
      root.current.position.set(slot[0], heightAt(slot[0], slot[1]) + 0.04, slot[1])
      const t = ((real - greetStart.current - crew.lineup * 0.22 - index * 0.05) % 7 + 7) % 7
      let col = 0, row: 0 | 2 = 0, lift = 0
      if (t >= 0.5 && t < 2.7) { row = 2; col = Math.floor((t - 0.5) / 0.37) % 2 }          // wave A/B
      else if (t >= 2.7 && t < 4.3) { row = 2; col = 2; lift = Math.sin(Math.PI * (t - 2.7) / 1.6) * 0.3 }   // 1.6 s hop, 0.3 m
      if (reducedMotion) { lift = 0; if (row === 2 && col !== 2) col = 0 }
      texture.offset.set(col / 4, atlasRow(row))
      if (sprite.current) sprite.current.position.y = Math.max(0, lift)
      previous.current = slot
      return
    }
    greetStart.current = null
    if (index === 0 && isActive) {
      const elapsed = time - clock.current.actionStart
      const route = DEMO_ROUTES[demo.kind] ?? DEMO_ROUTES.water
      let progress = elapsed < 2.3 ? elapsed / 2.3 : elapsed < 6 ? 1 : 1 - (elapsed - 6) / 2.3
      progress = Math.max(0, Math.min(1, progress))
      position = pointOnPath(route, progress)
      walking = elapsed < 2.3 || elapsed > 6
      root.current.visible = demo.kind !== 'radiation' || elapsed < 2.8 || elapsed > 6
    } else if (isActive && demo.kind === 'radiation') {
      const elapsed = time - clock.current.actionStart
      const start = sampleRoute(crew.route, clock.current.actionStart + index * 6.3, crew.duration)
      const target: [number, number] = [-4.8 + (index % 2) * 0.2, 9.5 + (index % 3) * 0.15]
      const route: [number, number][] = start[0] > 0 ? [start, [5.1, Math.max(4.0, start[1])], [5.1, 10.6], [-1.7, 11.0], [-6.9, 9.8], target] : start[1] < 3 ? [start, [-10.8, 0], [-10.8, 6.0], [-6.9, 9.8], target] : [start, [-6.9, Math.max(5.6, start[1])], [-6.9, 9.8], target]
      const p = elapsed < 2.7 ? elapsed / 2.7 : elapsed < 6 ? 1 : 1 - (elapsed - 6) / 2.3
      position = pointOnPath(route, Math.max(0, Math.min(1, p)))
      walking = elapsed < 2.7 || elapsed > 6
      root.current.visible = elapsed < 2.8 || elapsed > 6
    } else {
      position = sampleRoute(crew.route, (reducedMotion ? 0 : time) + index * 6.3, crew.duration)
      walking = index !== 0 && !reducedMotion
      root.current.visible = !away   // on the D2 EVA (drawn by SupplyOps)
    }
    const dx = position[0] - previous.current[0], dz = position[1] - previous.current[1]
    const facingBack = !greet && dx * (camera.position.x / METRE - position[0]) + dz * (camera.position.z / METRE - position[1]) < -0.00002
    const workingHands = index === 0 && isActive && demo.phase === 'working' && ['water', 'solar', 'battery'].includes(demo.kind)
    const frame = (walking || workingHands) && clock.current.delta > 0 ? Math.floor(time * (isActive && demo.kind === 'radiation' ? 11 : workingHands ? 4 : 7) + index) % 4 : 0
    texture.offset.set(frame / 4, atlasRow(facingBack ? 1 : 0))
    root.current.position.set(position[0], heightAt(...position) + 0.04, position[1])
    // The crew member carrying out the player's task glows softly (never during the radiation drill).
    const glowing = !!isActive && index === 0 && demo!.kind !== 'radiation'
    const pulse = reducedMotion ? 0.75 : 0.7 + Math.sin(time * 4) * 0.15
    if (halo.current) { halo.current.visible = glowing; (halo.current.material as THREE.MeshBasicMaterial).opacity = pulse }
    if (ground.current) { ground.current.visible = glowing; (ground.current.material as THREE.MeshBasicMaterial).opacity = pulse * 0.8 }
    if (sprite.current) sprite.current.position.y = reducedMotion ? 0 : walking ? Math.abs(Math.sin(time * 8 + index)) * 0.033 : Math.sin(time * 2 + index) * 0.012
    previous.current = position
  })
  return <group ref={root} name={`astronaut:${crew.name}`} position={[crew.route[0][0], 0.04, crew.route[0][1]]} onClick={(e) => { e.stopPropagation(); if (e.delta < 6) onInspect() }}>
    <mesh name="glow-ground" ref={ground} visible={false} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}><circleGeometry args={[1.25, 32]} /><meshBasicMaterial map={haloTexture()} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><circleGeometry args={[0.34, 16]} /><meshBasicMaterial color="#10172b" transparent opacity={0.3} depthWrite={false} /></mesh>
    <Billboard position={[0, 0.7, 0]} follow><mesh name="glow-halo" ref={halo} visible={false} position={[0, 0, -0.04]} renderOrder={-1}><planeGeometry args={[3.0, 3.0]} /><meshBasicMaterial map={haloTexture()} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh><mesh ref={sprite}><planeGeometry args={[1.1, 1.38]} /><meshBasicMaterial map={texture} transparent alphaTest={0.3} toneMapped={false} depthWrite={false} /></mesh></Billboard>
  </group>
}

export function Actors({ demo, reducedMotion, onCrew, greet = false, away }: { demo: DemoAction | null; reducedMotion: boolean; onCrew: () => void; greet?: boolean; away?: string[] }) {
  return <group name="living-colony">{CREW.map((crew, index) => <Astronaut key={crew.name} index={index} demo={demo} reducedMotion={reducedMotion} onInspect={onCrew} greet={greet} away={!!away?.includes(crew.name)} />)}</group>
}
