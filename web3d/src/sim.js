// Data source for the 3D view: the live WebSocket feed, or a recorded day (replay). Both produce the same shape:
// agents with {id, name, color, age, location, activity, mood}, plus conversations played out line by line.
import { useCallback, useEffect, useRef, useState } from 'react';

const isArgument = c => c.tension > 0.55 || c.topic === 'conflict';
const lineSecs = text => Math.min(6, Math.max(2.4, 1.4 + text.length * 0.045));

// Plays conversations one line at a time. Arguments and apologies are never dropped; routine chatter is when we fall behind.
function useConversationPlayer(rate) {
  const queue = useRef([]), [conv, setConv] = useState(null), [transcript, setTranscript] = useState([]);
  const timer = useRef(null), playing = useRef(false), rateRef = useRef(rate); rateRef.current = rate;
  const next = useCallback(() => {
    clearTimeout(timer.current);
    const c = queue.current.shift();
    if (!c) { playing.current = false; setConv(null); return; }
    playing.current = true;
    let i = 0;
    const step = () => {
      if (i >= c.lines.length) { next(); return; }
      const l = c.lines[i];
      const line = { ...l, argue: c.argue, reconcile: c.topic === 'apologize' };
      setConv({ ...c, line, idx: i });
      setTranscript(tr => [...tr.slice(-40), { ...line, t: c.t, room: c.room, topic: c.topic }]);
      i++;
      timer.current = setTimeout(step, lineSecs(l.text) * 1000 / rateRef.current);
    };
    step();
  }, []);
  const push = useCallback(c => {
    if (!c.lines?.length) return;
    const item = { ...c, argue: isArgument(c) };
    queue.current.push(item);
    if (queue.current.length > 3) queue.current = queue.current.filter((q, k) => q.argue || q.topic === 'apologize' || k >= queue.current.length - 3);
    if (!playing.current) next();
  }, [next]);
  const clear = useCallback(() => { queue.current = []; playing.current = false; clearTimeout(timer.current); timer.current = null; setConv(null); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { conv, transcript, push, clear };
}

export function useSim() {
  const [live, setLive] = useState(null), [events, setEvents] = useState([]), [connected, setConnected] = useState(false);
  const [replay, setReplay] = useState(null);            // {day, frames, story, idx, playing, rate}
  const [banner, setBanner] = useState(null);
  const player = useConversationPlayer(replay ? replay.rate : 1);
  const replayRef = useRef(replay); replayRef.current = replay;
  const pushRef = useRef(player.push); pushRef.current = player.push;

  useEffect(() => {
    let ws, stop = false, retry;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => { setConnected(false); if (!stop) retry = setTimeout(connect, 1500); };
      ws.onmessage = m => {
        const msg = JSON.parse(m.data);
        setLive(msg.state);
        for (const it of msg.items) {
          if (it.kind === 'conv' && it.participants[0] === 'controller') setBanner({ text: it.lines[0]?.text, until: Date.now() + 6000 });
          else if (it.kind === 'conv' && !replayRef.current) pushRef.current(it);
          else if (it.kind === 'event' && /event|relationship|claim|carryover|controller|learning/.test(it.type)) setEvents(e => [...e.slice(-7), it]);
        }
      };
    };
    connect();
    return () => { stop = true; clearTimeout(retry); ws?.close(); };
  }, []);

  // replay clock: one stored frame = 10 simulated minutes
  const talking = useRef(false); talking.current = !!player.conv;
  useEffect(() => {
    if (!replay?.playing) return;
    const id = setInterval(() => setReplay(r => {
      if (!r || r.idx >= r.frames.length - 1) return r && { ...r, playing: false };
      if (talking.current) return r;                      // hold the clock while a conversation plays out
      const idx = r.idx + 1, t = r.frames[idx].t;
      for (const c of r.story.convs) if (c.t > r.frames[r.idx].t && c.t <= t) pushRef.current(c);
      return { ...r, idx };
    }), 1500 / replay.rate);
    return () => clearInterval(id);
  }, [replay?.playing, replay?.rate]);

  const startReplay = useCallback(async day => {
    player.clear();
    const [frames, story] = await Promise.all([fetch(`/api/history/frame?day=${day}`).then(r => r.json()), fetch(`/api/story?day=${day}`).then(r => r.json())]);
    setReplay({ day, frames, story, idx: 0, playing: true, rate: 1 });
  }, [player.clear]);
  const stopReplay = useCallback(() => { player.clear(); setReplay(null); }, [player.clear]);
  const seek = useCallback(idx => { player.clear(); setReplay(r => r && { ...r, idx }); }, [player.clear]);

  let agents = live?.agents || [], minute = live?.minute ?? 720, day = live?.day ?? 0;
  if (replay && replay.frames.length) {
    const f = replay.frames[replay.idx];
    agents = agents.filter(a => f.data[a.id]).map(a => ({ ...a, location: f.data[a.id].loc, activity: f.data[a.id].act, mood: f.data[a.id].mood, place: f.data[a.id].place }));
    minute = f.t % 1440; day = Math.floor(f.t / 1440);
  }
  return { live, agents, minute, day, connected, events, banner: banner && banner.until > Date.now() ? banner : null,
    conv: player.conv, transcript: player.transcript, replay, setReplay, startReplay, stopReplay, seek };
}
