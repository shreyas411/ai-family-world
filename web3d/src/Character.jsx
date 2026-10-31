// One family member in 3D. Follows its plan (from planner.js): stand up if seated, walk the A* path through doors,
// settle into the seat/bed/spot, play the activity clip. Mood drives the face and posture; dialogue shows as a bubble.
import * as THREE from 'three';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildCharacter, lookFor, CLIPS, POSE_HIP } from './rig.js';
import { findPath } from './nav.js';
import { faceFor, ICONS } from './planner.js';
import { textSprite } from './labels.js';
import { view } from './store.js';

const WALK = 1.5;                        // m/s; long trips speed up so members keep pace with the simulation clock
const tmp = new THREE.Vector3();
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// --- bodies: both expose { root, scale, play(name), setFace(face, talking, t), setProp(name), head } ---------
function useProceduralBody(agent) {
  return useMemo(() => {
    const c = buildCharacter(lookFor(agent));
    const mixer = new THREE.AnimationMixer(c.root);
    const actions = Object.fromEntries(Object.values(CLIPS).map(cl => [cl.name, mixer.clipAction(cl)]));
    let cur = null;
    const play = name => {
      const next = actions[name] || actions.idle;
      if (next === cur) return;
      next.reset().setEffectiveWeight(1).fadeIn(0.35).play();
      if (cur) cur.fadeOut(0.35);
      cur = next;
    };
    const { eyes, brows, smile, ooh } = c.face;
    const setFace = (face, talking, t) => {
      const closed = face === 'asleep';
      for (const e of eyes) e.scale.y = closed ? 0.12 : Math.sin(t * 0.7 + agent.age) > 0.985 ? 0.15 : 1;   // blink
      const browRot = { angry: 0.45, sad: -0.4, scared: -0.35, surprised: -0.1 }[face] || 0, browY = { surprised: 0.012, scared: 0.006, sad: 0.004 }[face] || 0;
      brows.forEach((b, i) => { b.rotation.z = (i ? -1 : 1) * browRot; b.position.y = 0.048 + browY; });
      const o = talking || face === 'surprised' || face === 'scared';
      ooh.visible = o; smile.visible = !o;
      if (o) ooh.scale.set(1, talking ? 0.5 + Math.abs(Math.sin(t * 14)) * 0.9 : 1, 1);
      smile.rotation.z = face === 'happy' || face === 'calm' ? Math.PI : 0;
      smile.scale.set(face === 'calm' ? 0.75 : 1, face === 'calm' ? 0.35 : face === 'angry' ? 0.35 : 0.8, 1);
      smile.position.y = face === 'happy' || face === 'calm' ? 0.006 : -0.012;
    };
    const setProp = name => { const on = name ? name.split('+') : []; for (const [k, p] of Object.entries(c.props)) p.visible = on.includes(k); };
    const setBag = on => { if (c.bag) c.bag.visible = on; };
    return { root: c.root, scale: c.scale, mixer, play, setFace, setProp, setBag, pose: c.pose, update: dt => mixer.update(dt) };
  }, [agent.id]);
}

function useGLBBody(url) {
  const gltf = useGLTF(url);
  return useMemo(() => {
    const root = skeletonClone(gltf.scene);
    root.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const mixer = new THREE.AnimationMixer(root);
    const byName = Object.fromEntries(gltf.animations.map(a => [a.name.toLowerCase(), mixer.clipAction(a)]));
    let cur = null;
    const play = name => {
      const next = byName[name.toLowerCase()] || byName.sit && /relax|tv|eat|study|type|read|phone|tea|sittalk/i.test(name) && byName.sit || byName.idle || Object.values(byName)[0];
      if (!next || next === cur) return;
      next.reset().fadeIn(0.35).play(); cur?.fadeOut(0.35); cur = next;
    };
        return { root, scale: 1, mixer, play, setFace: () => {}, setProp: () => {}, setBag: () => {}, pose: null, update: dt => mixer.update(dt) };
  }, [gltf]);
}

