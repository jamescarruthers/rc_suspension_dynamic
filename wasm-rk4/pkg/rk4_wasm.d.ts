/* tslint:disable */
/* eslint-disable */

/**
 * Get pointer to output buffer for direct memory access.
 */
export function output_ptr(): number;

/**
 * Get the size of the output buffer.
 */
export function output_size(): number;

/**
 * Get the expected params buffer size.
 */
export function params_size(): number;

/**
 * Read a value from the output buffer at the given index.
 */
export function read_output(index: number): number;

/**
 * Perform one RK4 physics step.
 *
 * # Arguments
 * * `state_buf` - 14-element state vector (positions + velocities)
 * * `params_buf` - Vehicle/shock/sway/hydraulic parameters (flat f64 array)
 * * `road_buf` - Road profile type + params + corner positions
 * * `time` - Current simulation time
 * * `dt` - Timestep
 *
 * # Returns
 * Pointer to output buffer (54 f64s): 14 state + 4×10 per-corner outputs
 */
export function rk4_step(state_buf: Float64Array, params_buf: Float64Array, road_buf: Float64Array, time: number, dt: number): number;

/**
 * Get the expected road buffer size.
 */
export function road_size(): number;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly output_ptr: () => number;
    readonly output_size: () => number;
    readonly params_size: () => number;
    readonly read_output: (a: number) => number;
    readonly rk4_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly road_size: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
