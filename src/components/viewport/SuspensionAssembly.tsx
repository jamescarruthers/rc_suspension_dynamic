import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { useVehicleStore } from '../../store/useVehicleStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import { deriveUpperArmAngle } from '../../engine/kinematics'
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
  const lowerWishboneLength = geo.lowerWishboneRatio * geo.trackWidth / 2
  const upperArmAngleDeg = deriveUpperArmAngle(geo)
  const upperArmLength = lowerWishboneLength * geo.upperArmLengthRatio

  // ── Chassis-attached points (defined in unrotated chassis space, then rotated) ──

  // Inner pivot positions on the chassis
  const innerPivotXLocal = sideSign * (geo.trackWidth / 2 - lowerWishboneLength)
  const innerLowerYLocal = chassisHeave + geo.innerPivotHeightLower
  const innerUpperYLocal = chassisHeave + geo.innerPivotHeightUpper

  const innerPivotLowerFore = rot(innerPivotXLocal, innerLowerYLocal, longitudinalOffset + geo.innerPivotSpread / 2)
  const innerPivotLowerAft = rot(innerPivotXLocal, innerLowerYLocal, longitudinalOffset - geo.innerPivotSpread / 2)

  // Upper arm inner pivot
  const innerUpperXLocal = sideSign * (geo.trackWidth / 2 - upperArmLength)
  const innerPivotUpper = rot(innerUpperXLocal, innerUpperYLocal, longitudinalOffset)

  // Shock tower — derived from static lower mount position + shock vector
  const lowerArmAngleRad = (geo.lowerArmAngle * Math.PI) / 180
  const shockAngleRad = (shock.shockAngle * Math.PI) / 180
  const staticLowerMountXLocal = innerPivotXLocal +
    sideSign * lowerWishboneLength * Math.cos(lowerArmAngleRad) * shock.damperAttachmentRatio
  const staticLowerMountYLocal = geo.innerPivotHeightLower +
    lowerWishboneLength * Math.sin(lowerArmAngleRad) * shock.damperAttachmentRatio
  const shockTowerXLocal = staticLowerMountXLocal - sideSign * shock.shockLength * Math.sin(shockAngleRad)
  const shockTowerYLocal = chassisHeave + staticLowerMountYLocal + shock.shockLength * Math.cos(shockAngleRad)
  const shockTower = rot(shockTowerXLocal, shockTowerYLocal, longitudinalOffset)

  // ── Outer ball joints — maintain constant arm lengths (rigid links) ──
  // Compute static ball joint heights at design ride height from arm geometry
  const upperArmAngleRad = (upperArmAngleDeg * Math.PI) / 180
  const staticLowerOuterY = geo.innerPivotHeightLower + lowerWishboneLength * Math.sin(lowerArmAngleRad)
  const staticUpperOuterY = geo.innerPivotHeightUpper + upperArmLength * Math.sin(upperArmAngleRad)

  // Fixed vertical offsets of ball joints relative to wheel centre
  const lowerJointOffsetY = staticLowerOuterY - tyreRadius
  const upperJointOffsetY = staticUpperOuterY - tyreRadius

  // Ball joint vertical positions (move with wheel)
  const outerLowerY = wheelY + lowerJointOffsetY
  const outerUpperY = wheelY + upperJointOffsetY
  const outerLowerZ = longitudinalOffset
  const outerUpperZ = longitudinalOffset

  // Compute ball joint lateral (X) positions from arm length constraint.
  // The arm is a rigid link — its length cannot change. Given the inner pivot
  // position (chassis-attached) and the ball joint Y (from wheel travel),
  // solve for the lateral position: dx = sqrt(L² - dy²).
  // Use the midpoint of the A-arm inner pivots for the lower arm constraint.
  const innerMidLowerX = (innerPivotLowerFore[0] + innerPivotLowerAft[0]) / 2
  const innerMidLowerY = (innerPivotLowerFore[1] + innerPivotLowerAft[1]) / 2
  const lowerDY = outerLowerY - innerMidLowerY
  const lowerDXSq = lowerWishboneLength * lowerWishboneLength - lowerDY * lowerDY
  const lowerDX = lowerDXSq > 0 ? Math.sqrt(lowerDXSq) : lowerWishboneLength
  const outerLowerX = innerMidLowerX + sideSign * lowerDX

  // Upper arm — single inner pivot
  const upperDY = outerUpperY - innerPivotUpper[1]
  const upperDXSq = upperArmLength * upperArmLength - upperDY * upperDY
  const upperDX = upperDXSq > 0 ? Math.sqrt(upperDXSq) : upperArmLength
  const outerUpperX = innerPivotUpper[0] + sideSign * upperDX

  // Shock lower mount (on wishbone, interpolated between inner pivot and outer ball joint)
  const frac = shock.damperAttachmentRatio
  const shockLowerX = innerPivotLowerFore[0] + (outerLowerX - innerPivotLowerFore[0]) * frac
  const shockLowerY = innerPivotLowerFore[1] + (outerLowerY - innerPivotLowerFore[1]) * frac
  const shockLowerZ = innerPivotLowerFore[2] + (outerLowerZ - innerPivotLowerFore[2]) * frac

  // Dynamic camber
  const camber = cornerState.camberAngle

  // Wheel lateral position follows the lower ball joint (track changes with travel)
  const wheelXActual = outerLowerX

  return (
    <group>
      {/* Tyre */}
      <WheelTyre
        position={[wheelXActual, wheelY, wheelZ]}
        radius={tyreRadius}
        width={vehicle.tyreWidth}
        camber={camber}
        toe={geo.staticToe * sideSign}
      />

      {/* Contact patch shadow on ground */}
      {!cornerState.wheelAirborne && (
        <ContactPatchShadow
          position={[wheelXActual, 0.1, wheelZ]}
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

      {/* Lower wishbone - A-shape */}
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

      {/* Upper arm */}
      <Line
        points={[
          innerPivotUpper,
          [outerUpperX, outerUpperY, outerUpperZ],
        ]}
        color={LIGHT_CYAN}
        lineWidth={1.5}
      />

      {/* Hub carrier / upright */}
      <Line
        points={[
          [outerLowerX, outerLowerY, outerLowerZ],
          [outerUpperX, outerUpperY, outerUpperZ],
        ]}
        color={WHITE}
        lineWidth={1.5}
      />

      {/* Kingpin axis (dashed - approximated with shorter segment) */}
      <Line
        points={[
          [outerLowerX, outerLowerY - 10, outerLowerZ],
          [outerUpperX, outerUpperY + 10, outerUpperZ],
        ]}
        color={WHITE}
        lineWidth={0.5}
        dashed
        dashSize={3}
        gapSize={3}
      />

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
    </group>
  )
}

function Chassis() {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const frontGeo = useVehicleStore((s) => s.frontGeometry)
  const rearGeo = useVehicleStore((s) => s.rearGeometry)
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const frontZ = vehicle.wheelbase * (1 - frontWeightFrac)
  const rearZ = -vehicle.wheelbase * frontWeightFrac
  const frontHalfWidth = frontGeo.trackWidth * 0.3
  const rearHalfWidth = rearGeo.trackWidth * 0.3
  const chassisY = vehicle.rideHeight + chassisHeave
  const thickness = 10

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180

  // Wireframe box vertices (trapezoid shape)
  const top = chassisY + thickness / 2
  const bot = chassisY - thickness / 2

  return (
    <group rotation={[0, 0, rollRad]}>
      <group rotation={[pitchRad, 0, 0]}>
        {/* Top face */}
        <Line
          points={[
            [-frontHalfWidth, top, frontZ],
            [frontHalfWidth, top, frontZ],
            [rearHalfWidth, top, rearZ],
            [-rearHalfWidth, top, rearZ],
            [-frontHalfWidth, top, frontZ],
          ]}
          color={GREY}
          lineWidth={1}
        />
        {/* Bottom face */}
        <Line
          points={[
            [-frontHalfWidth, bot, frontZ],
            [frontHalfWidth, bot, frontZ],
            [rearHalfWidth, bot, rearZ],
            [-rearHalfWidth, bot, rearZ],
            [-frontHalfWidth, bot, frontZ],
          ]}
          color={GREY}
          lineWidth={1}
        />
        {/* Verticals */}
        {[
          [-frontHalfWidth, frontZ],
          [frontHalfWidth, frontZ],
          [rearHalfWidth, rearZ],
          [-rearHalfWidth, rearZ],
        ].map(([x, z], i) => (
          <Line
            key={i}
            points={[[x, bot, z], [x, top, z]]}
            color={GREY}
            lineWidth={1}
          />
        ))}
        {/* Centreline */}
        <Line
          points={[[0, top + 1, frontZ + 10], [0, top + 1, rearZ - 10]]}
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

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180
  const rot = (x: number, y: number, z: number): [number, number, number] =>
    rotateWithChassis(x, y, z, rollRad, pitchRad)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const z = axle === 'front'
    ? vehicle.wheelbase * (1 - frontWeightFrac)
    : -vehicle.wheelbase * frontWeightFrac
  const y = chassisHeave + geo.innerPivotHeightLower + 5
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

function SteeringLinkage() {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const frontGeo = useVehicleStore((s) => s.frontGeometry)
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)
  const rollAngle = useSimulationStore((s) => s.rollAngle)
  const pitchAngle = useSimulationStore((s) => s.pitchAngle)

  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180
  const rot = (x: number, y: number, z: number): [number, number, number] =>
    rotateWithChassis(x, y, z, rollRad, pitchRad)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const z = vehicle.wheelbase * (1 - frontWeightFrac) - 5
  const y = chassisHeave + frontGeo.innerPivotHeightLower
  const halfTrack = frontGeo.trackWidth / 2

  const bL = rot(-8, y, z)
  const bC = rot(0, y + 5, z)
  const bR = rot(8, y, z)
  const tL = rot(-halfTrack + 5, y, z)
  const tR = rot(halfTrack - 5, y, z)

  return (
    <group>
      {/* Bellcrank */}
      <Line points={[bL, bC, bR]} color={GREEN} lineWidth={1.5} />
      {/* Tie rods */}
      <Line points={[bL, tL]} color={GREEN} lineWidth={1} />
      <Line points={[bR, tR]} color={GREEN} lineWidth={1} />
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
      <SteeringLinkage />
    </group>
  )
}
