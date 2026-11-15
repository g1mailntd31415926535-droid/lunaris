import * as THREE from 'three'
import type { BuildingId } from '../types'
import { ModelKit, MATERIALS as M, addFoundation, addDoor, addBeacon, panelSurface } from './model-kit'
import { addCommunicationAntenna, addRecyclerPipe } from './equipment-details'

function command() {
  const kit = new ModelKit()
  kit.part('cylinder', [6.05, 0.32, 6.05], [0, 0.17, 0], M.dark)
  kit.part('cylinder', [5.72, 0.7, 5.72], [0, 0.55, 0], M.shell)
  kit.dome(2.72, [0, 0.78, 0], M.shell)
  for (const y of [0.88, 1.49, 2.18, 2.75, 3.18]) {
    const radius = Math.sqrt(2.72 ** 2 - (y - 0.78) ** 2)
    kit.ring(radius + 0.015, 0.025, [0, y, 0], M.trim)
  }
  for (let i = 0; i < 12; i++) {
    const phi = i / 12 * Math.PI * 2
    const seam: [number, number, number][] = []
    for (let j = 0; j <= 12; j++) {
      const theta = 0.2 + j / 12 * 1.36
      seam.push([Math.sin(theta) * Math.sin(phi) * 2.74, 0.78 + Math.cos(theta) * 2.74, Math.sin(theta) * Math.cos(phi) * 2.74])
    }
    kit.tube(seam, 0.026, M.trim, 16)
    if (i !== 0 && i !== 1 && i !== 11) {
      const angle = phi
      kit.part('round', [0.65, 0.56, 0.13], [Math.sin(angle) * 2.68, 1.2, Math.cos(angle) * 2.68], M.dark, [0, angle, 0])
      kit.part('round', [0.51, 0.37, 0.15], [Math.sin(angle) * 2.73, 1.2, Math.cos(angle) * 2.73], M.window, [0, angle, 0])
      kit.part('box', [0.07, 0.16, 0.18], [Math.sin(angle) * 2.72, 0.55, Math.cos(angle) * 2.72], M.blueLight, [0, angle, 0])
    }
    kit.part('round', [0.25, 0.12, 0.27], [Math.sin(phi) * 2.48, 2.02, Math.cos(phi) * 2.48], M.cyan, [0.35, phi, 0])
    kit.part('box', [0.25, 0.07, 0.08], [Math.sin(phi) * 2.95, 0.27, Math.cos(phi) * 2.95], M.yellow, [0, phi, 0])
  }
  addDoor(kit, 2.53, 1.65, 1.95)
  kit.part('cylinder', [1.14, 0.15, 1.14], [0, 3.49, 0], M.trim)
  kit.part('cylinder', [0.92, 0.34, 0.92], [0, 3.7, 0], M.white)
  kit.ring(0.48, 0.055, [0, 3.57, 0], M.yellow)
  addBeacon(kit, [0, 3.86, 0], 0.88)
  // Communication tower, with an articulated-looking dish and a connected base.
  const tx = -3.38, tz = -0.42
  kit.part('cylinder', [1.47, 0.2, 1.47], [tx, 0.16, tz], M.dark)
  kit.part('cylinder', [1.18, 2.25, 1.18], [tx, 1.35, tz], M.shell)
  for (const y of [0.6, 1.43, 2.2]) {
    kit.ring(0.61, 0.055, [tx, y, tz], M.trim)
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2
      kit.part('round', [0.26, 0.29, 0.075], [tx + Math.sin(a) * 0.61, y + 0.23, tz + Math.cos(a) * 0.61], M.window, [0, a, 0])
    }
  }
  addCommunicationAntenna(kit, tx, tz)
  kit.part('round', [0.9, 0.75, 0.8], [-2.88, 0.65, 0.65], M.white)
  kit.part('round', [0.12, 0.53, 0.45], [-3.37, 0.69, 0.72], M.cyan)
  return kit.build()
}

