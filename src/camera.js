import * as THREE from 'three';
import { W, D, MEHR, CUBE } from './office.js';
import { damp, dampAngle } from './util.js';

export const PITCH = (50 * Math.PI) / 180;
const DIST = 40;
const _v = new THREE.Vector3();

/**
 * Orthographic "diorama" camera. Portrait screens look down the long axis of the office,
 * landscape screens look across it, so the office always fills the screen.
 */
export class CameraRig {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.yaw = 0;
    this.focus = 0; // 0 = whole office, 1 = close-up
    this.focusGoal = 0;
    this.focusPt = new THREE.Vector3(MEHR.x, 1.0, MEHR.z);
    this.focusSize = 4;
    this.orbit = false;
    this.shake = 0;
    this.t = 0;
    this.margins = { top: 90, bottom: 150, left: 8, right: 8 };
    this.pitch = PITCH;
    this.pitchGoal = PITCH;
  }

  baseYaw(w, h) {
    return 0;
  }

  update(dt, w, h) {
    this.t += dt;
    const goalYaw = this.orbit ? Math.sin(this.t * 0.35) * 0.55 : this.baseYaw(w, h);
    this.pitchGoal = this.orbit ? 0.42 : PITCH;
    if (this.snapYaw) {
      this.yaw = goalYaw;
      this.pitch = this.pitchGoal;
      this.snapYaw = false;
    } else {
      this.yaw = this.orbit ? goalYaw : dampAngle(this.yaw, goalYaw, 4, dt);
      this.pitch = damp(this.pitch, this.pitchGoal, 3, dt);
    }
    const PITCH_NOW = this.pitch;
    this.focus = damp(this.focus, this.focusGoal, 5, dt);

    const cam = this.camera;
    const target = _tgt.set(W / 2, 0, D / 2);
    cam.position.set(
      target.x + Math.sin(this.yaw) * Math.cos(PITCH_NOW) * DIST,
      target.y + Math.sin(PITCH_NOW) * DIST,
      target.z + Math.cos(this.yaw) * Math.cos(PITCH_NOW) * DIST
    );
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;

    // fit: Mehr's cubicle + the stretch of office behind him (that's where the danger is).
    // Portrait shows a narrow, deep slice; landscape shows nearly the whole width.
    const land = w > h;
    // the whole office
    const bx0 = 0,
      bx1 = W;
    const bz0 = 0,
      bz1 = D;
    let minX = 1e9,
      maxX = -1e9,
      minY = 1e9,
      maxY = -1e9;
    for (const x of [bx0, bx1])
      for (const z of [bz0, bz1])
        for (const y of [0, 2.4]) {
          _v.set(x, y, z).applyMatrix4(inv);
          minX = Math.min(minX, _v.x);
          maxX = Math.max(maxX, _v.x);
          minY = Math.min(minY, _v.y);
          maxY = Math.max(maxY, _v.y);
        }
    const m = this.margins;
    const availW = Math.max(50, w - m.left - m.right);
    const availH = Math.max(50, h - m.top - m.bottom);
    const fitS = Math.max((maxX - minX) / availW, (maxY - minY) / availH) * 1.02;
    const fitCx = (minX + maxX) / 2,
      fitCy = (minY + maxY) / 2;

    // focus: a point with a given world size
    _v.copy(this.focusPt).applyMatrix4(inv);
    const focS = this.focusSize / Math.min(availW, availH);
    const f = this.focus;
    const s = fitS + (focS - fitS) * f;
    const cx = fitCx + (_v.x - fitCx) * f;
    const cy = fitCy + (_v.y - fitCy) * f;

    // where the content center should land on screen (center of the free area)
    const dx = (m.left - m.right) / 2;
    const dy = (m.top - m.bottom) / 2;
    let sx = 0,
      sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      sx = (Math.random() - 0.5) * this.shake * 0.6;
      sy = (Math.random() - 0.5) * this.shake * 0.6;
    }
    cam.left = cx - s * (w / 2 + dx) + sx;
    cam.right = cam.left + s * w;
    cam.top = cy + s * (h / 2 + dy) + sy;
    cam.bottom = cam.top - s * h;
    cam.updateProjectionMatrix();
  }
}
const _tgt = new THREE.Vector3();
