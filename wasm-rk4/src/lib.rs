// ─── RK4 WASM Physics Engine ─────────────────────────────────────────────────
//
// Zero-allocation 4th-order Runge-Kutta integrator for RC suspension dynamics.
// All data exchanged via flat f64 slices for zero-copy interop with JS.
//
// State vector layout (14 elements):
//   [0]  chassisHeave (mm)
//   [1]  rollAngle (rad)
//   [2]  pitchAngle (rad)
//   [3]  wheelPos FL (mm)
//   [4]  wheelPos FR (mm)
//   [5]  wheelPos RL (mm)
//   [6]  wheelPos RR (mm)
//   [7]  chassisHeaveVel (mm/s)
//   [8]  rollVel (rad/s)
//   [9]  pitchVel (rad/s)
//   [10] wheelVel FL (mm/s)
//   [11] wheelVel FR (mm/s)
//   [12] wheelVel RL (mm/s)
//   [13] wheelVel RR (mm/s)

use wasm_bindgen::prelude::*;
use std::f64::consts::PI;

const STATE_SIZE: usize = 14;
const DEG_TO_RAD: f64 = PI / 180.0;
const RAD_TO_DEG: f64 = 180.0 / PI;

// State vector indices
const S_HEAVE: usize = 0;
const S_ROLL: usize = 1;
const S_PITCH: usize = 2;
const S_WHEEL_FL: usize = 3;
const S_WHEEL_FR: usize = 4;
const S_WHEEL_RL: usize = 5;
const S_WHEEL_RR: usize = 6;
const S_VHEAVE: usize = 7;
const S_VROLL: usize = 8;
const S_VPITCH: usize = 9;
const S_VWHEEL_FL: usize = 10;
const S_VWHEEL_FR: usize = 11;
const S_VWHEEL_RL: usize = 12;
const S_VWHEEL_RR: usize = 13;

const WHEEL_POS: [usize; 4] = [S_WHEEL_FL, S_WHEEL_FR, S_WHEEL_RL, S_WHEEL_RR];
const WHEEL_VEL: [usize; 4] = [S_VWHEEL_FL, S_VWHEEL_FR, S_VWHEEL_RL, S_VWHEEL_RR];

// Corner indices: 0=FL, 1=FR, 2=RL, 3=RR

// ─── Parameter buffer layout ────────────────────────────────────────────────
// Flat f64 buffer passed from JS containing all vehicle/shock/sway/hydraulic params.
//
// Vehicle params (indices 0-10):
const P_WHEELBASE: usize = 0;
const P_TOTAL_WEIGHT: usize = 1;
const P_WEIGHT_DIST: usize = 2;
const P_RIDE_HEIGHT: usize = 3;
const P_UNSPRUNG_MASS: usize = 4;
const P_TYRE_SPRING_RATE: usize = 5;
const P_TYRE_DAMPING: usize = 6;
const P_TYRE_RADIUS: usize = 7;
// Front geometry (indices 8-12)
const P_FRONT_TRACK: usize = 8;
const P_FRONT_LOWER_RATIO: usize = 9;
const P_FRONT_UPPER_RATIO: usize = 10;
const P_FRONT_LOWER_ANGLE: usize = 11;
const P_FRONT_UPPER_ANGLE: usize = 12;
const P_FRONT_UPRIGHT_H: usize = 13;
const P_FRONT_KPI: usize = 14;
// Rear geometry (indices 15-21)
const P_REAR_TRACK: usize = 15;
const P_REAR_LOWER_RATIO: usize = 16;
const P_REAR_UPPER_RATIO: usize = 17;
const P_REAR_LOWER_ANGLE: usize = 18;
const P_REAR_UPPER_ANGLE: usize = 19;
const P_REAR_UPRIGHT_H: usize = 20;
const P_REAR_KPI: usize = 21;
// Front shock (indices 22-29)
const P_FSHOCK_ATTACH_RATIO: usize = 22;
const P_FSHOCK_SPRING_RATE: usize = 23;
const P_FSHOCK_DAMP_COMP: usize = 24;
const P_FSHOCK_DAMP_REB: usize = 25;
const P_FSHOCK_MAX_DROOP: usize = 26;
const P_FSHOCK_MAX_BUMP: usize = 27;
const P_FSHOCK_ANGLE: usize = 28;
// Rear shock (indices 29-35)
const P_RSHOCK_ATTACH_RATIO: usize = 29;
const P_RSHOCK_SPRING_RATE: usize = 30;
const P_RSHOCK_DAMP_COMP: usize = 31;
const P_RSHOCK_DAMP_REB: usize = 32;
const P_RSHOCK_MAX_DROOP: usize = 33;
const P_RSHOCK_MAX_BUMP: usize = 34;
const P_RSHOCK_ANGLE: usize = 35;
// Front sway bar (indices 36-38)
const P_FSWAY_ENABLED: usize = 36;
const P_FSWAY_WIRE_DIA: usize = 37;
const P_FSWAY_ARM_LEN: usize = 38;
// Rear sway bar (indices 39-41)
const P_RSWAY_ENABLED: usize = 39;
const P_RSWAY_WIRE_DIA: usize = 40;
const P_RSWAY_ARM_LEN: usize = 41;
// Hydraulic (indices 42-51)
const P_HYD_ENABLED: usize = 42;
const P_HYD_TOPOLOGY: usize = 43; // 0=lateral, 1=diagonal, 2=full
const P_HYD_BORE: usize = 44;
const P_HYD_ROD_DIA: usize = 45;
const P_HYD_VISCOSITY: usize = 46;
const P_HYD_ORIFICE_DIA: usize = 47;
const P_HYD_LINE_DIA: usize = 48;
const P_HYD_LINE_LEN: usize = 49;
const P_HYD_ACCUM_RATE: usize = 50;
// Hub offsets for motion ratio
const P_FRONT_HUB_OFFSET: usize = 51;
const P_REAR_HUB_OFFSET: usize = 52;