/** Tower positions of the solar station (building-local metres). The panel heads are separate, Sun-tracking objects. */
export const SOLAR_TOWERS: readonly (readonly [number, number])[] = [[-1.7, -0.6], [1.3, -0.1]]
export const SOLAR_HEAD_HEIGHT = 2.25

// Two tracking towers (reference image): a slim mast on a plinth; the two tall panels (solarTrackerHead) turn to the Sun.
function solar() {
  const kit = new ModelKit()
  addFoundation(kit, 6.8, 5.2)
  const yaw = 0.62
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const at = (x: number, z: number, dx: number, y: number, dz: number): [number, number, number] => [x + dx * c + dz * s, y, z - dx * s + dz * c]
  for (const [x, z] of SOLAR_TOWERS) {
    kit.part('box', [1.25, 0.24, 1.0], at(x, z, 0, 0.43, 0), M.dark, [0, yaw, 0])                 // plinth
    kit.part('box', [1.05, 0.06, 0.8], at(x, z, 0, 0.57, 0), M.trim, [0, yaw, 0])
    kit.part('cylinder', [0.34, 0.34, 0.34], at(x, z, 0, 0.72, 0), M.trim)                         // mast collar
    kit.part('cylinder', [0.17, 3.05, 0.17], at(x, z, 0, 2.15, 0), M.white)                        // mast
    kit.part('cylinder', [0.27, 0.12, 0.27], at(x, z, 0, 1.25, 0), M.trim)
    kit.part('cylinder', [0.2, 0.2, 0.2], at(x, z, 0, 3.72, 0), M.trim)
    kit.part('box', [0.06, 0.055, 0.24], at(x, z, 0.45, 0.65, 0.5), M.blueLight, [0, yaw, 0])
  }
  kit.tube([[-1.7, 0.36, -0.1], [-1.7, 0.36, 1.2], [1.3, 0.36, 1.2], [2.4, 0.36, 1.6]], 0.045, M.dark, 12)
  kit.tube([[1.3, 0.36, 0.35], [1.3, 0.36, 1.2]], 0.045, M.dark, 4)
  kit.part('round', [0.85, 0.8, 0.63], [2.75, 0.67, 2.06], M.shell)
  kit.part('round', [0.53, 0.4, 0.045], [2.75, 0.72, 2.4], M.dark)
  kit.part('box', [0.12, 0.13, 0.05], [2.74, 0.74, 2.44], M.greenLight)
  addBeacon(kit, [-3.1, 0.34, 2.25], 0.72)
  return kit.build()
}

/**
 * One Sun-tracking head: cross beam and two tall panels either side of the mast. Panel faces point along local +z.
 * Each panel hangs on a vertical hinge (group "solar-wing", userData.side = ±1) so it can fold forward,
 * cells facing each other, without scaling or passing through the hub, beam or mast (A3 "stow").
 */
export const SOLAR_HINGE: [number, number] = [0.12, 0.14]   // |x| and z of each hinge in the head frame
export function solarTrackerHead() {
  const head = new THREE.Group()
  const core = new ModelKit()
  core.part('cylinder', [0.24, 0.3, 0.24], [0, 0, 0], M.trim)                                   // slewing hub on the mast
  core.part('box', [2.18, 0.1, 0.12], [0, 0, 0.02], M.trim)                                     // cross beam
  head.add(core.build())
  for (const side of [-1, 1]) {
    const kit = new ModelKit(), cx = side * 0.48                                                // panel centre from the hinge
    kit.part('box', [1.0, 2.72, 0.07], [cx, 0, -0.04], M.white)                                 // light frame
    kit.part('box', [0.9, 2.6, 0.05], [cx, 0, -0.005], panelSurface())                         // cells
    kit.part('box', [0.035, 2.6, 0.06], [cx, 0, 0], M.trim)                                     // centre rail
    for (const y of [-0.8, 0.8]) kit.part('cylinder', [0.07, 0.42, 0.07], [0, y, -0.04], M.trim) // hinge knuckles
    const wing = new THREE.Group()
    wing.name = 'solar-wing'; wing.userData.side = side
    wing.position.set(side * SOLAR_HINGE[0], 0, SOLAR_HINGE[1])
    wing.add(kit.build())
    head.add(wing)
  }
  return head
}

