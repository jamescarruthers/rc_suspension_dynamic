import { useCallback } from 'react'
import { useVehicleStore } from '../../store/useVehicleStore'
import { ParamSlider } from './ParamSlider'
import { CollapsibleSection } from './CollapsibleSection'
import type { AxleGeometry } from '../../types/suspension'

interface AxleGeometryParamsProps {
  axle: 'front' | 'rear'
}

export function AxleGeometryParams({ axle }: AxleGeometryParamsProps) {
  const isFront = axle === 'front'
  const geometry = useVehicleStore((s) => isFront ? s.frontGeometry : s.rearGeometry)
  const setGeometry = useVehicleStore((s) => isFront ? s.setFrontGeometry : s.setRearGeometry)

  const update = useCallback((key: keyof AxleGeometry, value: number) => {
    setGeometry({ [key]: value })
  }, [setGeometry])

  const title = isFront ? 'Front Suspension Geometry' : 'Rear Suspension Geometry'

  return (
    <CollapsibleSection title={title} defaultOpen={isFront}>
      <div className="space-y-0.5">
        <ParamSlider label="Track Width" value={geometry.trackWidth} min={150} max={350} unit="mm" onChange={(v) => update('trackWidth', v)} />
        <ParamSlider label="Lower WB Ratio" value={geometry.lowerWishboneRatio} min={0.2} max={0.8} step={0.01} onChange={(v) => update('lowerWishboneRatio', v)} />
        <ParamSlider label="Upper Arm Ratio" value={geometry.upperArmLengthRatio} min={0.2} max={1.0} step={0.05} onChange={(v) => update('upperArmLengthRatio', v)} />
        <ParamSlider label="Lower Arm Angle" value={geometry.lowerArmAngle} min={-15} max={15} step={0.5} unit="°" onChange={(v) => update('lowerArmAngle', v)} />
        <ParamSlider label="Upper Arm Angle" value={geometry.upperArmAngle} min={-15} max={15} step={0.5} unit="°" onChange={(v) => update('upperArmAngle', v)} />
        <ParamSlider label="Upright Height" value={geometry.uprightHeight} min={5} max={40} step={0.5} unit="mm" onChange={(v) => update('uprightHeight', v)} />
        <ParamSlider label="Lower Pivot Spread" value={geometry.innerPivotSpread} min={15} max={50} unit="mm" onChange={(v) => update('innerPivotSpread', v)} />
        <ParamSlider label="Upper Pivot Spread" value={geometry.upperInnerPivotSpread} min={10} max={50} unit="mm" onChange={(v) => update('upperInnerPivotSpread', v)} />
        <ParamSlider label="Outer Width Ratio" value={geometry.wishboneOuterWidthRatio} min={0.1} max={0.6} step={0.05} onChange={(v) => update('wishboneOuterWidthRatio', v)} />
        <ParamSlider label="Hub Offset" value={geometry.hubOffset} min={0} max={20} step={0.5} unit="mm" onChange={(v) => update('hubOffset', v)} />
        {(isFront || geometry.kpiAngle > 0) && (
          <ParamSlider label="KPI" value={geometry.kpiAngle} min={0} max={15} step={0.5} unit="°" onChange={(v) => update('kpiAngle', v)} />
        )}
        {(isFront || geometry.casterAngle > 0) && (
          <ParamSlider label="Caster" value={geometry.casterAngle} min={0} max={35} step={0.5} unit="°" onChange={(v) => update('casterAngle', v)} />
        )}
        <ParamSlider label="Static Camber" value={geometry.staticCamber} min={-5} max={2} step={0.25} unit="°" onChange={(v) => update('staticCamber', v)} />
        <ParamSlider label="Static Toe" value={geometry.staticToe} min={-3} max={isFront ? 3 : 5} step={0.25} unit="°" onChange={(v) => update('staticToe', v)} />
        <ParamSlider label="Ackermann Arm" value={geometry.ackermannArmLength} min={5} max={40} step={0.5} unit="mm" onChange={(v) => update('ackermannArmLength', v)} />
        {isFront && (
          <ParamSlider label="Anti-Dive" value={geometry.antiDive} min={0} max={15} step={0.5} unit="°" onChange={(v) => update('antiDive', v)} />
        )}
        {!isFront && (
          <ParamSlider label="Anti-Squat" value={geometry.antiSquat} min={0} max={6} step={0.5} unit="°" onChange={(v) => update('antiSquat', v)} />
        )}
      </div>
    </CollapsibleSection>
  )
}
