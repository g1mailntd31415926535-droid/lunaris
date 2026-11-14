import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { Crosshair } from 'lucide-react'
import { seededRandom } from './math'
import { useVisualTime } from './clock'
import { useUniverse } from './universe-context'
import { buildMoonGlobe } from './planet-geometry'
import { EARTH_POSITION, EARTH_RADIUS_KM, MOON_CENTER, MOON_RADIUS_KM, STAR_DISTANCE_KM, SUN_RADIUS_KM } from './space-config'

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

export function MoonGlobe() {
  const geometry = useMemo(buildMoonGlobe, [])
  const [albedo, bump] = useTexture(['/assets/procedural/moon-albedo.png', '/assets/procedural/moon-bump.png'])
  albedo.colorSpace = THREE.SRGBColorSpace; albedo.anisotropy = 8
  bump.colorSpace = THREE.NoColorSpace
  const universe = useUniverse()
  const matte = useMemo(() => ({ value: 1 }), [])
  // The globe is fictional far-view relief (orbit view). Near the surface it must not pass for lunar
  // terrain next to the real NASA DEM, so it fades to the plain dark backdrop ("ngoài vùng dữ liệu NASA").
  // Its inner side, seen through the 50 km hole around the data circle, is always that backdrop.
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: albedo, bumpMap: bump, bumpScale: 0.16, color: '#ededed', roughness: 0.96, metalness: 0.015, side: THREE.DoubleSide })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uNearMatte = matte
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNearMatte;')
        .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0353, 0.0510, 0.1176), gl_FrontFacing ? uNearMatte : 1.0);')
    }
    m.customProgramCacheKey = () => 'lunaris-far-globe-matte-v1'
    return m
  }, [albedo, bump, matte])
  useFrame(() => { matte.value = 1 - THREE.MathUtils.smoothstep(Math.log(Math.max(1, universe.current.altitudeM)), Math.log(30_000), Math.log(220_000)) })
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  // This mesh is rebased to Artemis before upload. Its parent is still the real
  // Moon centre; the child offset exactly cancels that centre in CPU precision.
  return <mesh name="moon-surface" geometry={geometry} material={material} position={[0, MOON_RADIUS_KM, 0]} />
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

export function ArtemisMarker({ onFocus }: { onFocus: () => void }) {
  const label = useRef<HTMLDivElement>(null)
  const universe = useUniverse()
  useFrame(({ camera }) => {
    const h = universe.current.altitudeM
    const visible = h > 110 && camera.position.y > 0
    if (label.current) { label.current.style.opacity = visible ? '1' : '0'; label.current.style.pointerEvents = visible ? 'auto' : 'none' }
  })
  return <Html center position={[0, 0.015, 0]} zIndexRange={[28, 12]} style={{ pointerEvents: 'none' }}><div ref={label} className="artemis-marker-anchor"><button className="planet-marker" onClick={onFocus}><Crosshair size={15} /><span>ARTEMIS <small>89.9°S · TIỀN ĐỒN CỰC NAM</small></span><b>↘</b></button></div></Html>
}

export { MOON_CENTER }
