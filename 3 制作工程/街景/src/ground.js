// Ground: asphalt base, kerbed blocks, medians, lane markings, crosswalks, river, bridges, plinth.
import { box, prism, cap, roundRect, cyl } from './geo.js';
import { HALF, RIVER_X, WATER_Y, CURB_H, STREETS, EW, NODES, BLOCKS, ST, stopDist, LOOP_X } from './layout.js';
import { hexToRgb, hash2, TAU } from './util.js';

export const COL = {
  asphalt: [0.58, 0.58, 0.6],
  lot: [0.74, 0.74, 0.76],
  busRed: [1.5, 0.4, 0.3],
  sidewalk: [0.8, 0.79, 0.77],
  curb: [0.9, 0.89, 0.86],
  prom: [0.92, 0.9, 0.88],
  plaza: [0.98, 0.95, 0.9],
  white: hexToRgb(0xe9e9e4),
  yellow: hexToRgb(0xf0b81e),
  grass: [0.9, 0.95, 0.85],
  stone: hexToRgb(0x8d877c),
  conc: hexToRgb(0xb3afa6),
  concDark: hexToRgb(0x8a867e),
  steelDark: hexToRgb(0x2f3a36),
  deck: [1.22, 1.19, 1.13],
};
export const Y_MARK = 0.02;
export const MEDIANS = [];
export const BRIDGE_PIERS_X = [-284, -324];

export function flat(g, x0, z0, x1, z1, y) {
  g.quadN([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], 0, 1, 0, [x0, z0], [x1, z0], [x1, z1], [x0, z1]);
}

function baseAsphalt(B) {
  const g = B.asphalt;
  const nx = 20, nz = 24;
  const x0 = RIVER_X - 0.5, x1 = HALF, z0 = -HALF, z1 = HALF;
  const idx = [];
  for (let j = 0; j <= nz; j++) {
    idx.push([]);
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx, z = z0 + ((z1 - z0) * j) / nz;
      const v = 1 + (hash2(i * 7 + 3, j * 13 + 5) - 0.5) * 0.07;
      g.color([COL.asphalt[0] * v, COL.asphalt[1] * v, COL.asphalt[2] * v]);
      idx[j].push(g.v(x, 0, z, 0, 1, 0, x, z));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = idx[j][i], b = idx[j][i + 1], c = idx[j + 1][i + 1], d = idx[j + 1][i];
      g.i.push(a, d, c, a, c, b);
    }
  }
}

function blocks(B) {
  for (const b of BLOCKS) {
    const pts = roundRect(b.x0, b.z0, b.x1, b.z1, b.round, 5);
    const top = b.ci === -1 ? B.paver : B.pave;
    B.pave.color(COL.curb);
    prism(B.pave, pts, 0, CURB_H, { cap: false });
    top.color(b.ci === -1 ? COL.prom : COL.sidewalk);
    cap(top, pts, CURB_H, 1);
    if (b.bulbFill) {
      const f = b.bulbFill;
      const p2 = roundRect(f.x0, f.z0, f.x1, f.z1, 0);
      B.pave.color(COL.curb);
      prism(B.pave, p2, 0, CURB_H, { cap: false });
      B.paver.color(COL.prom);
      cap(B.paver, p2, CURB_H, 1);
    }
  }
}

