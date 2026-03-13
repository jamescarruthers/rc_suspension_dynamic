import { useSimulationStore } from '../../store/useSimulationStore'

export function SimModeToggle() {
  const mode = useSimulationStore((s) => s.mode)
  const setMode = useSimulationStore((s) => s.setMode)

  return (
    <div className="flex items-center gap-1 bg-[#1A2332] rounded p-0.5">
      <button
        onClick={() => setMode('kinematic')}
        className={`text-[10px] px-3 py-1 rounded transition-colors ${
          mode === 'kinematic'
            ? 'bg-[#00FFE0] text-[#0A0E14] font-medium'
            : 'text-[#8899AA] hover:text-[#E0E6ED]'
        }`}
      >
        Kinematic
      </button>
      <button
        onClick={() => setMode('dynamic')}
        className={`text-[10px] px-3 py-1 rounded transition-colors ${
          mode === 'dynamic'
            ? 'bg-[#00FFE0] text-[#0A0E14] font-medium'
            : 'text-[#8899AA] hover:text-[#E0E6ED]'
        }`}
      >
        Dynamic
      </button>
    </div>
  )
}
