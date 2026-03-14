// ─── Road surface profile generators ────────────────────────────────
// Returns ground height in mm for each corner at a given simulation time.

import type { Corner, RoadProfileType, RoadProfileParams } from '../types/suspension';

/** Corner longitudinal and lateral offsets from CG, in mm */
export interface CornerPositions {
  FL: { x: number; y: number };
  FR: { x: number; y: number };
  RL: { x: number; y: number };
  RR: { x: number; y: number };
}

/**
 * Simple sin-based pseudo-random noise in range [-1, 1].
 * Deterministic for a given input.
 */
function pseudoRandom(x: number, seed: number = 0): number {
  const v = Math.sin((x + seed) * 12.9898 + seed * 78.233) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
}

/**
 * Half-sine bump profile.
 * Returns height at a given longitudinal position within the bump.
 */
function halfSineBump(
  posAlongBump: number,
  width: number,
  height: number,
): number {
  if (posAlongBump < 0 || posAlongBump > width) return 0;
  return height * Math.sin((Math.PI * posAlongBump) / width);
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

function singleBump(
  params: RoadProfileParams,
  positions: CornerPositions,
  time: number,
): Record<Corner, number> {
  const result: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  const target = params.targetCorner ?? 'FL';

  const rawPos = cornerBumpPosition(time, params.speed, positions[target].x);
  const pos = repeatingBumpPosition(rawPos, params.width, params.speed, params.frequency);
  result[target] = halfSineBump(pos, params.width, params.height);

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
    result[c] = halfSineBump(pos, params.width, params.height);
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

  for (const c of corners) {
    const pos = cornerBumpPosition(time, params.speed, positions[c].x);
    // Sample pseudo-random at quantized positions for repeatable terrain
    const quantized = Math.floor(pos / 5) * 5;
    const noise1 = pseudoRandom(quantized * 0.1, seed);
    const noise2 = pseudoRandom(quantized * 0.037, seed + 7);
    // Blend two frequencies for more natural feel
    result[c] = params.height * 0.5 * (noise1 * 0.6 + noise2 * 0.4 + 0.5);
    result[c] = Math.max(0, result[c]);
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
    default:
      return flat();
  }
}
