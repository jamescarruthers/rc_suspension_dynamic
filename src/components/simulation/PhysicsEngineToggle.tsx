import { useState } from 'react'
import { useSimulationStore } from '../../store/useSimulationStore'
import type { PhysicsEngineType } from '../../types/suspension'
import { runBenchmark, type BenchmarkResult } from '../../engine/benchmark'

export function PhysicsEngineToggle() {
  const physicsEngine = useSimulationStore((s) => s.physicsEngine)
  const setPhysicsEngine = useSimulationStore((s) => s.setPhysicsEngine)
  const [benchResult, setBenchResult] = useState<BenchmarkResult | null>(null)
  const [benchRunning, setBenchRunning] = useState(false)

  const options: { value: PhysicsEngineType; label: string }[] = [
    { value: 'custom', label: 'Custom' },
    { value: 'rk4', label: 'RK4' },
    { value: 'rk4-wasm', label: 'RK4 WASM' },
    { value: 'rapier', label: 'Rapier' },
  ]

  const handleBenchmark = () => {
    setBenchRunning(true)
    setBenchResult(null)
    // Defer to next frame so UI updates
    requestAnimationFrame(() => {
      const result = runBenchmark(2000)
      setBenchResult(result)
      setBenchRunning(false)
    })
  }

  return (
    <div>
      <div className="text-[9px] text-[#556677] font-[var(--font-mono)] mb-1">PHYSICS ENGINE</div>
      <div className="flex items-center gap-1 bg-[#1A2332] rounded p-0.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPhysicsEngine(opt.value)}
            className={`text-[10px] px-3 py-1 rounded transition-colors ${
              physicsEngine === opt.value
                ? 'bg-[#00FFE0] text-[#0A0E14] font-medium'
                : 'text-[#8899AA] hover:text-[#E0E6ED]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        onClick={handleBenchmark}
        disabled={benchRunning}
        className="mt-1.5 text-[9px] px-2 py-0.5 rounded bg-[#1A2332] text-[#8899AA] hover:text-[#E0E6ED] hover:bg-[#243040] transition-colors disabled:opacity-50"
      >
        {benchRunning ? 'Running...' : 'Benchmark JS vs WASM'}
      </button>
      {benchResult && (
        <div className="mt-1 text-[9px] font-[var(--font-mono)] text-[#8899AA] bg-[#1A2332] rounded p-1.5 leading-relaxed">
          <div>JS: <span className="text-[#E0E6ED]">{benchResult.jsStepsPerSec.toLocaleString()}</span> steps/s ({benchResult.jsTimeMs}ms)</div>
          <div>WASM: <span className="text-[#FF6B00]">{benchResult.wasmStepsPerSec.toLocaleString()}</span> steps/s ({benchResult.wasmTimeMs}ms)</div>
          <div className="text-[#00FFE0] mt-0.5">Speedup: {benchResult.speedup}x</div>
          <div className="text-[#556677]">Drift: {benchResult.maxDrift.toFixed(4)}mm / {benchResult.steps} steps</div>
        </div>
      )}
    </div>
  )
}
