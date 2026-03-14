// ─── Wishbone geometry, instant centres, roll centres ────────────────
// All lengths in mm, angles in degrees (inputs) or radians (internal).
//
// Implements the kinematic chain and derived quantities from the
// Suspension Geometry Standard (SAE J670 conventions adapted to the
// application's Three.js coordinate frame: X=lateral, Y=up, Z=forward).
//
// Key derived quantities per §3.3, §4, §5:
//   - Camber, caster, KPI (dynamic, from ball joint positions)
//   - Scrub radius (kingpin ground intercept Y vs contact patch Y)
//   - Caster trail (kingpin ground intercept Z vs contact patch Z)
//   - Instant centre and roll centre
//   - Geometry-dependent motion ratio

import type { AxleGeometry, AxleShock } from '../types/suspension';
import {
  type Point2D,
  lineIntersection2D,
  circleCircleIntersection,
  degToRad,
  radToDeg,
} from '../utils/geometry';

export interface InstantCentre {
  /** Y position in mm (lateral, 0 = vehicle centreline) */
  y: number;
  /** Z position in mm (vertical, 0 = ground) */
  z: number;
}

export interface BallJointPositions {
  /** Lower ball joint [lateral, vertical, longitudinal] in mm */
  lowerBJ: { y: number; z: number; x: number };
  /** Upper ball joint [lateral, vertical, longitudinal] in mm */
  upperBJ: { y: number; z: number; x: number };
}

export interface KinematicsResult {
  instantCentre: InstantCentre;
  rollCentreHeight: number;   // mm
  camber: number;             // degrees (negative = top tilts inward)
  dynamicKPI: number;         // degrees (kingpin inclination, frontal plane)
  dynamicCaster: number;      // degrees (caster angle, side plane, positive = top rearward)
  scrubRadius: number;        // mm (positive = intercept inboard of contact patch)
  casterTrail: number;        // mm (positive = intercept ahead of contact patch)
  motionRatio: number;        // instantaneous d(spring)/d(wheel)
  ballJoints: BallJointPositions;
}

// ─── Arm lengths ────────────────────────────────────────────────────

/** Derive lower and upper arm lengths (mm) from axle geometry.
 *  trackWidth is wheel-centre-to-wheel-centre; arms span from inner
 *  pivot to kingpin (ball joint), which is hubOffset inboard of wheel centre. */
export function armLengths(geo: AxleGeometry): { lowerLen: number; upperLen: number } {
  const hubOffset = geo.hubOffset ?? 0;
  const kingpinHalfTrack = geo.trackWidth / 2 - hubOffset;
  const lowerLen = geo.lowerWishboneRatio * kingpinHalfTrack;
  const upperLen = lowerLen * geo.upperArmLengthRatio;
  return { lowerLen, upperLen };
}

// ─── Derived geometry ───────────────────────────────────────────────

/**
 * Derive inner pivot heights from user-facing geometry parameters.
 *
 * The upright is centred on the wheel (tyre radius). Ball joint positions
 * are determined by upright height and kingpin angle. Inner pivot heights
 * are then calculated back from the ball joint positions, arm lengths,
 * and arm angles at rest.
 *
 * Returns heights relative to chassis reference (add rideHeight for
 * absolute Z above ground).
 */
export function deriveInnerPivotHeights(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
): { innerPivotHeightLower: number; innerPivotHeightUpper: number } {
  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;

  // Ball joint positions (Z = height above ground)
  const lowerBallJointZ = tyreRadius - halfUpright * Math.cos(kpiRad);
  const upperBallJointZ = tyreRadius + halfUpright * Math.cos(kpiRad);

  const { lowerLen, upperLen } = armLengths(geo);

  // Inner pivot Z above ground = ball joint Z minus arm rise
  const lowerInnerZ = lowerBallJointZ - lowerLen * Math.sin(degToRad(geo.lowerArmAngle));
  const upperInnerZ = upperBallJointZ - upperLen * Math.sin(degToRad(geo.upperArmAngle));

  // Convert to chassis-relative (subtract rideHeight)
  return {
    innerPivotHeightLower: lowerInnerZ - rideHeight,
    innerPivotHeightUpper: upperInnerZ - rideHeight,
  };
}

