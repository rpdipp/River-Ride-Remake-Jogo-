// Synthesised sound (Web Audio): engine drone, .50 cal guns, explosions, beeps.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('rs_muted') === '1'; } catch { /* storage unavailable */ }
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp).connect(c.destination);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Engine: two detuned oscillators -> lowpass -> propeller "chop" -> volume
    this.o1 = c.createOscillator();
    this.o1.type = 'sawtooth';
    this.o2 = c.createOscillator();
    this.o2.type = 'square';
    this.ef = c.createBiquadFilter();
    this.ef.type = 'lowpass';
    this.ef.frequency.value = 500;
    this.am = c.createGain();
    this.am.gain.value = 0.7;
    this.lfo = c.createOscillator();
    this.lfo.frequency.value = 18;
    const lfoG = c.createGain();
    lfoG.gain.value = 0.3;
    this.lfo.connect(lfoG).connect(this.am.gain);
    this.eg = c.createGain();
    this.eg.gain.value = 0;
    const o2g = c.createGain();
    o2g.gain.value = 0.5;
    this.o1.connect(this.ef);
    this.o2.connect(o2g).connect(this.ef);
    this.ef.connect(this.am).connect(this.eg).connect(this.master);
    this.o1.start();
    this.o2.start();
    this.lfo.start();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('rs_muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  engine(on, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 58 + s * 40;
    this.o1.frequency.setTargetAtTime(f, t, 0.15);
    this.o2.frequency.setTargetAtTime(f * 0.505, t, 0.15);
    this.lfo.frequency.setTargetAtTime(15 + s * 12, t, 0.15);
    this.ef.frequency.setTargetAtTime(380 + s * 450, t, 0.15);
    this.eg.gain.setTargetAtTime(on ? 0.13 : 0, t, on ? 0.3 : 0.15);
  }

  burst({ dur, type = 'bandpass', freq = 1000, freqEnd, q = 1, gain = 0.3, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  tone({ freq, freqEnd, dur, type = 'square', gain = 0.15, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gun() {
    this.burst({ dur: 0.07, freq: 2200, q: 0.7, gain: 0.16 });
    this.tone({ freq: 150, freqEnd: 55, dur: 0.06, type: 'triangle', gain: 0.18 });
  }

  explosion(big = false) {
    this.burst({ dur: big ? 2.2 : 1.2, type: 'lowpass', freq: big ? 1400 : 1000, freqEnd: 90, q: 0.5, gain: big ? 1.0 : 0.75 });
    this.tone({ freq: 90, freqEnd: 28, dur: big ? 1.2 : 0.6, type: 'sine', gain: big ? 0.7 : 0.5 });
  }

  flak() {
    this.burst({ dur: 0.7, type: 'lowpass', freq: 500, freqEnd: 80, q: 0.4, gain: 0.22 });
  }

  shellFire() {
    this.burst({ dur: 0.4, type: 'lowpass', freq: 700, freqEnd: 100, q: 0.5, gain: 0.3 });
  }

  refuel(level) { this.tone({ freq: 500 + level * 6, dur: 0.07, type: 'square', gain: 0.05 }); }
  alarm() { this.tone({ freq: 880, dur: 0.14, type: 'square', gain: 0.07 }); }
  bonus() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.14, type: 'square', gain: 0.07, delay: i * 0.09 }));
  }
}
