import { create } from 'zustand';
import type {
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
  SteeringRack,
  HydraulicConfig,
  PresetConfig,
} from '../types/suspension';

// ── 1:8 Off-Road Buggy preset defaults ──────────────────────────────────────

const defaultVehicle: VehicleParams = {
  scale: '1:8',
  wheelbase: 325,
  totalWeight: 3500,
  weightDistribution: 45,
  cgHeight: 35,
  rideHeight: 28,
  unsprungMassPerCorner: 65,
  tyreSpringRate: 80,
  tyreDamping: 0.05,
  tyreRadius: 42,
  tyreWidth: 45,
};

const defaultFrontGeometry: AxleGeometry = {
  trackWidth: 304,
  lowerWishboneRatio: 0.54,
  upperArmLengthRatio: 0.55,
  lowerArmAngle: 0,
  upperArmAngle: -3,
  uprightHeight: 27.8,
  innerPivotSpread: 32,
  upperInnerPivotSpread: 26,
  wishboneOuterWidthRatio: 0.35,
  hubOffset: 10,
  kpiAngle: 5,
  casterAngle: 24,
  staticCamber: -1,
  staticToe: 0,

  antiDive: 5,
  antiSquat: 0,
};

const defaultRearGeometry: AxleGeometry = {
  trackWidth: 304,
  lowerWishboneRatio: 0.57,
  upperArmLengthRatio: 0.50,
  lowerArmAngle: 2,
  upperArmAngle: -2,
  uprightHeight: 19.2,
  innerPivotSpread: 35,
  upperInnerPivotSpread: 28,
  wishboneOuterWidthRatio: 0.35,
  hubOffset: 10,
  kpiAngle: 0,
  casterAngle: 0,
  staticCamber: -2,
  staticToe: 2,

  antiDive: 0,
  antiSquat: 2,
};

const defaultFrontShock: AxleShock = {
  shockLength: 90,
  damperAttachmentRatio: 0.62,
  shockAngle: 15,
  springRate: 7.5,
  dampingCompression: 0.12,
  dampingRebound: 0.18,
  maxDroop: 30,
  maxBump: 22,
};

const defaultRearShock: AxleShock = {
  shockLength: 100,
  damperAttachmentRatio: 0.67,
  shockAngle: 10,
  springRate: 9.0,
  dampingCompression: 0.15,
  dampingRebound: 0.22,
  maxDroop: 28,
  maxBump: 25,
};

const defaultFrontSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 2.3,
  armLength: 28,
};

const defaultRearSwayBar: AxleSwayBar = {
  enabled: false,
  wireDiameter: 2.0,
  armLength: 25,
};

const defaultFrontSteeringRack: SteeringRack = {
  rackWidth: 210,
  rackHeight: 18,
  rackForwardOffset: 15,
  steeringArmLength: 22,
  maxSteeringAngle: 40,
};

const defaultRearSteeringRack: SteeringRack = {
  rackWidth: 210,
  rackHeight: 18,
  rackForwardOffset: -10,
  steeringArmLength: 22,
  maxSteeringAngle: 10,
};

const defaultHydraulic: HydraulicConfig = {
  enabled: false,
  topology: 'lateral',
  cylinderBore: 8,
  cylinderRodDiameter: 4,
  fluidViscosity: 30,
  orificeDiameter: 1.5,
  lineInternalDiameter: 3,
  lineLength: 200,
  accumulatorSpringRate: 2.0,
  accumulatorPreload: 5,
  heightCorrectorEnabled: false,
  heightCorrectorResponseTime: 500,
};

// ── Store interface ──────────────────────────────────────────────────────────

interface VehicleStore {
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