// ─── Pivot position helpers ─────────────────────────────────────────

/**
 * Compute the inner and outer pivot positions for upper and lower wishbones
 * in the Y-Z (frontal) plane for one side of the vehicle.
 *
 * Convention:
 *   Y = 0 at vehicle centreline, positive to the right
 *   Z = 0 at ground level, positive up
 */
export function computePivotPositions(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  isLeftSide: boolean,
) {
  const sign = isLeftSide ? -1 : 1;
  const hubOffset = geo.hubOffset ?? 0;
  const kingpinHalfTrack = geo.trackWidth / 2 - hubOffset;

  const { lowerLen, upperLen } = armLengths(geo);
  const lowerAngle = degToRad(geo.lowerArmAngle);
  const upperAngle = degToRad(geo.upperArmAngle);

  // Derive inner pivot heights from user-facing params
  const { innerPivotHeightLower, innerPivotHeightUpper } =
    deriveInnerPivotHeights(geo, rideHeight, tyreRadius);

  // Inner pivot positions (on the chassis) — arms span from kingpin inward
  const lowerInnerY = sign * (kingpinHalfTrack - lowerLen * Math.cos(lowerAngle));
  const lowerInnerZ = rideHeight + innerPivotHeightLower;

  const upperInnerY = sign * (kingpinHalfTrack - upperLen * Math.cos(upperAngle));
  const upperInnerZ = rideHeight + innerPivotHeightUpper;

  // Outer pivot positions (at the upright / hub)
  const lowerOuterY = lowerInnerY + sign * lowerLen * Math.cos(lowerAngle);
  const lowerOuterZ = lowerInnerZ + lowerLen * Math.sin(lowerAngle);

  const upperOuterY = upperInnerY + sign * upperLen * Math.cos(upperAngle);
  const upperOuterZ = upperInnerZ + upperLen * Math.sin(upperAngle);

  return {
    lowerInner: { x: lowerInnerY, y: lowerInnerZ } as Point2D,
    lowerOuter: { x: lowerOuterY, y: lowerOuterZ } as Point2D,
    upperInner: { x: upperInnerY, y: upperInnerZ } as Point2D,
    upperOuter: { x: upperOuterY, y: upperOuterZ } as Point2D,
  };
}

// ─── Instant centre ─────────────────────────────────────────────────

/**
 * Compute the instant centre for one side of the vehicle by finding the
 * intersection of lines extended through the upper and lower wishbone arms
 * in the Y-Z (frontal) plane. (§4.1)
 */
export function computeInstantCentre(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  isLeftSide: boolean,
): InstantCentre {
  const pivots = computePivotPositions(geo, rideHeight, tyreRadius, isLeftSide);

  const ic = lineIntersection2D(
    pivots.lowerInner,
    pivots.lowerOuter,
    pivots.upperInner,
    pivots.upperOuter,
  );

  if (!ic) {
    // Parallel arms -> instant centre at infinity, roll centre at ground
    return { y: 0, z: 0 };
  }

  return { y: ic.x, z: ic.y };
}

// ─── Roll centre ────────────────────────────────────────────────────

/**
 * Compute the roll centre height by drawing a line from the tyre contact
 * patch through the instant centre to the vehicle centreline (Y=0). (§4.2)
 */
export function computeRollCentreHeight(
  ic: InstantCentre,
  contactPatchY: number,
  contactPatchZ: number = 0,
): number {
  const cp: Point2D = { x: contactPatchY, y: contactPatchZ };
  const icPoint: Point2D = { x: ic.y, y: ic.z };

  const dY = icPoint.x - cp.x;
  if (Math.abs(dY) < 1e-10) {
    return ic.z;
  }

  const t = -cp.x / dY;
  const rollCentreZ = cp.y + t * (icPoint.y - cp.y);

  return rollCentreZ;
}

