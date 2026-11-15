import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingId, CameraMode, CameraRequest, WorldHandle } from '../types'
import { BUILDING_BY_ID } from '../data'
import { actualTerrainHeight } from './terrain-query'
import { demMeta } from './dem'
import { BASE_XY, REGION_RHO_MAX, displayPosition, polarHeight, sceneDirectionHeight } from './lunar-frame'
import { CAMERA_ALTITUDES_M, CAP_RADIUS_M, MAX_ALTITUDE_M, METRE, MIN_ALTITUDE_M, MOON_CENTER, MOON_RADIUS_KM, SURFACE_CLEARANCE_M } from './space-config'
import { smoothstep } from './math'
import { useUniverse } from './universe-context'
import { createCameraFlight, sampleCameraFlight, shortestAngle } from './camera-travel'
import type { CameraChannels, CameraFlight } from './camera-travel'

const DEFAULT_YAW = 0.61
const DEFAULT_TILT = 0.925
const DEFAULT_PAN = [2.2, -0.5] as const
const UP = new THREE.Vector3(0, 1, 0)
const MOON = new THREE.Vector3(...MOON_CENTER)
const orbitFrame = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3().setFromSphericalCoords(1, 0.63, DEFAULT_YAW), UP)
const geometryClearanceCells = new WeakMap<THREE.BufferGeometry, Map<number, number[]>>()
const RADIAL_ROW_HEIGHT = Math.PI / 112

function frameAt(x: number, z: number) {
  const normal = new THREE.Vector3(x * METRE, MOON_RADIUS_KM, z * METRE).normalize()
  return new THREE.Quaternion().setFromUnitVectors(UP, normal)
}

function cameraChannels(logAltitude: number, target: readonly [number, number] = DEFAULT_PAN): CameraChannels {
  return { logAltitude, surface: frameAt(...target), yaw: DEFAULT_YAW, tilt: DEFAULT_TILT }
}

// The tilt the user chose is kept through local and regional views; only towards orbit distances does the
// view ease to top-down, so the whole globe stays centred on the observed point.
function tiltAt(logAltitude: number) {
  return 1 - 0.9 * smoothstep(Math.log(60_000), Math.log(1_500_000), logAltitude)
}
/** 0: a left drag orbits around the observed point. 1: zoomed out to globe scale, the same drag rolls the Moon. */
function globeDragWeight(logAltitude: number) {
  return smoothstep(Math.log(200_000), Math.log(2_000_000), logAltitude)
}

/** Height (m, region-local y) of the surface that is drawn at region-local (x, z): the 5 m DEM where it exists,
 *  else the LOLA polar grids at their display position, else (before any data) the sphere datum. */
const displayScratch = [0, 0, 0]
function groundLocal(x: number, z: number) {
  const dem = actualTerrainHeight(x, z)
  if (Number.isFinite(dem)) return dem
  const X = BASE_XY[0] + x, Y = BASE_XY[1] - z, h = polarHeight(X, Y)
  if (Number.isFinite(h)) return displayPosition(X, Y, h, demMeta()!.base.height_m, displayScratch)[1]
  return Number.NaN
}
const POLAR_COS = Math.cos(REGION_RHO_MAX / 1_737_400)

function capPoint(normal: THREE.Vector3) {
  return normal.y > 0 && Math.hypot(normal.x, normal.z) < CAP_RADIUS_M * METRE / MOON_RADIUS_KM
}

// The visual globe's triangles can be hundreds of metres away from their analytic
// field between vertices. Bucket them once by polar angle for close-up clearance.
function radialRows(geometry: THREE.BufferGeometry) {
  const cached = geometryClearanceCells.get(geometry)
  if (cached) return cached

  const rows = new Map<number, number[]>()
  const positions = geometry.getAttribute('position'), indices = geometry.getIndex()!
  const point = new THREE.Vector3()
  for (let i = 0; i < indices.count; i += 3) {
    let min = Infinity, max = -Infinity
    for (let j = 0; j < 3; j++) {
      point.fromBufferAttribute(positions, indices.getX(i + j)).sub(MOON)
      const angle = Math.atan2(Math.hypot(point.x, point.z), point.y)
      min = Math.min(min, angle); max = Math.max(max, angle)
    }
    const first = Math.floor(min / RADIAL_ROW_HEIGHT), last = Math.floor(max / RADIAL_ROW_HEIGHT)
    for (let row = Math.max(0, first - 1); row <= last + 1; row++) {
      const triangles = rows.get(row)
      if (triangles) triangles.push(i)
      else rows.set(row, [i])
    }
  }
  geometryClearanceCells.set(geometry, rows)
  return rows
}

