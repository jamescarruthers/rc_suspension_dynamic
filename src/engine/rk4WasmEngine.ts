// ─── RK4 WASM Engine Wrapper ─────────────────────────────────────────────────
//
// Thin TypeScript wrapper around the Rust WASM RK4 solver.
// Marshals VehicleParams / SimulationState into flat f64 buffers,
// calls the WASM step function, and unpacks the output.

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
import {
  updateKinematics,
  computeRackSteering,
  computeSteeringCamberGain,
  computeAckermannPercent,
} from './kinematics';

// ─── WASM module interface ──────────────────────────────────────────────────

interface RK4WasmModule {
  rk4_step: (
    state_buf: Float64Array,
    params_buf: Float64Array,
    road_buf: Float64Array,
    time: number,
    dt: number,
  ) => number;
  read_output: (index: number) => number;
  output_size: () => number;
  output_ptr: () => number;
  params_size: () => number;
  road_size: () => number;
  memory: WebAssembly.Memory;
}

let wasmModule: RK4WasmModule | null = null;
let wasmReady = false;
let initPromise: Promise<void> | null = null;

// ─── Pre-allocated buffers ──────────────────────────────────────────────────

const STATE_SIZE = 14;
const PARAMS_SIZE = 53;
const ROAD_SIZE = 15;
const OUTPUT_TOTAL = 54; // 14 state + 4×10 corner outputs
const OUTPUT_CORNER_STRIDE = 10;
const OUTPUT_CORNERS_START = 14;

const stateBuf = new Float64Array(STATE_SIZE);
const paramsBuf = new Float64Array(PARAMS_SIZE);
const roadBuf = new Float64Array(ROAD_SIZE);

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

// ─── Initialization ─────────────────────────────────────────────────────────

export async function initRK4Wasm(): Promise<void> {
  if (wasmReady) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Dynamic import of the wasm-pack generated module
      const wasmInit = await import('../../wasm-rk4/pkg/rk4_wasm.js');
      await wasmInit.default();
      wasmModule = wasmInit as unknown as RK4WasmModule;
      wasmReady = true;
      console.log('RK4 WASM engine initialized');
    } catch (e) {
      console.error('Failed to initialize RK4 WASM engine:', e);
      throw e;
    }
  })();

  return initPromise;
}

export function isRK4WasmReady(): boolean {
  return wasmReady;
}

// ─── Parameter packing ──────────────────────────────────────────────────────

