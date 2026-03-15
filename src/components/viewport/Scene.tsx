import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useContext, useCallback, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { GroundPlane } from './GroundPlane'
import { SuspensionAssembly } from './SuspensionAssembly'
import { ForceArrows } from './ForceArrows'
import { GroundContactMarkers } from './GroundContactMarkers'
import { PerfStatsContext } from '../../App'
import { useSimulationStore } from '../../store/useSimulationStore'
import { useVehicleStore } from '../../store/useVehicleStore'

function PerfStatsOverlay() {
  const stats = useContext(PerfStatsContext)

  const isWasmEngine = stats.physicsEngine === 'rk4-wasm'
  const wasmActive = isWasmEngine && stats.wasmReady
  const wasmFallback = isWasmEngine && !stats.wasmReady

  const engineLabel = stats.physicsEngine === 'rk4' ? 'RK4' :
    wasmActive ? 'RK4 WASM' :
    wasmFallback ? 'RK4 (WASM loading...)' :
    stats.physicsEngine === 'rapier' ? 'Rapier' : 'Euler'

  return (
    <div className="absolute bottom-2 left-2 text-[10px] font-mono leading-tight bg-[#111820]/80 border border-[#1E2D3D] rounded px-2 py-1.5 text-[#8899AA] backdrop-blur-sm select-none pointer-events-none">
      <div className={wasmActive ? 'text-[#FF6B00]' : 'text-[#00FFE0]'}>{engineLabel}</div>
      <div>{stats.fps} FPS</div>
      <div>{stats.physicsStepsPerSec.toLocaleString()} steps/s</div>
      <div>t = {stats.simTime.toFixed(2)}s</div>
    </div>
  )
}

type ViewPreset = 'ISO' | 'Fixed' | 'Front' | 'Side' | 'Top'

const ORTHO_ZOOM = 2.5
const SNAP_RAD = THREE.MathUtils.degToRad(30)

/** Snap an angle to the nearest multiple of `step` radians */
function snapAngle(angle: number, step: number): number {
  return Math.round(angle / step) * step
}

function CameraController({ activeView, controlsRef }: {
  activeView: ViewPreset
  controlsRef: React.MutableRefObject<any>
}) {
  const { camera, size } = useThree()

  const applyView = useCallback((view: ViewPreset) => {
    const target = new THREE.Vector3(0, 50, 0)
    const controls = controlsRef.current

    // Set up orthographic frustum
    const aspect = size.width / size.height
    if (camera instanceof THREE.OrthographicCamera) {
      const halfH = size.height / ORTHO_ZOOM
      const halfW = halfH * aspect
      camera.left = -halfW
      camera.right = halfW
      camera.top = halfH
      camera.bottom = -halfH
      camera.near = -5000
      camera.far = 5000
    }

    if (view === 'ISO') {
      camera.position.set(300, 200, 300)
    } else if (view === 'Fixed') {
      camera.position.set(300, 200, 300)
    } else if (view === 'Front') {
      camera.position.set(0, 50, -500)
    } else if (view === 'Side') {
      camera.position.set(500, 50, 0)
    } else if (view === 'Top') {
      camera.position.set(0, 500, -0.01)
    }

    camera.lookAt(target)
    camera.updateProjectionMatrix()
    if (controls) {
      controls.target.copy(target)
      controls.update()
    }
  }, [camera, size, controlsRef])

  // Apply view whenever activeView changes
  const lastView = useRef<ViewPreset | null>(null)
  if (activeView !== lastView.current) {
    lastView.current = activeView
    setTimeout(() => applyView(activeView), 0)
  }

  // For Fixed ISO: snap orbit angles on every change
  useEffect(() => {
    const controls = controlsRef.current
    if (activeView !== 'Fixed' || !controls) return

    const onchange = () => {
      const az = controls.getAzimuthalAngle()
      const pol = controls.getPolarAngle()
      const snappedAz = snapAngle(az, SNAP_RAD)
      const snappedPol = snapAngle(pol, SNAP_RAD)

      if (Math.abs(az - snappedAz) > 0.001 || Math.abs(pol - snappedPol) > 0.001) {
        // Convert spherical to position
        const dist = camera.position.distanceTo(controls.target)
        const target = controls.target as THREE.Vector3
        camera.position.set(
          target.x + dist * Math.sin(snappedPol) * Math.sin(snappedAz),
          target.y + dist * Math.cos(snappedPol),
          target.z + dist * Math.sin(snappedPol) * Math.cos(snappedAz),
        )
        camera.lookAt(target)
        camera.updateProjectionMatrix()
        controls.update()
      }
    }

    controls.addEventListener('end', onchange)
    return () => controls.removeEventListener('end', onchange)
  }, [activeView, camera, controlsRef])

  return null
}

export function Viewport() {
  const [activeView, setActiveView] = useState<ViewPreset>('ISO')
  const controlsRef = useRef<any>(null)
  const fixedView = activeView === 'Front' || activeView === 'Side' || activeView === 'Top'

  return (
    <div className="flex-1 h-full relative">
      <Canvas
        orthographic
        camera={{ position: [300, 200, 300], zoom: ORTHO_ZOOM, near: -5000, far: 5000 }}
        gl={{ antialias: true }}
        style={{ background: '#0A0E14' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[200, 300, 200]} intensity={0.6} />
        <GroundPlane />
        <SuspensionAssembly />
        <ForceArrows />
        <GroundContactMarkers />
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.1}
          enableRotate={!fixedView}
        />
        <CameraController activeView={activeView} controlsRef={controlsRef} />
        <axesHelper args={[30]} />
      </Canvas>
      <CameraPresets activeView={activeView} setActiveView={setActiveView} />
      <PartVisibilityToggles />
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

function CameraPresets({ activeView, setActiveView }: {
  activeView: ViewPreset
  setActiveView: (v: ViewPreset) => void
}) {
  return (
    <div className="absolute top-2 right-2 flex gap-1">
      {(['ISO', 'Fixed', 'Front', 'Side', 'Top'] as ViewPreset[]).map((view) => (
        <button
          key={view}
          onClick={() => setActiveView(view)}
          className={`text-[9px] px-2 py-0.5 bg-[#111820]/80 border rounded backdrop-blur-sm ${
            activeView === view
              ? 'border-[#00FFE0] text-[#00FFE0]'
              : 'border-[#1E2D3D] text-[#8899AA] hover:text-[#00FFE0]'
          }`}
        >
          {view}
        </button>
      ))}
    </div>
  )
}

const PART_LABELS: { key: string; label: string }[] = [
  { key: 'chassis', label: 'Chassis' },
  { key: 'FL', label: 'FL' },
  { key: 'FR', label: 'FR' },
  { key: 'RL', label: 'RL' },
  { key: 'RR', label: 'RR' },
]

function PartVisibilityToggles() {
  const partVisibility = useSimulationStore((s) => s.partVisibility)
  const toggle = useSimulationStore((s) => s.togglePartVisibility)

  return (
    <div className="absolute top-2 left-2 flex gap-1">
      {PART_LABELS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => toggle(key)}
          className={`text-[9px] px-2 py-0.5 bg-[#111820]/80 border rounded backdrop-blur-sm ${
            partVisibility[key]
              ? 'border-[#00FFE0] text-[#00FFE0]'
              : 'border-[#1E2D3D] text-[#556677]'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
