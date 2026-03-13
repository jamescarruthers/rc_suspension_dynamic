import { useSimulationStore } from '../../store/useSimulationStore'

export function SimControls() {
  const sim = useSimulationStore()

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">STATUS</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-[var(--font-mono)]">
        <span className="text-[#8899AA]">Time</span>
        <span className="text-[#00FFE0]">{sim.time.toFixed(3)} s</span>
        <span className="text-[#8899AA]">Heave</span>
        <span className="text-[#00FFE0]">{sim.chassisHeave.toFixed(2)} mm</span>
        <span className="text-[#8899AA]">Roll</span>
        <span className="text-[#00FFE0]">{sim.rollAngle.toFixed(2)}°</span>
        <span className="text-[#8899AA]">Pitch</span>
        <span className="text-[#00FFE0]">{sim.pitchAngle.toFixed(2)}°</span>
        <span className="text-[#8899AA]">Front RC</span>
        <span className="text-[#00FFE0]">{sim.frontRollCentreHeight.toFixed(1)} mm</span>
        <span className="text-[#8899AA]">Rear RC</span>
        <span className="text-[#00FFE0]">{sim.rearRollCentreHeight.toFixed(1)} mm</span>
      </div>
      <div className="mt-1 pt-1 border-t border-[#1E2D3D]">
        <div className="text-[9px] text-[#556677] font-[var(--font-mono)] mb-1">CORNER LOADS</div>
        <div className="grid grid-cols-2 gap-1 text-[9px] font-[var(--font-mono)]">
          {(['FL', 'FR', 'RL', 'RR'] as const).map((c) => (
            <div key={c} className="flex justify-between">
              <span className="text-[#8899AA]">{c}</span>
              <span className={sim.corners[c].wheelAirborne ? 'text-[#FF6B35]' : 'text-[#00FFE0]'}>
                {sim.corners[c].wheelAirborne ? 'AIR' : `${sim.corners[c].tyreContactForce.toFixed(1)} N`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