function water() {
  const kit = new ModelKit()
  addFoundation(kit, 4.25, 2.8)
  kit.part('round', [1.95, 1.45, 1.95], [0.5, 1.0, 0], M.white)
  kit.part('round', [1.64, 1.45, 0.48], [0.5, 2.08, 0.37], M.shell)
  kit.part('round', [1.44, 1.14, 0.13], [0.5, 2.08, 0.66], M.dark)
  for (const x of [-0.3, 1.3]) {
    kit.part('round', [0.24, 1.27, 0.27], [x, 1.09, 1.03], M.trim)
    kit.part('box', [0.11, 0.49, 0.04], [x, 1.12, 1.19], M.blueLight)
    kit.part('round', [0.29, 0.15, 0.36], [x, 0.48, 1.05], M.yellow)
  }
  // Cylinder cap rings surround the independent animated liquid/glass layer.
  for (const y of [0.47, 2.12]) {
    kit.part('cylinder', [1.45, 0.19, 1.45], [-1.35, y, 0.2], M.trim)
    kit.ring(0.7, 0.065, [-1.35, y + 0.08, 0.2], M.white)
  }
  for (const x of [-1.91, -0.8]) kit.part('box', [0.08, 1.62, 0.08], [x, 1.27, 0.5], M.shell)
  addRecyclerPipe(kit)
  kit.part('cylinder', [0.32, 0.38, 0.32], [0.52, 2.97, 0.2], M.cyan)
  kit.part('sphere', [0.2, 0.28, 0.2], [0.52, 3.2, 0.2], M.blueLight)
  kit.part('round', [0.55, 0.89, 0.61], [1.7, 0.86, 0.34], M.trim)
  kit.part('box', [0.24, 0.48, 0.05], [1.7, 0.87, 0.67], M.blueLight)
  kit.part('round', [0.57, 0.52, 0.65], [-0.66, 0.57, 1.08], M.dark)
  addDoor(kit, 0.99, 0.7, 0.89, M.cyan)
  addBeacon(kit, [1.28, 2.82, 0.2], 0.44)
  return kit.build()
}

function oxygen() {
  const kit = new ModelKit()
  addFoundation(kit, 3.25, 2.9)
  for (const [x, z, h] of [[-0.65, 0.15, 2.85], [0.77, -0.3, 2.4]]) {
    kit.part('cylinder', [1.25, h, 1.25], [x, 0.3 + h / 2, z], M.shell)
    kit.part('sphere', [1.25, 0.55, 1.25], [x, 0.3 + h, z], M.white)
    kit.part('cylinder', [1.27, 1.1, 1.27], [x, 1.9, z], M.green)
    kit.ring(0.65, 0.055, [x, 1.36, z], M.trim)
    kit.ring(0.65, 0.055, [x, 2.45, z], M.trim)
    kit.part('cylinder', [0.42, 0.2, 0.42], [x, 0.61 + h, z], M.trim)
    kit.part('cylinder', [0.31, 0.1, 0.31], [x, 0.78 + h, z], M.greenLight)
    for (const y of [0.75, 1.15, 1.55, 1.95, 2.35]) kit.part('box', [0.065, 0.095, 0.035], [x - 0.35, y, z + 0.6], M.greenLight)
  }
  kit.tube([[-1.08, 0.72, -0.2], [-1.66, 0.8, -0.8], [-1.54, 1.8, -0.8], [-0.74, 1.9, -0.4]], 0.16, M.cyan)
  kit.part('round', [0.8, 0.88, 1.03], [0.92, 0.7, 0.79], M.white)
  kit.part('round', [0.46, 0.41, 0.1], [0.92, 0.77, 1.34], M.window)
  addBeacon(kit, [0.78, 3.04, -0.3], 0.52)
  return kit.build()
}

