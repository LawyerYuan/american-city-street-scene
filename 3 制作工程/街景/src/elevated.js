// Elevated freeway geometry: decks, barriers, deck markings and piers.
import { box, sweep, cyl } from './geo.js';
import { RIBBONS, FWY } from './freeway.js';
import { HALF, CURB_H, NS, EW, ST, onRoadway, RIVER_X, FWY_Y, BR_Y } from './layout.js';
import { COL } from './ground.js';
import { hexToRgb, easeLin } from './util.js';

const BARRIER = hexToRgb(0xc9c5bb);
const DECK_SIDE = hexToRgb(0xb9b5ab);
const PIER = hexToRgb(0xa9a59c);

// runs of consecutive frames where pred is true
function runs(frames, pred) {
  const out = [];
  let cur = null;
  for (const f of frames) {
    if (!pred || pred(f)) {
      if (!cur) {
        cur = [];
        out.push(cur);
      }
      cur.push(f);
    } else cur = null;
  }
  return out.filter((r) => r.length > 1);
}

function barrier(B, frames, off, w, bias, pred) {
  const sec = [[off - w / 2, bias], [off - w * 0.22, bias + 0.86], [off + w * 0.22, bias + 0.86], [off + w / 2, bias]];
  B.conc.color(BARRIER);
  for (const r of runs(frames, pred)) sweep(B.conc, r, sec, { closed: false, capStart: true, capEnd: true });
}

export const DECK_SAMPLES = []; // {x,z,half,y,id} for clearance tests
export const PIERS = []; // placed pier ground points

function hammerPier(B, x, z, axisNS, yTop, capLen, colAlong, colAcross, baseY) {
  // yTop = soffit level (underside of the deck)
  const capW = 2.6;
  const hc = capLen / 2;
  const colHalf = colAcross / 2;
  const sec = [
    [-hc, 0], [hc, 0], [hc, -0.95], [colHalf + 0.5, -1.95], [-colHalf - 0.5, -1.95], [-hc, -0.95],
  ];
  // frames: extrude along the deck axis, lateral = across the deck
  const mk = (t) => (axisNS
    ? { x, y: yTop, z: z + t, nx: -1, nz: 0, s: t }
    : { x: x + t, y: yTop, z, nx: 0, nz: 1, s: t });
  B.conc.color(PIER);
  sweep(B.conc, [mk(-capW / 2), mk(capW / 2)], sec, { closed: true, capStart: true, capEnd: true });
  const h = yTop - 1.95 - baseY;
  if (axisNS) box(B.conc, x, baseY, z, colAcross, h, colAlong, 0, { top: false });
  else box(B.conc, x, baseY, z, colAlong, h, colAcross, 0, { top: false });
  PIERS.push({ x, z });
}

function roundPier(B, x, z, yTop, r, baseY = CURB_H) {
  B.conc.color(PIER);
  const h = yTop - baseY;
  cyl(B.conc, x, baseY, z, r, r, h - 1.3, 14, { top: false });
  cyl(B.conc, x, baseY + h - 1.3, z, r, r * 1.9, 1.3, 14, { top: false });
  PIERS.push({ x, z });
}

