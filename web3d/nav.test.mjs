// node nav.test.mjs — every spot's approach point is walkable, and every room-to-room route stays on walkable cells
// (so characters never pass through walls or furniture and always go through doors).
import { SPOTS, AWAY } from './src/layout.js';
import { walkable, findPath } from './src/nav.js';

let bad = 0;
for (const s of SPOTS) if (!walkable(...s.at)) { console.log('approach point blocked:', s.room, s.kind, s.tag, s.at); bad++; }
const pts = [...SPOTS.map(s => s.at), AWAY];
for (let i = 0; i < pts.length; i++) for (let j = 0; j < pts.length; j++) {
  if (i === j) continue;
  const p = findPath(pts[i], pts[j]), end = p[p.length - 1];
  if (Math.hypot(end[0] - pts[j][0], end[1] - pts[j][1]) > 0.01 || p.length < 2 && i !== j) { console.log('no route', pts[i], '→', pts[j]); bad++; continue; }
  for (let k = 1; k < p.length; k++) {
    const [ax, az] = p[k - 1], [bx, bz] = p[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.05);
    for (let q = 1; q < n; q++) if (!walkable(ax + (bx - ax) * q / n, az + (bz - az) * q / n)) { console.log('route crosses obstacle', pts[i], '→', pts[j]); bad++; k = p.length; break; }
  }
}
console.log(bad ? `FAIL (${bad})` : `OK: ${SPOTS.length} spots, ${pts.length * (pts.length - 1)} routes`);
process.exit(bad ? 1 : 0);
