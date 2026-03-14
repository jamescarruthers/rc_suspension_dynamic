import { useEffect, useRef, useCallback, useState, createContext } from 'react'
import { Header } from './components/layout/Header'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightSidebar } from './components/layout/RightSidebar'
import { BottomPanel } from './components/layout/BottomPanel'
import { MobileTabBar } from './components/layout/MobileTabBar'
import { Viewport } from './components/viewport/Scene'
import { useSimulationStore } from './store/useSimulationStore'
import { useVehicleStore } from './store/useVehicleStore'
import { stepSimulation, findStaticEquilibrium } from './engine/integration'
import { stepRK4Simulation } from './engine/rk4Engine'
import { initRK4Wasm, isRK4WasmReady, stepRK4WasmSimulation } from './engine/rk4WasmEngine'
import './engine/benchmark' // registers window.benchmarkRK4()
import {
  initRapier,
  isRapierReady,
  buildRapierWorld,
  stepRapierSimulation,
  destroyRapierWorld,
  syncRapierToState,
  isRapierWorldBuilt,
} from './engine/rapierEngine'

export type MobileTab = 'viewport' | 'params' | 'simulation' | 'graphs'

export interface PerfStats {
  fps: number
  physicsStepsPerSec: number
  physicsEngine: string
  simTime: number
  wasmReady: boolean
}

export const PerfStatsContext = createContext<PerfStats>({
  fps: 0,
  physicsStepsPerSec: 0,
  physicsEngine: 'rk4',
  simTime: 0,
  wasmReady: false,
})

