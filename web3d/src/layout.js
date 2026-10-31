// The house in metres. x grows east, z grows south, y is up. A character facing angle θ looks along (sin θ, cos θ):
// θ=0 → south (+z), π → north, π/2 → east, -π/2 → west. Furniture at rot 0 has its "front" (where a person sits/stands) at +z.
const P = Math.PI, H = P / 2;
export const WALL_H = 2.8;

// Backend room ids (world.py ROOMS) map onto these rectangles; bathroom and hallway exist only in 3D.
export const ROOMS = {
  parents_bedroom: { rect: [0, 0, 5, 5], floor: 'wood', label: "Parents' bedroom" },
  bathroom: { rect: [5, 0, 7.5, 5], floor: 'bath', label: 'Bathroom' },
  kids_bedroom: { rect: [7.5, 0, 12.5, 5], floor: 'woodLight', label: "Children's bedroom" },
  study: { rect: [12.5, 0, 16, 5], floor: 'wood', label: 'Study room' },
  hallway: { rect: [0, 5, 16, 6.5], floor: 'marble', label: 'Hallway' },
  living_room: { rect: [0, 6.5, 7, 12], floor: 'marble', label: 'Living room' },
  dining: { rect: [7, 6.5, 11.5, 12], floor: 'marble', label: 'Dining area' },
  kitchen: { rect: [11.5, 6.5, 16, 12], floor: 'kitchenTile', label: 'Kitchen' },
  balcony: { rect: [-2.5, 6.5, 0, 12], floor: 'terracotta', label: 'Balcony' },
  entrance: { rect: [7.5, 12, 11, 14.5], floor: 'stone', label: 'Home entrance' },
};
export const PLOT = [-4, -2, 20, 19.5];           // compound wall
export const GATE = { x: 9.5, w: 1.6 };            // gate in the south compound wall
export const AWAY = [9.5, 20.6];                   // where members walk to when the backend says "outside"

// Walls: a→b along one axis. Openings are measured from a: c = centre, w = width.
// door/arch openings are walkable; windows are not.
const win = (c, w = 1.2, sill = 0.9, top = 2.1) => ({ c, w, kind: 'window', sill, top });
const door = (c, w = 0.9, hinge = 1) => ({ c, w, kind: 'door', sill: 0, top: 2.1, hinge });
export const WALLS = [
  { a: [0, 0], b: [16, 0], ext: true, out: [0, -1], open: [win(2.5, 1.4), win(6.25, 0.6, 1.6), win(10, 1.4), win(14.25, 1.4)] },
  { a: [16, 0], b: [16, 12], ext: true, out: [1, 0], open: [win(2.5), win(5.75, 0.8), win(9.25, 1.4, 1.1)] },
  { a: [0, 12], b: [16, 12], ext: true, out: [0, 1], open: [win(1.2), win(5.8), door(9.25, 1.1, -1), win(13.75, 1.2, 1.1)] },
  { a: [0, 0], b: [0, 12], ext: true, out: [-1, 0], open: [win(2.5, 1.4), win(5.75, 0.8), { c: 9.25, w: 1.6, kind: 'slider', sill: 0, top: 2.2 }] },
  { a: [0, 5], b: [16, 5], open: [door(3.9), door(6.25, 0.8), door(9.1), door(13.6)] },
  { a: [5, 0], b: [5, 5], open: [] },
  { a: [7.5, 0], b: [7.5, 5], open: [] },
  { a: [12.5, 0], b: [12.5, 5], open: [] },
  { a: [11.5, 6.5], b: [16, 6.5], open: [{ ...door(1.5), swing: 1 }] },
  { a: [11.5, 6.5], b: [11.5, 12], open: [{ c: 2.75, w: 1.4, kind: 'arch', sill: 0, top: 2.2 }] },
];
// Low railings: block movement, never cut away.
export const RAILINGS = [[[-2.5, 6.5], [-2.5, 12]], [[-2.5, 6.5], [0, 6.5]], [[-2.5, 12], [0, 12]]];

