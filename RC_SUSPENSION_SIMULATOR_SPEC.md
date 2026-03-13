# RC Suspension Design Simulator — Claude Code Build Spec

## Overview

Build a single-page interactive 3D web application for experimenting with 1:8 and 1:10 scale RC car suspension geometry. The app models a full double-wishbone suspension system across all four corners, with hydraulic interconnection between wheels (Citroën-style linked hydropneumatic), physics-based force resolution, and real-time graphing of dynamic variables under roll, pitch, and road surface inputs.

The visualisation is **wireframe/engineering style** — lines, links, hard points, and force arrows only. No solid body rendering. Think CAD-overlay aesthetic, not a game.

---

## Tech Stack

- **React** (functional components, hooks)
- **Three.js** via `@react-three-fiber` (R3F) for 3D scene
- **Drei** helpers (OrbitControls, Line, Html labels)
- **Recharts** for live line graphs
- **Tailwind CSS** for UI panels
- **Zustand** or React context for shared state between 3D scene and UI
- **Vite** for dev server and build

Use the **frontend-design** skill. The aesthetic direction should be **industrial/engineering — dark theme, monospaced type for data, high-contrast neon-on-dark for geometry lines** (think oscilloscope or engineering HUD). Use a font like `JetBrains Mono` or `IBM Plex Mono` for all numeric readouts and controls. Use a clean sans like `DM Sans` or `Outfit` for headings and labels. Accent colour: electric cyan `#00FFE0` on a near-black background `#0A0E14`. Secondary accent: signal orange `#FF6B35` for force arrows and warnings. Grid lines in muted blue-grey `#1E2D3D`.

---

## 1. Global Parameters Panel (Left Sidebar)

A collapsible sidebar with grouped input sections. All values update the 3D model in real time.

### 1.1 Vehicle Parameters

| Parameter | Unit | Default | Range | Notes |
|---|---|---|---|---|
| Scale | ratio | 1:8 | 1:8, 1:10, Custom | Dropdown with custom numeric entry |
| Wheelbase | mm | 325 | 200–400 | Distance between front and rear axle centrelines |
| Total weight | g | 3500 | 1000–6000 | Total vehicle weight including all components |
| Weight distribution F/R | % | 45/55 | 20/80–80/20 | Single slider, rear auto-calculated |
| CG height | mm | 35 | 10–80 | Centre of gravity height above ground plane |
| Ride height | mm | 28 | 5–50 | Chassis underside to ground at static |
| Unsprung mass per corner | g | 65 | 20–200 | Mass of wheel, tyre, hub carrier, and lower arm outboard of the spring. Typical: 50–80 g for 1:8, 30–50 g for 1:10 |
| Tyre spring rate | N/mm | 80 | 10–500 | Tyre radial stiffness (foam tyres ~50–100, rubber tyres ~100–300). Acts in series with suspension spring |
| Tyre damping | Ns/mm | 0.05 | 0.001–0.5 | Small but non-zero — rubber/foam hysteresis. Prevents numerical ringing at tyre contact |

> **Note**: Front and rear track width are set independently in Sections 1.2 and 1.2b (per-axle geometry), not here. This allows accurate modelling of cars with different front and rear track widths.

> **Derived values displayed (read-only)**:
> - Sprung mass = total weight − (4 × unsprung mass)
> - Corner mass (sprung) = sprung mass × weight distribution per corner
> - Wheel rate per corner = spring rate × motion ratio² (shown per axle)
> - Sprung natural frequency per axle = (1/2π) × √(wheel_rate / corner_sprung_mass)
> - Unsprung natural frequency per corner = (1/2π) × √(tyre_spring_rate / unsprung_mass)
> - Inner pivot offset from centreline = (track_width / 2) − lower_wishbone_length (shown per axle)

### 1.2 Suspension Geometry — FRONT Axle

All geometry parameters are **independently settable per axle**. The UI should present these as two clearly separated sections (not tabs — both visible simultaneously, stacked vertically) with a header for each: "▸ Front Suspension Geometry" and "▸ Rear Suspension Geometry". Each section is independently collapsible. A "Copy Front → Rear" and "Copy Rear → Front" button pair sits between the two sections for convenience.

| Parameter | Unit | Default (1:8) | Range | Notes |
|---|---|---|---|---|
| Track width | mm | 254 | 150–350 | Front wheel centre to centre. **Moved here from Vehicle Params** so each axle owns its own track |
| Lower wishbone length | mm | 68 | 30–120 | Inner pivot to outer ball joint |
| Upper arm length ratio | ratio | 0.55 | 0.2–1.0 | Upper link length as fraction of lower length. Actual length = ratio × lower length |
| Lower arm angle (static) | ° | 0 | -15 to +15 | Angle from horizontal at ride height. Positive = outer end higher |
| Upper arm angle (static) | ° | -8 | -30 to +5 | Typically negative (outer end lower) for negative camber gain |
| Inner pivot height (lower) | mm | 12 | 0–40 | Height of lower inner pivot above ground |
| Inner pivot height (upper) | mm | 45 | 20–80 | Height of upper inner pivot above ground |
| Inner pivot spread | mm | 32 | 15–50 | Fore-aft distance between front and rear hinge pins of each arm |
| Kingpin inclination (KPI) | ° | 5 | 0–15 | Steering axis lean inward from vertical, viewed from front |
| Caster angle | ° | 15 | 0–35 | Steering axis lean rearward from vertical, viewed from side |
| Static camber | ° | -1 | -5 to +2 | Negative = top of wheel tilts inward |
| Static toe | ° | 0 | -3 to +3 | Per wheel. Positive = toe-in |
| Anti-dive | ° | 5 | 0–15 | Side-view angle of front lower arm pivot line. **Front only — not shown for rear** |

### 1.2b Suspension Geometry — REAR Axle

Same parameter set as front, with **different defaults** reflecting real-world RC car rear-axle conventions. The rear section does NOT include KPI, caster, or anti-dive. It includes anti-squat instead.

