import { useCallback } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { ParamSlider } from './ParamSlider'
import { CollapsibleSection } from './CollapsibleSection'

interface AxleSwayBarParamsProps {
  axle: 'front' | 'rear'
}

export function AxleSwayBarParams({ axle }: AxleSwayBarParamsProps) {
  const isFront = axle === 'front'
  const swayBar = useVehicleStore((s) => isFront ? s.frontSwayBar : s.rearSwayBar)
  const setSwayBar = useVehicleStore((s) => isFront ? s.setFrontSwayBar : s.setRearSwayBar)

  const update = useCallback((key: string, value: number | boolean) => {
    setSwayBar({ [key]: value })
  }, [setSwayBar])

  const title = isFront ? 'Front Anti-Roll Bar' : 'Rear Anti-Roll Bar'

  // Torsional stiffness: G * pi * d^4 / (32 * L) where G = 80 GPa, d = wire diameter, L = arm length
  const G = 80000 // MPa = N/mm²
  const d = swayBar.wireDiameter
  const L = swayBar.armLength
  const torsionalStiffness = (G * Math.PI * Math.pow(d, 4)) / (32 * L)

  return (
    <CollapsibleSection title={title} defaultOpen={false} color="#FF00FF">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 py-0.5">
          <label className="text-[10px] text-[#8899AA] w-[110px]">Enabled</label>
          <input
            type="checkbox"
            checked={swayBar.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="accent-[#FF00FF]"
          />
        </div>
        {swayBar.enabled && (
          <>
            <ParamSlider label="Wire Diameter" value={swayBar.wireDiameter} min={1} max={4} step={0.1} unit="mm" onChange={(v) => update('wireDiameter', v)} />
            <ParamSlider label="Arm Length" value={swayBar.armLength} min={10} max={60} unit="mm" onChange={(v) => update('armLength', v)} />
            <div className="mt-1 pt-1 border-t border-[#1E2D3D]">
              <div className="flex items-center gap-2 text-[10px] font-[var(--font-mono)]">
                <span className="text-[#8899AA]">Stiffness</span>
                <span className="text-[#FF00FF]">{torsionalStiffness.toFixed(1)} N·mm/°</span>
              </div>
            </div>
          </>
        )}
      </div>
    </CollapsibleSection>
  )
}
