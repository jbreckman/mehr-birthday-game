import * as THREE from 'three';

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** Heading angle for a direction on the floor. Forward of an object with rotation.y = a is (sin a, cos a). */
export const headingTo = (dx, dz) => Math.atan2(dx, dz);

export function weighted(entries) {
  let total = 0;
  for (const e of entries) total += e[1];
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e[1];
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- shared geometry / materials ----------
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
  sph: new THREE.SphereGeometry(0.5, 14, 10),
};

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  let m = matCache.get(key);
  if (!m) {
    m = opts.basic
      ? new THREE.MeshBasicMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 })
      : new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
    if (opts.opacity) m.depthWrite = false;
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    matCache.set(key, m);
  }
  return m;
}

/** Quick mesh helper: kind is box/cyl/sph, y is the bottom of the shape. */
export function part(kind, color, sx, sy, sz, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(GEO[kind], mat(color, opts));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y + sy / 2, z);
  return m;
}

const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Collects lots of static primitives and turns them into one InstancedMesh per material. */
export class Batcher {
  constructor() {
    this.buckets = new Map();
  }
  add(kind, color, x, y, z, sx, sy, sz, ry = 0, opts = {}) {
    const key = `${kind}|${color}|${opts.opacity ?? 1}|${opts.basic ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { kind, color, opts, m: [] };
      this.buckets.set(key, b);
    }
    _p.set(x, y + sy / 2, z);
    _q.setFromAxisAngle(UP, ry);
    _s.set(sx, sy, sz);
    b.m.push(new THREE.Matrix4().compose(_p, _q, _s));
  }
  box(color, x, y, z, sx, sy, sz, ry, opts) {
    this.add('box', color, x, y, z, sx, sy, sz, ry, opts);
  }
  cyl(color, x, y, z, r, h, opts) {
    this.add('cyl', color, x, y, z, r * 2, h, r * 2, 0, opts);
  }
  sph(color, x, y, z, r, sy = 1, opts) {
    this.add('sph', color, x, y - r * sy + r * sy, z, r * 2, r * 2 * sy, r * 2, 0, opts);
  }
  build() {
    const g = new THREE.Group();
    for (const b of this.buckets.values()) {
      const opts = b.opts;
      const material = opts.basic
        ? new THREE.MeshBasicMaterial({ color: b.color })
        : new THREE.MeshLambertMaterial({ color: b.color });
      if (opts.opacity != null && opts.opacity < 1) {
        material.transparent = true;
        material.opacity = opts.opacity;
        material.depthWrite = false;
      }
      const im = new THREE.InstancedMesh(GEO[b.kind], material, b.m.length);
      b.m.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      if (material.transparent) im.renderOrder = 2;
      g.add(im);
    }
    return g;
  }
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isInstancedMesh) {
      o.material.dispose();
      o.dispose();
    }
  });
}

// ---------- floor fan (vision cones / screen glow) ----------
let _radial;
export function radialTexture() {
  if (_radial) return _radial;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  _radial = new THREE.CanvasTexture(c);
  _radial.colorSpace = THREE.SRGBColorSpace;
  return _radial;
}

/**
 * A triangle fan on the floor, origin at local (0,0). Rays get updated with setFan().
 * UVs map a radial gradient so it fades with distance.
 */
export function makeFan(rays, radius, color, opacity, additive = false) {
  const geo = new THREE.BufferGeometry();
  const n = rays;
  const pos = new Float32Array((n + 1) * 3);
  const uv = new Float32Array((n + 1) * 2);
  const idx = [];
  for (let i = 1; i < n; i++) idx.push(0, i + 1, i);
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const m = new THREE.MeshBasicMaterial({
    color,
    map: radialTexture(),
    transparent: true,
    opacity,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.userData.radius = radius;
  mesh.userData.n = n;
  return mesh;
}

/** pts: flat array [x0,z0,x1,z1,...] in the fan's local space (n points), origin implied at 0,0. */
export function setFan(mesh, pts) {
  const pos = mesh.geometry.attributes.position.array;
  const uv = mesh.geometry.attributes.uv.array;
  const R = mesh.userData.radius;
  pos[0] = 0;
  pos[1] = 0;
  pos[2] = 0;
  uv[0] = 0.5;
  uv[1] = 0.5;
  const n = mesh.userData.n;
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2],
      z = pts[i * 2 + 1];
    pos[(i + 1) * 3] = x;
    pos[(i + 1) * 3 + 1] = 0;
    pos[(i + 1) * 3 + 2] = z;
    uv[(i + 1) * 2] = 0.5 + x / (2 * R);
    uv[(i + 1) * 2 + 1] = 0.5 + z / (2 * R);
  }
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.attributes.uv.needsUpdate = true;
}

export function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { canvas: c, ctx: c.getContext('2d'), tex: t };
}