| Parameter | Unit | Default (1:8) | Range | Notes |
|---|---|---|---|---|
| Track width | mm | 254 | 150–350 | Rear wheel centre to centre |
| Lower wishbone length | mm | 72 | 30–120 | Rear arms are typically 3–5 mm longer than front on 1:8 buggies |
| Upper arm length ratio | ratio | 0.50 | 0.2–1.0 | Rear upper links are often proportionally shorter |
| Lower arm angle (static) | ° | 2 | -15 to +15 | Slight positive angle common for anti-squat geometry |
| Upper arm angle (static) | ° | -10 | -30 to +5 | More negative than front for greater rear negative camber gain |
| Inner pivot height (lower) | mm | 14 | 0–40 | Often slightly higher than front |
| Inner pivot height (upper) | mm | 42 | 20–80 | |
| Inner pivot spread | mm | 35 | 15–50 | Rear pivot spread is often wider than front for stability |
| Kingpin inclination (KPI) | ° | 0 | 0–10 | **Rear KPI is almost always 0** but included for completeness. Hidden by default, accessible via "Advanced" toggle |
| Caster angle | ° | 0 | 0–10 | **Rear caster is almost always 0** but included for completeness. Hidden by default, accessible via "Advanced" toggle |
| Static camber | ° | -2 | -5 to +2 | Rear runs significantly more negative camber than front |
| Static toe | ° | 2 | -3 to +5 | Rear toe-in is standard (2–3° typical on 1:8 buggy) |
| Anti-squat | ° | 2 | 0–6 | Side-view angle of rear lower arm pivot line. **Rear only — not shown for front** |

**Data model note for Zustand store**: The vehicle store should hold geometry as `frontGeometry: AxleGeometry` and `rearGeometry: AxleGeometry` where `AxleGeometry` is a shared TypeScript interface. Front-only fields (antiDive) and rear-only fields (antiSquat) are both on the interface but conditionally rendered in the UI and conditionally used in the physics engine. Track width is now part of each `AxleGeometry` rather than on the top-level vehicle params.

### 1.3 Shock Absorber — FRONT Axle

Same UI pattern as geometry: two stacked collapsible sections with "Copy Front → Rear" / "Copy Rear → Front" buttons.

| Parameter | Unit | Default (1:8) | Range | Notes |
|---|---|---|---|---|
| Shock length (eye-to-eye) | mm | 90 | 50–140 | Front shocks are typically shorter than rear on off-road buggies |
| Shock mount position on arm | mm | 42 | 10–(lower wishbone length) | Distance from arm inner pivot to shock lower mount |
| Shock tower mount height | mm | 72 | 40–120 | Height of upper shock mount above ground |
| Shock angle from vertical | ° | 15 | 0–45 | Inward lean. Front often more laid down than rear |
| Spring rate | N/mm | 7.5 | 1.0–30.0 | Front springs are typically softer than rear on rear-heavy cars |
| Damping coefficient (compression) | Ns/mm | 0.12 | 0.01–1.0 | Front compression damping |
| Damping coefficient (rebound) | Ns/mm | 0.18 | 0.01–1.0 | Front rebound damping |
| Max droop | mm | 30 | 5–50 | Extension limit below ride height |
| Max bump | mm | 22 | 5–50 | Compression limit above ride height |

### 1.3b Shock Absorber — REAR Axle

| Parameter | Unit | Default (1:8) | Range | Notes |
|---|---|---|---|---|
| Shock length (eye-to-eye) | mm | 100 | 50–140 | Rear shocks are longer — more travel needed for jump landing |
| Shock mount position on arm | mm | 48 | 10–(lower wishbone length) | Typically mounted further out on the rear arm |
| Shock tower mount height | mm | 78 | 40–120 | Rear shock tower is often taller |
| Shock angle from vertical | ° | 10 | 0–45 | Rear shocks are often more upright for linear damping |
| Spring rate | N/mm | 9.0 | 1.0–30.0 | Rear springs stiffer to support more weight (45/55 F/R distribution) |
| Damping coefficient (compression) | Ns/mm | 0.15 | 0.01–1.0 | Rear compression damping — slightly higher than front |
| Damping coefficient (rebound) | Ns/mm | 0.22 | 0.01–1.0 | Rear rebound typically heavier to control pitch on landing |
| Max droop | mm | 28 | 5–50 | Rear droop often slightly less than front |
| Max bump | mm | 25 | 5–50 | |

### 1.4 Anti-Roll Bar — FRONT Axle

| Parameter | Unit | Default (1:8) | Range | Notes |
|---|---|---|---|---|
| Sway bar enabled | bool | true | | Toggle on/off |
| Wire diameter | mm | 2.3 | 1.0–4.0 | Front bar slightly thinner than rear on most 1:8 buggies |
| Arm length | mm | 28 | 10–60 | Lever from centre to link point on lower arm |
| Torsional stiffness | N·mm/° | auto-calc | | Derived from wire diameter, arm length, material (spring steel E=200 GPa, G=80 GPa) |

### 1.4b Anti-Roll Bar — REAR Axle

| Parameter | Unit | Default (1:8) | Range | Notes |
|---|---|---|---|---|
| Sway bar enabled | bool | true | | Toggle on/off |
| Wire diameter | mm | 2.5 | 1.0–4.0 | Rear bar slightly stiffer to reduce rear roll and improve on-power stability |
| Arm length | mm | 32 | 10–60 | Rear lever arms often slightly longer |
| Torsional stiffness | N·mm/° | auto-calc | | Derived from wire diameter, arm length, material (spring steel E=200 GPa, G=80 GPa) |

### 1.5 Hydraulic Linked Suspension

This models a Citroën-style interconnected hydraulic system. The concept: each shock absorber is replaced (or supplemented) by a hydraulic cylinder. Cylinders are connected via fluid lines to accumulator/spheres and to each other, creating roll and pitch coupling.

| Parameter | Unit | Default | Range | Notes |
|---|---|---|---|---|
| Hydraulic link enabled | bool | false | | Master toggle. When off, conventional springs/dampers only |
| Link topology | enum | "Lateral" | Lateral, Diagonal, Full | Lateral = L-R per axle. Diagonal = FL-RR + FR-RL. Full = all four interconnected |
| Cylinder bore | mm | 8 | 4–16 | Internal diameter of hydraulic cylinder at each corner |
| Cylinder rod diameter | mm | 4 | 2–10 | |
| Fluid viscosity | cSt | 50 | 5–500 | Silicone oil. Affects damping through orifices |
| Orifice diameter | mm | 0.8 | 0.1–3.0 | Restriction between cylinder and accumulator |
| Line internal diameter | mm | 2.0 | 1.0–4.0 | Interconnection tube ID |
| Line length | mm | 200 | 50–500 | Affects compliance and lag |
| Accumulator spring rate | N/mm | 5.0 | 0.5–20.0 | Spring-loaded piston accumulator (replaces gas sphere at scale) |
| Accumulator preload | N | 10 | 0–50 | Initial compression of accumulator spring |
| Height corrector enabled | bool | false | | Automatic ride height maintenance |
| Height corrector response time | ms | 500 | 100–5000 | Time constant for ride height correction |

