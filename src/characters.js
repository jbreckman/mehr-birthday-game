import * as THREE from 'three';
import { GEO, mat, part, pick, rand } from './util.js';

export const SKIN = ['#f1c7a5', '#e0ac85', '#c68b62', '#a86b45', '#8a5433', '#6b3f24', '#f5d3b8'];
const SHIRTS = ['#e85d75', '#4f8ef7', '#f7b733', '#5cc28a', '#9b6bff', '#ff8a4c', '#2ec4c6', '#f2f2f2', '#b0bec5', '#d98cff', '#6d8b74'];
const PANTS = ['#2d3142', '#3b4a6b', '#4a4a4a', '#7a6a58', '#1f2a44', '#5a4636'];
const HAIR = ['#2b1d14', '#4a2e1c', '#111', '#8b5a2b', '#d9b26f', '#6b6b6b', '#a33b20'];
const HAIR_STYLES = ['short', 'short', 'bun', 'long', 'bald', 'curly', 'cap', 'spiky'];

let _shadowGeo, _shadowMat;
export function blobShadow(r = 0.32) {
  if (!_shadowGeo) {
    _shadowGeo = new THREE.CircleGeometry(1, 20);
    _shadowGeo.rotateX(-Math.PI / 2);
    _shadowMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false });
  }
  const m = new THREE.Mesh(_shadowGeo, _shadowMat);
  m.scale.setScalar(r);
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

function eye(x, y, z, r = 0.035) {
  const e = new THREE.Mesh(GEO.sph, mat('#141414'));
  e.scale.setScalar(r * 2);
  e.position.set(x, y, z);
  return e;
}

/** Stylized walking person facing +z. */
export function makeHuman(o = {}) {
  const skin = o.skin || pick(SKIN);
  const shirt = o.shirt || pick(SHIRTS);
  const pants = o.pants || pick(PANTS);
  const hair = o.hair || pick(HAIR);
  const style = o.hairStyle || pick(HAIR_STYLES);

  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  g.add(blobShadow(0.34));

  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.1, 0.52, 0);
    const leg = part('box', pants, 0.14, 0.5, 0.16, 0, -0.5, 0);
    const shoe = part('box', '#222', 0.15, 0.08, 0.24, 0, -0.52, 0.04);
    pivot.add(leg, shoe);
    body.add(pivot);
    legs.push(pivot);
  }
  const torso = part('cyl', shirt, 0.46, 0.56, 0.3, 0, 0.5, 0);
  body.add(torso);
  const arms = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.28, 1.0, 0);
    const arm = part('box', shirt, 0.11, 0.42, 0.13, 0, -0.42, 0);
    const hand = part('sph', skin, 0.12, 0.12, 0.12, 0, -0.52, 0);
    pivot.add(arm, hand);
    body.add(pivot);
    arms.push(pivot);
  }
  const head = new THREE.Group();
  head.position.set(0, 1.06, 0);
  body.add(head);
  head.add(part('cyl', skin, 0.12, 0.1, 0.12, 0, 0, 0));
  head.add(part('sph', skin, 0.5, 0.5, 0.5, 0, 0.06, 0));
  head.add(eye(-0.085, 0.34, 0.215), eye(0.085, 0.34, 0.215));
  head.add(part('sph', skin, 0.08, 0.07, 0.08, 0, 0.26, 0.24)); // nose

  // hair
  switch (style) {
    case 'short':
      head.add(part('sph', hair, 0.53, 0.3, 0.53, 0, 0.36, -0.015));
      break;
    case 'spiky':
      head.add(part('sph', hair, 0.52, 0.28, 0.52, 0, 0.36, -0.01));
      for (let i = 0; i < 5; i++) {
        const c = part('box', hair, 0.08, 0.14, 0.08, (i - 2) * 0.08, 0.52, 0);
        c.rotation.z = (i - 2) * 0.2;
        head.add(c);
      }
      break;
    case 'bun':
      head.add(part('sph', hair, 0.53, 0.32, 0.53, 0, 0.34, -0.015));
      head.add(part('sph', hair, 0.22, 0.22, 0.22, 0, 0.5, -0.18));
      break;
    case 'long':
      head.add(part('sph', hair, 0.54, 0.34, 0.54, 0, 0.33, -0.015));
      head.add(part('box', hair, 0.5, 0.5, 0.2, 0, -0.02, -0.16));
      break;
    case 'curly':
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        head.add(part('sph', hair, 0.2, 0.2, 0.2, Math.sin(a) * 0.17, 0.45, Math.cos(a) * 0.17 - 0.03));
      }
      head.add(part('sph', hair, 0.3, 0.2, 0.3, 0, 0.5, -0.02));
      break;
    case 'cap': {
      const cap = o.capColor || pick(['#c0392b', '#2e86de', '#27ae60', '#222']);
      head.add(part('sph', cap, 0.53, 0.3, 0.53, 0, 0.37, -0.01));
      head.add(part('box', cap, 0.36, 0.03, 0.2, 0, 0.44, 0.27));
      break;
    }
    default:
      break; // bald
  }

  const h = { group: g, body, legs, arms, head, torso, style, shirt, skin };
  if (o.tie) {
    torso.parent.add(part('box', o.tie, 0.07, 0.34, 0.03, 0, 0.66, 0.155));
  }
  return h;
}

