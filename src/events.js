import { rand, pick, chance, weighted, shuffle } from './util.js';
import { MEHR, W } from './office.js';
import * as L from './lines.js';

// [name, weight, first quarter it can happen]
const POOL = [
  ['copier', 1, 1],
  ['cooler', 1, 1],
  ['meeting', 1, 1],
  ['zoom', 1, 1],
  ['janitor', 0.7, 1],
  ['dog', 0.8, 1],
  ['roomba', 0.6, 1],
  ['fish', 0.5, 1],
  ['boss', 1.3, 2],
  ['pizza', 0.8, 2],
  ['replyAll', 0.7, 2],
  ['ladder', 0.9, 2],
  ['pigeon', 0.6, 2],
  ['market', 0.6, 2],
  ['interns', 0.7, 2],
  ['nerf', 0.6, 2],
  ['fire', 0.5, 3],
  ['it', 0.8, 3],
  ['allHands', 0.5, 3],
  ['reorg', 0.45, 3],
];

export class Events {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.nextT = 9;
    this.active = [];
    this.recent = [];
    this.bdayDone = false;
    this.reorgs = 0;
  }

  update(dt) {
    const g = this.game;
    for (const e of this.active) {
      e.t += dt;
      if (e.update && e.update(dt, e) === false) e.done = true;
      if (e.dur && e.t > e.dur) e.done = true;
      if (e.done && e.end) e.end(e);
    }
    this.active = this.active.filter((e) => !e.done);

    if (!this.bdayDone && g.time > 135 && !this.active.some((e) => e.big)) {
      this.bdayDone = true;
      this.start('birthday');
      return;
    }
    this.nextT -= dt;
    if (this.nextT <= 0) {
      this.nextT = Math.max(6, rand(10, 17) - g.quarter * 0.8);
      const opts = POOL.filter(([n, , q]) => q <= g.quarter && !this.recent.includes(n) && !this.active.some((e) => e.name === n));
      if (!opts.length) return;
      let name = weighted(opts.map(([n, w]) => [n, w]));
      if (name === 'reorg' && this.reorgs >= 2) name = 'copier';
      if (this.active.some((e) => e.big) && ['fire', 'reorg', 'pizza', 'allHands', 'replyAll'].includes(name)) name = 'zoom';
      this.start(name);
    }
  }

  start(name) {
    const e = this[name]();
    if (!e) return;
    e.name = name;
    e.t = 0;
    this.active.push(e);
    this.recent.push(name);
    if (this.recent.length > 5) this.recent.shift();
    this.game.audio.event();
  }

  // ---------------------------------------------------------------- helpers
  get npcs() {
    return this.game.npcs;
  }
  get spots() {
    return this.game.office.spots;
  }
  tick(msg, alert) {
    this.game.ticker(msg, alert);
  }
  /** Existing regular people, plus fresh spawns if needed. */
  recruit(n) {
    const pool = shuffle(this.npcs.humans().filter((p) => !p.special && !p.leaving && !p.hiddenT && ['coworker', 'intern', 'speedy'].includes(p.type)));
    const out = pool.slice(0, n);
    while (out.length < n) out.push(this.npcs.spawn(pick(['coworker', 'coworker', 'intern']), { noGoal: true }));
    for (const p of out) p.plan = [];
    return out;
  }
  sendTo(p, spot, idle, extra = {}) {
    if (!spot) return;
    p.plan = [{ spot, idle, ...extra }];
    this.npcs.nextGoal(p);
  }
  pointsNear(c, rmin, rmax, n) {
    const o = this.game.office;
    const pts = [];
    for (let k = 0; k < 60 && pts.length < n; k++) {
      const a = rand(0, Math.PI * 2),
        r = rand(rmin, rmax);
      const x = c.x + Math.sin(a) * r,
        z = c.z + Math.cos(a) * r;
      if (o.isReachable(x, z) && !o.grid[o.cellOf(x, z)]) pts.push({ x, z, face: Math.atan2(c.x - x, c.z - z), occ: null });
    }
    return pts;
  }

  // ---------------------------------------------------------------- events
  copier() {
    this.tick('📠 The copier is jammed. Again.');
    const pos = this.spots.copierPos;
    const crew = this.recruit(3);
    this.spots.copier.forEach((s) => (s.occ = null));
    crew.forEach((p, i) => this.sendTo(p, this.spots.copier[i % this.spots.copier.length], [9, 13], { say: i === 0 ? 'Not again…' : undefined }));
    return {
      dur: 15,
      update: (dt, e) => {
        if (Math.random() < dt * 6) this.game.fx.smoke(pos.x, pos.z, '#777', 1);
        if (e.t > 8 && !e.fire && chance(0.35)) {
          e.fire = true;
          this.tick('🔥 …and now the printer is on fire.', true);
        }
        if (e.fire && Math.random() < dt * 12) this.game.fx.fire(pos.x, pos.z, 1);
      },
    };
  }

  cooler() {
    this.tick('💧 Water cooler gossip session in progress.');
    const crew = this.recruit(3);
    this.spots.cooler.forEach((s) => (s.occ = null));
    crew.forEach((p, i) => {
      this.sendTo(p, this.spots.cooler[i % this.spots.cooler.length], [10, 14]);
      p.chatT = rand(1, 4);
    });
    return { dur: 14 };
  }

  meeting() {
    this.tick('📊 Meeting in the glass boardroom. Very transparent.');
    this.game.office.drawTV(pick(['Q3 SYNERGY', 'LP UPDATE', 'OFFSITE PLAN', 'DATA STRATEGY', 'PIZZA BUDGET']));
    const crew = this.recruit(4);
    const seats = shuffle(this.spots.board.slice());
    seats.forEach((s) => (s.occ = null));
    crew.forEach((p, i) => {
      this.sendTo(p, seats[i % seats.length], [16, 22]);
      p.chatT = rand(2, 6);
    });
    return { dur: 22 };
  }

  pizza() {
    this.tick('🍕 FREE PIZZA in the kitchen! Stampede!');
    const c = this.spots.kitchenCenter;
    const pts = this.spots.kitchen.concat(this.pointsNear(c, 1.2, 2.2, 8));
    pts.forEach((s) => (s.occ = null));
    this.npcs.forcedGoal = () => pick(pts);
    for (const p of this.npcs.humans()) {
      if (p.special || p.leaving) continue;
      p.plan = [];
      p.say(pick(L.PIZZA), 2);
      this.npcs.nextGoal(p);
      p.speedMul = Math.max(p.speedMul, 1.4);
    }
    return {
      dur: 13,
      end: () => {
        this.npcs.forcedGoal = null;
        for (const p of this.npcs.humans()) p.speedMul = Math.min(p.speedMul, 1.12);
      },
    };
  }

  fire() {
    this.tick('🚨 FIRE DRILL! Everybody out! (Free gaming time?)', true);
    document.body.classList.add('alarm');
    this.game.audio.alarm();
    this.npcs.spawnPause = 11;
    for (const p of this.npcs.humans()) {
      if (p.special) continue;
      p.say(pick(L.FIRE), 2);
      p.speedMul = 1.7;
      this.npcs.leave(p);
    }
    return {
      dur: 11,
      update: (dt, e) => {
        if (Math.floor(e.t * 2) !== Math.floor((e.t - dt) * 2) && e.t < 9) this.game.audio.alarmBeep();
      },
      end: () => {
        document.body.classList.remove('alarm');
        this.tick("✅ Drill's over. Everyone's shuffling back in…");
        this.npcs.spawnT = 0;
      },
    };
  }

  replyAll() {
    this.tick('📧 Reply-All storm! Everyone is staring at their phone.');
    for (const p of this.npcs.humans()) {
      if (p.special) continue;
      p.phoneT = rand(5, 7);
      if (chance(0.6)) p.say(pick(L.REPLYALL), 2.5);
    }
    return { dur: 7 };
  }

  boss() {
    if (this.npcs.count('boss')) return this.zoom();
    this.tick('👔 The Boss is walking the floor… look busy!', true);
    const ring = shuffle(this.spots.ring.slice()).slice(0, 3);
    const wander = pick(this.spots.wander);
    const plan = [{ spot: wander, idle: [1, 2] }, ...ring.map((s) => ({ spot: { ...s, occ: null }, idle: [1.5, 3] })), { exit: true }];
    const b = this.npcs.spawn('boss', { plan, special: true });
    b.say(pick(L.BOSS), 3);
    return { dur: 5 };
  }

  zoom() {
    const z = this.npcs.spawn('zoom', { special: true });
    this.tick(`💻 ${z.name} is on a Zoom call. While walking. Loudly.`);
    z.say("You're on mute!", 3);
    z.chatT = 3;
    return { dur: 4 };
  }

  ladder() {
    this.tick('🪜 Maintenance is fixing a light. He can see over the cubicles up there!', true);
    const pts = this.pointsNear(MEHR, 3.5, 7, 6);
    const spot = pts[0] || pick(this.spots.wander);
    this.npcs.spawn('ladder', { special: true, plan: [{ spot, idle: [8, 10], ladder: true }, { exit: true }] });
    return { dur: 4 };
  }

  janitor() {
    this.tick('🧹 Janitor on duty. Watch out for wet floors.');
    this.npcs.spawn('janitor', { special: true });
    return { dur: 4 };
  }

  dog() {
    this.tick('🐕 Somebody brought their dog to work!!');
    const dog = this.npcs.spawn('dog', { life: 32 });
    return {
      dur: 36,
      update: (dt) => {
        if (dog.dead) return false;
        for (const p of this.npcs.humans()) {
          if (p.special || p.distractT > 0 || p.petCooldown > 0) {
            if (p.petCooldown > 0) p.petCooldown -= dt;
            if (p.distractT <= 0 && p.lookAt === dog) p.lookAt = null;
            continue;
          }
          if (Math.hypot(p.x - dog.x, p.z - dog.z) < 1.8) {
            p.distractT = 2.5;
            p.petCooldown = 8;
            p.lookAt = dog;
            p.say(pick(L.DOG), 2);
          }
        }
      },
      end: () => this.npcs.humans().forEach((p) => p.lookAt === dog && (p.lookAt = null)),
    };
  }

  roomba() {
    this.tick('🤖 The Roomba is back. There is a cat on it.');
    this.npcs.spawn('roomba', { life: 35 });
    return { dur: 3 };
  }

  pigeon() {
    this.tick('🐦 A pigeon got in. Nobody knows how. Everyone is looking at it.', true);
    const pg = this.npcs.spawn('pigeon', { at: { x: rand(2, W - 2), z: 0.5, face: 0 }, life: 16 });
    return {
      dur: 22,
      update: () => {
        if (pg.dead) return false;
        for (const p of this.npcs.humans()) {
          if (p.special) continue;
          const d = Math.hypot(p.x - pg.x, p.z - pg.z);
          if (d < 4.5) {
            if (p.lookAt !== pg && chance(0.3)) p.say(pick(L.PIGEON), 2);
            p.lookAt = pg;
          } else if (p.lookAt === pg) p.lookAt = null;
        }
      },
      end: () => this.npcs.humans().forEach((p) => p.lookAt === pg && (p.lookAt = null)),
    };
  }

  it() {
    this.tick("🖥️ IT is doing a 'network audit'. They can see through walls!", true);
    const desks = this.spots.desks
      .slice()
      .sort((a, b) => Math.hypot(a.x - MEHR.x, a.z - MEHR.z) - Math.hypot(b.x - MEHR.x, b.z - MEHR.z))
      .slice(0, 6);
    const plan = shuffle(desks)
      .slice(0, 3)
      .map((d) => ({ spot: { x: d.x, z: d.z, face: d.face, occ: null }, idle: [2, 3] }));
    plan.push({ exit: true });
    this.npcs.spawn('it', { special: true, plan });
    return { dur: 4 };
  }

  market() {
    this.tick("🔔 Market's open! Everyone's power-walking.");
    this.game.eventSpeed = 1.6;
    return { dur: 10, end: () => (this.game.eventSpeed = 1) };
  }

  fish() {
    this.tick('🐟 Someone microwaved fish. The kitchen has been evacuated.');
    const mw = this.spots.microwave;
    for (const p of this.npcs.humans()) {
      if (p.target?.kind === 'kitchen' || Math.hypot(p.x - mw.x, p.z - mw.z) < 4) {
        p.say(pick(L.FISH), 2.5);
        p.plan = [];
        p.speedMul = 1.5;
        this.npcs.nextGoal(p);
      }
    }
    return {
      dur: 12,
      update: (dt) => {
        if (Math.random() < dt * 5) this.game.fx.smoke(mw.x + rand(-1, 1), mw.z + rand(0.5, 2.5), '#9bd35a', 1, 0.5);
      },
    };
  }

  allHands() {
    this.tick('📣 Surprise all-hands in the boardroom! Everybody in!');
    const c = this.spots.boardCenter;
    const pts = this.spots.board.concat(this.pointsNear(c, 1.3, 2.6, 10));
    pts.forEach((s) => (s.occ = null));
    this.npcs.forcedGoal = () => pick(pts);
    for (const p of this.npcs.humans()) {
      if (p.special || p.leaving) continue;
      p.plan = [];
      this.npcs.nextGoal(p);
    }
    return { dur: 14, end: () => (this.npcs.forcedGoal = null) };
  }

  interns() {
    this.tick('🎒 The new intern class is touring the office. They want to meet Mehr!');
    const ring = shuffle(this.spots.ring.slice());
    const hang = pick(this.spots.hang.length ? this.spots.hang : this.spots.wander);
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!this.game.playing) return;
        const r = ring[i % ring.length];
        this.npcs.spawn('intern', {
          special: true,
          at: this.spots.exits[0],
          plan: [
            { spot: { x: hang.x, z: hang.z, occ: null }, idle: [0.5, 1] },
            { spot: { ...r, occ: null }, idle: [2, 3], say: pick(["That's Mehr!", 'Legend.', 'Hi Mehr!!', 'Can I shadow you?']) },
            { exit: true },
          ],
        });
      }, i * 700);
    }
    return { dur: 5 };
  }

  nerf() {
    this.tick('🔫 Nerf war in the east wing!');
    for (let i = 0; i < 2; i++) {
      const target = pick(this.spots.wander);
      const p = this.npcs.spawn('speedy', { special: true, speedMul: 1.4, plan: [{ spot: { ...target, occ: null }, idle: [0.2, 0.5] }, { exit: true }] });
      p.say(i ? 'PEW PEW PEW' : "You'll never take me alive!", 2.5);
    }
    return { dur: 4 };
  }

  reorg() {
    this.reorgs++;
    this.tick('📋 REORG! Facilities is moving all the cubicles!', true);
    this.game.startReorg();
    return { dur: 3 };
  }

  birthday() {
    const g = this.game;
    this.tick('🎂 Uh oh… is someone bringing out a CAKE?! Hide those games!', true);
    g.banner('🎂 CAKE INCOMING 🎂', 'Everyone is coming to your desk — hide the games!');
    const ring = this.spots.ring;
    const picks = [];
    const n = Math.min(4, ring.length);
    for (let i = 0; i < n; i++) picks.push(ring[Math.floor((i * ring.length) / n)]);
    const crew = [];
    picks.forEach((r, i) => {
      const spot = { x: r.x, z: r.z, face: Math.atan2(MEHR.x - r.x, MEHR.z - r.z), occ: null };
      const p = this.npcs.spawn('cake', {
        special: true,
        at: this.spots.exits[i % this.spots.exits.length],
        dressAs: i === 0 ? 'cake' : 'party',
        plan: [{ spot, idle: [999, 999], onArrive: (q) => (q.arrived = true) }],
      });
      p.say(i === 0 ? '🎂 Surprise!!' : 'Shhh… be quiet!', 3);
      crew.push(p);
    });
    const strikesAtStart = g.strikes;
    return {
      big: true,
      update: (dt, e) => {
        const alive = crew.filter((p) => !p.dead);
        if (!alive.length) return false;
        if (!e.singing && (alive.every((p) => p.arrived) || e.t > 26)) {
          e.singing = true;
          e.singT = 0;
          g.audio.birthday();
          alive.forEach((p) => {
            p.fovOverride = 200;
            p.faceDir = Math.atan2(MEHR.x - p.x, MEHR.z - p.z);
          });
        }
        if (e.singing) {
          e.singT += dt;
          alive.forEach((p, i) => {
            if (!p.bubble) p.say(L.SING[(Math.floor(e.singT / 1.8) + i) % L.SING.length], 1.7, 'sing');
          });
          if (Math.random() < dt * 3) g.fx.confetti(MEHR.x + rand(-1.5, 1.5), MEHR.z + rand(-1.5, 1.5), 8, 2.2);
          if (e.singT > 8) {
            const clean = g.strikes === strikesAtStart;
            if (clean) {
              g.addScore(2000, '🎂 BIRTHDAY BONUS +2000', true);
              g.fx.confetti(MEHR.x, MEHR.z, 120, 2.5);
              g.mehr.setMood('cheer', 3);
              this.tick('🎉 Happy Birthday Mehr! Nobody suspected a thing. +2000');
            } else this.tick('🎂 Happy Birthday anyway, Mehr. (They saw everything.)');
            alive.forEach((p) => {
              p.fovOverride = null;
              p.say(pick(['Happy birthday!!', 'Enjoy the cake!', '🎉🎉🎉', 'Back to work!']), 2.5);
              this.npcs.leave(p);
            });
            return false;
          }
        }
      },
    };
  }
}
