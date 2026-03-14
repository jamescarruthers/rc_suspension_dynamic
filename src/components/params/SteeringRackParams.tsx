import { useCallback } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { ParamSlider } from './ParamSlider'
import { CollapsibleSection } from './CollapsibleSection'
import type { SteeringRack } from '../../types/suspension'

interface SteeringRackParamsProps {
  axle: 'front' | 'rear'
}

export function SteeringRackParams({ axle }: SteeringRackParamsProps) {
  const isFront = axle === 'front'
  const rack = useVehicleStore((s) => isFront ? s.frontSteeringRack : s.rearSteeringRack)
  const setRack = useVehicleStore((s) => isFront ? s.setFrontSteeringRack : s.setRearSteeringRack)

  const update = useCallback((key: keyof SteeringRack, value: number) => {
    setRack({ [key]: value })
  }, [setRack])

  const title = isFront ? 'Front Steering Rack' : 'Rear Steering Rack'

  return (
    <CollapsibleSection title={title} defaultOpen={false}>
      <div className="space-y-0.5">
        <ParamSlider label="Rack Width" value={rack.rackWidth} min={40} max={250} step={1} unit="mm" onChange={(v) => update('rackWidth', v)} />
        <ParamSlider label="Rack Height" value={rack.rackHeight} min={5} max={50} step={0.5} unit="mm" onChange={(v) => update('rackHeight', v)} />
        <ParamSlider label="Forward Offset" value={rack.rackForwardOffset} min={-30} max={30} step={0.5} unit="mm" onChange={(v) => update('rackForwardOffset', v)} />
      </div>
    </CollapsibleSection>
  )
}
