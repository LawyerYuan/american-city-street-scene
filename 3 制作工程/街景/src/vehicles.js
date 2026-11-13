// Procedural low-poly vehicles, drawn as instanced meshes (paint = per-instance colour, detail = fixed colours).
// Local frame: +X forward, +Y up, +Z right. Origin: midpoint between axles, on the ground.
import * as THREE from 'three';
import { Geo, box, polyArea2 } from './geo.js';
import { HALF } from './layout.js';
import { hexToRgb, TAU } from './util.js';

const GLASS = [0.035, 0.05, 0.065];
const TIRE = [0.017, 0.017, 0.018];
const DARK = [0.06, 0.06, 0.065];
const CHROME = [0.45, 0.46, 0.48];
const HEAD = [1.0, 0.96, 0.85];
const TAIL = [0.75, 0.03, 0.02];
const WHITE = [0.86, 0.86, 0.84];
const AMBER = [1.0, 0.55, 0.05];

function extrude(g, pts, z0, z1) {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const f of faces) {
    const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
    g.triN([a[0], a[1], z0], [b[0], b[1], z0], [c[0], c[1], z0], 0, 0, -1);
    g.triN([a[0], a[1], z1], [b[0], b[1], z1], [c[0], c[1], z1], 0, 0, 1);
  }
  const sgn = polyArea2(pts) > 0 ? 1 : -1;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0], dy = q[1] - p[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) continue;
    g.quadN([p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1], (sgn * dy) / l, (-sgn * dx) / l, 0);
  }
}
// axis-aligned box in vehicle space
function vbox(g, x0, x1, y0, y1, z0, z1) {
  box(g, (x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, 0, { bottom: true });
}
function wheel(g, x, r, zc, w) {
  const seg = 10, z0 = zc - w / 2, z1 = zc + w / 2;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const p0 = [x + Math.cos(a0) * r, r + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, r + Math.sin(a1) * r];
    const nx = Math.cos((a0 + a1) / 2), ny = Math.sin((a0 + a1) / 2);
    g.quadN([p0[0], p0[1], z0], [p1[0], p1[1], z0], [p1[0], p1[1], z1], [p0[0], p0[1], z1], nx, ny, 0);
    g.triN([x, r, z0], [p0[0], p0[1], z0], [p1[0], p1[1], z0], 0, 0, -1);
    g.triN([x, r, z1], [p0[0], p0[1], z1], [p1[0], p1[1], z1], 0, 0, 1);
  }
}
function wheels(d, xs, r, half, w = 0.24) {
  d.color(TIRE);
  for (const x of xs) {
    wheel(d, x, r, -half + w / 2 - 0.02, w);
    wheel(d, x, r, half - w / 2 + 0.02, w);
  }
}
function lamps(d, xf, xr, yf, yr, half) {
  d.set('aGlow', [1]);
  d.color(HEAD);
  vbox(d, xf - 0.04, xf + 0.03, yf - 0.08, yf + 0.08, -half + 0.14, -half + 0.52);
  vbox(d, xf - 0.04, xf + 0.03, yf - 0.08, yf + 0.08, half - 0.52, half - 0.14);
  d.color(TAIL);
  vbox(d, xr - 0.03, xr + 0.04, yr - 0.07, yr + 0.07, -half + 0.12, -half + 0.5);
  vbox(d, xr - 0.03, xr + 0.04, yr - 0.07, yr + 0.07, half - 0.5, half - 0.12);
  d.set('aGlow', [0]);
}

function newPair() {
  const p = new Geo();
  const d = new Geo({ aGlow: 1 });
  d.set('aGlow', [0]);
  return { p, d };
}

function sedan(taxi) {
  const { p, d } = newPair();
  const h = 0.92;
  p.color([1, 1, 1]);
  extrude(p, [[-2.38, 0.3], [-2.4, 0.82], [-2.25, 0.96], [-1.45, 1.0], [0.95, 1.0], [2.12, 0.84], [2.3, 0.68], [2.3, 0.3]], -h, h);
  p.color([0.9, 0.9, 0.9]);
  vbox(p, -0.92, 0.36, 1.4, 1.46, -h + 0.14, h - 0.14);
  d.color(GLASS);
  extrude(d, [[-1.5, 1.0], [-0.95, 1.42], [0.38, 1.42], [1.0, 1.0]], -h + 0.1, h - 0.1);
  wheels(d, [-1.4, 1.4], 0.33, h);
  lamps(d, 2.3, -2.4, 0.66, 0.8, h);
  if (taxi) {
    d.set('aGlow', [0.7]);
    d.color([1, 0.95, 0.7]);
    vbox(d, -0.45, -0.1, 1.46, 1.62, -0.42, 0.42);
    d.set('aGlow', [0]);
    d.color(DARK);
    vbox(d, -2.0, 2.0, 0.62, 0.7, -h - 0.01, h + 0.01);
  }
  return { p, d, len: 4.7, fo: 0.9, wb: 2.8 };
}