const PARAMS_SIZE: usize = 53;

// ─── Road surface buffer layout ─────────────────────────────────────────────
// Passed from JS: road profile type + params + corner positions
const R_TYPE: usize = 0; // 0=flat,1=singleBump,2=speedBump,3=diagonalTwist,4=washboard,5=step,6=random
const R_HEIGHT: usize = 1;
const R_WIDTH: usize = 2;
const R_SPEED: usize = 3;
const R_FREQUENCY: usize = 4;
const R_TARGET_CORNER: usize = 5; // 0=FL,1=FR,2=RL,3=RR,4=front,5=rear,6=all
const R_SEED: usize = 6;
// Corner positions (x=longitudinal offset from CG, y=lateral offset)
const R_FL_X: usize = 7;
const R_FL_Y: usize = 8;
const R_FR_X: usize = 9;
const R_FR_Y: usize = 10;
const R_RL_X: usize = 11;
const R_RL_Y: usize = 12;
const R_RR_X: usize = 13;
const R_RR_Y: usize = 14;

const ROAD_SIZE: usize = 15;

// ─── Output buffer layout ───────────────────────────────────────────────────
// State (14) + per-corner derived quantities (4 corners × 10 values) + 2 roll centre heights
// Per corner: tyreForce, tyreDeflection, wheelContact, suspComp, shockVel,
//             springForce, damperForce, bumpStopForce, swayBarForce, hydraulicForce
const OUTPUT_STATE_SIZE: usize = 14;
const OUTPUT_CORNER_STRIDE: usize = 10;
const OUTPUT_CORNERS_START: usize = OUTPUT_STATE_SIZE; // 14
const OUTPUT_TOTAL: usize = OUTPUT_STATE_SIZE + 4 * OUTPUT_CORNER_STRIDE; // 14 + 40 = 54

// ─── Pre-allocated integrator ───────────────────────────────────────────────

struct RK4Integrator {
    k1: [f64; STATE_SIZE],
    k2: [f64; STATE_SIZE],
    k3: [f64; STATE_SIZE],
    k4: [f64; STATE_SIZE],
    temp: [f64; STATE_SIZE],
}

impl RK4Integrator {
    fn new() -> Self {
        RK4Integrator {
            k1: [0.0; STATE_SIZE],
            k2: [0.0; STATE_SIZE],
            k3: [0.0; STATE_SIZE],
            k4: [0.0; STATE_SIZE],
            temp: [0.0; STATE_SIZE],
        }
    }

    #[inline]
    fn step<F>(&mut self, state: &mut [f64; STATE_SIZE], t: f64, dt: f64, derivs: &F)
    where
        F: Fn(f64, &[f64; STATE_SIZE], &mut [f64; STATE_SIZE]),
    {
        let half_dt = dt * 0.5;
        let sixth_dt = dt / 6.0;

        // k1 = f(t, state)
        derivs(t, state, &mut self.k1);

        // temp = state + halfDt * k1
        for i in 0..STATE_SIZE {
            self.temp[i] = state[i] + half_dt * self.k1[i];
        }

        // k2 = f(t + halfDt, temp)
        derivs(t + half_dt, &self.temp, &mut self.k2);

        // temp = state + halfDt * k2
        for i in 0..STATE_SIZE {
            self.temp[i] = state[i] + half_dt * self.k2[i];
        }

        // k3 = f(t + halfDt, temp)
        derivs(t + half_dt, &self.temp, &mut self.k3);

        // temp = state + dt * k3
        for i in 0..STATE_SIZE {
            self.temp[i] = state[i] + dt * self.k3[i];
        }

        // k4 = f(t + dt, temp)
        derivs(t + dt, &self.temp, &mut self.k4);

        // state += (dt/6) * (k1 + 2*k2 + 2*k3 + k4)
        for i in 0..STATE_SIZE {
            state[i] += sixth_dt * (self.k1[i] + 2.0 * self.k2[i] + 2.0 * self.k3[i] + self.k4[i]);
        }
    }
}

// ─── Global state (module-level singleton) ──────────────────────────────────

static mut INTEGRATOR: Option<RK4Integrator> = None;
static mut STATE_VEC: [f64; STATE_SIZE] = [0.0; STATE_SIZE];
static mut OUTPUT_BUF: [f64; OUTPUT_TOTAL] = [0.0; OUTPUT_TOTAL];

fn get_integrator() -> &'static mut RK4Integrator {
    unsafe {
        if INTEGRATOR.is_none() {
            INTEGRATOR = Some(RK4Integrator::new());
        }
        INTEGRATOR.as_mut().unwrap()
    }
}

// ─── Tyre contact force ─────────────────────────────────────────────────────

