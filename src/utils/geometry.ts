// ─── Vector math and geometry helpers ────────────────────────────────
// All lengths in mm, angles in radians unless noted.

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

// ─── Vector constructors ─────────────────────────────────────────────

export function vec3(x: number, y: number, z: number): Vector3 {
  return { x, y, z };
}

export function vec3Zero(): Vector3 {
  return { x: 0, y: 0, z: 0 };
}

// ─── Vector arithmetic ───────────────────────────────────────────────

export function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(v: Vector3, s: number): Vector3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(v: Vector3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function normalize(v: Vector3): Vector3 {
  const len = length(v);
  if (len < 1e-12) return vec3Zero();
  return scale(v, 1 / len);
}

// ─── Rotations (right-hand rule) ─────────────────────────────────────

/** Rotate vector around X axis by angle (radians) */
export function rotateAroundX(v: Vector3, angle: number): Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x,
    y: v.y * c - v.z * s,
    z: v.y * s + v.z * c,
  };
}

/** Rotate vector around Y axis by angle (radians) */
export function rotateAroundY(v: Vector3, angle: number): Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x * c + v.z * s,
    y: v.y,
    z: -v.x * s + v.z * c,
  };
}

/** Rotate vector around Z axis by angle (radians) */
export function rotateAroundZ(v: Vector3, angle: number): Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: v.x * c - v.y * s,
    y: v.x * s + v.y * c,
    z: v.z,
  };
}

// ─── 2D line intersection ────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Find the intersection of two 2D lines, each defined by two points.
 * Returns null if the lines are parallel (or nearly so).
 * Used for instant centre calculation in the Y-Z plane.
 */
export function lineIntersection2D(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
): Point2D | null {
  const denom =
    (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);

  if (Math.abs(denom) < 1e-10) {
    return null; // Lines are parallel
  }

  const t =
    ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;

  return {
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
  };
}

// ─── Scalar helpers ──────────────────────────────────────────────────

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Degrees to radians */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Radians to degrees */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Sign function that returns 0 for 0 */
export function sign(x: number): number {
  if (x > 0) return 1;
  if (x < 0) return -1;
  return 0;
}
