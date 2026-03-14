// ─── RK4 (4th-order Runge-Kutta) physics engine ─────────────────────────────
//
// Provides 4th-order accurate integration of the suspension ODEs.
// The local truncation error scales with dt⁵, giving roughly 10⁹× less error
// than first-order Euler for the same timestep (1 kHz).
//
// State vector layout (14 elements):
//   [0]  chassisHeave        (mm)
//   [1]  rollAngle           (rad)
//   [2]  pitchAngle          (rad)
//   [3]  wheelPos FL         (mm)
//   [4]  wheelPos FR         (mm)
//   [5]  wheelPos RL         (mm)
//   [6]  wheelPos RR         (mm)
//   [7]  chassisHeaveVel     (mm/s)
//   [8]  rollVel             (rad/s)
//   [9]  pitchVel            (rad/s)
//   [10] wheelVel FL         (mm/s)
//   [11] wheelVel FR         (mm/s)
//   [12] wheelVel RL         (mm/s)
//   [13] wheelVel RR         (mm/s)

import type {
  Corner,
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
  SteeringRack,
  HydraulicConfig,
  PerCornerState,
  SimulationState,
} from '../types/suspension';

import { CORNERS } from '../types/suspension';
import { computeTyreForce } from './tyreContact';
import { computeCornerForces, computeSwayBarForce } from './forces';
import { computeAccelerations, computeLeverArms, type CornerForceInputs } from './dynamics';
import { computeHydraulicForces } from './hydraulics';
import { updateKinematics, computeRackSteering, computeGeometricMotionRatio, computeSteeringCamberGain, computeAckermannPercent } from './kinematics';
import { getGroundHeightAndVelocity, type CornerPositions } from './roadSurface';

// ─── State vector indices ────────────────────────────────────────────────────

const S_HEAVE = 0;
const S_ROLL = 1;
const S_PITCH = 2;
const S_WHEEL_FL = 3;
const S_WHEEL_FR = 4;
const S_WHEEL_RL = 5;
const S_WHEEL_RR = 6;
const S_VHEAVE = 7;
const S_VROLL = 8;
const S_VPITCH = 9;
const S_VWHEEL_FL = 10;
const S_VWHEEL_FR = 11;
const S_VWHEEL_RL = 12;
const S_VWHEEL_RR = 13;
const STATE_SIZE = 14;

const WHEEL_POS_INDICES = [S_WHEEL_FL, S_WHEEL_FR, S_WHEEL_RL, S_WHEEL_RR];
const WHEEL_VEL_INDICES = [S_VWHEEL_FL, S_VWHEEL_FR, S_VWHEEL_RL, S_VWHEEL_RR];

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ─── Zero-allocation RK4 integrator ─────────────────────────────────────────

class RK4Integrator {
  private k1: Float64Array;
  private k2: Float64Array;
  private k3: Float64Array;
  private k4: Float64Array;
  private temp: Float64Array;

  constructor(n: number) {
    this.k1 = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.k3 = new Float64Array(n);
    this.k4 = new Float64Array(n);
    this.temp = new Float64Array(n);
  }

  step(
    state: Float64Array,
    t: number,
    dt: number,
    derivs: (t: number, y: Float64Array, dydt: Float64Array) => void,
  ): void {
    const n = state.length;
    const { k1, k2, k3, k4, temp } = this;
    const halfDt = dt * 0.5;
    const sixthDt = dt / 6.0;

    // k1 = f(t, state)
    derivs(t, state, k1);

    // temp = state + halfDt * k1
    for (let i = 0; i < n; i++) temp[i] = state[i] + halfDt * k1[i];

    // k2 = f(t + halfDt, temp)
    derivs(t + halfDt, temp, k2);

    // temp = state + halfDt * k2
    for (let i = 0; i < n; i++) temp[i] = state[i] + halfDt * k2[i];

    // k3 = f(t + halfDt, temp)
    derivs(t + halfDt, temp, k3);

    // temp = state + dt * k3
    for (let i = 0; i < n; i++) temp[i] = state[i] + dt * k3[i];

    // k4 = f(t + dt, temp)
    derivs(t + dt, temp, k4);

    // state += (dt/6) * (k1 + 2*k2 + 2*k3 + k4)
    for (let i = 0; i < n; i++) {
      state[i] += sixthDt * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    }
  }
}