  // Actions
  setVehicle: (params: Partial<VehicleParams>) => void;
  setFrontGeometry: (params: Partial<AxleGeometry>) => void;
  setRearGeometry: (params: Partial<AxleGeometry>) => void;
  setFrontShock: (params: Partial<AxleShock>) => void;
  setRearShock: (params: Partial<AxleShock>) => void;
  setFrontSwayBar: (params: Partial<AxleSwayBar>) => void;
  setRearSwayBar: (params: Partial<AxleSwayBar>) => void;
  setFrontSteeringRack: (params: Partial<SteeringRack>) => void;
  setRearSteeringRack: (params: Partial<SteeringRack>) => void;
  setHydraulic: (params: Partial<HydraulicConfig>) => void;
  copyFrontToRear: () => void;
  copyRearToFront: () => void;
  loadPreset: (preset: string | PresetConfig) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useVehicleStore = create<VehicleStore>((set, get) => ({
  vehicle: { ...defaultVehicle },
  frontGeometry: { ...defaultFrontGeometry },
  rearGeometry: { ...defaultRearGeometry },
  frontShock: { ...defaultFrontShock },
  rearShock: { ...defaultRearShock },
  frontSwayBar: { ...defaultFrontSwayBar },
  rearSwayBar: { ...defaultRearSwayBar },
  frontSteeringRack: { ...defaultFrontSteeringRack },
  rearSteeringRack: { ...defaultRearSteeringRack },
  hydraulic: { ...defaultHydraulic },

  setVehicle: (params) =>
    set((state) => ({ vehicle: { ...state.vehicle, ...params } })),

  setFrontGeometry: (params) =>
    set((state) => ({ frontGeometry: { ...state.frontGeometry, ...params } })),

  setRearGeometry: (params) =>
    set((state) => ({ rearGeometry: { ...state.rearGeometry, ...params } })),

  setFrontShock: (params) =>
    set((state) => ({ frontShock: { ...state.frontShock, ...params } })),

  setRearShock: (params) =>
    set((state) => ({ rearShock: { ...state.rearShock, ...params } })),

  setFrontSwayBar: (params) =>
    set((state) => ({ frontSwayBar: { ...state.frontSwayBar, ...params } })),

  setRearSwayBar: (params) =>
    set((state) => ({ rearSwayBar: { ...state.rearSwayBar, ...params } })),

  setFrontSteeringRack: (params) =>
    set((state) => ({ frontSteeringRack: { ...state.frontSteeringRack, ...params } })),

  setRearSteeringRack: (params) =>
    set((state) => ({ rearSteeringRack: { ...state.rearSteeringRack, ...params } })),

  setHydraulic: (params) =>
    set((state) => ({ hydraulic: { ...state.hydraulic, ...params } })),

  copyFrontToRear: () => {
    const { frontGeometry, frontShock } = get();
    set({
      rearGeometry: {
        ...frontGeometry,
        // Preserve rear-specific defaults
        kpiAngle: 0,
        casterAngle: 0,
        antiDive: 0,
        antiSquat: 15,
        staticToe: 0.5,
      
      },
      rearShock: { ...frontShock },
    });
  },

  copyRearToFront: () => {
    const { rearGeometry, rearShock } = get();
    set({
      frontGeometry: {
        ...rearGeometry,
        // Preserve front-specific defaults
        kpiAngle: 8,
        casterAngle: 25,
        antiDive: 10,
        antiSquat: 0,
        staticToe: 1,
      
      },
      frontShock: { ...rearShock },
    });
  },

  loadPreset: (preset) => {
    // Accept either a preset name string or a full PresetConfig object
    if (typeof preset === 'object') {
      set({
        vehicle: { ...preset.vehicle },
        frontGeometry: { ...preset.frontGeometry },
        rearGeometry: { ...preset.rearGeometry },
        frontShock: { ...preset.frontShock },
        rearShock: { ...preset.rearShock },
        frontSwayBar: { ...preset.frontSwayBar },
        rearSwayBar: { ...preset.rearSwayBar },
        frontSteeringRack: { ...preset.frontSteeringRack },
        rearSteeringRack: { ...preset.rearSteeringRack },
        hydraulic: { ...preset.hydraulic },
      });
      return;
    }

    switch (preset) {
      case '1:8':
      default:
        set({
          vehicle: { ...defaultVehicle, scale: '1:8' },
          frontGeometry: { ...defaultFrontGeometry },
          rearGeometry: { ...defaultRearGeometry },
          frontShock: { ...defaultFrontShock },
          rearShock: { ...defaultRearShock },
          frontSwayBar: { ...defaultFrontSwayBar },
          rearSwayBar: { ...defaultRearSwayBar },
          frontSteeringRack: { ...defaultFrontSteeringRack },
          rearSteeringRack: { ...defaultRearSteeringRack },
          hydraulic: { ...defaultHydraulic },
        });
        break;
      case '1:10':
        set({
          vehicle: {
            ...defaultVehicle,
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
          },
          frontGeometry: {
            ...defaultFrontGeometry,
            trackWidth: 238,
            lowerWishboneRatio: 0.42,
            upperArmLengthRatio: 0.50,
            uprightHeight: 22.3,
            innerPivotSpread: 26,
            upperInnerPivotSpread: 21,
            hubOffset: 8,
            kpiAngle: 5,
            casterAngle: 12,
            staticCamber: -0.5,
            staticToe: 0,
            antiDive: 4,
          },
          rearGeometry: {
            ...defaultRearGeometry,
            trackWidth: 242,
            lowerWishboneRatio: 0.44,
            upperArmLengthRatio: 0.45,
            lowerArmAngle: 1.5,
            uprightHeight: 17.1,
            innerPivotSpread: 28,
            upperInnerPivotSpread: 22,
            hubOffset: 8,
            staticCamber: -2.5,
            staticToe: 2.5,
            antiSquat: 2.5,
          },
          frontShock: {
            ...defaultFrontShock,
            shockLength: 70,
            damperAttachmentRatio: 0.65,
            shockAngle: 12,
            springRate: 4.5,
            dampingCompression: 0.08,
            dampingRebound: 0.12,
            maxDroop: 25,
            maxBump: 18,
          },
          rearShock: {
            ...defaultRearShock,
            shockLength: 78,
            damperAttachmentRatio: 0.69,
            shockAngle: 8,
            springRate: 5.5,
            dampingCompression: 0.10,
            dampingRebound: 0.14,
            maxDroop: 22,
            maxBump: 20,
          },
          frontSwayBar: { ...defaultFrontSwayBar, wireDiameter: 1.6, armLength: 22 },
          rearSwayBar: { ...defaultRearSwayBar, enabled: true, wireDiameter: 1.8, armLength: 25 },
          frontSteeringRack: { ...defaultFrontSteeringRack, rackWidth: 162, rackHeight: 15, rackForwardOffset: 12, steeringArmLength: 16, maxSteeringAngle: 40 },
          rearSteeringRack: { ...defaultRearSteeringRack, rackWidth: 162, rackHeight: 15, rackForwardOffset: -8, steeringArmLength: 16, maxSteeringAngle: 10 },
          hydraulic: { ...defaultHydraulic },
        });
        break;
    }
  },
}));
