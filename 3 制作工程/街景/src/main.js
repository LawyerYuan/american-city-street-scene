import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createMaterials, createBatches, flushBatches } from './mats.js';
import { mesh } from './geo.js';
import { buildGround } from './ground.js';
import { buildElevated, PIERS, DECK_SAMPLES } from './elevated.js';
import { buildNetwork } from './network.js';
import { buildRail, Trains, L_COLUMNS, STATION } from './rail.js';
import { buildBuildings } from './buildings.js';
import { makeFacadeMaterial } from './facade.js';
import { buildObservationTower, buildPier, buildBridges, Wheel, Boats } from './landmarks.js';
import { buildVehicleTypes, VehicleRenderer } from './vehicles.js';
import { Traffic } from './traffic.js';
import { buildProps, buildTrees, buildLampField, buildPools } from './props.js';
import { People } from './people.js';
import { Sky } from './sky.js';
import { HALF } from './layout.js';
import { DEG, RNG, clamp, lerp, sstep5 } from './util.js';

const T0 = performance.now();
const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
if (SHOT) document.body.classList.add('noui');

const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const maxPR = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 2);
let pixelRatio = maxPR;
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.localClippingEnabled = true;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 12000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.09;
controls.minDistance = 12;
controls.maxDistance = 2100;
controls.maxPolarAngle = 87 * DEG;
controls.minPolarAngle = 3 * DEG;
controls.zoomToCursor = true;
controls.screenSpacePanning = false;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 1.15;
controls.autoRotateSpeed = 0.4;

// ---- build the city ----------------------------------------------------------------
const rng = new RNG(20261113);
const M = createMaterials();
const B = createBatches();
const sky = new Sky(renderer, scene);

buildGround(B);
buildElevated(B);
const net = buildNetwork();
buildRail(B);
const pierNear = (x, z) => PIERS.some((p) => Math.hypot(p.x - x, p.z - z) < 3.2);
const { F, ctx } = buildBuildings(B, 7, { pierNear });
buildObservationTower(B, ctx.lots.towerPlaza, ctx.trees, ctx.beacons);
buildPier(B, ctx.trees);
buildBridges(B);

const T = buildVehicleTypes();
const vr = new VehicleRenderer(scene, M, T);
const traffic = new Traffic(net, T, new RNG(4242));
const props = buildProps(scene, B, M, {
  rng, trees: ctx.trees, parked: ctx.parked, stops: traffic.busStops, lColumns: L_COLUMNS, towerPlaza: ctx.lots.towerPlaza,
});

// keep trees clear of piers, the station and low decks
{
  const keep = [];
  for (const t of ctx.trees) {
    if (PIERS.some((p) => Math.hypot(p.x - t.x, p.z - t.z) < 2.6)) continue;
    if (Math.abs(t.x - STATION.x) < 12.5 && t.z > STATION.z0 - 17 && t.z < STATION.z1 + 17) continue;
    let low = 1e9;
    for (const d of DECK_SAMPLES) {
      const dx = d.x - t.x, dz = d.z - t.z;
      if (dx * dx + dz * dz < (d.half + 2.6) * (d.half + 2.6)) low = Math.min(low, d.y);
    }
    if (low < 1e9) {
      const maxS = (low - 2.4) / 8.6;
      if (maxS < 0.5) continue;
      t.s = Math.min(t.s || 1, maxS);
    }
    keep.push(t);
  }
  ctx.trees = keep;
}
const treeCount = buildTrees(scene, ctx.trees, rng);
vr.addStatic(scene, ctx.parked);

const batches = flushBatches(B, M, scene);
const facadeMesh = mesh(F, makeFacadeMaterial(M));
facadeMesh.name = 'facades';
scene.add(facadeMesh);

const people = new People(scene, new RNG(99));
const wheel = new Wheel(scene, M);
const boats = new Boats(scene, M, vr.clip);
const trains = new Trains(scene, M, vr.clip);

// night lights
const lampField = buildLampField(scene, M, props.lamps);
const beaconField = buildLampField(scene, M, ctx.beacons.map((b) => ({ x: b[0], y: b[1], z: b[2], c: [1, 0.12, 0.08], size: 3.6 })));
beaconField.material.uniforms.uBlink.value = 1;
const wheelLamps = [];
for (let i = 0; i < wheel.lightPos.length / 3; i++) {
  wheelLamps.push({ x: wheel.lightPos[i * 3], y: wheel.lightPos[i * 3 + 1], z: wheel.lightPos[i * 3 + 2], c: [wheel.lightCol[i * 3], wheel.lightCol[i * 3 + 1], wheel.lightCol[i * 3 + 2]], size: 0.9 });
}
const wheelField = buildLampField(scene, M, wheelLamps);
wheel.group.add(wheelField);
const pools = buildPools(scene, M, props.pools);
const lampFields = [lampField, beaconField, wheelField];

