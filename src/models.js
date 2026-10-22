// Procedural low/mid-poly models: P-51D Mustang, Bf 109, S-boat, fuel barge,
// Panzer, stone bridge. Built once, then cloned (geometry/material shared).
import * as THREE from 'three';
import { lerp } from './util.js';

const V2 = THREE.Vector2;
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });

function radiusAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [y0, r0] = profile[i], [y1, r1] = profile[i + 1];
    if (y >= y0 && y <= y1) return lerp(r0, r1, (y - y0) / (y1 - y0 || 1));
  }
  return 0;
}

const Y_SCALE = 1.12;

function fuselage(profile, mat) {
  const geo = new THREE.LatheGeometry(profile.map(([y, r]) => new V2(r, y)), 22);
  geo.rotateX(-Math.PI / 2);
  geo.scale(1, Y_SCALE, 1);
  return new THREE.Mesh(geo, mat);
}

/** Painted band around the fuselage between forward stations y0..y1. */
function ring(profile, y0, y1, mat) {
  const r0 = radiusAt(profile, y0) * 1.03 + 0.005;
  const r1 = radiusAt(profile, y1) * 1.03 + 0.005;
  const geo = new THREE.CylinderGeometry(r1, r0, y1 - y0, 22, 1, true);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.z = -(y0 + y1) / 2;
  m.scale.y = Y_SCALE;
  return m;
}

function wingShape(o, side) {
  const s = side;
  const sh = new THREE.Shape();
  sh.moveTo(0, o.rootLE);
  sh.lineTo(s * o.span * 0.96, o.tipLE);
  sh.quadraticCurveTo(s * o.span * (o.square ? 1.0 : 1.03), (o.tipLE + o.tipTE) / 2, s * o.span * 0.96, o.tipTE);
  sh.lineTo(0, o.rootTE);
  sh.lineTo(0, o.rootLE);
  return sh;
}

function wing(o, side, mat) {
  const geo = new THREE.ExtrudeGeometry(wingShape(o, side), {
    depth: o.thick, bevelEnabled: true, bevelThickness: o.thick * 0.35,
    bevelSize: Math.min(0.06, o.thick * 0.4), bevelSegments: 2, curveSegments: 6,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, o.thick / 2, 0);
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  g.add(m);
  g.rotation.z = side * (o.dihedral || 0);
  return g;
}

function chordAt(o, x) {
  const t = Math.min(1, Math.abs(x) / o.span);
  const le = lerp(o.rootLE, o.tipLE, t), te = lerp(o.rootTE, o.tipTE, t);
  return [le, te];
}

function decal(tex, w, h) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  return m;
}

function propeller(blades, bladeMat, tipMat, len) {
  const g = new THREE.Group();
  g.name = 'prop';
  const bg = new THREE.BoxGeometry(0.22, len, 0.05);
  bg.translate(0, len / 2 + 0.2, 0);
  const tg = new THREE.BoxGeometry(0.23, 0.22, 0.06);
  tg.translate(0, len + 0.1, 0);
  for (let i = 0; i < blades; i++) {
    const b = new THREE.Group();
    b.add(new THREE.Mesh(bg, bladeMat), new THREE.Mesh(tg, tipMat));
    b.rotation.z = (i / blades) * Math.PI * 2;
    b.children[0].rotation.y = 0.35;
    g.add(b);
  }
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(len + 0.3, 32),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
  );
  g.add(disc);
  return g;
}

