import * as THREE from 'three';
import { Office, MEHR, CUBE, W, D, COLS, CELL, sizeOffice } from './office.js';
import { Mehr } from './mehr.js';
import { Monitor } from './monitors.js';
import { NPCManager, visibleMonitors } from './npcs.js';
import { Events } from './events.js';
import { Effects } from './effects.js';
import { Audio } from './audio.js';
import { CameraRig, PITCH } from './camera.js';
import { UI } from './ui.js';
import { clamp, pick, rand } from './util.js';
import * as L from './lines.js';

const $ = (id) => document.getElementById(id);
const DEBUG = new URLSearchParams(location.search).has('debug');
const QUARTER_LEN = 40;
const MONITORS_BY_QUARTER = [0, 2, 3, 4, 4, 5, 5, 6];

class Game {
  constructor() {
    this.canvas = $('c');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1c1f33');
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#7a80a8', 1.9));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.5);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);

    this.rig = new CameraRig();
    this.office = new Office(this.scene);
    sizeOffice(this.viewAspect(), PITCH);
    this.office.generate();
    this.mehr = new Mehr(this.scene);
    this.npcs = new NPCManager(this.scene, this.office);
    this.fx = new Effects(this.scene);
    this.audio = new Audio();
    this.events = new Events(this);
    this.ui = new UI(this);
    this.monitors = [];
    this.occ = { walls: this.office.walls, segs: this.mehr.occluders.segs, circles: this.mehr.occluders.circles };
    this.gaze = this.makeGazeLines();

    this.state = 'title';
    this.freeze = false;
    this.eventSpeed = 1;
    this.quarter = 1;
    this.time = 0;
    this.score = 0;
    this.strikes = 0;
    this.best = 0;
    try {
      this.best = Number(localStorage.getItem('mehr-best') || 0);
    } catch {}

    this.distract = { charges: 2, armed: false, items: [] };
    this.raycaster = new THREE.Raycaster();
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.bindInput();
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));

    this.setupTitle();
    this.last = performance.now();
    this.frameTimes = [];
    this.lowPerfT = 0;
    this.renderer.setAnimationLoop(() => this.loop());
    if (DEBUG) $('fps').classList.remove('hidden');
  }

  get playing() {
    return this.state === 'playing' || this.state === 'busted';
  }

  /** Aspect ratio of the area the office is drawn into (screen minus HUD and buttons). */
  viewAspect() {
    const w = window.innerWidth,
      h = window.innerHeight;
    const short = w > h && h < 500;
    return w / Math.max(100, h - (short ? 60 : 80) - (short ? 72 : 80));
  }

  // ---------------------------------------------------------------- setup
  makeGazeLines() {
    const lines = [];
    for (let i = 0; i < 16; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.8 }));
      line.frustumCulled = false;
      line.visible = false;
      line.renderOrder = 3;
      this.scene.add(line);
      lines.push(line);
    }
    return lines;
  }

  setMonitorCount(n, announce = false) {
    while (this.monitors.length < n) {
      const m = new Monitor(this.scene, this.monitors.length);
      if (announce) {
        m.appear();
        this.fx.pop(m.x, 1.2, m.z, m.color, 16);
      }
      this.monitors.push(m);
    }
    this.onResize();
  }

  resetWorld() {
    this.monitors.forEach((m) => m.dispose(this.scene));
    this.monitors = [];
    this.npcs.clear();
    this.fx.clear();
    this.distract.items.forEach((d) => this.scene.remove(d.mesh));
    this.distract.items = [];
    this.distract.armed = false;
    this.ui.clearWorld();
    sizeOffice(this.viewAspect(), PITCH);
    this.office.generate();
    this.crowd = Math.min(2.6, Math.max(1, (W * D) / (16 * 21.5)));
    this.occ.walls = this.office.walls;
    this.mehr.targetFacing = this.mehr.facing = Math.PI;
    this.mehr.targetOffset = this.mehr.offset = 0;
    this.mehr.relayout();
    this.mehr.setMood('idle');
    this.npcs.forcedGoal = null;
    this.npcs.spawnPause = 0;
    this.eventSpeed = 1;
    this.freeze = false;
    document.body.classList.remove('alarm');
  }

  setupTitle() {
    this.state = 'title';
    this.resetWorld();
    this.setMonitorCount(3);
    this.monitors.forEach((m) => m.setOn(true));
    this.npcs.target = 5;
    this.npcs.speedMul = 1;
    this.rig.orbit = true;
    this.rig.snapYaw = true;
    this.mehr.targetFacing = this.mehr.facing = 0;
    this.mehr.updateOccluders();
    this.rig.focusGoal = 1;
    this.rig.focus = 1;
    this.rig.focusPt.set(MEHR.x, 1.25, MEHR.z);
    this.rig.focusSize = 3.4;
    this.ui.show('hud', false);
    this.ui.show('bar', false);
    this.ui.show('ticker', false);
    this.ui.show('screen-title');
    this.ui.show('screen-fired', false);
    this.ui.show('screen-pause', false);
    this.ui.show('screen-busted', false);
    $('hiscore').textContent = this.best ? `🏆 Best: ${this.best.toLocaleString()}` : '';
    this.onResize();
  }

  start() {
    this.audio.unlock();
    this.resetWorld();
    this.state = 'playing';
    this.time = 0;
    this.score = 1000; // starting goodwill. Hit 0 and you're out.
    this.strikes = 0;
    this.quarter = 1;
    this.streak = 0;
    this.idleT = 0;
    this.grace = 2;
    this.popT = 0;
    this.stats = { gamesPlayed: 0, secondsGamed: 0, closest: 0, games: {}, lastGame: 'Snake' };
    this.events.reset();
    this.distract.items.forEach((d) => this.scene.remove(d.mesh));
    this.distract = { charges: 2, armed: false, items: [] };
    this.ui.setDistract(this.distract);
    this.setMonitorCount(MONITORS_BY_QUARTER[1]);
    this.npcs.target = Math.round(3 * this.crowd);
    this.npcs.speedMul = 1;
    this.npcs.nosy = 0.18;
    this.npcs.spawnT = 0.5;
    this.rig.orbit = false;
    this.rig.snapYaw = true;
    this.rig.focusGoal = 0;
    this.rig.focus = 0.6;
    this.ui.show('screen-title', false);
    this.ui.show('screen-fired', false);
    this.ui.show('screen-pause', false);
    this.ui.show('hud');
    this.ui.show('bar');
    this.ui.setStrikes(0);
    this.ui.banner('Q1 — Clock in!', 'Tap a screen to play. Only people BEHIND you can see.', 3);
    this.ui.ticker('💡 Tap left/right on the floor to roll your chair. You block the screens right behind you!');
    this.audio.startMusic();
    this.audio.tempo = 1;
    this.onResize();
  }

  // ---------------------------------------------------------------- input
  bindInput() {
    const c = this.canvas;
    let dragging = false;
    const ndc = new THREE.Vector2();
    const toNdc = (e) => {
      const r = c.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.rig.camera);
    };
    const aimChair = () => {
      const p = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.floorPlane, p)) return;
      const off = clamp(p.x - MEHR.x, -1.15, 1.15);
      if (Math.abs(off - this.mehr.targetOffset) > 0.3) this.audio.swivel();
      this.mehr.targetOffset = off;
    };
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (this.state !== 'playing') return;
      e.preventDefault();
      toNdc(e);
      if (this.distract.armed) {
        const p = new THREE.Vector3();
        let y = 0;
        const hit = this.raycaster.intersectObject(this.office.root, true).find((h) => h.object.visible && !h.object.material.transparent);
        if (hit && hit.face) {
          // geometry normals; instanced boxes only rotate around Y so .y is still "up"
          const ny = hit.object.isInstancedMesh ? hit.face.normal.y : hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y;
          if (ny > 0.7 && hit.point.y > 0.2 && hit.point.y < 1.3) {
            p.copy(hit.point);
            y = hit.point.y;
          }
        }
        if (y === 0 && !this.raycaster.ray.intersectPlane(this.floorPlane, p)) return;
        this.placeDistraction(p.x, p.z, y);
        return;
      }
      const hits = this.raycaster.intersectObjects(
        this.monitors.map((m) => m.hit),
        false
      );
      if (hits.length) {
        this.toggleMonitor(hits[0].object.userData.monitor);
        return;
      }
      dragging = true;
      c.setPointerCapture?.(e.pointerId);
      aimChair();
    });
    c.addEventListener('pointermove', (e) => {
      if (!dragging || this.state !== 'playing') return;
      toNdc(e);
      aimChair();
    });
    const end = () => (dragging = false);
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.state === 'title' && (e.key === 'Enter' || e.key === ' ')) return this.start();
      if (this.state === 'fired' && e.key === 'Enter') return this.start();
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') return this.togglePause();
      if (this.state !== 'playing') return;
      const n = Number(e.key);
      if (n >= 1 && n <= this.monitors.length) this.toggleMonitor(this.monitors[n - 1]);
      if (e.key === ' ') {
        e.preventDefault();
        this.panic();
      }
      if (e.key === 'f' || e.key === 'F') this.armDistraction();
      const roll = { ArrowLeft: -1, a: -1, A: -1, ArrowRight: 1, d: 1, D: 1 }[e.key];
      if (roll) {
        this.mehr.targetOffset = clamp(this.mehr.targetOffset + roll * 0.575, -1.15, 1.15);
        this.audio.swivel();
      }
    });

    $('playBtn').addEventListener('click', () => this.start());
    $('againBtn').addEventListener('click', () => this.start());
    $('pauseBtn').addEventListener('click', () => this.togglePause());
    $('resumeBtn').addEventListener('click', () => this.togglePause());
    $('quitBtn').addEventListener('click', () => {
      this.audio.stopMusic();
      this.setupTitle();
    });
    $('panic').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.panic();
    });
    $('distract').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.armDistraction();
    });
    $('muteBtn').addEventListener('click', () => {
      this.audio.setMuted(!this.audio.muted);
      $('muteBtn').textContent = this.audio.muted ? '🔇' : '🔊';
    });
    $('muteBtn').textContent = this.audio.muted ? '🔇' : '🔊';
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.togglePause();
    });
    // stop iOS double-tap zoom / long-press menus
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  toggleMonitor(m) {
    if (this.state !== 'playing') return;
    const on = !m.on;
    if (on && this.time - m.lastOff < 0.3) return; // ignore accidental double taps right after hiding
    m.setOn(on);
    if (!on) m.lastOff = this.time;
    if (on) {
      this.audio.on();
      this.stats.gamesPlayed++;
      const name = m.game.constructor.title;
      this.stats.games[name] = (this.stats.games[name] || 0) + 1;
      this.stats.lastGame = name;
    } else this.audio.off();
  }

  panic() {
    if (this.state !== 'playing') return;
    let any = false;
    for (const m of this.monitors) {
      if (m.setOn(false)) {
        any = true;
        m.lastOff = this.time;
      }
    }
    this.audio.panic();
    this.mehr.setMood('panic', 0.5);
    if (any) this.ui.flash(false);
  }

  // ---------------------------------------------------------------- distractions
  armDistraction() {
    if (this.state !== 'playing') return;
    const d = this.distract;
    if (d.armed) {
      d.armed = false;
    } else if (d.charges > 0) {
      d.armed = true;
      this.ui.ticker('🍩 Tap a desk, table or spot on the floor to drop free donuts!');
    } else {
      this.audio.nope();
      this.ui.ticker('🍩 Out of donuts. More arrive next quarter.');
    }
    this.ui.setDistract(d);
  }

  placeDistraction(x, z, y = 0) {
    const d = this.distract;
    const o = this.office;
    const cell = o.nearestFreeCell(x, z, true);
    if (cell < 0) return;
    if (y === 0) {
      // on the floor: snap to a walkable spot
      x = ((cell % COLS) + 0.5) * CELL;
      z = (Math.floor(cell / COLS) + 0.5) * CELL;
    }
    d.armed = false;
    d.charges--;
    this.ui.setDistract(d);
    const mesh = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.14, 0.4), new THREE.MeshLambertMaterial({ color: '#ff8fc7' }));
    box.position.y = 0.07;
    mesh.add(box);
    ['#c8742c', '#ff6fb5', '#6b3b1f', '#ffd84d'].forEach((c, i) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.035, 6, 12), new THREE.MeshLambertMaterial({ color: c }));
      t.rotation.x = Math.PI / 2;
      t.position.set(-0.17 + (i % 2) * 0.34 - 0.08 + (i > 1 ? 0.16 : 0), 0.17, (i > 1 ? 0.08 : -0.08));
      mesh.add(t);
    });
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    const item = { mesh, x, z, y, t: 0, dur: 9 };
    d.items.push(item);
    this.fx.pop(x, y + 0.4, z, '#ff8fc7', 14);
    this.ui.pop('🍩 FREE DONUTS!', x, y + 1.2, z, true);
    this.audio.event();
    // pull in everyone nearby
    const spots = this.events.pointsNear(item, 0.7, 1.6, 14);
    let k = 0;
    for (const p of this.npcs.humans()) {
      if (p.type === 'cake' || p.hiddenT > 0 || p.onLadder) continue;
      if (Math.hypot(p.x - x, p.z - z) > 9) continue;
      const s = spots[k++ % Math.max(1, spots.length)] || { x, z };
      p.plan = [{ spot: { x: s.x, z: s.z, face: Math.atan2(x - s.x, z - s.z), occ: null }, idle: [5, 7] }];
      p.phoneT = 0;
      p.say(pick(['Ooh, donuts!', 'DONUTS?!', 'Is that a cruller?', 'Mine!!', 'Sprinkles!!', 'Diet starts tomorrow']), 2);
      this.npcs.nextGoal(p);
    }
  }

  updateDistractions(dt) {
    const d = this.distract;
    for (const it of d.items) {
      it.t += dt;
      it.mesh.position.y = it.y + Math.abs(Math.sin(it.t * 4)) * 0.05;
      if (it.t > it.dur) this.scene.remove(it.mesh);
    }
    d.items = d.items.filter((it) => it.t <= it.dur);
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.ui.show('screen-pause');
      this.audio.stopMusic();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.ui.show('screen-pause', false);
      this.audio.startMusic();
      this.last = performance.now();
    }
  }

  ticker(msg, alert) {
    this.ui.ticker(msg, alert);
  }
  banner(t, s, d) {
    this.ui.banner(t, s, d);
  }

  addScore(pts, label, big) {
    this.score += pts;
    if (label) this.ui.pop(label, MEHR.x, 2.9, CUBE.z0 - 0.4, big);
  }

  // ---------------------------------------------------------------- reorg
  startReorg() {
    this.reorg = { t: 0, swapped: false };
    this.freeze = true;
  }
  updateReorg(dt) {
    const r = this.reorg;
    if (!r) return;
    r.t += dt;
    const g = this.office.podGroup;
    if (!r.swapped) {
      g.scale.y = Math.max(0.01, 1 - r.t / 0.8);
      if (Math.random() < dt * 20) this.fx.smoke(rand(1, W - 1), rand(5, D - 4), '#c9c2b5', 1, 0.3);
      if (r.t >= 0.8) {
        r.swapped = true;
        this.office.regeneratePods();
        this.office.podGroup.scale.y = 0.01;
        this.occ.walls = this.office.walls;
        this.npcs.afterReorg();
      }
    } else {
      const k = Math.min(1, (r.t - 0.8) / 0.8);
      g.scale.y = Math.max(0.01, k * (1 + Math.sin(k * Math.PI) * 0.15));
      if (k >= 1) {
        g.scale.y = 1;
        this.reorg = null;
        this.freeze = false;
        this.grace = Math.max(this.grace, 1);
        this.ticker('📋 New seating chart! Same Mehr.');
      }
    }
  }

  // ---------------------------------------------------------------- main loop
  loop() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    this.trackPerf(dt);
    dt = Math.min(dt, 0.05);

    if (this.state === 'paused') {
      this.render(0);
      return;
    }
    if (this.state === 'playing') this.updatePlaying(dt);
    else if (this.state === 'busted') this.updateBusted(dt);
    else if (this.state === 'fired') this.updateFired(dt);
    else this.updateTitle(dt);

    this.render(dt);
  }

  updateTitle(dt) {
    this.npcs.update(dt, null);
    this.monitors.forEach((m) => m.update(dt, this.occ));
    this.mehr.update(dt, 2);
    this.fx.update(dt);
    this.ui.updateWorld(dt, this.npcs.list, []);
  }

  updatePlaying(dt) {
    this.time += dt;
    this.audio.tickMusic();

    // difficulty ramps each "quarter"
    const q = 1 + Math.floor(this.time / QUARTER_LEN);
    if (q !== this.quarter) {
      this.quarter = q;
      this.distract.charges = Math.min(3, this.distract.charges + 1);
      this.ui.setDistract(this.distract);
      this.npcs.target = Math.round(Math.min(3 + q * 2, 17) * this.crowd);
      this.npcs.speedMul = Math.min(1 + (q - 1) * 0.06, 1.45);
      this.npcs.nosy = Math.min(0.18 + (q - 1) * 0.06, 0.55);
      this.audio.tempo = Math.min(1 + (q - 1) * 0.06, 1.4);
      const want = MONITORS_BY_QUARTER[Math.min(q, MONITORS_BY_QUARTER.length - 1)];
      if (want > this.monitors.length) {
        this.setMonitorCount(want, true);
        this.audio.fanfare();
        this.ui.banner(L.QUARTER[q] || `Q${q} — Still here?`, `📦 ${pick(L.MONITOR_MSGS)} (Monitor #${want})`, 3);
      } else {
        this.ui.banner(L.QUARTER[q] || `Q${q} — Still here?`, 'More coworkers. Faster coworkers.', 2.4);
      }
    }

    this.events.update(dt);
    this.updateReorg(dt);
    this.npcs.update(dt, this);
    this.mehr.update(dt, this.monitors.filter((m) => m.on).length);
    this.monitors.forEach((m) => m.update(dt, this.occ));
    this.fx.update(dt);

    // --- scoring
    const on = this.monitors.filter((m) => m.on);
    this.streak += dt;
    // 5 x 2^n points per second for n games at once, and each screen ramps up
    // the longer it stays on without being hidden (+12.5%/s, up to x4)
    let ramp = 0;
    for (const m of on) ramp += Math.min(4, 1 + m.onTime / 8);
    ramp = on.length ? ramp / on.length : 1;
    const rate = on.length ? 5 * 2 ** on.length * ramp : 0;
    if (on.length) {
      this.score += rate * dt;
      this.stats.secondsGamed += dt;
      this.popT += dt;
      if (this.popT >= 1) {
        this.popT = 0;
        this.ui.pop(`+${Math.round(rate)}`, MEHR.x, 2.9, CUBE.z0 - 0.4, on.length >= 3);
        this.audio.coin();
      }
    }
    // not gaming drains points: half the one-screen rate, ramping up the same way (x1 -> x4)
    let drain = 0;
    if (on.length) {
      this.idleT = 0;
    } else if (this.grace <= 0 && !this.freeze) {
      this.idleT += dt;
      drain = 5 * Math.min(4, 1 + this.idleT / 8);
      this.score -= drain * dt;
      this.popT += dt;
      if (this.popT >= 1) {
        this.popT = 0;
        this.ui.pop(`-${Math.round(drain)} 😴`, MEHR.x, 2.9, CUBE.z0 - 0.4, false, true);
      }
    }
    const label = on.length
      ? `${on.length} game${on.length > 1 ? 's' : ''} · ×${ramp.toFixed(1)} · +${Math.round(rate)}/s`
      : drain
        ? `😴 slacking off · -${Math.round(drain)}/s`
        : 'not gaming';
    this.ui.setScore(this.score, label, on.length >= 3);
    this.updateDistractions(dt);
    const mins = Math.floor(this.time * 3);
    const hr = 9 + Math.floor(mins / 60);
    const h12 = ((hr - 1) % 12) + 1;
    this.ui.setClock(this.quarter, `${h12}:${String(mins % 60).padStart(2, '0')} ${hr % 24 >= 12 ? 'PM' : 'AM'}`);

    // --- detection
    this.detect(dt);
    if (this.state === 'playing' && this.score <= 0) {
      this.score = 0;
      this.ui.setScore(0, '😴 out of goodwill', false);
      this.fire('broke');
    }

    this.ui.updateWorld(dt, this.npcs.list, this.monitors);
  }

  detect(dt) {
    if (this.grace > 0) this.grace -= dt;
    this.monitors.forEach((m) => {
      m.watched = 0;
      m.exposed = false;
    });
    const tmp = [];
    let li = 0;
    let bustBy = null;
    for (const n of this.npcs.list) {
      if (n.dead || n.T.critter) continue;
      const could = visibleMonitors(n, this.monitors, this.occ, tmp, true);
      for (const s of could) s.m.exposed = true;
      n.canSee = could.length > 0;
      const seen = could.filter((s) => s.m.on);
      if (seen.length && this.grace <= 0 && !this.freeze) {
        let minD = 99;
        for (const s of seen) minD = Math.min(minD, s.d);
        const distF = clamp(1.45 - minD / n.T.range, 0.55, 1.3);
        const before = n.sus;
        n.sus += n.T.rate * (1 + 0.25 * (seen.length - 1)) * distF * dt;
        if (Math.floor(before * 4) !== Math.floor(n.sus * 4)) this.audio.sus(n.sus);
        for (const s of seen) {
          s.m.watched = Math.max(s.m.watched, n.sus);
          const ln = this.gaze[li++];
          if (ln) {
            const a = ln.geometry.attributes.position.array;
            a[0] = n.x;
            a[1] = n.y + 1.45;
            a[2] = n.z;
            a[3] = s.m.x;
            a[4] = s.m.y;
            a[5] = s.m.z;
            ln.geometry.attributes.position.needsUpdate = true;
            ln.material.opacity = 0.35 + n.sus * 0.65;
            ln.visible = true;
          }
        }
        if (n.sus >= 1 && !bustBy) bustBy = { n, m: seen[0].m };
      } else {
        if (n.sus > 0.5) this.stats.closest = Math.max(this.stats.closest, n.sus);
        n.sus = Math.max(0, n.sus - 0.5 * dt);
      }
    }
    for (; li < this.gaze.length; li++) this.gaze[li].visible = false;
    if (bustBy) this.bust(bustBy.n, bustBy.m);
  }

  bust(n, m) {
    this.state = 'busted';
    this.bustT = 0;
    this.freeze = true;
    this.strikes++;
    this.streak = 0;
    const game = m.game?.constructor.title || 'Snake';
    this.stats.lastGame = game;
    const quote = pick(n.type === 'boss' ? L.BOSS_BUST : L.BUST).replace('{game}', game);
    $('bustedQuote').textContent = `${n.name}: “${quote}”`;
    $('bustedStrike').textContent = '💼'.repeat(3 - this.strikes) + '❌'.repeat(this.strikes);
    this.ui.show('screen-busted');
    this.ui.setStrikes(this.strikes);
    this.ui.flash(true);
    n.say('!!!', 2.5, 'shout');
    this.mehr.setMood('busted');
    this.audio.bust();
    this.audio.stopMusic();
    navigator.vibrate?.([120, 60, 220]);
    this.rig.focusPt.set((MEHR.x + n.x) / 2, 1, (MEHR.z + n.z) / 2);
    this.rig.focusSize = Math.max(5, Math.hypot(MEHR.x - n.x, MEHR.z - n.z) + 3);
    this.rig.focusGoal = 1;
    this.rig.shake = 0.5;
    this.bustNpc = n;
    this.gaze.forEach((l) => (l.visible = false));
  }

  updateBusted(dt) {
    this.bustT += dt;
    this.mehr.update(dt, 0);
    this.monitors.forEach((m) => m.update(dt, this.occ));
    this.fx.update(dt);
    this.npcs.update(dt, this);
    this.ui.updateWorld(dt, this.npcs.list, this.monitors);
    if (this.bustT > 2.8) {
      this.ui.show('screen-busted', false);
      if (this.strikes >= 3) return this.fire();
      this.state = 'playing';
      this.freeze = false;
      this.grace = 3;
      this.rig.focusGoal = 0;
      this.mehr.setMood('idle');
      this.monitors.forEach((m) => m.setOn(false));
      for (const p of this.npcs.list) p.sus = 0;
      const n = this.bustNpc;
      if (n && !n.dead && !n.special) {
        n.say(pick(["I'm telling HR.", 'Unbelievable.', 'Back to work, Mehr.', 'I saw NOTHING. …for now.']), 3);
        this.npcs.leave(n);
      }
      this.audio.startMusic();
      this.ticker(`😬 Strike ${this.strikes}. ${3 - this.strikes} more and you're out.`, true);
    }
  }

  fire(reason = 'busted') {
    this.state = 'fired';
    this.audio.fired();
    this.mehr.setMood('busted');
    const final = Math.floor(this.score);
    const isBest = final > this.best;
    if (isBest) {
      this.best = final;
      try {
        localStorage.setItem('mehr-best', String(final));
      } catch {}
    }
    const fav = Object.entries(this.stats.games).sort((a, b) => b[1] - a[1])[0]?.[0] || this.stats.lastGame;
    const mins = Math.floor(this.time / 60),
      secs = Math.floor(this.time % 60);
    $('firedBody').innerHTML = `
      <p><b>TO:</b> Mehr (Intern, Data Dept.)<br/><b>RE:</b> Your immediate separation</p>
      <p>Effective immediately, your employment is terminated for:<br/>
      <b>${reason === 'broke' ? pick(L.HR_BROKE) : pick(L.HR_REASONS).replace('{game}', fav)}</b></p>
      <p>Tenure: ${mins}m ${secs}s (Q${this.quarter})<br/>
      Games launched: ${this.stats.gamesPlayed}<br/>
      Seconds of "work": ${Math.floor(this.stats.secondsGamed)}<br/>
      Favorite "spreadsheet": ${this.stats.gamesPlayed ? fav : 'actual spreadsheets (suspicious)'}</p>
      <p>Please return your badge, your 4 lanyards, and the office's collective respect.</p>`;
    $('finalScore').textContent = final.toLocaleString();
    $('newBest').classList.toggle('hidden', !isBest);
    this.ui.show('hud', false);
    this.ui.show('bar', false);
    this.ui.show('ticker', false);
    setTimeout(() => {
      if (this.state === 'fired') this.ui.show('screen-fired');
    }, 600);
    this.rig.focusPt.set(MEHR.x, 1.2, MEHR.z);
    this.rig.focusSize = 4;
    this.rig.focusGoal = 1;
    this.fx.confetti(MEHR.x, MEHR.z, 80, 2.4);
  }

  updateFired(dt) {
    this.npcs.update(dt, null);
    this.mehr.update(dt, 0);
    this.monitors.forEach((m) => m.update(dt, this.occ));
    this.fx.update(dt);
    this.ui.updateWorld(dt, this.npcs.list, this.monitors);
  }

  // ---------------------------------------------------------------- render / resize
  render(dt) {
    this.rig.update(dt, this.w, this.h);
    this.renderer.render(this.scene, this.rig.camera);
  }

  onResize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setSize(this.w, this.h, false);
    const landscapeShort = this.w > this.h && this.h < 500;
    const m = this.rig.margins;
    if (this.state === 'title') {
      // leave room for the title card
      const card = document.querySelector('.title-card');
      const ch = card ? card.getBoundingClientRect().height : 400;
      if (this.w > this.h) {
        m.top = 10;
        m.bottom = 10;
        m.left = Math.min(this.w * 0.5, 470);
        m.right = 10;
      } else {
        m.top = 10;
        m.bottom = Math.min(this.h * 0.62, ch + 30);
        m.left = m.right = 10;
      }
    } else {
      const bar = $('bar').getBoundingClientRect();
      m.top = landscapeShort ? 56 : 80;
      m.left = m.right = 0;
      m.bottom = bar.height ? this.h - bar.top + 4 : 80;
    }
  }

  trackPerf(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    if (DEBUG) $('fps').textContent = `${Math.round(1 / avg)} fps · pr ${this.pixelRatio} · npcs ${this.npcs.list.length}`;
    if (avg > 1 / 45 && this.pixelRatio > 1) {
      this.lowPerfT += dt;
      if (this.lowPerfT > 2) {
        this.lowPerfT = 0;
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.w, this.h, false);
        this.frameTimes = [];
      }
    } else this.lowPerfT = 0;
  }
}

window.game = new Game();
