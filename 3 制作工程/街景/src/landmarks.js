// Landmarks: observation tower, pier with a giant wheel, bridge houses, a truss bridge, river boats.
import * as THREE from 'three';
import { Geo, box, cyl, lathe, cap } from './geo.js';
import { HALF, CURB_H, RIVER_X, WATER_Y, EW, ST } from './layout.js';
import { hexToRgb, TAU } from './util.js';
import { ATLAS } from './textures.js';
import { COL } from './ground.js';

const rgb = hexToRgb;

// Box beam between two points.
export function beam(g, a, b, t) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const ax = [dx / len, dy / len, dz / len];
  let up = Math.abs(ax[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  // u = normalize(up x ax), v = ax x u
  let u = [up[1] * ax[2] - up[2] * ax[1], up[2] * ax[0] - up[0] * ax[2], up[0] * ax[1] - up[1] * ax[0]];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]];
  const h = t / 2;
  const P = (p, su, sv) => [p[0] + u[0] * su * h + v[0] * sv * h, p[1] + u[1] * su * h + v[1] * sv * h, p[2] + u[2] * su * h + v[2] * sv * h];
  const sides = [[1, 0, u], [-1, 0, [-u[0], -u[1], -u[2]]], [0, 1, v], [0, -1, [-v[0], -v[1], -v[2]]]];
  for (const [su, sv, n] of sides) {
    let c0, c1;
    if (su !== 0) {
      c0 = [su, -1];
      c1 = [su, 1];
    } else {
      c0 = [-1, sv];
      c1 = [1, sv];
    }
    g.quadN(P(a, c0[0], c0[1]), P(a, c1[0], c1[1]), P(b, c1[0], c1[1]), P(b, c0[0], c0[1]), n[0], n[1], n[2]);
  }
}

function signQuad(S, cx, cy, cz, nx, nz, w, h, name) {
  const r = ATLAS.r[name];
  const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;
  S.color([1, 1, 1]);
  S.quadN([cx - rx * hw, cy - hh, cz - rz * hw], [cx + rx * hw, cy - hh, cz + rz * hw], [cx + rx * hw, cy + hh, cz + rz * hw], [cx - rx * hw, cy + hh, cz - rz * hw],
    nx, 0, nz, [r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]);
}

// ---- observation tower ------------------------------------------------------------------
export function buildObservationTower(B, lot, trees, beacons) {
  const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
  const y0 = CURB_H;
  // plaza rings
  const ring = (g, r, y, col, n = 48) => {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([cx + Math.cos((i / n) * TAU) * r, cz + Math.sin((i / n) * TAU) * r]);
    g.color(col);
    cap(g, pts, y, 1);
  };
  ring(B.grass, 40, y0 + 0.03, COL.grass);
  ring(B.paver, 29, y0 + 0.05, [0.86, 0.82, 0.76]);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + 0.1;
    trees.push({ x: cx + Math.cos(a) * 35, z: cz + Math.sin(a) * 35, s: 1.0, park: true });
  }
  // base pavilion
  B.conc.color(rgb(0xcfcbc1));
  cyl(B.conc, cx, y0, cz, 17, 17, 1.0, 40, { top: true });
  B.glass.color([1, 1, 1]);
  cyl(B.glass, cx, y0 + 1.0, cz, 15.5, 15.5, 5.2, 40, { top: false });
  B.conc.color(rgb(0xe2dfd6));
  cyl(B.conc, cx, y0 + 6.2, cz, 17.5, 16.5, 1.1, 40, { top: true });
  // shaft
  B.conc.color(rgb(0xdedbd2));
  lathe(B.conc, cx, cz, [[8.8, y0 + 7.3], [7.0, y0 + 20], [5.9, y0 + 62], [5.3, y0 + 138]], 20);
  // vertical ribs
  B.conc.color(rgb(0xc9c5bb));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    beam(B.conc, [cx + Math.cos(a) * 8.6, y0 + 7.3, cz + Math.sin(a) * 8.6], [cx + Math.cos(a) * 5.5, y0 + 138, cz + Math.sin(a) * 5.5], 1.1);
  }
  // pod
  const p0 = y0 + 138;
  B.plain.color(rgb(0xa8553a));
  lathe(B.plain, cx, cz, [[5.3, p0], [18.6, p0 + 11]], 40);
  B.plain.color(rgb(0xe9e6de));
  lathe(B.plain, cx, cz, [[18.6, p0 + 11], [19.6, p0 + 11.3], [19.6, p0 + 12.2]], 40);
  B.glass.color([1, 1, 1]);
  lathe(B.glass, cx, cz, [[19.3, p0 + 12.2], [19.7, p0 + 17.4]], 40);
  B.plain.color(rgb(0xe9e6de));
  lathe(B.plain, cx, cz, [[19.7, p0 + 17.4], [20.6, p0 + 17.7], [20.6, p0 + 18.6], [18.8, p0 + 19.0]], 40);
  B.plain.color(rgb(0xb9bcc0));
  lathe(B.plain, cx, cz, [[18.8, p0 + 19.0], [7.0, p0 + 23.6], [3.2, p0 + 24.4]], 40);
  B.plain.color(rgb(0xdedbd2));
  lathe(B.plain, cx, cz, [[3.2, p0 + 24.4], [2.4, p0 + 31], [0.0, p0 + 31.01]], 16);
  B.steel.color(rgb(0xd8d8d6));
  cyl(B.steel, cx, p0 + 31, cz, 0.7, 0.2, 14, 8, { top: false });
  B.steel.color(rgb(0xb23a2a));
  cyl(B.steel, cx, p0 + 45, cz, 0.2, 0.05, 9, 6, { top: false });
  beacons.push([cx, p0 + 54, cz]);
  for (let i = 0; i < 4; i++) beacons.push([cx + Math.cos((i / 4) * TAU) * 20.6, p0 + 18.8, cz + Math.sin((i / 4) * TAU) * 20.6]);
}

