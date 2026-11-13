// Plot, street grid, intersections and blocks. Units: metres. x = east, z = south, y = up.
export const HALF = 360;
export const RIVER_X = -244; // seawall; water lies west of it
export const WATER_Y = -5.5;
export const CURB_H = 0.16;
export const EXT = 36; // lanes run this far beyond the plot edge (hidden by clip planes)
export const FWY_Y = 9.5; // freeway deck level
export const BR_Y = 17; // flyover level
export const STOP_SETBACK = 4.2; // curb line -> stop bar
export const LOOP_X = -222; // centre of the Main St turnaround
export const LOOP_FLARE = 6;

function mk(o) {
  const s = Object.assign({ lw: 3.4, median: 0, park: 0, sw: 4.5, bus: false, fwd: 0, rev: 0, from: -HALF, to: HALF }, o);
  const twoWay = s.fwd > 0 && s.rev > 0;
  s.twoWay = twoWay;
  const offs = (n) => {
    const a = [];
    if (twoWay) {
      for (let i = 0; i < n; i++) a.push(s.median / 2 + s.lw * (i + 0.5));
      if (s.bus) a.push(s.median / 2 + n * s.lw + 1.8);
    } else {
      for (let i = 0; i < n; i++) a.push((i - (n - 1) / 2) * s.lw);
    }
    return a;
  };
  s.dirs = [];
  if (s.fwd > 0) s.dirs.push({ sign: 1, offs: offs(s.fwd), bus: s.bus ? s.fwd : -1 });
  if (s.rev > 0) s.dirs.push({ sign: -1, offs: offs(s.rev), bus: s.bus ? s.rev : -1 });
  s.halfCurb = twoWay
    ? s.median / 2 + Math.max(s.fwd, s.rev) * s.lw + (s.bus ? 3.6 : 0) + s.park
    : (Math.max(s.fwd, s.rev) * s.lw) / 2 + s.park;
  s.halfRow = s.halfCurb + s.sw;
  return s;
}

// ns: runs north-south at x = pos ('+' = south). Otherwise east-west at z = pos ('+' = east).
export const STREETS = [
  mk({ id: 'RIV', name: 'Riverside Dr', ns: true, pos: -180, fwd: 2, rev: 2, median: 3, sw: 5 }),
  mk({ id: '2ND', name: '2nd Ave', ns: true, pos: -60, fwd: 3, park: 2.4 }),
  mk({ id: 'VIA', name: 'Viaduct Blvd', ns: true, pos: 60, fwd: 2, rev: 2, median: 5, sw: 7.5 }),
  mk({ id: '4TH', name: '4th Ave', ns: true, pos: 180, rev: 3, park: 2.4 }),
  mk({ id: '5TH', name: '5th Ave', ns: true, pos: 300, fwd: 2, rev: 2, median: 0.4, park: 2.4, sw: 4.8 }),
  mk({ id: 'A', name: 'Ash St', ns: false, pos: -300, rev: 3, park: 2.4 }),
  mk({ id: 'B', name: 'Birch St', ns: false, pos: -180, fwd: 3, park: 2.4 }),
  mk({ id: 'MAIN', name: 'Main St', ns: false, pos: -60, fwd: 2, rev: 2, median: 4, bus: true, sw: 6, from: -240 }),
  mk({ id: 'D', name: 'Dock St', ns: false, pos: 60, rev: 3, park: 2.4 }),
  mk({ id: 'E', name: 'Elm St', ns: false, pos: 180, fwd: 2, rev: 2, median: 5, sw: 7.5 }),
  mk({ id: 'F', name: 'Front St', ns: false, pos: 300, fwd: 3, park: 2.4 }),
];
export const ST = {};
for (const s of STREETS) ST[s.id] = s;
export const NS = STREETS.filter((s) => s.ns);
export const EW = STREETS.filter((s) => !s.ns);

// Intersections
export const NODES = [];
for (const a of NS) {
  for (const b of EW) {
    if (a.pos < b.from || a.pos > b.to || b.pos < a.from || b.pos > a.to) continue;
    NODES.push({ id: a.id + 'x' + b.id, x: a.pos, z: b.pos, ns: a, ew: b, i: NS.indexOf(a), j: EW.indexOf(b) });
  }
}
export function nodeAt(a, b) {
  return NODES.find((n) => n.ns === a && n.ew === b);
}
// distance from a node centre to the stop bar along `street`
export function stopDist(node, street) {
  const cross = street.ns ? node.ew : node.ns;
  return cross.halfCurb + STOP_SETBACK;
}

