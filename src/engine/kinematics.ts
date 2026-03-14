// ─── 3D Wishbone geometry, instant centres, roll centres ─────────────
// All lengths in mm, angles in degrees (inputs) or radians (internal).
//
// Full 3D kinematic solver per the Suspension Geometry Standard.
// Each ball joint traces a circular arc about its wishbone's 3D pivot
// axis (defined by the fore and aft inner pivots). The pivot axis
// inclination in the side view (from antiDive/antiSquat) produces
// dynamic caster change with suspension travel.
//
// Coordinate frame (Three.js): X=lateral, Y=up, Z=forward.

import type { AxleGeometry, AxleShock, SteeringRack } from '../types/suspension';
import {
  type Vector3,
  type Point2D,
  vec3,
  add,
  sub,
  scale,
  dot,
  cross,
  length,
  normalize,
  closestPointOnLine,
  lineIntersection2D,
  degToRad,
  radToDeg,
} from '../utils/geometry';

// ─── Result types ───────────────────────────────────────────────────

export interface InstantCentre {
  /** Y position in mm (lateral, 0 = vehicle centreline) */
  y: number;
  /** Z position in mm (vertical, 0 = ground) */
  z: number;
}

export interface BallJointPositions {
  /** Lower ball joint [lateral (y), vertical (z), longitudinal (x)] in mm */
  lowerBJ: { y: number; z: number; x: number };
  /** Upper ball joint [lateral (y), vertical (z), longitudinal (x)] in mm */
  upperBJ: { y: number; z: number; x: number };
}

export interface KinematicsResult {
  instantCentre: InstantCentre;
  rollCentreHeight: number;   // mm
  camber: number;             // degrees (negative = top tilts inward)
  dynamicKPI: number;         // degrees (kingpin inclination, frontal plane)
  dynamicCaster: number;      // degrees (now truly dynamic — varies with travel)
  scrubRadius: number;        // mm (positive = intercept inboard of contact patch)
  casterTrail: number;        // mm (positive = intercept ahead of contact patch)
  motionRatio: number;        // instantaneous d(spring)/d(wheel)
  ballJoints: BallJointPositions;
}

// ─── 3D inner pivot positions ───────────────────────────────────────

export interface InnerPivots3D {
  lowerFore: Vector3;   // A_LF
  lowerAft: Vector3;    // A_LR
  upperFore: Vector3;   // A_UF
  upperAft: Vector3;    // A_UR
  lowerAxis: Vector3;   // normalized pivot axis direction
  upperAxis: Vector3;   // normalized pivot axis direction
}

/**
 * Compute the 3D inner pivot positions for one side of the vehicle.
 *
 * The fore/aft inner pivots have a height difference set by antiDive
 * (front) or antiSquat (rear). This tilts the pivot axis in the side
 * view, which is what produces dynamic caster change. (§3.1, §4.4)
 *
 * Convention: positive antiDive/antiSquat means the fore pivot is higher
 * than the aft pivot (pivot axis slopes downward toward the rear),
 * matching real suspension where the side-view IC is above and behind
 * the contact patch.
 *
 * All positions returned as unsigned lateral distance from centreline,
 * absolute height above ground, and longitudinal offset from axle line.
 */
