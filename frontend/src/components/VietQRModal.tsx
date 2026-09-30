import { useState } from 'react'
import { Clock, ExternalLink, Copy, Check, ShieldCheck, AlertCircle } from 'lucide-react'

interface BankTransferOrderData {
  order_id: number
  amount: number
  gateway?: 'payos' | 'sepay'
  checkoutUrl?: string
  qrCode?: string
  bin?: string
  accountNumber?: string
  accountName?: string
  transferDescription?: string
  bankName?: string
}

interface VietQRModalProps {
  isOpen: boolean
  timeLeft: number
  bankTransferOrder: BankTransferOrderData | null
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
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!isOpen || !bankTransferOrder) return null

  const isPayOS = bankTransferOrder.gateway === 'payos'
  const effectiveDescription = isPayOS
    ? (bankTransferOrder.transferDescription || `FEMS DH${bankTransferOrder.order_id}`)
    : (transferDescription || `DH${bankTransferOrder.order_id}`)

  const bankName = isPayOS
    ? (bankTransferOrder.bankName || 'MBBank')
    : (import.meta.env.VITE_BANK_NAME || 'MBBank')

  const accountNumber = isPayOS
    ? (bankTransferOrder.accountNumber || import.meta.env.VITE_BANK_ACC || '2911121319')
    : (import.meta.env.VITE_BANK_ACC || '2911121319')

  const accountName = isPayOS
    ? (bankTransferOrder.accountName || 'FPT EVENT MANAGEMENT')
    : (import.meta.env.VITE_BANK_ACCOUNT_NAME || 'FPT EVENT MANAGEMENT')

  // Generate QR Code URL
  let qrImageSrc = ''
  if (isPayOS && bankTransferOrder.bin && bankTransferOrder.accountNumber) {
    qrImageSrc = `https://img.vietqr.io/image/${bankTransferOrder.bin}-${bankTransferOrder.accountNumber}-compact2.png?amount=${bankTransferOrder.amount}&addInfo=${encodeURIComponent(effectiveDescription)}&accountName=${encodeURIComponent(bankTransferOrder.accountName || '')}`
  } else {
    qrImageSrc = `https://qr.sepay.vn/img?acc=${accountNumber}&bank=${bankName === 'MBBank' ? 'MB' : bankName}&amount=${bankTransferOrder.amount}&des=${encodeURIComponent(effectiveDescription)}`
  }

  const formatTimeLeft = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl dark:shadow-slate-950 max-w-md w-full overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col items-center p-6 text-center max-h-[92vh] overflow-y-auto">
        {/* Gateway Badge */}
        <div className="flex items-center justify-between w-full mb-3">
          {isPayOS ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>payOS Gateway (Mặc định)</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>SePay Backup (Dự phòng)</span>
            </div>
          )}

          {/* Countdown Timer */}
          <div className="flex items-center space-x-1 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 px-2.5 py-1 rounded-full text-xs font-semibold animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTimeLeft(timeLeft)}</span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-1">Thanh toán chuyển khoản</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Quét mã VietQR bằng ứng dụng ngân hàng hoặc mở cổng payOS
        </p>

        {/* QR Code Container */}
        <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 mb-4 relative shadow-inner group">
          <img
            src={qrImageSrc}
            alt="VietQR"
            className="w-56 h-56 sm:w-60 sm:h-60 object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </div>

        {/* PayOS Hosted Checkout Direct Link (if available) */}
        {bankTransferOrder.checkoutUrl && (
          <a
            href={bankTransferOrder.checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full mb-4 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-sm"
          >
            <span>Mở trang thanh toán payOS Checkout</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        )}

        {/* Transfer Details Card */}
        <div className="w-full bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-left text-xs sm:text-sm space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Ngân hàng:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{bankName}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Chủ tài khoản:</span>
            <span className="font-bold text-slate-800 dark:text-slate-200 uppercase">{accountName}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Số tài khoản:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{accountNumber}</span>
              <button
                type="button"
                onClick={() => handleCopy(accountNumber, 'acc')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5"
                title="Sao chép số tài khoản"
              >
                {copiedField === 'acc' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-slate-500 dark:text-slate-400">Số tiền:</span>
            <span className="font-black text-blue-600 dark:text-blue-400 text-base">
              {bankTransferOrder.amount.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-700/60">
            <span className="text-slate-500 dark:text-slate-400">Nội dung CK:</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-red-600 dark:text-red-400 select-all">{effectiveDescription}</span>
              <button
                type="button"
                onClick={() => handleCopy(effectiveDescription, 'des')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-0.5"
                title="Sao chép nội dung"
              >
                {copiedField === 'des' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Live Polling Status Indicator */}
        <div className="flex items-center justify-center space-x-2.5 mb-4 text-xs font-medium text-slate-600 dark:text-slate-300">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Đang tự động kiểm tra giao dịch...</span>
        </div>

        {/* Action Buttons */}
        <div className="w-full space-y-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition-colors text-sm"
          >
            Đóng cửa sổ
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 px-4 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 font-semibold rounded-xl transition-colors text-xs"
          >
            Hủy đơn hàng & Giải phóng ghế
          </button>
        </div>
      </div>
    </div>
  )
}
