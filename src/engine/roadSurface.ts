// ─── Road surface profile generators ────────────────────────────────
// Returns ground height in mm for each corner at a given simulation time.

import type { Corner, RoadProfileType, RoadProfileParams, BumpShape, IsoRoadClass } from '../types/suspension';

/** Corner longitudinal and lateral offsets from CG, in mm */
export interface CornerPositions {
  FL: { x: number; y: number };
  FR: { x: number; y: number };
  RL: { x: number; y: number };
  RR: { x: number; y: number };
}

/**
 * Deterministic hash in [0, 1) for a given integer key and seed.
 */
function hash01(key: number, seed: number): number {
  const v = Math.sin((key + seed) * 12.9898 + seed * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * Generate a blue-noise height sequence via Mitchell's best-candidate.
 * Produces `count` bump positions in [0, length) with well-spaced heights
 * in [0, maxHeight], cached per (seed, count) pair.
 */
const blueNoiseCache = new Map<string, { positions: number[]; heights: number[] }>();

function getBlueNoise(
  length: number,
  maxHeight: number,
  seed: number,
  spacing: number,
): { positions: number[]; heights: number[] } {
  const count = Math.max(1, Math.floor(length / spacing));
  const key = `${seed}:${count}`;
  const cached = blueNoiseCache.get(key);
  if (cached) return cached;

  const candidates = 20; // candidates per accepted sample
  const positions: number[] = [];
  const heights: number[] = [];

  // First point from hash
  positions.push(hash01(0, seed) * length);
  heights.push(hash01(1, seed) * maxHeight);

  for (let i = 1; i < count; i++) {
    let bestPos = 0;
    let bestHeight = 0;
    let bestMinDist = -1;

    for (let c = 0; c < candidates; c++) {
      const cp = hash01(i * candidates + c, seed + 100) * length;
      const ch = hash01(i * candidates + c, seed + 200) * maxHeight;

      // Find minimum distance to existing points (in normalised 2D: position/length, height/maxHeight)
      let minDist = Infinity;
      for (let j = 0; j < positions.length; j++) {
        const dp = (cp - positions[j]) / length;
        const dh = (ch - heights[j]) / maxHeight;
        const d = dp * dp + dh * dh;
        if (d < minDist) minDist = d;
      }

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestPos = cp;
        bestHeight = ch;
      }
    }

    positions.push(bestPos);
    heights.push(bestHeight);
  }

  // Sort by position for fast lookup
  const indices = positions.map((_, idx) => idx).sort((a, b) => positions[a] - positions[b]);
  const sorted = {
    positions: indices.map(i => positions[i]),
    heights: indices.map(i => heights[i]),
  };

  blueNoiseCache.set(key, sorted);
  return sorted;
}

/**
 * Bump profile dispatcher — returns height at a longitudinal position.
 */
function bumpProfile(
  posAlongBump: number,
  width: number,
  height: number,
  shape: BumpShape = 'halfsine',
): number {
  if (posAlongBump < 0 || posAlongBump > width) return 0;
  const t = posAlongBump / width; // normalised 0‥1

  switch (shape) {
    case 'halfsine':
      return height * Math.sin(Math.PI * t);
    case 'fullsine':
      return height * Math.sin(2 * Math.PI * t);
    case 'triangle':
      return height * (t < 0.5 ? 2 * t : 2 * (1 - t));
    case 'square':
      return height;
    default:
      return height * Math.sin(Math.PI * t);
  }
}

/**
 * Compute the longitudinal position of a corner relative to the bump start.
 * The bump starts passing under the front axle at t=0, travelling at `speed`.
 */
function cornerBumpPosition(
  time: number,
  speed: number,
  cornerLongOffset: number,
): number {
  // Distance the vehicle has travelled (or equivalently, how far the bump
  // has moved under the vehicle).  cornerLongOffset > 0 for front axle.
  return speed * time - cornerLongOffset;
}

// ─── Profile generators ─────────────────────────────────────────────

function flat(): Record<Corner, number> {
  return { FL: 0, FR: 0, RL: 0, RR: 0 };
}

/**
 * Compute repeating bump position.
 * If frequency > 0, bumps repeat with spacing = speed / frequency.
 * Returns position within the current bump cycle.
 */
function repeatingBumpPosition(
  pos: number,
  width: number,
  speed: number,
  frequency: number,
): number {
  if (frequency <= 0 || speed <= 0) return pos; // single-shot
  const spacing = speed / frequency; // mm between bump starts
  if (spacing <= width) return pos; // bumps overlap, treat as single
  if (pos < 0) return pos; // hasn't reached first bump yet
  const posInCycle = pos % spacing;
  return posInCycle;
}

/**
 * Resolve target corner specification to a list of corners.
 * 'FL'/'FR'/'RL'/'RR' → single corner
 * 'front' → FL + FR, 'rear' → RL + RR, 'all' → all four
 */
function resolveTargetCorners(target: string | undefined): Corner[] {
  switch (target) {
    case 'FL': return ['FL'];
    case 'FR': return ['FR'];
    case 'RL': return ['RL'];
    case 'RR': return ['RR'];
    case 'front': return ['FL', 'FR'];
    case 'rear': return ['RL', 'RR'];
    case 'all': return ['FL', 'FR', 'RL', 'RR'];
    default: return ['FL'];
  }
}

function singleBump(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const targets = resolveTargetCorners(params.targetCorner);

  for (const c of targets) {
    const rawPos = cornerBumpPosition(time, params.speed, positions[c].x);
    const pos = repeatingBumpPosition(rawPos, params.width, params.speed, params.frequency);
    result[c] = bumpProfile(pos, params.width, params.height, params.shape);
  }

  return result;
}

function speedBump(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR'];

  for (const c of corners) {
    const rawPos = cornerBumpPosition(time, params.speed, positions[c].x);
    const pos = repeatingBumpPosition(rawPos, params.width, params.speed, params.frequency);
    result[c] = bumpProfile(pos, params.width, params.height, params.shape);
  }

  return result;
}

function diagonalTwist(
  params: RoadProfileParams,
  _positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  // Ramp up twist over time, then hold
  const rampTime = params.width / Math.max(params.speed, 1);
  const t = Math.min(time / Math.max(rampTime, 0.001), 1);
  const h = params.height * t;

  return {
    FL: h,
    FR: -h,
    RL: -h,
    RR: h,
  };
}

function washboard(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR'];
  const freq = params.frequency || 10;

  for (const c of corners) {
    // Each corner hits the washboard at a time offset by its longitudinal position
    const timeAtCorner = time - positions[c].x / Math.max(params.speed, 1);
    if (timeAtCorner >= 0) {
      result[c] = params.height * 0.5 * (1 - Math.cos(2 * Math.PI * freq * timeAtCorner));
    }
  }

  return result;
}

function step(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR'];

  for (const c of corners) {
    const pos = cornerBumpPosition(time, params.speed, positions[c].x);
    // Step up once the corner passes the step location
    result[c] = pos >= 0 ? params.height : 0;
  }

  return result;
}

function random(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR'];
  const seed = params.seed ?? 42;

  // Blue-noise terrain: generate well-spaced bumps over a repeating segment
  const segmentLength = 2000; // 2m repeating segment
  const bumpSpacing = 15;     // ~15mm mean spacing between bump features
  const bn = getBlueNoise(segmentLength, params.height, seed, bumpSpacing);

  for (const c of corners) {
    const pos = cornerBumpPosition(time, params.speed, positions[c].x);
    if (pos < 0) continue;

    // Wrap position into segment
    const p = ((pos % segmentLength) + segmentLength) % segmentLength;

    // Binary search for surrounding blue-noise points
    let lo = 0, hi = bn.positions.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (bn.positions[mid] <= p) lo = mid; else hi = mid;
    }

    // Cosine interpolation between neighbouring points for smooth terrain
    const p0 = bn.positions[lo], p1 = bn.positions[hi];
    const h0 = bn.heights[lo], h1 = bn.heights[hi];
    const span = p1 > p0 ? p1 - p0 : (p1 + segmentLength - p0);
    const frac = (p - p0 + segmentLength) % segmentLength / span;
    const t = 0.5 * (1 - Math.cos(Math.PI * Math.min(frac, 1)));
    result[c] = h0 + (h1 - h0) * t;
  }

  return result;
}

