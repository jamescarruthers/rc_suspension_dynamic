import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useContext, useCallback, useRef, useState, useEffect } from 'react'
import * as THREE from 'three'
import { MOUSE, TOUCH } from 'three'
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

/** Set camera position from spherical coordinates around a target */
function setCameraFromSpherical(
  camera: THREE.Camera & { updateProjectionMatrix?: () => void },
  target: THREE.Vector3,
  dist: number,
  azimuth: number,
  polar: number,
) {
  camera.position.set(
    target.x + dist * Math.sin(polar) * Math.sin(azimuth),
    target.y + dist * Math.cos(polar),
    target.z + dist * Math.sin(polar) * Math.cos(azimuth),
  )
  camera.lookAt(target)
  camera.updateProjectionMatrix?.()
}

/** Drag threshold in px before stepping to the next 30-degree increment */
const DRAG_STEP_PX = 40

function CameraController({ activeView, controlsRef }: {
  activeView: ViewPreset
  controlsRef: React.MutableRefObject<any>
}) {
  const { camera, size, gl } = useThree()

  // Snapped angles for Fixed ISO mode
  const snappedAz = useRef(snapAngle(Math.PI / 4, SNAP_RAD))
  const snappedPol = useRef(snapAngle(Math.atan2(300, 200), SNAP_RAD))
  const cameraDist = useRef(420)

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

    if (view === 'ISO' || view === 'Fixed') {
      if (view === 'Fixed') {
        // Snap current angles to 30-degree grid
        if (controls) {
          snappedAz.current = snapAngle(controls.getAzimuthalAngle(), SNAP_RAD)
          snappedPol.current = snapAngle(controls.getPolarAngle(), SNAP_RAD)
          // Clamp polar away from poles
          snappedPol.current = THREE.MathUtils.clamp(snappedPol.current, SNAP_RAD, Math.PI - SNAP_RAD)
          cameraDist.current = camera.position.distanceTo(controls.target)
        }
        setCameraFromSpherical(camera, target, cameraDist.current, snappedAz.current, snappedPol.current)
      } else {
        camera.position.set(300, 200, 300)
      }
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

  // Fixed ISO: left-click / single-finger for 30-deg stepped rotation
  // OrbitControls handles right-click / two-finger for panning
  useEffect(() => {
    if (activeView !== 'Fixed') return
    const domElement = gl.domElement
    const controls = controlsRef.current

    // Disable OrbitControls panning on left button (we use it for rotation)
    // and enable pan on right button / two-finger
    if (controls) {
      controls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
      controls.touches = { ONE: null, TWO: TOUCH.DOLLY_PAN }
    }

    let mouseDown = false
    let accumX = 0
    let accumY = 0
    let lastX = 0
    let lastY = 0

    const stepCamera = (dxSteps: number, dySteps: number) => {
      if (dxSteps === 0 && dySteps === 0) return
      snappedAz.current += dxSteps * SNAP_RAD
      snappedPol.current += dySteps * SNAP_RAD
      snappedPol.current = THREE.MathUtils.clamp(snappedPol.current, SNAP_RAD, Math.PI - SNAP_RAD)
      const target = controls?.target ?? new THREE.Vector3(0, 50, 0)
      setCameraFromSpherical(camera, target, cameraDist.current, snappedAz.current, snappedPol.current)
      if (controls) controls.update()
    }

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return  // left button only
      mouseDown = true
      lastX = e.clientX
      lastY = e.clientY
      accumX = 0
      accumY = 0
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDown) return
      accumX += e.clientX - lastX
      accumY += e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY

      let dxSteps = 0
      let dySteps = 0
      while (accumX > DRAG_STEP_PX) { dxSteps--; accumX -= DRAG_STEP_PX }
      while (accumX < -DRAG_STEP_PX) { dxSteps++; accumX += DRAG_STEP_PX }
      while (accumY > DRAG_STEP_PX) { dySteps--; accumY -= DRAG_STEP_PX }
      while (accumY < -DRAG_STEP_PX) { dySteps++; accumY += DRAG_STEP_PX }
      stepCamera(dxSteps, dySteps)
    }

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mouseDown = false
    }

    // --- Touch: single-finger drag for rotation ---
    let touchActive = false
    let touchLastX = 0
    let touchLastY = 0
    let touchAccumX = 0
    let touchAccumY = 0

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchActive = true
        touchLastX = e.touches[0].clientX
        touchLastY = e.touches[0].clientY
        touchAccumX = 0
        touchAccumY = 0
        e.preventDefault()
      } else {
        // Two+ fingers: let OrbitControls handle pan
        touchActive = false
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!touchActive || e.touches.length !== 1) return
      touchAccumX += e.touches[0].clientX - touchLastX
      touchAccumY += e.touches[0].clientY - touchLastY
      touchLastX = e.touches[0].clientX
      touchLastY = e.touches[0].clientY

      let dxSteps = 0
      let dySteps = 0
      while (touchAccumX > DRAG_STEP_PX) { dxSteps--; touchAccumX -= DRAG_STEP_PX }
      while (touchAccumX < -DRAG_STEP_PX) { dxSteps++; touchAccumX += DRAG_STEP_PX }
      while (touchAccumY > DRAG_STEP_PX) { dySteps--; touchAccumY -= DRAG_STEP_PX }
      while (touchAccumY < -DRAG_STEP_PX) { dySteps++; touchAccumY += DRAG_STEP_PX }
      stepCamera(dxSteps, dySteps)

      e.preventDefault()
    }

    const onTouchEnd = () => {
      touchActive = false
    }

    domElement.addEventListener('mousedown', onMouseDown)
    domElement.addEventListener('mousemove', onMouseMove)
    domElement.addEventListener('mouseup', onMouseUp)
    domElement.addEventListener('touchstart', onTouchStart, { passive: false })
    domElement.addEventListener('touchmove', onTouchMove, { passive: false })
    domElement.addEventListener('touchend', onTouchEnd)

    return () => {
      // Restore OrbitControls defaults when leaving Fixed mode
      if (controls) {
        controls.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
        controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN }
      }
      domElement.removeEventListener('mousedown', onMouseDown)
      domElement.removeEventListener('mousemove', onMouseMove)
      domElement.removeEventListener('mouseup', onMouseUp)
      domElement.removeEventListener('touchstart', onTouchStart)
      domElement.removeEventListener('touchmove', onTouchMove)
      domElement.removeEventListener('touchend', onTouchEnd)
    }
  }, [activeView, camera, gl, controlsRef])

  return null
}

export function Viewport() {
  const [activeView, setActiveView] = useState<ViewPreset>('ISO')
  const controlsRef = useRef<any>(null)

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
          enableRotate={activeView === 'ISO'}
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
