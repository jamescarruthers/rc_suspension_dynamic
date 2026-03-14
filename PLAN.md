# RK4 WASM Optimization Plan

## Analysis

The RK4 engine's hot path is the derivative function, called **4× per RK4 step × up to 200 steps/frame = 800 evaluations/frame**. Each evaluation computes tyre forces, suspension forces, sway bar, hydraulics, and accelerations for 4 corners.

### Current bottlenecks in the JS implementation:
1. **Object allocation inside derivative function** — `Record<Corner, number>` objects (`wheelPos`, `wheelVel`, `cornerForces`, `shockCompressions`, `shockVelocities`) are created on every call (800×/frame, ~4800 objects/frame)
2. **Iterator overhead** — `for (const c of CORNERS)` creates iterator objects
3. **Closure captures** — the `derivs` closure is recreated every `stepRK4Simulation` call
4. **Post-step duplication** — force recalculation after integration re-does most of the derivative work
5. **Math.sin/cos** in `sprungMassHeightAtCorner` called inside the hot loop

## Implementation Plan

### Step 1: Create Rust WASM crate for the core RK4 solver
- Create `wasm-rk4/` directory with Cargo.toml configured for `cdylib` + `wasm-bindgen`
- Port the entire RK4 integration loop, derivative function, and all force computations to Rust
- Use flat `f64` arrays for zero-copy data exchange with JS
- All physics computations (tyre, suspension, sway bar, hydraulics, dynamics) in Rust
- Road surface computation stays in JS (called before stepping) — ground heights passed in as 4 floats

### Step 2: Define the WASM interface
- `init()` — allocate integrator state
- `step(state_ptr, params_ptr, ground_heights_ptr, dt) -> output_ptr` — run one RK4 step
- Input: flat f64 buffer with all vehicle params + simulation state + ground heights
- Output: flat f64 buffer with new state + all derived quantities (forces, compressions, etc.)

### Step 3: Build and integrate with Vite
- Use `wasm-pack build --target web` to produce ES module
- Add `vite-plugin-wasm` for seamless `.wasm` import
- Create `src/engine/rk4WasmEngine.ts` wrapper that:
  - Loads the WASM module
  - Marshals `VehicleParams`/`SimulationState` to/from flat buffers
  - Calls road surface in JS, passes ground heights to WASM
  - Returns `Partial<SimulationState>` matching the existing interface

### Step 4: Wire into App.tsx
- Add `'rk4-wasm'` as a new physics engine option
- Async-load the WASM module (like Rapier already does)
- Fallback to JS RK4 if WASM fails to load

### Step 5: Kinematics stays in JS
- Kinematics (978 lines) is called once per step, not in the hot derivative loop
- Not worth porting — keep in JS, called after the WASM step returns

## What gets ported to Rust (the hot path):
- RK4 integrator (`step()` with k1-k4)
- Derivative function (all force computations)
- `computeTyreForce`
- `computeCornerForces` + `computeMotionRatio`
- `computeSwayBarForce`
- `computeHydraulicForces`
- `computeAccelerations` + inertia
- `sprungMassHeightAtCorner`
- `getGroundHeight` (road surface profiles)
- Post-step ground constraint enforcement
- Post-step force recalculation for output

## Expected performance gains:
- **No GC pressure** — zero allocations in hot path
- **LLVM optimization** — better inlining, vectorization, branch prediction
- **Tight memory layout** — all data in contiguous f64 arrays
- **~3-10× speedup** for the physics step portion
