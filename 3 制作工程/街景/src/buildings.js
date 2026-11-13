// Buildings: block plan, parametric generators (glass towers, setback towers, slabs, mid-rises, garages, shops).
import { Geo, box, cap, cyl, roundRect, polyArea2 } from './geo.js';
import { BLOCKS, HALF, CURB_H } from './layout.js';
import { RNG, hexToRgb, TAU, clamp } from './util.js';
import { ATLAS } from './textures.js';
import { COL, flat } from './ground.js';
import { PAINTS } from './vehicles.js';

const rgb = hexToRgb;
const GLASS = [0x4f86b8, 0x4d8f96, 0x2f5275, 0x3d6b5e, 0x6b5747, 0x27303a, 0x9fb3c2, 0x7aa6cc, 0x5b7fa6, 0x3f6f8f, 0xa38a55, 0x36506b];
const FRAME = [0xc9ccd0, 0x8f9499, 0x3a3d42, 0xd9d6cc, 0x6c7076, 0xb7b0a2];
const STONE = [0xd6cdb8, 0xddd3bb, 0xc4b79c, 0x9a9b9f, 0xbfa27d, 0xe3e1da, 0xb9907e];
const BRICK = [0x8c4a38, 0x6e4b3b, 0x9b5a40, 0x7a3f33, 0xa67c5b, 0x8a6a55, 0xb89b77, 0x5f4a42];
const ROOF = [0x6e6c68, 0x5a5957, 0x7d7a73, 0x4c4d50, 0x8a8880, 0xc9c8c2].map(rgb);

function st(id, wall, glass, bay, floor, param) {
  return { id, wall: rgb(wall), glassRgb: rgb(glass), bay, floor, param };
}
const curtain = (glass, frame, o = {}) => st(0, frame, glass, o.bay || 1.6, o.floor || 4.0, [o.mull || 0.045, o.span || 0.24, o.solid || 0, 0]);
const ribbon = (glass, wall, o = {}) => st(1, wall, glass, o.bay || 3.2, o.floor || 3.9, [0, o.wh || 0.5, o.sill || 0.28, 0]);
const punched = (glass, wall, o = {}) => st(2, wall, glass, o.bay || 2.6, o.floor || 3.5, [o.ww || 0.52, o.wh || 0.56, o.sill || 0.24, 0]);
const piers = (glass, wall, o = {}) => st(3, wall, glass, o.bay || 2.4, o.floor || 3.7, [o.pier || 0.2, o.wh || 0.64, 0.2, 0]);
const balcony = (glass, wall, o = {}) => st(4, wall, glass, o.bay || 3.4, o.floor || 3.1, [0, 0, 0, 0]);
const garageSt = (wall) => st(5, wall, 0x111111, 7.5, 3.2, [0, 0, 0, 0]);
const blank = (wall, o = {}) => st(6, wall, 0x111111, o.bay || 3, o.floor || 3, [0, 0, 0, 0]);
const store = (glass, wall) => st(7, wall, glass, 5.5, 5.0, [0, 0, 0, 0]);

// ---- polygons ---------------------------------------------------------------------
const rectP = (R) => [[R.x0, R.z0], [R.x1, R.z0], [R.x1, R.z1], [R.x0, R.z1]];
const insetR = (R, d) => ({ x0: R.x0 + d, x1: R.x1 - d, z0: R.z0 + d, z1: R.z1 - d });
const sizeR = (R) => [R.x1 - R.x0, R.z1 - R.z0];
const centerR = (R) => [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2];
function scaleR(R, f) {
  const [cx, cz] = centerR(R), [w, d] = sizeR(R);
  return { x0: cx - (w * f) / 2, x1: cx + (w * f) / 2, z0: cz - (d * f) / 2, z1: cz + (d * f) / 2 };
}
function fitR(R, maxW, maxD, ax = 0.5, az = 0.5) {
  const [w, d] = sizeR(R);
  const nw = Math.min(w, maxW), nd = Math.min(d, maxD);
  const x0 = R.x0 + (w - nw) * ax, z0 = R.z0 + (d - nd) * az;
  return { x0, x1: x0 + nw, z0, z1: z0 + nd };
}
function chamferP(R, c) {
  return [[R.x0 + c, R.z0], [R.x1 - c, R.z0], [R.x1, R.z0 + c], [R.x1, R.z1 - c], [R.x1 - c, R.z1], [R.x0 + c, R.z1], [R.x0, R.z1 - c], [R.x0, R.z0 + c]];
}
function notchP(R, c) {
  const { x0, x1, z0, z1 } = R;
  return [[x0 + c, z0], [x1 - c, z0], [x1 - c, z0 + c], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0 + c, z1 - c], [x0, z1 - c], [x0, z0 + c], [x0 + c, z0 + c]];
}
function circleP(cx, cz, r, n = 28) {
  const p = [];
  for (let i = 0; i < n; i++) p.push([cx + Math.cos((i / n) * TAU) * r, cz + Math.sin((i / n) * TAU) * r]);
  return p;
}
function shapeP(shape, R) {
  const [w, d] = sizeR(R), m = Math.min(w, d);
  if (shape === 'chamfer') return chamferP(R, m * 0.17);
  if (shape === 'round') return roundRect(R.x0, R.z0, R.x1, R.z1, m * 0.3, 5);
  if (shape === 'notch') return notchP(R, m * 0.14);
  if (shape === 'circle') return circleP((R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2, m / 2, 32);
  return rectP(R);
}
function insetP(pts, d) {
  const n = pts.length, sgn = polyArea2(pts) > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    let ax = p1[0] - p0[0], az = p1[1] - p0[1];
    const la = Math.hypot(ax, az) || 1;
    ax /= la;
    az /= la;
    let bx = p2[0] - p1[0], bz = p2[1] - p1[1];
    const lb = Math.hypot(bx, bz) || 1;
    bx /= lb;
    bz /= lb;
    const n1x = -sgn * az, n1z = sgn * ax, n2x = -sgn * bz, n2z = sgn * bx;
    let mx = n1x + n2x, mz = n1z + n2z;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    const ch = Math.max(0.35, mx * n1x + mz * n1z);
    out.push([p1[0] + (mx * d) / ch, p1[1] + (mz * d) / ch]);
  }
  return out;
}

// ---- facade walls ---------------------------------------------------------------------
function walls(F, pts, y0, y1, s, seed, tops) {
  const sgn = polyArea2(pts) > 0 ? 1 : -1;
  const H = y1 - y0;
  const nf = Math.max(1, Math.round(H / s.floor)), fh = H / nf;
  F.color(s.wall);
  F.set('aGlass', s.glassRgb);
  F.set('aParam', s.param);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const dx = q[0] - p[0], dz = q[1] - p[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const nb = Math.max(1, Math.round(len / s.bay)), bw = len / nb;
    F.set('aStyle', [s.id, bw, fh, seed + i * 0.37]);
    const nx = (sgn * dz) / len, nz = (-sgn * dx) / len;
    const hp = tops ? tops[i] : H, hq = tops ? tops[(i + 1) % pts.length] : H;
    F.quadN([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y0 + hq, q[1]], [p[0], y0 + hp, p[1]], nx, 0, nz, [0, 0], [len, 0], [len, hq], [0, hp]);
  }
}

