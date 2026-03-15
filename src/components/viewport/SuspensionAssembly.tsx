import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { useVehicleStore } from '../../store/useVehicleStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { armLengths, deriveInnerPivotHeights, computeAckermannArmLength } from '../../engine/kinematics'
import type { Corner } from '../../types/suspension'

const CYAN = '#00FFE0'
const LIGHT_CYAN = '#80FFF0'
const WHITE = '#FFFFFF'
const GREY = '#3A4555'
const ORANGE = '#FF6B35'
const YELLOW = '#FFD700'
const MAGENTA = '#FF00FF'
const GREEN = '#00FF88'
const WHEEL_COLOR = '#C0C8D0'

function JointSphere({ position, color = CYAN, size = 2 }: { position: [number, number, number]; color?: string; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 8, 8]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function WheelTyre({ position, radius, width, camber = 0, toe = 0, caster = 0, deflection = 0 }: { position: [number, number, number]; radius: number; width: number; camber: number; toe: number; caster: number; deflection: number }) {
  const halfW = width / 2
  const segments = 32

  // Deformed tyre profile: flatten the bottom by the deflection amount.
  // Points below (groundLine = -radius + deflection) get clamped up.
  const groundLine = -radius + deflection
  const deformedRing = (xOffset: number) => {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      let y = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (y < groundLine) y = groundLine
      pts.push([xOffset, y, z])
    }
    return pts
  }

  const innerRing = useMemo(() => deformedRing(-halfW), [radius, halfW, deflection])
  const outerRing = useMemo(() => deformedRing(halfW), [radius, halfW, deflection])

  // Longitudinal lines connecting inner and outer rings at intervals
  const longiLines = useMemo(() => {
    const lines: [number, number, number][][] = []
    const count = 16
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      let y = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      if (y < groundLine) y = groundLine
      lines.push([[-halfW, y, z], [halfW, y, z]])
    }
    return lines
  }, [radius, halfW, deflection])

  const camberRad = (camber * Math.PI) / 180
  const toeRad = (toe * Math.PI) / 180
  const casterRad = (caster * Math.PI) / 180

  // Contact patch width on the ground (visible when deflected)
  const contactHalfWidth = deflection > 0.5
    ? Math.sqrt(Math.max(0, radius * radius - (radius - deflection) * (radius - deflection)))
    : 0

  return (
    <group position={position} rotation={[-casterRad, toeRad, camberRad]}>
      <Line points={innerRing} color={WHEEL_COLOR} lineWidth={1.5} />
      <Line points={outerRing} color={WHEEL_COLOR} lineWidth={1.5} />
      {longiLines.map((pts, i) => (
        <Line key={i} points={pts} color={WHEEL_COLOR} lineWidth={0.5} />
      ))}
      {/* Flat contact patch line at ground level */}
      {contactHalfWidth > 0 && (
        <>
          <Line
            points={[[-halfW, groundLine, -contactHalfWidth], [-halfW, groundLine, contactHalfWidth]]}
            color={YELLOW}
            lineWidth={2}
          />
          <Line
            points={[[halfW, groundLine, -contactHalfWidth], [halfW, groundLine, contactHalfWidth]]}
            color={YELLOW}
            lineWidth={2}
          />
        </>
      )}
      {/* Hub dot */}
      <mesh>
        <sphereGeometry args={[1.5, 6, 6]} />
        <meshBasicMaterial color={WHEEL_COLOR} />
      </mesh>
    </group>
  )
}

function ContactPatchShadow({ position, width, length }: { position: [number, number, number]; width: number; length: number }) {
  const hw = width / 2
  const hl = length / 2
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={[hw * 2, hl * 2]} />
      <meshBasicMaterial color="#00FFE0" transparent opacity={0.12} />
    </mesh>
  )
}

function SpringCoil({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = []
    const coils = 7
    const amplitude = 4
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const dz = end[2] - start[2]
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

    // Build coil in local space along Y, then project
    for (let i = 0; i <= coils * 4; i++) {
      const t = i / (coils * 4)
      const x = start[0] + dx * t + Math.sin(i * Math.PI / 2) * amplitude * (Math.abs(dx) < len ? 1 : 0)
      const y = start[1] + dy * t
      const z = start[2] + dz * t + Math.sin(i * Math.PI / 2) * amplitude * (Math.abs(dz) < len ? 1 : 0)
      pts.push([x, y, z])
    }
    return pts
  }, [start, end])

  return <Line points={points} color={YELLOW} lineWidth={1} />
}

/**
 * Apply the same pitch-then-roll rotation used by the Chassis <group> transforms.
 * Rotation centre is at world origin, matching Three.js nested group behaviour.
 */
function rotateWithChassis(
  x: number, y: number, z: number,
  rollRad: number, pitchRad: number,
): [number, number, number] {
  // Pitch around X-axis (inner rotation in Chassis)
  const cp = Math.cos(pitchRad), sp = Math.sin(pitchRad)
  const y1 = y * cp - z * sp
  const z1 = y * sp + z * cp
  // Roll around Z-axis (outer rotation in Chassis)
  const cr = Math.cos(rollRad), sr = Math.sin(rollRad)
  const x2 = x * cr - y1 * sr
  const y2 = x * sr + y1 * cr
  return [x2, y2, z1]
}