function tailFin(pts, thick, mat) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(thick / 2, 0, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

function makeFighter(M, cfg) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const { profile, skin } = cfg;

  const fus = fuselage(profile, skin);
  fus.castShadow = true;
  g.add(fus);
  for (const [y0, y1, mat] of cfg.rings) g.add(ring(profile, y0, y1, mat));

  const noseY = profile[profile.length - 1][0];
  const spGeo = new THREE.ConeGeometry(cfg.spinnerR, 1.0, 18);
  spGeo.rotateX(-Math.PI / 2);
  const spinner = new THREE.Mesh(spGeo, cfg.spinnerMat);
  spinner.position.z = -(noseY + 0.45);
  g.add(spinner);
  const prop = propeller(cfg.blades, M.black, M.yellow, cfg.propLen);
  prop.position.z = -(noseY + 0.15);
  g.add(prop);

  const W = cfg.wing;
  for (const side of [-1, 1]) {
    const w = wing(W, side, skin);
    w.position.set(0, cfg.wingY, 0);
    if (cfg.stripes) {
      for (let k = 0; k < 5; k++) {
        const x = side * (W.span * 0.3 + k * 0.32 + 0.16);
        const [le, te] = chordAt(W, x);
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.32, W.thick * 1.9, te - le + 0.12), k % 2 ? M.black : M.white);
        band.position.set(x, 0, (le + te) / 2);
        w.add(band);
      }
    }
    for (const dec of cfg.wingDecals) {
      if (dec.side !== side) continue;
      const d = decal(dec.tex, dec.w, dec.h);
      d.rotation.x = -Math.PI / 2;
      const [le, te] = chordAt(W, dec.x * side);
      d.position.set(dec.x * side, W.thick * 0.85 + 0.01, (le + te) / 2);
      w.add(d);
    }
    // gun ports
    for (let k = 0; k < 3; k++) {
      const x = side * (1.6 + k * 0.35);
      const [le] = chordAt(W, x);
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 6), M.black);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(x, 0, le - 0.1);
      w.add(gun);
    }
    g.add(w);

    const stab = wing(cfg.stab, side, skin);
    stab.position.y = cfg.stabY;
    g.add(stab);
  }

  g.add(tailFin(cfg.fin, 0.1, cfg.finMat || skin));

  const canopyGeo = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const canopy = new THREE.Mesh(canopyGeo, M.glass);
  canopy.scale.set(...cfg.canopy.s);
  canopy.position.set(0, cfg.canopy.y, cfg.canopy.z);
  g.add(canopy);
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), M.pilot);
  pilot.position.set(0, cfg.canopy.y + 0.18, cfg.canopy.z - 0.1);
  g.add(pilot);

  if (cfg.scoop) {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), skin);
    sc.scale.set(0.42, 0.36, 1.55);
    sc.position.set(0, -0.68, 1.0);
    sc.castShadow = true;
    g.add(sc);
  }
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const ex = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.14), M.exhaust);
      ex.position.set(side * cfg.exhaustX, cfg.exhaustYOff, -(noseY - 0.9 - k * 0.2));
      g.add(ex);
    }
    for (const dec of cfg.sideDecals) {
      const d = decal(dec.tex, dec.w, dec.h);
      d.rotation.y = side * Math.PI / 2;
      d.position.set(side * (radiusAt(profile, -dec.z) * 1.04 + 0.02), dec.y, dec.z);
      g.add(d);
    }
  }
  g.scale.setScalar(cfg.scale);
  return root;
}

