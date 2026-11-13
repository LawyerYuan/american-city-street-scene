// Lighting, sky dome, image-based lighting and time of day (0 = day, 1 = dusk, 2 = night).
import * as THREE from 'three';
import { clamp, lerp, DEG } from './util.js';

const C = (h) => new THREE.Color(h);

const PRESETS = [
  { // day
    az: 118, el: 44, sun: C(0xfff1da), sunI: 3.7,
    skyC: C(0xdfe6ee), gndC: C(0xa39c8e), hemiI: 0.46,
    top: C(0x5a8fd0), hor: C(0xd4e4f0), bot: C(0xe4e8ec),
    env: 0.72, night: 0, exposure: 0.97, glow: 1, fog: C(0xcfdfea), fogD: 0.00009,
  },
  { // dusk
    az: 262, el: 8, sun: C(0xff9450), sunI: 2.5,
    skyC: C(0x8087be), gndC: C(0x5b4b49), hemiI: 0.42,
    top: C(0x26336d), hor: C(0xf2a06c), bot: C(0x6c6585),
    env: 0.7, night: 0.72, exposure: 1.02, glow: 1.6, fog: C(0xd9a183), fogD: 0.00016,
  },
  { // night
    az: 150, el: 56, sun: C(0x93a9dd), sunI: 0.55,
    skyC: C(0x34416e), gndC: C(0x1c1b26), hemiI: 0.46,
    top: C(0x060913), hor: C(0x1b2747), bot: C(0x0c0f1a),
    env: 0.34, night: 1, exposure: 1.14, glow: 0, fog: C(0x0d1424), fogD: 0.00013,
  },
];

