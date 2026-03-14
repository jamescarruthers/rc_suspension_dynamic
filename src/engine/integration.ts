import type {
  Corner,
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
  HydraulicConfig,
  PerCornerState,
  SimulationState,
} from '../types/suspension';

import { CORNERS } from '../types/suspension';
import { computeTyreForce } from './tyreContact';
import { computeCornerForces, computeSwayBarForce, computeMotionRatio } from './forces';
import { computeAccelerations, computeLeverArms, type CornerForceInputs } from './dynamics';
import { computeHydraulicForces } from './hydraulics';
import { updateKinematics, computeAckermannSteering } from './kinematics';
import { getGroundHeight, type CornerPositions } from './roadSurface';

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
  roll: number,
  pitch: number,
  lateralArm: number,
  longitudinalArm: number,
): number {
  return heave + lateralArm * Math.sin(roll) + longitudinalArm * Math.sin(pitch);
}

function defaultCornerState(): PerCornerState {
  return {
    wheelPosition: 0,
    wheelVelocity: 0,
    suspensionCompression: 0,
    shockCompression: 0,
    shockVelocity: 0,
    tyreDeflection: 0,
    tyreContactForce: 0,
    springForce: 0,
    damperForce: 0,
    bumpStopForce: 0,
    swayBarForce: 0,
    hydraulicForce: 0,
    hydraulicPressure: 0,
    camberAngle: 0,
    steeringAngle: 0,
    wheelAirborne: false,
  };
}

