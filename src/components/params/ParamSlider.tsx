import { useCallback } from 'react'

interface ParamSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
}

export function ParamSlider({ label, value, min, max, step = 1, unit = '', onChange }: ParamSliderProps) {
  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(e.target.value))
  }, [onChange])

  const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
  }, [onChange, min, max])

  return (
    <div className="flex items-center gap-2 py-0.5">
      <label className="text-[10px] text-[#8899AA] w-[110px] shrink-0 truncate" title={label}>
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleSlider}
        className="flex-1 min-w-0"
      />
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInput}
        />
        {unit && <span className="text-[9px] text-[#556677] w-[28px]">{unit}</span>}
      </div>
    </div>
  )
}