function battery() {
  const kit = new ModelKit()
  addFoundation(kit, 3.8, 2.8)
  kit.part('round', [2.55, 2.04, 2.08], [0, 1.32, 0], M.white)
  kit.part('round', [1.71, 1.52, 0.2], [0, 1.33, 1.07], M.trim)
  kit.part('round', [1.49, 1.26, 0.13], [0, 1.33, 1.2], M.dark)
  for (const side of [-1, 1]) {
    kit.part('round', [0.54, 1.85, 1.48], [side * 1.43, 1.21, -0.08], M.trim)
    kit.part('round', [0.34, 0.17, 1.54], [side * 1.43, 2.07, -0.08], M.cyan)
    kit.part('box', [0.25, 1.12, 0.06], [side * 1.43, 1.19, 0.7], M.blueLight)
    for (let i = 0; i < 3; i++) kit.part('box', [0.25, 0.06, 0.07], [side * 1.43, 0.8 + i * 0.4, 0.74], M.dark)
    kit.part('round', [0.25, 0.27, 0.22], [side * 1.13, 0.58, 1.03], M.yellow)
  }
  kit.part('round', [0.92, 0.59, 0.84], [0, 2.65, -0.04], M.green)
  kit.part('box', [0.4, 0.16, 0.18], [0, 3.01, -0.04], M.trim)
  kit.part('box', [0.66, 0.085, 0.06], [0, 2.67, 0.41], M.greenLight)
  for (const x of [-0.8, 0.8]) kit.part('round', [0.41, 0.12, 0.37], [x, 2.37, -0.62], M.dark)
  kit.part('box', [2.26, 0.13, 0.14], [0, 0.43, 1.14], M.yellow)
  return kit.build()
}

function shelter() {
  const kit = new ModelKit()
  kit.part('cylinder', [3.85, 0.3, 3.85], [0, 0.17, 0], M.dark)
  kit.part('cylinder', [3.48, 0.55, 3.48], [0, 0.58, 0], M.shell)
  kit.dome(1.73, [0, 0.84, 0], M.white)
  for (const y of [1.04, 1.78, 2.33]) kit.ring(Math.sqrt(1.73 ** 2 - (y - 0.84) ** 2) + 0.025, 0.045, [0, y, 0], M.trim)
  for (let i = 1; i < 7; i++) {
    const phi = i / 7 * Math.PI * 2
    kit.part('round', [0.46, 0.42, 0.07], [Math.sin(phi) * 1.74, 1.06, Math.cos(phi) * 1.74], M.dark, [0, phi, 0])
    kit.part('round', [0.33, 0.27, 0.08], [Math.sin(phi) * 1.79, 1.06, Math.cos(phi) * 1.79], M.window, [0, phi, 0])
    kit.part('box', [0.21, 0.11, 0.17], [Math.sin(phi) * 1.95, 0.36, Math.cos(phi) * 1.95], M.yellow, [0, phi, 0])
  }
  kit.part('round', [0.82, 0.12, 0.75], [0, 2.52, -0.22], M.trim)
  kit.part('round', [0.56, 0.035, 0.47], [0, 2.6, -0.22], M.dark)
  addDoor(kit, 1.5, 1.09, 1.35, M.orange)
  kit.part('round', [0.42, 1.0, 0.84], [-1.82, 0.82, 0.22], M.trim)
  kit.part('box', [0.12, 0.39, 0.08], [-1.84, 0.93, 0.68], M.blueLight)
  return kit.build()
}

