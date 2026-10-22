// Procedural river: centre line c, half width h and optional island half width ih,
// all as functions of the forward distance d. Every SECTION_LEN there is a bridge
// where the river narrows and re-centres (same rhythm as the Atari original).
import { clamp, lerp, rngFor, smoothstep, fbm } from './util.js';

export const SECTION_LEN = 800;
export const STEP = 40;
export const PTS = SECTION_LEN / STEP;
export const BRIDGE_HALF_W = 16;
export const FLY_Y = 4;

const cache = new Map();

function sectionCtrl(s) {
  let pts = cache.get(s);
  if (pts) return pts;
  const r = rngFor(s, 7);
  const diff = Math.min(1, s / 12);
  pts = [];
  let c = 0;
  for (let i = 0; i < PTS; i++) {
    if (i <= 1 || i >= PTS - 1 || (s === 0 && i < 4)) {
      pts.push({ c: 0, h: BRIDGE_HALF_W, ih: 0 });
      continue;
    }
    c = clamp(c + (r() - 0.5) * 34, -50, 50);
    const maxH = 58 - diff * 16;
    const h = 20 + r() * (maxH - 20);
    let ih = 0;
    if (h > 34 && i > 3 && i < PTS - 4 && r() < 0.4 + diff * 0.25) ih = h - 15 - r() * 7;
    const toBridge = PTS - 1 - i;
    pts.push({ c: toBridge < 5 ? (c * toBridge) / 5 : c, h, ih });
  }
  // soften island tips so their edges are never steeper than the plane can follow
  for (let i = 1; i < PTS - 1; i++) {
    if (pts[i].ih > 0 && (pts[i - 1].ih === 0 || pts[i + 1].ih === 0)) pts[i].ih *= 0.5;
  }
  cache.set(s, pts);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return pts;
}

function ctrl(g) {
  if (g < 0) g = 0;
  const s = Math.floor(g / PTS);
  return sectionCtrl(s)[g - s * PTS];
}

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const out = { c: 0, h: 0, ih: 0 };
/** Returns a shared object — copy the values if you need to keep them. */
export function riverAt(d) {
  const gf = Math.max(0, d) / STEP;
  const g = Math.floor(gf), t = gf - g;
  const a = ctrl(g - 1), b = ctrl(g), c = ctrl(g + 1), e = ctrl(g + 2);
  out.c = cr(a.c, b.c, c.c, e.c, t);
  const h = Math.max(13, cr(a.h, b.h, c.h, e.h, t));
  // island tips grow continuously from zero; channels stay at least 12 wide
  const ih = clamp(cr(a.ih, b.ih, c.ih, e.ih, t) * 1.25 - 3.75, 0, h - 12);
  out.h = h;
  out.ih = ih;
  return out;
}

/** Signed distance to the water edge: negative = over water, positive = over land. */
export function edgeDist(x, d) {
  const r = riverAt(d);
  const dx = Math.abs(x - r.c);
  if (dx >= r.h) return dx - r.h;
  if (r.ih <= 0) return dx - r.h;
  if (dx < r.ih) return r.ih - dx;
  return -Math.min(r.h - dx, dx - r.ih);
}

export const isWater = (x, d) => edgeDist(x, d) < 0;

export function nearestBridgeD(d) {
  const s = Math.round(d / SECTION_LEN);
  return s >= 1 ? s * SECTION_LEN : -1e9;
}

export function heightFromEdge(x, d, e) {
  let y;
  // The visual shoreline (y = 0) sits exactly on the collision edge (e = 0).
  if (e < 0) {
    y = -0.35 - smoothstep(0, 7, -e) * 3.3;
  } else {
    const n = fbm(x * 0.018, d * 0.018);
    y = 0.2 + smoothstep(0, 4, e) * 1.6 + smoothstep(0, 4, e) * n * 0.8 + smoothstep(12, 100, e) * (n * n * 26);
  }
  const dd = Math.abs(d - nearestBridgeD(d));
  if (dd < 16 && e >= -1) {
    const k = 1 - smoothstep(6, 16, dd);
    y = lerp(y, 4.0, k * smoothstep(-1, 3, e));
  }
  return y;
}

export const terrainHeight = (x, d) => heightFromEdge(x, d, edgeDist(x, d));
