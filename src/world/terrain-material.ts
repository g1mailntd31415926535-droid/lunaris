import { useMemo } from 'react'
import { useUniverse } from './universe-context'
import { groundTexture } from './textures'

/** Uniforms shared by every terrain surface (5 m DEM, regional LOLA grids): one albedo rule, one Sun. */
export function useLunarSurface() {
  const universe = useUniverse()
  return useMemo(() => ({
    uLunarGrain: { value: groundTexture() },
    uLunarSun: { value: universe.current.sunDirection },
  }), [universe])
}

/** Mean terrain albedo (linear). The globe's LROC mosaic is normalised to this value around 75–80°S. */
export const TERRAIN_ALBEDO: [number, number, number] = [0.225, 0.228, 0.245]

export const lunarSurfaceGLSL = /* glsl */ `
  uniform sampler2D uLunarGrain;
  uniform vec3 uLunarSun;
`

/**
 * Colour of every NASA terrain surface. Needs: vLunarWorld (world km), uStyleWeight, uGame, float lunarRelief.
 * The same constant grey for both layers in NASA Layer; Game Layer adds dust grain and a warmer tone near the colony.
 * Texture only: nothing here changes a height.
 */
export const lunarTerrainColorGLSL = /* glsl */ `
  vec2 lunarXZ = vLunarWorld.xz * 1000.0;
  float fine = 0.0, dust = 0.0;
  if (uStyleWeight > 0.001) {
    fine = texture2D(uLunarGrain, lunarXZ / 14.0).g - 0.377;
    dust = texture2D(uLunarGrain, vec2(0.31, 0.19) + lunarXZ / 108.0).g - 0.377;
  }
  float broad = texture2D(uLunarGrain, vec2(0.43, 0.73) + lunarXZ / 5400.0).g - 0.377;
  float weathering = (broad * 0.8 + (fine * 0.60 + dust) * uStyleWeight) * uGame;
  float colonyTone = (1.0 - smoothstep(80.0, 1400.0, length(lunarXZ))) * uGame;
  vec3 baseColor = mix(vec3(${TERRAIN_ALBEDO.map((v) => v.toFixed(3)).join(', ')}), vec3(0.236, 0.209, 0.300), colonyTone);
  diffuseColor.rgb = baseColor * clamp(1.0 + weathering * 1.15 + lunarRelief * 0.07 * uGame, 0.6, 1.35);
  float viewRange = length(vViewPosition);
  float distant = smoothstep(16.0, 90.0, viewRange);
`

/** Lighting normal and emissive terms shared by the DEM and the regional grids (shading only, never geometry). */
export const lunarTerrainShadeGLSL = /* glsl */ `
  vec3 lunarUp = mat3(viewMatrix) * normalize(vLunarRadial);
  vec3 vertical = lunarUp * dot(normal, lunarUp);
  // Game: the lighting normal of a vertically exaggerated surface. Vertices and queries keep their NASA heights.
  normal = normalize(vertical + (normal - vertical) * mix(1.0, mix(1.8, 1.35, distant), uGame));
  vec3 bdx = dFdx(-vViewPosition), bdy = dFdy(-vViewPosition);
  vec3 btx = cross(bdy, normal), bty = cross(normal, bdx);
  float footprint = dot(bdx, btx);
  float bump = (fine * 0.08 + dust * 0.51) * 0.001 * uStyleWeight * uGame;
  vec3 bumpGradient = sign(footprint) * (dFdx(bump) * btx + dFdy(bump) * bty);
  normal = normalize(max(abs(footprint), 1e-15) * normal - bumpGradient);
  totalEmissiveRadiance += diffuseColor.rgb * mix(vec3(0.17), vec3(0.07, 0.085, 0.12), uGame);
  // Game: cartographic hillshade from the Sun's azimuth raised to 50 deg, so relief reads in a top-down view.
  vec3 lunarHillWorld = normalize(vec3(uLunarSun.x, 0.0, uLunarSun.z)) * 0.643 + normalize(vLunarRadial) * 0.766;
  float lunarHill = dot(normal, normalize(mat3(viewMatrix) * lunarHillWorld));
  totalEmissiveRadiance += diffuseColor.rgb * uGame * (0.55 * max(lunarHill, 0.0) - 0.12);
`

/** Debug view "albedo only" (scripts/terrain/seamless_views.mjs): colour without any lighting. */
export const lunarAlbedoDebugGLSL = /* glsl */ `
  #ifdef LUNARIS_ALBEDO_ONLY
    gl_FragColor = vec4(diffuseColor.rgb, 1.0);
  #endif
`
