import { useState, useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

interface Toast {
    id: string
    title: string
    message: string
    type: 'success' | 'error' | 'info' | 'warning'
    duration?: number
}

interface ToastProps {
    toast: Toast
    onClose: (id: string) => void
}

const ToastItem = ({ toast, onClose }: ToastProps) => {
    useEffect(() => {
        if (toast.duration) {
            const timer = setTimeout(() => onClose(toast.id), toast.duration)
            return () => clearTimeout(timer)
        }
    }, [toast, onClose])

    const bgColor = {
        success: 'bg-green-50 border-green-200',
        error: 'bg-red-50 border-red-200',
        info: 'bg-blue-50 border-blue-200',
        warning: 'bg-yellow-50 border-yellow-200'
    }[toast.type]

    const titleColor = {
        success: 'text-green-800',
        error: 'text-red-800',
        info: 'text-blue-800',
        warning: 'text-yellow-800'
    }[toast.type]

    const messageColor = {
        success: 'text-green-700',
        error: 'text-red-700',
        info: 'text-blue-700',
        warning: 'text-yellow-700'
    }[toast.type]

    const iconColor = {
        success: 'text-green-600',
        error: 'text-red-600',
        info: 'text-blue-600',
        warning: 'text-yellow-600'
    }[toast.type]

    const Icon = {
        success: CheckCircle,
        error: AlertCircle,
        info: Info,
        warning: AlertCircle
    }[toast.type]

    return (
        <div className={`${bgColor} border rounded-lg p-4 shadow-lg max-w-md`}>
            <div className="flex items-start gap-3">
                <Icon className={`${iconColor} flex-shrink-0 mt-0.5`} size={20} />
                <div className="flex-1">
                    <h3 className={`${titleColor} font-semibold text-sm`}>
                        FPT Event Management
                    </h3>
                    <p className={`${messageColor} text-sm mt-1`}>{toast.message}</p>
                </div>
                <button
                    onClick={() => onClose(toast.id)}
                    className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    )
}

interface ToastContainerProps {
    toasts: Toast[]
    onClose: (id: string) => void
}

export const ToastContainer = ({ toasts, onClose }: ToastContainerProps) => {
    return (
        <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-auto">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onClose={onClose} />
            ))}
        </div>
    )
}

// Custom Hook untuk dễ sử dụng
export const useToast = () => {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = (
        title: string,
        message: string,
        type: 'success' | 'error' | 'info' | 'warning' = 'info',
        duration: number = 4000
    ) => {
        const id = Date.now().toString()
        setToasts(prev => [...prev, { id, title, message, type, duration }])
    }

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }

    return {
        toasts,
        addToast,
        removeToast,
        success: (message: string, duration?: number) => addToast('Thành công', message, 'success', duration),
        error: (message: string, duration?: number) => addToast('Lỗi', message, 'error', duration),
        info: (message: string, duration?: number) => addToast('Thông tin', message, 'info', duration),
        warning: (message: string, duration?: number) => addToast('Cảnh báo', message, 'warning', duration)
    }
}