// ─── Module-level pre-allocated integrator ──────────────────────────────────

let integrator: RK4Integrator | null = null;
let stateVec: Float64Array | null = null;

function getIntegrator(): { integrator: RK4Integrator; stateVec: Float64Array } {
  if (!integrator) {
    integrator = new RK4Integrator(STATE_SIZE);
    stateVec = new Float64Array(STATE_SIZE);
  }
  return { integrator, stateVec: stateVec! };
}

// ─── Helper: same as integration.ts ─────────────────────────────────────────

function getTyreRadius(vehicle: VehicleParams): number {
  return vehicle.tyreRadius ?? 42;
}

function getCornerPositions(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
): CornerPositions {
  const frac = vehicle.weightDistribution / 100;
  const distToFront = vehicle.wheelbase * (1 - frac);
  const distToRear = vehicle.wheelbase * frac;
  return {
    FL: { x: distToFront, y: -frontGeo.trackWidth / 2 },
    FR: { x: distToFront, y: frontGeo.trackWidth / 2 },
    RL: { x: -distToRear, y: -rearGeo.trackWidth / 2 },
    RR: { x: -distToRear, y: rearGeo.trackWidth / 2 },
  };
}

function isFront(corner: Corner): boolean {
  return corner === 'FL' || corner === 'FR';
}

function isLeft(corner: Corner): boolean {
  return corner === 'FL' || corner === 'RL';
}

function sprungMassHeightAtCorner(
  heave: number,
  rollRad: number,
  pitchRad: number,
  lateralArm: number,
  longitudinalArm: number,
): number {
  return heave + lateralArm * Math.sin(rollRad) + longitudinalArm * Math.sin(pitchRad);
}

// ─── Pack / Unpack state vector ─────────────────────────────────────────────

function packState(state: SimulationState, out: Float64Array): void {
  out[S_HEAVE] = state.chassisHeave;
  out[S_ROLL] = state.rollAngle * DEG_TO_RAD;
  out[S_PITCH] = state.pitchAngle * DEG_TO_RAD;
  out[S_WHEEL_FL] = state.corners.FL.wheelPosition;
  out[S_WHEEL_FR] = state.corners.FR.wheelPosition;
  out[S_WHEEL_RL] = state.corners.RL.wheelPosition;
  out[S_WHEEL_RR] = state.corners.RR.wheelPosition;
  out[S_VHEAVE] = state.chassisHeaveVelocity;
  out[S_VROLL] = state.rollVelocity * DEG_TO_RAD;
  out[S_VPITCH] = state.pitchVelocity * DEG_TO_RAD;
  out[S_VWHEEL_FL] = state.corners.FL.wheelVelocity;
  out[S_VWHEEL_FR] = state.corners.FR.wheelVelocity;
  out[S_VWHEEL_RL] = state.corners.RL.wheelVelocity;
  out[S_VWHEEL_RR] = state.corners.RR.wheelVelocity;
}

// ─── Main step function ─────────────────────────────────────────────────────

