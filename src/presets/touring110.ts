import type {
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
  HydraulicConfig,
} from '../types/suspension';

export const vehicle: VehicleParams = {
  scale: '1:10',
  wheelbase: 257,
  totalWeight: 1350,
  weightDistribution: 50,
  cgHeight: 15,
  rideHeight: 6,
  unsprungMassPerCorner: 35,
  tyreSpringRate: 150,
  tyreDamping: 0.02,
  tyreRadius: 26,
  tyreWidth: 26,
};

export const frontGeometry: AxleGeometry = {
  trackWidth: 190,
  lowerWishboneRatio: 0.47,
  upperArmLengthRatio: 0.45,
  lowerArmAngle: 0,
  upperArmAngle: -2,
  uprightHeight: 14.2,
  innerPivotSpread: 20,
  hubOffset: 7,
  kpiAngle: 3,
  casterAngle: 5,
  staticCamber: -1.5,
  staticToe: 0,
  ackermannArmLength: 10,
  antiDive: 2,
  antiSquat: 0,
};

export const rearGeometry: AxleGeometry = {
  trackWidth: 190,
  lowerWishboneRatio: 0.48,
  upperArmLengthRatio: 0.42,
  lowerArmAngle: 0.5,
  upperArmAngle: -1,
  uprightHeight: 12.6,
  innerPivotSpread: 21,
  hubOffset: 7,
  kpiAngle: 0,
  casterAngle: 0,
  staticCamber: -1.5,
  staticToe: 1.5,
  ackermannArmLength: 10,
  antiDive: 0,
  antiSquat: 1,
};

export const frontShock: AxleShock = {
  shockLength: 52,
  damperAttachmentRatio: 0.62,
  shockAngle: 8,
  springRate: 11.0,
  dampingCompression: 0.10,
  dampingRebound: 0.14,
  maxDroop: 5,
  maxBump: 5,
};

export const rearShock: AxleShock = {
  shockLength: 55,
  damperAttachmentRatio: 0.65,
  shockAngle: 6,
  springRate: 12.5,
  dampingCompression: 0.11,
  dampingRebound: 0.15,
  maxDroop: 5,
  maxBump: 5,
};

export const frontSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 1.1,
  armLength: 18,
};

export const rearSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 1.3,
  armLength: 20,
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
