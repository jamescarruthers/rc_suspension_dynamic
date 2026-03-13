import type { VehicleParams } from '../types/suspension';

/** Gravity in mm/s² */
export const G_MM = 9810;

/** Gravity in m/s² */
export const G_MS = 9.81;

/* ── Angular conversions ── */

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/* ── Linear conversions ── */

export function mmToM(mm: number): number {
  return mm / 1000;
}

export function mToMm(m: number): number {
  return m * 1000;
}

/* ── Mass conversions ── */

export function gToKg(g: number): number {
  return g / 1000;
}

export function kgToG(kg: number): number {
  return kg * 1000;
}

/* ── Derived values ── */

export interface DerivedValues {
  /** Total sprung mass in grams (total weight minus 4 corners of unsprung) */
  sprungMassG: number;
  /** Sprung mass in kg */
  sprungMassKg: number;
  /** Total mass in kg */
  totalMassKg: number;
  /** Mass per corner in grams (total / 4, weighted by bias for front/rear) */
  frontCornerMassG: number;
  rearCornerMassG: number;
  /** Sprung mass per corner in grams */
  frontCornerSprungG: number;
  rearCornerSprungG: number;
  /** Weight (force) in Newtons */
  totalWeightN: number;
  /** Sprung weight in Newtons */
  sprungWeightN: number;
}

/**
 * Compute derived mass and weight values from vehicle parameters.
 * Assumes 4 wheels with equal unsprung mass per corner.
 */
export function computeDerivedValues(vehicle: VehicleParams): DerivedValues {
  const totalUnsprungG = vehicle.unsprungMassPerCorner * 4;
  const sprungMassG = vehicle.totalWeight - totalUnsprungG;
  const sprungMassKg = gToKg(sprungMassG);
  const totalMassKg = gToKg(vehicle.totalWeight);

  const frontBias = vehicle.weightDistribution / 100;
  const rearBias = 1 - frontBias;

  const frontCornerMassG = (vehicle.totalWeight * frontBias) / 2;
  const rearCornerMassG = (vehicle.totalWeight * rearBias) / 2;

  const frontCornerSprungG = frontCornerMassG - vehicle.unsprungMassPerCorner;
  const rearCornerSprungG = rearCornerMassG - vehicle.unsprungMassPerCorner;

  const totalWeightN = totalMassKg * G_MS;
  const sprungWeightN = sprungMassKg * G_MS;

  return {
    sprungMassG,
    sprungMassKg,
    totalMassKg,
    frontCornerMassG,
    rearCornerMassG,
    frontCornerSprungG,
    rearCornerSprungG,
    totalWeightN,
    sprungWeightN,
  };
}
