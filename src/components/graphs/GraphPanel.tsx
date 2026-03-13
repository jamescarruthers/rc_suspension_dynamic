import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts'
import { useSimulationStore } from '../../store/useSimulationStore'

const channelConfig: Record<string, { label: string; color: string; unit: string }> = {
  chassisHeave: { label: 'Chassis Heave', color: '#00FFE0', unit: 'mm' },
  rollAngle: { label: 'Roll Angle', color: '#FF6B35', unit: '°' },
  pitchAngle: { label: 'Pitch Angle', color: '#FF00FF', unit: '°' },
  chassisVelocity: { label: 'Chassis Velocity', color: '#00FF88', unit: 'mm/s' },
  flWheelPos: { label: 'FL Wheel', color: '#00FFE0', unit: 'mm' },
  frWheelPos: { label: 'FR Wheel', color: '#80FFF0', unit: 'mm' },
  rlWheelPos: { label: 'RL Wheel', color: '#0088FF', unit: 'mm' },
  rrWheelPos: { label: 'RR Wheel', color: '#FF6B35', unit: 'mm' },
  flSpringForce: { label: 'FL Spring F', color: '#FFD700', unit: 'N' },
  frSpringForce: { label: 'FR Spring F', color: '#FFD780', unit: 'N' },
  rlSpringForce: { label: 'RL Spring F', color: '#FFA500', unit: 'N' },
  rrSpringForce: { label: 'RR Spring F', color: '#FF8C00', unit: 'N' },
  flTyreForce: { label: 'FL Tyre F', color: '#00FF00', unit: 'N' },
  frTyreForce: { label: 'FR Tyre F', color: '#80FF80', unit: 'N' },
  rlTyreForce: { label: 'RL Tyre F', color: '#00CC00', unit: 'N' },
  rrTyreForce: { label: 'RR Tyre F', color: '#66FF66', unit: 'N' },
  flSuspComp: { label: 'FL Susp Comp', color: '#00FFE0', unit: 'mm' },
  frSuspComp: { label: 'FR Susp Comp', color: '#80FFF0', unit: 'mm' },
  rlSuspComp: { label: 'RL Susp Comp', color: '#0088FF', unit: 'mm' },
  rrSuspComp: { label: 'RR Susp Comp', color: '#FF6B35', unit: 'mm' },
  flCamber: { label: 'FL Camber', color: '#00FFE0', unit: '°' },
  frCamber: { label: 'FR Camber', color: '#80FFF0', unit: '°' },
  rlCamber: { label: 'RL Camber', color: '#0088FF', unit: '°' },
  rrCamber: { label: 'RR Camber', color: '#FF6B35', unit: '°' },
  frontRCHeight: { label: 'Front RC Height', color: '#FF00FF', unit: 'mm' },
  rearRCHeight: { label: 'Rear RC Height', color: '#FF6B35', unit: 'mm' },
}

export function GraphPanel() {
  const graphChannels = useSimulationStore((s) => s.graphChannels)
  const graphHistory = useSimulationStore((s) => s.graphHistory)
  const graphTimeWindow = useSimulationStore((s) => s.graphTimeWindow)
  const setGraphChannels = useSimulationStore((s) => s.setGraphChannels)
  const setGraphTimeWindow = useSimulationStore((s) => s.setGraphTimeWindow)

  const filteredHistory = useMemo(() => {
    if (graphHistory.length === 0) return []
    const latestTime = graphHistory[graphHistory.length - 1].time
    const windowStart = latestTime - graphTimeWindow
    return graphHistory.filter((p) => p.time >= windowStart)
  }, [graphHistory, graphTimeWindow])

  return (
    <div className="flex flex-col h-full">
      {/* Channel selector */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-[#1E2D3D] overflow-x-auto">
        <span className="text-[9px] text-[#556677] font-[var(--font-mono)] shrink-0">CHANNELS:</span>
        <div className="flex gap-1 flex-wrap">
          {Object.entries(channelConfig).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => {
                if (graphChannels.includes(key)) {
                  setGraphChannels(graphChannels.filter((c) => c !== key))
                } else {
                  setGraphChannels([...graphChannels, key])
                }
              }}
              className={`text-[8px] px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
                graphChannels.includes(key)
                  ? 'border-current text-current'
                  : 'border-[#1E2D3D] text-[#556677] hover:text-[#8899AA]'
              }`}
              style={graphChannels.includes(key) ? { color: cfg.color } : undefined}
            >
              {cfg.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 shrink-0 ml-auto">
          {[2, 5, 10].map((t) => (
            <button
              key={t}
              onClick={() => setGraphTimeWindow(t)}
              className={`text-[9px] px-2 py-0.5 rounded border ${
                graphTimeWindow === t
                  ? 'bg-[#00FFE0] text-[#0A0E14] border-[#00FFE0]'
                  : 'border-[#1E2D3D] text-[#556677]'
              }`}
            >
              {t}s
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0 px-2 py-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D3D" />
            <XAxis
              dataKey="time"
              stroke="#556677"
              tick={{ fontSize: 9, fill: '#556677' }}
              tickFormatter={(v: number) => v.toFixed(1)}
              type="number"
              domain={['dataMin', 'dataMax']}
            />
            <YAxis
              stroke="#556677"
              tick={{ fontSize: 9, fill: '#556677' }}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              contentStyle={{
                background: '#151C25',
                border: '1px solid #1E2D3D',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
              labelFormatter={(v) => `t=${Number(v).toFixed(3)}s`}
            />
            {graphChannels.map((ch) => {
              const cfg = channelConfig[ch]
              if (!cfg) return null
              return (
                <Line
                  key={ch}
                  type="monotone"
                  dataKey={ch}
                  stroke={cfg.color}
                  dot={false}
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  name={cfg.label}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
