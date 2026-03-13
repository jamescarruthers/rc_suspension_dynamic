import { useMemo } from 'react'
import * as THREE from 'three'
import { useVehicleStore } from '../../store/useVehicleStore'
import { useSimulationStore } from '../../store/useSimulationStore'
import type { Corner } from '../../types/suspension'

function Arrow({ origin, direction, length, color }: {
  origin: [number, number, number]
  direction: [number, number, number]
  length: number
  color: string
}) {
  const arrowHelper = useMemo(() => {
    const dir = new THREE.Vector3(...direction).normalize()
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(...origin), Math.abs(length), color, Math.min(Math.abs(length) * 0.3, 8), 3)
    return arrow
  }, [origin, direction, length, color])

  return <primitive object={arrowHelper} />
}

export function ForceArrows() {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const frontGeo = useVehicleStore((s) => s.frontGeometry)
  const rearGeo = useVehicleStore((s) => s.rearGeometry)
  const sim = useSimulationStore()
  const { forceVisibility, forceScale } = sim

  const frontWeightFrac = vehicle.weightDistribution / 100
  const sprungMass = vehicle.totalWeight - 4 * vehicle.unsprungMassPerCorner
  const corners: Corner[] = ['FL', 'FR', 'RL', 'RR']
  const cornerPositions = useMemo(() => {
    const positions: Record<Corner, { x: number; z: number }> = {
      FL: { x: -frontGeo.trackWidth / 2, z: vehicle.wheelbase * (1 - frontWeightFrac) },
      FR: { x: frontGeo.trackWidth / 2, z: vehicle.wheelbase * (1 - frontWeightFrac) },
      RL: { x: -rearGeo.trackWidth / 2, z: -vehicle.wheelbase * frontWeightFrac },
      RR: { x: rearGeo.trackWidth / 2, z: -vehicle.wheelbase * frontWeightFrac },
    }
    return positions
  }, [frontGeo.trackWidth, rearGeo.trackWidth, vehicle.wheelbase, frontWeightFrac])

  const scaleFactor = forceScale * 2

  return (
    <group>
      {/* Weight at CG */}
      {forceVisibility.weight && (
        <Arrow
          origin={[0, vehicle.cgHeight + sim.chassisHeave, 0]}
          direction={[0, -1, 0]}
          length={sprungMass * 9.81 / 1000 * scaleFactor}
          color="#FF0000"
        />
      )}

      {corners.map((c) => {
        const pos = cornerPositions[c]
        const cs = sim.corners[c]
        const y = cs.wheelPosition

        return (
          <group key={c}>
            {/* Unsprung weight */}
            {forceVisibility.unsprungWeight && (
              <Arrow
                origin={[pos.x, y, pos.z]}
                direction={[0, -1, 0]}
                length={vehicle.unsprungMassPerCorner * 9.81 / 1000 * scaleFactor}
                color="#990000"
              />
            )}

            {/* Ground reaction */}
            {forceVisibility.groundReaction && !cs.wheelAirborne && cs.tyreContactForce > 0 && (
              <Arrow
                origin={[pos.x, 0, pos.z]}
                direction={[0, 1, 0]}
                length={cs.tyreContactForce * scaleFactor}
                color="#00FF00"
              />
            )}

            {/* Spring force */}
            {forceVisibility.springForce && (
              <Arrow
                origin={[pos.x, y, pos.z]}
                direction={[0, cs.springForce > 0 ? 1 : -1, 0]}
                length={Math.abs(cs.springForce) * scaleFactor}
                color="#FFD700"
              />
            )}

            {/* Damper force */}
            {forceVisibility.damperForce && Math.abs(cs.damperForce) > 0.01 && (
              <Arrow
                origin={[pos.x + 3, y, pos.z]}
                direction={[0, cs.damperForce > 0 ? 1 : -1, 0]}
                length={Math.abs(cs.damperForce) * scaleFactor}
                color="#FF6B35"
              />
            )}

            {/* Bump stop */}
            {forceVisibility.bumpStop && Math.abs(cs.bumpStopForce) > 0.01 && (
              <Arrow
                origin={[pos.x - 3, y, pos.z]}
                direction={[0, cs.bumpStopForce > 0 ? 1 : -1, 0]}
                length={Math.abs(cs.bumpStopForce) * scaleFactor}
                color="#FF3333"
              />
            )}
          </group>
        )
      })}
    </group>
  )
}
