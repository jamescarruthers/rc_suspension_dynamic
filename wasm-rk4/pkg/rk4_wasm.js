/* @ts-self-types="./rk4_wasm.d.ts" */

/**
 * Get pointer to output buffer for direct memory access.
 * @returns {number}
 */
export function output_ptr() {
    const ret = wasm.output_ptr();
    return ret >>> 0;
}

/**
 * Get the size of the output buffer.
 * @returns {number}
 */
export function output_size() {
    const ret = wasm.output_size();
    return ret >>> 0;
}

/**
 * Get the expected params buffer size.
 * @returns {number}
 */
export function params_size() {
    const ret = wasm.params_size();
    return ret >>> 0;
}

/**
 * Read a value from the output buffer at the given index.
 * @param {number} index
 * @returns {number}
 */
export function read_output(index) {
    const ret = wasm.read_output(index);
    return ret;
}

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
 * @param {Float64Array} state_buf
 * @param {Float64Array} params_buf
 * @param {Float64Array} road_buf
 * @param {number} time
 * @param {number} dt
 * @returns {number}
 */
export function rk4_step(state_buf, params_buf, road_buf, time, dt) {
    const ptr0 = passArrayF64ToWasm0(state_buf, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(params_buf, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(road_buf, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.rk4_step(ptr0, len0, ptr1, len1, ptr2, len2, time, dt);
    return ret >>> 0;
}

/**
 * Get the expected road buffer size.
 * @returns {number}
 */
export function road_size() {
    const ret = wasm.road_size();
    return ret >>> 0;
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./rk4_wasm_bg.js": import0,
    };
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedFloat64ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('rk4_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
