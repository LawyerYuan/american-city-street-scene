import * as THREE from 'three';
import { hexToRgb, TAU } from './util.js';

// Growable geometry builder with vertex colours and optional extra attributes.
export class Geo {
  constructor(extra = {}) {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.i = [];
    this.count = 0;
    this.extra = {};
    for (const k in extra) this.extra[k] = { size: extra[k], a: [] };
    this.cur = {};
    this.col = [1, 1, 1];
  }
  color(c) {
    this.col = typeof c === 'number' ? hexToRgb(c) : c;
    return this;
  }
  set(name, vals) {
    this.cur[name] = vals;
    return this;
  }
  v(x, y, z, nx, ny, nz, u = 0, v = 0) {
    this.p.push(x, y, z);
    this.n.push(nx, ny, nz);
    this.uv.push(u, v);
    this.c.push(this.col[0], this.col[1], this.col[2]);
    for (const k in this.extra) {
      const e = this.extra[k];
      const val = this.cur[k];
      for (let j = 0; j < e.size; j++) e.a.push(val ? val[j] : 0);
    }
    return this.count++;
  }
  // Quad with an explicit normal; winding is fixed automatically.
  quadN(p0, p1, p2, p3, nx, ny, nz, t0, t1, t2, t3) {
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz, t0 ? t0[0] : 0, t0 ? t0[1] : 0);
    const b = this.v(p1[0], p1[1], p1[2], nx, ny, nz, t1 ? t1[0] : 0, t1 ? t1[1] : 0);
    const c = this.v(p2[0], p2[1], p2[2], nx, ny, nz, t2 ? t2[0] : 0, t2 ? t2[1] : 0);
    const d = this.v(p3[0], p3[1], p3[2], nx, ny, nz, t3 ? t3[0] : 0, t3 ? t3[1] : 0);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * nx + gy * ny + gz * nz >= 0) this.i.push(a, b, c, a, c, d);
    else this.i.push(a, c, b, a, d, c);
  }
  triN(p0, p1, p2, nx, ny, nz, t0, t1, t2) {
    const a = this.v(p0[0], p0[1], p0[2], nx, ny, nz, t0 ? t0[0] : 0, t0 ? t0[1] : 0);
    const b = this.v(p1[0], p1[1], p1[2], nx, ny, nz, t1 ? t1[0] : 0, t1 ? t1[1] : 0);
    const c = this.v(p2[0], p2[1], p2[2], nx, ny, nz, t2 ? t2[0] : 0, t2 ? t2[1] : 0);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx * nx + gy * ny + gz * nz >= 0) this.i.push(a, b, c);
    else this.i.push(a, c, b);
  }
  // Smooth-shaded triangle (per-vertex normals). Winding fixed against average normal.
  triS(p0, n0, p1, n1, p2, n2, t0, t1, t2) {
    const a = this.v(p0[0], p0[1], p0[2], n0[0], n0[1], n0[2], t0 ? t0[0] : 0, t0 ? t0[1] : 0);
    const b = this.v(p1[0], p1[1], p1[2], n1[0], n1[1], n1[2], t1 ? t1[0] : 0, t1 ? t1[1] : 0);
    const c = this.v(p2[0], p2[1], p2[2], n2[0], n2[1], n2[2], t2 ? t2[0] : 0, t2 ? t2[1] : 0);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    const nx = n0[0] + n1[0] + n2[0], ny = n0[1] + n1[1] + n2[1], nz = n0[2] + n1[2] + n2[2];
    if (gx * nx + gy * ny + gz * nz >= 0) this.i.push(a, b, c);
    else this.i.push(a, c, b);
  }
  quadS(p0, n0, p1, n1, p2, n2, p3, n3, t0, t1, t2, t3) {
    this.triS(p0, n0, p1, n1, p2, n2, t0, t1, t2);
    this.triS(p0, n0, p2, n2, p3, n3, t0, t2, t3);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    for (const k in this.extra) {
      g.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k].a, this.extra[k].size));
    }
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Box standing on y0. rot: rotation about Y (x' = x cos - z sin, z' = x sin + z cos).
export function box(g, cx, y0, cz, sx, sy, sz, rot = 0, o = {}) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const hx = sx / 2, hz = sz / 2;
  const P = (lx, lz, y) => [cx + lx * c - lz * s, y, cz + lx * s + lz * c];
  const y1 = y0 + sy;
  const us = o.uvScale || 1;
  if (o.top !== false) {
    g.quadN(P(-hx, -hz, y1), P(hx, -hz, y1), P(hx, hz, y1), P(-hx, hz, y1), 0, 1, 0,
      [0, 0], [sx * us, 0], [sx * us, sz * us], [0, sz * us]);
  }
  if (o.bottom) {
    g.quadN(P(-hx, -hz, y0), P(hx, -hz, y0), P(hx, hz, y0), P(-hx, hz, y0), 0, -1, 0,
      [0, 0], [sx * us, 0], [sx * us, sz * us], [0, sz * us]);
  }
  if (o.sides !== false) {
    // +x
    g.quadN(P(hx, -hz, y0), P(hx, hz, y0), P(hx, hz, y1), P(hx, -hz, y1), c, 0, s,
      [0, 0], [sz * us, 0], [sz * us, sy * us], [0, sy * us]);
    // -x
    g.quadN(P(-hx, hz, y0), P(-hx, -hz, y0), P(-hx, -hz, y1), P(-hx, hz, y1), -c, 0, -s,
      [0, 0], [sz * us, 0], [sz * us, sy * us], [0, sy * us]);
    // +z
    g.quadN(P(-hx, hz, y0), P(hx, hz, y0), P(hx, hz, y1), P(-hx, hz, y1), -s, 0, c,
      [0, 0], [sx * us, 0], [sx * us, sy * us], [0, sy * us]);
    // -z
    g.quadN(P(hx, -hz, y0), P(-hx, -hz, y0), P(-hx, -hz, y1), P(hx, -hz, y1), s, 0, -c,
      [0, 0], [sx * us, 0], [sx * us, sy * us], [0, sy * us]);
  }
}

