import { useState } from 'react'
import { VehicleParams } from '../params/VehicleParams'
import { AxleGeometryParams } from '../params/AxleGeometryParams'
import { AxleShockParams } from '../params/AxleShockParams'
import { AxleSwayBarParams } from '../params/AxleSwayBarParams'
import { HydraulicParams } from '../params/HydraulicParams'
import { CopyAxleButton } from '../params/CopyAxleButton'

export function LeftSidebar() {
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="w-8 bg-[#111820] border-r border-[#1E2D3D] flex flex-col items-center pt-2">
        <button
          onClick={() => setCollapsed(false)}
          className="text-[#8899AA] hover:text-[#00FFE0] text-xs"
          title="Expand"
        >
          ▶
        </button>
      </div>
    )
  }

  return (
    <div className="w-[280px] bg-[#111820] border-r border-[#1E2D3D] flex flex-col min-h-0 shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#1E2D3D]">
        <span className="text-[10px] text-[#556677] font-[var(--font-mono)]">PARAMETERS</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[#556677] hover:text-[#00FFE0] text-xs"
          title="Collapse"
        >
          ◀
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <VehicleParams />
        <AxleGeometryParams axle="front" />
        <CopyAxleButton type="geometry" />
        <AxleGeometryParams axle="rear" />
        <AxleShockParams axle="front" />
        <CopyAxleButton type="shock" />
        <AxleShockParams axle="rear" />
        <AxleSwayBarParams axle="front" />
        <CopyAxleButton type="swayBar" />
        <AxleSwayBarParams axle="rear" />
        <HydraulicParams />
      </div>
    </div>
  )
}
