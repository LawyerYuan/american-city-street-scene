// Elevated railway ("L"): steel structure above 2nd Ave and Dock St, a station over Main St, and trains.
import * as THREE from 'three';
import { Geo, box, sweep } from './geo.js';
import { Path, line, arc, join } from './paths.js';
import { HALF, CURB_H, STREETS, NS, EW } from './layout.js';
import { hexToRgb } from './util.js';
import { ATLAS } from './textures.js';

const RAIL_Y = 7.6;
const TRACK_OFF = 2.1;
const OUT = HALF + 90;
const STEEL = hexToRgb(0x4a4439);
const STEEL2 = hexToRgb(0x3a352d);
const RAILC = hexToRgb(0x9c9b97);
export const STATION = { z0: -92, z1: -28, x: -60 };
export const L_COLUMNS = []; // [x,z] for parking exclusions

const centerXZ = join(
  line(-60, -OUT, -60, 32, 3),
  arc(-88, 32, 28, 0, 90, 1.0),
  line(-88, 60, -OUT, 60, 3),
);
function offsetXZ(xz, off) {
  const out = [];
  for (let i = 0; i < xz.length; i++) {
    const a = xz[Math.max(0, i - 1)], b = xz[Math.min(xz.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    out.push([xz[i][0] - dz * off, xz[i][1] + dx * off]);
  }
  return out;
}
export const centerPath = new Path(centerXZ, RAIL_Y, 1);
// track A: southbound then westbound (right-hand running); track B: the reverse direction
export const trackA = new Path(offsetXZ(centerXZ, TRACK_OFF), RAIL_Y, 0.5);
export const trackB = new Path(offsetXZ(centerXZ, -TRACK_OFF).reverse(), RAIL_Y, 0.5);

function inDrivingLane(x, z) {
  if (x < -HALF || x > HALF || z < -HALF || z > HALF) return true;
  for (const s of STREETS) {
    const along = s.ns ? z : x;
    const lat = Math.abs((s.ns ? x : z) - s.pos);
    if (along < s.from || along > s.to) continue;
    if (lat < s.halfCurb - s.park + 0.45) {
      if (s.median >= 2 && lat < s.median / 2 - 0.4) continue;
      return true;
    }
    if (lat < s.halfCurb + 0.3) {
      // inside an intersection box the parking lane is roadway too
      for (const c of s.ns ? EW : NS) {
        if (Math.abs(along - c.pos) < c.halfCurb + 4.6) return true;
      }
    }
  }
  return false;
}

export function buildRail(B) {
  const S = B.steel;
  const s0 = centerPath.sNear(-60, -HALF), s1 = centerPath.sNear(-HALF, 60);
  const frames = centerPath.frames(s0, s1, 2);
  const inStation = (f) => Math.abs(f.x + 60) < 0.5 && f.z > STATION.z0 && f.z < STATION.z1;
  // ties (timber deck) and rails
  for (const off of [-TRACK_OFF, TRACK_OFF]) {
    B.wood.color([0.42, 0.36, 0.3]);
    sweep(B.wood, frames, [[off - 1.5, RAIL_Y - 0.16 - RAIL_Y], [off + 1.5, RAIL_Y - 0.16 - RAIL_Y]], { closed: false, normalOut: [[0, 1]], uvLateral: true });
    S.color(RAILC);
    for (const r of [-0.72, 0.72]) {
      sweep(S, frames, [[off + r - 0.06, 0], [off + r + 0.06, 0]], { closed: false, normalOut: [[0, 1]] });
    }
    // plate girders under the rails
    S.color(STEEL);
    for (const r of [-0.9, 0.9]) {
      sweep(S, frames, [[off + r - 0.16, -0.18], [off + r + 0.16, -0.18], [off + r + 0.16, -1.45], [off + r - 0.16, -1.45]], { closed: true, capStart: true, capEnd: true });
    }
  }
  // walkways and handrails on both outer edges
  for (const sg of [-1, 1]) {
    B.wood.color([0.5, 0.44, 0.36]);
    sweep(B.wood, frames, [[sg * 3.7, -0.12], [sg * 4.6, -0.12]], { closed: false, normalOut: [[0, 1]], uvLateral: true });
    S.color(STEEL2);
    sweep(S, frames, [[sg * 4.56, -0.12], [sg * 4.56, 0.98], [sg * 4.64, 0.98], [sg * 4.64, -0.12]], { closed: true });
  }
  // centre walkway
  B.wood.color([0.5, 0.44, 0.36]);
  sweep(B.wood, frames, [[-0.45, -0.12], [0.45, -0.12]], { closed: false, normalOut: [[0, 1]], uvLateral: true });

  // bents
  for (let s = s0 + 5; s < s1 - 3; s += 15) {
    const f = centerPath.frames(s, s + 0.01, 1)[0];
    const station = inStation(f);
    let placed = false;
    for (const half of [5.9, 9.2, 12.5, 15.5]) {
      const ax = f.x - f.nx * half, az = f.z - f.nz * half, bx = f.x + f.nx * half, bz = f.z + f.nz * half;
      if (inDrivingLane(ax, az) || inDrivingLane(bx, bz)) continue;
      const rot = Math.atan2(f.nz, f.nx);
      const gl = (station ? Math.max(half, 7.9) : half) * 2 + 0.7;
      S.color(STEEL);
      box(S, f.x, RAIL_Y - 2.4, f.z, gl, 0.95, 0.7, rot, { bottom: true });
      for (const [cx, cz] of [[ax, az], [bx, bz]]) {
        box(S, cx, 0, cz, 0.55, RAIL_Y - 2.4, 0.55, rot, { top: false });
        L_COLUMNS.push([cx, cz]);
      }
      placed = true;
      break;
    }
    if (!placed) continue;
  }

  // ---- station over Main St -----------------------------------------------------
  {
    const x = STATION.x, z0 = STATION.z0, z1 = STATION.z1, zc = (z0 + z1) / 2, len = z1 - z0;
    const py = RAIL_Y + 1.15;
    for (const sg of [-1, 1]) {
      const px = x + sg * 5.75; // platform centre
      B.conc.color(hexToRgb(0xb9b5ab));
      box(B.conc, px, py - 0.3, zc, 3.9, 0.3, len, 0, { bottom: true });
      // tactile edge
      B.mark.color(hexToRgb(0xe9b824));
      B.mark.quadN([px - sg * 1.95, py + 0.01, z0], [px - sg * 1.45, py + 0.01, z0], [px - sg * 1.45, py + 0.01, z1], [px - sg * 1.95, py + 0.01, z1], 0, 1, 0);
      // edge beams
      S.color(STEEL);
      box(S, px + sg * 1.8, py - 1.6, zc, 0.35, 1.3, len, 0, { bottom: true });
      // back screen
      S.color(STEEL2);
      box(S, px + sg * 1.9, py, zc, 0.12, 1.25, len, 0);
      // canopy
      for (let z = z0 + 4; z <= z1 - 4; z += 8) box(S, px + sg * 1.6, py, z, 0.22, 3.4, 0.22, 0);
      B.plain.color(hexToRgb(0x6f7a72));
      box(B.plain, px + sg * 0.3, py + 3.4, zc, 4.4, 0.22, len - 4, 0, { bottom: true });
      // name boards
      const r = ATLAS.r.station;
      for (const zz of [zc - 14, zc + 14]) {
        const sx = px + sg * 1.99;
        B.sign.color([1, 1, 1]);
        B.sign.quadN([sx, py + 1.5, zz + sg * 4], [sx, py + 1.5, zz - sg * 4], [sx, py + 3.0, zz - sg * 4], [sx, py + 3.0, zz + sg * 4], sg, 0, 0,
          [r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]);
      }
      // stairs down to the sidewalks at both ends
      for (const e of [-1, 1]) {
        const zs = e < 0 ? z0 : z1;
        const sx = x + sg * 9.6;
        // landing
        B.conc.color(hexToRgb(0xb9b5ab));
        box(B.conc, (px + sg * 1.95 + sx + sg * 0.9) / 2, py - 0.3, zs - e * 1.4, Math.abs(sx + sg * 0.9 - (px + sg * 1.95)), 0.3, 2.8, 0, { bottom: true });
        // flight: stepped boxes going away from the platform
        const steps = 9, run = 14, rise = py - CURB_H;
        S.color(STEEL2);
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const zz = zs + e * (t0 + t1) * 0.5 * run + e * 0.0;
          const yy = py - rise * t1;
          box(S, sx, yy, zz, 1.7, (rise / steps) * 1.02, run / steps + 0.02, 0, { bottom: true });
        }
        // stair stringer rails
        box(S, sx + 0.9, CURB_H, zs + e * run, 0.12, 1.1, 0.12, 0);
        box(S, sx - 0.9, CURB_H, zs + e * run, 0.12, 1.1, 0.12, 0);
      }
    }
  }
}

// ---- trains ------------------------------------------------------------------------------
const CAR_LEN = 14.6, CAR_GAP = 0.7, NCARS = 4;

function carGeometry() {
  const p = new Geo({ aGlow: 1 });
  p.set('aGlow', [0]);
  const L = CAR_LEN, h = 1.45;
  // origin: car centre at rail level, +X forward
  p.color(hexToRgb(0xc4c8cb));
  box(p, 0, 0.45, 0, L, 3.25, h * 2, 0, { bottom: true });
  p.color(hexToRgb(0x2a2d31));
  box(p, 0, 0.1, 0, L - 1.2, 0.45, h * 1.5, 0, { bottom: true });
  // roof
  p.color(hexToRgb(0x9aa0a4));
  box(p, 0, 3.7, 0, L - 0.8, 0.22, h * 1.5, 0);
  // stripe
  p.color(hexToRgb(0x1f6fb5));
  for (const sg of [-1, 1]) box(p, 0, 1.15, sg * (h + 0.012), L - 0.1, 0.22, 0.02, 0, { bottom: true });
  // windows (lit at night)
  p.set('aGlow', [0.55]);
  p.color([0.2, 0.22, 0.2]);
  for (const sg of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const x = -L / 2 + 1.5 + k * ((L - 3) / 5);
      box(p, x, 1.9, sg * (h + 0.015), 1.5, 0.95, 0.02, 0, { bottom: true });
    }
  }
  // cab ends
  for (const sg of [-1, 1]) box(p, sg * (L / 2 + 0.012), 1.9, 0, 0.02, 0.95, h * 1.4, 0, { bottom: true });
  // headlights
  p.set('aGlow', [1]);
  p.color([1, 0.95, 0.8]);
  for (const sg of [-1, 1]) {
    for (const zz of [-0.9, 0.9]) box(p, sg * (L / 2 + 0.02), 0.9, zz, 0.03, 0.22, 0.3, 0, { bottom: true });
  }
  return p.build();
}