// ─── ISO 8608 Road Surface ──────────────────────────────────────────

/** ISO 8608 roughness coefficients Gd(Ω0) in m³ at Ω0 = 1 rad/m */
const ISO_CLASSES: Record<IsoRoadClass, number> = {
  A: 16e-6,
  B: 64e-6,
  C: 256e-6,
  D: 1024e-6,
  E: 4096e-6,
  F: 16384e-6,
  G: 65536e-6,
  H: 262144e-6,
};

/**
 * ISO 8608 one-sided PSD: Gd(Ω) = Gd(Ω0) × (Ω/Ω0)^(-w), w=2
 */
function isoPSD(omega: number, Gd0: number): number {
  return Gd0 * Math.pow(omega, -2); // Ω0 = 1 rad/m
}

/**
 * Pre-computed ISO 8608 road elevation profile.
 * Generated via Shinozuka sinusoidal superposition:
 *   z(x) = Σ A_i cos(Ω_i x + φ_i)
 *   A_i  = sqrt(2 × Gd(Ω_i) × ΔΩ)
 *
 * Cached per (class, seed) so all four wheels sample the same surface.
 */
interface IsoProfile {
  z: Float64Array;  // elevation in metres
  dx: number;       // spatial step in metres
  length: number;   // total length in metres
}

const isoProfileCache = new Map<string, IsoProfile>();

