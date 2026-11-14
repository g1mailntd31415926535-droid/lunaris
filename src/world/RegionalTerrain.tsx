import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TerrainLayer } from '../types'
import { demMeta } from './dem'
import { BASE_XY, MOON_R, PLANAR_R0, PLANAR_R1, REGION_RHO_MAX, SCENE_FROM_BODY, onRegionalChange, regional, regionalPending, sphereWeight } from './lunar-frame'
import type { Grid } from './lunar-frame'
import { lunarAlbedoDebugGLSL, lunarSurfaceGLSL, lunarTerrainColorGLSL, lunarTerrainShadeGLSL, useLunarSurface } from './terrain-material'
import { useUniverse } from './universe-context'
import { METRE } from './space-config'

/**
 * NASA LOLA surface AROUND (and in the NoData gaps of) the 5 m DEM: one continuous terrain from the colony out to
 * ≈ 80°S, where the LDEM_4 globe takes over.
 *
 * Geometry is CDLOD (Strugar 2009): a quadtree over the stereographic plane, each visible node drawn as an instanced
 * 16 × 16 grid whose heights come from the 40 / 160 / 480 m LOLA grids in the vertex shader. Odd vertices morph onto
 * the next coarser grid before a node changes level, so neighbouring levels share their edges exactly: no cracks,
 * no popping, no skirts. Lighting normals are taken per pixel from the same grids.
 *
 * Where the 5 m DEM exists this surface is lowered 30 m (only ≥ 150–400 m inside the 5 m data, which the DEM always
 * covers there) and pushed 0.2 % back in depth, so the 5 m data is what you see wherever it exists.
 */

const GRID = 16
const LEAF = 640                        // m; leaf node = 16 cells of 40 m (the finest LOLA grid)
const LODS = 11
const ROOT = LEAF * 2 ** (LODS - 1)     // 655 360 m
const ROOT_MIN = -ROOT / 2
const MAX_NODES = 1200
const RANGE_FACTOR = { high: 2.6, balanced: 2.0 }
const MINMAX_LOD = 4                    // height bounds stored per 10.24 km node and up

export const regionalStats = { nodes: 0, triangles: 0, grids: '', pending: 0, failed: '' }