#[inline]
fn compute_tyre_force(
    wheel_pos_z: f64,
    wheel_vel_z: f64,
    ground_height: f64,
    tyre_radius: f64,
    tyre_spring_rate: f64,
    tyre_damping: f64,
) -> (f64, f64, bool) {
    // (force, deflection, contact)
    let tyre_bottom = wheel_pos_z - tyre_radius;
    if tyre_bottom > ground_height {
        return (0.0, 0.0, false);
    }
    let deflection = (ground_height - tyre_bottom).max(0.0);
    let relative_velocity = -wheel_vel_z; // ground velocity is 0
    let force = (tyre_spring_rate * deflection + tyre_damping * relative_velocity).max(0.0);
    (force, deflection, true)
}

// ─── Geometric motion ratio ─────────────────────────────────────────────────

#[inline]
fn compute_geometric_motion_ratio(
    attach_ratio: f64,
    shock_angle: f64,
    lower_len: f64,
    lower_angle_rad: f64,
    kpi_rad: f64,
    half_upright: f64,
    tyre_radius: f64,
    shock_compression: f64,
) -> f64 {
    if lower_len <= 0.0 {
        return attach_ratio;
    }
    let lower_bj_z_static = tyre_radius - half_upright * kpi_rad.cos();
    let lower_inner_z = lower_bj_z_static - lower_len * lower_angle_rad.sin();
    let new_lower_bj_z = lower_bj_z_static + shock_compression;
    let arm_dz = new_lower_bj_z - lower_inner_z;
    let current_arm_angle = (arm_dz / lower_len).clamp(-1.0, 1.0).asin();
    let shock_angle_rad = shock_angle * DEG_TO_RAD;
    let angle_between = current_arm_angle + shock_angle_rad;
    let cos_correction = angle_between.cos();
    (attach_ratio * cos_correction.abs()).clamp(0.1, 1.0)
}

// ─── Suspension corner forces ───────────────────────────────────────────────

const BUMP_STOP_COEFF: f64 = 50.0;
const BUMP_STOP_THRESHOLD: f64 = 0.85;

#[inline]
fn compute_corner_forces(
    shock_compression: f64,
    shock_velocity: f64,
    spring_rate: f64,
    damp_comp: f64,
    damp_reb: f64,
    max_droop: f64,
    max_bump: f64,
    motion_ratio: f64,
) -> (f64, f64, f64, f64) {
    // Returns (spring_force, damper_force, bump_stop_force, total)
    let mr2 = motion_ratio * motion_ratio;

    let spring_force = spring_rate * shock_compression * mr2;

    let damper_force = if shock_velocity >= 0.0 {
        damp_comp * shock_velocity * mr2
    } else {
        damp_reb * shock_velocity * mr2
    };

    let mut bump_stop_force = 0.0;
    let shock_travel = shock_compression * motion_ratio;

    let bump_threshold = max_bump * BUMP_STOP_THRESHOLD;
    if shock_travel > bump_threshold && max_bump > 0.0 {
        let penetration = shock_travel - bump_threshold;
        bump_stop_force += BUMP_STOP_COEFF * penetration * penetration * motion_ratio;
    }

    let droop_threshold = max_droop * BUMP_STOP_THRESHOLD;
    if shock_travel < -droop_threshold && max_droop > 0.0 {
        let penetration = -shock_travel - droop_threshold;
        bump_stop_force -= BUMP_STOP_COEFF * penetration * penetration * motion_ratio;
    }

    let total = spring_force + damper_force + bump_stop_force;
    (spring_force, damper_force, bump_stop_force, total)
}

// ─── Sway bar force ─────────────────────────────────────────────────────────

#[inline]
fn compute_sway_bar_force(
    left_compression: f64,
    right_compression: f64,
    enabled: bool,
    wire_diameter: f64,
    arm_length: f64,
) -> f64 {
    if !enabled || arm_length <= 0.0 || wire_diameter <= 0.0 {
        return 0.0;
    }
    let g = 80_000.0_f64;
    let d = wire_diameter;
    let k_arb = (g * PI * d * d * d * d) / (32.0 * arm_length * arm_length * arm_length);
    k_arb * (left_compression - right_compression)
}

// ─── Hydraulic forces ───────────────────────────────────────────────────────

const DEFAULT_VISCOSITY: f64 = 30e-9;

