// Tiny auto-playing games drawn onto 160x100 monitor canvases, plus the "work" screens that hide them.
import { rand, randi, pick } from './util.js';

export const SW = 160;
export const SH = 100;
const TOP = 13;

function titleBar(ctx, name, bg, fg = '#fff') {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SW, TOP);
  ctx.fillStyle = fg;
  ctx.font = 'bold 9px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 4, 7);
}

class Snake {
  static title = 'SNAKE.EXE';
  constructor() {
    this.cols = 20;
    this.rows = 10;
    this.body = [
      [5, 5],
      [4, 5],
      [3, 5],
    ];
    this.dir = [1, 0];
    this.food = [12, 4];
    this.acc = 0;
    this.score = 0;
  }
  step(dt) {
    this.acc += dt;
    while (this.acc > 0.09) {
      this.acc -= 0.09;
      const [hx, hy] = this.body[0];
      const [fx, fy] = this.food;
      const opts = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter(([dx, dy]) => !(dx === -this.dir[0] && dy === -this.dir[1]));
      opts.sort((a, b) => Math.abs(hx + a[0] - fx) + Math.abs(hy + a[1] - fy) - (Math.abs(hx + b[0] - fx) + Math.abs(hy + b[1] - fy)));
      const safe = opts.find(([dx, dy]) => {
        const nx = hx + dx,
          ny = hy + dy;
        return nx >= 0 && ny >= 0 && nx < this.cols && ny < this.rows && !this.body.some(([bx, by]) => bx === nx && by === ny);
      });
      if (!safe) return Object.assign(this, new Snake());
      this.dir = safe;
      const nh = [hx + safe[0], hy + safe[1]];
      this.body.unshift(nh);
      if (nh[0] === fx && nh[1] === fy) {
        this.score++;
        this.food = [randi(0, this.cols - 1), randi(0, this.rows - 1)];
        if (this.body.length > 40) Object.assign(this, new Snake());
      } else this.body.pop();
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#0b2b12';
    ctx.fillRect(0, 0, SW, SH);
    titleBar(ctx, `SNAKE.EXE   ${this.score}`, '#1c6b2c');
    const c = 8;
    ctx.fillStyle = '#ff4f79';
    ctx.fillRect(this.food[0] * c, TOP + 4 + this.food[1] * c, c - 1, c - 1);
    this.body.forEach(([x, y], i) => {
      ctx.fillStyle = i === 0 ? '#c8ff7a' : '#5cf28a';
      ctx.fillRect(x * c, TOP + 4 + y * c, c - 1, c - 1);
    });
  }
}

const PIECES = [
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
];
const PCOL = ['#ffd84d', '#4fe3ff', '#b06bff', '#ff8a4c', '#5cf28a'];
class Blocks {
  static title = 'BLOCKS';
  constructor() {
    this.cols = 10;
    this.rows = 10;
    this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(null));
    this.spawn();
    this.acc = 0;
    this.lines = 0;
  }
  spawn() {
    const k = randi(0, PIECES.length - 1);
    this.p = { cells: PIECES[k], col: PCOL[k], x: randi(0, 6), y: -1, tx: randi(0, 6) };
  }
  fits(x, y) {
    return this.p.cells.every(([cx, cy]) => {
      const gx = x + cx,
        gy = y + cy;
      return gx >= 0 && gx < this.cols && gy < this.rows && (gy < 0 || !this.grid[gy][gx]);
    });
  }
  step(dt) {
    this.acc += dt;
    while (this.acc > 0.12) {
      this.acc -= 0.12;
      const p = this.p;
      if (p.x !== p.tx && this.fits(p.x + Math.sign(p.tx - p.x), p.y)) p.x += Math.sign(p.tx - p.x);
      if (this.fits(p.x, p.y + 1)) p.y++;
      else {
        p.cells.forEach(([cx, cy]) => {
          if (p.y + cy >= 0) this.grid[p.y + cy][p.x + cx] = p.col;
        });
        if (p.y <= 0) return Object.assign(this, new Blocks());
        this.grid = this.grid.filter((r) => r.some((c) => !c));
        while (this.grid.length < this.rows) {
          this.grid.unshift(Array(this.cols).fill(null));
          this.lines++;
        }
        this.spawn();
      }
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#12122a';
    ctx.fillRect(0, 0, SW, SH);
    titleBar(ctx, `BLOCKS  LINES ${this.lines}`, '#4b2fa8');
    const c = 8,
      ox = 40,
      oy = TOP + 4;
    ctx.fillStyle = '#222248';
    ctx.fillRect(ox, oy, this.cols * c, this.rows * c);
    this.grid.forEach((row, y) =>
      row.forEach((col, x) => {
        if (col) {
          ctx.fillStyle = col;
          ctx.fillRect(ox + x * c, oy + y * c, c - 1, c - 1);
        }
      })
    );
    ctx.fillStyle = this.p.col;
    this.p.cells.forEach(([cx, cy]) => {
      if (this.p.y + cy >= 0) ctx.fillRect(ox + (this.p.x + cx) * c, oy + (this.p.y + cy) * c, c - 1, c - 1);
    });
  }
}

class Runner {
  static title = "NEPHEW'S DINO RUN";
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.obs = [180, 260];
    this.score = 0;
  }
  step(dt) {
    const speed = 90;
    this.score += dt * 10;
    this.obs = this.obs.map((o) => o - speed * dt);
    if (this.obs[0] < -10) {
      this.obs.shift();
      this.obs.push(this.obs[this.obs.length - 1] + rand(60, 120));
    }
    const next = this.obs.find((o) => o > 20);
    if (this.y === 0 && next !== undefined && next - 30 < 18) this.vy = 150;
    this.vy -= 480 * dt;
    this.y = Math.max(0, this.y + this.vy * dt);
    if (this.y === 0) this.vy = 0;
  }
  draw(ctx) {
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, SW, SH);
    titleBar(ctx, `DINO RUN (by nephew) ${Math.floor(this.score)}`, '#555');
    const gy = 84;
    ctx.fillStyle = '#555';
    ctx.fillRect(0, gy, SW, 2);
    ctx.fillStyle = '#444';
    const dy = gy - 14 - this.y;
    ctx.fillRect(24, dy, 10, 14);
    ctx.fillRect(30, dy - 6, 10, 8);
    ctx.fillStyle = '#fff';
    ctx.fillRect(36, dy - 4, 2, 2);
    ctx.fillStyle = '#2e8b57';
    this.obs.forEach((o) => {
      ctx.fillRect(o, gy - 14, 6, 14);
      ctx.fillRect(o - 3, gy - 10, 3, 5);
    });
  }
}

