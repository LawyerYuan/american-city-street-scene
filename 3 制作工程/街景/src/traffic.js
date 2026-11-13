// Traffic simulation: IDM car-following on a lane graph, fixed-time signals, bus routes with stops.
import { NODES, ST } from './layout.js';
import { PAINTS } from './vehicles.js';
import { hexToRgb } from './util.js';

const S0 = 2.0; // standstill gap
const BRAKE = 2.2; // comfortable deceleration
const YELLOW = 3.0, ALLRED = 2.0;

const MIX_STREET = [['sedan', 34], ['suv', 26], ['pickup', 13], ['van', 8], ['taxi', 11], ['boxtruck', 4], ['school', 1.4]];
const MIX_FWY = [['sedan', 30], ['suv', 26], ['pickup', 14], ['van', 8], ['taxi', 2], ['boxtruck', 7], ['semi', 11], ['school', 0.4]];
const TRAILER_COLS = [0xe9e9e6, 0xe9e9e6, 0xc8ccd0, 0x9aa3ad, 0x2b4a7a, 0x8a1f1f, 0xd6c9a8, 0x2f5d3a].map(hexToRgb);
export const ROUTE_INFO = {
  14: { name: '14 路 · 码头线', color: hexToRgb(0x1f6fb5) },
  22: { name: '22 路 · 市中心环线', color: hexToRgb(0x2a9d5c) },
  9: { name: '9 路 · 高架下大道', color: hexToRgb(0xe0761a) },
};

function pickW(rng, list) {
  let sum = 0;
  for (const it of list) sum += it[1];
  let r = rng.next() * sum;
  for (const it of list) {
    r -= it[1];
    if (r <= 0) return it[0];
  }
  return list[0][0];
}

export class Traffic {
  constructor(net, T, rng) {
    this.net = net;
    this.T = T;
    this.rng = rng;
    this.lanes = net.lanes;
    this.all = new Set();
    this.time = 0;
    this.density = 1;
    this.busStops = []; // {x,z,dx,dz} for shelters
    this.tmpA = { x: 0, y: 0, z: 0 };
    this.tmpB = { x: 0, y: 0, z: 0 };
    this.setupSignals();
    this.setupRoutes();
    this.setupSources();
    this.populate();
  }

  // ---- signals ---------------------------------------------------------------
  setupSignals() {
    for (const n of NODES) {
      let g0 = 20, g1 = 20;
      if (n.ew.id === 'MAIN') g1 = 22;
      n.g0 = g0;
      n.g1 = g1;
      n.cycle = g0 + g1 + 2 * (YELLOW + ALLRED);
      n.offset = ((n.i * 9.5 + n.j * 7.3) % n.cycle + n.cycle) % n.cycle;
      n.sig = [2, 2];
    }
    this.updateSignals();
  }
  updateSignals() {
    for (const n of NODES) {
      const t = (this.time + n.offset) % n.cycle;
      let a = 2, b = 2;
      if (t < n.g0) a = 0;
      else if (t < n.g0 + YELLOW) a = 1;
      else if (t < n.g0 + YELLOW + ALLRED) a = 2;
      else if (t < n.g0 + YELLOW + ALLRED + n.g1) b = 0;
      else if (t < n.g0 + 2 * YELLOW + ALLRED + n.g1) b = 1;
      n.sig[0] = a;
      n.sig[1] = b;
    }
  }