// ---- pier + giant wheel ---------------------------------------------------------------
export const WHEEL = { x: -286, y: CURB_H + 36, z: -78, r: 30, n: 36 };

export function buildPier(B, trees) {
  const P = B.plain;
  // railings around the pier deck
  const x0 = -318, x1 = RIVER_X, z0 = -94, z1 = -26;
  B.steel.color(rgb(0xe8e8e4));
  const rail = (ax, az, bx, bz) => {
    beam(B.steel, [ax, CURB_H + 1.05, az], [bx, CURB_H + 1.05, bz], 0.09);
    beam(B.steel, [ax, CURB_H + 0.55, az], [bx, CURB_H + 0.55, bz], 0.06);
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(B.steel, ax + (bx - ax) * t, CURB_H, az + (bz - az) * t, 0.09, 1.05, 0.09, 0);
    }
  };
  rail(x0, z0, x1 - 2, z0);
  rail(x0, z1, x1 - 2, z1);
  rail(x0, z0, x0, z1);
  // entrance arch facing the turnaround
  const ax = RIVER_X + 1.5;
  P.color(rgb(0xe9e4d6));
  box(P, ax, CURB_H, -60 - 9, 1.6, 9, 1.6, 0);
  box(P, ax, CURB_H, -60 + 9, 1.6, 9, 1.6, 0);
  P.color(rgb(0x123a5a));
  box(P, ax, CURB_H + 7.0, -60, 1.0, 3.2, 19.6, 0, { bottom: true });
  signQuad(B.sign, ax + 0.52, CURB_H + 8.6, -60, 1, 0, 16, 2.6, 'pier');
  signQuad(B.sign, ax - 0.52, CURB_H + 8.6, -60, -1, 0, 16, 2.6, 'pier');
  // carousel: striped cone roof
  {
    const cx = -262, cz = -44, r = 8;
    B.conc.color(rgb(0xd9d4c6));
    cyl(B.conc, cx, CURB_H, cz, r, r, 0.5, 20);
    P.color(rgb(0xf2e9d0));
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      box(P, cx + Math.cos(a) * (r - 0.6), CURB_H + 0.5, cz + Math.sin(a) * (r - 0.6), 0.28, 3.3, 0.28, 0);
    }
    const n = 20, apex = [cx, CURB_H + 7.4, cz];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, am = (a0 + a1) / 2;
      P.color(i % 2 ? rgb(0xf4efe2) : rgb(0xc8102e));
      const p = [cx + Math.cos(a0) * (r + 0.5), CURB_H + 3.8, cz + Math.sin(a0) * (r + 0.5)];
      const q = [cx + Math.cos(a1) * (r + 0.5), CURB_H + 3.8, cz + Math.sin(a1) * (r + 0.5)];
      P.triN(p, q, apex, Math.cos(am) * 0.4, 0.92, Math.sin(am) * 0.4);
    }
    P.color(rgb(0xe9b824));
    cyl(P, cx, CURB_H + 7.3, cz, 0.3, 0.05, 1.6, 6);
  }
  // kiosks and tents
  const tents = [[-256, -70, 0xf4efe2, 0x1f6fb5], [-264, -66, 0xf4efe2, 0xe9b824], [-300, -42, 0xf4efe2, 0x2a9d5c], [-306, -52, 0xf4efe2, 0xc8102e], [-290, -38, 0xe8d9b8, 0xd9621e]];
  for (const [x, z, c1, c2] of tents) {
    P.color(rgb(c1));
    box(P, x, CURB_H, z, 4.2, 2.5, 3.6, 0, { top: false });
    P.color(rgb(c2));
    const y = CURB_H + 2.5;
    const A = [x, y + 1.7, z];
    const c = [[x - 2.5, y, z - 2.2], [x + 2.5, y, z - 2.2], [x + 2.5, y, z + 2.2], [x - 2.5, y, z + 2.2]];
    for (let i = 0; i < 4; i++) {
      const p = c[i], q = c[(i + 1) % 4];
      P.triN(p, q, A, ((p[0] + q[0]) / 2 - x) * 0.3, 0.9, ((p[2] + q[2]) / 2 - z) * 0.3);
    }
  }
  // wheel supports (static)
  const W = WHEEL;
  B.steel.color(rgb(0xf0f0ee));
  for (const sz of [-1, 1]) {
    const hub = [W.x, W.y, W.z + sz * 3.4];
    for (const sx of [-1, 1]) beam(B.steel, [W.x + sx * 14, CURB_H, W.z + sz * 8.5], hub, 1.0);
    beam(B.steel, [W.x - 9.2, CURB_H + 12, W.z + sz * 6.8], [W.x + 9.2, CURB_H + 12, W.z + sz * 6.8], 0.5);
  }
  // boarding platform
  B.conc.color(rgb(0xbdb9af));
  box(B.conc, W.x, CURB_H, W.z, 16, 1.6, 9, 0);
  // a few trees in planters along the pier's south edge
  for (let x = -310; x < -250; x += 12) trees.push({ x, z: -30.5, s: 0.7 });
}

