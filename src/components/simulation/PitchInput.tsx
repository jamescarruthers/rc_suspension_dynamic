import { useSimulationStore } from '../../store/useSimulationStore'
import { ParamSlider } from '../params/ParamSlider'

export function PitchInput() {
  const pitchInput = useSimulationStore((s) => s.pitchInput)
  const setPitchInput = useSimulationStore((s) => s.setPitchInput)

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">PITCH INPUT</div>
      <ParamSlider label="Pitch Angle" value={pitchInput} min={-10} max={10} step={0.5} unit="°" onChange={setPitchInput} />
    </div>
  )
}