function suv() {
  const { p, d } = newPair();
  const h = 0.97;
  p.color([1, 1, 1]);
  extrude(p, [[-2.43, 0.34], [-2.45, 1.02], [-2.36, 1.1], [1.0, 1.1], [2.18, 0.98], [2.4, 0.8], [2.4, 0.34]], -h, h);
  p.color([0.9, 0.9, 0.9]);
  vbox(p, -2.12, 0.3, 1.7, 1.78, -h + 0.12, h - 0.12);
  d.color(GLASS);
  extrude(d, [[-2.32, 1.1], [-2.16, 1.72], [0.32, 1.72], [0.98, 1.1]], -h + 0.09, h - 0.09);
  d.color(DARK);
  vbox(d, -1.9, 0.1, 1.78, 1.83, -h + 0.25, -h + 0.31);
  vbox(d, -1.9, 0.1, 1.78, 1.83, h - 0.31, h - 0.25);
  wheels(d, [-1.45, 1.45], 0.38, h, 0.27);
  lamps(d, 2.4, -2.45, 0.8, 0.95, h);
  return { p, d, len: 4.9, fo: 0.95, wb: 2.9 };
}

function pickup() {
  const { p, d } = newPair();
  const h = 1.0;
  p.color([1, 1, 1]);
  extrude(p, [[-2.93, 0.42], [-2.95, 1.05], [-0.6, 1.05], [-0.6, 1.12], [1.0, 1.12], [2.45, 1.0], [2.75, 0.84], [2.75, 0.42]], -h, h);
  p.color([0.9, 0.9, 0.9]);
  vbox(p, -0.44, 0.72, 1.8, 1.87, -h + 0.12, h - 0.12);
  d.color(GLASS);
  extrude(d, [[-0.56, 1.12], [-0.46, 1.82], [0.76, 1.82], [1.28, 1.12]], -h + 0.09, h - 0.09);
  d.color(DARK);
  vbox(d, -2.82, -0.72, 1.0, 1.07, -h + 0.13, h - 0.13); // bed floor
  wheels(d, [-1.8, 1.8], 0.4, h, 0.28);
  lamps(d, 2.75, -2.95, 0.84, 0.95, h);
  return { p, d, len: 5.7, fo: 0.95, wb: 3.6 };
}

function van() {
  const { p, d } = newPair();
  const h = 1.0;
  p.color([1, 1, 1]);
  extrude(p, [[-2.68, 0.38], [-2.7, 2.15], [-2.6, 2.22], [1.55, 2.22], [2.42, 1.22], [2.7, 0.98], [2.7, 0.38]], -h, h);
  d.color(GLASS);
  extrude(d, [[1.6, 2.16], [2.4, 1.25], [2.46, 1.29], [1.68, 2.2]], -h + 0.14, h - 0.14);
  vbox(d, 0.75, 1.62, 1.35, 2.0, -h - 0.012, -h + 0.02);
  vbox(d, 0.75, 1.62, 1.35, 2.0, h - 0.02, h + 0.012);
  wheels(d, [-1.7, 1.7], 0.37, h, 0.26);
  lamps(d, 2.7, -2.7, 0.9, 1.1, h);
  return { p, d, len: 5.4, fo: 1.0, wb: 3.4 };
}

function boxtruck() {
  const { p, d } = newPair();
  const h = 1.2;
  p.color([1, 1, 1]);
  extrude(p, [[2.0, 0.5], [2.0, 2.35], [3.0, 2.35], [3.75, 1.5], [3.9, 1.3], [3.9, 0.5]], -h + 0.1, h - 0.1); // cab
  d.color(WHITE);
  vbox(d, -3.9, 1.85, 1.0, 3.35, -h, h); // cargo box
  d.color(DARK);
  vbox(d, -3.7, 3.6, 0.55, 1.0, -h + 0.25, h - 0.25); // frame
  d.color(GLASS);
  extrude(d, [[3.05, 2.3], [3.74, 1.52], [3.8, 1.56], [3.12, 2.34]], -h + 0.2, h - 0.2);
  vbox(d, 2.3, 3.0, 1.5, 2.2, -h + 0.08, -h + 0.11);
  vbox(d, 2.3, 3.0, 1.5, 2.2, h - 0.11, h - 0.08);
  wheels(d, [-2.3, 2.3], 0.46, h, 0.3);
  wheels(d, [-2.3], 0.46, h - 0.3, 0.3);
  lamps(d, 3.9, -3.9, 1.0, 1.15, h);
  return { p, d, len: 7.8, fo: 1.6, wb: 4.6 };
}

