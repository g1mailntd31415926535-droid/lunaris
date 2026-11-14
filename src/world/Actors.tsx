import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { DemoAction } from '../types'
import { astronautAtlas } from './textures'
import { heightAt, sampleRoute } from './terrain-field'
import { useVisualTime } from './clock'
import { CREW, DEMO_ROUTES, pointOnPath } from './actor-plan'
import { METRE } from './space-config'

function Astronaut({ index, demo, reducedMotion, onInspect }: { index: number; demo: DemoAction | null; reducedMotion: boolean; onInspect: () => void }) {
  const crew = CREW[index]
  const root = useRef<THREE.Group>(null)
  const sprite = useRef<THREE.Mesh>(null)
  const clock = useVisualTime()
  const texture = useMemo(() => {
    const t = astronautAtlas(crew.color).clone()
    t.repeat.set(0.25, 0.5); t.offset.set(0, 0.5); t.needsUpdate = true
    return t
  }, [crew.color])
  const previous = useRef<[number, number]>(crew.route[0])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(({ camera }) => {
    if (!root.current) return
    const time = clock.current.time
    const isActive = demo && demo.phase !== 'complete' && demo.id === clock.current.actionId
    let position: [number, number]
    let walking = true
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
      root.current.visible = true
    }
    const dx = position[0] - previous.current[0], dz = position[1] - previous.current[1]
    const facingBack = dx * (camera.position.x / METRE - position[0]) + dz * (camera.position.z / METRE - position[1]) < -0.00002
    const workingHands = index === 0 && isActive && demo.phase === 'working' && ['water', 'solar', 'battery'].includes(demo.kind)
    const frame = (walking || workingHands) && clock.current.delta > 0 ? Math.floor(time * (isActive && demo.kind === 'radiation' ? 11 : workingHands ? 4 : 7) + index) % 4 : 0
    texture.offset.set(frame / 4, facingBack ? 0 : 0.5)
    root.current.position.set(position[0], heightAt(...position) + 0.04, position[1])
    if (sprite.current) sprite.current.position.y = reducedMotion ? 0 : walking ? Math.abs(Math.sin(time * 8 + index)) * 0.033 : Math.sin(time * 2 + index) * 0.012
    previous.current = position
  })
  return <group ref={root} name={`astronaut:${crew.name}`} position={[crew.route[0][0], 0.04, crew.route[0][1]]} onClick={(e) => { e.stopPropagation(); if (e.delta < 6) onInspect() }}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><circleGeometry args={[0.34, 16]} /><meshBasicMaterial color="#10172b" transparent opacity={0.3} depthWrite={false} /></mesh>
    <Billboard position={[0, 0.7, 0]} follow><mesh ref={sprite}><planeGeometry args={[1.1, 1.38]} /><meshBasicMaterial map={texture} transparent alphaTest={0.3} toneMapped={false} depthWrite={false} /></mesh></Billboard>
  </group>
}

export function Actors({ demo, reducedMotion, onCrew }: { demo: DemoAction | null; reducedMotion: boolean; onCrew: () => void }) {
  return <group name="living-colony">{CREW.map((crew, index) => <Astronaut key={crew.name} index={index} demo={demo} reducedMotion={reducedMotion} onInspect={onCrew} />)}</group>
}
