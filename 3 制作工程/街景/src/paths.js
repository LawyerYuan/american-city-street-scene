import { clamp, sstep5, DEG } from './util.js';

// ---- 2D polyline pieces ([x,z] lists) ------------------------------------
export function line(x0, z0, x1, z1, step = 2) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.ceil(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
  }
  return out;
}

// Arc around (cx,cz): point = (cx + r cos a, cz + r sin a); angles in degrees.
export function arc(cx, cz, r, a0, a1, step = 1.2) {
  const len = Math.abs(a1 - a0) * DEG * r;
  const n = Math.max(2, Math.ceil(len / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * DEG;
    out.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return out;
}

// Lateral shift: travels along the dominant axis, the other coordinate eases smoothly.
export function blend(x0, z0, x1, z1, step = 1.5) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const n = Math.max(2, Math.ceil(len / step));
  const out = [];
  const major = Math.abs(dx) >= Math.abs(dz);
  for (let i = 0; i <= n; i++) {
    const t = i / n, e = sstep5(t);
    if (major) out.push([x0 + dx * t, z0 + dz * e]);
    else out.push([x0 + dx * e, z0 + dz * t]);
  }
  return out;
}

export function cubic(p0, c0, c1, p1, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0], a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1]]);
  }
  return out;
}

export function join(...segs) {
  const out = [];
  for (const s of segs) {
    for (const p of s) {
      const q = out[out.length - 1];
      if (q && Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-4) continue;
      out.push(p);
    }
  }
  return out;
}

// ---- 3D path with uniform arc-length sampling ------------------------------
export class Path {
  // xz: [[x,z],...]; yFn(x, z, s2d) -> elevation (or number)
  constructor(xz, yFn = 0, ds = 1.0) {
    const n = xz.length;
    const cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(xz[i][0] - xz[i - 1][0], xz[i][1] - xz[i - 1][1]);
    this.len2d = cum[n - 1];
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) ys[i] = typeof yFn === 'function' ? yFn(xz[i][0], xz[i][1], cum[i]) : yFn;
    // 3D cumulative
    const c3 = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      c3[i] = c3[i - 1] + Math.hypot(xz[i][0] - xz[i - 1][0], ys[i] - ys[i - 1], xz[i][1] - xz[i - 1][1]);
    }
    this.len = c3[n - 1];
    const N = Math.max(2, Math.ceil(this.len / ds) + 1);
    this.N = N;
    this.step = this.len / (N - 1);
    this.X = new Float32Array(N);
    this.Y = new Float32Array(N);
    this.Z = new Float32Array(N);
    let j = 0;
    for (let k = 0; k < N; k++) {
      const s = k * this.step;
      while (j < n - 2 && c3[j + 1] < s) j++;
      const seg = c3[j + 1] - c3[j];
      const t = seg > 1e-9 ? clamp((s - c3[j]) / seg, 0, 1) : 0;
      this.X[k] = xz[j][0] + (xz[j + 1][0] - xz[j][0]) * t;
      this.Y[k] = ys[j] + (ys[j + 1] - ys[j]) * t;
      this.Z[k] = xz[j][1] + (xz[j + 1][1] - xz[j][1]) * t;
    }
  }
  at(s, o) {
    let t = s / this.step;
    if (t <= 0) {
      // extrapolate backwards along the first segment
      const dx = this.X[1] - this.X[0], dy = this.Y[1] - this.Y[0], dz = this.Z[1] - this.Z[0];
      o.x = this.X[0] + dx * t;
      o.y = this.Y[0] + dy * t;
      o.z = this.Z[0] + dz * t;
      return o;
    }
    const N = this.N;
    if (t >= N - 1) {
      const e = t - (N - 1);
      const dx = this.X[N - 1] - this.X[N - 2], dy = this.Y[N - 1] - this.Y[N - 2], dz = this.Z[N - 1] - this.Z[N - 2];
      o.x = this.X[N - 1] + dx * e;
      o.y = this.Y[N - 1] + dy * e;
      o.z = this.Z[N - 1] + dz * e;
      return o;
    }
    const i = t | 0, f = t - i;
    o.x = this.X[i] + (this.X[i + 1] - this.X[i]) * f;
    o.y = this.Y[i] + (this.Y[i + 1] - this.Y[i]) * f;
    o.z = this.Z[i] + (this.Z[i + 1] - this.Z[i]) * f;
    return o;
  }
  // Unit direction in the ground plane at s.
  dir(s, o) {
    const i = clamp(Math.floor(s / this.step), 0, this.N - 2);
    let dx = this.X[i + 1] - this.X[i], dz = this.Z[i + 1] - this.Z[i];
    const l = Math.hypot(dx, dz) || 1;
    o.x = dx / l;
    o.z = dz / l;
    return o;
  }
  // Arc length of the sample closest to (x,z).
  sNear(x, z) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const d = (this.X[i] - x) * (this.X[i] - x) + (this.Z[i] - z) * (this.Z[i] - z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best * this.step;
  }
  // Frames for sweeping: every `step` metres between s0 and s1.
  frames(s0 = 0, s1 = this.len, step = 3) {
    const out = [];
    const n = Math.max(1, Math.ceil((s1 - s0) / step));
    const p = { x: 0, y: 0, z: 0 }, a = { x: 0, y: 0, z: 0 }, b = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n;
      this.at(s, p);
      this.at(s - 0.6, a);
      this.at(s + 0.6, b);
      let dx = b.x - a.x, dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      out.push({ x: p.x, y: p.y, z: p.z, nx: -dz, nz: dx, dx, dz, s });
    }
    return out;
  }
  // Speed envelope: per-sample max speed allowing comfortable braking for curves ahead.
  buildSpeed(vmax, aLat = 2.0, brake = 1.6) {
    const N = this.N, st = this.step;
    const lim = new Float32Array(N);
    const w = Math.max(1, Math.round(3 / st));
    for (let i = 0; i < N; i++) {
      const i0 = Math.max(0, i - w), i1 = Math.min(N - 1, i + w);
      const im = Math.max(0, Math.min(N - 1, i));
      const ax = this.X[im] - this.X[i0], az = this.Z[im] - this.Z[i0];
      const bx = this.X[i1] - this.X[im], bz = this.Z[i1] - this.Z[im];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      let v = vmax;
      if (la > 1e-6 && lb > 1e-6) {
        const cr = (ax * bz - az * bx) / (la * lb);
        const dot = (ax * bx + az * bz) / (la * lb);
        const ang = Math.atan2(Math.abs(cr), dot);
        const k = ang / ((la + lb) / 2);
        if (k > 1e-5) v = Math.min(vmax, Math.sqrt(aLat / k));
      }
      lim[i] = v;
    }
    for (let i = N - 2; i >= 0; i--) {
      const allowed = Math.sqrt(lim[i + 1] * lim[i + 1] + 2 * brake * st);
      if (lim[i] > allowed) lim[i] = allowed;
    }
    this.vlim = lim;
    return this;
  }
  speedAt(s) {
    const i = clamp(Math.round(s / this.step), 0, this.N - 1);
    return this.vlim[i];
  }
}