function roofCap(ctx, pts, y, par, wallRgb, roofCol) {
  const R = ctx.B.roof;
  const col = roofCol || ctx.rng.pick(ROOF);
  if (par <= 0.01) {
    R.color(col);
    cap(R, pts, y, 1);
    return;
  }
  const ins = insetP(pts, 0.45);
  const sgn = polyArea2(pts) > 0 ? 1 : -1;
  R.color([wallRgb[0] * 0.9, wallRgb[1] * 0.9, wallRgb[2] * 0.9]);
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], pi = ins[i], qi = ins[(i + 1) % n];
    const dx = q[0] - p[0], dz = q[1] - p[1], len = Math.hypot(dx, dz);
    if (len < 0.05) continue;
    const nx = (sgn * dz) / len, nz = (-sgn * dx) / len;
    R.quadN([p[0], y, p[1]], [q[0], y, q[1]], [q[0], y + par, q[1]], [p[0], y + par, p[1]], nx, 0, nz);
    R.quadN([pi[0], y, pi[1]], [qi[0], y, qi[1]], [qi[0], y + par, qi[1]], [pi[0], y + par, pi[1]], -nx, 0, -nz);
    R.quadN([p[0], y + par, p[1]], [q[0], y + par, q[1]], [qi[0], y + par, qi[1]], [pi[0], y + par, pi[1]], 0, 1, 0);
  }
  R.color(col);
  cap(R, ins, y, 1);
}

function vol(ctx, pts, y0, y1, s, o = {}) {
  walls(ctx.F, pts, y0, y1, s, ctx.seed);
  if (o.roof === false) return;
  roofCap(ctx, pts, y1, o.par === undefined ? 1.0 : o.par, s.wall, o.roofCol);
}

// ---- roof furniture ---------------------------------------------------------------------
function acUnit(ctx, x, y, z, sx, sz, h) {
  const P = ctx.B.plain;
  P.color(rgb(0xb5b3ab));
  box(P, x, y, z, sx, h, sz, 0);
  P.color(rgb(0x3c3d40));
  box(P, x, y + h, z, sx * 0.8, 0.12, sz * 0.8, 0);
}
function waterTank(ctx, x, y, z) {
  const P = ctx.B.plain;
  P.color(rgb(0x3b3a38));
  for (const [ox, oz] of [[-1.25, -1.25], [1.25, -1.25], [1.25, 1.25], [-1.25, 1.25]]) box(P, x + ox, y, z + oz, 0.22, 2.7, 0.22, 0);
  box(P, x, y + 2.7, z, 3.3, 0.2, 3.3, 0);
  P.color(rgb(0x6b4a32));
  cyl(P, x, y + 2.9, z, 1.75, 1.75, 3.1, 12, { top: false });
  P.color(rgb(0x34302c));
  cyl(P, x, y + 6.0, z, 1.95, 0.05, 1.3, 12, { top: false });
}
function mast(ctx, x, y, z, h, r = 0.4) {
  const S = ctx.B.steel;
  S.color(rgb(0xd8d8d6));
  cyl(S, x, y, z, r, r * 0.25, h * 0.6, 6, { top: false });
  S.color(rgb(0xb23a2a));
  cyl(S, x, y + h * 0.6, z, r * 0.25, 0.04, h * 0.4, 5, { top: false });
  ctx.beacons.push([x, y + h, z]);
}
function signQuad(S, cx, cy, cz, nx, nz, w, h, name) {
  const r = ATLAS.r[name];
  const rx = nz, rz = -nx;
  const hw = w / 2, hh = h / 2;
  S.color([1, 1, 1]);
  S.quadN(
    [cx - rx * hw, cy - hh, cz - rz * hw], [cx + rx * hw, cy - hh, cz + rz * hw],
    [cx + rx * hw, cy + hh, cz + rz * hw], [cx - rx * hw, cy + hh, cz - rz * hw],
    nx, 0, nz, [r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]);
}
export function billboard(ctx, x, y, z, nx, nz, w, h, name, postH = 5, twoSided = true) {
  const P = ctx.B.plain;
  const rx = nz, rz = -nx;
  P.color(rgb(0x35373a));
  for (const s of [-0.32, 0.32]) box(P, x + rx * w * s, y, z + rz * w * s, 0.35, postH, 0.35, 0);
  const rot = Math.atan2(rz, rx);
  box(P, x, y + postH, z, w + 0.4, h + 0.4, 0.5, rot, { bottom: true });
  signQuad(ctx.B.sign, x + nx * 0.27, y + postH + h / 2 + 0.2, z + nz * 0.27, nx, nz, w, h, name);
  if (twoSided) signQuad(ctx.B.sign, x - nx * 0.27, y + postH + h / 2 + 0.2, z - nz * 0.27, -nx, -nz, w, h, 'bb' + ((name.charCodeAt(2) + 3) % 8));
}
function roofSign(ctx, R, y, name, w, h, side) {
  // sign on a light frame along one roof edge
  const [cx, cz] = centerR(R);
  let x = cx, z = cz, nx = 0, nz = 1;
  if (side === 's') { z = R.z1 - 1.2; nz = 1; }
  if (side === 'n') { z = R.z0 + 1.2; nz = -1; }
  if (side === 'e') { x = R.x1 - 1.2; nx = 1; nz = 0; }
  if (side === 'w') { x = R.x0 + 1.2; nx = -1; nz = 0; }
  const P = ctx.B.plain;
  P.color(rgb(0x2c2d30));
  const rx = nz, rz = -nx;
  for (const s of [-0.4, 0, 0.4]) box(P, x + rx * w * s - nx * 0.25, y, z + rz * w * s - nz * 0.25, 0.2, h + 1.6, 0.2, 0);
  signQuad(ctx.B.sign, x, y + 1.4 + h / 2, z, nx, nz, w, h, name);
}
function helipad(ctx, x, y, z, s = 13) {
  const D = ctx.B.decal, r = ATLAS.r.helipad;
  D.color([1, 1, 1]);
  D.quadN([x - s / 2, y, z - s / 2], [x + s / 2, y, z - s / 2], [x + s / 2, y, z + s / 2], [x - s / 2, y, z + s / 2], 0, 1, 0,
    [r.u0, r.v1], [r.u1, r.v1], [r.u1, r.v0], [r.u0, r.v0]);
}
function roofStuff(ctx, R, y, o = {}) {
  const rng = ctx.rng;
  const [w, d] = sizeR(R);
  if (w < 7 || d < 7) return;
  const n = clamp(Math.round((w * d) / 170), 1, o.maxAc || 6);
  for (let i = 0; i < n; i++) {
    const sx = rng.range(1.8, Math.min(5, w * 0.3)), sz = rng.range(1.8, Math.min(4, d * 0.3));
    acUnit(ctx, rng.range(R.x0 + 2 + sx / 2, R.x1 - 2 - sx / 2), y, rng.range(R.z0 + 2 + sz / 2, R.z1 - 2 - sz / 2), sx, sz, rng.range(1.0, 2.1));
  }
  if (o.bulk !== false && w > 12 && d > 12) {
    const P = ctx.B.plain;
    P.color(rgb(0x9a978f));
    box(P, R.x0 + w * rng.range(0.25, 0.75), y, R.z0 + d * rng.range(0.25, 0.75), rng.range(3, 5), rng.range(2.6, 3.4), rng.range(3, 5), 0);
  }
  if (o.tank && rng.chance(o.tank) && w > 10 && d > 10) waterTank(ctx, rng.range(R.x0 + 3.2, R.x1 - 3.2), y, rng.range(R.z0 + 3.2, R.z1 - 3.2));
  if (o.mast && rng.chance(o.mast)) mast(ctx, (R.x0 + R.x1) / 2 + rng.range(-3, 3), y, (R.z0 + R.z1) / 2 + rng.range(-3, 3), rng.range(9, 22), 0.25);
}

