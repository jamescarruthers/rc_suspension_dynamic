import { useState } from 'react'
import { SimModeToggle } from '../simulation/SimModeToggle'
import { PhysicsEngineToggle } from '../simulation/PhysicsEngineToggle'
import { SimControls } from '../simulation/SimControls'
import { DropTestInput } from '../simulation/DropTestInput'
import { RollInput } from '../simulation/RollInput'
import { PitchInput } from '../simulation/PitchInput'
import { SteeringInput } from '../simulation/SteeringInput'
import { RoadSurfaceInput } from '../simulation/RoadSurfaceInput'
import { SpeedControl } from '../simulation/SpeedControl'
import { ForceToggle } from '../simulation/ForceToggle'
import { PresetSelector } from '../simulation/PresetSelector'

export function RightSidebar({ mobile = false }: { mobile?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)

  if (!mobile && collapsed) {
    return (
      <div className="w-8 bg-[#111820] border-l border-[#1E2D3D] flex flex-col items-center pt-2">
        <button
          onClick={() => setCollapsed(false)}
          className="text-[#8899AA] hover:text-[#00FFE0] text-xs"
          title="Expand"
        >
          ◀
        </button>
      </div>
    )
  }

  if (mobile) {
    return (
      <div className="flex-1 bg-[#111820] flex flex-col min-h-0">
        <div className="flex items-center px-3 py-2 border-b border-[#1E2D3D]">
          <span className="text-xs text-[#556677] font-[var(--font-mono)]">SIMULATION</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <SimModeToggle />
          <PhysicsEngineToggle />
          <SpeedControl />
          <SimControls />
          <DropTestInput />
          <RollInput />
          <PitchInput />
          <SteeringInput />
          <RoadSurfaceInput />
          <ForceToggle />
          <PresetSelector />
        </div>
      </div>
    )
  }

  return (
    <div className="w-[220px] bg-[#111820] border-l border-[#1E2D3D] flex flex-col min-h-0 shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1E2D3D]">
        <span className="text-[10px] text-[#556677] font-[var(--font-mono)]">SIMULATION</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[#556677] hover:text-[#00FFE0] text-xs"
          title="Collapse"
        >
          ▶
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        <SimModeToggle />
        <PhysicsEngineToggle />
        <SpeedControl />
        <SimControls />
        <DropTestInput />
        <RollInput />
        <PitchInput />
        <RoadSurfaceInput />
        <ForceToggle />
        <PresetSelector />
      </div>
    </div>
  )
}
