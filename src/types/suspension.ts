/** Core types for the RC Suspension Dynamic Simulator */

// ─── Corner identifiers ─────────────────────────────────────────────

/** Four corners of the vehicle */
export type Corner = 'FL' | 'FR' | 'RL' | 'RR';

export const CORNERS: readonly Corner[] = ['FL', 'FR', 'RL', 'RR'] as const;
export const FRONT_CORNERS: readonly Corner[] = ['FL', 'FR'] as const;
export const REAR_CORNERS: readonly Corner[] = ['RL', 'RR'] as const;
export const LEFT_CORNERS: readonly Corner[] = ['FL', 'RL'] as const;
export const RIGHT_CORNERS: readonly Corner[] = ['FR', 'RR'] as const;

// ─── Vehicle parameters ─────────────────────────────────────────────

export interface VehicleParams {
  scale: string;                  // '1:8' | '1:10' | 'custom'
  wheelbase: number;              // mm, 200-400, default 325
  totalWeight: number;            // g, 1000-6000, default 3500
  weightDistribution: number;     // front %, 20-80, default 45
  cgHeight: number;               // mm, 10-80, default 35
  rideHeight: number;             // mm, 5-50, default 28
  unsprungMassPerCorner: number;  // g, 20-200, default 65
  tyreSpringRate: number;         // N/mm, 10-500, default 80
  tyreDamping: number;            // Ns/mm, 0.001-0.5, default 0.05
  tyreRadius: number;             // mm, loaded tyre radius (1:8 ~42, 1:10 ~35)
  tyreWidth: number;              // mm, tyre section width (1:8 ~45, 1:10 ~35)
  inertiaScaling: number;         // 0.1-1.0, radius-of-gyration fraction for roll/pitch inertia (default 0.3)
}

// ─── Axle geometry ──────────────────────────────────────────────────

export interface AxleGeometry {
  trackWidth: number;             // mm
  lowerWishboneRatio: number;     // ratio of half-track width (0-1)
  upperArmLengthRatio: number;    // ratio (upper arm length / lower arm length)
  lowerArmAngle: number;          // degrees from horizontal (at rest)
  upperArmAngle: number;          // degrees from horizontal (at rest)
  uprightHeight: number;          // mm, distance between lower and upper ball joints (centred on wheel)
  innerPivotSpread: number;       // mm (fore-aft spacing of lower A-arm pivots)
  upperInnerPivotSpread: number;  // mm (fore-aft spacing of upper A-arm pivots)
  wishboneOuterWidthRatio: number; // ratio of outer (kingpin-end) width to inner pivot spread (0-1)
  hubOffset: number;               // mm, axle stub from kingpin centre to wheel hub
  kpiAngle: number;               // degrees (KPI)
  casterAngle: number;            // degrees
  staticCamber: number;           // degrees
  staticToe: number;              // degrees
  antiDive: number;               // degrees (front only)
  antiSquat: number;              // degrees (rear only)
}

// ─── Steering rack ──────────────────────────────────────────────────

export interface SteeringRack {
  rackWidth: number;              // mm, lateral distance between left and right tie rod inner ends
  rackHeight: number;             // mm, height of rack axis above ground (absolute)
  rackForwardOffset: number;      // mm, longitudinal offset of rack from axle line (positive = forward)
  steeringArmLength?: number;     // mm, kingpin to tie rod ball joint (optional; derived from rack geometry if omitted)
  maxSteeringAngle?: number;      // degrees, maximum commanded steering angle (default 30)
}

// ─── Shock absorber ─────────────────────────────────────────────────

export interface AxleShock {
  shockLength: number;            // mm (body length at ride height)
  damperAttachmentRatio: number;  // 0-1, fraction along lower arm from inner pivot
  shockAngle: number;             // degrees from vertical
  springRate: number;             // N/mm
  dampingCompression: number;     // Ns/mm
  dampingRebound: number;         // Ns/mm
  maxDroop: number;               // mm
  maxBump: number;                // mm
  bumpStopStiffness: number;      // N/mm², quadratic bump stop coefficient (default 50)
}

// ─── Sway bar ───────────────────────────────────────────────────────

export interface AxleSwayBar {
  enabled: boolean;
  wireDiameter: number;           // mm
  armLength: number;              // mm
}

// ─── Hydraulic interconnection ──────────────────────────────────────

export interface HydraulicConfig {
  enabled: boolean;
  topology: 'lateral' | 'diagonal' | 'full';
  cylinderBore: number;           // mm
  cylinderRodDiameter: number;    // mm
  fluidViscosity: number;         // cSt
  orificeDiameter: number;        // mm
  lineInternalDiameter: number;   // mm
  lineLength: number;             // mm
  accumulatorSpringRate: number;  // N/mm
  accumulatorPreload: number;     // N
  heightCorrectorEnabled: boolean;
  heightCorrectorResponseTime: number; // ms
}