export function addTo(h, parentKey, obj) {
  h[parentKey].add(obj);
  return obj;
}

// ---------------------------------------------------------------- per-type dressing
export function dress(h, type) {
  const extra = {};
  switch (type) {
    case 'boss': {
      h.group.scale.setScalar(1.08);
      h.body.add(part('box', '#c0392b', 0.08, 0.36, 0.03, 0, 0.64, 0.155));
      const mug = part('cyl', '#fff', 0.13, 0.15, 0.13, 0, -0.62, 0.08);
      h.arms[1].add(mug);
      h.arms[1].rotation.x = -0.9;
      extra.mugArm = true;
      break;
    }
    case 'zoom': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.025, 6, 16, Math.PI), mat('#222'));
      band.position.set(0, 0.3, 0);
      band.rotation.z = 0;
      h.head.add(band);
      for (const s of [-1, 1]) h.head.add(part('cyl', '#222', 0.1, 0.12, 0.1, s * 0.26, 0.22, 0));
      h.head.add(part('box', '#222', 0.03, 0.03, 0.18, 0.2, 0.17, 0.14));
      const lap = new THREE.Group();
      lap.add(part('box', '#9aa', 0.42, 0.03, 0.3, 0, 0, 0));
      const scr = part('box', '#9aa', 0.42, 0.28, 0.03, 0, 0, -0.14);
      scr.rotation.x = -0.25;
      lap.add(scr);
      lap.add(part('box', '#7fd0ff', 0.36, 0.22, 0.01, 0, 0.03, -0.12, { basic: true }));
      lap.position.set(0, 0.78, 0.36);
      h.body.add(lap);
      h.arms[0].rotation.x = h.arms[1].rotation.x = -1.2;
      extra.armsFixed = true;
      break;
    }
    case 'ladder': {
      h.body.add(part('cyl', '#ff7a1a', 0.5, 0.36, 0.33, 0, 0.64, 0));
      h.body.add(part('box', '#e8ff3a', 0.48, 0.05, 0.32, 0, 0.8, 0));
      h.head.add(part('sph', '#ffd21a', 0.56, 0.3, 0.56, 0, 0.38, 0));
      const lad = new THREE.Group();
      for (const s of [-1, 1]) lad.add(part('box', '#c9c9c9', 0.05, 0.05, 2.2, s * 0.18, 0, 0));
      for (let i = -4; i <= 4; i++) lad.add(part('box', '#c9c9c9', 0.36, 0.04, 0.04, 0, 0, i * 0.24));
      lad.position.set(0.32, 1.15, 0);
      h.body.add(lad);
      extra.ladder = lad;
      h.arms[1].rotation.z = 2.6;
      extra.armsFixed = true;
      break;
    }
    case 'janitor': {
      h.body.add(part('box', '#2f5d9e', 0.36, 0.36, 0.05, 0, 0.62, 0.15));
      const mop = new THREE.Group();
      mop.add(part('cyl', '#b58b5a', 0.04, 1.4, 0.04, 0, -0.9, 0));
      mop.add(part('box', '#ddd', 0.3, 0.1, 0.12, 0, -0.95, 0));
      mop.position.set(0, -0.4, 0.2);
      mop.rotation.x = 0.5;
      h.arms[1].add(mop);
      extra.mop = mop;
      break;
    }
    case 'it': {
      h.head.add(part('sph', h.shirt, 0.56, 0.5, 0.4, 0, -0.02, -0.12)); // hood
      for (const s of [-1, 1]) h.head.add(part('box', '#111', 0.13, 0.08, 0.02, s * 0.085, 0.3, 0.235));
      h.head.add(part('box', '#111', 0.3, 0.015, 0.02, 0, 0.33, 0.235));
      const lap = part('box', '#555', 0.34, 0.03, 0.26, 0.07, -0.3, 0.1);
      lap.rotation.z = 1.4;
      h.arms[0].add(lap);
      break;
    }
    case 'intern': {
      h.body.add(part('box', '#2e86de', 0.2, 0.4, 0.02, 0, 0.66, 0.16));
      h.body.add(part('box', '#fff', 0.1, 0.12, 0.02, 0, 0.62, 0.175));
      h.body.add(part('box', pick(['#ff6b93', '#ffd84d', '#27c07d', '#333']), 0.34, 0.42, 0.18, 0, 0.58, -0.23));
      break;
    }
    case 'cake': {
      const cake = new THREE.Group();
      cake.add(part('cyl', '#fff', 0.5, 0.03, 0.5, 0, 0, 0));
      cake.add(part('cyl', '#ffb3d1', 0.42, 0.2, 0.42, 0, 0.03, 0));
      cake.add(part('cyl', '#fff6fb', 0.43, 0.04, 0.43, 0, 0.21, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        cake.add(part('cyl', pick(['#5aa9ff', '#ffd84d', '#27c07d']), 0.025, 0.12, 0.025, Math.sin(a) * 0.13, 0.25, Math.cos(a) * 0.13));
        cake.add(part('sph', '#ffb020', 0.04, 0.06, 0.04, Math.sin(a) * 0.13, 0.37, Math.cos(a) * 0.13, { basic: true }));
      }
      cake.position.set(0, 0.95, 0.42);
      h.body.add(cake);
      h.arms[0].rotation.x = h.arms[1].rotation.x = -1.3;
      extra.armsFixed = true;
      break;
    }
    case 'party': {
      const hat = part('cyl', pick(['#ff6b93', '#5aa9ff', '#ffd84d']), 0.001, 0.3, 0.001, 0, 0.5, 0);
      hat.geometry = new THREE.ConeGeometry(0.12, 0.3, 10);
      hat.scale.set(1, 1, 1);
      hat.position.set(0.02, 0.62, 0);
      h.head.add(hat);
      break;
    }
    default:
      break;
  }
  return extra;
}

