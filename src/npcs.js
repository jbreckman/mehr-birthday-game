import * as THREE from 'three';
import { makeHuman, dress, makeDog, makeRoomba, makePigeon, animateWalk, wetFloorSign } from './characters.js';
import { findPath } from './nav.js';
import { MEHR, W, D, COLS, CELL } from './office.js';
import { rand, pick, chance, clamp, dampAngle, angleDiff, weighted, makeFan, setFan, damp } from './util.js';
import { visFan, blocked } from './sight.js';
import { SCREEN_HALF } from './monitors.js';
import * as L from './lines.js';

const DEG = Math.PI / 180;

export const TYPES = {
  coworker: { speed: 1.35, fov: 100, rate: 0.65, range: 9, cone: '#ffffff' },
  speedy: { speed: 2.3, fov: 70, rate: 0.6, range: 8, cone: '#ffffff' },
  intern: { speed: 1.6, fov: 110, rate: 0.62, range: 8.5, cone: '#ffffff' },
  boss: { speed: 1.15, fov: 150, rate: 1.55, range: 11, cone: '#ff3b3b', name: 'The Boss' },
  zoom: { speed: 0.95, fov: 45, rate: 0.6, range: 7, cone: '#ffffff' },
  ladder: { speed: 1.0, fov: 0, rate: 0.9, range: 12, cone: '#ffb020' },
  janitor: { speed: 0.9, fov: 90, rate: 0.6, range: 8, cone: '#ffffff' },
  it: { speed: 1.2, fov: 80, rate: 0.9, range: 9, cone: '#5cf28a', xray: true },
  cake: { speed: 0.85, fov: 120, rate: 2.2, range: 6, cone: '#ff9de2' },
  dog: { speed: 1.9, critter: true },
  roomba: { speed: 0.55, critter: true },
  pigeon: { speed: 2.4, critter: true },
};

const FAN_RAYS = 19;
let uid = 0;

export class NPC {
  constructor(mgr, type, x, z, opts = {}) {
    this.id = ++uid;
    this.mgr = mgr;
    this.type = type;
    this.T = TYPES[type];
    this.x = x;
    this.z = z;
    this.y = 0;
    this.dir = opts.dir ?? rand(-Math.PI, Math.PI);
    this.headYaw = 0;
    this.headTarget = 0;
    this.glanceT = rand(1, 3);
    this.path = null;
    this.pathI = 0;
    this.state = 'idle';
    this.idleT = 0.2;
    this.plan = [];
    this.spot = null;
    this.sus = 0;
    this.seeing = [];
    this.phase = rand(0, 10);
    this.speedMul = opts.speedMul ?? rand(0.9, 1.12);
    this.bubble = null;
    this.chatT = rand(3, 9);
    this.age = 0;
    this.hiddenT = 0;
    this.phoneT = 0;
    this.distractT = 0;
    this.slipT = 0;
    this.fovOverride = null;
    this.xray = !!this.T.xray;
    this.high = false;
    this.leaving = false;
    this.dead = false;
    this.name = opts.name || this.T.name || pick(L.NAMES);

    if (type === 'dog') this.h = makeDog();
    else if (type === 'roomba') this.h = makeRoomba();
    else if (type === 'pigeon') this.h = makePigeon();
    else {
      const o = {};
      if (type === 'boss') Object.assign(o, { shirt: '#2d3142', pants: '#2d3142', hairStyle: 'short', hair: '#8a8a8a', skin: pick(['#f1c7a5', '#e0ac85']) });
      if (type === 'janitor') Object.assign(o, { shirt: '#3d6fb6', pants: '#3d6fb6', hairStyle: 'cap', capColor: '#3d6fb6' });
      if (type === 'it') Object.assign(o, { shirt: '#2f4f3f', hairStyle: 'short' });
      if (type === 'cake' || opts.party) Object.assign(o, {});
      this.h = makeHuman(o);
      Object.assign(this.h, dress(this.h, opts.dressAs || type));
      if (opts.party) dress(this.h, 'party');
      if (opts.special) this.special = true;
    }
    this.group = this.h.group;
    this.group.position.set(x, 0, z);
    mgr.scene.add(this.group);

    if (!this.T.critter) {
      this.fan = makeFan(FAN_RAYS, this.T.range, this.T.cone, 0.1, true);
      this.fanPts = new Float32Array(FAN_RAYS * 2);
      mgr.scene.add(this.fan);
    }
  }