function getIsoProfile(isoClass: IsoRoadClass, seed: number): IsoProfile {
  const key = `${isoClass}:${seed}`;
  const cached = isoProfileCache.get(key);
  if (cached) return cached;

  const Gd0 = ISO_CLASSES[isoClass];
  const length = 20;           // 20m repeating segment
  const dx = 0.001;            // 1mm spatial step
  const nSamples = Math.round(length / dx);
  const nHarmonics = 500;
  const omegaL = 2 * Math.PI * 0.01;  // 0.01 cycles/m
  const omegaU = 2 * Math.PI * 10;    // 10 cycles/m
  const dOmega = (omegaU - omegaL) / nHarmonics;

  // Pre-compute amplitudes and frequencies
  const omegas = new Float64Array(nHarmonics);
  const amps = new Float64Array(nHarmonics);
  for (let i = 0; i < nHarmonics; i++) {
    omegas[i] = omegaL + i * dOmega;
    amps[i] = Math.sqrt(2 * isoPSD(omegas[i], Gd0) * dOmega);
  }

  // Deterministic phases from seed (no Math.random)
  const phases = new Float64Array(nHarmonics);
  for (let i = 0; i < nHarmonics; i++) {
    phases[i] = hash01(i, seed) * 2 * Math.PI;
  }

  // Sum harmonics
  const z = new Float64Array(nSamples);
  for (let s = 0; s < nSamples; s++) {
    const x = s * dx;
    let elevation = 0;
    for (let i = 0; i < nHarmonics; i++) {
      elevation += amps[i] * Math.cos(omegas[i] * x + phases[i]);
    }
    z[s] = elevation;
  }

  const profile: IsoProfile = { z, dx, length };
  isoProfileCache.set(key, profile);
  return profile;
}

/**
 * Look up ISO 8608 profile elevation at a spatial position (in mm).
 * Returns elevation in mm.
 */
function sampleIsoProfile(profile: IsoProfile, posMm: number, scale: number): number {
  const posM = posMm / 1000; // convert mm → m
  // Wrap into repeating segment
  const wrapped = ((posM % profile.length) + profile.length) % profile.length;
  // Linear interpolation
  const idx = wrapped / profile.dx;
  const i0 = Math.floor(idx);
  const i1 = (i0 + 1) % profile.z.length;
  const frac = idx - i0;
  const elevationM = profile.z[i0] * (1 - frac) + profile.z[i1] * frac;
  return elevationM * 1000 * scale; // m → mm, apply scale
}

function iso8608(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR'];
  const isoClass = params.isoClass ?? 'B';
  const scale = params.isoScale ?? 1;
  const seed = params.seed ?? 42;

  const profile = getIsoProfile(isoClass, seed);

  for (const c of corners) {
    // Each corner's position along the road surface
    const pos = cornerBumpPosition(time, params.speed, positions[c].x);
    if (pos < 0) continue;
    result[c] = sampleIsoProfile(profile, pos, scale);
  }

  return result;
}

// ─── Main entry point ───────────────────────────────────────────────

/**
 * Get the ground height at each corner for a given road profile.
 *
 * @param type    - Road profile type
 * @param params  - Road profile parameters (height, width, speed, etc.)
 * @param cornerPositions - Longitudinal (x) and lateral (y) offsets from CG per corner (mm)
 * @param time    - Current simulation time (s)
 * @returns Ground height per corner (mm)
 */
export function getGroundHeight(
  type: RoadProfileType,
  params: RoadProfileParams,
  cornerPositions: CornerPositions,
  time: number,
): Record<Corner, number> {
  switch (type) {
    case 'flat':
      return flat();
    case 'singleBump':
      return singleBump(params, cornerPositions, time);
    case 'speedBump':
      return speedBump(params, cornerPositions, time);
    case 'diagonalTwist':
      return diagonalTwist(params, cornerPositions, time);
    case 'washboard':
      return washboard(params, cornerPositions, time);
    case 'step':
      return step(params, cornerPositions, time);
    case 'random':
      return random(params, cornerPositions, time);
    case 'iso8608':
      return iso8608(params, cornerPositions, time);
    default:
      return flat();
  }
}

export interface GroundHeightAndVelocity {
  heights: Record<Corner, number>;
  velocities: Record<Corner, number>;
}

/**
 * Get the ground height and vertical velocity at each corner.
 * Velocity is computed via central finite difference: dh/dt ≈ (h(t+ε) - h(t-ε)) / (2ε).
 */
export function getGroundHeightAndVelocity(
  type: RoadProfileType,
  params: RoadProfileParams,
  cornerPositions: CornerPositions,
  time: number,
): GroundHeightAndVelocity {
  const heights = getGroundHeight(type, params, cornerPositions, time);

  if (type === 'flat') {
    return { heights, velocities: { FL: 0, FR: 0, RL: 0, RR: 0 } };
  }

  const eps = 0.0001; // 0.1ms for central difference
  const hBefore = getGroundHeight(type, params, cornerPositions, time - eps);
  const hAfter = getGroundHeight(type, params, cornerPositions, time + eps);
  const inv2eps = 1 / (2 * eps);

  const velocities: Record<Corner, number> = {
    FL: (hAfter.FL - hBefore.FL) * inv2eps,
    FR: (hAfter.FR - hBefore.FR) * inv2eps,
    RL: (hAfter.RL - hBefore.RL) * inv2eps,
    RR: (hAfter.RR - hBefore.RR) * inv2eps,
  };

  return { heights, velocities };
}
