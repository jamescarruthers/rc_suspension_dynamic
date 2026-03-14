import type { MobileTab } from '../../App'

interface Props {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
}

const tabs: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'viewport', label: '3D View', icon: '⬡' },
  { id: 'params', label: 'Params', icon: '⚙' },
  { id: 'simulation', label: 'Sim', icon: '▶' },
  { id: 'graphs', label: 'Graphs', icon: '📊' },
]

export function MobileTabBar({ activeTab, onTabChange }: Props) {
  return (
    <nav className="flex items-stretch border-t border-[#1E2D3D] bg-[#111820] shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
            activeTab === tab.id
              ? 'text-[#00FFE0] bg-[#151C25]'
              : 'text-[#556677] active:text-[#8899AA]'
          }`}
        >
          <span className="text-base">{tab.icon}</span>
          <span className="font-[var(--font-mono)] text-[10px]">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
