import { useSimulationStore } from '../../store/useSimulationStore'
import { ParamSlider } from '../params/ParamSlider'

export function SteeringInput() {
  const frontSteer = useSimulationStore((s) => s.frontSteeringAngle)
  const setFrontSteer = useSimulationStore((s) => s.setFrontSteeringAngle)
  const rearSteer = useSimulationStore((s) => s.rearSteeringAngle)
  const setRearSteer = useSimulationStore((s) => s.setRearSteeringAngle)

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">STEERING INPUT</div>
      <ParamSlider label="Front Steering" value={frontSteer} min={-30} max={30} step={0.5} unit="°" onChange={setFrontSteer} />
      <ParamSlider label="Rear Steering" value={rearSteer} min={-10} max={10} step={0.5} unit="°" onChange={setRearSteer} />
    </div>
  )
}
