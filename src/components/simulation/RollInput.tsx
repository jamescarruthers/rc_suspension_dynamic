import { useSimulationStore } from '../../store/useSimulationStore'
import { ParamSlider } from '../params/ParamSlider'

export function RollInput() {
  const rollInput = useSimulationStore((s) => s.rollInput)
  const setRollInput = useSimulationStore((s) => s.setRollInput)

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">ROLL INPUT</div>
      <ParamSlider label="Roll Angle" value={rollInput} min={-15} max={15} step={0.5} unit="°" onChange={setRollInput} />
    </div>
  )
}