// ---- crowns ---------------------------------------------------------------------------
function pyramid(ctx, R, y, h, colRgb) {
  const G = ctx.B.plain;
  const [cx, cz] = centerR(R);
  const A = [cx, y + h, cz];
  const c = [[R.x0, y, R.z0], [R.x1, y, R.z0], [R.x1, y, R.z1], [R.x0, y, R.z1]];
  G.color(colRgb);
  for (let i = 0; i < 4; i++) {
    const p = c[i], q = c[(i + 1) % 4];
    const mx = (p[0] + q[0]) / 2 - cx, mz = (p[2] + q[2]) / 2 - cz;
    const ml = Math.hypot(mx, mz) || 1;
    const run = ml, nrm = Math.hypot(h, run);
    G.triN(p, q, A, ((mx / ml) * h) / nrm, run / nrm, ((mz / ml) * h) / nrm);
  }
}
function wedge(ctx, R, y0, hLow, hHigh, s) {
  // roof plane rises from the z0 edge (low) to the z1 edge (high) or along x, picked at random
  const alongX = ctx.rng.chance(0.5), flip = ctx.rng.chance(0.5);
  const P = rectP(R); // [x0z0, x1z0, x1z1, x0z1]
  let tops;
  if (alongX) tops = flip ? [hHigh, hLow, hLow, hHigh] : [hLow, hHigh, hHigh, hLow];
  else tops = flip ? [hHigh, hHigh, hLow, hLow] : [hLow, hLow, hHigh, hHigh];
  walls(ctx.F, P, y0, y0 + hHigh, s, ctx.seed, tops);
  // sloped glass roof
  const F = ctx.F;
  const q = P.map((p, i) => [p[0], y0 + tops[i], p[1]]);
  const [w, d] = sizeR(R);
  const run = alongX ? w : d, rise = hHigh - hLow;
  const sl = Math.hypot(run, rise);
  let nx = 0, nz = 0;
  const ny = run / sl;
  if (alongX) nx = ((flip ? 1 : -1) * rise) / sl;
  else nz = ((flip ? 1 : -1) * rise) / sl;
  F.color(s.wall);
  F.set('aGlass', s.glassRgb);
  F.set('aParam', s.param);
  const across = alongX ? d : w;
  const nb = Math.max(1, Math.round(across / s.bay)), nf = Math.max(1, Math.round(sl / s.floor));
  F.set('aStyle', [s.id, across / nb, sl / nf, ctx.seed + 5.1]);
  const uv = alongX
    ? [[0, flip ? sl : 0], [0, flip ? 0 : sl], [across, flip ? 0 : sl], [across, flip ? sl : 0]]
    : [[0, flip ? sl : 0], [across, flip ? sl : 0], [across, flip ? 0 : sl], [0, flip ? 0 : sl]];
  F.quadN(q[0], q[1], q[2], q[3], nx, ny, nz, uv[0], uv[1], uv[2], uv[3]);
}

function crown(ctx, kind, R, poly, y, s, o = {}) {
  const rng = ctx.rng;
  const [w, d] = sizeR(R);
  const m = Math.min(w, d);
  const louver = blank(0x6a6d70, { bay: 0.6, floor: 0.5 });
  if (kind === 'flat') {
    roofCap(ctx, poly, y, 1.4, s.wall);
    roofStuff(ctx, insetR(R, 2), y, { mast: 0.3 });
    if (m > 26 && rng.chance(0.45)) helipad(ctx, (R.x0 + R.x1) / 2, y + 0.06, (R.z0 + R.z1) / 2, Math.min(15, m * 0.45));
    return y + 1.4;
  }
  if (kind === 'mech' || kind === 'spire') {
    roofCap(ctx, poly, y, 1.0, s.wall);
    const R2 = scaleR(R, 0.62), h = rng.range(6, 11);
    vol(ctx, rectP(R2), y, y + h, louver, { par: 0.6 });
    if (kind === 'spire') mast(ctx, (R.x0 + R.x1) / 2, y + h, (R.z0 + R.z1) / 2, o.spire || rng.range(28, 60), 0.9);
    else roofStuff(ctx, insetR(R2, 1), y + h, { mast: 0.5, bulk: false, maxAc: 2 });
    return y + h;
  }
  if (kind === 'step') {
    let yy = y, RR = R;
    roofCap(ctx, poly, y, 1.0, s.wall);
    for (let i = 0; i < 2; i++) {
      RR = scaleR(RR, 0.78);
      const h = s.floor * rng.int(2, 4);
      vol(ctx, rectP(RR), yy, yy + h, s, {});
      yy += h;
    }
    if (rng.chance(0.6)) mast(ctx, (R.x0 + R.x1) / 2, yy, (R.z0 + R.z1) / 2, rng.range(18, 40), 0.6);
    return yy;
  }
  if (kind === 'slant') {
    const hi = clamp(m * rng.range(0.55, 0.9), 10, 30);
    wedge(ctx, R, y, 1.5, hi, s);
    return y + hi;
  }
  if (kind === 'pyramid') {
    roofCap(ctx, poly, y, 1.0, s.wall);
    const R2 = scaleR(R, 0.86), h = m * rng.range(0.45, 0.7);
    pyramid(ctx, R2, y + 0.2, h, o.capCol || rgb(rng.pick([0x4f8f7a, 0x3f4a55, 0x7a6a4f, 0x5d7f8f])));
    mast(ctx, (R.x0 + R.x1) / 2, y + h, (R.z0 + R.z1) / 2, o.spire || rng.range(14, 30), 0.5);
    return y + h;
  }
  roofCap(ctx, poly, y, 1.0, s.wall);
  return y;
}

// ---- generators ---------------------------------------------------------------------------
function glassTower(ctx, L, H, o = {}) {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const glass = o.glass || rng.pick(GLASS), frame = o.frame || rng.pick(FRAME);
  const main = o.style || curtain(glass, frame, { bay: rng.pick([1.5, 1.6, 1.8, 3.0]), mull: rng.range(0.03, 0.075), span: rng.range(0.15, 0.3), solid: rng.chance(0.3) ? 1 : 0 });
  let R = insetR(L, o.setback === undefined ? rng.range(0.4, 1.6) : o.setback);
  let y = CURB_H;
  const [w, d] = sizeR(R);
  const top = CURB_H + H;
  const shape = o.shape || rng.pick(['rect', 'rect', 'chamfer', 'round', 'notch', 'rect']);
  let kind = o.crown || rng.pick(['flat', 'flat', 'mech', 'step', 'slant', 'spire', 'mech']);
  if (kind === 'slant' && shape !== 'rect') kind = 'step';
  const pod = o.podium === undefined ? (w > 38 && d > 38 && H > 100 && rng.chance(0.75)) : o.podium;
  if (pod) {
    const ph = o.podH || rng.pick([14, 18, 22, 26]);
    vol(ctx, rectP(R), y, y + 5, store(glass, frame), { roof: false });
    vol(ctx, rectP(R), y + 5, y + ph, rng.chance(0.5) ? main : ribbon(glass, frame), {});
    ctx.terraces.push({ R: insetR(R, 1.5), y: y + ph });
    ctx.lastR = R;
    y += ph;
    R = fitR(insetR(R, rng.range(3, 6)), o.maxW || 44, o.maxD || 44, rng.range(0.2, 0.8), rng.range(0.2, 0.8));
  } else {
    R = fitR(R, o.maxW || 50, o.maxD || 50, rng.range(0.3, 0.7), rng.range(0.3, 0.7));
    forecourt(ctx, L, R);
    ctx.lastR = R;
    vol(ctx, shapeP(shape, R), y, y + 5, store(glass, frame), { roof: false });
    y += 5;
  }
  const tiers = o.tiers || [[1, 1]];
  let RR = R, yy = y;
  const span = top - y;
  let acc = 0;
  tiers.forEach((t, i) => {
    RR = scaleR(R, t[0]);
    const y1 = y + span * (acc + t[1]);
    acc += t[1];
    const poly = shapeP(shape, RR);
    if (i === tiers.length - 1) {
      walls(ctx.F, poly, yy, y1, main, ctx.seed);
      crown(ctx, kind, RR, poly, y1, main, o);
    } else vol(ctx, poly, yy, y1, main, {});
    yy = y1;
  });
  ctx.count++;
}

