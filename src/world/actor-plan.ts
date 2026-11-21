import type { DemoKind } from '../types'
import { minimumJerk } from './math.ts'

export type RoutePoint = [number, number]
/**
 * The research crew: exactly four members (2 men, 2 women), all scientists/engineers of the mission.
 * Gender is stated here as data; the sealed suits are not drawn differently.
 * `lineup` is the slot in the greeting row in front of the command centre (Nam — Nữ — Nam — Nữ).
 */
export const CREW = [
  { name: 'Linh', gender: 'female', role: 'Systems engineer', color: '#ffbb69', lineup: 1, route: [[-0.8, 2.4], [-0.8, 2.4]] as RoutePoint[], duration: 32 },
  { name: 'Kai', gender: 'male', role: 'Power engineer', color: '#ffd75e', lineup: 0, route: [[-10.5, -1.3], [-9, -1.7], [-7.0, -1.45], [-9, -1.7], [-10.5, -1.3]] as RoutePoint[], duration: 29 },
  { name: 'Mia', gender: 'female', role: 'Botanist', color: '#92e09b', lineup: 3, route: [[6.2, 3.5], [7.8, 3.6], [10.9, 2.2], [7.8, 3.6], [6.2, 3.5]] as RoutePoint[], duration: 38 },
  { name: 'Leo', gender: 'male', role: 'Geologist, rover lead', color: '#9cc7ff', lineup: 2, route: [[3.9, 9.7], [2.0, 10.1], [0.0, 10.5], [2.0, 10.1], [3.9, 9.7]] as RoutePoint[], duration: 31 },
] as const
/** Greeting row: evenly spaced 1.4 m apart on level ground in front of the command centre, clear of its door path. */
export const LINEUP: RoutePoint[] = [[-6.2, 4.4], [-4.8, 4.4], [-3.4, 4.4], [-2.0, 4.4]]
export const LINEUP_CENTRE: RoutePoint = [-4.1, 4.4]

export const DEMO_ROUTES: Record<DemoKind, RoutePoint[]> = {
  water: [[-0.8, 2.4], [0, 3.1], [-1.5, 4.7], [-1.35, 8.6], [1.2, 9.25]],
  battery: [[-0.8, 2.4], [-3.7, 3.2], [-5.5, 4.8], [-7.3, 4.4]],
  solar: [[-0.8, 2.4], [-4.3, 1.3], [-5.4, -0.2], [-9.0, -1.9]],
  radiation: [[-0.8, 2.4], [-3.1, 3.5], [-6.6, 5.6], [-6.3, 9.5], [-4.8, 9.6]],
  rover: [[-0.8, 2.4], [3.7, 3.1], [5.1, 4.6], [5.3, 10.4], [8.6, 10.5]],
  greenhouse: [[-0.8, 2.4], [3.8, 3.1], [6.2, 3.5], [7.9, 3.6]],
  oxygen: [[-0.8, 2.4], [3.6, 2.7], [4.4, -0.1], [4.6, -3.5], [5.4, -3.5]],
  command: [[-0.8, 2.4], [-0.9, 2.0], [-0.8, 1.8]],
}

export function pointOnPath(points: RoutePoint[], progress: number): RoutePoint {
  if (progress <= 0) return [...points[0]]
  if (progress >= 1) return [...points[points.length - 1]]
  const d = progress * (points.length - 1)
  const i = Math.min(points.length - 2, Math.floor(d)), t = minimumJerk(d - i)
  return [points[i][0] * (1 - t) + points[i + 1][0] * t, points[i][1] * (1 - t) + points[i + 1][1] * t]
}