export class Wheel {
  constructor(scene, M) {
    const W = WHEEL;
    const g = new Geo();
    g.color(rgb(0xf4f4f2));
    // rims, inner rings, spokes, built in the wheel's local frame (centre at origin, rotating about Z)
    const ringPts = (r, n) => {
      const a = [];
      for (let i = 0; i < n; i++) a.push([Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r]);
      return a;
    };
    for (const sz of [-1.7, 1.7]) {
      const rim = ringPts(W.r, 72), inner = ringPts(W.r * 0.55, 48);
      for (let i = 0; i < 72; i++) beam(g, [rim[i][0], rim[i][1], sz], [rim[(i + 1) % 72][0], rim[(i + 1) % 72][1], sz], 0.42);
      for (let i = 0; i < 48; i++) beam(g, [inner[i][0], inner[i][1], sz], [inner[(i + 1) % 48][0], inner[(i + 1) % 48][1], sz], 0.2);
      for (let i = 0; i < W.n; i++) {
        const a = (i / W.n) * TAU;
        beam(g, [Math.cos(a) * 1.4, Math.sin(a) * 1.4, sz * 0.8], [Math.cos(a) * W.r, Math.sin(a) * W.r, sz], 0.16);
      }
    }
    for (let i = 0; i < W.n; i++) {
      const a = (i / W.n) * TAU;
      beam(g, [Math.cos(a) * W.r, Math.sin(a) * W.r, -1.7], [Math.cos(a) * W.r, Math.sin(a) * W.r, 1.7], 0.22);
    }
    // hub
    g.color(rgb(0xc8102e));
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * TAU, a1 = ((i + 1) / 12) * TAU;
      beam(g, [Math.cos(a0) * 1.7, Math.sin(a0) * 1.7, 0], [Math.cos(a1) * 1.7, Math.sin(a1) * 1.7, 0], 4.0);
    }
    this.group = new THREE.Group();
    this.group.position.set(W.x, W.y, W.z);
    const mesh = new THREE.Mesh(g.build(), M.steel);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    // rim lights
    const lp = [], lc = [];
    const c = new THREE.Color();
    for (let i = 0; i < 144; i++) {
      const a = (i / 144) * TAU;
      for (const sz of [-1.9, 1.9]) {
        lp.push(Math.cos(a) * W.r, Math.sin(a) * W.r, sz);
        c.setHSL((i / 144) * 3 % 1, 0.9, 0.6);
        lc.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < W.n; i++) {
      const a = (i / W.n) * TAU;
      for (let k = 3; k < 12; k += 2) {
        lp.push(Math.cos(a) * (W.r * k) / 12, Math.sin(a) * (W.r * k) / 12, 1.95);
        lc.push(1, 0.9, 0.6);
      }
    }
    this.lightPos = lp;
    this.lightCol = lc;
    scene.add(this.group);
    // gondolas
    const cg = new Geo();
    cg.color([1, 1, 1]);
    box(cg, 0, -3.0, 0, 2.5, 0.9, 2.3, 0, { bottom: true });
    box(cg, 0, -0.9, 0, 2.7, 0.25, 2.5, 0, { bottom: true });
    cg.color([0.08, 0.1, 0.12]);
    box(cg, 0, -2.1, 0, 2.4, 1.2, 2.2, 0);
    cg.color([0.6, 0.6, 0.6]);
    box(cg, 0, -0.65, 0, 0.14, 0.7, 0.14, 0);
    this.cabs = new THREE.InstancedMesh(cg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 }), W.n);
    this.cabs.castShadow = true;
    this.cabs.frustumCulled = false;
    const cols = [0xf4f4f2, 0xc8102e, 0xe9b824, 0x1f6fb5];
    for (let i = 0; i < W.n; i++) this.cabs.setColorAt(i, new THREE.Color(cols[i % 4]));
    scene.add(this.cabs);
    this.m = new THREE.Matrix4();
    this.angle = 0;
    this.update(0);
  }
  update(dt) {
    const W = WHEEL;
    this.angle += dt * (TAU / 150);
    this.group.rotation.z = this.angle;
    for (let i = 0; i < W.n; i++) {
      const a = (i / W.n) * TAU + this.angle;
      this.m.makeTranslation(W.x + Math.cos(a) * W.r, W.y + Math.sin(a) * W.r, W.z);
      this.cabs.setMatrixAt(i, this.m);
    }
    this.cabs.instanceMatrix.needsUpdate = true;
  }
}