function greenhouse() {
  const kit = new ModelKit()
  kit.part('cylinder', [5.46, 0.36, 5.46], [0, 0.19, 0], M.dark)
  kit.part('cylinder', [5.22, 0.49, 5.22], [0, 0.58, 0], M.shell)
  kit.part('cylinder', [4.93, 0.09, 4.93], [0, 0.86, 0], M.soil)
  for (let i = 0; i < 12; i++) {
    const phi = i / 12 * Math.PI * 2
    kit.part('round', [0.62, 0.27, 0.12], [Math.sin(phi) * 2.61, 0.59, Math.cos(phi) * 2.61], i % 3 ? M.window : M.dark, [0, phi, 0])
    const rib: [number, number, number][] = []
    for (let j = 0; j <= 16; j++) {
      const theta = j / 16 * Math.PI / 2
      rib.push([Math.sin(theta) * Math.sin(phi) * 2.51, 0.83 + Math.cos(theta) * 2.51, Math.sin(theta) * Math.cos(phi) * 2.51])
    }
    kit.tube(rib, 0.045, M.white, 20)
  }
  for (const y of [1.5, 2.35, 3.05]) kit.ring(Math.sqrt(2.51 ** 2 - (y - 0.83) ** 2), 0.035, [0, y, 0], M.yellow)
  for (let i = 0; i < 13; i++) {
    const phi = i * 2.39996
    const r = Math.sqrt(i / 13) * 1.88
    const x = Math.sin(phi) * r, z = Math.cos(phi) * r
    const height = 0.36 + (i % 3) * 0.18
    kit.part('box', [0.68, 0.21, 0.62], [x, 0.96, z], M.trim)
    kit.part('box', [0.58, 0.04, 0.52], [x, 1.085, z], M.soil)
    kit.part('cylinder', [0.045, height, 0.045], [x, 1.1 + height / 2, z], M.leaf)
    for (let j = 0; j < 5; j++) {
      const a = j * 1.8 + i
      const material = (i + j) % 3 ? M.leaf : M.leafLight
      kit.part('box', [0.27, 0.19, 0.28], [x + Math.sin(a) * 0.22, 1.24 + height * (j / 6), z + Math.cos(a) * 0.2], material, [0.3, a, 0.22])
    }
    if (i % 3 === 0) kit.part('box', [0.15, 0.15, 0.15], [x, 1.16 + height, z], M.yellow)
  }
  kit.part('cylinder', [0.83, 0.12, 0.83], [0, 3.36, 0], M.trim)
  kit.ring(0.44, 0.035, [0, 3.39, 0], M.blueLight)
  kit.part('cylinder', [0.1, 0.76, 0.1], [0, 2.85, 0], M.trim)
  kit.part('sphere', [0.22, 0.25, 0.22], [0, 2.48, 0], M.window)
  kit.arch(1.15, 1.55, 0.2, 0.15, [0, 0.36, 2.25], M.white)
  kit.part('round', [0.84, 1.08, 0.09], [0, 0.98, 2.4], M.cyan)
  kit.part('box', [0.61, 0.065, 0.1], [0, 1.65, 2.48], M.greenLight)
  for (let step = 0; step < 3; step++) kit.part('box', [1.2, 0.1 * (3 - step), 0.3], [0, 0.05 * (3 - step), 2.56 + step * 0.26], M.shell)
  return kit.build()
}

