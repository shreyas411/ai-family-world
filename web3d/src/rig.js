// Procedural low-poly characters: a named bone hierarchy (Object3D joints) dressed with primitive meshes, animated by
// THREE.AnimationMixer clips that target the joints by name. Clips are built once and shared by every character.
// A GLB character with the same clip names can replace any of these (see Character.jsx / public/models/manifest.json).
import * as THREE from 'three';

const D = THREE.MathUtils.DEG2RAD;
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const HIPS_Y = 0.95;

// Looks per family member. Unknown (user-added) members get a generic outfit in their dashboard colour.
// Matched to the family reference art (web3d/public/avatars/<id>.jpg are crops of it, used on the HUD cards).
export const LOOKS = {
  father: { height: 1.72, skin: '#c68a62', hair: '#191514', hairStyle: 'side', top: '#a9c4e6', sleeves: 'rolled', bottom: '#4a4d54',
    shoes: '#2e2420', extras: ['mustache', 'collar', 'belt', 'watch'], belly: 1.08 },
  mother: { height: 1.58, skin: '#c98d66', hair: '#151110', hairStyle: 'bun', top: '#b3264f', sleeves: 'short', bottom: '#c8346a',
    shoes: '#7a4a2b', skirt: { color: '#c8346a', len: 0.62, flare: 0.34, border: '#d9a845' }, extras: ['bindi', 'pallu', 'bangles', 'earrings', 'necklace'] },
  son: { height: 1.78, skin: '#c48a63', hair: '#14110f', hairStyle: 'messy', top: '#1f2433', sleeves: 'long', bottom: '#4a6d96',
    shoes: '#ececec', extras: ['hoodie', 'headphones'], bag: '#22252c' },
  daughter: { height: 1.6, skin: '#cc9470', hair: '#17110f', hairStyle: 'long', top: '#c4a6dc', sleeves: 'long', bottom: '#8fb0d6',
    shoes: '#f0ece6', extras: ['earrings'], bag: '#2a2a33' },
  anu: { height: 1.25, skin: '#d29a74', hair: '#16110f', hairStyle: 'pigtails', top: '#f8d3e2', sleeves: 'short', bottom: '#f09cc0',
    shoes: '#f06d9c', extras: ['unicorn'], bag: '#8a5cc8', child: true },
};
export function lookFor(a) {
  if (LOOKS[a.id]) return LOOKS[a.id];
  const h = a.age < 13 ? 1.2 + a.age * 0.02 : a.age < 18 ? 1.6 : 1.68;
  return { height: h, skin: '#a06b4a', hair: a.age > 55 ? '#bdbdbd' : '#1a1513', hairStyle: 'short', top: a.color || '#777', sleeves: 'short',
    bottom: '#454a52', shoes: '#333', child: a.age < 13 };
}

