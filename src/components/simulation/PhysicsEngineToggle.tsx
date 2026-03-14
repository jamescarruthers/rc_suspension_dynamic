import { useSimulationStore } from '../../store/useSimulationStore'
import type { PhysicsEngineType } from '../../types/suspension'

export function PhysicsEngineToggle() {
  const physicsEngine = useSimulationStore((s) => s.physicsEngine)
  const setPhysicsEngine = useSimulationStore((s) => s.setPhysicsEngine)

  const options: { value: PhysicsEngineType; label: string }[] = [
    { value: 'custom', label: 'Custom' },
    { value: 'rk4', label: 'RK4' },
    { value: 'rk4-wasm', label: 'RK4 WASM' },
    { value: 'rapier', label: 'Rapier' },
  ]

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
    </div>
  )
}
