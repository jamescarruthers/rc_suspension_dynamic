// ─── Wishbone geometry, instant centres, roll centres ────────────────
// All lengths in mm, angles in degrees (inputs) or radians (internal).

import type { AxleGeometry } from '../types/suspension';
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

export interface KinematicsResult {
  instantCentre: InstantCentre;
  rollCentreHeight: number; // mm
  camber: number;           // degrees
}

// ─── Arm lengths ────────────────────────────────────────────────────

/** Derive lower and upper arm lengths (mm) from axle geometry. */
export function armLengths(geo: AxleGeometry): { lowerLen: number; upperLen: number } {
  const lowerLen = geo.lowerWishboneRatio * geo.trackWidth / 2;
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

  const { lowerLen, upperLen } = armLengths(geo);
  const lowerAngle = degToRad(geo.lowerArmAngle);
  const upperAngle = degToRad(geo.upperArmAngle);

  // Derive inner pivot heights from user-facing params
  const { innerPivotHeightLower, innerPivotHeightUpper } =
    deriveInnerPivotHeights(geo, rideHeight, tyreRadius);

  // Inner pivot positions (on the chassis)
  const lowerInnerY = sign * (geo.trackWidth / 2 - lowerLen * Math.cos(lowerAngle));
  const lowerInnerZ = rideHeight + innerPivotHeightLower;

  const upperInnerY = sign * (geo.trackWidth / 2 - upperLen * Math.cos(upperAngle));
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
 * in the Y-Z (frontal) plane.
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
 * patch through the instant centre to the vehicle centreline (Y=0).
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
 * Compute camber geometrically by solving the two-bar linkage.
 *
 * As the wheel moves vertically (shockCompression), the lower ball joint
 * moves relative to the chassis. The lower arm is a rigid link so the new
 * lower BJ position is found from the arm length constraint. Then the upper
 * BJ must lie at distance uprightHeight from the lower BJ AND at distance
 * upperLen from the upper inner pivot — a circle-circle intersection.
 * The upright angle (and thus camber) follows from the resulting BJ positions.
 */
export function computeGeometricCamber(
  geo: AxleGeometry,
  _rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): number {
  const { lowerLen, upperLen } = armLengths(geo);
  if (lowerLen <= 0) return geo.staticCamber;

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
  const lowerInnerY = geo.trackWidth / 2 - lowerLen * Math.cos(lowerAngle);
  const upperInnerY = geo.trackWidth / 2 - upperLen * Math.cos(upperAngle);

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
    // Linkage at limit — fall back to static camber
    return geo.staticCamber;
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

  return geo.staticCamber + radToDeg(camberChange);
}

// ─── Ackermann steering ─────────────────────────────────────────────

/**
 * Compute per-wheel steering angles with Ackermann geometry.
 *
 * The steering arms extend inward from each kingpin axis toward the rear axle.
 * A central bellcrank displaces both tie rods laterally by the same amount.
 * The arm length determines how much Ackermann effect is produced — shorter
 * arms give more Ackermann (inner wheel turns more than outer).
 *
 * Returns { leftAngle, rightAngle } in degrees.
 */
export function computeAckermannSteering(
  commandedAngle: number,
  trackWidth: number,
  wheelbase: number,
  ackermannArmLength: number,
): { leftAngle: number; rightAngle: number } {
  if (Math.abs(commandedAngle) < 1e-6 || ackermannArmLength <= 0) {
    return { leftAngle: commandedAngle, rightAngle: commandedAngle };
  }

  const halfTrack = trackWidth / 2;
  const cmdRad = degToRad(commandedAngle);

  // At rest, left arm tip is at:
  //   x = halfTrack - ackermannArmLength * sin(ackermannAngle) ... simplified:
  // We model the arm as extending from each kingpin inward by armLength.
  // The tie rod attachment at rest:
  //   Left:  y_rest = -halfTrack + armLength (toward centre)
  //   Right: y_rest = halfTrack - armLength (toward centre)
  // The bellcrank displaces both tie rod ends laterally by the same amount.

  // Lateral displacement of tie rod from commanded angle (using average geometry)
  const displacement = ackermannArmLength * Math.sin(cmdRad);

  // Left wheel: arm goes from kingpin at -halfTrack inward (toward +Y)
  // Tie rod end moves from rest position by displacement
  // New arm angle = asin((rest_offset + displacement) / armLength)
  // rest_offset for each side is 0 (arm points straight inward at rest in simplified model)

  // More accurate model: each steering arm extends from the kingpin at an angle
  // toward the rear axle centreline. The "Ackermann angle" is:
  const armAngleRad = Math.atan2(halfTrack, wheelbase);

  // At rest, the tie rod attachment point offset from kingpin (lateral component):
  const restLateralOffset = ackermannArmLength * Math.sin(armAngleRad);

  // Bellcrank gives equal lateral displacement to both sides
  // Left arm: effective lateral = restLateralOffset + displacement
  // Right arm: effective lateral = restLateralOffset - displacement
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
 */
export function updateKinematics(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
  isLeftSide: boolean,
): KinematicsResult {
  const ic = computeInstantCentre(geo, rideHeight, tyreRadius, isLeftSide);

  // Contact patch includes hub offset (axle stub extends outward from kingpin)
  const halfTrack = geo.trackWidth / 2;
  const hubOffset = geo.hubOffset ?? 0;
  const contactPatchY = isLeftSide ? -(halfTrack + hubOffset) : (halfTrack + hubOffset);
  const rollCentreHeight = computeRollCentreHeight(ic, contactPatchY, 0);

  const camber = computeGeometricCamber(geo, rideHeight, tyreRadius, shockCompression);

  return {
    instantCentre: ic,
    rollCentreHeight,
    camber,
  };
}
