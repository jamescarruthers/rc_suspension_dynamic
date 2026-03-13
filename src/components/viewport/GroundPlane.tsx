import { useMemo } from 'react'
import * as THREE from 'three'

export function GroundPlane() {
  const gridHelper = useMemo(() => {
    const grid = new THREE.GridHelper(1000, 100, 0x1E2D3D, 0x1E2D3D)
    grid.material.opacity = 0.5
    grid.material.transparent = true
    return grid
  }, [])

  return (
    <group>
      <primitive object={gridHelper} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial color="#0A0E14" transparent opacity={0.8} />
      </mesh>
    </group>
  )
}