function zones(streets, lo, hi, pad) {
  // free intervals along an axis between crossing-street boxes
  const cuts = streets.map((s) => [s.pos - s.halfCurb - pad, s.pos + s.halfCurb + pad]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let a = lo;
  for (const c of cuts) {
    if (c[1] < lo || c[0] > hi) continue;
    if (c[0] > a) out.push([a, Math.min(c[0], hi)]);
    a = Math.max(a, c[1]);
  }
  if (a < hi) out.push([a, hi]);
  return out;
}
function spread(a, b, maxSpan) {
  const n = Math.max(1, Math.ceil((b - a) / maxSpan));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

function bridgeY(z) {
  if (z >= 150) return BR_Y;
  if (z <= 5) return FWY_Y;
  return FWY_Y + (BR_Y - FWY_Y) * (1 - easeLin((150 - z) / 145));
}

export function buildElevated(B) {
  const built = [];
  for (const R of RIBBONS) {
    const frames = R.path.frames(R.s0, R.s1, 2.5);
    const hL = R.halfL, hR = R.halfR, b = R.bias;
    // top surface
    B.asphalt.color(COL.deck);
    sweep(B.asphalt, frames, [[-hL, b], [hR, b]], { closed: false, normalOut: [[0, 1]], uvLateral: true });
    // body
    const k = hL > 6 ? 0.52 : 0.5;
    const sec = [[-hL, b], [-hL, b - 0.45], [-hL * k, b - R.depth], [hR * k, b - R.depth], [hR, b - 0.45], [hR, b]];
    B.conc.color(DECK_SIDE);
    sweep(B.conc, frames, sec, { closed: false, capStart: !!R.capStart, capEnd: !!R.capEnd });
    // barriers
    if (R.barL) barrier(B, frames, -hL + 0.26, 0.5, b, R.barL);
    if (R.barR) barrier(B, frames, hR - 0.26, 0.5, b, R.barR);
    for (const bar of R.bars || []) barrier(B, frames, bar.off, bar.w, b, bar.pred);
    // markings
    for (const m of R.marks || []) {
      B.mark.color(m.c === 'y' ? COL.yellow : COL.white);
      const sec2 = [[m.off - 0.075, b + 0.035], [m.off + 0.075, b + 0.035]];
      if (m.dash) {
        for (let s = R.s0 + 2; s < R.s1 - 3; s += 9) {
          const fr = R.path.frames(s, s + 3, 1.5);
          if (m.pred && !m.pred(fr[0])) continue;
          sweep(B.mark, fr, sec2, { closed: false, normalOut: [[0, 1]] });
        }
      } else {
        for (const r of runs(frames, m.pred)) sweep(B.mark, r, sec2, { closed: false, normalOut: [[0, 1]] });
      }
    }
    for (const f of frames) DECK_SAMPLES.push({ x: f.x, z: f.z, half: Math.max(hL, hR), y: f.y, id: R.id });
    built.push({ R, frames });
  }

  // ---- piers ----
  const blockedByDeck = (x, z, soffit, id) => {
    for (const d of DECK_SAMPLES) {
      if (d.id === id) continue;
      if (d.y >= soffit - 0.3) continue;
      const dx = d.x - x, dz = d.z - z;
      if (dx * dx + dz * dz < (d.half + 1.8) * (d.half + 1.8)) return true;
    }
    return false;
  };

  // mainline: hammerheads in the Elm St median
  {
    const R = RIBBONS.find((r) => r.id === 'MAIN');
    const zs = zones(NS, -HALF + 8, HALF - 8, 8.2);
    for (const [a, c] of zs) {
      if (c - a < 4) continue;
      for (const x of spread(a + 1, c - 1, 34)) {
        hammerPier(B, x, FWY.MZ, false, FWY_Y + R.bias - R.depth, R.pier.cap, R.pier.colX, R.pier.colZ, CURB_H);
      }
    }
  }
  // north leg: hammerheads in the Viaduct Blvd median
  {
    const R = RIBBONS.find((r) => r.id === 'NLEG');
    const zs = zones(EW, -HALF + 8, -34, 8.2);
    for (const [a, c] of zs) {
      if (c - a < 4) continue;
      for (const z of spread(a + 1, c - 1, 32)) {
        hammerPier(B, FWY.NX, z, true, FWY_Y + R.bias - R.depth, R.pier.cap, R.pier.colZ, R.pier.colX, CURB_H);
      }
    }
  }
  // flyover bridge: hammerheads in the median, rising with the bridge
  {
    const zs = zones(EW, -26, 207, 8.2);
    for (const [a, c] of zs) {
      if (c - a < 2) continue;
      for (const z of spread(a + 1, c - 1, 30)) {
        const y = bridgeY(z) - 1.4 - 0.04;
        hammerPier(B, FWY.NX, z, true, y, z < 34 ? 18.5 : 9.6, 2.6, 2.0, CURB_H);
      }
    }
  }
  // ramps: round columns, placed where the ground is free
  const P = { x: 0, y: 0, z: 0 };
  for (const { R } of built) {
    if (!R.pier || R.pier.kind !== 'round') continue;
    let sa = R.s0 + 6, sb = R.s1 - 6;
    if (R.id === 'BR_SB') sa = R.path.sNear(56.5, 216);
    if (R.id === 'BR_NB') sb = R.path.sNear(63.2, 218);
    for (let s = sa; s <= sb; s += R.pier.every) {
      let placed = false;
      for (const ds of [0, 4, -4, 8, -8]) {
        const ss = s + ds;
        if (ss < sa || ss > sb) continue;
        R.path.at(ss, P);
        const soffit = P.y + R.bias - R.depth;
        if (P.x < RIVER_X + 2) continue;
        if (onRoadway(P.x, P.z, 1.6)) continue;
        if (blockedByDeck(P.x, P.z, soffit, R.id)) continue;
        if (PIERS.some((q) => Math.hypot(q.x - P.x, q.z - P.z) < 4)) continue;
        roundPier(B, P.x, P.z, soffit, R.pier.r, 0);
        placed = true;
        break;
      }
      if (!placed) continue;
    }
  }
}
