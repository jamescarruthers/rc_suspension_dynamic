import { useSimulationStore } from '../../store/useSimulationStore'
import { ParamSlider } from '../params/ParamSlider'

export function DropTestInput() {
  const dropHeight = useSimulationStore((s) => s.dropHeight)
  const dropRollAngle = useSimulationStore((s) => s.dropRollAngle)
  const dropPitchAngle = useSimulationStore((s) => s.dropPitchAngle)
  const setDropHeight = useSimulationStore((s) => s.setDropHeight)
  const setDropRollAngle = useSimulationStore((s) => s.setDropRollAngle)
  const setDropPitchAngle = useSimulationStore((s) => s.setDropPitchAngle)
  const triggerDrop = useSimulationStore((s) => s.triggerDrop)

  const presets = [
    { name: 'Flat', height: 20, roll: 0, pitch: 0 },
    { name: 'Nose-first', height: 20, roll: 0, pitch: -15 },
    { name: 'One-corner', height: 20, roll: 5, pitch: -5 },
    { name: 'Jump landing', height: 50, roll: 0, pitch: 0 },
  ]

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">DROP TEST</div>
      <ParamSlider label="Height" value={dropHeight} min={0} max={100} unit="mm" onChange={setDropHeight} />
      <ParamSlider label="Roll" value={dropRollAngle} min={-15} max={15} step={0.5} unit="°" onChange={setDropRollAngle} />
      <ParamSlider label="Pitch" value={dropPitchAngle} min={-15} max={15} step={0.5} unit="°" onChange={setDropPitchAngle} />
      <button
        onClick={triggerDrop}
        className="w-full py-1.5 text-[11px] font-medium bg-[#FF6B35] text-[#0A0E14] rounded hover:bg-[#FF8555] transition-colors"
      >
        DROP
      </button>
      <div className="flex flex-wrap gap-1 mt-1">
        {presets.map((p) => (
          <button
            key={p.name}
            onClick={() => {
              setDropHeight(p.height)
              setDropRollAngle(p.roll)
              setDropPitchAngle(p.pitch)
            }}
            className="text-[9px] px-2 py-0.5 bg-[#1A2332] border border-[#1E2D3D] rounded text-[#8899AA] hover:text-[#FF6B35] hover:border-[#FF6B35] transition-colors"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  )
}
