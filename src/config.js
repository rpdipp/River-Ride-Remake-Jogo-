// Playable aircraft and theatres of operation. Everything that makes a plane or a
// scenario different lives here, so adding a new one is mostly data.

/**
 * Flight model per plane.
 * baseSpeed/maxSpeed/minSpeed: forward speed (units/s); lat: sideways speed (agility)
 * fireRate: seconds between shots; salvo: bullets per shot; spread: gun offset from centre
 * drain: fuel use per second (bigger = smaller tank); armor: hits absorbed per life
 * stats: 1..5 bars shown in the hangar
 */
export const PLANES = {
  p51: {
    id: 'p51', name: 'P-51D Mustang', country: 'EUA · USAAF',
    desc: 'Equilibrado e de longo alcance. O caça que escoltava os bombardeiros até Berlim.',
    baseSpeed: 55, minSpeed: 30, maxSpeed: 92, lat: 46,
    fireRate: 0.085, salvo: 1, spread: 1.5, drain: 2.6, armor: 0, span: 3.1,
    stats: { Velocidade: 4, Agilidade: 4, 'Poder de fogo': 3, Autonomia: 5, Blindagem: 2 },
  },
  spitfire: {
    id: 'spitfire', name: 'Spitfire Mk IX', country: 'Reino Unido · RAF',
    desc: 'O mais ágil nas curvas, mas com tanque pequeno: reabasteça sempre que puder.',
    baseSpeed: 57, minSpeed: 30, maxSpeed: 96, lat: 57,
    fireRate: 0.07, salvo: 1, spread: 1.3, drain: 3.1, armor: 0, span: 3.0,
    stats: { Velocidade: 4, Agilidade: 5, 'Poder de fogo': 3, Autonomia: 2, Blindagem: 1 },
  },
  p47: {
    id: 'p47', name: 'P-47D Thunderbolt', country: 'EUA · USAAF',
    desc: 'Oito metralhadoras .50 e blindagem que aguenta um impacto por vida. Pesado nas curvas.',
    baseSpeed: 52, minSpeed: 30, maxSpeed: 86, lat: 37,
    fireRate: 0.075, salvo: 2, spread: 1.7, drain: 2.6, armor: 1, span: 3.4,
    stats: { Velocidade: 3, Agilidade: 2, 'Poder de fogo': 5, Autonomia: 4, Blindagem: 5 },
  },
};

/**
 * Look & feel per theatre. Colours are hex; ground/trees/houses are used by terrain.js.
 */
export const THEATERS = {
  normandy: {
    id: 'normandy', name: 'Normandia', sub: 'Verão de 1944 · dia', icon: '☀',
    skyTop: 0x4a7cc2, horizon: 0xb7c4c9, sunGlow: 0.8, fogNear: 170, fogFar: 530,
    sun: 0xfff0d8, sunI: 2.6, hemiSky: 0xcfe0ff, hemiGround: 0x5a5232, hemiI: 0.9, env: 0.55, exposure: 1.0,
    sunDir: [-30, 85, 45],
    water: 0x2c5660, waterOpacity: 0.8,
    ground: {
      fields: [0x6f8f3a, 0x7c9845, 0x9ea25a, 0x5d7c33, 0xb3a660, 0x8a7a4c, 0x6a8a40, 0xa4b06a],
      hedge: 0x34502a, sand: 0xb7a77c, bed: 0x3e4a33, mud: 0x6d6448, road: 0x7a7062,
    },
    tree: { h: 0.24, hv: 0.07, s: 0.42, l: 0.18, lv: 0.1, conifer: false },
    poplar: { h: 0.26, s: 0.45, l: 0.16 },
    wall: { h: 0.11, s: 0.25, l: 0.68, lv: 0.15 },
    roof: { h: 0.03, hv: 0.03, s: 0.55, l: 0.3, lv: 0.1 },
    church: { wall: 0xcfc4a8, roof: 0x3f4648 },
    cloud: 0xffffff, cloudAlpha: 1, flakEvery: 3,
    fighter: { name: 'Bf 109', skin: 0x66705e }, tank: 0xa8955c,
  },
  ardennes: {
    id: 'ardennes', name: 'Ardenas', sub: 'Inverno de 1944 · neve', icon: '❄',
    skyTop: 0x8796a6, horizon: 0xcbd2d8, sunGlow: 0.15, fogNear: 120, fogFar: 470,
    sun: 0xe9eef5, sunI: 1.6, hemiSky: 0xe2e9f2, hemiGround: 0x8a9096, hemiI: 1.25, env: 0.6, exposure: 1.0,
    sunDir: [-40, 70, 30],
    water: 0x2b4450, waterOpacity: 0.88,
    ground: {
      fields: [0xe9edf0, 0xdfe5ea, 0xf3f5f7, 0xd3dbe1, 0xc7cfd4, 0xe4e6e2, 0xb9c0b5],
      hedge: 0x5c6657, sand: 0xd6dcdf, bed: 0x2a3940, mud: 0x9aa0a2, road: 0x8e8b86,
    },
    tree: { h: 0.38, hv: 0.04, s: 0.3, l: 0.11, lv: 0.09, conifer: true },
    poplar: { h: 0.38, s: 0.3, l: 0.1 },
    wall: { h: 0.08, s: 0.12, l: 0.55, lv: 0.12 },
    roof: { h: 0.58, hv: 0.02, s: 0.08, l: 0.88, lv: 0.06 },
    church: { wall: 0xa9a59c, roof: 0xe6eaee },
    cloud: 0xe8ecf0, cloudAlpha: 1.4, flakEvery: 3, snow: true,
    fighter: { name: 'Bf 109', skin: 0xb9bfbb }, tank: 0xd2d3cb,
  },
  night: {
    id: 'night', name: 'Missão Noturna', sub: 'Vale do Reno · 1945', icon: '☾',
    skyTop: 0x03060f, horizon: 0x16213a, sunGlow: 0, fogNear: 110, fogFar: 460,
    sun: 0xa9c0f0, sunI: 1.5, hemiSky: 0x4a5f90, hemiGround: 0x15181c, hemiI: 0.8, env: 0.35, exposure: 1.2,
    sunDir: [-50, 80, -60],
    water: 0x2a4a70, waterOpacity: 0.78,
    ground: {
      fields: [0x5f7a3a, 0x6c8640, 0x86905a, 0x52703a, 0x9a8f5c, 0x786a46],
      hedge: 0x2c4224, sand: 0x9a8f72, bed: 0x2d382a, mud: 0x5c553e, road: 0x6a6258,
    },
    tree: { h: 0.27, hv: 0.06, s: 0.38, l: 0.16, lv: 0.08, conifer: false },
    poplar: { h: 0.28, s: 0.4, l: 0.14 },
    wall: { h: 0.1, s: 0.2, l: 0.55, lv: 0.12 },
    roof: { h: 0.02, hv: 0.02, s: 0.45, l: 0.25, lv: 0.08 },
    church: { wall: 0xa49c86, roof: 0x30373a },
    cloud: 0x55607a, cloudAlpha: 0.7, flakEvery: 1.4, night: true,
    fighter: { name: 'Bf 109', skin: 0x3a3f42 }, tank: 0x6f6650,
  },
};

export const DEFAULT_PLANE = 'p51';
export const DEFAULT_THEATER = 'normandy';
