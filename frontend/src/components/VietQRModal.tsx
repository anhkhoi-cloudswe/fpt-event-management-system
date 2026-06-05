import { Clock } from 'lucide-react'

interface VietQRModalProps {
  isOpen: boolean
  timeLeft: number
  bankTransferOrder: { order_id: number; amount: number } | null
  transferDescription: string
  onClose: () => void
  onCancel: () => void
}

export default function VietQRModal({
  isOpen,
  timeLeft,
  bankTransferOrder,
  transferDescription,
  onClose,
  onCancel
}: VietQRModalProps) {
  if (!isOpen || !bankTransferOrder) return null

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-slate-950 max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col items-center p-6 text-center animate-fade-in">
        {/* Header */}
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Thanh toán chuyển khoản</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Quét mã VietQR để hoàn tất đặt vé</p>

        {/* Countdown Timer synced from props */}
        <div className="flex items-center space-x-1.5 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded-full text-xs font-semibold mb-6 animate-pulse">
          <Clock className="w-3.5 h-3.5" />
          <span>Thời gian giữ vé còn lại: {formatTimeLeft(timeLeft)}</span>
        </div>

        {/* QR Code Container */}
        <div className="bg-gray-50 dark:bg-white p-4 rounded-xl border border-gray-200 dark:border-slate-750 mb-6 relative">
          <img
            src={`https://qr.sepay.vn/img?acc=${import.meta.env.VITE_BANK_ACC || '2911121319'}&bank=${import.meta.env.VITE_BANK_NAME || 'MB'}&amount=${bankTransferOrder.amount}&des=${encodeURIComponent(transferDescription)}`}
            alt="VietQR"
            className="w-64 h-64 object-contain mx-auto"
          />
        </div>

        {/* Transfer Details */}
        <div className="w-full bg-blue-50 bg-opacity-50 dark:bg-slate-800/40 p-4 rounded-xl border border-blue-100 dark:border-slate-800 text-left text-sm space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Ngân hàng:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{import.meta.env.VITE_BANK_NAME || 'MBBank'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Số tài khoản:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{import.meta.env.VITE_BANK_ACC || '2911121319'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Số tiền:</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">{bankTransferOrder.amount.toLocaleString('vi-VN')} đ</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Nội dung chuyển khoản:</span>
            <span className="font-mono font-bold text-red-600 dark:text-red-400">{transferDescription}</span>
          </div>
        </div>

        {/* Status & Spinner */}
        <div className="flex items-center justify-center space-x-3 mb-6">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Đang chờ bạn chuyển khoản chuyển trạng thái...</span>
        </div>

        {/* Actions */}
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            Quay lại chọn phương thức khác
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-750 dark:text-slate-300 font-semibold rounded-lg transition-colors"
          >
            Hủy giao dịch & Giải phóng ghế
          </button>
        </div>
      </div>
    </div>
  )
}