export function wetFloorSign() {
  const g = new THREE.Group();
  const a = part('box', '#ffd21a', 0.35, 0.55, 0.03, 0, 0, 0.12);
  a.rotation.x = -0.3;
  const b = part('box', '#ffd21a', 0.35, 0.55, 0.03, 0, 0, -0.12);
  b.rotation.x = 0.3;
  g.add(a, b, part('box', '#222', 0.2, 0.05, 0.035, 0, 0.3, 0.2));
  g.add(blobShadow(0.25));
  return g;
}

// ---------------------------------------------------------------- critters
export function makeDog() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body, blobShadow(0.35));
  const fur = '#d9a441';
  body.add(part('box', fur, 0.3, 0.25, 0.6, 0, 0.25, 0));
  const head = new THREE.Group();
  head.position.set(0, 0.45, 0.32);
  head.add(part('box', fur, 0.26, 0.24, 0.26, 0, 0, 0));
  head.add(part('box', '#c48f2f', 0.16, 0.12, 0.14, 0, 0, 0.18));
  head.add(part('sph', '#111', 0.06, 0.05, 0.05, 0, 0.08, 0.26));
  head.add(eye(-0.07, 0.15, 0.13, 0.025), eye(0.07, 0.15, 0.13, 0.025));
  for (const s of [-1, 1]) {
    const ear = part('box', '#b07a25', 0.06, 0.16, 0.1, s * 0.15, 0.02, 0);
    head.add(ear);
  }
  body.add(head);
  const legs = [];
  for (const [x, z] of [
    [-0.1, 0.22],
    [0.1, 0.22],
    [-0.1, -0.22],
    [0.1, -0.22],
  ]) {
    const p = new THREE.Group();
    p.position.set(x, 0.28, z);
    p.add(part('box', fur, 0.08, 0.28, 0.08, 0, -0.28, 0));
    body.add(p);
    legs.push(p);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.45, -0.3);
  tail.add(part('box', fur, 0.06, 0.06, 0.25, 0, 0, -0.1));
  body.add(tail);
  return { group: g, body, legs, head, tail, arms: [], critter: 'dog' };
}

