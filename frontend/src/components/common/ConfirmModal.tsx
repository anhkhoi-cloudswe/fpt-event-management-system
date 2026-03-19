import React from 'react'
import { X } from 'lucide-react'

interface Props {
  isOpen: boolean
  message: string
  onConfirm: () => void
  onClose: () => void
  confirmLabel?: string
  cancelLabel?: string
}

export default function ConfirmModal({ isOpen, message, onConfirm, onClose, confirmLabel = 'OK', cancelLabel = 'Huỷ' }: Props) {
  if (!isOpen) return null

  return (
    // ⭐ ABSOLUTE CENTERING: Fixed overlay + centered container
    <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
      {/* Centering wrapper */}
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal Card: responsive width + scrollable */}
        <div className="bg-white rounded-lg shadow-xl max-w-[90vw] w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-lg font-semibold">Xác nhận</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <p className="text-gray-700">{message}</p>
          </div>
          <div className="flex justify-end gap-3 px-4 py-3 border-t">
            <button onClick={onClose} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200">
              {cancelLabel}
            </button>
            <button onClick={() => { onConfirm(); }} className="px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700">
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
