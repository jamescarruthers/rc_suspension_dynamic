import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { useVehicleStore } from '../../store/useVehicleStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { armLengths, deriveInnerPivotHeights } from '../../engine/kinematics'
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

function WheelTyre({ position, radius, width, camber = 0, toe = 0 }: { position: [number, number, number]; radius: number; width: number; camber: number; toe: number }) {
  const halfW = width / 2
  const segments = 32

  const innerRing = useMemo(() => {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([-halfW, Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    return pts
  }, [radius, halfW])

  const outerRing = useMemo(() => {
    const pts: [number, number, number][] = []
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([halfW, Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    return pts
  }, [radius, halfW])

  // Longitudinal lines connecting inner and outer rings at intervals
  const longiLines = useMemo(() => {
    const lines: [number, number, number][][] = []
    const count = 16
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const y = Math.cos(angle) * radius
      const z = Math.sin(angle) * radius
      lines.push([[-halfW, y, z], [halfW, y, z]])
    }
    return lines
  }, [radius, halfW])

  const camberRad = (camber * Math.PI) / 180
  const toeRad = (toe * Math.PI) / 180

  return (
    <group position={position} rotation={[0, toeRad, camberRad]}>
      <Line points={innerRing} color={WHEEL_COLOR} lineWidth={1.5} />
      <Line points={outerRing} color={WHEEL_COLOR} lineWidth={1.5} />
      {longiLines.map((pts, i) => (
        <Line key={i} points={pts} color={WHEEL_COLOR} lineWidth={0.5} />
      ))}
      {/* Contact patch indicator */}
      <Line
        points={[[-halfW, -radius, 0], [halfW, -radius, 0]]}
        color={WHEEL_COLOR}
        lineWidth={2}
      />
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

  // Wheel position (independent of chassis rotation)
  const wheelY = cornerState.wheelPosition
  const wheelZ = longitudinalOffset

  const tyreRadius = vehicle.tyreRadius

  // ── Derived lengths & angles ──
  const { lowerLen: lowerWishboneLength, upperLen: upperArmLength } = armLengths(geo)

  // Derive inner pivot heights from user-facing params
  const { innerPivotHeightLower, innerPivotHeightUpper } =
    deriveInnerPivotHeights(geo, vehicle.rideHeight, tyreRadius)

  // ── Caster geometry (§3.3) ──
  // Caster angle tilts the kingpin axis rearward in the side (XZ) plane.
  // Upper ball joint is offset rearward, lower forward, relative to axle line.
  const casterRad = (geo.casterAngle * Math.PI) / 180
  const halfUpright = geo.uprightHeight / 2
  const lowerBJLongOffset = halfUpright * Math.sin(casterRad)   // forward offset
  const upperBJLongOffset = -halfUpright * Math.sin(casterRad)  // rearward offset

  // ── Chassis-attached points (defined in unrotated chassis space, then rotated) ──

  // Inner pivot positions on the chassis
  // trackWidth = wheel-centre-to-wheel-centre; arms span from kingpin inward
  const kingpinHalfTrack = geo.trackWidth / 2 - (geo.hubOffset ?? 0)
  const innerPivotXLocal = sideSign * (kingpinHalfTrack - lowerWishboneLength)
  const innerLowerYLocal = chassisHeave + innerPivotHeightLower
  const innerUpperYLocal = chassisHeave + innerPivotHeightUpper

  const innerPivotLowerFore = rot(innerPivotXLocal, innerLowerYLocal, longitudinalOffset + geo.innerPivotSpread / 2)
  const innerPivotLowerAft = rot(innerPivotXLocal, innerLowerYLocal, longitudinalOffset - geo.innerPivotSpread / 2)

  // Upper arm inner pivot
  const innerUpperXLocal = sideSign * (kingpinHalfTrack - upperArmLength)
  const innerPivotUpper = rot(innerUpperXLocal, innerUpperYLocal, longitudinalOffset)

  // Shock tower — derived from static lower mount position + shock vector
  const lowerArmAngleRad = (geo.lowerArmAngle * Math.PI) / 180
  const shockAngleRad = (shock.shockAngle * Math.PI) / 180
  const staticLowerMountXLocal = innerPivotXLocal +
    sideSign * lowerWishboneLength * Math.cos(lowerArmAngleRad) * shock.damperAttachmentRatio
  const staticLowerMountYLocal = innerPivotHeightLower +
    lowerWishboneLength * Math.sin(lowerArmAngleRad) * shock.damperAttachmentRatio
  const shockTowerXLocal = staticLowerMountXLocal - sideSign * shock.shockLength * Math.sin(shockAngleRad)
  const shockTowerYLocal = chassisHeave + staticLowerMountYLocal + shock.shockLength * Math.cos(shockAngleRad)
  const shockTower = rot(shockTowerXLocal, shockTowerYLocal, longitudinalOffset)

  // ── Lower ball joint — lower wishbone takes precedence ──
  const staticLowerOuterY = innerPivotHeightLower + lowerWishboneLength * Math.sin(lowerArmAngleRad)
  const lowerJointOffsetY = staticLowerOuterY - tyreRadius
  const outerLowerY = wheelY + lowerJointOffsetY
  // Lower ball joint longitudinal position offset by caster (§3.3)
  const outerLowerZ = longitudinalOffset + lowerBJLongOffset

  // Lower ball joint lateral (X) from arm length constraint
  const innerMidLowerX = (innerPivotLowerFore[0] + innerPivotLowerAft[0]) / 2
  const innerMidLowerY = (innerPivotLowerFore[1] + innerPivotLowerAft[1]) / 2
  const lowerDY = outerLowerY - innerMidLowerY
  const lowerDXSq = lowerWishboneLength * lowerWishboneLength - lowerDY * lowerDY
  const lowerDX = lowerDXSq > 0 ? Math.sqrt(lowerDXSq) : lowerWishboneLength
  const outerLowerX = innerMidLowerX + sideSign * lowerDX

  // Dynamic camber and steering
  const camber = cornerState.camberAngle
  const steerAngle = cornerState.steeringAngle

  // ── Upper ball joint derived from upright attached to lower ball joint ──
  // Lower wishbone determines lower ball joint, then the upright (rigid link)
  // sets upper ball joint position. Upper arm angle follows.
  const kpiRad = (geo.kpiAngle * Math.PI) / 180
  const camberChangeRad = ((camber - geo.staticCamber) * Math.PI) / 180
  const uprightAngle = kpiRad - camberChangeRad
  const outerUpperX = outerLowerX - sideSign * geo.uprightHeight * Math.sin(uprightAngle)
  const outerUpperY = outerLowerY + geo.uprightHeight * Math.cos(uprightAngle)
  // Upper ball joint longitudinal offset by caster — rearward (§3.3)
  const outerUpperZ = longitudinalOffset + upperBJLongOffset

  // Shock lower mount (on wishbone, interpolated between inner pivot and outer ball joint)
  const frac = shock.damperAttachmentRatio
  const shockLowerX = innerPivotLowerFore[0] + (outerLowerX - innerPivotLowerFore[0]) * frac
  const shockLowerY = innerPivotLowerFore[1] + (outerLowerY - innerPivotLowerFore[1]) * frac
  const shockLowerZ = innerPivotLowerFore[2] + (outerLowerZ - innerPivotLowerFore[2]) * frac

  // Kingpin midpoint (centre of upright)
  const kingpinMidX = (outerLowerX + outerUpperX) / 2
  const kingpinMidY = (outerLowerY + outerUpperY) / 2
  const kingpinMidZ = (outerLowerZ + outerUpperZ) / 2

  // ── Stub axle — perpendicular to upright face (§3.4) ──
  // The stub axle axis is perpendicular to the kingpin axis.
  // In the frontal plane it tilts by the complement of the upright angle,
  // and in the side plane it tilts by caster.
  // Direction: outward from kingpin midpoint to wheel hub
  const stubDirX = sideSign * Math.cos(uprightAngle) * Math.cos(casterRad)
  const stubDirY = Math.sin(uprightAngle)
  const stubDirZ = -sideSign * Math.cos(uprightAngle) * Math.sin(casterRad)
  const hubOffset = geo.hubOffset ?? 0
  const wheelXActual = kingpinMidX + stubDirX * hubOffset
  const wheelYActual = kingpinMidY + stubDirY * hubOffset
  const wheelZActual = kingpinMidZ + stubDirZ * hubOffset

  // ── Kingpin axis ground intercept (§3.3) ──
  // Extend the line from lower BJ through upper BJ to Y=0 (ground plane)
  const kingpinDY = outerUpperY - outerLowerY
  const kingpinDX = outerUpperX - outerLowerX
  const kingpinDZ = outerUpperZ - outerLowerZ
  let kingpinGroundX = outerLowerX
  let kingpinGroundZ = outerLowerZ
  if (Math.abs(kingpinDY) > 1e-6) {
    const tGround = -outerLowerY / kingpinDY
    kingpinGroundX = outerLowerX + tGround * kingpinDX
    kingpinGroundZ = outerLowerZ + tGround * kingpinDZ
  }

  // ── Contact patch with camber shift (§3.8) ──
  // Contact patch shifts laterally by R_loaded × sin(camber)
  const camberRad = (camber * Math.PI) / 180
  const contactPatchShift = tyreRadius * Math.sin(camberRad) * sideSign
  const contactPatchX = wheelXActual + contactPatchShift
  const contactPatchZ = wheelZActual

  // ── Steering arm (§3.2, §3.11) ──
  // The steering arm is integral to the upright (A_ST point).
  // It extends from the upright, rearward and inward toward the rear axle centreline.
  // The A_ST point is near the lower ball joint height but offset rearward.
  const ackermannRestAngle = Math.atan2(kingpinHalfTrack, vehicle.wheelbase)
  const steerRad = (steerAngle * Math.PI) / 180
  const armAngle = ackermannRestAngle + steerRad
  // A_ST origin is on the upright at lower ball joint height (per typical double-wishbone)
  const steeringArmBaseX = outerLowerX
  const steeringArmBaseY = outerLowerY
  const steeringArmBaseZ = outerLowerZ
  const armTipX = steeringArmBaseX - sideSign * geo.ackermannArmLength * Math.cos(armAngle)
  const armTipZ = steeringArmBaseZ - geo.ackermannArmLength * Math.sin(armAngle)
  const armTipY = steeringArmBaseY

  return (
    <group>
      {/* Tyre */}
      <WheelTyre
        position={[wheelXActual, wheelY, wheelZ]}
        radius={tyreRadius}
        width={vehicle.tyreWidth}
        camber={-camber * sideSign}
        toe={(geo.staticToe + steerAngle) * sideSign}
      />

      {/* Contact patch shadow on ground — shifted by camber (§3.8) */}
      {!cornerState.wheelAirborne && (
        <ContactPatchShadow
          position={[contactPatchX, 0.1, contactPatchZ]}
          width={vehicle.tyreWidth}
          length={tyreRadius * 0.4}
        />
      )}

      {/* Airborne indicator */}
      {cornerState.wheelAirborne && (
        <mesh position={[wheelXActual, wheelY + tyreRadius + 8, wheelZ]}>
          <ringGeometry args={[3, 5, 16]} />
          <meshBasicMaterial color={ORANGE} side={2} />
        </mesh>
      )}

      {/* Lower wishbone - A-shape (§3.1) */}
      <Line
        points={[
          innerPivotLowerFore,
          [outerLowerX, outerLowerY, outerLowerZ],
        ]}
        color={CYAN}
        lineWidth={2}
      />
      <Line
        points={[
          innerPivotLowerAft,
          [outerLowerX, outerLowerY, outerLowerZ],
        ]}
        color={CYAN}
        lineWidth={2}
      />

      {/* Upper arm (§3.1) */}
      <Line
        points={[
          innerPivotUpper,
          [outerUpperX, outerUpperY, outerUpperZ],
        ]}
        color={LIGHT_CYAN}
        lineWidth={1.5}
      />

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
          [kingpinGroundX, 0, kingpinGroundZ],
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
      <JointSphere position={[kingpinGroundX, 0.5, kingpinGroundZ]} color="#FF4444" size={1} />

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

      {/* Joint spheres */}
      <JointSphere position={innerPivotLowerFore} />
      <JointSphere position={innerPivotLowerAft} />
      <JointSphere position={[outerLowerX, outerLowerY, outerLowerZ]} />
      <JointSphere position={innerPivotUpper} color={LIGHT_CYAN} />
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
  const y = chassisHeave + innerPivotHeightLower + 5
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
  const leftCorner = useSimulationStore((s) => s.corners[axle === 'front' ? 'FL' : 'RL'])
  const rightCorner = useSimulationStore((s) => s.corners[axle === 'front' ? 'FR' : 'RR'])
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  const { innerPivotHeightLower } = deriveInnerPivotHeights(geo, vehicle.rideHeight, vehicle.tyreRadius)
  const { lowerLen: lowerWishboneLength } = armLengths(geo)
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
  const lowerArmAngleRad = (geo.lowerArmAngle * Math.PI) / 180
  const staticLowerOuterY = innerPivotHeightLower + lowerWishboneLength * Math.sin(lowerArmAngleRad)

  // Caster offset for lower ball joint longitudinal position (§3.3)
  const casterRad = (geo.casterAngle * Math.PI) / 180
  const halfUpright = geo.uprightHeight / 2
  const lowerBJLongOffset = halfUpright * Math.sin(casterRad)

  // Compute arm tip positions for each side
  const computeArmTip = (cornerState: typeof leftCorner, sideSign: number) => {
    const lowerJointOffsetY = staticLowerOuterY - vehicle.tyreRadius
    const outerLowerY = cornerState.wheelPosition + lowerJointOffsetY

    const innerPivotXLocal = sideSign * (kingpinHalfTrack - lowerWishboneLength)
    const innerLowerYLocal = chassisHeave + innerPivotHeightLower
    const innerMidX = rot(innerPivotXLocal, innerLowerYLocal, z)[0]
    const innerMidY = rot(innerPivotXLocal, innerLowerYLocal, z)[1]

    const lowerDY = outerLowerY - innerMidY
    const lowerDXSq = lowerWishboneLength * lowerWishboneLength - lowerDY * lowerDY
    const lowerDX = lowerDXSq > 0 ? Math.sqrt(lowerDXSq) : lowerWishboneLength
    const outerLowerX = innerMidX + sideSign * lowerDX
    const outerLowerZ = z + lowerBJLongOffset

    const steerRad = (cornerState.steeringAngle * Math.PI) / 180
    const armAngle = ackermannRestAngle + steerRad
    const tipX = outerLowerX - sideSign * geo.ackermannArmLength * Math.cos(armAngle)
    const tipZ = outerLowerZ - geo.ackermannArmLength * Math.sin(armAngle)
    return [tipX, outerLowerY, tipZ] as [number, number, number]
  }

  const leftTip = computeArmTip(leftCorner, -1)
  const rightTip = computeArmTip(rightCorner, 1)

  // Bellcrank at chassis centre
  const bellcrankY = chassisHeave + innerPivotHeightLower
  const bellcrankZ = z - 5
  const bC = rot(0, bellcrankY + 5, bellcrankZ)
  const bL = rot(-8, bellcrankY, bellcrankZ)
  const bR = rot(8, bellcrankY, bellcrankZ)

  return (
    <group>
      {/* Bellcrank */}
      <Line points={[bL, bC, bR]} color={GREEN} lineWidth={1.5} />
      {/* Tie rods from bellcrank to steering arm tips */}
      <Line points={[bL, leftTip]} color={GREEN} lineWidth={1} />
      <Line points={[bR, rightTip]} color={GREEN} lineWidth={1} />
    </group>
  )
}

export function SuspensionAssembly() {
  return (
    <group>
      <Chassis />
      <CornerAssembly corner="FL" side="left" />
      <CornerAssembly corner="FR" side="right" />
      <CornerAssembly corner="RL" side="left" />
      <CornerAssembly corner="RR" side="right" />
      <AntiRollBarVisual axle="front" />
      <AntiRollBarVisual axle="rear" />
      <SteeringLinkage axle="front" />
      <SteeringLinkage axle="rear" />
    </group>
  )
}