  get fov() {
    if (this.fovOverride !== null) return this.fovOverride;
    if (this.phoneT > 0) return 0;
    return this.T.fov;
  }
  get seesThings() {
    return !this.T.critter && !this.hiddenT && this.fov > 0;
  }
  get lookDir() {
    return this.dir + this.headYaw;
  }

  say(text, dur = 2.6, cls = '') {
    this.bubble = { text, t: dur, cls };
  }

  goTo(spot, idle = [3, 8], opts = {}) {
    this.releaseSpot();
    const p = findPath(this.mgr.office, this.x, this.z, spot.x, spot.z);
    if (!p) {
      this.state = 'idle';
      this.idleT = 0.5;
      this.spot = null;
      return false;
    }
    this.path = p;
    this.pathI = 0;
    this.state = 'walk';
    this.target = spot;
    this.targetIdle = idle;
    this.targetOpts = opts;
    if (spot.occ !== undefined) spot.occ = this;
    this.claimed = spot;
    return true;
  }

  releaseSpot() {
    if (this.claimed && this.claimed.occ === this) this.claimed.occ = null;
    this.claimed = null;
  }

  remove() {
    this.releaseSpot();
    this.dead = true;
    this.mgr.scene.remove(this.group);
    if (this.fan) {
      this.mgr.scene.remove(this.fan);
      this.fan.geometry.dispose();
      this.fan.material.dispose();
    }
    if (this.prop) this.mgr.scene.remove(this.prop);
  }
}

export class NPCManager {
  constructor(scene, office) {
    this.scene = scene;
    this.office = office;
    this.list = [];
    this.speedMul = 1;
    this.nosy = 0.2;
    this.target = 3;
    this.spawnT = 1;
    this.spawnPause = 0;
    this.frame = 0;
    this.signs = [];
    this.forcedGoal = null; // event-driven: function(npc) => spot|null
  }

  clear() {
    for (const n of this.list) n.remove();
    this.list = [];
    for (const s of this.signs) this.scene.remove(s.mesh);
    this.signs = [];
  }

  humans() {
    return this.list.filter((n) => !n.T.critter && !n.dead);
  }
  count(type) {
    return this.list.filter((n) => n.type === type && !n.dead).length;
  }

  spawn(type, opts = {}) {
    const exits = this.office.spots.exits;
    const ex = opts.at || pick(exits);
    const n = new NPC(this, type, ex.x, ex.z, { dir: ex.face ?? Math.PI, ...opts });
    this.list.push(n);
    if (opts.plan) n.plan = opts.plan.slice();
    if (type === 'pigeon') {
      n.y = 1.9;
      n.flyTo = this.randomWander();
      n.life = opts.life ?? 18;
    }
    if (type === 'dog' || type === 'roomba') n.life = opts.life ?? 30;
    if (!opts.noGoal && !n.T.critter) this.nextGoal(n);
    return n;
  }

  randomWander() {
    return pick(this.office.spots.wander);
  }

  freeSpot(list) {
    const free = list.filter((s) => !s.occ);
    return free.length ? pick(free) : null;
  }