function CornerAssembly({ corner, side }: { corner: Corner; side: 'left' | 'right' }) {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const isFront = corner === 'FL' || corner === 'FR'
  const geo = useVehicleStore((s) => isFront ? s.frontGeometry : s.rearGeometry)
  const rack = useVehicleStore((s) => isFront ? s.frontSteeringRack : s.rearSteeringRack)
  const shock = useVehicleStore((s) => isFront ? s.frontShock : s.rearShock)
  const cornerState = useSimulationStore((s) => s.corners[corner])
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  const isLeft = side === 'left'
  const sideSign = isLeft ? -1 : 1

  // Positions in mm, Three.js coordinate system: X = lateral, Y = up, Z = longitudinal
  const frontWeightFrac = vehicle.weightDistribution / 100
  const longitudinalOffset = isFront
    ? vehicle.wheelbase * (1 - frontWeightFrac)
    : -vehicle.wheelbase * frontWeightFrac

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180

  // Helper: rotate a chassis-local point into world space
  const rot = (x: number, y: number, z: number): [number, number, number] =>
    rotateWithChassis(x, y, z, rollRad, pitchRad)

  const tyreRadius = vehicle.tyreRadius

  // ── Derived lengths & angles ──
  const { lowerLen: lowerWishboneLength, upperLen: upperArmLength } = armLengths(geo)

  // Derive inner pivot heights from user-facing params
  const { innerPivotHeightLower, innerPivotHeightUpper } =
    deriveInnerPivotHeights(geo, vehicle.rideHeight, tyreRadius)

  // ── Dynamic ball joint positions from 3D solver ──
  // The solver now receives the chassis height offset and produces
  // world-space ball joint positions directly.
  const lowerBJ = cornerState.lowerBJPosition
  const upperBJ = cornerState.upperBJPosition

  // Convert to Three.js world coordinates
  const outerLowerX = sideSign * lowerBJ.lateral
  const outerLowerY = lowerBJ.vertical
  const outerLowerZ = longitudinalOffset + lowerBJ.longitudinal
  const outerUpperX = sideSign * upperBJ.lateral
  const outerUpperY = upperBJ.vertical
  const outerUpperZ = longitudinalOffset + upperBJ.longitudinal

  // Dynamic camber and steering
  const camber = cornerState.camberAngle
  const steerAngle = cornerState.steeringAngle

  // ── Chassis-attached points (defined in unrotated chassis space, then rotated) ──

  // Inner pivot positions on the chassis
  const kingpinHalfTrack = geo.trackWidth / 2 - (geo.hubOffset ?? 0)
  const innerPivotXLocal = sideSign * (kingpinHalfTrack - lowerWishboneLength)
  const innerLowerYLocal = vehicle.rideHeight + chassisHeave + innerPivotHeightLower
  const innerUpperYLocal = vehicle.rideHeight + chassisHeave + innerPivotHeightUpper

  // Anti-dive/anti-squat: fore/aft inner pivots at different heights (§3.1, §4.4)
  const sideViewAngleDeg = geo.antiDive || geo.antiSquat || 0
  const sideViewAngleRad = (sideViewAngleDeg * Math.PI) / 180
  const lowerHalfSpread = geo.innerPivotSpread / 2
  const lowerHeightDiffHalf = lowerHalfSpread * Math.tan(sideViewAngleRad)

  const innerPivotLowerFore = rot(innerPivotXLocal, innerLowerYLocal + lowerHeightDiffHalf, longitudinalOffset + lowerHalfSpread)
  const innerPivotLowerAft = rot(innerPivotXLocal, innerLowerYLocal - lowerHeightDiffHalf, longitudinalOffset - lowerHalfSpread)

  // Upper arm A-shape — separate pivot spread (§3.1)
  const upperHalfSpread = (geo.upperInnerPivotSpread ?? geo.innerPivotSpread) / 2
  const upperHeightDiffHalf = upperHalfSpread * Math.tan(sideViewAngleRad)

  const innerUpperXLocal = sideSign * (kingpinHalfTrack - upperArmLength)
  const innerPivotUpperFore = rot(innerUpperXLocal, innerUpperYLocal + upperHeightDiffHalf, longitudinalOffset + upperHalfSpread)
  const innerPivotUpperAft = rot(innerUpperXLocal, innerUpperYLocal - upperHeightDiffHalf, longitudinalOffset - upperHalfSpread)

  // ── Outer (kingpin-end) width for wishbone trapezoid shape ──
  // Bushing connection stays horizontal — fore/aft offset from BJ at same height
  const outerWidthRatio = geo.wishboneOuterWidthRatio ?? 0.35
  const lowerOuterHalfWidth = (geo.innerPivotSpread * outerWidthRatio) / 2
  const upperOuterHalfWidth = ((geo.upperInnerPivotSpread ?? geo.innerPivotSpread) * outerWidthRatio) / 2

  // Lower outer fore/aft — horizontal bushing at ball joint height
  const outerLowerFore: [number, number, number] = [outerLowerX, outerLowerY, outerLowerZ + lowerOuterHalfWidth]
  const outerLowerAft: [number, number, number] = [outerLowerX, outerLowerY, outerLowerZ - lowerOuterHalfWidth]

  // Upper outer fore/aft — horizontal bushing at ball joint height
  const outerUpperFore: [number, number, number] = [outerUpperX, outerUpperY, outerUpperZ + upperOuterHalfWidth]
  const outerUpperAft: [number, number, number] = [outerUpperX, outerUpperY, outerUpperZ - upperOuterHalfWidth]

  // Shock tower — derived from static lower mount position + shock vector
  const lowerArmAngleRad = (geo.lowerArmAngle * Math.PI) / 180
  const shockAngleRad = (shock.shockAngle * Math.PI) / 180
  const staticLowerMountXLocal = innerPivotXLocal +
    sideSign * lowerWishboneLength * Math.cos(lowerArmAngleRad) * shock.damperAttachmentRatio
  const staticLowerMountYLocal = innerPivotHeightLower +
    lowerWishboneLength * Math.sin(lowerArmAngleRad) * shock.damperAttachmentRatio
  const shockTowerXLocal = staticLowerMountXLocal - sideSign * shock.shockLength * Math.sin(shockAngleRad)
  const shockTowerYLocal = vehicle.rideHeight + chassisHeave + staticLowerMountYLocal + shock.shockLength * Math.cos(shockAngleRad)
  const shockTower = rot(shockTowerXLocal, shockTowerYLocal, longitudinalOffset)

  // ── Kingpin axis — derived from actual BJ positions ──
  const kingpinDirX = outerUpperX - outerLowerX
  const kingpinDirY = outerUpperY - outerLowerY
  const kingpinDirZ = outerUpperZ - outerLowerZ
  const kingpinLen = Math.sqrt(kingpinDirX * kingpinDirX + kingpinDirY * kingpinDirY + kingpinDirZ * kingpinDirZ)
  // Normalized kingpin axis (from lower to upper BJ)
  const kpNx = kingpinLen > 1e-6 ? kingpinDirX / kingpinLen : 0
  const kpNy = kingpinLen > 1e-6 ? kingpinDirY / kingpinLen : 1
  const kpNz = kingpinLen > 1e-6 ? kingpinDirZ / kingpinLen : 0

  // ── Stub axle direction — perpendicular to kingpin axis, pointing outboard ──
  // Project the outboard lateral direction onto the plane perpendicular to the
  // kingpin axis. This gives the physically correct stub direction that lies in
  // the upright plane (containing kingpin and hub).
  //   stub = lateral - (lateral · kingpin) * kingpin
  const dotLK = sideSign * kpNx
  let stubDirX = sideSign - dotLK * kpNx  // sideSign * (1 - kpNx²)
  let stubDirY = -dotLK * kpNy             // -sideSign * kpNx * kpNy
  let stubDirZ = -dotLK * kpNz             // -sideSign * kpNx * kpNz
  let stubLen = Math.sqrt(stubDirX * stubDirX + stubDirY * stubDirY + stubDirZ * stubDirZ)
  if (stubLen < 1e-6) {
    // Degenerate: kingpin is horizontal pointing outboard — fall back
    stubDirX = 0; stubDirY = 1; stubDirZ = 0; stubLen = 1
  }
  stubDirX /= stubLen; stubDirY /= stubLen; stubDirZ /= stubLen

  // ── Rotate stub axle around kingpin axis by steering angle (Rodrigues' formula) ──
  const steerRad = (steerAngle * Math.PI) / 180
  if (Math.abs(steerRad) > 1e-6) {
    const cosS = Math.cos(steerRad)
    const sinS = Math.sin(steerRad)
    const dotKS = kpNx * stubDirX + kpNy * stubDirY + kpNz * stubDirZ
    // v_rot = v*cos(θ) + (k×v)*sin(θ) + k*(k·v)*(1-cos(θ))
    const crossX = kpNy * stubDirZ - kpNz * stubDirY
    const crossY = kpNz * stubDirX - kpNx * stubDirZ
    const crossZ = kpNx * stubDirY - kpNy * stubDirX
    stubDirX = stubDirX * cosS + crossX * sinS + kpNx * dotKS * (1 - cosS)
    stubDirY = stubDirY * cosS + crossY * sinS + kpNy * dotKS * (1 - cosS)
    stubDirZ = stubDirZ * cosS + crossZ * sinS + kpNz * dotKS * (1 - cosS)
  }

  const hubOffset = geo.hubOffset ?? 0

  // Shock lower mount — between the two lower A-arm legs at damperAttachmentRatio
  // Interpolate along fore arm and aft arm separately, then take midpoint
  const frac = shock.damperAttachmentRatio
  const shockForePt: [number, number, number] = [
    innerPivotLowerFore[0] + (outerLowerFore[0] - innerPivotLowerFore[0]) * frac,
    innerPivotLowerFore[1] + (outerLowerFore[1] - innerPivotLowerFore[1]) * frac,
    innerPivotLowerFore[2] + (outerLowerFore[2] - innerPivotLowerFore[2]) * frac,
  ]
  const shockAftPt: [number, number, number] = [
    innerPivotLowerAft[0] + (outerLowerAft[0] - innerPivotLowerAft[0]) * frac,
    innerPivotLowerAft[1] + (outerLowerAft[1] - innerPivotLowerAft[1]) * frac,
    innerPivotLowerAft[2] + (outerLowerAft[2] - innerPivotLowerAft[2]) * frac,
  ]
  const shockLowerX = (shockForePt[0] + shockAftPt[0]) / 2
  const shockLowerY = (shockForePt[1] + shockAftPt[1]) / 2
  const shockLowerZ = (shockForePt[2] + shockAftPt[2]) / 2

  // Kingpin midpoint (centre of upright)
  const kingpinMidX = (outerLowerX + outerUpperX) / 2
  const kingpinMidY = (outerLowerY + outerUpperY) / 2
  const kingpinMidZ = (outerLowerZ + outerUpperZ) / 2

  // ── Wheel hub position — stub axle tip (steered) ──
  const wheelXActual = kingpinMidX + stubDirX * hubOffset
  const wheelYActual = kingpinMidY + stubDirY * hubOffset
  const wheelZActual = kingpinMidZ + stubDirZ * hubOffset

  // ── Wheel Euler angles ──
  // Camber and steering come from the kinematics solver (full 3D, accounts for
  // KPI, caster-induced camber, bump steer, etc.).
  // The caster pitch (side-view tilt of the wheel) is extracted from the steered
  // stub direction — this is the small residual tilt perpendicular to the lateral axis.
  const wheelCasterTiltDeg = Math.atan2(
    stubDirZ, Math.sqrt(stubDirX * stubDirX + stubDirY * stubDirY)
  ) * (180 / Math.PI)

  // ── Ground height from physics state ──
  // When in contact: groundHeight = wheelPosition - tyreRadius + tyreDeflection
  // When airborne: fall back to 0
  const groundHeight = cornerState.wheelAirborne
    ? 0
    : cornerState.wheelPosition - tyreRadius + cornerState.tyreDeflection

  // ── Kingpin axis ground intercept (§3.3) ──
  // Extend the line from lower BJ through upper BJ to Y=groundHeight
  let kingpinGroundX = outerLowerX
  let kingpinGroundZ = outerLowerZ
  if (Math.abs(kingpinDirY) > 1e-6) {
    const tGround = (groundHeight - outerLowerY) / kingpinDirY
    kingpinGroundX = outerLowerX + tGround * kingpinDirX
    kingpinGroundZ = outerLowerZ + tGround * kingpinDirZ
  }

  // ── Contact patch with camber shift (§3.8) ──
  // Contact patch shifts laterally by R_loaded × sin(camber)
  const camberRad = (camber * Math.PI) / 180
  const contactPatchShift = tyreRadius * Math.sin(camberRad) * sideSign
  const contactPatchX = wheelXActual + contactPatchShift
  const contactPatchZ = wheelZActual

  // ── Steering arm (§3.2, §3.11) ──
  const ackermannRestAngle = Math.atan2(kingpinHalfTrack, vehicle.wheelbase)
  const armAngle = ackermannRestAngle + steerRad
  // A_ST origin is on the upright at lower ball joint height (per typical double-wishbone)
  const steeringArmBaseX = outerLowerX
  const steeringArmBaseY = outerLowerY
  const steeringArmBaseZ = outerLowerZ
  const ackermannArmLength = computeAckermannArmLength(geo, rack, vehicle.wheelbase)
  const armTipX = steeringArmBaseX - sideSign * ackermannArmLength * Math.cos(armAngle)
  const armTipZ = steeringArmBaseZ - ackermannArmLength * Math.sin(armAngle)
  const armTipY = steeringArmBaseY

  return (
    <group>
      {/* Tyre — positioned at stub axle tip (hub), oriented from solver + stub */}
      <WheelTyre
        position={[wheelXActual, wheelYActual, wheelZActual]}
        radius={tyreRadius}
        width={vehicle.tyreWidth}
        camber={-camber * sideSign}
        toe={(geo.staticToe + steerAngle) * sideSign}
        caster={wheelCasterTiltDeg}
        deflection={cornerState.tyreDeflection}
      />

      {/* Contact patch shadow on ground — shifted by camber (§3.8) */}
      {!cornerState.wheelAirborne && (
        <ContactPatchShadow
          position={[contactPatchX, groundHeight + 0.1, contactPatchZ]}
          width={vehicle.tyreWidth}
          length={tyreRadius * 0.4}
        />
      )}

      {/* Airborne indicator */}
      {cornerState.wheelAirborne && (
        <mesh position={[wheelXActual, wheelYActual + tyreRadius + 8, wheelZActual]}>
          <ringGeometry args={[3, 5, 16]} />
          <meshBasicMaterial color={ORANGE} side={2} />
        </mesh>
      )}

      {/* Lower wishbone - trapezoid (§3.1) */}
      {/* Fore arm: inner fore → outer fore */}
      <Line points={[innerPivotLowerFore, outerLowerFore]} color={CYAN} lineWidth={2} />
      {/* Aft arm: inner aft → outer aft */}
      <Line points={[innerPivotLowerAft, outerLowerAft]} color={CYAN} lineWidth={2} />
      {/* Inner crossmember: inner fore → inner aft */}
      <Line points={[innerPivotLowerFore, innerPivotLowerAft]} color={CYAN} lineWidth={1.5} />
      {/* Outer bushing: outer fore → outer aft (horizontal) */}
      <Line points={[outerLowerFore, outerLowerAft]} color={CYAN} lineWidth={2} />

      {/* Upper wishbone - trapezoid (§3.1) */}
      {/* Fore arm: inner fore → outer fore */}
      <Line points={[innerPivotUpperFore, outerUpperFore]} color={LIGHT_CYAN} lineWidth={1.5} />
      {/* Aft arm: inner aft → outer aft */}
      <Line points={[innerPivotUpperAft, outerUpperAft]} color={LIGHT_CYAN} lineWidth={1.5} />
      {/* Inner crossmember: inner fore → inner aft */}
      <Line points={[innerPivotUpperFore, innerPivotUpperAft]} color={LIGHT_CYAN} lineWidth={1} />
      {/* Outer bushing: outer fore → outer aft (horizontal) */}
      <Line points={[outerUpperFore, outerUpperAft]} color={LIGHT_CYAN} lineWidth={1.5} />

      {/* Hub carrier / upright — connects upper and lower ball joints (§3.2) */}
      <Line
        points={[
          [outerLowerX, outerLowerY, outerLowerZ],
          [outerUpperX, outerUpperY, outerUpperZ],
        ]}
        color={WHITE}
        lineWidth={1.5}
      />

      {/* Kingpin axis — extended to ground plane and above upright (§3.3) */}
      <Line
        points={[
          [kingpinGroundX, groundHeight, kingpinGroundZ],
          [outerUpperX + (outerUpperX - outerLowerX) * 0.3,
           outerUpperY + (outerUpperY - outerLowerY) * 0.3,
           outerUpperZ + (outerUpperZ - outerLowerZ) * 0.3],
        ]}
        color={WHITE}
        lineWidth={0.5}
        dashed
        dashSize={3}
        gapSize={3}
      />

      {/* Kingpin ground intercept marker — shows scrub radius (§3.3) */}
      <JointSphere position={[kingpinGroundX, groundHeight + 0.5, kingpinGroundZ]} color="#FF4444" size={1} />

      {/* Axle stub — perpendicular to upright face (§3.4) */}
      <Line
        points={[
          [kingpinMidX, kingpinMidY, kingpinMidZ],
          [wheelXActual, wheelYActual, wheelZActual],
        ]}
        color={WHITE}
        lineWidth={1.5}
      />
      <JointSphere position={[kingpinMidX, kingpinMidY, kingpinMidZ]} color={WHITE} size={1.5} />

      {/* Shock absorber body */}
      <Line
        points={[
          [shockLowerX, shockLowerY, shockLowerZ],
          shockTower,
        ]}
        color={ORANGE}
        lineWidth={2}
      />

      {/* Spring coil */}
      <SpringCoil
        start={[shockLowerX, shockLowerY, shockLowerZ]}
        end={[
          shockLowerX + (shockTower[0] - shockLowerX) * 0.6,
          shockLowerY + (shockTower[1] - shockLowerY) * 0.6,
          shockLowerZ + (shockTower[2] - shockLowerZ) * 0.6,
        ]}
      />

      {/* Shock mount crossmember between lower arms */}
      <Line points={[shockForePt, shockAftPt]} color={ORANGE} lineWidth={1} />

      {/* Joint spheres — inner pivots */}
      <JointSphere position={innerPivotLowerFore} />
      <JointSphere position={innerPivotLowerAft} />
      <JointSphere position={innerPivotUpperFore} color={LIGHT_CYAN} />
      <JointSphere position={innerPivotUpperAft} color={LIGHT_CYAN} />
      {/* Ball joints at bushing midpoints */}
      <JointSphere position={[outerLowerX, outerLowerY, outerLowerZ]} />
      <JointSphere position={[outerUpperX, outerUpperY, outerUpperZ]} color={LIGHT_CYAN} />

      {/* Steering arm — integral to upright, extends to A_ST (tie rod outer end) (§3.2, §3.11) */}
      <Line
        points={[
          [steeringArmBaseX, steeringArmBaseY, steeringArmBaseZ],
          [armTipX, armTipY, armTipZ],
        ]}
        color={GREEN}
        lineWidth={1.5}
      />
      <JointSphere position={[armTipX, armTipY, armTipZ]} color={GREEN} size={1.5} />
    </group>
  )
}