// shared geometries/materials so five characters don't create five copies of everything
const geo = {}, mats = {};
const G = (k, f) => geo[k] || (geo[k] = f());
const M = (color, rough = 0.85) => mats[color + rough] || (mats[color + rough] = new THREE.MeshStandardMaterial({ color, roughness: rough }));
const capsule = (r, l) => G(`c${r}${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const sphere = r => G(`s${r}`, () => new THREE.SphereGeometry(r, 16, 12));
const box = (x, y, z) => G(`b${x}${y}${z}`, () => new THREE.BoxGeometry(x, y, z));
const cyl = (a, b, h, n = 14, open = false) => G(`y${a}${b}${h}${n}${open}`, () => new THREE.CylinderGeometry(a, b, h, n, 1, open));

function mesh(g, m, pos = [0, 0, 0], rot, scale) {
  const o = new THREE.Mesh(g, m); o.position.set(...pos);
  if (rot) o.rotation.set(...rot); if (scale) o.scale.set(...scale);
  o.castShadow = true; return o;
}
function joint(name, parent, pos) { const j = new THREE.Group(); j.name = name; j.position.set(...pos); parent.add(j); return j; }
// limb segment hanging down from a joint: capsule whose top sits at the joint
const limb = (r, len, m) => mesh(capsule(r, len), m, [0, -(len / 2 + r * 0.6), 0]);

export function buildCharacter(look) {
  const root = new THREE.Group(), s = look.height / 1.73, kid = look.child ? 1.14 : 1;
  const skin = M(look.skin, 0.7), top = M(look.top), bottom = M(look.bottom), shoes = M(look.shoes, 0.6), hair = M(look.hair, 0.6);
  const body = new THREE.Group(); body.scale.setScalar(s); root.add(body);

  const hips = joint('hips', body, [0, HIPS_Y, 0]);
  hips.add(mesh(capsule(0.11, 0.1), look.skirt ? M(look.skirt.color) : bottom, [0, -0.02, 0], [0, 0, H90], [1, 1, 0.78]));
  const spine = joint('spine', hips, [0, 0.1, 0]);
  spine.add(mesh(capsule(0.125 * (look.belly || 1), 0.08), top, [0, 0.06, 0.005 * (look.belly || 1)], null, [1.1, 1, 0.85 * (look.belly || 1)]));
  const chest = joint('chest', spine, [0, 0.2, 0]);
  chest.add(mesh(capsule(0.145, 0.12), top, [0, 0.07, 0], null, [1.18, 1, 0.78]));
  const ex = look.extras || [];
  if (ex.includes('collar')) for (const x of [-1, 1]) chest.add(mesh(box(0.07, 0.02, 0.05), top, [0.04 * x, 0.2, 0.07], [0.5, 0, 0.5 * x]));
  if (ex.includes('collar')) chest.add(mesh(box(0.012, 0.22, 0.01), M('#8fb0d8'), [0.0, 0.06, 0.118]));                           // button placket
  if (ex.includes('belt')) { spine.add(mesh(cyl(0.142, 0.142, 0.04, 18), M('#4a2e1f', 0.5), [0, -0.05, 0], null, [1.1, 1, 0.85]));
    spine.add(mesh(box(0.05, 0.035, 0.01), M('#c9b27a', 0.3), [0, -0.05, 0.124])); }
  if (ex.includes('hoodie')) {                                                                                                     // open zip-up over a white tee
    chest.add(mesh(box(0.11, 0.3, 0.02), M('#f2f2f2'), [0, 0.06, 0.105]));
    spine.add(mesh(box(0.11, 0.16, 0.02), M('#f2f2f2'), [0, 0.06, 0.11]));
    chest.add(mesh(capsule(0.07, 0.16), top, [0, 0.2, -0.1], [0, 0, H90]));                                                       // hood
  }
  if (ex.includes('headphones')) {
    chest.add(mesh(G('hp', () => new THREE.TorusGeometry(0.085, 0.012, 6, 18, Math.PI)), M('#141414', 0.4), [0, 0.24, 0.02], [H90 + 0.5, 0, 0]));
    for (const x of [-1, 1]) chest.add(mesh(cyl(0.04, 0.04, 0.03, 14), M('#1b1b1b', 0.4), [0.075 * x, 0.23, 0.07], [0.3, 0, H90]));
  }
  if (ex.includes('unicorn')) {
    chest.add(mesh(box(0.08, 0.07, 0.01), M('#ffffff'), [0, 0.06, 0.115]));
    chest.add(mesh(box(0.05, 0.02, 0.012), M('#b48ae0'), [0, 0.1, 0.115]));
  }
  if (ex.includes('necklace')) chest.add(mesh(G('neckl', () => new THREE.TorusGeometry(0.07, 0.004, 4, 20)), M('#d9a845', 0.3), [0, 0.19, 0.04], [1.2, 0, 0]));
  if (look.extras?.includes('pallu')) {
    chest.add(mesh(box(0.11, 0.62, 0.03), M(look.skirt.color), [0.03, 0.02, 0.118], [0, 0, -0.62]));
    chest.add(mesh(box(0.11, 0.55, 0.03), M(look.skirt.color), [0.13, -0.08, -0.11], [0.15, 0, 0.1]));
    chest.add(mesh(box(0.115, 0.03, 0.035), M(look.skirt.border), [0.155, 0.2, 0.12], [0, 0, -0.62]));
  }
  const neck = joint('neck', chest, [0, 0.22, 0]);
  neck.add(mesh(cyl(0.045, 0.05, 0.09), skin, [0, 0.03, 0]));
  const head = joint('head', neck, [0, 0.07, 0]);
  const hs = look.child ? 1.42 : 1.28;                                                           // cartoon proportions: big heads
  const face = new THREE.Group(); face.position.set(0, 0.1 * hs, 0); face.scale.setScalar(hs); head.add(face);
  face.add(mesh(sphere(0.11), skin, [0, 0, 0], null, [0.95, 1.08, 1]));
  const eyes = [], brows = [];
  let smile, ooh;
  face.add(mesh(sphere(0.018), skin, [0, -0.012, 0.108], null, [0.8, 1, 0.9]));                  // nose
  for (const x of [-0.105, 0.105]) face.add(mesh(sphere(0.022), skin, [x, 0, 0], null, [0.5, 1, 0.8]));  // ears
  const eyeW = G('eyeW', () => new THREE.SphereGeometry(0.021, 16, 12).scale(1, 1.2, 0.55));
  for (const x of [-0.04, 0.04]) {                                                              // big glossy eyes: white, brown iris, pupil, highlight
    const e = mesh(eyeW, M('#ffffff', 0.3), [x, 0.018, 0.097]);
    e.add(mesh(sphere(0.0145), M('#4a2a16', 0.25), [0, -0.001, 0.006]), mesh(sphere(0.0075), M('#0d0806', 0.2), [0, -0.001, 0.0125]),
      mesh(sphere(0.0038), M('#ffffff', 0.1), [0.005, 0.006, 0.016]));
    face.add(e); eyes.push(e);
    const b = mesh(box(0.046, 0.011, 0.012), hair, [x, 0.048, 0.1], null); face.add(b); brows.push(b);
  }
  if (ex.includes('earrings')) for (const x of [-0.106, 0.106]) face.add(mesh(sphere(0.008), M('#d9a845', 0.3), [x, -0.03, 0.01]));
  const mouth = new THREE.Group(); mouth.position.set(0, -0.045, 0.098); face.add(mouth);
  smile = mesh(G('smile', () => new THREE.TorusGeometry(0.028, 0.0045, 6, 16, Math.PI * 0.7).rotateZ(Math.PI * 0.15)), M('#6a2a2a', 0.5), [0, 0, 0]);
  ooh = mesh(G('ooh', () => new THREE.TorusGeometry(0.012, 0.005, 6, 12)), M('#4a1a1a', 0.5));
  mouth.add(smile, ooh);
  if (ex.includes('mustache')) for (const x of [-1, 1])
    face.add(mesh(capsule(0.009, 0.03), hair, [0.018 * x, -0.03, 0.106], [0, 0, H90 + 0.35 * x]));
  if (ex.includes('bindi')) face.add(mesh(sphere(0.006), M('#c0101a', 0.4), [0, 0.06, 0.106]));
  buildHair(face, look, hair);

  const arm = side => {
    const sx = side === 'L' ? 1 : -1;
    const sh = joint(`upperArm${side}`, chest, [0.19 * sx, 0.17, 0]);
    sh.add(mesh(sphere(0.058), top, [0, -0.01, 0]));
    const sleeve = look.sleeves === 'long' || look.sleeves === 'rolled';
    sh.add(limb(0.05, 0.2, sleeve ? top : skin));
    if (look.sleeves === 'short') sh.add(mesh(cyl(0.058, 0.056, 0.12), top, [0, -0.06, 0]));
    const fo = joint(`foreArm${side}`, sh, [0, -0.28, 0]);
    fo.add(limb(0.042, 0.18, look.sleeves === 'long' ? top : skin));
    if (look.sleeves === 'rolled') fo.add(mesh(cyl(0.05, 0.048, 0.07), top, [0, -0.02, 0]));
    if (look.sleeves === 'long') fo.add(mesh(cyl(0.035, 0.035, 0.05), skin, [0, -0.22, 0]));
    if (ex.includes('bangles')) fo.add(mesh(G('bangle', () => new THREE.TorusGeometry(0.043, 0.006, 6, 14)), M('#d9a845', 0.3), [0, -0.2, 0], [H90, 0, 0]));
    if (ex.includes('watch') && side === 'L') fo.add(mesh(cyl(0.045, 0.045, 0.025, 14), M('#3a2a20', 0.5), [0, -0.2, 0]),
      mesh(cyl(0.018, 0.018, 0.01, 14), M('#9aa0a6', 0.3), [0, -0.2, 0.042], [H90, 0, 0]));
    const ha = joint(`hand${side}`, fo, [0, -0.25, 0]);
    ha.add(mesh(sphere(0.045), skin, [0, -0.03, 0.005], null, [0.75, 1.1, 0.6]));
    return ha;
  };
  const handL = arm('L'), handR = arm('R');
  const leg = side => {
    const sx = side === 'L' ? 1 : -1;
    const th = joint(`thigh${side}`, hips, [0.09 * sx, -0.04, 0]);
    th.add(limb(0.075, 0.32, bottom));
    const sn = joint(`shin${side}`, th, [0, -0.44, 0]);
    sn.add(limb(0.058, 0.32, bottom));
    const ft = joint(`foot${side}`, sn, [0, -0.43, 0]);
    ft.add(mesh(box(0.09, 0.06, 0.22), shoes, [0, -0.02, 0.05]));
  };
  leg('L'); leg('R');
  if (look.skirt) {   // saree / kurti / frock: a flared drape from the waist; legs are dressed in the same fabric where needed
    const k = look.skirt;
    hips.add(mesh(cyl(0.16, k.flare, k.len, 18, true), M(k.color), [0, -k.len / 2 + 0.02, 0], null, [1, 1, 0.85]));
    hips.add(mesh(cyl(k.flare + 0.004, k.flare + 0.008, 0.045, 18, true), M(k.border), [0, -k.len + 0.04, 0], null, [1, 1, 0.85]));
  }

  // hand props, shown per activity
  const props = {
    phone: mesh(box(0.075, 0.14, 0.012), M('#151515', 0.3), [0, -0.08, 0.05], [-1.0, 0, 0]),
    book: mesh(box(0.2, 0.26, 0.03), M('#2a5a8a', 0.7), [-0.06, -0.09, 0.07], [-1.2, 0, 0.2]),
    cup: mesh(cyl(0.035, 0.03, 0.08), M('#f4efe6', 0.4), [0, -0.07, 0.04]),
    ladle: mesh(cyl(0.008, 0.008, 0.38), M('#b8b8b8', 0.3), [0, -0.12, 0.12], [1.3, 0, 0]),
    knife: mesh(box(0.02, 0.18, 0.005), M('#c8c8c8', 0.25), [0, -0.1, 0.06], [1.4, 0, 0]),
    pen: mesh(cyl(0.005, 0.005, 0.14), M('#1d3f8a', 0.4), [0, -0.07, 0.03], [0.6, 0, 0]),
    toy: mesh(sphere(0.06), M('#f2c14e', 0.6), [0, -0.09, 0.04]),
  };
  for (const p of Object.values(props)) { p.visible = false; handR.add(p); }
  props.plate = mesh(cyl(0.11, 0.08, 0.025, 18), M('#c9ccd0', 0.35), [0, -0.09, 0.08], [1.4, 0, 0]);                     // left-hand props
  props.sketchbook = mesh(box(0.22, 0.28, 0.015), M('#f4f1e8', 0.8), [0, -0.1, 0.1], [1.3, 0, 0]);
  props.plate.visible = props.sketchbook.visible = false; handL.add(props.plate, props.sketchbook);
  // school/college backpack, worn only when heading out or coming home (Character.jsx toggles it)
  let bag = null;
  if (look.bag) {
    bag = new THREE.Group(); bag.visible = false; chest.add(bag);
    bag.add(mesh(box(0.26, 0.32, 0.12), M(look.bag, 0.7), [0, 0.02, -0.17]), mesh(box(0.2, 0.12, 0.04), M(look.bag, 0.6), [0, -0.05, -0.24]));
    for (const x of [-0.08, 0.08]) bag.add(mesh(box(0.035, 0.3, 0.02), M(look.bag, 0.7), [x, 0.06, 0.11], [0.1, 0, 0]));
  }

  // Posture pivots between a joint and its contents. The controller sets these absolutely (mood tilt, listening turn, nods);
  // writing onto the animated joints instead would accumulate, because the mixer skips re-writing tracks whose value is constant.
  const pivot = j => { const g = new THREE.Group(); for (const ch of [...j.children]) g.add(ch); j.add(g); return g; };
  const pose = { head: pivot(head), chest: pivot(chest) };

  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, scale: s, bones: Object.fromEntries(BONES.map(n => [n, root.getObjectByName(n)])), face: { eyes, brows, smile, ooh }, props, bag, pose };
}
const H90 = Math.PI / 2;


function buildHair(face, look, hair) {
  const st = look.hairStyle;
  const cap = G('cap', () => new THREE.SphereGeometry(0.116, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52));
  face.add(mesh(cap, hair, [0, 0.012, -0.008], [-0.55, 0, 0], [1, 1.05, 1.07]));   // hairline above the brows
  if (st === 'side') {                                                                           // short, side-parted with a front sweep
    face.add(mesh(sphere(0.05), hair, [0.03, 0.098, 0.05], [0, 0, -0.3], [1.5, 0.55, 0.9]));
    face.add(mesh(sphere(0.04), hair, [-0.06, 0.085, 0.04], null, [1, 0.6, 1]));
  }
  if (st === 'messy') for (const [x, y, z, r] of [[-0.05, 0.1, 0.05, 0.4], [0.03, 0.11, 0.07, -0.3], [0, 0.12, 0.0, 0], [0.07, 0.09, -0.02, -0.5],
    [-0.07, 0.09, -0.03, 0.5], [0.0, 0.09, 0.085, 0.1], [-0.025, 0.07, 0.1, 0.6]])
    face.add(mesh(sphere(0.042), hair, [x, y, z], [0.4, 0, r], [1, 0.75, 1.15]));
  if (st === 'bun' || st === 'long' || st === 'pigtails') face.add(mesh(sphere(0.112), hair, [0, 0.0, -0.03], null, [1.02, 1.05, 0.95]));
  if (st === 'bun') face.add(mesh(sphere(0.058), hair, [0, -0.05, -0.14], null, [1.1, 0.9, 0.9]));             // low bun at the nape
  if (st === 'long') {                                                                             // long, loose, past the shoulders
    face.add(mesh(box(0.2, 0.36, 0.06), hair, [0, -0.15, -0.075]));
    for (const x of [-1, 1]) face.add(mesh(capsule(0.03, 0.2), hair, [0.098 * x, -0.1, 0.02], [0, 0, 0.08 * x]));
    face.add(mesh(sphere(0.05), hair, [0.035, 0.085, 0.07], [0, 0, -0.4], [1.4, 0.5, 0.8]));                   // side-swept fringe
  }
  if (st === 'pigtails') {
    face.add(mesh(sphere(0.045), hair, [0, 0.085, 0.075], null, [1.6, 0.5, 0.8]));                             // bangs
    for (const x of [-1, 1]) {
      face.add(mesh(sphere(0.02), M('#ff5d8f'), [0.105 * x, 0.06, -0.04]));
      face.add(mesh(capsule(0.04, 0.12), hair, [0.15 * x, -0.02, -0.05], [0, 0, 0.35 * x]));
    }
  }
}

// ---------------------------------------------------------------- clips
// keys: [x,y,z] degrees (constant) or [[t, x, y, z], ...]. Every clip animates every bone so crossfades are clean.
const REST = { upperArmL: [0, 0, 8], upperArmR: [0, 0, -8], foreArmL: [-8, 0, 0], foreArmR: [-8, 0, 0], thighL: [0, 0, 2], thighR: [0, 0, -2] };
const SIT = { thighL: [-88, 0, 4], thighR: [-88, 0, -4], shinL: [88, 0, 0], shinR: [88, 0, 0], footL: [-5, 0, 0], footR: [-5, 0, 0],
  upperArmL: [-25, 0, 6], upperArmR: [-25, 0, -6], foreArmL: [-50, 0, 0], foreArmR: [-50, 0, 0], hipsPos: [0, 0.55, -0.02] };
const FLOOR = { thighL: [-82, 0, 18], thighR: [-82, 0, -18], shinL: [30, 0, 0], shinR: [30, 0, 0], hipsPos: [0, 0.14, 0], spine: [12, 0, 0] };
const breathe = (d, amp = 2) => [[0, 0, 0, 0], [d / 2, amp, 0, 0], [d, 0, 0, 0]];

function makeClip(name, dur, spec) {
  const tracks = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const b of BONES) {
    let k = spec[b] ?? REST[b] ?? [0, 0, 0];
    if (!Array.isArray(k[0])) k = [[0, ...k], [dur, ...k]];
    const times = [], vals = [];
    for (const [t, x, y, z] of k) { times.push(t); q.setFromEuler(e.set(x * D, y * D, z * D)); vals.push(q.x, q.y, q.z, q.w); }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, vals));
  }
  let hp = spec.hipsPos ?? [0, HIPS_Y, 0];
  if (!Array.isArray(hp[0])) hp = [[0, ...hp], [dur, ...hp]];
  tracks.push(new THREE.VectorKeyframeTrack('hips.position', hp.map(k => k[0]), hp.flatMap(k => k.slice(1))));
  return new THREE.AnimationClip(name, dur, tracks);
}
const osc = (d, n, a, b) => Array.from({ length: n + 1 }, (_, i) => [d * i / n, ...(i % 2 ? b : a)]);

export const CLIPS = Object.fromEntries([
  makeClip('idle', 3, { chest: breathe(3, 2), head: [[0, 0, 0, 0], [1.5, 2, 8, 0], [3, 0, 0, 0]] }),
  makeClip('walk', 0.9, {
    thighL: [[0, -28, 0, 2], [0.45, 26, 0, 2], [0.9, -28, 0, 2]], thighR: [[0, 26, 0, -2], [0.45, -28, 0, -2], [0.9, 26, 0, -2]],
    shinL: [[0, 8, 0, 0], [0.225, 4, 0, 0], [0.45, 12, 0, 0], [0.675, 55, 0, 0], [0.9, 8, 0, 0]],
    shinR: [[0, 12, 0, 0], [0.225, 55, 0, 0], [0.45, 8, 0, 0], [0.675, 4, 0, 0], [0.9, 12, 0, 0]],
    upperArmL: [[0, 22, 0, 7], [0.45, -22, 0, 7], [0.9, 22, 0, 7]], upperArmR: [[0, -22, 0, -7], [0.45, 22, 0, -7], [0.9, -22, 0, -7]],
    foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0], chest: [[0, 2, 5, 0], [0.45, 2, -5, 0], [0.9, 2, 5, 0]],
    hipsPos: [[0, 0, 0.95, 0], [0.225, 0, 0.975, 0], [0.45, 0, 0.95, 0], [0.675, 0, 0.975, 0], [0.9, 0, 0.95, 0]],
  }),
  makeClip('relax', 4, { ...SIT, spine: [-16, 0, 0], chest: breathe(4, 2.5), head: [[0, -6, 0, 0], [2, -6, 10, 0], [4, -6, 0, 0]],
    upperArmL: [-8, 0, 32], upperArmR: [-8, 0, -32], foreArmL: [-35, 0, 0], foreArmR: [-35, 0, 0] }),           // leaning back, arms spread on the sofa
  makeClip('call', 3, { spine: [[0, 2, 8, 0], [1.5, 2, -8, 0], [3, 2, 8, 0]], head: [[0, 4, 0, -10], [1.5, 0, 0, -6], [3, 4, 0, -10]],
    upperArmR: [-25, 0, -72], foreArmR: [-20, 0, -150], handR: [0, 0, 0],                                       // phone held at the ear
    upperArmL: [[0, -15, 0, 12], [0.8, -40, 0, 22], [1.6, -20, 0, 14], [2.3, -45, 0, 25], [3, -15, 0, 12]],
    foreArmL: [[0, -40, 0, 0], [0.8, -85, 0, 0], [1.6, -50, 0, 0], [2.3, -90, 0, 0], [3, -40, 0, 0]] }),
  makeClip('sketch', 2, { ...SIT, spine: [8, 0, 0], head: [20, 0, 0], upperArmL: [-40, 0, 10], foreArmL: [-75, 0, -25],
    upperArmR: [-40, 0, -6], foreArmR: [[0, -62, 18, 0], [0.5, -70, -10, 0], [1, -58, 20, 0], [1.5, -72, -14, 0], [2, -62, 18, 0]] }),
  makeClip('care', 2.4, { ...SIT, spine: [16, 0, 0], head: [[0, 12, 0, 6], [1.2, 12, 0, -4], [2.4, 12, 0, 6]],                   // bent over the bed, patting
    upperArmR: [-62, 0, -4], foreArmR: [[0, -20, 0, 0], [0.3, -42, 0, 0], [0.6, -20, 0, 0], [0.9, -42, 0, 0], [1.2, -20, 0, 0], [2.4, -20, 0, 0]],
    upperArmL: [-30, 0, 6], foreArmL: [-60, 0, 0] }),
  makeClip('tv', 4, { ...SIT, spine: [-12, 0, 0], chest: breathe(4, 1.5), head: [[0, 8, 0, 0], [2, 6, 6, 0], [4, 8, 0, 0]], upperArmL: [-12, 0, 10], upperArmR: [-12, 0, -10] }),
  makeClip('sitTalk', 2.4, { ...SIT,
    upperArmR: [[0, -30, 0, -10], [0.6, -55, 0, -25], [1.2, -35, 0, -15], [1.8, -60, 0, -20], [2.4, -30, 0, -10]],
    foreArmR: [[0, -60, 0, 0], [0.6, -95, 20, 0], [1.2, -70, 0, 0], [1.8, -90, -20, 0], [2.4, -60, 0, 0]],
    head: [[0, 0, 0, 0], [0.8, 4, 10, 0], [1.6, -2, -6, 0], [2.4, 0, 0, 0]] }),
  makeClip('eat', 2, { ...SIT, spine: [8, 0, 0], upperArmL: [-32, 0, 6], foreArmL: [-60, 0, 0],
    upperArmR: [[0, -35, 0, -5], [0.8, -42, 0, -15], [1.05, -42, 0, -15], [2, -35, 0, -5]],
    foreArmR: [[0, -55, 0, 0], [0.8, -128, 0, 0], [1.05, -128, 0, 0], [2, -55, 0, 0]],
    head: [[0, 16, 0, 0], [0.8, 2, 0, 0], [1.05, 2, 0, 0], [2, 16, 0, 0]] }),
  makeClip('study', 3, { ...SIT, spine: [12, 0, 0], chest: [6, 0, 0], head: [[0, 26, 0, 0], [1.5, 24, 6, 3], [3, 26, 0, 0]],
    upperArmL: [-40, 0, 12], foreArmL: [-60, 0, 0], upperArmR: [-42, 0, -8],
    foreArmR: [[0, -60, 0, 0], [0.3, -62, 10, 0], [0.6, -60, -8, 0], [0.9, -62, 10, 0], [1.2, -60, -8, 0], [1.5, -60, 0, 0], [3, -60, 0, 0]] }),
  makeClip('type', 1, { ...SIT, spine: [6, 0, 0], head: [6, 0, 0], upperArmL: [-45, 0, 6], upperArmR: [-45, 0, -6],
    foreArmL: osc(1, 4, [-55, 0, 0], [-50, 0, 0]), foreArmR: osc(1, 4, [-50, 0, 0], [-55, 0, 0]) }),
  makeClip('read', 4, { ...SIT, spine: [4, 0, 0], head: [[0, 20, 0, 0], [3.6, 20, -10, 0], [4, 20, 0, 0]],
    upperArmL: [-38, 0, -10], upperArmR: [-38, 0, 10], foreArmL: [-85, 0, 0], foreArmR: [-85, 0, 0] }),
  makeClip('phone', 1.2, { ...SIT, spine: [10, 0, 0], head: [34, 0, 0], upperArmL: [-22, 0, -12], upperArmR: [-22, 0, 12],
    foreArmL: [-100, 0, 0], foreArmR: [-100, 0, 0], handR: osc(1.2, 6, [0, 0, 0], [8, 0, 0]), handL: osc(1.2, 6, [6, 0, 0], [0, 0, 0]) }),
  makeClip('tea', 4, { ...SIT, upperArmL: [-40, 0, -6], foreArmL: [-80, 0, 0], head: [[0, 16, 0, 0], [2, 4, 0, 0], [2.6, 4, 0, 0], [4, 16, 0, 0]],
    upperArmR: [[0, -30, 0, -5], [2, -42, 0, -15], [2.6, -42, 0, -15], [4, -30, 0, -5]],
    foreArmR: [[0, -70, 0, 0], [2, -126, 0, 0], [2.6, -126, 0, 0], [4, -70, 0, 0]] }),
  makeClip('talk', 2.4, { chest: breathe(2.4, 2),
    upperArmR: [[0, -25, 0, -12], [0.6, -50, 0, -25], [1.2, -30, 0, -15], [1.8, -45, 0, -30], [2.4, -25, 0, -12]],
    foreArmR: [[0, -50, 0, 0], [0.6, -80, 0, 0], [1.2, -55, 0, 0], [1.8, -75, 0, 0], [2.4, -50, 0, 0]],
    upperArmL: [[0, -10, 0, 10], [1.2, -35, 0, 22], [2.4, -10, 0, 10]], foreArmL: [[0, -20, 0, 0], [1.2, -70, 0, 0], [2.4, -20, 0, 0]],
    head: [[0, 0, 0, 0], [0.6, 6, 8, 0], [1.2, -3, 0, 0], [1.8, 5, -8, 0], [2.4, 0, 0, 0]] }),
  makeClip('argue', 1, { spine: [6, 0, 0], chest: [6, 0, 0], thighL: [0, 0, 7], thighR: [0, 0, -7],
    upperArmR: osc(1, 4, [-72, 0, -6], [-90, 0, -6]), foreArmR: [-12, 0, 0],
    upperArmL: [-5, 0, 38], foreArmL: [-95, 30, 0], head: osc(1, 4, [-6, 0, 0], [5, 0, 0]) }),
  makeClip('crossed', 3, { chest: breathe(3, 2), upperArmL: [-32, 0, -4], upperArmR: [-32, 0, 4], foreArmL: [-108, -25, -55], foreArmR: [-108, 25, 55],
    head: [[0, -4, 0, 0], [1.5, -4, -10, 0], [3, -4, 0, 0]], thighL: [0, 0, 6], thighR: [0, 0, -6] }),
  makeClip('reconcile', 2.4, { spine: [4, 0, 0], upperArmR: [[0, -15, 0, -10], [0.8, -78, 0, 18], [2.4, -78, 0, 18]], foreArmR: [-15, 0, 0],
    head: [[0, 14, 0, 0], [1.2, 6, 0, 0], [1.8, 12, 0, 0], [2.4, 6, 0, 0]] }),
  makeClip('cook', 1.6, { spine: [10, 0, 0], head: [22, 0, 0], upperArmL: [-35, 0, 5], foreArmL: [-55, 0, 0], upperArmR: [-48, 0, -5],
    foreArmR: [[0, -40, 22, 0], [0.4, -52, 0, 12], [0.8, -40, -22, 0], [1.2, -30, 0, -12], [1.6, -40, 22, 0]] }),
  makeClip('clean', 1.2, { spine: [15, 0, 0], head: [25, 0, 0], upperArmL: osc(1.2, 4, [-50, 0, 6], [-40, 0, 10]),
    upperArmR: osc(1.2, 4, [-40, 0, -10], [-50, 0, -6]), foreArmL: [-45, 0, 0], foreArmR: [-50, 0, 0] }),
  makeClip('chop', 0.5, { spine: [12, 0, 0], head: [25, 0, 0], upperArmR: [-40, 0, -5], foreArmR: [[0, -62, 0, 0], [0.25, -35, 0, 0], [0.5, -62, 0, 0]],
    upperArmL: [-40, 0, 10], foreArmL: [-55, 0, 0] }),
  makeClip('groom', 3, { upperArmR: [[0, -128, 0, -20], [1.5, -140, 0, -30], [3, -128, 0, -20]], foreArmR: [-85, 0, 0],
    head: [[0, -4, 0, 8], [1.5, -4, 0, -5], [3, -4, 0, 8]] }),
  makeClip('pray', 3, { upperArmL: [-38, 0, -22], upperArmR: [-38, 0, 22], foreArmL: [-98, 0, -30], foreArmR: [-98, 0, 30], head: [[0, 18, 0, 0], [1.5, 22, 0, 0], [3, 18, 0, 0]] }),
  makeClip('sleep', 4, { hips: [-90, 0, 0], hipsPos: [0, 0.12, 0], chest: breathe(4, 2.5), head: [-14, 0, 0],
    upperArmL: [0, 0, 12], upperArmR: [0, 0, -12], foreArmL: [-10, 0, 0], foreArmR: [-10, 0, 0], thighL: [0, 0, 3], thighR: [0, 0, -3], footL: [-60, 0, 0], footR: [-60, 0, 0] }),
  makeClip('toys', 2, { ...FLOOR, head: [30, 0, 0], upperArmL: [[0, -55, 0, 10], [1, -40, 0, 20], [2, -55, 0, 10]],
    upperArmR: [[0, -42, 0, -18], [1, -58, 0, -8], [2, -42, 0, -18]], foreArmL: [-30, 0, 0], foreArmR: [-30, 0, 0] }),
  makeClip('floorIdle', 3, { ...FLOOR, chest: breathe(3), upperArmL: [-35, 0, 8], upperArmR: [-35, 0, -8], foreArmL: [-20, 0, 0], foreArmR: [-20, 0, 0] }),
].map(c => [c.name, c]));
export const SIT_ANIMS = new Set(['relax', 'tv', 'sitTalk', 'eat', 'study', 'type', 'read', 'phone', 'tea', 'sketch', 'care']);
// hipsPos y used by each pose so the root can be placed so hips land on the seat/mattress/floor
export const POSE_HIP = { sit: 0.55 - 0.115, lie: 0.0, floor: 0.0, stand: 0 };