const domeVert = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const domeFrag = `
uniform vec3 uTop, uHor, uBot, uSunDir, uSunCol;
uniform float uGlow, uStars;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 c = h > 0.0 ? mix(uHor, uTop, pow(h, 0.5)) : mix(uHor, uBot, pow(-h, 0.35));
  float sd = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(sd, 900.0) * 5.0 + pow(sd, 10.0) * 0.22) * uGlow;
  if (uStars > 0.0 && h > 0.0) {
    vec2 g = floor(d.xz / (0.25 + d.y) * 260.0);
    float s = step(0.9972, hash(g));
    c += vec3(0.8, 0.85, 1.0) * s * uStars * (0.3 + 0.7 * hash(g + 3.1)) * smoothstep(0.02, 0.3, h);
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.k = 0;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.5;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.6);
    scene.add(this.hemi);
    this.dir = new THREE.Vector3();
    this.uni = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uGlow: { value: 1 }, uStars: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    this.dome.userData.noAO = true;
    scene.add(this.dome);
    // environment for reflections
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envUni = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBot: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Color() }, uGlow: { value: 1 }, uStars: { value: 0 },
    };
    const envMat = new THREE.ShaderMaterial({ uniforms: this.envUni, vertexShader: domeVert, fragmentShader: domeFrag, side: THREE.BackSide, depthWrite: false });
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), envMat));
    this.envRT = null;
    this.envDirty = true;
    this.envTimer = 0;
    scene.fog = new THREE.FogExp2(0xc9dcea, 0.0001);
    this.night = 0;
    this.exposure = 1;
    this.set(0);
  }

  set(k) {
    k = clamp(k, 0, 2);
    this.k = k;
    const i = Math.min(1, Math.floor(k)), t = k - i;
    const a = PRESETS[i], b = PRESETS[i + 1];
    let az, el, sunI;
    const sunCol = new THREE.Color();
    if (i === 0) {
      az = lerp(a.az, b.az, t);
      el = lerp(a.el, b.el, t);
      sunI = lerp(a.sunI, b.sunI, t);
      sunCol.copy(a.sun).lerp(b.sun, t);
    } else if (t < 0.5) {
      // sun sets
      const u = t / 0.5;
      az = lerp(a.az, a.az + 6, u);
      el = lerp(a.el, -6, u);
      sunI = a.sunI * Math.max(0, 1 - u * 1.15);
      sunCol.copy(a.sun);
    } else {
      // moon takes over
      const u = (t - 0.5) / 0.5;
      az = b.az;
      el = b.el;
      sunI = b.sunI * u;
      sunCol.copy(b.sun);
    }
    const ce = Math.cos(el * DEG);
    this.dir.set(Math.sin(az * DEG) * ce, Math.sin(el * DEG), -Math.cos(az * DEG) * ce).normalize();
    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI;
    this.sun.castShadow = sunI > 0.02;
    this.hemi.color.copy(a.skyC).lerp(b.skyC, t);
    this.hemi.groundColor.copy(a.gndC).lerp(b.gndC, t);
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, t);
    for (const u of [this.uni, this.envUni]) {
      u.uTop.value.copy(a.top).lerp(b.top, t);
      u.uHor.value.copy(a.hor).lerp(b.hor, t);
      u.uBot.value.copy(a.bot).lerp(b.bot, t);
      u.uSunDir.value.copy(this.dir);
      u.uSunCol.value.copy(sunCol).multiplyScalar(i === 1 && t >= 0.5 ? 0.15 : 1);
      u.uGlow.value = lerp(a.glow, b.glow, t) * (sunI > 0.02 ? 1 : 0.2);
    }
    this.uni.uStars.value = i === 1 ? t : 0;
    // the environment's lower hemisphere stands for the city itself
    this.envUni.uBot.value.copy(this.hemi.groundColor).multiplyScalar(0.9);
    {
      const t2 = this.envUni.uTop.value, g = (t2.r + t2.g + t2.b) / 3;
      t2.setRGB(lerp(t2.r, g, 0.45), lerp(t2.g, g, 0.45), lerp(t2.b, g, 0.45));
    }
    this.scene.environmentIntensity = lerp(a.env, b.env, t);
    this.night = lerp(a.night, b.night, t);
    this.exposure = lerp(a.exposure, b.exposure, t);
    this.scene.fog.color.copy(a.fog).lerp(b.fog, t);
    this.scene.fog.density = lerp(a.fogD, b.fogD, t);
    this.envDirty = true;
  }

  // call every frame
  update(dt, camera, target, dist) {
    this.dome.position.copy(camera.position);
    this.envTimer -= dt;
    if (this.envDirty && this.envTimer <= 0) {
      const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
      if (this.envRT) this.envRT.dispose();
      this.envRT = rt;
      this.scene.environment = rt.texture;
      this.envDirty = false;
      this.envTimer = 0.12;
    }
    // shadow frustum follows the view
    const sh = this.sun.shadow;
    let R = clamp(dist * 0.7, 140, 590);
    R = 140 * Math.pow(1.22, Math.round(Math.log(R / 140) / Math.log(1.22)));
    const cam = sh.camera;
    if (cam.right !== R) {
      cam.left = -R;
      cam.right = R;
      cam.top = R;
      cam.bottom = -R;
      cam.near = 50;
      cam.far = 2600;
      cam.updateProjectionMatrix();
      sh.normalBias = 0.35 + R * 0.0022;
    }
    // snap to shadow texels to avoid shimmer
    const d = this.dir;
    const right = _v1.set(d.z, 0, -d.x).normalize();
    const up = _v2.crossVectors(d, right).normalize();
    const texel = (2 * R) / sh.mapSize.x;
    const px = Math.round(target.dot(right) / texel) * texel;
    const py = Math.round(target.dot(up) / texel) * texel;
    const pd = target.dot(d);
    _v3.set(0, 0, 0).addScaledVector(right, px).addScaledVector(up, py).addScaledVector(d, pd);
    this.sun.target.position.copy(_v3);
    this.sun.position.copy(_v3).addScaledVector(d, 1300);
    this.sun.target.updateMatrixWorld();
  }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