export function makeRoomba() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body, blobShadow(0.25));
  body.add(part('cyl', '#333', 0.45, 0.09, 0.45, 0, 0.01, 0));
  body.add(part('cyl', '#666', 0.2, 0.02, 0.2, 0, 0.1, 0));
  body.add(part('sph', '#27c07d', 0.05, 0.05, 0.05, 0, 0.1, 0.17, { basic: true }));
  // a cat riding it, obviously
  const cat = new THREE.Group();
  cat.add(part('box', '#555', 0.16, 0.14, 0.3, 0, 0.1, 0));
  cat.add(part('box', '#555', 0.15, 0.14, 0.13, 0, 0.2, 0.15));
  for (const s of [-1, 1]) cat.add(part('box', '#555', 0.04, 0.06, 0.02, s * 0.05, 0.34, 0.15));
  cat.add(part('box', '#555', 0.03, 0.2, 0.03, 0, 0.14, -0.16));
  body.add(cat);
  return { group: g, body, legs: [], arms: [], head: cat, critter: 'roomba' };
}

export function makePigeon() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(part('sph', '#8a8f9c', 0.22, 0.2, 0.32, 0, 0, 0));
  body.add(part('sph', '#6c7ea8', 0.14, 0.14, 0.14, 0, 0.1, 0.14));
  body.add(part('box', '#f0a030', 0.04, 0.03, 0.07, 0, 0.14, 0.23));
  const wings = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    p.position.set(s * 0.08, 0.1, 0);
    p.add(part('box', '#7a7f8c', 0.3, 0.02, 0.18, s * 0.15, 0, 0));
    body.add(p);
    wings.push(p);
  }
  const shadow = blobShadow(0.15);
  g.add(shadow);
  return { group: g, body, legs: [], arms: [], wings, head: body, critter: 'pigeon', shadow };
}

// ---------------------------------------------------------------- animation
export function animateWalk(h, phase, amount, dt) {
  const sw = Math.sin(phase) * 0.65 * amount;
  if (h.critter === 'dog') {
    h.legs[0].rotation.x = h.legs[3].rotation.x = sw;
    h.legs[1].rotation.x = h.legs[2].rotation.x = -sw;
    h.tail.rotation.y = Math.sin(phase * 2.5) * 0.7;
    h.body.position.y = Math.abs(Math.sin(phase)) * 0.03 * amount;
    return;
  }
  if (h.critter) return;
  h.legs[0].rotation.x = sw;
  h.legs[1].rotation.x = -sw;
  if (!h.armsFixed) {
    h.arms[0].rotation.x = -sw * 0.8;
    h.arms[1].rotation.x = h.mugArm ? -0.9 : sw * 0.8;
  }
  h.body.position.y = Math.abs(Math.sin(phase)) * 0.05 * amount;
}

export function poseSit(h, sitting) {
  if (h.critter) return;
  if (sitting) {
    h.legs[0].rotation.x = h.legs[1].rotation.x = -1.45;
    h.body.position.y = -0.1;
  }
}
