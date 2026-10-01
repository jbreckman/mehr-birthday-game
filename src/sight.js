// Line-of-sight math on the floor plane (x,z). Walls are segments; Mehr's chair adds dynamic occluders.

/** Returns t in [0,1] along A->B where it crosses segment C-D, or -1. */
export function segHit(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax,
    rz = bz - az,
    sx = dx - cx,
    sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (den > -1e-9 && den < 1e-9) return -1;
  const qx = cx - ax,
    qz = cz - az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return -1;
  return t;
}

/** t along A->B where it enters circle (cx,cz,r), or -1. */
export function circleHit(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax,
    dz = bz - az;
  const fx = ax - cx,
    fz = az - cz;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  let disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2 * a);
  const t2 = (-b + disc) / (2 * a);
  if (t1 >= 0 && t1 <= 1) return t1;
  if (t1 < 0 && t2 >= 0) return 0; // starts inside
  return -1;
}

/**
 * Nearest blocking t along A->B.
 * occ = { walls:[...], segs:[{x1,z1,x2,z2}], circles:[{x,z,r}] }
 * mode.xray -> ignore walls; mode.high -> ignore walls lower than 1.9 (someone on a ladder)
 */
export function firstHit(ax, az, bx, bz, occ, mode) {
  let best = 2;
  if (!mode || !mode.xray) {
    const walls = occ.walls;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (!w.opaque || w.sinking) continue;
      if (mode && mode.high && w.h < 1.9) continue;
      // quick bbox reject
      if (Math.max(ax, bx) < w.minx || Math.min(ax, bx) > w.maxx || Math.max(az, bz) < w.minz || Math.min(az, bz) > w.maxz) continue;
      const t = segHit(ax, az, bx, bz, w.x1, w.z1, w.x2, w.z2);
      if (t >= 0 && t < best) best = t;
    }
  }
  if (!mode || !mode.high) {
    const segs = occ.segs;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const t = segHit(ax, az, bx, bz, s.x1, s.z1, s.x2, s.z2);
      if (t >= 0 && t < best) best = t;
    }
    const cs = occ.circles;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const t = circleHit(ax, az, bx, bz, c.x, c.z, c.r);
      if (t >= 0 && t < best) best = t;
    }
  }
  return best > 1 ? -1 : best;
}

export function blocked(ax, az, bx, bz, occ, mode) {
  return firstHit(ax, az, bx, bz, occ, mode) >= 0;
}

export function prepWall(w) {
  w.minx = Math.min(w.x1, w.x2);
  w.maxx = Math.max(w.x1, w.x2);
  w.minz = Math.min(w.z1, w.z2);
  w.maxz = Math.max(w.z1, w.z2);
  return w;
}

/**
 * Fill `out` (flat x,z array, local to origin) with a visibility fan:
 * `rays` rays from heading-a0 to heading+a0 (inclusive), each clipped at the first hit.
 */
export function visFan(ox, oz, heading, halfAngle, range, rays, occ, mode, out, skipNear = 0) {
  for (let i = 0; i < rays; i++) {
    const a = heading - halfAngle + (2 * halfAngle * i) / (rays - 1);
    const dx = Math.sin(a),
      dz = Math.cos(a);
    const sx = ox + dx * skipNear,
      sz = oz + dz * skipNear;
    const ex = ox + dx * range,
      ez = oz + dz * range;
    const t = firstHit(sx, sz, ex, ez, occ, mode);
    const d = t < 0 ? range : skipNear + (range - skipNear) * t;
    out[i * 2] = dx * d;
    out[i * 2 + 1] = dz * d;
  }
  return out;
}