// Is (x,z) on a carriageway (between curbs, not on a raised median)?
export function onRoadway(x, z, margin = 0) {
  if (x < RIVER_X) return false;
  for (const s of STREETS) {
    const along = s.ns ? z : x;
    const lat = Math.abs((s.ns ? x : z) - s.pos);
    if (along < s.from || along > s.to) continue;
    if (lat >= s.halfCurb + margin) continue;
    if (s.median >= 2 && lat < s.median / 2 - 0.2) {
      // on the median unless inside an intersection box
      let inBox = false;
      const cross = s.ns ? EW : NS;
      for (const c of cross) {
        if (Math.abs(along - c.pos) < c.halfCurb + 5.5) {
          inBox = true;
          break;
        }
      }
      if (inBox) return true;
      continue;
    }
    return true;
  }
  return false;
}

// ---- Blocks -------------------------------------------------------------------
export const BLOCKS = [];
{
  const xs = [];
  xs.push({ a: RIVER_X, b: ST.RIV.pos - ST.RIV.halfCurb, swA: 0, swB: 0, ci: -1 });
  for (let i = 0; i < NS.length - 1; i++) {
    xs.push({ a: NS[i].pos + NS[i].halfCurb, b: NS[i + 1].pos - NS[i + 1].halfCurb, swA: NS[i].sw, swB: NS[i + 1].sw, ci: i });
  }
  const lastN = NS[NS.length - 1];
  xs.push({ a: lastN.pos + lastN.halfCurb, b: HALF, swA: lastN.sw, swB: 0, ci: NS.length - 1 });
  const zs = [];
  zs.push({ a: -HALF, b: EW[0].pos - EW[0].halfCurb, swA: 0, swB: EW[0].sw, ri: 0 });
  for (let j = 0; j < EW.length - 1; j++) {
    zs.push({ a: EW[j].pos + EW[j].halfCurb, b: EW[j + 1].pos - EW[j + 1].halfCurb, swA: EW[j].sw, swB: EW[j + 1].sw, ri: j + 1 });
  }
  const lastE = EW[EW.length - 1];
  zs.push({ a: lastE.pos + lastE.halfCurb, b: HALF, swA: lastE.sw, swB: 0, ri: EW.length });
  for (const cx of xs) {
    for (const rz of zs) {
      const b = {
        ci: cx.ci, ri: rz.ri, x0: cx.a, x1: cx.b, z0: rz.a, z1: rz.b,
        sw: { w: cx.swA, e: cx.swB, n: rz.swA, s: rz.swB },
      };
      const R = 5;
      // corner radii: [x0z0, x1z0, x1z1, x0z1]; no rounding on plot edges / seawall
      const wEdge = cx.ci === -1, eEdge = cx.b === HALF, nEdge = rz.a === -HALF, sEdge = rz.b === HALF;
      b.round = [
        wEdge || nEdge ? 0 : R,
        eEdge || nEdge ? 0 : R,
        eEdge || sEdge ? 0 : R,
        wEdge || sEdge ? 0 : R,
      ];
      b.cx = (b.x0 + b.x1) / 2;
      b.cz = (b.z0 + b.z1) / 2;
      BLOCKS.push(b);
    }
  }
  // Promenade blocks next to the Main St turnaround give way to the bulb.
  const bulb = 16.6 + 1.8 + 2.1; // outer lane radius + half lane + margin
  for (const b of BLOCKS) {
    if (b.ci !== -1) continue;
    if (b.ri === 2) {
      b.z1 = ST.MAIN.pos - bulb;
      b.round = [0, 5, 0, 0];
      b.bulbFill = { x0: LOOP_X + 24, x1: b.x1, z0: b.z1, z1: ST.MAIN.pos - ST.MAIN.halfCurb };
    }
    if (b.ri === 3) {
      b.z0 = ST.MAIN.pos + bulb;
      b.round = [0, 0, 5, 0];
      b.bulbFill = { x0: LOOP_X + 24, x1: b.x1, z0: ST.MAIN.pos + ST.MAIN.halfCurb, z1: b.z0 };
    }
    b.cz = (b.z0 + b.z1) / 2;
  }
}
export function blockAt(ci, ri) {
  return BLOCKS.find((b) => b.ci === ci && b.ri === ri);
}