export function polyArea2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

// Flat polygon cap at height y facing up (ny=1) or down (ny=-1).
export function cap(g, pts, y, ny = 1, uvScale = 1) {
  const contour = pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const f of faces) {
    const a = pts[f[0]], b = pts[f[1]], c = pts[f[2]];
    g.triN([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], 0, ny, 0,
      [a[0] * uvScale, a[1] * uvScale], [b[0] * uvScale, b[1] * uvScale], [c[0] * uvScale, c[1] * uvScale]);
  }
}

// Vertical prism from polygon pts ([x,z]) between y0 and y1.
export function prism(g, pts, y0, y1, o = {}) {
  const sgn = polyArea2(pts) > 0 ? 1 : -1;
  let u = o.uOff || 0;
  const vb = o.vBase === undefined ? y0 : o.vBase;
  if (o.walls !== false) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const dx = q[0] - p[0], dz = q[1] - p[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const nx = (sgn * dz) / len, nz = (-sgn * dx) / len;
      g.quadN([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], nx, 0, nz,
        [u, y0 - vb], [u + len, y0 - vb], [u + len, y1 - vb], [u, y1 - vb]);
      u += len;
    }
  }
  if (o.cap !== false) cap(g, pts, y1, 1, o.capUv || 1);
  if (o.bottom) cap(g, pts, y0, -1, o.capUv || 1);
}

// Rounded rectangle outline ([x,z] list). r may be an array of 4 radii: [x0z0, x1z0, x1z1, x0z1].
export function roundRect(x0, z0, x1, z1, r = 0, seg = 5) {
  const R = Array.isArray(r) ? r : [r, r, r, r];
  const pts = [];
  const corner = (cx, cz, rad, a0) => {
    if (rad <= 0.01) {
      pts.push([cx, cz]);
      return;
    }
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
    }
  };
  // order: (x0,z0) -> (x1,z0) -> (x1,z1) -> (x0,z1)
  corner(x0 + R[0], z0 + R[0], R[0], Math.PI);
  corner(x1 - R[1], z0 + R[1], R[1], -Math.PI / 2);
  corner(x1 - R[2], z1 - R[2], R[2], 0);
  corner(x0 + R[3], z1 - R[3], R[3], Math.PI / 2);
  // fix sharp corners (rad 0) positions
  return pts;
}

// Cylinder / cone frustum standing on y0, smooth shaded.
export function cyl(g, cx, y0, cz, r0, r1, h, seg = 12, o = {}) {
  const y1 = y0 + h;
  const sl = (r0 - r1) / h;
  const nl = 1 / Math.hypot(1, sl);
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const n0 = [c0 * nl, sl * nl, s0 * nl], n1 = [c1 * nl, sl * nl, s1 * nl];
    g.quadS(
      [cx + c0 * r0, y0, cz + s0 * r0], n0,
      [cx + c1 * r0, y0, cz + s1 * r0], n1,
      [cx + c1 * r1, y1, cz + s1 * r1], n1,
      [cx + c0 * r1, y1, cz + s0 * r1], n0,
      [(i / seg) * TAU * r0, 0], [((i + 1) / seg) * TAU * r0, 0], [((i + 1) / seg) * TAU * r0, h], [(i / seg) * TAU * r0, h]);
    if (o.top !== false && r1 > 0.001) {
      g.triN([cx, y1, cz], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], 0, 1, 0);
    }
    if (o.bottom) {
      g.triN([cx, y0, cz], [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0], 0, -1, 0);
    }
  }
}