// Furniture: [type, x, z, rot, opts]. Footprints (w along local x, d along local z) come from SIZE unless given.
export const SIZE = {
  bedDouble: [1.8, 2.1], bedSingle: [1.0, 2.1], bunk: [1.0, 2.1], nightstand: [0.45, 0.4], almirah: [1.0, 0.55],
  dresser: [1.0, 0.45], wardrobe: [1.1, 0.55], deskKids: [1.2, 0.6], deskPC: [1.8, 0.65], desk: [1.2, 0.6],
  bookshelf: [1.4, 0.35], armchair: [0.8, 0.8], chair: [0.45, 0.45], sofa: [3.2, 0.9], coffeeTable: [1.2, 0.6],
  tvUnit: [2.2, 0.45], mandir: [0.8, 0.45], diningTable: [1.8, 0.95], shoeRack: [0.9, 0.35], fridge: [0.7, 0.7],
  counter: [1, 0.65], washBasin: [0.5, 0.45], wc: [0.45, 0.65], basin: [0.5, 0.4], caneChair: [0.6, 0.6],
  roundTable: [0.6, 0.6], dryingRack: [1.0, 0.5], toyBox: [0.7, 0.45], plant: [0.4, 0.4], bigPlant: [0.5, 0.5],
  floorLamp: [0.3, 0.3], bucket: [0.35, 0.35], scooter: [0.7, 1.8], tree: [1.2, 1.2], palm: [0.8, 0.8],
};
const NOBLOCK = new Set(['rug', 'tvWall', 'photo', 'clock', 'ac', 'fan', 'mirror', 'poster', 'whiteboard', 'chimney',
  'purifier', 'geyser', 'shower', 'mat', 'thali', 'lampTable', 'path', 'flowerBed', 'tubelight', 'nameplate', 'curtain']);

export const FURNITURE = [
  // parents' bedroom
  ['bedDouble', 2.0, 1.15, 0], ['nightstand', 0.75, 0.35, 0], ['nightstand', 3.25, 0.35, 0],
  ['lampTable', 0.75, 0.35, 0], ['lampTable', 3.25, 0.35, 0],
  ['almirah', 4.6, 1.2, -H], ['dresser', 0.3, 3.6, H], ['mirror', 0.1, 3.6, H, { y: 1.45, wall: 3 }],
  ['rug', 2.0, 2.9, 0, { w: 1.6, d: 0.9, color: '#8e3b46' }], ['photo', 2.0, 0.1, 0, { y: 1.8, w: 0.9, h: 0.6, wall: 0, img: 'wedding' }],
  ['ac', 2.0, 0.15, 0, { y: 2.35, wall: 0 }], ['fan', 2.2, 2.4, 0], ['plant', 4.6, 4.5, 0],
  // bathroom
  ['wc', 6.95, 0.45, 0], ['basin', 5.25, 2.3, H], ['mirror', 5.08, 2.3, H, { y: 1.5, w: 0.45, h: 0.6, wall: 5 }], ['bucket', 7.05, 2.7, 0],
  ['geyser', 7.4, 3.6, -H, { y: 2.0, wall: 6 }], ['shower', 7.3, 3.2, -H, { y: 2.0 }], ['mat', 6.25, 4.5, 0],
  // children's bedroom
  ['bedSingle', 8.15, 1.15, 0, { sheet: '#4f7cac' }], ['bunk', 11.85, 1.15, 0], ['deskKids', 10.0, 0.4, 0], ['chair', 10.0, 1.0, P, { color: '#e87ba4' }],
  ['wardrobe', 11.8, 4.6, P], ['toyBox', 9.9, 4.55, P], ['rug', 10.0, 3.0, 0, { w: 2.0, d: 1.4, color: '#5aa9c9', round: true }],
  ['poster', 8.15, 0.1, 0, { y: 1.6, wall: 0, color: '#1baf7a' }], ['poster', 12.4, 2.6, -H, { y: 1.6, wall: 7, color: '#eda100' }],
  ['mirror', 8.3, 4.9, P, { y: 1.4, wall: 4 }], ['fan', 10.0, 2.5, 0],
  // study
  ['deskPC', 14.4, 0.4, 0], ['chair', 13.95, 1.0, P], ['chair', 14.85, 1.0, P], ['desk', 15.6, 2.4, -H], ['chair', 15.0, 2.4, H],
  ['bookshelf', 12.8, 2.5, H], ['armchair', 15.3, 4.2, -H, { color: '#6d5843' }], ['floorLamp', 15.7, 4.75, 0],
  ['whiteboard', 14.4, 0.1, 0, { y: 1.75, wall: 0 }],
  // hallway
  ['plant', 15.6, 5.35, 0], ['photo', 8.0, 5.08, 0, { y: 1.7, w: 1.2, h: 0.7, wall: 4, img: 'family' }],
  // living room
  ['sofa', 3.5, 8.0, 0], ['armchair', 6.3, 9.6, -H, { color: '#b5651d' }], ['coffeeTable', 3.5, 9.7, 0],
  ['rug', 3.5, 9.6, 0, { w: 3.4, d: 2.4, color: '#a23b2a' }], ['tvUnit', 3.5, 11.7, P], ['tvWall', 3.5, 11.88, P, { y: 1.45, wall: 2 }],
  ['mandir', 0.3, 7.1, H], ['floorLamp', 1.4, 7.75, 0], ['bigPlant', 6.6, 11.55, 0], ['bigPlant', 0.4, 11.55, 0],
  ['clock', 0.08, 10.9, H, { y: 2.1, wall: 3 }], ['fan', 3.5, 9.0, 0], ['curtain', 0.06, 9.25, H, { w: 2.0, wall: 3 }],
  // dining
  ['diningTable', 9.25, 8.9, 0], ['chair', 8.75, 7.95, 0], ['chair', 9.75, 7.95, 0], ['chair', 8.75, 9.85, P], ['chair', 9.75, 9.85, P],
  ['chair', 7.85, 8.9, H], ['chair', 10.65, 8.9, -H],
  ['thali', 8.75, 8.62, 0], ['thali', 9.75, 8.62, 0], ['thali', 8.75, 9.18, 0], ['thali', 9.75, 9.18, 0], ['thali', 8.5, 8.9, 0], ['thali', 10.0, 8.9, 0],
  ['washBasin', 11.25, 7.2, -H], ['shoeRack', 8.1, 11.75, P], ['fan', 9.25, 8.9, 0], ['photo', 11.42, 10.8, -H, { y: 1.7, w: 0.6, h: 0.8, wall: 9, img: 'deity' }],
  // kitchen
  ['counter', 15.675, 9.4, -H, { len: 4.8, stove: 8.8, sink: 10.5 }], ['counter', 13.675, 11.675, P, { len: 3.35 }],
  ['fridge', 11.95, 6.95, H], ['chimney', 15.75, 8.8, -H, { y: 2.0, wall: 1 }], ['purifier', 15.95, 7.4, -H, { y: 1.45, wall: 1 }],
  ['tubelight', 13.75, 11.95, P, { y: 2.45, wall: 2 }],
  // balcony
  ['caneChair', -1.45, 7.6, -H], ['caneChair', -1.45, 10.9, -H], ['roundTable', -1.75, 9.25, 0],
  ['plant', -2.2, 6.85, 0, { tulsi: true }], ['plant', -2.2, 11.65, 0], ['plant', -0.3, 11.7, 0], ['dryingRack', -1.0, 11.6, 0],
  // entrance & outside
  ['mat', 9.25, 12.35, 0, { color: '#7a4b2a' }], ['plant', 7.8, 12.4, 0], ['plant', 10.7, 12.4, 0], ['nameplate', 10.1, 12.12, 0, { y: 1.5 }],
  ['path', 9.5, 17.0, 0, { w: 1.6, d: 5.0 }], ['scooter', 12.3, 15.2, 0], ['tree', -2.4, 16.2, 0], ['tree', 17.3, 16.8, 0],
  ['tree', 18.2, -0.6, 0], ['palm', 18.3, 9.0, 0], ['palm', -3.1, 3.5, 0], ['flowerBed', 5.0, 14.0, 0, { w: 4.5, d: 0.8 }],
  ['flowerBed', 14.5, 13.6, 0, { w: 3.5, d: 0.8 }],
];