function tractor() {
  const { p, d } = newPair();
  const h = 1.22;
  // origin mid-axle: front axle +2.3, rear tandem centre -2.3; front bumper +3.5, rear -3.5
  p.color([1, 1, 1]);
  extrude(p, [[1.35, 0.6], [1.35, 1.95], [3.1, 1.75], [3.5, 1.5], [3.5, 0.6]], -h + 0.22, h - 0.22); // hood
  extrude(p, [[-1.2, 0.6], [-1.2, 3.75], [0.9, 3.75], [1.45, 2.9], [1.5, 1.95], [1.5, 0.6]], -h, h); // cab + sleeper
  d.color(GLASS);
  extrude(d, [[0.95, 3.6], [1.46, 2.92], [1.52, 2.95], [1.02, 3.64]], -h + 0.16, h - 0.16);
  vbox(d, 0.4, 1.3, 2.2, 3.0, -h - 0.012, -h + 0.02);
  vbox(d, 0.4, 1.3, 2.2, 3.0, h - 0.02, h + 0.012);
  d.color(DARK);
  vbox(d, -3.5, 1.4, 0.62, 1.05, -h + 0.38, h - 0.38); // frame
  vbox(d, -3.0, -1.5, 1.05, 1.2, -0.55, 0.55); // fifth wheel
  d.color(CHROME);
  vbox(d, -1.34, -1.2, 1.2, 4.05, -h + 0.02, -h + 0.16); // exhaust stacks
  vbox(d, -1.34, -1.2, 1.2, 4.05, h - 0.16, h - 0.02);
  vbox(d, 3.46, 3.56, 0.62, 1.42, -h + 0.3, h - 0.3); // grille
  wheels(d, [2.3], 0.5, h, 0.32);
  wheels(d, [-1.65, -2.95], 0.5, h, 0.56);
  lamps(d, 3.5, -3.5, 1.2, 0.95, h - 0.1);
  return { p, d, len: 7.0, fo: 1.2, wb: 4.6 };
}

function trailer() {
  const { p, d } = newPair();
  const h = 1.3;
  // origin: midpoint between kingpin (+5.7) and axle group (-5.7); body from +6.7 to -7.9
  p.color([1, 1, 1]);
  vbox(p, -7.9, 6.7, 1.25, 4.1, -h, h);
  d.color(DARK);
  vbox(d, -7.9, 5.5, 1.0, 1.25, -h + 0.3, h - 0.3);
  vbox(d, 2.6, 2.8, 0.1, 1.0, -h + 0.3, -h + 0.45);
  vbox(d, 2.6, 2.8, 0.1, 1.0, h - 0.45, h - 0.3);
  wheels(d, [-5.05, -6.35], 0.5, h, 0.56);
  d.set('aGlow', [1]);
  d.color(TAIL);
  vbox(d, -7.94, -7.88, 1.3, 1.45, -h + 0.1, -h + 0.5);
  vbox(d, -7.94, -7.88, 1.3, 1.45, h - 0.5, h - 0.1);
  d.set('aGlow', [0]);
  return { p, d };
}

