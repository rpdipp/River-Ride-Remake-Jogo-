// Terrain chunks (ground mesh with vertex colours) + scenery (trees, poplars, houses, church).
import * as THREE from 'three';
import { edgeDist, heightFromEdge, riverAt, nearestBridgeD, SECTION_LEN } from './river.js';
import { fbm, hash2, vnoise, rngFor, smoothstep } from './util.js';

export const CHUNK = 100;
const DSTEP = 4;
const NZ = CHUNK / DSTEP + 1;
const XS = [];
for (let x = -300; x < -110; x += 10) XS.push(x);
for (let x = -110; x < 110; x += 2.5) XS.push(x);
for (let x = 110; x <= 300; x += 10) XS.push(x);

const C = (h) => new THREE.Color(h);
let FIELDS, HEDGE, SAND, BED, MUD, ROAD;
let T; // current theatre (see config.js)
const tmp = new THREE.Color();

/** Switch colours/scenery style. Chunks built afterwards use the new theatre. */
export function setTerrainTheme(theme) {
  T = theme;
  const g = theme.ground;
  FIELDS = g.fields.map(C);
  HEDGE = C(g.hedge);
  SAND = C(g.sand);
  BED = C(g.bed);
  MUD = C(g.mud);
  ROAD = C(g.road);
  const S = shared();
  S.mats.churchWall.color.set(theme.church.wall);
  S.mats.churchRoof.color.set(theme.church.roof);
  // lit windows at night
  S.mats.wall.emissive.set(theme.night ? 0x3a2408 : 0x000000);
}

function groundColor(x, d, e, out) {
  if (e < 0) return out.copy(SAND).lerp(BED, smoothstep(0, 6, -e));
  const dd = Math.abs(d - nearestBridgeD(d));
  if (dd < 3.3) return out.copy(ROAD);
  if (e < 2.6) return out.copy(SAND).lerp(MUD, vnoise(x * 0.3, d * 0.3) * 0.5);
  const warp = fbm(x * 0.01, d * 0.01) * 0.7;
  const fx = x / 44 + warp, fz = d / 34 + warp * 0.6;
  const cx = Math.floor(fx), cz = Math.floor(fz);
  out.copy(FIELDS[Math.floor(hash2(cx, cz) * FIELDS.length)]);
  const ex = fx - cx, ez = fz - cz;
  if (ex < 0.06 || ez < 0.08) out.lerp(HEDGE, 0.85);
  const v = 0.86 + vnoise(x * 0.12, d * 0.12) * 0.24;
  out.multiplyScalar(v);
  if (e < 6) out.lerp(tmp.copy(SAND).multiplyScalar(0.85), (1 - (e - 2.6) / 3.4) * 0.6);
  return out;
}

const geoCache = {};
function shared() {
  if (geoCache.ready) return geoCache;
  geoCache.tree = new THREE.IcosahedronGeometry(1, 0);
  geoCache.tree.translate(0, 1, 0);
  geoCache.poplar = new THREE.ConeGeometry(1, 1, 6);
  geoCache.poplar.translate(0, 0.5, 0);
  geoCache.wall = new THREE.BoxGeometry(1, 1, 1);
  geoCache.wall.translate(0, 0.5, 0);
  const sh = new THREE.Shape();
  sh.moveTo(-0.62, 0);
  sh.lineTo(0.62, 0);
  sh.lineTo(0, 0.6);
  sh.lineTo(-0.62, 0);
  const roof = new THREE.ExtrudeGeometry(sh, { depth: 1.08, bevelEnabled: false });
  roof.translate(0, 0, -0.54);
  roof.rotateY(Math.PI / 2);
  geoCache.roof = roof;
  geoCache.spire = new THREE.ConeGeometry(0.75, 1, 4);
  geoCache.spire.rotateY(Math.PI / 4);
  geoCache.spire.translate(0, 0.5, 0);
  geoCache.pine = new THREE.ConeGeometry(1, 1, 7);
  geoCache.pine.translate(0, 0.5, 0);
  geoCache.mats = {
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 }),
    tree: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }),
    wall: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
    churchWall: new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.9 }),
    churchRoof: new THREE.MeshStandardMaterial({ color: 0x3f4648, roughness: 0.7, flatShading: true }),
  };
  geoCache.ready = true;
  return geoCache;
}