export function stepSimulation(
  state: SimulationState,
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
  frontShock: AxleShock,
  rearShock: AxleShock,
  frontSwayBar: AxleSwayBar,
  rearSwayBar: AxleSwayBar,
  hydraulic: HydraulicConfig,
  dt: number = 0.001,
): Partial<SimulationState> {
  const newTime = state.time + dt;

  // Road surface
  const cornerPos = getCornerPositions(vehicle, frontGeo, rearGeo);
  const groundHeights = getGroundHeight(
    state.roadSurfaceType as any,
    {
      height: state.roadBumpHeight,
      width: state.roadBumpWidth,
      speed: state.roadSpeed,
      frequency: state.roadFrequency,
    },
    cornerPos,
    newTime,
  );

  // Lever arms
  const leverArms = computeLeverArms(vehicle, frontGeo, rearGeo);

  // Corner forces accumulator
  const cornerForces: Record<Corner, CornerForceInputs> = {
    FL: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
    FR: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
    RL: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
    RR: { suspensionForce: 0, swayBarForce: 0, bumpStopForce: 0, tyreForce: 0, hydraulicForce: 0 },
  };

  const newCorners: Record<Corner, PerCornerState> = {
    FL: { ...state.corners.FL },
    FR: { ...state.corners.FR },
    RL: { ...state.corners.RL },
    RR: { ...state.corners.RR },
  };

  const tyreRadius = getTyreRadius(vehicle);

  // Tyre forces
  for (const c of CORNERS) {
    const cs = state.corners[c];
    const tyre = computeTyreForce(
      cs.wheelPosition,
      cs.wheelVelocity,
      groundHeights[c],
      tyreRadius,
      vehicle.tyreSpringRate,
      vehicle.tyreDamping,
    );
    cornerForces[c].tyreForce = tyre.force;
    newCorners[c].tyreContactForce = tyre.force;
    newCorners[c].tyreDeflection = tyre.deflection;
    newCorners[c].wheelAirborne = !tyre.wheelContact;
  }

  // Shock compression and velocity
  for (const c of CORNERS) {
    const cs = state.corners[c];
    const arm = leverArms[c];
    const rollRad = (state.rollAngle * Math.PI) / 180;
    const pitchRad = (state.pitchAngle * Math.PI) / 180;
    const sprungZ = sprungMassHeightAtCorner(
      state.chassisHeave + vehicle.rideHeight,
      rollRad,
      pitchRad,
      arm.lateral,
      arm.longitudinal,
    );

    newCorners[c].suspensionCompression = cs.wheelPosition - sprungZ + vehicle.rideHeight;
    newCorners[c].shockCompression = newCorners[c].suspensionCompression;

    const sprungVelZ = state.chassisHeaveVelocity +
      arm.lateral * state.rollVelocity * (Math.PI / 180) * Math.cos(rollRad) +
      arm.longitudinal * state.pitchVelocity * (Math.PI / 180) * Math.cos(pitchRad);
    newCorners[c].shockVelocity = cs.wheelVelocity - sprungVelZ;
  }

  // Suspension forces
  for (const c of CORNERS) {
    const shock = isFront(c) ? frontShock : rearShock;
    const motionRatio = computeMotionRatio(shock);
    const cs = newCorners[c];

    const forces = computeCornerForces(cs.shockCompression, cs.shockVelocity, shock, motionRatio);
    cornerForces[c].suspensionForce = forces.totalSuspForce;
    cornerForces[c].bumpStopForce = forces.bumpStopForce;
    newCorners[c].springForce = forces.springForce;
    newCorners[c].damperForce = forces.damperForce;
    newCorners[c].bumpStopForce = forces.bumpStopForce;
  }

  // Sway bar
  const frontSwayForce = computeSwayBarForce(
    newCorners.FL.shockCompression, newCorners.FR.shockCompression, frontSwayBar,
  );
  cornerForces.FL.swayBarForce = frontSwayForce;
  cornerForces.FR.swayBarForce = -frontSwayForce;
  newCorners.FL.swayBarForce = frontSwayForce;
  newCorners.FR.swayBarForce = -frontSwayForce;

  const rearSwayForce = computeSwayBarForce(
    newCorners.RL.shockCompression, newCorners.RR.shockCompression, rearSwayBar,
  );
  cornerForces.RL.swayBarForce = rearSwayForce;
  cornerForces.RR.swayBarForce = -rearSwayForce;
  newCorners.RL.swayBarForce = rearSwayForce;
  newCorners.RR.swayBarForce = -rearSwayForce;

  // Hydraulic forces
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
    cornerForces[c].hydraulicForce = hydForces[c];
    newCorners[c].hydraulicForce = hydForces[c];
  }

  // Compute accelerations
  const accel = computeAccelerations(vehicle, frontGeo, rearGeo, cornerForces, leverArms);

  // Semi-implicit Euler: velocities first
  let newHeaveVel = state.chassisHeaveVelocity + accel.a_s * dt;
  let newRollVel = state.rollVelocity + accel.alpha_roll * dt * (180 / Math.PI);
  let newPitchVel = state.pitchVelocity + accel.alpha_pitch * dt * (180 / Math.PI);

  const newWheelVels: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  for (const c of CORNERS) {
    newWheelVels[c] = state.corners[c].wheelVelocity + accel.a_u[c] * dt;
  }

  // Then positions from new velocities
  const newHeave = state.chassisHeave + newHeaveVel * dt;
  const newRoll = state.rollAngle + newRollVel * dt;
  const newPitch = state.pitchAngle + newPitchVel * dt;

  for (const c of CORNERS) {
    let newWheelPos = state.corners[c].wheelPosition + newWheelVels[c] * dt;

    // Hard ground constraint: axle centre cannot go below ground + tyre radius
    const groundMin = groundHeights[c] + tyreRadius;
    if (newWheelPos < groundMin) {
      newWheelPos = groundMin;
      if (newWheelVels[c] < 0) newWheelVels[c] = 0;
    }

    newCorners[c].wheelPosition = newWheelPos;
    newCorners[c].wheelVelocity = newWheelVels[c];
  }

  // Kinematics update
  let frontRCH = 0;
  let rearRCH = 0;

  // Ackermann steering
  const frontAck = computeAckermannSteering(
    state.frontSteeringAngle, frontGeo.trackWidth, vehicle.wheelbase, frontGeo.ackermannArmLength, frontGeo.hubOffset ?? 0,
  );
  const rearAck = computeAckermannSteering(
    state.rearSteeringAngle, rearGeo.trackWidth, vehicle.wheelbase, rearGeo.ackermannArmLength, rearGeo.hubOffset ?? 0,
  );

  for (const c of CORNERS) {
    const geo = isFront(c) ? frontGeo : rearGeo;
    const kin = updateKinematics(geo, vehicle.rideHeight, vehicle.tyreRadius, newCorners[c].shockCompression, isLeft(c));
    newCorners[c].camberAngle = kin.camber;
    // Per-wheel steering after Ackermann
    const ack = isFront(c) ? frontAck : rearAck;
    newCorners[c].steeringAngle = isLeft(c) ? ack.leftAngle : ack.rightAngle;
    if (isFront(c)) frontRCH += kin.rollCentreHeight * 0.5;
    else rearRCH += kin.rollCentreHeight * 0.5;
  }

  return {
    time: newTime,
    chassisHeave: newHeave,
    chassisHeaveVelocity: newHeaveVel,
    rollAngle: newRoll,
    rollVelocity: newRollVel,
    pitchAngle: newPitch,
    pitchVelocity: newPitchVel,
    corners: newCorners,
    frontRollCentreHeight: frontRCH,
    rearRollCentreHeight: rearRCH,
  };
}