// ---- post-processing ---------------------------------------------------------
const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 2, 2);
gtao.updateGtaoMaterial({ radius: 6.5, distanceExponent: 1.2, thickness: 1.4, scale: 1.15, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 2, rings: 2, samples: 12 });
gtao.blendIntensity = 0.95;
if (gtao.normalMaterial) gtao.normalMaterial.clippingPlanes = vr.clip;
// keep sprites, glows and the sky out of the AO G-buffer
{
  const hidden = [];
  const hide = () => {
    scene.traverse((o) => {
      if (o.visible && (o.isPoints || o.isLine || (o.userData && o.userData.noAO))) {
        o.visible = false;
        hidden.push(o);
      }
    });
  };
  const show = () => {
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
  };
  for (const k of ['_overrideVisibility', 'overrideVisibility']) if (typeof gtao[k] === 'function') gtao[k] = hide;
  for (const k of ['_restoreVisibility', 'restoreVisibility']) if (typeof gtao[k] === 'function') gtao[k] = show;
}
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.15, 0.55, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const sc = (h * pixelRatio) / (2 * Math.tan((camera.fov * DEG) / 2));
  for (const f of lampFields) f.material.uniforms.uScale.value = sc;
}
window.addEventListener('resize', resize);
resize();

// ---- camera views ------------------------------------------------------------------
const VIEWS = {
  all: { t: [5, 42, 12], az: 17, el: 31, dist: 1370 },
  ix: { t: [22, 10, 212], az: -34, el: 31, dist: 400 },
  canyon: { t: [60, 14, -110], az: 3, el: 15, dist: 430 },
  main: { t: [10, 0, -60], az: -90, el: 36, dist: 300 },
  river: { t: [-236, 0, -52], az: -62, el: 25, dist: 400 },
};
function applyView(v) {
  controls.target.set(v.t[0], v.t[1], v.t[2]);
  const ce = Math.cos(v.el * DEG);
  camera.position.set(
    v.t[0] + v.dist * Math.sin(v.az * DEG) * ce,
    v.t[1] + v.dist * Math.sin(v.el * DEG),
    v.t[2] + v.dist * Math.cos(v.az * DEG) * ce,
  );
  camera.lookAt(controls.target);
}
function currentView() {
  const d = camera.position.clone().sub(controls.target);
  const dist = d.length();
  return { t: controls.target.toArray(), dist, el: Math.asin(clamp(d.y / dist, -1, 1)) / DEG, az: Math.atan2(d.x, d.z) / DEG };
}
let tween = null;
function flyTo(v, dur = 1.7, dyn = null) {
  const a = currentView();
  let daz = v.az - a.az;
  while (daz > 180) daz -= 360;
  while (daz < -180) daz += 360;
  tween = { a, b: Object.assign({}, v, { az: a.az + daz }), t: 0, dur, dyn };
}
applyView(VIEWS.all);
controls.update();

// ---- follow a vehicle ----------------------------------------------------------------
let follow = null;
const followPos = new THREE.Vector3();
const $ = (s) => document.querySelector(s);
// line of sight from a point to a camera placed at (az, el, dist) around it
const losRay = new THREE.Raycaster();
const _o = new THREE.Vector3(), _dir = new THREE.Vector3();
let occluders = null;
function blocked(tx, ty, tz, az, el, dist) {
  if (!occluders) occluders = [facadeMesh, batches.roof, batches.conc, batches.plain].filter(Boolean);
  const ce = Math.cos(el * DEG);
  _dir.set(Math.sin(az * DEG) * ce, Math.sin(el * DEG), Math.cos(az * DEG) * ce);
  losRay.set(_o.set(tx, ty, tz), _dir);
  losRay.near = 3;
  losRay.far = dist;
  return losRay.intersectObjects(occluders, false).length > 0;
}
function clearView(c, az0, dist) {
  for (const el of [36, 50, 24, 14, 64]) {
    for (const da of [0, 35, -35, 70, -70, 110, -110, 150, -150, 180]) {
      if (!blocked(c.x, c.y + 1.5, c.z, az0 + da, el, dist)) return { az: az0 + da, el };
    }
  }
  return { az: az0, el: 78 };
}
let losTimer = 0, losBad = 0, reflies = 0;
function startFollow(c, fly = true) {
  follow = c;
  followPos.set(c.x, c.y + 1.5, c.z);
  $('#follow').hidden = false;
  $('#followName').textContent = c.isTrain ? '高架轻轨' : traffic.describe(c);
  losBad = 0;
  if (fly) {
    const cur = currentView();
    const dist = clamp(cur.dist, 60, c.isTrain ? 150 : 105);
    const v = clearView(c, Math.atan2(-c.hx, -c.hz) / DEG + 28, dist);
    flyTo({ t: [c.x, c.y + 1.5, c.z], az: v.az, el: v.el, dist }, 1.5, c);
  }
}
function stopFollow() {
  follow = null;
  $('#follow').hidden = true;
}
function followBus() {
  const list = traffic.buses();
  if (!list.length) return;
  const loop = list.filter((b) => b.route.loop);
  const pool = loop.length && Math.random() < 0.7 ? loop : list;
  startFollow(pool[Math.floor(Math.random() * pool.length)]);
}

