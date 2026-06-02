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
    <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 overflow-y-auto">
      {/* Centering wrapper */}
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal Card: responsive width + scrollable with theme-aware colors */}
        <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl dark:shadow-slate-950/50 max-w-[90vw] w-full max-h-[90vh] overflow-y-auto border dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Xác nhận</h3>
            <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-600 dark:text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <p className="text-slate-700 dark:text-slate-300">{message}</p>
          </div>
          <div className="flex justify-end gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={onClose} className="px-4 py-2 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold transition-colors">
              {cancelLabel}
            </button>
            <button onClick={() => { onConfirm(); }} className="px-4 py-2 rounded bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600 text-white font-semibold transition-colors">
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
