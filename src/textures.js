// All textures are generated at runtime on canvases: no image assets to ship.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function radialTex(stops, size = 128) {
  const [c, g] = canvas(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return toTex(c);
}

function blobTex(size, blobs, alpha) {
  const [c, g] = canvas(size, size);
  for (let i = 0; i < blobs; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * size * 0.22;
    const x = size / 2 + Math.cos(a) * rr;
    const y = size / 2 + Math.sin(a) * rr * 0.8;
    const r = size * (0.14 + Math.random() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${alpha})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return toTex(c);
}

function star(g, cx, cy, R, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

function usStarTex() {
  const [c, g] = canvas(256, 128);
  const blue = '#1f2f5c';
  g.fillStyle = blue;
  g.fillRect(8, 44, 240, 40);
  g.fillStyle = '#f2f2f2';
  g.fillRect(14, 50, 228, 28);
  g.beginPath();
  g.arc(128, 64, 58, 0, Math.PI * 2);
  g.fillStyle = blue;
  g.fill();
  g.fillStyle = '#f2f2f2';
  star(g, 128, 66, 55, 21);
  return toTex(c);
}

function roundelTex() {
  const [c, g] = canvas(128, 128);
  const rings = [[62, '#e8c23a'], [56, '#1f2f6b'], [36, '#f0f0f0'], [22, '#b3261e']];
  for (const [r, col] of rings) {
    g.beginPath();
    g.arc(64, 64, r, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
  }
  return toTex(c);
}

function crossTex() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#f0f0f0';
  g.fillRect(48, 6, 32, 116);
  g.fillRect(6, 48, 116, 32);
  g.fillStyle = '#111';
  g.fillRect(56, 14, 16, 100);
  g.fillRect(14, 56, 100, 16);
  return toTex(c);
}

function fuelSignTex() {
  const [c, g] = canvas(256, 112);
  g.fillStyle = '#f4f1e8';
  g.fillRect(0, 0, 256, 112);
  g.save();
  g.beginPath();
  g.rect(0, 0, 256, 112);
  g.clip();
  g.fillStyle = '#c0281e';
  for (let x = -120; x < 300; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 16 + 112, 112);
    g.lineTo(x + 112, 112);
    g.fill();
  }
  g.restore();
  g.fillStyle = '#1b1b1b';
  g.fillRect(18, 18, 220, 76);
  g.fillStyle = '#ffd34d';
  g.font = 'bold 62px Arial Black, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('FUEL', 128, 58);
  return toTex(c);
}

function waterNormalTex() {
  const N = 256;
  const [c, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  const waves = [
    [3, 1, 0.5, 0], [1, 4, 0.35, 1.3], [-5, 2, 0.22, 2.1], [7, -3, 0.14, 0.4],
    [2, 9, 0.09, 3.3], [-11, 5, 0.06, 1.7], [13, 11, 0.04, 0.9],
  ];
  const H = (x, y) => {
    let h = 0;
    for (const [kx, ky, a, p] of waves) h += a * Math.sin((2 * Math.PI * (kx * x + ky * y)) / N + p);
    return h;
  };
  const S = 7;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * S;
      const dy = (H(x, y + 1) - H(x, y - 1)) * S;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = toTex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeTextures() {
  return {
    fire: radialTex([
      [0, 'rgba(255,255,235,1)'], [0.22, 'rgba(255,214,110,0.95)'],
      [0.55, 'rgba(255,110,25,0.55)'], [1, 'rgba(110,20,0,0)'],
    ]),
    glow: radialTex([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(255,225,160,0.7)'], [1, 'rgba(255,150,50,0)']], 64),
    smoke: blobTex(128, 9, 0.55),
    cloud: blobTex(256, 18, 0.45),
    star: usStarTex(),
    cross: crossTex(),
    roundel: roundelTex(),
    fuel: fuelSignTex(),
    waterNormal: waterNormalTex(),
  };
}