function renderedRadius(globe: THREE.Mesh | null, ray: THREE.Ray, scratch: THREE.Vector3[]) {
  if (!globe) return Number.NaN
  const { geometry } = globe
  const normal = ray.direction
  const row = Math.floor(Math.atan2(Math.hypot(normal.x, normal.z), normal.y) / RADIAL_ROW_HEIGHT)
  const triangles = radialRows(geometry).get(row)
  if (!triangles) return Number.NaN
  const positions = geometry.getAttribute('position'), indices = geometry.getIndex()!
  const [a, b, c, point] = scratch
  for (const index of triangles) {
    a.fromBufferAttribute(positions, indices.getX(index))
    b.fromBufferAttribute(positions, indices.getX(index + 1))
    c.fromBufferAttribute(positions, indices.getX(index + 2))
    const hit = ray.intersectTriangle(a, b, c, false, point)
    if (hit) return hit.distanceTo(MOON)
  }
  return Number.NaN
}

function radiusCache() {
  return { globe: null as THREE.Mesh | null, direction: new THREE.Vector3(), radius: 0, useMesh: false }
}

function globeRadius(globe: THREE.Mesh | null, normal: THREE.Vector3, useMesh: boolean, cache: ReturnType<typeof radiusCache>, ray: THREE.Ray, hit: THREE.Vector3[]) {
  if (cache.globe === globe && cache.useMesh === useMesh && cache.direction.distanceToSquared(normal) < 1e-20) return cache.radius
  // Inside ≈ 80°S the polar LOLA grids are drawn (finer than the globe's triangles): use them directly.
  const polar = normal.y > POLAR_COS
  const measured = useMesh && !polar ? renderedRadius(globe, ray.set(MOON, normal), hit) : Number.NaN
  const lola = sceneDirectionHeight(normal.x, normal.y, normal.z, demMeta()!.base.height_m)
  cache.radius = Number.isFinite(measured) ? measured : MOON_RADIUS_KM + (Number.isFinite(lola) ? lola : 0) * METRE
  cache.direction.copy(normal)
  cache.globe = globe
  cache.useMesh = useMesh
  return cache.radius
}