// Transit bus body between x0 (rear) and x1 (front), axles at xs.
function busBody(o) {
  const { p, d } = newPair();
  const h = 1.28, x0 = o.x0, x1 = o.x1, top = 3.05;
  d.color(WHITE);
  if (o.front) extrude(d, [[x0, 0.36], [x0, top], [x1 - 0.5, top], [x1 - 0.06, 2.2], [x1, 1.0], [x1, 0.36]], -h, h);
  else vbox(d, x0, x1, 0.36, top, -h, h);
  // livery band + skirt in route colour
  p.color([1, 1, 1]);
  vbox(p, x0 - 0.012, x1 - (o.front ? 0.03 : -0.012), 0.36, 1.12, -h - 0.014, h + 0.014);
  vbox(p, x0 + 0.3, x1 - 0.9, top, top + 0.06, -h + 0.25, h - 0.25);
  // windows
  d.color(GLASS);
  vbox(d, x0 + 0.5, x1 - (o.front ? 0.95 : 0.2), 1.42, 2.5, -h - 0.02, -h + 0.02);
  vbox(d, x0 + 0.5, x1 - (o.front ? 0.95 : 0.2), 1.42, 2.5, h - 0.02, h + 0.02);
  if (o.front) {
    extrude(d, [[x1 - 0.5, 2.92], [x1 - 0.07, 2.18], [x1 - 0.01, 1.3], [x1 + 0.03, 1.3], [x1 - 0.02, 2.22], [x1 - 0.44, 2.96]], -h + 0.1, h - 0.1);
    d.set('aGlow', [0.5]);
    d.color(AMBER);
    vbox(d, x1 - 0.42, x1 - 0.34, 2.66, 2.92, -0.85, 0.85); // destination sign
    d.set('aGlow', [0]);
  }
  if (o.rear) {
    d.color(DARK);
    vbox(d, x0 - 0.02, x0 + 0.02, 1.5, 2.6, -h + 0.25, h - 0.25);
  }
  if (o.bellows) {
    d.color(DARK);
    vbox(d, x0 - 0.55, x0 + 0.05, 0.5, top - 0.05, -h + 0.06, h - 0.06);
  }
  // roof units
  d.color([0.62, 0.63, 0.64]);
  const mid = (x0 + x1) / 2;
  vbox(d, mid - 1.6, mid + 0.6, top + 0.06, top + 0.34, -0.85, 0.85);
  if (o.front) vbox(d, x1 - 3.2, x1 - 2.0, top + 0.06, top + 0.26, -0.7, 0.7);
  wheels(d, o.axles, 0.5, h, 0.32);
  if (o.front) {
    d.set('aGlow', [1]);
    d.color(HEAD);
    vbox(d, x1 - 0.03, x1 + 0.03, 0.72, 0.9, -h + 0.16, -h + 0.52);
    vbox(d, x1 - 0.03, x1 + 0.03, 0.72, 0.9, h - 0.52, h - 0.16);
    d.set('aGlow', [0]);
  }
  if (o.rear) {
    d.set('aGlow', [1]);
    d.color(TAIL);
    vbox(d, x0 - 0.04, x0 + 0.02, 1.05, 1.3, -h + 0.14, -h + 0.42);
    vbox(d, x0 - 0.04, x0 + 0.02, 1.05, 1.3, h - 0.42, h - 0.14);
    d.set('aGlow', [0]);
  }
  return { p, d };
}

function schoolbus() {
  const { p, d } = newPair();
  const h = 1.2;
  // origin mid-axle: front axle +3.0, rear axle -3.0; front bumper +5.2, rear -5.6
  p.color([1, 1, 1]);
  extrude(p, [[3.3, 0.5], [3.3, 1.75], [4.8, 1.6], [5.2, 1.35], [5.2, 0.5]], -h + 0.16, h - 0.16); // hood
  extrude(p, [[-5.6, 0.5], [-5.6, 2.95], [-5.4, 3.08], [3.0, 3.08], [3.42, 2.6], [3.45, 1.7], [3.45, 0.5]], -h, h);
  d.color(GLASS);
  vbox(d, -5.2, 2.9, 1.75, 2.5, -h - 0.02, -h + 0.02);
  vbox(d, -5.2, 2.9, 1.75, 2.5, h - 0.02, h + 0.02);
  extrude(d, [[3.05, 3.02], [3.43, 2.6], [3.46, 1.78], [3.5, 1.78], [3.48, 2.62], [3.1, 3.06]], -h + 0.1, h - 0.1);
  d.color(DARK);
  vbox(d, -5.6, 3.4, 1.42, 1.5, -h - 0.025, h + 0.025);
  vbox(d, -5.6, 3.4, 1.0, 1.08, -h - 0.025, h + 0.025);
  d.color(WHITE);
  vbox(d, -5.3, 2.9, 3.08, 3.12, -h + 0.2, h - 0.2);
  wheels(d, [3.0], 0.48, h, 0.3);
  wheels(d, [-3.0], 0.48, h, 0.56);
  lamps(d, 5.2, -5.6, 1.05, 1.2, h - 0.05);
  return { p, d, len: 10.8, fo: 2.2, wb: 6.0 };
}

