import { useCallback } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { ParamSlider } from './ParamSlider'
import { CollapsibleSection } from './CollapsibleSection'

export function VehicleParams() {
  const vehicle = useVehicleStore((s) => s.vehicle)
  const setVehicle = useVehicleStore((s) => s.setVehicle)

  const update = useCallback((key: string, value: number | string) => {
    setVehicle({ [key]: value })
  }, [setVehicle])

  // Derived values
  const sprungMass = vehicle.totalWeight - 4 * vehicle.unsprungMassPerCorner
  const frontCornerMass = sprungMass * (vehicle.weightDistribution / 100) / 2
  const rearCornerMass = sprungMass * (1 - vehicle.weightDistribution / 100) / 2

  return (
    <CollapsibleSection title="Vehicle Parameters">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 py-0.5">
          <label className="text-[10px] text-[#8899AA] w-[110px]">Scale</label>
          <select
            value={vehicle.scale}
            onChange={(e) => update('scale', e.target.value)}
            className="flex-1"
          >
            <option value="1:8">1:8</option>
            <option value="1:10">1:10</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <ParamSlider label="Wheelbase" value={vehicle.wheelbase} min={200} max={400} unit="mm" onChange={(v) => update('wheelbase', v)} />
        <ParamSlider label="Total Weight" value={vehicle.totalWeight} min={1000} max={6000} step={50} unit="g" onChange={(v) => update('totalWeight', v)} />
        <ParamSlider label="Weight Dist F/R" value={vehicle.weightDistribution} min={20} max={80} unit="%" onChange={(v) => update('weightDistribution', v)} />
        <ParamSlider label="CG Height" value={vehicle.cgHeight} min={10} max={80} unit="mm" onChange={(v) => update('cgHeight', v)} />
        <ParamSlider label="Ride Height" value={vehicle.rideHeight} min={5} max={50} unit="mm" onChange={(v) => update('rideHeight', v)} />
        <ParamSlider label="Unsprung Mass" value={vehicle.unsprungMassPerCorner} min={20} max={200} unit="g" onChange={(v) => update('unsprungMassPerCorner', v)} />
        <ParamSlider label="Tyre Diameter" value={vehicle.tyreRadius * 2} min={30} max={120} step={1} unit="mm" onChange={(v) => update('tyreRadius', v / 2)} />
        <ParamSlider label="Wheel Diameter" value={vehicle.wheelDiameter} min={20} max={100} step={1} unit="mm" onChange={(v) => update('wheelDiameter', v)} />
        <ParamSlider label="Tyre Width" value={vehicle.tyreWidth} min={15} max={80} step={1} unit="mm" onChange={(v) => update('tyreWidth', v)} />
        <ParamSlider label="Tyre Spring Rate" value={vehicle.tyreSpringRate} min={10} max={500} step={5} unit="N/mm" onChange={(v) => update('tyreSpringRate', v)} />
        <ParamSlider label="Tyre Damping" value={vehicle.tyreDamping} min={0.001} max={0.5} step={0.005} unit="Ns/mm" onChange={(v) => update('tyreDamping', v)} />

        <div className="mt-2 pt-2 border-t border-[#1E2D3D]">
          <div className="text-[9px] text-[#556677] mb-1">DERIVED VALUES</div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-[var(--font-mono)]">
            <span className="text-[#8899AA]">Sprung mass</span>
            <span className="text-[#00FFE0]">{sprungMass.toFixed(0)} g</span>
            <span className="text-[#8899AA]">Corner F</span>
            <span className="text-[#00FFE0]">{frontCornerMass.toFixed(0)} g</span>
            <span className="text-[#8899AA]">Corner R</span>
            <span className="text-[#00FFE0]">{rearCornerMass.toFixed(0)} g</span>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  )
}
