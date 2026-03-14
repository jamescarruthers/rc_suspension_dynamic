// ─── RK4 Benchmark: JS vs WASM ──────────────────────────────────────────────
//
// Runs both engines for N steps on identical inputs and compares
// wall-clock time, verifying output consistency.

import { stepRK4Simulation } from './rk4Engine';
import { isRK4WasmReady, stepRK4WasmSimulation } from './rk4WasmEngine';
import { findStaticEquilibrium } from './integration';
import { useVehicleStore } from '../store/useVehicleStore';
import { useSimulationStore } from '../store/useSimulationStore';
import type { SimulationState } from '../types/suspension';

export interface BenchmarkResult {
  jsTimeMs: number;
  wasmTimeMs: number;
  speedup: number;
  steps: number;
  jsStepsPerSec: number;
  wasmStepsPerSec: number;
  maxDrift: number; // max absolute difference in chassis heave between engines
}

export function runBenchmark(steps: number = 2000): BenchmarkResult | null {
  if (!isRK4WasmReady()) {
    console.error('WASM engine not ready — cannot benchmark');
    return null;
  }

  const veh = useVehicleStore.getState();
  const simStore = useSimulationStore.getState();

  // Get a clean initial state from equilibrium
  const eqState = findStaticEquilibrium(
    veh.vehicle, veh.frontGeometry, veh.rearGeometry,
    veh.frontShock, veh.rearShock, veh.frontSwayBar, veh.rearSwayBar,
    veh.frontSteeringRack, veh.rearSteeringRack, veh.hydraulic,
  );

  const baseState: SimulationState = { ...simStore, ...eqState, time: 0, running: true };

  // Use a road surface that exercises the engine
  baseState.roadSurfaceType = 'washboard';
  baseState.roadBumpHeight = 5;
  baseState.roadSpeed = 2000;
  baseState.roadFrequency = 15;

  const dt = 0.002;

  // ── JS RK4 benchmark ──
  let jsState = { ...baseState };
  const jsStart = performance.now();
  for (let i = 0; i < steps; i++) {
    const update = stepRK4Simulation(
      jsState as SimulationState,
      veh.vehicle, veh.frontGeometry, veh.rearGeometry,
      veh.frontShock, veh.rearShock, veh.frontSwayBar, veh.rearSwayBar,
      veh.frontSteeringRack, veh.rearSteeringRack, veh.hydraulic, dt,
    );
    jsState = { ...jsState, ...update };
  }
  const jsTimeMs = performance.now() - jsStart;

  // ── WASM RK4 benchmark ──
  let wasmState = { ...baseState };
  const wasmStart = performance.now();
  for (let i = 0; i < steps; i++) {
    const update = stepRK4WasmSimulation(
      wasmState as SimulationState,
      veh.vehicle, veh.frontGeometry, veh.rearGeometry,
      veh.frontShock, veh.rearShock, veh.frontSwayBar, veh.rearSwayBar,
      veh.frontSteeringRack, veh.rearSteeringRack, veh.hydraulic, dt,
    );
    wasmState = { ...wasmState, ...update };
  }
  const wasmTimeMs = performance.now() - wasmStart;

  // ── Compare outputs ──
  const jsFinal = jsState as Record<string, unknown>;
  const wasmFinal = wasmState as Record<string, unknown>;
  const maxDrift = Math.abs(
    (jsFinal.chassisHeave as number) - (wasmFinal.chassisHeave as number),
  );

  const result: BenchmarkResult = {
    jsTimeMs: Math.round(jsTimeMs * 100) / 100,
    wasmTimeMs: Math.round(wasmTimeMs * 100) / 100,
    speedup: Math.round((jsTimeMs / wasmTimeMs) * 100) / 100,
    steps,
    jsStepsPerSec: Math.round(steps / (jsTimeMs / 1000)),
    wasmStepsPerSec: Math.round(steps / (wasmTimeMs / 1000)),
    maxDrift,
  };

  console.log('%c RK4 Benchmark Results ', 'background: #0A0E14; color: #00FFE0; font-weight: bold; padding: 4px 8px;');
  console.table({
    'JS RK4': {
      'Time (ms)': result.jsTimeMs,
      'Steps/sec': result.jsStepsPerSec.toLocaleString(),
    },
    'WASM RK4': {
      'Time (ms)': result.wasmTimeMs,
      'Steps/sec': result.wasmStepsPerSec.toLocaleString(),
    },
  });
  console.log(`Speedup: ${result.speedup}x`);
  console.log(`Max heave drift after ${steps} steps: ${maxDrift.toFixed(6)} mm`);

  return result;
}

// Expose globally for console access
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).benchmarkRK4 = runBenchmark;
}
