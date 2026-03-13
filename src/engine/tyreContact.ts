// ─── Tyre contact / ground interaction model ────────────────────────
// All lengths in mm, velocities in mm/s, forces in N.

export interface TyreForceResult {
  force: number;        // N, always >= 0 (tyre can only push)
  deflection: number;   // mm
  wheelContact: boolean;
}

/**
 * Compute the vertical tyre contact force for a single corner.
 *
 * @param wheelPosZ   - Unsprung mass vertical position (mm, positive = up)
 * @param wheelVelZ   - Unsprung mass vertical velocity (mm/s, positive = up)
 * @param groundHeight - Ground surface height at this corner (mm)
 * @param tyreRadius  - Loaded tyre radius (mm)
 * @param tyreSpringRate - Tyre vertical spring rate (N/mm)
 * @param tyreDamping - Tyre vertical damping coefficient (N·s/mm)
 * @param groundVelocity - Vertical velocity of the ground surface (mm/s)
 */
export function computeTyreForce(
  wheelPosZ: number,
  wheelVelZ: number,
  groundHeight: number,
  tyreRadius: number,
  tyreSpringRate: number,
  tyreDamping: number,
  groundVelocity: number = 0,
): TyreForceResult {
  // Bottom of the tyre vs ground
  const tyreBottomZ = wheelPosZ - tyreRadius;

  // If tyre bottom is above the ground, no contact
  if (tyreBottomZ > groundHeight) {
    return { force: 0, deflection: 0, wheelContact: false };
  }

  // Tyre deflection: how much the tyre is squished (positive = compressed)
  const deflection = Math.max(0, groundHeight - tyreBottomZ);

  // Spring + damping force
  // Damping acts on relative velocity: ground velocity minus wheel velocity
  // (positive when gap is closing, i.e. compressing)
  const relativeVelocity = groundVelocity - wheelVelZ;
  let force = tyreSpringRate * deflection + tyreDamping * relativeVelocity;

  // Tyre can only push (no tension)
  force = Math.max(0, force);

  return { force, deflection, wheelContact: true };
}
