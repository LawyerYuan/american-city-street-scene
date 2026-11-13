// Elevated freeway: lane paths (for traffic) and deck ribbons (for geometry).
// Mainline runs east-west above Elm St (z = 180). The north leg runs above Viaduct Blvd (x = 60)
// and ends in a trumpet interchange: a flyover bridge, a 270-degree loop and an outer ramp.
import { HALF, EXT, FWY_Y, BR_Y } from './layout.js';
import { Path, line, arc, blend, join } from './paths.js';
import { easeLin } from './util.js';

const E = HALF + EXT;
const MZ = 180; // mainline axis
const NX = 60; // north-leg axis
const LW = 3.6;

// lane centre lines
const zEB = [MZ + 0.5 + LW * 0.5, MZ + 0.5 + LW * 1.5, MZ + 0.5 + LW * 2.5]; // 182.3, 185.9, 189.5
const zWB = [MZ - 0.5 - LW * 0.5, MZ - 0.5 - LW * 1.5, MZ - 0.5 - LW * 2.5]; // 177.7, 174.1, 170.5
const xSB = [NX - 0.5 - LW * 0.5, NX - 0.5 - LW * 1.5]; // 57.7 (left), 54.1 (right)
const xNB = [NX + 0.5 + LW * 0.5, NX + 0.5 + LW * 1.5]; // 62.3 (left), 65.9 (right)

// trumpet geometry
export const LOOP_C = [15.5, 238];
const R_IN = 40, R_OUT = 49;
const R_TURN = 60;

function bridgeY(z) {
  if (z >= 150) return BR_Y;
  if (z <= 5) return FWY_Y;
  return FWY_Y + (BR_Y - FWY_Y) * (1 - easeLin((150 - z) / 145));
}