  // ---- bus routes --------------------------------------------------------------
  walk(start, turns, loop) {
    const lanes = [start];
    let L = start;
    for (let k = 0; k < 60; k++) {
      if (!L.next.length) break;
      const want = turns[k] || 'S';
      const c = L.next.find((q) => q.turn === want && q.busOnly) || L.next.find((q) => q.turn === want && !q.noBus) || L.next.find((q) => q.turn === want);
      if (!c) break;
      L = c.to;
      if (loop && L === start) break;
      lanes.push(L);
    }
    return lanes;
  }
  setupRoutes() {
    const N = (id) => NODES.find((n) => n.id === id);
    const lanes = this.lanes;
    const src = (street, sign, idx) => lanes.find((l) => l.kind === 'street' && l.street === street && l.sign === sign && l.idx === idx && l.source);
    this.routes = {};
    // 14: Main St line: east edge -> pier turnaround -> east edge
    {
      const start = src(ST.MAIN, -1, 2);
      this.routes[14] = { id: 14, lanes: this.walk(start, [], false), loop: false, start, headway: 32, timer: 6, types: [['artic', 3], ['bus', 2]] };
    }
    // 22: clockwise downtown loop (right turns only)
    {
      const start = N('RIVxMAIN').out['MAIN+'][2];
      const turns = ['S', 'S', 'S', 'R', 'R', 'S', 'S', 'S', 'R', 'R'];
      this.routes[22] = { id: 22, lanes: this.walk(start, turns, true), loop: true, start, types: [['bus', 1]] };
    }
    // 9: Viaduct Blvd both ways
    {
      const a = src(ST.VIA, 1, 1), b = src(ST.VIA, -1, 1);
      this.routes[9] = { id: 9, lanes: this.walk(a, [], false), loop: false, start: a, headway: 48, timer: 20, types: [['bus', 1]] };
      this.routes['9b'] = { id: 9, lanes: this.walk(b, [], false), loop: false, start: b, headway: 48, timer: 38, types: [['bus', 1]] };
    }
    // stops: mid-block on every route lane that is long enough
    const P = { x: 0, y: 0, z: 0 }, D = { x: 0, z: 0 };
    for (const k in this.routes) {
      const r = this.routes[k];
      r.index = new Map();
      r.lanes.forEach((l, i) => r.index.set(l, i));
      for (const l of r.lanes) {
        // buses only stop where they have their own lane, so they never block traffic
        if (l.stops.length || l.len < 70 || !l.bus) continue;
        const s = l.uturn ? l.len * 0.5 : Math.min(l.len - 30, l.len * 0.58);
        const stop = { s, lane: l };
        l.stops.push(stop);
        l.path.at(s - 5, P);
        l.path.dir(s - 5, D);
        if (Math.abs(P.x) < 350 && Math.abs(P.z) < 350) this.busStops.push({ x: P.x, z: P.z, dx: D.x, dz: D.z, off: l.uturn ? 2.6 : (l.bus ? 2.4 : l.street.halfCurb - Math.abs(l.off) + 0.2), lane: l });
      }
    }
  }

  // ---- vehicles ----------------------------------------------------------------
  make(typeName, route) {
    const t = this.T[typeName], r = this.rng;
    const heavy = typeName === 'semi' || typeName === 'boxtruck' || t.isBus || typeName === 'school';
    let rgb;
    if (route) rgb = ROUTE_INFO[route.id].color;
    else if (t.fixed) rgb = t.fixed;
    else rgb = PAINTS[r.weighted(PAINTS.map((p) => p.w))].rgb;
    const c = {
      t, type: typeName, len: t.len, lane: null, s: 0, v: 0, next: null, prev: [],
      rgb, rgb2: typeName === 'semi' ? r.pick(TRAILER_COLS) : null,
      aMax: heavy ? r.range(0.9, 1.2) : r.range(1.5, 2.2),
      T: heavy ? r.range(1.4, 1.8) : r.range(1.0, 1.5),
      vFac: heavy ? r.range(0.86, 0.96) : r.range(0.9, 1.08),
      route: route || null, dwell: 0, dwelling: false, served: null, stuck: 0,
      x: 0, y: 0, z: 0, hx: 1, hz: 0, id: this.nextId = (this.nextId || 0) + 1,
    };
    return c;
  }
  place(c, lane, s, v) {
    c.lane = lane;
    c.s = s;
    c.v = v;
    // keep order: front-most first
    let i = lane.veh.length;
    while (i > 0 && lane.veh[i - 1].s < s) i--;
    lane.veh.splice(i, 0, c);
    this.all.add(c);
    this.chooseNext(c, lane);
  }
  remove(c) {
    const a = c.lane.veh, i = a.indexOf(c);
    if (i >= 0) a.splice(i, 1);
    if (c.lane.kind === 'conn') {
      c.lane.node.inBox[c.lane.group]--;
      c.lane.to.inbound--;
    }
    this.all.delete(c);
    c.dead = true;
  }
  chooseNext(c, L) {
    if (L.kind === 'conn') {
      c.next = L.to;
      return;
    }
    const nx = L.next;
    if (!nx.length) {
      c.next = null;
      return;
    }
    if (c.route) {
      const i = c.route.index.get(L);
      if (i !== undefined) {
        const want = c.route.lanes[i + 1] || (c.route.loop ? c.route.lanes[0] : null);
        const cn = want && nx.find((q) => q.to === want);
        if (cn) {
          c.next = cn;
          return;
        }
      }
    }
    const isBus = c.t.isBus;
    let sum = 0;
    for (const q of nx) if (!(q.busOnly && !isBus) && !(q.noBus && isBus)) sum += q.w;
    if (sum <= 0) {
      c.next = nx[0];
      return;
    }
    let r = this.rng.next() * sum;
    for (const q of nx) {
      if ((q.busOnly && !isBus) || (q.noBus && isBus)) continue;
      r -= q.w;
      if (r <= 0) {
        c.next = q;
        return;
      }
    }
    c.next = nx[0];
  }