function decoTower(ctx, L, H, o = {}) {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const wall = o.wall || rng.pick(STONE), glass = o.glass || rng.pick([0x2a3238, 0x35454e, 0x3d3a34]);
  const main = piers(glass, wall, { bay: rng.pick([2.2, 2.6, 3.0]), pier: rng.range(0.16, 0.26) });
  const base = store(glass, wall);
  let R = fitR(insetR(L, o.setback === undefined ? 0.8 : o.setback), o.maxW || 48, o.maxD || 48, rng.range(0.3, 0.7), rng.range(0.3, 0.7));
  forecourt(ctx, L, R);
  ctx.lastR = R;
  const top = CURB_H + H;
  let y = CURB_H;
  vol(ctx, rectP(R), y, y + 6, base, { roof: false });
  y += 6;
  const tiers = o.tiers || [[1.0, 0.5], [0.82, 0.24], [0.64, 0.14], [0.46, 0.08], [0.32, 0.04]];
  const span = top - y;
  let acc = 0, yy = y, RR = R;
  tiers.forEach((t, i) => {
    RR = scaleR(R, t[0]);
    const y1 = y + span * (acc + t[1]);
    acc += t[1];
    vol(ctx, i === 0 ? rectP(RR) : chamferP(RR, Math.min(sizeR(RR)[0], sizeR(RR)[1]) * 0.08), yy, y1, main, { par: 1.3 });
    yy = y1;
  });
  const kind = o.crown || rng.pick(['pyramid', 'pyramid', 'zig']);
  const m = Math.min(sizeR(RR)[0], sizeR(RR)[1]);
  if (kind === 'pyramid') {
    pyramid(ctx, scaleR(RR, 0.9), yy + 0.3, m * 1.1, o.capCol || rgb(rng.pick([0x4f8f7a, 0x3f4a55, 0x8a7a55])));
    mast(ctx, centerR(RR)[0], yy + m * 1.1, centerR(RR)[1], o.spire || rng.range(16, 34), 0.5);
  } else {
    let R3 = RR;
    for (let i = 0; i < 2; i++) {
      R3 = scaleR(R3, 0.7);
      vol(ctx, rectP(R3), yy, yy + 5, main, { par: 0.8 });
      yy += 5;
    }
    mast(ctx, centerR(RR)[0], yy, centerR(RR)[1], o.spire || rng.range(20, 40), 0.6);
  }
  ctx.count++;
}

function slab(ctx, L, H, o = {}) {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const kind = o.kind || rng.pick(['balcony', 'ribbon', 'punched', 'balcony']);
  const wall = o.wall || rng.pick([0xd9d6cc, 0xc9c2b2, 0xb8a58c, 0x9a9b9f, 0xe6e2d8, 0x8c5b48, 0xa9a59c]);
  const glass = o.glass || rng.pick([0x2f4252, 0x3a5566, 0x4a6a7c, 0x2b3a3f]);
  const s = kind === 'balcony' ? balcony(glass, wall) : kind === 'ribbon' ? ribbon(glass, wall) : punched(glass, wall, { bay: 3.0, floor: 3.3 });
  const R = insetR(L, o.setback === undefined ? rng.range(0.4, 1.5) : o.setback);
  let y = CURB_H;
  vol(ctx, rectP(R), y, y + 5, store(glass, wall), { roof: false });
  y += 5;
  const top = CURB_H + H;
  vol(ctx, rectP(R), y, top, s, { par: 1.1 });
  roofStuff(ctx, insetR(R, 1.5), top, { tank: 0.25, mast: 0.25 });
  if (o.sign) roofSign(ctx, R, top + 1.1, o.sign, o.signW || 16, o.signH || 5, o.signSide || 's');
  ctx.count++;
}

function midrise(ctx, L, H, o = {}) {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const wall = o.wall || rng.pick(BRICK.concat(STONE));
  const glass = o.glass || rng.pick([0x27323a, 0x33424c, 0x3f4f58, 0x2a2f33]);
  const s = o.style || (rng.chance(0.75)
    ? punched(glass, wall, { bay: rng.pick([2.2, 2.6, 3.0]), floor: rng.pick([3.4, 3.6, 3.9]), ww: rng.range(0.42, 0.62), wh: rng.range(0.5, 0.62) })
    : ribbon(glass, wall, { wh: rng.range(0.42, 0.55) }));
  const R = insetR(L, o.setback === undefined ? 0.15 : o.setback);
  let y = CURB_H;
  const top = CURB_H + H;
  const gf = Math.min(5, H * 0.4);
  vol(ctx, rectP(R), y, y + gf, store(glass, wall), { roof: false });
  y += gf;
  // optional upper setback
  if (H > 45 && rng.chance(0.4)) {
    const y1 = y + (top - y) * rng.range(0.62, 0.8);
    vol(ctx, rectP(R), y, y1, s, { par: 1.0 });
    const R2 = insetR(R, rng.range(2.5, 5));
    vol(ctx, rectP(R2), y1, top, s, { par: 1.0 });
    roofStuff(ctx, insetR(R2, 1.5), top, { tank: o.tank === undefined ? 0.45 : o.tank });
  } else {
    walls(ctx.F, rectP(R), y, top, s, ctx.seed);
    // cornice
    const P = ctx.B.plain;
    P.color([s.wall[0] * 1.08, s.wall[1] * 1.08, s.wall[2] * 1.08]);
    const [w, d] = sizeR(R), [cx, cz] = centerR(R);
    box(P, cx, top - 0.2, cz, w + 1.0, 0.75, d + 1.0, 0, { top: false, bottom: true });
    roofCap(ctx, rectP(insetR(R, -0.5)), top + 0.55, 0.6, s.wall);
    roofStuff(ctx, insetR(R, 1.5), top + 0.55, { tank: o.tank === undefined ? 0.45 : o.tank, mast: 0.1 });
  }
  if (o.sign) roofSign(ctx, R, top + 1.2, o.sign, o.signW || 12, o.signH || 4, o.signSide || 's');
  ctx.count++;
}

