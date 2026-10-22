// Streams terrain chunks, bridges and enemies in front of the player and
// removes them behind. Everything is seeded per chunk, so after a crash the
// same stretch of river comes back identical (like the original game).
import { CHUNK, buildChunk } from './terrain.js';
import { SECTION_LEN, riverAt, edgeDist, heightFromEdge, FLY_Y } from './river.js';
import { rngFor } from './util.js';

export const VIEW_AHEAD = 560;
const VIEW_BEHIND = 90;

export class World {
  constructor(game) {
    this.g = game;
    this.scene = game.scene;
    this.models = game.models;
    this.chunks = new Map();
    this.entities = [];
    this.bridges = [];
    this.destroyed = new Set();
    this.safeD = 0;
    this.spawnEnemies = true;
  }

  clear() {
    for (const i of [...this.chunks.keys()]) this.removeChunk(i);
  }

  update(pd, all = false) {
    const a = Math.max(0, Math.floor((pd - VIEW_BEHIND) / CHUNK));
    const b = Math.floor((pd + VIEW_AHEAD) / CHUNK);
    for (const i of [...this.chunks.keys()]) if (i < a) this.removeChunk(i);
    let budget = all ? 99 : 1;
    for (let i = a; i <= b && budget > 0; i++) {
      if (!this.chunks.has(i)) { this.addChunk(i); budget--; }
    }
  }

  addChunk(i) {
    const terrain = buildChunk(i);
    this.scene.add(terrain);
    this.chunks.set(i, terrain);
    const d0 = i * CHUNK;

    const s = Math.ceil(d0 / SECTION_LEN);
    const bd = s * SECTION_LEN;
    if (s >= 1 && bd < d0 + CHUNK) this.addBridge(i, s, bd);

    if (this.spawnEnemies) this.spawnChunk(i, d0);
  }

  removeChunk(i) {
    const t = this.chunks.get(i);
    if (!t) return;
    this.scene.remove(t);
    t.userData.dispose();
    this.chunks.delete(i);
    this.entities = this.entities.filter((e) => {
      if (e.chunk !== i) return true;
      this.scene.remove(e.obj);
      return false;
    });
    this.bridges = this.bridges.filter((b) => {
      if (b.chunk !== i) return true;
      this.scene.remove(b.obj);
      return false;
    });
  }

  addBridge(chunk, s, d) {
    const rv = riverAt(d);
    const span = rv.h * 2 + 14;
    const intact = !this.destroyed.has(s);
    const obj = intact ? this.models.bridge(span) : this.models.bridgeRuin(span);
    obj.position.set(rv.c, 0, -d);
    this.scene.add(obj);
    this.bridges.push({ s, d, c: rv.c, half: span / 2, intact, obj, chunk });
  }

  ruinBridge(b) {
    b.intact = false;
    this.scene.remove(b.obj);
    b.obj = this.models.bridgeRuin(b.half * 2);
    b.obj.position.set(b.c, 0, -b.d);
    this.scene.add(b.obj);
  }

  /** Picks a random x inside a water channel at distance d, keeping a margin from the banks. */
  waterX(r, d, margin) {
    const rv = riverAt(d);
    let lo, hi;
    if (rv.ih > 0) {
      const side = r() < 0.5 ? -1 : 1;
      lo = rv.c + side * rv.ih;
      hi = rv.c + side * rv.h;
      if (lo > hi) [lo, hi] = [hi, lo];
    } else {
      lo = rv.c - rv.h;
      hi = rv.c + rv.h;
    }
    lo += margin;
    hi -= margin;
    if (hi <= lo) return null;
    return lo + r() * (hi - lo);
  }

  spawnChunk(i, d0) {
    const r = rngFor(i, 11);
    const slots = 4;
    for (let k = 0; k < slots; k++) {
      const d = d0 + ((k + 0.15 + r() * 0.7) * CHUNK) / slots;
      const s = Math.floor(d / SECTION_LEN);
      const local = d - s * SECTION_LEN;
      const diff = Math.min(1, s / 10);
      const roll = r();
      if (d < this.safeD || local < 70 || local > SECTION_LEN - 60) continue;
      const pFuel = 0.17 - diff * 0.05;
      const pBoat = pFuel + 0.3 + diff * 0.15;
      const pJet = pBoat + 0.05 + diff * 0.12;
      const pTank = pJet + 0.12;
      if (roll < pFuel) this.addFuel(i, r, d);
      else if (roll < pBoat) this.addBoat(i, r, d, diff);
      else if (roll < pJet && s >= 1) this.addJet(i, r, d, diff);
      else if (roll < pTank) this.addTank(i, r, d, s);
    }
  }

  push(e) {
    this.scene.add(e.obj);
    this.entities.push(e);
    return e;
  }

  addFuel(chunk, r, d) {
    const x = this.waterX(r, d, 4);
    if (x === null) return;
    const obj = this.models.barge();
    obj.position.set(x, 0, -d);
    this.push({ type: 'fuel', obj, x, d, y: 1, rx: 2.3, rd: 4.6, points: 80, chunk, alive: true, sign: obj.children.find((o) => o.isSprite) });
  }

  addBoat(chunk, r, d, diff) {
    const x = this.waterX(r, d, 5);
    if (x === null) return;
    const obj = this.models.boat();
    const dir = r() < 0.5 ? -1 : 1;
    obj.position.set(x, 0, -d);
    obj.rotation.y = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.push({
      type: 'boat', obj, x, d, y: 1.5, rx: 4.6, rd: 1.5, points: 30, chunk, alive: true,
      dir, mover: r() < 0.3 + diff * 0.55, moving: false, speed: 7 + r() * 6 + diff * 8, bob: r() * 6,
    });
  }

  addJet(chunk, r, d, diff) {
    const dir = r() < 0.5 ? -1 : 1;
    const obj = this.models.bf109();
    const x = -dir * 170;
    obj.position.set(x, FLY_Y, -d);
    obj.rotation.set(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
    this.push({
      type: 'jet', obj, x, d, y: FLY_Y, rx: 2.8, rd: 3.0, points: 100, chunk, alive: true,
      dir, active: false, speed: 42 + diff * 25 + r() * 10, trigger: 250 + r() * 110,
    });
  }

  addTank(chunk, r, d, s) {
    const rv = riverAt(d);
    const side = r() < 0.5 ? -1 : 1;
    const x = rv.c + side * (rv.h + 5 + r() * 10);
    const e = edgeDist(x, d);
    if (e < 3) return;
    const obj = this.models.tank();
    const y = heightFromEdge(x, d, e) - 0.2;
    obj.position.set(x, y, -d);
    obj.rotation.y = r() * Math.PI * 2;
    this.push({
      type: 'tank', obj, x, d, y: y + 2, rx: 2.4, rd: 3.2, points: 60, chunk, alive: true,
      turret: obj.getObjectByName('turret'), armed: s >= 1, cd: 1 + r() * 2,
    });
  }
}
