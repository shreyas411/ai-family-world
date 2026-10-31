// Procedural low-poly furniture. Each piece: origin at floor centre, front facing +z. Geometries/materials are cached and shared.
import * as THREE from 'three';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { mat, texMat, TEX, meterPlane } from './textures.js';

const gcache = {};
const boxG = (w, h, d) => gcache[`b${w},${h},${d}`] || (gcache[`b${w},${h},${d}`] = new THREE.BoxGeometry(w, h, d));
const cylG = (rt, rb, h, n = 16) => gcache[`c${rt},${rb},${h},${n}`] || (gcache[`c${rt},${rb},${h},${n}`] = new THREE.CylinderGeometry(rt, rb, h, n));
const sphG = r => gcache[`s${r}`] || (gcache[`s${r}`] = new THREE.SphereGeometry(r, 12, 10));
const torG = (r, t, arc = Math.PI * 2) => gcache[`t${r},${t},${arc}`] || (gcache[`t${r},${t},${arc}`] = new THREE.TorusGeometry(r, t, 8, 24, arc));
const plG = (w, h) => gcache[`p${w},${h}`] || (gcache[`p${w},${h}`] = new THREE.PlaneGeometry(w, h));
const m = c => typeof c === 'string' ? mat(c) : c;

// B: box sitting on y=p[1] (bottom), centred in x/z. Cy: cylinder by bottom. S: sphere by centre.
export const B = ({ s: [w, h, d], p = [0, 0, 0], c = '#888', r, shadow = true }) =>
  <mesh geometry={boxG(w, h, d)} material={m(c)} position={[p[0], p[1] + h / 2, p[2]]} rotation={r} castShadow={shadow} receiveShadow />;
export const Cy = ({ r: [rt, rb = rt], h, p = [0, 0, 0], c = '#888', rot, n }) =>
  <mesh geometry={cylG(rt, rb, h, n)} material={m(c)} position={[p[0], p[1] + h / 2, p[2]]} rotation={rot} castShadow receiveShadow />;
export const S = ({ r, p, c = '#888', sc }) => <mesh geometry={sphG(r)} material={m(c)} position={p} scale={sc} castShadow />;
const Plane = ({ w, h, p, c, r = [-Math.PI / 2, 0, 0] }) => <mesh geometry={plG(w, h)} material={m(c)} position={p} rotation={r} receiveShadow />;

const WOOD = '#7b4a2a', WOOD_D = '#4e2e1a', WOOD_L = '#b98a5a', STEEL = mat('#c9ccd0', 0.35, 0.25), WHITE = '#f4f1ea';
const legs = (w, d, h, c = WOOD_D, t = 0.05) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) =>
  <B key={i} s={[t, h, t]} p={[a * (w / 2 - t), 0, b * (d / 2 - t)]} c={c} />);

