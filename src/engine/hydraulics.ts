// ─── Hydraulic fluid circuit model ──────────────────────────────────
// Models hydraulic interconnection between suspension corners.
// All lengths in mm, forces in N, pressures in N/mm² (MPa).

import type { Corner, HydraulicConfig } from '../types/suspension';

// ─── Constants ──────────────────────────────────────────────────────

/** Default dynamic viscosity of hydraulic fluid (N·s/mm²) */
const DEFAULT_VISCOSITY = 30e-9; // ~30 cSt at 40C

// ─── Geometry helpers ───────────────────────────────────────────────

/**
 * Compute the effective piston area (annular area on rod side).
 * A = pi*(bore/2)² - pi*(rod/2)²
 */
export function cylinderArea(boreMM: number, rodMM: number): number {
  return Math.PI * ((boreMM / 2) ** 2 - (rodMM / 2) ** 2);
}

/**
 * Full bore-side piston area.
 */
export function boreArea(boreMM: number): number {
  return Math.PI * (boreMM / 2) ** 2;
}

/**
 * Laminar flow rate through a tube (Hagen-Poiseuille equation).
 *   Q = (pi * d^4 * deltaP) / (128 * mu * L)
 *
 * @returns Volume flow rate (mm³/s)
 */
export function laminarFlowRate(
  diameter: number,
  deltaP: number,
  viscosity: number,
  length: number,
): number {
  if (length <= 0 || diameter <= 0) return 0;
  return (Math.PI * diameter ** 4 * deltaP) / (128 * viscosity * length);
}

// ─── Hydraulic circuit force computation ────────────────────────────

export interface HydraulicForceResult {
  FL: number;
  FR: number;
  RL: number;
  RR: number;
}

/**
 * Compute hydraulic interconnection forces for all four corners.
 *
 * Topologies:
 *   - lateral:  FL<->FR, RL<->RR (resists roll)
 *   - diagonal: FL<->RR, FR<->RL (resists warp/twist)
 *   - full:     all four interconnected
 */
export function computeHydraulicForces(
  config: HydraulicConfig,
  shockVelocities: Record<Corner, number>,
  shockCompressions: Record<Corner, number>,
): HydraulicForceResult {
  const result: HydraulicForceResult = { FL: 0, FR: 0, RL: 0, RR: 0 };

  if (!config.enabled) return result;

  const A_bore = boreArea(config.cylinderBore);
  const viscosity = config.fluidViscosity > 0
    ? config.fluidViscosity * 1e-9  // Convert cSt-like units to N·s/mm²
    : DEFAULT_VISCOSITY;
  const lineDiameter = config.lineInternalDiameter;
  const lineLength = config.lineLength;

  // Use bore area as effective area — in a differential cylinder interconnection,
  // the bore side drives the flow. Averaging bore and rod areas is non-physical.
  const A_eff = A_bore;

  // Define linked pairs based on topology
  let pairs: [Corner, Corner][];
  switch (config.topology) {
    case 'lateral':
      pairs = [['FL', 'FR'], ['RL', 'RR']];
      break;
    case 'diagonal':
      pairs = [['FL', 'RR'], ['FR', 'RL']];
      break;
    case 'full':
      // Full interconnection: lateral + diagonal
      pairs = [['FL', 'FR'], ['RL', 'RR'], ['FL', 'RR'], ['FR', 'RL']];
      break;
    default:
      return result;
  }

  for (const [c1, c2] of pairs) {
    const v_diff = shockVelocities[c1] - shockVelocities[c2];
    const Q_demand = A_eff * v_diff;

    // Pressure drop from Hagen-Poiseuille (inverted)
    let deltaP = 0;
    if (lineDiameter > 0 && lineLength > 0) {
      deltaP = (Q_demand * 128 * viscosity * lineLength) /
        (Math.PI * lineDiameter ** 4);
    }

    // Orifice restriction
    if (config.orificeDiameter > 0 && config.orificeDiameter < lineDiameter) {
      const A_orifice = Math.PI * (config.orificeDiameter / 2) ** 2;
      const A_line = Math.PI * (lineDiameter / 2) ** 2;
      const restriction = (A_line / A_orifice) ** 2;
      deltaP *= restriction;
    }

    // Accumulator spring resistance
    const compDiff = shockCompressions[c1] - shockCompressions[c2];
    const accumForce = config.accumulatorSpringRate * compDiff;

    const hydraulicForce = deltaP * A_eff + accumForce;

    result[c1] += -hydraulicForce;
    result[c2] += hydraulicForce;
  }

  return result;
}
