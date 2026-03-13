import { useSimulationStore } from '../../store/useSimulationStore'
import { ParamSlider } from '../params/ParamSlider'
import type { Corner } from '../../types/suspension'

export function RoadSurfaceInput() {
  const roadSurfaceType = useSimulationStore((s) => s.roadSurfaceType)
  const roadBumpHeight = useSimulationStore((s) => s.roadBumpHeight)
  const roadBumpWidth = useSimulationStore((s) => s.roadBumpWidth)
  const roadBumpShape = useSimulationStore((s) => s.roadBumpShape)
  const roadSpeed = useSimulationStore((s) => s.roadSpeed)
  const roadFrequency = useSimulationStore((s) => s.roadFrequency)
  const roadAmplitude = useSimulationStore((s) => s.roadAmplitude)
  const roadTargetCorner = useSimulationStore((s) => s.roadTargetCorner)
  const setRoadSurface = useSimulationStore((s) => s.setRoadSurface)

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">ROAD SURFACE</div>
      <div className="flex items-center gap-2 py-0.5">
        <label className="text-[10px] text-[#8899AA] w-[70px]">Type</label>
        <select
          value={roadSurfaceType}
          onChange={(e) => setRoadSurface({ roadSurfaceType: e.target.value })}
          className="flex-1"
        >
          <option value="flat">Flat</option>
          <option value="singleBump">Single Bump</option>
          <option value="speedBump">Speed Bump</option>
          <option value="diagonalTwist">Diagonal Twist</option>
          <option value="washboard">Washboard</option>
          <option value="step">Step</option>
          <option value="random">Random</option>
        </select>
      </div>

      {roadSurfaceType !== 'flat' && (
        <>
          {(roadSurfaceType === 'singleBump' || roadSurfaceType === 'speedBump' || roadSurfaceType === 'step') && (
            <>
              <div className="flex items-center gap-2 py-0.5">
                <label className="text-[10px] text-[#8899AA] w-[70px]">Target</label>
                <select
                  value={roadTargetCorner}
                  onChange={(e) => setRoadSurface({ roadTargetCorner: e.target.value as Corner | 'front' | 'rear' | 'all' })}
                  className="flex-1"
                >
                  <option value="FL">Front Left</option>
                  <option value="FR">Front Right</option>
                  <option value="RL">Rear Left</option>
                  <option value="RR">Rear Right</option>
                  <option value="front">Front Axle</option>
                  <option value="rear">Rear Axle</option>
                  <option value="all">All</option>
                </select>
              </div>
              {roadSurfaceType !== 'step' && (
                <div className="flex items-center gap-2 py-0.5">
                  <label className="text-[10px] text-[#8899AA] w-[70px]">Shape</label>
                  <select
                    value={roadBumpShape}
                    onChange={(e) => setRoadSurface({ roadBumpShape: e.target.value })}
                    className="flex-1"
                  >
                    <option value="halfsine">Half Sine</option>
                    <option value="triangle">Triangle</option>
                    <option value="square">Square</option>
                  </select>
                </div>
              )}
            </>
          )}

          {roadSurfaceType !== 'washboard' && roadSurfaceType !== 'random' && (
            <ParamSlider label="Height" value={roadBumpHeight} min={1} max={30} step={0.5} unit="mm" onChange={(v) => setRoadSurface({ roadBumpHeight: v })} />
          )}

          {(roadSurfaceType === 'singleBump' || roadSurfaceType === 'speedBump') && (
            <ParamSlider label="Width" value={roadBumpWidth} min={5} max={200} step={5} unit="mm" onChange={(v) => setRoadSurface({ roadBumpWidth: v })} />
          )}

          <ParamSlider label="Speed" value={roadSpeed} min={10} max={2000} step={10} unit="mm/s" onChange={(v) => setRoadSurface({ roadSpeed: v })} />

          {roadSurfaceType === 'washboard' && (
            <>
              <ParamSlider label="Amplitude" value={roadAmplitude} min={0.5} max={10} step={0.5} unit="mm" onChange={(v) => setRoadSurface({ roadAmplitude: v })} />
              <ParamSlider label="Frequency" value={roadFrequency} min={1} max={50} step={1} unit="Hz" onChange={(v) => setRoadSurface({ roadFrequency: v })} />
            </>
          )}
        </>
      )}
    </div>
  )
}