// ---- bridges: houses, railings, one through-truss --------------------------------------
export function buildBridges(B) {
  const P = B.plain;
  for (const S of EW) {
    if (S.id === 'MAIN') continue;
    const hw = S.halfRow + 0.3;
    // parapet railings
    B.steel.color(rgb(0x2f4a44));
    for (const sg of [-1, 1]) {
      const z = S.pos + sg * (hw - 0.12);
      box(B.steel, (-HALF + RIVER_X) / 2, CURB_H, z, RIVER_X + HALF, 0.28, 0.3, 0);
      box(B.steel, (-HALF + RIVER_X) / 2, CURB_H + 1.05, z, RIVER_X + HALF, 0.1, 0.16, 0);
      for (let x = -HALF + 1; x < RIVER_X; x += 2.4) box(B.steel, x, CURB_H + 0.28, z, 0.1, 0.78, 0.1, 0);
      // bridge house at the city end
      const hx = RIVER_X - 5.5, hz = S.pos + sg * (hw + 3.0);
      B.conc.color(rgb(0x8d877c));
      box(B.conc, hx, WATER_Y - 4, hz, 7.4, CURB_H - (WATER_Y - 4), 7.4, 0);
      P.color(rgb(0xcfc6b2));
      box(P, hx, CURB_H, hz, 5.6, 7.2, 5.6, 0, { top: false });
      P.color(rgb(0x27323a));
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        box(P, hx + nx * 2.82, CURB_H + 3.6, hz + nz * 2.82, nx ? 0.06 : 2.2, 2.0, nz ? 0.06 : 2.2, 0, { bottom: true });
      }
      P.color(rgb(0x4f8f7a));
      const y = CURB_H + 7.2, A = [hx, y + 3.6, hz];
      const c = [[hx - 3.2, y, hz - 3.2], [hx + 3.2, y, hz - 3.2], [hx + 3.2, y, hz + 3.2], [hx - 3.2, y, hz + 3.2]];
      for (let i = 0; i < 4; i++) {
        const p = c[i], q = c[(i + 1) % 4];
        P.triN(p, q, A, ((p[0] + q[0]) / 2 - hx) * 0.25, 0.75, ((p[2] + q[2]) / 2 - hz) * 0.25);
      }
    }
  }
  // through-truss on Front St (z = 300)
  {
    const S = ST.F, hw = S.halfCurb + 0.9, top = 9.5, bot = CURB_H + 0.3;
    B.steel.color(rgb(0x3c5a52));
    const xs = [];
    for (let x = RIVER_X - 4; x >= -HALF + 2; x -= 9.6) xs.push(x);
    for (const sg of [-1, 1]) {
      const z = S.pos + sg * hw;
      beam(B.steel, [xs[0], top, z], [xs[xs.length - 1], top, z], 0.7);
      beam(B.steel, [xs[0], bot, z], [xs[xs.length - 1], bot, z], 0.6);
      for (let i = 0; i < xs.length; i++) {
        beam(B.steel, [xs[i], bot, z], [xs[i], top, z], 0.45);
        if (i < xs.length - 1) {
          if (i % 2 === 0) beam(B.steel, [xs[i], bot, z], [xs[i + 1], top, z], 0.38);
          else beam(B.steel, [xs[i], top, z], [xs[i + 1], bot, z], 0.38);
        }
      }
    }
    for (let i = 0; i < xs.length; i++) {
      beam(B.steel, [xs[i], top, S.pos - hw], [xs[i], top, S.pos + hw], 0.4);
      if (i < xs.length - 1) beam(B.steel, [xs[i], top, S.pos - hw], [xs[i + 1], top, S.pos + hw], 0.22);
    }
  }
}