function instanced(geo, mat, list, fill) {
  if (!list.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  list.forEach((t, k) => {
    fill(o, t, c);
    o.updateMatrix();
    m.setMatrixAt(k, o.matrix);
    m.setColorAt(k, c);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildChunk(i) {
  const S = shared();
  const d0 = i * CHUNK;
  const nx = XS.length;
  const pos = new Float32Array(nx * NZ * 3);
  const col = new Float32Array(nx * NZ * 3);
  const c = new THREE.Color();
  let p = 0;
  for (let iz = 0; iz < NZ; iz++) {
    const d = d0 + iz * DSTEP;
    for (let ix = 0; ix < nx; ix++) {
      const x = XS[ix];
      const e = edgeDist(x, d);
      pos[p] = x;
      pos[p + 1] = heightFromEdge(x, d, e);
      pos[p + 2] = -d;
      groundColor(x, d, e, c);
      col[p] = c.r;
      col[p + 1] = c.g;
      col[p + 2] = c.b;
      p += 3;
    }
  }
  const idx = [];
  for (let iz = 0; iz < NZ - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix, b = a + 1, cc = a + nx, dd = cc + 1;
      idx.push(a, b, cc, b, dd, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, S.mats.ground);
  ground.receiveShadow = true;

  const group = new THREE.Group();
  group.add(ground);

  // ---- scenery
  const r = rngFor(i, 5);
  const trees = [], poplars = [], houses = [];
  const roadClear = (d) => Math.abs(d - nearestBridgeD(d)) > 9;

  for (let k = 0; k < 230; k++) {
    const x = (r() * 2 - 1) * 280;
    const d = d0 + r() * CHUNK;
    const forest = fbm(x * 0.008 + 3, d * 0.008);
    if (r() > (forest > 0.56 ? 0.95 : 0.1)) continue;
    const e = edgeDist(x, d);
    if (e < 5 || !roadClear(d)) continue;
    trees.push({ x, d, y: heightFromEdge(x, d, e), s: 1.8 + r() * 1.7, t: r() });
  }
  for (const side of [-1, 1]) {
    for (let d = d0 + 2; d < d0 + CHUNK; d += 9) {
      if (fbm(d * 0.004, side * 7.3) < 0.48 || !roadClear(d)) continue;
      const rv = riverAt(d);
      const x = rv.c + side * (rv.h + 7 + r() * 2);
      const e = edgeDist(x, d);
      if (e < 4) continue;
      poplars.push({ x, d, y: heightFromEdge(x, d, e), s: 1, t: r() });
    }
  }
  // villages around bridges, farms elsewhere
  const bd = nearestBridgeD(d0 + CHUNK / 2);
  const nearVillage = Math.abs(d0 + CHUNK / 2 - bd) < 150;
  const tries = nearVillage ? 26 : 4;
  for (let k = 0; k < tries; k++) {
    if (!nearVillage && r() > 0.5) continue;
    const d = d0 + r() * CHUNK;
    const rv = riverAt(d);
    const side = r() < 0.5 ? -1 : 1;
    const x = rv.c + side * (rv.h + 12 + r() * (nearVillage ? 70 : 160));
    const e = edgeDist(x, d);
    if (e < 9 || Math.abs(d - nearestBridgeD(d)) < 7) continue;
    const big = r();
    houses.push({ x, d, y: heightFromEdge(x, d, e) - 0.3, w: 5 + big * 4, h: 3.5 + big * 3, l: 6 + r() * 5, rot: r() < 0.5 ? 0 : Math.PI / 2, t: r() });
  }

  const tc = T.tree, conifer = tc.conifer;
  const tr = instanced(conifer ? S.pine : S.tree, S.mats.tree, trees, (o, t, c) => {
    o.position.set(t.x, t.y - 0.5, -t.d);
    if (conifer) o.scale.set(t.s * 1.3, t.s * 4.2, t.s * 1.3);
    else o.scale.set(t.s * 1.5, t.s * 1.9, t.s * 1.5);
    o.rotation.set(0, t.t * 6, 0);
    c.setHSL(tc.h + t.t * tc.hv, tc.s, tc.l + t.t * tc.lv);
  });
  const pc = T.poplar;
  const pp = instanced(conifer ? S.pine : S.poplar, S.mats.tree, poplars, (o, t, c) => {
    o.position.set(t.x, t.y - 0.5, -t.d);
    if (conifer) o.scale.set(2.6, 10 + t.t * 4, 2.6);
    else o.scale.set(1.5, 11 + t.t * 3, 1.5);
    o.rotation.set(0, 0, 0);
    c.setHSL(pc.h, pc.s, pc.l + t.t * 0.06);
  });
  const wc = T.wall, rc = T.roof;
  const wl = instanced(S.wall, S.mats.wall, houses, (o, t, c) => {
    o.position.set(t.x, t.y, -t.d);
    o.scale.set(t.w, t.h, t.l);
    o.rotation.set(0, t.rot, 0);
    c.setHSL(wc.h, wc.s, wc.l + t.t * wc.lv);
  });
  const rf = instanced(S.roof, S.mats.roof, houses, (o, t, c) => {
    o.position.set(t.x, t.y + t.h, -t.d);
    o.scale.set(t.l, t.w * 0.9, t.w);
    o.rotation.set(0, t.rot + Math.PI / 2, 0);
    c.setHSL(rc.h + t.t * rc.hv, rc.s, rc.l + t.t * rc.lv);
  });
  for (const m of [tr, pp, wl, rf]) if (m) group.add(m);

  // a village church next to each bridge
  const s = Math.round((d0 + CHUNK / 2) / SECTION_LEN);
  const churchD = s * SECTION_LEN + 34;
  if (s >= 1 && churchD >= d0 && churchD < d0 + CHUNK) {
    const rv = riverAt(churchD);
    const x = rv.c + (s % 2 ? 1 : -1) * (rv.h + 30);
    const y = heightFromEdge(x, churchD, edgeDist(x, churchD)) - 0.3;
    const ch = new THREE.Group();
    const nave = new THREE.Mesh(S.wall, S.mats.wall);
    nave.scale.set(8, 7, 16);
    const roof = new THREE.Mesh(S.roof, S.mats.roof);
    roof.scale.set(16, 8 * 0.9, 8);
    roof.position.y = 7;
    roof.rotation.y = Math.PI / 2;
    const tower = new THREE.Mesh(S.wall, S.mats.wall);
    tower.scale.set(4.5, 17, 4.5);
    tower.position.z = 9;
    const spire = new THREE.Mesh(S.spire, S.mats.roof);
    spire.scale.set(4.4, 10, 4.4);
    spire.position.set(0, 17, 9);
    nave.material = tower.material = S.mats.churchWall;
    roof.material = spire.material = S.mats.churchRoof;
    ch.add(nave, roof, tower, spire);
    ch.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    ch.position.set(x, y, -churchD);
    group.add(ch);
  }

  group.userData.dispose = () => {
    geo.dispose();
    for (const m of [tr, pp, wl, rf]) if (m) m.dispose();
  };
  return group;
}

