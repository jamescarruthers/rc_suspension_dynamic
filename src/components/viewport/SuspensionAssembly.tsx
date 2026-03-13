import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { useVehicleStore } from '../../store/useVehicleStore'
import { useSimulationStore } from '../../store/useSimulationStore'
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

function WheelRing({ position, radius, camber = 0, toe = 0 }: { position: [number, number, number]; radius: number; camber: number; toe: number }) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = []
    const segments = 32
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      pts.push([0, Math.cos(angle) * radius, Math.sin(angle) * radius])
    }
    return pts
  }, [radius])

  const camberRad = (camber * Math.PI) / 180
  const toeRad = (toe * Math.PI) / 180

  return (
    <group position={position} rotation={[0, toeRad, camberRad]}>
      <Line points={points} color={WHEEL_COLOR} lineWidth={1.5} />
      {/* Contact patch indicator */}
      <Line
        points={[[-3, -radius, 0], [3, -radius, 0]]}
        color={WHEEL_COLOR}
        lineWidth={2}
      />
    </group>
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

  // Chassis position at this corner considering heave, roll, pitch
  const rollRad = (rollAngle * Math.PI) / 180
  const pitchRad = (pitchAngle * Math.PI) / 180
  const lateralLever = sideSign * geo.trackWidth / 2
  const chassisAtCorner = vehicle.rideHeight + chassisHeave +
    lateralLever * Math.sin(rollRad) +
    longitudinalOffset * Math.sin(pitchRad)

  // Wheel position
  const wheelY = cornerState.wheelPosition
  const wheelX = sideSign * geo.trackWidth / 2
  const wheelZ = longitudinalOffset

  // Tyre radius (approximate based on scale)
  const tyreRadius = vehicle.scale === '1:8' ? 42 : 35

  // Inner pivot positions (on chassis)
  const innerPivotX = sideSign * (geo.trackWidth / 2 - geo.lowerWishboneLength)
  const innerPivotLowerY = chassisAtCorner - vehicle.rideHeight + geo.innerPivotHeightLower
  const innerPivotUpperY = chassisAtCorner - vehicle.rideHeight + geo.innerPivotHeightUpper

  // Lower wishbone: A-shape with two inner pivots (fore and aft spread)
  const innerPivotForeZ = longitudinalOffset + geo.innerPivotSpread / 2
  const innerPivotAftZ = longitudinalOffset - geo.innerPivotSpread / 2

  // Outer ball joint position (hub carrier lower)
  const lowerArmAngleRad = (geo.lowerArmAngle * Math.PI) / 180
  const outerLowerX = wheelX
  const outerLowerY = innerPivotLowerY + geo.lowerWishboneLength * Math.sin(lowerArmAngleRad) + (wheelY - chassisAtCorner + vehicle.rideHeight) * 0.3
  const outerLowerZ = longitudinalOffset

  // Upper arm
  const upperArmLength = geo.lowerWishboneLength * geo.upperArmLengthRatio
  const upperArmAngleRad = (geo.upperArmAngle * Math.PI) / 180
  const innerUpperX = sideSign * (geo.trackWidth / 2 - upperArmLength)
  const outerUpperX = wheelX
  const outerUpperY = innerPivotUpperY + upperArmLength * Math.sin(upperArmAngleRad) + (wheelY - chassisAtCorner + vehicle.rideHeight) * 0.5
  const outerUpperZ = longitudinalOffset

  // Shock absorber positions
  const shockLowerX = innerPivotX + sideSign * shock.mountPosition * 0.5
  const shockLowerY = innerPivotLowerY + (outerLowerY - innerPivotLowerY) * (shock.mountPosition / geo.lowerWishboneLength)
  const shockAngleRad = (shock.shockAngle * Math.PI) / 180
  const shockUpperX = shockLowerX - sideSign * shock.shockLength * Math.sin(shockAngleRad) * 0.3
  const shockUpperY = shock.towerHeight + chassisAtCorner - vehicle.rideHeight
  const shockUpperZ = longitudinalOffset

  // Dynamic camber
  const camber = cornerState.camberAngle

  return (
    <group>
      {/* Wheel */}
      <WheelRing
        position={[wheelX, wheelY, wheelZ]}
        radius={tyreRadius}
        camber={camber}
        toe={geo.staticToe * sideSign}
      />

      {/* Airborne indicator */}
      {cornerState.wheelAirborne && (
        <mesh position={[wheelX, wheelY + tyreRadius + 8, wheelZ]}>
          <ringGeometry args={[3, 5, 16]} />
          <meshBasicMaterial color={ORANGE} side={2} />
        </mesh>
      )}

      {/* Lower wishbone - A-shape */}
      <Line
        points={[
          [innerPivotX, innerPivotLowerY, innerPivotForeZ],
          [outerLowerX, outerLowerY, outerLowerZ],
        ]}
        color={CYAN}
        lineWidth={2}
      />
      <Line
        points={[
          [innerPivotX, innerPivotLowerY, innerPivotAftZ],
          [outerLowerX, outerLowerY, outerLowerZ],
        ]}
        color={CYAN}
        lineWidth={2}
      />

      {/* Upper arm */}
      <Line
        points={[
          [innerUpperX, innerPivotUpperY, outerUpperZ],
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
          [shockLowerX, shockLowerY, shockUpperZ],
          [shockUpperX, shockUpperY, shockUpperZ],
        ]}
        color={ORANGE}
        lineWidth={2}
      />

      {/* Spring coil */}
      <SpringCoil
        start={[shockLowerX, shockLowerY, shockUpperZ]}
        end={[shockLowerX + (shockUpperX - shockLowerX) * 0.6, shockLowerY + (shockUpperY - shockLowerY) * 0.6, shockUpperZ]}
      />

      {/* Joint spheres */}
      <JointSphere position={[innerPivotX, innerPivotLowerY, innerPivotForeZ]} />
      <JointSphere position={[innerPivotX, innerPivotLowerY, innerPivotAftZ]} />
      <JointSphere position={[outerLowerX, outerLowerY, outerLowerZ]} />
      <JointSphere position={[innerUpperX, innerPivotUpperY, outerUpperZ]} color={LIGHT_CYAN} />
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

  if (!swayBar.enabled) return null

  const frontWeightFrac = vehicle.weightDistribution / 100
  const z = axle === 'front'
    ? vehicle.wheelbase * (1 - frontWeightFrac)
    : -vehicle.wheelbase * frontWeightFrac
  const y = vehicle.rideHeight + chassisHeave + geo.innerPivotHeightLower + 5
  const halfWidth = swayBar.armLength

  return (
    <group>
      <Line
        points={[
          [-halfWidth, y, z],
          [0, y + 3, z],
          [halfWidth, y, z],
        ]}
        color={MAGENTA}
        lineWidth={1.5}
      />
      {/* Drop links */}
      <Line points={[[-halfWidth, y, z], [-halfWidth, y - 8, z]]} color={MAGENTA} lineWidth={1} />
      <Line points={[[halfWidth, y, z], [halfWidth, y - 8, z]]} color={MAGENTA} lineWidth={1} />
    </group>
  )
}

function SteeringLinkage() {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const frontGeo = useVehicleStore((s) => s.frontGeometry)
  const chassisHeave = useSimulationStore((s) => s.chassisHeave)

  const frontWeightFrac = vehicle.weightDistribution / 100
  const z = vehicle.wheelbase * (1 - frontWeightFrac) - 5
  const y = vehicle.rideHeight + chassisHeave + frontGeo.innerPivotHeightLower
  const halfTrack = frontGeo.trackWidth / 2

  return (
    <group>
      {/* Bellcrank */}
      <Line
        points={[[-8, y, z], [0, y + 5, z], [8, y, z]]}
        color={GREEN}
        lineWidth={1.5}
      />
      {/* Tie rods */}
      <Line points={[[-8, y, z], [-halfTrack + 5, y, z]]} color={GREEN} lineWidth={1} />
      <Line points={[[8, y, z], [halfTrack - 5, y, z]]} color={GREEN} lineWidth={1} />
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