  /** Decide what this person does next. */
  nextGoal(n) {
    const sp = this.office.spots;
    if (n.plan.length) {
      const step = n.plan.shift();
      if (step.say) n.say(step.say, 3);
      if (step.exit) return this.leave(n);
      const spot = typeof step.spot === 'function' ? step.spot() : step.spot;
      if (!spot) return this.nextGoal(n);
      if (spot.occ === undefined) spot.occ = null;
      n.goTo(spot, step.idle ?? [1, 2], step);
      return;
    }
    if (this.forcedGoal) {
      const f = this.forcedGoal(n);
      if (f) {
        if (f.occ === undefined) f.occ = null;
        n.goTo(f, [3, 6], { forced: true });
        return;
      }
    }
    if (n.leaving || (n.age > 25 && chance(0.35)) || n.type === 'speedy') return this.leave(n);
    if (n.type === 'zoom' || n.type === 'janitor') {
      if (n.age > 30) return this.leave(n);
      return n.goTo(this.randomWander(), [1, 3]);
    }
    const kind = weighted([
      ['desk', 5],
      ['hang', 1.2],
      ['cooler', 1.2],
      ['copier', 1],
      ['kitchen', 1],
      ['restroom', 0.5],
      ['vending', 0.4],
      ['printer', 0.5],
      ['wander', 1.2],
    ]);
    let spot = null;
    let idle = [3, 8];
    switch (kind) {
      case 'desk':
        spot = this.freeSpot(sp.desks);
        idle = [5, 14];
        break;
      case 'hang':
        spot = this.freeSpot(sp.hang);
        idle = [5, 10];
        break;
      case 'cooler':
        spot = this.freeSpot(sp.cooler);
        idle = [4, 9];
        break;
      case 'copier':
        spot = this.freeSpot(sp.copier);
        idle = [3, 7];
        break;
      case 'kitchen':
        spot = this.freeSpot(sp.kitchen);
        idle = [4, 9];
        break;
      case 'restroom':
        spot = sp.restroom;
        break;
      case 'vending':
        spot = sp.vending;
        idle = [2, 4];
        break;
      case 'printer':
        spot = sp.printer;
        idle = [2, 4];
        break;
      default:
        spot = this.randomWander();
        idle = [0.5, 2];
    }
    if (!spot) spot = this.randomWander();
    if (spot.occ === undefined) spot.occ = null;
    n.goTo(spot, idle, { kind });
  }

  leave(n) {
    n.leaving = true;
    n.plan = [];
    const ex = pick(this.office.spots.exits);
    n.goTo(ex, [0, 0], { exit: true });
  }