// ---- time of day -------------------------------------------------------------------
let tod = 0, todTarget = 0;
function setTime(k, instant) {
  todTarget = k;
  if (instant) {
    tod = k;
    sky.set(k);
  }
  document.querySelectorAll('#tod button').forEach((q) => q.classList.toggle('on', Number(q.dataset.t) === k));
}

// ---- main loop ---------------------------------------------------------------------
const clock = new THREE.Clock();
let simTime = 0, lastDist = 1e9;
function step(dt) {
  simTime += dt;
  M.uTime.value = simTime;
  if (tod !== todTarget) {
    const d = todTarget - tod;
    const sp = dt * 0.5;
    tod = Math.abs(d) <= sp ? todTarget : tod + Math.sign(d) * sp;
    sky.set(tod);
  }
  if (dt > 0) {
    traffic.step(dt);
    trains.step(dt);
    wheel.update(dt);
    boats.update(dt, simTime);
    people.update(dt, simTime, lastDist);
  }
  props.updateSignals();
  const n = sky.night;
  M.uNight.value = n;
  M.sign.emissiveIntensity = n * 0.85;
  renderer.toneMappingExposure = sky.exposure;
  M.water.normalMap.offset.set(simTime * 0.006, simTime * 0.011);
  pools.visible = n > 0.02;
  pools.material.opacity = n * 0.5;
  vr.setNight(n);
  boats.wakeMat.opacity = 0.3 * (1 - 0.88 * n);
  bloom.strength = lerp(0.1, 0.62, n);
  bloom.threshold = lerp(1.6, 0.8, n);
  bloom.radius = lerp(0.4, 0.62, n);
}

const _d = new THREE.Vector3();
renderer.info.autoReset = false;
function render(dt) {
  renderer.info.reset();
  traffic.draw(vr);
  trains.draw();
  if (follow && follow.dead) {
    if (follow.route) {
      const nb = traffic.buses();
      if (nb.length) startFollow(nb[Math.floor(Math.random() * nb.length)]);
      else stopFollow();
    } else stopFollow();
  }
  if (tween) {
    tween.t += dt / tween.dur;
    const e = sstep5(Math.min(1, tween.t));
    const a = tween.a, b = tween.b;
    if (tween.dyn) b.t = [tween.dyn.x, tween.dyn.y + 1.5, tween.dyn.z];
    applyView({
      t: [lerp(a.t[0], b.t[0], e), lerp(a.t[1], b.t[1], e), lerp(a.t[2], b.t[2], e)],
      az: lerp(a.az, b.az, e), el: lerp(a.el, b.el, e), dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), e)),
    });
    if (tween.t >= 1) {
      if (tween.dyn) followPos.set(tween.dyn.x, tween.dyn.y + 1.5, tween.dyn.z);
      tween = null;
    }
  } else if (follow) {
    _d.set(follow.x, follow.y + 1.5, follow.z).sub(followPos);
    followPos.add(_d);
    camera.position.add(_d);
    controls.target.add(_d);
    // if a building comes between the camera and the vehicle, swing round to a clear angle
    losTimer -= dt;
    if (losTimer <= 0) {
      losTimer = 0.4;
      const cur = currentView();
      if (blocked(followPos.x, followPos.y, followPos.z, cur.az, cur.el, cur.dist)) losBad++;
      else losBad = 0;
      if (losBad >= 3) {
        losBad = 0;
        reflies++;
        const v = clearView(follow, cur.az, Math.min(cur.dist, 140));
        flyTo({ t: [follow.x, follow.y + 1.5, follow.z], az: v.az, el: v.el, dist: Math.min(cur.dist, 140) }, 1.3, follow);
      }
    }
  }
  controls.update();
  const t = controls.target;
  if (!follow) {
    t.x = clamp(t.x, -HALF, HALF);
    t.z = clamp(t.z, -HALF, HALF);
    t.y = clamp(t.y, 0, 330);
  }
  if (camera.position.y < 2.5) camera.position.y = 2.5;
  const dist = camera.position.distanceTo(t);
  lastDist = dist;
  camera.near = clamp(dist * 0.04, 0.5, 60);
  camera.far = dist + 5600;
  camera.updateProjectionMatrix();
  sky.update(dt, camera, t, dist);
  composer.render();
}