function garage(ctx, L, levels, o = {}) {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const wall = rng.pick([0xc9c5ba, 0xb3afa6, 0xd6d2c6]);
  const R = insetR(L, 0.3);
  const H = levels * 3.2;
  const top = CURB_H + H;
  walls(ctx.F, rectP(R), CURB_H, top, garageSt(wall), ctx.seed);
  roofCap(ctx, rectP(R), top, 1.1, rgb(wall), COL.lot.map((v) => v * 0.33));
  parkingLot(ctx, insetR(R, 1.5), { y: top + 0.02, noSurface: true, occ: 0.5 });
  // stair tower + P sign
  const P = ctx.B.plain;
  P.color(rgb(0x9f9b92));
  box(P, R.x0 + 3, top, R.z0 + 3, 4.5, 3.4, 4.5, 0);
  signQuad(ctx.B.sign, R.x0 + 3, top + 2.0, R.z0 + 0.72, 0, -1, 2.6, 2.6, 'park');
  signQuad(ctx.B.sign, R.x0 + 0.72, top + 2.0, R.z0 + 3, -1, 0, 2.6, 2.6, 'park');
  ctx.count++;
}

function lowShop(ctx, L, H, o = {}) {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const wall = o.wall || rng.pick(BRICK.concat([0xd8d2c4, 0xc7bca6, 0x9aa3a6]));
  const glass = 0x2c3a44;
  const R = insetR(L, 0.1);
  const top = CURB_H + H;
  const gf = Math.min(4.6, H);
  vol(ctx, rectP(R), CURB_H, CURB_H + gf, store(glass, wall), { roof: H <= 4.7, par: 0.7 });
  if (H > 4.7) vol(ctx, rectP(R), CURB_H + gf, top, punched(glass, wall, { bay: 2.4, floor: 3.3 }), { par: 0.7 });
  roofStuff(ctx, insetR(R, 1.2), top, { tank: 0.12, bulk: false, maxAc: 3 });
  if (o.sign) roofSign(ctx, R, top + 0.7, o.sign, o.signW || 9, o.signH || 3, o.signSide || 's');
  ctx.count++;
}

// paved forecourt with a few trees where a tower does not fill its lot
function forecourt(ctx, L, R) {
  const [lw, ld] = sizeR(L), [w, d] = sizeR(R);
  if (lw * ld - w * d < 380) return;
  const B = ctx.B, rng = ctx.rng;
  B.paver.color(COL.plaza);
  flat(B.paver, L.x0, L.z0, L.x1, L.z1, CURB_H + 0.015);
  const n = Math.round((lw * ld - w * d) / 170);
  for (let i = 0; i < n * 3; i++) {
    const x = rng.range(L.x0 + 2.5, L.x1 - 2.5), z = rng.range(L.z0 + 2.5, L.z1 - 2.5);
    if (x > R.x0 - 3 && x < R.x1 + 3 && z > R.z0 - 3 && z < R.z1 + 3) continue;
    ctx.trees.push({ x, z, s: rng.range(0.75, 1.1) });
    if (ctx.trees.length % 7 === 0) continue;
  }
}

// surface or rooftop parking: stall lines and parked cars
const PARK_TYPES = [['sedan', 40], ['suv', 32], ['pickup', 14], ['van', 8], ['taxi', 2]];
function parkedCar(ctx, x, y, z, dx, dz) {
  const rng = ctx.rng;
  let sum = 0;
  for (const t of PARK_TYPES) sum += t[1];
  let r = rng.next() * sum, type = 'sedan';
  for (const t of PARK_TYPES) {
    r -= t[1];
    if (r <= 0) {
      type = t[0];
      break;
    }
  }
  const col = type === 'taxi' ? rgb(0xf5c400) : PAINTS[rng.weighted(PAINTS.map((p) => p.w))].rgb;
  ctx.parked.push({ type, x, y, z, yaw: Math.atan2(-dz, dx), rgb: col });
}
export function parkingLot(ctx, R, o = {}) {
  const B = ctx.B, rng = ctx.rng;
  const y = o.y === undefined ? CURB_H + 0.015 : o.y;
  if (!o.noSurface) {
    B.asphalt.color(COL.lot.map((v) => v * 0.62));
    flat(B.asphalt, R.x0, R.z0, R.x1, R.z1, y);
  }
  const [w, d] = sizeR(R);
  const alongX = w >= d;
  const Ln = alongX ? w : d, Wd = alongX ? d : w;
  const a0 = alongX ? R.x0 : R.z0, b0 = alongX ? R.z0 : R.x0;
  const rows = [];
  let t = 0.6;
  while (t + 5.4 <= Wd - 0.4) {
    rows.push({ t, dir: 1 });
    t += 5.4 + 6.6;
    if (t + 5.4 <= Wd - 0.4) {
      rows.push({ t, dir: -1 });
      t += 5.4 + 0.25;
    }
  }
  const occ = o.occ === undefined ? 0.62 : o.occ;
  B.mark.color(COL.white);
  for (const row of rows) {
    for (let s = 1.2; s + 2.7 <= Ln - 1.0; s += 2.7) {
      const u0 = a0 + s, v0 = b0 + row.t;
      if (alongX) flat(B.mark, u0 - 0.05, v0, u0 + 0.05, v0 + 5.4, y + 0.02);
      else flat(B.mark, v0, u0 - 0.05, v0 + 5.4, u0 + 0.05, y + 0.02);
      if (o.skip && o.skip(alongX ? u0 + 1.35 : v0 + 2.7, alongX ? v0 + 2.7 : u0 + 1.35)) continue;
      if (rng.chance(occ)) {
        const sgn = rng.chance(0.75) ? row.dir : -row.dir;
        const jit = rng.range(-0.25, 0.25);
        if (alongX) parkedCar(ctx, u0 + 1.35, y, v0 + 2.7 + jit, 0, sgn);
        else parkedCar(ctx, v0 + 2.7 + jit, y, u0 + 1.35, sgn, 0);
      }
    }
  }
}

function plaza(ctx, R, o = {}) {
  const B = ctx.B, rng = ctx.rng;
  B.paver.color(COL.plaza);
  flat(B.paver, R.x0, R.z0, R.x1, R.z1, CURB_H + 0.015);
  const [w, d] = sizeR(R);
  if (o.lawn !== false && w > 14 && d > 14) {
    const G = insetR(R, Math.min(w, d) * 0.22);
    B.grass.color(COL.grass);
    flat(B.grass, G.x0, G.z0, G.x1, G.z1, CURB_H + 0.03);
  }
  const n = o.trees === undefined ? Math.round((w * d) / 150) : o.trees;
  for (let i = 0; i < n; i++) ctx.trees.push({ x: rng.range(R.x0 + 2.5, R.x1 - 2.5), z: rng.range(R.z0 + 2.5, R.z1 - 2.5), s: rng.range(0.8, 1.15) });
  if (o.fountain) {
    const [cx, cz] = centerR(R);
    B.conc.color(rgb(0xbdb9af));
    cyl(B.conc, cx, CURB_H, cz, 5.2, 5.2, 0.7, 24, { top: false });
    B.plain.color(rgb(0x4f93a8));
    cyl(B.plain, cx, CURB_H, cz, 4.8, 4.8, 0.55, 24);
    B.conc.color(rgb(0xbdb9af));
    cyl(B.conc, cx, CURB_H, cz, 0.7, 0.4, 2.2, 10);
  }
}
function lawn(ctx, R, trees) {
  const B = ctx.B, rng = ctx.rng;
  B.grass.color(COL.grass);
  flat(B.grass, R.x0, R.z0, R.x1, R.z1, CURB_H + 0.02);
  const [w, d] = sizeR(R);
  const n = trees === undefined ? Math.round((w * d) / 120) : trees;
  for (let i = 0; i < n; i++) {
    const x = rng.range(R.x0 + 2, R.x1 - 2), z = rng.range(R.z0 + 2, R.z1 - 2);
    if (ctx.avoid && ctx.avoid(x, z)) continue;
    ctx.trees.push({ x, z, s: rng.range(0.85, 1.35), park: true });
  }
}