#[inline]
fn compute_hydraulic_forces(
    params: &[f64],
    shock_velocities: &[f64; 4],
    shock_compressions: &[f64; 4],
    result: &mut [f64; 4],
) {
    result[0] = 0.0;
    result[1] = 0.0;
    result[2] = 0.0;
    result[3] = 0.0;

    if params[P_HYD_ENABLED] < 0.5 {
        return;
    }

    let bore = params[P_HYD_BORE];
    let rod_dia = params[P_HYD_ROD_DIA];
    let a_bore = PI * (bore / 2.0) * (bore / 2.0);
    let a_rod = PI * ((bore / 2.0) * (bore / 2.0) - (rod_dia / 2.0) * (rod_dia / 2.0));
    let a_eff = (a_bore + a_rod) / 2.0;

    let viscosity = if params[P_HYD_VISCOSITY] > 0.0 {
        params[P_HYD_VISCOSITY] * 1e-9
    } else {
        DEFAULT_VISCOSITY
    };
    let line_dia = params[P_HYD_LINE_DIA];
    let line_len = params[P_HYD_LINE_LEN];
    let orifice_dia = params[P_HYD_ORIFICE_DIA];
    let accum_rate = params[P_HYD_ACCUM_RATE];

    let topology = params[P_HYD_TOPOLOGY] as i32;

    // Pairs: (c1, c2)
    // lateral: FL-FR, RL-RR
    // diagonal: FL-RR, FR-RL
    // full: all four
    let pairs: &[(usize, usize)] = match topology {
        0 => &[(0, 1), (2, 3)],            // lateral
        1 => &[(0, 3), (1, 2)],            // diagonal
        2 => &[(0, 1), (2, 3), (0, 3), (1, 2)], // full
        _ => return,
    };

    for &(c1, c2) in pairs {
        let v_diff = shock_velocities[c1] - shock_velocities[c2];
        let q_demand = a_eff * v_diff;

        let mut delta_p = 0.0;
        if line_dia > 0.0 && line_len > 0.0 {
            delta_p = (q_demand * 128.0 * viscosity * line_len)
                / (PI * line_dia * line_dia * line_dia * line_dia);
        }

        if orifice_dia > 0.0 && orifice_dia < line_dia {
            let a_orifice = PI * (orifice_dia / 2.0) * (orifice_dia / 2.0);
            let a_line = PI * (line_dia / 2.0) * (line_dia / 2.0);
            let restriction = (a_line / a_orifice) * (a_line / a_orifice);
            delta_p *= restriction;
        }

        let comp_diff = shock_compressions[c1] - shock_compressions[c2];
        let accum_force = accum_rate * comp_diff;

        let hydraulic_force = delta_p * a_eff + accum_force;

        result[c1] -= hydraulic_force;
        result[c2] += hydraulic_force;
    }
}

// ─── Road surface profiles ──────────────────────────────────────────────────

#[inline]
fn pseudo_random(x: f64, seed: f64) -> f64 {
    let v = ((x + seed) * 12.9898 + seed * 78.233).sin() * 43758.5453;
    (v - v.floor()) * 2.0 - 1.0
}

#[inline]
fn half_sine_bump(pos: f64, width: f64, height: f64) -> f64 {
    if pos < 0.0 || pos > width {
        0.0
    } else {
        height * (PI * pos / width).sin()
    }
}

#[inline]
fn corner_bump_position(time: f64, speed: f64, corner_long_offset: f64) -> f64 {
    speed * time - corner_long_offset
}

/// If frequency > 0, bumps repeat with spacing = speed / frequency.
#[inline]
fn repeating_bump_position(pos: f64, width: f64, speed: f64, frequency: f64) -> f64 {
    if frequency <= 0.0 || speed <= 0.0 {
        return pos;
    }
    let spacing = speed / frequency;
    if spacing <= width || pos < 0.0 {
        return pos;
    }
    pos % spacing
}

fn get_ground_heights(road: &[f64], time: f64, out: &mut [f64; 4]) {
    let road_type = road[R_TYPE] as i32;
    let height = road[R_HEIGHT];
    let width = road[R_WIDTH];
    let speed = road[R_SPEED];
    let frequency = road[R_FREQUENCY];
    let target = road[R_TARGET_CORNER] as usize;
    let seed = road[R_SEED];

    // Corner longitudinal offsets
    let cx = [road[R_FL_X], road[R_FR_X], road[R_RL_X], road[R_RR_X]];

    out[0] = 0.0;
    out[1] = 0.0;
    out[2] = 0.0;
    out[3] = 0.0;

    match road_type {
        0 => {} // flat
        1 => {
            // singleBump - target corner(s) (repeating if frequency > 0)
            // target: 0=FL,1=FR,2=RL,3=RR,4=front(FL+FR),5=rear(RL+RR),6=all
            let corners: &[usize] = match target {
                0 => &[0],
                1 => &[1],
                2 => &[2],
                3 => &[3],
                4 => &[0, 1],      // front
                5 => &[2, 3],      // rear
                _ => &[0, 1, 2, 3], // all (6 or any other)
            };
            for &i in corners {
                let raw_pos = corner_bump_position(time, speed, cx[i]);
                let pos = repeating_bump_position(raw_pos, width, speed, frequency);
                out[i] = half_sine_bump(pos, width, height);
            }
        }
        2 => {
            // speedBump - all corners (repeating if frequency > 0)
            for i in 0..4 {
                let raw_pos = corner_bump_position(time, speed, cx[i]);
                let pos = repeating_bump_position(raw_pos, width, speed, frequency);
                out[i] = half_sine_bump(pos, width, height);
            }
        }
        3 => {
            // diagonalTwist
            let ramp_time = width / speed.max(1.0);
            let t = (time / ramp_time.max(0.001)).min(1.0);
            let h = height * t;
            out[0] = h;
            out[1] = -h;
            out[2] = -h;
            out[3] = h;
        }
        4 => {
            // washboard
            let freq = if frequency > 0.0 { frequency } else { 10.0 };
            for i in 0..4 {
                let time_at_corner = time - cx[i] / speed.max(1.0);
                if time_at_corner >= 0.0 {
                    out[i] = height * 0.5 * (1.0 - (2.0 * PI * freq * time_at_corner).cos());
                }
            }
        }
        5 => {
            // step
            for i in 0..4 {
                let pos = corner_bump_position(time, speed, cx[i]);
                out[i] = if pos >= 0.0 { height } else { 0.0 };
            }
        }
        6 => {
            // random
            for i in 0..4 {
                let pos = corner_bump_position(time, speed, cx[i]);
                let quantized = (pos / 5.0).floor() * 5.0;
                let noise1 = pseudo_random(quantized * 0.1, seed);
                let noise2 = pseudo_random(quantized * 0.037, seed + 7.0);
                let val = height * 0.5 * (noise1 * 0.6 + noise2 * 0.4 + 0.5);
                out[i] = val.max(0.0);
            }
        }
        _ => {} // flat
    }
}

