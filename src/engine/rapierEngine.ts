/**
 * Rapier3D-based physics engine for the RC suspension simulator.
 *
 * Models the same system as the custom engine:
 *   - Chassis (sprung mass) as a dynamic rigid body with 3 DOF (heave, roll, pitch)
 *   - 4 wheels (unsprung masses) as dynamic rigid bodies
 *   - Suspension spring-damper forces applied between chassis and wheels
 *   - Sway bar, bump stop, and hydraulic forces
 *   - Tyre contact via the existing contact model
 *
 * Rapier handles integration and constraint solving.
 * We apply the same force models from the custom engine each step.
 *
 * Units: Rapier uses SI (m, kg, s). The app uses mm, g, s.
 * Conversion: mm -> m = /1000, g -> kg = /1000.
 */

import RAPIER from '@dimforge/rapier3d-compat';
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
import { computeHydraulicForces } from './hydraulics';
import { updateKinematics, computeAckermannSteering } from './kinematics';
import { getGroundHeight, type CornerPositions } from './roadSurface';

// ── Conversion helpers ──────────────────────────────────────────────

const MM_TO_M = 0.001;
const M_TO_MM = 1000;
const G_TO_KG = 0.001;

// ── Rapier initialization ───────────────────────────────────────────

let rapierInitialized = false;
let initPromise: Promise<void> | null = null;

export async function initRapier(): Promise<void> {
  if (rapierInitialized) return;
  if (initPromise) return initPromise;
  initPromise = RAPIER.init().then(() => {
    rapierInitialized = true;
  });
  return initPromise;
}

export function isRapierReady(): boolean {
  return rapierInitialized;
}

// ── Rapier world state ──────────────────────────────────────────────

interface WheelBody {
  handle: RAPIER.RigidBody;
  cornerX: number; // longitudinal offset from CG (mm)
  cornerY: number; // lateral offset from CG (mm)
}

interface RapierWorldState {
  world: RAPIER.World;
  chassisBody: RAPIER.RigidBody;
  wheelBodies: Record<Corner, WheelBody>;
}

let worldState: RapierWorldState | null = null;

// ── Helper: get corner positions ────────────────────────────────────

