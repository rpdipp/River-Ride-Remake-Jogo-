// Sprite particles (fire, smoke, flak, spray), debris and explosion light.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Effects {
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;
    this.parts = [];
    this.free = [];
    this.debris = [];
    this.debrisFree = [];
    this.timers = [];
    this.shake = 0;
    this.light = new THREE.PointLight(0xffa040, 0, 90, 1.6);
    scene.add(this.light);
    this.lightI = 0;
    this.debrisGeo = new THREE.BoxGeometry(0.6, 0.35, 0.6);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 });
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  clear() {
    for (const p of this.parts) { p.s.visible = false; this.free.push(p.s); }
    this.parts.length = 0;
    for (const d of this.debris) { d.m.visible = false; this.debrisFree.push(d.m); }
    this.debris.length = 0;
    this.timers.length = 0;
    this.lightI = 0;
  }

  emit(o) {
    let s = this.free.pop();
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, map: o.tex }));
      this.scene.add(s);
    }
    const m = s.material;
    if (m.map !== o.tex) { m.map = o.tex; m.needsUpdate = true; }
    m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.color.set(o.color ?? 0xffffff);
    m.opacity = o.alpha ?? 1;
    m.rotation = Math.random() * Math.PI * 2;
    s.visible = true;
    s.position.copy(o.pos);
    s.scale.setScalar(o.s0);
    s.renderOrder = o.add ? 3 : 2;
    this.parts.push({
      s, vel: (o.vel || _v.set(0, 0, 0)).clone(), life: o.life, t: 0, s0: o.s0, s1: o.s1,
      a0: o.alpha ?? 1, drag: o.drag ?? 0, grav: o.grav ?? 0, spin: o.spin ?? 0,
    });
  }

  rnd(a) { return (Math.random() * 2 - 1) * a; }

  explosion(pos, size = 1, opts = {}) {
    const T = this.tex;
    this.light.position.copy(pos).y += 3;
    this.lightI = Math.max(this.lightI, 60 * size);
    this.shake = Math.max(this.shake, 0.6 * size);
    const n = Math.round(10 * size);
    for (let i = 0; i < n; i++) {
      this.emit({
        tex: T.fire, add: true, pos: _v.set(pos.x + this.rnd(1.5 * size), pos.y + this.rnd(1) * size, pos.z + this.rnd(1.5 * size)).clone(),
        vel: new THREE.Vector3(this.rnd(9), 2 + Math.random() * 9, this.rnd(9)).multiplyScalar(size),
        life: 0.45 + Math.random() * 0.5, s0: 2 * size, s1: (6 + Math.random() * 5) * size, drag: 2.5,
      });
    }
    for (let i = 0; i < Math.round(7 * size); i++) {
      this.emit({
        tex: T.smoke, pos: _v.set(pos.x + this.rnd(2), pos.y + 1, pos.z + this.rnd(2)).clone(),
        vel: new THREE.Vector3(this.rnd(3), 4 + Math.random() * 4, this.rnd(3)),
        life: 1.6 + Math.random() * 1.4, s0: 3 * size, s1: (10 + Math.random() * 8) * size,
        color: 0x2b2826, alpha: 0.75, drag: 0.8,
      });
    }
    if (opts.water) {
      for (let i = 0; i < Math.round(9 * size); i++) {
        this.emit({
          tex: T.smoke, pos: _v.set(pos.x + this.rnd(2), 0.3, pos.z + this.rnd(2)).clone(),
          vel: new THREE.Vector3(this.rnd(4), 10 + Math.random() * 10, this.rnd(4)),
          life: 0.9 + Math.random() * 0.5, s0: 1.5, s1: 6 * size, color: 0xe8f1f4, alpha: 0.9, grav: 22,
        });
      }
    }
    for (let i = 0; i < Math.round(8 * size); i++) {
      let m = this.debrisFree.pop();
      if (!m) { m = new THREE.Mesh(this.debrisGeo, this.debrisMat); m.castShadow = true; this.scene.add(m); }
      m.visible = true;
      m.position.copy(pos);
      m.scale.setScalar(0.5 + Math.random() * 1.2);
      this.debris.push({
        m, t: 0, life: 2.5,
        vel: new THREE.Vector3(this.rnd(14), 8 + Math.random() * 14, this.rnd(14)),
        rot: new THREE.Vector3(this.rnd(10), this.rnd(10), this.rnd(10)),
      });
    }
  }

  flak(pos) {
    this.emit({ tex: this.tex.glow, add: true, pos, life: 0.18, s0: 3, s1: 7, color: 0xffc070 });
    for (let i = 0; i < 4; i++) {
      this.emit({
        tex: this.tex.smoke, pos: _v.set(pos.x + this.rnd(1), pos.y + this.rnd(1), pos.z + this.rnd(1)).clone(),
        vel: new THREE.Vector3(this.rnd(1), 0.6, this.rnd(1)), life: 3 + Math.random(), s0: 2.5, s1: 8,
        color: 0x1c1a19, alpha: 0.8, drag: 0.5,
      });
    }
  }

  muzzle(pos) {
    this.emit({ tex: this.tex.glow, add: true, pos, life: 0.06, s0: 1.4, s1: 0.8, color: 0xffd080 });
  }

  dust(pos) {
    this.emit({
      tex: this.tex.smoke, pos, vel: new THREE.Vector3(this.rnd(2), 3, this.rnd(2)),
      life: 0.8, s0: 1, s1: 3.5, color: 0x8a7a5c, alpha: 0.7,
    });
  }

  splash(pos) {
    this.emit({
      tex: this.tex.smoke, pos, vel: new THREE.Vector3(0, 7, 0), life: 0.5, s0: 0.8, s1: 2.5,
      color: 0xeef6f8, alpha: 0.8, grav: 18,
    });
  }

  update(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        p.s.visible = false;
        this.free.push(p.s);
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.vel.y -= p.grav * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const e = 1 - (1 - k) * (1 - k);
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * e);
      p.s.material.opacity = p.a0 * Math.pow(1 - k, 1.3);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.vel.y -= 30 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      d.m.rotation.x += d.rot.x * dt;
      d.m.rotation.y += d.rot.y * dt;
      if (d.t > d.life || d.m.position.y < -2) {
        d.m.visible = false;
        this.debrisFree.push(d.m);
        this.debris.splice(i, 1);
      }
    }
    this.lightI *= Math.exp(-dt * 7);
    this.light.intensity = this.lightI * 40;
    this.shake *= Math.exp(-dt * 5);
  }
}