// ─── Equations of motion ────────────────────────────────────────────────────

const G_MM: f64 = 9810.0;

#[inline]
fn sprung_mass_height_at_corner(
    heave: f64,
    roll_rad: f64,
    pitch_rad: f64,
    lateral_arm: f64,
    longitudinal_arm: f64,
) -> f64 {
    heave + lateral_arm * roll_rad.sin() + longitudinal_arm * pitch_rad.sin()
}

// ─── Derivative computation (called 4x per RK4 step) ───────────────────────

struct DerivParams {
    // Vehicle
    ride_height: f64,
    tyre_radius: f64,
    tyre_spring_rate: f64,
    tyre_damping: f64,
    sprung_mass_g: f64,
    unsprung_mass_g: f64,
    // Lever arms per corner [lateral, longitudinal]
    lever_arms: [[f64; 2]; 4],
    // Shock params per corner [attach_ratio, spring_rate, damp_comp, damp_reb, max_droop, max_bump, shock_angle]
    shock: [[f64; 7]; 4],
    // Geometry per corner [lower_len, lower_angle_rad, kpi_rad, half_upright]
    geo: [[f64; 4]; 4],
    // Sway bar [enabled, wire_dia, arm_len] × 2 axles
    sway: [[f64; 3]; 2],
    // Inertia
    i_roll: f64,
    i_pitch: f64,
}

// Pre-allocated scratch for derivative computation
struct DerivScratch {
    ground_heights: [f64; 4],
    shock_compressions: [f64; 4],
    shock_velocities: [f64; 4],
    susp_forces: [f64; 4],
    sway_forces: [f64; 4],
    hyd_forces: [f64; 4],
}

static mut DERIV_SCRATCH: DerivScratch = DerivScratch {
    ground_heights: [0.0; 4],
    shock_compressions: [0.0; 4],
    shock_velocities: [0.0; 4],
    susp_forces: [0.0; 4],
    sway_forces: [0.0; 4],
    hyd_forces: [0.0; 4],
};