export class Trains {
  constructor(scene, M, clip) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55, clippingPlanes: clip, clipShadows: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = M.uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += mix(vColor.rgb, vec3(1.0, 0.86, 0.6), 0.7) * vGlow * (0.08 + uNight * 3.2);');
    };
    this.mesh = new THREE.InstancedMesh(carGeometry(), mat, 4 * NCARS);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.trains = [];
    this.tracks = [trackA, trackB].map((path, i) => {
      path.buildSpeed(13, 1.5, 0.8);
      const stopZ = i === 0 ? STATION.z1 - 1.5 : STATION.z0 + 1.5;
      const sx = i === 0 ? STATION.x - TRACK_OFF : STATION.x + TRACK_OFF;
      return { path, stopS: path.sNear(sx, stopZ), wait: i === 0 ? 2 : 22, list: [] };
    });
    this.a = { x: 0, y: 0, z: 0 };
    this.b = { x: 0, y: 0, z: 0 };
    // start with trains already on the line
    this.spawn(this.tracks[0], 380);
    this.spawn(this.tracks[1], 200);
  }
  spawn(track, s = 0) {
    const t = { track, s, v: s > 0 ? 9 : 10, served: s > track.stopS + 5, dwell: 0, x: 0, y: 0, z: 0, hx: 1, hz: 0, isTrain: true };
    track.list.push(t);
    this.trains.push(t);
  }
  step(dt) {
    for (const track of this.tracks) {
      const path = track.path, tl = NCARS * (CAR_LEN + CAR_GAP);
      for (const t of track.list) {
        let vmax = Math.min(path.speedAt(t.s), path.speedAt(Math.max(0, t.s - tl * 0.5)), path.speedAt(Math.max(0, t.s - tl)));
        if (!t.served) {
          const d = track.stopS - t.s;
          if (d > 0) vmax = Math.min(vmax, Math.sqrt(2 * 0.85 * d) + 0.15);
          if (d < 0.4 && t.v < 0.4) {
            t.v = 0;
            t.dwell += dt;
            if (t.dwell > 9) t.served = true;
            continue;
          }
        }
        // keep distance to the train ahead
        const idx = track.list.indexOf(t);
        if (idx > 0) {
          const lead = track.list[idx - 1];
          const gap = lead.s - tl - t.s - 25;
          vmax = Math.min(vmax, Math.sqrt(Math.max(0, 2 * 0.8 * gap)));
        }
        if (t.v < vmax) t.v = Math.min(vmax, t.v + 0.8 * dt);
        else t.v = Math.max(vmax, t.v - 1.1 * dt);
        t.s += t.v * dt;
      }
      // retire and respawn
      if (track.list.length && track.list[0].s > path.len + tl) {
        const t = track.list.shift();
        this.trains.splice(this.trains.indexOf(t), 1);
        t.dead = true;
      }
      const last = track.list[track.list.length - 1];
      if (!last || last.s > 470) {
        track.wait -= dt;
        if (track.wait <= 0 && track.list.length < 2) {
          this.spawn(track, 0);
          track.wait = 16 + Math.random() * 14;
        }
      }
    }
  }
  draw() {
    const arr = this.mesh.instanceMatrix.array;
    let n = 0;
    const A = this.a, Bp = this.b;
    for (const t of this.trains) {
      const path = t.track.path;
      for (let k = 0; k < NCARS; k++) {
        const front = t.s - k * (CAR_LEN + CAR_GAP);
        path.at(front - 2.6, A);
        path.at(front - CAR_LEN + 2.6, Bp);
        let fx = A.x - Bp.x, fy = A.y - Bp.y, fz = A.z - Bp.z;
        const l = Math.hypot(fx, fy, fz) || 1;
        fx /= l; fy /= l; fz /= l;
        const hl = Math.hypot(fx, fz) || 1;
        const rx = -fz / hl, rz = fx / hl;
        const o = n * 16;
        arr[o] = fx; arr[o + 1] = fy; arr[o + 2] = fz; arr[o + 3] = 0;
        arr[o + 4] = -rz * fy; arr[o + 5] = rz * fx - rx * fz; arr[o + 6] = rx * fy; arr[o + 7] = 0;
        arr[o + 8] = rx; arr[o + 9] = 0; arr[o + 10] = rz; arr[o + 11] = 0;
        arr[o + 12] = (A.x + Bp.x) / 2; arr[o + 13] = (A.y + Bp.y) / 2; arr[o + 14] = (A.z + Bp.z) / 2; arr[o + 15] = 1;
        if (k === 0) {
          t.x = arr[o + 12]; t.y = arr[o + 13]; t.z = arr[o + 14]; t.hx = fx; t.hz = fz;
        }
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