// ─── Geometric camber from two-bar linkage ──────────────────────────

/**
 * Compute camber and dynamic ball joint positions by solving the two-bar linkage.
 *
 * As the wheel moves vertically (shockCompression), the lower ball joint
 * moves relative to the chassis. The lower arm is a rigid link so the new
 * lower BJ position is found from the arm length constraint. Then the upper
 * BJ must lie at distance uprightHeight from the lower BJ AND at distance
 * upperLen from the upper inner pivot — a circle-circle intersection. (§8.2)
 *
 * Returns camber angle and the solved ball joint positions for downstream use.
 */
export function computeGeometricCamberAndBJs(
  geo: AxleGeometry,
  _rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): { camber: number; lowerBJY: number; lowerBJZ: number; upperBJY: number; upperBJZ: number } {
  const { lowerLen, upperLen } = armLengths(geo);
  if (lowerLen <= 0) {
    const kpiRad = degToRad(geo.kpiAngle);
    const halfUpright = geo.uprightHeight / 2;
    return {
      camber: geo.staticCamber,
      lowerBJY: geo.trackWidth / 2 - (geo.hubOffset ?? 0),
      lowerBJZ: tyreRadius - halfUpright * Math.cos(kpiRad),
      upperBJY: geo.trackWidth / 2 - (geo.hubOffset ?? 0),
      upperBJZ: tyreRadius + halfUpright * Math.cos(kpiRad),
    };
  }

  const hubOffset = geo.hubOffset ?? 0;
  const kingpinHalfTrack = geo.trackWidth / 2 - hubOffset;
  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;
  const lowerAngle = degToRad(geo.lowerArmAngle);
  const upperAngle = degToRad(geo.upperArmAngle);

  // Static ball joint Z (height above ground)
  const lowerBJZ_static = tyreRadius - halfUpright * Math.cos(kpiRad);
  const upperBJZ_static = tyreRadius + halfUpright * Math.cos(kpiRad);

  // Inner pivot Z (absolute above ground)
  const lowerInnerZ = lowerBJZ_static - lowerLen * Math.sin(lowerAngle);
  const upperInnerZ = upperBJZ_static - upperLen * Math.sin(upperAngle);

  // Inner pivot Y (lateral, measured outward from centreline, unsigned)
  const lowerInnerY = kingpinHalfTrack - lowerLen * Math.cos(lowerAngle);
  const upperInnerY = kingpinHalfTrack - upperLen * Math.cos(upperAngle);

  // New lower BJ Z after compression (wheel moves up relative to chassis)
  const newLowerBJZ = lowerBJZ_static + shockCompression;

  // Lower arm constraint: find new lower BJ Y from arm length
  const lowerDZ = newLowerBJZ - lowerInnerZ;
  const lowerDYSq = lowerLen * lowerLen - lowerDZ * lowerDZ;
  const lowerDY = lowerDYSq > 0 ? Math.sqrt(lowerDYSq) : lowerLen;
  const newLowerBJY = lowerInnerY + lowerDY;

  // Circle-circle intersection for upper BJ:
  //   Circle 1: centre = lower BJ, radius = uprightHeight
  //   Circle 2: centre = upper inner pivot, radius = upperLen
  const lowerBJ: Point2D = { x: newLowerBJY, y: newLowerBJZ };
  const upperInner: Point2D = { x: upperInnerY, y: upperInnerZ };

  const result = circleCircleIntersection(
    lowerBJ, geo.uprightHeight,
    upperInner, upperLen,
  );

  if (!result) {
    // Linkage at limit — fall back to static
    return {
      camber: geo.staticCamber,
      lowerBJY: newLowerBJY,
      lowerBJZ: newLowerBJZ,
      upperBJY: newLowerBJY - halfUpright * Math.sin(kpiRad),
      upperBJZ: newLowerBJZ + halfUpright * Math.cos(kpiRad),
    };
  }

  // Pick the outboard solution (larger Y = further from centreline)
  const upperBJ = result[0].x > result[1].x ? result[0] : result[1];

  // Upright angle from vertical = atan2(lateral offset, vertical offset)
  const uprightDY = upperBJ.x - lowerBJ.x;
  const uprightDZ = upperBJ.y - lowerBJ.y;
  const newUprightAngle = Math.atan2(uprightDY, uprightDZ); // radians from vertical

  // Static upright angle (= KPI at design ride height)
  const staticUprightDY = halfUpright * Math.sin(kpiRad);
  const staticUprightDZ = halfUpright * Math.cos(kpiRad);
  const staticUprightAngle = Math.atan2(staticUprightDY, staticUprightDZ);

  // Camber change = change in upright angle (more inward tilt = more negative camber)
  const camberChange = -(newUprightAngle - staticUprightAngle);

  return {
    camber: geo.staticCamber + radToDeg(camberChange),
    lowerBJY: newLowerBJY,
    lowerBJZ: newLowerBJZ,
    upperBJY: upperBJ.x,
    upperBJZ: upperBJ.y,
  };
}

