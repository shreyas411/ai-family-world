// Walkability grid over the plot + A*. Walls block except at door/arch openings; furniture, railings, the compound wall
// (except the gate) and trees block. Characters therefore route through doors and around furniture.
import { WALLS, RAILINGS, FURNITURE, PLOT, GATE, footprint } from './layout.js';

const CELL = 0.25, R = 0.22;                       // R = body radius kept clear of walls/furniture
const X0 = PLOT[0] - 0.5, Z0 = PLOT[1] - 0.5, X1 = PLOT[2] + 0.5, Z1 = PLOT[3] + 1.6;
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
const blocked = new Uint8Array(NX * NZ);
const cx = i => X0 + (i + 0.5) * CELL, cz = j => Z0 + (j + 0.5) * CELL;
const ci = x => Math.floor((x - X0) / CELL), cj = z => Math.floor((z - Z0) / CELL);

function blockSegment([ax, az], [bx, bz], half, gaps = []) {
  const horiz = az === bz;
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = cx(i), z = cz(j);
    const along = horiz ? x - ax : z - az, across = horiz ? z - az : x - ax, len = horiz ? bx - ax : bz - az;
    if (Math.abs(across) > half || along < -half || along > len + half) continue;
    if (gaps.some(g => Math.abs(along - g.c) < g.w / 2 - 0.12)) continue;
    blocked[j * NX + i] = 1;
  }
}
function blockRect([x0, z0, x1, z1], pad = 0.15) {
  for (let j = Math.max(0, cj(z0 - pad)); j <= Math.min(NZ - 1, cj(z1 + pad)); j++)
    for (let i = Math.max(0, ci(x0 - pad)); i <= Math.min(NX - 1, ci(x1 + pad)); i++) {
      const x = cx(i), z = cz(j);
      if (x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad) blocked[j * NX + i] = 1;
    }
}

for (const w of WALLS) blockSegment(w.a, w.b, 0.1 + R, w.open.filter(o => o.kind !== 'window'));
for (const [a, b] of RAILINGS) blockSegment(a, b, 0.05 + R);
const [px0, pz0, px1, pz1] = PLOT;
blockSegment([px0, pz0], [px1, pz0], 0.1 + R); blockSegment([px0, pz0], [px0, pz1], 0.1 + R); blockSegment([px1, pz0], [px1, pz1], 0.1 + R);
blockSegment([px0, pz1], [px1, pz1], 0.1 + R, [{ c: GATE.x - px0, w: GATE.w }]);
for (const f of FURNITURE) { const fp = footprint(f); if (fp) blockRect(fp, f[0] === 'tree' || f[0] === 'palm' ? -0.2 : 0.15); }

export const walkable = (x, z) => { const i = ci(x), j = cj(z); return i >= 0 && j >= 0 && i < NX && j < NZ && !blocked[j * NX + i]; };

function nearestFree(i, j) {
  if (!blocked[j * NX + i]) return [i, j];
  for (let r = 1; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    const a = i + di, b = j + dj;
    if (a >= 0 && b >= 0 && a < NX && b < NZ && !blocked[b * NX + a]) return [a, b];
  }
  return [i, j];
}
export const snapFree = (x, z) => { const [i, j] = nearestFree(ci(x), cj(z)); return [cx(i), cz(j)]; };

function lineFree(ax, az, bx, bz) {
  const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
  for (let k = 0; k <= n; k++) if (!walkable(ax + (bx - ax) * k / n, az + (bz - az) * k / n)) return false;
  return true;
}

// A* (8-way, no corner cutting) then string-pulling. Returns [[x,z], ...] ending exactly at the target.
export function findPath([sx, sz], [tx, tz]) {
  const [si, sj] = nearestFree(ci(sx), cj(sz)), [ti, tj] = nearestFree(ci(tx), cj(tz));
  const start = sj * NX + si, goal = tj * NX + ti;
  const g = new Float32Array(NX * NZ).fill(Infinity), from = new Int32Array(NX * NZ).fill(-1), closed = new Uint8Array(NX * NZ);
  const open = [start]; g[start] = 0;
  const h = n => { const dx = Math.abs(n % NX - ti), dz = Math.abs((n / NX | 0) - tj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const f = new Float32Array(NX * NZ).fill(Infinity); f[start] = h(start);
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;  // ponytail: linear open list, fine for ~10k cells
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue; closed[cur] = 1;
    const i = cur % NX, j = cur / NX | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
      const n = b * NX + a;
      if (blocked[n] || closed[n]) continue;
      if (di && dj && (blocked[j * NX + a] || blocked[b * NX + i])) continue;
      const ng = g[cur] + (di && dj ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; f[n] = ng + h(n); from[n] = cur; open.push(n); }
    }
  }
  if (start !== goal && from[goal] < 0) return [[tx, tz]];          // unreachable: caller just glides there
  const cells = []; for (let n = goal; n >= 0; n = n === start ? -1 : from[n]) cells.push([cx(n % NX), cz(n / NX | 0)]);
  cells.reverse(); cells[0] = [sx, sz];
  if (walkable(tx, tz)) cells.push([tx, tz]);
  const out = [cells[0]];
  for (let k = 1; k < cells.length; k++) {
    const last = out[out.length - 1];
    if (k + 1 < cells.length && lineFree(last[0], last[1], cells[k + 1][0], cells[k + 1][1])) continue;
    out.push(cells[k]);
  }
  return out;
}

if (import.meta.env?.DEV) window.__nav = { walkable, findPath, NX, NZ };
