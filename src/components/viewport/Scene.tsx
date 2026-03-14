import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useContext } from 'react'
import { GroundPlane } from './GroundPlane'
import { SuspensionAssembly } from './SuspensionAssembly'
import { ForceArrows } from './ForceArrows'
import { PerfStatsContext } from '../../App'

function PerfStatsOverlay() {
  const stats = useContext(PerfStatsContext)

  const engineLabel = stats.physicsEngine === 'rk4' ? 'RK4' :
    stats.physicsEngine === 'rapier' ? 'Rapier' : 'Euler'

  return (
    <div className="absolute bottom-2 left-2 text-[10px] font-mono leading-tight bg-[#111820]/80 border border-[#1E2D3D] rounded px-2 py-1.5 text-[#8899AA] backdrop-blur-sm select-none pointer-events-none">
      <div className="text-[#00FFE0]">{engineLabel}</div>
      <div>{stats.fps} FPS</div>
      <div>{stats.physicsStepsPerSec.toLocaleString()} steps/s</div>
      <div>t = {stats.simTime.toFixed(2)}s</div>
    </div>
  )
}

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
      <PerfStatsOverlay />
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
