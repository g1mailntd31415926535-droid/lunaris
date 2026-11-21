import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useTexture } from '@react-three/drei'
import type { TerrainLayer } from '../types'
import { demMeta } from './dem'
import { REGION_RHO_MAX, onRegionalChange, regional } from './lunar-frame'
import * as THREE from 'three'
import { MapPin } from 'lucide-react'
import { BUILDINGS } from '../data'
import { seededRandom } from './math'
import { useVisualTime } from './clock'
import { useUniverse } from './universe-context'
import { buildMoonGlobe } from './planet-geometry'
import { TERRAIN_ALBEDO, lunarAlbedoDebugGLSL } from './terrain-material'
import { BASE_ANCHOR, EARTH_POSITION, EARTH_RADIUS_KM, METRE, MOON_CENTER, MOON_RADIUS_KM, STAR_DISTANCE_KM, SUN_RADIUS_KM } from './space-config'

export function Starfield() {
  const geometry = useMemo(() => {
    const random = seededRandom(19690720), points = [], colors = [], color = new THREE.Color()
    for (let i = 0; i < 2800; i++) {
      const azimuth = random() * Math.PI * 2, polar = Math.acos(2 * random() - 1), radius = STAR_DISTANCE_KM * (1 + random() * 0.28)
      points.push(radius * Math.sin(polar) * Math.cos(azimuth), radius * Math.cos(polar), radius * Math.sin(polar) * Math.sin(azimuth))
      color.set(i % 7 === 0 ? '#cfb9ed' : i % 3 === 0 ? '#a7cfff' : '#edf0f8').multiplyScalar(0.3 + random() * 0.7)
      colors.push(color.r, color.g, color.b)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <points name="celestial:stars" geometry={geometry} frustumCulled={false}><pointsMaterial size={1.35} vertexColors sizeAttenuation={false} transparent opacity={0.86} depthWrite={false} toneMapped={false} /></points>
}

/**
 * The Moon seen from afar: NASA LOLA relief (planet-geometry.ts) with the LROC WAC colour mosaic, normalised to the
 * terrain's albedo around 75–80°S so the globe and the polar terrain have one tone. Inside ≈ 80°S the polar LOLA
 * terrain (RegionalTerrain) is drawn instead; once it is loaded this cap is not drawn and its last 3 km ring is lowered 1.5 km under it, so a pixel gap
 * between the two at the horizon shows the same NASA surface instead of space.
 */
export function MoonGlobe({ layer }: { layer: TerrainLayer }) {
  const [version, setVersion] = useState(regional.version)
  useEffect(() => onRegionalChange(() => setVersion(regional.version)), [])
  const baseHeight = demMeta()!.base.height_m
  const hasGlobal = !!regional.global, hasPolar = !!regional.grids.g2
  const geometry = useMemo(() => buildMoonGlobe(baseHeight), [baseHeight, hasGlobal, hasPolar])  // rebuilt once per arriving dataset
  const albedoFile = regional.manifest?.albedo
  const universe = useUniverse()
  const uniforms = useMemo(() => ({ uCapSink: { value: 0 }, uGame: { value: 0 }, uLunarSun: { value: universe.current.sunDirection } }), [universe])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(...TERRAIN_ALBEDO), roughness: 0.97 })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float rho; uniform float uCapSink; varying float vRho; varying vec3 vGlobeRadial;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vRho = rho; vGlobeRadial = normalize(mat3(modelViewMatrix) * (position + vec3(0.0, ${MOON_RADIUS_KM.toFixed(1)}, 0.0)));
          transformed -= normalize(transformed + vec3(0.0, ${MOON_RADIUS_KM.toFixed(1)}, 0.0)) * uCapSink * (1.0 - smoothstep(${(REGION_RHO_MAX - 15_000).toFixed(1)}, ${REGION_RHO_MAX.toFixed(1)}, rho));`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGame; uniform float uCapSink; uniform vec3 uLunarSun; varying float vRho; varying vec3 vGlobeRadial;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          // Near the pole the WAC mosaic converges into radial streaks: ease it to its own polar mean (= terrain albedo).
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${TERRAIN_ALBEDO.map((v) => v.toFixed(3)).join(', ')}), 1.0 - smoothstep(${REGION_RHO_MAX.toFixed(1)}, ${(REGION_RHO_MAX * 2.2).toFixed(1)}, vRho));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += diffuseColor.rgb * mix(vec3(0.17), vec3(0.07, 0.085, 0.12), uGame);
          // Same Game hillshade as the terrain (terrain-material.ts), so the globe and the polar terrain share one tone.
          vec3 globeUp = normalize(vGlobeRadial);
          vec3 globeHill = normalize(mat3(viewMatrix) * (normalize(vec3(uLunarSun.x, 0.0, uLunarSun.z)) * 0.643) + globeUp * 0.766);
          totalEmissiveRadiance += diffuseColor.rgb * uGame * (0.55 * max(dot(normal, globeHill), 0.0) - 0.12);`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
          // Inside the polar LOLA terrain the globe is not drawn (its 7.6 km relief would cut through deep craters).
          if (uCapSink > 0.0 && vRho < ${(REGION_RHO_MAX - 3_000).toFixed(1)}) discard;
${lunarAlbedoDebugGLSL}`)
    }
    m.customProgramCacheKey = () => 'lunaris-moon-lola-v4'
    return m
  }, [uniforms])
  useEffect(() => {
    if (!albedoFile) return
    let alive = true
    new THREE.TextureLoader().load(`/lunar/regional/${albedoFile.file}`, (texture) => {
      if (!alive) { texture.dispose(); return }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      // Exposure match only: scale the mosaic so its 75–80°S mean equals the terrain albedo.
      const mean = new THREE.Color().setRGB(...albedoFile.mean_srgb_75S_80S, THREE.SRGBColorSpace)
      material.color.setRGB(TERRAIN_ALBEDO[0] / mean.r, TERRAIN_ALBEDO[1] / mean.g, TERRAIN_ALBEDO[2] / mean.b)
      material.map = texture; material.needsUpdate = true
    }, undefined, () => console.error('LROC albedo not loaded; the globe keeps the uniform terrain albedo'))
    return () => { alive = false }
  }, [albedoFile, material])
  useFrame(() => { uniforms.uCapSink.value = regional.grids.g2 ? 1.5 : 0; uniforms.uGame.value = layer === 'game' ? 1 : 0 })
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => { material.map?.dispose(); material.dispose() }, [material])
  void version
  // Rebased to Artemis before upload: the parent is the Moon centre, the child offset cancels it exactly.
  return <mesh name="moon-surface" geometry={geometry} material={material} position={[0, MOON_RADIUS_KM, 0]} renderOrder={-2} userData={{ source: geometry.userData.source }} />
}

const atmosphereVertex = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vNormalWorld;
  varying vec3 vViewWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    vViewWorld = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }`
const atmosphereFragment = `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uSunDirection;
  varying vec3 vNormalWorld;
  varying vec3 vViewWorld;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormalWorld);
    float rim = pow(1.0 - max(0.0, dot(n, normalize(vViewWorld))), 2.4);
    float day = smoothstep(-0.15, 0.4, dot(n, normalize(uSunDirection)));
    gl_FragColor = vec4(vec3(0.13, 0.38, 0.94) * (0.32 + day * 0.7), rim * (0.08 + day * 0.42));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

export function Earth({ reducedMotion }: { reducedMotion: boolean }) {
  const [albedo, roughness, clouds] = useTexture(['/assets/procedural/earth-albedo.png', '/assets/procedural/earth-roughness.png', '/assets/procedural/earth-clouds.png'])
  albedo.colorSpace = THREE.SRGBColorSpace; roughness.colorSpace = clouds.colorSpace = THREE.NoColorSpace
  const surface = useRef<THREE.Group>(null), cloudLayer = useRef<THREE.Mesh>(null)
  const clock = useVisualTime(), universe = useUniverse()
  const uniforms = useMemo(() => ({ uSunDirection: { value: universe.current.sunDirection } }), [universe])
  useFrame(() => {
    if (surface.current) surface.current.rotation.y = -1.8 + (reducedMotion ? 0 : clock.current.time * 0.0007)
    if (cloudLayer.current) cloudLayer.current.rotation.y = 0.2 + (reducedMotion ? 0 : clock.current.time * 0.0012)
  })
  return <group name="celestial:earth" position={EARTH_POSITION}>
    <group ref={surface} rotation={[0.41, -1.8, 0.03]}>
      <mesh name="earth-surface"><sphereGeometry args={[EARTH_RADIUS_KM, 64, 40]} /><meshStandardMaterial map={albedo} roughnessMap={roughness} roughness={1} metalness={0.05} /></mesh>
      <mesh ref={cloudLayer} name="earth-clouds"><sphereGeometry args={[EARTH_RADIUS_KM * 1.012, 64, 36]} /><meshStandardMaterial color="#f3f6ff" alphaMap={clouds} transparent opacity={0.86} roughness={0.9} depthWrite={false} /></mesh>
    </group>
    <mesh name="earth-atmosphere"><sphereGeometry args={[EARTH_RADIUS_KM * 1.035, 48, 32]} /><shaderMaterial uniforms={uniforms} vertexShader={atmosphereVertex} fragmentShader={atmosphereFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>
  </group>
}

const sunVertex = `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vDirection;
  varying vec3 vViewNormal;
  void main() {
    vDirection = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`
const sunFragment = `
  #include <logdepthbuf_pars_fragment>
  uniform float uTime;
  varying vec3 vDirection;
  varying vec3 vViewNormal;
  void main() {
    #include <logdepthbuf_fragment>
    float mottling = sin(vDirection.x * 77.0 + sin(vDirection.y * 46.0)) * sin(vDirection.z * 61.0 + uTime * 0.04) * 0.12;
    float limb = 0.75 + 0.25 * max(0.0, vViewNormal.z);
    gl_FragColor = vec4(vec3(5.6 + mottling, 2.7 + mottling, 0.65) * limb, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`

export function Sun({ reducedMotion }: { reducedMotion: boolean }) {
  const root = useRef<THREE.Group>(null)
  const universe = useUniverse(), clock = useVisualTime()
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), [])
  useFrame(() => { root.current?.position.copy(universe.current.sunPosition); uniforms.uTime.value = reducedMotion ? 0 : clock.current.time })
  return <group ref={root} name="celestial:sun">
    <mesh name="sun-photosphere"><sphereGeometry args={[SUN_RADIUS_KM, 48, 32]} /><shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} uniforms={uniforms} /></mesh>
    <mesh name="sun-corona"><sphereGeometry args={[SUN_RADIUS_KM * 2.45, 32, 20]} /><meshBasicMaterial color="#ffc76d" transparent opacity={0.04} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.BackSide} /></mesh>
  </group>
}

const baseFootprintKm = 2 * METRE * Math.max(...BUILDINGS.map(({ position: [x, , z], radius }) => Math.hypot(x, z) + radius))

export function projectArtemisPin(camera: THREE.Camera, viewportHeight: number, point: THREE.Vector3) {
  point.fromArray(BASE_ANCHOR).applyMatrix4(camera.matrixWorldInverse)
  const depth = -point.z
  point.applyMatrix4(camera.projectionMatrix)
  if (depth <= 0 || Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1) return 0

  // Artemis is the Moon's +Y surface point in this scene. Fade out at its horizon.
  const horizon = THREE.MathUtils.smoothstep(camera.position.y / camera.position.length(), 0, 0.035)
  const footprintPx = baseFootprintKm * camera.projectionMatrix.elements[5] * viewportHeight / (2 * depth)
  return (1 - THREE.MathUtils.smoothstep(footprintPx, 9, 20)) * horizon
}

export function ArtemisMarker({ onFocus }: { onFocus: () => void }) {
  const marker = useRef<HTMLButtonElement>(null)
  const point = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, size }) => {
    const button = marker.current
    if (!button) return

    camera.updateMatrixWorld()
    const opacity = projectArtemisPin(camera, size.height, point)
    button.style.opacity = opacity.toFixed(3)
    button.style.visibility = opacity > 0.025 ? 'visible' : 'hidden'
  })

  return <Html position={BASE_ANCHOR} zIndexRange={[28, 12]} style={{ pointerEvents: 'none' }}>
    <button ref={marker} type="button" className="artemis-pin" aria-label="Back to Artemis Base" title="Artemis Base" onClick={onFocus}>
      <MapPin size={24} aria-hidden="true" />
    </button>
  </Html>
}

export { MOON_CENTER }