// adaptive resolution: keep the frame rate up on slower machines
let slow = 0, fast = 0, fpsAcc = 0, fpsN = 0, fpsShown = 0;
function adapt(dt) {
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc >= 0.5) {
    const fps = fpsN / fpsAcc;
    fpsShown = fps;
    fpsAcc = 0;
    fpsN = 0;
    if (fps < 40) {
      slow++;
      fast = 0;
    } else if (fps > 57) {
      fast++;
      slow = 0;
    } else {
      slow = 0;
      fast = 0;
    }
    if (slow >= 3) {
      slow = 0;
      if (pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        resize();
      } else if (gtao.enabled) gtao.enabled = false;
    }
    if (fast >= 16 && pixelRatio < maxPR) {
      fast = 0;
      pixelRatio = Math.min(maxPR, pixelRatio + 0.25);
      resize();
    }
    const el = document.getElementById('stats');
    if (el) el.textContent = `车辆 ${traffic.all.size} · 树 ${treeCount} · ${Math.round(fps)} fps`;
  }
}

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (document.hidden) return;
  step(dt);
  render(dt);
  if (!SHOT) adapt(dt);
}

// ---- UI ----------------------------------------------------------------------------
document.querySelectorAll('#tod button').forEach((b) => b.addEventListener('click', () => setTime(Number(b.dataset.t))));
document.querySelectorAll('#views button').forEach((b) => {
  b.addEventListener('click', () => {
    stopFollow();
    flyTo(VIEWS[b.dataset.v]);
  });
});
$('#btnBus').addEventListener('click', followBus);
$('#followExit').addEventListener('click', stopFollow);
$('#btnRotate').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  $('#btnRotate').classList.toggle('on', controls.autoRotate);
});
$('#btnFull').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('noui');
  if (e.key === 'Escape') stopFollow();
  if (e.key === '1') setTime(0);
  if (e.key === '2') setTime(1);
  if (e.key === '3') setTime(2);
});
// click (without dragging) on a vehicle to follow it
{
  const ray = new THREE.Raycaster();
  const v2 = new THREE.Vector2();
  let down = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    tween = null;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  el.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    if (moved > 5 || !quick || e.button !== 0) return;
    const r = el.getBoundingClientRect();
    v2.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v2, camera);
    const hit = vr.pick(ray);
    if (hit) startFollow(hit);
    else {
      const th = ray.intersectObject(trains.mesh, false);
      if (th.length && trains.trains.length) startFollow(trains.trains[Math.min(trains.trains.length - 1, Math.floor(th[0].instanceId / 4))]);
    }
  });
}

// ---- API for automated screenshots ---------------------------------------------------
window.__api = {
  setView(v) {
    tween = null;
    stopFollow();
    applyView(typeof v === 'string' ? VIEWS[v] : v);
    controls.update();
  },
  setTime(k) {
    setTime(k, true);
  },
  warp(sec) {
    const n = Math.ceil(sec / 0.05);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) step(0.05);
    return Math.round(performance.now() - t0);
  },
  followBus,
  state() {
    const cur = currentView();
    return { tweening: !!tween, following: !!follow, reflies, blocked: follow ? blocked(followPos.x, followPos.y, followPos.z, cur.az, cur.el, cur.dist) : false };
  },
  info() {
    return {
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries,
      tex: renderer.info.memory.textures, vehicles: traffic.all.size, people: people.list.length, trees: treeCount, buildings: ctx.count, parked: ctx.parked.length,
      pixelRatio, lanes: net.lanes.length, ...traffic.stats(),
    };
  },
  bench(n = 60) {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      step(1 / 60);
      render(1 / 60);
    }
    renderer.getContext().finish();
    return (performance.now() - t0) / n;
  },
  traffic, net, scene, camera, controls, sky,
};

// warm-up so the first frame shows settled traffic
for (let i = 0; i < 500; i++) {
  traffic.step(0.05);
  trains.step(0.05);
}
step(0);
render(0);
document.getElementById('loading').classList.add('done');
window.__ready = true;
window.__buildMs = Math.round(performance.now() - T0);
frame();
