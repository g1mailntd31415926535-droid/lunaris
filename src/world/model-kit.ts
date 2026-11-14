import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { solarTexture } from './textures'

type Triple = [number, number, number]
type Shape = 'box' | 'round' | 'cylinder' | 'sphere' | 'cone'

export const MATERIALS = {
  shell: new THREE.MeshStandardMaterial({ color: '#c5c6d9', roughness: 0.54, metalness: 0.28 }),
  white: new THREE.MeshStandardMaterial({ color: '#e5e3ee', roughness: 0.45, metalness: 0.16 }),
  trim: new THREE.MeshStandardMaterial({ color: '#8590a8', roughness: 0.54, metalness: 0.38 }),
  dark: new THREE.MeshStandardMaterial({ color: '#29334a', roughness: 0.62, metalness: 0.38 }),
  black: new THREE.MeshStandardMaterial({ color: '#101c2b', roughness: 0.58, metalness: 0.26 }),
  yellow: new THREE.MeshStandardMaterial({ color: '#d5a34e', roughness: 0.45, metalness: 0.4 }),
  orange: new THREE.MeshStandardMaterial({ color: '#e68c54', roughness: 0.5, metalness: 0.25 }),
  cyan: new THREE.MeshStandardMaterial({ color: '#277caf', roughness: 0.26, metalness: 0.6 }),
  green: new THREE.MeshStandardMaterial({ color: '#5c9b74', roughness: 0.54, metalness: 0.2 }),
  purple: new THREE.MeshStandardMaterial({ color: '#7b689f', roughness: 0.5, metalness: 0.3 }),
  red: new THREE.MeshStandardMaterial({ color: '#cb6c6b', roughness: 0.5, metalness: 0.25 }),
  window: new THREE.MeshStandardMaterial({ color: '#ffbf63', emissive: '#ff9d3c', emissiveIntensity: 1.8, roughness: 0.24, metalness: 0.12 }),
  blueLight: new THREE.MeshStandardMaterial({ color: '#78dfff', emissive: '#35b9ff', emissiveIntensity: 1.6, roughness: 0.26 }),
  greenLight: new THREE.MeshStandardMaterial({ color: '#b4f3a1', emissive: '#80db67', emissiveIntensity: 1.2, roughness: 0.4 }),
  redLight: new THREE.MeshStandardMaterial({ color: '#ffb1a1', emissive: '#ff6b4c', emissiveIntensity: 1.3, roughness: 0.4 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#68ad57', roughness: 0.88 }),
  leafLight: new THREE.MeshStandardMaterial({ color: '#b0d776', roughness: 0.83 }),
  soil: new THREE.MeshStandardMaterial({ color: '#44413f', roughness: 1 }),
}

const geometryPool = {
  box: new THREE.BoxGeometry(1, 1, 1),
  round: new RoundedBoxGeometry(1, 1, 1, 1, 0.09),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  sphere: new THREE.SphereGeometry(0.5, 20, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 12),
}

/** Static mesh compiler: merges immutable parts by material while retaining the
 * building group as a picking identity. Animated parts remain separate nodes. */
export class ModelKit {
  private slots = new Map<THREE.Material, THREE.BufferGeometry[]>()

  part(shape: Shape, size: Triple, position: Triple, material: THREE.Material, rotation: Triple = [0, 0, 0]) {
    const geometry = geometryPool[shape].clone()
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...size))
    geometry.applyMatrix4(matrix)
    this.geometry(geometry, material)
    return this
  }

  geometry(input: THREE.BufferGeometry, material: THREE.Material) {
    const geometry = input.index ? input.toNonIndexed() : input
    if (geometry !== input) input.dispose()
    const slot = this.slots.get(material) ?? []
    slot.push(geometry)
    this.slots.set(material, slot)
    return this
  }

  ring(radius: number, thickness: number, position: Triple, material: THREE.Material, rotation: Triple = [Math.PI / 2, 0, 0], arc = Math.PI * 2) {
    const geometry = new THREE.TorusGeometry(radius, thickness, 6, 40, arc)
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1)))
    return this.geometry(geometry, material)
  }

  tube(points: Triple[], radius: number, material: THREE.Material, segments = 18) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    return this.geometry(new THREE.TubeGeometry(curve, segments, radius, 7, false), material)
  }

  dome(radius: number, position: Triple, material: THREE.Material) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    geometry.translate(...position)
    return this.geometry(geometry, material)
  }

  arch(width: number, height: number, depth: number, thickness: number, position: Triple, material: THREE.Material) {
    const outline = (w: number, h: number) => {
      const s = new THREE.Shape()
      s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h * 0.68); s.lineTo(-w * 0.32, h); s.lineTo(w * 0.32, h); s.lineTo(w / 2, h * 0.68); s.lineTo(w / 2, 0); s.closePath()
      return s
    }
    const s = outline(width, height)
    const hole = outline(width - thickness * 2, height - thickness * 1.7)
    const path = new THREE.Path(hole.getPoints().reverse())
    s.holes.push(path)
    const geometry = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.035, bevelThickness: 0.035 })
    geometry.translate(...position)
    return this.geometry(geometry, material)
  }

  build() {
    const group = new THREE.Group()
    for (const [material, parts] of this.slots) {
      const merged = mergeGeometries(parts, false)!
      merged.computeBoundingBox(); merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      const emissive = material instanceof THREE.MeshStandardMaterial && material.emissiveIntensity > 0.8 && material.emissive.getHex() !== 0
      mesh.castShadow = !emissive; mesh.receiveShadow = true
      group.add(mesh)
      parts.forEach((p) => p.dispose())
    }
    this.slots.clear()
    return group
  }
}

