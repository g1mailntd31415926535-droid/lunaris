// D2 resupply in the 3D world, driven only by the game state (Story Mode):
// the lander's powered descent, the cargo waiting on the pad, and the EVA crew with a cart.
// MILO's trip is drawn by ExplorationRover (supply path); here the crate rides on it.
// Nothing here changes resources: the reducer adds the cargo once, when it reaches the base.
import { useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { ModelKit, MATERIALS as M } from './model-kit'
import { sampleTerrain } from './terrain-query'
import { astronautAtlas, atlasRow, ATLAS_ROWS } from './textures'
import { useVisualTime } from './clock'
import { useUniverse } from './universe-context'
import { ROVER_DEPOT } from './rover-plan'

/** Temporary landing area on natural ground, ~35 m from the base centre (drawn closer than the game's 2 km so it stays in view). */
export const SUPPLY_PAD: [number, number] = [24, 30]
export const SUPPLY_ROVER_PATH: [number, number][] = [ROVER_DEPOT, [13, 17], [21.2, 27.4]]
const CREW_PATH: [number, number][] = [[-0.8, 2.4], [4.8, 3.6], [4.8, 13.5], [21.6, 28.2]]
export const SUPPLY_CREW = ['Leo', 'Kai']
const CRATE_ON_LANDER: [number, number, number] = [-1.55, 1.05, -0.9]

export interface SupplyView {
  /** 0 → 1 powered descent; 1 = on the ground */
  landing: number
  carrier: 'rover' | 'crew' | null
  /** 0 → 1 over the whole carrying job (out, load, back) */
  progress: number
  delivered: boolean
}
/** Out 0–0.4, load 0.4–0.6, back 0.6–1 (same split for the rover and the crew). */
export function tripPhase(t: number) {
  if (t < 0.4) return { leg: 'out' as const, along: t / 0.4, load: 0 }
  if (t < 0.6) return { leg: 'load' as const, along: 1, load: (t - 0.4) / 0.2 }
  return { leg: 'back' as const, along: 1 - (t - 0.6) / 0.4, load: 1 }
}

function lander() {
  const kit = new ModelKit()
  kit.part('cylinder', [2.2, 1.3, 2.2], [0, 2.15, 0], M.white)
  kit.part('cylinder', [2.26, 0.32, 2.26], [0, 1.62, 0], M.yellow)             // foil band
  kit.part('cylinder', [1.5, 0.28, 1.5], [0, 2.95, 0], M.trim)
  kit.part('cylinder', [0.08, 0.9, 0.08], [0.4, 3.5, 0.2], M.trim)
  kit.part('sphere', [0.5, 0.18, 0.5], [0.4, 3.95, 0.2], M.white)
  kit.part('cylinder', [0.55, 0.5, 0.55], [0, 1.25, 0], M.dark)               // engine bell
  kit.part('box', [1.0, 0.1, 0.9], [-1.55, 0.92, -0.9], M.trim)                // cargo shelf
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    kit.tube([[x * 0.8, 1.7, z * 0.8], [x * 1.75, 0.12, z * 1.75]], 0.06, M.trim, 6)
    kit.part('cylinder', [0.5, 0.08, 0.5], [x * 1.8, 0.05, z * 1.8], M.dark)
  }
  return kit.build()
}
function crate() {
  const kit = new ModelKit()
  kit.part('round', [0.9, 0.62, 0.62], [0, 0.31, 0], M.white)
  kit.part('box', [0.92, 0.1, 0.64], [0, 0.42, 0], M.orange)
  kit.part('box', [0.3, 0.3, 0.02], [0, 0.3, 0.32], M.cyan)
  return kit.build()
}
function cart() {
  const kit = new ModelKit()
  kit.part('box', [1.1, 0.08, 0.75], [0, 0.32, 0], M.trim)
  kit.part('cylinder', [0.05, 0.9, 0.05], [-0.62, 0.65, 0], M.trim, [0, 0, 0.6])
  for (const [x, z] of [[0.42, 0.4], [0.42, -0.4], [-0.42, 0.4], [-0.42, -0.4]]) kit.part('cylinder', [0.26, 0.08, 0.26], [x, 0.14, z], M.black, [Math.PI / 2, 0, 0])
  return kit.build()
}

function pathPoint(path: [number, number][], t: number): [number, number, number, number] {
  const seg: number[] = []; let total = 0
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); total += d }
  let d = Math.max(0, Math.min(1, t)) * total
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) { const k = seg[i] ? Math.min(1, d / seg[i]) : 0; const [a, b] = [path[i], path[i + 1]]; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, b[0] - a[0], b[1] - a[1]] }
    d -= seg[i]
  }
  return [path[0][0], path[0][1], 1, 0]
}
const ground = (x: number, z: number) => sampleTerrain(x, z).point[1]

function Walker({ color, offset, frame }: { color: string; offset: number; frame: MutableRefObject<number> }) {
  const texture = useMemo(() => { const t = astronautAtlas(color).clone(); t.repeat.set(0.25, 1 / ATLAS_ROWS); t.offset.set(0, atlasRow(0)); t.needsUpdate = true; return t }, [color])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(() => texture.offset.set(((frame.current + offset) % 4) / 4, atlasRow(0)))
  return <Billboard position={[0, 0.7, 0]} follow><mesh><planeGeometry args={[1.1, 1.38]} /><meshBasicMaterial map={texture} transparent alphaTest={0.3} toneMapped={false} depthWrite={false} /></mesh></Billboard>
}

