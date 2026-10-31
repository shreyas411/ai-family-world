// Floor textures repeat per metre: use them on geometry whose UVs are in metres (meterPlane).
// Small procedural textures (256–512px canvases, generated once): no image downloads, low memory.
import * as THREE from 'three';

const cache = {};
function canvasTex(key, size, draw, repeat = [1, 1]) {
  if (cache[key]) return cache[key];
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (cache[key] = t);
}
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function noise(g, n, size, colors, a = 0.08) {
  for (let i = 0; i < n; i++) { g.fillStyle = colors[i % colors.length]; g.globalAlpha = a * rnd(); g.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 3, 1 + rnd() * 3); }
  g.globalAlpha = 1;
}

const tiles = (base, grout, veins, n = 2) => (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  noise(g, 3000, s, veins, 0.12);
  g.strokeStyle = veins[0]; g.globalAlpha = 0.18; g.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) { g.beginPath(); let x = rnd() * s, y = rnd() * s; g.moveTo(x, y); for (let k = 0; k < 6; k++) g.lineTo(x += (rnd() - 0.5) * 60, y += rnd() * 40); g.stroke(); }
  g.globalAlpha = 1; g.strokeStyle = grout; g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { const p = i * s / n; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); }
};
const planks = (a, b) => (g, s) => {
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? a : b; g.fillRect(0, i * s / 8, s, s / 8);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect((i * 97) % s, i * s / 8, 2, s / 8);
  }
  noise(g, 2500, s, ['#000', '#5a3a1a'], 0.1);
  g.strokeStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * s / 8); g.lineTo(s, i * s / 8); g.stroke(); }
};

export const TEX = {
  marble: () => canvasTex('marble', 512, tiles('#efe9de', '#cfc6b6', ['#b9ae9c', '#d8cfbf'], 4), [1 / 2.4, 1 / 2.4]),
  kitchenTile: () => canvasTex('kt', 256, tiles('#d9d4c7', '#9d968a', ['#8a8375', '#c4bdb0'], 4), [1 / 1.2, 1 / 1.2]),
  bath: () => canvasTex('bath', 256, tiles('#cfe3ea', '#8fb2bf', ['#9fc4d0'], 6), [1 / 1.2, 1 / 1.2]),
  wood: () => canvasTex('wood', 256, planks('#9a6a3f', '#8d5f37'), [1 / 1.2, 1 / 1.2]),
  woodLight: () => canvasTex('woodL', 256, planks('#c4945f', '#b8875a'), [1 / 1.2, 1 / 1.2]),
  terracotta: () => canvasTex('terra', 256, tiles('#b8633f', '#8a4630', ['#9a5034', '#c97955'], 4), [1 / 1.2, 1 / 1.2]),
  stone: () => canvasTex('stone', 256, tiles('#9e9a92', '#77736c', ['#6e6a63', '#b2aea6'], 3), [1 / 1.5, 1 / 1.5]),
  grass: () => canvasTex('grass', 256, (g, s) => { g.fillStyle = '#6f9a4b'; g.fillRect(0, 0, s, s); noise(g, 9000, s, ['#4f7a34', '#8db564', '#5d8a3e'], 0.6); }, [0.5, 0.5]),
  road: () => canvasTex('road', 256, (g, s) => { g.fillStyle = '#5b5b5d'; g.fillRect(0, 0, s, s); noise(g, 6000, s, ['#3e3e40', '#777'], 0.5); }, [0.25, 0.25]),
  rug: color => canvasTex('rug' + color, 256, (g, s) => {
    g.fillStyle = color; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#e8c76a'; g.lineWidth = 10; g.strokeRect(14, 14, s - 28, s - 28);
    g.strokeStyle = '#2c3e66'; g.lineWidth = 5; g.strokeRect(30, 30, s - 60, s - 60);
    g.fillStyle = '#e8c76a'; g.beginPath(); g.ellipse(s / 2, s / 2, 54, 40, 0, 0, 7); g.fill();
    g.fillStyle = '#2c3e66'; g.beginPath(); g.ellipse(s / 2, s / 2, 30, 20, 0, 0, 7); g.fill();
    for (let i = 0; i < 4; i++) { g.save(); g.translate(s / 2, s / 2); g.rotate(i * Math.PI / 2); g.fillStyle = '#e8c76a'; g.beginPath(); g.arc(0, 85, 12, 0, 7); g.fill(); g.restore(); }
    noise(g, 3000, s, ['#000', '#fff'], 0.08);
  }),
  photo: kind => canvasTex('ph' + kind, 128, (g, s) => {
    const sky = { wedding: '#c94b4b', family: '#8fb8d8', deity: '#f0a830' }[kind] || '#999';
    g.fillStyle = sky; g.fillRect(0, 0, s, s);
    if (kind === 'deity') { g.fillStyle = '#ffd86b'; g.beginPath(); g.arc(64, 54, 34, 0, 7); g.fill(); g.fillStyle = '#2b5fae'; g.beginPath(); g.arc(64, 60, 14, 0, 7); g.fill(); g.fillRect(48, 70, 32, 50); return; }
    const people = kind === 'wedding' ? [[48, '#7a1f2a'], [80, '#e0b030']] : [[26, '#2a78d6'], [48, '#eb6834'], [72, '#1baf7a'], [94, '#eda100'], [108, '#e87ba4']];
    g.fillStyle = '#6f9a4b'; g.fillRect(0, 96, s, 32);
    for (const [x, c] of people) { g.fillStyle = '#8a5a3c'; g.beginPath(); g.arc(x, 56, 9, 0, 7); g.fill(); g.fillStyle = c; g.fillRect(x - 10, 66, 20, 40); }
  }),
};

const mcache = {};
export const mat = (color, rough = 0.8, metal = 0) => mcache[color + rough + metal] ||
  (mcache[color + rough + metal] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
export const texMat = (key, t) => mcache[key] || (mcache[key] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }));
export const glass = () => mcache.glass || (mcache.glass = new THREE.MeshStandardMaterial({ color: '#bfe3ff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35 }));

// Plane lying flat whose UVs are in metres, so tiles keep their real size on any floor.
export function meterPlane(w, d) {
  const g = new THREE.PlaneGeometry(w, d), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  g.rotateX(-Math.PI / 2); return g;
}