function gasStation(ctx, R, facing = 's') {
  const B = ctx.B, rng = ctx.rng;
  B.asphalt.color(COL.lot.map((v) => v * 0.6));
  flat(B.asphalt, R.x0, R.z0, R.x1, R.z1, CURB_H + 0.015);
  const [cx, cz] = centerR(R), [w, d] = sizeR(R);
  // canopy
  const P = B.plain;
  const kx = cx, kz = facing === 's' ? R.z0 + d * 0.62 : R.z0 + d * 0.38;
  P.color(rgb(0xe9e9e6));
  for (const [ox, oz] of [[-6, -3.4], [6, -3.4], [6, 3.4], [-6, 3.4]]) box(P, kx + ox, CURB_H, kz + oz, 0.45, 5.0, 0.45, 0);
  P.color(rgb(0xc8102e));
  box(P, kx, CURB_H + 5.0, kz, 17, 0.9, 10.5, 0, { bottom: true });
  P.color(rgb(0xf4f4f1));
  box(P, kx, CURB_H + 5.9, kz, 16.6, 0.12, 10.1, 0);
  P.color(rgb(0x2f3033));
  for (const ox of [-4.2, 0, 4.2]) box(P, kx + ox, CURB_H, kz, 0.9, 1.7, 0.6, 0);
  // store
  const S = { x0: R.x0 + 1, x1: R.x1 - 1, z0: facing === 's' ? R.z0 + 0.5 : R.z1 - 8.5, z1: facing === 's' ? R.z0 + 8.5 : R.z1 - 0.5 };
  ctx.seed = rng.range(0, 90);
  vol(ctx, rectP(S), CURB_H, CURB_H + 4.4, store(0x2c3a44, 0xe2ded2), { par: 0.6, roofCol: ROOF[5] });
  roofSign(ctx, S, CURB_H + 5.0, 'mart', 10, 2.6, facing);
  // price pylon
  const px = R.x1 - 2.2, pz = facing === 's' ? R.z1 - 2.2 : R.z0 + 2.2;
  P.color(rgb(0x2c2d30));
  box(P, px, CURB_H, pz, 0.5, 8.5, 0.5, 0);
  signQuad(B.sign, px, CURB_H + 7, pz + 0.28, 0, 1, 5, 2.5, 'gas');
  signQuad(B.sign, px, CURB_H + 7, pz - 0.28, 0, -1, 5, 2.5, 'gas');
  ctx.count++;
}

function diner(ctx, R) {
  const B = ctx.B, rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const D = fitR(R, 26, 9, 0.5, 0.5);
  vol(ctx, roundRect(D.x0, D.z0, D.x1, D.z1, 2.2, 4), CURB_H, CURB_H + 4.2, st(1, 0xcfd3d6, 0x2b3a44, 2.2, 4.2, [0, 0.42, 0.32, 0]), { par: 0.5, roofCol: rgb(0xd9dadb) });
  const P = B.plain;
  P.color(rgb(0xc8102e));
  box(P, (D.x0 + D.x1) / 2, CURB_H + 3.5, (D.z0 + D.z1) / 2, D.x1 - D.x0 + 0.3, 0.45, D.z1 - D.z0 + 0.3, 0, { top: false, bottom: true });
  roofSign(ctx, D, CURB_H + 4.6, 'diner', 9, 3, 's');
  ctx.count++;
}

function church(ctx, R) {
  const B = ctx.B, rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const wall = rng.pick([0x9b5a40, 0xcfc6b2, 0x8c4a38]);
  const N = fitR(R, 16, 34, 0.5, 0.5);
  const s = punched(0x3a4a6a, wall, { bay: 4.2, floor: 9, ww: 0.3, wh: 0.6, sill: 0.2 });
  walls(ctx.F, rectP(N), CURB_H, CURB_H + 10, s, ctx.seed);
  // gable roof
  const G = B.plain;
  const [cx] = centerR(N);
  const y = CURB_H + 10, ridge = y + 7;
  G.color(rgb(0x4a4d55));
  const hw = (N.x1 - N.x0) / 2 + 0.5, sl = Math.hypot(hw, 7);
  G.quadN([N.x0 - 0.5, y, N.z0 - 0.5], [cx, ridge, N.z0 - 0.5], [cx, ridge, N.z1 + 0.5], [N.x0 - 0.5, y, N.z1 + 0.5], -7 / sl, hw / sl, 0);
  G.quadN([N.x1 + 0.5, y, N.z0 - 0.5], [cx, ridge, N.z0 - 0.5], [cx, ridge, N.z1 + 0.5], [N.x1 + 0.5, y, N.z1 + 0.5], 7 / sl, hw / sl, 0);
  G.color(rgb(wall));
  G.triN([N.x0, y, N.z0], [N.x1, y, N.z0], [cx, ridge - 0.3, N.z0], 0, 0, -1);
  G.triN([N.x0, y, N.z1], [N.x1, y, N.z1], [cx, ridge - 0.3, N.z1], 0, 0, 1);
  // steeple
  const T = { x0: cx - 3, x1: cx + 3, z0: N.z1 - 6, z1: N.z1 };
  walls(ctx.F, rectP(T), CURB_H, CURB_H + 22, blank(wall, { bay: 6, floor: 5.5 }), ctx.seed);
  G.color(rgb(0x3f4a55));
  pyramid(ctx, { x0: T.x0 - 0.3, x1: T.x1 + 0.3, z0: T.z0 - 0.3, z1: T.z1 + 0.3 }, CURB_H + 22, 13, rgb(0x3f4a55));
  ctx.count++;
}

function bigBox(ctx, R, sign = 'mart', side = 'n') {
  const rng = ctx.rng;
  ctx.seed = rng.range(0, 90);
  const wall = 0xd8d2c4;
  vol(ctx, rectP(R), CURB_H, CURB_H + 9, blank(wall, { bay: 6, floor: 4.5 }), { par: 1.0, roofCol: ROOF[5] });
  const P = ctx.B.plain;
  // entrance canopy + sign
  const [cx, cz] = centerR(R);
  P.color(rgb(0x0a53a8));
  if (side === 'n') box(P, cx, CURB_H + 4.2, R.z0 - 1.5, 22, 0.6, 3.4, 0, { bottom: true });
  else box(P, cx, CURB_H + 4.2, R.z1 + 1.5, 22, 0.6, 3.4, 0, { bottom: true });
  signQuad(ctx.B.sign, cx, CURB_H + 7.2, side === 'n' ? R.z0 - 0.06 : R.z1 + 0.06, 0, side === 'n' ? -1 : 1, 16, 3.2, sign);
  roofStuff(ctx, insetR(R, 3), CURB_H + 9, { maxAc: 7, bulk: false });
  // solar array
  const S = ctx.B.plain;
  S.color(rgb(0x1c2f55));
  const A = { x0: R.x0 + 6, x1: R.x1 - 6, z0: cz - 2, z1: R.z1 - 5 };
  for (let z = A.z0; z < A.z1 - 2; z += 3.2) box(S, (A.x0 + A.x1) / 2, CURB_H + 9.5, z + 1, A.x1 - A.x0, 0.12, 2.2, 0);
  ctx.count++;
}