When hydraulic link is enabled, show the fluid lines in the 3D view as coloured tubes between the relevant corners. Colour-code by pressure: cool blue = low, hot orange = high.

---

## 2. 3D Visualisation (Centre — Main Canvas)

### 2.1 Scene Setup

- Dark background `#0A0E14`
- Ground plane: subtle grid pattern (10 mm spacing at model scale), rendered as a translucent plane at y=0
- Orbit controls: rotate, pan, zoom. Default camera position: isometric 3/4 view from front-right, slightly above
- Axis indicator in corner (R/G/B for X/Y/Z)
- Scale bar showing 50 mm reference length

### 2.2 What to Render

Everything is **lines, spheres (for joints), and arrows (for forces)**. No meshes, no solid geometry.

#### Chassis

- A wireframe representing the chassis plate. When front and rear track widths differ, render as a **trapezoid** in plan view (wider track at one end, narrower at the other) rather than a rectangle. Width at each end = track × 0.6. Height (thickness) = 10 mm
- Positioned at ride height
- Colour: muted grey `#3A4555`
- Show the centreline (fore-aft) as a thin dashed line for reference

#### Wheels (×4)

- Circle (ring geometry) at each wheel position
- Diameter scaled to vehicle scale (e.g., ~85 mm for 1:8 buggy tyre)
- Oriented according to camber and toe angles
- Colour: white outline `#C0C8D0`
- Contact patch indicator: small flat line segment at the bottom of each wheel circle touching the ground plane

#### Lower Wishbone (×4)

- Line from inner pivot point to outer ball joint (hub carrier lower)
- Since actual RC arms are A-shaped with two inner pivots separated by the inner pivot spread, render as a **triangle**: two lines from the two inner pivot points converging to the single outer ball joint
- Colour: cyan `#00FFE0`
- Joint spheres: small spheres (2 mm visual radius) at each pivot in brighter cyan

#### Upper Arm / Camber Link (×4)

- Single line from inner ball stud to outer ball stud on hub carrier
- Colour: lighter cyan `#80FFF0`
- Joint spheres at each end

#### Hub Carrier / Upright (×4)

- Vertical-ish line connecting the upper and lower outer ball joints
- The steering axis (kingpin axis) is defined by a line through these two points
- Render the kingpin axis as a **dashed line** extending above and below the ball joints
- Colour: white `#FFFFFF`

#### Shock Absorber (×4)

- Line from lower mount point on the wishbone arm to upper mount on the shock tower/chassis
- Render as a thicker line or as two parallel lines (representing the body and shaft)
- A small coil/zigzag pattern around the lower portion to represent the spring (procedural: 6–8 zigzag segments)
- Colour: orange `#FF6B35` for the damper body, yellow `#FFD700` for the spring coil

#### Anti-Roll Bar (×2, front and rear, when enabled)

- U-shaped line: centre mount on the diff/chassis centreline, arms extending left and right, drop links to the lower arms
- Colour: magenta `#FF00FF`

#### Hydraulic Lines (when enabled)

- Curved tube/line connecting the relevant cylinders per the selected topology
- Small sphere at each accumulator position (mounted on chassis)
- Colour varies by instantaneous pressure: blue `#0088FF` → orange `#FF6B35` mapped to min/max pressure range
- Render small animated dots flowing along the line to show fluid movement direction

#### Steering Linkage (front only)

- Tie rods from the bellcrank/servo position to the steering arms on each front hub carrier
- Bellcrank as a small triangle at chassis centre
- Colour: green `#00FF88`

### 2.3 Force Arrows (Toggleable)

A toolbar button group or checkbox group to toggle each force type on/off:

| Force | Arrow Colour | Description |
|---|---|---|
| Weight | Red ↓ | Single arrow at CG position, pointing down. Magnitude = sprung mass × g |
| Unsprung weight | Dark red ↓ | At each wheel centre, pointing down. Magnitude = unsprung mass × g |
| Per-corner load | Dark red ↓ | At each contact patch, pointing down. Magnitude = total load per corner at static |
| Ground reaction (tyre) | Green ↑ | At each contact patch, pointing up. Magnitude = tyre contact force from Section 3.3a. **Disappears when wheel is airborne** — this is a key visual cue for drop tests |
| Spring force | Yellow ↕ | Along each shock axis. Direction depends on compression/extension |
| Damping force | Orange ↕ | Along each shock axis. Opposing velocity |
| Bump stop force | Bright red ↕ | Along each shock axis. Only appears when near travel limits |
| Sway bar force | Magenta ↔ | Lateral arrows at arm connection points |
| Hydraulic pressure | Cyan ↕ | At each cylinder, magnitude proportional to pressure |
| Tyre lateral force | Blue → | At contact patch, when lateral acceleration is applied |
| Tyre load transfer | White ↕ | Showing the delta from static per-corner load |

When a wheel is **airborne** (tyre contact force = 0), render a small flashing indicator at the wheel — a hollow circle or a "floating" icon — so the user can immediately see which wheels have left the ground during a drop test or bump event.

Arrow length should be proportional to force magnitude, with a user-adjustable scale factor (slider: 0.5×–5× default). All arrows render as Three.js ArrowHelper or equivalent.

---

## 3. Simulation / Dynamics Engine

The simulation operates in **two modes**, selectable by the user:

- **Kinematic mode** (simple): Chassis position is user-driven via sliders/inputs. Forces are computed and displayed but don't feed back into chassis motion. Useful for exploring geometry statically — "what does the camber curve look like?" This is the original behaviour described in earlier drafts.
- **Dynamic mode** (full physics): The chassis is a free rigid body acted on by gravity, spring forces, damper forces, sway bar torques, hydraulic forces, and ground reaction. Chassis heave, roll, and pitch are **solved from Newton's second law**, not prescribed. This enables drop tests, bump response, oscillation, and realistic transient behaviour.

A toggle in the Simulation Controls panel switches between modes. Dynamic mode is the default.

### 3.1 Degrees of Freedom and State Variables

The system has **three sprung-mass DOF** and **four unsprung-mass DOF** (one per corner):

**Sprung mass (chassis):**
- `z_s` — heave (vertical position of CG above ground), integrated from `v_s`
- `θ_roll` — roll angle about the roll axis, integrated from `ω_roll`
- `θ_pitch` — pitch angle about the pitch axis, integrated from `ω_pitch`

