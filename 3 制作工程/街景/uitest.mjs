// Interaction check in headless Chrome: UI buttons, wheel zoom, drag rotate, click-to-follow.
//   node uitest.mjs            (writes screenshots to build/ui/)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const htmlPath = path.resolve(root, '../../4 输出成品/HTML/美式城市街景.html');
const outDir = path.join(root, 'build', 'ui');
const W = 1440, H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = path.join(root, 'build', 'chrome-profile-ui-' + process.pid);
fs.mkdirSync(profile, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const port = 9800 + (process.pid % 150);
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--use-angle=metal', `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  'file://' + encodeURI(htmlPath),
], { stdio: ['ignore', 'ignore', 'ignore'] });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : ''));
};

try {
  let wsUrl = null;
  for (let i = 0; i < 150 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) { /* not yet */ }
    if (!wsUrl) await sleep(200);
  }
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        if (m.error) p.reject(new Error(JSON.stringify(m.error)));
        else p.resolve(m.result);
      }
    } else if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails?.exception?.description || '').slice(0, 500));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evl = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 900));
    return r.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 200; i++) {
    if (await evl('window.__ready === true')) break;
    await sleep(200);
  }
  check('page ready', await evl('window.__ready === true'));
  await sleep(1500);
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(outDir, name + '.png'), Buffer.from(s.data, 'base64'));
  };
  const view = () => evl(`(() => { const c = __api.camera.position, t = __api.controls.target; const d = c.clone().sub(t); return { dist: d.length(), az: Math.atan2(d.x, d.z) * 57.2958, el: Math.asin(d.y / d.length()) * 57.2958, tx: t.x, ty: t.y, tz: t.z }; })()`);
  await shot('01-initial');

  // UI present
  check('UI controls exist', await evl(`['#tod button', '#views button', '#btnBus', '#btnRotate', '#btnFull'].every((s) => document.querySelector(s))`));
  check('loading overlay hidden', await evl(`document.getElementById('loading').classList.contains('done')`));

  // wheel zoom
  const v0 = await view();
  for (let i = 0; i < 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W / 2, y: H / 2, deltaX: 0, deltaY: -240 });
    await sleep(60);
  }
  await sleep(900);
  const v1 = await view();
  check('wheel zooms in', v1.dist < v0.dist * 0.8, `${v0.dist.toFixed(0)} -> ${v1.dist.toFixed(0)}`);

  // drag rotates
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 450, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700 + i * 22, y: 450 + i * 4, button: 'left', buttons: 1 });
    await sleep(20);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 920, y: 490, button: 'left', clickCount: 1 });
  await sleep(700);
  const v2 = await view();
  check('drag rotates', Math.abs(v2.az - v1.az) > 5, `az ${v1.az.toFixed(1)} -> ${v2.az.toFixed(1)}`);

  // right-drag pans
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 450, button: 'right', clickCount: 1 });
  for (let i = 1; i <= 8; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700 - i * 15, y: 450, button: 'right', buttons: 2 });
    await sleep(20);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 580, y: 450, button: 'right', clickCount: 1 });
  await sleep(600);
  const v3 = await view();
  check('right-drag pans', Math.hypot(v3.tx - v2.tx, v3.tz - v2.tz) > 5, `target moved ${Math.hypot(v3.tx - v2.tx, v3.tz - v2.tz).toFixed(1)} m`);
  await shot('02-after-orbit');

  // time of day buttons
  await evl(`document.querySelector('#tod button[data-t="2"]').click()`);
  await sleep(5200);
  check('night button', (await evl('__api.sky.night')) > 0.95, 'night = ' + (await evl('__api.sky.night')).toFixed(2));
  await shot('03-night');
  await evl(`document.querySelector('#tod button[data-t="1"]').click()`);
  await sleep(3200);
  check('dusk button', Math.abs((await evl('__api.sky.k')) - 1) < 0.05);
  await evl(`document.querySelector('#tod button[data-t="0"]').click()`);
  await sleep(3200);
  check('day button', (await evl('__api.sky.k')) < 0.05);

  // view presets
  await evl(`document.querySelector('#views button[data-v="ix"]').click()`);
  await sleep(2600);
  const v4 = await view();
  check('view preset flies', Math.abs(v4.dist - 400) < 8 && Math.abs(v4.tz - 212) < 4, `dist ${v4.dist.toFixed(0)}, target z ${v4.tz.toFixed(0)}`);
  await shot('04-view-ix');

  // follow a bus
  await evl(`document.querySelector('#btnBus').click()`);
  await sleep(2600);
  const f1 = await evl(`({ shown: !document.getElementById('follow').hidden, name: document.getElementById('followName').textContent })`);
  check('follow bus starts', f1.shown && /路/.test(f1.name), f1.name);
  const p1 = await view();
  // follow for a while; sample whether the view stays clear and the target stays on the bus
  let clearSamples = 0, samples = 0, worst = 0;
  for (let i = 0; i < 24; i++) {
    await sleep(1000);
    const st = await evl('__api.state()');
    if (st.tweening) continue;
    samples++;
    if (!st.blocked) clearSamples++;
    const d = await evl(`(() => { const t = __api.controls.target; let best = 1e9; for (const b of __api.traffic.buses()) best = Math.min(best, Math.hypot(b.x - t.x, b.z - t.z)); return best; })()`);
    worst = Math.max(worst, d);
    if (i === 8) await shot('05-follow-bus');
  }
  const p2 = await view();
  const st2 = await evl('__api.state()');
  check('camera target stays on the bus', worst < 1.5, `worst offset ${worst.toFixed(2)} m; bus travelled ${Math.hypot(p2.tx - p1.tx, p2.tz - p1.tz).toFixed(0)} m`);
  check('followed vehicle mostly in clear view', clearSamples >= samples * 0.8, `${clearSamples}/${samples} samples clear, ${st2.reflies} re-aims in 24 s`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  check('Esc stops following', await evl(`document.getElementById('follow').hidden`));

  // click a vehicle on the canvas
  await evl(`__api.setView({ t: [200, 9, 180], az: 10, el: 55, dist: 150 })`);
  await sleep(600);
  const pt = await evl(`(() => {
    const cam = __api.camera; let best = null;
    for (const c of __api.traffic.all) {
      if (c.lane.kind !== 'fwy') continue;
      const v = new (__api.camera.position.constructor)(c.x, c.y + 0.9, c.z).project(cam);
      if (Math.abs(v.x) < 0.5 && Math.abs(v.y) < 0.5) { best = { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, v: c.v }; break; }
    }
    return best;
  })()`);
  if (pt) {
    // lead the target a little: the vehicle keeps moving between projection and click
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(500);
    const f2 = await evl(`({ shown: !document.getElementById('follow').hidden, name: document.getElementById('followName').textContent })`);
    check('click on a vehicle follows it', f2.shown, f2.name || 'no hit (vehicle moved)');
    await sleep(1500);
    await shot('06-follow-click');
  } else check('click on a vehicle follows it', false, 'no vehicle in view');

  // H hides UI
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72 });
  await sleep(200);
  check('H hides the UI', await evl(`document.body.classList.contains('noui')`));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'h', code: 'KeyH', windowsVirtualKeyCode: 72 });

  // frame rate over 3 s
  const fps = await evl(`new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / 3); })(); })`, true);
  console.log('fps (headless, 1440x900):', fps.toFixed(1), '| stats:', await evl(`document.getElementById('stats').textContent`));
  check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  ws.close();
} finally {
  chrome.kill('SIGTERM');
  await sleep(400);
  spawnSync('pkill', ['-f', profile]);
  fs.rmSync(profile, { recursive: true, force: true });
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
