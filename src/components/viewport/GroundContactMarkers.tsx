// ─── Ground height indicators under each tyre ──────────────────────────────
// Shows a small coloured disc at the road surface height under each corner.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useVehicleStore } from '../../store/useVehicleStore'
import { getGroundHeight, type CornerPositions } from '../../engine/roadSurface'
import type { Corner, RoadProfileType } from '../../types/suspension'

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

    const frac = veh.vehicle.weightDistribution / 100
    const distToFront = veh.vehicle.wheelbase * (1 - frac)
    const distToRear = veh.vehicle.wheelbase * frac

    const cornerPos: CornerPositions = {
      FL: { x: distToFront, y: -veh.frontGeometry.trackWidth / 2 },
      FR: { x: distToFront, y: veh.frontGeometry.trackWidth / 2 },
      RL: { x: -distToRear, y: -veh.rearGeometry.trackWidth / 2 },
      RR: { x: -distToRear, y: veh.rearGeometry.trackWidth / 2 },
    }

    const groundHeights = getGroundHeight(
      state.roadSurfaceType as RoadProfileType,
      {
        height: state.roadBumpHeight,
        width: state.roadBumpWidth,
        speed: state.roadSpeed,
        frequency: state.roadFrequency,
      },
      cornerPos,
      state.time,
    )

    // 3D scene: X = lateral (cornerPos.y), Y = up (groundHeight), Z = longitudinal (cornerPos.x)
    for (let i = 0; i < 4; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      const c = CORNERS[i]
      const gh = groundHeights[c]
      mesh.position.set(cornerPos[c].y, gh, cornerPos[c].x)
      // Scale the disc height to indicate bump size
      mesh.scale.setY(Math.max(0.1, gh * 0.1 + 0.1))
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
