import { COLS, ROWS, CELL } from './office.js';

let N = 0;
let gScore, fScore, parent, state, heap;
let heapSize = 0;
function ensure() {
  if (N === COLS * ROWS) return;
  N = COLS * ROWS;
  gScore = new Float32Array(N);
  fScore = new Float32Array(N);
  parent = new Int32Array(N);
  state = new Uint8Array(N); // 0 none, 1 open, 2 closed
  heap = new Int32Array(N * 4);
}

function push(i) {
  let k = heapSize++;
  heap[k] = i;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (fScore[heap[p]] <= fScore[heap[k]]) break;
    const t = heap[p];
    heap[p] = heap[k];
    heap[k] = t;
    k = p;
  }
}
function pop() {
  const top = heap[0];
  heap[0] = heap[--heapSize];
  let k = 0;
  for (;;) {
    const l = 2 * k + 1,
      r = l + 1;
    let m = k;
    if (l < heapSize && fScore[heap[l]] < fScore[heap[m]]) m = l;
    if (r < heapSize && fScore[heap[r]] < fScore[heap[m]]) m = r;
    if (m === k) break;
    const t = heap[m];
    heap[m] = heap[k];
    heap[k] = t;
    k = m;
  }
  return top;
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

const cx = (i) => ((i % COLS) + 0.5) * CELL;
const cz = (i) => (((i / COLS) | 0) + 0.5) * CELL;

/** A* over the office grid. Returns [{x,z}...] ending at the exact target, or null. */
export function findPath(office, sx, sz, tx, tz) {
  ensure();
  const grid = office.grid;
  let s = office.cellOf(sx, sz);
  if (grid[s]) s = office.nearestFreeCell(sx, sz);
  const t = office.nearestFreeCell(tx, tz, true);
  if (s < 0 || t < 0) return null;
  if (s === t) return [{ x: tx, z: tz }];

  state.fill(0);
  heapSize = 0;
  const tc = t % COLS,
    tr = (t / COLS) | 0;
  gScore[s] = 0;
  fScore[s] = 0;
  parent[s] = -1;
  state[s] = 1;
  push(s);
  let found = false;
  let guard = 0;
  while (heapSize > 0 && guard++ < N * 2) {
    const cur = pop();
    if (state[cur] === 2) continue;
    if (cur === t) {
      found = true;
      break;
    }
    state[cur] = 2;
    const c = cur % COLS,
      r = (cur / COLS) | 0;
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc,
        nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (grid[j] || state[j] === 2) continue;
      if (dc && dr && (grid[r * COLS + nc] || grid[nr * COLS + c])) continue; // no corner cutting
      const g = gScore[cur] + cost;
      if (state[j] === 1 && g >= gScore[j]) continue;
      gScore[j] = g;
      const hx = Math.abs(nc - tc),
        hz = Math.abs(nr - tr);
      fScore[j] = g + (hx + hz) + (Math.SQRT2 - 2) * Math.min(hx, hz);
      parent[j] = cur;
      state[j] = 1;
      push(j);
    }
  }
  if (!found) return null;

  const cells = [];
  for (let i = t; i !== -1; i = parent[i]) cells.push(i);
  cells.reverse();

  // string-pull: keep only cells needed for line of sight
  const pts = [];
  let anchorX = sx,
    anchorZ = sz;
  let k = 0;
  while (k < cells.length - 1) {
    let far = k + 1;
    for (let m = cells.length - 1; m > k + 1; m--) {
      if (clearLine(grid, anchorX, anchorZ, cx(cells[m]), cz(cells[m]))) {
        far = m;
        break;
      }
    }
    pts.push({ x: cx(cells[far]), z: cz(cells[far]) });
    anchorX = cx(cells[far]);
    anchorZ = cz(cells[far]);
    k = far;
  }
  // finish at the exact target when it's close to the last cell
  const last = pts[pts.length - 1];
  if (last && Math.hypot(last.x - tx, last.z - tz) < 0.9) {
    last.x = tx;
    last.z = tz;
  }
  return pts;
}

function clearLine(grid, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(d / 0.2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t,
      z = az + (bz - az) * t;
    // sample a little to each side so paths don't graze walls
    for (const [ox, oz] of [
      [0, 0],
      [0.14, 0],
      [-0.14, 0],
      [0, 0.14],
      [0, -0.14],
    ]) {
      const c = Math.floor((x + ox) / CELL),
        r = Math.floor((z + oz) / CELL);
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS || grid[r * COLS + c]) return false;
    }
  }
  return true;
}