export function findStaticEquilibrium(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
  frontShock: AxleShock,
  rearShock: AxleShock,
  frontSwayBar: AxleSwayBar,
  rearSwayBar: AxleSwayBar,
  hydraulic: HydraulicConfig,
  maxIterations: number = 5000,
): Partial<SimulationState> {
  const dt = 0.001;
  const velocityThreshold = 0.01;

  let simState: SimulationState = {
    mode: 'dynamic',
    physicsEngine: 'rk4',
    running: false,
    time: 0,
    playbackSpeed: 1,
    chassisHeave: 0,
    chassisHeaveVelocity: 0,
    rollAngle: 0,
    rollVelocity: 0,
    pitchAngle: 0,
    pitchVelocity: 0,
    corners: {
      FL: defaultCornerState(),
      FR: defaultCornerState(),
      RL: defaultCornerState(),
      RR: defaultCornerState(),
    },
    frontRollCentreHeight: 0,
    rearRollCentreHeight: 0,
    rollInput: 0,
    pitchInput: 0,
    frontSteeringAngle: 0,
    rearSteeringAngle: 0,
    dropHeight: 50,
    dropRollAngle: 0,
    dropPitchAngle: 0,
    roadSurfaceType: 'flat',
    roadBumpHeight: 0,
    roadBumpWidth: 50,
    roadBumpShape: 'halfsine',
    roadSpeed: 0,
    roadFrequency: 10,
    roadAmplitude: 0,
    roadTargetCorner: 'all',
    forceVisibility: {},
    forceScale: 1,
    graphChannels: [],
    graphTimeWindow: 5,
    graphHistory: [],
  };

  for (let i = 0; i < maxIterations; i++) {
    const update = stepSimulation(
      simState, vehicle, frontGeo, rearGeo,
      frontShock, rearShock, frontSwayBar, rearSwayBar, hydraulic, dt,
    );
    simState = { ...simState, ...update };

    simState.chassisHeaveVelocity *= 0.99;
    simState.rollVelocity *= 0.99;
    simState.pitchVelocity *= 0.99;
    for (const c of CORNERS) {
      simState.corners[c].wheelVelocity *= 0.99;
    }

    const maxVel = Math.max(
      Math.abs(simState.chassisHeaveVelocity),
      Math.abs(simState.rollVelocity),
      Math.abs(simState.pitchVelocity),
      ...CORNERS.map((c) => Math.abs(simState.corners[c].wheelVelocity)),
    );

    if (maxVel < velocityThreshold) {
      simState.chassisHeaveVelocity = 0;
      simState.rollVelocity = 0;
      simState.pitchVelocity = 0;
      for (const c of CORNERS) {
        simState.corners[c].wheelVelocity = 0;
        simState.corners[c].shockVelocity = 0;
      }
      break;
    }
  }

  return {
    time: 0,
    chassisHeave: simState.chassisHeave,
    chassisHeaveVelocity: 0,
    rollAngle: simState.rollAngle,
    rollVelocity: 0,
    pitchAngle: simState.pitchAngle,
    pitchVelocity: 0,
    corners: simState.corners,
    frontRollCentreHeight: simState.frontRollCentreHeight,
    rearRollCentreHeight: simState.rearRollCentreHeight,
  };
}
