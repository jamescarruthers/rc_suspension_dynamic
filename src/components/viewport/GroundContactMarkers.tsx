// ─── Ground height indicators under each tyre ──────────────────────────────
// Shows a small coloured disc at the road surface height under each corner.
// Ground height is derived from the physics state (wheelPosition - tyreRadius + tyreDeflection)
// to guarantee consistency with the actual tyre contact — no independent recomputation.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useVehicleStore } from '../../store/useVehicleStore'
import type { Corner } from '../../types/suspension'

const CORNERS: Corner[] = ['FL', 'FR', 'RL', 'RR']
const CORNER_COLORS = {
  FL: '#FF4444',
  FR: '#44FF44',
  RL: '#FF8844',
  RR: '#4488FF',
}

export function GroundContactMarkers() {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null])

  useFrame(() => {
    const state = useSimulationStore.getState()
    const veh = useVehicleStore.getState()

    const tyreRadius = veh.vehicle.tyreRadius ?? 42
    const frac = veh.vehicle.weightDistribution / 100
    const distToFront = veh.vehicle.wheelbase * (1 - frac)
    const distToRear = veh.vehicle.wheelbase * frac

    const positions = {
      FL: { x: distToFront, y: -veh.frontGeometry.trackWidth / 2 },
      FR: { x: distToFront, y: veh.frontGeometry.trackWidth / 2 },
      RL: { x: -distToRear, y: -veh.rearGeometry.trackWidth / 2 },
      RR: { x: -distToRear, y: veh.rearGeometry.trackWidth / 2 },
    }

    // 3D scene: X = lateral (pos.y), Y = up (groundHeight), Z = longitudinal (pos.x)
    for (let i = 0; i < 4; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      const c = CORNERS[i]
      const cs = state.corners[c]
      const pos = positions[c]

      // Derive ground height from physics state:
      // tyreDeflection = max(0, groundHeight - (wheelPos - tyreRadius))
      // so groundHeight = wheelPos - tyreRadius + tyreDeflection
      // When airborne (tyreDeflection=0), this gives the tyre bottom position.
      const groundHeight = cs.wheelAirborne
        ? 0 // show ground at 0 when airborne
        : cs.wheelPosition - tyreRadius + cs.tyreDeflection

      mesh.position.set(pos.y, groundHeight, pos.x)
    }
  })

  return (
    <group>
      {CORNERS.map((c, i) => (
        <mesh
          key={c}
          ref={(el) => { meshRefs.current[i] = el }}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[12, 16]} />
          <meshBasicMaterial
            color={CORNER_COLORS[c]}
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  )
}
