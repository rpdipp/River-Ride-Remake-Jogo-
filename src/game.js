import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { createModels } from './models.js';
import { World, VIEW_AHEAD } from './world.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { setTerrainTheme } from './terrain.js';
import { PLANES, THEATERS, DEFAULT_PLANE, DEFAULT_THEATER } from './config.js';
import { riverAt, isWater, terrainHeight, SECTION_LEN, FLY_Y } from './river.js';
import { clamp, lerp } from './util.js';

const BULLET_SPEED = 300;
const EXTRA_LIFE_EVERY = 10000;
const PLANE_IDS = Object.keys(PLANES);
const THEATER_IDS = Object.keys(THEATERS);
const $ = (id) => document.getElementById(id);

function load(key, fallback, valid) {
  try {
    const v = localStorage.getItem(key);
    return valid.includes(v) ? v : fallback;
  } catch { return fallback; }
}
function save(key, v) {
  try { localStorage.setItem(key, v); } catch { /* storage unavailable */ }
}

export class Game {
  constructor() {
    this.initRenderer();
    this.tex = makeTextures();
    this.models = createModels(this.tex);
    this.initSceneDressing();

    this.world = new World(this);
    this.fx = new Effects(this.scene, this.tex);
    this.audio = new GameAudio();
    this.input = new Input($('touch'), $('joy'), $('knob'), $('fire'));

    this.p = { x: 0, d: 20, vx: 0, speed: 55, fuel: 100, fireCd: 0, gun: 1 };
    this.bullets = [];
    this.shells = [];
    this.bulletPool = [];
    this.camX = 0;
    this.time = 0;
    this.state = 'title';
    this.hiscore = 0;
    try { this.hiscore = +localStorage.getItem('rs_hiscore') || 0; } catch { /* ignore */ }

    this.setPlane(load('rs_plane', DEFAULT_PLANE, PLANE_IDS));
    this.applyTheater(load('rs_theater', DEFAULT_THEATER, THEATER_IDS), false);

    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'playing') this.pause();
        this.audio.suspend();
      } else this.audio.resume();
    });

    this.world.spawnEnemies = true;
    this.world.safeD = 120;
    this.world.update(this.p.d, true);
    this.showScreen('title');

    this.clock = new THREE.Clock();
    this.perf = { t: 0, frames: 0, level: 0 };
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ------------------------------------------------------------------ setup
  initRenderer() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    r.setPixelRatio(this.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    $('game').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.horizon = new THREE.Color(0xb7c4c9);
    this.scene.background = this.horizon;
    this.scene.fog = new THREE.Fog(this.horizon, 170, VIEW_AHEAD - 30);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1200);
  }

  initSceneDressing() {
    const s = this.scene;
    // Sky dome (also used to bake an environment map for reflections)
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x4a7cc2) }, bottom: { value: this.horizon.clone() },
        sun: { value: new THREE.Vector3(-0.3, 0.45, 0.85).normalize() }, glow: { value: 0.8 },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; uniform float glow; varying vec3 vP;
        void main(){ float h = clamp(vP.y*1.6+0.05,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.7));
        float s = pow(max(dot(vP, sun),0.0), 40.0); c += vec3(1.0,0.85,0.6)*s*glow; gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), this.skyMat);
    s.add(this.sky);

    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.skyMat));
    this.envGround = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x4b5a35 }));
    this.envGround.rotation.x = -Math.PI / 2;
    this.envGround.position.y = -10;
    this.envScene.add(this.envGround);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a5232, 0.9);
    s.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d8, 2.6));
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 220;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.4;
    s.add(sun, sun.target);

    // Water: one big animated plane that follows the camera
    const wn = this.tex.waterNormal;
    wn.repeat.set(700 / 18, 1100 / 18);
    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x2c5660, roughness: 0.1, metalness: 0.05, normalMap: wn, normalScale: new THREE.Vector2(0.4, 0.4),
      transparent: true, opacity: 0.8, envMapIntensity: 1.4,
    });
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(700, 1100), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.receiveShadow = true;
    s.add(this.water);

    // Low clouds the plane flies under/through for a sense of speed
    this.clouds = [];
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.cloud, transparent: true, depthWrite: false, opacity: 0 }));
      c.renderOrder = 4;
      this.resetCloud(c, true);
      s.add(c);
      this.clouds.push(c);
    }

    this.initSnow();
    this.initNight();

    // Tracer geometry / material
    this.tracerGeo = new THREE.BoxGeometry(0.24, 0.24, 4.5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffa630, fog: false });
    this.shellGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xff7a30 });
  }

  /** Falling snow around the camera (Ardennes). */
  initSnow() {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * 70;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = -Math.random() * 110 + 15;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.45, map: this.tex.glow, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false,
    }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  /** Night extras: stars, moon and sweeping searchlights. */
  initNight() {
    const N = 500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 900, y * 900, Math.sin(a) * r * 900], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: 0xdfe8ff, fog: false }));
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xe6eeff, fog: false, depthWrite: false }));
    this.moon.scale.setScalar(90);
    this.moon.position.set(-260, 330, -760);
    this.sky.add(this.stars, this.moon);

    const beamGeo = new THREE.ConeGeometry(8, 90, 20, 1, true);
    beamGeo.rotateX(Math.PI);
    beamGeo.translate(0, 45, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xcfdcff, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.searchlights = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(beamGeo, beamMat));
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xeef3ff, blending: THREE.AdditiveBlending, depthWrite: false }));
      lamp.scale.setScalar(5);
      g.add(lamp);
      g.visible = false;
      g.userData = { phase: Math.random() * 6, speed: 0.3 + Math.random() * 0.4 };
      this.scene.add(g);
      this.searchlights.push(g);
    }
  }

  placeSearchlight(g, initial) {
    const d = this.p.d + (initial ? 60 + Math.random() * 450 : 380 + Math.random() * 150);
    const rv = riverAt(d);
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = rv.c + side * (rv.h + 12 + Math.random() * 45);
    g.position.set(x, terrainHeight(x, d), -d);
    g.userData.side = side;
  }

  resetCloud(c, initial = false) {
    const pd = this.p ? this.p.d : 0;
    const d = pd + (initial ? Math.random() * 520 : 420 + Math.random() * 160);
    c.userData.d = d;
    c.position.set((Math.random() * 2 - 1) * 140, 12 + Math.random() * 7, -d);
    const sz = 40 + Math.random() * 45;
    c.scale.set(sz, sz * 0.6, 1);
    c.userData.alpha = (0.22 + Math.random() * 0.25) * (this.th ? this.th.cloudAlpha : 1);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    if (aspect < 1) {
      // portrait: tall view, camera further back
      const t = clamp((aspect - 0.45) / 0.55, 0, 1);
      this.camK = lerp(1.85, 1.45, t);
      this.baseFov = lerp(72, 60, t);
    } else {
      // landscape: higher camera and longer look-ahead so the short screen still shows the river ahead
      const t = clamp((aspect - 1.3) / 1.0, 0, 1);
      this.camK = lerp(1.35, 1.45, t);
      this.baseFov = lerp(58, 62, t);
    }
    this.landscape = aspect >= 1;
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ plane & theatre
  setPlane(id) {
    this.pc = PLANES[id];
    save('rs_plane', id);
    const old = this.plane;
    this.plane = this.models.plane(id);
    this.prop = this.plane.getObjectByName('prop');
    // navigation lights (visible on night missions)
    this.navLights = [];
    for (const [side, color] of [[-1, 0xff3030], [1, 0x30ff60]]) {
      const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color, blending: THREE.AdditiveBlending, depthWrite: false }));
      l.scale.setScalar(1.1);
      l.position.set(side * this.pc.span, -0.05, 0.1);
      this.plane.add(l);
      this.navLights.push(l);
    }
    if (old) {
      this.plane.position.copy(old.position);
      this.plane.rotation.copy(old.rotation);
      this.plane.visible = old.visible;
      this.scene.remove(old);
    }
    for (const l of this.navLights) l.visible = !!(this.th && this.th.night);
    this.scene.add(this.plane);
  }

  applyTheater(id, rebuild = true) {
    const th = (this.th = THEATERS[id]);
    save('rs_theater', id);
    this.horizon.set(th.horizon);
    this.scene.fog.color.set(th.horizon);
    this.scene.fog.near = th.fogNear;
    this.scene.fog.far = th.fogFar;
    const u = this.skyMat.uniforms;
    u.top.value.set(th.skyTop);
    u.bottom.value.set(th.horizon);
    u.glow.value = th.sunGlow;
    this.sun.color.set(th.sun);
    this.sun.intensity = th.sunI;
    this.hemi.color.set(th.hemiSky);
    this.hemi.groundColor.set(th.hemiGround);
    this.hemi.intensity = th.hemiI;
    this.renderer.toneMappingExposure = th.exposure;
    this.envGround.material.color.set(th.snow ? 0xb8c0c6 : th.night ? 0x0b0d10 : 0x4b5a35);
    const env = this.pmrem.fromScene(this.envScene, 0.02).texture;
    this.scene.environment?.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = th.env;
    this.waterMat.color.set(th.water);
    this.waterMat.opacity = th.waterOpacity;
    for (const c of this.clouds) c.material.color.set(th.cloud);
    this.models.materials.luft.color.set(th.fighter.skin);
    this.models.materials.panzer.color.set(th.tank);
    this.tracerMat.color.set(th.night ? 0xffc060 : 0xffa630);

    this.snow.visible = !!th.snow;
    this.stars.visible = this.moon.visible = !!th.night;
    for (const g of this.searchlights) {
      g.visible = !!th.night;
      if (th.night) this.placeSearchlight(g, true);
    }
    for (const l of this.navLights || []) l.visible = !!th.night;

    setTerrainTheme(th);
    if (rebuild) {
      this.world.clear();
      this.world.update(this.p.d, true);
      for (const c of this.clouds) this.resetCloud(c, true);
    }
  }

  // ------------------------------------------------------------------ UI
  bindUI() {
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    tap('btnStart', () => this.openHangar());
    tap('btnFly', () => this.startGame());
    tap('btnBack', () => this.toTitle());
    tap('planePrev', () => this.cyclePlane(-1));
    tap('planeNext', () => this.cyclePlane(1));
    tap('thPrev', () => this.cycleTheater(-1));
    tap('thNext', () => this.cycleTheater(1));
    tap('btnAgain', () => this.startGame());
    tap('btnPause', () => this.pause());
    tap('btnResume', () => this.resume());
    tap('btnQuit', () => this.toTitle());
    tap('btnMenu', () => this.toTitle());
    for (const id of ['btnSound', 'btnSound2']) tap(id, () => { this.audio.setMuted(!this.audio.muted); this.syncSoundBtn(); });
    this.syncSoundBtn();
    $('hiscore').textContent = this.hiscore;
    window.addEventListener('keydown', (e) => {
      const st = this.state;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (st === 'playing') this.pause();
        else if (st === 'paused') this.resume();
        else if (st === 'hangar') this.toTitle();
      }
      if (e.code === 'Enter') {
        if (st === 'title') this.openHangar();
        else if (st === 'hangar' || st === 'over') this.startGame();
      }
      if (st === 'hangar') {
        if (e.code === 'ArrowLeft') this.cyclePlane(-1);
        if (e.code === 'ArrowRight') this.cyclePlane(1);
        if (e.code === 'ArrowUp') this.cycleTheater(-1);
        if (e.code === 'ArrowDown') this.cycleTheater(1);
      }
    });
  }

  syncSoundBtn() {
    for (const id of ['btnSound', 'btnSound2']) $(id).textContent = this.audio.muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO';
  }

  showScreen(name) {
    for (const id of ['title', 'hangar', 'pause', 'over']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', !(name === null || name === 'pause'));
    this.input.enabled = name === null;
    if (name !== null) this.input.reset();
  }

  openHangar() {
    this.audio.init();
    this.state = 'hangar';
    this.renderHangar();
    this.showScreen('hangar');
  }

  cyclePlane(dir) {
    const i = PLANE_IDS.indexOf(this.pc.id);
    this.setPlane(PLANE_IDS[(i + dir + PLANE_IDS.length) % PLANE_IDS.length]);
    this.renderHangar();
  }

  cycleTheater(dir) {
    const i = THEATER_IDS.indexOf(this.th.id);
    this.applyTheater(THEATER_IDS[(i + dir + THEATER_IDS.length) % THEATER_IDS.length]);
    this.renderHangar();
  }

  renderHangar() {
    const pc = this.pc, th = this.th;
    $('planeName').textContent = pc.name;
    $('planeCountry').textContent = pc.country;
    $('planeDesc').textContent = pc.desc;
    $('planeStats').innerHTML = Object.entries(pc.stats).map(([k, v]) =>
      `<div><span>${k}</span><i>${'<b></b>'.repeat(v)}${'<em></em>'.repeat(5 - v)}</i></div>`).join('');
    $('thName').textContent = `${th.icon} ${th.name}`;
    $('thSub').textContent = th.sub;
    $('planeDots').innerHTML = PLANE_IDS.map((id) => `<i class="${id === pc.id ? 'on' : ''}"></i>`).join('');
    $('thDots').innerHTML = THEATER_IDS.map((id) => `<i class="${id === th.id ? 'on' : ''}"></i>`).join('');
  }

  toast(text, ms = 1600, cls = '') {
    const t = $('toast');
    t.textContent = text;
    t.className = `show ${cls}`;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => (t.className = ''), ms);
  }

  updateHud() {
    const p = this.p;
    if (this.shownScore !== this.score) { $('score').textContent = String(this.score).padStart(6, '0'); this.shownScore = this.score; }
    $('bridge').textContent = this.bridgeNo;
    if (this.shownLives !== this.lives) {
      $('lives').innerHTML = '<i></i>'.repeat(Math.max(0, this.lives - 1));
      this.shownLives = this.lives;
    }
    $('needle').setAttribute('transform', `rotate(${-90 + (p.fuel / 100) * 180} 60 62)`);
    $('fuel').classList.toggle('low', p.fuel < 25);
    $('speed').textContent = Math.round(p.speed * 7.2);
    $('armor').classList.toggle('hidden', !this.pc.armor);
    $('armor').classList.toggle('broken', this.armor <= 0);
  }

  // ------------------------------------------------------------------ flow
  startGame() {
    this.audio.init();
    this.score = 0;
    this.lives = 4;
    this.nextLife = EXTRA_LIFE_EVERY;
    this.checkpointD = 0;
    this.bridgeNo = 1;
    this.world.destroyed.clear();
    this.shownScore = this.shownLives = -1;
    this.respawn();
    this.toast('DECOLAGEM! DESTRUA A PONTE', 2200);
  }

  respawn() {
    const p = this.p;
    this.clearProjectiles();
    this.fx.clear();
    this.world.clear();
    p.d = this.checkpointD > 0 ? this.checkpointD + 26 : 20;
    p.x = riverAt(p.d).c;
    p.vx = 0;
    p.speed = this.pc.baseSpeed;
    p.fuel = 100;
    this.armor = this.pc.armor;
    this.smokeT = 0;
    this.camX = p.x;
    this.bridgeNo = Math.floor(p.d / SECTION_LEN) + 1;
    this.world.spawnEnemies = true;
    this.world.safeD = p.d + 140;
    this.world.update(p.d, true);
    for (const c of this.clouds) this.resetCloud(c, true);
    if (this.th.night) for (const g of this.searchlights) this.placeSearchlight(g, true);
    this.plane.visible = true;
    this.state = 'playing';
    this.invuln = 1.2;
    this.showScreen(null);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.engine(false, 0);
    this.showScreen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.clock.getDelta();
    this.showScreen(null);
  }

  /** Android back button. Returns 'exit' when the app should close. */
  onBack() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else if (this.state === 'over' || this.state === 'hangar') this.toTitle();
    else if (this.state === 'title') return 'exit';
    return 'ok';
  }

  toTitle() {
    this.state = 'title';
    this.audio.engine(false, 0);
    this.world.destroyed.clear();
    this.clearProjectiles();
    this.fx.clear();
    this.world.clear();
    this.p.d = 20;
    this.p.x = 0;
    this.p.speed = this.pc.baseSpeed;
    this.world.safeD = 120;
    this.world.update(this.p.d, true);
    this.plane.visible = true;
    $('hiscore').textContent = this.hiscore;
    this.showScreen('title');
  }

  /** Hits that armour can absorb (shells, boats, fighters). Returns true if the plane survived. */
  takeHit(reason) {
    if (this.armor > 0) {
      this.armor--;
      this.invuln = 1.2;
      this.fx.explosion(this.plane.position.clone(), 0.6);
      this.audio.explosion(false);
      if (navigator.vibrate) navigator.vibrate(60);
      this.toast('BLINDAGEM ATINGIDA!', 1500, 'bad');
      return true;
    }
    this.crash(reason);
    return false;
  }

  crash(reason) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.dieT = 2.4;
    this.plane.visible = false;
    const pos = this.plane.position.clone();
    this.fx.explosion(pos, 1.8, { water: true });
    this.fx.later(0.25, () => this.fx.explosion(pos.clone().add(new THREE.Vector3(1.5, 0.5, -2)), 1.1));
    this.audio.explosion(true);
    this.audio.engine(false, 0);
    if (navigator.vibrate) navigator.vibrate([80, 40, 160]);
    this.lives--;
    this.toast(reason, 2000, 'bad');
  }

  gameOver() {
    this.state = 'over';
    const rec = this.score > this.hiscore;
    if (rec) {
      this.hiscore = this.score;
      save('rs_hiscore', String(this.score));
    }
    $('finalScore').textContent = this.score;
    $('finalBridges').textContent = this.bridgeNo - 1;
    $('finalHi').textContent = this.hiscore;
    $('finalInfo').textContent = `${this.pc.name} · ${this.th.name}`;
    $('newRecord').classList.toggle('hidden', !rec);
    this.showScreen('over');
  }

  addScore(n) {
    this.score += n;
    if (this.score >= this.nextLife) {
      this.nextLife += EXTRA_LIFE_EVERY;
      this.lives++;
      this.audio.bonus();
      this.toast('VIDA EXTRA!', 1500, 'good');
    }
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    if (this.state !== 'paused') this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.adaptQuality(dt);
  }

  adaptQuality(dt) {
    const pf = this.perf;
    if (pf.level >= 2 || this.state !== 'playing') return;
    pf.t += dt;
    pf.frames++;
    if (pf.t > 3) {
      const fps = pf.frames / pf.t;
      pf.t = pf.frames = 0;
      if (fps < 42) {
        pf.level++;
        this.pixelRatio = Math.max(1, this.pixelRatio * 0.75);
        this.renderer.setPixelRatio(this.pixelRatio);
        if (pf.level === 2) this.sun.shadow.mapSize.set(512, 512);
        this.resize();
      }
    }
  }

  update(dt) {
    this.time += dt;
    const p = this.p;
    const st = this.state;

    if (st === 'playing') this.controls(dt);
    else if (st === 'title' || st === 'hangar') this.autopilot(dt);
    else if (st === 'dying') {
      p.speed = Math.max(0, p.speed - 60 * dt);
      this.dieT -= dt;
      if (this.dieT <= 0) this.lives > 0 ? this.respawn() : this.gameOver();
    }
    if (st !== 'over') {
      p.d += p.speed * dt;
      p.x += p.vx * dt;
    }

    this.world.update(p.d);
    this.updateEntities(dt);
    this.updateBullets(dt);
    this.updateShells(dt);
    if (st === 'playing') this.collisions(dt);
    this.fx.update(dt);
    this.updateAmbience(dt);
    this.updateVisuals(dt);
    if (st === 'playing' || st === 'dying' || st === 'paused') this.updateHud();
  }

  controls(dt) {
    const p = this.p, inp = this.input, pc = this.pc;
    const throttle = inp.y;
    const sectionBoost = Math.min(10, Math.floor(p.d / SECTION_LEN) * 1.2);
    const target = throttle >= 0 ? lerp(pc.baseSpeed, pc.maxSpeed, throttle) : lerp(pc.baseSpeed, pc.minSpeed, -throttle);
    p.speed = lerp(p.speed, target + sectionBoost, Math.min(1, dt * 2.2));
    p.vx = lerp(p.vx, inp.x * pc.lat, Math.min(1, dt * 7));

    p.fireCd -= dt;
    if (inp.fire && p.fireCd <= 0) this.fire();

    p.fuel -= pc.drain * dt * (0.8 + 0.4 * (p.speed - pc.minSpeed) / (pc.maxSpeed - pc.minSpeed));
    if (p.fuel < 25) {
      this.alarmT = (this.alarmT || 0) - dt;
      if (this.alarmT <= 0) { this.audio.alarm(); this.alarmT = 0.55; }
    }
    if (p.fuel <= 0) { p.fuel = 0; this.crash('SEM COMBUSTÍVEL!'); }
    this.invuln = Math.max(0, this.invuln - dt);
    this.audio.engine(true, (p.speed - pc.minSpeed) / (pc.maxSpeed - pc.minSpeed));

    // damaged plane trails smoke
    if (pc.armor && this.armor <= 0) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.06;
        this.fx.emit({
          tex: this.tex.smoke, pos: this.plane.position.clone().add(new THREE.Vector3(0, 0.3, 1.5)),
          vel: new THREE.Vector3(0, 1.5, p.speed * 0.6), life: 1.2, s0: 1, s1: 4, color: 0x2a2826, alpha: 0.6,
        });
      }
    }
  }

  autopilot(dt) {
    const p = this.p;
    const rv = riverAt(p.d + 45);
    let tx = rv.c;
    if (rv.ih > 0) tx = rv.c + Math.sign(p.x - rv.c || 1) * (rv.ih + rv.h) / 2;
    p.vx = lerp(p.vx, clamp((tx - p.x) * 1.6, -this.pc.lat, this.pc.lat), Math.min(1, dt * 3));
    p.speed = this.pc.baseSpeed;
    p.fireCd -= dt;
    const br = this.world.bridges.find((b) => b.intact && b.d > p.d && b.d - p.d < 160);
    if (br && p.fireCd <= 0) this.fire(true);
    if (br && br.d - p.d < 6) this.world.ruinBridge(br);
  }

  fire(silent = false) {
    const p = this.p, pc = this.pc;
    p.fireCd = pc.fireRate;
    const sides = pc.salvo > 1 ? [-1, 1] : [(p.gun = -p.gun)];
    for (const side of sides) {
      let m = this.bulletPool.pop();
      if (!m) { m = new THREE.Mesh(this.tracerGeo, this.tracerMat); this.scene.add(m); }
      m.visible = true;
      const x = p.x + side * pc.spread;
      this.bullets.push({ m, x, d: p.d + 1.5, y: FLY_Y - 0.15, life: 0.95 });
      this.fx.muzzle(new THREE.Vector3(x, FLY_Y - 0.15, -(p.d + 2.2)));
    }
    if (!silent) this.audio.gun();
  }

  clearProjectiles() {
    for (const b of this.bullets) { b.m.visible = false; this.bulletPool.push(b.m); }
    this.bullets.length = 0;
    for (const s of this.shells) this.scene.remove(s.m);
    this.shells.length = 0;
  }

  // ------------------------------------------------------------------ entities
  updateEntities(dt) {
    const p = this.p;
    const demo = this.state === 'title' || this.state === 'hangar';
    for (const e of this.world.entities) {
      if (!e.alive) continue;
      const ahead = e.d - p.d;
      if (e.type === 'boat') {
        e.bob += dt;
        e.obj.position.y = Math.sin(e.bob * 2) * 0.08;
        e.obj.rotation.z = Math.sin(e.bob * 1.6) * 0.03;
        if (e.mover && !e.moving && ahead < 140) e.moving = true;
        if (e.moving) {
          const nx = e.x + e.dir * e.speed * dt;
          if (!isWater(nx + e.dir * 4.5, e.d)) {
            e.dir = -e.dir;
            e.obj.rotation.y = e.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
          } else e.x = nx;
          e.obj.position.x = e.x;
          if (Math.random() < dt * 12) this.fx.splash(new THREE.Vector3(e.x - e.dir * 4, 0.3, -e.d));
        }
      } else if (e.type === 'jet') {
        // only launch when there is room for a fair crossing (not right after a respawn)
        if (!e.active && !e.skip && ahead < e.trigger && !demo) {
          if (ahead > 200) e.active = true;
          else e.skip = true;
        }
        if (e.active) {
          e.x += e.dir * e.speed * dt;
          e.obj.position.x = e.x;
          e.obj.rotation.z = Math.sin(this.time * 2 + e.d) * 0.15;
          const prop = e.obj.getObjectByName('prop');
          if (prop) prop.rotation.z += dt * 50;
          if (Math.abs(e.x) > 230) { e.alive = false; this.scene.remove(e.obj); }
        }
      } else if (e.type === 'tank') {
        const dx = p.x - e.x, dz = -(p.d - e.d);
        const yaw = Math.atan2(-dx, -dz) - e.obj.rotation.y;
        e.turret.rotation.y = yaw;
        if (this.state === 'playing' && e.armed && ahead > 35 && ahead < 170) {
          e.cd -= dt;
          if (e.cd <= 0) { e.cd = 2.6 + Math.random() * 1.8; this.tankFire(e); }
        }
      } else if (e.type === 'fuel') {
        e.obj.position.y = Math.sin(this.time * 1.5 + e.d) * 0.06;
        if (e.sign) e.sign.visible = ahead > 4;
      }
    }
  }

  tankFire(e) {
    const p = this.p;
    const SPEED = 75;
    const from = new THREE.Vector3(e.x, e.y + 0.5, e.d);
    const t = Math.hypot(p.x - e.x, p.d - e.d) / SPEED;
    const tx = p.x + p.vx * t * 0.7, td = p.d + p.speed * t;
    const dir = new THREE.Vector3(tx - from.x, FLY_Y - from.y, td - from.z).normalize().multiplyScalar(SPEED);
    const m = new THREE.Mesh(this.shellGeo, this.shellMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: 0xff8840, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(2.4);
    m.add(glow);
    this.scene.add(m);
    this.shells.push({ m, pos: from, vel: dir, life: 3 });
    this.fx.flak(new THREE.Vector3(e.x, e.y + 0.5, -e.d));
    this.audio.shellFire();
  }

  updateShells(dt) {
    const p = this.p;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.pos.addScaledVector(s.vel, dt);
      s.life -= dt;
      s.m.position.set(s.pos.x, s.pos.y, -s.pos.z);
      let dead = s.life <= 0;
      if (this.state === 'playing' && !this.invuln &&
          Math.abs(s.pos.x - p.x) < 2.2 && Math.abs(s.pos.z - p.d) < 2.4 && Math.abs(s.pos.y - FLY_Y) < 1.6) {
        dead = true;
        this.takeHit('ABATIDO PELA ARTILHARIA!');
      }
      if (dead) { this.scene.remove(s.m); s.m.children[0].material.dispose(); this.shells.splice(i, 1); }
    }
  }

  updateBullets(dt) {
    const p = this.p;
    const v = BULLET_SPEED + p.speed;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const d0 = b.d;
      b.d += v * dt;
      b.life -= dt;
      let hit = b.life <= 0;
      if (!hit) {
        for (const br of this.world.bridges) {
          if (br.intact && d0 <= br.d + 4 && b.d >= br.d - 4 && Math.abs(b.x - br.c) < br.half) {
            this.destroyBridge(br);
            hit = true;
            break;
          }
        }
      }
      if (!hit) {
        for (const e of this.world.entities) {
          if (!e.alive) continue;
          if (Math.abs(b.x - e.x) < e.rx + 0.4 && b.d + 1.7 >= e.d - e.rd && d0 - 1.7 <= e.d + e.rd) {
            this.killEntity(e);
            hit = true;
            break;
          }
        }
      }
      if (!hit && terrainHeight(b.x, b.d) > b.y) {
        hit = true;
        this.fx.dust(new THREE.Vector3(b.x, b.y, -b.d));
      }
      if (hit) {
        b.m.visible = false;
        this.bulletPool.push(b.m);
        this.bullets.splice(i, 1);
      } else b.m.position.set(b.x, b.y, -b.d);
    }
  }

  killEntity(e, byCrash = false) {
    e.alive = false;
    this.scene.remove(e.obj);
    const pos = new THREE.Vector3(e.x, e.y, -e.d);
    const water = e.type === 'boat' || e.type === 'fuel';
    this.fx.explosion(pos, e.type === 'fuel' ? 1.4 : e.type === 'jet' ? 1.1 : 1, { water });
    this.audio.explosion(e.type === 'fuel');
    if (!byCrash && this.state === 'playing') this.addScore(e.points);
  }

  destroyBridge(br) {
    const demo = this.state !== 'playing';
    this.world.ruinBridge(br);
    for (let k = 0; k < 5; k++) {
      const pos = new THREE.Vector3(br.c - br.half + (br.half * 2 * (k + 0.5)) / 5, 4.5, -br.d);
      this.fx.later(k * 0.12, () => this.fx.explosion(pos, 1.5, { water: true }));
    }
    this.audio.explosion(true);
    if (demo) return;
    this.world.destroyed.add(br.s);
    this.checkpointD = br.d;
    this.bridgeNo = br.s + 1;
    this.addScore(500);
    if (this.pc.armor && this.armor < this.pc.armor) {
      this.armor = this.pc.armor;
      this.toast(`PONTE ${br.s} DESTRUÍDA +500 · BLINDAGEM REPARADA`, 2000, 'good');
    } else this.toast(`PONTE ${br.s} DESTRUÍDA  +500`, 1800, 'good');
  }

  collisions(dt) {
    const p = this.p;
    if (!isWater(p.x, p.d + 1.8) || !isWater(p.x - 2.0, p.d) || !isWater(p.x + 2.0, p.d)) {
      this.crash('BATEU NA MARGEM!');
      return;
    }
    for (const br of this.world.bridges) {
      if (br.intact && Math.abs(p.d - br.d) < 4.3) { this.crash('BATEU NA PONTE!'); return; }
    }
    let refuel = false;
    for (const e of this.world.entities) {
      if (!e.alive) continue;
      if (Math.abs(p.x - e.x) < e.rx + 2.0 && Math.abs(p.d - e.d) < e.rd + 1.8) {
        if (e.type === 'fuel') refuel = true;
        else if ((e.type === 'boat' || e.type === 'jet') && !this.invuln) {
          this.killEntity(e, true);
          if (!this.takeHit(e.type === 'jet' ? `COLISÃO COM ${this.th.fighter.name.toUpperCase()}!` : 'COLISÃO COM LANCHA!')) return;
        }
      }
    }
    if (refuel && p.fuel < 100) {
      p.fuel = Math.min(100, p.fuel + 30 * dt);
      this.refuelT = (this.refuelT || 0) - dt;
      if (this.refuelT <= 0) { this.audio.refuel(p.fuel); this.refuelT = 0.1; }
    }
    $('refuel').classList.toggle('show', refuel && p.fuel < 100);
  }

  // ------------------------------------------------------------------ visuals
  updateAmbience(dt) {
    const p = this.p, th = this.th;
    const cam = this.camera.position;
    for (const c of this.clouds) {
      if (c.position.z > cam.z - 4) this.resetCloud(c);
      const dist = cam.distanceTo(c.position);
      c.material.opacity = c.userData.alpha * clamp((dist - 18) / 40, 0, 1);
    }
    // distant flak bursts, purely atmospheric (more of them at night)
    this.flakT = (this.flakT ?? 2) - dt;
    if (this.flakT <= 0 && this.state !== 'over') {
      this.flakT = th.flakEvery * (0.4 + Math.random());
      const pos = new THREE.Vector3((Math.random() * 2 - 1) * 70, 14 + Math.random() * 10, -(p.d + 80 + Math.random() * 200));
      this.fx.flak(pos);
      if (this.state === 'playing') this.audio.flak();
    }
    if (th.snow) {
      const a = this.snow.geometry.attributes.position, arr = a.array;
      const fall = 7 * dt, drift = Math.sin(this.time * 0.7) * 2 * dt;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= fall * (0.7 + ((i * 7) % 10) * 0.06);
        arr[i] += drift;
        if (arr[i + 1] < 0) arr[i + 1] += 40;
      }
      a.needsUpdate = true;
      // the snow box travels with the camera; wrap flakes that fall behind
      this.snow.position.set(this.camX, 0, -p.d);
    }
    if (th.night) {
      for (const g of this.searchlights) {
        if (g.position.z > cam.z + 10) this.placeSearchlight(g, false);
        const u = g.userData;
        g.rotation.set(-0.35 + Math.sin(this.time * u.speed * 0.7 + u.phase) * 0.25, 0, u.side * 0.25 + Math.sin(this.time * u.speed + u.phase) * 0.6);
      }
    }
  }

  updateVisuals(dt) {
    const p = this.p, k = this.camK, pc = this.pc;
    const pl = this.plane;
    const vn = p.vx / pc.lat;
    pl.position.set(p.x, FLY_Y + Math.sin(this.time * 2.1) * 0.07, -p.d);
    pl.rotation.z = lerp(pl.rotation.z, -vn * 0.85, Math.min(1, dt * 6));
    pl.rotation.y = lerp(pl.rotation.y, -vn * 0.14, Math.min(1, dt * 6));
    pl.rotation.x = lerp(pl.rotation.x, (p.speed - pc.baseSpeed) * 0.002, Math.min(1, dt * 3));
    if (this.prop) this.prop.rotation.z += dt * (40 + p.speed * 0.5);
    if (this.invuln > 0 && this.state === 'playing') pl.visible = Math.floor(this.time * 12) % 2 === 0;
    else if (this.state === 'playing' || this.state === 'title' || this.state === 'hangar') pl.visible = true;
    if (this.th.night) {
      const blink = Math.floor(this.time * 1.5) % 2 === 0;
      for (const l of this.navLights) l.material.opacity = blink ? 1 : 0.35;
    }

    this.camX = lerp(this.camX, p.x * 0.82, Math.min(1, dt * 3.5));
    const sh = this.fx.shake;
    const cam = this.camera;
    if (this.state === 'hangar') {
      // show-room orbit around the selected plane, plane in the upper half of the screen
      const a = this.time * 0.35;
      const r = this.landscape ? 8 + 2 * k : 10 + 4 * k;
      cam.position.set(p.x + Math.sin(a) * r, FLY_Y + 3 + k * 1.5, -p.d + Math.cos(a) * r);
      cam.lookAt(p.x, FLY_Y - (this.landscape ? 0.6 : 2.6 + k * 1.6), -p.d);
      this.camX = p.x;
      // landscape: the hangar card sits on the right, so shift the picture to put the plane on the left
      const w = window.innerWidth, h = window.innerHeight;
      if (this.landscape) cam.setViewOffset(w, h, w * 0.24, 0, w, h);
      else if (cam.view) cam.clearViewOffset();
    } else {
      if (cam.view && cam.view.enabled) cam.clearViewOffset();
      cam.position.set(
        this.camX + (Math.random() - 0.5) * sh,
        FLY_Y + 15 * k + (Math.random() - 0.5) * sh,
        -p.d + 15 * k,
      );
      cam.lookAt(this.camX * 0.97, 0, -p.d - (this.landscape ? 14.5 : 16) * k);
      cam.rotation.z += -vn * 0.03;
    }
    const fov = this.baseFov + clamp((p.speed - pc.baseSpeed) * 0.12, -4, 5);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 3)); cam.updateProjectionMatrix(); }

    this.sky.position.copy(cam.position);
    this.water.position.set(this.camX, 0, -p.d - 380);
    const wn = this.tex.waterNormal;
    wn.offset.set(this.water.position.x / 18 + this.time * 0.004, -this.water.position.z / 18 - this.time * 0.04);

    const sd = this.th.sunDir;
    this.sun.position.set(p.x + sd[0], sd[1], -p.d + sd[2]);
    this.sun.target.position.set(p.x, 0, -p.d - 10);
  }
}