/**
 * Backward-compatible wrapper for code that only needs the camber angle.
 */
export function computeGeometricCamber(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): number {
  return computeGeometricCamberAndBJs(geo, rideHeight, tyreRadius, shockCompression).camber;
}

// ─── Kingpin axis derived quantities (§3.3) ─────────────────────────

/**
 * Compute KPI (Kingpin Inclination / Steering Axis Inclination) from
 * the actual ball joint positions in the frontal (YZ) plane.
 *
 * KPI = angle between kingpin axis and vertical, viewed from front.
 * Positive = upper ball joint is inboard of lower (normal geometry).
 */
export function computeDynamicKPI(
  lowerBJY: number,
  lowerBJZ: number,
  upperBJY: number,
  upperBJZ: number,
): number {
  // §3.3: KPI = atan2(|ΔY|, |ΔZ|) projected onto YZ plane
  const dY = upperBJY - lowerBJY;
  const dZ = upperBJZ - lowerBJZ;
  // KPI is the angle from vertical — positive means upper BJ is inboard
  // In our convention (unsigned Y from centreline), dY is negative (upper is inboard)
  return radToDeg(Math.atan2(Math.abs(dY), Math.abs(dZ)));
}

/**
 * Compute caster angle from ball joint positions.
 *
 * Caster is the angle of the kingpin axis in the side (XZ) plane.
 * Positive = upper ball joint is rearward of lower. (§3.3)
 *
 * The caster angle is a static geometry parameter applied to the 3D
 * ball joint positions. The upper BJ is offset rearward (negative Z
 * in our forward-positive convention) from the lower BJ.
 */
export function computeDynamicCaster(
  geo: AxleGeometry,
  uprightHeight: number,
): number {
  // For a double-wishbone, caster is set by the inclination of the
  // kingpin axis in the side view. This is a parameter of the upright
  // geometry — the ball joint positions are offset longitudinally.
  // The actual caster angle comes from the geometry parameter.
  // In a more advanced model, wishbone pivot axis inclination would
  // set this dynamically. For now, return the design caster.
  return geo.casterAngle;
}

/**
 * Compute the kingpin axis ground intercept point.
 *
 * Extends the line from A_LO through A_UO until it reaches the ground
 * plane (Y=0 in our convention). Returns the [lateral, longitudinal]
 * position of the intercept. (§3.3)
 */