export function addFoundation(kit: ModelKit, width: number, depth: number) {
  const M = MATERIALS
  kit.part('round', [width, 0.24, depth], [0, 0.12, 0], M.dark)
  kit.part('box', [width - 0.12, 0.08, depth - 0.12], [0, 0.27, 0], M.trim)
  for (const x of [-width / 2 + 0.18, width / 2 - 0.18]) {
    for (const z of [-depth / 2 + 0.15, depth / 2 - 0.15]) {
      kit.part('round', [0.25, 0.25, 0.32], [x, 0.23, z], M.yellow)
      kit.part('box', [0.11, 0.045, 0.19], [x, 0.37, z], M.window)
    }
  }
}

export function addDoor(kit: ModelKit, z: number, width = 1.4, height = 1.65, accent: THREE.Material = MATERIALS.yellow) {
  const M = MATERIALS
  kit.part('round', [width + 0.2, height + 0.15, 0.22], [0, height / 2 + 0.3, z], M.dark)
  kit.arch(width + 0.46, height + 0.25, 0.18, 0.19, [0, 0.28, z + 0.02], M.white)
  kit.arch(width + 0.09, height, 0.07, 0.065, [0, 0.31, z + 0.23], accent)
  for (const x of [-width / 4, width / 4]) {
    kit.part('round', [width / 2 - 0.05, height * 0.73, 0.05], [x, height * 0.46 + 0.3, z + 0.22], M.window)
    kit.part('box', [0.035, height * 0.5, 0.06], [x * 0.22, height * 0.43 + 0.3, z + 0.29], M.trim)
  }
  for (let step = 0; step < 3; step++) {
    kit.part('box', [width + 0.2, 0.09 * (3 - step), 0.32], [0, 0.045 * (3 - step), z + 0.45 + step * 0.28], M.shell)
    kit.part('box', [width + 0.06, 0.025, 0.055], [0, 0.095 * (3 - step), z + 0.58 + step * 0.28], M.yellow)
  }
}

export function addBeacon(kit: ModelKit, position: Triple, height = 0.75) {
  const M = MATERIALS
  kit.part('cylinder', [0.16, 0.1, 0.16], position, M.dark)
  kit.part('cylinder', [0.045, height, 0.045], [position[0], position[1] + height / 2, position[2]], M.trim)
  kit.part('sphere', [0.14, 0.16, 0.14], [position[0], position[1] + height, position[2]], M.redLight)
}

let panelMaterial: THREE.MeshStandardMaterial | undefined
export function panelSurface() {
  if (!panelMaterial) panelMaterial = new THREE.MeshStandardMaterial({ map: solarTexture(), color: '#bbd0ff', roughness: 0.26, metalness: 0.58, emissive: '#0b244b', emissiveIntensity: 0.22 })
  return panelMaterial
}