function App() {
  const animFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const accumRef = useRef<number>(0)
  const prevEngineRef = useRef<string>('rk4')
  const [mobileTab, setMobileTab] = useState<MobileTab>('viewport')

  // Performance stats tracking
  const perfFrameCount = useRef(0)
  const perfStepCount = useRef(0)
  const perfLastSample = useRef(0)
  const [perfStats, setPerfStats] = useState<PerfStats>({
    fps: 0,
    physicsStepsPerSec: 0,
    physicsEngine: 'rk4',
    simTime: 0,
    wasmReady: false,
  })

  const sim = useSimulationStore()
  const vehicle = useVehicleStore()

  // Initialize WASM engines on mount
  useEffect(() => {
    initRapier().catch(console.error)
    initRK4Wasm().catch(console.error)
  }, [])

  // Find static equilibrium on mount and when params change
  useEffect(() => {
    const eqState = findStaticEquilibrium(
      vehicle.vehicle,
      vehicle.frontGeometry,
      vehicle.rearGeometry,
      vehicle.frontShock,
      vehicle.rearShock,
      vehicle.frontSwayBar,
      vehicle.rearSwayBar,
      vehicle.frontSteeringRack,
      vehicle.rearSteeringRack,
      vehicle.hydraulic
    )
    sim.updateState(eqState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const physicsLoop = useCallback((timestamp: number) => {
    const state = useSimulationStore.getState()
    const veh = useVehicleStore.getState()
    const useRapier = state.physicsEngine === 'rapier'

    // Handle engine switch: rebuild Rapier world or clean up
    if (state.physicsEngine !== prevEngineRef.current) {
      prevEngineRef.current = state.physicsEngine
      if (useRapier && isRapierReady()) {
        destroyRapierWorld()
        buildRapierWorld(veh.vehicle, veh.frontGeometry, veh.rearGeometry, state)
        syncRapierToState(state, veh.vehicle)
      } else if (!useRapier) {
        destroyRapierWorld()
      }
    }

    if (!state.running) {
      lastTimeRef.current = timestamp
      animFrameRef.current = requestAnimationFrame(physicsLoop)
      return
    }

    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp
    const frameTime = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05)
    lastTimeRef.current = timestamp

    // Fixed physics timestep from physicsHz; playbackSpeed scales the
    // accumulator so we run more/fewer steps per frame while keeping dt
    // constant (preserves numerical stability of RK4 integration).
    const dt = 1 / state.physicsHz
    accumRef.current += frameTime * state.playbackSpeed
    let steps = 0
    const maxStepsPerFrame = 200

    // Rebuild Rapier world if needed (after drop test, reset, etc.)
    if (useRapier && isRapierReady()) {
      if (state.rapierNeedsRebuild || !isRapierWorldBuilt()) {
        destroyRapierWorld()
        buildRapierWorld(veh.vehicle, veh.frontGeometry, veh.rearGeometry, state)
        syncRapierToState(state, veh.vehicle)
        useSimulationStore.setState({ rapierNeedsRebuild: false })
      }
    }

    // Use a local mutable state for substeps to avoid:
    // 1. Calling setState() every substep (200×/frame Zustand overhead)
    // 2. Re-reading stale state — each substep must use the previous step's output
    let localState = state as typeof state
    let prevLocalState = localState
    while (accumRef.current >= dt && steps < maxStepsPerFrame) {
      let newState: Partial<typeof state>
      if (useRapier && isRapierReady()) {
        newState = stepRapierSimulation(
          localState,
          veh.vehicle,
          veh.frontGeometry,
          veh.rearGeometry,
          veh.frontShock,
          veh.rearShock,
          veh.frontSwayBar,
          veh.rearSwayBar,
          veh.frontSteeringRack,
          veh.rearSteeringRack,
          veh.hydraulic,
          dt
        )
      } else if (localState.physicsEngine === 'rk4-wasm' && isRK4WasmReady()) {
        newState = stepRK4WasmSimulation(
          localState,
          veh.vehicle,
          veh.frontGeometry,
          veh.rearGeometry,
          veh.frontShock,
          veh.rearShock,
          veh.frontSwayBar,
          veh.rearSwayBar,
          veh.frontSteeringRack,
          veh.rearSteeringRack,
          veh.hydraulic,
          dt
        )
      } else if (localState.physicsEngine === 'rk4' || (localState.physicsEngine === 'rk4-wasm' && !isRK4WasmReady())) {
        newState = stepRK4Simulation(
          localState,
          veh.vehicle,
          veh.frontGeometry,
          veh.rearGeometry,
          veh.frontShock,
          veh.rearShock,
          veh.frontSwayBar,
          veh.rearSwayBar,
          veh.frontSteeringRack,
          veh.rearSteeringRack,
          veh.hydraulic,
          dt
        )
      } else {
        newState = stepSimulation(
          localState,
          veh.vehicle,
          veh.frontGeometry,
          veh.rearGeometry,
          veh.frontShock,
          veh.rearShock,
          veh.frontSwayBar,
          veh.rearSwayBar,
          veh.frontSteeringRack,
          veh.rearSteeringRack,
          veh.hydraulic,
          dt
        )
      }
      // Merge into local state for next substep (no store overhead)
      prevLocalState = localState
      localState = { ...localState, ...newState } as typeof state
      accumRef.current -= dt
      steps++
    }
    // Interpolate between last two physics states for smooth rendering.
    // alpha represents how far we are between the last step and the next;
    // without this, the variable step count per frame (e.g. 8 vs 9 at
    // 500Hz/60fps) causes visible stuttering.
    if (steps > 0) {
      const alpha = accumRef.current / dt
      const lerp = (a: number, b: number) => a + alpha * (b - a)
      const lerpCorner = (prev: typeof localState.corners.FL, curr: typeof localState.corners.FL) => ({
        ...curr,
        wheelPosition: lerp(prev.wheelPosition, curr.wheelPosition),
        suspensionCompression: lerp(prev.suspensionCompression, curr.suspensionCompression),
        shockCompression: lerp(prev.shockCompression, curr.shockCompression),
        tyreDeflection: lerp(prev.tyreDeflection, curr.tyreDeflection),
        camberAngle: lerp(prev.camberAngle, curr.camberAngle),
        steeringAngle: lerp(prev.steeringAngle, curr.steeringAngle),
        lowerBJPosition: {
          lateral: lerp(prev.lowerBJPosition.lateral, curr.lowerBJPosition.lateral),
          vertical: lerp(prev.lowerBJPosition.vertical, curr.lowerBJPosition.vertical),
          longitudinal: lerp(prev.lowerBJPosition.longitudinal, curr.lowerBJPosition.longitudinal),
        },
        upperBJPosition: {
          lateral: lerp(prev.upperBJPosition.lateral, curr.upperBJPosition.lateral),
          vertical: lerp(prev.upperBJPosition.vertical, curr.upperBJPosition.vertical),
          longitudinal: lerp(prev.upperBJPosition.longitudinal, curr.upperBJPosition.longitudinal),
        },
      })
      const renderState = {
        ...localState,
        chassisHeave: lerp(prevLocalState.chassisHeave, localState.chassisHeave),
        rollAngle: lerp(prevLocalState.rollAngle, localState.rollAngle),
        pitchAngle: lerp(prevLocalState.pitchAngle, localState.pitchAngle),
        corners: {
          FL: lerpCorner(prevLocalState.corners.FL, localState.corners.FL),
          FR: lerpCorner(prevLocalState.corners.FR, localState.corners.FR),
          RL: lerpCorner(prevLocalState.corners.RL, localState.corners.RL),
          RR: lerpCorner(prevLocalState.corners.RR, localState.corners.RR),
        },
      }
      useSimulationStore.setState(renderState)
    }

    // Update performance counters
    perfFrameCount.current++
    perfStepCount.current += steps
    if (perfLastSample.current === 0) perfLastSample.current = timestamp
    const perfElapsed = timestamp - perfLastSample.current
    if (perfElapsed >= 1000) {
      setPerfStats({
        fps: Math.round(perfFrameCount.current * 1000 / perfElapsed),
        physicsStepsPerSec: Math.round(perfStepCount.current * 1000 / perfElapsed),
        physicsEngine: state.physicsEngine,
        simTime: state.time,
        wasmReady: isRK4WasmReady(),
      })
      perfFrameCount.current = 0
      perfStepCount.current = 0
      perfLastSample.current = timestamp
    }

    // Record graph data at ~30fps
    if (steps > 0) {
      const s = useSimulationStore.getState()
      s.addGraphPoint({
        time: s.time,
        chassisHeave: s.chassisHeave,
        rollAngle: s.rollAngle,
        pitchAngle: s.pitchAngle,
        chassisVelocity: s.chassisHeaveVelocity,
        flWheelPos: s.corners.FL.wheelPosition,
        frWheelPos: s.corners.FR.wheelPosition,
        rlWheelPos: s.corners.RL.wheelPosition,
        rrWheelPos: s.corners.RR.wheelPosition,
        flSpringForce: s.corners.FL.springForce,
        frSpringForce: s.corners.FR.springForce,
        rlSpringForce: s.corners.RL.springForce,
        rrSpringForce: s.corners.RR.springForce,
        flDamperForce: s.corners.FL.damperForce,
        frDamperForce: s.corners.FR.damperForce,
        rlDamperForce: s.corners.RL.damperForce,
        rrDamperForce: s.corners.RR.damperForce,
        flTyreForce: s.corners.FL.tyreContactForce,
        frTyreForce: s.corners.FR.tyreContactForce,
        rlTyreForce: s.corners.RL.tyreContactForce,
        rrTyreForce: s.corners.RR.tyreContactForce,
        flSuspComp: s.corners.FL.suspensionCompression,
        frSuspComp: s.corners.FR.suspensionCompression,
        rlSuspComp: s.corners.RL.suspensionCompression,
        rrSuspComp: s.corners.RR.suspensionCompression,
        flCamber: s.corners.FL.camberAngle,
        frCamber: s.corners.FR.camberAngle,
        rlCamber: s.corners.RL.camberAngle,
        rrCamber: s.corners.RR.camberAngle,
        flScrubRadius: s.corners.FL.scrubRadius,
        frScrubRadius: s.corners.FR.scrubRadius,
        flCasterTrail: s.corners.FL.casterTrail,
        frCasterTrail: s.corners.FR.casterTrail,
        flDynCaster: s.corners.FL.dynamicCaster,
        frDynCaster: s.corners.FR.dynamicCaster,
        flKPI: s.corners.FL.dynamicKPI,
        frKPI: s.corners.FR.dynamicKPI,
        flMotionRatio: s.corners.FL.motionRatio,
        frMotionRatio: s.corners.FR.motionRatio,
        frontRCHeight: s.frontRollCentreHeight,
        rearRCHeight: s.rearRollCentreHeight,
      })
    }

    animFrameRef.current = requestAnimationFrame(physicsLoop)
  }, [])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(physicsLoop)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [physicsLoop])

  return (
    <PerfStatsContext.Provider value={perfStats}>
      <div className="flex flex-col w-full h-full">
        <Header />
        {/* Desktop layout */}
        <div className="hidden md:flex flex-1 min-h-0">
          <LeftSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Viewport />
            <BottomPanel />
          </div>
          <RightSidebar />
        </div>
        {/* Mobile layout */}
        <div className="flex md:hidden flex-1 flex-col min-h-0">
          <div className={`flex-1 min-h-0 flex flex-col ${mobileTab === 'viewport' ? '' : 'hidden'}`}>
            <Viewport />
          </div>
          <div className={`flex-1 min-h-0 overflow-y-auto ${mobileTab === 'params' ? '' : 'hidden'}`}>
            <LeftSidebar mobile />
          </div>
          <div className={`flex-1 min-h-0 overflow-y-auto ${mobileTab === 'simulation' ? '' : 'hidden'}`}>
            <RightSidebar mobile />
          </div>
          <div className={`flex-1 min-h-0 ${mobileTab === 'graphs' ? '' : 'hidden'}`}>
            <BottomPanel mobile />
          </div>
          <MobileTabBar activeTab={mobileTab} onTabChange={setMobileTab} />
        </div>
      </div>
    </PerfStatsContext.Provider>
  )
}

export default App