function roverStation() {
  const kit = new ModelKit()
  addFoundation(kit, 4.5, 3.6)
  kit.part('round', [0.73, 2.25, 2.65], [-1.62, 1.42, -0.22], M.shell)
  kit.part('round', [0.73, 2.25, 2.65], [1.62, 1.42, -0.22], M.shell)
  kit.part('round', [3.73, 0.55, 2.83], [0, 2.4, -0.18], M.white)
  kit.part('round', [2.78, 1.88, 0.23], [0, 1.42, -1.5], M.dark)
  kit.part('box', [2.65, 0.09, 2.5], [0, 0.36, -0.11], M.black)
  kit.arch(3.64, 2.36, 0.27, 0.32, [0, 0.3, 1.12], M.white)
  kit.arch(2.89, 1.99, 0.08, 0.065, [0, 0.31, 1.4], M.yellow)
  for (const x of [-1.58, 1.58]) {
    kit.part('box', [0.08, 1.35, 0.1], [x, 1.2, 1.45], M.window)
    kit.part('round', [0.64, 1.24, 0.68], [x * 1.2, 0.99, 0.67], M.trim)
    kit.part('box', [0.13, 0.48, 0.05], [x * 1.2, 1.11, 1.04], M.blueLight)
  }
  kit.part('round', [1.72, 0.71, 0.75], [0, 2.99, -0.12], M.shell)
  kit.part('round', [1.29, 0.46, 0.07], [0, 3.01, 0.3], M.dark)
  kit.part('box', [2.48, 0.08, 0.08], [0, 2.43, 1.39], M.window)
  kit.part('box', [2.9, 0.11, 1.19], [0, 0.22, 1.91], M.trim, [0.1, 0, 0])
  for (const x of [-1.25, 1.25]) kit.part('box', [0.17, 0.03, 1.0], [x, 0.32, 1.93], M.yellow, [0.1, 0, 0])
  // A tiny tool arm in the garage. It is deliberately not a robot simulation.
  kit.part('cylinder', [0.37, 0.18, 0.37], [0.94, 0.49, -0.5], M.yellow)
  kit.tube([[0.94, 0.5, -0.5], [0.95, 1.19, -0.55], [0.59, 1.46, -0.44], [0.21, 1.21, -0.1]], 0.09, M.yellow)
  kit.part('sphere', [0.24, 0.24, 0.24], [0.59, 1.46, -0.44], M.dark)
  addBeacon(kit, [-1.8, 2.71, -0.86], 0.72)
  return kit.build()
}

export function createBuildingModel(id: BuildingId) {
  const factory = { command, solar, water, oxygen, battery, shelter, greenhouse, rover: roverStation }
  const result = factory[id]()
  result.name = `building:${id}`
  return result
}

export function createRoverModel() {
  const kit = new ModelKit()
  kit.part('round', [1.32, 0.37, 2.11], [0, 0.59, 0], M.dark)
  kit.part('round', [1.37, 0.42, 2.04], [0, 0.87, 0], M.white)
  kit.part('round', [1.14, 0.72, 0.97], [0, 1.36, 0.24], M.shell)
  kit.part('round', [0.94, 0.48, 0.06], [0, 1.41, 0.78], M.cyan, [-0.2, 0, 0])
  kit.part('round', [0.77, 0.37, 0.07], [0, 1.4, 0.81], M.blueLight, [-0.2, 0, 0])
  for (const x of [-0.49, 0.49]) {
    kit.part('round', [0.17, 0.17, 0.11], [x, 0.98, 1.08], M.window)
    kit.part('round', [0.22, 0.28, 0.47], [x, 1.15, -0.68], M.yellow)
  }
  kit.part('box', [0.95, 0.1, 0.16], [0, 0.7, 1.12], M.trim)
  kit.part('cylinder', [0.11, 0.76, 0.11], [0.1, 1.84, -0.44], M.trim)
  kit.part('round', [0.55, 0.21, 0.4], [0.1, 2.24, -0.37], M.white)
  kit.part('box', [0.36, 0.1, 0.1], [0.1, 2.25, -0.15], M.dark)
  kit.part('sphere', [0.13, 0.14, 0.13], [0.1, 2.43, -0.4], M.blueLight)
  return kit.build()
}

export function createLampModel() {
  const kit = new ModelKit()
  kit.part('round', [0.45, 0.17, 0.45], [0, 0.11, 0], M.dark)
  kit.part('cylinder', [0.13, 1.02, 0.13], [0, 0.62, 0], M.trim)
  kit.part('cylinder', [0.25, 0.09, 0.25], [0, 1.16, 0], M.dark)
  kit.part('cylinder', [0.14, 0.21, 0.14], [0, 1.29, 0], M.window)
  kit.part('cylinder', [0.27, 0.07, 0.27], [0, 1.43, 0], M.trim)
  return kit.build()
}