function Chassis() {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const frontGeo = useVehicleStore((s) => s.frontGeometry)
  const rearGeo = useVehicleStore((s) => s.rearGeometry)
  const frontShock = useVehicleStore((s) => s.frontShock)
  const rearShock = useVehicleStore((s) => s.rearShock)
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const frontZ = vehicle.wheelbase * (1 - frontWeightFrac)
  const rearZ = -vehicle.wheelbase * frontWeightFrac
  const chassisY = vehicle.rideHeight + chassisHeave
  const plateThickness = 3 // mm — thin plate like real RC chassis

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180

  // Derive inner pivot positions for each axle to size the chassis correctly
  const frontPivots = deriveInnerPivotHeights(frontGeo, vehicle.rideHeight, vehicle.tyreRadius)
  const rearPivots = deriveInnerPivotHeights(rearGeo, vehicle.rideHeight, vehicle.tyreRadius)

  // Arm lengths for computing lateral positions
  const { lowerLen: fLowerLen, upperLen: fUpperLen } = armLengths(frontGeo)
  const { lowerLen: rLowerLen, upperLen: rUpperLen } = armLengths(rearGeo)

  // Inner pivot lateral positions (distance from centreline)
  // Arms span from kingpin (trackWidth/2 - hubOffset) inward
  const fKingpinHT = frontGeo.trackWidth / 2 - (frontGeo.hubOffset ?? 0)
  const rKingpinHT = rearGeo.trackWidth / 2 - (rearGeo.hubOffset ?? 0)
  const fLowerX = fKingpinHT - fLowerLen * Math.cos(frontGeo.lowerArmAngle * Math.PI / 180)
  const fUpperX = fKingpinHT - fUpperLen * Math.cos(frontGeo.upperArmAngle * Math.PI / 180)
  const rLowerX = rKingpinHT - rLowerLen * Math.cos(rearGeo.lowerArmAngle * Math.PI / 180)
  const rUpperX = rKingpinHT - rUpperLen * Math.cos(rearGeo.upperArmAngle * Math.PI / 180)

  // Bulkhead half-widths = widest inner pivot at each axle
  const fBulkheadHW = Math.max(fLowerX, fUpperX)
  const rBulkheadHW = Math.max(rLowerX, rUpperX)

  // Main plate width narrows slightly between bulkheads
  const plateHWFront = fBulkheadHW
  const plateHWRear = rBulkheadHW

  // Plate vertical position
  const plateTop = chassisY + plateThickness / 2
  const plateBot = chassisY - plateThickness / 2

  // Bulkhead heights (from lower to upper pivot)
  const fBulkBot = chassisY + frontPivots.innerPivotHeightLower - 2
  const fBulkTop = chassisY + frontPivots.innerPivotHeightUpper + 2
  const rBulkBot = chassisY + rearPivots.innerPivotHeightLower - 2
  const rBulkTop = chassisY + rearPivots.innerPivotHeightUpper + 2

  // Shock tower top positions (derived from shock geometry)
  const fShockAngleRad = frontShock.shockAngle * Math.PI / 180
  const rShockAngleRad = rearShock.shockAngle * Math.PI / 180
  // Shock towers rise above the bulkhead — approximate top mount position
  const fTowerTopY = chassisY + frontPivots.innerPivotHeightLower +
    fLowerLen * Math.sin(frontGeo.lowerArmAngle * Math.PI / 180) * frontShock.damperAttachmentRatio +
    frontShock.shockLength * Math.cos(fShockAngleRad)
  const rTowerTopY = chassisY + rearPivots.innerPivotHeightLower +
    rLowerLen * Math.sin(rearGeo.lowerArmAngle * Math.PI / 180) * rearShock.damperAttachmentRatio +
    rearShock.shockLength * Math.cos(rShockAngleRad)
  // Shock tower lateral inset from bulkhead edge
  const fTowerX = frontShock.shockLength * Math.sin(fShockAngleRad)
  const rTowerX = rearShock.shockLength * Math.sin(rShockAngleRad)
  const fTowerHW = Math.max(fBulkheadHW - fTowerX, 8)
  const rTowerHW = Math.max(rBulkheadHW - rTowerX, 8)

  return (
    <group rotation={[0, 0, rollRad]}>
      <group rotation={[pitchRad, 0, 0]}>
        {/* ── Main chassis plate ── */}
        {/* Top surface */}
        <Line
          points={[
            [-plateHWFront, plateTop, frontZ],
            [plateHWFront, plateTop, frontZ],
            [plateHWRear, plateTop, rearZ],
            [-plateHWRear, plateTop, rearZ],
            [-plateHWFront, plateTop, frontZ],
          ]}
          color={GREY}
          lineWidth={1}
        />
        {/* Bottom surface */}
        <Line
          points={[
            [-plateHWFront, plateBot, frontZ],
            [plateHWFront, plateBot, frontZ],
            [plateHWRear, plateBot, rearZ],
            [-plateHWRear, plateBot, rearZ],
            [-plateHWFront, plateBot, frontZ],
          ]}
          color={GREY}
          lineWidth={1}
        />
        {/* Side rails connecting top and bottom at plate edges */}
        <Line points={[[-plateHWFront, plateBot, frontZ], [-plateHWFront, plateTop, frontZ]]} color={GREY} lineWidth={1} />
        <Line points={[[plateHWFront, plateBot, frontZ], [plateHWFront, plateTop, frontZ]]} color={GREY} lineWidth={1} />
        <Line points={[[-plateHWRear, plateBot, rearZ], [-plateHWRear, plateTop, rearZ]]} color={GREY} lineWidth={1} />
        <Line points={[[plateHWRear, plateBot, rearZ], [plateHWRear, plateTop, rearZ]]} color={GREY} lineWidth={1} />
        {/* Longitudinal side rails */}
        <Line points={[[-plateHWFront, plateTop, frontZ], [-plateHWRear, plateTop, rearZ]]} color={GREY} lineWidth={1} />
        <Line points={[[plateHWFront, plateTop, frontZ], [plateHWRear, plateTop, rearZ]]} color={GREY} lineWidth={1} />
        <Line points={[[-plateHWFront, plateBot, frontZ], [-plateHWRear, plateBot, rearZ]]} color={GREY} lineWidth={1} />
        <Line points={[[plateHWFront, plateBot, frontZ], [plateHWRear, plateBot, rearZ]]} color={GREY} lineWidth={1} />

        {/* ── Front bulkhead ── */}
        <Line
          points={[
            [-fBulkheadHW, fBulkBot, frontZ],
            [fBulkheadHW, fBulkBot, frontZ],
            [fBulkheadHW, fBulkTop, frontZ],
            [-fBulkheadHW, fBulkTop, frontZ],
            [-fBulkheadHW, fBulkBot, frontZ],
          ]}
          color={GREY}
          lineWidth={1.5}
        />
        {/* Hinge pin lines at lower pivot height */}
        <Line
          points={[
            [-fBulkheadHW - 2, chassisY + frontPivots.innerPivotHeightLower, frontZ],
            [fBulkheadHW + 2, chassisY + frontPivots.innerPivotHeightLower, frontZ],
          ]}
          color={GREY}
          lineWidth={1}
          dashed dashSize={2} gapSize={2}
        />
        {/* Hinge pin lines at upper pivot height */}
        <Line
          points={[
            [-fBulkheadHW - 2, chassisY + frontPivots.innerPivotHeightUpper, frontZ],
            [fBulkheadHW + 2, chassisY + frontPivots.innerPivotHeightUpper, frontZ],
          ]}
          color={GREY}
          lineWidth={1}
          dashed dashSize={2} gapSize={2}
        />

        {/* ── Rear bulkhead ── */}
        <Line
          points={[
            [-rBulkheadHW, rBulkBot, rearZ],
            [rBulkheadHW, rBulkBot, rearZ],
            [rBulkheadHW, rBulkTop, rearZ],
            [-rBulkheadHW, rBulkTop, rearZ],
            [-rBulkheadHW, rBulkBot, rearZ],
          ]}
          color={GREY}
          lineWidth={1.5}
        />
        {/* Hinge pin lines at lower pivot height */}
        <Line
          points={[
            [-rBulkheadHW - 2, chassisY + rearPivots.innerPivotHeightLower, rearZ],
            [rBulkheadHW + 2, chassisY + rearPivots.innerPivotHeightLower, rearZ],
          ]}
          color={GREY}
          lineWidth={1}
          dashed dashSize={2} gapSize={2}
        />
        {/* Hinge pin lines at upper pivot height */}
        <Line
          points={[
            [-rBulkheadHW - 2, chassisY + rearPivots.innerPivotHeightUpper, rearZ],
            [rBulkheadHW + 2, chassisY + rearPivots.innerPivotHeightUpper, rearZ],
          ]}
          color={GREY}
          lineWidth={1}
          dashed dashSize={2} gapSize={2}
        />

        {/* ── Front shock towers ── */}
        {/* Left tower */}
        <Line
          points={[
            [-fBulkheadHW, fBulkTop, frontZ],
            [-fTowerHW, fTowerTopY, frontZ],
            [-fBulkheadHW + 4, fBulkTop, frontZ],
          ]}
          color={GREY}
          lineWidth={1.5}
        />
        {/* Right tower */}
        <Line
          points={[
            [fBulkheadHW, fBulkTop, frontZ],
            [fTowerHW, fTowerTopY, frontZ],
            [fBulkheadHW - 4, fBulkTop, frontZ],
          ]}
          color={GREY}
          lineWidth={1.5}
        />
        {/* Tower mount spheres */}
        <JointSphere position={[-fTowerHW, fTowerTopY, frontZ]} color={GREY} size={1.5} />
        <JointSphere position={[fTowerHW, fTowerTopY, frontZ]} color={GREY} size={1.5} />

        {/* ── Rear shock towers ── */}
        {/* Left tower */}
        <Line
          points={[
            [-rBulkheadHW, rBulkTop, rearZ],
            [-rTowerHW, rTowerTopY, rearZ],
            [-rBulkheadHW + 4, rBulkTop, rearZ],
          ]}
          color={GREY}
          lineWidth={1.5}
        />
        {/* Right tower */}
        <Line
          points={[
            [rBulkheadHW, rBulkTop, rearZ],
            [rTowerHW, rTowerTopY, rearZ],
            [rBulkheadHW - 4, rBulkTop, rearZ],
          ]}
          color={GREY}
          lineWidth={1.5}
        />
        {/* Tower mount spheres */}
        <JointSphere position={[-rTowerHW, rTowerTopY, rearZ]} color={GREY} size={1.5} />
        <JointSphere position={[rTowerHW, rTowerTopY, rearZ]} color={GREY} size={1.5} />

        {/* ── Centreline ── */}
        <Line
          points={[[0, plateTop + 1, frontZ + 10], [0, plateTop + 1, rearZ - 10]]}
          color={GREY}
          lineWidth={0.5}
          dashed
          dashSize={5}
          gapSize={5}
        />

        {/* CG marker */}
        <JointSphere position={[0, vehicle.cgHeight + chassisHeave, 0]} color="#FF0000" size={3} />
      </group>
    </group>
  )
}

