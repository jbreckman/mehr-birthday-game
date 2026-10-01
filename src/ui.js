import * as THREE from 'three';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.world = $('world');
    this.npcEls = new Map();
    this.monLabels = [];
    this.pops = [];
    this.tickerTimer = 0;
    this.bannerTimer = 0;
    this.lastScoreText = '';
  }

  project(x, y, z) {
    const g = this.game;
    _v.set(x, y, z).project(g.rig.camera);
    return { x: ((_v.x + 1) / 2) * g.w, y: ((1 - _v.y) / 2) * g.h };
  }

  show(id, on = true) {
    $(id).classList.toggle('hidden', !on);
  }

  setScore(score, label, hot) {
    const t = Math.round(score).toLocaleString();
    if (t !== this.lastScoreText) {
      $('score').textContent = t;
      this.lastScoreText = t;
    }
    const mt = label;
    if ($('mult').textContent !== mt) $('mult').textContent = mt;
    $('mult').classList.toggle('hot', hot);
  }
  setStrikes(strikes) {
    let h = '';
    for (let i = 0; i < 3; i++) h += i < 3 - strikes ? '<span>💼</span>' : '<span class="used">💼</span>';
    $('strikes').innerHTML = h;
  }
  setClock(q, clock) {
    const qt = `Q${q}`;
    if ($('quarter').textContent !== qt) $('quarter').textContent = qt;
    if ($('clock').textContent !== clock) $('clock').textContent = clock;
  }

  ticker(msg, alert = false) {
    const t = $('ticker');
    $('tickerText').textContent = msg;
    t.classList.toggle('alert', alert);
    t.classList.remove('hidden', 'fade');
    this.tickerTimer = 5;
  }

  banner(title, sub = '', dur = 2.2) {
    const b = $('banner');
    b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    b.classList.add('show');
    this.bannerTimer = dur;
  }

  flash(red = false) {
    const f = $('flash');
    f.classList.toggle('red', red);
    f.animate([{ opacity: red ? 0.45 : 0.7 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
  }

  setDistract(d) {
    $('dCount').textContent = d.charges;
    $('distract').classList.toggle('armed', d.armed);
    $('distract').classList.toggle('empty', d.charges <= 0);
  }

  // ---------------------------------------------------------------- world overlays
  pop(text, x, y, z, big = false, neg = false) {
    const el = document.createElement('div');
    el.className = `wo pop${big ? ' big' : ''}${neg ? ' neg' : ''}`;
    el.textContent = text;
    this.world.appendChild(el);
    this.pops.push({ el, x, y, z, t: 0, dur: big ? 2.2 : 1.1 });
  }

  clearWorld() {
    for (const [, e] of this.npcEls) {
      e.b.remove();
      e.s.remove();
    }
    this.npcEls.clear();
    this.pops.forEach((p) => p.el.remove());
    this.pops = [];
  }

  updateWorld(dt, npcs, monitors) {
    const g = this.game;
    const seen = new Set();
    for (const n of npcs) {
      if (n.dead) continue;
      seen.add(n.id);
      let e = this.npcEls.get(n.id);
      if (!e) {
        const b = document.createElement('div');
        b.className = 'wo bubble';
        b.style.display = 'none';
        const s = document.createElement('div');
        s.className = 'wo sus';
        s.innerHTML = '<span>?</span>';
        s.style.display = 'none';
        this.world.append(b, s);
        e = { b, s, text: '', cls: '', susShown: false, bShown: false, hot: false };
        this.npcEls.set(n.id, e);
      }
      const hidden = n.hiddenT > 0;
      const headY = n.y + (n.type === 'boss' ? 1.95 : n.type === 'dog' || n.type === 'roomba' ? 0.8 : 1.85);
      const p = this.project(n.x, headY, n.z);
      const off = p.x < 0 || p.x > g.w || p.y < 0 || p.y > g.h;
      const showSus = !hidden && (n.sus > 0.03 || (off && n.canSee && n.seesThings));
      const edgeTop = 96,
        edgeBot = 80;
      if (off) {
        p.x = Math.min(g.w - 22, Math.max(22, p.x));
        p.y = Math.min(g.h - edgeBot, Math.max(edgeTop + 30, p.y));
      }
      if (off !== e.off) {
        e.off = off;
        e.s.classList.toggle('edge', off);
      }
      if (showSus !== e.susShown) {
        e.susShown = showSus;
        e.s.style.display = showSus ? '' : 'none';
      }
      if (showSus) {
        e.s.style.transform = `translate(${p.x}px, ${p.y}px)`;
        e.s.style.setProperty('--p', n.sus.toFixed(3));
        const hot = n.sus > 0.6;
        if (e.off !== e.offShown) {
          e.offShown = e.off;
          e.hot = null;
        }
        if (hot !== e.hot) {
          e.hot = hot;
          e.s.classList.toggle('hot', hot);
          e.s.firstChild.textContent = hot ? '!' : e.off ? '👀' : '?';
        }
      }
      const showB = !hidden && !!n.bubble;
      if (showB !== e.bShown) {
        e.bShown = showB;
        e.b.style.display = showB ? '' : 'none';
      }
      if (showB) {
        if (e.text !== n.bubble.text) {
          e.text = n.bubble.text;
          e.b.textContent = e.text;
        }
        if (e.cls !== n.bubble.cls) {
          e.b.className = `wo bubble ${n.bubble.cls}`;
          e.cls = n.bubble.cls;
        }
        e.b.style.transform = `translate(${p.x}px, ${p.y - (showSus ? 34 : 4)}px)`;
      }
    }
    for (const [id, e] of this.npcEls) {
      if (!seen.has(id)) {
        e.b.remove();
        e.s.remove();
        this.npcEls.delete(id);
      }
    }
    for (const p of this.pops) {
      p.t += dt;
      const q = this.project(p.x, p.y + p.t * 0.9, p.z);
      p.el.style.transform = `translate(${q.x}px, ${q.y}px)`;
      p.el.style.opacity = String(Math.min(1, 2 * (1 - p.t / p.dur)));
      if (p.t >= p.dur) p.el.remove();
    }
    this.pops = this.pops.filter((p) => p.t < p.dur);

    if (this.tickerTimer > 0) {
      this.tickerTimer -= dt;
      if (this.tickerTimer <= 0) $('ticker').classList.add('fade');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('banner').classList.remove('show');
    }
  }
}