export function compute3DInnerPivots(
  geo: AxleGeometry,
  _rideHeight: number,
  tyreRadius: number,
): InnerPivots3D {
  const { lowerLen, upperLen } = armLengths(geo);
  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;
  const lowerAngle = degToRad(geo.lowerArmAngle);
  const upperAngle = degToRad(geo.upperArmAngle);
  const hubOffset = geo.hubOffset ?? 0;
  const kingpinHalfTrack = geo.trackWidth / 2 - hubOffset;

  // Side-view angle: antiDive for front, antiSquat for rear
  // Both stored in degrees; use whichever is nonzero
  const sideViewAngle = degToRad(geo.antiDive || geo.antiSquat || 0);

  // Static ball joint heights (above ground)
  const lowerBJZ = tyreRadius - halfUpright * Math.cos(kpiRad);
  const upperBJZ = tyreRadius + halfUpright * Math.cos(kpiRad);

  // Inner pivot height midpoints (absolute above ground)
  const lowerInnerZ = lowerBJZ - lowerLen * Math.sin(lowerAngle);
  const upperInnerZ = upperBJZ - upperLen * Math.sin(upperAngle);

  // Inner pivot lateral positions (unsigned distance from centreline)
  const lowerInnerY = kingpinHalfTrack - lowerLen * Math.cos(lowerAngle);
  const upperInnerY = kingpinHalfTrack - upperLen * Math.cos(upperAngle);

  // Height difference between fore and aft pivots from side-view angle
  // tan(sideViewAngle) = heightDiff / (spread/2)
  // So total height diff across the full spread = spread * tan(sideViewAngle)
  const lowerHalfSpread = geo.innerPivotSpread / 2;
  const lowerHeightDiffHalf = lowerHalfSpread * Math.tan(sideViewAngle);

  const upperHalfSpread = (geo.upperInnerPivotSpread ?? geo.innerPivotSpread) / 2;
  const upperHeightDiffHalf = upperHalfSpread * Math.tan(sideViewAngle);

  // Fore pivot is higher (positive antiDive: axis slopes down toward rear)
  // Lower wishbone
  const lowerFore = vec3(lowerInnerY, lowerInnerZ + lowerHeightDiffHalf, lowerHalfSpread);
  const lowerAft = vec3(lowerInnerY, lowerInnerZ - lowerHeightDiffHalf, -lowerHalfSpread);

  // Upper wishbone — separate pivot spread, same side-view inclination
  const upperFore = vec3(upperInnerY, upperInnerZ + upperHeightDiffHalf, upperHalfSpread);
  const upperAft = vec3(upperInnerY, upperInnerZ - upperHeightDiffHalf, -upperHalfSpread);

  const lowerAxis = normalize(sub(lowerAft, lowerFore));
  const upperAxis = normalize(sub(upperAft, upperFore));

  return { lowerFore, lowerAft, upperFore, upperAft, lowerAxis, upperAxis };
}

// ─── Arm lengths ────────────────────────────────────────────────────

/** Derive lower and upper arm lengths (mm) from axle geometry. */
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
 * Returns heights relative to chassis reference (add rideHeight for absolute).
 */
export function deriveInnerPivotHeights(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
): { innerPivotHeightLower: number; innerPivotHeightUpper: number } {
  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;

  const lowerBallJointZ = tyreRadius - halfUpright * Math.cos(kpiRad);
  const upperBallJointZ = tyreRadius + halfUpright * Math.cos(kpiRad);

  const { lowerLen, upperLen } = armLengths(geo);

  const lowerInnerZ = lowerBallJointZ - lowerLen * Math.sin(degToRad(geo.lowerArmAngle));
  const upperInnerZ = upperBallJointZ - upperLen * Math.sin(degToRad(geo.upperArmAngle));

  return {
    innerPivotHeightLower: lowerInnerZ - rideHeight,
    innerPivotHeightUpper: upperInnerZ - rideHeight,
  };
}

// ─── 3D ball joint solver (§8.2) ────────────────────────────────────

/**
 * Compute the static 3D ball joint positions at ride height.
 *
 * The caster angle sets the initial longitudinal offset of the ball joints.
 * Lower BJ is forward, upper BJ is rearward, by ±halfUpright × sin(caster).
 */
function computeStaticBallJoints3D(
  geo: AxleGeometry,
  tyreRadius: number,
): { lowerBJ: Vector3; upperBJ: Vector3 } {
  const kpiRad = degToRad(geo.kpiAngle);
  const casterRad = degToRad(geo.casterAngle);
  const halfUpright = geo.uprightHeight / 2;
  const hubOffset = geo.hubOffset ?? 0;
  const kingpinHalfTrack = geo.trackWidth / 2 - hubOffset;

  // Lateral position (unsigned, from centreline) = at the kingpin
  const bjY = kingpinHalfTrack;

  // Vertical positions
  const lowerBJZ = tyreRadius - halfUpright * Math.cos(kpiRad);
  const upperBJZ = tyreRadius + halfUpright * Math.cos(kpiRad);

  // Longitudinal positions from caster (lower is forward, upper is rearward)
  const lowerBJX = halfUpright * Math.sin(casterRad);
  const upperBJX = -halfUpright * Math.sin(casterRad);

  // Lateral offset from KPI (lower is outboard, upper is inboard)
  const lowerBJY_offset = halfUpright * Math.sin(kpiRad);
  const upperBJY_offset = -halfUpright * Math.sin(kpiRad);

  return {
    lowerBJ: vec3(bjY + lowerBJY_offset, lowerBJZ, lowerBJX),
    upperBJ: vec3(bjY + upperBJY_offset, upperBJZ, upperBJX),
  };
}

