// C2 route preview: the real A* result (public/lunar/task02/routes.json, via rover-plan surveyLegs) drawn on the
// NASA terrain, with start/end markers, direction arrows and a hover tooltip. Read-only: it never moves the rover.
import { useMemo, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { sampleTerrain } from './terrain-query'
import { surveyLegs } from './rover-plan'
import { routeSlopeLimitDeg } from './dem'
import { ROVER } from '../game/scenario'

type P3 = [number, number, number]
interface Sample { p: P3; along: number; slope: number; valid: boolean }

/** Ground samples along the A* polyline (lifted slightly above the DEM to avoid z-fighting). */
function sampleLeg(zone: string) {
  const leg = surveyLegs().find((l) => l.site.id === zone)
  if (!leg) return null
  const count = Math.max(80, Math.min(1500, Math.ceil(leg.length / 12)))
  const lift = Math.max(1.2, leg.length / 4000)
  const v = new THREE.Vector3(), t = new THREE.Vector3(), samples: Sample[] = []
  for (let i = 0; i <= count; i++) {
    leg.curve.getPointAt(i / count, v)
    const s = sampleTerrain(v.x, v.z)
    if (!s.valid) continue                                  // never draw over NoData (no route crosses it)
    const slope = THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, s.normal[1]))))
    samples.push({ p: [v.x, s.point[1] + lift, v.z], along: leg.length * i / count, slope, valid: s.valid })
  }
  const arrows: { p: P3; yaw: number }[] = []
  for (let k = 1; k < 8; k++) { leg.curve.getPointAt(k / 8, v); leg.curve.getTangentAt(k / 8, t); const s = sampleTerrain(v.x, v.z); if (s.valid) arrows.push({ p: [v.x, s.point[1] + lift * 2, v.z], yaw: Math.atan2(t.x, t.z) }) }
  return { leg, samples, arrows, size: Math.max(6, leg.length / 140) }
}

export function RoutePreview({ zone }: { zone: string | null }) {
  const data = useMemo(() => zone ? sampleLeg(zone) : null, [zone])
  const [hover, setHover] = useState<Sample | null>(null)
  if (!data || data.samples.length < 2) return null
  const { leg, samples, arrows, size } = data
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const local = e.object.parent ? e.object.parent.worldToLocal(e.point.clone()) : e.point
    let best = samples[0], bd = Infinity
    for (const s of samples) { const d = (s.p[0] - local.x) ** 2 + (s.p[2] - local.z) ** 2; if (d < bd) { bd = d; best = s } }
    setHover(best)
  }
  const first = samples[0], last = samples[samples.length - 1]
  const limit = routeSlopeLimitDeg()
  return <group name="c2-route-preview">
    <Line points={samples.map((s) => s.p)} color="#ffd36b" lineWidth={5} transparent opacity={0.95} depthTest={false} renderOrder={5} onPointerMove={onMove} onPointerOut={() => setHover(null)} />
    {arrows.map((a, i) => <mesh key={i} position={a.p} rotation={[Math.PI / 2, a.yaw, 0, 'YXZ']} scale={size} renderOrder={6}><coneGeometry args={[0.35, 0.9, 3]} /><meshBasicMaterial color="#fff2c4" depthTest={false} /></mesh>)}
    <Html position={first.p} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}><span className="route-pin start">MILO · start</span></Html>
    <Html position={last.p} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}><span className="route-pin end">Zone {leg.site.id} · destination</span></Html>
    {hover && <Html position={hover.p} zIndexRange={[40, 30]} style={{ pointerEvents: 'none' }}><div className="route-tip">
      <b>At this point · {(hover.along / 1000).toFixed(2)} / {(leg.length / 1000).toFixed(1)} km</b>
      <span>Surface slope (NASA 5 m DEM): <em className={hover.slope > limit ? 'warn' : ''}>{hover.slope.toFixed(1)}°</em></span>
      <small>Measured on the map; measurement error not included.</small>
      <span>Estimate to here (game rover model): {(hover.along / 1000 * ROVER.kwhPerKm).toFixed(1)} kWh · {(hover.along / 1000 / ROVER.speedKmh).toFixed(1)} h</span>
    </div></Html>}
  </group>
}