class Invaders {
  static title = 'DATA INVADERS';
  constructor() {
    this.ox = 10;
    this.dir = 1;
    this.alive = Array(24).fill(true);
    this.ship = 80;
    this.shots = [];
    this.t = 0;
  }
  step(dt) {
    this.t += dt;
    this.ox += this.dir * 20 * dt;
    if (this.ox > 50 || this.ox < 5) this.dir *= -1;
    const targets = this.alive.map((a, i) => (a ? this.ox + (i % 8) * 13 + 4 : null)).filter((v) => v !== null);
    if (!targets.length) return Object.assign(this, new Invaders());
    const tx = targets[Math.floor(this.t) % targets.length];
    this.ship += Math.sign(tx - this.ship) * Math.min(Math.abs(tx - this.ship), 70 * dt);
    if (Math.random() < dt * 5) this.shots.push([this.ship, 86]);
    this.shots.forEach((s) => (s[1] -= 140 * dt));
    this.shots = this.shots.filter((s) => {
      if (s[1] < TOP) return false;
      for (let i = 0; i < 24; i++) {
        if (!this.alive[i]) continue;
        const ax = this.ox + (i % 8) * 13,
          ay = TOP + 6 + Math.floor(i / 8) * 11;
        if (s[0] > ax && s[0] < ax + 9 && s[1] > ay && s[1] < ay + 7) {
          this.alive[i] = false;
          return false;
        }
      }
      return true;
    });
  }
  draw(ctx) {
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, SW, SH);
    titleBar(ctx, 'DATA INVADERS', '#b0006b');
    for (let i = 0; i < 24; i++) {
      if (!this.alive[i]) continue;
      const ax = this.ox + (i % 8) * 13,
        ay = TOP + 6 + Math.floor(i / 8) * 11;
      ctx.fillStyle = ['#5cf28a', '#ffd84d', '#ff6b93'][Math.floor(i / 8)];
      ctx.fillRect(ax, ay, 9, 6);
      ctx.fillRect(ax + (Math.floor(this.t * 4) % 2 ? 0 : 6), ay + 6, 3, 2);
    }
    ctx.fillStyle = '#4fe3ff';
    ctx.fillRect(this.ship - 6, 88, 12, 5);
    ctx.fillRect(this.ship - 1, 85, 2, 3);
    ctx.fillStyle = '#fff';
    this.shots.forEach(([x, y]) => ctx.fillRect(x - 1, y, 2, 5));
  }
}

