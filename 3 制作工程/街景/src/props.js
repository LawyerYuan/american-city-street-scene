// Street furniture: trees, street lights, traffic signals, bus shelters, kerbside parked cars,
// freeway lighting and sign gantries, promenade lawns and railings, flags.
import * as THREE from 'three';
import { Geo, box, cyl } from './geo.js';
import { BLOCKS, STREETS, NODES, ST, HALF, CURB_H, RIVER_X, FWY_Y, stopDist, LOOP_X } from './layout.js';
import { MEDIANS, COL, flat } from './ground.js';
import { hexToRgb, TAU } from './util.js';
import { ATLAS } from './textures.js';
import { PAINTS } from './vehicles.js';
import { beam } from './landmarks.js';
import { dirVec } from './network.js';

const rgb = hexToRgb;
const WARM = [1.0, 0.82, 0.55], COOL = [0.86, 0.93, 1.0];

function signQuad(S, cx, cy, cz, nx, nz, w, h, name) {
  const r = ATLAS.r[name];
  const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;
  S.color([1, 1, 1]);
  S.quadN([cx - rx * hw, cy - hh, cz - rz * hw], [cx + rx * hw, cy - hh, cz + rz * hw], [cx + rx * hw, cy + hh, cz + rz * hw], [cx - rx * hw, cy + hh, cz - rz * hw],
    nx, 0, nz, [r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]);
}

// ---- trees ------------------------------------------------------------------------------
function crownGeometry() {
  const g = new Geo();
  const blobs = [[0, 5.3, 0, 2.5, 1], [1.7, 4.5, 0.7, 1.7, 0], [-1.5, 4.7, -1.1, 1.8, 0], [0.2, 6.6, -0.5, 1.6, 0], [-0.4, 4.3, 1.6, 1.5, 0]];
  for (const [bx, by, bz, r, det] of blobs) {
    const ico = new THREE.IcosahedronGeometry(1, det);
    const p = ico.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const tri = [];
      for (let k = 0; k < 3; k++) {
        const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
        const l = Math.hypot(x, y, z) || 1;
        const n = [x / l, y / l, z / l];
        const wob = 1 + 0.16 * Math.sin(n[0] * 5.1 + n[1] * 3.3 + bx) * Math.cos(n[2] * 4.7 + by);
        tri.push({ pos: [bx + n[0] * r * wob, by + n[1] * r * 0.9 * wob, bz + n[2] * r * wob], n });
      }
      for (const t of tri) t.shade = 0.6 + 0.45 * ((t.pos[1] - 2.6) / 5.4);
      // per-vertex colour: darker underneath
      const idx = [];
      for (const t of tri) {
        g.color([t.shade, t.shade, t.shade]);
        idx.push(g.v(t.pos[0], t.pos[1], t.pos[2], t.n[0], t.n[1], t.n[2]));
      }
      g.i.push(idx[0], idx[1], idx[2]);
    }
  }
  return g.build();
}
function trunkGeometry() {
  const g = new Geo();
  g.color(rgb(0x4a3a2c));
  cyl(g, 0, 0, 0, 0.24, 0.15, 4.0, 6, { top: false });
  return g.build();
}
const GREENS = [0x5c8f3c, 0x4f8234, 0x6a9a45, 0x487a36, 0x7aa24d, 0x3f7030, 0x568a3f].map(rgb);
const AUTUMN = [0xc98a2b, 0xb5532a, 0xd6a93a].map(rgb);

