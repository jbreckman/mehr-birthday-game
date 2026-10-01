import * as THREE from 'three';
import { Batcher, rand, pick, chance, weighted, disposeGroup, canvasTex, shuffle } from './util.js';
import { prepWall } from './sight.js';

// The office grows to fill the screen: wider on laptops (more cubicle columns),
// deeper on phones (more rows). Mehr's cubicle is always the middle one.
export let W = 16;
export let D = 21.5;
export const ROOM_Z = 4.0;
export const CELL = 0.5;
export let COLS = W / CELL;
export let ROWS = D / CELL;
// A normal cubicle in the middle of the cubicle farm, like everyone else's (open behind him)
export const CUBE = { x0: 6.2, x1: 9.8, z0: 9.8, z1: 12.2 };
export const DESK = { z0: 9.88, z1: 10.6, h: 0.74 };
export const MEHR = { x: 8, z: 11.15 };

let SLOT_X = [2.2, 8.0, 13.8];
let SLOT_Z = [6.9, 11.6, 16.3];
const ROW_STEP = 5.0;

/** Size the office for a view aspect ratio (available width / height) at the camera's pitch. */
export function sizeOffice(aspect, pitch) {
  const sp = Math.sin(pitch),
    cp = Math.cos(pitch);
  const proj = (d) => d * sp + 2.4 * cp; // projected height of an office d meters deep
  let w = 16,
    d = 21.5,
    k = 1,
    spacing = 5.8,
    extra = 0;
  const wantW = proj(d) * aspect;
  if (wantW > 16.5) {
    w = Math.round(wantW * 2) / 2;
    k = Math.max(1, Math.round((w - 4.4) / 11.6));
    while (k > 1 && (w - 4.4) / (2 * k) < 5.0) k--;
    spacing = (w - 4.4) / (2 * k);
  } else {
    const wantD = (16 / aspect - 2.4 * cp) / sp;
    extra = Math.max(0, Math.round((wantD - 21.5) / ROW_STEP));
    d = 21.5 + ROW_STEP * extra;
  }
  W = w;
  D = d;
  COLS = Math.round(W / CELL);
  ROWS = Math.round(D / CELL);
  SLOT_X = [];
  for (let i = -k; i <= k; i++) SLOT_X.push(W / 2 + i * spacing);
  SLOT_Z = [6.9, 11.6, 16.3];
  for (let i = 1; i <= extra; i++) SLOT_Z.push(16.3 + i * ROW_STEP);
  MEHR.x = W / 2;
  CUBE.x0 = W / 2 - 1.8;
  CUBE.x1 = W / 2 + 1.8;
}
const H = 1.8; // half pod size

const WALL_STYLE = {
  cube: { color: '#6b7ca6', trim: '#e3e7f0', t: 0.08 },
  low: { color: '#a3afc9', trim: '#eef0f5', t: 0.06 },
  glass: { color: '#b8e6ff', trim: '#8aa0b5', t: 0.05, opacity: 0.3 },
  solid: { color: '#efe8da', trim: '#c9bfae', t: 0.14 },
  outer: { color: '#d9d1c1', trim: '#b5ab98', t: 0.25 },
  hedge: { color: '#3f9a4f', trim: '#54b865', t: 0.4 },
  mehr: { color: '#5b4aa0', trim: '#e3e7f0', t: 0.09 },
  board: { color: '#fbfbff', trim: '#9aa2b5', t: 0.06 },
};

const DESK_COL = '#e9dcc3';
const CHAIR = '#343b4f';
const SCREEN_COLORS = ['#9fd3ff', '#b6f5c9', '#ffe0a3', '#d7c4ff'];
const PLANT = '#3f9a4f';

/** Transform helper for rotated pods. */
function tx(cx, cz, th) {
  const c = Math.cos(th),
    s = Math.sin(th);
  return {
    th,
    x: (u, v) => cx + u * c + v * s,
    z: (u, v) => cz - u * s + v * c,
  };
}