const regionalGLSL = /* glsl */ `
  uniform highp sampler2D uG0; uniform highp sampler2D uG1; uniform highp sampler2D uG2;
  uniform vec4 uG0Info; uniform vec4 uG1Info; uniform vec4 uG2Info;   // x0, y0, spacing, cols
  uniform vec2 uGridReady;                                             // g0, g1 loaded
  uniform vec4 uFrame;                                                 // X_base, Y_base, h_base
  uniform mat3 uSceneFromBody;
  const float LUNAR_R = ${MOON_R.toFixed(1)};

  float lunarFetch(highp sampler2D s, ivec2 p, int n) { return texelFetch(s, clamp(p, ivec2(0), ivec2(n - 1)), 0).r; }
  float lunarGridHeight(highp sampler2D s, vec4 info, vec2 XY) {
    vec2 g = vec2(XY.x - info.x, info.y - XY.y) / info.z, i = floor(g), f = g - i;
    ivec2 p = ivec2(i); int n = int(info.w);
    return mix(mix(lunarFetch(s, p, n), lunarFetch(s, p + ivec2(1, 0), n), f.x),
               mix(lunarFetch(s, p + ivec2(0, 1), n), lunarFetch(s, p + ivec2(1, 1), n), f.x), f.y);
  }
  // Height and smooth gradient (central differences at the four corners, interpolated): xyz = h, dh/dX, dh/dY.
  vec3 lunarGridSlope(highp sampler2D s, vec4 info, vec2 XY) {
    vec2 g = vec2(XY.x - info.x, info.y - XY.y) / info.z, i = floor(g), f = g - i;
    ivec2 p = ivec2(i); int n = int(info.w);
    float h[16];
    for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) h[y * 4 + x] = lunarFetch(s, p + ivec2(x - 1, y - 1), n);
    float height = mix(mix(h[5], h[6], f.x), mix(h[9], h[10], f.x), f.y);
    float gx = mix(mix(h[6] - h[4], h[7] - h[5], f.x), mix(h[10] - h[8], h[11] - h[9], f.x), f.y) * 0.5;
    float gy = mix(mix(h[9] - h[1], h[10] - h[2], f.x), mix(h[13] - h[5], h[14] - h[6], f.x), f.y) * 0.5;
    return vec3(height, gx / info.z, -gy / info.z);
  }
  float lunarGridWeight(vec4 info, vec2 XY, float fade) {
    float size = (info.w - 1.0) * info.z;
    float inside = min(min(XY.x - info.x, info.x + size - XY.x), min(XY.y - (info.y - size), info.y - XY.y)) - info.z;
    return smoothstep(0.0, fade, inside);
  }
  float regionalHeight(vec2 XY) {
    float h = lunarGridHeight(uG2, uG2Info, XY);
    float w1 = uGridReady.y * lunarGridWeight(uG1Info, XY, 10000.0);
    if (w1 > 0.0) h = mix(h, lunarGridHeight(uG1, uG1Info, XY), w1);
    float w0 = uGridReady.x * lunarGridWeight(uG0Info, XY, 3000.0);
    if (w0 > 0.0) h = mix(h, lunarGridHeight(uG0, uG0Info, XY), w0);
    return h;
  }
  vec3 regionalSlope(vec2 XY) {
    vec3 s = lunarGridSlope(uG2, uG2Info, XY);
    float w1 = uGridReady.y * lunarGridWeight(uG1Info, XY, 10000.0);
    if (w1 > 0.0) s = mix(s, lunarGridSlope(uG1, uG1Info, XY), w1);
    float w0 = uGridReady.x * lunarGridWeight(uG0Info, XY, 3000.0);
    if (w0 > 0.0) s = mix(s, lunarGridSlope(uG0, uG0Info, XY), w0);
    return s;
  }
  // Same rule as lunar-frame.ts displayPosition(): planar near BASE (like the 5 m DEM), the true sphere far away.
  vec3 regionalDisplay(vec2 XY, float h, out vec3 radial, out float sphere) {
    vec2 local = vec2(XY.x - uFrame.x, uFrame.y - XY.y);
    vec3 p = vec3(local.x, h - uFrame.z, local.y);
    radial = vec3(0.0, 1.0, 0.0);
    sphere = smoothstep(${PLANAR_R0.toFixed(1)}, ${PLANAR_R1.toFixed(1)}, length(local));
    if (sphere > 0.0) {
      float rho = length(XY), c = 2.0 * atan(rho / (2.0 * LUNAR_R)), s = sin(c);
      vec3 d = uSceneFromBody * (rho > 0.0 ? vec3(s * XY.y / rho, s * XY.x / rho, -cos(c)) : vec3(0.0, 0.0, -1.0));
      p = mix(p, d * (LUNAR_R + h - uFrame.z) - vec3(0.0, LUNAR_R, 0.0), sphere);
      radial = normalize(mix(radial, d, sphere));
    }
    return p;
  }
`

function floatTexture(grid: Grid | null) {
  const texture = grid
    ? new THREE.DataTexture(grid.heights, grid.info.cols, grid.info.rows, THREE.RedFormat, THREE.FloatType)
    : new THREE.DataTexture(new Float32Array(1), 1, 1, THREE.RedFormat, THREE.FloatType)
  texture.magFilter = texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
const gridInfo = (grid: Grid | null) => grid ? new THREE.Vector4(grid.info.x0, grid.info.y0, grid.info.spacing_m, grid.info.cols) : new THREE.Vector4(0, 0, 1, 1)

function patchGeometry(cells: number) {
  const geometry = new THREE.InstancedBufferGeometry()
  const positions: number[] = [], indices: number[] = []
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) positions.push(i, 0, j)
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1
    indices.push(a, b, d, a, d, c)
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  const node = new THREE.InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4)
  node.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('aNode', node)
  geometry.instanceCount = 0
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9)
  return geometry
}

