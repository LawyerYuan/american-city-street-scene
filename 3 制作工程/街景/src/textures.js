// All textures are generated procedurally on canvas: no external assets.
import * as THREE from 'three';
import { RNG } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function tex(c, o = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = o.aniso || 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  if (o.repeat) t.repeat.set(o.repeat, o.repeat);
  return t;
}
// draw with wrap-around so the texture tiles
function wrapDraw(size, x, y, r, fn) {
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      if (x + ox + r < 0 || x + ox - r > size || y + oy + r < 0 || y + oy - r > size) continue;
      fn(x + ox, y + oy);
    }
  }
}
function speckle(ctx, size, rng, count, rmin, rmax, colorFn) {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(rmin, rmax);
    ctx.fillStyle = colorFn(rng);
    wrapDraw(size, x, y, r, (px, py) => {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
function blotch(ctx, size, rng, count, rmin, rmax, rgb, alpha) {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(rmin, rmax);
    wrapDraw(size, x, y, r, (px, py) => {
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(${rgb},${alpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
}
const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;

export function asphaltTex() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), r = new RNG(11);
  x.fillStyle = '#8e8e8e';
  x.fillRect(0, 0, S, S);
  blotch(x, S, r, 26, 40, 150, '60,60,60', 0.1);
  blotch(x, S, r, 18, 30, 110, '190,190,190', 0.07);
  speckle(x, S, r, 16000, 0.4, 1.3, (q) => gray(142 + q.range(-46, 40), 0.5));
  speckle(x, S, r, 2500, 0.5, 1.1, () => gray(205, 0.35));
  return tex(c, { repeat: 1 / 9 });
}

export function concreteTex() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), r = new RNG(12);
  x.fillStyle = '#d4d2cc';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      x.fillStyle = gray(210 + r.range(-9, 9), 0.5);
      x.fillRect(i * 256, j * 256, 256, 256);
    }
  }
  blotch(x, S, r, 20, 30, 120, '120,115,105', 0.07);
  speckle(x, S, r, 9000, 0.4, 1.2, (q) => gray(208 + q.range(-30, 26), 0.4));
  x.strokeStyle = 'rgba(70,68,64,0.55)';
  x.lineWidth = 2.2;
  for (const p of [0, 256]) {
    x.beginPath();
    x.moveTo(p + 1, 0);
    x.lineTo(p + 1, S);
    x.moveTo(0, p + 1);
    x.lineTo(S, p + 1);
    x.stroke();
  }
  return tex(c, { repeat: 1 / 3.2 });
}

export function paverTex() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), r = new RNG(13);
  x.fillStyle = '#b9ada0';
  x.fillRect(0, 0, S, S);
  const bw = 64, bh = 32;
  for (let j = 0; j < S / bh; j++) {
    for (let i = -1; i < S / bw + 1; i++) {
      const ox = (j % 2) * (bw / 2);
      const v = r.range(-16, 16);
      x.fillStyle = `rgb(${198 + v},${188 + v * 0.9},${176 + v * 0.8})`;
      x.fillRect(i * bw + ox + 1.5, j * bh + 1.5, bw - 3, bh - 3);
    }
  }
  speckle(x, S, r, 5000, 0.4, 1.1, (q) => gray(180 + q.range(-30, 30), 0.25));
  return tex(c, { repeat: 1 / 2.4 });
}

export function grassTex() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), r = new RNG(14);
  x.fillStyle = '#7fa650';
  x.fillRect(0, 0, S, S);
  blotch(x, S, r, 60, 30, 120, '70,120,50', 0.22);
  blotch(x, S, r, 40, 20, 90, '160,185,95', 0.18);
  speckle(x, S, r, 14000, 0.5, 1.6, (q) => `rgba(${90 + q.range(-30, 50)},${150 + q.range(-40, 40)},${60 + q.range(-20, 30)},0.35)`);
  return tex(c, { repeat: 1 / 11 });
}