/**
 * Solve the 3D coupled ball joint constraint.
 *
 * Given a vertical wheel displacement (shockCompression), find the
 * positions of both ball joints on their respective 3D arcs such that
 * the upright distance constraint is satisfied.
 *
 * Algorithm:
 * 1. Lower BJ traces a circle about the lower pivot axis. Given the
 *    target Y (vertical) displacement, solve for the arc angle.
 * 2. With the lower BJ position known, find the upper BJ on its arc
 *    at distance uprightHeight from the lower BJ (sphere-circle intersection).
 *
 * Returns full 3D positions and derived angles.
 */
export function solve3DCoupledBallJoints(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): {
  camber: number;
  dynamicCaster: number;
  lowerBJ: Vector3;
  upperBJ: Vector3;
} {
  const { lowerLen } = armLengths(geo);
  const staticBJs = computeStaticBallJoints3D(geo, tyreRadius);
  const pivots = compute3DInnerPivots(geo, rideHeight, tyreRadius);

  if (lowerLen <= 0) {
    return {
      camber: geo.staticCamber,
      dynamicCaster: geo.casterAngle,
      lowerBJ: staticBJs.lowerBJ,
      upperBJ: staticBJs.upperBJ,
    };
  }

  // ── Step 1: Solve lower ball joint arc angle from vertical displacement ──

  // The lower BJ traces a circle about the lower pivot axis.
  // Find the axis point closest to the static lower BJ.
  const lowerAxisPt = closestPointOnLine(staticBJs.lowerBJ, pivots.lowerFore, pivots.lowerAxis);

  // Arc radius = perpendicular distance from BJ to pivot axis
  const lowerArcRadius = length(sub(staticBJs.lowerBJ, lowerAxisPt));

  // Build an orthonormal basis in the plane perpendicular to the lower axis
  const lowerRadial = normalize(sub(staticBJs.lowerBJ, lowerAxisPt)); // e1
  const lowerTangent = normalize(cross(pivots.lowerAxis, lowerRadial)); // e2

  // Target Y for lower BJ
  const targetLowerY = staticBJs.lowerBJ.y + shockCompression;

  // Lower BJ position as function of angle θ:
  //   P(θ) = lowerAxisPt + lowerArcRadius * (cos(θ) * e1 + sin(θ) * e2)
  // At θ=0, P = staticBJs.lowerBJ (by construction of e1).
  //
  // We need P(θ).y = targetLowerY:
  //   lowerAxisPt.y + R * (cos(θ) * e1.y + sin(θ) * e2.y) = targetLowerY
  //   cos(θ) * e1.y + sin(θ) * e2.y = (targetLowerY - lowerAxisPt.y) / R
  //
  // This is A*cos(θ) + B*sin(θ) = C, solved by:
  //   θ = atan2(B, A) - acos(C / sqrt(A² + B²))
  // (choosing the sign of acos that keeps the BJ outboard)

  const A_l = lowerRadial.y;
  const B_l = lowerTangent.y;
  const C_l = (targetLowerY - lowerAxisPt.y) / lowerArcRadius;
  const mag_l = Math.sqrt(A_l * A_l + B_l * B_l);

  let thetaLower = 0;
  if (mag_l > 1e-10 && Math.abs(C_l / mag_l) <= 1) {
    const phi_l = Math.atan2(B_l, A_l);
    const acosArg = Math.max(-1, Math.min(1, C_l / mag_l));
    // Two solutions: phi - acos and phi + acos. Pick the one closest to 0.
    const t1 = phi_l - Math.acos(acosArg);
    const t2 = phi_l + Math.acos(acosArg);
    // Normalize both to [-π, π]
    const norm = (a: number) => { let r = a % (2 * Math.PI); if (r > Math.PI) r -= 2 * Math.PI; if (r < -Math.PI) r += 2 * Math.PI; return r; };
    const n1 = norm(t1), n2 = norm(t2);
    thetaLower = Math.abs(n1) < Math.abs(n2) ? n1 : n2;
  } else if (mag_l > 1e-10) {
    // C/mag > 1: linkage at limit, clamp
    thetaLower = Math.atan2(B_l, A_l);
  }

  // Compute new lower BJ position
  const newLowerBJ = add(lowerAxisPt, add(
    scale(lowerRadial, lowerArcRadius * Math.cos(thetaLower)),
    scale(lowerTangent, lowerArcRadius * Math.sin(thetaLower)),
  ));

  // ── Step 2: Solve upper BJ via sphere-circle intersection ──

  // Upper BJ traces a circle about the upper pivot axis.
  const upperAxisPt = closestPointOnLine(staticBJs.upperBJ, pivots.upperFore, pivots.upperAxis);
  const upperArcRadius = length(sub(staticBJs.upperBJ, upperAxisPt));
  const upperRadial = normalize(sub(staticBJs.upperBJ, upperAxisPt));
  const upperTangent = normalize(cross(pivots.upperAxis, upperRadial));

  // We need |P_upper(θ) - newLowerBJ| = uprightHeight
  // P_upper(θ) = upperAxisPt + R * (cos(θ) * e1 + sin(θ) * e2)
  //
  // |P_upper - newLowerBJ|² = uprightHeight²
  //
  // Let Q = newLowerBJ - upperAxisPt
  // Let R = upperArcRadius
  // Then |R*(cos θ * e1 + sin θ * e2) - Q|² = uprightHeight²
  //
  // Expanding:
  //   R² - 2R*(cos θ * dot(e1,Q) + sin θ * dot(e2,Q)) + |Q|² = uprightHeight²
  //
  // So: cos θ * dot(e1,Q) + sin θ * dot(e2,Q) = (R² + |Q|² - uprightHeight²) / (2R)

  const Q = sub(newLowerBJ, upperAxisPt);
  const Qe1 = dot(upperRadial, Q);
  const Qe2 = dot(upperTangent, Q);
  const Q_total_sq = dot(Q, Q);

  const R_u = upperArcRadius;
  const D_sq = geo.uprightHeight * geo.uprightHeight;
  const rhs = (R_u * R_u + Q_total_sq - D_sq) / (2 * R_u);

  const A_u = Qe1;
  const B_u = Qe2;
  const mag_u = Math.sqrt(A_u * A_u + B_u * B_u);

  let thetaUpper = 0;
  let solved = false;

  if (mag_u > 1e-10 && Math.abs(rhs / mag_u) <= 1) {
    const phi_u = Math.atan2(B_u, A_u);
    const acosArg = Math.max(-1, Math.min(1, rhs / mag_u));
    const t1 = phi_u - Math.acos(acosArg);
    const t2 = phi_u + Math.acos(acosArg);

    // Pick the solution where upper BJ is inboard and above lower BJ (outboard solution)
    const p1 = add(upperAxisPt, add(
      scale(upperRadial, R_u * Math.cos(t1)),
      scale(upperTangent, R_u * Math.sin(t1)),
    ));
    const p2 = add(upperAxisPt, add(
      scale(upperRadial, R_u * Math.cos(t2)),
      scale(upperTangent, R_u * Math.sin(t2)),
    ));

    // Upper BJ should be above and inboard: pick the one with higher Y
    // (in rare ambiguous cases, prefer the one closest to static)
    if (p1.y > p2.y) {
      thetaUpper = t1;
    } else {
      thetaUpper = t2;
    }
    solved = true;
  }

  let newUpperBJ: Vector3;
  if (solved) {
    newUpperBJ = add(upperAxisPt, add(
      scale(upperRadial, R_u * Math.cos(thetaUpper)),
      scale(upperTangent, R_u * Math.sin(thetaUpper)),
    ));
  } else {
    // Fallback: use static offset from lower BJ
    const kpiRad = degToRad(geo.kpiAngle);
    const casterRad = degToRad(geo.casterAngle);
    const halfUpright = geo.uprightHeight / 2;
    newUpperBJ = vec3(
      newLowerBJ.x - halfUpright * Math.sin(kpiRad),
      newLowerBJ.y + geo.uprightHeight * Math.cos(kpiRad),
      newLowerBJ.z - 2 * halfUpright * Math.sin(casterRad),
    );
  }

  // ── Step 3: Extract camber and caster from 3D positions ──

  const dx_lat = newUpperBJ.x - newLowerBJ.x;  // lateral (negative = upper is inboard)
  const dy_vert = newUpperBJ.y - newLowerBJ.y;  // vertical (positive = upper is above)
  const dz_long = newLowerBJ.z - newUpperBJ.z;  // longitudinal (positive = lower is forward = positive caster)

  // Camber from frontal (XY) projection
  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;
  const newUprightAngle = Math.atan2(Math.abs(dx_lat), Math.abs(dy_vert));
  const staticUprightAngle = Math.atan2(halfUpright * Math.sin(kpiRad), halfUpright * Math.cos(kpiRad));
  const camberChange = -(newUprightAngle - staticUprightAngle);
  const camber = geo.staticCamber + radToDeg(camberChange);

  // Caster from side (ZY) projection (§3.3)
  // Caster = atan2(dZ_longitudinal, dY_vertical) where dZ = lower.z - upper.z
  const dynamicCaster = radToDeg(Math.atan2(dz_long, Math.abs(dy_vert)));

  return {
    camber,
    dynamicCaster,
    lowerBJ: newLowerBJ,
    upperBJ: newUpperBJ,
  };
}

