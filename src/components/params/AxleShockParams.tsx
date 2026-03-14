import { useCallback } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { ParamSlider } from './ParamSlider'
import { CollapsibleSection } from './CollapsibleSection'
import type { AxleShock } from '../../types/suspension'

interface AxleShockParamsProps {
  axle: 'front' | 'rear'
}

export function AxleShockParams({ axle }: AxleShockParamsProps) {
  const isFront = axle === 'front'
  const shock = useVehicleStore((s) => isFront ? s.frontShock : s.rearShock)
  const setShock = useVehicleStore((s) => isFront ? s.setFrontShock : s.setRearShock)

  const update = useCallback((key: keyof AxleShock, value: number) => {
    setShock({ [key]: value })
  }, [setShock])

  const title = isFront ? 'Front Shock Absorber' : 'Rear Shock Absorber'

  return (
    <CollapsibleSection title={title} defaultOpen={false} color="#FF6B35">
      <div className="space-y-0.5">
        <ParamSlider label="Shock Length" value={shock.shockLength} min={50} max={140} unit="mm" onChange={(v) => update('shockLength', v)} />
        <ParamSlider label="Damper Attach Ratio" value={shock.damperAttachmentRatio} min={0.3} max={0.95} step={0.01} onChange={(v) => update('damperAttachmentRatio', v)} />
        <ParamSlider label="Shock Angle" value={shock.shockAngle} min={0} max={45} step={0.5} unit="°" onChange={(v) => update('shockAngle', v)} />
        <ParamSlider label="Spring Rate" value={shock.springRate} min={1} max={30} step={0.5} unit="N/mm" onChange={(v) => update('springRate', v)} />
        <ParamSlider label="Comp Damping" value={shock.dampingCompression} min={0.01} max={1} step={0.01} unit="Ns/mm" onChange={(v) => update('dampingCompression', v)} />
        <ParamSlider label="Reb Damping" value={shock.dampingRebound} min={0.01} max={1} step={0.01} unit="Ns/mm" onChange={(v) => update('dampingRebound', v)} />
        <ParamSlider label="Max Droop" value={shock.maxDroop} min={5} max={50} unit="mm" onChange={(v) => update('maxDroop', v)} />
        <ParamSlider label="Max Bump" value={shock.maxBump} min={5} max={50} unit="mm" onChange={(v) => update('maxBump', v)} />
      </div>
    </CollapsibleSection>
  )
}