// ---- boats ------------------------------------------------------------------------------
function tourBoat() {
  const g = new Geo();
  g.color(rgb(0xf2f2ee));
  // hull along +X
  box(g, -1, 0.1, 0, 21, 1.5, 5.4, 0, { bottom: true });
  g.triN([9.5, 0.1, -2.7], [9.5, 0.1, 2.7], [13, 1.6, 0], 0, -1, 0);
  g.quadN([9.5, 0.1, -2.7], [13, 1.6, 0], [9.5, 1.6, -2.7], [9.5, 1.6, -2.7], 0.6, 0, -0.8);
  g.quadN([9.5, 0.1, 2.7], [13, 1.6, 0], [9.5, 1.6, 2.7], [9.5, 1.6, 2.7], 0.6, 0, 0.8);
  g.triN([9.5, 1.6, -2.7], [9.5, 1.6, 2.7], [13, 1.6, 0], 0, 1, 0);
  g.color(rgb(0x1f4e8c));
  box(g, -1, 0.75, 0, 21.05, 0.3, 5.45, 0, { top: false });
  g.color(rgb(0x1d2a33));
  box(g, -2.5, 1.6, 0, 13, 1.5, 4.4, 0);
  g.color(rgb(0xf2f2ee));
  box(g, -2.5, 3.1, 0, 14, 0.18, 5.0, 0, { bottom: true });
  for (const x of [-8, -4, 0, 3.5]) {
    for (const z of [-2.3, 2.3]) box(g, x, 3.28, z, 0.1, 1.9, 0.1, 0);
  }
  g.color(rgb(0xe9b824));
  box(g, -2.5, 5.15, 0, 13.5, 0.14, 5.0, 0, { bottom: true });
  return g;
}
function barge() {
  const g = new Geo();
  g.color(rgb(0x3a3d40));
  box(g, -4, 0.1, 0, 30, 1.7, 9, 0, { bottom: true });
  const piles = [[-13, 0x8d7a5a], [-6, 0x6a6c70], [1, 0xb79b6b], [7, 0x55504a]];
  for (const [x, c] of piles) {
    g.color(rgb(c));
    const A = [x, 4.2, 0];
    const cc = [[x - 3.2, 1.8, -3.6], [x + 3.2, 1.8, -3.6], [x + 3.2, 1.8, 3.6], [x - 3.2, 1.8, 3.6]];
    for (let i = 0; i < 4; i++) g.triN(cc[i], cc[(i + 1) % 4], A, ((cc[i][0] + cc[(i + 1) % 4][0]) / 2 - x) * 0.3, 0.8, ((cc[i][2] + cc[(i + 1) % 4][2]) / 2) * 0.25);
  }
  // tug pushing from behind
  g.color(rgb(0xb23a2a));
  box(g, -24, 0.1, 0, 8.5, 1.7, 4.6, 0, { bottom: true });
  g.color(rgb(0xf2f2ee));
  box(g, -24.5, 1.8, 0, 4.2, 2.3, 3.4, 0);
  g.color(rgb(0x1d2a33));
  box(g, -23.6, 4.1, 0, 2.4, 1.5, 2.8, 0);
  g.color(rgb(0x222222));
  cyl(g, -26, 4.1, 0, 0.35, 0.3, 2.2, 8);
  return g;
}
function taxiBoat() {
  const g = new Geo();
  g.color(rgb(0xf5c400));
  box(g, 0, 0.1, 0, 9.5, 1.1, 3.2, 0, { bottom: true });
  g.triN([4.75, 0.1, -1.6], [4.75, 0.1, 1.6], [7, 1.2, 0], 0, -1, 0);
  g.triN([4.75, 1.2, -1.6], [4.75, 1.2, 1.6], [7, 1.2, 0], 0, 1, 0);
  g.quadN([4.75, 0.1, -1.6], [7, 1.2, 0], [4.75, 1.2, -1.6], [4.75, 1.2, -1.6], 0.6, 0, -0.8);
  g.quadN([4.75, 0.1, 1.6], [7, 1.2, 0], [4.75, 1.2, 1.6], [4.75, 1.2, 1.6], 0.6, 0, 0.8);
  g.color(rgb(0x1d2a33));
  box(g, -0.6, 1.2, 0, 5.5, 1.3, 2.7, 0);
  g.color(rgb(0x111111));
  box(g, -0.6, 2.5, 0, 5.8, 0.12, 2.9, 0, { bottom: true });
  return g;
}