  /** Called once per frame during play. */
  update(dt, game) {
    this.frame++;
    // spawning
    if (this.spawnPause > 0) this.spawnPause -= dt;
    else {
      this.spawnT -= dt;
      const humans = this.list.filter((n) => !n.T.critter && !n.leaving && !n.special).length;
      if (this.spawnT <= 0 && humans < this.target) {
        this.spawnT = rand(0.8, 2.5);
        const q = game ? game.quarter : 1;
        const type = weighted([
          ['coworker', 6],
          ['speedy', 1.5 + q * 0.3],
          ['intern', 1.5],
        ]);
        this.spawn(type);
      }
    }

    for (const n of this.list) {
      if (n.dead) continue;
      this.updateOne(n, dt, game);
    }
    this.list = this.list.filter((n) => !n.dead);

    // wet floor signs expire
    for (const s of this.signs) {
      s.t -= dt;
      if (s.t <= 0) this.scene.remove(s.mesh);
    }
    this.signs = this.signs.filter((s) => s.t > 0);

    // gentle separation so people don't merge
    const hs = this.list;
    for (let i = 0; i < hs.length; i++) {
      const a = hs[i];
      if (a.type === 'pigeon' || a.hiddenT) continue;
      for (let j = i + 1; j < hs.length; j++) {
        const b = hs[j];
        if (b.type === 'pigeon' || b.hiddenT) continue;
        const dx = b.x - a.x,
          dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 0.3 && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = ((0.55 - d) / d) * 0.5 * Math.min(1, dt * 6);
          const aw = a.state === 'walk' ? 1 : 0.2,
            bw = b.state === 'walk' ? 1 : 0.2;
          a.x -= dx * push * aw;
          a.z -= dz * push * aw;
          b.x += dx * push * bw;
          b.z += dz * push * bw;
        }
      }
    }
  }

  updateOne(n, dt, game) {
    n.age += dt;
    if (n.bubble) {
      n.bubble.t -= dt;
      if (n.bubble.t <= 0) n.bubble = null;
    }
    if (n.T.critter) return this.updateCritter(n, dt, game);

    if (n.hiddenT > 0) {
      n.hiddenT -= dt;
      n.group.visible = false;
      if (n.fan) n.fan.visible = false;
      if (n.hiddenT <= 0) {
        n.group.visible = true;
        this.nextGoal(n);
      }
      return;
    }
    if (n.phoneT > 0) n.phoneT -= dt;
    if (n.distractT > 0) n.distractT -= dt;

    const frozen = game && game.freeze;
    let speed = n.T.speed * this.speedMul * n.speedMul * (game ? game.eventSpeed : 1);
    const suspicious = n.sus > 0.22;
    if (suspicious) speed *= 0.3;
    if (n.phoneT > 0 || n.distractT > 0) speed = 0;
    if (n.slipT > 0) {
      n.slipT -= dt;
      speed *= 0.3;
    }
    if (frozen) speed = 0;

    // --- movement
    let moving = false;
    if (n.state === 'walk' && n.path) {
      const p = n.path[n.pathI];
      const dx = p.x - n.x,
        dz = p.z - n.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        n.pathI++;
        if (n.pathI >= n.path.length) this.arrive(n);
      } else if (speed > 0) {
        const step = Math.min(d, speed * dt);
        n.x += (dx / d) * step;
        n.z += (dz / d) * step;
        n.dir = dampAngle(n.dir, Math.atan2(dx, dz), 10, dt);
        moving = true;
        // slip on wet floors
        for (const s of this.signs) {
          if (n.slipT <= 0 && Math.hypot(s.x - n.x, s.z - n.z) < 0.9) {
            n.slipT = 1.1;
            n.say(pick(L.SLIP), 1.6);
          }
        }
      }
    } else if (n.state === 'idle') {
      if (n.faceDir !== undefined) n.dir = dampAngle(n.dir, n.faceDir, 6, dt);
      if (!frozen) n.idleT -= dt;
      if (n.idleT <= 0) {
        n.sitting = false;
        this.onIdleDone(n);
      }
    }
    if (n.slipT > 0) n.group.rotation.y = n.dir + (1.1 - n.slipT) * Math.PI * 2;

    // --- head / glances
    const toM = Math.atan2(MEHR.x - n.x, MEHR.z - n.z);
    const dM = Math.hypot(MEHR.x - n.x, MEHR.z - n.z);
    if (suspicious) {
      n.headTarget = clamp(angleDiff(n.dir, toM), -1.7, 1.7);
      if (!moving && n.state === 'walk') n.dir = dampAngle(n.dir, toM, 3, dt);
    } else if (n.lookAt) {
      n.headTarget = clamp(angleDiff(n.dir, Math.atan2(n.lookAt.x - n.x, n.lookAt.z - n.z)), -1.6, 1.6);
    } else if (!frozen) {
      n.glanceT -= dt;
      if (n.glanceT <= 0) {
        if (n.headTarget !== 0) {
          n.headTarget = 0;
          n.glanceT = rand(1.2, 3.5) / (n.sitting ? 0.6 : 1);
        } else {
          const nosy = dM < n.T.range && chance(this.nosy);
          n.headTarget = nosy ? clamp(angleDiff(n.dir, toM), -1.5, 1.5) : rand(-1.2, 1.2) * (n.sitting ? 0.5 : 1);
          n.glanceT = rand(0.5, 1.4);
        }
      }
    }
    n.headYaw = dampAngle(n.headYaw, n.headTarget, 7, dt);

    // --- chatter
    if (!frozen) {
      n.chatT -= dt;
      if (n.chatT <= 0) {
        n.chatT = rand(6, 14);
        if (!n.bubble && chance(0.4)) n.say(this.chatLine(n));
      }
    }

    // --- pose + animation
    if (moving && !frozen) n.phase += dt * speed * 5.5;
    animateWalk(n.h, n.phase, moving ? 1 : 0, dt);
    if (!moving && n.sitting) {
      n.h.legs[0].rotation.x = n.h.legs[1].rotation.x = -1.45;
      n.h.body.position.y = -0.1;
    }
    if (n.phoneT > 0 && !n.h.armsFixed) {
      n.h.arms[1].rotation.x = -2.2;
      n.h.head.rotation.x = 0.4;
    } else n.h.head.rotation.x = damp(n.h.head.rotation.x, 0, 8, dt);
    if (n.h.mop) n.h.mop.rotation.z = Math.sin(n.age * 6) * 0.5;
    if (n.onLadder) {
      n.y = damp(n.y, 1.05, 3, dt);
    } else n.y = damp(n.y, 0, 5, dt);
    n.h.head.rotation.y = n.headYaw;
    n.group.position.set(n.x, n.y, n.z);
    if (n.slipT <= 0) n.group.rotation.y = n.dir;

    // --- vision cone (round robin updates)
    const f = n.fan;
    const fov = n.fov;
    if (f) {
      f.visible = fov > 0 && game !== null;
      if (f.visible && ((this.frame + n.id) % 2 === 0 || n.fanFresh !== true)) {
        n.fanFresh = true;
        const occ = game.occ;
        const half = Math.min(Math.PI, (fov * DEG) / 2);
        const range = n.T.range * (n.onLadder ? 0.75 : 1);
        visFan(n.x, n.z, n.lookDir, half, range, FAN_RAYS, occ, { xray: n.xray, high: n.high }, n.fanPts, 0.1);
        setFan(f, n.fanPts);
      }
      f.position.set(n.x, 0.035, n.z);
      const near = clamp(1.3 - (dM - 3) / 9, 0.3, 1);
      f.material.opacity = (0.15 + n.sus * 0.35) * near;
      if (n.sus > 0.05) f.material.color.set(n.sus > 0.6 ? '#ff3b3b' : '#ffb020');
      else f.material.color.set(n.T.cone);
    }
  }

  chatLine(n) {
    if (n.type === 'zoom') return pick(L.ZOOM);
    if (n.type === 'boss') return pick(L.BOSS);
    if (n.type === 'it') return pick(L.IT);
    if (n.type === 'janitor') return pick(L.JANITOR);
    if (n.type === 'ladder') return pick(L.LADDER);
    if (n.type === 'intern') return pick(L.INTERN);
    const k = n.target?.kind;
    if (n.state === 'idle') {
      if (k === 'cooler') return pick(L.COOLER);
      if (k === 'copier') return pick(L.COPIER);
      if (k === 'kitchen') return pick(L.KITCHEN);
      if (k === 'board') return pick(L.MEETING);
      if (k === 'desk') return pick(L.DESK);
      if (k === 'pingpong') return pick(L.PINGPONG);
      if (k === 'whiteboard') return pick(L.WHITEBOARD);
    }
    return pick(L.CORPORATE);
  }

  arrive(n) {
    const t = n.target;
    const o = n.targetOpts || {};
    n.path = null;
    if (o.exit) {
      n.remove();
      return;
    }
    if (t && t.name === 'restroom') {
      n.hiddenT = rand(4, 9);
      n.releaseSpot();
      return;
    }
    n.state = 'idle';
    const [a, b] = n.targetIdle || [2, 4];
    n.idleT = rand(a, b);
    n.faceDir = t && t.face !== undefined ? t.face : undefined;
    const k = t?.kind;
    n.sitting = k === 'desk' || k === 'board' || k === 'couch' || k === 'kitchen' || k === 'bench';
    if (n.sitting && t) {
      n.x = t.x;
      n.z = t.z;
    }
    if (o.onArrive) o.onArrive(n);
    if (n.type === 'ladder' && o.ladder) this.startLadder(n);
    if (n.type === 'janitor' && chance(0.6) && this.signs.length < 2) this.dropSign(n);
  }

  onIdleDone(n) {
    if (n.onLadder) this.endLadder(n);
    if (n.targetOpts?.onDone) n.targetOpts.onDone(n);
    this.nextGoal(n);
  }

  startLadder(n) {
    n.onLadder = true;
    n.high = true;
    n.fovOverride = 360;
    const lad = n.h.ladder;
    lad.rotation.x = Math.PI / 2;
    lad.position.set(0, -1.0, 0.25);
    n.h.arms[1].rotation.z = 0;
    n.say(pick(L.LADDER_UP), 3);
  }
  endLadder(n) {
    n.onLadder = false;
    n.high = false;
    n.fovOverride = null;
    const lad = n.h.ladder;
    lad.rotation.x = 0;
    lad.position.set(0.32, 1.15, 0);
    n.h.arms[1].rotation.z = 2.6;
  }

  dropSign(n) {
    const s = wetFloorSign();
    s.position.set(n.x + Math.sin(n.dir) * 0.6, 0, n.z + Math.cos(n.dir) * 0.6);
    this.scene.add(s);
    this.signs.push({ mesh: s, x: s.position.x, z: s.position.z, t: 25 });
  }

  updateCritter(n, dt, game) {
    const frozen = game && game.freeze;
    n.life -= dt;
    const h = n.h;
    if (n.type === 'pigeon') {
      if (!frozen) {
        const t = n.flyTo;
        const dx = t.x - n.x,
          dz = t.z - n.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.3) n.flyTo = n.life < 0 ? { x: rand(0, W), z: -3 } : this.randomWander();
        else {
          n.x += (dx / d) * n.T.speed * dt;
          n.z += (dz / d) * n.T.speed * dt;
          n.dir = dampAngle(n.dir, Math.atan2(dx, dz), 6, dt);
        }
        n.phase += dt * 22;
        h.wings[0].rotation.z = Math.sin(n.phase) * 0.8;
        h.wings[1].rotation.z = -Math.sin(n.phase) * 0.8;
      }
      n.y = 1.9 + Math.sin(n.age * 3) * 0.25;
      h.shadow.position.y = -n.y + 0.02;
      n.group.position.set(n.x, n.y, n.z);
      n.group.rotation.y = n.dir;
      if (n.life < -8 || n.z < -2) n.remove();
      return;
    }
    // dog / roomba: wander between random points
    let moving = false;
    if (!frozen) {
      if (n.state !== 'walk') {
        n.idleT -= dt;
        if (n.idleT <= 0) {
          if (n.life < 0) {
            n.goTo(pick(this.office.spots.exits), [0, 0], { exit: true });
          } else n.goTo(this.randomWander(), [0.5, 2.5]);
        }
      } else if (n.path) {
        const p = n.path[n.pathI];
        const dx = p.x - n.x,
          dz = p.z - n.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.08) {
          n.pathI++;
          if (n.pathI >= n.path.length) {
            n.path = null;
            if (n.targetOpts?.exit) return n.remove();
            n.state = 'idle';
            n.idleT = rand(...(n.targetIdle || [1, 2]));
          }
        } else {
          const sp = n.T.speed * (n.type === 'dog' ? 1 + Math.sin(n.age * 2) * 0.3 : 1);
          n.x += (dx / d) * Math.min(d, sp * dt);
          n.z += (dz / d) * Math.min(d, sp * dt);
          n.dir = dampAngle(n.dir, Math.atan2(dx, dz), n.type === 'roomba' ? 3 : 10, dt);
          moving = true;
        }
      }
    }
    if (moving) n.phase += dt * 12;
    animateWalk(h, n.phase, moving ? 1 : 0.2, dt);
    if (n.type === 'dog' && !moving) h.tail.rotation.y = Math.sin(n.age * 14) * 0.8;
    n.group.position.set(n.x, 0, n.z);
    n.group.rotation.y = n.dir;
  }

  /** Reroute everyone after a layout change. */
  afterReorg() {
    for (const n of this.list) {
      n.releaseSpot();
      const i = this.office.cellOf(n.x, n.z);
      if (this.office.grid[i] || !this.office.reach[i]) {
        const j = this.office.nearestFreeCell(n.x, n.z, true);
        if (j >= 0) {
          n.x = ((j % COLS) + 0.5) * CELL;
          n.z = (Math.floor(j / COLS) + 0.5) * CELL;
        }
      }
      n.sitting = false;
      if (n.T.critter) {
        n.state = 'idle';
        n.idleT = 0.1;
        n.path = null;
      } else if (n.leaving) this.leave(n);
      else {
        n.plan = n.plan.filter((s) => typeof s.spot === 'function' || s.exit);
        this.nextGoal(n);
      }
    }
  }
}

/**
 * Which monitors can this NPC see right now?
 * Needs: in front of the screen, screen inside NPC's field of view, clear line of sight.
 */
export function visibleMonitors(n, monitors, occ, out, includeOff = false) {
  out.length = 0;
  if (!n.seesThings) return out;
  const fov = n.fov;
  const cosFov = fov >= 360 ? -2 : Math.cos((fov * DEG) / 2);
  const cosScreen = Math.cos(SCREEN_HALF);
  const la = n.lookDir;
  const lx = Math.sin(la),
    lz = Math.cos(la);
  const range = n.T.range * (n.onLadder ? 0.75 : 1);
  for (const m of monitors) {
    if (!m.on && !includeOff) continue;
    const vx = n.x - m.x,
      vz = n.z - m.z;
    const d = Math.hypot(vx, vz);
    if (d > range || d < 0.2) continue;
    if ((vx * m.nx + vz * m.nz) / d < cosScreen) continue;
    if ((-vx * lx - vz * lz) / d < cosFov) continue;
    if (blocked(m.x, m.z, n.x, n.z, occ, { xray: n.xray, high: n.high })) continue;
    out.push({ m, d });
  }
  return out;
}
