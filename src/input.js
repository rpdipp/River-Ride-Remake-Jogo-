// Touch controls: floating virtual joystick (left half) + fire zone (right half).
// Keyboard fallback for desktop testing: arrows/WASD + Space.
import { clamp } from './util.js';

const RADIUS = 56;

export class Input {
  constructor(layer, joy, knob, fireBtn) {
    this.joy = joy;
    this.knob = knob;
    this.fireBtn = fireBtn;
    this.jx = 0;
    this.jy = 0;
    this.joyId = null;
    this.fireIds = new Set();
    this.keys = new Set();
    this.enabled = false;

    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) layer.addEventListener(ev, (e) => this.up(e));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.jx = this.jy = 0;
    this.joyId = null;
    this.fireIds.clear();
    this.keys.clear();
    this.joy.classList.remove('active');
    this.joy.style.left = this.joy.style.top = '';
    this.knob.style.transform = '';
    this.fireBtn.classList.remove('pressed');
  }

  down(e) {
    if (!this.enabled) return;
    e.preventDefault();
    if (e.clientX < window.innerWidth * 0.5) {
      if (this.joyId !== null) return;
      this.joyId = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.joy.classList.add('active');
      this.joy.style.left = `${e.clientX}px`;
      this.joy.style.top = `${e.clientY}px`;
      this.knob.style.transform = '';
    } else {
      this.fireIds.add(e.pointerId);
      this.fireBtn.classList.add('pressed');
    }
  }

  move(e) {
    if (e.pointerId !== this.joyId) return;
    let dx = e.clientX - this.ox, dy = e.clientY - this.oy;
    const l = Math.hypot(dx, dy);
    if (l > RADIUS) { dx *= RADIUS / l; dy *= RADIUS / l; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    this.jx = dz(dx / RADIUS);
    this.jy = dz(-dy / RADIUS);
  }

  up(e) {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.jx = this.jy = 0;
      this.joy.classList.remove('active');
      this.joy.style.left = this.joy.style.top = '';
      this.knob.style.transform = '';
    }
    if (this.fireIds.delete(e.pointerId) && !this.fireIds.size) this.fireBtn.classList.remove('pressed');
  }

  get x() {
    const k = this.keys;
    return clamp(this.jx + (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0), -1, 1);
  }

  get y() {
    const k = this.keys;
    return clamp(this.jy + (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0), -1, 1);
  }

  get fire() {
    return this.fireIds.size > 0 || this.keys.has('Space');
  }
}