export function buildTrees(scene, list, rng) {
  const n = list.length;
  const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const trunkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const crowns = new THREE.InstancedMesh(crownGeometry(), leafMat, n);
  const trunks = new THREE.InstancedMesh(trunkGeometry(), trunkMat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
  list.forEach((t, i) => {
    const sc = t.s || 1;
    p.set(t.x, t.y === undefined ? CURB_H : t.y, t.z);
    q.setFromAxisAngle(up, rng.range(0, TAU));
    s.set(sc * rng.range(0.9, 1.12), sc * rng.range(0.88, 1.18), sc * rng.range(0.9, 1.12));
    m.compose(p, q, s);
    crowns.setMatrixAt(i, m);
    trunks.setMatrixAt(i, m);
    const col = rng.chance(0.045) ? rng.pick(AUTUMN) : rng.pick(GREENS);
    const v = rng.range(0.85, 1.12);
    crowns.setColorAt(i, c.setRGB(col[0] * v, col[1] * v, col[2] * v));
  });
  for (const mesh of [crowns, trunks]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }
  return n;
}

// ---- helpers ----------------------------------------------------------------------------
const coordOf = (S) => (n) => (S.ns ? n.z : n.x);
function segmentsOf(S) {
  const coord = coordOf(S);
  const nodes = NODES.filter((n) => (S.ns ? n.ns : n.ew) === S).sort((a, b) => coord(a) - coord(b));
  const out = [];
  for (let k = 0; k <= nodes.length; k++) {
    const prev = nodes[k - 1], nxt = nodes[k];
    if (S.id === 'MAIN' && k === 0) continue;
    out.push({ a: prev ? coord(prev) + stopDist(prev, S) : S.from, b: nxt ? coord(nxt) - stopDist(nxt, S) : S.to, prev, nxt });
  }
  return out;
}
const world = (S, lat, t) => (S.ns ? [S.pos + lat, t] : [t, S.pos + lat]);

export function buildProps(scene, B, M, o) {
  const { rng, trees, parked, stops, lColumns } = o;
  const lamps = []; // {x,y,z,c,size}
  const pools = []; // {x,y,z,r}
  const nearStop = (x, z, d) => stops.some((s) => Math.hypot(s.x - x, s.z - z) < d);
  const nearCol = (x, z, d) => lColumns.some((c) => Math.hypot(c[0] - x, c[1] - z) < d);

  // ---- street trees
  for (const b of BLOCKS) {
    if (b.ci === -1) continue;
    const add = (x, z) => {
      if (nearStop(x, z, 8) || nearCol(x, z, 3)) return;
      trees.push({ x, z, s: rng.range(0.72, 0.98) });
    };
    if (b.sw.n) for (let x = b.x0 + 10; x < b.x1 - 9; x += rng.range(12.5, 15.5)) add(x, b.z0 + 1.4);
    if (b.sw.s) for (let x = b.x0 + 12; x < b.x1 - 9; x += rng.range(12.5, 15.5)) add(x, b.z1 - 1.4);
    if (b.sw.w) for (let z = b.z0 + 11; z < b.z1 - 9; z += rng.range(12.5, 15.5)) add(b.x0 + 1.4, z);
    if (b.sw.e) for (let z = b.z0 + 13; z < b.z1 - 9; z += rng.range(12.5, 15.5)) add(b.x1 - 1.4, z);
  }
  // ---- promenade: lawns, tree rows, railing
  for (const b of BLOCKS) {
    if (b.ci !== -1) continue;
    const z0 = b.z0 + 3, z1 = b.z1 - 3;
    if (z1 - z0 < 8) continue;
    B.grass.color(COL.grass);
    flat(B.grass, b.x0 + 13, z0, b.x1 - 12, z1, CURB_H + 0.02);
    for (let z = z0 + 3; z < z1 - 2; z += rng.range(10.5, 13)) {
      trees.push({ x: b.x0 + 10.5, z, s: rng.range(0.85, 1.05) });
      trees.push({ x: b.x1 - 2.2, z: z + 5, s: rng.range(0.8, 1.0) });
    }
    const area = (b.x1 - b.x0 - 25) * (z1 - z0);
    for (let i = 0; i < area / 150; i++) trees.push({ x: rng.range(b.x0 + 15, b.x1 - 14), z: rng.range(z0 + 2, z1 - 2), s: rng.range(0.9, 1.4), park: true });
    // seawall railing
    B.steel.color(rgb(0x2f3a36));
    const zc = (b.z0 + b.z1) / 2, len = b.z1 - b.z0;
    box(B.steel, RIVER_X + 0.75, CURB_H + 1.0, zc, 0.09, 0.09, len, 0);
    box(B.steel, RIVER_X + 0.75, CURB_H + 0.5, zc, 0.06, 0.06, len, 0);
    for (let z = b.z0 + 0.3; z < b.z1; z += 2.6) box(B.steel, RIVER_X + 0.75, CURB_H, z, 0.09, 1.0, 0.09, 0);
    // promenade lamps
    for (let z = b.z0 + 8; z < b.z1 - 4; z += 22) {
      B.steel.color(rgb(0x2f3336));
      cyl(B.steel, b.x0 + 4.5, CURB_H, z, 0.1, 0.07, 4.4, 6, { top: false });
      B.plain.color(rgb(0xf2ecd8));
      cyl(B.plain, b.x0 + 4.5, CURB_H + 4.4, z, 0.3, 0.22, 0.45, 8);
      lamps.push({ x: b.x0 + 4.5, y: CURB_H + 4.7, z, c: WARM, size: 1.7 });
      pools.push({ x: b.x0 + 4.5, y: CURB_H + 0.06, z, r: 7 });
    }
  }
  // ---- median trees
  for (const md of MEDIANS) {
    if (!md.planted) continue;
    for (let t = md.a + 5; t < md.b - 4; t += 9.5) {
      const [x, z] = world(md.S, 0, t);
      if (x < RIVER_X) continue;
      trees.push({ x, z, s: 0.72 });
    }
  }

  // ---- street lights (instanced)
  {
    const g = new Geo();
    g.color(rgb(0x6c7074));
    cyl(g, 0, 0, 0, 0.15, 0.09, 9.1, 8, { top: false });
    beam(g, [0, 8.9, 0], [2.7, 9.55, 0], 0.13);
    g.color(rgb(0x4a4d51));
    box(g, 3.0, 9.42, 0, 1.0, 0.2, 0.42, 0, { bottom: true });
    const geo = g.build();
    const list = [];
    for (const S of STREETS) {
      if (S.id === 'VIA' || S.id === 'E') continue;
      for (const seg of segmentsOf(S)) {
        for (const side of [-1, 1]) {
          for (let t = seg.a + 10 + (side > 0 ? 0 : 15); t < seg.b - 8; t += 30) {
            const [x, z] = world(S, side * (S.halfCurb + 0.9), t);
            if (x < -HALF + 2 || x > HALF - 2 || z < -HALF + 2 || z > HALF - 2) continue;
            const dx = S.ns ? -side : 0, dz = S.ns ? 0 : -side;
            list.push({ x, z, dx, dz, bridge: x < RIVER_X });
          }
        }
      }
    }
    const mesh = new THREE.InstancedMesh(geo, M.steel, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((L, i) => {
      p.set(L.x, CURB_H, L.z);
      q.setFromAxisAngle(up, Math.atan2(-L.dz, L.dx));
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      lamps.push({ x: L.x + L.dx * 3.0, y: CURB_H + 9.35, z: L.z + L.dz * 3.0, c: WARM, size: 2.3 });
      pools.push({ x: L.x + L.dx * 3.6, y: 0.07, z: L.z + L.dz * 3.6, r: 12 });
    });
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
  }

  // ---- traffic signals
  const lampInfo = []; // per head: {node, group}
  const lampM = [];
  {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const n of NODES) {
      for (const S of [n.ns, n.ew]) {
        const cross = S === n.ns ? n.ew : n.ns;
        for (const d of S.dirs) {
          const k = S.id + (d.sign > 0 ? '+' : '-');
          if (!n.in || !n.in[k]) continue;
          const dv = dirVec(S, d.sign), rx = -dv.z, rz = dv.x;
          const far = cross.halfCurb + 1.6;
          const bx = n.x + dv.x * far, bz = n.z + dv.z * far;
          const poleOff = S.halfCurb + 1.0;
          const px = bx + rx * poleOff, pz = bz + rz * poleOff;
          B.steel.color(rgb(0x55585c));
          cyl(B.steel, px, CURB_H, pz, 0.19, 0.14, 7.2, 8, { top: false });
          const minOff = Math.min(...d.offs);
          beam(B.steel, [px, CURB_H + 6.9, pz], [bx + rx * (minOff - 0.9), CURB_H + 6.9, bz + rz * (minOff - 0.9)], 0.17);
          for (const off of d.offs) {
            const hx = bx + rx * off, hz = bz + rz * off, hy = CURB_H + 6.1;
            const rot = Math.atan2(rz, rx);
            B.plain.color(rgb(0x1d1e20));
            box(B.plain, hx + dv.x * 0.1, hy - 0.72, hz + dv.z * 0.1, 0.62, 1.44, 0.06, rot, { bottom: true });
            B.plain.color(rgb(0xd7a31a));
            box(B.plain, hx, hy - 0.6, hz, 0.42, 1.2, 0.3, rot, { bottom: true });
            // three lamps facing oncoming traffic (-dv)
            for (let j = 0; j < 3; j++) {
              p.set(hx - dv.x * 0.165, hy + 0.36 - j * 0.36, hz - dv.z * 0.165);
              q.setFromAxisAngle(up, Math.atan2(-dv.x, -dv.z));
              m.compose(p, q, s);
              lampM.push(m.clone());
            }
            lampInfo.push({ node: n, group: S.ns ? 0 : 1 });
          }
        }
      }
    }
  }
  const sigMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.125, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }), lampM.length);
  lampM.forEach((mm, i) => sigMesh.setMatrixAt(i, mm));
  sigMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(lampM.length * 3), 3);
  sigMesh.frustumCulled = false;
  sigMesh.matrixAutoUpdate = false;
  sigMesh.userData.noAO = true;
  scene.add(sigMesh);
  const SIG_ON = [[3.0, 0.12, 0.08], [2.8, 1.7, 0.1], [0.12, 2.6, 1.0]];
  const SIG_OFF = [[0.1, 0.012, 0.01], [0.1, 0.07, 0.008], [0.012, 0.09, 0.04]];
  const sigState = new Int8Array(lampInfo.length).fill(-1);
  function updateSignals() {
    const arr = sigMesh.instanceColor.array;
    let dirty = false;
    for (let i = 0; i < lampInfo.length; i++) {
      const st = lampInfo[i].node.sig[lampInfo[i].group]; // 0 G, 1 Y, 2 R
      if (st === sigState[i]) continue;
      sigState[i] = st;
      dirty = true;
      const on = st === 2 ? 0 : st === 1 ? 1 : 2; // lamp index: 0 red (top), 1 yellow, 2 green
      for (let j = 0; j < 3; j++) {
        const c = j === on ? SIG_ON[j] : SIG_OFF[j];
        const o3 = (i * 3 + j) * 3;
        arr[o3] = c[0];
        arr[o3 + 1] = c[1];
        arr[o3 + 2] = c[2];
      }
    }
    if (dirty) sigMesh.instanceColor.needsUpdate = true;
  }

  // ---- bus shelters
  for (const st of stops) {
    const rx = -st.dz, rz = st.dx;
    const x = st.x + rx * (st.off + 2.1), z = st.z + rz * (st.off + 2.1);
    if (x < RIVER_X + 2 || Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
    const rot = Math.atan2(st.dz, st.dx);
    B.plain.color(rgb(0x2b2f33));
    box(B.plain, x, CURB_H + 2.55, z, 4.4, 0.14, 1.8, rot, { bottom: true });
    for (const e of [-1, 1]) box(B.plain, x + st.dx * 2.05 * e + rx * 0.75, CURB_H, z + st.dz * 2.05 * e + rz * 0.75, 0.1, 2.55, 0.1, rot);
    B.glass.color([1, 1, 1]);
    box(B.glass, x + rx * 0.78, CURB_H + 0.3, z + rz * 0.78, 4.1, 2.1, 0.05, rot, { bottom: true });
    B.plain.color(rgb(0x6f5a44));
    box(B.plain, x + rx * 0.4, CURB_H + 0.42, z + rz * 0.4, 2.6, 0.1, 0.45, rot, { bottom: true });
    // stop flag
    const fx = x + st.dx * 3.2 - rx * 0.9, fz = z + st.dz * 3.2 - rz * 0.9;
    B.steel.color(rgb(0x6c7074));
    cyl(B.steel, fx, CURB_H, fz, 0.05, 0.05, 3.0, 6, { top: false });
    B.plain.color(rgb(0x1756b8));
    box(B.plain, fx, CURB_H + 2.4, fz, 0.6, 0.6, 0.05, rot + Math.PI / 2, { bottom: true });
    lamps.push({ x, y: CURB_H + 2.4, z, c: COOL, size: 1.0 });
  }

  // ---- kerbside parked cars
  {
    const TYPES = [['sedan', 40], ['suv', 32], ['pickup', 14], ['van', 9], ['taxi', 3]];
    const pick = () => {
      let sum = 0;
      for (const t of TYPES) sum += t[1];
      let r = rng.next() * sum;
      for (const t of TYPES) {
        r -= t[1];
        if (r <= 0) return t[0];
      }
      return 'sedan';
    };
    for (const S of STREETS) {
      if (!S.park) continue;
      for (const seg of segmentsOf(S)) {
        for (const side of [-1, 1]) {
          const sign = S.twoWay ? (S.ns ? -side : side) : S.dirs[0].sign;
          for (let t = seg.a + 9; t < seg.b - 9; t += 6.3) {
            if (!rng.chance(0.58)) continue;
            const [x, z] = world(S, side * (S.halfCurb - S.park / 2 - 0.08), t + rng.range(-0.4, 0.4));
            if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
            if (nearStop(x, z, 15) || nearCol(x, z, 3.4)) continue;
            const dv = dirVec(S, sign);
            const type = pick();
            parked.push({ type, x, y: 0, z, yaw: Math.atan2(-dv.z, dv.x), rgb: type === 'taxi' ? rgb(0xf5c400) : PAINTS[rng.weighted(PAINTS.map((q) => q.w))].rgb });
          }
        }
      }
    }
  }

  // ---- freeway lighting: twin-arm poles on the median barriers
  {
    const twin = (x, z, alongX) => {
      const y0 = FWY_Y + 0.9;
      B.steel.color(rgb(0x7a7e82));
      cyl(B.steel, x, y0, z, 0.16, 0.1, 10.5, 8, { top: false });
      for (const sg of [-1, 1]) {
        const ex = alongX ? x : x + sg * 3.0, ez = alongX ? z + sg * 3.0 : z;
        beam(B.steel, [x, y0 + 10.3, z], [ex, y0 + 10.9, ez], 0.12);
        B.plain.color(rgb(0x4a4d51));
        box(B.plain, alongX ? x : x + sg * 3.3, y0 + 10.8, alongX ? z + sg * 3.3 : z, alongX ? 0.42 : 1.0, 0.2, alongX ? 1.0 : 0.42, 0, { bottom: true });
        lamps.push({ x: alongX ? x : x + sg * 3.3, y: y0 + 10.75, z: alongX ? z + sg * 3.3 : z, c: COOL, size: 2.5 });
        pools.push({ x: alongX ? x : x + sg * 5.2, y: FWY_Y + 0.12, z: alongX ? z + sg * 5.2 : z, r: 12, deck: true });
      }
    };
    for (let x = -340; x <= 340; x += 42.5) {
      if (Math.abs(x - 60) < 14) continue;
      twin(x, 180, true);
    }
    for (let z = -338; z < -36; z += 43) twin(60, z, false);
  }

  // ---- overhead sign gantries
  {
    const gantry = (ax, az, bx, bz, signs, nx, nz) => {
      const y0 = FWY_Y + 0.86, top = y0 + 7.6;
      B.steel.color(rgb(0x8a8e92));
      for (const [x, z] of [[ax, az], [bx, bz]]) box(B.steel, x, y0, z, 0.45, 7.7, 0.45, 0);
      beam(B.steel, [ax, top, az], [bx, top, bz], 0.3);
      beam(B.steel, [ax, top - 1.5, az], [bx, top - 1.5, bz], 0.3);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = [ax + (bx - ax) * t0, i % 2 ? top : top - 1.5, az + (bz - az) * t0];
        const p1 = [ax + (bx - ax) * t1, i % 2 ? top - 1.5 : top, az + (bz - az) * t1];
        beam(B.steel, p0, p1, 0.16);
      }
      for (const sg of signs) {
        signQuad(B.sign, sg.x + nx * 0.32, top - 0.75, sg.z + nz * 0.32, nx, nz, sg.w, sg.w / 2, sg.name);
        B.plain.color(rgb(0x2c2f33));
        const rot = Math.atan2(-nx, nz);
        box(B.plain, sg.x + nx * 0.12, top - 0.75 - sg.w / 4 - 0.1, sg.z + nz * 0.12, sg.w + 0.2, sg.w / 2 + 0.2, 0.18, rot, { bottom: true });
      }
    };
    // eastbound, ahead of the exit to the north leg
    gantry(-150, 180.3, -150, 192.5, [{ x: -150, z: 184.1, w: 5.6, name: 'g84E' }, { x: -150, z: 189.6, w: 5.0, name: 'gExit' }], -1, 0);
    // westbound, ahead of ramp A
    gantry(226, 179.7, 226, 167.5, [{ x: 226, z: 175.9, w: 5.6, name: 'g84W' }, { x: 226, z: 170.4, w: 5.0, name: 'g9N' }], 1, 0);
    // north leg southbound, ahead of the split
    gantry(59.6, -172, 50.6, -172, [{ x: 57.6, z: -172, w: 4.0, name: 'gToE' }, { x: 53.2, z: -172, w: 4.0, name: 'gToW' }], 0, -1);
    // north leg northbound
    gantry(60.4, -246, 69.4, -246, [{ x: 64.4, z: -246, w: 5.6, name: 'gMain' }], 0, 1);
  }

  // ---- flags
  {
    const flag = (x, z, h, w) => {
      B.steel.color(rgb(0xd9d9d6));
      cyl(B.steel, x, CURB_H, z, 0.11, 0.06, h, 6, { top: false });
      const r = ATLAS.r.flag;
      const hh = w * 0.56;
      B.sign.color([1, 1, 1]);
      const y0 = CURB_H + h - hh - 0.3;
      for (const nz of [1, -1]) {
        const u0 = nz > 0 ? r.u0 : r.u1, u1 = nz > 0 ? r.u1 : r.u0;
        B.sign.quadN([x + 0.1, y0, z], [x + 0.1 + w, y0, z], [x + 0.1 + w, y0 + hh, z], [x + 0.1, y0 + hh, z], 0, 0, nz,
          [u0, r.v0], [u1, r.v0], [u1, r.v1], [u0, r.v1]);
      }
    };
    flag(LOOP_X, ST.MAIN.pos, 19, 6);
    if (o.towerPlaza) {
      const L = o.towerPlaza;
      for (let i = 0; i < 3; i++) flag(L.x0 + 10 + i * 6, L.z1 - 9, 12, 3.6);
    }
  }

  return { lamps, pools, updateSignals };
}

