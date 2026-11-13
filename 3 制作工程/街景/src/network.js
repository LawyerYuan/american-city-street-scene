// Lane graph: street lanes between intersections, turn connectors, the Main St turnaround, freeway lanes.
import { STREETS, NODES, ST, EXT, stopDist, LOOP_X, LOOP_FLARE } from './layout.js';
import { Path, line, arc, blend, cubic, join } from './paths.js';
import { FWY_LANES } from './freeway.js';

let laneId = 0;

export class Lane {
  constructor(path, o) {
    this.id = laneId++;
    this.path = path;
    this.len = path.len;
    this.kind = o.kind; // 'street' | 'conn' | 'fwy'
    this.vmax = o.vmax;
    this.next = [];
    this.veh = []; // front-most first
    this.node = o.node || null; // signal node at the end (street) or owner (connector)
    this.group = o.group === undefined ? -1 : o.group; // 0 = N-S approach, 1 = E-W approach
    this.street = o.street || null;
    this.sign = o.sign || 0;
    this.idx = o.idx === undefined ? -1 : o.idx;
    this.bus = !!o.bus; // bus-only lane
    this.turn = o.turn || 'S';
    this.busOnly = !!o.busOnly;
    this.noBus = !!o.noBus;
    this.w = o.w === undefined ? 1 : o.w;
    this.stops = [];
    this.source = false;
    this.sink = false;
    this.from = null;
    this.to = null;
    this.inbound = 0; // vehicles currently on connectors heading into this lane
    path.buildSpeed(this.vmax, o.aLat || 1.9, o.brake || 1.7);
  }
}

export function dirVec(street, sign) {
  return street.ns ? { x: 0, z: sign } : { x: sign, z: 0 };
}
// Point on a lane line: `off` metres to the right of the centre line, at axis coordinate `along`.
export function lanePt(street, sign, off, along) {
  return street.ns ? [street.pos - sign * off, along] : [along, street.pos + sign * off];
}
const key = (street, sign) => street.id + (sign > 0 ? '+' : '-');

const VMAX = { RIV: 13, VIA: 13, E: 13, MAIN: 12, '5TH': 12.5 };

