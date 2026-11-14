import * as THREE from 'three'
import { ModelKit, MATERIALS as M } from './model-kit'

/** A closed reflector, rear hub, yoke and three rim-to-feed supports.
 * Dish-local +Z points into the sky; every joint is authored in that frame. */
export function addCommunicationAntenna(kit: ModelKit, x: number, z: number) {
  const mount = new THREE.Matrix4().compose(new THREE.Vector3(x, 3.24, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55, 0.30, 0)), new THREE.Vector3(1, 1, 1))
  const world = (p: [number, number, number]) => new THREE.Vector3(...p).applyMatrix4(mount).toArray() as [number, number, number]
  const geometry = (g: THREE.BufferGeometry, material: THREE.Material) => kit.geometry(g.applyMatrix4(mount), material)

  kit.part('cylinder', [0.58, 0.34, 0.58], [x, 2.62, z], M.dark)
  kit.part('cylinder', [0.42, 0.18, 0.42], [x, 2.86, z], M.white)
  const rearHub = world([0, 0, -0.30])
  for (const side of [-1, 1]) {
    kit.tube([[x + side * 0.16, 2.9, z], [x + side * 0.26, 3.04, z - 0.12], [rearHub[0] + side * 0.20, rearHub[1], rearHub[2]]], 0.075, M.trim, 10)
    kit.part('sphere', [0.19, 0.19, 0.19], [rearHub[0] + side * 0.23, rearHub[1], rearHub[2]], M.yellow)
  }
  const profile = [
    [0, -0.16], [0.10, -0.155], [0.28, -0.135], [0.46, -0.085], [0.64, -0.005], [0.82, 0.10],
    [0.84, 0.085], [0.82, 0.055], [0.63, -0.05], [0.44, -0.125], [0.25, -0.175], [0.09, -0.20], [0, -0.20],
  ].map(([r, axial]) => new THREE.Vector2(r, axial))
  const reflector = new THREE.LatheGeometry(profile, 24)
  reflector.rotateX(Math.PI / 2)
  geometry(reflector, M.white)
  const rim = new THREE.TorusGeometry(0.825, 0.039, 6, 32); rim.translate(0, 0, 0.10); geometry(rim, M.trim)
  const hub = new THREE.CylinderGeometry(0.16, 0.16, 0.29, 12); hub.rotateX(Math.PI / 2); hub.translate(0, 0, -0.30); geometry(hub, M.trim)
  for (const rimPoint of [[0, -0.66, 0.015], [-0.58, 0.34, 0.04], [0.58, 0.34, 0.04]] as [number, number, number][]) {
    kit.tube([world(rimPoint), world([rimPoint[0] * 0.4, rimPoint[1] * 0.4, 0.38]), world([0, 0, 0.63])], 0.026, M.trim, 8)
  }
  const feed = new THREE.CylinderGeometry(0.074, 0.06, 0.20, 10); feed.rotateX(Math.PI / 2); feed.translate(0, 0, 0.65); geometry(feed, M.yellow)
  kit.part('sphere', [0.11, 0.11, 0.11], world([0, 0, 0.76]), M.blueLight)
  kit.tube([[x, 2.74, z - 0.15], [x - 0.12, 2.94, z - 0.25], rearHub], 0.035, M.dark, 8)
}

/** One clean horizontal run and a large-radius downward elbow. Both ends are
 * positively embedded in visible, correctly oriented machine/tank sockets. */
export function addRecyclerPipe(kit: ModelKit) {
  const machine: [number, number, number] = [-0.29, 2.52, 0.31]
  const tank: [number, number, number] = [-1.35, 2.15, 0.31]
  kit.part('round', [0.12, 0.35, 0.34], [-0.33, 2.52, 0.31], M.trim)
  kit.part('cylinder', [0.32, 0.12, 0.32], [-0.395, 2.52, 0.31], M.white, [0, 0, Math.PI / 2])
  kit.ring(0.155, 0.031, [-0.455, 2.52, 0.31], M.trim, [0, Math.PI / 2, 0])
  kit.tube([machine, [-0.60, 2.52, 0.31], [-1.08, 2.52, 0.31], [-1.29, 2.46, 0.31], [-1.35, 2.31, 0.31], tank], 0.118, M.cyan, 28)
  kit.ring(0.135, 0.025, [-0.74, 2.52, 0.31], M.trim, [0, Math.PI / 2, 0])
  kit.part('cylinder', [0.34, 0.11, 0.34], [-1.35, 2.225, 0.31], M.white)
  kit.ring(0.16, 0.031, [-1.35, 2.285, 0.31], M.trim)
  for (const y of [2.40, 2.64]) kit.part('sphere', [0.048, 0.048, 0.048], [-0.401, y, 0.31], M.yellow)
}