// --- controller -------------------------------------------------------------------------------------------
function Controller({ body, agent, plan, line, speed, onPick }) {
  const group = useRef();
  const st = useRef(null);
  const icon = !plan || plan.away ? '' : line ? (line.argue ? '💢' : '💬') : plan.listenArgue ? '😠' : ICONS[plan.anim] || '';
  const bubble = useRef(null), nameTag = useMemo(() => textSprite({ title: icon ? `${icon} ${agent.name}` : agent.name, color: agent.color, tail: false, font: 24, worldH: 0.0034 }),
    [agent.name, agent.color, icon]);
  useEffect(() => () => nameTag.userData.dispose(), [nameTag]);

  useEffect(() => { view.chars[agent.id] = { root: group.current }; return () => { delete view.chars[agent.id]; }; }, [agent.id]);

  // new plan → new route
  useEffect(() => {
    if (!plan) return;
    const s = st.current;
    if (!s) {                                       // first appearance: place directly, no walk-in from nowhere
      st.current = { pos: new THREE.Vector3(plan.pos[0], 0, plan.pos[1]), rot: plan.th, route: [], plan, settled: true };
      return;
    }
    const same = s.plan && s.plan.pos[0] === plan.pos[0] && s.plan.pos[1] === plan.pos[1] && s.plan.y === plan.y;
    s.prev = s.plan; s.plan = plan;
    if (same && s.settled) return;
    let from = [s.pos.x, s.pos.z];
    s.outdoor = !!plan.away || (s.hidden && !plan.away);                                      // backpack on while heading out / coming home
    if (s.hidden && !plan.away) from = s.prev.stand;                                          // coming home: enter through the gate
    else if (s.settled && s.prev && s.prev.pose !== 'stand') from = s.prev.stand;             // stand up next to the seat/bed first
    s.pos.set(from[0], 0, from[1]);
    s.route = findPath(from, plan.stand).slice(1);
    s.settled = !s.route.length;
  }, [plan]);

  useEffect(() => {                                 // speech bubble for the current line
    if (bubble.current) { group.current?.remove(bubble.current); bubble.current.userData.dispose(); bubble.current = null; }
    if (!line) return;
    const sp = textSprite({ text: line.text, title: line.argue ? `${agent.name} (upset)` : agent.name, color: line.argue ? '#c0392b' : agent.color,
      border: line.argue ? '#c0392b' : agent.color });
    sp.position.y = 2.05; group.current.add(sp); bubble.current = sp;
  }, [line]);

  useFrame((state, dt) => {
    const s = st.current, g = group.current;
    if (!s || !g) return;
    dt = Math.min(dt, 0.1);
    const p = s.plan;
    let anim = 'idle', y = 0, rot = s.rot, prop = null;
    if (s.route.length) {                           // walking
      const [tx, tz] = s.route[0];
      tmp.set(tx - s.pos.x, 0, tz - s.pos.z);
      const d = tmp.length(), total = s.route.reduce((acc, q, i) => acc + (i ? Math.hypot(q[0] - s.route[i - 1][0], q[1] - s.route[i - 1][1]) : d), 0);
      const v = WALK * Math.min(2.4, Math.max(1, total / 7)) * Math.max(1, speed);
      if (d <= v * dt) { s.pos.set(tx, 0, tz); s.route.shift(); }
      else { s.pos.addScaledVector(tmp.normalize(), v * dt); rot = Math.atan2(tmp.x, tmp.z); }
      anim = 'walk';
      if (!s.route.length) s.settled = true;
      body.mixer.timeScale = Math.min(2, v / WALK);
    } else {
      body.mixer.timeScale = 1;
      if (p.away) { s.hidden = true; }
      else {
        s.hidden = false;
        anim = line ? (p.pose === 'sit' ? 'sitTalk' : line.argue ? 'argue' : line.reconcile ? 'reconcile' : 'talk') : p.anim;
        if (!line && p.listenArgue) anim = 'crossed';
        if (p.pose !== 'stand') { s.pos.set(p.pos[0], 0, p.pos[1]); y = p.y - (POSE_HIP[p.pose] || 0) * body.scale; }
        rot = p.faceId && view.chars[p.faceId] ? Math.atan2(view.chars[p.faceId].root.position.x - s.pos.x, view.chars[p.faceId].root.position.z - s.pos.z) : p.th;
        if (p.pose !== 'stand') rot = p.th;
        prop = p.prop || null;
      }
    }
    s.rot += angDiff(s.rot, rot) * Math.min(1, dt * 8);
    g.position.set(s.pos.x, y, s.pos.z); g.rotation.y = s.rot;
    g.visible = !s.hidden;
    if (s.hidden) return;
    body.play(anim); body.setProp(anim === 'walk' ? null : prop); body.setBag(anim === 'walk' && !!s.outdoor);
    body.update(dt);
    const t = state.clock.elapsedTime, face = p.anim === 'sleep' && !s.route.length ? 'asleep' : faceFor(agent.mood);
    body.setFace(face, !!line, t);
    // posture on top of the clip, set absolutely on the pivots: sad slumps, angry leans in, happy lifts the chin, speakers nod,
    // seated listeners ease their head toward the speaker. Off while walking/sleeping so the head follows the body.
    if (body.pose) {
      const still = anim === 'sleep' || anim === 'walk';
      let yaw = 0;
      if (!still && p.faceId && p.pose === 'sit' && view.chars[p.faceId]) {
        const o = view.chars[p.faceId].root.position;
        yaw = Math.max(-0.6, Math.min(0.6, angDiff(s.rot, Math.atan2(o.x - s.pos.x, o.z - s.pos.z))));
      }
      s.headYaw = (s.headYaw || 0) + (yaw - (s.headYaw || 0)) * Math.min(1, dt * 3);   // ease, never snap
      const tilt = still ? 0 : (face === 'sad' ? 0.28 : face === 'happy' ? -0.08 : 0) + (line ? Math.sin(t * 5) * 0.07 : 0);
      body.pose.head.rotation.set(tilt, s.headYaw, 0);
      body.pose.chest.rotation.set(still ? 0 : face === 'sad' ? 0.12 : face === 'angry' ? 0.06 : 0, 0, 0);
    }
    // labels shrink when the camera is close so they never fill the screen
    const k = Math.min(1, state.camera.position.distanceTo(g.position) / 9);
    nameTag.position.y = (anim === 'sleep' ? 0.6 : p.pose === 'sit' && !s.route.length ? 1.45 : 1.95) * Math.max(0.8, body.scale);
    nameTag.scale.copy(nameTag.userData.base).multiplyScalar(Math.max(0.45, k));
    if (bubble.current) { bubble.current.position.y = nameTag.position.y + 0.2 * Math.max(0.45, k); bubble.current.scale.copy(bubble.current.userData.base).multiplyScalar(Math.max(0.35, k)); }
  });

  return <group ref={group} onClick={e => { if (e.delta > 5) return; e.stopPropagation(); onPick(agent.id); }}>
    <primitive object={body.root} />
    <primitive object={nameTag} />
  </group>;
}

function Procedural(props) { const body = useProceduralBody(props.agent); return <Controller {...props} body={body} />; }
function FromGLB(props) { const body = useGLBBody(props.url); return <Controller {...props} body={body} />; }

// manifest.characters[id] = "/3d/models/<file>.glb" swaps the procedural body for a real rigged model.
export function Character(props) {
  const url = props.manifest?.characters?.[props.agent.id];
  return url ? <Suspense fallback={<Procedural {...props} />}><FromGLB {...props} url={url} /></Suspense> : <Procedural {...props} />;
}
