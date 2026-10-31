import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { House } from './House.jsx';
import { Character } from './Character.jsx';
import { plan as makePlan } from './planner.js';
import { ROOMS, roomCenter } from './layout.js';
import { textSprite } from './labels.js';
import { useSim } from './sim.js';
import { view } from './store.js';

const EMOJI = { happiness: '😊', sadness: '😢', anger: '😠', frustration: '😤', excitement: '🤩', jealousy: '😒', fear: '😨', anxiety: '😟',
  love: '🥰', affection: '🤗', pride: '😌', guilt: '😔', loneliness: '🥺', surprise: '😮', curiosity: '🤔', disappointment: '😞', gratitude: '🙏',
  calm: '🙂', asleep: '😴' };
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const HOUSE_VIEW = { target: [7, 0, 7.6], pos: [21, 21, 28.5] };
const capture = {};

function CameraRig({ cmd }) {
  const { camera, controls } = useThree();
  const goal = useRef(null), followed = useRef(new THREE.Vector3());
  useEffect(() => {
    if (!cmd) return;
    view.mode = cmd.type;
    if (cmd.type === 'house') goal.current = { target: new THREE.Vector3(...HOUSE_VIEW.target), pos: new THREE.Vector3(...HOUSE_VIEW.pos) };
    if (cmd.type === 'room') {
      const [x, z] = roomCenter(cmd.room), [x0, z0, x1, z1] = ROOMS[cmd.room].rect, size = Math.max(x1 - x0, z1 - z0);
      goal.current = { target: new THREE.Vector3(x, 0.6, z), pos: new THREE.Vector3(x + size * 0.55 + 1.2, 3.2 + size * 0.75, z + size * 0.9 + 2.2) };
    }
    if (cmd.type === 'follow') {
      const c = view.chars[cmd.id]?.root.position;
      if (c) { followed.current.copy(c); goal.current = { target: new THREE.Vector3(c.x, 1, c.z), pos: new THREE.Vector3(c.x + 2.6, 3.4, c.z + 4.2) }; }
    }
  }, [cmd]);
  useFrame((_, dt) => {
    if (!controls) return;
    const k = 1 - Math.exp(-dt * 3.5);
    if (goal.current) {
      controls.target.lerp(goal.current.target, k); camera.position.lerp(goal.current.pos, k);
      if (camera.position.distanceTo(goal.current.pos) < 0.05) goal.current = null;
    }
    if (view.mode === 'follow' && cmd?.id && view.chars[cmd.id]) {       // keep the user's orbit offset, move with the person
      const c = view.chars[cmd.id].root.position, d = new THREE.Vector3().subVectors(c, followed.current);
      followed.current.copy(c);
      if (!goal.current) { controls.target.add(d); camera.position.add(d); }
      else { goal.current.target.add(d); goal.current.pos.add(d); }
    }
    view.target.copy(controls.target);
    controls.update();
  });
  return null;
}

function Capture() {
  const { gl, scene, camera } = useThree();
  capture.png = () => { gl.render(scene, camera); return gl.domElement.toDataURL('image/png'); };
  capture.canvas = gl.domElement;
  return null;
}

function RoomLabels({ show }) {
  const sprites = useMemo(() => Object.entries(ROOMS).filter(([id]) => id !== 'hallway').map(([id, r]) => {
    const sp = textSprite({ title: r.label, color: '#3a3a3a', tail: false, font: 24, bg: 'rgba(255,255,255,0.8)', border: 'rgba(0,0,0,0.15)', worldH: 0.011 });
    const [x, z] = roomCenter(id); sp.position.set(x, 3.0, z); return sp;
  }), []);
  return show ? sprites.map((s, i) => <primitive key={i} object={s} />) : null;
}