// Spots a member can occupy. pose: sit | lie | stand | floor. y = seat/mattress height. `at` = walkable point next to it.
const s = (room, kind, pose, x, z, th, at, y = 0, tag = '') => ({ room, kind, pose, pos: [x, z], th, at: at || [x, z], y, tag });
export const SPOTS = [
  s('parents_bedroom', 'bed', 'lie', 1.55, 1.55, 0, [0.7, 1.6], 0.55, 'L'), s('parents_bedroom', 'bed', 'lie', 2.45, 1.55, 0, [3.35, 1.6], 0.55, 'R'),
  s('parents_bedroom', 'seat', 'sit', 1.65, 2.05, 0, [1.65, 2.8], 0.5, 'bed'), s('parents_bedroom', 'seat', 'sit', 2.35, 2.05, 0, [2.35, 2.8], 0.5, 'bed'),
  s('parents_bedroom', 'stand', 'stand', 1.0, 3.6, -H, null, 0, 'mirror'), s('parents_bedroom', 'stand', 'stand', 3.8, 1.2, H, null, 0, 'almirah'),
  s('parents_bedroom', 'stand', 'stand', 2.5, 3.9, 0),

  s('kids_bedroom', 'bed', 'lie', 8.15, 1.55, 0, [9.1, 1.6], 0.5), s('kids_bedroom', 'bed', 'lie', 11.85, 1.55, 0, [10.9, 1.6], 0.45),
  s('kids_bedroom', 'bed', 'lie', 11.85, 1.55, 0, [10.9, 1.9], 1.55, 'top'),
  s('kids_bedroom', 'seat', 'sit', 10.0, 1.0, P, [10.0, 1.75], 0.45, 'desk'), s('kids_bedroom', 'seat', 'sit', 8.5, 1.7, H, [9.15, 2.1], 0.5, 'bed'),
  s('kids_bedroom', 'seat', 'sit', 11.5, 1.7, -H, [10.85, 2.1], 0.45, 'bed'),
  s('kids_bedroom', 'floor', 'floor', 9.55, 3.0, H), s('kids_bedroom', 'floor', 'floor', 10.45, 3.0, -H),
  s('kids_bedroom', 'stand', 'stand', 11.8, 3.9, 0, null, 0, 'mirror'), s('kids_bedroom', 'stand', 'stand', 8.3, 4.15, 0, null, 0, 'mirror'),
  s('kids_bedroom', 'stand', 'stand', 10.9, 3.6, 0),

  s('study', 'seat', 'sit', 13.95, 1.0, P, [13.95, 1.75], 0.45, 'pc'), s('study', 'seat', 'sit', 14.85, 1.0, P, [14.85, 1.75], 0.45, 'desk'),
  s('study', 'seat', 'sit', 15.0, 2.4, H, [14.3, 2.4], 0.45, 'desk'), s('study', 'seat', 'sit', 15.25, 4.2, -H, [14.45, 4.2], 0.42, 'arm'),
  s('study', 'stand', 'stand', 13.6, 2.6, -H, null, 0, 'books'), s('study', 'stand', 'stand', 14.0, 3.6, 0),

  s('living_room', 'seat', 'sit', 2.4, 8.05, 0, [2.4, 8.9], 0.45, 'sofa'), s('living_room', 'seat', 'sit', 3.15, 8.05, 0, [3.15, 8.9], 0.45, 'sofa'),
  s('living_room', 'seat', 'sit', 3.85, 8.05, 0, [3.85, 8.9], 0.45, 'sofa'), s('living_room', 'seat', 'sit', 4.6, 8.05, 0, [4.6, 8.9], 0.45, 'sofa'),
  s('living_room', 'seat', 'sit', 6.25, 9.6, -H, [5.45, 9.6], 0.42, 'arm'),
  s('living_room', 'floor', 'floor', 2.6, 10.75, 0), s('living_room', 'floor', 'floor', 3.6, 10.75, -H),
  s('living_room', 'stand', 'stand', 1.0, 7.1, -H, null, 0, 'mandir'), s('living_room', 'stand', 'stand', 5.6, 8.0, 0),
  s('living_room', 'stand', 'stand', 1.2, 9.6, H),

  s('dining', 'seat', 'sit', 8.75, 7.95, 0, [8.75, 7.25], 0.45), s('dining', 'seat', 'sit', 9.75, 7.95, 0, [9.75, 7.25], 0.45),
  s('dining', 'seat', 'sit', 8.75, 9.85, P, [8.75, 10.55], 0.45), s('dining', 'seat', 'sit', 9.75, 9.85, P, [9.75, 10.55], 0.45),
  s('dining', 'seat', 'sit', 7.85, 8.9, H, [7.2, 8.9], 0.45), s('dining', 'seat', 'sit', 10.65, 8.9, -H, [11.0, 8.4], 0.45),
  s('dining', 'stand', 'stand', 10.6, 7.2, -H, null, 0, 'basin'), s('dining', 'stand', 'stand', 8.0, 11.0, 0),

  s('kitchen', 'stand', 'stand', 14.95, 8.8, H, null, 0, 'stove'), s('kitchen', 'stand', 'stand', 14.95, 10.5, H, null, 0, 'sink'),
  s('kitchen', 'stand', 'stand', 13.4, 10.95, 0, null, 0, 'counter'), s('kitchen', 'stand', 'stand', 14.95, 7.6, H, null, 0, 'counter'),
  s('kitchen', 'stand', 'stand', 12.6, 8.6, H),

  s('balcony', 'seat', 'sit', -1.45, 7.6, -H, [-0.7, 7.6], 0.42), s('balcony', 'seat', 'sit', -1.45, 10.9, -H, [-0.7, 10.9], 0.42),
  s('balcony', 'stand', 'stand', -0.7, 8.4, -H), s('balcony', 'floor', 'floor', -0.8, 9.9, -H), s('balcony', 'stand', 'stand', -0.6, 10.1, -H),

  s('entrance', 'stand', 'stand', 9.25, 12.9, P), s('entrance', 'stand', 'stand', 8.3, 13.3, 0), s('entrance', 'stand', 'stand', 10.2, 13.3, 0),
];

export function footprint([type, x, z, rot = 0, o = {}]) {
  if (NOBLOCK.has(type)) return null;
  let [w, d] = o.len ? [o.len, SIZE[type][1]] : o.w ? [o.w, o.d] : SIZE[type] || [0.5, 0.5];
  if (Math.round(Math.abs(rot) / H) % 2) [w, d] = [d, w];
  return [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
}

export function roomAt(x, z) {
  for (const [id, r] of Object.entries(ROOMS)) {
    const [x0, z0, x1, z1] = r.rect;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return id;
  }
  return null;
}

export const roomCenter = id => { const [x0, z0, x1, z1] = ROOMS[id].rect; return [(x0 + x1) / 2, (z0 + z1) / 2]; };
