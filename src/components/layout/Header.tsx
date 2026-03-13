export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-[#1E2D3D] bg-[#111820]">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-[#00FFE0] font-[var(--font-mono)] tracking-wider">
          RC SUSPENSION LAB
        </h1>
        <span className="text-[10px] text-[#556677] font-[var(--font-mono)]">v1.0</span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-[#8899AA]">
        <span className="font-[var(--font-mono)]">Engineering Dynamics Simulator</span>
      </div>
    </header>
  )
}