fn compute_derivs(
    t: f64,
    y: &[f64; STATE_SIZE],
    dydt: &mut [f64; STATE_SIZE],
    dp: &DerivParams,
    params: &[f64],  // full params buffer for hydraulics
    road: &[f64],    // road buffer
) {
    let scratch = unsafe { &mut DERIV_SCRATCH };

    let heave = y[S_HEAVE];
    let roll_rad = y[S_ROLL];
    let pitch_rad = y[S_PITCH];
    let heave_vel = y[S_VHEAVE];
    let roll_vel = y[S_VROLL];
    let pitch_vel = y[S_VPITCH];

    // Ground heights at evaluation time t
    get_ground_heights(road, t, &mut scratch.ground_heights);

    let mut sum_susp_force = 0.0;
    let mut m_roll = 0.0;
    let mut m_pitch = 0.0;

    // Per-corner computations
    for i in 0..4 {
        let wheel_pos = y[WHEEL_POS[i]];
        let wheel_vel = y[WHEEL_VEL[i]];

        // Tyre force
        let (tyre_force, _, _) = compute_tyre_force(
            wheel_pos, wheel_vel, scratch.ground_heights[i],
            dp.tyre_radius, dp.tyre_spring_rate, dp.tyre_damping,
        );

        // Shock compression & velocity
        let arm = &dp.lever_arms[i];
        let sprung_z = sprung_mass_height_at_corner(
            heave + dp.ride_height, roll_rad, pitch_rad,
            arm[0], arm[1],
        );
        let shock_comp = wheel_pos - sprung_z + dp.ride_height;
        let sprung_vel_z = heave_vel
            + arm[0] * roll_vel * roll_rad.cos()
            + arm[1] * pitch_vel * pitch_rad.cos();
        let shock_vel = wheel_vel - sprung_vel_z;

        scratch.shock_compressions[i] = shock_comp;
        scratch.shock_velocities[i] = shock_vel;

        // Geometric motion ratio
        let s = &dp.shock[i];
        let g = &dp.geo[i];
        let motion_ratio = compute_geometric_motion_ratio(
            s[0], s[6], g[0], g[1], g[2], g[3], dp.tyre_radius, shock_comp,
        );

        // Corner forces
        let (_, _, _, total_susp) = compute_corner_forces(
            shock_comp, shock_vel,
            s[1], s[2], s[3], s[4], s[5], motion_ratio,
        );

        scratch.susp_forces[i] = total_susp;

        // Unsprung mass acceleration (tyre - susp - gravity)
        // sway and hydraulic added below
        let f_gravity_unsprung = (dp.unsprung_mass_g / 1000.0) * 9.81;
        let net_force = tyre_force - total_susp - f_gravity_unsprung;
        // Store base acceleration, sway/hydraulic will be subtracted after
        dydt[WHEEL_VEL[i]] = (net_force / (dp.unsprung_mass_g / 1000.0)) * 1000.0;

        // Sprung mass force accumulation
        sum_susp_force += total_susp;
        m_roll += arm[0] * total_susp;
        m_pitch += arm[1] * total_susp;
    }

    // Sway bar forces
    let front_sway = compute_sway_bar_force(
        scratch.shock_compressions[0], scratch.shock_compressions[1],
        dp.sway[0][0] > 0.5, dp.sway[0][1], dp.sway[0][2],
    );
    scratch.sway_forces[0] = front_sway;
    scratch.sway_forces[1] = -front_sway;

    let rear_sway = compute_sway_bar_force(
        scratch.shock_compressions[2], scratch.shock_compressions[3],
        dp.sway[1][0] > 0.5, dp.sway[1][1], dp.sway[1][2],
    );
    scratch.sway_forces[2] = rear_sway;
    scratch.sway_forces[3] = -rear_sway;

    // Hydraulic forces
    compute_hydraulic_forces(params, &scratch.shock_velocities, &scratch.shock_compressions, &mut scratch.hyd_forces);

    // Add sway + hydraulic to sprung mass moments and unsprung accelerations
    for i in 0..4 {
        let sway = scratch.sway_forces[i];
        let hyd = scratch.hyd_forces[i];
        let arm = &dp.lever_arms[i];

        sum_susp_force += sway + hyd;
        m_roll += arm[0] * (sway + hyd);
        m_pitch += arm[1] * (sway + hyd);

        // Subtract sway + hydraulic from unsprung mass
        let extra_decel = ((sway + hyd) / (dp.unsprung_mass_g / 1000.0)) * 1000.0;
        dydt[WHEEL_VEL[i]] -= extra_decel;
    }

    // Sprung mass accelerations
    let sprung_mass_kg = dp.sprung_mass_g / 1000.0;
    let f_gravity_sprung = sprung_mass_kg * 9.81;
    let a_s = ((sum_susp_force - f_gravity_sprung) / sprung_mass_kg) * 1000.0;

    let alpha_roll = if dp.i_roll > 0.0 { (m_roll / dp.i_roll) * 1e6 } else { 0.0 };
    let alpha_pitch = if dp.i_pitch > 0.0 { (m_pitch / dp.i_pitch) * 1e6 } else { 0.0 };

    // Write position derivatives (= velocities)
    dydt[S_HEAVE] = heave_vel;
    dydt[S_ROLL] = roll_vel;
    dydt[S_PITCH] = pitch_vel;
    dydt[S_WHEEL_FL] = y[S_VWHEEL_FL];
    dydt[S_WHEEL_FR] = y[S_VWHEEL_FR];
    dydt[S_WHEEL_RL] = y[S_VWHEEL_RL];
    dydt[S_WHEEL_RR] = y[S_VWHEEL_RR];

    // Write velocity derivatives (= accelerations)
    dydt[S_VHEAVE] = a_s;
    dydt[S_VROLL] = alpha_roll;
    dydt[S_VPITCH] = alpha_pitch;
    // wheel accelerations already written above
}

// ─── Build derivative params from flat buffer ───────────────────────────────

