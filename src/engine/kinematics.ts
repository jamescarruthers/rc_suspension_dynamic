// ─── Wishbone geometry, instant centres, roll centres ────────────────
// All lengths in mm, angles in degrees (inputs) or radians (internal).

import type { AxleGeometry } from '../types/suspension';
import {
  type Point2D,
  lineIntersection2D,
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

// ─── Camber from travel ─────────────────────────────────────────────

/**
 * Compute the current camber angle given suspension compression.
 *
 * Simplified model: camber changes approximately linearly with travel
 * based on the ratio of upper to lower arm lengths.
 */
export function computeCamberFromTravel(
  geo: AxleGeometry,
  shockCompression: number,
): number {
  const { lowerLen, upperLen } = armLengths(geo);

  if (lowerLen <= 0) return geo.staticCamber;

  const armRatio = upperLen / lowerLen;

  // Degrees of camber change per mm of compression
  // Negative: compression gives negative camber (top in)
  const camberGainRate = -radToDeg(
    (1 - armRatio) / ((lowerLen + upperLen) * 0.5),
  );

  return geo.staticCamber + camberGainRate * shockCompression;
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

  const halfTrack = geo.trackWidth / 2;
  const contactPatchY = isLeftSide ? -halfTrack : halfTrack;
  const rollCentreHeight = computeRollCentreHeight(ic, contactPatchY, 0);

  const camber = computeCamberFromTravel(geo, shockCompression);

  return {
    instantCentre: ic,
    rollCentreHeight,
    camber,
  };
}