// ---- block plan ---------------------------------------------------------------------------
function splitR(R, axis, weights, gap = 0) {
  const total = weights.reduce((a, b) => a + b, 0);
  const a0 = axis === 'x' ? R.x0 : R.z0, len = (axis === 'x' ? R.x1 - R.x0 : R.z1 - R.z0) - gap * (weights.length - 1);
  const out = [];
  let a = a0;
  for (const w of weights) {
    const l = (len * w) / total;
    out.push(axis === 'x' ? { x0: a, x1: a + l, z0: R.z0, z1: R.z1 } : { x0: R.x0, x1: R.x1, z0: a, z1: a + l });
    a += l + gap;
  }
  return out;
}
function lotOf(b) {
  const e = 0.5;
  return {
    x0: b.x0 + (b.sw.w || e), x1: b.x1 - (b.sw.e || e), z0: b.z0 + (b.sw.n || e), z1: b.z1 - (b.sw.s || e),
  };
}

export function buildBuildings(B, seed = 7, opts = {}) {
  const F = new Geo({ aStyle: 4, aParam: 4, aGlass: 3 });
  const ctx = { B, F, rng: new RNG(seed), seed: 0, parked: [], trees: [], terraces: [], beacons: [], count: 0, lots: {}, pierNear: opts.pierNear || null, lastR: null };
  const L = (ci, ri) => {
    const b = BLOCKS.find((q) => q.ci === ci && q.ri === ri);
    ctx.rng = new RNG(seed * 131 + (ci + 2) * 17 + ri * 101);
    return lotOf(b);
  };
  const gT = (R, H, o) => glassTower(ctx, R, H, o);
  const dT = (R, H, o) => decoTower(ctx, R, H, o);
  const sl = (R, H, o) => slab(ctx, R, H, o);
  const mid = (R, H, o) => midrise(ctx, R, H, o);
  const low = (R, H, o) => lowShop(ctx, R, H, o);

  // ---- row 0: north strip
  {
    let p = splitR(L(0, 0), 'x', [1.2, 0.8, 1], 0);
    sl(p[0], 74, { kind: 'ribbon', sign: 'hotel', signSide: 's', signW: 18, signH: 6 });
    mid(p[1], 44);
    mid(p[2], 56);
    p = splitR(L(1, 0), 'x', [1.2, 1], 3);
    gT(p[0], 148, { podium: false, maxD: 44 });
    mid(p[1], 62);
    p = splitR(L(2, 0), 'x', [0.9, 1.2], 3);
    mid(p[0], 70);
    gT(p[1], 186, { podium: false, crown: 'slant', shape: 'rect' });
    p = splitR(L(3, 0), 'x', [1.1, 0.8, 1], 0);
    sl(p[0], 118, { kind: 'balcony' });
    mid(p[1], 52);
    mid(p[2], 66);
    mid(L(4, 0), 48);
  }
  // ---- row 1
  {
    let p = splitR(L(0, 1), 'x', [1, 1], 4);
    {
      const q = splitR(p[0], 'z', [1.1, 1], 4);
      gT(q[0], 118, { shape: 'circle', podium: false, style: balcony(0x35505f, 0xe2ded2), crown: 'mech', maxW: 34, maxD: 34 });
      plaza(ctx, q[1], { fountain: true, trees: 10 });
    }
    {
      const q = splitR(p[1], 'z', [1, 1], 3);
      sl(q[0], 98, { kind: 'balcony' });
      mid(q[1], 58);
    }
    // hero B: setback stone tower
    p = splitR(L(1, 1), 'x', [1.5, 1], 4);
    dT(p[0], 268, { wall: 0xd6cdb8, crown: 'pyramid', capCol: rgb(0x4f8f7a), spire: 30, maxW: 50, maxD: 50, tiers: [[1.0, 0.44], [0.84, 0.25], [0.66, 0.17], [0.46, 0.09], [0.3, 0.05]] });
    {
      const q = splitR(p[1], 'z', [1, 0.8], 3);
      mid(q[0], 96, { style: piers(0x2f3a40, 0x9a9b9f) });
      plaza(ctx, q[1], { trees: 6 });
    }
    p = splitR(L(2, 1), 'x', [1, 1], 5);
    gT(p[0], 206, { glass: 0x5b7fa6, crown: 'step' });
    gT(p[1], 152, { glass: 0x3d6b5e, crown: 'mech', podium: false });
    p = splitR(L(3, 1), 'x', [1.3, 1], 4);
    gT(p[0], 224, { style: ribbon(0x4a6a80, 0xb9907e, { bay: 2.8, wh: 0.55 }), frame: 0xb9907e, glass: 0x4a6a80, crown: 'pyramid', shape: 'chamfer', capCol: rgb(0x7a4a3f) });
    mid(p[1], 72);
    p = splitR(L(4, 1), 'z', [1.2, 1], 0);
    mid(p[0], 76);
    mid(p[1], 46);
  }
  // ---- row 2
  {
    let p = splitR(L(0, 2), 'x', [1, 1.1], 3);
    sl(p[0], 92, { kind: 'balcony', sign: 'hotel', signSide: 'w', signW: 16, signH: 5 });
    {
      const q = splitR(p[1], 'z', [1, 1.2], 0);
      mid(q[0], 64);
      mid(q[1], 78, { style: piers(0x2f3a40, 0xc4b79c) });
    }
    // black slab tower on a plaza
    {
      const R = L(1, 2);
      plaza(ctx, R, { lawn: false, trees: 14 });
      const T = { x0: R.x0 + 22, x1: R.x0 + 64, z0: R.z0 + 12, z1: R.z0 + 44 };
      gT(T, 236, { podium: false, setback: 0, shape: 'rect', crown: 'flat', maxW: 60, maxD: 60, style: curtain(0x1e252c, 0x25282c, { bay: 1.5, mull: 0.06, span: 0.26 }), glass: 0x1e252c, frame: 0x25282c });
      low({ x0: R.x0 + 4, x1: R.x0 + 30, z0: R.z1 - 26, z1: R.z1 - 6 }, 9, { wall: 0x25282c, sign: 'bank', signW: 12, signH: 2.2 });
      plazaTreesClear(ctx, [T, { x0: R.x0 + 4, x1: R.x0 + 30, z0: R.z1 - 26, z1: R.z1 - 6 }]);
    }
    // hero A: the tallest
    {
      const R = L(2, 2);
      plaza(ctx, R, { lawn: false, trees: 10 });
      const T = { x0: R.x0 + 20, x1: R.x0 + 70, z0: R.z0 + 18, z1: R.z0 + 68 };
      gT(T, 318, {
        podium: false, setback: 0, shape: 'chamfer', maxW: 60, maxD: 60, crown: 'spire', spire: 62,
        glass: 0x35597d, frame: 0xaeb6bd, style: curtain(0x35597d, 0xaeb6bd, { bay: 1.6, mull: 0.05, span: 0.2 }),
        tiers: [[1, 0.46], [0.84, 0.27], [0.64, 0.17], [0.42, 0.1]],
      });
      mast(ctx, T.x0 + 19, CURB_H + 318 + 8, T.z0 + 29, 44, 0.7);
      plazaTreesClear(ctx, [T]);
    }
    p = splitR(L(3, 2), 'z', [1.2, 1], 5);
    gT(p[0], 192, { glass: 0x7aa6cc, crown: 'slant', shape: 'round' });
    gT(p[1], 134, { podium: false });
    sl(L(4, 2), 86, { kind: 'ribbon' });
  }
  // ---- row 3
  {
    // old brick quarter; the south-east corner stays open under the L curve
    {
      const R = L(0, 3);
      const cols = splitR(R, 'x', [1, 1], 0);
      const a = splitR(cols[0], 'z', [1.1, 1], 0), b = splitR(cols[1], 'z', [1.2, 1], 0);
      mid(a[0], 74, { tank: 0.9 });
      mid(a[1], 62, { tank: 0.8 });
      mid(b[0], 46, { tank: 0.9 });
      const q = splitR(b[1], 'x', [1, 0.9], 0);
      mid(q[0], 38, { tank: 1 });
      plaza(ctx, q[1], { lawn: false, trees: 3 });
    }
    let p = splitR(L(1, 3), 'x', [1.25, 1], 4);
    dT(p[0], 214, { wall: 0xc4b79c, crown: 'zig', spire: 34 });
    mid(p[1], 96);
    p = splitR(L(2, 3), 'x', [1.3, 1], 4);
    gT(p[0], 252, { glass: 0x4d8f96, frame: 0xd9d6cc, shape: 'rect', crown: 'slant', podium: true });
    gT(p[1], 118, { podium: false, crown: 'flat' });
    p = splitR(L(3, 3), 'x', [1, 1], 3);
    gT(p[0], 142, { podium: false, crown: 'mech' });
    {
      const q = splitR(p[1], 'z', [1, 1], 3);
      garage(ctx, q[0], 7);
      mid(q[1], 54);
    }
    p = splitR(L(4, 3), 'z', [1, 1], 0);
    mid(p[0], 62);
    mid(p[1], 40);
  }
  // ---- row 4 (freeway ramps pass over blocks 1 and 2)
  {
    // (0,4) Tower Plaza: landmark added separately
    {
      const R = L(0, 4);
      plaza(ctx, R, { lawn: false, trees: 0 });
      ctx.lots.towerPlaza = R;
    }
    {
      const R = L(1, 4);
      const west = { x0: R.x0, x1: R.x0 + 30, z0: R.z0, z1: R.z1 };
      const q = splitR(west, 'z', [1.1, 1], 0);
      mid(q[0], 56);
      mid(q[1], 44);
      mid({ x0: R.x0 + 34, x1: R.x1, z0: R.z0, z1: R.z0 + 26 }, 36);
      parkingLot(ctx, { x0: R.x0 + 34, x1: R.x1, z0: R.z0 + 30, z1: R.z1 }, { skip: (x, z) => ctx.pierNear && ctx.pierNear(x, z) });
    }
    {
      const R = L(2, 4);
      const east = { x0: R.x1 - 30, x1: R.x1, z0: R.z0, z1: R.z1 };
      const q = splitR(east, 'z', [1.1, 1], 0);
      mid(q[0], 66);
      mid(q[1], 48);
      mid({ x0: R.x0, x1: R.x1 - 34, z0: R.z0, z1: R.z0 + 26 }, 42);
      parkingLot(ctx, { x0: R.x0, x1: R.x1 - 34, z0: R.z0 + 30, z1: R.z1 }, { skip: (x, z) => ctx.pierNear && ctx.pierNear(x, z) });
    }
    {
      const R = L(3, 4);
      const c = splitR(R, 'x', [1, 1], 3);
      const a = splitR(c[0], 'z', [1.2, 1], 3), b = splitR(c[1], 'z', [1, 1.1], 3);
      mid(a[0], 84);
      garage(ctx, a[1], 5);
      sl(b[0], 70, { kind: 'punched' });
      mid(b[1], 48);
    }
    const p = splitR(L(4, 4), 'z', [1, 1], 0);
    low(p[0], 28);
    low(p[1], 18);
  }
  // ---- row 5 (south of the freeway)
  {
    {
      const R = L(0, 5);
      const p = splitR(R, 'x', [1, 1.1, 0.9], 0);
      mid(p[0], 26, { tank: 1, wall: 0x8c4a38 });
      mid(p[1], 21, { tank: 0.7, wall: 0x6e4b3b });
      mid(p[2], 30, { tank: 1, wall: 0x9b5a40 });
      const [x0, x1] = [R.x0, R.x1];
      billboard(ctx, (x0 + x1) / 2 - 22, CURB_H + 27, R.z0 + 4, 0, -1, 14, 5, 'bb4', 4);
      billboard(ctx, (x0 + x1) / 2 + 26, CURB_H + 31, R.z0 + 4, 0, -1, 14, 5, 'bb0', 4);
    }
    {
      // inside the loop ramp: lawn and trees
      const R = L(1, 5);
      ctx.lots.loop = R;
      ctx.avoid = (x, z) => ctx.pierNear && ctx.pierNear(x, z);
      lawn(ctx, R, 46);
      ctx.avoid = null;
    }
    {
      const R = L(2, 5);
      parkingLot(ctx, { x0: R.x0, x1: R.x1, z0: R.z0 + 6, z1: R.z0 + 44 }, { skip: (x, z) => ctx.pierNear && ctx.pierNear(x, z) });
      bigBox(ctx, { x0: R.x0 + 22, x1: R.x1, z0: R.z0 + 47, z1: R.z1 }, 'mart', 'n');
      gasStation(ctx, { x0: R.x0, x1: R.x0 + 20, z0: R.z0 + 47, z1: R.z1 }, 's');
    }
    {
      const R = L(3, 5);
      const p = splitR(R, 'z', [1, 1.1], 3);
      const a = splitR(p[0], 'x', [1, 1.3], 3);
      plaza(ctx, a[0], { lawn: false, trees: 0 });
      diner(ctx, a[0]);
      sl(a[1], 16, { kind: 'balcony', sign: 'motel', signW: 12, signH: 4, signSide: 'n', wall: 0xe0d6bf });
      const b = splitR(p[1], 'x', [1, 1, 1.2], 0);
      low(b[0], 12);
      low(b[1], 9, { sign: 'cinema', signW: 9, signH: 3, signSide: 's' });
      mid(b[2], 24);
    }
    const p = splitR(L(4, 5), 'z', [1, 1.2], 0);
    low(p[0], 16);
    low(p[1], 22);
  }
  // ---- row 6: south strip
  {
    let p = splitR(L(0, 6), 'x', [1, 0.8, 1.2], 0);
    low(p[0], 14);
    low(p[1], 10);
    {
      const q = insetR(p[2], 4);
      lawn(ctx, p[2], 6);
      church(ctx, q);
      plazaTreesClear(ctx, [fitR(q, 16, 34, 0.5, 0.5)]);
    }
    p = splitR(L(1, 6), 'x', [1, 1.4, 0.8], 0);
    low(p[0], 12);
    parkingLot(ctx, insetR(p[1], 1));
    low(p[2], 18);
    p = splitR(L(2, 6), 'x', [0.8, 1, 1, 0.9], 0);
    low(p[0], 9);
    low(p[1], 16);
    low(p[2], 12);
    mid(p[3], 26);
    billboard(ctx, p[1].x0 + 6, CURB_H + 16.5, p[1].z0 + 5, 0, -1, 13, 5, 'bb2', 4);
    p = splitR(L(3, 6), 'x', [1, 0.9, 1.1], 0);
    mid(p[0], 22);
    low(p[1], 11);
    low(p[2], 15);
    low(L(4, 6), 13);
  }

  return { F, ctx };
}

// drop plaza trees that ended up inside building footprints
function plazaTreesClear(ctx, rects) {
  ctx.trees = ctx.trees.filter((t) => !rects.some((R) => t.x > R.x0 - 2.5 && t.x < R.x1 + 2.5 && t.z > R.z0 - 2.5 && t.z < R.z1 + 2.5));
}