  setupSources() {
    this.sources = [];
    for (const l of this.lanes) {
      if (!l.source || l.bus) continue;
      let mean;
      if (l.kind === 'fwy') mean = 2.7 / (l.flow || 1);
      else if (l.street.id === 'MAIN') mean = 10;
      else if (l.street.twoWay) mean = 10;
      else mean = 10.5;
      this.sources.push({ lane: l, mean, t: this.rng.range(0, mean) });
    }
  }
  headway(src) {
    const u = Math.max(1e-4, this.rng.next());
    const h = src.mean * (0.3 + 0.7 * -Math.log(u));
    return Math.max(src.lane.kind === 'fwy' ? 1.1 : 2.0, h / this.density);
  }
  randomType(lane) {
    return pickW(this.rng, lane.kind === 'fwy' ? MIX_FWY : MIX_STREET);
  }

  populate() {
    const r = this.rng;
    for (const l of this.lanes) {
      if (l.kind === 'conn' || l.bus) continue;
      const fwy = l.kind === 'fwy';
      let s = l.len - r.range(4, fwy ? 40 : 30);
      while (s > 12) {
        const c = this.make(this.randomType(l));
        if (s - c.len < 2) break;
        this.place(c, l, s, fwy ? l.path.speedAt(s) * 0.9 : l.vmax * r.range(0.3, 0.8));
        s -= c.len + (fwy ? r.range(14, 75) : r.range(9, 60)) / this.density;
      }
    }
    // loop buses
    const loop = this.routes[22];
    const n = loop.lanes.length;
    for (let k = 0; k < 4; k++) {
      const l = loop.lanes[Math.floor(((k + 0.3) / 4) * n)];
      const c = this.make('bus', loop);
      // clear a slot
      const s = l.len * 0.35;
      for (const o of l.veh.slice()) if (Math.abs(o.s - s) < 22) this.remove(o);
      this.place(c, l, s, 4);
    }
    // a few buses already en route on the other lines
    for (const k of [14, 9, '9b']) {
      const rt = this.routes[k];
      for (const f of [0.3, 0.7]) {
        const l = rt.lanes[Math.floor(f * rt.lanes.length)];
        const c = this.make(pickW(r, rt.types), rt);
        const s = l.len * 0.3;
        for (const o of l.veh.slice()) if (Math.abs(o.s - s) < 26) this.remove(o);
        this.place(c, l, s, 4);
      }
    }
  }

  spawn(dt) {
    for (const src of this.sources) {
      src.t -= dt;
      if (src.t > 0) continue;
      const l = src.lane;
      const last = l.veh[l.veh.length - 1];
      const free = last ? last.s - last.len : 1e9;
      const type = this.randomType(l);
      const len = this.T[type].len;
      if (free < len + 5) {
        src.t = 0.4;
        continue;
      }
      const c = this.make(type);
      const v0 = l.path.vlim[0] * c.vFac;
      this.place(c, l, 0, last ? Math.min(v0, Math.max(last.v, Math.sqrt(Math.max(0, 2 * 1.5 * (free - 6))))) : v0);
      src.t = this.headway(src);
    }
    for (const k in this.routes) {
      const rt = this.routes[k];
      if (rt.loop) continue;
      rt.timer -= dt;
      if (rt.timer > 0) continue;
      const l = rt.start;
      const last = l.veh[l.veh.length - 1];
      if (last && last.s - last.len < 26) {
        rt.timer = 1;
        continue;
      }
      const c = this.make(pickW(this.rng, rt.types), rt);
      this.place(c, l, 0, 8);
      rt.timer = rt.headway * this.rng.range(0.8, 1.25);
    }
  }

