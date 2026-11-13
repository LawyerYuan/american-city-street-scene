import * as THREE from 'three';
import * as T from './textures.js';
import { Geo, mesh } from './geo.js';

export function createMaterials() {
  const M = {};
  M.uNight = { value: 0 }; // 0 day .. 1 night (drives emissive windows and lamps)
  M.uTime = { value: 0 };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9, metalness: 0 }, o));
  M.asphalt = std({ map: T.asphaltTex(), roughness: 0.94 });
  M.pave = std({ map: T.concreteTex(), roughness: 0.9 });
  M.paver = std({ map: T.paverTex(), roughness: 0.9 });
  M.grass = std({ map: T.grassTex(), roughness: 1 });
  M.wood = std({ map: T.plankTex(), roughness: 0.85 });
  M.mark = std({ roughness: 0.78, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  M.conc = std({ roughness: 0.88 });
  M.steel = std({ roughness: 0.55, metalness: 0.5 });
  M.roof = std({ roughness: 0.95 });
  M.plain = std({ roughness: 0.7 });
  M.atlas = T.atlasTex();
  M.decal = new THREE.MeshStandardMaterial({
    map: M.atlas, transparent: true, alphaTest: 0.25, roughness: 0.78, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  M.sign = new THREE.MeshStandardMaterial({
    map: M.atlas, roughness: 0.55, emissiveMap: M.atlas, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0,
  });
  M.water = new THREE.MeshStandardMaterial({
    color: 0x236877, roughness: 0.1, metalness: 0, normalMap: T.waterNormalTex(),
    normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.5,
  });
  M.glass = new THREE.MeshStandardMaterial({ color: 0x22323c, roughness: 0.08, metalness: 0.85, envMapIntensity: 1.3 });
  M.glow = T.glowTex();
  return M;
}

// Named geometry batches -> one mesh each.
export function createBatches() {
  const names = ['asphalt', 'pave', 'paver', 'grass', 'wood', 'mark', 'decal', 'conc', 'steel', 'roof', 'plain', 'sign', 'water', 'glass'];
  const B = {};
  for (const n of names) B[n] = new Geo();
  return B;
}

export function flushBatches(B, M, scene) {
  const cfg = {
    asphalt: { cast: false },
    pave: { cast: false },
    paver: { cast: false },
    grass: { cast: false },
    wood: { cast: true },
    mark: { cast: false },
    decal: { cast: false, order: 2 },
    conc: {},
    steel: {},
    roof: {},
    plain: {},
    sign: { cast: false },
    water: { cast: false },
    glass: {},
  };
  const out = {};
  for (const n in B) {
    if (!B[n].count) continue;
    const m = mesh(B[n], M[n], cfg[n] || {});
    m.name = 'batch:' + n;
    scene.add(m);
    out[n] = m;
  }
  return out;
}
