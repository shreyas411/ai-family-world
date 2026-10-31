// Turns the backend's per-member state (location, activity text, mood) into a concrete spot + animation.
// Nothing here invents activity: every pose comes from what the simulation says the member is doing.
import { SPOTS, AWAY, roomCenter } from './layout.js';
import { walkable, snapFree } from './nav.js';

// activity text → what kind of spot to use and which animation to play there
// Icon shown on each name tag so what someone is doing reads at a glance, even from the whole-house view.
export const ICONS = { sleep: '💤', eat: '🍽️', cook: '🍳', chop: '🔪', clean: '🧽', tv: '📺', phone: '🎮', call: '📞', toys: '🧸', tea: '☕',
  read: '📖', study: '✏️', type: '💻', sketch: '🎨', groom: '🪞', pray: '🙏', care: '🤒', relax: '🛋️', sitTalk: '💬', talk: '💬' };

export function intentFor(a) {
  const act = (a.activity || '').toLowerCase(), loc = a.location;
  if (loc === 'outside') return { kind: 'away', anim: 'walk' };
  if (/sleep/.test(act)) return { kind: 'bed', anim: 'sleep' };
  if (/talking with spouse/.test(act)) return { kind: 'seat', anim: 'sitTalk', tag: 'bed' };
  const talk = act.match(/^talking with (.+)$/);
  if (talk) return { kind: 'talk', anim: 'talk', with: talk[1] };
  if (/fever|sick|take care|look after|nurse/.test(act)) return { kind: 'seat', anim: 'care', tag: 'bed' };
  if (/calling|phone call|on a call/.test(act)) return { kind: 'stand', anim: 'call', prop: 'phone' };
  if (/breakfast|dinner|lunch|snack|eat|meal/.test(act)) return { kind: 'seat', anim: 'eat', prop: loc === 'dining' ? null : 'plate' };
  if (/laundry|trash|dishes|sweep|mop/.test(act)) return { kind: 'stand', anim: 'clean', tag: 'sink' };
  if (/cook/.test(act)) return { kind: 'stand', anim: 'cook', tag: 'stove', prop: 'ladle' };
  if (/helping in the kitchen|chop/.test(act)) return { kind: 'stand', anim: 'chop', tag: 'counter', prop: 'knife' };
  if (/household|clean|wash|laundry|chore/.test(act)) return { kind: 'stand', anim: 'clean', tag: 'sink' };
  if (/news|tv|watch/.test(act)) return { kind: 'seat', anim: 'tv', tag: 'sofa' };
  if (/phone|gaming|scroll/.test(act)) return { kind: 'seat', anim: 'phone', prop: 'phone' };
  if (/toys|^playing/.test(act)) return { kind: 'floor', anim: 'toys', prop: 'toy' };
  if (/tea|newspaper/.test(act)) return { kind: 'seat', anim: 'tea', prop: 'cup' };
  if (/story|reading|read/.test(act)) return { kind: 'seat', anim: 'read', prop: 'book' };
  if (/hobby|draw|paint|sketch|colouring/.test(act)) return { kind: 'seat', anim: 'sketch', prop: 'pen+sketchbook' };
  if (/getting ready/.test(act)) return { kind: 'stand', anim: 'groom', tag: 'mirror' };
  if (/pray|puja/.test(act)) return { kind: 'stand', anim: 'pray', tag: 'mandir' };
  if (/working on|study|homework|assignment|revise|exam|project|lab|report|bill|budget/.test(act)) {
    if (loc === 'kitchen') return /prepare|snack|cook|meal|bake/.test(act) ? { kind: 'stand', anim: 'cook', tag: 'stove', prop: 'ladle' }
      : { kind: 'stand', anim: 'chop', tag: 'counter', prop: 'knife' };
    if (loc === 'study' && (a.id === 'father' || a.id === 'son' || a.age >= 18)) return { kind: 'seat', anim: 'type', tag: 'pc' };
    if (loc === 'study' || loc === 'kids_bedroom') return { kind: 'seat', anim: 'study', tag: 'desk', prop: 'pen' };
    return { kind: 'seat', anim: 'read', prop: 'book' };
  }
  if (/personal time/.test(act)) return { kind: 'seat', anim: 'tea', prop: 'cup' };
  return { kind: 'seat', anim: 'relax' };                // resting, free time, family time, waking up...
}

