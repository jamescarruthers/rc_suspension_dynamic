import { create } from 'zustand';
import type { Corner, PerCornerState, PhysicsEngineType, SimulationState } from '../types/suspension';

// ── Default per-corner state ─────────────────────────────────────────────────
// Default wheelPosition to tyre radius (42mm for 1:8 buggy) so the car renders
// correctly on the ground even before equilibrium is computed.

function defaultCornerState(wheelPosition: number = 42): PerCornerState {
  return {
    wheelPosition,
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
    ackermannPercent: 0,
    wheelAirborne: false,
    dynamicKPI: 0,
    dynamicCaster: 0,
    scrubRadius: 0,
    casterTrail: 0,
    motionRatio: 0,
    lowerBJPosition: { lateral: 0, vertical: 0, longitudinal: 0 },
    upperBJPosition: { lateral: 0, vertical: 0, longitudinal: 0 },
  };
}

function defaultCorners(wheelPosition: number = 42): Record<Corner, PerCornerState> {
  return {
    FL: defaultCornerState(wheelPosition),
    FR: defaultCornerState(wheelPosition),
    RL: defaultCornerState(wheelPosition),
    RR: defaultCornerState(wheelPosition),
  };
}

// ── Default force visibility ─────────────────────────────────────────────────

function defaultForceVisibility(): Record<string, boolean> {
  return {
    weight: true,
    groundReaction: true,
    springForce: false,
    damperForce: false,
    bumpStopForce: false,
    swayBarForce: false,
    hydraulicForce: false,
    tyreForce: false,
  };
}

// ── Default simulation state ─────────────────────────────────────────────────

function defaultSimulationState(): SimulationState {
  return {
    mode: 'dynamic',
    physicsEngine: 'rk4-wasm',
    running: true,
    time: 0,
    playbackSpeed: 1,
    physicsHz: 500,
    // Sprung mass state
    chassisHeave: 0,
    chassisHeaveVelocity: 0,
    rollAngle: 0,
    rollVelocity: 0,
    pitchAngle: 0,
    pitchVelocity: 0,
    // Per corner
    corners: defaultCorners(),
    // Roll centre heights
    frontRollCentreHeight: 0,
    rearRollCentreHeight: 0,
    // Input state
    rollInput: 0,
    pitchInput: 0,
    frontSteeringAngle: 0,
    rearSteeringAngle: 0,
    // Drop test
    dropHeight: 50,
    dropRollAngle: 0,
    dropPitchAngle: 0,
    // Road surface
    roadSurfaceType: 'singleBump',
    roadBumpHeight: 10,
    roadBumpWidth: 150,
    roadBumpShape: 'halfsine',
    roadSpeed: 1000,
    roadFrequency: 1,
    roadAmplitude: 5,
    roadTargetCorner: 'FL',
    roadIsoClass: 'B',
    roadIsoScale: 1,
    // Force arrow visibility
    forceVisibility: defaultForceVisibility(),
    forceScale: 1,
    // Part visibility
    partVisibility: {
      chassis: true,
      FL: true,
      FR: true,
      RL: true,
      RR: true,
    } as Record<string, boolean>,
    // Graph
    graphChannels: ['chassisHeave', 'rollAngle'],
    graphTimeWindow: 5,
    graphHistory: [],
  };
}

// ── Store interface ──────────────────────────────────────────────────────────

interface SimulationStore extends SimulationState {
  // Mode & playback
  setMode: (mode: 'kinematic' | 'dynamic') => void;
  setPhysicsEngine: (engine: PhysicsEngineType) => void;
  toggleRunning: () => void;
  reset: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setPhysicsHz: (hz: number) => void;

  // Input controls
  setRollInput: (degrees: number) => void;
  setPitchInput: (degrees: number) => void;
  setFrontSteeringAngle: (degrees: number) => void;
  setRearSteeringAngle: (degrees: number) => void;

  // Drop test
  setDropHeight: (mm: number) => void;
  setDropRollAngle: (degrees: number) => void;
  setDropPitchAngle: (degrees: number) => void;
  triggerDrop: () => void;

