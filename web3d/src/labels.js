// Text drawn into canvas textures (no web fonts, no network), so labels and speech bubbles also appear in screenshots and recordings.
import * as THREE from 'three';

function wrap(g, text, maxW) {
  const words = text.split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 5);
}

// Returns a THREE.Sprite sized in world units; bottom-centre anchored.
export function textSprite({ text, title, color = '#222', bg = 'rgba(255,255,255,0.95)', border = color, maxW = 340, font = 26, tail = true, worldH = 0.0042 }) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  g.font = `${font}px system-ui, -apple-system, sans-serif`;
  const lines = text ? wrap(g, text, maxW) : [];
  const titleW = title ? (g.font = `700 ${font}px system-ui, sans-serif`, g.measureText(title).width) : 0;
  g.font = `${font}px system-ui, -apple-system, sans-serif`;
  const w = Math.ceil(Math.max(titleW, ...lines.map(l => g.measureText(l).width), 10) + 28);
  const lh = font * 1.25, h = Math.ceil((lines.length + (title ? 1 : 0)) * lh + 18 + (tail ? 14 : 0));
  c.width = w; c.height = h;
  const bh = h - (tail ? 14 : 0);
  g.fillStyle = bg; g.strokeStyle = border; g.lineWidth = 4;
  g.beginPath(); g.roundRect(2, 2, w - 4, bh - 4, 14);
  if (tail) { g.moveTo(w / 2 - 10, bh - 3); g.lineTo(w / 2, h - 2); g.lineTo(w / 2 + 10, bh - 3); }
  g.fill(); g.stroke();
  let y = 9 + font;
  if (title) { g.font = `700 ${font}px system-ui, sans-serif`; g.fillStyle = color; g.fillText(title, 14, y); y += lh; }
  g.font = `${font}px system-ui, -apple-system, sans-serif`; g.fillStyle = '#1d1d1d';
  for (const l of lines) { g.fillText(l, 14, y); y += lh; }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10; sp.center.set(0.5, 0); sp.scale.set(w * worldH, h * worldH, 1); sp.userData.base = sp.scale.clone();
  sp.userData.dispose = () => { tex.dispose(); sp.material.dispose(); };
  return sp;
}