**Unsprung mass (per corner, i = FL, FR, RL, RR):**
- `z_u[i]` — vertical position of wheel centre above ground, integrated from `v_u[i]`

Total state vector: 14 scalar values (3 positions + 3 velocities for sprung mass, 4 positions + 4 velocities for unsprung masses).

Lateral (x) and longitudinal (y) translation are not simulated — the car stays in place. Yaw is always zero.

### 3.2 Mass and Inertia

- `m_s` = total mass − 4 × unsprung mass per corner (sprung mass)
- `m_u` = unsprung mass per corner (from Vehicle Parameters)
- `I_roll` = m_s × (average_track_width / 2)² × 0.3 (approximate roll inertia — treat as a flat rectangular plate; the 0.3 coefficient is adjustable)
- `I_pitch` = m_s × (wheelbase / 2)² × 0.3 (approximate pitch inertia)

These approximations are fine for the dynamics we're simulating. Exact inertia tensors for irregular RC chassis would add complexity without meaningful accuracy gain.

### 3.3 Force Model (Per Corner)

For each corner `i`, compute the following force chain from ground up:

#### 3.3a Ground contact

```
ground_z[i] = road_surface_height(x[i], y[i], t)  // from road surface generator

if z_u[i] > ground_z[i] + tyre_radius:
    // Wheel is airborne — no ground reaction
    F_tyre[i] = 0
    wheel_contact[i] = false
else:
    // Tyre compression (how much the tyre is squished)
    tyre_deflection[i] = max(0, (ground_z[i] + tyre_radius) - z_u[i])
    F_tyre[i] = tyre_spring_rate × tyre_deflection[i] + tyre_damping × (v_ground[i] - v_u[i])
    F_tyre[i] = max(0, F_tyre[i])  // tyre can only push, never pull
    wheel_contact[i] = true
```

This is the critical piece that enables drop tests — when the wheel is above the ground, F_tyre = 0 and the unsprung mass is in freefall (or being pushed by the spring if the chassis is above it).

#### 3.3b Suspension spring and damper

```
// Suspension compression = sprung mass position at this corner minus unsprung mass position
// (positive = compressed, negative = extended/droop)
z_sprung_at_corner[i] = z_s + roll_lever[i] × sin(θ_roll) + pitch_lever[i] × sin(θ_pitch)
suspension_compression[i] = z_u[i] - z_sprung_at_corner[i]  // relative displacement
suspension_velocity[i] = v_u[i] - v_sprung_at_corner[i]      // relative velocity

// Apply motion ratio
shock_compression[i] = suspension_compression[i] × motion_ratio[i]
shock_velocity[i] = suspension_velocity[i] × motion_ratio[i]

// Clamp to bump and droop limits
shock_compression[i] = clamp(shock_compression[i], -max_droop[i], max_bump[i])

// Spring force (acts along shock axis, projected to vertical)
F_spring[i] = spring_rate[i] × shock_compression[i] × motion_ratio[i]

// Damper force (asymmetric compression/rebound)
if shock_velocity[i] > 0:
    F_damper[i] = damping_compression[i] × shock_velocity[i] × motion_ratio[i]
else:
    F_damper[i] = damping_rebound[i] × shock_velocity[i] × motion_ratio[i]

// Total suspension force on this corner (positive = pushing wheel and chassis apart)
F_suspension[i] = F_spring[i] + F_damper[i]
```

#### 3.3c Anti-roll bar

```
// Differential compression between left and right on same axle
Δcompression_front = suspension_compression[FL] - suspension_compression[FR]
Δcompression_rear = suspension_compression[RL] - suspension_compression[RR]

// Sway bar resisting force (applied equally and opposite to left and right)
F_sway_front = sway_bar_stiffness_front × Δcompression_front / sway_bar_arm_length_front
F_sway_rear = sway_bar_stiffness_rear × Δcompression_rear / sway_bar_arm_length_rear

// Add to each corner: +F_sway to left, -F_sway to right (resists roll)
```

#### 3.3d Bump stops (progressive end-of-travel)

```
// When near travel limits, add a steep progressive spring to prevent hard lockout
if shock_compression[i] > max_bump[i] × 0.85:
    overshoot = shock_compression[i] - max_bump[i] × 0.85
    F_bumpstop[i] = 50 × overshoot²  // quadratic ramp — stiff but not infinite
elif shock_compression[i] < -max_droop[i] × 0.85:
    overshoot = (-max_droop[i] × 0.85) - shock_compression[i]
    F_bumpstop[i] = -50 × overshoot²
else:
    F_bumpstop[i] = 0
```

### 3.4 Equations of Motion

**Per-corner unsprung mass (vertical):**
```
a_u[i] = (F_tyre[i] - F_suspension[i] - F_sway[i] - F_bumpstop[i] - m_u × g) / m_u
```
The unsprung mass is pushed up by the tyre, pushed down by gravity, and connected to the chassis through the spring/damper.

**Sprung mass heave (vertical translation of CG):**
```
F_heave = Σ(F_suspension[i] + F_sway_contribution[i] + F_bumpstop[i]) for all 4 corners
         + F_hydraulic_heave (if hydraulic enabled)
a_s = (F_heave - m_s × g) / m_s
```

**Sprung mass roll:**
```
// Roll moment = sum of per-corner forces × their lateral lever arm from CG
M_roll = Σ(F_suspension[i] × lateral_lever[i]) for all 4 corners
         + sway_bar_roll_moment_front + sway_bar_roll_moment_rear
         + hydraulic_roll_moment (if hydraulic enabled)
α_roll = M_roll / I_roll
```

**Sprung mass pitch:**
```
// Pitch moment = sum of per-corner forces × their longitudinal lever arm from CG
M_pitch = Σ(F_suspension[i] × longitudinal_lever[i]) for all 4 corners
          + hydraulic_pitch_moment (if hydraulic enabled)
α_pitch = M_pitch / I_pitch
```

**Lever arms:**
```
lateral_lever[FL] = -front_track / 2    // negative = left of centre
lateral_lever[FR] = +front_track / 2
lateral_lever[RL] = -rear_track / 2
lateral_lever[RR] = +rear_track / 2

longitudinal_lever[FL] = +wheelbase × (1 - front_weight_fraction)   // distance forward of CG
longitudinal_lever[FR] = +wheelbase × (1 - front_weight_fraction)
longitudinal_lever[RL] = -wheelbase × front_weight_fraction          // distance behind CG
longitudinal_lever[RR] = -wheelbase × front_weight_fraction
```

