// Mutable per-frame view state shared by the 3D components (kept out of React state so frames don't re-render).
import * as THREE from 'three';

export const view = {
  mode: 'house',            // house | room | follow
  walls: 'cutaway',         // cutaway | up | down
  wallLow: [],              // per WALLS index: currently cut down?
  target: new THREE.Vector3(7, 0, 7),
  chars: {},                // id → { root: Object3D } for camera follow and conversation facing
};