function s2dNear(xz, x, z) {
  let s = 0, best = 0, bd = Infinity;
  for (let i = 0; i < xz.length; i++) {
    if (i > 0) s += Math.hypot(xz[i][0] - xz[i - 1][0], xz[i][1] - xz[i - 1][1]);
    const d = (xz[i][0] - x) ** 2 + (xz[i][1] - z) ** 2;
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

const P = {};

// through lanes
P.EB1 = new Path(line(-E, zEB[0], E, zEB[0], 6), FWY_Y);
P.EB2 = new Path(line(-E, zEB[1], E, zEB[1], 6), FWY_Y);
P.WB1 = new Path(line(E, zWB[0], -E, zWB[0], 6), FWY_Y);
P.WB2 = new Path(line(E, zWB[1], -E, zWB[1], 6), FWY_Y);

// EB lane 3 -> outer ramp -> bridge -> north leg NB left lane
{
  const a1c = [-75.5, zEB[2] + 42];
  const xz = join(
    line(-E, zEB[2], a1c[0], zEB[2], 4),
    arc(a1c[0], a1c[1], 42, -90, 0),
    line(a1c[0] + 42, a1c[1], LOOP_C[0] - R_OUT, LOOP_C[1], 2),
    arc(LOOP_C[0], LOOP_C[1], R_OUT, 180, 0),
    blend(LOOP_C[0] + R_OUT, LOOP_C[1], xNB[0], 200),
    line(xNB[0], 200, xNB[0], -E, 4),
  );
  const sA = s2dNear(xz, a1c[0], zEB[2]);
  const sB = s2dNear(xz, xNB[0], 200);
  P.EN = new Path(xz, (x, z, s) => {
    if (s <= sA) return FWY_Y;
    if (s < sB) return FWY_Y + (BR_Y - FWY_Y) * easeLin((s - sA) / (sB - sA), 0.2);
    return bridgeY(z);
  });
}

// north leg SB left lane -> bridge -> loop -> EB lane 3
{
  const xz = join(
    line(xSB[0], -E, xSB[0], 200, 4),
    blend(xSB[0], 200, LOOP_C[0] + R_IN, LOOP_C[1]),
    arc(LOOP_C[0], LOOP_C[1], R_IN, 0, 270),
    line(LOOP_C[0], LOOP_C[1] - R_IN, 22, LOOP_C[1] - R_IN, 2),
    blend(22, LOOP_C[1] - R_IN, 112, zEB[2]),
    line(112, zEB[2], E, zEB[2], 4),
  );
  const sC = s2dNear(xz, xSB[0], 200);
  const sD = s2dNear(xz, LOOP_C[0], LOOP_C[1] - R_IN);
  P.NE = new Path(xz, (x, z, s) => {
    if (s <= sC) return bridgeY(z);
    if (s < sD) return BR_Y - (BR_Y - FWY_Y) * easeLin((s - sC) / (sD - sC), 0.2);
    return FWY_Y;
  });
}

// WB lane 3 -> ramp A -> north leg NB right lane
{
  const xz = join(
    line(E, zWB[2], 132, zWB[2], 4),
    arc(132, zWB[2] - R_TURN, R_TURN, 90, 180),
    line(132 - R_TURN, zWB[2] - R_TURN, 72, 40, 2),
    blend(72, 40, xNB[1], -30),
    line(xNB[1], -30, xNB[1], -E, 4),
  );
  P.WN = new Path(xz, FWY_Y);
}

// north leg SB right lane -> ramp B -> WB lane 3
{
  const xz = join(
    line(xSB[1], -E, xSB[1], -30, 4),
    blend(xSB[1], -30, 48, 40),
    line(48, 40, 48, zWB[2] - R_TURN, 2),
    arc(48 - R_TURN, zWB[2] - R_TURN, R_TURN, 0, 90),
    line(48 - R_TURN, zWB[2], -E, zWB[2], 4),
  );
  P.NW = new Path(xz, FWY_Y);
}

export const FWY_PATHS = P;

// Traffic lanes: [path, vmax, relative flow]
export const FWY_LANES = [
  { id: 'EB1', path: P.EB1, vmax: 23, flow: 0.9 },
  { id: 'EB2', path: P.EB2, vmax: 21, flow: 1.0 },
  { id: 'EN', path: P.EN, vmax: 19, flow: 0.75 },
  { id: 'NE', path: P.NE, vmax: 19, flow: 0.7 },
  { id: 'WB1', path: P.WB1, vmax: 23, flow: 0.9 },
  { id: 'WB2', path: P.WB2, vmax: 21, flow: 1.0 },
  { id: 'WN', path: P.WN, vmax: 19, flow: 0.8 },
  { id: 'NW', path: P.NW, vmax: 19, flow: 0.8 },
];

// ---- Deck ribbons -------------------------------------------------------------
const mainPath = new Path(line(-HALF, MZ, HALF, MZ, 6), FWY_Y);
const nlegPath = new Path(line(NX, -HALF, NX, -30, 6), FWY_Y);

const sNE = (x, z) => P.NE.sNear(x, z);
const sEN = (x, z) => P.EN.sNear(x, z);
const sWN = (x, z) => P.WN.sNear(x, z);
const sNW = (x, z) => P.NW.sNear(x, z);

const W = 'w', Y = 'y';

export const RIBBONS = [
  {
    id: 'MAIN', path: mainPath, s0: 0, s1: mainPath.len, halfL: 12.7, halfR: 12.7, depth: 1.9, bias: 0.06,
    capStart: true, capEnd: true,
    barR: (f) => f.x < -76 || (f.x > -50 && f.x < 24) || f.x > 114,
    barL: (f) => !(f.x > 98 && f.x < 136) && !(f.x > -16 && f.x < 22),
    bars: [{ off: 0, w: 0.6 }],
    marks: [
      { off: -0.75, c: Y }, { off: 0.75, c: Y },
      { off: -4.1, c: W, dash: true }, { off: 4.1, c: W, dash: true },
      { off: -7.7, c: W, dash: true }, { off: 7.7, c: W, dash: true },
      { off: -11.3, c: W }, { off: 11.3, c: W },
    ],
    pier: { kind: 'hammer', cap: 19, colX: 3.2, colZ: 2.2 },
  },
  {
    id: 'NLEG', path: nlegPath, s0: 0, s1: nlegPath.len, halfL: 9.6, halfR: 9.6, depth: 1.7, bias: 0.04,
    capStart: true,
    barL: () => true, barR: () => true,
    bars: [{ off: 0, w: 0.6 }],
    marks: [
      { off: -0.75, c: Y }, { off: 0.75, c: Y },
      { off: -4.1, c: W, dash: true }, { off: 4.1, c: W, dash: true },
      { off: -7.7, c: W }, { off: 7.7, c: W },
    ],
    pier: { kind: 'hammer', cap: 14, colX: 2.2, colZ: 3.0 },
  },
  {
    // SB left lane: bridge + loop + merge taper
    id: 'BR_SB', path: P.NE, s0: sNE(xSB[0], -30), s1: sNE(112, zEB[2]), halfL: 3.4, halfR: 3.4, depth: 1.4, bias: 0,
    barR: (f) => f.z > 2,
    barL: (f) => f.s >= sNE(57.1, 214) && f.s <= sNE(26, LOOP_C[1] - R_IN),
    bars: [{ off: -2.3, w: 0.5, pred: (f) => f.s <= sNE(xSB[0], 204) }],
    marks: [
      { off: -1.8, c: Y, pred: (f) => f.s >= sNE(xSB[0], 196) && f.s <= sNE(44, 197.4) },
      { off: 1.8, c: W, pred: (f) => f.z > 2 && f.s <= sNE(40, LOOP_C[1] - R_IN) },
      { off: 1.8, c: W, dash: true, pred: (f) => f.z <= 2 },
      { off: -1.3, c: Y, pred: (f) => f.s < sNE(xSB[0], 196) },
    ],
    pier: { kind: 'round', r: 0.9, every: 24 },
  },
  {
    // EB lane 3 exit: outer ramp + bridge NB lane
    id: 'BR_NB', path: P.EN, s0: sEN(-75.5, zEB[2]), s1: sEN(xNB[0], -30), halfL: 3.4, halfR: 3.4, depth: 1.4, bias: -0.02,
    barL: (f) => f.s >= sEN(-51.5, 197) && f.s <= sEN(62.9, 214),
    barR: (f) => f.s <= sEN(xNB[0], 2),
    marks: [
      { off: -1.8, c: Y, pred: (f) => f.s >= sEN(-51.5, 197) && f.s <= sEN(xNB[0], 196) },
      { off: 1.8, c: W, pred: (f) => f.s <= sEN(xNB[0], 2) },
      { off: 1.8, c: W, dash: true, pred: (f) => f.s > sEN(xNB[0], 2) },
      { off: -1.3, c: Y, pred: (f) => f.s > sEN(xNB[0], 196) },
    ],
    pier: { kind: 'round', r: 0.9, every: 24 },
  },
  {
    id: 'A', path: P.WN, s0: sWN(132, zWB[2]), s1: sWN(xNB[1], -30), halfL: 3.4, halfR: 3.4, depth: 1.4, bias: -0.04,
    barR: () => true,
    barL: (f) => f.s >= sWN(102.9, 163) && f.z > 2,
    marks: [
      { off: 1.8, c: W },
      { off: -1.8, c: Y, pred: (f) => f.s >= sWN(102.9, 163) && f.z > 2 },
    ],
    pier: { kind: 'round', r: 0.8, every: 22 },
  },
  {
    id: 'B', path: P.NW, s0: sNW(xSB[1], -30), s1: sNW(-12, zWB[2]), halfL: 3.4, halfR: 3.4, depth: 1.4, bias: -0.04,
    barR: () => true,
    barL: (f) => f.z >= 2 && f.s <= sNW(17.1, 163),
    marks: [
      { off: 1.8, c: W },
      { off: -1.8, c: Y, pred: (f) => f.z >= 2 && f.s <= sNW(17.1, 163) },
    ],
    pier: { kind: 'round', r: 0.8, every: 22 },
  },
];

export const FWY = { MZ, NX, zEB, zWB, xSB, xNB, R_IN, R_OUT, LOOP_C };
