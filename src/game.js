import * as THREE from 'three';
import { makeTextures } from './textures.js';
import { createModels } from './models.js';
import { World, VIEW_AHEAD } from './world.js';
import { Effects } from './effects.js';
import { GameAudio } from './audio.js';
import { Input } from './input.js';
import { riverAt, isWater, terrainHeight, SECTION_LEN, FLY_Y } from './river.js';
import { clamp, lerp } from './util.js';

const BASE_SPEED = 55, MIN_SPEED = 30, MAX_SPEED = 92;
const LAT_SPEED = 46;
const BULLET_SPEED = 300;
const FIRE_RATE = 0.085;
const FUEL_DRAIN = 2.6;
const EXTRA_LIFE_EVERY = 10000;
const $ = (id) => document.getElementById(id);

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

    this.plane = this.models.p51();
    this.prop = this.plane.getObjectByName('prop');
    this.scene.add(this.plane);

    this.p = { x: 0, d: 20, vx: 0, speed: BASE_SPEED, fuel: 100, fireCd: 0, gun: 1 };
    this.bullets = [];
    this.shells = [];
    this.bulletPool = [];
    this.camX = 0;
    this.time = 0;
    this.state = 'title';
    this.hiscore = 0;
    try { this.hiscore = +localStorage.getItem('rs_hiscore') || 0; } catch { /* ignore */ }

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
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x4a7cc2) }, bottom: { value: this.horizon.clone() }, sun: { value: new THREE.Vector3(-0.3, 0.45, 0.85).normalize() } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sun; varying vec3 vP;
        void main(){ float h = clamp(vP.y*1.6+0.05,0.0,1.0); vec3 c = mix(bottom, top, pow(h,0.7));
        float s = pow(max(dot(vP, sun),0.0), 40.0); c += vec3(1.0,0.85,0.6)*s*0.8; gl_FragColor = vec4(c,1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
    s.add(this.sky);

    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x4b5a35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    envScene.add(ground);
    const pm = new THREE.PMREMGenerator(this.renderer);
    s.environment = pm.fromScene(envScene, 0.02).texture;
    s.environmentIntensity = 0.55;

    s.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a5232, 0.9));
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

    // Tracer geometry / material
    this.tracerGeo = new THREE.BoxGeometry(0.24, 0.24, 4.5);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffa630, fog: false });
    this.shellGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xff7a30 });
  }

  resetCloud(c, initial = false) {
    const pd = this.p ? this.p.d : 0;
    const d = pd + (initial ? Math.random() * 520 : 420 + Math.random() * 160);
    c.userData.d = d;
    c.position.set((Math.random() * 2 - 1) * 140, 12 + Math.random() * 7, -d);
    const sz = 40 + Math.random() * 45;
    c.scale.set(sz, sz * 0.6, 1);
    c.userData.alpha = 0.22 + Math.random() * 0.25;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const t = clamp((aspect - 0.45) / (1.6 - 0.45), 0, 1);
    this.camK = lerp(1.85, 1.15, t);
    this.baseFov = lerp(72, 55, t);
    this.camera.aspect = aspect;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ UI
  bindUI() {
    const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    tap('btnStart', () => this.startGame());
    tap('btnAgain', () => this.startGame());
    tap('btnPause', () => this.pause());
    tap('btnResume', () => this.resume());
    tap('btnQuit', () => this.toTitle());
    tap('btnMenu', () => this.toTitle());
    for (const id of ['btnSound', 'btnSound2']) tap(id, () => { this.audio.setMuted(!this.audio.muted); this.syncSoundBtn(); });
    this.syncSoundBtn();
    $('hiscore').textContent = this.hiscore;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP' || e.code === 'Escape') this.state === 'playing' ? this.pause() : this.state === 'paused' && this.resume();
      if (e.code === 'Enter' && (this.state === 'title' || this.state === 'over')) this.startGame();
    });
  }

  syncSoundBtn() {
    for (const id of ['btnSound', 'btnSound2']) $(id).textContent = this.audio.muted ? 'SOM: DESLIGADO' : 'SOM: LIGADO';
  }

  showScreen(name) {
    for (const id of ['title', 'pause', 'over']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', !(name === null || name === 'pause'));
    this.input.enabled = name === null;
    if (name !== null) this.input.reset();
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
    p.speed = BASE_SPEED;
    p.fuel = 100;
    this.camX = p.x;
    this.bridgeNo = Math.floor(p.d / SECTION_LEN) + 1;
    this.world.spawnEnemies = true;
    this.world.safeD = p.d + 140;
    this.world.update(p.d, true);
    for (const c of this.clouds) this.resetCloud(c, true);
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
    else if (this.state === 'over') this.toTitle();
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
    this.p.speed = BASE_SPEED;
    this.world.safeD = 120;
    this.world.update(this.p.d, true);
    this.plane.visible = true;
    $('hiscore').textContent = this.hiscore;
    this.showScreen('title');
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
      try { localStorage.setItem('rs_hiscore', String(this.score)); } catch { /* ignore */ }
    }
    $('finalScore').textContent = this.score;
    $('finalBridges').textContent = this.bridgeNo - 1;
    $('finalHi').textContent = this.hiscore;
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
    else if (st === 'title') this.autopilot(dt);
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
    const p = this.p, inp = this.input;
    const throttle = inp.y;
    const sectionBoost = Math.min(10, Math.floor(p.d / SECTION_LEN) * 1.2);
    const target = throttle >= 0 ? lerp(BASE_SPEED, MAX_SPEED, throttle) : lerp(BASE_SPEED, MIN_SPEED, -throttle);
    p.speed = lerp(p.speed, target + sectionBoost, Math.min(1, dt * 2.2));
    p.vx = lerp(p.vx, inp.x * LAT_SPEED, Math.min(1, dt * 7));

    p.fireCd -= dt;
    if (inp.fire && p.fireCd <= 0) this.fire();

    p.fuel -= FUEL_DRAIN * dt * (0.8 + 0.4 * (p.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED));
    if (p.fuel < 25) {
      this.alarmT = (this.alarmT || 0) - dt;
      if (this.alarmT <= 0) { this.audio.alarm(); this.alarmT = 0.55; }
    }
    if (p.fuel <= 0) { p.fuel = 0; this.crash('SEM COMBUSTÍVEL!'); }
    this.invuln = Math.max(0, this.invuln - dt);
    this.audio.engine(true, (p.speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED));
  }

  autopilot(dt) {
    const p = this.p;
    const rv = riverAt(p.d + 45);
    let tx = rv.c;
    if (rv.ih > 0) tx = rv.c + Math.sign(p.x - rv.c || 1) * (rv.ih + rv.h) / 2;
    p.vx = lerp(p.vx, clamp((tx - p.x) * 1.6, -LAT_SPEED, LAT_SPEED), Math.min(1, dt * 3));
    p.speed = BASE_SPEED;
    p.fireCd -= dt;
    const br = this.world.bridges.find((b) => b.intact && b.d > p.d && b.d - p.d < 160);
    if (br && p.fireCd <= 0) this.fire(true);
    if (br && br.d - p.d < 6) this.world.ruinBridge(br);
  }

  fire(silent = false) {
    const p = this.p;
    p.fireCd = FIRE_RATE;
    p.gun = -p.gun;
    let m = this.bulletPool.pop();
    if (!m) { m = new THREE.Mesh(this.tracerGeo, this.tracerMat); this.scene.add(m); }
    m.visible = true;
    const x = p.x + p.gun * 1.5;
    this.bullets.push({ m, x, d: p.d + 1.5, y: FLY_Y - 0.15, life: 0.95 });
    this.fx.muzzle(new THREE.Vector3(x, FLY_Y - 0.15, -(p.d + 2.2)));
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
        if (!e.active && !e.skip && ahead < e.trigger && this.state !== 'title') {
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
        this.crash('ABATIDO PELA ARTILHARIA!');
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
    const title = this.state === 'title';
    this.world.ruinBridge(br);
    for (let k = 0; k < 5; k++) {
      const pos = new THREE.Vector3(br.c - br.half + (br.half * 2 * (k + 0.5)) / 5, 4.5, -br.d);
      this.fx.later(k * 0.12, () => this.fx.explosion(pos, 1.5, { water: true }));
    }
    this.audio.explosion(true);
    if (title) return;
    this.world.destroyed.add(br.s);
    this.checkpointD = br.d;
    this.bridgeNo = br.s + 1;
    this.addScore(500);
    this.toast(`PONTE ${br.s} DESTRUÍDA  +500`, 1800, 'good');
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
          this.crash(e.type === 'jet' ? 'COLISÃO COM BF 109!' : 'COLISÃO COM LANCHA!');
          return;
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
    const p = this.p;
    const camZ = this.camera.position.z;
    for (const c of this.clouds) {
      if (c.position.z > camZ - 4) this.resetCloud(c);
      const dist = this.camera.position.distanceTo(c.position);
      c.material.opacity = c.userData.alpha * clamp((dist - 18) / 40, 0, 1);
    }
    // distant flak bursts, purely atmospheric
    this.flakT = (this.flakT ?? 2) - dt;
    if (this.flakT <= 0 && this.state !== 'over') {
      this.flakT = 1.2 + Math.random() * 3;
      const pos = new THREE.Vector3((Math.random() * 2 - 1) * 70, 14 + Math.random() * 10, -(p.d + 80 + Math.random() * 200));
      this.fx.flak(pos);
      if (this.state === 'playing') this.audio.flak();
    }
  }

  updateVisuals(dt) {
    const p = this.p, k = this.camK;
    const pl = this.plane;
    const vn = p.vx / LAT_SPEED;
    pl.position.set(p.x, FLY_Y + Math.sin(this.time * 2.1) * 0.07, -p.d);
    pl.rotation.z = lerp(pl.rotation.z, -vn * 0.85, Math.min(1, dt * 6));
    pl.rotation.y = lerp(pl.rotation.y, -vn * 0.14, Math.min(1, dt * 6));
    pl.rotation.x = lerp(pl.rotation.x, (p.speed - BASE_SPEED) * 0.002, Math.min(1, dt * 3));
    if (this.prop) this.prop.rotation.z += dt * (40 + p.speed * 0.5);
    if (this.invuln > 0 && this.state === 'playing') pl.visible = Math.floor(this.time * 12) % 2 === 0;
    else if (this.state === 'playing' || this.state === 'title') pl.visible = true;

    this.camX = lerp(this.camX, p.x * 0.82, Math.min(1, dt * 3.5));
    const sh = this.fx.shake;
    const cam = this.camera;
    cam.position.set(
      this.camX + (Math.random() - 0.5) * sh,
      FLY_Y + 15 * k + (Math.random() - 0.5) * sh,
      -p.d + 15 * k,
    );
    cam.lookAt(this.camX * 0.97, 0, -p.d - 16 * k);
    cam.rotation.z += -vn * 0.03;
    const fov = this.baseFov + clamp((p.speed - BASE_SPEED) * 0.12, -4, 5);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 3)); cam.updateProjectionMatrix(); }

    this.sky.position.copy(cam.position);
    this.water.position.set(this.camX, 0, -p.d - 380);
    const wn = this.tex.waterNormal;
    wn.offset.set(this.water.position.x / 18 + this.time * 0.004, -this.water.position.z / 18 - this.time * 0.04);

    this.sun.position.set(p.x - 30, 85, -p.d + 45);
    this.sun.target.position.set(p.x, 0, -p.d - 10);
  }
}