fn build_deriv_params(params: &[f64]) -> DerivParams {
    let wheelbase = params[P_WHEELBASE];
    let total_weight = params[P_TOTAL_WEIGHT];
    let weight_dist = params[P_WEIGHT_DIST];
    let ride_height = params[P_RIDE_HEIGHT];
    let unsprung_mass = params[P_UNSPRUNG_MASS];
    let tyre_radius = params[P_TYRE_RADIUS];

    let frac = weight_dist / 100.0;
    let dist_to_front = wheelbase * (1.0 - frac);
    let dist_to_rear = wheelbase * frac;

    let half_track_f = params[P_FRONT_TRACK] / 2.0;
    let half_track_r = params[P_REAR_TRACK] / 2.0;

    let lever_arms = [
        [-half_track_f, dist_to_front],   // FL
        [half_track_f, dist_to_front],    // FR
        [-half_track_r, -dist_to_rear],   // RL
        [half_track_r, -dist_to_rear],    // RR
    ];

    let sprung_mass_g = total_weight - unsprung_mass * 4.0;

    // Inertia
    let avg_half_track = (params[P_FRONT_TRACK] + params[P_REAR_TRACK]) / 4.0;
    let i_roll = sprung_mass_g * avg_half_track * avg_half_track * 0.3;
    let half_wb = wheelbase / 2.0;
    let i_pitch = sprung_mass_g * half_wb * half_wb * 0.3;

    // Arm lengths helper
    let front_hub_offset = params[P_FRONT_HUB_OFFSET];
    let rear_hub_offset = params[P_REAR_HUB_OFFSET];
    let front_kingpin_ht = params[P_FRONT_TRACK] / 2.0 - front_hub_offset;
    let rear_kingpin_ht = params[P_REAR_TRACK] / 2.0 - rear_hub_offset;
    let front_lower_len = params[P_FRONT_LOWER_RATIO] * front_kingpin_ht;
    let rear_lower_len = params[P_REAR_LOWER_RATIO] * rear_kingpin_ht;

    let front_lower_angle = params[P_FRONT_LOWER_ANGLE] * DEG_TO_RAD;
    let rear_lower_angle = params[P_REAR_LOWER_ANGLE] * DEG_TO_RAD;
    let front_kpi = params[P_FRONT_KPI] * DEG_TO_RAD;
    let rear_kpi = params[P_REAR_KPI] * DEG_TO_RAD;
    let front_half_upright = params[P_FRONT_UPRIGHT_H] / 2.0;
    let rear_half_upright = params[P_REAR_UPRIGHT_H] / 2.0;

    // shock[corner] = [attach_ratio, spring_rate, damp_comp, damp_reb, max_droop, max_bump, shock_angle]
    let front_shock = [
        params[P_FSHOCK_ATTACH_RATIO], params[P_FSHOCK_SPRING_RATE],
        params[P_FSHOCK_DAMP_COMP], params[P_FSHOCK_DAMP_REB],
        params[P_FSHOCK_MAX_DROOP], params[P_FSHOCK_MAX_BUMP],
        params[P_FSHOCK_ANGLE],
    ];
    let rear_shock = [
        params[P_RSHOCK_ATTACH_RATIO], params[P_RSHOCK_SPRING_RATE],
        params[P_RSHOCK_DAMP_COMP], params[P_RSHOCK_DAMP_REB],
        params[P_RSHOCK_MAX_DROOP], params[P_RSHOCK_MAX_BUMP],
        params[P_RSHOCK_ANGLE],
    ];

    let front_geo = [front_lower_len, front_lower_angle, front_kpi, front_half_upright];
    let rear_geo = [rear_lower_len, rear_lower_angle, rear_kpi, rear_half_upright];

    DerivParams {
        ride_height,
        tyre_radius,
        tyre_spring_rate: params[P_TYRE_SPRING_RATE],
        tyre_damping: params[P_TYRE_DAMPING],
        sprung_mass_g,
        unsprung_mass_g: unsprung_mass,
        lever_arms,
        shock: [front_shock, front_shock, rear_shock, rear_shock],
        geo: [front_geo, front_geo, rear_geo, rear_geo],
        sway: [
            [params[P_FSWAY_ENABLED], params[P_FSWAY_WIRE_DIA], params[P_FSWAY_ARM_LEN]],
            [params[P_RSWAY_ENABLED], params[P_RSWAY_WIRE_DIA], params[P_RSWAY_ARM_LEN]],
        ],
        i_roll,
        i_pitch,
    }
}

// ─── Main WASM entry point ──────────────────────────────────────────────────

