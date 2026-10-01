import * as THREE from 'three';
import { GEO, rand, pick } from './util.js';

const MAX = 220;

/** Pooled little particles: smoke puffs, confetti, stink clouds, sparks. */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.live = [];
    for (let i = 0; i < MAX; i++) {
      const m = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      this.pool.push(m);
    }
  }

  get(kind, x, y, z, o) {
    const m = this.pool.pop();
    if (!m) return;
    m.visible = true;
    m.position.set(x, y, z);
    m.material.color.set(o.color);
    m.material.opacity = o.opacity ?? 1;
    m.geometry = kind === 'puff' ? GEO.sph : GEO.box;
    const s = o.size ?? 0.1;
    m.scale.set(s, kind === 'confetti' ? s * 0.3 : s, s);
    m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
    this.live.push({ m, kind, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0, life: o.life ?? 1, max: o.life ?? 1, grow: o.grow ?? 0, g: o.g ?? 0, spin: o.spin ?? 0, base: s, op: o.opacity ?? 1 });
  }

  smoke(x, z, color = '#888', n = 3, y = 1.0) {
    for (let i = 0; i < n; i++) {
      this.get('puff', x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2), { color, size: rand(0.15, 0.3), vx: rand(-0.15, 0.15), vy: rand(0.5, 0.9), vz: rand(-0.15, 0.15), life: rand(1.2, 2), grow: 0.5, opacity: 0.6 });
    }
  }
  fire(x, z, n = 3) {
    for (let i = 0; i < n; i++) {
      this.get('puff', x + rand(-0.25, 0.25), 1.0, z + rand(-0.2, 0.2), { color: pick(['#ff4d00', '#ffb020', '#ffd84d']), size: rand(0.12, 0.22), vy: rand(0.8, 1.4), life: rand(0.4, 0.8), grow: -0.1, opacity: 0.9 });
    }
  }
  confetti(x, z, n = 60, y = 1.8) {
    const cols = ['#ff4f79', '#ffd84d', '#5cf2c2', '#7b3fe4', '#4f8ef7', '#fff'];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2),
        sp = rand(0.5, 2.8);
      this.get('confetti', x, y, z, { color: pick(cols), size: 0.09, vx: Math.cos(a) * sp, vy: rand(2, 5), vz: Math.sin(a) * sp, life: rand(1.6, 2.6), g: -6, spin: rand(4, 10) });
    }
  }
  pop(x, y, z, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      this.get('confetti', x, y, z, { color, size: 0.07, vx: Math.cos(a) * 1.5, vy: rand(1, 2.5), vz: Math.sin(a) * 1.5, life: 0.6, g: -6, spin: 8 });
    }
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.m.visible = false;
        this.pool.push(p.m);
        this.live.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      if (p.kind === 'confetti') {
        p.vx *= 1 - dt * 1.5;
        p.vz *= 1 - dt * 1.5;
        if (p.vy < -1.2) p.vy = -1.2;
      }
      p.m.position.x += p.vx * dt;
      p.m.position.y = Math.max(0.02, p.m.position.y + p.vy * dt);
      p.m.position.z += p.vz * dt;
      if (p.spin) {
        p.m.rotation.x += p.spin * dt;
        p.m.rotation.z += p.spin * 0.7 * dt;
      }
      const s = p.base * (1 + p.grow * (p.max - p.life));
      if (p.kind !== 'confetti') p.m.scale.setScalar(Math.max(0.01, s));
      p.m.material.opacity = p.op * Math.min(1, p.life / (p.max * 0.4));
    }
  }

  clear() {
    for (const p of this.live) {
      p.m.visible = false;
      this.pool.push(p.m);
    }
    this.live = [];
  }
}