function getCornerOffsets(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
): Record<Corner, { x: number; y: number }> {
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

function getCornerPositions(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
): CornerPositions {
  return getCornerOffsets(vehicle, frontGeo, rearGeo);
}

function isFront(corner: Corner): boolean {
  return corner === 'FL' || corner === 'FR';
}

function isLeft(corner: Corner): boolean {
  return corner === 'FL' || corner === 'RL';
}

// ── Build / rebuild the Rapier world ────────────────────────────────

export function buildRapierWorld(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
  initialState?: Partial<SimulationState>,
): void {
  if (!rapierInitialized) return;

  // Create world with gravity (Rapier Y is up by convention; we use Z-up in the sim
  // but Rapier3D uses Y-up. We'll map: app X->Rapier X, app Y->Rapier Z, app Z->Rapier Y)
  const gravity = new RAPIER.Vector3(0.0, -9.81, 0.0);
  const world = new RAPIER.World(gravity);
  world.timestep = 0.001; // 1ms to match custom engine

  const sprungMassKg = (vehicle.totalWeight - vehicle.unsprungMassPerCorner * 4) * G_TO_KG;
  const unsprungMassKg = vehicle.unsprungMassPerCorner * G_TO_KG;
  const cornerOffsets = getCornerOffsets(vehicle, frontGeo, rearGeo);

  // Initial chassis height (in meters). rideHeight is mm from ground to chassis ref.
  const chassisHeave = initialState?.chassisHeave ?? 0;
  const chassisZ = (vehicle.rideHeight + chassisHeave) * MM_TO_M;
  const rollRad = initialState?.rollAngle ? (initialState.rollAngle * Math.PI) / 180 : 0;
  const pitchRad = initialState?.pitchAngle ? (initialState.pitchAngle * Math.PI) / 180 : 0;

  // ── Chassis body ──────────────────────────────────────────────────
  const chassisDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(0, chassisZ, 0)
    // Lock X and Z translation (longitudinal and lateral), only allow Y (vertical)
    .lockTranslations()
    .setLinvel(0, (initialState?.chassisHeaveVelocity ?? 0) * MM_TO_M, 0);

  // We enable Y translation after creation by setting locks explicitly
  const chassisBody = world.createRigidBody(chassisDesc);
  // Enable only Y-axis translation (heave)
  chassisBody.setEnabledTranslations(false, true, false, true);
  // Enable X and Z rotations (pitch around X mapped from app, roll around Z mapped from app)
  chassisBody.setEnabledRotations(true, false, true, true);

  chassisBody.setAdditionalMass(sprungMassKg, true);

  // Set rotation from roll and pitch
  // App coords: roll around X-axis, pitch around longitudinal
  // In Rapier Y-up: roll = rotation around Rapier-X, pitch = rotation around Rapier-Z
  const qRoll = quaternionFromAxisAngle(1, 0, 0, rollRad);
  const qPitch = quaternionFromAxisAngle(0, 0, 1, pitchRad);
  const q = multiplyQuaternions(qRoll, qPitch);
  chassisBody.setRotation(new RAPIER.Quaternion(q.x, q.y, q.z, q.w), true);

  // Set angular velocities
  const rollVelRad = initialState?.rollVelocity ? (initialState.rollVelocity * Math.PI) / 180 : 0;
  const pitchVelRad = initialState?.pitchVelocity ? (initialState.pitchVelocity * Math.PI) / 180 : 0;
  chassisBody.setAngvel(new RAPIER.Vector3(rollVelRad, 0, pitchVelRad), true);

  // Add a small collider for the chassis (not for ground contact, just for mass distribution)
  const chassisColliderDesc = RAPIER.ColliderDesc.cuboid(
    (vehicle.wheelbase / 2) * MM_TO_M,
    0.005, // thin slab
    (frontGeo.trackWidth / 2) * MM_TO_M,
  ).setMass(sprungMassKg)
    .setCollisionGroups(0x00020002); // group 2, only collides with group 2 (nothing)
  world.createCollider(chassisColliderDesc, chassisBody);

  // ── Wheel bodies ──────────────────────────────────────────────────
  const tyreRadius = (vehicle.tyreRadius ?? 42) * MM_TO_M;
  const wheelBodies: Record<Corner, WheelBody> = {} as any;

  for (const c of CORNERS) {
    const offset = cornerOffsets[c];
    const cornerState = initialState?.corners?.[c];
    const wheelZ = (cornerState?.wheelPosition ?? vehicle.rideHeight) * MM_TO_M;

    const wheelDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(
        offset.x * MM_TO_M,  // longitudinal
        wheelZ,               // vertical (Rapier Y)
        offset.y * MM_TO_M,  // lateral (Rapier Z)
      )
      .lockRotations() // wheels don't rotate in this 1D vertical model
      .setLinvel(0, (cornerState?.wheelVelocity ?? 0) * MM_TO_M, 0);

    const wheelBody = world.createRigidBody(wheelDesc);
    // Only allow vertical (Y) movement
    wheelBody.setEnabledTranslations(false, true, false, true);

    // Add sphere collider for ground contact
    const wheelColliderDesc = RAPIER.ColliderDesc.ball(tyreRadius)
      .setMass(unsprungMassKg)
      .setRestitution(0.0)
      .setFriction(1.0)
      .setCollisionGroups(0x00010001); // group 1, collides with group 1
    world.createCollider(wheelColliderDesc, wheelBody);

    wheelBodies[c] = { handle: wheelBody, cornerX: offset.x, cornerY: offset.y };
  }

  // ── Ground plane ──────────────────────────────────────────────────
  const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const groundBody = world.createRigidBody(groundDesc);
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(10, 0.01, 10)
    .setTranslation(0, -0.01, 0)
    .setCollisionGroups(0x00010001); // group 1
  world.createCollider(groundColliderDesc, groundBody);

  worldState = { world, chassisBody, wheelBodies };
}

// ── Quaternion helpers ──────────────────────────────────────────────

function quaternionFromAxisAngle(ax: number, ay: number, az: number, angle: number) {
  const half = angle / 2;
  const s = Math.sin(half);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(half) };
}