/** Min/max LOLA height (m) of every quadtree node from MINMAX_LOD up, from the 480 m polar grid. */
function heightBounds(g2: Grid) {
  const levels: { min: Float32Array; max: Float32Array; n: number }[] = []
  const n = 2 ** (LODS - 1 - MINMAX_LOD), size = ROOT / n
  const min = new Float32Array(n * n).fill(Infinity), max = new Float32Array(n * n).fill(-Infinity)
  const { cols, rows, x0, y0, spacing_m: d } = g2.info
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const h = g2.heights[j * cols + i]
    if (!Number.isFinite(h)) continue
    const X = x0 + i * d, Y = y0 - j * d
    const nx = Math.floor((X - ROOT_MIN) / size), ny = Math.floor((Y - ROOT_MIN) / size)
    for (const [ax, ay] of [[nx, ny], [Math.floor((X - d / 2 - ROOT_MIN) / size), Math.floor((Y - d / 2 - ROOT_MIN) / size)], [Math.floor((X + d / 2 - ROOT_MIN) / size), Math.floor((Y + d / 2 - ROOT_MIN) / size)]]) {
      if (ax < 0 || ay < 0 || ax >= n || ay >= n) continue
      const k = ay * n + ax
      if (h < min[k]) min[k] = h
      if (h > max[k]) max[k] = h
    }
  }
  levels[MINMAX_LOD] = { min, max, n }
  for (let lod = MINMAX_LOD + 1; lod < LODS; lod++) {
    const below = levels[lod - 1], m = below.n / 2
    const mn = new Float32Array(m * m).fill(Infinity), mx = new Float32Array(m * m).fill(-Infinity)
    for (let y = 0; y < below.n; y++) for (let x = 0; x < below.n; x++) {
      const k = (y >> 1) * m + (x >> 1)
      mn[k] = Math.min(mn[k], below.min[y * below.n + x]); mx[k] = Math.max(mx[k], below.max[y * below.n + x])
    }
    levels[lod] = { min: mn, max: mx, n: m }
  }
  return levels
}

