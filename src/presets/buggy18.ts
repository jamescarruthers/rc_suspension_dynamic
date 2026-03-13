import type {
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
  HydraulicConfig,
} from '../types/suspension';

export const vehicle: VehicleParams = {
  scale: '1:8',
  wheelbase: 325,
  totalWeight: 3500,
  weightDistribution: 45,
  cgHeight: 35,
  rideHeight: 28,
  unsprungMassPerCorner: 65,
  tyreSpringRate: 80,
  tyreDamping: 0.05,
};

export const frontGeometry: AxleGeometry = {
  trackWidth: 254,
  lowerWishboneLength: 68,
  upperArmLengthRatio: 0.55,
  lowerArmAngle: 0,
  upperArmAngle: -8,
  innerPivotHeightLower: 12,
  innerPivotHeightUpper: 45,
  innerPivotSpread: 32,
  kpiAngle: 5,
  casterAngle: 15,
  staticCamber: -1,
  staticToe: 0,
  antiDive: 5,
  antiSquat: 0,
};

export const rearGeometry: AxleGeometry = {
  trackWidth: 254,
  lowerWishboneLength: 72,
  upperArmLengthRatio: 0.50,
  lowerArmAngle: 2,
  upperArmAngle: -10,
  innerPivotHeightLower: 14,
  innerPivotHeightUpper: 42,
  innerPivotSpread: 35,
  kpiAngle: 0,
  casterAngle: 0,
  staticCamber: -2,
  staticToe: 2,
  antiDive: 0,
  antiSquat: 2,
};

export const frontShock: AxleShock = {
  shockLength: 90,
  mountPosition: 42,
  towerHeight: 72,
  shockAngle: 15,
  springRate: 7.5,
  dampingCompression: 0.12,
  dampingRebound: 0.18,
  maxDroop: 30,
  maxBump: 22,
};

export const rearShock: AxleShock = {
  shockLength: 100,
  mountPosition: 48,
  towerHeight: 78,
  shockAngle: 10,
  springRate: 9.0,
  dampingCompression: 0.15,
  dampingRebound: 0.22,
  maxDroop: 28,
  maxBump: 25,
};

export const frontSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 2.3,
  armLength: 28,
};

export const rearSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 2.5,
  armLength: 32,
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