export function computeKingpinGroundIntercept(
  lowerBJY: number,
  lowerBJZ: number,
  lowerBJX: number,
  upperBJY: number,
  upperBJZ: number,
  upperBJX: number,
): { interceptLateral: number; interceptLongitudinal: number } {
  // Parametric line from lower BJ toward upper BJ: P(t) = lower + t * (upper - lower)
  // Find t where Z component = 0 (ground)
  const dZ = upperBJZ - lowerBJZ;
  if (Math.abs(dZ) < 1e-10) {
    // Kingpin is horizontal — intercept is at infinity
    return { interceptLateral: lowerBJY, interceptLongitudinal: lowerBJX };
  }

  const t = -lowerBJZ / dZ;
  const interceptY = lowerBJY + t * (upperBJY - lowerBJY);
  const interceptX = lowerBJX + t * (upperBJX - lowerBJX);

  return { interceptLateral: interceptY, interceptLongitudinal: interceptX };
}

/**
 * Compute scrub radius (kingpin offset at ground).
 *
 * Scrub radius = Y_ground_intercept - Y_contact_patch (§3.3)
 * Positive: intercept is inboard of contact patch
 * Negative: intercept is outboard
 */
export function computeScrubRadius(
  kingpinInterceptLateral: number,
  contactPatchLateral: number,
  isLeftSide: boolean,
): number {
  // For left side, "inboard" means toward positive Y (centreline)
  // For right side, "inboard" means toward negative Y
  // Scrub radius is positive when intercept is inboard of contact patch
  if (isLeftSide) {
    return kingpinInterceptLateral - contactPatchLateral; // more positive = more inboard
  } else {
    return contactPatchLateral - kingpinInterceptLateral; // more negative = more inboard
  }
}

/**
 * Compute caster trail (mechanical trail).
 *
 * Trail = X_ground_intercept - X_contact_patch (§3.3)
 * Positive: kingpin intercept is ahead of contact patch (self-centering)
 *
 * In our convention, Z = positive forward, so:
 * Trail = Z_ground_intercept - Z_contact_patch
 */
export function computeCasterTrail(
  kingpinInterceptLongitudinal: number,
  contactPatchLongitudinal: number,
): number {
  return kingpinInterceptLongitudinal - contactPatchLongitudinal;
}

// ─── Geometry-dependent motion ratio (§3.9) ─────────────────────────

/**
 * Compute the instantaneous motion ratio from the actual geometry.
 *
 * Motion ratio = d(spring_length) / d(wheel_travel)
 *
 * For a shock mounted on the lower wishbone at fraction `attachmentRatio`
 * along the arm from inner pivot to ball joint:
 *   - Effective lever arm = perpendicular distance from mount point to pivot axis
 *   - Wishbone effective length = perpendicular distance from ball joint to pivot axis
 *   - MR ≈ (lever_arm / wishbone_length) × cos(angle between damper axis and
 *     perpendicular to wishbone arc)
 *
 * This varies with suspension travel because the angle changes.
 */