function AntiRollBarVisual({ axle }: { axle: 'front' | 'rear' }) {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const geo = useVehicleStore((s) => axle === 'front' ? s.frontGeometry : s.rearGeometry)
  const swayBar = useVehicleStore((s) => axle === 'front' ? s.frontSwayBar : s.rearSwayBar)
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  if (!swayBar.enabled) return null

  const { innerPivotHeightLower } = deriveInnerPivotHeights(geo, vehicle.rideHeight, vehicle.tyreRadius)

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180
  const rot = (x: number, y: number, z: number): [number, number, number] =>
    rotateWithChassis(x, y, z, rollRad, pitchRad)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const z = axle === 'front'
    ? vehicle.wheelbase * (1 - frontWeightFrac)
    : -vehicle.wheelbase * frontWeightFrac
  const y = vehicle.rideHeight + chassisHeave + innerPivotHeightLower + 5
  const halfWidth = swayBar.armLength

  const pL = rot(-halfWidth, y, z)
  const pC = rot(0, y + 3, z)
  const pR = rot(halfWidth, y, z)
  const pLdrop = rot(-halfWidth, y - 8, z)
  const pRdrop = rot(halfWidth, y - 8, z)

  return (
    <group>
      <Line points={[pL, pC, pR]} color={MAGENTA} lineWidth={1.5} />
      {/* Drop links */}
      <Line points={[pL, pLdrop]} color={MAGENTA} lineWidth={1} />
      <Line points={[pR, pRdrop]} color={MAGENTA} lineWidth={1} />
    </group>
  )
}

