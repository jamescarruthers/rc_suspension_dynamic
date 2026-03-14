// ─── Equations of motion solver ─────────────────────────────────────
// Computes accelerations for sprung mass (heave, roll, pitch) and
// unsprung masses (per-corner heave).
//
// Units: mm, grams, seconds, N.
// Conversion: mass_kg = mass_g / 1000
// Acceleration: a_mm_s2 = (F_N / mass_kg) * 1000

import type { Corner, VehicleParams, AxleGeometry } from '../types/suspension';

// ─── Constants ──────────────────────────────────────────────────────

/** Convert grams to kg */
export function massToKg(massG: number): number {
  return massG / 1000;
}

/**
 * Convert force (N) and mass (g) to acceleration (mm/s²).
 *   a = (F / mass_kg) * 1000
 */
export function forceToAccelMM(forceN: number, massG: number): number {
  if (massG <= 0) return 0;
  return (forceN / (massG / 1000)) * 1000;
}

// ─── Corner geometry ────────────────────────────────────────────────

export interface CornerLeverArms {
  /** Lateral offset from CG (mm). Positive = right side. */
  lateral: number;
  /** Longitudinal offset from CG (mm). Positive = front. */
  longitudinal: number;
}

/**
 * Compute lever arms for each corner relative to the CG.
 *
 * frontBias = weightDistribution / 100 (fraction of weight on front)
 * distCGtoFront = wheelbase * (1 - frontBias)
 * distCGtoRear  = wheelbase * frontBias
 */
export function computeLeverArms(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
): Record<Corner, CornerLeverArms> {
  const wb = vehicle.wheelbase;
  const frontBias = vehicle.weightDistribution / 100;
  const distToFront = wb * (1 - frontBias);
  const distToRear = wb * frontBias;

  const halfTrackF = frontGeo.trackWidth / 2;
  const halfTrackR = rearGeo.trackWidth / 2;

  return {
    FL: { lateral: -halfTrackF, longitudinal: distToFront },
    FR: { lateral: halfTrackF,  longitudinal: distToFront },
    RL: { lateral: -halfTrackR, longitudinal: -distToRear },
    RR: { lateral: halfTrackR,  longitudinal: -distToRear },
  };
}

// ─── Inertia ────────────────────────────────────────────────────────

/**
 * Compute roll moment of inertia for the sprung mass.
 * I_roll = m_s * (avg_track/2)^2 * k
 * where k is the radius-of-gyration scaling factor (typically 0.2–0.4).
 * Returns in g·mm².
 */
export function computeRollInertia(
  sprungMassG: number,
  frontTrackMM: number,
  rearTrackMM: number,
  inertiaScaling: number = 0.3,
): number {
  const avgHalfTrack = (frontTrackMM + rearTrackMM) / 4;
  return sprungMassG * avgHalfTrack * avgHalfTrack * inertiaScaling;
}

/**
 * Compute pitch moment of inertia for the sprung mass.
 * I_pitch = m_s * (wheelbase/2)^2 * k
 * where k is the radius-of-gyration scaling factor (typically 0.2–0.4).
 * Returns in g·mm².
 */
export function computePitchInertia(
  sprungMassG: number,
  wheelbaseMM: number,
  inertiaScaling: number = 0.3,
): number {
  const halfWB = wheelbaseMM / 2;
  return sprungMassG * halfWB * halfWB * inertiaScaling;
}

// ─── Accelerations ──────────────────────────────────────────────────

export interface CornerForceInputs {
  /** Total suspension force at this corner (spring + damper + bumpstop), N */
  suspensionForce: number;
  /** Sway bar force at this corner, N */
  swayBarForce: number;
  /** Bump stop force (already included in suspensionForce, listed for records) */
  bumpStopForce: number;
  /** Tyre contact force at this corner, N */
  tyreForce: number;
  /** Hydraulic interconnection force, N */
  hydraulicForce: number;
}

export interface AccelerationResult {
  /** Sprung mass heave acceleration (mm/s²) */
  a_s: number;
  /** Roll angular acceleration (rad/s²) */
  alpha_roll: number;
  /** Pitch angular acceleration (rad/s²) */
  alpha_pitch: number;
  /** Per-corner unsprung mass acceleration (mm/s²) */
  a_u: Record<Corner, number>;
}

/**
 * Compute accelerations for all degrees of freedom.
 *
 * Sprung mass DOF: z_s (heave), theta_roll, theta_pitch
 * Unsprung mass DOF: z_u per corner
 */
export function computeAccelerations(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
  cornerForces: Record<Corner, CornerForceInputs>,
  leverArms: Record<Corner, CornerLeverArms>,
): AccelerationResult {
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR'];

  // Sprung mass
  const totalUnsprungG = vehicle.unsprungMassPerCorner * 4;
  const sprungMassG = vehicle.totalWeight - totalUnsprungG;
  const sprungMassKg = massToKg(sprungMassG);

  // Gravity on sprung mass (N, downward)
  const F_gravity_sprung = sprungMassKg * 9.81;

  let sumSuspForce = 0;
  let M_roll = 0;
  let M_pitch = 0;

  for (const c of corners) {
    const f = cornerForces[c];
    const arm = leverArms[c];

    const upForce = f.suspensionForce + f.swayBarForce + f.hydraulicForce;
    sumSuspForce += upForce;

    // Roll moment: lateral arm * force (N·mm)
    M_roll += arm.lateral * upForce;

    // Pitch moment: longitudinal arm * force (N·mm)
    M_pitch += arm.longitudinal * upForce;
  }

  // Heave acceleration (mm/s²)
  const a_s = ((sumSuspForce - F_gravity_sprung) / sprungMassKg) * 1000;

  // Roll acceleration (rad/s²)
  // M_roll in N·mm, I_roll in g·mm²
  // alpha = M[N·m] / I[kg·m²] = (M_N_mm * 1e-3) / (I_g_mm2 * 1e-9) = M / I * 1e6
  const inertiaK = vehicle.inertiaScaling ?? 0.3;
  const I_roll = computeRollInertia(sprungMassG, frontGeo.trackWidth, rearGeo.trackWidth, inertiaK);
  const alpha_roll = I_roll > 0 ? (M_roll / I_roll) * 1e6 : 0;

  // Pitch acceleration (rad/s²)
  const I_pitch = computePitchInertia(sprungMassG, vehicle.wheelbase, inertiaK);
  const alpha_pitch = I_pitch > 0 ? (M_pitch / I_pitch) * 1e6 : 0;

  // Unsprung masses
  const unsprungMassKg = massToKg(vehicle.unsprungMassPerCorner);
  const F_gravity_unsprung = unsprungMassKg * 9.81;

  const a_u: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };

  for (const c of corners) {
    const f = cornerForces[c];
    const netForce =
      f.tyreForce -
      f.suspensionForce -
      f.swayBarForce -
      f.hydraulicForce -
      F_gravity_unsprung;

    a_u[c] = (netForce / unsprungMassKg) * 1000;
  }

  return { a_s, alpha_roll, alpha_pitch, a_u };
}