// ─── Backward-compatible wrappers ───────────────────────────────────

/**
 * Backward-compatible wrapper for code that only needs the camber angle.
 */
export function computeGeometricCamber(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): number {
  return solve3DCoupledBallJoints(geo, rideHeight, tyreRadius, shockCompression).camber;
}

// ─── Pivot position helpers (2D frontal plane, for IC/RC) ───────────

/**
 * Compute the inner and outer pivot positions for upper and lower wishbones
 * in the Y-Z (frontal) plane for one side of the vehicle. Used for
 * instant centre and roll centre computation.
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

  const { innerPivotHeightLower, innerPivotHeightUpper } =
    deriveInnerPivotHeights(geo, rideHeight, tyreRadius);

  const lowerInnerY = sign * (kingpinHalfTrack - lowerLen * Math.cos(lowerAngle));
  const lowerInnerZ = rideHeight + innerPivotHeightLower;
  const upperInnerY = sign * (kingpinHalfTrack - upperLen * Math.cos(upperAngle));
  const upperInnerZ = rideHeight + innerPivotHeightUpper;

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

// ─── Instant centre (§4.1) ──────────────────────────────────────────

export function computeInstantCentre(
  geo: AxleGeometry,
  rideHeight: number,
  tyreRadius: number,
  isLeftSide: boolean,
): InstantCentre {
  const pivots = computePivotPositions(geo, rideHeight, tyreRadius, isLeftSide);

  const ic = lineIntersection2D(
    pivots.lowerInner, pivots.lowerOuter,
    pivots.upperInner, pivots.upperOuter,
  );

  if (!ic) {
    return { y: 0, z: 0 };
  }

  return { y: ic.x, z: ic.y };
}

// ─── Roll centre (§4.2) ─────────────────────────────────────────────

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
  return cp.y + t * (icPoint.y - cp.y);
}

// ─── Kingpin derived quantities (§3.3) ──────────────────────────────

export function computeDynamicKPI(
  lowerBJY: number,
  lowerBJZ: number,
  upperBJY: number,
  upperBJZ: number,
): number {
  const dY = upperBJY - lowerBJY;
  const dZ = upperBJZ - lowerBJZ;
  return radToDeg(Math.atan2(Math.abs(dY), Math.abs(dZ)));
}

export function computeKingpinGroundIntercept(
  lowerBJY: number, lowerBJZ: number, lowerBJX: number,
  upperBJY: number, upperBJZ: number, upperBJX: number,
): { interceptLateral: number; interceptLongitudinal: number } {
  const dZ = upperBJZ - lowerBJZ;
  if (Math.abs(dZ) < 1e-10) {
    return { interceptLateral: lowerBJY, interceptLongitudinal: lowerBJX };
  }

  const t = -lowerBJZ / dZ;
  return {
    interceptLateral: lowerBJY + t * (upperBJY - lowerBJY),
    interceptLongitudinal: lowerBJX + t * (upperBJX - lowerBJX),
  };
}

export function computeScrubRadius(
  kingpinInterceptLateral: number,
  contactPatchLateral: number,
  isLeftSide: boolean,
): number {
  if (isLeftSide) {
    return kingpinInterceptLateral - contactPatchLateral;
  } else {
    return contactPatchLateral - kingpinInterceptLateral;
  }
}

export function computeCasterTrail(
  kingpinInterceptLongitudinal: number,
  contactPatchLongitudinal: number,
): number {
  return kingpinInterceptLongitudinal - contactPatchLongitudinal;
}

// ─── Geometry-dependent motion ratio (§3.9) ─────────────────────────

export function computeGeometricMotionRatio(
  shock: AxleShock,
  geo: AxleGeometry,
  _rideHeight: number,
  tyreRadius: number,
  shockCompression: number,
): number {
  const { lowerLen } = armLengths(geo);
  if (lowerLen <= 0) return shock.damperAttachmentRatio;

  const kpiRad = degToRad(geo.kpiAngle);
  const halfUpright = geo.uprightHeight / 2;
  const lowerAngle = degToRad(geo.lowerArmAngle);

  const lowerBJZ_static = tyreRadius - halfUpright * Math.cos(kpiRad);
  const lowerInnerZ = lowerBJZ_static - lowerLen * Math.sin(lowerAngle);
  const newLowerBJZ = lowerBJZ_static + shockCompression;

  const armDZ = newLowerBJZ - lowerInnerZ;
  const currentArmAngle = Math.asin(Math.max(-1, Math.min(1, armDZ / lowerLen)));

  const frac = shock.damperAttachmentRatio;
  const leverRatio = frac;

  const shockAngleRad = degToRad(shock.shockAngle);
  const angleBetween = currentArmAngle + shockAngleRad;
  const cosCorrection = Math.cos(angleBetween);

  return Math.max(0.1, Math.min(1.0, leverRatio * Math.abs(cosCorrection)));
}

// ─── Rack-based steering (§3.11) ─────────────────────────────────────

/**
 * Compute per-wheel steering angles using a steering rack with tie rods.
 *
 * The rack translates laterally; tie rods connect the rack ends to the
 * steering arm tips on each upright. The tie rod length constraint
 * determines the actual steer angle at each wheel, producing natural
 * Ackermann geometry from the mechanism.
 *
 * Algorithm:
 * 1. Convert commanded angle to rack lateral displacement
 * 2. Compute tie rod inner end positions (on rack, displaced)
 * 3. Compute steering arm rest geometry (at lower ball joint height)
 * 4. Solve tie rod length constraint for each wheel's steer angle
 *
 * Coordinate frame: X = lateral, Y = up, Z = forward (Three.js convention)
 */
