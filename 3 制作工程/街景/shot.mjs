// Headless-Chrome screenshots of the built page, for visual checks.
//   node shot.mjs --shots all:0,ix:0,canyon:2 [--cam name=tx,ty,tz,az,el,dist] [--warp 40] [--w 1600 --h 1000] [--bench]
// A shot is "<view>:<time>" where view is a preset name or a --cam name; time 0 day, 1 dusk, 2 night.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const htmlPath = path.resolve(root, '../../4 输出成品/HTML/美式城市街景.html');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : def;
};
const W = Number(opt('w', 1600)), H = Number(opt('h', 1000));
const warp = Number(opt('warp', 30));
const outDir = path.resolve(root, opt('out', 'build/shots'));
const shots = String(opt('shots', 'all:0')).split(',').map((s) => {
  const [view, time] = s.split(':');
  return { view, time: Number(time || 0) };
});
const cams = {};
args.forEach((a, i) => {
  if (a === '--cam' && args[i + 1]) {
    const [name, v] = args[i + 1].split('=');
    const [tx, ty, tz, az, el, dist] = v.split(',').map(Number);
    cams[name] = { t: [tx, ty, tz], az, el, dist };
  }
});
const bench = args.includes('--bench');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!fs.existsSync(htmlPath)) throw new Error('built html missing: ' + htmlPath);
  fs.mkdirSync(outDir, { recursive: true });
  const profile = path.join(root, 'build', 'chrome-profile-' + process.pid);
  fs.mkdirSync(profile, { recursive: true });
  const port = 9300 + (process.pid % 500);
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--use-angle=metal',
    `--window-size=${W},${H}`,
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    'file://' + encodeURI(htmlPath) + '?shot=1',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  chrome.stderr.on('data', (d) => {
    const s = String(d);
    if (/FATAL|SwiftShader/i.test(s)) console.error('[chrome]', s.trim().slice(0, 400));
  });
  const cleanup = async () => {
    chrome.kill('SIGTERM');
    await sleep(400);
    spawnSync('pkill', ['-f', profile]);
    fs.rmSync(profile, { recursive: true, force: true });
  };

  try {
    let wsUrl = null;
    for (let i = 0; i < 150 && !wsUrl; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/list`);
        const list = await res.json();
        const page = list.find((t) => t.type === 'page');
        if (page) wsUrl = page.webSocketDebuggerUrl;
      } catch (e) { /* not up yet */ }
      if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new Error('chrome devtools not ready');
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
      } else if (m.method === 'Runtime.exceptionThrown') {
        errors.push(String(m.params.exceptionDetails?.exception?.description || JSON.stringify(m.params)).slice(0, 600));
      } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
        errors.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'log') {
        const t = (m.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
        if (t.startsWith('[dbg]')) console.log(t.slice(0, 1500));
      } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
        errors.push(String(m.params.entry.text).slice(0, 400));
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    const evl = async (expression, awaitPromise = false) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 1200));
      return r.result?.value;
    };
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

    const t0 = Date.now();
    let ready = false;
    while (Date.now() - t0 < 90000) {
      ready = await evl('window.__ready === true');
      if (ready || errors.length) break;
      await sleep(250);
    }
    if (!ready) {
      console.log('NOT READY. errors:');
      for (const e of errors.slice(0, 12)) console.log(' -', e);
      throw new Error('page did not become ready');
    }
    console.log('ready in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    const gpu = await evl(`(() => {
      const c = document.querySelector('#stage canvas');
      const gl = c.getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : String(gl.getParameter(gl.RENDERER));
    })()`);
    console.log('GPU:', gpu);
    console.log('build ms:', await evl('window.__buildMs'));
    if (/swiftshader|llvmpipe|software/i.test(String(gpu))) throw new Error('software WebGL: ' + gpu);

    if (warp > 0) console.log('warp ms:', await evl(`window.__api.warp(${warp})`));
    const frames = () => evl('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))', true);
    let first = true;
    for (const s of shots) {
      if (s.view === 'none') continue;
      const v = cams[s.view] ? JSON.stringify(cams[s.view]) : JSON.stringify(s.view);
      await evl(`window.__api.setTime(${s.time}); window.__api.setView(${v}); true`);
      await frames();
      await sleep(first ? 900 : 350);
      await frames();
      first = false;
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const f = path.join(outDir, `${s.view}-${s.time}.png`);
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log('shot:', f);
    }
    console.log('info:', JSON.stringify(await evl('window.__api.info()')));
    if (bench) {
      for (const v of ['all', 'ix', 'canyon']) {
        await evl(`window.__api.setView(${JSON.stringify(v)}); true`);
        console.log('ms/frame', v + ':', (await evl('window.__api.bench(60)')).toFixed(2));
      }
    }
    if (errors.length) {
      console.log(`console messages (${errors.length}):`);
      for (const e of [...new Set(errors)].slice(0, 20)) console.log(' -', e);
    } else console.log('no console errors');
    ws.close();
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