### 3.5 Integration

Semi-implicit Euler at 1 kHz (dt = 0.001 s):

```
// Update velocities first (semi-implicit)
v_s += a_s × dt
ω_roll += α_roll × dt
ω_pitch += α_pitch × dt
v_u[i] += a_u[i] × dt    // for each corner

// Then update positions from new velocities
z_s += v_s × dt
θ_roll += ω_roll × dt
θ_pitch += ω_pitch × dt
z_u[i] += v_u[i] × dt    // for each corner

// Enforce hard ground constraint (wheel cannot go below ground)
for each corner i:
    if z_u[i] < ground_z[i] + tyre_radius × 0.5:
        z_u[i] = ground_z[i] + tyre_radius × 0.5
        v_u[i] = max(v_u[i], 0)  // zero out downward velocity
```

### 3.6 Hydraulic Model (Supplements Section 3.3 When Enabled)

Model the hydraulic system as a lumped-parameter fluid circuit operating in parallel with the spring/damper:

- Each cylinder has a piston area A = π(bore/2)² − π(rod/2)²
- Suspension compression at each corner produces cylinder displacement = suspension_compression[i] × motion_ratio[i]
- Volume change ΔV = A × cylinder displacement
- Pressure in accumulator: P = P_preload + (k_accum × x_accum / A_accum), where x_accum is accumulator piston displacement
- Flow between linked cylinders through orifice: Q = Cd × A_orifice × √(2ΔP/ρ) for turbulent, or Q = (π × d⁴ × ΔP) / (128 × μ × L) for laminar (Hagen-Poiseuille). Use Reynolds number to choose: Re = (ρ × v × d) / μ. At RC scale with silicone oil, flow is almost always laminar (Re < 10)
- Hydraulic force at each corner = ΔP × A_piston. This force is **added to** F_suspension[i] in the equations of motion
- For lateral link: left cylinder displacement compresses left accumulator and draws fluid from right side (and vice versa), creating a coupling that resists roll but allows heave
- For diagonal link: FL connects to RR, FR connects to RL — resists pitch and roll differently
- For full link: all four are interconnected — complex pressure network, use simultaneous equations or iterative solver (Gauss-Seidel with 3–5 iterations per timestep is sufficient at 1 kHz)

### 3.7 Kinematic Geometry Update (Runs Every Timestep in Both Modes)

After the dynamic solver updates positions, recompute the geometric state:

1. Calculate chassis height at each corner from z_s, θ_roll, θ_pitch and the lever arms
2. Calculate suspension compression per corner from chassis-at-corner minus wheel position
3. Resolve wishbone geometry: given inner pivot positions (move with chassis) and outer pivot positions (constrained by arm length and wheel position), compute instantaneous camber, caster, toe
4. Use the **instant centre method** for each axle: find the intersection of lines through inner/outer pivots of upper and lower arms. The roll centre is where the line from tyre contact patch through the instant centre crosses the vehicle centreline
5. Update all 3D visualisation positions

### 3.8 Input Modes (Right Sidebar or Bottom Panel)

#### Simulation Mode Toggle

- **Kinematic**: Chassis position driven by sliders. Forces computed and displayed but don't move the chassis. Good for exploring geometry.
- **Dynamic**: Full physics. Chassis is a free body. All inputs below create forces/displacements that the solver resolves. **This is the default.**

#### Drop Test

- **Drop height**: 0–100 mm (height of CG above static equilibrium at release)
- **Drop angle**: roll (°) and pitch (°) at release — allows testing asymmetric landings
- **Release button**: "Drop" — sets initial conditions (z_s = static + drop_height, v_s = 0, angles as specified) and runs the simulation forward. The chassis falls under gravity, wheels may separate from ground during freefall, then everything impacts and oscillates to rest.
- **Presets**:
  - Flat drop (0° roll, 0° pitch) — tests heave damping
  - Nose-first (0° roll, -15° pitch) — tests pitch recovery
  - One-corner (5° roll, -5° pitch) — tests combined response
  - Jump landing (0° roll, 0° pitch, 50 mm height) — simulates a typical 1:8 buggy jump return

The 3D view should show the chassis falling, the suspension compressing on impact, the rebound, and the oscillation dying out. The graphs should capture the entire transient — peak deceleration, number of oscillation cycles to settle, overshoot, etc.

#### Roll Input

- Slider: Roll angle, -15° to +15°
- In **kinematic mode**: directly sets chassis roll angle
- In **dynamic mode**: applies an equivalent **lateral acceleration** (a_lat = g × tan(angle)) as a sustained body force on the sprung mass, and the solver finds the equilibrium roll angle. This is physically correct — you're simulating the car cornering, not manually tilting it
- Animatable: "Oscillate" button that sinusoidally sweeps the lateral acceleration at a user-set frequency (0.5–5 Hz) and amplitude. Useful for finding roll resonance.
- Weight transfer per axle = (axle_load × a_lat × h_CG) / axle_track_width — note this uses each axle's own track width, so load transfer differs between front and rear even at equal lateral acceleration when tracks differ

#### Pitch Input

- Slider: Pitch angle, -10° to +10°
- In **kinematic mode**: directly sets pitch
- In **dynamic mode**: applies equivalent **longitudinal acceleration** as a body force
- Animatable: sinusoidal sweep

#### Road Surface Input

- Dropdown presets:
  - Flat (no input)
  - Single bump (one wheel, selectable which corner)
  - Speed bump (both wheels on one axle simultaneously)
  - Diagonal twist (FL and RR up, FR and RL down — or vice versa)
  - Washboard (sinusoidal vertical input at a frequency, all four wheels, selectable phase offsets between corners)
  - Random (Perlin noise surface)
  - **Step** (abrupt vertical change — one or both wheels on an axle drive onto a raised surface)
- For bump: **shape** (half-sine, triangular, square), **width** (mm, how long the bump lasts as the wheel passes over), **height** (mm), and **speed** (mm/s — how fast the car is travelling over the surface, which converts spatial profile to temporal profile)
- For washboard: amplitude (mm) and frequency (Hz) controls
- For random: roughness parameter and speed parameter
- The road surface is a function `ground_z(x, y, t)` that returns the ground height at each wheel's position at each timestep. The simulation runs forward in time when "Play" is pressed.
- In **dynamic mode**, the road surface directly moves the ground plane under the wheel — the tyre contact model (Section 3.3a) handles the rest. The wheel can leave the ground on the rebound of a sharp bump, which is physically correct.

#### Combined Inputs