const STAND_ANIMS = new Set(['idle', 'talk', 'cook', 'clean', 'chop', 'groom', 'pray', 'call']);
const key = p => `${p.pos[0].toFixed(2)},${p.pos[1].toFixed(2)},${p.y}`;
const facing = ([x, z], [tx, tz]) => Math.atan2(tx - x, tz - z);

// Walkable point ~r from a target, preferring the side the target is facing, not taken by anyone else.
function besideTarget(t, taken, r = 0.85) {
  const base = t.th ?? 0;
  for (let k = 0; k < 16; k++) {
    const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
    const x = t.stand[0] + Math.sin(ang) * r, z = t.stand[1] + Math.cos(ang) * r;
    if (walkable(x, z) && ![...taken].some(q => { const [a, b] = q.split(',').map(Number); return Math.hypot(a - x, b - z) < 0.55; }))
      return [x, z];
  }
  return snapFree(t.stand[0] + 0.8, t.stand[1]);
}

// prev: last plan (keeps members in the same seat when nothing changed). Returns {id: plan}.
export function plan(agents, prev = {}) {
  const out = {}, taken = new Set();
  const byName = Object.fromEntries(agents.map(a => [a.name.toLowerCase(), a]));
  const intents = Object.fromEntries(agents.map(a => [a.id, intentFor(a)]));
  const order = [...agents].sort((a, b) => (intents[a.id].kind === 'talk') - (intents[b.id].kind === 'talk'));
  const take = p => { taken.add(key(p)); taken.add(`${p.stand[0].toFixed(2)},${p.stand[1].toFixed(2)},s`); };

  for (const a of order) {
    const it = intents[a.id], room = a.location;
    if (it.kind === 'away') { out[a.id] = { ...it, room, pose: 'stand', pos: AWAY, stand: AWAY, th: 0, y: 0, away: true }; continue; }
    if (it.kind === 'talk') {
      const other = byName[it.with] && out[byName[it.with].id];
      if (other && !other.away && other.room === room) {
        const at = besideTarget(other, taken);
        const p = { ...it, room, pose: 'stand', pos: at, stand: at, th: facing(at, other.pos), y: 0, faceId: byName[it.with].id };
        take(p); out[a.id] = p; continue;
      }
      it.kind = 'stand';                                    // partner not here: talk where they stand
    }
    const pool = SPOTS.filter(s => s.room === room && s.kind === it.kind);
    const cand = [...pool.filter(s => it.tag && s.tag === it.tag), ...pool, ...SPOTS.filter(s => s.room === room && s.kind === 'seat'),
      ...SPOTS.filter(s => s.room === room && s.kind === 'stand')]
      .filter(s => !(s.tag === 'top' && a.age > 14));        // the top bunk is for the youngest
    const old = prev[a.id];
    const free = cand.filter(s => !taken.has(key({ pos: s.pos, y: s.y })));
    const pick = free.find(s => old && old.room === room && key({ pos: s.pos, y: s.y }) === key(old)) || free[0];
    let p;
    if (pick) {
      const standAnim = STAND_ANIMS.has(it.anim);
      const anim = pick.pose === 'stand' ? (standAnim ? it.anim : 'idle') : pick.pose === 'sit' ? (standAnim ? 'relax' : it.anim)
        : pick.pose === 'floor' ? (it.anim === 'toys' ? 'toys' : 'floorIdle') : 'sleep';
      p = { ...it, anim, room, pose: pick.pose, pos: pick.pos, stand: pick.at, th: pick.th, y: pick.y };
    } else {                                                  // room full: stand somewhere free in it
      const [x, z] = roomCenter(room); const at = besideTarget({ stand: snapFree(x, z), th: 0 }, taken, 0.6);
      p = { ...it, anim: 'idle', room, pose: 'stand', pos: at, stand: at, th: 0, y: 0 };
    }
    take(p); out[a.id] = p;
  }
  return out;
}

// Expression + posture from the backend's dominant mood.
const FACE = {
  happiness: 'happy', excitement: 'happy', love: 'happy', affection: 'happy', pride: 'happy', gratitude: 'happy', calm: 'calm',
  curiosity: 'calm', sadness: 'sad', disappointment: 'sad', loneliness: 'sad', guilt: 'sad', anger: 'angry', frustration: 'angry',
  jealousy: 'angry', fear: 'scared', anxiety: 'scared', surprise: 'surprised', asleep: 'asleep',
};
export const faceFor = mood => FACE[mood] || 'calm';
