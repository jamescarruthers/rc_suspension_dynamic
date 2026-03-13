import { useVehicleStore } from '../../store/useVehicleStore'
import { presetMap } from '../../presets'

export function PresetSelector() {
  const loadPreset = useVehicleStore((s) => s.loadPreset)

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">PRESETS</div>
      <div className="space-y-1">
        {Object.entries(presetMap).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => loadPreset(preset)}
            className="w-full text-left text-[10px] px-2 py-1 bg-[#1A2332] border border-[#1E2D3D] rounded text-[#8899AA] hover:text-[#00FFE0] hover:border-[#00FFE0] transition-colors"
          >
            {key === 'buggy18' ? '1:8 Off-Road Buggy' : key === 'buggy110' ? '1:10 4WD Buggy' : '1:10 Touring Car'}
          </button>
        ))}
      </div>
    </div>
  )
}