function multiplyQuaternions(
  a: { x: number; y: number; z: number; w: number },
  b: { x: number; y: number; z: number; w: number },
) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quaternionToEuler(q: { x: number; y: number; z: number; w: number }) {
  // Extract roll (X) and pitch (Z) from quaternion (Y-up convention)
  // Roll = rotation around X
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z);
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch = rotation around Z
  const sinp_cosy = 2 * (q.w * q.z + q.x * q.y);
  const cosp_cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  const pitch = Math.atan2(sinp_cosy, cosp_cosy);

  return { roll, pitch };
}

// ── Step the Rapier simulation ──────────────────────────────────────

export function stepRapierSimulation(
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
  if (!worldState) return { time: state.time + dt };

  const { world, chassisBody, wheelBodies } = worldState;
  const newTime = state.time + dt;

  // ── Road surface heights ──────────────────────────────────────────
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

  const tyreRadius = vehicle.tyreRadius ?? 42;

  // ── Read current Rapier state ─────────────────────────────────────
  const chassisPos = chassisBody.translation();
  const chassisRot = chassisBody.rotation();
  const chassisVel = chassisBody.linvel();
  const chassisAngvel = chassisBody.angvel();

  const chassisHeave = chassisPos.y * M_TO_MM - vehicle.rideHeight;
  const chassisHeaveVelocity = chassisVel.y * M_TO_MM;
  const euler = quaternionToEuler(chassisRot);
  const rollVelocity = (chassisAngvel.x * 180) / Math.PI;
  const pitchVelocity = (chassisAngvel.z * 180) / Math.PI;

  // ── Compute forces and apply to Rapier bodies ─────────────────────
  const newCorners: Record<Corner, PerCornerState> = {
    FL: { ...state.corners.FL },
    FR: { ...state.corners.FR },
    RL: { ...state.corners.RL },
    RR: { ...state.corners.RR },
  };

  // Read wheel positions from Rapier
  for (const c of CORNERS) {
    const wb = wheelBodies[c];
    const wPos = wb.handle.translation();
    const wVel = wb.handle.linvel();
    newCorners[c].wheelPosition = wPos.y * M_TO_MM;
    newCorners[c].wheelVelocity = wVel.y * M_TO_MM;
  }

  // Tyre forces (apply road surface manually since Rapier ground is flat)
  for (const c of CORNERS) {
    const tyre = computeTyreForce(
      newCorners[c].wheelPosition,
      newCorners[c].wheelVelocity,
      groundHeights[c],
      tyreRadius,
      vehicle.tyreSpringRate,
      vehicle.tyreDamping,
    );
    newCorners[c].tyreContactForce = tyre.force;
    newCorners[c].tyreDeflection = tyre.deflection;
    newCorners[c].wheelAirborne = !tyre.wheelContact;

    // Apply tyre force as external impulse on wheel body (upward in Rapier Y)
    const wb = wheelBodies[c];
    // Apply as force (N -> Rapier force in N, Y-up)
    wb.handle.addForce(new RAPIER.Vector3(0, tyre.force, 0), true);
  }

  // Shock compression and velocity (chassis-to-wheel relative motion)
  for (const c of CORNERS) {
    const wb = wheelBodies[c];
    // Chassis height at this corner accounting for roll and pitch
    const rollRad = euler.roll;
    const pitchRad = euler.pitch;
    const lateralArm = wb.cornerY; // mm
    const longitudinalArm = wb.cornerX; // mm
    const sprungZ = (chassisHeave + vehicle.rideHeight) +
      lateralArm * Math.sin(rollRad) +
      longitudinalArm * Math.sin(pitchRad);

    newCorners[c].suspensionCompression = newCorners[c].wheelPosition - sprungZ + vehicle.rideHeight;
    newCorners[c].shockCompression = newCorners[c].suspensionCompression;

    const sprungVelZ = chassisHeaveVelocity +
      lateralArm * rollVelocity * (Math.PI / 180) * Math.cos(rollRad) +
      longitudinalArm * pitchVelocity * (Math.PI / 180) * Math.cos(pitchRad);
    newCorners[c].shockVelocity = newCorners[c].wheelVelocity - sprungVelZ;
  }

  // Suspension forces (spring + damper + bump stop)
  const suspForces: Record<Corner, number> = { FL: 0, FR: 0, RL: 0, RR: 0 };
  for (const c of CORNERS) {
    const shock = isFront(c) ? frontShock : rearShock;
    const motionRatio = computeMotionRatio(shock);
    const forces = computeCornerForces(
      newCorners[c].shockCompression,
      newCorners[c].shockVelocity,
      shock,
      motionRatio,
    );
    newCorners[c].springForce = forces.springForce;
    newCorners[c].damperForce = forces.damperForce;
    newCorners[c].bumpStopForce = forces.bumpStopForce;
    suspForces[c] = forces.totalSuspForce;
  }

  // Sway bar forces
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
    newCorners[c].hydraulicForce = hydForces[c];
  }

  // Apply suspension forces to both chassis and wheel bodies
  // Suspension pushes wheel down and chassis up (Newton's 3rd law)
  for (const c of CORNERS) {
    const wb = wheelBodies[c];
    const totalSuspForce = suspForces[c] + newCorners[c].swayBarForce + newCorners[c].hydraulicForce;

    // On wheel: suspension force pushes down (negative Y in Rapier)
    wb.handle.addForce(new RAPIER.Vector3(0, -totalSuspForce, 0), true);

    // On chassis: suspension force pushes up, applied at the corner position
    // This creates both heave force and roll/pitch torques
    const forcePoint = new RAPIER.Vector3(
      wb.cornerX * MM_TO_M,
      chassisPos.y,
      wb.cornerY * MM_TO_M,
    );
    chassisBody.addForceAtPoint(
      new RAPIER.Vector3(0, totalSuspForce, 0),
      forcePoint,
      true,
    );
  }

  // ── Step the Rapier world ─────────────────────────────────────────
  world.step();

  // ── Read updated state ────────────────────────────────────────────
  const newChassisPos = chassisBody.translation();
  const newChassisRot = chassisBody.rotation();
  const newChassisVel = chassisBody.linvel();
  const newChassisAngvel = chassisBody.angvel();

  const newEuler = quaternionToEuler(newChassisRot);

  // Update wheel positions from Rapier
  for (const c of CORNERS) {
    const wb = wheelBodies[c];
    const wPos = wb.handle.translation();
    const wVel = wb.handle.linvel();
    newCorners[c].wheelPosition = wPos.y * M_TO_MM;
    newCorners[c].wheelVelocity = wVel.y * M_TO_MM;
  }

  // Kinematics update (camber, roll centre)
  let frontRCH = 0;
  let rearRCH = 0;

  const frontAck = computeAckermannSteering(
    state.frontSteeringAngle, frontGeo.trackWidth, vehicle.wheelbase, frontGeo.ackermannArmLength,
  );
  const rearAck = computeAckermannSteering(
    state.rearSteeringAngle, rearGeo.trackWidth, vehicle.wheelbase, rearGeo.ackermannArmLength,
  );

  for (const c of CORNERS) {
    const geo = isFront(c) ? frontGeo : rearGeo;
    const kin = updateKinematics(geo, vehicle.rideHeight, vehicle.tyreRadius, newCorners[c].shockCompression, isLeft(c));
    newCorners[c].camberAngle = kin.camber;
    const ack = isFront(c) ? frontAck : rearAck;
    newCorners[c].steeringAngle = isLeft(c) ? ack.leftAngle : ack.rightAngle;
    if (isFront(c)) frontRCH += kin.rollCentreHeight * 0.5;
    else rearRCH += kin.rollCentreHeight * 0.5;
  }

  return {
    time: newTime,
    chassisHeave: newChassisPos.y * M_TO_MM - vehicle.rideHeight,
    chassisHeaveVelocity: newChassisVel.y * M_TO_MM,
    rollAngle: (newEuler.roll * 180) / Math.PI,
    rollVelocity: (newChassisAngvel.x * 180) / Math.PI,
    pitchAngle: (newEuler.pitch * 180) / Math.PI,
    pitchVelocity: (newChassisAngvel.z * 180) / Math.PI,
    corners: newCorners,
    frontRollCentreHeight: frontRCH,
    rearRollCentreHeight: rearRCH,
  };
}