function medians(B) {
  for (const S of STREETS) {
    if (S.median < 3) continue;
    const coord = (n) => (S.ns ? n.z : n.x);
    const cross = (n) => (S.ns ? n.ew : n.ns);
    const nodes = NODES.filter((n) => (S.ns ? n.ns : n.ew) === S).sort((a, b) => coord(a) - coord(b));
    const planted = S.id === 'MAIN' || S.id === 'RIV';
    for (let k = 0; k <= nodes.length; k++) {
      const prev = nodes[k - 1], nxt = nodes[k];
      let a = prev ? coord(prev) + cross(prev).halfCurb + 3.9 : S.from;
      const b = nxt ? coord(nxt) - cross(nxt).halfCurb - 3.9 : S.to;
      let roundA = !!prev;
      if (S.id === 'MAIN' && k === 0) {
        a = LOOP_X + 7.0;
        roundA = false;
      }
      if (b - a < 3) continue;
      const h = S.median / 2 - 0.02;
      const rA = roundA ? Math.min(h - 0.05, 1.6) : 0, rB = nxt ? Math.min(h - 0.05, 1.6) : 0;
      const pts = S.ns
        ? roundRect(S.pos - h, a, S.pos + h, b, [rA, rA, rB, rB], 4)
        : roundRect(a, S.pos - h, b, S.pos + h, [rA, rB, rB, rA], 4);
      B.pave.color(COL.curb);
      prism(B.pave, pts, 0, CURB_H, { cap: false });
      B.pave.color(planted ? COL.curb : COL.sidewalk);
      cap(B.pave, pts, CURB_H, 1);
      if (planted) {
        B.grass.color(COL.grass);
        const e = 1.4, s = 0.4;
        if (S.ns) flat(B.grass, S.pos - h + s, a + e, S.pos + h - s, b - e, CURB_H + 0.02);
        else flat(B.grass, a + e, S.pos - h + s, b - e, S.pos + h - s, CURB_H + 0.02);
      }
      MEDIANS.push({ S, a, b, planted, onBridge: !S.ns && b <= RIVER_X + 60 && a < RIVER_X });
    }
  }
  // turnaround island at the pier
  {
    const r = 7.4, pts = [];
    for (let i = 0; i < 28; i++) pts.push([LOOP_X + Math.cos((i / 28) * TAU) * r, ST.MAIN.pos + Math.sin((i / 28) * TAU) * r]);
    B.pave.color(COL.curb);
    prism(B.pave, pts, 0, CURB_H, { cap: false });
    cap(B.pave, pts, CURB_H, 1);
    const p2 = [];
    for (let i = 0; i < 28; i++) p2.push([LOOP_X + Math.cos((i / 28) * TAU) * (r - 0.6), ST.MAIN.pos + Math.sin((i / 28) * TAU) * (r - 0.6)]);
    B.grass.color(COL.grass);
    cap(B.grass, p2, CURB_H + 0.02, 1);
  }
}