export function computeRackSteering(
  commandedAngle: number,
  geo: AxleGeometry,
  rack: SteeringRack,
  wheelbase: number,
): { leftAngle: number; rightAngle: number; rackDisplacement: number } {
  if (Math.abs(commandedAngle) < 1e-6 || geo.ackermannArmLength <= 0) {
    return { leftAngle: commandedAngle, rightAngle: commandedAngle, rackDisplacement: 0 };
  }

  const hubOffset = geo.hubOffset ?? 0;
  const kingpinHalfTrack = geo.trackWidth / 2 - hubOffset;

  // Steering arm rest angle: the arm points inward toward the rear axle centre
  // for Ackermann geometry. armAngleRest is measured from the lateral axis.
  const armAngleRest = Math.atan2(kingpinHalfTrack, wheelbase);

  // Convert commanded angle to rack displacement.
  // The rack displacement is the lateral shift that produces the commanded
  // average steer angle via the steering arm geometry.
  const cmdRad = degToRad(commandedAngle);
  const rackDisplacement = geo.ackermannArmLength * Math.sin(cmdRad);

  // Rack inner end positions (Y=lateral, Z=forward from axle)
  // At rest (centred), the tie rod inner ends are at ±rackWidth/2 laterally,
  // at rackHeight vertically, at rackForwardOffset longitudinally.
  const halfRackWidth = rack.rackWidth / 2;

  // Displaced rack inner end lateral positions
  // Left inner end (negative lateral in our convention, but using unsigned here)
  const leftInnerLateral = halfRackWidth - rackDisplacement;   // moves inboard when rack displaces right
  const rightInnerLateral = halfRackWidth + rackDisplacement;  // moves outboard when rack displaces right

  // Steering arm tip at rest (A_ST), relative to the lower ball joint:
  // The arm extends inward and rearward from the kingpin axis.
  // In plan view, it points toward the rear axle centre at angle armAngleRest.
  // Lateral: kingpinHalfTrack - ackermannArmLength * cos(armAngleRest)
  // Longitudinal: -ackermannArmLength * sin(armAngleRest) (rearward)
  // armTipLateral = kingpinHalfTrack - ackermannArmLength * cos(armAngleRest)
  // armTipLongitudinal = -ackermannArmLength * sin(armAngleRest)

  // Steering arm tip height = lower ball joint height (approximation at ride height)
  // The tie rod inner end is at rack height. Arm tip is at lower BJ height.
  // For the tie rod length constraint, we work in 3D.

  // Solve each side: find steer angle φ such that the distance from
  // the displaced rack inner end to the steered arm tip equals tieRodLength.
  const solveSteerAngle = (innerLateral: number, _sideSign: number): number => {
    // Rack inner end position (unsigned lateral, height, longitudinal)
    const rackX = innerLateral;       // lateral (unsigned, from centreline)
    const rackZ = rack.rackForwardOffset;  // longitudinal offset from axle

    // Arm tip traces a circle about the kingpin axis as it steers.
    // At steer angle φ, the arm tip position is:
    //   lateral: kingpinHalfTrack - ackermannArmLength * cos(armAngleRest + φ)
    //   longitudinal: -ackermannArmLength * sin(armAngleRest + φ)
    //
    // Tie rod constraint: distance from rack end to arm tip = tieRodLength
    // We solve in the horizontal (XZ) plane since the height difference is constant.
    //
    // The vertical component of the tie rod contributes a constant offset to the length.
    // Effective horizontal tie rod length:
    // L_horiz² = tieRodLength² - (rackHeight - armTipHeight)²
    // We need the ball joint height — use a simplified version at ride height.
    const kpiRad = degToRad(geo.kpiAngle);
    const halfUpright = geo.uprightHeight / 2;
    const tyreRadiusApprox = 35; // doesn't affect the angle, just the height delta
    const lowerBJHeight = tyreRadiusApprox - halfUpright * Math.cos(kpiRad);
    const heightDiff = rack.rackHeight - lowerBJHeight;
    const tieRodLenSq = rack.tieRodLength * rack.tieRodLength;
    const heightDiffSq = heightDiff * heightDiff;
    const horizLenSq = Math.max(tieRodLenSq - heightDiffSq, 1);

    // Solve: |armTip - rackEnd|² = horizLenSq  (in the lateral/longitudinal plane)
    // armTip(φ):
    //   lateral = kingpinHalfTrack - ackermannArmLength * cos(armAngleRest + φ)
    //   long    = -ackermannArmLength * sin(armAngleRest + φ)
    //
    // rackEnd:
    //   lateral = rackX
    //   long    = rackZ
    //
    // (armLat - rackX)² + (armLong - rackZ)² = horizLenSq
    //
    // Let α = armAngleRest + φ
    // dx = kingpinHalfTrack - ackermannArmLength * cos(α) - rackX
    // dz = -ackermannArmLength * sin(α) - rackZ
    //
    // This is nonlinear in α. Use Newton's method starting from φ=0.

    const L = geo.ackermannArmLength;
    let phi = 0;
    for (let iter = 0; iter < 20; iter++) {
      const alpha = armAngleRest + phi;
      const cosA = Math.cos(alpha);
      const sinA = Math.sin(alpha);

      const armLat = kingpinHalfTrack - L * cosA;
      const armLong = -L * sinA;

      const dx = armLat - rackX;
      const dz = armLong - rackZ;
      const distSq = dx * dx + dz * dz;

      // f(φ) = distSq - horizLenSq = 0
      const f = distSq - horizLenSq;

      // f'(φ) = 2 * (dx * d(armLat)/dφ + dz * d(armLong)/dφ)
      // d(armLat)/dφ = L * sin(α)
      // d(armLong)/dφ = -L * cos(α)
      const dArmLat = L * sinA;
      const dArmLong = -L * cosA;
      const fp = 2 * (dx * dArmLat + dz * dArmLong);

      if (Math.abs(fp) < 1e-12) break;
      const step = f / fp;
      phi -= step;
      if (Math.abs(step) < 1e-8) break;
    }

    return radToDeg(phi);
  };

  // Left side: inner lateral is on the left (sideSign = -1)
  const leftAngle = solveSteerAngle(leftInnerLateral, -1);
  // Right side: inner lateral is on the right (sideSign = 1)
  const rightAngle = solveSteerAngle(rightInnerLateral, 1);

  return { leftAngle, rightAngle, rackDisplacement };
}