  // Road surface
  setRoadSurface: (params: Partial<Pick<SimulationState,
    'roadSurfaceType' | 'roadBumpHeight' | 'roadBumpWidth' | 'roadBumpShape' |
    'roadSpeed' | 'roadFrequency' | 'roadAmplitude' | 'roadTargetCorner' |
    'roadIsoClass' | 'roadIsoScale'
  >>) => void;

  // Force visualization
  toggleForceVisibility: (key: string) => void;
  setForceScale: (scale: number) => void;

  // Part visibility
  partVisibility: Record<string, boolean>;
  togglePartVisibility: (key: string) => void;

  // Graph
  setGraphChannels: (channels: string[]) => void;
  setGraphTimeWindow: (seconds: number) => void;

  // Physics loop updates
  updateState: (update: Partial<SimulationState>) => void;
  addGraphPoint: (point: Record<string, number>) => void;

  // Rapier rebuild flag (set when state is reset and Rapier world needs reconstruction)
  rapierNeedsRebuild: boolean;
  setRapierNeedsRebuild: (v: boolean) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  ...defaultSimulationState(),
  rapierNeedsRebuild: false,

  setMode: (mode) => set({ mode }),
  setPhysicsEngine: (engine) => set({ physicsEngine: engine }),

  toggleRunning: () => set((state) => ({ running: !state.running })),

  reset: () => {
    const { mode, physicsEngine, physicsHz } = get();
    set({
      ...defaultSimulationState(),
      mode,
      physicsEngine,
      physicsHz,
      rapierNeedsRebuild: true,
    });
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setPhysicsHz: (hz) => set({ physicsHz: hz }),

  setRollInput: (degrees) => set({ rollInput: degrees }),

  setPitchInput: (degrees) => set({ pitchInput: degrees }),

  setFrontSteeringAngle: (degrees) => set({ frontSteeringAngle: degrees }),

  setRearSteeringAngle: (degrees) => set({ rearSteeringAngle: degrees }),

  setDropHeight: (mm) => set({ dropHeight: mm }),

  setDropRollAngle: (degrees) => set({ dropRollAngle: degrees }),

  setDropPitchAngle: (degrees) => set({ dropPitchAngle: degrees }),

  triggerDrop: () => {
    const { dropHeight, dropRollAngle, dropPitchAngle } = get();
    set({
      running: true,
      time: 0,
      // Set initial chassis position to drop height above equilibrium
      chassisHeave: dropHeight,
      chassisHeaveVelocity: 0,
      rollAngle: dropRollAngle,
      rollVelocity: 0,
      pitchAngle: dropPitchAngle,
      pitchVelocity: 0,
      // Reset corners to equilibrium offset by drop height
      corners: {
        FL: { ...defaultCornerState(), wheelPosition: dropHeight },
        FR: { ...defaultCornerState(), wheelPosition: dropHeight },
        RL: { ...defaultCornerState(), wheelPosition: dropHeight },
        RR: { ...defaultCornerState(), wheelPosition: dropHeight },
      },
      graphHistory: [],
      rapierNeedsRebuild: true,
    });
  },

  setRoadSurface: (params) => set(params),

  toggleForceVisibility: (key) =>
    set((state) => ({
      forceVisibility: {
        ...state.forceVisibility,
        [key]: !state.forceVisibility[key],
      },
    })),

  setForceScale: (scale) => set({ forceScale: scale }),

  togglePartVisibility: (key) =>
    set((state) => ({
      partVisibility: {
        ...state.partVisibility,
        [key]: !state.partVisibility[key],
      },
    })),

  setGraphChannels: (channels) => set({ graphChannels: channels }),

  setGraphTimeWindow: (seconds) => set({ graphTimeWindow: seconds }),

  updateState: (update) => set(update),

  setRapierNeedsRebuild: (v) => set({ rapierNeedsRebuild: v }),

  addGraphPoint: (point) =>
    set((state) => {
      const maxPoints = Math.ceil(state.graphTimeWindow * 200); // ~200 Hz history
      const history = [...state.graphHistory, point];
      if (history.length > maxPoints) {
        history.splice(0, history.length - maxPoints);
      }
      return { graphHistory: history };
    }),
}));