All inputs (drop test initial conditions, roll/pitch accelerations, road surface) can be active simultaneously. The dynamic solver resolves the combined response.

#### Speed Control

- Playback speed: 0.1×, 0.25×, 0.5×, 1× (real-time), 2×, 5×
- At 0.1× the user can watch a drop test in slow motion
- At 5× a long settling transient can be watched quickly
- The physics always runs at 1 kHz regardless — speed control just changes how many physics steps are computed per animation frame

---

## 4. Live Graphs (Bottom Panel — Expandable/Collapsible)

Use **Recharts** (line charts). The graph panel should be a horizontally scrollable row of charts, or a tabbed interface showing one at a time. Each chart shows time on the X axis (0–5 seconds typical window, auto-scrolling) and the relevant variable on Y.

### Channels (user selects which to display)

| Channel | Unit | Description |
|---|---|---|
| Wheel displacement (per corner) | mm | Vertical wheel travel from static (unsprung mass position) |
| Chassis displacement at CG | mm | Heave of the sprung mass body (`z_s` relative to static equilibrium) |
| Chassis roll angle | ° | Instantaneous roll |
| Chassis pitch angle | ° | Instantaneous pitch |
| Suspension compression (per corner) | mm | Relative displacement between sprung and unsprung mass at each corner. **This is what the shock absorber actually sees** |
| Tyre deflection (per corner) | mm | How much the tyre is compressed. Zero when airborne |
| Spring force (per corner) | N | |
| Damper force (per corner) | N | |
| Tyre contact force (per corner) | N | Normal force at the tyre/ground interface. **Zero when wheel is airborne** — key for drop test analysis |
| Per-corner vertical load | N | Total normal force at each tyre |
| Load transfer (per axle) | N | Left-right load difference |
| Shock velocity (per corner) | mm/s | Rate of shock compression/extension |
| Chassis vertical velocity | mm/s | Heave velocity of CG (useful for watching drop test deceleration) |
| Chassis vertical acceleration | g | Heave acceleration normalised to g — **peak g on landing is a key drop test metric** |
| Camber angle (per corner) | ° | Dynamic camber during travel |
| Roll centre height (per axle) | mm | Instantaneous RC height |
| Wheel airborne flag (per corner) | bool | 1 = airborne, 0 = on ground. Plotted as a step function — shows exactly when wheels leave/regain contact |
| Hydraulic pressure (per corner) | kPa | Only when hydraulic enabled |
| Hydraulic flow rate (per line) | mm³/s | Only when hydraulic enabled |
| Accumulator displacement (per corner) | mm | Only when hydraulic enabled |

### Graph Controls

- Play / Pause / Reset buttons
- Time window: 2s, 5s, 10s (selectable)
- Y-axis auto-scale or manual range
- Checkbox per channel to show/hide
- Colour-coded lines matching the 3D visualisation colours (FL = solid, FR = dashed, RL = dot-dash, RR = dotted — or use distinct colours per corner)

---