export function buildNetwork() {
  laneId = 0;
  const lanes = [];
  const add = (l) => {
    lanes.push(l);
    return l;
  };
  for (const n of NODES) {
    n.in = {};
    n.out = {};
    n.conns = [];
    n.inBox = [0, 0];
  }

  for (const S of STREETS) {
    const vmax = VMAX[S.id] || 12;
    const nodes = NODES.filter((n) => (S.ns ? n.ns : n.ew) === S);
    const coord = (n) => (S.ns ? n.z : n.x);
    for (const d of S.dirs) {
      const sign = d.sign;
      const ns = nodes.slice().sort((a, b) => sign * (coord(a) - coord(b)));
      const k0 = key(S, sign);
      for (let k = 0; k <= ns.length; k++) {
        const prev = ns[k - 1], nxt = ns[k];
        if (S.id === 'MAIN' && ((sign > 0 && k === 0) || (sign < 0 && k === ns.length))) continue;
        const a = prev ? coord(prev) + sign * stopDist(prev, S) : sign > 0 ? S.from - EXT : S.to + EXT;
        const b = nxt ? coord(nxt) - sign * stopDist(nxt, S) : sign > 0 ? S.to + EXT : S.from - EXT;
        d.offs.forEach((off, i) => {
          const p0 = lanePt(S, sign, off, a), p1 = lanePt(S, sign, off, b);
          const lane = add(new Lane(new Path(line(p0[0], p0[1], p1[0], p1[1], 4), 0), {
            kind: 'street', vmax, street: S, sign, idx: i, bus: i === d.bus, node: nxt || null, group: S.ns ? 0 : 1,
          }));
          lane.a = a;
          lane.b = b;
          lane.off = off;
          if (prev) {
            if (!prev.out[k0]) prev.out[k0] = [];
            prev.out[k0][i] = lane;
          } else lane.source = true;
          if (nxt) {
            if (!nxt.in[k0]) nxt.in[k0] = [];
            nxt.in[k0][i] = lane;
          } else lane.sink = true;
        });
      }
    }
  }

  // Main St turnaround at the pier: U-shaped lanes, westbound exit -> eastbound approach of RIVxMAIN.
  const uLanes = [];
  {
    const S = ST.MAIN;
    const node = NODES.find((n) => n.id === 'RIVxMAIN');
    const xa = node.x - stopDist(node, S);
    const dW = S.dirs.find((d) => d.sign < 0);
    dW.offs.forEach((off, i) => {
      const R = off + LOOP_FLARE;
      const zN = S.pos - off, zS = S.pos + off;
      const xz = join(
        line(xa, zN, xa - 2, zN, 1),
        blend(xa - 2, zN, LOOP_X, S.pos - R),
        arc(LOOP_X, S.pos, R, -90, -270),
        blend(LOOP_X, S.pos + R, xa - 2, zS),
        line(xa - 2, zS, xa, zS, 1),
      );
      const lane = add(new Lane(new Path(xz, 0, 0.5), {
        kind: 'street', vmax: 9, street: S, sign: 0, idx: i, bus: i === dW.bus, node, group: 1,
      }));
      lane.uturn = true;
      lane.off = off;
      if (!node.out['MAIN-']) node.out['MAIN-'] = [];
      if (!node.in['MAIN+']) node.in['MAIN+'] = [];
      node.out['MAIN-'][i] = lane;
      node.in['MAIN+'][i] = lane;
      uLanes.push(lane);
    });
  }

  // Connectors
  const P0 = { x: 0, y: 0, z: 0 }, P1 = { x: 0, y: 0, z: 0 }, D0 = { x: 0, z: 0 }, D1 = { x: 0, z: 0 };
  function conn(L, M, turn, node, group, o = {}) {
    if (!L || !M) return null;
    L.path.at(L.len, P0);
    M.path.at(0, P1);
    L.path.dir(L.len - 0.01, D0);
    M.path.dir(0, D1);
    let xz;
    if (turn === 'S') xz = line(P0.x, P0.z, P1.x, P1.z, 2);
    else {
      const a = (P1.x - P0.x) * D0.x + (P1.z - P0.z) * D0.z;
      const b = (P1.x - P0.x) * D1.x + (P1.z - P0.z) * D1.z;
      const k = 0.5523;
      xz = cubic([P0.x, P0.z], [P0.x + D0.x * a * k, P0.z + D0.z * a * k], [P1.x - D1.x * b * k, P1.z - D1.z * b * k], [P1.x, P1.z], 16);
    }
    const c = add(new Lane(new Path(xz, 0, 0.5), {
      kind: 'conn', vmax: turn === 'S' ? Math.min(L.vmax, M.vmax) : 7.5, node, group, turn,
      busOnly: o.busOnly, noBus: o.noBus, w: turn === 'S' ? 1 : 0.24, aLat: 1.6,
    }));
    c.from = L;
    c.to = M;
    c.next = [M];
    L.next.push(c);
    node.conns.push(c);
    return c;
  }

  for (const n of NODES) {
    for (const S of [n.ns, n.ew]) {
      const T = S === n.ns ? n.ew : n.ns;
      const group = S.ns ? 0 : 1;
      for (const d of S.dirs) {
        const inL = n.in[key(S, d.sign)];
        if (!inL) continue;
        const dv = dirVec(S, d.sign);
        const rv = { x: -dv.z, z: dv.x }, lv = { x: dv.z, z: -dv.x };
        const signOn = (v) => (T.ns ? v.z : v.x);
        const nL = inL.length;
        inL.forEach((L, i) => {
          if (!L) return;
          const outS = n.out[key(S, d.sign)];
          if (outS && outS[i]) conn(L, outS[i], 'S', n, group);
          // right turn from the kerb lane
          const sr = signOn(rv);
          const outR = n.out[key(T, sr)];
          if (outR && i === nL - 1) {
            const tb = T.dirs.find((q) => q.sign === sr) || { bus: -1 };
            const hasBus = outR.length > 2 && outR[outR.length - 1].bus;
            if (S.bus) conn(L, outR[outR.length - 1], 'R', n, group, { busOnly: true });
            else if (hasBus || tb.bus >= 0) {
              conn(L, outR[outR.length - 2], 'R', n, group, { noBus: true });
              conn(L, outR[outR.length - 1], 'R', n, group, { busOnly: true });
            } else conn(L, outR[outR.length - 1], 'R', n, group);
          }
          // left turn: one-way streets only, from the left lane
          const sl = signOn(lv);
          const outL = n.out[key(T, sl)];
          if (outL && !S.twoWay && i === 0) conn(L, outL[0], 'L', n, group, { noBus: true });
        });
      }
    }
  }

  // Freeway lanes
  const fwy = {};
  for (const f of FWY_LANES) {
    const lane = add(new Lane(f.path, { kind: 'fwy', vmax: f.vmax, aLat: 2.3, brake: 1.3 }));
    lane.source = true;
    lane.sink = true;
    lane.flow = f.flow;
    lane.fid = f.id;
    fwy[f.id] = lane;
  }

  return { lanes, fwy, uLanes, nodes: NODES, key };
}
