import React from 'react'
import { AlertTriangle, CreditCard, X, ArrowLeft } from 'lucide-react'

interface PaymentErrorModalProps {
    isOpen: boolean
    errorType: 'insufficient_balance' | 'duplicate_entry' | 'general' // Type of error
    totalAmount?: number // Total ticket amount
    currentBalance?: number // Current wallet balance
    shortage?: number // Amount shortage
    errorMessage?: string // Custom error message
    onClose: () => void
    onRetryWithVNPay?: () => void
    onReturnToSeats?: () => void // For duplicate entry case
}

/**
 * PaymentErrorModal - Professional modal for wallet payment errors
 * 
 * Handles different error types:
 * - insufficient_balance: Shows shortage amount and VNPay option
 * - duplicate_entry: Shows seat taken message and return to seat selection
 * - general: Shows generic error message
 */
export default function PaymentErrorModal({
    isOpen,
    errorType,
    totalAmount,
    currentBalance,
    shortage,
    errorMessage,
    onClose,
    onRetryWithVNPay,
    onReturnToSeats,
}: PaymentErrorModalProps) {
    if (!isOpen) return null

    const displayBalance = currentBalance ?? 0
    const displayTotal = totalAmount ?? 0
    const displayShortage = shortage ?? 0

    return (
        // ⭐ ABSOLUTE CENTERING: Fixed overlay + centered container
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
            {/* Centering wrapper */}
            <div className="flex items-center justify-center min-h-screen p-4">
                {/* Modal Card: responsive width + scrollable content */}
                <div className="bg-white rounded-lg shadow-2xl max-w-[90vw] w-full max-h-[90vh] overflow-y-auto">
                    {/* Header with red gradient */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 flex items-start justify-between">
                    {/* Icon & Title */}
                    <div className="flex items-start">
                        <AlertTriangle className="w-6 h-6 text-white mr-3 flex-shrink-0 mt-0.5" />
                        <div>
                            <h2 className="text-lg font-bold text-white">
                                {errorType === 'insufficient_balance' && 'Thanh toán không thành công'}
                                {errorType === 'duplicate_entry' && 'Ghế đã được đặt'}
                                {errorType === 'general' && 'Lỗi thanh toán'}
                            </h2>
                            <p className="text-red-100 text-sm mt-1">
                                {errorType === 'insufficient_balance' && 'Số dư ví không đủ'}
                                {errorType === 'duplicate_entry' && 'Vui lòng chọn ghế khác'}
                                {errorType === 'general' && 'Đã có lỗi xảy ra'}
                            </p>
                        </div>
                    </div>

                    {/* Close button */}
                    <button
                        onClick={onClose}
                        className="text-white hover:text-red-100 p-1 rounded hover:bg-red-700/50 transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5">
                    {/* INSUFFICIENT BALANCE Message */}
                    {errorType === 'insufficient_balance' && (
                        <div className="mb-4">
                            <p className="text-gray-700 text-sm leading-relaxed mb-3">
                                Số dư ví không đủ. Bạn còn thiếu <span className="font-bold text-red-600">{displayShortage.toLocaleString('vi-VN')} VNĐ</span> để hoàn tất giao dịch này.
                            </p>

                            {/* Balance Information */}
                            <div className="space-y-2 bg-gray-50 rounded-lg p-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Số dư hiện tại:</span>
                                    <span className="font-semibold text-gray-900">
                                        {displayBalance.toLocaleString('vi-VN')} đ
                                    </span>
                                </div>

                                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                                    <span className="text-gray-600">Tổng tiền cần thanh toán:</span>
                                    <span className="font-semibold text-gray-900">
                                        {displayTotal.toLocaleString('vi-VN')} đ
                                    </span>
                                </div>

                                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                                    <span className="text-red-600 font-semibold">Số tiền thiếu:</span>
                                    <span className="font-bold text-red-600">
                                        {displayShortage.toLocaleString('vi-VN')} đ
                                    </span>
                                </div>
                            </div>

                            {/* Help Text */}
                            <p className="text-xs text-gray-500 mt-3">
                                💡 Vui lòng sử dụng VNPay để thanh toán.
                            </p>
                        </div>
                    )}

                    {/* DUPLICATE ENTRY Message */}
                    {errorType === 'duplicate_entry' && (
                        <div className="mb-4">
                            <p className="text-gray-700 text-sm leading-relaxed mb-3">
                                Rất tiếc! Ghế này vừa có người khác đặt thành công trước bạn một vài giây. Vui lòng chọn ghế khác.
                            </p>

                            {/* Help Icon */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                <p className="text-xs text-blue-700">
                                    💺 Các ghế phổ biến thường được đặt rất nhanh. Vui lòng chọn ghế khác hoặc thử lại sau.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* GENERAL ERROR Message */}
                    {errorType === 'general' && (
                        <div className="mb-4">
                            <p className="text-gray-700 text-sm leading-relaxed mb-3">
                                {errorMessage || 'Đã có lỗi xảy ra trong quá trình xử lý, vui lòng thử lại sau.'}
                            </p>

                            {/* Help Text */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                                <p className="text-xs text-gray-600">
                                    Nếu vấn đề vẫn tiếp diễn, vui lòng liên hệ bộ phận hỗ trợ.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                    {/* Action Buttons */}
                    <div className="px-6 py-4 bg-gray-50 space-y-3">
                    {/* VNPay Button - for insufficient balance */}
                    {errorType === 'insufficient_balance' && onRetryWithVNPay && (
                        <button
                            onClick={onRetryWithVNPay}
                            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition flex items-center justify-center"
                        >
                            <CreditCard className="w-4 h-4 mr-2" />
                            Thanh toán bằng VNPay
                        </button>
                    )}

                    {/* Return to Seats Button - for duplicate entry */}
                    {errorType === 'duplicate_entry' && onReturnToSeats && (
                        <button
                            onClick={onReturnToSeats}
                            className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition flex items-center justify-center"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Quay lại chọn ghế
                        </button>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2.5 rounded-lg bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 transition"
                    >
                        Đóng
                    </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
