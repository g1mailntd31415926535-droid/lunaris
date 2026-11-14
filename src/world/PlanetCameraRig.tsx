import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { BuildingId, CameraMode, CameraRequest, WorldHandle } from '../types'
import { BUILDING_BY_ID } from '../data'
import { actualTerrainHeight, sampleTerrain } from './terrain-query'
import { moonHeightMeters } from './planet-fields'
import { CAMERA_ALTITUDES_M, CAP_RADIUS_M, MAX_ALTITUDE_M, METRE, MIN_ALTITUDE_M, MOON_CENTER, MOON_RADIUS_KM, SURFACE_CLEARANCE_M } from './space-config'
import { smoothstep } from './math'
import { useUniverse } from './universe-context'
import { createCameraFlight, sampleCameraFlight } from './camera-travel'
import { circleLocal } from './dem'
import type { CameraChannels, CameraFlight } from './camera-travel'

export const PlanetCameraRig = forwardRef<WorldHandle, { request: CameraRequest; followRover: boolean; onStopFollow: () => void; reducedMotion: boolean; onMode: (mode: CameraMode) => void; onTravel: (moving: boolean, destination: CameraMode) => void }>(function PlanetCameraRig({ request, followRover, onStopFollow, reducedMotion, onMode, onTravel }, ref) {
  const { camera, gl, size } = useThree()
  const universe = useUniverse()
  const state = useRef({ logAlt: Math.log(27), wantedLogAlt: Math.log(27), yaw: 0.61, wantedYaw: 0.61, polar: 0.63, wantedPolar: 0.63, nearYaw: 0.61, wantedNearYaw: 0.61, nearPolar: 0.925, wantedNearPolar: 0.925, panX: 2.2, panZ: -0.5, wantedPanX: 2.2, wantedPanZ: -0.5, panAnchorX: 0, panAnchorZ: 0, followZoom: 0, followWeight: 0, groundY: 0, lastMode: 'base' as CameraMode })
  const followFlag = useRef(followRover); followFlag.current = followRover
  const stopFollow = useRef(onStopFollow); stopFollow.current = onStopFollow
  const previousFollow = useRef(false)
  const travel = useRef<{ flight: CameraFlight; elapsed: number } | null>(null)
  const reportTravel = useRef(onTravel); reportTravel.current = onTravel
  const reduced = useRef(reducedMotion); reduced.current = reducedMotion
  const requestedId = useRef(-1)
  const currentSize = useRef(size); currentSize.current = size
  const scratch = useRef({ moon: new THREE.Vector3(...MOON_CENTER), farDirection: new THREE.Vector3(), nearDirection: new THREE.Vector3(0, 1, 0), surfaceX: new THREE.Vector3(), surfaceZ: new THREE.Vector3(), nearOffset: new THREE.Vector3(), nearEye: new THREE.Vector3(), farEye: new THREE.Vector3(), eye: new THREE.Vector3(), target: new THREE.Vector3(), delta: new THREE.Vector3(), mapFrom: new THREE.Vector3(), mapTo: new THREE.Vector3(), mapTurn: new THREE.Quaternion(), q: new THREE.Quaternion(), identity: new THREE.Quaternion() })
  const capture = (): CameraChannels => { const s = state.current; return { logAltitude: s.logAlt, yaw: s.yaw, polar: s.polar, nearYaw: s.nearYaw, nearPolar: s.nearPolar, panX: s.panX, panZ: s.panZ } }
  const apply = (pose: CameraChannels, syncWanted = false) => {
    const s = state.current
    s.logAlt = pose.logAltitude; s.yaw = pose.yaw; s.polar = pose.polar; s.nearYaw = pose.nearYaw; s.nearPolar = pose.nearPolar; s.panX = pose.panX; s.panZ = pose.panZ
    if (syncWanted) { s.wantedLogAlt = s.logAlt; s.wantedYaw = s.yaw; s.wantedPolar = s.polar; s.wantedNearYaw = s.nearYaw; s.wantedNearPolar = s.nearPolar; s.wantedPanX = s.panX; s.wantedPanZ = s.panZ }
  }
  const cancelTravel = () => {
    if (!travel.current) return
    const destination = travel.current.flight.destination
    travel.current = null; apply(capture(), true)
    universe.current.cameraTravel = { moving: false, destination }
    reportTravel.current(false, destination)
  }
  const goTo = (mode: CameraMode, animate = true, altitude?: number, pan: [number, number] = [2.2, -0.5]) => {
    const s = state.current
    s.panAnchorX = 0; s.panAnchorZ = 0
    const factor = currentSize.current.width < 700 ? 1.47 : currentSize.current.width < 1100 ? 1.13 : 1
    const targetAltitude = altitude ?? CAMERA_ALTITUDES_M[mode] * (mode === 'base' ? factor : 1)
    if (!animate) { s.wantedLogAlt = Math.log(targetAltitude); return }
    const goal: CameraChannels = { logAltitude: Math.log(targetAltitude), yaw: 0.61, polar: 0.63, nearYaw: 0.61, nearPolar: 0.925, panX: pan[0], panZ: pan[1] }
    const flight = createCameraFlight(capture(), goal, mode)
    if (reduced.current) { flight.duration *= 0.7; flight.lead *= 0.7 }
    travel.current = { flight, elapsed: 0 }
    s.wantedLogAlt = goal.logAltitude; s.wantedYaw = goal.yaw; s.wantedPolar = goal.polar; s.wantedNearYaw = goal.nearYaw; s.wantedNearPolar = goal.nearPolar; s.wantedPanX = goal.panX; s.wantedPanZ = goal.panZ
    universe.current.cameraTravel = { moving: true, destination: mode }
    reportTravel.current(true, mode)
  }
  useEffect(() => {
    const s = state.current
    if (followRover) { cancelTravel(); s.followZoom = 0 }
    else if (previousFollow.current) {
      s.panX = s.wantedPanX = s.panAnchorX = universe.current.roverNominal.x
      s.panZ = s.wantedPanZ = s.panAnchorZ = universe.current.roverNominal.z
      s.followWeight = 0; s.wantedLogAlt = s.logAlt
    }
    previousFollow.current = followRover
    universe.current.followRover = followRover
  }, [followRover, universe])
  useImperativeHandle(ref, () => ({
    zoom(direction) { cancelTravel(); const step = direction === 'in' ? -0.55 : 0.55; if (followFlag.current) state.current.followZoom += step; else state.current.wantedLogAlt = THREE.MathUtils.clamp(state.current.wantedLogAlt + step, Math.log(MIN_ALTITUDE_M), Math.log(MAX_ALTITUDE_M)) },
    reset() { const s = state.current; s.wantedYaw = 0.61; s.wantedPolar = 0.63; s.wantedNearYaw = 0.61; s.wantedNearPolar = 0.925; if (followFlag.current) s.followZoom = 0; else { s.wantedPanX = 2.2; s.wantedPanZ = -0.5; goTo(s.lastMode) } },
    focus(id: BuildingId) { previousFollow.current = false; const { position } = BUILDING_BY_ID[id]; goTo('base', true, 21, [position[0], position[2]]) },
    focusPoint(x: number, z: number) { previousFollow.current = false; goTo('region', true, 420, [x, z]); state.current.panAnchorX = x; state.current.panAnchorZ = z },
    focusCrew(name: string) { previousFollow.current = false; const actor = window.__LUNARIS__?.actors.find((a) => a.name === `astronaut:${name}`); if (actor) goTo('base', true, 18, [actor.position[0], actor.position[2]]) },
  }), [])
  useEffect(() => {
    if (request.id === requestedId.current) return
    const initial = requestedId.current < 0
    requestedId.current = request.id
    goTo(request.mode, !initial)
  }, [request.id, request.mode])
  useEffect(() => {
    const s = state.current
    if (s.lastMode === 'base' && !followFlag.current && !travel.current) goTo('base', false)
  }, [size.width])
  useEffect(() => {
    const element = gl.domElement
    const pointers = new Map<number, { x: number; y: number; button: number; startX: number; startY: number }>()
    let pinchDistance = 0
    const down = (e: PointerEvent) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, startX: e.clientX, startY: e.clientY }); if (pointers.size === 2) { cancelTravel(); const p = [...pointers.values()]; pinchDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) } }
    const move = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId); if (!p) return
      const dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY
      const s = state.current
      if (pointers.size === 2) {
        const p = [...pointers.values()], d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
        if (pinchDistance > 0 && d > 0) { const zoom = -Math.log(d / pinchDistance); if (followFlag.current) s.followZoom += zoom; else s.wantedLogAlt = THREE.MathUtils.clamp(s.wantedLogAlt + zoom, Math.log(MIN_ALTITUDE_M), Math.log(MAX_ALTITUDE_M)) }
        pinchDistance = d; return
      }
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 3) return
      cancelTravel()
      if (!element.hasPointerCapture(e.pointerId)) element.setPointerCapture(e.pointerId)
      if (p.button === 2 || p.button === 1) {
        if (followFlag.current) stopFollow.current()
        const scale = Math.exp(s.logAlt) / Math.max(200, currentSize.current.height) * 1.25
        const maxPan = Math.min(20_000, Math.max(36, Math.exp(s.logAlt) * 0.7))
        s.wantedPanX = THREE.MathUtils.clamp(s.wantedPanX - (dx * Math.cos(s.nearYaw) + dy * Math.sin(s.nearYaw)) * scale, s.panAnchorX - maxPan, s.panAnchorX + maxPan)
        s.wantedPanZ = THREE.MathUtils.clamp(s.wantedPanZ - (-dx * Math.sin(s.nearYaw) + dy * Math.cos(s.nearYaw)) * scale, s.panAnchorZ - maxPan, s.panAnchorZ + maxPan)
      } else {
        s.wantedYaw -= dx * 0.005; s.wantedPolar = THREE.MathUtils.clamp(s.wantedPolar - dy * 0.004, 0.025, Math.PI - 0.025)
        s.wantedNearYaw -= dx * 0.005; s.wantedNearPolar = THREE.MathUtils.clamp(s.wantedNearPolar - dy * 0.004, 0.30, 1.13)
      }
    }
    const up = (e: PointerEvent) => { pointers.delete(e.pointerId); if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId); if (pointers.size < 2) pinchDistance = 0 }
    const wheel = (e: WheelEvent) => { e.preventDefault(); cancelTravel(); const s = state.current; if (followFlag.current) s.followZoom += e.deltaY * 0.0035; else s.wantedLogAlt = THREE.MathUtils.clamp(s.wantedLogAlt + e.deltaY * 0.0035, Math.log(MIN_ALTITUDE_M), Math.log(MAX_ALTITUDE_M)) }
    const clear = () => { pointers.clear(); pinchDistance = 0 }
    const contextmenu = (e: Event) => e.preventDefault()
    element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up); element.addEventListener('lostpointercapture', up)
    element.addEventListener('wheel', wheel, { passive: false }); element.addEventListener('contextmenu', contextmenu)
    window.addEventListener('blur', clear)
    if (new URLSearchParams(location.search).has('debug')) window.__LUNARIS_CONTROLS__ = {
      orbit(yaw, polar) { cancelTravel(); state.current.wantedYaw = yaw; state.current.wantedPolar = THREE.MathUtils.clamp(polar, 0.025, Math.PI - 0.025); state.current.wantedLogAlt = Math.log(CAMERA_ALTITUDES_M.orbit) },
      altitude(metres) { cancelTravel(); state.current.wantedLogAlt = Math.log(THREE.MathUtils.clamp(metres, MIN_ALTITUDE_M, MAX_ALTITUDE_M)) },
    }
    return () => { element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); element.removeEventListener('lostpointercapture', up); element.removeEventListener('wheel', wheel); element.removeEventListener('contextmenu', contextmenu); window.removeEventListener('blur', clear); delete window.__LUNARIS_CONTROLS__ }
  }, [gl])
  useFrame((_, delta) => {
    const s = state.current, p = scratch.current
    const dt = Math.min(delta, 0.12), alpha = 1 - Math.exp(-(reducedMotion ? 9 : 4.2) * dt)
    if (followRover && !travel.current) s.wantedLogAlt = Math.log(THREE.MathUtils.clamp(30 * Math.exp(s.followZoom), 12, 3500))
    s.followWeight += ((followRover ? 1 : 0) - s.followWeight) * alpha
    if (travel.current) {
      const journey = travel.current
      journey.elapsed = Math.min(journey.flight.duration, journey.elapsed + dt)
      apply(sampleCameraFlight(journey.flight, journey.elapsed))
      if (journey.elapsed >= journey.flight.duration) {
        apply(journey.flight.to, true); travel.current = null
        universe.current.cameraTravel = { moving: false, destination: journey.flight.destination }
        reportTravel.current(false, journey.flight.destination)
      }
    } else {
      const zoomStep = (s.wantedLogAlt - s.logAlt) * (1 - Math.exp(-5 * dt))
      const maximumLogSpeed = zoomStep > 0 ? 7.5 : reducedMotion ? 7 : 3.4
      s.logAlt += THREE.MathUtils.clamp(zoomStep, -maximumLogSpeed * dt, maximumLogSpeed * dt)
      s.yaw += (s.wantedYaw - s.yaw) * alpha; s.polar += (s.wantedPolar - s.polar) * alpha
      s.nearYaw += (s.wantedNearYaw - s.nearYaw) * alpha; s.nearPolar += (s.wantedNearPolar - s.nearPolar) * alpha
    }
    const h = Math.exp(s.logAlt), maxPan = Math.min(20_000, Math.max(36, h * 0.7))
    if (!travel.current) {
      s.wantedPanX = THREE.MathUtils.clamp(s.wantedPanX, s.panAnchorX - maxPan, s.panAnchorX + maxPan); s.wantedPanZ = THREE.MathUtils.clamp(s.wantedPanZ, s.panAnchorZ - maxPan, s.panAnchorZ + maxPan)
      s.panX += (s.wantedPanX - s.panX) * alpha; s.panZ += (s.wantedPanZ - s.panZ) * alpha
    }
    const focus = 1 - smoothstep(Math.log(4_000), Math.log(1_500_000), s.logAlt)
    const near = 1 - smoothstep(Math.log(80), Math.log(12_000), s.logAlt)
    // Over NoData the look-at point keeps its last real height; nothing is invented there.
    const surface = sampleTerrain(s.panX, s.panZ, s.groundY)
    if (surface.valid) s.groundY = surface.point[1]
    p.target.fromArray(surface.point).multiplyScalar(METRE)
    if (s.followWeight > 0.0001) p.target.lerp(p.nearOffset.copy(universe.current.roverPosition).multiplyScalar(METRE), s.followWeight > 0.995 ? 1 : s.followWeight)
    p.nearDirection.copy(p.target).sub(p.moon).normalize()
    p.farDirection.set(Math.sin(s.polar) * Math.sin(s.yaw), Math.cos(s.polar), Math.sin(s.polar) * Math.cos(s.yaw))
    p.q.setFromUnitVectors(p.farDirection, p.nearDirection)
    p.q.slerp(p.identity, 1 - focus)
    p.farDirection.applyQuaternion(p.q).normalize()
    p.farEye.copy(p.moon).addScaledVector(p.farDirection, p.target.distanceTo(p.moon) + h * METRE)
    p.surfaceX.set(1, 0, 0).addScaledVector(p.nearDirection, -p.nearDirection.x).normalize()
    p.surfaceZ.crossVectors(p.surfaceX, p.nearDirection).normalize()
    p.nearOffset.copy(p.nearDirection).multiplyScalar(h * METRE).addScaledVector(p.surfaceX, Math.sin(s.nearYaw) * Math.tan(s.nearPolar) * h * METRE).addScaledVector(p.surfaceZ, Math.cos(s.nearYaw) * Math.tan(s.nearPolar) * h * METRE)
    p.nearEye.copy(p.target).add(p.nearOffset)
    p.eye.copy(p.farEye).lerp(p.nearEye, near)
    // Map-centre framing: once zoomed out past the base (1.5 km → 6 km), eye and look-at move together so the centre of
    // the screen lands on the centre of the NASA data circle instead of the base 2.9 km away. The move is a rotation
    // about the Moon's centre (not a flat x/z shift): height above the ground and the view angle against the local
    // surface stay exactly as they were, even when the view ray meets the ground hundreds of km away during the orbit
    // blend. A flat shift there dragged the eye down to the surface (all-dark screen at 60 km). User pan and rover follow
    // keep working on top of it. It fades out again between 60 km and 250 km (the switch to orbit mode).
    const mapWeight = smoothstep(Math.log(1_500), Math.log(6_000), s.logAlt) * (1 - smoothstep(Math.log(60_000), Math.log(250_000), s.logAlt)) * (1 - s.followWeight)
    p.mapTurn.identity()
    if (mapWeight > 0.0001) {
      p.delta.copy(p.target).lerp(p.moon, 1 - focus).sub(p.eye).normalize()   // final view ray
      // Where the ray meets the base-level sphere (radius = Moon centre → base origin).
      p.mapFrom.copy(p.eye).sub(p.moon)
      const b = p.mapFrom.dot(p.delta), c = p.mapFrom.lengthSq() - MOON_RADIUS_KM * MOON_RADIUS_KM, disc = b * b - c
      const t = disc >= 0 ? -b - Math.sqrt(disc) : -1
      if (t > 0) {
        p.mapFrom.addScaledVector(p.delta, t).normalize()
        // The circle centre plus the user's own pan is where that hit point should go.
        const circle = circleLocal()
        p.mapTo.set((circle.x + s.panX - s.panAnchorX) * METRE, 0, (circle.z + s.panZ - s.panAnchorZ) * METRE).sub(p.moon).normalize()
        p.mapTurn.setFromUnitVectors(p.mapFrom, p.mapTo).slerp(p.identity, 1 - mapWeight)
        p.eye.sub(p.moon).applyQuaternion(p.mapTurn).add(p.moon)
      }
    }
    // Sphere clearance and local terrain clearance are independent safety gates.
    p.delta.copy(p.eye).sub(p.moon)
    const radius = p.delta.length(); p.delta.normalize()
    const solidRadius = MOON_RADIUS_KM + moonHeightMeters(p.delta.x, p.delta.y, p.delta.z) * METRE
    // Inside the 50 km hole the only solid surface is the NASA DEM; the fictional sphere applies outside it.
    const insideHole = Math.hypot(p.eye.x, p.eye.z) < CAP_RADIUS_M * METRE * 0.994
    const ground = insideHole ? actualTerrainHeight(p.eye.x / METRE, p.eye.z / METRE) : Number.NEGATIVE_INFINITY
    if (!insideHole && radius < solidRadius + SURFACE_CLEARANCE_M * METRE) p.eye.copy(p.moon).addScaledVector(p.delta, solidRadius + SURFACE_CLEARANCE_M * METRE)
    if (Number.isFinite(ground)) p.eye.y = Math.max(p.eye.y, (ground + SURFACE_CLEARANCE_M) * METRE)
    p.target.lerp(p.moon, 1 - focus).sub(p.moon).applyQuaternion(p.mapTurn).add(p.moon)
    camera.position.copy(p.eye); camera.up.set(0, 1, 0).lerp(p.nearDirection, near).applyQuaternion(p.mapTurn).normalize(); camera.lookAt(p.target)
    const perspective = camera as THREE.PerspectiveCamera
    const nextNear = THREE.MathUtils.clamp(h * METRE * 0.001, 0.000015, 1)
    if (Math.abs(perspective.near - nextNear) > nextNear * 0.015) { perspective.near = nextNear; perspective.updateProjectionMatrix() }
    const u = universe.current
    u.altitudeM = h; u.clearanceM = insideHole ? (Number.isFinite(ground) ? p.eye.y / METRE - ground : h) : (p.eye.distanceTo(p.moon) - solidRadius) / METRE; u.cameraTarget.copy(p.target)
    p.delta.copy(p.target).sub(p.eye)
    if (p.delta.y < -1e-9) u.viewCentre.copy(p.eye).addScaledVector(p.delta, -p.eye.y / p.delta.y); else u.viewCentre.copy(p.target)
    u.styleDetail = 1 - smoothstep(Math.log(110), Math.log(2200), s.logAlt)
    const mode: CameraMode = h < 130 ? 'base' : h < 250_000 ? 'region' : 'orbit'
    if (mode !== s.lastMode) { s.lastMode = mode; u.mode = mode; onMode(mode) }
  }, -3)
  return null
})
