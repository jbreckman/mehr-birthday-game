import * as THREE from 'three';
import { part, canvasTex } from './util.js';
import { DESK, MEHR } from './office.js';
import { newGame, WorkScreen, SW, SH } from './minigames.js';

// A 3x2 monitor wall on Mehr's desk, all facing him (and whoever is standing behind him).
// Acquisition order fills left to right: desk row first, then the upper row.
const SLOTS = [
  [-1, 0],
  [0, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];
export const MON_COLORS = ['#ff4f79', '#4f8ef7', '#ffb020', '#27c07d', '#9b6bff', '#ff8a4c'];
export const SCREEN_HALF = (62 * Math.PI) / 180; // how far off-axis a screen can still be read
const COL_GAP = 1.15;
const MW = 1.1; // 2x a normal monitor
const MH = 0.66;
const TILT = 0.25;
const ROW_Y = [DESK.h + 0.15, DESK.h + 0.15 + (MH + 0.04) * Math.cos(TILT)]; // bottom edge of each row
const ROW_DZ = [0, -(MH + 0.04) * Math.sin(TILT)];

export class Monitor {
  constructor(scene, idx) {
    this.idx = idx;
    this.color = MON_COLORS[idx];
    const [c, r] = SLOTS[idx];
    this.col = c;
    this.row = r;
    this.exposed = false;
    this.lastOff = -9;
    this.x = MEHR.x + c * COL_GAP;
    this.z = DESK.z0 + 0.38 + ROW_DZ[r];
    this.y = ROW_Y[r] + (MH / 2) * Math.cos(TILT);
    this.nx = 0;
    this.nz = 1;
    this.on = false;
    this.game = null;
    this.work = new WorkScreen();
    this.redrawT = 0;
    this.drawCount = 0;
    this.onTime = 0;
    this.watched = 0;

    const g = new THREE.Group();
    g.position.set(this.x, 0, this.z);
    // stand (desk row) or pole (upper row)
    const poleH = ROW_Y[r] + 0.2 - DESK.h;
    g.add(part('box', '#2a2a30', 0.34, 0.02, 0.22, 0, DESK.h, -0.1));
    g.add(part('box', '#2a2a30', 0.07, poleH, 0.06, 0, DESK.h, -0.14));
    // tilted panel, pivoting on its bottom edge
    const panel = new THREE.Group();
    panel.position.set(0, ROW_Y[r], 0);
    panel.rotation.x = -TILT;
    g.add(panel);
    panel.add(part('box', '#1c1c22', MW, MH, 0.05, 0, 0, -0.03));
    panel.add(part('box', this.color, MW + 0.02, 0.05, 0.065, 0, -0.01, -0.03)); // colored bezel
    const { canvas, ctx, tex } = canvasTex(SW * 2, SH * 2);
    ctx.setTransform(2, 0, 0, 2, 0, 0); // draw in 160x100 units at 2x resolution
    this.canvas = canvas;
    this.ctx = ctx;
    this.tex = tex;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(MW - 0.07, MH - 0.08), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    screen.position.set(0, MH / 2 + 0.01, 0.0);
    panel.add(screen);
    // generous invisible hit box for taps
    const hit = new THREE.Mesh(new THREE.BoxGeometry(MW + 0.04, MH + 0.04, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(0, MH / 2, 0);
    hit.userData.monitor = this;
    panel.add(hit);
    this.hit = hit;
    this.group = g;
    scene.add(g);
    this.popT = 0;
    this.work.draw(ctx);
    tex.needsUpdate = true;
  }

  setOn(on) {
    if (on === this.on) return false;
    this.on = on;
    if (on) {
      this.game = newGame(this.game?.constructor);
      this.onTime = 0;
    } else {
      this.work = new WorkScreen();
    }
    this.redrawT = 0;
    return true;
  }

  appear() {
    this.popT = 0.001;
    this.group.scale.setScalar(0.01);
  }

  update(dt) {
    if (this.popT > 0) {
      this.popT += dt;
      const t = Math.min(1, this.popT / 0.5);
      const s = 1 + Math.sin(t * Math.PI) * 0.3;
      this.group.scale.setScalar(t * s || 0.01);
      if (t >= 1) {
        this.popT = 0;
        this.group.scale.setScalar(1);
      }
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.group.position.x = this.x + Math.sin(this.shakeT * 80) * 0.04;
      if (this.shakeT <= 0) this.group.position.x = this.x;
    }
    if (this.on) {
      this.onTime += dt;
      this.game.step(dt);
    } else this.work.step(dt);
    this.redrawT -= dt;
    if (this.redrawT <= 0) {
      this.redrawT = 1 / 15;
      (this.on ? this.game : this.work).draw(this.ctx);
      this.drawOverlay();
      this.tex.needsUpdate = true;
      this.drawCount++;
    }
  }

  /** Number badge + danger warnings, drawn right on the screen. */
  drawOverlay() {
    const c = this.ctx;
    const blink = Math.floor(performance.now() / 160) % 2 === 0;
    c.fillStyle = this.color;
    c.beginPath();
    c.arc(SW - 10, SH - 10, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 11px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(this.idx + 1), SW - 10, SH - 9.5);
    if (this.on && this.watched > 0) {
      c.strokeStyle = blink ? '#ff2020' : '#ffffff';
      c.lineWidth = 8;
      c.strokeRect(4, 4, SW - 8, SH - 8);
      c.fillStyle = 'rgba(255,32,32,0.85)';
      c.fillRect(SW / 2 - 34, SH / 2 - 11, 68, 22);
      c.fillStyle = '#fff';
      c.font = 'bold 13px sans-serif';
      c.fillText('HIDE!', SW / 2, SH / 2 + 1);
    } else if (!this.on && this.exposed) {
      c.fillStyle = 'rgba(200,0,0,0.25)';
      c.fillRect(0, 0, SW, SH);
      c.font = '22px sans-serif';
      c.fillText('👀', SW / 2, SH / 2 + 2);
    }
    c.textAlign = 'left';
  }

  nope() {
    this.shakeT = 0.3;
  }

  dispose(scene) {
    scene.remove(this.group);
  }
}