export function computeGeometricMotionRatio(
  shock: AxleShock,
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): number {
  const { lowerLen } = armLengths(geo);
  if (lowerLen <= 0) return shock.damperAttachmentRatio;

  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;
  const lowerAngle = degToRad(geo.lowerArmAngle);

  // Static lower BJ height
  const lowerBJZ_static = tyreRadius - halfUpright * Math.cos(kpiRad);

  // Inner pivot Z (absolute)
  const lowerInnerZ = lowerBJZ_static - lowerLen * Math.sin(lowerAngle);

  // Current lower BJ Z
  const newLowerBJZ = lowerBJZ_static + shockCompression;

  // Current arm angle from horizontal
  const armDZ = newLowerBJZ - lowerInnerZ;
  const currentArmAngle = Math.asin(Math.max(-1, Math.min(1, armDZ / lowerLen)));

  // Shock mount point on the arm (fraction along arm)
  const frac = shock.damperAttachmentRatio;

  // Perpendicular distance of mount point from pivot axis (= moment arm for spring)
  const mountArmLength = lowerLen * frac;

  // Perpendicular distance of ball joint from pivot axis (= moment arm for wheel)
  // Both are measured perpendicular to the pivot axis in the frontal plane
  // The effective lever arm ratio is simply the fraction
  const leverRatio = frac;

  // Angle correction: the shock axis makes an angle with the perpendicular
  // to the wishbone arc at the mount point. This correction depends on
  // the current shock angle vs the arm's radial direction.
  const shockAngleRad = degToRad(shock.shockAngle);

  // The arm swings in an arc. At the mount point, the velocity direction
  // is tangent to the arc (perpendicular to the arm). The shock axis is
  // inclined at shockAngle from vertical. The effective component is:
  const angleBetween = currentArmAngle + shockAngleRad;
  const cosCorrection = Math.cos(angleBetween);

  // MR = lever_ratio × cos_correction, clamped for sanity
  const mr = Math.max(0.1, Math.min(1.0, leverRatio * Math.abs(cosCorrection)));

  return mr;
}

// ─── 3D ball joint positions with caster ────────────────────────────

/**
 * Compute the 3D ball joint positions including caster offset.
 *
 * The caster angle tilts the kingpin axis rearward in the side (XZ) plane.
 * This means the upper ball joint is offset rearward (negative Z in our
 * forward-positive convention) relative to the lower ball joint. (§3.3)
 *
 * Returns positions as unsigned lateral distance from centreline (Y),
 * height above ground (Z), and longitudinal offset from axle line (X).
 */
export function compute3DBallJoints(
  geo: AxleGeometry,
  lowerBJY: number,
  lowerBJZ: number,
  upperBJY: number,
  upperBJZ: number,
): BallJointPositions {
  const casterRad = degToRad(geo.casterAngle);
  const halfUpright = geo.uprightHeight / 2;

  // The caster angle rotates the kingpin axis in the side view.
  // Lower BJ is forward of the axle line, upper BJ is rearward.
  // Offset = ±halfUpright × sin(caster)
  const lowerLongitudinal = halfUpright * Math.sin(casterRad);
  const upperLongitudinal = -halfUpright * Math.sin(casterRad);

  return {
    lowerBJ: { y: lowerBJY, z: lowerBJZ, x: lowerLongitudinal },
    upperBJ: { y: upperBJY, z: upperBJZ, x: upperLongitudinal },
  };
}

// ─── Ackermann steering ─────────────────────────────────────────────

/**
 * Compute per-wheel steering angles with Ackermann geometry.
 *
 * The steering arms extend inward from each kingpin axis toward the rear axle.
 * A central bellcrank displaces both tie rods laterally by the same amount.
 * The arm length determines how much Ackermann effect is produced — shorter
 * arms give more Ackermann (inner wheel turns more than outer). (§3.11)
 *
 * Returns { leftAngle, rightAngle } in degrees.
 */