function Bed({ w, sheet = '#c46a7a', pillows = 2 }) {
  return <group>
    <B s={[w, 0.3, 2.1]} c={WOOD} /><B s={[w - 0.08, 0.22, 2.0]} p={[0, 0.3, 0]} c="#f2efe8" />
    <B s={[w - 0.04, 0.05, 1.35]} p={[0, 0.5, 0.36]} c={sheet} />
    {Array.from({ length: pillows }, (_, i) => <B key={i} s={[w / pillows - 0.15, 0.1, 0.35]} p={[(i - (pillows - 1) / 2) * (w / pillows), 0.52, -0.75]} c="#fbfaf5" />)}
    <B s={[w, 1.05, 0.08]} p={[0, 0, -1.02]} c={WOOD_D} />
  </group>;
}
function Bunk() {
  return <group>
    {[[-0.47, -1.0], [0.47, -1.0], [-0.47, 1.0], [0.47, 1.0]].map(([x, z], i) => <B key={i} s={[0.07, 2.0, 0.07]} p={[x, 0, z]} c="#3d6fa8" />)}
    <B s={[1.0, 0.12, 2.1]} p={[0, 0.2, 0]} c="#3d6fa8" /><B s={[0.92, 0.15, 1.98]} p={[0, 0.3, 0]} c="#f2efe8" /><B s={[0.94, 0.04, 1.3]} p={[0, 0.44, 0.33]} c="#eda100" />
    <B s={[1.0, 0.12, 2.1]} p={[0, 1.3, 0]} c="#3d6fa8" /><B s={[0.92, 0.15, 1.98]} p={[0, 1.4, 0]} c="#f2efe8" /><B s={[0.94, 0.04, 1.3]} p={[0, 1.54, 0.33]} c="#e87ba4" />
    <B s={[0.8, 0.1, 0.3]} p={[0, 0.45, -0.8]} c={WHITE} /><B s={[0.8, 0.1, 0.3]} p={[0, 1.55, -0.8]} c={WHITE} />
    <B s={[0.04, 0.3, 1.6]} p={[0.47, 1.55, 0]} c="#3d6fa8" />
    {[0.4, 0.75, 1.1].map(y => <B key={y} s={[0.05, 0.04, 0.4]} p={[-0.52, y, 0.75]} c="#3d6fa8" />)}
    <B s={[0.04, 1.7, 0.04]} p={[-0.52, 0, 0.55]} c="#3d6fa8" /><B s={[0.04, 1.7, 0.04]} p={[-0.52, 0, 0.95]} c="#3d6fa8" />
    <S r={0.09} p={[0.2, 1.65, -0.5]} c="#c08850" /><S r={0.06} p={[0.2, 1.8, -0.5]} c="#c08850" />
  </group>;
}
function Desk({ w, d, pc, kids }) {
  return <group>
    <B s={[w, 0.04, d]} p={[0, 0.72, 0]} c={kids ? '#f2f2f2' : WOOD_L} />{legs(w, d, 0.72, kids ? '#e87ba4' : WOOD_D)}
    <B s={[0.4, 0.55, d - 0.05]} p={[w / 2 - 0.22, 0.17, 0]} c={kids ? '#f2f2f2' : WOOD_L} />
    {pc && <group position={[0.45, 0.76, -0.12]}>
      <B s={[0.05, 0.18, 0.05]} c="#222" /><B s={[0.58, 0.36, 0.03]} p={[0, 0.16, 0]} c="#1a1a1a" />
      <mesh geometry={plG(0.54, 0.32)} position={[0, 0.34, 0.017]} material={mat('#3d6fa8', 0.3)} />
      <B s={[0.45, 0.02, 0.15]} p={[0, 0, 0.28]} c="#2a2a2a" />
    </group>}
    {pc && <group position={[-0.45, 0.76, 0.0]}><B s={[0.34, 0.02, 0.24]} c="#9aa0a6" />
      <B s={[0.34, 0.22, 0.01]} p={[0, 0.0, -0.12]} c="#9aa0a6" r={[-0.25, 0, 0]} /></group>}
    {!pc && <><B s={[0.25, 0.03, 0.18]} p={[0, 0.76, 0.05]} c="#e7e1cf" /><B s={[0.2, 0.06, 0.25]} p={[-0.4, 0.76, -0.1]} c="#b0322f" /></>}
    <Cy r={[0.06, 0.08]} h={0.03} p={[-w / 2 + 0.15, 0.76, -0.2]} c="#333" /><Cy r={[0.012]} h={0.3} p={[-w / 2 + 0.15, 0.78, -0.2]} c="#333" />
    <Cy r={[0.05, 0.09]} h={0.1} p={[-w / 2 + 0.15, 1.05, -0.2]} c="#eee3c4" />
  </group>;
}
function Chair({ color = WOOD }) {
  return <group><B s={[0.45, 0.05, 0.45]} p={[0, 0.42, 0]} c={color} /><B s={[0.45, 0.48, 0.05]} p={[0, 0.45, -0.2]} c={color} />{legs(0.45, 0.45, 0.42, WOOD_D, 0.04)}</group>;
}
function Sofa() {
  const fab = '#cdb79a', cush = ['#a23b2a', '#2c6e6a', '#d9a521', '#7b3f8c'];
  return <group>
    <B s={[3.2, 0.32, 0.9]} p={[0, 0.08, 0]} c={fab} /><B s={[3.2, 0.5, 0.22]} p={[0, 0.35, -0.34]} c={fab} />
    <B s={[0.18, 0.3, 0.9]} p={[-1.51, 0.35, 0]} c={fab} /><B s={[0.18, 0.3, 0.9]} p={[1.51, 0.35, 0]} c={fab} />
    {[-1.05, -0.35, 0.35, 1.05].map(x => <B key={x} s={[0.68, 0.08, 0.66]} p={[x, 0.4, 0.08]} c="#d9c6aa" />)}
    {[-1.2, -0.4, 0.5, 1.2].map((x, i) => <B key={x} s={[0.36, 0.34, 0.1]} p={[x, 0.48, -0.17]} c={cush[i]} r={[-0.15, 0, i % 2 ? 0.1 : -0.1]} />)}
    {legs(3.1, 0.85, 0.08, WOOD_D)}
  </group>;
}
function Armchair({ color = '#b5651d' }) {
  return <group><B s={[0.8, 0.38, 0.75]} p={[0, 0.06, 0.02]} c={color} /><B s={[0.8, 0.55, 0.18]} p={[0, 0.35, -0.31]} c={color} />
    <B s={[0.14, 0.24, 0.75]} p={[-0.33, 0.44, 0.02]} c={color} /><B s={[0.14, 0.24, 0.75]} p={[0.33, 0.44, 0.02]} c={color} />{legs(0.75, 0.7, 0.06, WOOD_D)}</group>;
}
function Bookshelf() {
  const cols = ['#a23b2a', '#2c3e66', '#d9a521', '#1baf7a', '#6d4c41', '#e87ba4', '#3d6fa8', '#eda100'];
  const books = [];
  for (let sh = 0; sh < 4; sh++) { let x = -0.62; let k = sh * 7; while (x < 0.55) { const w = 0.04 + ((k * 37) % 5) * 0.012, h = 0.24 + ((k * 13) % 4) * 0.03;
    books.push(<B key={`${sh}-${k}`} s={[w, h, 0.22]} p={[x + w / 2, 0.08 + sh * 0.45, 0.02]} c={cols[k % cols.length]} />); x += w + 0.008; k++; } }
  return <group><B s={[1.4, 1.9, 0.04]} p={[0, 0, -0.16]} c={WOOD} /><B s={[0.04, 1.9, 0.35]} p={[-0.68, 0, 0]} c={WOOD} /><B s={[0.04, 1.9, 0.35]} p={[0.68, 0, 0]} c={WOOD} />
    {[0, 0.45, 0.9, 1.35, 1.86].map(y => <B key={y} s={[1.36, 0.04, 0.35]} p={[0, y + 0.04, 0]} c={WOOD} />)}{books}</group>;
}
function Counter({ len, stove, sink, center }) {
  const sx = stove != null ? stove - center : null, kx = sink != null ? sink - center : null;
  return <group>
    <B s={[len, 0.85, 0.62]} c="#efe6d5" /><B s={[len + 0.02, 0.04, 0.66]} p={[0, 0.85, 0]} c={mat('#2b2a2a', 0.25, 0.1)} />
    {Array.from({ length: Math.floor(len / 0.6) }, (_, i) => <B key={i} s={[0.012, 0.75, 0.01]} p={[-len / 2 + 0.6 * (i + 1), 0.05, 0.31]} c="#b8ab93" />)}
    <B s={[len, 0.55, 0.01]} p={[0, 0.89, -0.32]} c="#d7e5e8" />
    {sx != null && <group position={[sx, 0.89, 0.02]}>
      <B s={[0.7, 0.07, 0.42]} c="#151515" />{[-0.17, 0.17].map(x => <mesh key={x} geometry={torG(0.07, 0.012)} material={mat('#555')} position={[x, 0.08, 0]} rotation={[Math.PI / 2, 0, 0]} />)}
      <Cy r={[0.11, 0.1]} h={0.2} p={[-0.17, 0.08, 0]} c={STEEL} /><Cy r={[0.06]} h={0.04} p={[-0.17, 0.28, 0]} c="#222" /><Cy r={[0.012]} h={0.08} p={[-0.13, 0.32, 0]} c="#222" />
      <mesh geometry={sphG(0.14)} material={mat('#3a3a3a', 0.5, 0.2)} position={[0.17, 0.16, 0]} scale={[1, 0.45, 1]} />
    </group>}
    {kx != null && <group position={[kx, 0.89, 0.02]}><B s={[0.6, 0.015, 0.42]} c={STEEL} /><B s={[0.5, 0.02, 0.34]} p={[0, 0.005, 0]} c="#6d7277" />
      <Cy r={[0.015]} h={0.28} p={[0, 0, -0.2]} c={STEEL} /><B s={[0.02, 0.02, 0.15]} p={[0, 0.27, -0.13]} c={STEEL} /></group>}
    {sx == null && kx == null && <group position={[0.3, 0.89, 0.05]}>
      <B s={[0.4, 0.02, 0.28]} c="#c79a64" /><S r={0.04} p={[-0.1, 0.06, 0]} c="#c0392b" /><S r={0.04} p={[0.0, 0.06, 0.05]} c="#7d3c98" /><S r={0.035} p={[0.1, 0.055, -0.04]} c="#27ae60" />
      <Cy r={[0.11]} h={0.06} p={[-0.6, 0.0, 0]} c={STEEL} /><B s={[0.18, 0.3, 0.18]} p={[0.75, 0.0, -0.05]} c="#e8e8e8" /><Cy r={[0.07, 0.06]} h={0.16} p={[0.75, 0.3, -0.05]} c="#bbb" />
    </group>}
    <group position={[sx != null ? sx + 0.7 : -len / 2 + 0.4, 1.45, -0.27]}><B s={[0.5, 0.08, 0.12]} c={WOOD} />{['#d9a521', '#a23b2a', '#6d4c41'].map((c, i) => <Cy key={i} r={[0.03]} h={0.12} p={[(i - 1) * 0.15, 0.08, 0]} c={c} />)}</group>
  </group>;
}
function Fan() {
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 6; });
  return <group position={[0, 2.45, 0]}><Cy r={[0.015]} h={0.35} p={[0, 0, 0]} c="#5a4a3a" />
    <group ref={ref}><Cy r={[0.09, 0.1]} h={0.08} p={[0, -0.04, 0]} c="#6d5843" />
      {[0, 2.094, 4.189].map(a => <B key={a} s={[0.6, 0.012, 0.11]} p={[Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38]} r={[0, a, 0]} c="#7a6248" />)}</group></group>;
}
function Mandir() {
  return <group><B s={[0.8, 0.8, 0.45]} c={WOOD_L} /><B s={[0.8, 0.04, 0.45]} p={[0, 0.8, 0]} c="#d9a521" />
    <B s={[0.05, 0.85, 0.4]} p={[-0.37, 0.84, 0]} c={WOOD_L} /><B s={[0.05, 0.85, 0.4]} p={[0.37, 0.84, 0]} c={WOOD_L} /><B s={[0.8, 0.05, 0.45]} p={[0, 1.69, 0]} c={WOOD_L} />
    <B s={[0.8, 0.85, 0.02]} p={[0, 0.84, -0.2]} c="#a02a2a" />
    <mesh geometry={cylG(0.0, 0.32, 0.4, 4)} material={mat('#d9a521', 0.35, 0.5)} position={[0, 1.94, 0]} rotation={[0, Math.PI / 4, 0]} castShadow />
    <S r={0.07} p={[-0.15, 0.98, -0.08]} c={mat('#d9a521', 0.3, 0.7)} /><S r={0.09} p={[0.0, 1.0, -0.1]} c={mat('#e6b422', 0.3, 0.7)} /><S r={0.07} p={[0.15, 0.98, -0.08]} c={mat('#d9a521', 0.3, 0.7)} />
    <mesh geometry={torG(0.32, 0.025, Math.PI)} material={mat('#f39c12')} position={[0, 1.66, 0.2]} rotation={[0, 0, Math.PI]} />
    <Cy r={[0.04, 0.03]} h={0.03} p={[0.2, 0.84, 0.12]} c="#b5651d" /><S r={0.015} p={[0.2, 0.9, 0.12]} c={new THREE.MeshBasicMaterial({ color: '#ffb02e' })} />
  </group>;
}
function Scooter() {
  return <group><mesh geometry={torG(0.2, 0.06)} material={mat('#1a1a1a')} position={[0, 0.26, 0.62]} rotation={[0, Math.PI / 2, 0]} castShadow />
    <mesh geometry={torG(0.2, 0.06)} material={mat('#1a1a1a')} position={[0, 0.26, -0.62]} rotation={[0, Math.PI / 2, 0]} castShadow />
    <B s={[0.36, 0.3, 1.0]} p={[0, 0.3, -0.25]} c="#c0392b" /><B s={[0.3, 0.1, 0.55]} p={[0, 0.62, -0.3]} c="#222" /><B s={[0.36, 0.08, 0.5]} p={[0, 0.25, 0.3]} c="#c0392b" />
    <B s={[0.32, 0.65, 0.14]} p={[0, 0.3, 0.6]} c="#c0392b" r={[-0.2, 0, 0]} /><B s={[0.6, 0.04, 0.04]} p={[0, 1.0, 0.68]} c="#333" /><S r={0.07} p={[0, 0.85, 0.75]} c="#ffe9a8" /></group>;
}
function Tree({ palm }) {
  if (palm) return <group>{[0, 1, 2, 3, 4].map(i => <Cy key={i} r={[0.11, 0.13]} h={1.0} p={[i * 0.06, i * 0.98, 0]} c="#8b6b4a" rot={[0, 0, -0.06]} />)}
    {Array.from({ length: 8 }, (_, i) => <B key={i} s={[0.25, 0.03, 1.6]} p={[Math.sin(i * 0.785) * 0.75 + 0.3, 4.9, Math.cos(i * 0.785) * 0.75]} r={[0.5 * Math.cos(i * 0.785), i * 0.785, 0]} c="#3f7a2f" />)}
    {[0, 1, 2].map(i => <S key={i} r={0.1} p={[0.3 + Math.sin(i * 2) * 0.15, 4.85, Math.cos(i * 2) * 0.15]} c="#6b4a1f" />)}</group>;
  return <group><Cy r={[0.14, 0.2]} h={1.8} c="#6b4f36" />
    <S r={1.1} p={[0, 2.5, 0]} c="#4f7f34" /><S r={0.85} p={[0.6, 2.2, 0.3]} c="#5b8f3c" /><S r={0.8} p={[-0.5, 2.3, -0.3]} c="#46762e" /><S r={0.7} p={[0, 3.2, 0.1]} c="#5b8f3c" /></group>;
}
function Plant({ tulsi, big }) {
  if (tulsi) return <group><B s={[0.38, 0.55, 0.38]} c="#c8a27a" /><B s={[0.42, 0.06, 0.42]} p={[0, 0.55, 0]} c="#a2785a" />
    {[0, 1, 2, 3, 4].map(i => <S key={i} r={0.09} p={[Math.sin(i) * 0.08, 0.72 + i * 0.04, Math.cos(i) * 0.08]} c="#3e7d2c" />)}</group>;
  if (big) return <group><Cy r={[0.2, 0.15]} h={0.45} c="#e9e2d6" />
    {Array.from({ length: 7 }, (_, i) => <B key={i} s={[0.12, 0.9, 0.02]} p={[Math.sin(i) * 0.1, 0.4, Math.cos(i) * 0.1]} r={[0.35 * Math.cos(i * 0.9), i * 0.9, 0.35 * Math.sin(i * 0.9)]} c="#3c7a3a" />)}</group>;
  return <group><Cy r={[0.16, 0.12]} h={0.3} c="#b8633f" /><S r={0.2} p={[0, 0.45, 0]} c="#4a8a35" /><S r={0.14} p={[0.08, 0.6, 0.04]} c="#5b9c40" /></group>;
}