export class Office {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.staticGroup = null;
    this.podGroup = null;
    this.floorMesh = null;
    this.grid = new Uint8Array(0);
    this.reach = new Uint8Array(0);
    this.tv = null;
  }

  generate() {
    this.flip = chance(0.5);
    if (this.grid.length !== COLS * ROWS) {
      this.grid = new Uint8Array(COLS * ROWS);
      this.reach = new Uint8Array(COLS * ROWS);
    }
    this.staticWalls = [];
    this.staticRects = [];
    this.staticSpots = {};
    if (this.staticGroup) {
      this.root.remove(this.staticGroup);
      disposeGroup(this.staticGroup);
    }
    this.staticGroup = this.buildStatic();
    this.root.add(this.staticGroup);
    this.regeneratePods();
  }

  regeneratePods() {
    this.podWalls = [];
    this.podRects = [];
    this.podSpots = { desks: [], hang: [] };
    if (this.podGroup) {
      this.root.remove(this.podGroup);
      disposeGroup(this.podGroup);
    }
    this.podGroup = this.buildPods();
    this.root.add(this.podGroup);
    this.walls = [...this.staticWalls, ...this.podWalls].map(prepWall);
    this.rebuildGrid();
    this.collectSpots();
    this.layoutVersion = (this.layoutVersion || 0) + 1;
  }

  fx(x) {
    return this.flip ? W - x : x;
  }

  addWall(list, b, x1, z1, x2, z2, kind, h) {
    const st = WALL_STYLE[kind];
    const opaque = kind !== 'glass' && kind !== 'low';
    list.push({ x1, z1, x2, z2, h, opaque, kind });
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ry = Math.atan2(-(z2 - z1), x2 - x1);
    const mx = (x1 + x2) / 2,
      mz = (z1 + z2) / 2;
    const visH = kind === 'solid' ? Math.min(h, 1.05) : kind === 'outer' ? 0.45 : h;
    b.box(st.color, mx, 0, mz, len + st.t * 0.5, visH, st.t, ry, st.opacity ? { opacity: st.opacity } : undefined);
    b.box(st.trim, mx, visH, mz, len + st.t * 0.5, kind === 'glass' ? 0.05 : 0.04, st.t + 0.03, ry);
  }

  // ------------------------------------------------------------------ static rooms
  // Layout (z grows toward the camera):
  //   z 0..4     boardroom | kitchen
  //   z 4..18    3x3 cubicle farm, Mehr's cubicle in the middle + office junk
  //   z 18..D    lobby: elevator, copier, cooler
  buildStatic() {
    const b = new Batcher();
    const walls = this.staticWalls;
    const rects = this.staticRects;
    const sp = this.staticSpots;
    const fx = (x) => this.fx(x);
    const f = this.flip ? -1 : 1;
    const RZ = ROOM_Z;

    // slab + outer walls
    b.box('#2a2e45', W / 2, -0.62, D / 2, W + 0.6, 0.6, D + 0.6);
    this.addWall(walls, b, 0, 0, W, 0, 'outer', 2.5);
    this.addWall(walls, b, 0, D, W, D, 'outer', 2.5);
    this.addWall(walls, b, 0, 0, 0, D, 'outer', 2.5);
    this.addWall(walls, b, W, 0, W, D, 'outer', 2.5);

    // Boardroom (glass) x 0..4.4
    const dg = rand(0.6, 4.2);
    this.addWall(walls, b, fx(0), RZ, fx(dg), RZ, 'glass', 2.0);
    this.addWall(walls, b, fx(dg + 1.3), RZ, fx(6.0), RZ, 'glass', 2.0);
    this.addWall(walls, b, fx(6.0), 0, fx(6.0), RZ, 'glass', 2.0);
    const tcx = fx(3.0),
      tcz = 2.0;
    b.box('#6b4a2e', tcx, 0, tcz, 3.0, 0.74, 1.0);
    b.box('#8a6440', tcx, 0.74, tcz, 3.1, 0.04, 1.1);
    rects.push({ x: tcx, z: tcz, hw: 1.5, hd: 0.5, rot: 0 });
    sp.board = [];
    for (const u of [-0.9, 0, 0.9]) {
      for (const s of [-1, 1]) {
        const x = tcx + u,
          z = tcz + s * 0.85;
        b.box(CHAIR, x, 0.38, z, 0.42, 0.08, 0.42);
        b.box(CHAIR, x, 0.42, z + s * 0.2, 0.42, 0.5, 0.07);
        sp.board.push({ x, z, face: s > 0 ? Math.PI : 0, kind: 'board' });
      }
    }
    for (const s of [-1, 1]) {
      const x = tcx + s * 1.9;
      b.box(CHAIR, x, 0.38, tcz, 0.42, 0.08, 0.42);
      sp.board.push({ x, z: tcz, face: s > 0 ? -Math.PI / 2 : Math.PI / 2, kind: 'board' });
    }
    sp.boardCenter = { x: tcx, z: tcz };
    const tv = canvasTex(256, 144);
    this.tv = tv;
    this.drawTV('Q3 SYNERGY');
    const tvMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.85), new THREE.MeshBasicMaterial({ map: tv.tex, toneMapped: false }));
    tvMesh.position.set(tcx, 1.3, 0.3);
    b.box('#222', tcx, 0.82, 0.28, 1.6, 0.95, 0.06);
    b.box('#555', tcx, 0, 0.28, 0.1, 0.82, 0.1);
    b.box('#555', tcx, 0, 0.28, 0.7, 0.04, 0.35);

    // Kitchen (solid) along the right edge
    const kx = (x) => fx(x + W - 16);
    const kg = rand(10.6, 14.2);
    this.addWall(walls, b, kx(10.0), RZ, kx(kg), RZ, 'solid', 2.4);
    this.addWall(walls, b, kx(kg + 1.3), RZ, kx(16), RZ, 'solid', 2.4);
    this.addWall(walls, b, kx(10.0), 0, kx(10.0), RZ, 'solid', 2.4);
    b.box('#ddd6c8', kx(12.6), 0, 0.42, 4.2, 0.9, 0.65);
    b.box('#f5f0e6', kx(12.6), 0.9, 0.42, 4.3, 0.05, 0.7);
    rects.push({ x: kx(12.6), z: 0.42, hw: 2.1, hd: 0.33, rot: 0 });
    b.box('#2b2b2b', kx(11.1), 0.95, 0.35, 0.38, 0.48, 0.32); // coffee machine
    b.box('#c33', kx(11.1), 1.2, 0.52, 0.22, 0.07, 0.02, 0, { basic: true });
    b.box('#e8e8e8', kx(12.4), 0.95, 0.35, 0.55, 0.33, 0.38); // microwave
    b.box('#223', kx(12.35), 1.0, 0.55, 0.32, 0.23, 0.02);
    b.box('#f2f4f7', kx(15.45), 0, 0.45, 0.75, 1.9, 0.7); // fridge
    b.box('#999', kx(15.45) - f * 0.28, 0.8, 0.82, 0.04, 0.5, 0.04);
    rects.push({ x: kx(15.45), z: 0.45, hw: 0.4, hd: 0.38, rot: 0 });
    const rtx = kx(13.0),
      rtz = 2.5;
    b.cyl('#e9e3d6', rtx, 0.72, rtz, 0.52, 0.05);
    b.cyl('#777', rtx, 0, rtz, 0.06, 0.72);
    rects.push({ x: rtx, z: rtz, hw: 0.52, hd: 0.52, rot: 0 });
    sp.kitchen = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const x = rtx + Math.sin(a) * 0.95,
        z = rtz + Math.cos(a) * 0.95;
      if (z < 1.25 || z > RZ - 0.4) continue;
      sp.kitchen.push({ x, z, face: Math.atan2(rtx - x, rtz - z), kind: 'kitchen' });
    }
    sp.kitchenCenter = { x: rtx, z: rtz };
    sp.microwave = { x: kx(12.4), z: 1.2, face: Math.PI };

    // Focus booths fill the top strip between the boardroom and kitchen on wide offices
    sp.booths = [];
    for (let x = 6.6 + 0.8; x + 0.8 <= W - 6.4; x += 2.3) {
      if (Math.abs(x - W / 2) < 1.2) continue;
      this.addWall(walls, b, x - 0.8, 0.3, x + 0.8, 0.3, 'solid', 2.2);
      this.addWall(walls, b, x - 0.8, 0.3, x - 0.8, 2.0, 'solid', 2.2);
      this.addWall(walls, b, x + 0.8, 0.3, x + 0.8, 2.0, 'solid', 2.2);
      b.box('#c9a36a', x, 0, 0.75, 1.2, 0.72, 0.5);
      b.box('#222', x, 0.72, 0.6, 0.5, 0.3, 0.04);
      rects.push({ x, z: 0.75, hw: 0.6, hd: 0.25, rot: 0 });
      sp.booths.push({ x, z: 1.4, face: Math.PI, kind: 'booth' });
    }

    // Lobby: copier + printer on one side, water cooler + vending on the other
    const cs = chance(0.5) ? 1 : 0;
    const side = (x) => (cs ? x : W - x);
    const sgn = cs ? 1 : -1;
    const LZ = D - 0.75;
    const cpx = side(1.3);
    b.box('#dcdcdc', cpx, 0, LZ, 1.05, 0.95, 0.72);
    b.box('#bfbfbf', cpx, 0.95, LZ - 0.05, 0.95, 0.1, 0.58);
    b.box('#5ad', cpx + 0.3, 0.96, LZ + 0.32, 0.24, 0.06, 0.04, 0, { basic: true });
    rects.push({ x: cpx, z: LZ, hw: 0.55, hd: 0.42, rot: 0 });
    sp.copier = [
      { x: cpx, z: LZ - 0.95, face: 0, kind: 'copier' },
      { x: cpx + sgn * 0.9, z: LZ - 1.35, face: -sgn * 2.4, kind: 'copier' },
      { x: cpx, z: LZ - 1.9, face: 0, kind: 'copier' },
      { x: cpx + sgn * 1.5, z: LZ - 2.0, face: -sgn * 2.6, kind: 'copier' },
    ];
    sp.copierPos = { x: cpx, z: LZ };
    const px = side(2.9);
    b.box('#e6e6e6', px, 0, LZ + 0.1, 0.7, 0.8, 0.5);
    b.box('#444', px, 0.8, LZ, 0.5, 0.06, 0.3);
    rects.push({ x: px, z: LZ + 0.1, hw: 0.4, hd: 0.3, rot: 0 });
    sp.printer = { x: px, z: LZ - 0.75, face: 0, kind: 'printer' };
    const cx = side(W - 1.1);
    b.box('#e9e9ee', cx, 0, LZ + 0.15, 0.45, 0.95, 0.45);
    b.cyl('#7cc7ff', cx, 0.95, LZ + 0.15, 0.2, 0.45, { opacity: 0.7 });
    rects.push({ x: cx, z: LZ + 0.15, hw: 0.3, hd: 0.3, rot: 0 });
    sp.cooler = [
      { x: cx - sgn * 0.1, z: LZ - 0.7, face: 0, kind: 'cooler' },
      { x: cx - sgn * 0.9, z: LZ - 1.0, face: sgn * 2.3, kind: 'cooler' },
      { x: cx + sgn * 0.2, z: LZ - 1.6, face: sgn * -2.8, kind: 'cooler' },
      { x: cx - sgn * 1.2, z: LZ - 1.9, face: sgn * 2.6, kind: 'cooler' },
    ];
    sp.coolerCenter = { x: cx, z: LZ - 1 };
    const vx = side(W - 2.5);
    b.box('#c0392b', vx, 0, LZ + 0.1, 0.85, 1.85, 0.58);
    b.box('#1b2a3a', vx - 0.08, 0.6, LZ - 0.2, 0.52, 1.0, 0.04, 0, { basic: true });
    rects.push({ x: vx, z: LZ + 0.1, hw: 0.48, hd: 0.33, rot: 0 });
    sp.vending = { x: vx, z: LZ - 0.8, face: 0, kind: 'vending' };
    for (const px2 of [side(4.3), side(W - 3.6)]) {
      b.cyl('#b0643c', px2, 0, LZ + 0.2, 0.22, 0.4);
      b.sph(PLANT, px2, 0.35, LZ + 0.2, 0.35, 1.4);
    }
    // elevator doors (low, so they don't block the view)
    b.box('#9aa3ad', W / 2, 0, D - 0.05, 2.2, 0.55, 0.12);
    b.box('#c7ced6', W / 2 - 0.55, 0.02, D - 0.12, 1.0, 0.5, 0.04);
    b.box('#c7ced6', W / 2 + 0.55, 0.02, D - 0.12, 1.0, 0.5, 0.04);
    for (const sx of [0.02, W - 0.02]) b.box('#8b5a2b', sx, 0, D - 2.4, 0.1, 0.5, 1.2);
    b.box('#4a7bd1', fx(0.02), 0, 9.25, 0.1, 0.5, 1.0); // restroom door

    sp.exits = [
      { x: W / 2, z: D - 0.7, face: Math.PI, name: 'elevator' },
      { x: 0.65, z: D - 2.4, face: Math.PI / 2, name: 'stairsW' },
      { x: W - 0.65, z: D - 2.4, face: -Math.PI / 2, name: 'stairsE' },
    ];
    sp.restroom = { x: fx(0.6), z: 9.25, face: f > 0 ? -Math.PI / 2 : Math.PI / 2, name: 'restroom' };

    // ---- Mehr's cubicle
    this.buildCubicle(b, walls, rects);

    const g = b.build();
    g.add(tvMesh);
    g.add(this.makeFloor());
    return g;
  }

  buildCubicle(b, walls, rects) {
    const { x0, x1, z0, z1 } = CUBE;
    this.addWall(walls, b, x0, z0, x1, z0, 'cube', 1.35);
    this.addWall(walls, b, x0, z0, x0, z1, 'cube', 1.35);
    this.addWall(walls, b, x1, z0, x1, z1, 'cube', 1.35);
    const cx = (x0 + x1) / 2;
    const dz = (DESK.z0 + DESK.z1) / 2;
    const dw = x1 - x0 - 0.2;
    b.box(DESK_COL, cx, 0, dz, dw, DESK.h, DESK.z1 - DESK.z0);
    b.cyl('#ffffff', x0 + 0.2, DESK.h, DESK.z1 - 0.15, 0.06, 0.13);
    b.cyl('#b0643c', x1 - 0.2, DESK.h, DESK.z1 - 0.15, 0.08, 0.13);
    b.sph('#3f9a4f', x1 - 0.2, DESK.h + 0.1, DESK.z1 - 0.15, 0.12, 1.3);
    b.box('#d4a017', x0 + 0.45, DESK.h, DESK.z1 - 0.12, 0.07, 0.18, 0.07);
    b.box('#ffd84d', x0, 0.95, z1 - 0.02, 0.12, 0.22, 0.04, 0, { basic: true }); // name plate
    rects.push({ x: cx, z: (z0 + MEHR.z + 0.6) / 2, hw: (x1 - x0) / 2, hd: (MEHR.z + 0.6 - z0) / 2, rot: 0 });
  }

  drawTV(text) {
    const { ctx, tex } = this.tv;
    ctx.fillStyle = '#10213a';
    ctx.fillRect(0, 0, 256, 144);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(text, 12, 28);
    const bars = [30, 45, 38, 70, 90, 120];
    bars.forEach((h, i) => {
      ctx.fillStyle = i === bars.length - 1 ? '#5cf28a' : '#5aa9ff';
      ctx.fillRect(20 + i * 36, 132 - h * 0.8, 24, h * 0.8);
    });
    ctx.strokeStyle = '#ffd84d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 110);
    ctx.lineTo(236, 40);
    ctx.stroke();
    tex.needsUpdate = true;
  }

  makeFloor() {
    const S = 24;
    const { canvas, ctx, tex } = canvasTex(W * S, D * S);
    const fx = (x) => this.fx(x);
    // carpet tiles
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < D; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#8895b3' : '#8290ae';
        ctx.fillRect(i * S, j * S, S, S);
      }
    }
    for (let k = 0; k < 2500; k++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(Math.random() * W * S, Math.random() * D * S, 2, 2);
    }
    // boardroom wood
    const bl = Math.min(fx(0), fx(6.0)) * S;
    ctx.fillStyle = '#b98c5a';
    ctx.fillRect(bl, 0, 6.0 * S, ROOM_Z * S);
    for (let j = 0; j < ROOM_Z * S; j += 10) {
      ctx.fillStyle = j % 20 ? '#b3854f' : '#c09461';
      ctx.fillRect(bl, j, 6.0 * S, 9);
    }
    // break room tiles
    const kl = Math.min(fx(W - 6), fx(W)) * S;
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 8; j++) {
        ctx.fillStyle = (i + j) % 2 ? '#ece6d8' : '#d7cfbd';
        ctx.fillRect(kl + i * S * 0.5, j * S * 0.5, S * 0.5, S * 0.5);
      }
    }
    // lobby stone
    const lz = D - 3.3;
    ctx.fillStyle = '#c4bcad';
    ctx.fillRect(0, lz * S, W * S, (D - lz) * S);
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i <= W; i += 2) ctx.strokeRect(i * S, lz * S, 2 * S, (D - lz) * S);
    // elevator threshold
    ctx.fillStyle = '#9aa3ad';
    ctx.fillRect((W / 2 - 1.1) * S, (D - 0.4) * S, 2.2 * S, 0.4 * S);
    // Mehr's birthday rug
    ctx.save();
    ctx.translate(MEHR.x * S, MEHR.z * S);
    const rr = 1.0 * S;
    ctx.fillStyle = '#7b3fe4';
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9b6bff';
    ctx.beginPath();
    ctx.arc(0, 0, rr * 0.82, 0, Math.PI * 2);
    ctx.fill();
    const cols = ['#ffd84d', '#ff6b93', '#5cf2c2', '#fff'];
    for (let k = 0; k < 35; k++) {
      const a = Math.random() * Math.PI * 2,
        d = Math.random() * rr * 0.95;
      ctx.fillStyle = pick(cols);
      ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, 3, 5);
    }
    ctx.restore();
    // "DATA DEPT" floor decal in the lobby
    ctx.fillStyle = 'rgba(40,40,70,0.35)';
    ctx.font = `bold ${S * 0.9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('DATA DEPT.', (W / 2) * S, (D - 1.6) * S);
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, 0, D / 2);
    floor.name = 'floor';
    this.floorMesh = floor;
    return floor;
  }

  // ------------------------------------------------------------------ pods
  buildPods() {
    const b = new Batcher();
    const slots = [];
    for (const x of SLOT_X) for (const z of SLOT_Z) if (!(Math.abs(x - MEHR.x) < 0.1 && z === SLOT_Z[1])) slots.push([x, z]);
    // guarantee a mix: at least 4 quads, rest weighted
    const types = ['quad', 'quad', 'quad'];
    while (types.length < slots.length) {
      types.push(weighted([['quad', 3], ['bench', 2], ['lounge', 1.2], ['hedge', 1], ['board', 1]]));
    }
    shuffle(types);
    slots.forEach(([cx, cz], k) => {
      const th = (Math.floor(Math.random() * 4) * Math.PI) / 2;
      this[`pod_${types[k]}`](b, tx(cx, cz, th));
    });
    this.placeJunk(b);
    return b.build();
  }

  /** Random office junk that chops up the sightlines behind Mehr. */
  placeJunk(b) {
    const cand = [
      [CUBE.x0 + 0.35, CUBE.z1 + 0.45],
      [CUBE.x1 - 0.35, CUBE.z1 + 0.45],
    ];
    for (let i = 0; i < SLOT_X.length - 1; i++) {
      const lx0 = SLOT_X[i] + H + 0.4,
        lx1 = SLOT_X[i + 1] - H - 0.4;
      for (const z of SLOT_Z) {
        cand.push([lx0, z + 1.3], [lx1, z + 1.3], [lx0, z - 1.3], [lx1, z - 1.3]);
      }
    }
    const spots = shuffle(cand);
    const n = Math.min(spots.length, 4 + Math.floor(Math.random() * 3) + Math.floor(spots.length / 6));
    for (let i = 0; i < n; i++) {
      const [x, z] = spots[i];
      const kind = weighted([['plant', 3], ['cabinet', 2], ['boxes', 2], ['whiteboard', 1.5], ['coatrack', 1]]);
      const block = (hw, hd, h) => {
        this.podRects.push({ x, z, hw, hd, rot: 0 });
        if (h > 1.2) {
          this.podWalls.push({ x1: x - hw, z1: z, x2: x + hw, z2: z, h, opaque: true, kind: 'junk' });
          this.podWalls.push({ x1: x, z1: z - hd, x2: x, z2: z + hd, h, opaque: true, kind: 'junk' });
        }
      };
      if (kind === 'plant') {
        b.cyl('#b0643c', x, 0, z, 0.24, 0.45);
        b.sph(PLANT, x, 0.4, z, 0.38, 2.4);
        b.sph('#4fb35f', x + 0.1, 1.3, z, 0.25, 1.4);
        block(0.3, 0.3, 1.8);
      } else if (kind === 'cabinet') {
        b.box('#8d96a8', x, 0, z, 0.5, 1.45, 0.6);
        for (let k = 0; k < 4; k++) b.box('#c9ced8', x, 0.15 + k * 0.33, z + 0.31, 0.2, 0.04, 0.02);
        block(0.27, 0.32, 1.45);
      } else if (kind === 'boxes') {
        b.box('#c9a36a', x, 0, z, 0.55, 0.45, 0.45, 0.1);
        b.box('#d7b37a', x + 0.05, 0.45, z, 0.5, 0.42, 0.42, -0.15);
        b.box('#c9a36a', x - 0.02, 0.87, z, 0.45, 0.4, 0.4, 0.2);
        block(0.3, 0.26, 1.27);
      } else if (kind === 'whiteboard') {
        const ry = Math.random() < 0.5 ? 0 : Math.PI / 2;
        b.box('#fbfbff', x, 0.35, z, 1.1, 1.0, 0.05, ry);
        b.box('#777', x, 0, z, ry ? 0.08 : 1.0, 0.35, ry ? 1.0 : 0.08);
        b.box('#ff6b93', x, 0.95, z, ry ? 0.06 : 0.6, 0.04, ry ? 0.6 : 0.06);
        if (ry) this.podWalls.push({ x1: x, z1: z - 0.55, x2: x, z2: z + 0.55, h: 1.35, opaque: true, kind: 'junk' });
        else this.podWalls.push({ x1: x - 0.55, z1: z, x2: x + 0.55, z2: z, h: 1.35, opaque: true, kind: 'junk' });
        this.podRects.push({ x, z, hw: ry ? 0.15 : 0.55, hd: ry ? 0.55 : 0.15, rot: 0 });
      } else {
        b.cyl('#5a3d2b', x, 0, z, 0.03, 1.6);
        b.cyl('#5a3d2b', x, 0, z, 0.2, 0.04);
        b.sph(pick(['#c0392b', '#2e86de', '#555']), x + 0.1, 1.1, z, 0.16, 2.2);
        block(0.15, 0.15, 0);
      }
    }
  }

  pw(b, T, u1, v1, u2, v2, kind, h) {
    this.addWall(this.podWalls, b, T.x(u1, v1), T.z(u1, v1), T.x(u2, v2), T.z(u2, v2), kind, h);
  }
  pbox(b, T, color, u, y, v, su, sy, sv, ry = 0, opts) {
    b.box(color, T.x(u, v), y, T.z(u, v), su, sy, sv, T.th + ry, opts);
  }
  prect(T, u, v, hu, hv) {
    this.podRects.push({ x: T.x(u, v), z: T.z(u, v), hw: hu, hd: hv, rot: T.th });
  }
  pspot(list, T, u, v, localFace, kind) {
    list.push({ x: T.x(u, v), z: T.z(u, v), face: localFace + T.th, kind });
  }
  chair(b, T, u, v, localFace) {
    this.pbox(b, T, CHAIR, u, 0.38, v, 0.45, 0.08, 0.45);
    const bu = u - Math.sin(localFace) * 0.24,
      bv = v - Math.cos(localFace) * 0.24;
    this.pbox(b, T, CHAIR, bu, 0.42, bv, 0.42, 0.5, 0.07, localFace);
  }
  deskClutter(b, T, u, v) {
    const r = Math.random();
    if (r < 0.25) {
      this.pbox(b, T, '#b0643c', u, 0.76, v, 0.14, 0.12, 0.14);
      this.pbox(b, T, PLANT, u, 0.88, v, 0.2, 0.2, 0.2);
    } else if (r < 0.45) {
      this.pbox(b, T, pick(['#fff', '#ff6b93', '#ffd84d']), u, 0.76, v, 0.09, 0.12, 0.09);
    } else if (r < 0.6) {
      this.pbox(b, T, '#f5f5f5', u, 0.76, v, 0.25, 0.1, 0.32); // paper stack
    } else if (r < 0.7) {
      this.pbox(b, T, '#d4a017', u, 0.76, v, 0.08, 0.22, 0.08); // trophy
    }
  }

  pod_quad(b, T) {
    this.pw(b, T, -H, 0, H, 0, 'cube', 1.35);
    this.pw(b, T, 0, -H, 0, H, 'cube', 1.35);
    for (const su of [-1, 1]) {
      for (const sv of [-1, 1]) {
        const r = Math.random();
        const openU = r < 0.5 || r > 0.9;
        const openV = r >= 0.5;
        if (!openU) this.pw(b, T, su * H, 0, su * H, sv * H, 'cube', 1.35);
        if (!openV) this.pw(b, T, 0, sv * H, su * H, sv * H, 'cube', 1.35);
        // desk along the inner wall u=0
        this.pbox(b, T, DESK_COL, su * 0.32, 0, sv * 0.95, 0.55, 0.74, 1.5);
        this.prect(T, su * 0.32, sv * 0.95, 0.3, 0.75);
        this.pbox(b, T, '#222', su * 0.14, 0.74, sv * 0.95, 0.05, 0.34, 0.5);
        this.pbox(b, T, pick(SCREEN_COLORS), su * 0.175, 0.77, sv * 0.95, 0.02, 0.28, 0.44, 0, { basic: true });
        this.deskClutter(b, T, su * 0.35, sv * (0.95 + 0.55));
        const face = -su * (Math.PI / 2);
        this.chair(b, T, su * 1.0, sv * 0.95, face);
        this.pspot(this.podSpots.desks, T, su * 1.02, sv * 0.95, face, 'desk');
      }
    }
  }

  pod_bench(b, T) {
    this.pw(b, T, -1.6, 0, 1.6, 0, 'low', 1.05);
    for (const sv of [-1, 1]) {
      this.pbox(b, T, DESK_COL, 0, 0, sv * 0.33, 3.2, 0.74, 0.6);
      for (const u of [-0.85, 0.85]) {
        this.pbox(b, T, '#222', u, 0.74, sv * 0.12, 0.5, 0.32, 0.04);
        this.pbox(b, T, pick(SCREEN_COLORS), u, 0.77, sv * 0.145, 0.44, 0.26, 0.02, 0, { basic: true });
        const face = sv > 0 ? Math.PI : 0;
        this.chair(b, T, u, sv * 0.98, face);
        this.pspot(this.podSpots.desks, T, u, sv * 1.0, face, 'desk');
        this.deskClutter(b, T, u + 0.5, sv * 0.4);
      }
    }
    this.prect(T, 0, 0, 1.65, 0.65);
  }

  pod_lounge(b, T) {
    if (chance(0.5)) {
      // couch + coffee table + beanbags
      this.pbox(b, T, '#e2574c', 0, 0, -1.15, 2.2, 0.45, 0.8);
      this.pbox(b, T, '#c9463c', 0, 0.45, -1.45, 2.2, 0.45, 0.2);
      this.prect(T, 0, -1.15, 1.15, 0.45);
      this.pbox(b, T, '#8b5a2b', 0, 0, 0.0, 1.1, 0.4, 0.6);
      this.prect(T, 0, 0, 0.6, 0.35);
      this.pspot(this.podSpots.hang, T, -0.6, -0.6, 0, 'couch');
      this.pspot(this.podSpots.hang, T, 0.6, -0.6, 0, 'couch');
      for (const u of [-1.1, 1.1]) {
        this.pbox(b, T, pick(['#ffd84d', '#5cf2c2', '#ff6b93']), u, 0, 1.2, 0.7, 0.45, 0.7);
      }
      this.pspot(this.podSpots.hang, T, 0, 1.0, Math.PI, 'couch');
    } else {
      // ping pong
      this.pbox(b, T, '#1f7a4d', 0, 0.7, 0, 2.2, 0.06, 1.2);
      this.pbox(b, T, '#fff', 0, 0.76, 0, 0.03, 0.14, 1.25);
      this.pbox(b, T, '#333', -0.8, 0, 0, 0.1, 0.7, 0.9);
      this.pbox(b, T, '#333', 0.8, 0, 0, 0.1, 0.7, 0.9);
      this.prect(T, 0, 0, 1.15, 0.65);
      this.pspot(this.podSpots.hang, T, -1.55, 0, Math.PI / 2, 'pingpong');
      this.pspot(this.podSpots.hang, T, 1.55, 0, -Math.PI / 2, 'pingpong');
    }
    this.pbox(b, T, '#b0643c', 1.5, 0, -1.5, 0.4, 0.4, 0.4);
    this.pbox(b, T, PLANT, 1.5, 0.35, -1.5, 0.6, 0.9, 0.6);
    this.prect(T, 1.5, -1.5, 0.25, 0.25);
  }

  pod_hedge(b, T) {
    this.pbox(b, T, '#8b5a2b', 0, 0, 0, 3.4, 0.45, 0.55);
    this.pw(b, T, -1.6, 0, 1.6, 0, 'hedge', 1.5);
    for (let u = -1.4; u <= 1.41; u += 0.7) this.pbox(b, T, '#4fb35f', u, 1.2, 0, 0.45, 0.35, 0.45);
    this.prect(T, 0, 0, 1.75, 0.35);
    this.pbox(b, T, '#9c6b3f', 0, 0, 1.2, 1.4, 0.42, 0.45);
    this.pspot(this.podSpots.hang, T, -0.4, 1.2, Math.PI, 'bench');
    this.pbox(b, T, '#9c6b3f', 0, 0, -1.2, 1.4, 0.42, 0.45);
    this.pspot(this.podSpots.hang, T, 0.4, -1.2, 0, 'bench');
  }

  pod_board(b, T) {
    this.pw(b, T, -1.1, 0, 1.1, 0, 'board', 1.8);
    this.pbox(b, T, '#ff6b93', -0.5, 1.1, 0.05, 0.6, 0.04, 0.02, 0, { basic: true });
    this.pbox(b, T, '#5aa9ff', 0.3, 0.9, 0.05, 0.8, 0.04, 0.02, 0, { basic: true });
    this.pbox(b, T, '#27c07d', 0.1, 1.35, 0.05, 0.5, 0.04, 0.02, 0, { basic: true });
    this.pbox(b, T, '#777', -1.1, 0, 0, 0.08, 0.1, 0.5);
    this.pbox(b, T, '#777', 1.1, 0, 0, 0.08, 0.1, 0.5);
    this.pspot(this.podSpots.hang, T, -0.5, 0.85, Math.PI, 'whiteboard');
    this.pspot(this.podSpots.hang, T, 0.5, 0.85, Math.PI, 'whiteboard');
    this.pspot(this.podSpots.hang, T, 0, 1.3, Math.PI, 'whiteboard');
    for (const [u, v] of [
      [-1.4, -1.3],
      [1.4, -1.3],
    ]) {
      this.pbox(b, T, '#b0643c', u, 0, v, 0.4, 0.4, 0.4);
      this.pbox(b, T, PLANT, u, 0.35, v, 0.55, 0.8, 0.55);
      this.prect(T, u, v, 0.25, 0.25);
    }
  }

  // ------------------------------------------------------------------ nav grid
  rebuildGrid() {
    const g = this.grid;
    g.fill(0);
    const R = 0.3;
    for (let r = 0; r < ROWS; r++) {
      const z = (r + 0.5) * CELL;
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) * CELL;
        const i = r * COLS + c;
        for (const w of this.walls) {
          if (x < w.minx - R || x > w.maxx + R || z < w.minz - R || z > w.maxz + R) continue;
          if (distToSeg(x, z, w) < R) {
            g[i] = 1;
            break;
          }
        }
        if (g[i]) continue;
        for (const rc of this.staticRects.concat(this.podRects)) {
          const dx = x - rc.x,
            dz = z - rc.z;
          const c2 = Math.cos(rc.rot),
            s2 = Math.sin(rc.rot);
          // inverse rotate into rect space
          const u = dx * c2 - dz * s2;
          const v = dx * s2 + dz * c2;
          if (Math.abs(u) < rc.hw + 0.18 && Math.abs(v) < rc.hd + 0.18) {
            g[i] = 1;
            break;
          }
        }
      }
    }
    // flood fill reachability from the elevator
    const reach = this.reach;
    reach.fill(0);
    const start = this.nearestFreeCell(W / 2, D - 1);
    const q = [start];
    reach[start] = 1;
    while (q.length) {
      const i = q.pop();
      const c = i % COLS,
        r = (i / COLS) | 0;
      const nb = [
        [c + 1, r],
        [c - 1, r],
        [c, r + 1],
        [c, r - 1],
      ];
      for (const [nc, nr] of nb) {
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const j = nr * COLS + nc;
        if (!g[j] && !reach[j]) {
          reach[j] = 1;
          q.push(j);
        }
      }
    }
  }

  cellOf(x, z) {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor(z / CELL)));
    return r * COLS + c;
  }

  nearestFreeCell(x, z, needReach = false) {
    const c0 = Math.floor(x / CELL),
      r0 = Math.floor(z / CELL);
    let best = -1,
      bd = 1e9;
    for (let rad = 0; rad < 8 && best < 0; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc,
            r = r0 + dr;
          if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
          const i = r * COLS + c;
          if (this.grid[i] || (needReach && !this.reach[i])) continue;
          const d = Math.hypot((c + 0.5) * CELL - x, (r + 0.5) * CELL - z);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    }
    return best;
  }

  isReachable(x, z) {
    const i = this.nearestFreeCell(x, z, true);
    if (i < 0) return false;
    const cx = ((i % COLS) + 0.5) * CELL,
      cz = (((i / COLS) | 0) + 0.5) * CELL;
    return Math.hypot(cx - x, cz - z) < 1.0;
  }

  collectSpots() {
    const s = this.staticSpots;
    const ok = (p) => this.isReachable(p.x, p.z);
    this.spots = {
      desks: this.podSpots.desks.filter(ok),
      hang: this.podSpots.hang.concat(s.booths).filter(ok),
      board: s.board.filter(ok),
      kitchen: s.kitchen.filter(ok),
      cooler: s.cooler.filter(ok),
      copier: s.copier.filter(ok),
      exits: s.exits,
      restroom: s.restroom,
      vending: s.vending,
      printer: s.printer,
      microwave: s.microwave,
      boardCenter: s.boardCenter,
      kitchenCenter: s.kitchenCenter,
      coolerCenter: s.coolerCenter,
      copierPos: s.copierPos,
    };
    // points around Mehr's desk (for cake + boss laps)
    this.spots.ring = [];
    for (const z of [MEHR.z + 1.55, MEHR.z + 2.9]) {
      for (let x = CUBE.x0 + 0.8; x <= CUBE.x1 - 0.8; x += 0.75) {
        if (this.isReachable(x, z)) this.spots.ring.push({ x, z, face: Math.atan2(MEHR.x - x, MEHR.z - z) });
      }
    }
    // random wander points in open aisles
    this.spots.wander = [];
    for (let k = 0; k < 400 && this.spots.wander.length < 40; k++) {
      const i = Math.floor(Math.random() * COLS * ROWS);
      if (!this.grid[i] && this.reach[i]) {
        this.spots.wander.push({ x: ((i % COLS) + 0.5) * CELL, z: (((i / COLS) | 0) + 0.5) * CELL });
      }
    }
  }
}

function distToSeg(px, pz, w) {
  const dx = w.x2 - w.x1,
    dz = w.z2 - w.z1;
  const l2 = dx * dx + dz * dz;
  let t = ((px - w.x1) * dx + (pz - w.z1) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (w.x1 + t * dx), pz - (w.z1 + t * dz));
}