function packParams(
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
  frontShock: AxleShock,
  rearShock: AxleShock,
  frontSwayBar: AxleSwayBar,
  rearSwayBar: AxleSwayBar,
  hydraulic: HydraulicConfig,
): void {
  const p = paramsBuf;
  // Vehicle
  p[0] = vehicle.wheelbase;
  p[1] = vehicle.totalWeight;
  p[2] = vehicle.weightDistribution;
  p[3] = vehicle.rideHeight;
  p[4] = vehicle.unsprungMassPerCorner;
  p[5] = vehicle.tyreSpringRate;
  p[6] = vehicle.tyreDamping;
  p[7] = vehicle.tyreRadius ?? 42;
  // Front geometry
  p[8] = frontGeo.trackWidth;
  p[9] = frontGeo.lowerWishboneRatio;
  p[10] = frontGeo.upperArmLengthRatio;
  p[11] = frontGeo.lowerArmAngle;
  p[12] = frontGeo.upperArmAngle;
  p[13] = frontGeo.uprightHeight;
  p[14] = frontGeo.kpiAngle;
  // Rear geometry
  p[15] = rearGeo.trackWidth;
  p[16] = rearGeo.lowerWishboneRatio;
  p[17] = rearGeo.upperArmLengthRatio;
  p[18] = rearGeo.lowerArmAngle;
  p[19] = rearGeo.upperArmAngle;
  p[20] = rearGeo.uprightHeight;
  p[21] = rearGeo.kpiAngle;
  // Front shock
  p[22] = frontShock.damperAttachmentRatio;
  p[23] = frontShock.springRate;
  p[24] = frontShock.dampingCompression;
  p[25] = frontShock.dampingRebound;
  p[26] = frontShock.maxDroop;
  p[27] = frontShock.maxBump;
  p[28] = frontShock.shockAngle;
  // Rear shock
  p[29] = rearShock.damperAttachmentRatio;
  p[30] = rearShock.springRate;
  p[31] = rearShock.dampingCompression;
  p[32] = rearShock.dampingRebound;
  p[33] = rearShock.maxDroop;
  p[34] = rearShock.maxBump;
  p[35] = rearShock.shockAngle;
  // Front sway bar
  p[36] = frontSwayBar.enabled ? 1.0 : 0.0;
  p[37] = frontSwayBar.wireDiameter;
  p[38] = frontSwayBar.armLength;
  // Rear sway bar
  p[39] = rearSwayBar.enabled ? 1.0 : 0.0;
  p[40] = rearSwayBar.wireDiameter;
  p[41] = rearSwayBar.armLength;
  // Hydraulic
  p[42] = hydraulic.enabled ? 1.0 : 0.0;
  p[43] = hydraulic.topology === 'lateral' ? 0 : hydraulic.topology === 'diagonal' ? 1 : 2;
  p[44] = hydraulic.cylinderBore;
  p[45] = hydraulic.cylinderRodDiameter;
  p[46] = hydraulic.fluidViscosity;
  p[47] = hydraulic.orificeDiameter;
  p[48] = hydraulic.lineInternalDiameter;
  p[49] = hydraulic.lineLength;
  p[50] = hydraulic.accumulatorSpringRate;
  // Hub offsets
  p[51] = frontGeo.hubOffset ?? 0;
  p[52] = rearGeo.hubOffset ?? 0;
}

// ─── State packing ──────────────────────────────────────────────────────────

function packState(state: SimulationState): void {
  const s = stateBuf;
  s[0] = state.chassisHeave;
  s[1] = state.rollAngle * DEG_TO_RAD;
  s[2] = state.pitchAngle * DEG_TO_RAD;
  s[3] = state.corners.FL.wheelPosition;
  s[4] = state.corners.FR.wheelPosition;
  s[5] = state.corners.RL.wheelPosition;
  s[6] = state.corners.RR.wheelPosition;
  s[7] = state.chassisHeaveVelocity;
  s[8] = state.rollVelocity * DEG_TO_RAD;
  s[9] = state.pitchVelocity * DEG_TO_RAD;
  s[10] = state.corners.FL.wheelVelocity;
  s[11] = state.corners.FR.wheelVelocity;
  s[12] = state.corners.RL.wheelVelocity;
  s[13] = state.corners.RR.wheelVelocity;
}

// ─── Road surface packing ───────────────────────────────────────────────────

const ROAD_TYPE_MAP: Record<string, number> = {
  flat: 0,
  singleBump: 1,
  speedBump: 2,
  diagonalTwist: 3,
  washboard: 4,
  step: 5,
  random: 6,
};

const TARGET_CORNER_MAP: Record<string, number> = {
  FL: 0, FR: 1, RL: 2, RR: 3,
  front: 4, rear: 5, all: 6,
};

function packRoad(
  state: SimulationState,
  vehicle: VehicleParams,
  frontGeo: AxleGeometry,
  rearGeo: AxleGeometry,
): void {
  const r = roadBuf;
  r[0] = ROAD_TYPE_MAP[state.roadSurfaceType] ?? 0;
  r[1] = state.roadBumpHeight;
  r[2] = state.roadBumpWidth;
  r[3] = state.roadSpeed;
  r[4] = state.roadFrequency;
  r[5] = TARGET_CORNER_MAP[state.roadTargetCorner as string] ?? 0;
  r[6] = 42; // seed

  // Corner positions (longitudinal and lateral offsets from CG)
  const frac = vehicle.weightDistribution / 100;
  const distToFront = vehicle.wheelbase * (1 - frac);
  const distToRear = vehicle.wheelbase * frac;

  r[7] = distToFront;                    // FL x
  r[8] = -frontGeo.trackWidth / 2;       // FL y
  r[9] = distToFront;                    // FR x
  r[10] = frontGeo.trackWidth / 2;       // FR y
  r[11] = -distToRear;                   // RL x
  r[12] = -rearGeo.trackWidth / 2;       // RL y
  r[13] = -distToRear;                   // RR x
  r[14] = rearGeo.trackWidth / 2;        // RR y
}