export const PlanetCameraRig = forwardRef<WorldHandle, { request: CameraRequest; followRover: boolean; onStopFollow: () => void; reducedMotion: boolean; onMode: (mode: CameraMode) => void; onTravel: (moving: boolean, destination: CameraMode) => void }>(function PlanetCameraRig({ request, followRover, onStopFollow, reducedMotion, onMode, onTravel }, ref) {
  const { camera, gl, scene, size } = useThree()
  const universe = useUniverse()
  const pose = useRef(cameraChannels(Math.log(27)))
  const wanted = useRef(cameraChannels(Math.log(27)))
  const state = useRef({ followZoom: 0, followWeight: 0, lastMode: 'base' as CameraMode })
  const followFlag = useRef(followRover); followFlag.current = followRover
  const stopFollow = useRef(onStopFollow); stopFollow.current = onStopFollow
  const previousFollow = useRef(false)
  const travel = useRef<{ flight: CameraFlight; elapsed: number } | null>(null)
  const reportTravel = useRef(onTravel); reportTravel.current = onTravel
  const reduced = useRef(reducedMotion); reduced.current = reducedMotion
  const requestedId = useRef(-1)
  const currentSize = useRef(size); currentSize.current = size
  const globe = useRef<THREE.Mesh | null>(null)
  const scratch = useRef({
    surface: new THREE.Quaternion(), normal: new THREE.Vector3(), heading: new THREE.Vector3(),
    eye: new THREE.Vector3(), target: new THREE.Vector3(), radialEye: new THREE.Vector3(), rover: new THREE.Vector3(),
    hit: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    ray: new THREE.Ray(), targetRadius: radiusCache(), eyeRadius: radiusCache(),
  })

  const copyPose = (from: CameraChannels, to: CameraChannels) => {
    to.logAltitude = from.logAltitude
    to.surface.copy(from.surface)
    to.yaw = from.yaw
    to.tilt = from.tilt
  }
  const endTravel = (destination: CameraMode) => {
    travel.current = null
    copyPose(pose.current, wanted.current)
    universe.current.cameraTravel = { moving: false, destination }
    reportTravel.current(false, destination)
  }
  const cancelTravel = () => {
    if (travel.current) endTravel(travel.current.flight.destination)
  }
  const goTo = (mode: CameraMode, animate = true, altitude?: number, pan: readonly [number, number] = DEFAULT_PAN, keepFocus = false) => {
    const factor = currentSize.current.width < 700 ? 1.47 : currentSize.current.width < 1100 ? 1.13 : 1
    const targetAltitude = altitude ?? CAMERA_ALTITUDES_M[mode] * (mode === 'base' ? factor : 1)
    const logAltitude = Math.log(targetAltitude)
    if (!animate) {
      wanted.current.logAltitude = logAltitude
      return
    }

    const from = { ...pose.current, surface: pose.current.surface.clone() }
    const goal = keepFocus ? { ...from, logAltitude } : cameraChannels(logAltitude, pan)
    const flight = createCameraFlight(from, goal, mode)
    if (reduced.current) {
      flight.duration *= 0.7
      flight.lift *= 0.7
      flight.lead *= 0.7
    }
    travel.current = { flight, elapsed: 0 }
    copyPose(flight.to, wanted.current)
    universe.current.cameraTravel = { moving: true, destination: mode }
    reportTravel.current(true, mode)
  }
  useEffect(() => {
    const s = state.current
    if (followRover) {
      cancelTravel()
      s.followZoom = 0
    } else if (previousFollow.current) {
      const { x, z } = universe.current.roverNominal
      pose.current.surface.copy(frameAt(x, z))
      wanted.current.surface.copy(pose.current.surface)
      s.followWeight = 0
      wanted.current.logAltitude = pose.current.logAltitude
    }
    previousFollow.current = followRover
    universe.current.followRover = followRover
  }, [followRover, universe])
  const zoomBy = (step: number) => {
    cancelTravel()
    if (followFlag.current) state.current.followZoom = THREE.MathUtils.clamp(state.current.followZoom + step, Math.log(12 / 30), Math.log(3500 / 30))
    else wanted.current.logAltitude = THREE.MathUtils.clamp(wanted.current.logAltitude + step, Math.log(MIN_ALTITUDE_M), Math.log(MAX_ALTITUDE_M))
  }
  const focusPoint = (mode: CameraMode, height: number, point: readonly [number, number]) => {
    previousFollow.current = false
    goTo(mode, true, height, point)
  }
  useImperativeHandle(ref, () => ({
    zoom(direction) { zoomBy(direction === 'in' ? -0.55 : 0.55) },
    reset() {
      if (followFlag.current) {
        state.current.followZoom = 0
        wanted.current.yaw = shortestAngle(pose.current.yaw, DEFAULT_YAW)
        wanted.current.tilt = DEFAULT_TILT
      } else goTo(state.current.lastMode)
    },
    focus(id: BuildingId) {
      const { position } = BUILDING_BY_ID[id]
      focusPoint('base', 21, [position[0], position[2]])
    },
    focusPoint(x: number, z: number) { focusPoint('region', 420, [x, z]) },
    focusArea(x: number, z: number, height: number, mode: CameraMode = 'base') { focusPoint(mode, height, [x, z]) },
    focusCrew(name: string) {
      const actor = window.__LUNARIS__?.actors.find((a) => a.name === 'astronaut:' + name)
      if (actor) focusPoint('base', 18, [actor.position[0], actor.position[2]])
    },
  }), [])
  useEffect(() => {
    if (request.id === requestedId.current) return
    const initial = requestedId.current < 0
    requestedId.current = request.id
    goTo(request.mode, !initial, request.altitudeM, DEFAULT_PAN, request.mode === 'orbit')
  }, [request.id, request.mode, request.altitudeM])
  useEffect(() => {
    if (state.current.lastMode === 'base' && !followFlag.current && !travel.current) goTo('base', false)
  }, [size.width])

  useEffect(() => {
    const canvas = gl.domElement, surface = canvas.closest<HTMLElement>('.world') ?? canvas
    const pointers = new Map<number, { x: number; y: number; pan: boolean; startX: number; startY: number; dragging: boolean; owner: Element }>()
    const radial = new THREE.Vector3(), heading = new THREE.Vector3(), right = new THREE.Vector3(), axis = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    let skipClick = false, touchFrame = 0
    let touchX = 0, touchY = 0, pinchDistance = 0
    const moveFocus = (dx: number, dy: number, radiansPerPixel: number) => {
      const { surface, yaw } = wanted.current
      radial.copy(UP).applyQuaternion(surface)
      heading.set(Math.sin(yaw), 0, Math.cos(yaw)).applyQuaternion(surface)
      right.crossVectors(radial, heading)
      axis.copy(heading).multiplyScalar(dx).addScaledVector(right, -dy).normalize()
      const angle = Math.min(0.65, Math.hypot(dx, dy) * radiansPerPixel)
      surface.premultiply(turn.setFromAxisAngle(axis, angle)).normalize()
    }
    const pan = (dx: number, dy: number) => {
      if (followFlag.current) {
        const rover = universe.current.roverNominal
        pose.current.surface.copy(frameAt(rover.x, rover.z))
        wanted.current.surface.copy(pose.current.surface)
        wanted.current.logAltitude = pose.current.logAltitude
        state.current.followWeight = 0
        previousFollow.current = false
        followFlag.current = false
        stopFollow.current()
      }
      const view = pose.current
      const tilt = view.tilt * tiltAt(view.logAltitude)
      const metresPerPixel = 2 * Math.exp(view.logAltitude) * Math.tan(THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2) / (Math.cos(tilt) * Math.max(200, currentSize.current.height))
      moveFocus(dx, dy / Math.max(0.25, Math.cos(tilt)), Math.min(metresPerPixel * METRE / MOON_RADIUS_KM, 0.0035))
    }
    const orbit = (dx: number, dy: number) => {
      const view = pose.current, goal = wanted.current
      // Free orbit around the observed point at every local and regional height (yaw + tilt). Only at globe scale
      // does the drag turn into rolling the Moon under the camera, so its far side can still be reached.
      const globeWeight = followFlag.current ? 0 : globeDragWeight(view.logAltitude)
      const localWeight = 1 - globeWeight
      if (globeWeight > 0) moveFocus(dx, dy, globeWeight * 0.0045)
      goal.yaw -= dx * localWeight * 0.005
      goal.tilt = THREE.MathUtils.clamp(goal.tilt - dy * localWeight * 0.0048, 0.025, 1.4)
    }
    const updateTouch = (start: boolean) => {
      if (pointers.size !== 2) return
      const [a, b] = [...pointers.values()]
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (!start) {
        if (pinchDistance > 0 && distance > 0) zoomBy(-Math.log(distance / pinchDistance))
        if (x !== touchX || y !== touchY) pan(x - touchX, y - touchY)
      }
      touchX = x; touchY = y; pinchDistance = distance
    }
    const down = (event: PointerEvent) => {
      const { button, clientX: x, clientY: y, pointerId, shiftKey } = event
      const owner = event.target
      if (button > 2 || pointers.size >= 2 || !(owner instanceof Element)) return
      if (!pointers.size) skipClick = false
      pointers.set(pointerId, { x, y, startX: x, startY: y, pan: button === 1 || button === 2 || shiftKey, dragging: false, owner })
      if (pointers.size === 2) {
        cancelTravel()
        skipClick = true
        for (const [id, item] of pointers) {
          item.owner.setPointerCapture(id)
          item.dragging = true
        }
        updateTouch(true)
      }
    }
    const move = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId)
      if (!pointer) return
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
      pointer.x = event.clientX; pointer.y = event.clientY
      if (pointers.size === 2) {
        // Coalesce both fingers before reading the midpoint so a symmetric pinch is anchored.
        if (!touchFrame) touchFrame = requestAnimationFrame(() => { touchFrame = 0; updateTouch(false) })
        return
      }
      if (!pointer.dragging && Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) < 3) return
      if (!pointer.dragging) {
        pointer.dragging = true
        skipClick = true
        cancelTravel()
        pointer.owner.setPointerCapture(event.pointerId)
      }
      if (pointer.pan) pan(dx, dy)
      else orbit(dx, dy)
    }
    const up = (event: PointerEvent) => {
      const pointer = pointers.get(event.pointerId)
      if (!pointer) return
      if (touchFrame) {
        cancelAnimationFrame(touchFrame)
        touchFrame = 0
        updateTouch(false)
      }
      pointers.delete(event.pointerId)
      if (pointer.owner.hasPointerCapture(event.pointerId)) pointer.owner.releasePointerCapture(event.pointerId)
    }
    const click = (event: MouseEvent) => {
      if (!skipClick || event.detail === 0) return
      skipClick = false
      event.preventDefault()
      event.stopPropagation()
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * currentSize.current.height : event.deltaY
      if (pixels) zoomBy(pixels * 0.0035)
    }
    const clear = () => {
      if (touchFrame) cancelAnimationFrame(touchFrame)
      touchFrame = 0
      pointers.clear()
      skipClick = false
    }
    const contextmenu = (event: Event) => event.preventDefault()
    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerup', up)
    surface.addEventListener('pointercancel', up)
    surface.addEventListener('lostpointercapture', up)
    surface.addEventListener('click', click, true)
    surface.addEventListener('wheel', wheel, { passive: false })
    surface.addEventListener('contextmenu', contextmenu)
    window.addEventListener('blur', clear)
    if (new URLSearchParams(location.search).has('debug')) window.__LUNARIS_CONTROLS__ = {
      orbit(yaw, polar) {
        cancelTravel()
        radial.setFromSphericalCoords(1, THREE.MathUtils.clamp(polar, 0, Math.PI), yaw).applyQuaternion(orbitFrame)
        wanted.current.surface.setFromUnitVectors(UP, radial)
        wanted.current.logAltitude = Math.log(CAMERA_ALTITUDES_M.orbit)
      },
      altitude(metres) {
        cancelTravel()
        wanted.current.logAltitude = Math.log(THREE.MathUtils.clamp(metres, MIN_ALTITUDE_M, MAX_ALTITUDE_M))
      },
    }
    return () => {
      clear()
      surface.removeEventListener('pointerdown', down)
      surface.removeEventListener('pointermove', move)
      surface.removeEventListener('pointerup', up)
      surface.removeEventListener('pointercancel', up)
      surface.removeEventListener('lostpointercapture', up)
      surface.removeEventListener('click', click, true)
      surface.removeEventListener('wheel', wheel)
      surface.removeEventListener('contextmenu', contextmenu)
      window.removeEventListener('blur', clear)
      delete window.__LUNARIS_CONTROLS__
    }
  }, [camera, gl, universe])

  useFrame((_, delta) => {
    const view = pose.current, goal = wanted.current
    const s = state.current, p = scratch.current, u = universe.current
    if (!globe.current) globe.current = (scene.getObjectByName('moon-surface') as THREE.Mesh | undefined) ?? null
    const dt = Math.min(delta, 0.12), alpha = 1 - Math.exp(-(reducedMotion ? 9 : 4.2) * dt)
    if (followRover && !travel.current) goal.logAltitude = Math.log(30) + s.followZoom
    s.followWeight += ((followRover ? 1 : 0) - s.followWeight) * alpha
    if (travel.current) {
      const { flight } = travel.current
      travel.current.elapsed = Math.min(flight.duration, travel.current.elapsed + dt)
      copyPose(sampleCameraFlight(flight, travel.current.elapsed), view)
      if (travel.current.elapsed >= flight.duration) endTravel(flight.destination)
    } else {
      const zoomStep = (goal.logAltitude - view.logAltitude) * (1 - Math.exp(-5 * dt))
      const maximumLogSpeed = zoomStep > 0 ? 7.5 : reducedMotion ? 7 : 3.4
      view.logAltitude += THREE.MathUtils.clamp(zoomStep, -maximumLogSpeed * dt, maximumLogSpeed * dt)
      view.surface.slerp(goal.surface, alpha)
      view.yaw += (goal.yaw - view.yaw) * alpha
      view.tilt += (goal.tilt - view.tilt) * alpha
    }
    const altitude = Math.exp(view.logAltitude), tilt = view.tilt * tiltAt(view.logAltitude)
    p.surface.copy(view.surface)
    if (s.followWeight > 0.0001) {
      const rover = u.roverPosition
      p.surface.slerp(frameAt(rover.x, rover.z), s.followWeight > 0.995 ? 1 : s.followWeight)
    }
    p.normal.copy(UP).applyQuaternion(p.surface)
    p.heading.set(Math.sin(view.yaw), 0, Math.cos(view.yaw)).applyQuaternion(p.surface)

    if (capPoint(p.normal)) {
      const x = MOON_RADIUS_KM * p.normal.x / p.normal.y, z = MOON_RADIUS_KM * p.normal.z / p.normal.y
      const ground = groundLocal(x / METRE, z / METRE)
      if (Number.isFinite(ground)) p.target.set(x, ground * METRE, z)
      else p.target.copy(MOON).addScaledVector(p.normal, MOON_RADIUS_KM)
    } else {
      const radius = globeRadius(globe.current, p.normal, true, p.targetRadius, p.ray, p.hit)
      p.target.copy(MOON).addScaledVector(p.normal, radius)
    }
    if (s.followWeight > 0.995) p.target.copy(p.rover.copy(u.roverPosition).multiplyScalar(METRE))

    const distance = altitude * METRE
    p.eye.copy(p.target).addScaledVector(p.normal, distance).addScaledVector(p.heading, Math.tan(tilt) * distance)
    p.radialEye.copy(p.eye).sub(MOON).normalize()
    let clearance: number
    if (capPoint(p.radialEye)) {
      const ground = groundLocal(p.eye.x / METRE, p.eye.z / METRE)
      const datum = Number.isFinite(ground) ? ground * METRE : p.radialEye.y * MOON_RADIUS_KM - MOON_RADIUS_KM
      p.eye.y = Math.max(p.eye.y, datum + SURFACE_CLEARANCE_M * METRE)
      clearance = p.eye.y - datum
    } else {
      const radius = globeRadius(globe.current, p.radialEye, altitude < 10_000, p.eyeRadius, p.ray, p.hit)
      clearance = p.eye.distanceTo(MOON) - radius
      if (clearance < SURFACE_CLEARANCE_M * METRE) {
        clearance = SURFACE_CLEARANCE_M * METRE
        p.eye.copy(MOON).addScaledVector(p.radialEye, radius + clearance)
      }
    }

    camera.position.copy(p.eye)
    camera.up.copy(p.normal).multiplyScalar(Math.sin(tilt)).addScaledVector(p.heading, -Math.cos(tilt))
    camera.lookAt(p.target)
    const perspective = camera as THREE.PerspectiveCamera
    const nextNear = THREE.MathUtils.clamp(distance * 0.001, 0.000015, 1)
    if (Math.abs(perspective.near - nextNear) > nextNear * 0.015) {
      perspective.near = nextNear
      perspective.updateProjectionMatrix()
    }
    u.altitudeM = altitude
    u.clearanceM = clearance / METRE
    u.cameraTarget.copy(p.target)
    u.viewCentre.copy(p.target)
    u.styleDetail = 1 - smoothstep(Math.log(110), Math.log(2200), view.logAltitude)
    const mode: CameraMode = altitude < 130 ? 'base' : altitude < 250_000 ? 'region' : 'orbit'
    if (mode !== s.lastMode) {
      s.lastMode = mode
      u.mode = mode
      onMode(mode)
    }
  }, -3)
  return null
})
