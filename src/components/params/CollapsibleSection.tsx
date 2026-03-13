import { useState, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  color?: string
}

export function CollapsibleSection({ title, defaultOpen = true, children, color = '#00FFE0' }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-[#1E2D3D]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1A2332] transition-colors"
      >
        <span className="text-[10px] transition-transform" style={{ color, transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>
          ▶
        </span>
        <span className="text-[11px] font-medium" style={{ color }}>{title}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          {children}
        </div>
      )}
    </div>
  )
}