// ─── Output unpacking ───────────────────────────────────────────────────────

function isFront(corner: Corner): boolean {
  return corner === 'FL' || corner === 'FR';
}

function isLeft(corner: Corner): boolean {
  return corner === 'FL' || corner === 'RL';
}

// ─── Main step function ─────────────────────────────────────────────────────

export function stepRK4WasmSimulation(
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
  if (!wasmModule || !wasmReady) {
    throw new Error('RK4 WASM engine not initialized');
  }

  // Pack inputs
  packState(state);
  packParams(vehicle, frontGeo, rearGeo, frontShock, rearShock, frontSwayBar, rearSwayBar, hydraulic);
  packRoad(state, vehicle, frontGeo, rearGeo);

  // Call WASM step
  wasmModule.rk4_step(stateBuf, paramsBuf, roadBuf, state.time, dt);

  // Read output values via read_output (avoids direct memory access complexity)
  const out = new Float64Array(OUTPUT_TOTAL);
  for (let i = 0; i < OUTPUT_TOTAL; i++) {
    out[i] = wasmModule.read_output(i);
  }

  const newTime = state.time + dt;

  // Unpack new corners
  const newCorners: Record<Corner, PerCornerState> = {
    FL: { ...state.corners.FL },
    FR: { ...state.corners.FR },
    RL: { ...state.corners.RL },
    RR: { ...state.corners.RR },
  };

  for (let i = 0; i < 4; i++) {
    const c = CORNERS[i];
    const base = OUTPUT_CORNERS_START + i * OUTPUT_CORNER_STRIDE;

    newCorners[c].wheelPosition = out[WHEEL_POS_INDICES[i]];
    newCorners[c].wheelVelocity = out[WHEEL_VEL_INDICES[i]];
    newCorners[c].tyreContactForce = out[base + 0];
    newCorners[c].tyreDeflection = out[base + 1];
    newCorners[c].wheelAirborne = out[base + 2] < 0.5;
    newCorners[c].suspensionCompression = out[base + 3];
    newCorners[c].shockCompression = out[base + 3];
    newCorners[c].shockVelocity = out[base + 4];
    newCorners[c].springForce = out[base + 5];
    newCorners[c].damperForce = out[base + 6];
    newCorners[c].bumpStopForce = out[base + 7];
    newCorners[c].swayBarForce = out[base + 8];
    newCorners[c].hydraulicForce = out[base + 9];
  }

  // Kinematics (stays in JS — only called once per step)
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
    const kin = updateKinematics(geo, shock, vehicle.rideHeight, vehicle.tyreRadius, newCorners[c].shockCompression, isLeft(c));
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
    newCorners[c].camberAngle += computeSteeringCamberGain(
      newCorners[c].steeringAngle, kin.dynamicCaster, kin.dynamicKPI,
    );
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
    chassisHeave: out[0],
    chassisHeaveVelocity: out[7],
    rollAngle: out[1] * RAD_TO_DEG,
    rollVelocity: out[8] * RAD_TO_DEG,
    pitchAngle: out[2] * RAD_TO_DEG,
    pitchVelocity: out[9] * RAD_TO_DEG,
    corners: newCorners,
    frontRollCentreHeight: frontRCH,
    rearRollCentreHeight: rearRCH,
  };
}

// State vector index helpers
const WHEEL_POS_INDICES = [3, 4, 5, 6];
const WHEEL_VEL_INDICES = [10, 11, 12, 13];