function markings(B) {
  const g = B.mark;
  const Y = Y_MARK;
  for (const S of STREETS) {
    const coord = (n) => (S.ns ? n.z : n.x);
    const nodes = NODES.filter((n) => (S.ns ? n.ns : n.ew) === S).sort((a, b) => coord(a) - coord(b));
    const R = (gg, l0, l1, a, b, y) => {
      const la = Math.min(l0, l1), lb = Math.max(l0, l1), ta = Math.min(a, b), tb = Math.max(a, b);
      if (S.ns) flat(gg, S.pos + la, ta, S.pos + lb, tb, y);
      else flat(gg, ta, S.pos + la, tb, S.pos + lb, y);
    };
    const L = (lat, a, b, w) => R(g, lat - w / 2, lat + w / 2, a, b, Y);
    const D = (lat, a, b, w, dash = 3, gap = 6) => {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      for (let t = lo; t < hi; t += dash + gap) L(lat, t, Math.min(t + dash, hi), w);
    };
    for (let k = 0; k <= nodes.length; k++) {
      const prev = nodes[k - 1], nxt = nodes[k];
      if (S.id === 'MAIN' && k === 0) continue;
      const a = prev ? coord(prev) + stopDist(prev, S) : S.from;
      const b = nxt ? coord(nxt) - stopDist(nxt, S) : S.to;
      for (const d of S.dirs) {
        const wl = (off) => (S.ns ? -d.sign * off : d.sign * off);
        const hasStop = d.sign > 0 ? !!nxt : !!prev;
        const stopAt = d.sign > 0 ? b : a;
        const n = d.offs.length;
        g.color(COL.white);
        for (let i = 0; i < n - 1; i++) {
          const busNext = i + 1 === d.bus;
          const off = busNext ? d.offs[i] + S.lw / 2 : (d.offs[i] + d.offs[i + 1]) / 2;
          if (busNext) {
            L(wl(off), a, b, 0.24);
            continue;
          }
          if (hasStop) {
            const s0 = d.sign > 0 ? b - 18 : a + 18;
            if (d.sign > 0) {
              D(wl(off), a, s0, 0.13);
              L(wl(off), s0, b, 0.13);
            } else {
              D(wl(off), s0, b, 0.13);
              L(wl(off), a, s0, 0.13);
            }
          } else D(wl(off), a, b, 0.13);
        }
        if (hasStop) {
          const lo = d.offs[0] - S.lw / 2, hi = d.offs[n - 1] + (d.bus >= 0 ? 1.8 : S.lw / 2);
          R(g, wl(lo), wl(hi), stopAt, stopAt + d.sign * 0.6, Y);
        }
        if (d.bus >= 0) {
          B.asphalt.color(COL.busRed);
          R(B.asphalt, wl(d.offs[d.bus] - 1.75), wl(d.offs[d.bus] + 1.75), a, b, 0.012);
        }
      }
      g.color(COL.yellow);
      if (S.twoWay) {
        if (S.median < 1) {
          L(-0.15, a, b, 0.11);
          L(0.15, a, b, 0.11);
        } else {
          L(-(S.median / 2 + 0.3), a, b, 0.12);
          L(S.median / 2 + 0.3, a, b, 0.12);
        }
      }
      if (S.park > 0) {
        g.color(COL.white);
        const pl = S.halfCurb - S.park;
        L(-pl, a + 5, b - 5, 0.1);
        L(pl, a + 5, b - 5, 0.1);
      }
    }
  }
  // crosswalks (continental bars)
  g.color(COL.white);
  for (const n of NODES) {
    const hx = n.ns.halfCurb, hz = n.ew.halfCurb;
    for (const sgn of [-1, 1]) {
      const zc = n.z + sgn * (hz + 1.8);
      for (let x = n.x - hx + 0.5; x < n.x + hx - 0.9; x += 1.2) flat(g, x, zc - 1.4, x + 0.6, zc + 1.4, Y);
      const xc = n.x + sgn * (hx + 1.8);
      if (xc < n.ew.from) continue;
      for (let z = n.z - hz + 0.5; z < n.z + hz - 0.9; z += 1.2) flat(g, xc - 1.4, z, xc + 1.4, z + 0.6, Y);
    }
  }
}

function river(B) {
  // water
  {
    const g = B.water;
    g.color([1, 1, 1]);
    flat(g, -HALF, -HALF, RIVER_X + 0.4, HALF, WATER_Y);
  }
  // seawall
  {
    const g = B.conc;
    g.color(COL.stone);
    g.quadN([RIVER_X, WATER_Y - 3, -HALF], [RIVER_X, WATER_Y - 3, HALF], [RIVER_X, CURB_H, HALF], [RIVER_X, CURB_H, -HALF], -1, 0, 0,
      [-HALF, 0], [HALF, 0], [HALF, 8], [-HALF, 8]);
    // coping
    box(g, RIVER_X + 0.35, CURB_H, 0, 0.7, 0.35, HALF * 2, 0);
  }
  // street bridges
  for (const S of EW) {
    if (S.id === 'MAIN') continue;
    const xa = -HALF, xb = RIVER_X;
    const cx = (xa + xb) / 2, len = xb - xa;
    const hw = S.halfRow;
    // slab
    B.conc.color(COL.conc);
    box(B.conc, cx, -1.1, S.pos, len, 1.1, hw * 2 + 0.6, 0, { top: false, bottom: true });
    // steel girders
    B.steel.color(COL.steelDark);
    box(B.steel, cx, -2.5, S.pos, len, 1.4, hw * 2 - 2.2, 0, { top: false, bottom: true });
    // roadway
    B.asphalt.color(COL.asphalt);
    flat(B.asphalt, xa, S.pos - S.halfCurb, xb, S.pos + S.halfCurb, 0);
    // sidewalks
    for (const sg of [-1, 1]) {
      const z0 = S.pos + sg * S.halfCurb, z1 = S.pos + sg * (hw + 0.3);
      const zc = (z0 + z1) / 2, w = Math.abs(z1 - z0);
      B.pave.color(COL.curb);
      box(B.pave, cx, 0, zc, len, CURB_H, w, 0, { top: false });
      B.pave.color(COL.sidewalk);
      flat(B.pave, xa, Math.min(z0, z1), xb, Math.max(z0, z1), CURB_H);
    }
    // river piers
    B.conc.color(COL.concDark);
    for (const px of BRIDGE_PIERS_X) {
      box(B.conc, px, WATER_Y - 4, S.pos, 3.2, 4 + (-2.5 - WATER_Y), hw * 2 - 3, 0, { top: false });
      // cutwater noses
      box(B.conc, px, WATER_Y - 4, S.pos, 5.2, 5.2, hw * 2 + 1.5, 0);
    }
  }
  // amusement pier deck (west end of Main St)
  {
    const x0 = -318, x1 = RIVER_X, z0 = -94, z1 = -26;
    B.wood.color([0.95, 0.9, 0.85]);
    box(B.wood, (x0 + x1) / 2, CURB_H - 0.9, (z0 + z1) / 2, x1 - x0, 0.9, z1 - z0, 0, { bottom: true });
    B.conc.color(hexToRgb(0x4d4338));
    for (let x = x0 + 4; x < x1 - 2; x += 9.4) {
      for (let z = z0 + 4; z <= z1 - 3; z += 10) cyl(B.conc, x, WATER_Y - 3, z, 0.42, 0.42, CURB_H - 0.9 - (WATER_Y - 3), 8, { top: false });
    }
  }
}