/// Perform one RK4 physics step.
///
/// # Arguments
/// * `state_buf` - 14-element state vector (positions + velocities)
/// * `params_buf` - Vehicle/shock/sway/hydraulic parameters (flat f64 array)
/// * `road_buf` - Road profile type + params + corner positions
/// * `time` - Current simulation time
/// * `dt` - Timestep
///
/// # Returns
/// Pointer to output buffer (54 f64s): 14 state + 4×10 per-corner outputs
#[wasm_bindgen]
pub fn rk4_step(
    state_buf: &[f64],
    params_buf: &[f64],
    road_buf: &[f64],
    time: f64,
    dt: f64,
) -> *const f64 {
    if state_buf.len() < STATE_SIZE || params_buf.len() < PARAMS_SIZE || road_buf.len() < ROAD_SIZE {
        return std::ptr::null();
    }

    let integrator = get_integrator();
    let sv = unsafe { &mut STATE_VEC };

    // Pack state
    sv.copy_from_slice(&state_buf[..STATE_SIZE]);

    // Build derivative params
    let dp = build_deriv_params(params_buf);

    // Create derivative closure
    let derivs = |t: f64, y: &[f64; STATE_SIZE], dydt: &mut [f64; STATE_SIZE]| {
        compute_derivs(t, y, dydt, &dp, params_buf, road_buf);
    };

    // Perform RK4 step
    integrator.step(sv, time, dt, &derivs);

    // Post-step: enforce hard ground constraint
    let mut ground_heights = [0.0f64; 4];
    let new_time = time + dt;
    get_ground_heights(road_buf, new_time, &mut ground_heights);

    let tyre_radius = params_buf[P_TYRE_RADIUS];
    for i in 0..4 {
        let ground_min = ground_heights[i] + tyre_radius;
        if sv[WHEEL_POS[i]] < ground_min {
            sv[WHEEL_POS[i]] = ground_min;
            if sv[WHEEL_VEL[i]] < 0.0 {
                sv[WHEEL_VEL[i]] = 0.0;
            }
        }
    }

    // Build output buffer
    let out = unsafe { &mut OUTPUT_BUF };

    // Copy state
    out[..STATE_SIZE].copy_from_slice(sv);

    // Per-corner derived quantities
    let ride_height = params_buf[P_RIDE_HEIGHT];
    let final_roll = sv[S_ROLL];
    let final_pitch = sv[S_PITCH];

    let front_hub_offset = params_buf[P_FRONT_HUB_OFFSET];
    let rear_hub_offset = params_buf[P_REAR_HUB_OFFSET];
    let front_kingpin_ht = params_buf[P_FRONT_TRACK] / 2.0 - front_hub_offset;
    let rear_kingpin_ht = params_buf[P_REAR_TRACK] / 2.0 - rear_hub_offset;
    let front_lower_len = params_buf[P_FRONT_LOWER_RATIO] * front_kingpin_ht;
    let rear_lower_len = params_buf[P_REAR_LOWER_RATIO] * rear_kingpin_ht;

    let mut shock_comps = [0.0f64; 4];
    let mut shock_vels = [0.0f64; 4];

    for i in 0..4 {
        let base = OUTPUT_CORNERS_START + i * OUTPUT_CORNER_STRIDE;
        let wheel_pos = sv[WHEEL_POS[i]];
        let wheel_vel = sv[WHEEL_VEL[i]];

        // Tyre force
        let (tyre_force, tyre_defl, contact) = compute_tyre_force(
            wheel_pos, wheel_vel, ground_heights[i],
            tyre_radius, dp.tyre_spring_rate, dp.tyre_damping,
        );
        out[base] = tyre_force;
        out[base + 1] = tyre_defl;
        out[base + 2] = if contact { 1.0 } else { 0.0 };

        // Suspension compression
        let arm = &dp.lever_arms[i];
        let sprung_z = sprung_mass_height_at_corner(
            sv[S_HEAVE] + ride_height, final_roll, final_pitch,
            arm[0], arm[1],
        );
        let susp_comp = wheel_pos - sprung_z + ride_height;
        out[base + 3] = susp_comp;
        shock_comps[i] = susp_comp;

        // Shock velocity
        let sprung_vel_z = sv[S_VHEAVE]
            + arm[0] * sv[S_VROLL] * final_roll.cos()
            + arm[1] * sv[S_VPITCH] * final_pitch.cos();
        let shock_vel = wheel_vel - sprung_vel_z;
        out[base + 4] = shock_vel;
        shock_vels[i] = shock_vel;

        // Corner forces
        let s = &dp.shock[i];
        let g = &dp.geo[i];
        let is_front = i < 2;
        let lower_len = if is_front { front_lower_len } else { rear_lower_len };
        let lower_angle = if is_front { params_buf[P_FRONT_LOWER_ANGLE] * DEG_TO_RAD } else { params_buf[P_REAR_LOWER_ANGLE] * DEG_TO_RAD };
        let kpi = if is_front { params_buf[P_FRONT_KPI] * DEG_TO_RAD } else { params_buf[P_REAR_KPI] * DEG_TO_RAD };
        let half_upright = if is_front { params_buf[P_FRONT_UPRIGHT_H] / 2.0 } else { params_buf[P_REAR_UPRIGHT_H] / 2.0 };

        let motion_ratio = compute_geometric_motion_ratio(
            s[0], s[6], lower_len, lower_angle, kpi, half_upright, tyre_radius, susp_comp,
        );

        let (spring_f, damper_f, bump_f, _) = compute_corner_forces(
            susp_comp, shock_vel,
            s[1], s[2], s[3], s[4], s[5], motion_ratio,
        );
        out[base + 5] = spring_f;
        out[base + 6] = damper_f;
        out[base + 7] = bump_f;
    }

    // Sway bar forces for output
    let front_sway = compute_sway_bar_force(
        shock_comps[0], shock_comps[1],
        params_buf[P_FSWAY_ENABLED] > 0.5,
        params_buf[P_FSWAY_WIRE_DIA],
        params_buf[P_FSWAY_ARM_LEN],
    );
    out[OUTPUT_CORNERS_START + 0 * OUTPUT_CORNER_STRIDE + 8] = front_sway;
    out[OUTPUT_CORNERS_START + 1 * OUTPUT_CORNER_STRIDE + 8] = -front_sway;

    let rear_sway = compute_sway_bar_force(
        shock_comps[2], shock_comps[3],
        params_buf[P_RSWAY_ENABLED] > 0.5,
        params_buf[P_RSWAY_WIRE_DIA],
        params_buf[P_RSWAY_ARM_LEN],
    );
    out[OUTPUT_CORNERS_START + 2 * OUTPUT_CORNER_STRIDE + 8] = rear_sway;
    out[OUTPUT_CORNERS_START + 3 * OUTPUT_CORNER_STRIDE + 8] = -rear_sway;

    // Hydraulic forces for output
    let mut hyd_out = [0.0f64; 4];
    compute_hydraulic_forces(params_buf, &shock_vels, &shock_comps, &mut hyd_out);
    for i in 0..4 {
        out[OUTPUT_CORNERS_START + i * OUTPUT_CORNER_STRIDE + 9] = hyd_out[i];
    }

    out.as_ptr()
}

/// Get the size of the output buffer.
#[wasm_bindgen]
pub fn output_size() -> usize {
    OUTPUT_TOTAL
}

/// Read a value from the output buffer at the given index.
#[wasm_bindgen]
pub fn read_output(index: usize) -> f64 {
    if index < OUTPUT_TOTAL {
        unsafe { OUTPUT_BUF[index] }
    } else {
        0.0
    }
}

/// Get pointer to output buffer for direct memory access.
#[wasm_bindgen]
pub fn output_ptr() -> *const f64 {
    unsafe { OUTPUT_BUF.as_ptr() }
}

/// Get the expected params buffer size.
#[wasm_bindgen]
pub fn params_size() -> usize {
    PARAMS_SIZE
}

/// Get the expected road buffer size.
#[wasm_bindgen]
pub fn road_size() -> usize {
    ROAD_SIZE
}
