import { useVehicleStore } from '../../store/useVehicleStore'

interface CopyAxleButtonProps {
  type: 'geometry' | 'shock' | 'swayBar'
}

export function CopyAxleButton({ type }: CopyAxleButtonProps) {
  const store = useVehicleStore()

  const copyFrontToRear = () => {
    if (type === 'geometry') store.copyFrontToRear()
    else if (type === 'shock') store.setRearShock({ ...store.frontShock })
    else if (type === 'swayBar') store.setRearSwayBar({ ...store.frontSwayBar })
  }

  const copyRearToFront = () => {
    if (type === 'geometry') store.copyRearToFront()
    else if (type === 'shock') store.setFrontShock({ ...store.rearShock })
    else if (type === 'swayBar') store.setFrontSwayBar({ ...store.rearSwayBar })
  }

  return (
    <div className="flex gap-2 py-1 px-3">
      <button
        onClick={copyFrontToRear}
        className="flex-1 text-[9px] py-1 px-2 bg-[#1A2332] border border-[#1E2D3D] rounded text-[#8899AA] hover:text-[#00FFE0] hover:border-[#00FFE0] transition-colors"
      >
        Copy F → R
      </button>
      <button
        onClick={copyRearToFront}
        className="flex-1 text-[9px] py-1 px-2 bg-[#1A2332] border border-[#1E2D3D] rounded text-[#8899AA] hover:text-[#00FFE0] hover:border-[#00FFE0] transition-colors"
      >
        Copy R → F
      </button>
    </div>
  )
}