// portraits cropped from the family reference art; members added later fall back to a colour dot
const PORTRAITS = new Set(['father', 'mother', 'son', 'daughter', 'anu']);
const Avatar = ({ a }) => PORTRAITS.has(a.id)
  ? <img className="ava" src={`${import.meta.env.BASE_URL}avatars/${a.id}.jpg`} alt="" style={{ borderColor: a.color }} />
  : <span className="dot" style={{ background: a.color }} />;

export default function App() {
  const sim = useSim();
  const [cmd, setCmd] = useState({ type: 'house', n: 0 });
  const [room, setRoom] = useState(null), [follow, setFollow] = useState(null);
  const [walls, setWalls] = useState('cutaway'), [quality, setQuality] = useState(localStorage.getItem('fw3d-quality') || 'high');
  const [manifest, setManifest] = useState(null), [recording, setRecording] = useState(null), [showLog, setShowLog] = useState(true);
  useEffect(() => { view.walls = walls; }, [walls]);
  useEffect(() => { localStorage.setItem('fw3d-quality', quality); }, [quality]);
  useEffect(() => { fetch(import.meta.env.BASE_URL + 'models/manifest.json').then(r => r.ok ? r.json() : {}).then(setManifest).catch(() => setManifest({})); }, []);

  // plan from the simulation state, then let the conversation being played override posture (face each other, stand up to argue)
  const prevPlan = useRef({});
  const sig = sim.agents.map(a => `${a.id}|${a.location}|${a.activity}`).join(';');
  const basePlan = useMemo(() => (prevPlan.current = makePlan(sim.agents, prevPlan.current)), [sig]);
  const conv = sim.conv;
  // while a conversation plays, its participants stay where it happened (the live sim may already have moved on)
  const convHold = useRef(null);
  if (conv && convHold.current?.id !== conv.id + ':' + conv.t) convHold.current = { id: conv.id + ':' + conv.t, plan: basePlan };
  const plans = useMemo(() => {
    if (!conv) return basePlan;
    const out = { ...basePlan };
    for (const id of conv.participants) if (convHold.current.plan[id]) out[id] = convHold.current.plan[id];
    const ps = conv.participants.filter(id => out[id] && !out[id].away && out[id].anim !== 'sleep');
    for (const id of ps) {
      const other = ps.find(o => o !== id) || conv.line?.speaker;
      let p = { ...out[id], faceId: other };
      if ((conv.argue || conv.topic === 'apologize') && p.pose !== 'stand') p = { ...p, pose: 'stand', pos: p.stand, y: 0, anim: 'idle', prop: null };
      if (conv.argue) p.listenArgue = true;
      out[id] = p;
    }
    return out;
  }, [basePlan, conv?.t, conv?.argue, conv?.participants?.join()]);
  const lit = useMemo(() => new Set(sim.agents.filter(a => !/sleep/i.test(a.activity)).map(a => a.location)), [sig]);
  const tvOn = Object.values(plans).some(p => p.anim === 'tv');

  const go = c => setCmd({ ...c, n: Date.now() });
  const openRoom = id => { if (id === 'hallway') return; setRoom(id); setFollow(null); go({ type: 'room', room: id }); };
  const followAgent = id => { setFollow(id); setRoom(null); go({ type: 'follow', id }); };
  const wholeHouse = () => { setRoom(null); setFollow(null); go({ type: 'house' }); };

  const screenshot = () => { const a = document.createElement('a'); a.href = capture.png(); a.download = `family-3d-day${sim.day + 1}-${hhmm(sim.minute).replace(':', '')}.png`; a.click(); };
  const toggleRecord = () => {
    if (recording) { recording.stop(); return; }
    const rec = new MediaRecorder(capture.canvas.captureStream(30), { mimeType: MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4' });
    const chunks = []; rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
      a.download = `family-3d-day${sim.day + 1}.${rec.mimeType.includes('mp4') ? 'mp4' : 'webm'}`; a.click(); setRecording(null); };
    rec.start(); setRecording(rec);
  };
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });

  const live = sim.live, rp = sim.replay, name = id => sim.agents.find(a => a.id === id)?.name || id;
  const inRoom = room ? sim.agents.filter(a => a.location === room) : [];
  const roomLines = room ? sim.transcript.filter(l => l.room === room).slice(-6) : [];

  return <div className="app">
    <Canvas key={quality} shadows={quality === 'high'} dpr={quality === 'high' ? [1, 1.5] : 0.75} gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
      camera={{ position: HOUSE_VIEW.pos, fov: 35, near: 0.1, far: 200 }} onCreated={({ scene }) => { scene.fog = new THREE.Fog('#bcdcf0', 45, 110); }}>
      <OrbitControls makeDefault target={HOUSE_VIEW.target} maxPolarAngle={1.45} minDistance={2} maxDistance={70} enableDamping={false} />
      <CameraRig cmd={cmd} />
      <Capture />
      <House minute={sim.minute} lit={lit} tvOn={tvOn} quality={quality} onRoom={openRoom} />
      <RoomLabels show={!room && !follow} />
      {manifest && sim.agents.map(a => <Character key={a.id} agent={a} plan={plans[a.id]} manifest={manifest} speed={rp ? rp.rate : 1}
        line={conv?.line?.speaker === a.id ? conv.line : null} onPick={followAgent} />)}
    </Canvas>

    <header className="bar">
      <b>AI Family World · 3D house</b>
      <span className="pill">{rp ? `Replay · Day ${rp.day + 1}` : sim.connected ? (live?.running ? '● Live' : '⏸ Paused') : 'Connecting…'}</span>
      <span className="clock">Day {sim.day + 1} · {live?.weekday && !rp ? live.weekday + ' · ' : ''}{hhmm(sim.minute)}</span>
      {!rp && live && <>
        <button onClick={() => post(`/api/control/${live.running ? 'pause' : 'start'}`)}>{live.running ? '⏸ Pause' : '▶ Run'}</button>
        <select value={String(live.speed)} onChange={e => post('/api/settings', { speed: +e.target.value })} title="Real seconds per 10 simulated minutes">
          {[[3, 'Slow'], [1, 'Normal'], [0.5, 'Fast'], [0.2, 'Very fast']].map(([v, l]) => <option key={v} value={String(v)}>{l}</option>)}
          {![3, 1, 0.5, 0.2].includes(live.speed) && <option value={String(live.speed)}>{live.speed}s/tick</option>}
        </select></>}
      <span className="sp" />
      <button onClick={wholeHouse}>🏠 Whole house</button>
      <select value={follow || ''} onChange={e => e.target.value ? followAgent(e.target.value) : wholeHouse()}>
        <option value="">🎥 Follow…</option>{sim.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select value={walls} onChange={e => setWalls(e.target.value)} title="Walls">
        <option value="cutaway">Walls: cutaway</option><option value="up">Walls: up</option><option value="down">Walls: down</option>
      </select>
      <select value={quality} onChange={e => setQuality(e.target.value)} title="Graphics">
        <option value="high">Graphics: high</option><option value="low">Graphics: low (faster)</option>
      </select>
      <button onClick={screenshot}>📷</button>
      <button onClick={toggleRecord} className={recording ? 'rec' : ''}>{recording ? '⏹ Stop' : '⏺ Record'}</button>
      {rp ? <button onClick={sim.stopReplay}>⏹ Exit replay</button>
        : <select value="" onChange={e => e.target.value !== '' && sim.startReplay(+e.target.value)}>
          <option value="">⏮ Replay a day…</option>{Array.from({ length: (live?.day ?? 0) + 1 }, (_, d) => <option key={d} value={d}>Day {d + 1}</option>)}
        </select>}
      <a href="/" className="btn">Dashboard ↗</a>
    </header>

    <aside className="family">
      {sim.agents.map(a => <div key={a.id} className={'who' + (follow === a.id ? ' on' : '')} onClick={() => followAgent(a.id)}>
        <Avatar a={a} />
        <div><b>{a.name}</b> <span title={a.mood}>{EMOJI[a.mood] || '🙂'}</span> <small>{a.mood}</small>
          <div className="act">{a.activity}</div>
          <div className="loc">{a.location === 'outside' ? `Out${a.place ? ' · ' + a.place : ''}` : ROOMS[a.location]?.label || a.location}</div></div>
      </div>)}
      <div className="hint">Drag to orbit · right-drag to pan · scroll to zoom · click a room to inspect it · click a person to follow them</div>
    </aside>

    {room && <aside className="inspect">
      <div className="row"><b>{ROOMS[room].label}</b><span className="sp" /><button onClick={wholeHouse}>✕</button></div>
      {inRoom.length ? inRoom.map(a => <div key={a.id} className="who sm" onClick={() => followAgent(a.id)}>
        <Avatar a={a} /><div><b>{a.name}</b> {EMOJI[a.mood]} <div className="act">{a.activity}</div></div></div>)
        : <p className="muted">Nobody is here right now.</p>}
      <h4>Said in this room</h4>
      {roomLines.length ? roomLines.map((l, i) => <p key={i} className={'ln' + (l.argue ? ' argue' : '')}><b>{l.name}:</b> {l.text}</p>) : <p className="muted">Nothing yet while you've been watching.</p>}
    </aside>}

    {sim.banner && <div className="banner">📣 {sim.banner.text}</div>}

    <div className="subs">
      {conv?.line && <div className={'now' + (conv.argue ? ' argue' : '')}>
        {conv.argue && <span className="tag">argument</span>}{conv.topic === 'apologize' && <span className="tag ok">making up</span>}
        <b style={{ color: sim.agents.find(a => a.id === conv.line.speaker)?.color }}>{conv.line.name}</b>
        <span className="muted"> → {conv.participants.filter(p => p !== conv.line.speaker).map(name).join(', ')} · {ROOMS[conv.room]?.label || conv.room}</span>
        <div>{conv.line.text}</div></div>}
      <label className="muted small"><input type="checkbox" checked={showLog} onChange={e => setShowLog(e.target.checked)} /> conversation log</label>
      {showLog && (sim.transcript.length > 0 || sim.events.length > 0) && <div className="log">{sim.transcript.slice(-5).map((l, i) => <div key={i} className={l.argue ? 'argue' : ''}><b>{l.name}:</b> {l.text}</div>)}
        {sim.events.slice(-2).map(e => <div key={e.id} className="ev">⚡ {e.text}</div>)}</div>}
    </div>

    {rp && <div className="replay">
      <button onClick={() => sim.setReplay(r => ({ ...r, playing: !r.playing }))}>{rp.playing ? '⏸' : '▶'}</button>
      <select value={rp.rate} onChange={e => sim.setReplay(r => ({ ...r, rate: +e.target.value }))}>{[0.5, 1, 2, 4].map(v => <option key={v} value={v}>{v}×</option>)}</select>
      <input type="range" min={0} max={Math.max(0, rp.frames.length - 1)} value={rp.idx} onChange={e => sim.seek(+e.target.value)} />
      <span className="clock">{hhmm(sim.minute)}</span>
      {rp.story.conflicts.map((c, i) => <button key={i} className="chip argue" title={`Why: ${c.cause || '—'}\n${c.resolved ? 'Ended: ' + (c.resolved_how || 'reconciled') : 'Still unresolved'}`}
        onClick={() => sim.seek(Math.max(0, rp.frames.findIndex(f => f.t >= c.t) - 1))}>⚡ {name(c.a)} vs {name(c.b)} {hhmm(c.t % 1440)}</button>)}
      {rp.story.convs.filter(c => c.topic === 'apologize').map((c, i) => <button key={'a' + i} className="chip ok" title={c.summary}
        onClick={() => sim.seek(Math.max(0, rp.frames.findIndex(f => f.t >= c.t) - 1))}>🤝 {name(c.initiator)} {hhmm(c.t % 1440)}</button>)}
    </div>}
  </div>;
}