// ---- type table ----------------------------------------------------------------------
export const PAINTS = [
  [0xf2f2f0, 22], [0x15171a, 17], [0x6f7378, 15], [0xb9bcc0, 13], [0x1f4e8c, 8], [0xa81c22, 8],
  [0x1b2a49, 4], [0x2f5d3a, 3], [0xc9b79a, 3], [0x5b3a29, 2], [0xd9621e, 1.5], [0xe2b200, 1],
].map(([h, w]) => ({ rgb: hexToRgb(h), w }));

export function buildVehicleTypes() {
  const T = {};
  T.sedan = Object.assign(sedan(false), { cap: 1100, ro: 1.0 });
  T.suv = Object.assign(suv(), { cap: 900 });
  T.pickup = Object.assign(pickup(), { cap: 500 });
  T.van = Object.assign(van(), { cap: 400 });
  T.taxi = Object.assign(sedan(true), { cap: 400, fixed: hexToRgb(0xf5c400) });
  T.boxtruck = Object.assign(boxtruck(), { cap: 160 });
  T.semi = Object.assign(tractor(), { cap: 140, len: 19.3, trailer: 'trailer', kingpin: 5.3, trAxle: 11.4 });
  T.trailer = Object.assign(trailer(), { cap: 140, part: true });
  // 12.2 m bus: origin mid-axle; front axle +3.1, rear -3.1; front bumper +5.7, rear -6.5
  T.bus = Object.assign(busBody({ x0: -6.5, x1: 5.7, axles: [-3.1, 3.1], front: true, rear: true }), { cap: 80, len: 12.2, fo: 2.6, wb: 6.2, isBus: true });
  // articulated: front section (axles at 2.6 and 8.5 from the nose, joint at 10.2), rear section (joint -> axle 4.4)
  T.artic = Object.assign(busBody({ x0: -4.85, x1: 5.55, axles: [-2.95, 2.95], front: true }), { cap: 40, len: 18.2, fo: 2.6, wb: 5.9, isBus: true, rear: 'articR', joint: 10.2, rAxle: 4.4 });
  T.articR = Object.assign(busBody({ x0: -5.6, x1: 2.2, axles: [-2.2], rear: true, bellows: false }), { cap: 40, part: true });
  T.school = Object.assign(schoolbus(), { cap: 60, fixed: hexToRgb(0xf2a900) });
  let i = 0;
  for (const k in T) {
    T[k].name = k;
    T[k].index = i++;
  }
  return T;
}

