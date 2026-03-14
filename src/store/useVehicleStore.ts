import { create } from 'zustand';
import type {
  VehicleParams,
  AxleGeometry,
  AxleShock,
  AxleSwayBar,
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
  trackWidth: 310,
  lowerWishboneRatio: 0.35,
  upperArmLengthRatio: 0.85,
  lowerArmAngle: 5,
  upperArmAngle: -5,
  uprightHeight: 16.7,
  innerPivotSpread: 50,
  upperInnerPivotSpread: 40,
  hubOffset: 10,
  kpiAngle: 8,
  casterAngle: 25,
  staticCamber: -1,
  staticToe: 1,
  ackermannArmLength: 15,
  antiDive: 10,
  antiSquat: 0,
};

const defaultRearGeometry: AxleGeometry = {
  trackWidth: 310,
  lowerWishboneRatio: 0.35,
  upperArmLengthRatio: 0.85,
  lowerArmAngle: 5,
  upperArmAngle: -5,
  uprightHeight: 16.7,
  innerPivotSpread: 50,
  upperInnerPivotSpread: 40,
  hubOffset: 10,
  kpiAngle: 0,
  casterAngle: 0,
  staticCamber: -1,
  staticToe: 0.5,
  ackermannArmLength: 15,
  antiDive: 0,
  antiSquat: 15,
};

const defaultFrontShock: AxleShock = {
  shockLength: 105,
  damperAttachmentRatio: 0.73,
  shockAngle: 15,
  springRate: 5.5,
  dampingCompression: 0.08,
  dampingRebound: 0.12,
  maxDroop: 25,
  maxBump: 30,
};

const defaultRearShock: AxleShock = {
  shockLength: 115,
  damperAttachmentRatio: 0.76,
  shockAngle: 12,
  springRate: 6.0,
  dampingCompression: 0.10,
  dampingRebound: 0.15,
  maxDroop: 28,
  maxBump: 35,
};

const defaultFrontSwayBar: AxleSwayBar = {
  enabled: true,
  wireDiameter: 2.5,
  armLength: 25,
};

const defaultRearSwayBar: AxleSwayBar = {
  enabled: false,
  wireDiameter: 2.0,
  armLength: 25,
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
  hydraulic: HydraulicConfig;

  // Actions
  setVehicle: (params: Partial<VehicleParams>) => void;
  setFrontGeometry: (params: Partial<AxleGeometry>) => void;
  setRearGeometry: (params: Partial<AxleGeometry>) => void;
  setFrontShock: (params: Partial<AxleShock>) => void;
  setRearShock: (params: Partial<AxleShock>) => void;
  setFrontSwayBar: (params: Partial<AxleSwayBar>) => void;
  setRearSwayBar: (params: Partial<AxleSwayBar>) => void;
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
        ackermannArmLength: 15,
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
        ackermannArmLength: 15,
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
          hydraulic: { ...defaultHydraulic },
        });
        break;
      case '1:10':
        set({
          vehicle: {
            ...defaultVehicle,
            scale: '1:10',
            wheelbase: 258,
            totalWeight: 1800,
            weightDistribution: 48,
            cgHeight: 28,
            rideHeight: 22,
            unsprungMassPerCorner: 40,
            tyreSpringRate: 60,
            tyreDamping: 0.04,
            tyreRadius: 35,
            tyreWidth: 35,
          },
          frontGeometry: {
            ...defaultFrontGeometry,
            trackWidth: 250,
            lowerWishboneRatio: 0.36,
          },
          rearGeometry: {
            ...defaultRearGeometry,
            trackWidth: 250,
            lowerWishboneRatio: 0.36,
          },
          frontShock: {
            ...defaultFrontShock,
            shockLength: 85,
            damperAttachmentRatio: 0.71,
            springRate: 4.0,
            dampingCompression: 0.06,
            dampingRebound: 0.09,
            maxDroop: 20,
            maxBump: 25,
          },
          rearShock: {
            ...defaultRearShock,
            shockLength: 90,
            damperAttachmentRatio: 0.76,
            springRate: 4.5,
            dampingCompression: 0.07,
            dampingRebound: 0.10,
            maxDroop: 22,
            maxBump: 28,
          },
          frontSwayBar: { ...defaultFrontSwayBar, wireDiameter: 2.0 },
          rearSwayBar: { ...defaultRearSwayBar },
          hydraulic: { ...defaultHydraulic },
        });
        break;
    }
  },
}));
