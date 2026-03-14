import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useContext, useCallback } from 'react'
import { GroundPlane } from './GroundPlane'
import { SuspensionAssembly } from './SuspensionAssembly'
import { ForceArrows } from './ForceArrows'
import { PerfStatsContext } from '../../App'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useVehicleStore } from '../../store/useVehicleStore'

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
      <SteeringOverlay />
      <PerfStatsOverlay />
    </div>
  )
}

function SteeringOverlay() {
  const frontSteer = useSimulationStore((s) => s.frontSteeringAngle)
  const setFrontSteer = useSimulationStore((s) => s.setFrontSteeringAngle)
  const frontMaxSteer = useVehicleStore((s) => s.frontSteeringRack.maxSteeringAngle ?? 30)

  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFrontSteer(Number(e.target.value))
  }, [setFrontSteer])

  const onDoubleClick = useCallback(() => {
    setFrontSteer(0)
  }, [setFrontSteer])

  return (
    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#111820]/80 border border-[#1E2D3D] rounded px-3 py-1.5 backdrop-blur-sm">
      <span className="text-[9px] font-mono text-[#556677] select-none">STEER</span>
      <input
        type="range"
        min={-frontMaxSteer}
        max={frontMaxSteer}
        step={0.5}
        value={frontSteer}
        onChange={onInput}
        onDoubleClick={onDoubleClick}
        className="w-32 h-1 accent-[#00FFE0] cursor-pointer"
      />
      <span className="text-[10px] font-mono text-[#00FFE0] w-10 text-right select-none">
        {frontSteer.toFixed(1)}&deg;
      </span>
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