export function SupplyOps({ view, reducedMotion }: { view: SupplyView | null; reducedMotion: boolean }) {
  const clock = useVisualTime(), universe = useUniverse()
  const landerModel = useMemo(lander, []), crateModel = useMemo(crate, []), cartModel = useMemo(cart, [])
  const body = useRef<THREE.Group>(null), flame = useRef<THREE.Mesh>(null), dust = useRef<THREE.Mesh>(null)
  const box = useRef<THREE.Group>(null), team = useRef<THREE.Group>(null)
  const shown = useRef({ landing: 0, progress: 0 }), walk = useRef(0)
  const padY = useMemo(() => ground(...SUPPLY_PAD), [])
  const scratch = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => () => [landerModel, crateModel, cartModel].forEach((m) => m.traverse((n) => { if (n instanceof THREE.Mesh) n.geometry.dispose() })), [landerModel, crateModel, cartModel])
  useFrame((_, delta) => {
    const v = view
    if (!body.current || !box.current || !team.current) return
    body.current.visible = !!v; box.current.visible = !!v && !v.delivered; team.current.visible = !!v && v.carrier === 'crew' && !v.delivered
    if (!v) return
    const k = 1 - Math.exp(-3 * Math.min(delta, 0.1))
    const s = shown.current
    s.landing += (v.landing - s.landing) * (reducedMotion ? 1 : k)
    s.progress = v.progress < s.progress - 0.2 ? v.progress : s.progress + (v.progress - s.progress) * (reducedMotion ? 1 : k)
    // Powered descent: height falls as (1 − p)², so the lander slows to touch down instead of dropping.
    const h = 42 * Math.pow(1 - s.landing, 2), drift = 7 * Math.pow(1 - s.landing, 2)
    body.current.position.set(SUPPLY_PAD[0] - drift, padY + h, SUPPLY_PAD[1] - drift * 0.6)
    const burning = s.landing < 0.995
    if (flame.current) {
      flame.current.visible = burning
      const flicker = reducedMotion ? 1 : 0.85 + Math.sin(clock.current.time * 40) * 0.08 + Math.sin(clock.current.time * 23) * 0.07
      flame.current.scale.set(1, (0.8 + 1.4 * (1 - s.landing)) * flicker, 1)
    }
    if (dust.current) {
      const near = burning && h < 9
      dust.current.visible = near
      if (near) { const r = 1 + (9 - h) * 0.7; dust.current.scale.setScalar(r); (dust.current.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - h / 9) }
    }
    // Cargo: on the lander's shelf until a carrier loads it, then it rides back to the base.
    const onPad = (): [number, number, number] => [body.current!.position.x + CRATE_ON_LANDER[0], body.current!.position.y + CRATE_ON_LANDER[1], body.current!.position.z + CRATE_ON_LANDER[2]]
    let at = onPad()
    const phase = tripPhase(s.progress)
    let teamPos: [number, number, number, number] | null = null
    if (v.carrier === 'crew') {
      teamPos = pathPoint(CREW_PATH, phase.along)
      const ty = ground(teamPos[0], teamPos[1])
      team.current.position.set(teamPos[0], ty, teamPos[1])
      team.current.rotation.y = Math.atan2(-teamPos[3], teamPos[2]) + (phase.leg === 'back' ? Math.PI : 0)   // cart travels along local +x
      const moving = phase.leg !== 'load' && clock.current.delta > 0
      if (moving) walk.current = Math.floor(clock.current.time * 7) % 4
      const cartTop: [number, number, number] = [teamPos[0], ty + 0.36, teamPos[1]]
      if (phase.leg !== 'out') at = phase.load >= 1 ? cartTop : lerp3(onPad(), cartTop, phase.load, 0.9)
    } else if (v.carrier === 'rover' && phase.leg !== 'out') {
      scratch.copy(universe.current.roverPosition)
      const roverTop: [number, number, number] = [scratch.x, scratch.y + 1.05, scratch.z]
      at = phase.load >= 1 ? roverTop : lerp3(onPad(), roverTop, phase.load, 0.9)
    }
    box.current.position.set(...at)
  }, -3)
  const flameGeometry = useMemo(() => new THREE.ConeGeometry(0.42, 2.2, 14, 1, true).translate(0, -1.1, 0).rotateX(Math.PI), [])
  return <group name="d2-resupply">
    <group ref={body} visible={false}>
      <primitive object={landerModel} />
      <mesh ref={flame} geometry={flameGeometry} position={[0, 0.95, 0]}><meshBasicMaterial color="#ffc27a" transparent opacity={0.75} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
    </group>
    <mesh ref={dust} position={[SUPPLY_PAD[0], padY + 0.08, SUPPLY_PAD[1]]} rotation={[-Math.PI / 2, 0, 0]} visible={false}><ringGeometry args={[0.6, 1.4, 40]} /><meshBasicMaterial color="#b9b4aa" transparent opacity={0.3} depthWrite={false} /></mesh>
    <group ref={box} visible={false}><primitive object={crateModel} /></group>
    <group ref={team} visible={false} name="d2-eva-team">
      <primitive object={cartModel} />
      <group position={[-0.95, 0, 0.35]}><Walker color="#9cc7ff" offset={0} frame={walk} /></group>
      <group position={[-0.95, 0, -0.45]}><Walker color="#ffd75e" offset={2} frame={walk} /></group>
    </group>
  </group>
}

/** A short lift-and-place arc (loading by hand or by the rover's arm), never a teleport. */
function lerp3(a: [number, number, number], b: [number, number, number], t: number, lift: number): [number, number, number] {
  const e = t * t * (3 - 2 * t)
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e + Math.sin(Math.PI * e) * lift, a[2] + (b[2] - a[2]) * e]
}
