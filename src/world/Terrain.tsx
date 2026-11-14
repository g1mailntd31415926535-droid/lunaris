import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { screenTexture } from './textures'
import { heightAt } from './terrain-field'
import { ROCK_PLACEMENTS } from './rock-plan'
import { ModelKit, MATERIALS as M } from './model-kit'
import { createLampModel } from './models'

// Decorative rocks: ILLUSTRATIVE_RECONSTRUCTION ("chi tiết minh họa tái dựng"), not objects measured by NASA.
// They sit on the real DEM surface but add no terrain, no collision and no slope data.
function Rocks() {
  const small = useRef<THREE.InstancedMesh>(null)
  const large = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 0)
    const p = g.getAttribute('position')
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.75)
    g.computeVertexNormals()
    return g
  }, [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9792aa', roughness: 0.96, flatShading: true }), [])
  useEffect(() => {
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), euler = new THREE.Euler(), color = new THREE.Color()
    const place = (mesh: THREE.InstancedMesh, count: number, big: boolean) => {
      for (let i = 0; i < count; i++) {
        const rock = ROCK_PLACEMENTS[(big ? 550 : 0) + i], { x, z, size } = rock
        euler.set(...rock.rotation)
        q.setFromEuler(euler)
        matrix.compose(new THREE.Vector3(x, heightAt(x, z) + size * 0.4, z), q, new THREE.Vector3(...rock.scale))
        mesh.setMatrixAt(i, matrix)
        color.set('#b0a5bd').multiplyScalar(rock.shade)
        mesh.setColorAt(i, color)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    place(small.current!, 550, false); place(large.current!, 55, true)
    return () => { geometry.dispose(); material.dispose() }
  }, [geometry, material])
  return <group name="illustrative-rocks" userData={{ provenance: 'ILLUSTRATIVE_RECONSTRUCTION', label: 'chi tiết minh họa tái dựng' }}><instancedMesh ref={small} args={[geometry, material, 550]} castShadow receiveShadow /><instancedMesh ref={large} args={[geometry, material, 55]} castShadow receiveShadow /></group>
}

function SettlementDetails() {
  const model = useMemo(() => {
    const kit = new ModelKit()
    // Short, pressurized connectors use a single material compiler.
    kit.tube([[-3.22, 0.88, -2.0], [-4.2, 0.88, -2], [-5.35, 0.76, -2]], 0.49, M.shell)
    kit.tube([[1.5, 0.83, -2.7], [2.7, 0.83, -3.8], [4.2, 0.69, -5.2]], 0.43, M.shell)
    for (let i = 0; i < 5; i++) {
      kit.ring(0.49, 0.045, [-3.2 - i * 0.48, 0.88, -2.0], M.trim, [0, Math.PI / 2, 0])
      kit.part('box', [0.27, 0.2, 0.05], [-3.38 - i * 0.42, 1.01, -1.51], M.window)
    }
    // Ground pathways are authored UI/environment decoration.
    const roads: [number, number, number, number][] = [[-8.1, -0.7, -2.9, 1.7], [-0.8, 1.7, -1.2, 4.2], [-2.7, 3.9, -4.8, 5.9], [2.1, 2.2, 5.8, 3.2], [-3.8, 10.2, 6.6, 10.2]]
    for (const [x1, z1, x2, z2] of roads) {
      const length = Math.hypot(x2 - x1, z2 - z1), angle = Math.atan2(x2 - x1, z2 - z1)
      for (let i = 0; i < length / 0.67; i++) {
        const t = i * 0.67 / length, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t
        kit.part('box', [0.055, 0.018, 0.29], [x, heightAt(x, z) + 0.028, z], M.shell, [0, angle, 0])
      }
    }
    const lamps = [[-12.1, -1.8], [-11.1, 3.1], [-10.5, 8.5], [-7.5, 10.6], [-2.6, 3.5], [3.7, 3.3], [5.3, 10.2], [11.7, 9.8], [11.4, 3.8], [7.9, -3.0], [-5.5, -6.6], [-1.5, -6.5]]
    const lamp = createLampModel()
    for (const [x, z] of lamps) {
      for (const child of lamp.children) {
        const mesh = child as THREE.Mesh
        const g = mesh.geometry.clone(); g.translate(x, heightAt(x, z), z)
        kit.geometry(g, mesh.material as THREE.Material)
      }
    }
    lamp.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() })
    // Cargo stacks and a small landing pad supply scale and lived-in detail.
    for (const [x, z, count] of [[-5.8, -4.7, 3], [11.1, 7.0, 4], [-10.2, 1.4, 2], [4.6, -7.0, 2]]) {
      for (let i = 0; i < count; i++) {
        const xx = x + (i % 2) * 0.59, yy = 0.32 + Math.floor(i / 2) * 0.57
        kit.part('round', [0.54, 0.53, 0.55], [xx, yy, z], i % 3 ? M.trim : M.yellow)
        kit.part('box', [0.43, 0.055, 0.025], [xx, yy + 0.08, z + 0.29], M.shell)
      }
    }
    kit.part('cylinder', [4.1, 0.045, 4.1], [-11.7, 0.034, 7.8], M.dark)
    kit.ring(1.95, 0.036, [-11.7, 0.07, 7.8], M.yellow)
    kit.ring(1.58, 0.025, [-11.7, 0.07, 7.8], M.trim)
    kit.part('box', [0.9, 0.014, 0.14], [-11.7, 0.08, 8.0], M.shell)
    kit.part('box', [0.15, 0.014, 0.9], [-12.075, 0.08, 7.68], M.shell)
    // Bright ice-like crystals are decorative, not a claim about a real deposit.
    for (let i = 0; i < 8; i++) {
      const x = -15 + Math.sin(i * 2.1) * 1.0, z = 14 + Math.cos(i * 2.1) * 0.9
      const h = 0.3 + (i % 3) * 0.26
      kit.part('cone', [0.3, h, 0.3], [x, heightAt(x, z) + h / 2, z], M.blueLight, [0.2, i, 0.14])
    }
    return kit.build()
  }, [])
  useEffect(() => () => { model.traverse((node) => { if (node instanceof THREE.Mesh) node.geometry.dispose() }) }, [model])
  return <primitive object={model} />
}

export function ColonyDecorations() {
  const badge = useMemo(() => screenTexture('command', '#cfb9ff'), [])
  return <group name="colony-decoration">
    <Rocks />
    <SettlementDetails />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-11.7, 0.081, 7.8]}><planeGeometry args={[1.15, 1.15]} /><meshBasicMaterial map={badge} transparent opacity={0.65} /></mesh>
  </group>
}