// Lathe: profile [[r,y],...] revolved around the vertical axis at (cx,cz). Smooth around, flat along profile.
export function lathe(g, cx, cz, profile, seg = 24) {
  for (let k = 0; k < profile.length - 1; k++) {
    const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
    const dr = r1 - r0, dy = y1 - y0;
    const l = Math.hypot(dr, dy) || 1;
    // outward normal in (r,y) plane: (dy, -dr) / l (points outward when profile goes upward)
    const nr = dy / l, ny = -dr / l;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const n0 = [c0 * nr, ny, s0 * nr], n1 = [c1 * nr, ny, s1 * nr];
      const u0 = (i / seg), u1 = ((i + 1) / seg);
      if (r0 < 0.001) {
        g.triS([cx, y0, cz], [0, Math.sign(ny) || 1, 0], [cx + c1 * r1, y1, cz + s1 * r1], n1, [cx + c0 * r1, y1, cz + s0 * r1], n0);
      } else if (r1 < 0.001) {
        g.triS([cx + c0 * r0, y0, cz + s0 * r0], n0, [cx + c1 * r0, y0, cz + s1 * r0], n1, [cx, y1, cz], [0, Math.sign(ny) || 1, 0]);
      } else {
        g.quadS(
          [cx + c0 * r0, y0, cz + s0 * r0], n0,
          [cx + c1 * r0, y0, cz + s1 * r0], n1,
          [cx + c1 * r1, y1, cz + s1 * r1], n1,
          [cx + c0 * r1, y1, cz + s0 * r1], n0,
          [u0, y0], [u1, y0], [u1, y1], [u0, y1]);
      }
    }
  }
}

// Sweep a 2D cross-section along frames.
// frames: [{x,y,z, nx,nz, s}], (nx,nz) = unit right-hand normal in the ground plane.
// section: [[lateral, vertical], ...] polyline; closed = true wraps last->first.
// Normals are flat per section segment, pointing away from the section centroid.
export function sweep(g, frames, section, o = {}) {
  const closed = o.closed !== false;
  const m = section.length;
  let cl = 0, cv = 0;
  for (const p of section) {
    cl += p[0];
    cv += p[1];
  }
  cl /= m;
  cv /= m;
  const segs = closed ? m : m - 1;
  for (let j = 0; j < segs; j++) {
    const a = section[j], b = section[(j + 1) % m];
    const dl = b[0] - a[0], dv = b[1] - a[1];
    const len = Math.hypot(dl, dv);
    if (len < 1e-6) continue;
    let nl = dv / len, nv = -dl / len;
    const ml = (a[0] + b[0]) / 2 - cl, mv = (a[1] + b[1]) / 2 - cv;
    if (o.normalOut) {
      nl = o.normalOut[j][0];
      nv = o.normalOut[j][1];
    } else if (nl * ml + nv * mv < 0) {
      nl = -nl;
      nv = -nv;
    }
    for (let k = 0; k < frames.length - 1; k++) {
      const f0 = frames[k], f1 = frames[k + 1];
      if (f0.skip || f1.gap) continue;
      const p0 = [f0.x + f0.nx * a[0], f0.y + a[1], f0.z + f0.nz * a[0]];
      const p1 = [f0.x + f0.nx * b[0], f0.y + b[1], f0.z + f0.nz * b[0]];
      const p2 = [f1.x + f1.nx * b[0], f1.y + b[1], f1.z + f1.nz * b[0]];
      const p3 = [f1.x + f1.nx * a[0], f1.y + a[1], f1.z + f1.nz * a[0]];
      const n0 = [f0.nx * nl, nv, f0.nz * nl], n1 = [f1.nx * nl, nv, f1.nz * nl];
      const ua = o.uvLateral ? a[0] : a[1], ub = o.uvLateral ? b[0] : b[1];
      g.quadS(p0, n0, p1, n0, p2, n1, p3, n1, [ua, f0.s], [ub, f0.s], [ub, f1.s], [ua, f1.s]);
    }
  }
  if (o.capStart || o.capEnd) {
    const doCap = (f, sign) => {
      // tangent direction = normal x up -> forward = (nz, 0, -nx) * -1 ; forward f = (-nz... ) derive: right = (-d.z, d.x) => d = (nz, -nx)
      const dx = f.nz, dz = -f.nx;
      const pts = section.map((p) => [f.x + f.nx * p[0], f.y + p[1], f.z + f.nz * p[0]]);
      for (let j = 1; j < m - 1; j++) {
        g.triN(pts[0], pts[j], pts[j + 1], dx * sign, 0, dz * sign);
      }
    };
    if (o.capStart) doCap(frames[0], -1);
    if (o.capEnd) doCap(frames[frames.length - 1], 1);
  }
}

export function mesh(geo, material, o = {}) {
  const m = new THREE.Mesh(geo.build ? geo.build() : geo, material);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  m.matrixAutoUpdate = false;
  m.frustumCulled = o.cull === true;
  if (o.order !== undefined) m.renderOrder = o.order;
  return m;
}
