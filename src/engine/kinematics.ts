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

// ─── Pivot position helpers ─────────────────────────────────────────

/**
 * Compute the inner and outer pivot positions for upper and lower wishbones
 * in the Y-Z (frontal) plane for one side of the vehicle.
 *
 * Convention:
 *   Y = 0 at vehicle centreline, positive to the right
 *   Z = 0 at ground level, positive up
 */
function computePivotPositions(
  geo: AxleGeometry,
  rideHeight: number,
  isLeftSide: boolean,
) {
  const sign = isLeftSide ? -1 : 1;

  const lowerLen = geo.lowerWishboneLength;
  const upperLen = lowerLen * geo.upperArmLengthRatio;
  const lowerAngle = degToRad(geo.lowerArmAngle);
  const upperAngle = degToRad(geo.upperArmAngle);

  // Inner pivot positions (on the chassis)
  // Lateral: inboard from wheel centreline by the arm's horizontal projection
  // Vertical: ride height + pivot height above chassis reference
  const lowerInnerY = sign * (geo.trackWidth / 2 - lowerLen * Math.cos(lowerAngle));
  const lowerInnerZ = rideHeight + geo.innerPivotHeightLower;

  const upperInnerY = sign * (geo.trackWidth / 2 - upperLen * Math.cos(upperAngle));
  const upperInnerZ = rideHeight + geo.innerPivotHeightUpper;

  // Outer pivot positions (at the upright / hub)
  // The arm extends laterally outward from the inner pivot
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
  isLeftSide: boolean,
): InstantCentre {
  const pivots = computePivotPositions(geo, rideHeight, isLeftSide);

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
  const lowerLen = geo.lowerWishboneLength;
  const upperLen = lowerLen * geo.upperArmLengthRatio;

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
  shockCompression: number,
  isLeftSide: boolean,
): KinematicsResult {
  const ic = computeInstantCentre(geo, rideHeight, isLeftSide);

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