export function stepRK4Simulation(
  state: SimulationState,
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
  frontShock: AxleShock,
  rearShock: AxleShock,
  frontSwayBar: AxleSwayBar,
  rearSwayBar: AxleSwayBar,
  frontSteeringRack: SteeringRack,
  rearSteeringRack: SteeringRack,
  hydraulic: HydraulicConfig,
  dt: number = 0.001,
): Partial<SimulationState> {
  const newTime = state.time + dt;
  const tyreRadius = getTyreRadius(vehicle);
  const cornerPos = getCornerPositions(vehicle, frontGeo, rearGeo);
  const leverArms = computeLeverArms(vehicle, frontGeo, rearGeo);

  // Build the derivative function that closes over all vehicle params.
  // This is called 4 times per RK4 step (k1..k4).
  const derivs = (t: number, y: Float64Array, dydt: Float64Array): void => {
    const heave = y[S_HEAVE];
    const rollRad = y[S_ROLL];
    const pitchRad = y[S_PITCH];
    const wheelPos: Record<Corner, number> = {
      FL: y[S_WHEEL_FL], FR: y[S_WHEEL_FR],
      RL: y[S_WHEEL_RL], RR: y[S_WHEEL_RR],
    };
    const heaveVel = y[S_VHEAVE];
    const rollVel = y[S_VROLL];
    const pitchVel = y[S_VPITCH];
    const wheelVel: Record<Corner, number> = {
      FL: y[S_VWHEEL_FL], FR: y[S_VWHEEL_FR],
      RL: y[S_VWHEEL_RL], RR: y[S_VWHEEL_RR],
    };

    // Get ground heights and velocities at evaluation time t
    const roadParams = {
      height: state.roadBumpHeight,
      width: state.roadBumpWidth,
      speed: state.roadSpeed,
      frequency: state.roadFrequency,
      targetCorner: state.roadTargetCorner as any,
    };
    const ground = getGroundHeightAndVelocity(
      state.roadSurfaceType as any,
      roadParams,
      cornerPos,
      t,
    );
    const groundHeights = ground.heights;
    const groundVelocities = ground.velocities;

    // Corner forces accumulator
    const cornerForces: Record<Corner, CornerForceInputs> = {
      FL: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
      FR: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
      RL: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
      RR: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
    };

    // Per-corner computations
    const shockCompressions: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
    const shockVelocities: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };

    for (const c of CORNERS) {
      // Tyre force
      const tyre = computeTyreForce(
        wheelPos[c], wheelVel[c], groundHeights[c],
        tyreRadius, vehicle.tyreSpringRate, vehicle.tyreDamping,
        groundVelocities[c],
      );
      cornerForces[c].tyreForce = tyre.force;

      // Shock compression & velocity
      const arm = leverArms[c];
      const sprungZ = sprungMassHeightAtCorner(
        heave + vehicle.rideHeight, rollRad, pitchRad,
        arm.lateral, arm.longitudinal,
      );
      const shockComp = wheelPos[c] - sprungZ + vehicle.rideHeight;
      const sprungVelZ = heaveVel +
        arm.lateral * rollVel * Math.cos(rollRad) +
        arm.longitudinal * pitchVel * Math.cos(pitchRad);
      const shockVel = wheelVel[c] - sprungVelZ;

      shockCompressions[c] = shockComp;
      shockVelocities[c] = shockVel;

      // Suspension forces (spring, damper, bumpstop)
      const shock = isFront(c) ? frontShock : rearShock;
      const geo = isFront(c) ? frontGeo : rearGeo;
      const motionRatio = computeGeometricMotionRatio(shock, geo, vehicle.rideHeight, tyreRadius, shockComp);
      const forces = computeCornerForces(shockComp, shockVel, shock, motionRatio);
      cornerForces[c].suspensionForce = forces.totalSuspForce;
      cornerForces[c].bumpStopForce = forces.bumpStopForce;
    }

    // Sway bar forces
    const frontSwayForce = computeSwayBarForce(
      shockCompressions.FL, shockCompressions.FR, frontSwayBar,
    );
    cornerForces.FL.swayBarForce = frontSwayForce;
    cornerForces.FR.swayBarForce = -frontSwayForce;

    const rearSwayForce = computeSwayBarForce(
      shockCompressions.RL, shockCompressions.RR, rearSwayBar,
    );
    cornerForces.RL.swayBarForce = rearSwayForce;
    cornerForces.RR.swayBarForce = -rearSwayForce;

    // Hydraulic forces
    const hydForces = computeHydraulicForces(hydraulic, shockVelocities, shockCompressions);
    for (const c of CORNERS) {
      cornerForces[c].hydraulicForce = hydForces[c];
    }

    // Compute accelerations (uses same EOM solver as custom engine)
    const accel = computeAccelerations(vehicle, frontGeo, rearGeo, cornerForces, leverArms);

    // Write derivatives: positions' derivatives = velocities
    dydt[S_HEAVE] = heaveVel;
    dydt[S_ROLL] = rollVel;
    dydt[S_PITCH] = pitchVel;
    dydt[S_WHEEL_FL] = wheelVel.FL;
    dydt[S_WHEEL_FR] = wheelVel.FR;
    dydt[S_WHEEL_RL] = wheelVel.RL;
    dydt[S_WHEEL_RR] = wheelVel.RR;

    // Velocities' derivatives = accelerations
    dydt[S_VHEAVE] = accel.a_s;
    dydt[S_VROLL] = accel.alpha_roll;    // rad/s²
    dydt[S_VPITCH] = accel.alpha_pitch;  // rad/s²
    dydt[S_VWHEEL_FL] = accel.a_u.FL;
    dydt[S_VWHEEL_FR] = accel.a_u.FR;
    dydt[S_VWHEEL_RL] = accel.a_u.RL;
    dydt[S_VWHEEL_RR] = accel.a_u.RR;
  };

  // Pack current state into the state vector
  const { integrator: rk4, stateVec: sv } = getIntegrator();
  packState(state, sv);

  // Perform the RK4 step
  rk4.step(sv, state.time, dt, derivs);

  // Post-step: enforce hard ground constraint
  const postGround = getGroundHeightAndVelocity(
    state.roadSurfaceType as any,
    {
      height: state.roadBumpHeight,
      width: state.roadBumpWidth,
      speed: state.roadSpeed,
      frequency: state.roadFrequency,
      targetCorner: state.roadTargetCorner as any,
    },
    cornerPos,
    newTime,
  );
  const groundHeights = postGround.heights;
  const postGroundVelocities = postGround.velocities;

  for (let i = 0; i < 4; i++) {
    const corner = CORNERS[i];
    const groundMin = groundHeights[corner] + tyreRadius;
    if (sv[WHEEL_POS_INDICES[i]] < groundMin) {
      sv[WHEEL_POS_INDICES[i]] = groundMin;
      if (sv[WHEEL_VEL_INDICES[i]] < 0) {
        sv[WHEEL_VEL_INDICES[i]] = 0;
      }
    }
  }

  // Compute final force/state values for output (using post-step state)
  const newCorners: Record<Corner, PerCornerState> = {
    FL: { ...state.corners.FL },
    FR: { ...state.corners.FR },
    RL: { ...state.corners.RL },
    RR: { ...state.corners.RR },
  };

  const finalRollRad = sv[S_ROLL];
  const finalPitchRad = sv[S_PITCH];

  for (const c of CORNERS) {
    const idx = CORNERS.indexOf(c);
    newCorners[c].wheelPosition = sv[WHEEL_POS_INDICES[idx]];
    newCorners[c].wheelVelocity = sv[WHEEL_VEL_INDICES[idx]];

    // Recompute derived quantities for output
    const tyre = computeTyreForce(
      sv[WHEEL_POS_INDICES[idx]], sv[WHEEL_VEL_INDICES[idx]], groundHeights[c],
      tyreRadius, vehicle.tyreSpringRate, vehicle.tyreDamping,
      postGroundVelocities[c],
    );
    newCorners[c].tyreContactForce = tyre.force;
    newCorners[c].tyreDeflection = tyre.deflection;
    newCorners[c].wheelAirborne = !tyre.wheelContact;

    const arm = leverArms[c];
    const sprungZ = sprungMassHeightAtCorner(
      sv[S_HEAVE] + vehicle.rideHeight, finalRollRad, finalPitchRad,
      arm.lateral, arm.longitudinal,
    );
    newCorners[c].suspensionCompression = sv[WHEEL_POS_INDICES[idx]] - sprungZ + vehicle.rideHeight;
    newCorners[c].shockCompression = newCorners[c].suspensionCompression;

    const sprungVelZ = sv[S_VHEAVE] +
      arm.lateral * sv[S_VROLL] * Math.cos(finalRollRad) +
      arm.longitudinal * sv[S_VPITCH] * Math.cos(finalPitchRad);
    newCorners[c].shockVelocity = sv[WHEEL_VEL_INDICES[idx]] - sprungVelZ;

    const shock = isFront(c) ? frontShock : rearShock;
    const geo2 = isFront(c) ? frontGeo : rearGeo;
    const motionRatio = computeGeometricMotionRatio(shock, geo2, vehicle.rideHeight, tyreRadius, newCorners[c].shockCompression);
    const forces = computeCornerForces(newCorners[c].shockCompression, newCorners[c].shockVelocity, shock, motionRatio);
    newCorners[c].springForce = forces.springForce;
    newCorners[c].damperForce = forces.damperForce;
    newCorners[c].bumpStopForce = forces.bumpStopForce;
  }

  // Sway bar forces for output
  const frontSwayForce = computeSwayBarForce(
    newCorners.FL.shockCompression, newCorners.FR.shockCompression, frontSwayBar,
  );
  newCorners.FL.swayBarForce = frontSwayForce;
  newCorners.FR.swayBarForce = -frontSwayForce;

  const rearSwayForce = computeSwayBarForce(
    newCorners.RL.shockCompression, newCorners.RR.shockCompression, rearSwayBar,
  );
  newCorners.RL.swayBarForce = rearSwayForce;
  newCorners.RR.swayBarForce = -rearSwayForce;

  // Hydraulic forces for output
  const shockVelocities: Record<Corner, number> = {
    FL: newCorners.FL.shockVelocity, FR: newCorners.FR.shockVelocity,
    RL: newCorners.RL.shockVelocity, RR: newCorners.RR.shockVelocity,
  };
  const shockCompressions: Record<Corner, number> = {
    FL: newCorners.FL.shockCompression, FR: newCorners.FR.shockCompression,
    RL: newCorners.RL.shockCompression, RR: newCorners.RR.shockCompression,
  };
  const hydForces = computeHydraulicForces(hydraulic, shockVelocities, shockCompressions);
  for (const c of CORNERS) {
    newCorners[c].hydraulicForce = hydForces[c];
  }

  // Kinematics update
  let frontRCH = 0;
  let rearRCH = 0;

  const frontAck = computeRackSteering(
    state.frontSteeringAngle, frontGeo, frontSteeringRack, vehicle.wheelbase,
  );
  const rearAck = computeRackSteering(
    state.rearSteeringAngle, rearGeo, rearSteeringRack, vehicle.wheelbase,
  );

  for (const c of CORNERS) {
    const geo = isFront(c) ? frontGeo : rearGeo;
    const shock = isFront(c) ? frontShock : rearShock;
    // Chassis vertical offset from ride height at this corner (for proper BJ world positions)
    const arm = leverArms[c];
    const chassisHeightOffset = sv[S_HEAVE]
      + arm.lateral * Math.sin(finalRollRad)
      + arm.longitudinal * Math.sin(finalPitchRad);
    const kin = updateKinematics(geo, shock, vehicle.rideHeight, vehicle.tyreRadius, newCorners[c].shockCompression, isLeft(c), chassisHeightOffset);
    newCorners[c].camberAngle = kin.camber;
    newCorners[c].dynamicKPI = kin.dynamicKPI;
    newCorners[c].dynamicCaster = kin.dynamicCaster;
    newCorners[c].scrubRadius = kin.scrubRadius;
    newCorners[c].casterTrail = kin.casterTrail;
    newCorners[c].motionRatio = kin.motionRatio;
    newCorners[c].lowerBJPosition = { lateral: kin.ballJoints.lowerBJ.y, vertical: kin.ballJoints.lowerBJ.z, longitudinal: kin.ballJoints.lowerBJ.x };
    newCorners[c].upperBJPosition = { lateral: kin.ballJoints.upperBJ.y, vertical: kin.ballJoints.upperBJ.z, longitudinal: kin.ballJoints.upperBJ.x };
    const ack = isFront(c) ? frontAck : rearAck;
    newCorners[c].steeringAngle = isLeft(c) ? ack.leftAngle : ack.rightAngle;
    // Caster/KPI-induced camber gain during steering
    newCorners[c].camberAngle += computeSteeringCamberGain(
      newCorners[c].steeringAngle, kin.dynamicCaster, kin.dynamicKPI,
    );
    // Ackermann percentage diagnostic
    const innerAngle = Math.abs(ack.leftAngle) > Math.abs(ack.rightAngle) ? ack.leftAngle : ack.rightAngle;
    const outerAngle = Math.abs(ack.leftAngle) > Math.abs(ack.rightAngle) ? ack.rightAngle : ack.leftAngle;
    newCorners[c].ackermannPercent = computeAckermannPercent(
      innerAngle, outerAngle, geo.trackWidth, vehicle.wheelbase,
    );
    if (isFront(c)) frontRCH += kin.rollCentreHeight * 0.5;
    else rearRCH += kin.rollCentreHeight * 0.5;
  }

  return {
    time: newTime,
    chassisHeave: sv[S_HEAVE],
    chassisHeaveVelocity: sv[S_VHEAVE],
    rollAngle: sv[S_ROLL] * RAD_TO_DEG,
    rollVelocity: sv[S_VROLL] * RAD_TO_DEG,
    pitchAngle: sv[S_PITCH] * RAD_TO_DEG,
    pitchVelocity: sv[S_VPITCH] * RAD_TO_DEG,
    corners: newCorners,
    frontRollCentreHeight: frontRCH,
    rearRollCentreHeight: rearRCH,
  };
}