export class Boats {
  constructor(scene, M, clip) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, clippingPlanes: clip, clipShadows: true });
    const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, clippingPlanes: clip, map: M.glow });
    this.wakeMat = wakeMat;
    const defs = [
      { g: tourBoat(), x: -341, dir: 1, v: 4.2, z: -250, wake: 16 },
      { g: barge(), x: -348, dir: -1, v: 2.6, z: 120, wake: 26 },
      { g: taxiBoat(), x: -333, dir: -1, v: 6.5, z: 300, wake: 9 },
      { g: taxiBoat(), x: -338, dir: 1, v: 5.8, z: 40, wake: 9 },
    ];
    this.boats = defs.map((d) => {
      const mesh = new THREE.Mesh(d.g.build(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      const grp = new THREE.Group();
      grp.add(mesh);
      const wake = new THREE.Mesh(new THREE.PlaneGeometry(d.wake * 3.2, d.wake), wakeMat);
      wake.rotation.x = -Math.PI / 2;
      wake.position.set(-d.wake * 1.5, 0.06, 0);
      wake.userData.noAO = true;
      wake.frustumCulled = false;
      grp.add(wake);
      // +X forward; heading along +z (dir 1) or -z
      grp.rotation.y = d.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      grp.position.set(d.x, WATER_Y, d.z);
      scene.add(grp);
      return { grp, d, z: d.z, ph: Math.random() * 6 };
    });
  }
  update(dt, t) {
    for (const b of this.boats) {
      b.z += b.d.dir * b.d.v * dt;
      const lim = HALF + 70;
      if (b.z > lim) b.z = -lim;
      if (b.z < -lim) b.z = lim;
      b.grp.position.z = b.z;
      b.grp.position.y = WATER_Y + Math.sin(t * 1.3 + b.ph) * 0.05 - 0.05;
      b.grp.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.012;
    }
  }
}
