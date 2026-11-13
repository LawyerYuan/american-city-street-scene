// Pedestrians: small instanced figures walking laps on the sidewalks of each block and along the riverwalk.
import * as THREE from 'three';
import { Geo, box } from './geo.js';
import { BLOCKS, CURB_H, RIVER_X } from './layout.js';
import { hexToRgb } from './util.js';

const SHIRTS = [0xd9d9d6, 0x2f4a7a, 0xa83232, 0x2f6b4a, 0xd9a13a, 0x4a4a4f, 0x7a4f8a, 0xe0e0e0, 0x1f2a36, 0xc86a2a, 0x6fa0c8].map(hexToRgb);

function figure() {
  const g = new Geo();
  g.color([0.2, 0.2, 0.24]);
  box(g, 0, 0, 0, 0.24, 0.86, 0.34, 0); // legs
  g.color([1, 1, 1]);
  box(g, 0, 0.86, 0, 0.27, 0.62, 0.44, 0); // torso
  g.color([1.0, 0.8, 0.66]);
  box(g, 0, 1.5, 0, 0.22, 0.24, 0.22, 0); // head
  return g.build();
}

export class People {
  constructor(scene, rng, stationZone) {
    const loops = [];
    for (const b of BLOCKS) {
      if (b.ci === -1) {
        // riverwalk: a narrow lap along the seawall
        if (b.z1 - b.z0 > 20) loops.push({ x0: RIVER_X + 2.2, x1: RIVER_X + 6.5, z0: b.z0 + 2, z1: b.z1 - 2, w: 1.6 });
        continue;
      }
      const s = b.sw;
      if (!s.w || !s.e || !s.n || !s.s) continue;
      loops.push({ x0: b.x0 + 2.6, x1: b.x1 - 2.6, z0: b.z0 + 2.6, z1: b.z1 - 2.6, w: 1.0 });
    }
    this.loops = loops;
    const list = [];
    for (const L of loops) {
      const per = 2 * (L.x1 - L.x0 + L.z1 - L.z0);
      L.per = per;
      const n = Math.round(per / 14);
      for (let i = 0; i < n; i++) {
        list.push({
          L, s: rng.range(0, per), v: (rng.chance(0.5) ? 1 : -1) * rng.range(1.0, 1.6), off: rng.range(-L.w, L.w),
          h: rng.range(0.92, 1.1), ph: rng.range(0, 6.28), col: rng.pick(SHIRTS),
        });
      }
    }
    this.list = list;
    this.zone = stationZone;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this.mesh = new THREE.InstancedMesh(figure(), mat, list.length);
    const c = new THREE.Color();
    list.forEach((p, i) => this.mesh.setColorAt(i, c.setRGB(p.col[0], p.col[1], p.col[2])));
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.update(0, 0, 1e9);
  }
  // camDist: skip the per-frame update when the camera is too far to see anyone
  update(dt, t, camDist) {
    this.mesh.visible = camDist < 620;
    if (!this.mesh.visible && dt > 0) {
      for (const p of this.list) p.s += p.v * dt;
      return;
    }
    const a = this.mesh.instanceMatrix.array;
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i], L = p.L;
      p.s += p.v * dt;
      let s = ((p.s % L.per) + L.per) % L.per;
      const w = L.x1 - L.x0, d = L.z1 - L.z0;
      let x, z, dx, dz;
      if (s < w) { x = L.x0 + s; z = L.z0 + p.off; dx = 1; dz = 0; }
      else if ((s -= w) < d) { x = L.x1 - p.off; z = L.z0 + s; dx = 0; dz = 1; }
      else if ((s -= d) < w) { x = L.x1 - s; z = L.z1 - p.off; dx = -1; dz = 0; }
      else { s -= w; x = L.x0 + p.off; z = L.z1 - s; dx = 0; dz = -1; }
      if (p.v < 0) { dx = -dx; dz = -dz; }
      const bob = Math.abs(Math.sin(t * 7.5 * Math.abs(p.v) * 0.8 + p.ph)) * 0.04;
      const o = i * 16, h = p.h;
      // local +X = facing direction
      a[o] = dx * h; a[o + 1] = 0; a[o + 2] = dz * h; a[o + 3] = 0;
      a[o + 4] = 0; a[o + 5] = h; a[o + 6] = 0; a[o + 7] = 0;
      a[o + 8] = -dz * h; a[o + 9] = 0; a[o + 10] = dx * h; a[o + 11] = 0;
      a[o + 12] = x; a[o + 13] = CURB_H + bob; a[o + 14] = z; a[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
