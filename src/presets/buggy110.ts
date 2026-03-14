import type {
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
  SteeringRack,
  HydraulicConfig,
} from '../types/suspension';

export const vehicle: VehicleParams = {
  scale: '1:10',
  wheelbase: 283,
  totalWeight: 1600,
  weightDistribution: 50,
  cgHeight: 25,
  rideHeight: 20,
  unsprungMassPerCorner: 40,
  tyreSpringRate: 60,
  tyreDamping: 0.03,
  tyreRadius: 27,
  tyreWidth: 30,
  inertiaScaling: 0.3,
};

export const frontGeometry: AxleGeometry = {
  trackWidth: 238,
  lowerWishboneRatio: 0.42,
  upperArmLengthRatio: 0.50,
  lowerArmAngle: 0,
  upperArmAngle: -3,
  uprightHeight: 22.3,
  innerPivotSpread: 26,
  upperInnerPivotSpread: 21,
  wishboneOuterWidthRatio: 0.35,
  hubOffset: 8,
  kpiAngle: 5,
  casterAngle: 12,
  staticCamber: -0.5,
  staticToe: 0,

  antiDive: 4,
  antiSquat: 0,
};

export const rearGeometry: AxleGeometry = {
  trackWidth: 242,
  lowerWishboneRatio: 0.44,
  upperArmLengthRatio: 0.45,
  lowerArmAngle: 1.5,
  upperArmAngle: -2,
  uprightHeight: 17.1,
  innerPivotSpread: 28,
  upperInnerPivotSpread: 22,
  wishboneOuterWidthRatio: 0.35,
  hubOffset: 8,
  kpiAngle: 0,
  casterAngle: 0,
  staticCamber: -2.5,
  staticToe: 2.5,

  antiDive: 0,
  antiSquat: 2.5,
};

export const frontShock: AxleShock = {
  shockLength: 70,
  damperAttachmentRatio: 0.65,
  shockAngle: 12,
  springRate: 4.5,
  dampingCompression: 0.08,
  dampingRebound: 0.12,
  maxDroop: 25,
  maxBump: 18,
  bumpStopStiffness: 50,
};

export const rearShock: AxleShock = {
  shockLength: 78,
  damperAttachmentRatio: 0.69,
  shockAngle: 8,
  springRate: 5.5,
  dampingCompression: 0.10,
  dampingRebound: 0.14,
  maxDroop: 22,
  maxBump: 20,
  bumpStopStiffness: 50,
};

export const frontSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 1.6,
  armLength: 22,
};

export const rearSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 1.8,
  armLength: 25,
};

export const frontSteeringRack: SteeringRack = {
  rackWidth: 162,
  rackHeight: 15,
  rackForwardOffset: 12,
  steeringArmLength: 16,
  maxSteeringAngle: 40,
};

export const rearSteeringRack: SteeringRack = {
  rackWidth: 162,
  rackHeight: 15,
  rackForwardOffset: -8,
  steeringArmLength: 16,
  maxSteeringAngle: 10,
};

export const hydraulic: HydraulicConfig = {
  enabled: false,
  topology: 'lateral',
  cylinderBore: 8,
  cylinderRodDiameter: 4,
  fluidViscosity: 50,
  orificeDiameter: 0.8,
  lineInternalDiameter: 2.0,
  lineLength: 200,
  accumulatorSpringRate: 5.0,
  accumulatorPreload: 10,
  heightCorrectorEnabled: false,
  heightCorrectorResponseTime: 500,
};