export function computeAckermannSteering(
  commandedAngle: number,
  trackWidth: number,
  wheelbase: number,
  ackermannArmLength: number,
  hubOffset: number = 0,
): { leftAngle: number; rightAngle: number } {
  if (Math.abs(commandedAngle) < 1e-6 || ackermannArmLength <= 0) {
    return { leftAngle: commandedAngle, rightAngle: commandedAngle };
  }

  // Steering arms are at the kingpin, not wheel centre
  const halfTrack = trackWidth / 2 - hubOffset;
  const cmdRad = degToRad(commandedAngle);

  // Lateral displacement of tie rod from commanded angle
  const displacement = ackermannArmLength * Math.sin(cmdRad);

  // Each steering arm extends from the kingpin at an angle toward the
  // rear axle centreline. The "Ackermann angle" is: (§3.11)
  const armAngleRad = Math.atan2(halfTrack, wheelbase);

  // At rest, the tie rod attachment point offset from kingpin (lateral component):
  const restLateralOffset = ackermannArmLength * Math.sin(armAngleRad);

  // Bellcrank gives equal lateral displacement to both sides
  const leftLateral = restLateralOffset + displacement;
  const rightLateral = restLateralOffset - displacement;

  // Clamp to arm length
  const leftClamped = Math.max(-ackermannArmLength, Math.min(ackermannArmLength, leftLateral));
  const rightClamped = Math.max(-ackermannArmLength, Math.min(ackermannArmLength, rightLateral));

  const leftArmAngle = Math.asin(leftClamped / ackermannArmLength);
  const rightArmAngle = Math.asin(rightClamped / ackermannArmLength);

  // Steering angle = change in arm angle from rest
  const leftSteer = radToDeg(leftArmAngle - armAngleRad);
  const rightSteer = radToDeg(rightArmAngle - armAngleRad);

  return { leftAngle: leftSteer, rightAngle: rightSteer };
}

// ─── Combined kinematics update ─────────────────────────────────────

/**
 * Update all kinematic quantities for one corner.
 * Computes the full set of derived geometry per the spec (§3.3, §4, §5).
 */
export function updateKinematics(
  geo: AxleGeometry,
  shock: AxleShock,
  rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
  isLeftSide: boolean,
): KinematicsResult {
  const ic = computeInstantCentre(geo, rideHeight, tyreRadius, isLeftSide);

  // Contact patch at wheel centre (trackWidth is wheel-centre-to-wheel-centre)
  const halfTrack = geo.trackWidth / 2;
  const contactPatchY = isLeftSide ? -halfTrack : halfTrack;
  const rollCentreHeight = computeRollCentreHeight(ic, contactPatchY, 0);

  // Solve the 2-bar linkage for camber and ball joint positions
  const bjResult = computeGeometricCamberAndBJs(geo, rideHeight, tyreRadius, shockCompression);
  const camber = bjResult.camber;

  // 3D ball joint positions (add caster offset in longitudinal direction)
  const bjs3D = compute3DBallJoints(
    geo,
    bjResult.lowerBJY, bjResult.lowerBJZ,
    bjResult.upperBJY, bjResult.upperBJZ,
  );

  // Dynamic KPI from actual ball joint positions (§3.3)
  const dynamicKPI = computeDynamicKPI(
    bjResult.lowerBJY, bjResult.lowerBJZ,
    bjResult.upperBJY, bjResult.upperBJZ,
  );

  // Dynamic caster (§3.3)
  const dynamicCaster = computeDynamicCaster(geo, geo.uprightHeight);

  // Kingpin ground intercept (§3.3)
  // Use signed lateral positions for left/right
  const sideSign = isLeftSide ? -1 : 1;
  const lowerBJYSigned = sideSign * bjResult.lowerBJY;
  const upperBJYSigned = sideSign * bjResult.upperBJY;
  const intercept = computeKingpinGroundIntercept(
    lowerBJYSigned, bjResult.lowerBJZ, bjs3D.lowerBJ.x,
    upperBJYSigned, bjResult.upperBJZ, bjs3D.upperBJ.x,
  );

  // Scrub radius (§3.3)
  const scrubRadius = computeScrubRadius(
    intercept.interceptLateral, contactPatchY, isLeftSide,
  );

  // Caster trail (§3.3)
  const casterTrail = computeCasterTrail(
    intercept.interceptLongitudinal, 0, // contact patch is at the axle line
  );

  // Geometry-dependent motion ratio (§3.9)
  const motionRatio = computeGeometricMotionRatio(
    shock, geo, rideHeight, tyreRadius, shockCompression,
  );

  return {
    instantCentre: ic,
    rollCentreHeight,
    camber,
    dynamicKPI,
    dynamicCaster,
    scrubRadius,
    casterTrail,
    motionRatio,
    ballJoints: bjs3D,
  };
}
