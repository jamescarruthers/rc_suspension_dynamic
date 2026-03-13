import { useSimulationStore } from '../../store/useSimulationStore'

export function SpeedControl() {
  const running = useSimulationStore((s) => s.running)
  const playbackSpeed = useSimulationStore((s) => s.playbackSpeed)
  const toggleRunning = useSimulationStore((s) => s.toggleRunning)
  const setPlaybackSpeed = useSimulationStore((s) => s.setPlaybackSpeed)
  const reset = useSimulationStore((s) => s.reset)

  const speeds = [0.1, 0.25, 0.5, 1, 2, 5]

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)]">PLAYBACK</div>
      <div className="flex gap-1">
        <button
          onClick={toggleRunning}
          className={`flex-1 py-1.5 text-[11px] font-medium rounded transition-colors ${
            running
              ? 'bg-[#FF6B35] text-[#0A0E14]'
              : 'bg-[#00FFE0] text-[#0A0E14]'
          }`}
        >
          {running ? 'PAUSE' : 'PLAY'}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1.5 text-[11px] bg-[#1A2332] border border-[#1E2D3D] rounded text-[#8899AA] hover:text-[#E0E6ED] transition-colors"
        >
          RESET
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {speeds.map((s) => (
          <button
            key={s}
            onClick={() => setPlaybackSpeed(s)}
            className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
              playbackSpeed === s
                ? 'bg-[#00FFE0] text-[#0A0E14] border-[#00FFE0]'
                : 'bg-[#1A2332] border-[#1E2D3D] text-[#8899AA] hover:text-[#00FFE0]'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