  mustStop(c, L, rem) {
    const node = L.node, g = L.group, st = node.sig[g];
    if (st === 2) return rem > -0.5;
    if (st === 1) return rem > (c.v * c.v) / (2 * 3.0) + 0.5;
    if (rem < 12 + c.v * 1.3) {
      if (node.inBox[1 - g] > 0) return rem > 1.0;
      const cn = c.next;
      if (cn && cn.to) {
        const tgt = cn.to;
        let space = 1e9;
        const p = tgt.veh[tgt.veh.length - 1];
        if (p) space = p.s - p.len + (p.v > 2.5 ? p.v * 3 : 0);
        space -= tgt.inbound * 7.5;
        if (space < c.len + 3) return rem > 1.0;
      }
    }
    return false;
  }

  step(dt) {
    this.time += dt;
    this.updateSignals();
    this.spawn(dt);
    const lanes = this.lanes;
    for (let li = 0; li < lanes.length; li++) {
      const L = lanes[li], arr = L.veh;
      if (!arr.length) continue;
      const path = L.path, isStreet = L.kind === 'street';
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        const rem = L.len - c.s;
        let v0 = path.speedAt(c.s) * c.vFac;
        if (c.next) {
          const vn = c.next.path.vlim[0] * c.vFac;
          const allow = Math.sqrt(vn * vn + 2 * 1.7 * Math.max(rem, 0));
          if (allow < v0) v0 = allow;
        }
        let gap = 1e9, lv = 0;
        if (i > 0) {
          const p = arr[i - 1];
          gap = p.s - p.len - c.s;
          lv = p.v;
        } else {
          let blocked = false;
          if (isStreet && L.node) blocked = this.mustStop(c, L, rem);
          if (blocked) {
            gap = rem + 0.6;
            lv = 0;
          } else {
            let nl = c.next, dist = rem, depth = 0;
            while (nl && depth < 3 && dist < 110) {
              const p = nl.veh[nl.veh.length - 1];
              if (p) {
                gap = dist + p.s - p.len;
                lv = p.v;
                break;
              }
              dist += nl.len;
              nl = nl.next.length === 1 ? nl.next[0] : null;
              depth++;
            }
          }
        }
        // bus stops
        if (c.route && L.stops.length) {
          const st = L.stops[0];
          if (c.served !== st && st.s > c.s - 1.5) {
            const gs = st.s - c.s;
            if (gs + S0 < gap) {
              gap = gs + S0;
              lv = 0;
            }
            if (c.v < 0.2 && gs < 1.6) {
              if (!c.dwelling) {
                c.dwelling = true;
                c.dwell = 5 + this.rng.next() * 6;
              }
              c.dwell -= dt;
              if (c.dwell <= 0) {
                c.served = st;
                c.dwelling = false;
              }
            }
          }
        }
        const dv = c.v - lv;
        const ss = S0 + Math.max(0, c.v * c.T + (c.v * dv) / (2 * Math.sqrt(c.aMax * BRAKE)));
        const vr = c.v / Math.max(v0, 0.5);
        let free = 1 - vr * vr * vr * vr;
        if (free < -1.6) free = -1.6;
        const gg = ss / Math.max(gap, 0.3);
        let acc = c.aMax * (free - gg * gg);
        if (acc < -8) acc = -8;
        c.v += acc * dt;
        if (c.v < 0) c.v = 0;
        if (gap < 0.4 && c.v > lv) c.v = Math.max(0, lv);
        c.s += c.v * dt;
        if (L.kind === 'conn') {
          if (c.v < 0.15) {
            c.stuck += dt;
            if (c.stuck > 40) c.kill = true;
          } else c.stuck = 0;
        }
      }
      // hand over to the next lane
      while (arr.length && (arr[0].s >= L.len || arr[0].kill)) {
        const c = arr[0];
        arr.shift();
        if (L.kind === 'conn') {
          L.node.inBox[L.group]--;
          L.to.inbound--;
        }
        const nl = c.next;
        if (!nl || c.kill) {
          this.all.delete(c);
          c.dead = true;
          continue;
        }
        c.s -= L.len;
        c.prev.unshift(L);
        if (c.prev.length > 3) c.prev.pop();
        c.lane = nl;
        c.stuck = 0;
        c.served = null;
        c.dwelling = false;
        nl.veh.push(c);
        if (nl.kind === 'conn') {
          nl.node.inBox[nl.group]++;
          nl.to.inbound++;
        }
        this.chooseNext(c, nl);
      }
    }
  }

  back(c, d, o) {
    let lane = c.lane, s = c.s - d, k = 0;
    while (s < 0 && k < c.prev.length) {
      lane = c.prev[k++];
      s += lane.len;
    }
    return lane.path.at(s, o);
  }

  // push instance transforms
  draw(vr) {
    const A = this.tmpA, Bp = this.tmpB;
    vr.begin();
    for (const c of this.all) {
      const t = c.t;
      this.back(c, t.fo, A);
      this.back(c, t.fo + t.wb, Bp);
      let fx = A.x - Bp.x, fy = A.y - Bp.y, fz = A.z - Bp.z;
      let l = Math.hypot(fx, fy, fz) || 1;
      fx /= l; fy /= l; fz /= l;
      const px = (A.x + Bp.x) / 2, py = (A.y + Bp.y) / 2, pz = (A.z + Bp.z) / 2;
      c.x = px; c.y = py; c.z = pz; c.hx = fx; c.hz = fz;
      vr.add(c.type, px, py, pz, fx, fy, fz, c.rgb, c);
      vr.beam(px, py, pz, fx, fz, t.fo + t.wb / 2);
      if (t.trailer) {
        this.back(c, t.kingpin, A);
        this.back(c, t.kingpin + t.trAxle, Bp);
        fx = A.x - Bp.x; fy = A.y - Bp.y; fz = A.z - Bp.z;
        l = Math.hypot(fx, fy, fz) || 1;
        vr.add(t.trailer, (A.x + Bp.x) / 2, (A.y + Bp.y) / 2, (A.z + Bp.z) / 2, fx / l, fy / l, fz / l, c.rgb2, c);
      } else if (t.rear) {
        this.back(c, t.joint, A);
        this.back(c, t.joint + t.rAxle, Bp);
        fx = A.x - Bp.x; fy = A.y - Bp.y; fz = A.z - Bp.z;
        l = Math.hypot(fx, fy, fz) || 1;
        vr.add(t.rear, (A.x + Bp.x) / 2, (A.y + Bp.y) / 2, (A.z + Bp.z) / 2, fx / l, fy / l, fz / l, c.rgb, c);
      }
    }
    vr.end();
  }

  stats() {
    let stopped = 0, inConn = 0, connStuck = 0, buses = 0, fwy = 0, vsum = 0;
    for (const c of this.all) {
      if (c.v < 0.3) stopped++;
      if (c.lane.kind === 'conn') {
        inConn++;
        if (c.stuck > 8) connStuck++;
      }
      if (c.route) buses++;
      if (c.lane.kind === 'fwy') {
        fwy++;
        vsum += c.v;
      }
    }
    const by = {};
    for (const c of this.all) {
      const L = c.lane.kind === 'conn' ? c.lane.from : c.lane;
      const k = L.kind === 'fwy' ? 'fwy:' + L.fid : L.street.id + (L.sign > 0 ? '+' : L.sign < 0 ? '-' : 'u');
      if (!by[k]) by[k] = [0, 0];
      by[k][0]++;
      if (c.v < 0.3) by[k][1]++;
    }
    return { stopped, inConn, connStuck, buses, fwy, fwyAvgV: fwy ? +(vsum / fwy).toFixed(1) : 0, simTime: Math.round(this.time), by };
  }
  buses() {
    const out = [];
    for (const c of this.all) if (c.route && Math.abs(c.x) < 330 && Math.abs(c.z) < 330) out.push(c);
    return out;
  }
  describe(c) {
    if (c.route) return ROUTE_INFO[c.route.id].name;
    return { sedan: '轿车', suv: 'SUV', pickup: '皮卡', van: '厢式车', taxi: '出租车', boxtruck: '货车', semi: '半挂卡车', school: '校车' }[c.type] || c.type;
  }
}