function plinth(B) {
  const g = B.conc;
  const Y0 = -15, Yb = -1.3;
  const top = hexToRgb(0x77726a), soilA = hexToRgb(0x51493f), soilB = hexToRgb(0x2b2622);
  const waterA = hexToRgb(0x2c6d78), waterB = hexToRgb(0x11323b), bed = hexToRgb(0x2a2824);
  // vertical gradient quad between two ground points (a -> b), y from ya to yb
  const face = (ax, az, bx, bz, ya, yb, ca, cb, nx, nz) => {
    const i0 = (g.color(cb), g.v(ax, yb, az, nx, 0, nz));
    const i1 = (g.color(cb), g.v(bx, yb, bz, nx, 0, nz));
    const i2 = (g.color(ca), g.v(bx, ya, bz, nx, 0, nz));
    const i3 = (g.color(ca), g.v(ax, ya, az, nx, 0, nz));
    // winding: choose by cross product against normal
    const ux = bx - ax, uz = bz - az;
    // normal of (p1-p0) x (p2-p0) with p0=(ax,yb,az), p1=(bx,yb,bz), p2=(bx,ya,bz): = (ux,0,uz) x (ux, ya-yb, uz)
    const gx = 0 * uz - uz * (ya - yb), gz = ux * (ya - yb) - 0 * ux;
    if (gx * nx + gz * nz >= 0) g.i.push(i0, i1, i2, i0, i2, i3);
    else g.i.push(i0, i2, i1, i0, i3, i2);
  };
  const land = (ax, az, bx, bz, nx, nz) => {
    face(ax, az, bx, bz, 0, Yb, top, top, nx, nz);
    face(ax, az, bx, bz, Yb, Y0, soilA, soilB, nx, nz);
  };
  land(RIVER_X, HALF, HALF, HALF, 0, 1);
  land(RIVER_X, -HALF, HALF, -HALF, 0, -1);
  land(HALF, -HALF, HALF, HALF, 1, 0);
  const wet = (ax, az, bx, bz, nx, nz) => {
    face(ax, az, bx, bz, WATER_Y, -11.5, waterA, waterB, nx, nz);
    face(ax, az, bx, bz, -11.5, Y0, bed, bed, nx, nz);
  };
  wet(-HALF, -HALF, -HALF, HALF, -1, 0);
  wet(-HALF, HALF, RIVER_X, HALF, 0, 1);
  wet(-HALF, -HALF, RIVER_X, -HALF, 0, -1);
  // underside
  g.color(soilB);
  g.quadN([-HALF, Y0, -HALF], [HALF, Y0, -HALF], [HALF, Y0, HALF], [-HALF, Y0, HALF], 0, -1, 0);
}

export function buildGround(B) {
  baseAsphalt(B);
  blocks(B);
  medians(B);
  markings(B);
  river(B);
  plinth(B);
}
