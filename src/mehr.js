import * as THREE from 'three';
import { GEO, mat, part, canvasTex, damp, dampAngle } from './util.js';
import { MEHR, CUBE } from './office.js';
import { blobShadow } from './characters.js';

const SKIN = '#a4694a';
const SKIN_DARK = '#8e573b';
const BEARD = '#2b1f18';
const TURBAN = '#1f2748';
const TURBAN_FOLD = '#151b35';

function plaidTex() {
  const { ctx, tex } = canvasTex(64, 64);
  ctx.fillStyle = '#2d3242';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(120,130,160,0.35)';
  for (let i = 0; i < 64; i += 16) {
    ctx.fillRect(i, 0, 2, 64);
    ctx.fillRect(0, i, 64, 2);
  }
  ctx.fillStyle = 'rgba(90,70,120,0.25)';
  for (let i = 8; i < 64; i += 16) {
    ctx.fillRect(i, 0, 1, 64);
    ctx.fillRect(0, i, 64, 1);
  }
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function dotsTex() {
  const { ctx, tex } = canvasTex(32, 64);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = '#d8d8d8';
  for (let y = 4; y < 64; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 8; x < 32; x += 8) {
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return tex;
}

/**
 * Cartoon Mehr in his gaming chair. The whole thing swivels (rotation.y = facing).
 * Occluders: the tall chair back and Mehr himself block sight lines to monitors.
 */
export class Mehr {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(MEHR.x, 0, MEHR.z);
    scene.add(this.group);
    this.facing = Math.PI; // facing his monitors (north)
    this.targetFacing = Math.PI;
    this.offset = 0; // chair slides left/right along the desk
    this.targetOffset = 0;
    this.t = 0;
    this.mood = 'idle'; // idle | gaming | panic | busted | cheer
    this.moodT = 0;
    this.build();
    this.occluders = { segs: [{ x1: 0, z1: 0, x2: 0, z2: 0 }], circles: [{ x: MEHR.x, z: MEHR.z, r: 0.24 }] };
    this.updateOccluders();
  }

  build() {
    const g = this.group;
    g.add(blobShadow(0.55));
    // ---------- gaming chair ----------
    const chair = new THREE.Group();
    chair.add(part('cyl', '#222', 0.6, 0.06, 0.6, 0, 0.02, 0));
    chair.add(part('cyl', '#555', 0.07, 0.36, 0.07, 0, 0.06, 0));
    chair.add(part('box', '#1d1d24', 0.56, 0.1, 0.52, 0, 0.42, 0.02));
    const back = new THREE.Group();
    back.position.set(0, 0.5, -0.28);
    back.rotation.x = -0.12;
    back.add(part('box', '#1d1d24', 0.58, 1.0, 0.12, 0, 0, 0));
    back.add(part('box', '#7b3fe4', 0.14, 1.0, 0.14, -0.26, 0, 0.01));
    back.add(part('box', '#7b3fe4', 0.14, 1.0, 0.14, 0.26, 0, 0.01));
    back.add(part('box', '#ff4f9a', 0.2, 0.05, 0.13, 0, 0.55, 0.0, { basic: true }));
    back.add(part('box', '#1d1d24', 0.38, 0.22, 0.14, 0, 0.98, 0.0)); // headrest
    back.add(part('box', '#ff4f9a', 0.03, 0.9, 0.02, -0.33, 0.05, 0.02, { basic: true })); // RGB strip
    back.add(part('box', '#4fe3ff', 0.03, 0.9, 0.02, 0.33, 0.05, 0.02, { basic: true }));
    chair.add(back);
    for (const s of [-1, 1]) chair.add(part('box', '#2a2a33', 0.06, 0.05, 0.36, s * 0.3, 0.68, 0.02)); // armrests
    g.add(chair);
    this.chair = chair;

    // ---------- body ----------
    const body = new THREE.Group();
    g.add(body);
    this.body = body;
    const suit = new THREE.MeshLambertMaterial({ map: plaidTex() });
    const suitPart = (sx, sy, sz, x, y, z, kind = 'box') => {
      const m = new THREE.Mesh(GEO[kind], suit);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y + sy / 2, z);
      return m;
    };
    // legs (seated)
    for (const s of [-1, 1]) {
      body.add(suitPart(0.16, 0.15, 0.46, s * 0.11, 0.47, 0.2));
      body.add(suitPart(0.14, 0.46, 0.15, s * 0.11, 0.03, 0.4));
      body.add(part('box', '#1a1a1a', 0.15, 0.08, 0.26, s * 0.11, 0.0, 0.45));
    }
    const torso = new THREE.Group();
    torso.position.set(0, 0.52, 0);
    body.add(torso);
    this.torso = torso;
    torso.add(suitPart(0.5, 0.6, 0.34, 0, 0, 0, 'cyl'));
    torso.add(part('box', '#fafafa', 0.17, 0.32, 0.03, 0, 0.28, 0.155)); // shirt
    const tie = new THREE.Mesh(GEO.box, new THREE.MeshLambertMaterial({ map: dotsTex() }));
    tie.scale.set(0.075, 0.3, 0.02);
    tie.position.set(0, 0.42, 0.172);
    torso.add(tie);
    torso.add(part('box', '#111', 0.09, 0.05, 0.03, 0, 0.55, 0.17)); // knot
    for (const s of [-1, 1]) {
      const lapel = part('box', '#262a38', 0.07, 0.3, 0.03, s * 0.1, 0.28, 0.165);
      lapel.rotation.z = s * 0.3;
      torso.add(lapel);
      torso.add(part('box', '#fafafa', 0.06, 0.05, 0.03, s * 0.05, 0.55, 0.15)); // collar
    }
    // arms reaching for the keyboard
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.29, 0.52, 0);
      pivot.rotation.x = -1.05;
      pivot.rotation.z = s * 0.12;
      const arm = new THREE.Mesh(GEO.box, suit);
      arm.scale.set(0.12, 0.46, 0.13);
      arm.position.set(0, -0.23, 0);
      pivot.add(arm);
      pivot.add(part('box', '#fafafa', 0.13, 0.04, 0.14, 0, -0.5, 0));
      pivot.add(part('sph', SKIN, 0.12, 0.12, 0.12, 0, -0.58, 0));
      torso.add(pivot);
      this.arms.push(pivot);
    }
    // keyboard + mouse on the ring desk in front of him
    body.add(part('box', '#2b2b33', 0.42, 0.03, 0.14, 0, 0.78, 0.66));
    body.add(part('box', '#ff4f9a', 0.4, 0.005, 0.12, 0, 0.81, 0.66, { basic: true }));

    // ---------- head ----------
    const head = new THREE.Group();
    head.position.set(0, 0.6, 0.02);
    torso.add(head);
    this.head = head;
    head.add(part('cyl', SKIN, 0.16, 0.14, 0.16, 0, -0.02, 0));
    const hc = new THREE.Group(); // head center
    hc.position.set(0, 0.36, 0);
    head.add(hc);
    this.headCenter = hc;
    const skull = new THREE.Mesh(GEO.sph, mat(SKIN));
    skull.scale.set(0.56, 0.58, 0.54);
    hc.add(skull);
    // eyes
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(GEO.sph, mat('#ffffff'));
      w.scale.set(0.1, 0.105, 0.07);
      w.position.set(s * 0.1, 0.06, 0.25);
      hc.add(w);
      const p = new THREE.Mesh(GEO.sph, mat('#2a1a10'));
      p.scale.set(0.058, 0.064, 0.045);
      p.position.set(s * 0.1, 0.055, 0.285);
      hc.add(p);
      const hl = new THREE.Mesh(GEO.sph, mat('#ffffff', { basic: true }));
      hl.scale.setScalar(0.02);
      hl.position.set(s * 0.1 + 0.015, 0.075, 0.305);
      hc.add(hl);
      const brow = part('box', BEARD, 0.13, 0.04, 0.04, s * 0.1, 0.135, 0.235);
      brow.rotation.z = -s * 0.12;
      hc.add(brow);
      this[s < 0 ? 'browL' : 'browR'] = brow;
    }
    const nose = new THREE.Mesh(GEO.sph, mat(SKIN_DARK));
    nose.scale.set(0.09, 0.11, 0.09);
    nose.position.set(0, -0.01, 0.28);
    hc.add(nose);
    // neat, trimmed beard that follows the jawline (cheeks and mouth stay visible)
    const beardMat = new THREE.MeshLambertMaterial({ color: BEARD, side: THREE.DoubleSide });
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.287, 24, 12, -0.25, Math.PI + 0.5, Math.PI * 0.6, Math.PI * 0.4), beardMat);
    jaw.scale.set(1.0, 1.06, 1.0);
    hc.add(jaw);
    for (const [p0, pl] of [
      [-0.25, 0.75],
      [Math.PI - 0.5, 0.75],
    ]) {
      // short sideburns connecting the beard up toward the turban
      const side = new THREE.Mesh(new THREE.SphereGeometry(0.286, 10, 6, p0, pl, Math.PI * 0.47, Math.PI * 0.15), beardMat);
      hc.add(side);
    }
    const chin = new THREE.Mesh(GEO.sph, mat(BEARD));
    chin.scale.set(0.2, 0.1, 0.14);
    chin.position.set(0, -0.285, 0.16);
    hc.add(chin);
    // mustache, lips and a friendly smile
    const stache = new THREE.Mesh(GEO.sph, mat(BEARD));
    stache.scale.set(0.16, 0.035, 0.05);
    stache.position.set(0, -0.072, 0.284);
    hc.add(stache);
    const lip = new THREE.Mesh(GEO.sph, mat('#8a4b3a'));
    lip.scale.set(0.07, 0.018, 0.02);
    lip.position.set(0, -0.11, 0.272);
    hc.add(lip);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 5, 10, Math.PI), mat('#5e3226'));
    smile.rotation.z = Math.PI;
    smile.position.set(0, -0.098, 0.292);
    hc.add(smile);
    this.smile = smile;

    // turban (dastar): tilted cap + wrap folds + little white patka peak
    const turban = new THREE.Group();
    turban.position.set(0, 0.08, -0.015);
    turban.rotation.x = -0.5;
    hc.add(turban);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(TURBAN));
    cap.scale.set(1.06, 1.12, 1.05);
    turban.add(cap);
    for (const [y, tilt] of [
      [0.02, 0.18],
      [0.12, -0.16],
      [0.21, 0.12],
    ]) {
      const r = Math.sqrt(0.32 * 0.32 - y * y) * 1.06 + 0.005;
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 32), mat(TURBAN_FOLD));
      band.rotation.x = Math.PI / 2 + tilt;
      band.position.y = y * 1.12;
      turban.add(band);
    }
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 3), mat('#f3f3f3'));
    peak.position.set(0, 0.0, 0.34);
    peak.rotation.x = -0.1;
    turban.add(peak);
    this.turban = turban;

    // sweat drop (for busted)
    this.sweat = part('sph', '#7fd3ff', 0.06, 0.09, 0.06, 0.25, 0.1, 0.18, { basic: true });
    this.sweat.visible = false;
    hc.add(this.sweat);

    // ---------- balloons (static, tied to the desk) ----------
    this.balloons = new THREE.Group();
    this.balloons.position.set(CUBE.x1 - 0.1, 1.35, CUBE.z1 - 0.1);
    const bcols = ['#7b3fe4', '#ff4f9a', '#ffd84d'];
    this.balloonParts = [];
    bcols.forEach((c, i) => {
      const bg = new THREE.Group();
      const a = (i / 3) * Math.PI * 2;
      bg.position.set(Math.sin(a) * 0.18, 0, Math.cos(a) * 0.18);
      const len = 0.5 + i * 0.15;
      const string = part('cyl', '#eee', 0.01, len, 0.01, 0, 0, 0);
      bg.add(string);
      const ball = new THREE.Mesh(GEO.sph, new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 }));
      ball.scale.set(0.3, 0.36, 0.3);
      ball.position.y = len + 0.16;
      bg.add(ball);
      this.balloons.add(bg);
      this.balloonParts.push(bg);
    });
    g.parent?.add(this.balloons);
  }

  /** Re-anchor to the (possibly resized) office. */
  relayout() {
    this.group.position.set(MEHR.x + this.offset, 0, MEHR.z);
    this.balloons.position.set(CUBE.x1 - 0.1, 1.35, CUBE.z1 - 0.1);
    this.updateOccluders();
  }

  setMood(m, dur = 0) {
    this.mood = m;
    this.moodT = dur;
  }

  updateOccluders() {
    const a = this.facing;
    const fx = Math.sin(a),
      fz = Math.cos(a);
    const px = -fz,
      pz = fx; // perpendicular
    const mx = this.group.position.x,
      mz = this.group.position.z;
    this.occluders.circles[0].x = mx;
    this.occluders.circles[0].z = mz;
    const bx = mx - fx * 0.3,
      bz = mz - fz * 0.3;
    const s = this.occluders.segs[0];
    const hw = 0.42;
    s.x1 = bx + px * hw;
    s.z1 = bz + pz * hw;
    s.x2 = bx - px * hw;
    s.z2 = bz - pz * hw;
  }

  update(dt, gamingCount) {
    this.t += dt;
    const t = this.t;
    const prev = this.facing;
    this.facing = dampAngle(this.facing, this.targetFacing, 8, dt);
    this.group.rotation.y = this.facing;
    const prevX = this.group.position.x;
    this.offset = damp(this.offset, this.targetOffset, 12, dt);
    this.group.position.x = MEHR.x + this.offset;
    this.chair.rotation.y = (this.group.position.x - prevX) * 3; // little wobble while rolling
    this.facingChanged = Math.abs(prev - this.facing) > 1e-4 || Math.abs(prevX - this.group.position.x) > 1e-4;
    if (this.facingChanged) this.updateOccluders();

    if (this.moodT > 0) {
      this.moodT -= dt;
      if (this.moodT <= 0 && (this.mood === 'panic' || this.mood === 'cheer')) this.mood = 'idle';
    }
    const gaming = gamingCount > 0 && this.mood !== 'busted';
    let lean = gaming ? 0.16 : 0.02;
    let headTilt = 0;
    let headYaw = 0;
    let bob = 0;
    this.sweat.visible = false;
    this.arms[0].rotation.z = -0.12;
    this.arms[1].rotation.z = 0.12;

    if (this.mood === 'panic') {
      lean = -0.12;
      bob = Math.sin(t * 50) * 0.02;
      headYaw = Math.sin(t * 30) * 0.3;
      this.arms[0].rotation.x = this.arms[1].rotation.x = damp(this.arms[0].rotation.x, -0.9, 20, dt);
    } else if (this.mood === 'busted') {
      lean = 0.35;
      headTilt = 0.45;
      this.sweat.visible = true;
      this.sweat.position.y = 0.1 - ((t * 0.4) % 0.2);
      this.arms[0].rotation.x = this.arms[1].rotation.x = damp(this.arms[0].rotation.x, -0.3, 8, dt);
    } else if (this.mood === 'cheer') {
      this.arms[0].rotation.x = this.arms[1].rotation.x = -2.8 + Math.sin(t * 12) * 0.25;
      this.arms[0].rotation.z = -0.4;
      this.arms[1].rotation.z = 0.4;
      bob = Math.abs(Math.sin(t * 10)) * 0.05;
    } else {
      const type = gaming ? 1 : 0.35;
      this.arms[0].rotation.x = -1.05 + Math.sin(t * 22) * 0.07 * type;
      this.arms[1].rotation.x = -1.05 + Math.sin(t * 19 + 1) * 0.07 * type;
      if (gaming) {
        bob = Math.sin(t * 8) * 0.01;
        headYaw = Math.sin(t * 1.3) * 0.15;
      } else {
        headYaw = Math.sin(t * 0.7) * 0.25;
      }
    }
    this.torso.rotation.x = damp(this.torso.rotation.x, lean, 10, dt);
    this.head.rotation.x = damp(this.head.rotation.x, headTilt, 10, dt);
    this.head.rotation.y = damp(this.head.rotation.y, headYaw, 10, dt);
    this.body.position.y = bob;
    // eyebrows: raised when gaming, furrowed when busted
    const by = this.mood === 'busted' ? 0.12 : gaming ? 0.155 : 0.135;
    this.browL.position.y = this.browR.position.y = damp(this.browL.position.y, by, 12, dt);

    this.balloonParts.forEach((b, i) => {
      b.rotation.z = Math.sin(t * 1.3 + i * 2) * 0.1;
      b.rotation.x = Math.cos(t * 1.1 + i) * 0.08;
    });
  }
}
