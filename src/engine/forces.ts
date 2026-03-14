// ─── Per-corner force calculations ──────────────────────────────────
// All lengths in mm, velocities in mm/s, forces in N, spring rates in N/mm.

import type { AxleShock, AxleSwayBar } from '../types/suspension';

export interface CornerForces {
  springForce: number;    // N
  damperForce: number;    // N
  bumpStopForce: number;  // N
  totalSuspForce: number; // N (spring + damper + bumpstop)
}

/** Bump stop ramp coefficient (N/mm²) */
const BUMP_STOP_COEFF = 50;

/** Bump stop engagement threshold (fraction of travel) */
const BUMP_STOP_THRESHOLD = 0.85;

/**
 * Compute the motion ratio for a shock/spring assembly.
 * The damper attachment ratio directly gives the motion ratio (fraction
 * of lower arm length where the shock mounts).
 */
export function computeMotionRatio(shock: AxleShock): number {
  return shock.damperAttachmentRatio;
}

/**
 * Compute per-corner suspension forces (spring, damper, bump stop).
 *
 * @param shockCompression - Current shock compression (mm, positive = compressed)
 * @param shockVelocity    - Shock compression velocity (mm/s, positive = compressing)
 * @param shock            - Shock parameters
 * @param motionRatio      - Motion ratio (shock travel / wheel travel)
 */
export function computeCornerForces(
  shockCompression: number,
  shockVelocity: number,
  shock: AxleShock,
  motionRatio: number,
): CornerForces {
  // ── Motion ratio squared ────────────────────────────────────────
  // shockCompression/shockVelocity are wheel travel / wheel velocity.
  // The spring/damper is mounted at fraction MR along the arm, so:
  //   shock deflection     = wheel_travel × MR
  //   force at shock       = K × wheel_travel × MR
  //   force at wheel (via lever arm) = K × wheel_travel × MR²
  const mr2 = motionRatio * motionRatio;

  // ── Spring force ────────────────────────────────────────────────
  const springForce = shock.springRate * shockCompression * mr2;

  // ── Damper force (asymmetric compression/rebound) ───────────────
  let damperForce: number;
  if (shockVelocity >= 0) {
    damperForce = shock.dampingCompression * shockVelocity * mr2;
  } else {
    damperForce = shock.dampingRebound * shockVelocity * mr2;
  }

  // ── Bump stop force ────────────────────────────────────────────
  // maxBump/maxDroop are shock travel limits, so compare against
  // actual shock travel (wheel travel × MR). The resulting force at
  // the shock is then transferred to the wheel via the motion ratio.
  let bumpStopForce = 0;
  const shockTravel = shockCompression * motionRatio;

  const bumpLimit = shock.maxBump;
  const bumpThreshold = bumpLimit * BUMP_STOP_THRESHOLD;
  if (shockTravel > bumpThreshold && bumpLimit > 0) {
    const penetration = shockTravel - bumpThreshold;
    bumpStopForce += BUMP_STOP_COEFF * penetration * penetration * motionRatio;
  }

  const droopLimit = shock.maxDroop;
  const droopThreshold = droopLimit * BUMP_STOP_THRESHOLD;
  if (shockTravel < -droopThreshold && droopLimit > 0) {
    const penetration = -shockTravel - droopThreshold;
    bumpStopForce -= BUMP_STOP_COEFF * penetration * penetration * motionRatio;
  }

  const totalSuspForce = springForce + damperForce + bumpStopForce;

  return { springForce, damperForce, bumpStopForce, totalSuspForce };
}

/**
 * Compute the sway bar (anti-roll bar) force for one side.
 *
 * Returns the force applied to the LEFT side (N). Right side gets -force.
 *
 * Derivation:
 *   Polar moment of area:   J = π * d⁴ / 32
 *   Torsional stiffness:    k_t = G * J / L_bar    (N·mm/rad)
 *   Linear stiffness at arm tip: k_linear = k_t / arm²  (N/mm)
 *
 * Simplified: assume torsion bar length L_bar ≈ armLength, giving:
 *   k_linear = G * π * d⁴ / (32 * armLen³)
 *
 * G = 80,000 N/mm² (steel shear modulus).
 */
export function computeSwayBarForce(
  leftCompression: number,
  rightCompression: number,
  swayBar: AxleSwayBar,
): number {
  if (!swayBar.enabled) return 0;

  const G = 80_000;
  const d = swayBar.wireDiameter;
  const armLen = swayBar.armLength;

  if (armLen <= 0 || d <= 0) return 0;

  const k_arb = (G * Math.PI * d * d * d * d) / (32 * armLen * armLen * armLen);
  const diff = leftCompression - rightCompression;

  return k_arb * diff;
}
