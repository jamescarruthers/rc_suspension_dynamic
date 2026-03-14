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
  trackWidth: 254,
  lowerWishboneRatio: 0.54,
  upperArmLengthRatio: 0.75,
  lowerArmAngle: 0,
  uprightHeight: 27.8,
  innerPivotHeightLower: 12,
  innerPivotHeightUpper: 45,
  innerPivotSpread: 32,
  kpiAngle: 5,
  casterAngle: 25,
  staticCamber: -2,
  staticToe: 0,
  antiDive: 8,
  antiSquat: 0,
};

const defaultRearGeometry: AxleGeometry = {
  trackWidth: 254,
  lowerWishboneRatio: 0.57,
  upperArmLengthRatio: 0.70,
  lowerArmAngle: 2,
  uprightHeight: 19.2,
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
  enabled: true,
  wireDiameter: 2.5,
  armLength: 32,
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
        antiSquat: 2,
        staticToe: 2,
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
        kpiAngle: 5,
        casterAngle: 25,
        antiDive: 8,
        antiSquat: 0,
        staticToe: 0,
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
            trackWidth: 249,
            lowerWishboneRatio: 0.42,
            upperArmLengthRatio: 0.72,
            uprightHeight: 22.3,
            innerPivotHeightLower: 10,
            innerPivotHeightUpper: 35,
            innerPivotSpread: 26,
            casterAngle: 25,
            staticCamber: -1.5,
            antiDive: 4,
          },
          rearGeometry: {
            ...defaultRearGeometry,
            trackWidth: 249,
            lowerWishboneRatio: 0.44,
            upperArmLengthRatio: 0.68,
            lowerArmAngle: 1.5,
            uprightHeight: 17.1,
            innerPivotHeightLower: 11,
            innerPivotHeightUpper: 33,
            innerPivotSpread: 28,
            staticCamber: -2.5,
            staticToe: 2.5,
            antiSquat: 2.5,
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
