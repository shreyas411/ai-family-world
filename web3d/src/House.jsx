// The house: floors, walls with doors/windows (cut away when they face the camera), furniture, exterior and lighting.
import * as THREE from 'three';
import { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { ROOMS, WALLS, RAILINGS, FURNITURE, PLOT, GATE, WALL_H, roomAt } from './layout.js';
import { Piece } from './furniture.jsx';
import { TEX, texMat, mat, glass, meterPlane } from './textures.js';
import { view } from './store.js';

const ROOM_PAINT = { parents_bedroom: '#ead9c6', kids_bedroom: '#cfe5f1', study: '#e3e8cf', bathroom: '#f2f6f7', hallway: '#f2e6d2',
  living_room: '#f2e6d2', dining: '#f2e6d2', kitchen: '#f6f0e3', balcony: '#e6c99a', entrance: '#e6c99a' };
const EXT = '#e2c08f', CUT = '#6f6253', CUT_H = 0.35;
const unit = new THREE.BoxGeometry(1, 1, 1);
const paint = c => mat(c, 0.92);

// --- walls ------------------------------------------------------------------------------------------------
function wallPieces(w) {
  const horiz = w.a[1] === w.b[1], L = horiz ? w.b[0] - w.a[0] : w.b[1] - w.a[1], T = w.ext ? 0.2 : 0.12;
  const ops = [...w.open].sort((p, q) => p.c - q.c), pieces = [];
  let x = 0;
  for (const o of ops) {
    const s = o.c - o.w / 2, e = o.c + o.w / 2;
    if (s > x) pieces.push([x, s, 0, WALL_H]);
    if (o.sill > 0) pieces.push([s, e, 0, o.sill]);
    pieces.push([s, e, o.top, WALL_H]);
    x = e;
  }
  if (x < L) pieces.push([x, L, 0, WALL_H]);
  // which colour each face gets: the room on that side, or exterior paint
  const mid = horiz ? [w.a[0] + L / 2, w.a[1]] : [w.a[0], w.a[1] + L / 2];
  const side = k => {
    const p = horiz ? [mid[0], mid[1] + k * 0.3] : [mid[0] + k * 0.3, mid[1]];
    if (w.ext && (horiz ? w.out[1] : w.out[0]) === k) return EXT;
    return ROOM_PAINT[roomAt(...p)] || EXT;
  };
  const pos = side(1), neg = side(-1), cut = paint(CUT);
  const mats = horiz ? [paint(pos), paint(pos), cut, cut, paint(pos), paint(neg)] : [paint(pos), paint(neg), cut, cut, paint(pos), paint(pos)];
  return { horiz, L, T, pieces, mats, ops };
}

function Wall({ w, idx }) {
  const P = useMemo(() => wallPieces(w), [w]);
  const refs = useRef([]), extras = useRef(), last = useRef(null);
  useFrame(() => {
    const low = view.wallLow[idx];
    if (low === last.current) return;
    last.current = low;
    const cutH = low ? CUT_H : WALL_H;
    P.pieces.forEach(([, , y0, y1], i) => {
      const m = refs.current[i]; if (!m) return;
      const h = Math.min(y1, cutH) - y0;
      m.visible = h > 0.001; m.scale.y = Math.max(h, 0.001); m.position.y = y0 + m.scale.y / 2;
    });
    if (extras.current) extras.current.visible = !low;
  });
  const at = (s, e) => P.horiz ? [w.a[0] + (s + e) / 2, 0, w.a[1]] : [w.a[0], 0, w.a[1] + (s + e) / 2];
  const sc = (s, e) => P.horiz ? [e - s, 1, P.T] : [P.T, 1, e - s];
  return <group>
    {P.pieces.map(([s, e], i) => <mesh key={i} ref={el => (refs.current[i] = el)} geometry={unit} material={P.mats} position={at(s, e)} scale={sc(s, e)} castShadow receiveShadow />)}
    <group ref={extras}>{P.ops.map((o, i) => <Opening key={i} o={o} w={w} P={P} />)}</group>
  </group>;
}

function Opening({ o, w, P }) {
  const along = P.horiz ? [w.a[0] + o.c, w.a[1]] : [w.a[0], w.a[1] + o.c];
  const rotY = P.horiz ? 0 : Math.PI / 2;
  if (o.kind === 'window') {
    const h = o.top - o.sill;
    return <group position={[along[0], o.sill, along[1]]} rotation={[0, rotY, 0]}>
      <mesh geometry={unit} material={glass()} position={[0, h / 2, 0]} scale={[o.w, h, 0.02]} />
      {[[0, h / 2, o.w, 0.06], [0, 0, o.w + 0.08, 0.06], [0, h, o.w + 0.08, 0.06]].map(([x, y, sw, sh], i) =>
        <mesh key={i} geometry={unit} material={mat('#f5f2ea', 0.5)} position={[x, y, 0]} scale={[sw, sh, P.T + 0.04]} />)}
      {[-o.w / 2, o.w / 2].map(x => <mesh key={x} geometry={unit} material={mat('#f5f2ea', 0.5)} position={[x, h / 2, 0]} scale={[0.06, h, P.T + 0.04]} />)}
      {Array.from({ length: Math.max(2, Math.round(o.w / 0.18)) - 1 }, (_, i) =>
        <mesh key={i} geometry={unit} material={mat('#3a3a3a', 0.4, 0.6)} position={[-o.w / 2 + (i + 1) * o.w / Math.max(2, Math.round(o.w / 0.18)), h / 2, (w.out ? (P.horiz ? w.out[1] : w.out[0]) : 1) * 0.07]} scale={[0.015, h, 0.015]} />)}
    </group>;
  }
  if (o.kind === 'slider') return <group position={[along[0], 0, along[1]]} rotation={[0, rotY, 0]}>
    <mesh geometry={unit} material={glass()} position={[-o.w / 4, o.top / 2, 0]} scale={[o.w / 2, o.top, 0.02]} />
    <mesh geometry={unit} material={mat('#8a8f94', 0.4, 0.6)} position={[-o.w / 2 + 0.02, o.top / 2, 0]} scale={[0.04, o.top, 0.06]} />
    <mesh geometry={unit} material={mat('#8a8f94', 0.4, 0.6)} position={[0, o.top / 2, 0]} scale={[0.04, o.top, 0.06]} /></group>;
  if (o.kind !== 'door') return null;
  // frame + an open door leaf, swung 90° to the -z / -x side (swing: 1 flips it)
  const hinge = -o.w / 2 * (o.hinge || 1);
  return <group position={[along[0], 0, along[1]]} rotation={[0, rotY, 0]}>
    {[-o.w / 2, o.w / 2].map(x => <mesh key={x} geometry={unit} material={mat('#5a3a22', 0.6)} position={[x, o.top / 2, 0]} scale={[0.06, o.top, P.T + 0.03]} />)}
    <mesh geometry={unit} material={mat('#5a3a22', 0.6)} position={[0, o.top, 0]} scale={[o.w + 0.06, 0.06, P.T + 0.03]} />
    <mesh geometry={unit} material={mat(w.ext ? '#6b3f22' : '#9c6a3c', 0.6)} position={[hinge, o.top / 2 - 0.02, (o.swing || -1) * ((o.w - 0.04) / 2 + P.T / 2)]}
      scale={[0.04, o.top - 0.04, o.w - 0.04]} castShadow />
  </group>;
}

// decides which walls are cut down this frame
function WallCutter() {
  const { camera } = useThree();
  useFrame(() => {
    const t = view.target, cx = camera.position.x - t.x, cz = camera.position.z - t.z, n = Math.hypot(cx, cz) || 1;
    WALLS.forEach((w, i) => {
      if (view.walls !== 'cutaway') { view.wallLow[i] = view.walls === 'down'; return; }
      const horiz = w.a[1] === w.b[1], facing = Math.abs(horiz ? cz / n : cx / n) > 0.42;
      const coord = horiz ? w.a[1] : w.a[0], camSide = (horiz ? camera.position.z : camera.position.x) - coord, tSide = (horiz ? t.z : t.x) - coord;
      // does the sight line camera → target cross this wall segment?
      let between = camSide * tSide < 0;
      if (between) {
        const k = camSide / (camSide - tSide), along = horiz ? camera.position.x + (t.x - camera.position.x) * k : camera.position.z + (t.z - camera.position.z) * k;
        const lo = horiz ? w.a[0] : w.a[1], hi = horiz ? w.b[0] : w.b[1];
        between = along > lo - 1.5 && along < hi + 1.5;
      }
      if (view.mode !== 'house') { view.wallLow[i] = between || (facing && !w.ext && camSide * tSide < 0); return; }
      if (w.ext) { const out = horiz ? w.out[1] : w.out[0]; view.wallLow[i] = facing && camSide * out > 0; return; }
      view.wallLow[i] = facing;
    });
  });
  return null;
}

// furniture mounted on a wall hides when that wall is cut down
function OnWall({ idx, children }) {
  const ref = useRef();
  useFrame(() => { if (ref.current) ref.current.visible = !view.wallLow[idx]; });
  return <group ref={ref}>{children}</group>;
}

// --- rooms: floors + click targets ------------------------------------------------------------------------
const pickMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0, depthWrite: false });
const hoverMat = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.14, depthWrite: false });
function Floors({ onRoom }) {
  const [hover, setHover] = useState(null);
  return Object.entries(ROOMS).map(([id, r]) => {
    const [x0, z0, x1, z1] = r.rect, w = x1 - x0, d = z1 - z0;
    return <group key={id} position={[(x0 + x1) / 2, 0, (z0 + z1) / 2]}>
      <mesh geometry={meterPlane(w, d)} material={texMat('floor' + r.floor, TEX[r.floor]())} position={[0, 0.004, 0]} receiveShadow />
      <mesh geometry={meterPlane(w, d)} material={hover === id ? hoverMat : pickMat} position={[0, 0.02, 0]}
        onPointerOver={e => { e.stopPropagation(); setHover(id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(h => (h === id ? null : h)); document.body.style.cursor = ''; }}
        onClick={e => { if (e.delta > 5) return; e.stopPropagation(); onRoom(id); }} />
    </group>;
  });
}

// --- exterior ---------------------------------------------------------------------------------------------
function Exterior() {
  const [x0, z0, x1, z1] = PLOT, H = 1.5, gw = GATE.w;
  const wallSeg = (a, b, key) => {
    const horiz = a[1] === b[1], L = horiz ? b[0] - a[0] : b[1] - a[1];
    return <group key={key}><mesh geometry={unit} material={mat('#d8c3a0')} position={horiz ? [a[0] + L / 2, H / 2, a[1]] : [a[0], H / 2, a[1] + L / 2]}
      scale={horiz ? [L, H, 0.2] : [0.2, H, L]} castShadow receiveShadow />
      <mesh geometry={unit} material={mat('#a5865c')} position={horiz ? [a[0] + L / 2, H + 0.04, a[1]] : [a[0], H + 0.04, a[1] + L / 2]} scale={horiz ? [L + 0.1, 0.08, 0.3] : [0.3, 0.08, L + 0.1]} /></group>;
  };
  return <group>
    <mesh geometry={meterPlane(80, 80)} material={texMat('grass', TEX.grass())} position={[8, -0.01, 8]} receiveShadow />
    <mesh geometry={meterPlane(80, 6)} material={texMat('road', TEX.road())} position={[8, 0.0, 23.5]} receiveShadow />
    {Array.from({ length: 16 }, (_, i) => <mesh key={i} geometry={unit} material={mat('#f2f2f2')} position={[-30 + i * 5, 0.01, 23.5]} scale={[2, 0.01, 0.15]} />)}
    {wallSeg([x0, z0], [x1, z0], 'n')}{wallSeg([x0, z0], [x0, z1], 'w')}{wallSeg([x1, z0], [x1, z1], 'e')}
    {wallSeg([x0, z1], [GATE.x - gw / 2, z1], 'sw')}{wallSeg([GATE.x + gw / 2, z1], [x1, z1], 'se')}
    {[-1, 1].map(k => <group key={k} position={[GATE.x + k * gw / 2, 0, z1]} rotation={[0, k * 1.3, 0]}>
      {Array.from({ length: 6 }, (_, i) => <mesh key={i} geometry={unit} material={mat('#2d3a40', 0.4, 0.6)} position={[-k * (0.07 + i * 0.13), 0.75, 0]} scale={[0.03, 1.4, 0.03]} />)}
      <mesh geometry={unit} material={mat('#2d3a40', 0.4, 0.6)} position={[-k * 0.4, 1.4, 0]} scale={[0.8, 0.05, 0.04]} />
      <mesh geometry={unit} material={mat('#2d3a40', 0.4, 0.6)} position={[-k * 0.4, 0.15, 0]} scale={[0.8, 0.05, 0.04]} /></group>)}
    {/* house plinth + roof parapet hints */}
    <mesh geometry={unit} material={mat('#b9a588')} position={[8, -0.055, 6]} scale={[16.4, 0.1, 12.4]} receiveShadow />
    <mesh geometry={unit} material={mat('#b9a588')} position={[-1.25, -0.055, 9.25]} scale={[2.6, 0.1, 5.6]} receiveShadow />
    <mesh geometry={unit} material={mat('#b9a588')} position={[9.25, -0.055, 13.25]} scale={[3.6, 0.1, 2.6]} receiveShadow />
    {RAILINGS.map(([a, b], i) => {
      const horiz = a[1] === b[1], L = horiz ? b[0] - a[0] : b[1] - a[1];
      return <group key={i}>
        <mesh geometry={unit} material={mat('#3b4a52', 0.4, 0.6)} position={horiz ? [a[0] + L / 2, 1.0, a[1]] : [a[0], 1.0, a[1] + L / 2]} scale={horiz ? [L, 0.05, 0.06] : [0.06, 0.05, L]} />
        {Array.from({ length: Math.round(L / 0.15) }, (_, k) => <mesh key={k} geometry={unit} material={mat('#3b4a52', 0.4, 0.6)}
          position={horiz ? [a[0] + k * 0.15 + 0.07, 0.5, a[1]] : [a[0], 0.5, a[1] + k * 0.15 + 0.07]} scale={[0.02, 1.0, 0.02]} />)}
      </group>;
    })}
    {[[-14, 30, 10, 6], [3, 32, 8, 9], [20, 30, 12, 7], [-20, 8, 8, 8], [34, 6, 9, 10]].map(([x, z, w, h], i) =>
      <group key={i}><mesh geometry={unit} material={mat(['#e8d8b8', '#cfdde6', '#f0d7c7', '#dfe6d0', '#e9e0d0'][i])} position={[x, h / 2, z]} scale={[w, h, 7]} />
        {Array.from({ length: Math.floor(h / 3) }, (_, r) => Array.from({ length: Math.floor(w / 2.5) }, (_, c) =>
          <mesh key={`${r}-${c}`} geometry={unit} material={mat('#5b7a99', 0.2)} position={[x - w / 2 + 1.3 + c * 2.5, 1.8 + r * 3, z - 3.51]} scale={[1, 1.1, 0.02]} />))}</group>)}
  </group>;
}

// --- lighting: sun follows the simulation clock; room lights are on at night only where someone is awake ----
export function daylight(minute) {
  const h = minute / 60, ss = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
  return ss(5.5, 7, h) * (1 - ss(18, 19.5, h));
}
function Lights({ minute, lit, quality }) {
  const sun = useRef(), hemi = useRef(), { scene } = useThree();
  const day = daylight(minute);
  const sky = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    sky.set('#0c1626').lerp(new THREE.Color('#bcdcf0'), day);
    scene.background = sky; if (scene.fog) scene.fog.color.copy(sky);
  });
  const ang = ((minute / 60 - 6) / 13) * Math.PI;  // 6:00 east → 19:00 west
  const sp = [8 + Math.cos(ang) * 22, Math.max(2, Math.sin(ang) * 22), 6 + 10];
  const night = 1 - day, high = quality === 'high';
  return <>
    <hemisphereLight ref={hemi} args={['#dfefff', '#8a7a5f', 0.35 + day * 0.75 + (high ? 0 : night * 0.25)]} />
    <directionalLight ref={sun} position={sp} intensity={0.2 + day * 2.2} color={day > 0.3 ? '#fff4e0' : '#9fb4ff'} castShadow={high}
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-16} shadow-camera-right={16} shadow-camera-top={16} shadow-camera-bottom={-16}
      shadow-camera-far={70} shadow-bias={-0.0004} target-position={[7, 0, 7]} />
    {high && Object.entries(ROOMS).map(([id, r]) => {
      const [x0, z0, x1, z1] = r.rect;
      return <pointLight key={id} position={[(x0 + x1) / 2, 2.5, (z0 + z1) / 2]} color="#ffe2b0" distance={7} decay={1.6}
        intensity={night * (lit.has(id) || id === 'entrance' || id === 'hallway' ? (id === 'hallway' ? 0.8 : 3.2) : 0)} />;
    })}
  </>;
}

export function House({ minute, lit, tvOn, quality, onRoom }) {
  const furniture = useMemo(() => FURNITURE.map((f, i) => {
    const [type, x, z, rot = 0, o = {}] = f;
    const opts = type === 'counter' ? { ...o, center: z } : o;
    const el = <group key={i} position={[x, 0, z]} rotation={[0, rot, 0]}><Piece type={type} o={opts} tvOn={type === 'tvWall' && tvOn} /></group>;
    return o.wall != null ? <OnWall key={i} idx={o.wall}>{el}</OnWall> : el;
  }), [tvOn]);
  return <group>
    <Lights minute={minute} lit={lit} quality={quality} />
    <WallCutter />
    <Exterior />
    <Floors onRoom={onRoom} />
    {WALLS.map((w, i) => <Wall key={i} w={w} idx={i} />)}
    {furniture}
  </group>;
}