class Pong {
  static title = 'PONG';
  constructor() {
    this.bx = 80;
    this.by = 55;
    this.vx = 90;
    this.vy = 50;
    this.l = 55;
    this.r = 55;
    this.s = [0, 0];
  }
  step(dt) {
    this.bx += this.vx * dt;
    this.by += this.vy * dt;
    if (this.by < TOP + 3 || this.by > SH - 3) this.vy *= -1;
    this.l += Math.sign(this.by - this.l) * Math.min(Math.abs(this.by - this.l), 60 * dt);
    this.r += Math.sign(this.by - this.r) * Math.min(Math.abs(this.by - this.r), 55 * dt);
    if (this.bx < 10 && Math.abs(this.by - this.l) < 11) this.vx = Math.abs(this.vx) * 1.03;
    if (this.bx > 150 && Math.abs(this.by - this.r) < 11) this.vx = -Math.abs(this.vx) * 1.03;
    if (this.bx < 0 || this.bx > SW) {
      this.s[this.bx < 0 ? 1 : 0]++;
      this.bx = 80;
      this.by = 55;
      this.vx = (Math.random() < 0.5 ? -1 : 1) * 90;
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, SW, SH);
    titleBar(ctx, `PONG   ${this.s[0]} : ${this.s[1]}`, '#333');
    ctx.fillStyle = '#fff';
    for (let y = TOP; y < SH; y += 8) ctx.fillRect(79, y, 2, 4);
    ctx.fillRect(4, this.l - 10, 4, 20);
    ctx.fillRect(152, this.r - 10, 4, 20);
    ctx.fillRect(this.bx - 2, this.by - 2, 4, 4);
  }
}

class Flappy {
  static title = 'FLAPPY INTERN';
  constructor() {
    this.y = 55;
    this.vy = 0;
    this.pipes = [
      [160, 50],
      [240, 60],
    ];
    this.score = 0;
  }
  step(dt) {
    this.pipes.forEach((p) => (p[0] -= 55 * dt));
    if (this.pipes[0][0] < -14) {
      this.pipes.shift();
      this.pipes.push([this.pipes[this.pipes.length - 1][0] + 80, rand(35, 80)]);
      this.score++;
    }
    const next = this.pipes.find((p) => p[0] > 20);
    this.vy += 260 * dt;
    if (this.y > next[1] + 6 && this.vy > 0) this.vy = -90;
    this.y += this.vy * dt;
  }
  draw(ctx) {
    ctx.fillStyle = '#6fd3ff';
    ctx.fillRect(0, 0, SW, SH);
    titleBar(ctx, `FLAPPY INTERN  ${this.score}`, '#e2574c');
    ctx.fillStyle = '#3fae3f';
    this.pipes.forEach(([x, gy]) => {
      ctx.fillRect(x, TOP, 14, gy - 16 - TOP);
      ctx.fillRect(x, gy + 16, 14, SH - gy);
    });
    ctx.fillStyle = '#1f2748';
    ctx.fillRect(30, this.y - 5, 10, 10); // tiny turban
    ctx.fillStyle = '#a4694a';
    ctx.fillRect(30, this.y, 10, 6);
    ctx.fillStyle = '#1c1512';
    ctx.fillRect(31, this.y + 3, 8, 4);
  }
}

class Racer {
  static title = 'TURBO COMMUTE';
  constructor() {
    this.lane = 1;
    this.cars = [];
    this.t = 0;
    this.off = 0;
  }
  step(dt) {
    this.t += dt;
    this.off = (this.off + dt * 120) % 20;
    if (Math.random() < dt * 1.8) this.cars.push({ lane: randi(0, 2), y: TOP - 14, c: pick(['#ff4f79', '#ffd84d', '#4fe3ff']) });
    this.cars.forEach((c) => (c.y += 80 * dt));
    this.cars = this.cars.filter((c) => c.y < SH + 10);
    const danger = this.cars.find((c) => c.lane === this.lane && c.y > 40 && c.y < 90);
    if (danger) this.lane = [0, 1, 2].find((l) => !this.cars.some((c) => c.lane === l && c.y > 35 && c.y < 95)) ?? this.lane;
  }
  draw(ctx) {
    ctx.fillStyle = '#3b8a3b';
    ctx.fillRect(0, 0, SW, SH);
    ctx.fillStyle = '#444';
    ctx.fillRect(40, TOP, 80, SH);
    ctx.fillStyle = '#fff';
    for (let y = TOP - 20 + this.off; y < SH; y += 20) {
      ctx.fillRect(66, y, 2, 10);
      ctx.fillRect(92, y, 2, 10);
    }
    this.cars.forEach((c) => {
      ctx.fillStyle = c.c;
      ctx.fillRect(46 + c.lane * 26, c.y, 16, 12);
    });
    ctx.fillStyle = '#7b3fe4';
    ctx.fillRect(46 + this.lane * 26, 80, 16, 14);
    titleBar(ctx, 'TURBO COMMUTE', '#1f2748');
  }
}

