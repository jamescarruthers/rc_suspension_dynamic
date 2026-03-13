import { create } from 'zustand';
import type { Corner, PerCornerState, SimulationState } from '../types/suspension';

// ── Default per-corner state (equilibrium) ───────────────────────────────────

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
    wheelAirborne: false,
  };
}

function defaultCorners(): Record<Corner, PerCornerState> {
  return {
    FL: defaultCornerState(),
    FR: defaultCornerState(),
    RL: defaultCornerState(),
    RR: defaultCornerState(),
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
    running: false,
    time: 0,
    playbackSpeed: 1,
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
    // Drop test
    dropHeight: 50,
    dropRollAngle: 0,
    dropPitchAngle: 0,
    // Road surface
    roadSurfaceType: 'flat',
    roadBumpHeight: 10,
    roadBumpWidth: 30,
    roadBumpShape: 'half-sine',
    roadSpeed: 1000,
    roadFrequency: 10,
    roadAmplitude: 5,
    roadTargetCorner: 'all',
    // Force arrow visibility
    forceVisibility: defaultForceVisibility(),
    forceScale: 1,
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
  toggleRunning: () => void;
  reset: () => void;
  setPlaybackSpeed: (speed: number) => void;

  // Input controls
  setRollInput: (degrees: number) => void;
  setPitchInput: (degrees: number) => void;

  // Drop test
  setDropHeight: (mm: number) => void;
  setDropRollAngle: (degrees: number) => void;
  setDropPitchAngle: (degrees: number) => void;
  triggerDrop: () => void;

  // Road surface
  setRoadSurface: (params: Partial<Pick<SimulationState,
    'roadSurfaceType' | 'roadBumpHeight' | 'roadBumpWidth' | 'roadBumpShape' |
    'roadSpeed' | 'roadFrequency' | 'roadAmplitude' | 'roadTargetCorner'
  >>) => void;

  // Force visualization
  toggleForceVisibility: (key: string) => void;
  setForceScale: (scale: number) => void;

  // Graph
  setGraphChannels: (channels: string[]) => void;
  setGraphTimeWindow: (seconds: number) => void;

  // Physics loop updates
  updateState: (update: Partial<SimulationState>) => void;
  addGraphPoint: (point: Record<string, number>) => void;
}

// ── Store ────────────────────────────────────────────────────────────────────

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  ...defaultSimulationState(),

  setMode: (mode) => set({ mode }),

  toggleRunning: () => set((state) => ({ running: !state.running })),

  reset: () => {
    const { mode } = get();
    set({
      ...defaultSimulationState(),
      mode, // Preserve the current mode across reset
    });
  },

  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),

  setRollInput: (degrees) => set({ rollInput: degrees }),

  setPitchInput: (degrees) => set({ pitchInput: degrees }),

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

  setGraphChannels: (channels) => set({ graphChannels: channels }),

  setGraphTimeWindow: (seconds) => set({ graphTimeWindow: seconds }),

  updateState: (update) => set(update),

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