// ─── Per-corner simulation state ─────────────────────────────────────

export interface PerCornerState {
  wheelPosition: number;          // z_u - vertical position of wheel centre
  wheelVelocity: number;          // v_u
  suspensionCompression: number;
  shockCompression: number;
  shockVelocity: number;
  tyreDeflection: number;
  tyreContactForce: number;
  springForce: number;
  damperForce: number;
  bumpStopForce: number;
  swayBarForce: number;
  hydraulicForce: number;
  hydraulicPressure: number;
  camberAngle: number;
  steeringAngle: number;          // degrees, per-wheel after Ackermann
  ackermannPercent: number;       // %, effective Ackermann percentage at current steering angle
  wheelAirborne: boolean;
  // Derived geometry (SAE J670 §3.3)
  dynamicKPI: number;             // degrees, kingpin inclination from ball joint positions
  dynamicCaster: number;          // degrees, caster angle from ball joint positions
  scrubRadius: number;            // mm, lateral offset of kingpin ground intercept from contact patch
  casterTrail: number;            // mm, longitudinal offset of kingpin ground intercept from contact patch
  motionRatio: number;            // instantaneous motion ratio (varies with travel)
  // 3D ball joint positions from dynamic solver (unsigned lateral, absolute vertical, longitudinal offset from axle)
  lowerBJPosition: { lateral: number; vertical: number; longitudinal: number };
  upperBJPosition: { lateral: number; vertical: number; longitudinal: number };
}

// ─── Full simulation state ──────────────────────────────────────────

export type PhysicsEngineType = 'custom' | 'rapier' | 'rk4' | 'rk4-wasm';

export interface SimulationState {
  mode: 'kinematic' | 'dynamic';
  physicsEngine: PhysicsEngineType;
  running: boolean;
  time: number;
  playbackSpeed: number;
  physicsHz: number;
  // Sprung mass state
  chassisHeave: number;           // z_s
  chassisHeaveVelocity: number;   // v_s
  rollAngle: number;              // theta_roll
  rollVelocity: number;           // omega_roll
  pitchAngle: number;             // theta_pitch
  pitchVelocity: number;          // omega_pitch
  // Per corner
  corners: Record<Corner, PerCornerState>;
  // Roll centre heights
  frontRollCentreHeight: number;
  rearRollCentreHeight: number;
  // Input state
  rollInput: number;              // degrees
  pitchInput: number;             // degrees
  frontSteeringAngle: number;     // degrees, commanded front axle steering
  rearSteeringAngle: number;      // degrees, commanded rear axle steering
  // Drop test
  dropHeight: number;             // mm
  dropRollAngle: number;          // degrees
  dropPitchAngle: number;         // degrees
  // Road surface
  roadSurfaceType: string;
  roadBumpHeight: number;
  roadBumpWidth: number;
  roadBumpShape: string;
  roadSpeed: number;
  roadFrequency: number;
  roadAmplitude: number;
  roadTargetCorner: Corner | 'front' | 'rear' | 'all';
  // Force arrow visibility
  forceVisibility: Record<string, boolean>;
  forceScale: number;
  // Part visibility
  partVisibility: Record<string, boolean>;
  // Graph
  graphChannels: string[];
  graphTimeWindow: number;
  graphHistory: Array<Record<string, number>>;
}

// ─── Preset config ──────────────────────────────────────────────────

export interface PresetConfig {
  vehicle: VehicleParams;
  frontGeometry: AxleGeometry;
  rearGeometry: AxleGeometry;
  frontShock: AxleShock;
  rearShock: AxleShock;
  frontSwayBar: AxleSwayBar;
  rearSwayBar: AxleSwayBar;
  frontSteeringRack: SteeringRack;
  rearSteeringRack: SteeringRack;
  hydraulic: HydraulicConfig;
}

// ─── Road Surface (legacy compat) ───────────────────────────────────

export type RoadProfileType =
  | 'flat'
  | 'singleBump'
  | 'speedBump'
  | 'diagonalTwist'
  | 'washboard'
  | 'step'
  | 'random';

export type BumpShape = 'halfsine' | 'fullsine' | 'triangle' | 'square';

export interface RoadProfileParams {
  /** Bump / obstacle height in mm */
  height: number;
  /** Bump length in mm (longitudinal extent) */
  width: number;
  /** Vehicle speed in mm/s */
  speed: number;
  /** Washboard frequency in Hz */
  frequency: number;
  /** Bump cross-section shape */
  shape?: BumpShape;
  /** Which corner the obstacle targets (for singleBump) */
  targetCorner?: Corner;
  /** Random seed */
  seed?: number;
}