// tvOn: true when someone in the simulation is actually watching TV
export function Piece({ type, o = {}, tvOn }) {
  switch (type) {
    case 'bedDouble': return <Bed w={1.8} />;
    case 'bedSingle': return <Bed w={1.0} pillows={1} sheet={o.sheet} />;
    case 'bunk': return <Bunk />;
    case 'nightstand': return <group><B s={[0.45, 0.5, 0.4]} c={WOOD} /><B s={[0.12, 0.02, 0.01]} p={[0, 0.35, 0.2]} c="#d9a521" /></group>;
    case 'lampTable': return <group position={[0, 0.5, 0]}><Cy r={[0.05, 0.07]} h={0.18} c="#a07850" /><Cy r={[0.07, 0.13]} h={0.17} p={[0, 0.18, 0]} c="#f3e2b8" /></group>;
    case 'almirah': return <group><B s={[1.0, 1.9, 0.55]} c={mat('#7d8a96', 0.4, 0.5)} /><B s={[0.01, 1.8, 0.01]} p={[0, 0.05, 0.28]} c="#444" />
      <B s={[0.03, 0.18, 0.03]} p={[-0.06, 0.95, 0.29]} c="#ddd" /><B s={[0.03, 0.18, 0.03]} p={[0.06, 0.95, 0.29]} c="#ddd" /><B s={[0.6, 0.25, 0.4]} p={[0, 1.9, 0]} c="#8a5a3c" /></group>;
    case 'dresser': return <group><B s={[1.0, 0.75, 0.45]} c={WOOD} />{[0.2, 0.45].map(y => <B key={y} s={[0.9, 0.01, 0.01]} p={[0, y, 0.23]} c="#3a2a1a" />)}
      <Cy r={[0.03]} h={0.12} p={[-0.3, 0.75, 0]} c="#e87ba4" /><Cy r={[0.025]} h={0.08} p={[-0.2, 0.75, 0.05]} c="#d9a521" /><B s={[0.15, 0.05, 0.1]} p={[0.25, 0.75, 0]} c="#a23b2a" /></group>;
    case 'mirror': return <group position={[0, o.y ?? 1.4, 0]}><B s={[(o.w ?? 0.6) + 0.06, (o.h ?? 0.9) + 0.06, 0.03]} p={[0, -(o.h ?? 0.9) / 2 - 0.03, 0]} c={WOOD_D} />
      <mesh geometry={plG(o.w ?? 0.6, o.h ?? 0.9)} material={mat('#cfe0ea', 0.05, 0.9)} position={[0, 0, 0.02]} /></group>;
    case 'rug': return o.round ? <mesh geometry={gcache.rc || (gcache.rc = new THREE.CircleGeometry(0.5, 32))} material={texMat('rug' + o.color, TEX.rug(o.color))} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[o.w, o.d, 1]} receiveShadow />
      : <mesh geometry={plG(o.w, o.d)} material={texMat('rug' + o.color, TEX.rug(o.color))} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow />;
    case 'photo': return <group position={[0, o.y, 0]}><B s={[o.w + 0.08, o.h + 0.08, 0.03]} p={[0, -(o.h + 0.08) / 2, 0]} c="#6d4c2a" />
      <mesh geometry={plG(o.w, o.h)} material={texMat('ph' + o.img, TEX.photo(o.img))} position={[0, 0, 0.02]} /></group>;
    case 'ac': return <group position={[0, o.y, 0]}><B s={[0.9, 0.28, 0.22]} c={WHITE} /><B s={[0.8, 0.02, 0.01]} p={[0, 0.05, 0.11]} c="#bbb" /></group>;
    case 'fan': return <Fan />;
    case 'wc': return <group><Cy r={[0.18, 0.14]} h={0.4} p={[0, 0, 0.08]} c={WHITE} /><B s={[0.4, 0.4, 0.18]} p={[0, 0.35, -0.22]} c={WHITE} /></group>;
    case 'basin': return <group><Cy r={[0.08, 0.1]} h={0.7} c={WHITE} /><Cy r={[0.25, 0.18]} h={0.15} p={[0, 0.7, 0]} c={WHITE} /><Cy r={[0.012]} h={0.15} p={[0, 0.85, -0.15]} c={STEEL} /></group>;
    case 'bucket': return <group><Cy r={[0.17, 0.13]} h={0.33} c="#2e86c1" /><Cy r={[0.06, 0.05]} h={0.1} p={[0.25, 0, 0]} c="#e74c3c" /></group>;
    case 'geyser': return <group position={[0, o.y, 0]}><Cy r={[0.17]} h={0.5} p={[0, 0, 0.17]} c={WHITE} /></group>;
    case 'shower': return <group position={[0, o.y, 0]}><Cy r={[0.012]} h={0.3} p={[0, 0, 0]} c={STEEL} /><Cy r={[0.07, 0.04]} h={0.04} p={[0, 0.0, 0.1]} c={STEEL} /></group>;
    case 'mat': return <Plane w={o.w ?? 0.8} h={o.d ?? 0.5} p={[0, 0.013, 0]} c={o.color ?? '#5d8aa8'} />;
    case 'deskKids': return <Desk w={1.2} d={0.6} kids />;
    case 'desk': return <Desk w={1.2} d={0.6} />;
    case 'deskPC': return <Desk w={1.8} d={0.65} pc />;
    case 'chair': return <Chair color={o.color} />;
    case 'wardrobe': return <group><B s={[1.1, 2.0, 0.55]} c={WOOD_L} /><B s={[0.01, 1.9, 0.01]} p={[0, 0.05, 0.28]} c="#5a3a1a" />
      <mesh geometry={plG(0.4, 1.2)} material={mat('#cfe0ea', 0.05, 0.9)} position={[0.27, 1.1, 0.28]} /></group>;
    case 'toyBox': return <group><B s={[0.7, 0.4, 0.45]} c="#f39c12" /><S r={0.1} p={[-0.2, 0.5, 0]} c="#e74c3c" /><B s={[0.14, 0.14, 0.14]} p={[0.15, 0.4, 0.05]} c="#3498db" />
      <S r={0.09} p={[0.0, 0.52, 0.1]} c="#c08850" /><S r={0.06} p={[0.0, 0.64, 0.1]} c="#c08850" /><S r={0.08} p={[0.6, 0.08, 0.5]} c="#9b59b6" /></group>;
    case 'poster': return <group position={[0, o.y, 0]}><mesh geometry={plG(0.5, 0.7)} material={mat(o.color)} position={[0, 0, 0.01]} />
      <mesh geometry={plG(0.3, 0.3)} material={mat('#ffffff')} position={[0, 0.1, 0.012]} /></group>;
    case 'bookshelf': return <Bookshelf />;
    case 'armchair': return <Armchair color={o.color} />;
    case 'floorLamp': return <group><Cy r={[0.15]} h={0.03} c="#333" /><Cy r={[0.015]} h={1.5} c="#333" /><Cy r={[0.1, 0.2]} h={0.25} p={[0, 1.45, 0]} c="#f3e2b8" /></group>;
    case 'whiteboard': return <group position={[0, o.y, 0]}><B s={[1.2, 0.8, 0.03]} p={[0, -0.4, 0]} c="#9aa0a6" /><mesh geometry={plG(1.12, 0.72)} material={mat('#fbfbfb', 0.3)} position={[0, 0, 0.02]} /></group>;
    case 'sofa': return <Sofa />;
    case 'coffeeTable': return <group><B s={[1.2, 0.05, 0.6]} p={[0, 0.38, 0]} c={WOOD} />{legs(1.2, 0.6, 0.38)}<B s={[0.25, 0.02, 0.3]} p={[-0.3, 0.43, 0]} c="#c0392b" />
      <Cy r={[0.12, 0.08]} h={0.08} p={[0.25, 0.43, 0]} c={STEEL} /><S r={0.04} p={[0.22, 0.52, 0]} c="#f39c12" /><S r={0.04} p={[0.29, 0.52, 0.03]} c="#c0392b" /></group>;
    case 'tvUnit': return <group><B s={[2.2, 0.45, 0.45]} c={WOOD_D} />{[-0.55, 0.55].map(x => <B key={x} s={[1.0, 0.01, 0.01]} p={[x, 0.22, 0.23]} c="#a07850" />)}
      <B s={[0.3, 0.1, 0.25]} p={[-0.8, 0.45, 0]} c="#222" /><Cy r={[0.06, 0.09]} h={0.3} p={[0.85, 0.45, 0]} c="#2c6e6a" /></group>;
    case 'tvWall': return <group position={[0, o.y, 0]}><B s={[1.3, 0.76, 0.05]} p={[0, -0.38, 0]} c="#111" />
      <mesh geometry={plG(1.24, 0.7)} material={tvOn ? (gcache.tvOn || (gcache.tvOn = new THREE.MeshBasicMaterial({ color: '#7fb3e0' }))) : mat('#0b0b0b', 0.2)} position={[0, 0, 0.03]} /></group>;
    case 'mandir': return <Mandir />;
    case 'clock': return <group position={[0, o.y, 0]}><Cy r={[0.17]} h={0.04} rot={[Math.PI / 2, 0, 0]} c="#6d4c2a" /><Cy r={[0.15]} h={0.045} rot={[Math.PI / 2, 0, 0]} c={WHITE} />
      <B s={[0.012, 0.1, 0.01]} p={[0, 0, 0.035]} c="#111" /><B s={[0.07, 0.012, 0.01]} p={[0.03, 0, 0.035]} c="#111" /></group>;
    case 'curtain': return <group>{[-1, 1].map(k => <B key={k} s={[0.35, 2.3, 0.06]} p={[k * (o.w / 2 + 0.05), 0, 0.03]} c="#7b2d3b" />)}</group>;
    case 'diningTable': return <group><B s={[1.8, 0.05, 0.95]} p={[0, 0.72, 0]} c={WOOD} />{legs(1.8, 0.95, 0.72)}<Cy r={[0.1, 0.07]} h={0.1} p={[0, 0.77, 0]} c={STEEL} /></group>;
    case 'thali': return <group position={[0, 0.77, 0]}><Cy r={[0.14]} h={0.012} c={STEEL} /><Cy r={[0.04]} h={0.03} p={[0.07, 0.01, -0.04]} c={STEEL} /><Cy r={[0.04]} h={0.03} p={[-0.06, 0.01, -0.05]} c={STEEL} />
      <Cy r={[0.035]} h={0.025} p={[-0.02, 0.012, 0.05]} c="#f4e6c8" /></group>;
    case 'washBasin': return <group><B s={[0.5, 0.15, 0.4]} p={[0, 0.75, 0]} c={WHITE} /><Cy r={[0.012]} h={0.2} p={[0, 0.9, -0.15]} c={STEEL} /></group>;
    case 'shoeRack': return <group><B s={[0.9, 0.5, 0.35]} c={WOOD} /><B s={[0.12, 0.08, 0.25]} p={[-0.25, 0.5, 0]} c="#222" /><B s={[0.12, 0.08, 0.25]} p={[-0.1, 0.5, 0]} c="#222" />
      <B s={[0.1, 0.06, 0.22]} p={[0.15, 0.5, 0]} c="#d93b3b" /><B s={[0.11, 0.05, 0.24]} p={[0.3, 0.5, 0]} c="#7a4a2b" /></group>;
    case 'counter': return <Counter len={o.len} stove={o.stove} sink={o.sink} center={o.center} />;
    case 'fridge': return <group><B s={[0.7, 1.7, 0.68]} c={mat('#d8dde2', 0.3, 0.4)} /><B s={[0.7, 0.01, 0.01]} p={[0, 1.15, 0.345]} c="#888" />
      <B s={[0.03, 0.4, 0.03]} p={[0.28, 1.25, 0.36]} c="#888" /><B s={[0.03, 0.5, 0.03]} p={[0.28, 0.55, 0.36]} c="#888" /><B s={[0.08, 0.08, 0.01]} p={[-0.15, 1.4, 0.345]} c="#e74c3c" /></group>;
    case 'chimney': return <group position={[0, o.y, 0]}><B s={[0.9, 0.12, 0.5]} p={[0, 0, 0.1]} c={STEEL} /><B s={[0.3, 0.6, 0.25]} p={[0, 0.12, -0.02]} c={STEEL} /></group>;
    case 'purifier': return <group position={[0, o.y, 0]}><B s={[0.3, 0.45, 0.16]} p={[0, -0.45, 0.08]} c="#f6f8fa" /><B s={[0.28, 0.12, 0.01]} p={[0, -0.2, 0.165]} c="#2e86c1" /></group>;
    case 'tubelight': return <group position={[0, o.y, 0]}><mesh geometry={cylG(0.02, 0.02, 1.2, 8)} material={gcache.tube || (gcache.tube = new THREE.MeshBasicMaterial({ color: '#fbfbf2' }))} rotation={[0, 0, Math.PI / 2]} position={[0, 0, 0.05]} /></group>;
    case 'caneChair': return <group><Cy r={[0.28, 0.24]} h={0.08} p={[0, 0.38, 0]} c="#b08a4f" /><mesh geometry={torG(0.28, 0.06, Math.PI)} material={mat('#b08a4f')} position={[0, 0.62, -0.05]} rotation={[-0.3, 0, 0]} castShadow />
      <Cy r={[0.2, 0.26]} h={0.38} c="#9c7a45" /></group>;
    case 'roundTable': return <group><Cy r={[0.3]} h={0.04} p={[0, 0.55, 0]} c="#9c7a45" /><Cy r={[0.04]} h={0.55} c="#6b4f36" /><Cy r={[0.035, 0.03]} h={0.07} p={[0.1, 0.59, 0]} c={WHITE} />
      <B s={[0.25, 0.01, 0.35]} p={[-0.08, 0.59, 0.02]} c="#e9e4d6" /></group>;
    case 'plant': return <Plant tulsi={o.tulsi} />;
    case 'bigPlant': return <Plant big />;
    case 'dryingRack': return <group><B s={[1.0, 0.03, 0.03]} p={[0, 1.05, -0.2]} c="#bbb" /><B s={[1.0, 0.03, 0.03]} p={[0, 1.05, 0.2]} c="#bbb" />
      {[-0.48, 0.48].map(x => <B key={x} s={[0.03, 1.05, 0.5]} p={[x, 0, 0]} c="#bbb" />)}
      {[['#2a78d6', -0.3], ['#eda100', 0], ['#e87ba4', 0.28]].map(([c, x]) => <B key={x} s={[0.22, 0.35, 0.02]} p={[x, 0.7, 0]} c={c} />)}</group>;
    case 'nameplate': return <group position={[0, o.y, 0]}><B s={[0.36, 0.14, 0.02]} c={mat('#c9a23a', 0.3, 0.7)} /></group>;
    case 'path': return <mesh geometry={meterPlane(o.w, o.d)} material={texMat('stone', TEX.stone())} position={[0, 0.01, 0]} receiveShadow />;
    case 'scooter': return <Scooter />;
    case 'tree': return <Tree />;
    case 'palm': return <Tree palm />;
    case 'flowerBed': return <group><B s={[o.w, 0.15, o.d]} c="#6b4a2f" />{Array.from({ length: Math.round(o.w * 4) }, (_, i) =>
      <S key={i} r={0.09} p={[-o.w / 2 + 0.15 + i * 0.25, 0.22, ((i * 7) % 3 - 1) * 0.2]} c={['#f39c12', '#f1c40f', '#e74c3c', '#ff7aa2'][i % 4]} />)}</group>;
    default: return null;
  }
}
