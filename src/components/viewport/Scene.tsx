import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { GroundPlane } from './GroundPlane'
import { SuspensionAssembly } from './SuspensionAssembly'
import { ForceArrows } from './ForceArrows'

export function Viewport() {
  return (
    <div className="flex-1 h-full relative">
      <Canvas
        camera={{ position: [300, 200, 300], fov: 50, near: 1, far: 5000 }}
        gl={{ antialias: true }}
        style={{ background: '#0A0E14' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[200, 300, 200]} intensity={0.6} />
        <GroundPlane />
        <SuspensionAssembly />
        <ForceArrows />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          maxDistance={2000}
          minDistance={50}
        />
        <axesHelper args={[30]} />
      </Canvas>
      <CameraPresets />
    </div>
  )
}

function CameraPresets() {
  return (
    <div className="absolute top-2 right-2 flex gap-1">
      {['ISO', 'Front', 'Side', 'Top'].map((view) => (
        <button
          key={view}
          className="text-[9px] px-2 py-0.5 bg-[#111820]/80 border border-[#1E2D3D] rounded text-[#8899AA] hover:text-[#00FFE0] backdrop-blur-sm"
        >
          {view}
        </button>
      ))}
    </div>
  )
}