## 5. UI Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header: "RC Suspension Lab" + dark theme toggle         │
├────────────┬───────────────────────────┬─────────────────┤
│            │                           │                 │
│  Left      │    3D Viewport            │  Right          │
│  Sidebar   │    (Three.js canvas)      │  Sidebar        │
│            │                           │                 │
│  Vehicle   │    OrbitControls          │  [Kinematic|Dynamic]│
│  Params    │                           │  mode toggle       │
│            │    Force arrow toggles    │                 │
│  Geometry  │    (floating toolbar      │  Drop Test:     │
│  F + R     │     top-left of canvas)   │  - Height       │
│            │                           │  - Angle        │
│  Shock     │                           │  - [DROP] button│
│  F + R     │                           │                 │
│            │                           │  Roll input     │
│  Sway bar  │                           │  Pitch input    │
│  F + R     │                           │  Road surface   │
│            │                           │                 │
│  Hydraulic │                           │  Play/Pause     │
│  Params    │                           │  Speed: 0.1–5×  │
│            │                           │                 │
│            │                           │  Presets:       │
│            │                           │  - 1:8 buggy    │
│            │                           │  - 1:10 touring │
│            │                           │  - 1:10 buggy   │
│            │                           │  - Custom       │
│            │                           │                 │
├────────────┴───────────────────────────┴─────────────────┤
│  Bottom Panel: Live Graphs (collapsible)                 │
│  [Wheel Disp] [Spring Force] [Damper Force] [Camber] ... │
│  Recharts line charts, time-scrolling                    │
└──────────────────────────────────────────────────────────┘
```

- Left sidebar: scrollable, collapsible sections with accordion headers
- Right sidebar: narrower, focused on simulation control
- Bottom panel: slides up from bottom, drag-resizable height
- 3D viewport fills remaining space
- All panels can collapse to maximise viewport
- Responsive: on narrow screens, sidebars become bottom sheets or tabs

---

## 6. Presets

Include these as starting configurations:

### 1:8 Off-Road Buggy (default)

**Vehicle**: Scale 1:8, Wheelbase 325 mm, Weight 3500 g, F/R distribution 45/55, CG height 35 mm, Ride height 28 mm, Unsprung mass/corner 65 g, Tyre spring rate 80 N/mm, Tyre damping 0.05 Ns/mm

**Front geometry**: Track 254 mm, Lower wishbone 68 mm, Upper ratio 0.55, Lower arm angle 0°, Upper arm angle -8°, Inner pivot height lower 12 mm / upper 45 mm, Inner pivot spread 32 mm, KPI 5°, Caster 15°, Camber -1°, Toe 0°, Anti-dive 5°

**Rear geometry**: Track 254 mm, Lower wishbone 72 mm, Upper ratio 0.50, Lower arm angle 2°, Upper arm angle -10°, Inner pivot height lower 14 mm / upper 42 mm, Inner pivot spread 35 mm, KPI 0°, Caster 0°, Camber -2°, Toe 2° (toe-in), Anti-squat 2°

**Front shocks**: Length 90 mm, Mount position 42 mm, Tower height 72 mm, Angle 15°, Spring rate 7.5 N/mm, Comp damping 0.12, Reb damping 0.18, Droop 30 mm, Bump 22 mm

**Rear shocks**: Length 100 mm, Mount position 48 mm, Tower height 78 mm, Angle 10°, Spring rate 9.0 N/mm, Comp damping 0.15, Reb damping 0.22, Droop 28 mm, Bump 25 mm

**Front sway bar**: 2.3 mm wire, 28 mm arm length
**Rear sway bar**: 2.5 mm wire, 32 mm arm length

### 1:10 4WD Buggy

**Vehicle**: Scale 1:10, Wheelbase 283 mm, Weight 1600 g, F/R distribution 50/50, CG height 25 mm, Ride height 20 mm, Unsprung mass/corner 40 g, Tyre spring rate 60 N/mm, Tyre damping 0.03 Ns/mm

**Front geometry**: Track 249 mm, Lower wishbone 52 mm, Upper ratio 0.50, Lower arm angle 0°, Upper arm angle -6°, Inner pivot height lower 10 mm / upper 35 mm, Inner pivot spread 26 mm, KPI 5°, Caster 12°, Camber -0.5°, Toe 0°, Anti-dive 4°

**Rear geometry**: Track 249 mm, Lower wishbone 55 mm, Upper ratio 0.45, Lower arm angle 1.5°, Upper arm angle -8°, Inner pivot height lower 11 mm / upper 33 mm, Inner pivot spread 28 mm, KPI 0°, Caster 0°, Camber -2.5°, Toe 2.5° (toe-in), Anti-squat 2.5°

**Front shocks**: Length 70 mm, Mount position 34 mm, Tower height 58 mm, Angle 12°, Spring rate 4.5 N/mm, Comp damping 0.08, Reb damping 0.12, Droop 25 mm, Bump 18 mm

**Rear shocks**: Length 78 mm, Mount position 38 mm, Tower height 62 mm, Angle 8°, Spring rate 5.5 N/mm, Comp damping 0.10, Reb damping 0.14, Droop 22 mm, Bump 20 mm

**Front sway bar**: 1.6 mm wire, 22 mm arm length
**Rear sway bar**: 1.8 mm wire, 25 mm arm length

### 1:10 Touring Car

**Vehicle**: Scale 1:10, Wheelbase 257 mm, Weight 1350 g, F/R distribution 50/50, CG height 15 mm, Ride height 6 mm, Unsprung mass/corner 35 g, Tyre spring rate 150 N/mm, Tyre damping 0.02 Ns/mm

**Front geometry**: Track 190 mm, Lower wishbone 45 mm, Upper ratio 0.45, Lower arm angle 0°, Upper arm angle -5°, Inner pivot height lower 6 mm / upper 22 mm, Inner pivot spread 20 mm, KPI 3°, Caster 5°, Camber -1.5°, Toe 0°, Anti-dive 2°

**Rear geometry**: Track 190 mm, Lower wishbone 46 mm, Upper ratio 0.42, Lower arm angle 0.5°, Upper arm angle -6°, Inner pivot height lower 6 mm / upper 21 mm, Inner pivot spread 21 mm, KPI 0°, Caster 0°, Camber -1.5°, Toe 1.5° (toe-in), Anti-squat 1°

**Front shocks**: Length 52 mm, Mount position 28 mm, Tower height 40 mm, Angle 8°, Spring rate 11.0 N/mm, Comp damping 0.10, Reb damping 0.14, Droop 5 mm, Bump 5 mm

**Rear shocks**: Length 55 mm, Mount position 30 mm, Tower height 42 mm, Angle 6°, Spring rate 12.5 N/mm, Comp damping 0.11, Reb damping 0.15, Droop 5 mm, Bump 5 mm

**Front sway bar**: 1.1 mm wire, 18 mm arm length
**Rear sway bar**: 1.3 mm wire, 20 mm arm length

---

## 7. Implementation Notes

### Physics Loop

- Use `requestAnimationFrame` for the render loop
- Physics timestep: fixed 1 ms (1000 Hz) with accumulator pattern to decouple from frame rate. At 60 fps, run ~16 physics steps per frame. At 5× speed, run ~83 steps per frame.
- Use semi-implicit Euler integration (see Section 3.5)
- **Dynamic mode state vector** (14 scalars):
  - Sprung mass: {z_s, v_s, θ_roll, ω_roll, θ_pitch, ω_pitch}
  - Unsprung mass per corner: {z_u, v_u} × 4 corners
  - Plus per-corner derived: {shock_compression, shock_velocity, tyre_deflection, tyre_contact_force, wheel_airborne}
  - Plus hydraulic state (when enabled): {accumulator_displacement, fluid_pressure} per corner
- **Kinematic mode**: z_s, θ_roll, θ_pitch are user-driven inputs, not integrated. Only the force calculations and geometry updates run.
- **Initialisation**: on simulation start or parameter change, solve static equilibrium to find the resting state — iterate until all velocities are below a threshold (0.01 mm/s). This prevents the car "dropping" when you adjust a spring rate.
- **Energy check**: optionally log total system energy (KE + PE_spring + PE_gravity) per frame as a sanity check. In a stable simulation, energy should decrease monotonically due to damping. If energy increases, the timestep is too large or there's a bug.

### Geometry Calculations

- All geometry is computed from the input parameters — no hardcoded positions
- Use rotation matrices for camber, caster, KPI, and toe transformations
- The instant centre for each side of each axle = intersection of lines through upper and lower arm pivot pairs (inner and outer)
- Roll centre = intersection of the line from contact patch through instant centre with the vehicle centreline vertical plane

### Performance

- Target 60 fps with all four corners animated
- Use instanced rendering for repeated geometries (joint spheres)
- Throttle graph updates to 30 fps (every other frame)
- Use `useMemo` and `useCallback` aggressively in React components to prevent unnecessary re-renders of the parameter panels while the 3D scene animates

### Code Organisation

```
src/
├── App.tsx
├── main.tsx
├── types/
│   └── suspension.ts            # AxleGeometry, AxleShock, AxleSwayBar, HydraulicConfig interfaces
├── store/
│   ├── useVehicleStore.ts       # Zustand store: { vehicle, frontGeometry, rearGeometry, frontShock, rearShock, frontSwayBar, rearSwayBar, hydraulic }
│   └── useSimulationStore.ts    # Zustand store for sim state (per-corner arrays)
├── components/
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── LeftSidebar.tsx
│   │   ├── RightSidebar.tsx
│   │   └── BottomPanel.tsx
│   ├── params/
│   │   ├── VehicleParams.tsx
│   │   ├── AxleGeometryParams.tsx   # Reusable component, receives axle='front'|'rear' prop + store slice
│   │   ├── AxleShockParams.tsx      # Same pattern — one component, two instances
│   │   ├── AxleSwayBarParams.tsx    # Same pattern
│   │   ├── HydraulicParams.tsx
│   │   └── CopyAxleButton.tsx       # "Copy Front → Rear" / "Copy Rear → Front" helper
│   ├── viewport/
│   │   ├── Scene.tsx
│   │   ├── Chassis.tsx
│   │   ├── Wheel.tsx
│   │   ├── Wishbone.tsx
│   │   ├── CamberLink.tsx
│   │   ├── HubCarrier.tsx
│   │   ├── ShockAbsorber.tsx
│   │   ├── AntiRollBar.tsx
│   │   ├── HydraulicLine.tsx
│   │   ├── SteeringLinkage.tsx
│   │   ├── ForceArrows.tsx
│   │   └── GroundPlane.tsx
│   ├── simulation/
│   │   ├── SimControls.tsx
│   │   ├── SimModeToggle.tsx        # Kinematic / Dynamic mode switch
│   │   ├── DropTestInput.tsx        # Drop height, angle, release button, presets
│   │   ├── RollInput.tsx
│   │   ├── PitchInput.tsx
│   │   ├── RoadSurfaceInput.tsx
│   │   └── SpeedControl.tsx         # Playback speed: 0.1× to 5×
│   └── graphs/
│       ├── GraphPanel.tsx
│       └── ChannelSelector.tsx
├── engine/
│   ├── kinematics.ts            # Wishbone geometry, instant centres, roll centres — operates on AxleGeometry
│   ├── dynamics.ts              # Full rigid body solver — sprung mass EOM, unsprung mass EOM, force summation
│   ├── forces.ts                # Per-corner force chain: tyre contact, spring, damper, sway bar, bump stop
│   ├── hydraulics.ts            # Fluid circuit model — supplements forces.ts when enabled
│   ├── integration.ts           # Semi-implicit Euler stepper, static equilibrium solver, energy check
│   ├── tyreContact.ts           # Ground contact model — airborne detection, tyre spring/damping
│   └── roadSurface.ts           # Road profile generators (bump, washboard, random, step)
├── utils/
│   ├── geometry.ts              # Vector math, rotation matrices, line intersections
│   └── units.ts                 # Conversion helpers
└── presets/
    ├── buggy18.ts               # Each preset exports { vehicle, frontGeometry, rearGeometry, frontShock, rearShock, frontSwayBar, rearSwayBar }
    ├── buggy110.ts
    └── touring110.ts
