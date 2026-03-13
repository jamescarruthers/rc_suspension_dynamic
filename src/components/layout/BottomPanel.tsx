import { useState } from 'react'
import { GraphPanel } from '../graphs/GraphPanel'

export function BottomPanel() {
  const [height, setHeight] = useState(200)
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div className="border-t border-[#1E2D3D] bg-[#111820]">
        <button
          onClick={() => setCollapsed(false)}
          className="w-full flex items-center justify-center py-1 text-[10px] text-[#556677] hover:text-[#00FFE0]"
        >
          ▲ Show Graphs
        </button>
      </div>
    )
  }

  return (
    <div
      className="border-t border-[#1E2D3D] bg-[#111820] flex flex-col"
      style={{ height }}
    >
      {/* Drag handle */}
      <div
        className="flex items-center justify-between px-3 py-0.5 cursor-ns-resize border-b border-[#1E2D3D]"
        onMouseDown={(e) => {
          const startY = e.clientY
          const startHeight = height
          const onMove = (ev: MouseEvent) => {
            const newHeight = Math.max(100, Math.min(500, startHeight - (ev.clientY - startY)))
            setHeight(newHeight)
          }
          const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
          }
          window.addEventListener('mousemove', onMove)
          window.addEventListener('mouseup', onUp)
        }}
      >
        <span className="text-[9px] text-[#556677] font-[var(--font-mono)]">LIVE GRAPHS</span>
        <button
          onClick={() => setCollapsed(true)}
          className="text-[#556677] hover:text-[#00FFE0] text-xs"
        >
          ▼
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <GraphPanel />
      </div>
    </div>
  )
}