function SteeringLinkage({ axle }: { axle: 'front' | 'rear' }) {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const geo = useVehicleStore((s) => axle === 'front' ? s.frontGeometry : s.rearGeometry)
  const rack = useVehicleStore((s) => axle === 'front' ? s.frontSteeringRack : s.rearSteeringRack)
  const leftCorner = useSimulationStore((s) => s.corners[axle === 'front' ? 'FL' : 'RL'])
  const rightCorner = useSimulationStore((s) => s.corners[axle === 'front' ? 'FR' : 'RR'])
  const steeringAngle = useSimulationStore((s) => axle === 'front' ? s.frontSteeringAngle : s.rearSteeringAngle)
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  const kingpinHalfTrack = geo.trackWidth / 2 - (geo.hubOffset ?? 0)

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180
  const rot = (x: number, y: number, z: number): [number, number, number] =>
    rotateWithChassis(x, y, z, rollRad, pitchRad)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const z = axle === 'front'
    ? vehicle.wheelbase * (1 - frontWeightFrac)
    : -vehicle.wheelbase * frontWeightFrac
  const ackermannRestAngle = Math.atan2(kingpinHalfTrack, vehicle.wheelbase)

  // Compute arm tip positions for each side using dynamic BJ positions from state
  const computeArmTip = (cornerState: typeof leftCorner, sideSign: number) => {
    const lowerBJ = cornerState.lowerBJPosition
    const outerLowerX = sideSign * lowerBJ.lateral
    const outerLowerY = lowerBJ.vertical
    const outerLowerZ = z + lowerBJ.longitudinal

    const steerRad = (cornerState.steeringAngle * Math.PI) / 180
    const armAngle = ackermannRestAngle + steerRad
    const armLen = computeAckermannArmLength(geo, rack, vehicle.wheelbase)
    const tipX = outerLowerX - sideSign * armLen * Math.cos(armAngle)
    const tipZ = outerLowerZ - armLen * Math.sin(armAngle)
    return [tipX, outerLowerY, tipZ] as [number, number, number]
  }

  const leftTip = computeArmTip(leftCorner, -1)
  const rightTip = computeArmTip(rightCorner, 1)

  // Steering rack — translates laterally with steering input
  // Rack displacement from commanded angle (same formula as kinematics solver)
  const cmdRad = (steeringAngle * Math.PI) / 180
  const ackermannArmLength = computeAckermannArmLength(geo, rack, vehicle.wheelbase)
  const rackDisplacement = ackermannArmLength * Math.sin(cmdRad)
  const halfRackWidth = rack.rackWidth / 2
  const rackY = chassisHeave + rack.rackHeight
  const rackZ = z + rack.rackForwardOffset

  // Rack housing endpoints (chassis-fixed, displaced by steering)
  const rackLeftX = -(halfRackWidth - rackDisplacement)
  const rackRightX = halfRackWidth + rackDisplacement

  // The full rack bar extends beyond the inner tie rod ends for visual clarity
  const rackExtend = 5 // mm visual extension
  const rackBarLeft = rot(rackLeftX - rackExtend, rackY, rackZ)
  const rackBarRight = rot(rackRightX + rackExtend, rackY, rackZ)

  // Tie rod inner ball joint positions (on the rack, displaced)
  const tieInnerLeft = rot(rackLeftX, rackY, rackZ)
  const tieInnerRight = rot(rackRightX, rackY, rackZ)

  // Rack housing mount points (chassis-fixed, do not move with rack displacement)
  const mountLeft = rot(-halfRackWidth - rackExtend, rackY, rackZ)
  const mountRight = rot(halfRackWidth + rackExtend, rackY, rackZ)

  return (
    <group>
      {/* Rack housing (chassis-fixed) — shown as dashed grey line */}
      <Line points={[mountLeft, mountRight]} color={GREY} lineWidth={1} dashed dashSize={2} gapSize={2} />
      {/* Rack bar (moves laterally with steering) */}
      <Line points={[rackBarLeft, rackBarRight]} color={GREEN} lineWidth={2.5} />
      {/* Tie rod inner ball joints on the rack */}
      <JointSphere position={tieInnerLeft} color={GREEN} size={1.5} />
      <JointSphere position={tieInnerRight} color={GREEN} size={1.5} />
      {/* Tie rods from rack inner ends to steering arm tips */}
      <Line points={[tieInnerLeft, leftTip]} color={GREEN} lineWidth={1} />
      <Line points={[tieInnerRight, rightTip]} color={GREEN} lineWidth={1} />
    </group>
  )
}

export function SuspensionAssembly() {
  const pv = useSimulationStore((s) => s.partVisibility)

  return (
    <group>
      {pv.chassis && <Chassis />}
      {pv.FL && <CornerAssembly corner="FL" side="left" />}
      {pv.FR && <CornerAssembly corner="FR" side="right" />}
      {pv.RL && <CornerAssembly corner="RL" side="left" />}
      {pv.RR && <CornerAssembly corner="RR" side="right" />}
      <AntiRollBarVisual axle="front" />
      <AntiRollBarVisual axle="rear" />
      <SteeringLinkage axle="front" />
      <SteeringLinkage axle="rear" />
    </group>
  )
}