export function plankTex() {
  const S = 512, c = canvas(S, S), x = c.getContext('2d'), r = new RNG(15);
  x.fillStyle = '#8a6f52';
  x.fillRect(0, 0, S, S);
  const n = 16, h = S / n;
  for (let j = 0; j < n; j++) {
    const v = r.range(-18, 18);
    x.fillStyle = `rgb(${150 + v},${122 + v * 0.9},${92 + v * 0.8})`;
    x.fillRect(0, j * h + 1, S, h - 2);
    const off = r.range(0, S);
    x.fillStyle = 'rgba(40,28,18,0.55)';
    for (let k = 0; k < 3; k++) x.fillRect((off + k * 190) % S, j * h, 2, h);
  }
  speckle(x, S, r, 3000, 0.4, 1.0, (q) => `rgba(60,44,30,${q.range(0.08, 0.25)})`);
  return tex(c, { repeat: 1 / 4 });
}

export function waterNormalTex() {
  const S = 256, c = canvas(S, S), x = c.getContext('2d'), r = new RNG(16);
  const waves = [];
  for (let i = 0; i < 26; i++) {
    const k = Math.round(r.range(-24, 24));
    const l = Math.round(r.range(-24, 24));
    if (Math.abs(k) + Math.abs(l) < 7) continue;
    waves.push({ kx: k, ky: l, ph: r.range(0, 6.28), a: r.range(0.4, 1) / Math.pow(Math.hypot(k, l), 0.8) });
  }
  const H = new Float32Array(S * S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      let h = 0;
      for (const w of waves) h += w.a * Math.sin(((i * w.kx + j * w.ky) / S) * Math.PI * 2 + w.ph);
      H[j * S + i] = h;
    }
  }
  const img = x.createImageData(S, S);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const hx = H[j * S + ((i + 1) % S)] - H[j * S + ((i + S - 1) % S)];
      const hy = H[((j + 1) % S) * S + i] - H[((j + S - 1) % S) * S + i];
      let nx = -hx * 1.6, ny = -hy * 1.6, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      const o = (j * S + i) * 4;
      img.data[o] = (nx * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[o + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return tex(c, { srgb: false, repeat: 1 / 36 });
}

// ---- Atlas: road decals, freeway signs, billboards, building signs -----------------
export const ATLAS = { size: 2048, r: {} };
function reg(name, x, y, w, h) {
  const S = ATLAS.size;
  ATLAS.r[name] = { u0: x / S, v0: 1 - (y + h) / S, u1: (x + w) / S, v1: 1 - y / S, w, h };
}

function arrow(x, cx, top, kind) {
  x.save();
  x.translate(cx, top);
  x.fillStyle = '#fff';
  const stem = (x0) => x.fillRect(x0 - 11, 150, 22, 330);
  const head = (px, py, ang) => {
    x.save();
    x.translate(px, py);
    x.rotate(ang);
    x.beginPath();
    x.moveTo(0, -62);
    x.lineTo(44, 40);
    x.lineTo(-44, 40);
    x.closePath();
    x.fill();
    x.restore();
  };
  const bend = (dirn) => {
    x.beginPath();
    x.lineWidth = 22;
    x.strokeStyle = '#fff';
    x.moveTo(0, 480);
    x.lineTo(0, 300);
    x.quadraticCurveTo(0, 215, dirn * 40, 200);
    x.stroke();
    head(dirn * 52, 196, (dirn * Math.PI) / 2);
  };
  if (kind === 'S') {
    stem(0);
    head(0, 110, 0);
  } else if (kind === 'L') bend(-1);
  else if (kind === 'R') bend(1);
  else if (kind === 'SL') {
    x.translate(14, 0);
    stem(0);
    head(0, 110, 0);
    bend(-1);
  } else if (kind === 'SR') {
    x.translate(-14, 0);
    stem(0);
    head(0, 110, 0);
    bend(1);
  }
  x.restore();
}

function guideSign(x, X, Y, W, H, lines, o = {}) {
  x.save();
  x.translate(X, Y);
  x.fillStyle = o.bg || '#0b6b3a';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = '#fff';
  x.lineWidth = 7;
  const rr = 18;
  x.beginPath();
  x.moveTo(10 + rr, 10);
  x.arcTo(W - 10, 10, W - 10, H - 10, rr);
  x.arcTo(W - 10, H - 10, 10, H - 10, rr);
  x.arcTo(10, H - 10, 10, 10, rr);
  x.arcTo(10, 10, W - 10, 10, rr);
  x.stroke();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  let yy = o.exitOnly ? 52 : 62;
  for (const ln of lines) {
    x.font = `bold ${ln.size || 54}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    if (ln.shield) {
      // interstate-like shield (generic)
      const sx = W / 2 - 150, sy = yy - 34;
      x.fillStyle = '#1d3e8f';
      x.beginPath();
      x.moveTo(sx, sy + 6);
      x.quadraticCurveTo(sx + 34, sy - 6, sx + 68, sy + 6);
      x.lineTo(sx + 68, sy + 40);
      x.quadraticCurveTo(sx + 34, sy + 84, sx, sy + 40);
      x.closePath();
      x.fill();
      x.fillStyle = '#c62828';
      x.fillRect(sx + 2, sy + 4, 64, 15);
      x.fillStyle = '#fff';
      x.font = 'bold 36px Helvetica, Arial, sans-serif';
      x.fillText(ln.shield, sx + 34, sy + 44);
      x.font = `bold ${ln.size || 54}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      x.fillText(ln.t, W / 2 + 40, yy);
    } else x.fillText(ln.t, W / 2, yy);
    yy += (ln.size || 54) + 14;
  }
  if (o.exitOnly) {
    x.fillStyle = '#f5c518';
    x.fillRect(18, H - 66, W - 36, 48);
    x.fillStyle = '#111';
    x.font = 'bold 36px Helvetica, Arial, sans-serif';
    x.fillText('EXIT  ▼  ONLY', W / 2, H - 41);
  }
  x.restore();
}

