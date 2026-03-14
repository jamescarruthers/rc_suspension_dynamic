import { useEffect, useRef, useCallback } from 'react'
import { Header } from './components/layout/Header'
import { LeftSidebar } from './components/layout/LeftSidebar'
import { RightSidebar } from './components/layout/RightSidebar'
import { BottomPanel } from './components/layout/BottomPanel'
import { Viewport } from './components/viewport/Scene'
import { useSimulationStore } from './store/useSimulationStore'
import { useVehicleStore } from './store/useVehicleStore'
import { stepSimulation, findStaticEquilibrium } from './engine/integration'
import {
  initRapier,
  isRapierReady,
  buildRapierWorld,
  stepRapierSimulation,
  destroyRapierWorld,
  syncRapierToState,
  isRapierWorldBuilt,
} from './engine/rapierEngine'

function App() {
  const animFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)
  const accumRef = useRef<number>(0)
  const prevEngineRef = useRef<string>('custom')

  const sim = useSimulationStore()
  const vehicle = useVehicleStore()

  // Initialize Rapier WASM on mount
  useEffect(() => {
    initRapier().catch(console.error)
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

    accumRef.current += frameTime * state.playbackSpeed
    const dt = 0.001
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

    while (accumRef.current >= dt && steps < maxStepsPerFrame) {
      let newState: Partial<typeof state>
      if (useRapier && isRapierReady()) {
        newState = stepRapierSimulation(
          state,
          veh.vehicle,
          veh.frontGeometry,
          veh.rearGeometry,
          veh.frontShock,
          veh.rearShock,
          veh.frontSwayBar,
          veh.rearSwayBar,
          veh.hydraulic,
          dt
        )
      } else {
        newState = stepSimulation(
          state,
          veh.vehicle,
          veh.frontGeometry,
          veh.rearGeometry,
          veh.frontShock,
          veh.rearShock,
          veh.frontSwayBar,
          veh.rearSwayBar,
          veh.hydraulic,
          dt
        )
      }
      useSimulationStore.setState(newState)
      accumRef.current -= dt
      steps++
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
    <div className="flex flex-col w-full h-full">
      <Header />
      <div className="flex flex-1 min-h-0">
        <LeftSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Viewport />
          <BottomPanel />
        </div>
        <RightSidebar />
      </div>
    </div>
  )
}

export default App