// ── Rebuild world (call when vehicle params change or on reset) ─────

export function destroyRapierWorld(): void {
  if (worldState) {
    worldState.world.free();
    worldState = null;
  }
}

export function isRapierWorldBuilt(): boolean {
  return worldState !== null;
}

// ── Static equilibrium using Rapier ─────────────────────────────────

export function findRapierStaticEquilibrium(
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
  // Rebuild the world from scratch
  destroyRapierWorld();
  buildRapierWorld(vehicle, frontGeo, rearGeo);

  const dt = 0.001;
  const velocityThreshold = 0.01;

  let simState: SimulationState = {
    mode: 'dynamic',
    physicsEngine: 'rapier',
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
    const update = stepRapierSimulation(
      simState, vehicle, frontGeo, rearGeo,
      frontShock, rearShock, frontSwayBar, rearSwayBar, hydraulic, dt,
    );
    simState = { ...simState, ...update };

    // Apply velocity damping for convergence
    if (worldState) {
      const { chassisBody, wheelBodies } = worldState;
      const cv = chassisBody.linvel();
      chassisBody.setLinvel(new RAPIER.Vector3(cv.x * 0.99, cv.y * 0.99, cv.z * 0.99), true);
      const av = chassisBody.angvel();
      chassisBody.setAngvel(new RAPIER.Vector3(av.x * 0.99, av.y * 0.99, av.z * 0.99), true);

      for (const c of CORNERS) {
        const wv = wheelBodies[c].handle.linvel();
        wheelBodies[c].handle.setLinvel(
          new RAPIER.Vector3(wv.x * 0.99, wv.y * 0.99, wv.z * 0.99), true,
        );
      }
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

// ── Sync Rapier bodies to match current sim state ───────────────────

export function syncRapierToState(
  state: SimulationState,
  vehicle: VehicleParams,
): void {
  if (!worldState) return;
  const { chassisBody, wheelBodies } = worldState;

  const chassisY = (vehicle.rideHeight + state.chassisHeave) * MM_TO_M;
  chassisBody.setTranslation(new RAPIER.Vector3(0, chassisY, 0), true);
  chassisBody.setLinvel(new RAPIER.Vector3(0, state.chassisHeaveVelocity * MM_TO_M, 0), true);

  const rollRad = (state.rollAngle * Math.PI) / 180;
  const pitchRad = (state.pitchAngle * Math.PI) / 180;
  const qRoll = quaternionFromAxisAngle(1, 0, 0, rollRad);
  const qPitch = quaternionFromAxisAngle(0, 0, 1, pitchRad);
  const q = multiplyQuaternions(qRoll, qPitch);
  chassisBody.setRotation(new RAPIER.Quaternion(q.x, q.y, q.z, q.w), true);
  chassisBody.setAngvel(
    new RAPIER.Vector3(
      (state.rollVelocity * Math.PI) / 180,
      0,
      (state.pitchVelocity * Math.PI) / 180,
    ),
    true,
  );

  for (const c of CORNERS) {
    const wb = wheelBodies[c];
    const cs = state.corners[c];
    wb.handle.setTranslation(
      new RAPIER.Vector3(wb.cornerX * MM_TO_M, cs.wheelPosition * MM_TO_M, wb.cornerY * MM_TO_M),
      true,
    );
    wb.handle.setLinvel(new RAPIER.Vector3(0, cs.wheelVelocity * MM_TO_M, 0), true);
  }
}

// ── Default corner state (duplicated from integration.ts for independence) ──

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
