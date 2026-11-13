// Procedural facade material: windows, mullions, spandrels and night lighting are computed in the
// fragment shader from per-vertex style attributes, so walls stay crisp at any zoom without textures.
import * as THREE from 'three';

export function makeFacadeMaterial(M) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 1.0 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = M.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aStyle;
attribute vec4 aParam;
attribute vec3 aGlass;
varying vec4 vStyle;
varying vec4 vParam;
varying vec3 vGlass;
varying vec2 vFuv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vStyle = aStyle; vParam = aParam; vGlass = aGlass; vFuv = uv;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight;
varying vec4 vStyle;
varying vec4 vParam;
varying vec3 vGlass;
varying vec2 vFuv;
float fHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float fBox(float x, float a, float b, float w) {
  return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x));
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float fRough = 0.85;
float fMetal = 0.0;
vec3 fEmit = vec3(0.0);
float fGlassMask = 0.0;
vec2 fCell = vec2(0.0);
{
  float style = floor(vStyle.x + 0.5);
  vec2 cuv = vec2(vFuv.x / vStyle.y, vFuv.y / vStyle.z);
  vec2 id = floor(cuv);
  vec2 f = fract(cuv);
  vec2 fw = fwidth(cuv) * 0.8 + 1e-4;
  // fade pattern contrast when cells get smaller than a pixel
  float fade = clamp(1.6 - max(fw.x, fw.y) * 1.4, 0.0, 1.0);
  float seed = vStyle.w;
  float r1 = fHash(id + seed);
  float r2 = fHash(id * 1.7 + seed + 3.1);
  float rFloor = fHash(vec2(id.y * 0.37, seed));
  vec3 wall = diffuseColor.rgb;
  vec3 glassC = vGlass;
  float win = 0.0;
  vec3 col = wall;
  float blinds = step(0.8, fHash(id * 2.3 + seed + 9.7));
  if (style < 0.5) {
    // curtain wall
    float gx = fBox(f.x, vParam.x, 1.0 - vParam.x, fw.x);
    float gy = fBox(f.y, vParam.y, 0.985, fw.y);
    win = gx * gy;
    float spanMask = gx * (1.0 - gy);
    vec3 span = mix(glassC * 0.5, wall, vParam.z);
    col = mix(wall, span, spanMask);
    col = mix(col, glassC * (0.7 + 0.45 * r1), win);
    fRough = mix(mix(0.6, 0.3, spanMask * (1.0 - vParam.z)), 0.06 + 0.1 * r2, win);
    fMetal = mix(mix(0.35, 0.7, spanMask * (1.0 - vParam.z)), 0.93, win);
  } else if (style < 1.5) {
    // ribbon windows
    float gy = fBox(f.y, vParam.z, vParam.z + vParam.y, fw.y);
    float gx = fBox(f.x, 0.03, 0.97, fw.x);
    win = gy * gx;
    col = mix(wall, glassC * (0.68 + 0.45 * r1), win);
    fRough = mix(0.86, 0.08 + 0.1 * r2, win);
    fMetal = mix(0.0, 0.9, win);
  } else if (style < 2.5) {
    // punched windows in masonry
    float ww = vParam.x, wh = vParam.y, y0 = vParam.z;
    float gx = fBox(f.x, 0.5 - ww * 0.5, 0.5 + ww * 0.5, fw.x);
    float gy = fBox(f.y, y0, y0 + wh, fw.y);
    win = gx * gy;
    float sill = fBox(f.x, 0.5 - ww * 0.62, 0.5 + ww * 0.62, fw.x) * fBox(f.y, y0 - 0.07, y0, fw.y);
    float course = fHash(vec2(floor(vFuv.y * 1.6), seed));
    col = wall * (0.93 + 0.12 * course);
    col = mix(col, wall * 1.28, sill * 0.55);
    col = mix(col, glassC * (0.55 + 0.5 * r1), win);
    fRough = mix(0.9, 0.12, win);
    fMetal = mix(0.0, 0.82, win);
  } else if (style < 3.5) {
    // vertical piers
    float pier = 1.0 - fBox(f.x, vParam.x, 1.0 - vParam.x, fw.x);
    float gy = fBox(f.y, vParam.z, vParam.z + vParam.y, fw.y);
    win = (1.0 - pier) * gy;
    vec3 span = mix(wall * 0.42, glassC * 0.45, 0.5);
    col = mix(span, wall, pier);
    col = mix(col, glassC * (0.6 + 0.5 * r1), win);
    fRough = mix(mix(0.6, 0.86, pier), 0.1, win);
    fMetal = mix(0.0, 0.88, win);
  } else if (style < 4.5) {
    // balconies
    float slab = 1.0 - smoothstep(0.1 - fw.y, 0.1 + fw.y, f.y);
    float rail = fBox(f.y, 0.1, 0.42, fw.y);
    float div = 1.0 - fBox(f.x, 0.045, 0.955, fw.x);
    float solid = max(slab, div);
    win = (1.0 - solid) * (1.0 - rail);
    vec3 railC = mix(glassC * 0.85, wall, 0.4);
    col = mix(glassC * (0.42 + 0.4 * r1), railC, rail);
    col = mix(col, wall, solid);
    float gl = (1.0 - solid) * (win + rail * 0.6);
    fRough = mix(0.82, 0.14, gl);
    fMetal = mix(0.0, 0.8, gl);
  } else if (style < 5.5) {
    // parking deck
    float open = fBox(f.y, 0.42, 0.97, fw.y) * fBox(f.x, 0.05, 0.95, fw.x);
    col = mix(wall, vec3(0.022), open * fade);
    fRough = 0.9;
    fEmit += vec3(0.9, 0.95, 1.0) * open * uNight * 0.12;
  } else if (style < 6.5) {
    // blank panels / louvres
    float line = 1.0 - fBox(f.x, 0.012, 0.988, fw.x) * fBox(f.y, 0.02, 0.98, fw.y);
    col = wall * (1.0 - 0.2 * line * fade) * (0.94 + 0.12 * r1);
    fRough = 0.8;
  } else {
    // storefronts
    float gx = fBox(f.x, 0.07, 0.93, fw.x);
    float gy = fBox(f.y, 0.06, 0.68, fw.y);
    win = gx * gy;
    float sgn = fBox(f.y, 0.73, 0.94, fw.y) * fBox(f.x, 0.04, 0.96, fw.x);
    vec3 sc = 0.5 + 0.5 * cos(6.2831 * (r1 + vec3(0.0, 0.33, 0.67)));
    sc = mix(vec3(0.1), sc * 0.62, step(0.35, r2));
    col = mix(wall, sc, sgn * step(0.22, r2));
    col = mix(col, glassC * 0.55, win);
    fRough = mix(0.8, 0.1, win);
    fMetal = mix(0.0, 0.85, win);
    fEmit += vec3(1.0, 0.84, 0.6) * win * uNight * (0.35 + 0.6 * r1) * step(0.18, r2);
    fEmit += sc * sgn * uNight * 0.35 * step(0.5, r2);
  }
  if (style < 4.5) {
    // interior blinds make some panes brighter and duller by day
    col = mix(col, col * 1.45 + 0.05, win * blinds * 0.55);
    fRough = mix(fRough, 0.34, win * blinds * 0.5);
    fMetal = mix(fMetal, 0.55, win * blinds * 0.5);
    float litP = style > 3.5 ? 0.4 : mix(0.1, 0.66, rFloor * rFloor);
    float lit = step(1.0 - litP, r2);
    vec3 lc = mix(vec3(1.0, 0.77, 0.48), vec3(0.8, 0.9, 1.0), step(0.55, fHash(vec2(id.y * 3.3, seed + 7.0))));
    if (style > 3.5) lc = vec3(1.0, 0.72, 0.44);
    fEmit += lc * win * lit * uNight * (0.5 + 1.0 * r1);
    fMetal = mix(fMetal, fMetal * 0.4, lit * uNight * win);
  }
  diffuseColor.rgb = col;
  fGlassMask = win;
  fCell = id + seed;
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fMetal;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(normal + (vec3(fHash(fCell + 1.3), fHash(fCell + 2.7), fHash(fCell + 4.1)) - 0.5) * 0.05 * fGlassMask);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fEmit;');
  };
  return mat;
}
