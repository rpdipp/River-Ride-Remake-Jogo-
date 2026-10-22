// Dev-only test pilot. In the browser console (npm run dev):
//   const bot = await import('/dev/bot.js'); bot.run(120)
// Simulates `seconds` of play at 60 fps with a simple autopilot and reports crashes.
import { edgeDist, riverAt } from '/src/river.js';

const log = [];
let hooked = false;

function hook(game) {
  if (hooked) return;
  hooked = true;
  const orig = game.crash.bind(game);
  game.crash = (reason) => {
    if (game.state === 'playing') log.push(`${reason} d=${game.p.d.toFixed(0)} x=${game.p.x.toFixed(1)}`);
    orig(reason);
  };
}

export function step(game, fire = true) {
  const p = game.p;
  if (game.state !== 'playing') return;
  const threats = game.world.entities
    .filter((e) => e.alive && (e.type === 'boat' || e.type === 'jet') && e.d - p.d > 0 && e.d - p.d < 60)
    .map((e) => {
      const t = (e.d - p.d) / p.speed;
      const moving = e.type === 'jet' ? e.active : e.moving || e.mover;
      return { x: moving ? e.x + e.dir * e.speed * t : e.x, rx: e.rx + (moving ? 4 : 0) };
    });
  // a target is ok if the plane can reach it (lateral speed ~0.75 x forward) without touching land
  const reach = (x, a) => p.x + Math.max(-0.75 * a, Math.min(0.75 * a, x - p.x));
  const ok = (x) => [4, 8, 14, 20, 28, 35, 45, 55, 80, 110].every((a) => edgeDist(reach(x, a), p.d + a) < -4.5) &&
    !threats.some((e) => Math.abs(e.x - x) < e.rx + 3);
  // candidates: channel centres a bit ahead; keep the reachable one closest to us
  const okUpTo = (x, A) => [4, 8, 14, 20, 28, 35, 45, 55, 70].filter((a) => a <= A)
    .every((a) => edgeDist(reach(x, a), p.d + a) < -3.5) && !threats.some((e) => Math.abs(e.x - x) < e.rx + 3);
  let best = null, bd = 1e9;
  for (const A of [70, 45, 25]) {
    const r = riverAt(p.d + A);
    const cands = r.ih > 0 ? [r.c - (r.h + r.ih) / 2, r.c + (r.h + r.ih) / 2] : [r.c];
    for (const c of cands) {
      for (const off of [0, -6, 6, -12, 12]) {
        const x = c + off;
        if (okUpTo(x, A) && Math.abs(x - p.x) < bd) { bd = Math.abs(x - p.x); best = x; }
      }
    }
    if (best !== null) break;
  }
  let tx = best ?? riverAt(p.d + 15).c;
  for (const e of game.world.entities) {
    if (e.alive && e.type === 'fuel' && p.fuel < 75 && e.d - p.d > 0 && e.d - p.d < 60 && ok(e.x)) tx = e.x;
  }
  const k = game.input.keys;
  k.delete('ArrowLeft');
  k.delete('ArrowRight');
  fire ? k.add('Space') : k.delete('Space');
  if (tx - p.x > 0.8) k.add('ArrowRight');
  else if (tx - p.x < -0.8) k.add('ArrowLeft');
}

export function run(seconds, { fire = true, start = true } = {}) {
  const game = window.game;
  hook(game);
  if (start) { log.length = 0; game.startGame(); }
  for (let i = 0; i < seconds * 60; i++) {
    step(game, fire);
    game.update(1 / 60);
    if (game.state === 'over') break;
  }
  game.renderer.render(game.scene, game.camera);
  return { d: Math.round(game.p.d), score: game.score, lives: game.lives, fuel: Math.round(game.p.fuel), state: game.state, bridge: game.bridgeNo, crashes: [...log] };
}
