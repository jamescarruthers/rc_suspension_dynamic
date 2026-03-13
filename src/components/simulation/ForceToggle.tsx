import { useSimulationStore } from '../../store/useSimulationStore'
import { ParamSlider } from '../params/ParamSlider'

const forceTypes = [
  { key: 'weight', label: 'Weight', color: '#FF0000' },
  { key: 'unsprungWeight', label: 'Unsprung Wt', color: '#990000' },
  { key: 'groundReaction', label: 'Ground Rxn', color: '#00FF00' },
  { key: 'springForce', label: 'Spring', color: '#FFD700' },
  { key: 'damperForce', label: 'Damper', color: '#FF6B35' },
  { key: 'bumpStop', label: 'Bump Stop', color: '#FF3333' },
  { key: 'swayBar', label: 'Sway Bar', color: '#FF00FF' },
  { key: 'hydraulic', label: 'Hydraulic', color: '#00FFE0' },
]

export function ForceToggle() {
  const forceVisibility = useSimulationStore((s) => s.forceVisibility)
  const toggleForceVisibility = useSimulationStore((s) => s.toggleForceVisibility)
  const forceScale = useSimulationStore((s) => s.forceScale)
  const setForceScale = useSimulationStore((s) => s.setForceScale)

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">FORCE ARROWS</div>
      <div className="space-y-0.5">
        {forceTypes.map(({ key, label, color }) => (
          <label key={key} className="flex items-center gap-2 text-[10px] cursor-pointer">
            <input
              type="checkbox"
              checked={forceVisibility[key] || false}
              onChange={() => toggleForceVisibility(key)}
              style={{ accentColor: color }}
            />
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[#8899AA]">{label}</span>
          </label>
        ))}
      </div>
      <ParamSlider label="Scale" value={forceScale} min={0.5} max={5} step={0.5} onChange={setForceScale} />
    </div>
  )
}