```

**Critical data model pattern**: Every per-axle component (AxleGeometryParams, AxleShockParams, AxleSwayBarParams) is written ONCE as a reusable component that accepts an `axle: 'front' | 'rear'` prop. The component reads from and writes to the correct store slice (`frontGeometry` or `rearGeometry` etc.) based on this prop. This avoids code duplication while ensuring front and rear are completely independent data paths. The viewport components similarly receive an `axle` prop to know which geometry to render.

### Key Visual Details

- All numeric readouts in the sidebars should update live as the simulation runs, with a subtle pulse animation on value change
- The ground plane grid should show tyre contact patch pressure distribution as a colour intensity beneath each wheel (brighter = more load)
- When a parameter is hovered in the sidebar, highlight the corresponding geometry element in the 3D view (e.g., hover "Lower wishbone length" → the relevant arms flash)
- Camera presets: Front view, Side view, Top view, Isometric (buttons in viewport corner)
- Screenshot/export button that saves the current 3D view as PNG

---

## 8. Stretch Goals (Implement if Time Allows)

1. **Ackermann visualisation**: show the steering geometry with tie rod positions, and a ground-plane projection of the Ackermann circle when front wheels are turned
2. **Bump steer graph**: plot toe angle change vs wheel travel as a separate static graph
3. **Camber curve graph**: plot camber angle vs wheel travel for the current geometry
4. **Export parameters**: JSON export/import of the full parameter set
5. **Comparison mode**: ghost overlay of a second configuration in a different colour — run the same drop test or road surface on two setups and overlay the time-series graphs
6. **Wheel rate calculator**: display effective wheel rate (spring rate × motion ratio²) alongside spring rate input — *now partially covered by the derived readouts in Vehicle Params, but a dedicated graph of wheel rate vs travel (which changes due to motion ratio geometry) would be more useful*
7. **Frequency response (Bode plot)**: sweep the road surface input frequency from 0.1 Hz to 50 Hz and plot chassis amplitude ratio and phase lag vs frequency. This is the gold-standard way to evaluate suspension tuning and would clearly show the sprung and unsprung resonant peaks
8. **Settling time metric**: after a drop test or bump, automatically calculate and display time to settle within 5% of static position, peak overshoot, and number of oscillations
9. **Damping ratio display**: ζ = c / (2 × √(k × m)) per corner — shows whether the system is underdamped (oscillatory), critically damped, or overdamped
10. **Energy visualisation**: stacked area chart showing kinetic energy, potential energy (spring + gravity), and energy dissipated by dampers over time. Total should decrease monotonically. Particularly illuminating for drop tests.
11. **Ride quality metric**: RMS chassis acceleration over a defined road surface — lower is better. Allows quantitative comparison between setups.

---

## Summary

This app is an engineering tool for visualising and experimenting with RC car suspension geometry and dynamics. It operates in two modes: **kinematic** (user-driven chassis position for exploring geometry) and **dynamic** (full rigid body physics with gravity, inertia, tyre contact, and free-body chassis motion). The 3D view shows the skeleton of the suspension — hard points, links, force arrows — updating in real time as parameters change or the simulation runs.

The dynamic mode enables physically accurate **drop tests** (chassis released from a height, falling under gravity, impacting through the tyre contact model, oscillating to rest), **bump response** (road surface profiles excite the suspension from below, with wheels able to leave the ground on rebound), **roll and pitch transients** (lateral/longitudinal accelerations applied as body forces, with the solver finding the dynamic response), and **combined inputs** (all active simultaneously).

The **two-mass model** (sprung + unsprung per corner with tyre spring in series) captures both the primary ride frequency (~3–8 Hz for sprung mass) and the wheel hop frequency (~15–30 Hz for unsprung mass), which is essential for evaluating damping tuning. The hydraulic linked suspension model adds Citroën-style interconnected fluid dynamics, allowing comparison between conventional and linked configurations under identical test conditions.

Build it in layers: static geometry rendering → kinematic mode → static equilibrium solver → dynamic single-corner (one spring-mass-damper to verify integration) → dynamic four-corner with tyre contact → anti-roll bars → hydraulic model → graphs → drop test UI. Test the dynamic solver against known analytical solutions: a single-DOF spring-mass-damper dropped from height should produce the textbook underdamped oscillation with the correct natural frequency and decay rate.