export function RegionalTerrain({ quality, layer }: { quality: 'high' | 'balanced'; layer: TerrainLayer }) {
  const universe = useUniverse()
  const lunarSurface = useLunarSurface()
  const [version, setVersion] = useState(regional.version)
  useEffect(() => onRegionalChange(() => setVersion(regional.version)), [])
  const baseHeight = demMeta()!.base.height_m

  const uniforms = useMemo(() => {
    const matrix = new THREE.Matrix3().set(...(SCENE_FROM_BODY as [number, number, number, number, number, number, number, number, number]))
    return {
      uStyleWeight: { value: 1 }, uGame: { value: 0 },
      uG0: { value: floatTexture(null) }, uG1: { value: floatTexture(null) }, uG2: { value: floatTexture(null) },
      uG0Info: { value: gridInfo(null) }, uG1Info: { value: gridInfo(null) }, uG2Info: { value: gridInfo(null) },
      uGridReady: { value: new THREE.Vector2(0, 0) },
      uCoverage: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RedFormat, THREE.UnsignedByteType) },
      uCoverageReady: { value: 0 },
      uFrame: { value: new THREE.Vector4(BASE_XY[0], BASE_XY[1], baseHeight, 0) },
      uSceneFromBody: { value: matrix },
      uCameraLocal: { value: new THREE.Vector3() },
      uRootMin: { value: new THREE.Vector2(ROOT_MIN, ROOT_MIN) },
      uMorph: { value: Array.from({ length: LODS }, () => new THREE.Vector2(1e9, 2e9)) },
      ...lunarSurface,
    }
  }, [lunarSurface, baseHeight])

  // Upload each grid once when it arrives (progressive loading: 480 m → 160 m → 40 m).
  const uploaded = useRef({ g0: false, g1: false, g2: false, coverage: false })
  useEffect(() => {
    const u = uniforms, done = uploaded.current
    for (const name of ['g0', 'g1', 'g2'] as const) {
      const grid = regional.grids[name]
      if (!grid || done[name]) continue
      done[name] = true
      const key = name === 'g0' ? 'uG0' : name === 'g1' ? 'uG1' : 'uG2'
      u[key].value.dispose(); u[key].value = floatTexture(grid)
      u[`${key}Info` as 'uG0Info'].value = gridInfo(grid)
    }
    u.uGridReady.value.set(done.g0 ? 1 : 0, done.g1 ? 1 : 0)
    const g0 = regional.grids.g0
    if (g0 && regional.coverageDistance && !done.coverage) {
      done.coverage = true
      const t = new THREE.DataTexture(regional.coverageDistance, g0.info.cols, g0.info.rows, THREE.RedFormat, THREE.UnsignedByteType)
      t.magFilter = t.minFilter = THREE.NearestFilter; t.unpackAlignment = 1; t.generateMipmaps = false; t.needsUpdate = true
      u.uCoverage.value.dispose(); u.uCoverage.value = t; u.uCoverageReady.value = 1
    }
  }, [version, uniforms])
  useEffect(() => () => { for (const k of ['uG0', 'uG1', 'uG2', 'uCoverage'] as const) uniforms[k].value.dispose() }, [uniforms])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.98, side: THREE.DoubleSide })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          ${regionalGLSL}
          attribute vec4 aNode;            // node min X, min Y, vertex spacing (m), LOD
          uniform vec3 uCameraLocal; uniform vec2 uRootMin; uniform vec2 uMorph[${LODS}];
          uniform sampler2D uCoverage; uniform float uCoverageReady;
          varying vec2 vLunarXY; varying vec3 vLunarRadial; varying vec3 vLunarWorld;`)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace('#include <begin_vertex>', `
          vec2 XY = aNode.xy + position.xz * aNode.z;
          vec3 radial; float sphere;
          vec3 first = regionalDisplay(XY, regionalHeight(XY), radial, sphere);
          vec2 morph = uMorph[int(aNode.w + 0.5)];
          float k = clamp((distance(first, uCameraLocal) - morph.x) / (morph.y - morph.x), 0.0, 1.0);
          vec2 cell = floor((XY - uRootMin) / aNode.z + 0.5);
          XY -= (cell - 2.0 * floor(cell * 0.5)) * aNode.z * k;      // odd vertices slide onto the coarser grid
          float h = regionalHeight(XY);
          if (uCoverageReady > 0.5) {
            vec2 g = vec2(XY.x - uG0Info.x, uG0Info.y - XY.y) / uG0Info.z;
            ivec2 p = ivec2(floor(g + 0.5));
            float inside5m = (p.x >= 0 && p.y >= 0 && p.x < int(uG0Info.w) && p.y < int(uG0Info.w)) ? texelFetch(uCoverage, p, 0).r * 2550.0 : 0.0;
            h -= 30.0 * smoothstep(150.0, 400.0, inside5m);
          }
          vec3 transformed = regionalDisplay(XY, h, radial, sphere);
          vLunarXY = XY; vLunarRadial = radial;`)
        .replace('#include <project_vertex>', '#include <project_vertex>\nvLunarWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          ${regionalGLSL}
          ${lunarSurfaceGLSL}
          uniform float uStyleWeight; uniform float uGame;
          varying vec2 vLunarXY; varying vec3 vLunarRadial; varying vec3 vLunarWorld;`)
        .replace('#include <logdepthbuf_fragment>', `
          #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
            // 0.2 % farther than it is: where the 5 m DEM and this surface coincide, the 5 m DEM wins.
            gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth * 1.002 ) * logDepthBufFC * 0.5;
          #endif
          if (length(vLunarXY) > ${(REGION_RHO_MAX + 1000).toFixed(1)}) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float lunarRelief = 0.0;
          ${lunarTerrainColorGLSL}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 lunarSlope = regionalSlope(vLunarXY);
          // Towards the globe (≈ 80°S) the lighting detail eases to the globe's scale (8 km slopes of the same LOLA
          // heights), so the change from 480 m to the 7.6 km globe is a gradient, not a circle. Shading only.
          float lunarOuter = smoothstep(${(REGION_RHO_MAX - 110_000).toFixed(1)}, ${(REGION_RHO_MAX - 5_000).toFixed(1)}, length(vLunarXY));
          if (lunarOuter > 0.0) {
            vec2 coarse = vec2(regionalHeight(vLunarXY + vec2(4000.0, 0.0)) - regionalHeight(vLunarXY - vec2(4000.0, 0.0)),
                               regionalHeight(vLunarXY + vec2(0.0, 4000.0)) - regionalHeight(vLunarXY - vec2(0.0, 4000.0))) / 8000.0;
            lunarSlope.yz = mix(lunarSlope.yz, coarse, lunarOuter);
          }
          vec3 lunarPlanarNormal = normalize(vec3(-lunarSlope.y, 1.0, lunarSlope.z));
          vec3 lunarR = normalize(vLunarRadial), lunarAxis = vec3(lunarR.z, 0.0, -lunarR.x);
          vec3 lunarNormalWorld = lunarPlanarNormal * lunarR.y + cross(lunarAxis, lunarPlanarNormal) + lunarAxis * dot(lunarAxis, lunarPlanarNormal) / (1.0 + lunarR.y);
          normal = normalize(mat3(viewMatrix) * lunarNormalWorld);
          ${lunarTerrainShadeGLSL}`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
          ${lunarAlbedoDebugGLSL}`)
    }
    m.customProgramCacheKey = () => 'lunaris-regional-lola-v2'
    return m
  }, [uniforms])

  const meshes = useMemo(() => [GRID, GRID / 2].map((cells) => {
    const mesh = new THREE.Mesh(patchGeometry(cells), material)
    mesh.name = cells === GRID ? 'regional-terrain-full' : 'regional-terrain-quarter'
    mesh.frustumCulled = false
    mesh.layers.set(1)
    mesh.renderOrder = -1
    mesh.visible = false
    mesh.userData = { source: 'NASA LOLA 40/160/480 m (PGDA south pole DEMs)', procedural: false }
    return mesh
  }), [material])
  useEffect(() => () => { material.dispose(); for (const m of meshes) m.geometry.dispose() }, [material, meshes])

  const g2 = version >= 0 ? regional.grids.g2 : null   // re-read after each progressive load
  const bounds = useMemo(() => g2 ? heightBounds(g2) : null, [g2])
  const scratch = useMemo(() => ({ frustum: new THREE.Frustum(), matrix: new THREE.Matrix4(), sphere: new THREE.Sphere() }), [])

  useFrame(({ camera }) => {
    const u = universe.current
    uniforms.uStyleWeight.value = u.styleDetail
    uniforms.uGame.value = layer === 'game' ? 1 : 0
    regionalStats.pending = regionalPending()
    regionalStats.grids = (['g0', 'g1', 'g2'] as const).filter((g) => regional.grids[g]).join(',') + (regional.global ? ',ldem_4' : '')
    regionalStats.failed = regional.failed.join(',')
    if (!bounds) { for (const m of meshes) m.visible = false; return }

    const cx = camera.position.x / METRE, cy = camera.position.y / METRE, cz = camera.position.z / METRE
    uniforms.uCameraLocal.value.set(cx, cy, cz)
    camera.updateMatrixWorld()
    scratch.frustum.setFromProjectionMatrix(scratch.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    const factor = RANGE_FACTOR[quality]
    const ranges = Array.from({ length: LODS }, (_, l) => LEAF * factor * 2 ** l)
    for (let l = 0; l < LODS; l++) {
      const end = ranges[l], start = end - 0.35 * (end - (l ? ranges[l - 1] : 0))
      uniforms.uMorph.value[l].set(start, end)
    }

    const full = meshes[0].geometry.getAttribute('aNode') as THREE.InstancedBufferAttribute
    const quarter = meshes[1].geometry.getAttribute('aNode') as THREE.InstancedBufferAttribute
    let nFull = 0, nQuarter = 0
    const box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 }
    const nodeBox = (X0: number, Y0: number, size: number, lod: number) => {
      const b = bounds[Math.max(lod, MINMAX_LOD)], s = ROOT / b.n
      const k = Math.floor((Y0 + size / 2 - ROOT_MIN) / s) * b.n + Math.floor((X0 + size / 2 - ROOT_MIN) / s)
      let hmin = b.min[k], hmax = b.max[k]
      if (!Number.isFinite(hmin)) { hmin = -9000; hmax = 9000 }
      box.x0 = X0 - BASE_XY[0]; box.x1 = box.x0 + size
      box.z0 = BASE_XY[1] - (Y0 + size); box.z1 = box.z0 + size
      const rNear = Math.hypot(Math.max(box.x0, 0, -box.x1), Math.max(box.z0, 0, -box.z1)), rFar = Math.hypot(Math.max(Math.abs(box.x0), Math.abs(box.x1)), Math.max(Math.abs(box.z0), Math.abs(box.z1)))
      const drop = (r: number) => sphereWeight(r) * r * r / (2 * MOON_R)
      box.y0 = hmin - baseHeight - drop(rFar); box.y1 = hmax - baseHeight - drop(rNear)
    }
    const distance = () => Math.hypot(Math.max(box.x0 - cx, 0, cx - box.x1), Math.max(box.y0 - cy, 0, cy - box.y1), Math.max(box.z0 - cz, 0, cz - box.z1))
    const visible = () => {
      scratch.sphere.center.set((box.x0 + box.x1) / 2 * METRE, (box.y0 + box.y1) / 2 * METRE, (box.z0 + box.z1) / 2 * METRE)
      scratch.sphere.radius = Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) * 0.55 * METRE
      return scratch.frustum.intersectsSphere(scratch.sphere)
    }
    const add = (target: 'full' | 'quarter', X0: number, Y0: number, lod: number) => {
      const spacing = LEAF * 2 ** lod / GRID
      if (target === 'full' && nFull < MAX_NODES) full.setXYZW(nFull++, X0, Y0, spacing, lod)
      else if (target === 'quarter' && nQuarter < MAX_NODES) quarter.setXYZW(nQuarter++, X0, Y0, spacing, lod)
    }
    // Strugar's selection: a node is replaced by its children only inside the next finer LOD range;
    // children that are not selected are drawn as a quarter of the parent at the parent's resolution.
    const select = (X0: number, Y0: number, lod: number): boolean => {
      const size = LEAF * 2 ** lod
      const nx = Math.max(X0, Math.min(0, X0 + size)), ny = Math.max(Y0, Math.min(0, Y0 + size))
      if (Math.hypot(nx, ny) > REGION_RHO_MAX + 2_000) return true          // beyond the polar grids: the globe
      nodeBox(X0, Y0, size, lod)
      if (distance() > ranges[lod]) return false
      if (!visible()) return true
      if (lod === 0) { add('full', X0, Y0, 0); return true }
      if (distance() > ranges[lod - 1]) { add('full', X0, Y0, lod); return true }
      const half = size / 2
      for (const [dx, dy] of [[0, 0], [half, 0], [0, half], [half, half]]) {
        if (!select(X0 + dx, Y0 + dy, lod - 1)) {
          nodeBox(X0 + dx, Y0 + dy, half, lod - 1)
          if (visible()) add('quarter', X0 + dx, Y0 + dy, lod)
        }
      }
      return true
    }
    if (!select(ROOT_MIN, ROOT_MIN, LODS - 1)) add('full', ROOT_MIN, ROOT_MIN, LODS - 1)

    full.needsUpdate = true; quarter.needsUpdate = true
    full.clearUpdateRanges(); full.addUpdateRange(0, nFull * 4)
    quarter.clearUpdateRanges(); quarter.addUpdateRange(0, nQuarter * 4)
    meshes[0].geometry.instanceCount = nFull; meshes[1].geometry.instanceCount = nQuarter
    meshes[0].visible = nFull > 0; meshes[1].visible = nQuarter > 0
    regionalStats.nodes = nFull + nQuarter
    regionalStats.triangles = nFull * GRID * GRID * 2 + nQuarter * (GRID / 2) * (GRID / 2) * 2
  })

  return <group name="regional-terrain" userData={{ source: 'NASA LOLA (PGDA south pole 40/80/240 m DEMs)', procedural: false }}>
    {meshes.map((m) => <primitive key={m.name} object={m} />)}
  </group>
}