/**
 * Legacy Ackermann steering (direct arm-to-arm, no rack).
 * Kept for backward compatibility with code that doesn't have rack parameters.
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

  const halfTrack = trackWidth / 2 - hubOffset;
  const cmdRad = degToRad(commandedAngle);
  const displacement = ackermannArmLength * Math.sin(cmdRad);

  const armAngleRad = Math.atan2(halfTrack, wheelbase);
  const restLateralOffset = ackermannArmLength * Math.sin(armAngleRad);

  const leftLateral = restLateralOffset + displacement;
  const rightLateral = restLateralOffset - displacement;

  const leftClamped = Math.max(-ackermannArmLength, Math.min(ackermannArmLength, leftLateral));
  const rightClamped = Math.max(-ackermannArmLength, Math.min(ackermannArmLength, rightLateral));

  const leftArmAngle = Math.asin(leftClamped / ackermannArmLength);
  const rightArmAngle = Math.asin(rightClamped / ackermannArmLength);

  return {
    leftAngle: radToDeg(leftArmAngle - armAngleRad),
    rightAngle: radToDeg(rightArmAngle - armAngleRad),
  };
}

// ─── Combined kinematics update ─────────────────────────────────────

/**
 * Update all kinematic quantities for one corner.
 * Uses the full 3D solver for dynamic camber AND caster.
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

  const halfTrack = geo.trackWidth / 2;
  const contactPatchY = isLeftSide ? -halfTrack : halfTrack;
  const rollCentreHeight = computeRollCentreHeight(ic, contactPatchY, 0);

  // ── Full 3D solve for camber and caster ──
  const result3D = solve3DCoupledBallJoints(geo, rideHeight, tyreRadius, shockCompression);
  const camber = result3D.camber;
  const dynamicCaster = result3D.dynamicCaster;

  // Convert to BallJointPositions format
  const ballJoints: BallJointPositions = {
    lowerBJ: { y: result3D.lowerBJ.x, z: result3D.lowerBJ.y, x: result3D.lowerBJ.z },
    upperBJ: { y: result3D.upperBJ.x, z: result3D.upperBJ.y, x: result3D.upperBJ.z },
  };

  // Dynamic KPI from actual ball joint positions
  const dynamicKPI = computeDynamicKPI(
    result3D.lowerBJ.x, result3D.lowerBJ.y,
    result3D.upperBJ.x, result3D.upperBJ.y,
  );

  // Kingpin ground intercept
  const sideSign = isLeftSide ? -1 : 1;
  const lowerBJYSigned = sideSign * result3D.lowerBJ.x;
  const upperBJYSigned = sideSign * result3D.upperBJ.x;
  const intercept = computeKingpinGroundIntercept(
    lowerBJYSigned, result3D.lowerBJ.y, result3D.lowerBJ.z,
    upperBJYSigned, result3D.upperBJ.y, result3D.upperBJ.z,
  );

  const scrubRadius = computeScrubRadius(intercept.interceptLateral, contactPatchY, isLeftSide);
  const casterTrail = computeCasterTrail(intercept.interceptLongitudinal, 0);

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
    ballJoints,
  };
}