// Night lamp sprites: additive points that fade in with uNight.
export function buildLampField(scene, M, lamps) {
  const n = lamps.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  lamps.forEach((l, i) => {
    pos[i * 3] = l.x; pos[i * 3 + 1] = l.y; pos[i * 3 + 2] = l.z;
    col[i * 3] = l.c[0]; col[i * 3 + 1] = l.c[1]; col[i * 3 + 2] = l.c[2];
    size[i] = l.size || 3;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: M.uNight, uTime: M.uTime, uMap: { value: M.glow }, uScale: { value: 600 }, uBlink: { value: 0 } },
    vertexShader: `
      attribute vec3 aCol; attribute float aSize;
      uniform float uScale; uniform float uNight;
      varying vec3 vCol;
      void main() {
        vCol = aCol;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSize * uScale / -mv.z, 1.6, 30.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap; uniform float uNight; uniform float uBlink; uniform float uTime;
      varying vec3 vCol;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).r;
        float k = uNight;
        if (uBlink > 0.5) k = (0.25 + 0.75 * uNight) * (0.35 + 0.65 * step(0.5, fract(uTime * 0.55)));
        gl_FragColor = vec4(vCol * a * k * 1.7, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.userData.noAO = true;
  pts.renderOrder = 5;
  scene.add(pts);
  return pts;
}

// Light pools under street lamps: flat additive discs.
export function buildPools(scene, M, pools) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: M.glow, color: new THREE.Color(1.0, 0.78, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  const mesh = new THREE.InstancedMesh(geo, mat, pools.length);
  const m = new THREE.Matrix4();
  pools.forEach((p, i) => {
    m.makeScale(p.r * 2, 1, p.r * 2);
    m.setPosition(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
  });
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.userData.noAO = true;
  mesh.renderOrder = 3;
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}
