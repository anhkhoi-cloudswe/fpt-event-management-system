import React from 'react'
import { X, AlertTriangle, Info, HelpCircle } from 'lucide-react'
import { createPortal } from 'react-dom'

interface Props {
  isOpen: boolean
  message: string
  onConfirm: () => void
  onClose: () => void
  confirmLabel?: string
  cancelLabel?: string
  type?: 'danger' | 'warning' | 'info'
}

export default function ConfirmModal({
  isOpen,
  message,
  onConfirm,
  onClose,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Huỷ',
  type = 'warning'
}: Props) {
  if (!isOpen) return null

  // Icon and theme selection based on type
  const getThemeConfig = () => {
    switch (type) {
      case 'danger':
        return {
          icon: <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />,
          iconBg: 'bg-red-100 dark:bg-red-950/40',
          confirmBtn: 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 focus:ring-red-500 shadow-red-500/20'
        }
      case 'info':
        return {
          icon: <Info className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
          iconBg: 'bg-blue-100 dark:bg-blue-950/40',
          confirmBtn: 'bg-gradient-to-r from-blue-600 to-blue-505 hover:from-blue-500 hover:to-blue-450 focus:ring-blue-500 shadow-blue-500/20'
        }
      case 'warning':
      default:
        return {
          icon: <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />,
          iconBg: 'bg-orange-100 dark:bg-orange-950/40',
          confirmBtn: 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 focus:ring-orange-500 shadow-orange-500/20'
        }
    }
  }

  const theme = getThemeConfig()

  return createPortal(
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-50 overflow-y-auto backdrop-blur-sm flex items-center justify-center p-4">
      {/* Modal Card: constrained max-width + premium animation */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl dark:shadow-slate-950/75 max-w-md w-full overflow-hidden border border-slate-150 dark:border-slate-800/80 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close button at top right */}
        <div className="flex justify-end p-4 pb-0">
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-850 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal content body */}
        <div className="px-6 pb-6 pt-2 flex flex-col items-center text-center">
          {/* Dynamic Action Icon */}
          <div className={`w-12 h-12 rounded-full ${theme.iconBg} flex items-center justify-center mb-4`}>
            {theme.icon}
          </div>

          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            Xác nhận yêu cầu
          </h3>
          
          <p className="text-slate-650 dark:text-slate-300 text-sm leading-relaxed font-medium px-2">
            {message}
          </p>
        </div>

        {/* Action Buttons footer */}
        <div className="flex gap-3 px-6 py-4 bg-slate-50/70 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800/60">
          <button 
            onClick={onClose} 
            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm transition-all duration-200"
          >
            {cancelLabel}
          </button>
          
          <button 
            onClick={() => { onConfirm(); }} 
            className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold text-sm transition-all duration-200 shadow-lg active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${theme.confirmBtn}`}
          >
            {confirmLabel}
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