function billboard(x, X, Y, W, H, bg, fg, l1, l2, o = {}) {
  x.save();
  x.translate(X, Y);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, bg[0]);
  g.addColorStop(1, bg[1]);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  if (o.band) {
    x.fillStyle = o.band;
    x.fillRect(0, H * 0.68, W, H * 0.32);
  }
  if (o.circle) {
    x.fillStyle = o.circle;
    x.beginPath();
    x.arc(W * 0.16, H * 0.42, H * 0.3, 0, 7);
    x.fill();
  }
  x.fillStyle = fg;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `900 ${o.s1 || 78}px Impact, "Arial Black", Helvetica, sans-serif`;
  x.fillText(l1, W * (o.circle ? 0.6 : 0.5), H * 0.38);
  x.font = `bold ${o.s2 || 34}px Helvetica, Arial, sans-serif`;
  x.fillStyle = o.fg2 || fg;
  x.fillText(l2, W * 0.5, H * 0.82);
  x.restore();
}

export function atlasTex() {
  const S = ATLAS.size, c = canvas(S, S), x = c.getContext('2d');
  x.clearRect(0, 0, S, S);
  // Row 0: road decals (white on transparent), 160 x 512 each
  ['S', 'L', 'R', 'SL', 'SR'].forEach((k, i) => {
    arrow(x, i * 160 + 80, 0, k);
    reg('arrow' + k, i * 160, 0, 160, 512);
  });
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.save();
  x.translate(800 + 128, 256);
  x.font = 'bold 150px "Helvetica Neue", Helvetica, Arial, sans-serif';
  x.scale(0.62, 1.55);
  x.fillText('BUS', 0, -82);
  x.fillText('ONLY', 0, 82);
  x.restore();
  reg('busOnly', 800, 0, 256, 512);
  // helipad
  x.save();
  x.translate(1312, 0);
  x.strokeStyle = '#f2f2f2';
  x.lineWidth = 26;
  x.beginPath();
  x.arc(256, 256, 220, 0, 7);
  x.stroke();
  x.font = 'bold 300px Helvetica, Arial, sans-serif';
  x.fillStyle = '#f2f2f2';
  x.fillText('H', 256, 268);
  x.restore();
  reg('helipad', 1312, 0, 512, 512);

  // Row 1: freeway guide signs 512 x 256
  const G = [
    ['g84E', [{ t: 'EAST', shield: '84', size: 50 }, { t: 'Harbor City', size: 58 }], {}],
    ['gExit', [{ t: 'NORTH', shield: '9', size: 46 }, { t: 'Downtown', size: 50 }], { exitOnly: true }],
    ['g84W', [{ t: 'WEST', shield: '84', size: 50 }, { t: 'Lakeview · Airport', size: 50 }], {}],
    ['g9N', [{ t: 'NORTH', shield: '9', size: 50 }, { t: 'Midtown · Stadium', size: 48 }], {}],
    ['gToW', [{ t: 'WEST', shield: '84', size: 50 }, { t: 'Lakeview  ↙', size: 54 }], {}],
    ['gToE', [{ t: 'EAST', shield: '84', size: 50 }, { t: 'Harbor City  ↘', size: 52 }], {}],
    ['gMain', [{ t: 'Main St', size: 60 }, { t: 'Pier Park  ½ MILE', size: 44 }], {}],
    ['gRiver', [{ t: 'Riverside Dr', size: 56 }, { t: 'NEXT RIGHT', size: 44 }], {}],
  ];
  G.forEach(([name, lines, o], i) => {
    const X = (i % 4) * 512, Y = 512 + Math.floor(i / 4) * 256;
    guideSign(x, X, Y, 512, 256, lines, o);
    reg(name, X, Y, 512, 256);
  });

  // Row 2: billboards 512 x 256
  const B = [
    ['bb0', ['#a51616', '#d83a2a'], '#fff', "JOE'S DINER", 'OPEN 24 HRS · EXIT 12', { band: '#f7e9c8', fg2: '#7a1010' }],
    ['bb1', ['#2a211b', '#4a382c'], '#f3e6cf', 'COLD BREW', 'Riverside Roasters · Since 1987', { circle: '#c98b4a' }],
    ['bb2', ['#111c3a', '#2b4aa0'], '#ffd94a', 'WQRX 98.7', 'CLASSIC ROCK · ALL DAY', { s1: 92 }],
    ['bb3', ['#f2f2f2', '#d8dde3'], '#c2182b', 'AUTO MALL', 'Harbor City · 400 cars in stock', { fg2: '#222' }],
    ['bb4', ['#f6c315', '#f09a0c'], '#111', 'INJURED?', 'Call 555-0199 · Baxter Law', { s1: 96 }],
    ['bb5', ['#0d6e8a', '#2bb3c0'], '#fff', 'PIER PARK', 'GIANT WHEEL · OPEN DAILY', { circle: '#ffd94a' }],
    ['bb6', ['#0f3b2a', '#1c6a49'], '#e9f5d0', 'FIRST LAKES', 'BANK · Member FDIC', {}],
    ['bb7', ['#18233f', '#3a2a6a'], '#ff8a3c', 'GO COMETS!', 'Home opener Friday 7:05', { s1: 90 }],
  ];
  B.forEach(([name, bg, fg, l1, l2, o], i) => {
    const X = (i % 4) * 512, Y = 1024 + Math.floor(i / 4) * 256;
    billboard(x, X, Y, 512, 256, bg, fg, l1, l2, o);
    reg(name, X, Y, 512, 256);
  });

  // Row 3: misc signs
  const sign = (name, X, Y, W, H, bg, fg, text, font, o = {}) => {
    x.save();
    x.translate(X, Y);
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
    if (o.border) {
      x.strokeStyle = o.border;
      x.lineWidth = 8;
      x.strokeRect(8, 8, W - 16, H - 16);
    }
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = font;
    x.fillText(text, W / 2, H / 2 + (o.dy || 4));
    x.restore();
    reg(name, X, Y, W, H);
  };
  const Y3 = 1536;
  sign('hotel', 0, Y3, 384, 128, '#17120f', '#ff4a3a', 'HOTEL', '900 104px "Arial Black", Impact, sans-serif');
  sign('park', 384, Y3, 128, 128, '#1756b8', '#fff', 'P', 'bold 108px Helvetica, Arial, sans-serif');
  sign('diner', 512, Y3, 384, 128, '#c8102e', '#fff', 'DINER', '900 100px "Arial Black", Impact, sans-serif', { border: '#fff' });
  sign('gas', 896, Y3, 256, 128, '#f5f5f5', '#c8102e', 'GAS 3.19', 'bold 56px Helvetica, Arial, sans-serif', { border: '#c8102e' });
  sign('pier', 1152, Y3, 512, 128, '#123a5a', '#ffd94a', 'PIER PARK', '900 88px "Arial Black", Impact, sans-serif', { border: '#ffd94a' });
  sign('mart', 1664, Y3, 384, 128, '#f2f2f2', '#0a53a8', 'SUPERMART', '900 50px "Arial Black", Impact, sans-serif');
  const led = (name, X, Y, text) => sign(name, X, Y, 384, 64, '#0b0b0b', '#ffb21a', text, 'bold 44px "Courier New", monospace', { dy: 3 });
  led('dest14', 0, Y3 + 128, '14 PIER PARK');
  led('dest22', 384, Y3 + 128, '22 DOWNTOWN');
  led('dest9', 768, Y3 + 128, '9 VIADUCT');
  led('destL', 1152, Y3 + 128, 'LOOP · RIVER');
  sign('bank', 1536, Y3 + 128, 384, 64, '#10301f', '#e9f5d0', 'FIRST LAKES', 'bold 46px Helvetica, Arial, sans-serif');
  // US flag 384 x 216
  {
    const X = 0, Y = Y3 + 192, W = 384, H = 216;
    for (let i = 0; i < 13; i++) {
      x.fillStyle = i % 2 ? '#fff' : '#b22234';
      x.fillRect(X, Y + (i * H) / 13, W, H / 13 + 0.5);
    }
    x.fillStyle = '#3c3b6e';
    x.fillRect(X, Y, W * 0.4, (H * 7) / 13);
    x.fillStyle = '#fff';
    for (let r = 0; r < 9; r++) {
      const n = r % 2 ? 5 : 6;
      for (let k = 0; k < n; k++) {
        x.beginPath();
        x.arc(X + 14 + k * 25 + (r % 2 ? 12.5 : 0), Y + 10 + r * 12.3, 3.4, 0, 7);
        x.fill();
      }
    }
    reg('flag', X, Y, W, H);
  }
  sign('station', 384, Y3 + 192, 512, 96, '#1b3f7a', '#fff', 'MAIN ST STATION', 'bold 54px Helvetica, Arial, sans-serif', { border: '#fff' });
  sign('schoolbus', 896, Y3 + 192, 384, 64, '#f2b90f', '#111', 'SCHOOL BUS', 'bold 46px Helvetica, Arial, sans-serif');
  sign('motel', 1280, Y3 + 192, 384, 128, '#0e2a4a', '#6fe0ff', 'MOTEL', '900 100px "Arial Black", Impact, sans-serif');
  sign('cinema', 1664, Y3 + 192, 384, 128, '#2a0f2f', '#ffd94a', 'RIALTO', '900 92px "Arial Black", Impact, sans-serif', { border: '#ff5fa0' });

  const t = tex(c, { clamp: true, aniso: 8 });
  return t;
}

// Soft radial glow (for lamps and light pools)
export function glowTex() {
  const S = 128, c = canvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return tex(c, { clamp: true });
}