export function createModels(tex) {
  const M = {
    metal: std(0xc6cbd1, { metalness: 0.85, roughness: 0.3 }),
    black: std(0x161616, { roughness: 0.5 }),
    white: std(0xeeeeea, { roughness: 0.55 }),
    yellow: std(0xf2c230, { roughness: 0.45 }),
    red: std(0xb4241c, { roughness: 0.4, metalness: 0.2 }),
    olive: std(0x4a4f2c, { roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4dd, metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.55 }),
    pilot: std(0x3a2b1e),
    exhaust: std(0x2a1a12, { roughness: 0.9 }),
    luft: std(0x66705e, { roughness: 0.7, metalness: 0.25 }),
    luftDark: std(0x3f4a3a, { roughness: 0.7 }),
    hull: std(0x5c636b, { roughness: 0.55, metalness: 0.35 }),
    deck: std(0x7b7f80, { roughness: 0.7 }),
    wood: std(0x5a4330, { roughness: 0.95 }),
    drumRed: std(0xa3261c, { roughness: 0.5, metalness: 0.4 }),
    drumOlive: std(0x4d5530, { roughness: 0.6, metalness: 0.3 }),
    panzer: std(0xa8955c, { roughness: 0.85 }),
    track: std(0x2b2924, { roughness: 1 }),
    stone: std(0x8c877b, { roughness: 0.95, flatShading: true }),
    stoneDark: std(0x5d594f, { roughness: 1, flatShading: true }),
    road: std(0x4e4a44, { roughness: 1 }),
  };

  const p51Profile = [
    [-4.95, 0], [-4.9, 0.1], [-4.2, 0.3], [-3, 0.5], [-1.5, 0.66], [0, 0.74],
    [1.5, 0.76], [3, 0.7], [3.9, 0.6], [4.4, 0.47], [4.45, 0],
  ];
  const p51 = makeFighter(M, {
    profile: p51Profile, skin: M.metal, scale: 0.55,
    rings: [
      [3.85, 4.45, M.yellow],
      [-3.0, -2.7, M.white], [-2.7, -2.4, M.black], [-2.4, -2.1, M.white], [-2.1, -1.8, M.black], [-1.8, -1.5, M.white],
    ],
    spinnerR: 0.47, spinnerMat: M.red, blades: 4, propLen: 1.7,
    wing: { span: 5.65, rootLE: -1.9, rootTE: 0.9, tipLE: -0.95, tipTE: 0.2, thick: 0.2, dihedral: 0.09 },
    wingY: -0.42, stripes: true,
    wingDecals: [{ side: -1, x: 4.1, tex: tex.star, w: 1.5, h: 0.75 }],
    stab: { span: 2.15, rootLE: 3.55, rootTE: 4.75, tipLE: 4.05, tipTE: 4.6, thick: 0.08, dihedral: 0 },
    stabY: 0.12,
    fin: [[3.1, 0.3], [4.95, 0.25], [5.05, 1.55], [4.7, 1.95], [4.25, 1.85], [3.4, 0.75]],
    finMat: M.metal,
    canopy: { s: [0.42, 0.55, 1.1], y: 0.55, z: -0.35 },
    scoop: true, exhaustX: 0.46, exhaustYOff: 0.18,
    sideDecals: [{ tex: tex.star, w: 1.2, h: 0.6, z: 0.9, y: 0.05 }],
  });
  p51.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  const bfProfile = [
    [-4.5, 0], [-4.45, 0.08], [-3, 0.42], [-1.2, 0.58], [0.3, 0.64], [2.0, 0.62], [3.4, 0.52], [3.95, 0.43], [4.0, 0],
  ];
  const bf109 = makeFighter(M, {
    profile: bfProfile, skin: M.luft, scale: 0.55,
    rings: [[3.0, 4.0, M.yellow]],
    spinnerR: 0.42, spinnerMat: M.luftDark, blades: 3, propLen: 1.45,
    wing: { span: 4.95, rootLE: -1.6, rootTE: 0.65, tipLE: -0.95, tipTE: -0.05, thick: 0.18, dihedral: 0.1, square: true },
    wingY: -0.42, stripes: false,
    wingDecals: [
      { side: -1, x: 3.4, tex: tex.cross, w: 0.95, h: 0.95 },
      { side: 1, x: 3.4, tex: tex.cross, w: 0.95, h: 0.95 },
    ],
    stab: { span: 1.8, rootLE: 3.3, rootTE: 4.3, tipLE: 3.7, tipTE: 4.2, thick: 0.08, dihedral: 0 },
    stabY: 0.25,
    fin: [[2.9, 0.3], [4.5, 0.25], [4.6, 1.4], [4.25, 1.7], [3.8, 1.6], [3.2, 0.7]],
    finMat: M.yellow,
    canopy: { s: [0.36, 0.45, 1.0], y: 0.5, z: -0.5 },
    scoop: false, exhaustX: 0.42, exhaustYOff: 0.1,
    sideDecals: [{ tex: tex.cross, w: 0.8, h: 0.8, z: 2.0, y: 0.0 }],
  });
  bf109.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // --- Schnellboot (patrol boat), bow toward -z
  const boat = new THREE.Group();
  {
    const sh = new THREE.Shape();
    const p = [[0, -6], [1.3, -4], [1.65, -1], [1.6, 4.5], [1.3, 6], [-1.3, 6], [-1.6, 4.5], [-1.65, -1], [-1.3, -4]];
    sh.moveTo(...p[0]);
    for (const q of p.slice(1)) sh.lineTo(...q);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 1 });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 1.2, 0);
    const hull = new THREE.Mesh(geo, M.hull);
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 3.2), M.deck);
    cabin.position.set(0, 1.75, 0.2);
    const bridgeB = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 1.4), M.hull);
    bridgeB.position.set(0, 2.7, -0.4);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4), M.black);
    mast.position.set(0, 4.0, -0.2);
    const gunBase = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.4, 10), M.hull);
    gunBase.position.set(0, 1.45, -3.2);
    const gunB = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6), M.black);
    gunB.rotation.x = Math.PI / 2 - 0.3;
    gunB.position.set(0, 1.85, -3.8);
    const gun2 = gunBase.clone();
    gun2.position.z = 3.6;
    boat.add(cabin, bridgeB, mast, gunBase, gunB, gun2);
    boat.scale.setScalar(0.75);
    boat.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // --- Fuel barge, oriented along the river
  const barge = new THREE.Group();
  {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.2, 12), M.wood);
    hull.position.y = 0.4;
    barge.add(hull);
    const dg = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 12);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 6; j++) {
        const d = new THREE.Mesh(dg, (i + j) % 3 === 0 ? M.drumOlive : M.drumRed);
        d.position.set(-1.6 + i * 1.6, 1.65, -4.2 + j * 1.7);
        barge.add(d);
      }
    }
    const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.fuel, fog: true }));
    sign.scale.set(5.2, 2.3, 1);
    sign.position.set(0, 4.6, 0);
    barge.add(sign);
    barge.scale.setScalar(0.75);
    barge.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // --- Panzer IV style tank
  const tank = new THREE.Group();
  {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.1, 5.6), M.panzer);
    hull.position.y = 1.1;
    const tr1 = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.0, 6.0), M.track);
    tr1.position.set(1.65, 0.6, 0);
    const tr2 = tr1.clone();
    tr2.position.x = -1.65;
    const turret = new THREE.Group();
    turret.name = 'turret';
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 2.6), M.panzer);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 3.8, 8), M.track);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -3.0);
    turret.add(t, barrel);
    turret.position.set(0, 2.1, 0.3);
    tank.add(hull, tr1, tr2, turret);
    tank.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  function bridge(span) {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 1.4, 8), M.stone);
    deck.position.y = 4.6;
    const road = new THREE.Mesh(new THREE.BoxGeometry(span, 0.06, 5.4), M.road);
    road.position.y = 5.33;
    g.add(deck, road);
    for (const z of [-3.75, 3.75]) {
      const par = new THREE.Mesh(new THREE.BoxGeometry(span, 0.9, 0.5), M.stone);
      par.position.set(0, 5.75, z);
      g.add(par);
    }
    const n = Math.max(2, Math.round(span / 13));
    for (let i = 1; i < n; i++) {
      const x = -span / 2 + (span * i) / n;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 7.2), M.stoneDark);
      pier.position.set(x, -0.6, 0);
      const cut = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 9, 3), M.stoneDark);
      cut.position.set(x, -0.6, -3.6);
      g.add(pier, cut);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  function bridgeRuin(span) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const stub = new THREE.Mesh(new THREE.BoxGeometry(span * 0.18, 1.4, 8), M.stoneDark);
      stub.position.set(s * span * 0.41, 4.4, 0);
      stub.rotation.z = s * 0.18;
      g.add(stub);
    }
    const n = Math.max(2, Math.round(span / 13));
    for (let i = 1; i < n; i++) {
      const x = -span / 2 + (span * i) / n;
      const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 4.5, 7.2), M.stoneDark);
      pier.position.set(x, -1.9, 0);
      pier.rotation.z = (i % 2 ? 1 : -1) * 0.12;
      g.add(pier);
      const rub = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), M.stone);
      rub.position.set(x + 2, 0.2, 1.5);
      g.add(rub);
    }
    return g;
  }

  return {
    materials: M,
    p51: () => p51.clone(),
    bf109: () => bf109.clone(),
    boat: () => boat.clone(),
    barge: () => barge.clone(),
    tank: () => tank.clone(),
    bridge,
    bridgeRuin,
  };
}
