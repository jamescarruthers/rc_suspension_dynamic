import { useCallback } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { ParamSlider } from './ParamSlider'
import { CollapsibleSection } from './CollapsibleSection'

export function HydraulicParams() {
  const hydraulic = useVehicleStore((s) => s.hydraulic)
  const setHydraulic = useVehicleStore((s) => s.setHydraulic)

  const update = useCallback((key: string, value: number | boolean | string) => {
    setHydraulic({ [key]: value })
  }, [setHydraulic])

  return (
    <CollapsibleSection title="Hydraulic Linked Suspension" defaultOpen={false} color="#0088FF">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 py-0.5">
          <label className="text-[10px] text-[#8899AA] w-[110px]">Enabled</label>
          <input
            type="checkbox"
            checked={hydraulic.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
            className="accent-[#0088FF]"
          />
        </div>
        {hydraulic.enabled && (
          <>
            <div className="flex items-center gap-2 py-0.5">
              <label className="text-[10px] text-[#8899AA] w-[110px]">Topology</label>
              <select
                value={hydraulic.topology}
                onChange={(e) => update('topology', e.target.value)}
                className="flex-1"
              >
                <option value="lateral">Lateral (L-R per axle)</option>
                <option value="diagonal">Diagonal (FL-RR, FR-RL)</option>
                <option value="full">Full (all four)</option>
              </select>
            </div>
            <ParamSlider label="Cylinder Bore" value={hydraulic.cylinderBore} min={4} max={16} step={0.5} unit="mm" onChange={(v) => update('cylinderBore', v)} />
            <ParamSlider label="Rod Diameter" value={hydraulic.cylinderRodDiameter} min={2} max={10} step={0.5} unit="mm" onChange={(v) => update('cylinderRodDiameter', v)} />
            <ParamSlider label="Fluid Viscosity" value={hydraulic.fluidViscosity} min={5} max={500} step={5} unit="cSt" onChange={(v) => update('fluidViscosity', v)} />
            <ParamSlider label="Orifice Dia" value={hydraulic.orificeDiameter} min={0.1} max={3} step={0.1} unit="mm" onChange={(v) => update('orificeDiameter', v)} />
            <ParamSlider label="Line ID" value={hydraulic.lineInternalDiameter} min={1} max={4} step={0.1} unit="mm" onChange={(v) => update('lineInternalDiameter', v)} />
            <ParamSlider label="Line Length" value={hydraulic.lineLength} min={50} max={500} step={10} unit="mm" onChange={(v) => update('lineLength', v)} />
            <ParamSlider label="Accum Spring" value={hydraulic.accumulatorSpringRate} min={0.5} max={20} step={0.5} unit="N/mm" onChange={(v) => update('accumulatorSpringRate', v)} />
            <ParamSlider label="Accum Preload" value={hydraulic.accumulatorPreload} min={0} max={50} step={1} unit="N" onChange={(v) => update('accumulatorPreload', v)} />
            <div className="flex items-center gap-2 py-0.5">
              <label className="text-[10px] text-[#8899AA] w-[110px]">Height Corrector</label>
              <input
                type="checkbox"
                checked={hydraulic.heightCorrectorEnabled}
                onChange={(e) => update('heightCorrectorEnabled', e.target.checked)}
                className="accent-[#0088FF]"
              />
            </div>
            {hydraulic.heightCorrectorEnabled && (
              <ParamSlider label="Response Time" value={hydraulic.heightCorrectorResponseTime} min={100} max={5000} step={100} unit="ms" onChange={(v) => update('heightCorrectorResponseTime', v)} />
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  )
}