export const GAMES = [Snake, Blocks, Runner, Invaders, Pong, Flappy, Racer];
export function newGame(exclude) {
  let G;
  do G = pick(GAMES);
  while (G === exclude && GAMES.length > 1);
  return new G();
}

// ---------------------------------------------------------------- work screens
const SHEETS = ['Q3_pipeline_FINAL_v7.xlsx', 'portfolio_kpis.xlsx', 'LP_update_DRAFT.xlsx', 'churn_model_v12.xlsx', 'headcount_plan.xlsx'];
const QUERIES = [
  ['SELECT company, arr, growth', 'FROM portfolio.metrics', "WHERE sector = 'tech'", 'ORDER BY arr DESC;'],
  ['WITH cohort AS (', '  SELECT * FROM deals', '  WHERE stage > 3)', 'SELECT COUNT(*) FROM cohort;'],
  ['UPDATE interns', 'SET productivity = 100', "WHERE name = 'Mehr';", '-- 1 row affected'],
];

export class WorkScreen {
  constructor() {
    this.kind = pick(['excel', 'excel', 'sql', 'dash']);
    this.file = pick(SHEETS);
    this.q = pick(QUERIES);
    this.t = 0;
    this.nums = Array.from({ length: 40 }, () => randi(100, 99999));
  }
  step(dt) {
    this.t += dt;
    if (Math.random() < dt * 3) this.nums[randi(0, 39)] = randi(100, 99999);
  }
  draw(ctx) {
    if (this.kind === 'excel') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, SW, SH);
      titleBar(ctx, this.file, '#1d6f42');
      ctx.fillStyle = '#eef3ee';
      ctx.fillRect(0, TOP, SW, 9);
      ctx.fillRect(0, TOP, 12, SH);
      ctx.strokeStyle = '#d4dcd4';
      ctx.lineWidth = 1;
      for (let x = 12; x < SW; x += 37) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, TOP);
        ctx.lineTo(x + 0.5, SH);
        ctx.stroke();
      }
      ctx.font = '7px monospace';
      ctx.fillStyle = '#333';
      ctx.textBaseline = 'top';
      for (let r = 0; r < 8; r++) {
        ctx.beginPath();
        ctx.moveTo(0, TOP + 9 + r * 10 + 0.5);
        ctx.lineTo(SW, TOP + 9 + r * 10 + 0.5);
        ctx.stroke();
        ctx.fillText(String(r + 1), 2, TOP + 11 + r * 10);
        for (let c = 0; c < 4; c++) ctx.fillText(this.nums[(r * 4 + c) % 40].toLocaleString(), 15 + c * 37, TOP + 11 + r * 10);
      }
      const sel = Math.floor(this.t * 1.5) % 32;
      ctx.strokeStyle = '#1d6f42';
      ctx.lineWidth = 2;
      ctx.strokeRect(13 + (sel % 4) * 37, TOP + 9 + Math.floor(sel / 4) * 10, 36, 10);
    } else if (this.kind === 'sql') {
      ctx.fillStyle = '#1e1e2a';
      ctx.fillRect(0, 0, SW, SH);
      titleBar(ctx, 'query.sql — DataGrip', '#3b3b55');
      ctx.font = '8px monospace';
      ctx.textBaseline = 'top';
      this.q.forEach((line, i) => {
        ctx.fillStyle = i === 0 ? '#ff79c6' : '#8be9fd';
        ctx.fillText(line, 5, TOP + 6 + i * 11);
      });
      if (Math.floor(this.t * 2) % 2) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(5, TOP + 6 + this.q.length * 11, 5, 8);
      }
      ctx.fillStyle = '#5cf28a';
      ctx.fillText(`✓ ${this.nums[0]} rows in 0.${this.nums[1] % 99}s`, 5, SH - 14);
    } else {
      ctx.fillStyle = '#f4f6fb';
      ctx.fillRect(0, 0, SW, SH);
      titleBar(ctx, 'Portfolio Dashboard', '#2c3e70');
      for (let i = 0; i < 8; i++) {
        const h = 10 + ((this.nums[i] + this.t * 400 * (i % 3)) % 50);
        ctx.fillStyle = i % 2 ? '#5aa9ff' : '#2c3e70';
        ctx.fillRect(10 + i * 12, SH - 8 - h, 9, h);
      }
      ctx.strokeStyle = '#27c07d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) ctx.lineTo(112 + i * 6, SH - 20 - i * 6 - Math.sin(this.t + i) * 3);
      ctx.stroke();
      ctx.fillStyle = '#2c3e70';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('+12.4%', 115, TOP + 12);
    }
  }
}