export class VehicleRenderer {
  constructor(scene, M, T) {
    this.T = T;
    const clip = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), HALF), new THREE.Plane(new THREE.Vector3(-1, 0, 0), HALF),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), HALF), new THREE.Plane(new THREE.Vector3(0, 0, -1), HALF),
    ];
    this.clip = clip;
    this.paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.35, clippingPlanes: clip, clipShadows: true, envMapIntensity: 1.1 });
    this.detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1, clippingPlanes: clip, clipShadows: true });
    this.detailMat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = M.uNight;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow * (0.25 + uNight * 5.0);');
    };
    // parked cars: same look, lights off
    this.parkedDetailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.1 });
    // headlight pools on the road ahead of moving vehicles (night only)
    {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      this.beamMat = new THREE.MeshBasicMaterial({
        map: M.glow, color: new THREE.Color(1.0, 0.93, 0.78), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8,
      });
      this.beams = new THREE.InstancedMesh(g, this.beamMat, 1600);
      this.beams.count = 0;
      this.beams.frustumCulled = false;
      this.beams.userData.noAO = true;
      this.beams.renderOrder = 4;
      this.beams.visible = false;
      this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(this.beams);
      this.nBeam = 0;
    }
    this.groups = {};
    this.meshes = [];
    for (const k in T) {
      const t = T[k];
      const pg = t.p.build(), dg = t.d.build();
      const mk = (geo, mat, cap, colored) => {
        const m = new THREE.InstancedMesh(geo, mat, cap);
        m.count = 0;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        if (colored) {
          m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
          m.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }
        m.userData.vehicleType = k;
        scene.add(m);
        return m;
      };
      const g = {
        paint: mk(pg, this.paintMat, t.cap, true),
        detail: mk(dg, this.detailMat, t.cap, false),
        // static (parked) instances
        sPaint: null, sDetail: null,
        n: 0, owners: new Array(t.cap), geoP: pg, geoD: dg,
      };
      this.groups[k] = g;
      this.meshes.push(g.paint, g.detail);
    }
  }
  begin() {
    for (const k in this.groups) this.groups[k].n = 0;
    this.nBeam = 0;
  }
  setNight(n) {
    this.beams.visible = n > 0.03;
    this.beamMat.opacity = n * 0.34;
  }
  // light pool ahead of a vehicle: p = vehicle centre, f = forward, d = distance ahead of the centre
  beam(px, py, pz, fx, fz, d) {
    if (!this.beams.visible || this.nBeam >= 1600) return;
    const hl = Math.hypot(fx, fz) || 1;
    const ux = fx / hl, uz = fz / hl;
    const a = this.beams.instanceMatrix.array, o = this.nBeam * 16;
    const L = 15, W = 6.5;
    // local +X (plane width) -> right, local +Z (plane depth) -> forward
    a[o] = -uz * W; a[o + 1] = 0; a[o + 2] = ux * W; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = 1; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = ux * L; a[o + 9] = 0; a[o + 10] = uz * L; a[o + 11] = 0;
    a[o + 12] = px + ux * (d + L * 0.42); a[o + 13] = py + 0.1; a[o + 14] = pz + uz * (d + L * 0.42); a[o + 15] = 1;
    this.nBeam++;
  }
  // forward f (unit, may pitch), position p, colour rgb, owner
  add(type, px, py, pz, fx, fy, fz, rgb, owner) {
    const g = this.groups[type];
    const i = g.n;
    if (i >= g.paint.instanceMatrix.count) return;
    g.n++;
    const hl = Math.hypot(fx, fz) || 1;
    const rx = -fz / hl, rz = fx / hl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const a = g.paint.instanceMatrix.array, o = i * 16;
    a[o] = fx; a[o + 1] = fy; a[o + 2] = fz; a[o + 3] = 0;
    a[o + 4] = ux; a[o + 5] = uy; a[o + 6] = uz; a[o + 7] = 0;
    a[o + 8] = rx; a[o + 9] = 0; a[o + 10] = rz; a[o + 11] = 0;
    a[o + 12] = px; a[o + 13] = py; a[o + 14] = pz; a[o + 15] = 1;
    const c = g.paint.instanceColor.array;
    c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2];
    g.owners[i] = owner;
  }
  end() {
    for (const k in this.groups) {
      const g = this.groups[k];
      g.detail.instanceMatrix.array.set(g.paint.instanceMatrix.array.subarray(0, g.n * 16));
      g.paint.count = g.n;
      g.detail.count = g.n;
      g.paint.instanceMatrix.needsUpdate = true;
      g.detail.instanceMatrix.needsUpdate = true;
      g.paint.instanceColor.needsUpdate = true;
    }
    this.beams.count = this.nBeam;
    if (this.beams.visible) this.beams.instanceMatrix.needsUpdate = true;
  }
  // Static instances (parked cars): list of {type, x, y, z, yaw, rgb}
  addStatic(scene, list) {
    const by = {};
    for (const it of list) (by[it.type] = by[it.type] || []).push(it);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (const k in by) {
      const arr = by[k], g = this.groups[k];
      const mp = new THREE.InstancedMesh(g.geoP, this.paintMat, arr.length);
      const md = new THREE.InstancedMesh(g.geoD, this.parkedDetailMat, arr.length);
      arr.forEach((it, i) => {
        p.set(it.x, it.y, it.z);
        q.setFromAxisAngle(up, it.yaw);
        m4.compose(p, q, s);
        mp.setMatrixAt(i, m4);
        md.setMatrixAt(i, m4);
        mp.setColorAt(i, col.setRGB(it.rgb[0], it.rgb[1], it.rgb[2]));
      });
      for (const m of [mp, md]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        m.matrixAutoUpdate = false;
        scene.add(m);
      }
    }
  }
  pick(raycaster) {
    let best = null;
    for (const k in this.groups) {
      const g = this.groups[k];
      if (!g.n) continue;
      g.paint.computeBoundingSphere();
      const hits = raycaster.intersectObject(g.paint, false);
      if (hits.length && (!best || hits[0].distance < best.distance)) {
        best = { distance: hits[0].distance, owner: g.owners[hits[0].instanceId] };
      }
      g.detail.boundingSphere = g.paint.boundingSphere;
      const h2 = raycaster.intersectObject(g.detail, false);
      if (h2.length && (!best || h2[0].distance < best.distance)) {
        best = { distance: h2[0].distance, owner: g.owners[h2[0].instanceId] };
      }
    }
    return best ? best.owner : null;
  }
}
