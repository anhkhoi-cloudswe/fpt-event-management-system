import { useState, useEffect } from 'react'
import { X, Settings, Save } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

/**
 * EventConfigModal - Modal cấu hình check-in/check-out cho từng sự kiện
 * 
 * Props:
 * - isOpen: boolean - Hiển thị/ẩn modal
 * - onClose: () => void - Callback khi đóng modal
 * - eventId: number - ID của event cần cấu hình
 * - eventTitle: string - Tên event để hiển thị
 * 
 * API:
 * - GET /api/events/config?eventId=xxx - Lấy config hiện tại
 * - POST /api/events/update-config - Lưu config mới
 */

type EventConfigModalProps = {
    isOpen: boolean
    onClose: () => void
    eventId: number
    eventTitle: string
}

type ConfigData = {
    checkinAllowedBeforeStartMinutes: number
    minMinutesAfterStart: number
    source?: 'per-event' | 'global' // Nguồn config (per-event hoặc global)
}

export function EventConfigModal({
    isOpen,
    onClose,
    eventId,
    eventTitle
}: EventConfigModalProps) {
    const { showToast } = useToast()

    const [config, setConfig] = useState<ConfigData>({
        checkinAllowedBeforeStartMinutes: 30,
        minMinutesAfterStart: 30
    })

    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null

    /**
     * useEffect: Load config khi modal mở
     * ✅ CRITICAL: Mỗi lần isOpen = true, bắt buộc fetch lại API
     */
    useEffect(() => {
        if (!isOpen || !eventId || eventId === 0) {
            // Reset state khi modal đóng
            if (!isOpen) {
                setConfig({
                    checkinAllowedBeforeStartMinutes: 30,
                    minMinutesAfterStart: 30
                })
            }
            return
        }

        const fetchConfig = async () => {
            if (!token) return

            setLoading(true)
            setError(null)

            try {
                // ✅ FETCH: GET /api/events/config?eventId={eventId}
                const res = await fetch(`/api/events/config?eventId=${eventId}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'ngrok-skip-browser-warning': '1'
                    },
                    credentials: 'include'
                })

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`)
                }

                const data = await res.json()

                // ✅ MAP: Gán trực tiếp giá trị từ API vào config
                setConfig({
                    checkinAllowedBeforeStartMinutes:
                        data.checkinAllowedBeforeStartMinutes ?? 30,
                    minMinutesAfterStart: data.minMinutesAfterStart ?? 30,
                    source: data.source || 'global' // ✅ SOURCE: 'global' or 'per-event'
                })
            } catch (err: any) {
                console.error('Fetch event config error:', err)
                setError('Không tải được cấu hình sự kiện')
            } finally {
                setLoading(false)
            }
        }

        fetchConfig()
    }, [isOpen, eventId, token]) // ✅ Re-fetch mỗi lần isOpen hoặc eventId thay đổi

    /**
     * handleChange - Xử lý thay đổi input
     */
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        const numValue = parseInt(value, 10)

        if (
            name === 'minMinutesAfterStart' ||
            name === 'checkinAllowedBeforeStartMinutes'
        ) {
            if (!isNaN(numValue) && numValue >= 0 && numValue <= 600) {
                setConfig(prev => ({ ...prev, [name]: numValue, source: 'per-event' }))
            } else if (value === '') {
                setConfig(prev => ({ ...prev, [name]: 0, source: 'per-event' }))
            }
        }
    }

    /**
     * handleSave - Lưu cấu hình per-event
     * ✅ Sau khi lưu thành công, gọi onClose để modal tự đóng và parent reload
     */
    const handleSave = async () => {
        if (!token || eventId === 0) return

        // Validate
        if (
            config.minMinutesAfterStart < 0 ||
            config.minMinutesAfterStart > 600
        ) {
            showToast('error', 'Thời gian check-out phải từ 0 đến 600')
            return
        }
        if (
            config.checkinAllowedBeforeStartMinutes < 0 ||
            config.checkinAllowedBeforeStartMinutes > 600
        ) {
            showToast('error', 'Thời gian check-in phải từ 0 đến 600')
            return
        }

        setSaving(true)
        setError(null)

        try {
            const res = await fetch('/api/events/update-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'ngrok-skip-browser-warning': '1'
                },
                credentials: 'include',
                body: JSON.stringify({
                    eventId: eventId,
                    checkinAllowedBeforeStartMinutes:
                        config.checkinAllowedBeforeStartMinutes,
                    minMinutesAfterStart: config.minMinutesAfterStart
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data?.error || `HTTP ${res.status}`)
            }

            showToast('success', 'Cấu hình sự kiện đã được cập nhật!')
            onClose() // ✅ Đóng modal → parent sẽ tự reload events
        } catch (err: any) {
            console.error('Save event config error:', err)
            const errorMsg = err?.message || 'Không thể lưu cấu hình'
            setError(errorMsg)
            showToast('error', errorMsg)
        } finally {
            setSaving(false)
        }
    }

    // Không render nếu modal đóng
    if (!isOpen) return null

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 z-40"
                onClick={onClose}
            ></div>

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                            <Settings className="w-6 h-6 text-orange-600" />
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">
                                    Cấu hình Check-in/Check-out
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">{eventTitle}</p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6 space-y-6">
                        {/* Loading */}
                        {loading && (
                            <div className="flex justify-center items-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                            </div>
                        )}

                        {/* Error */}
                        {error && (
                            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-600">{error}</p>
                            </div>
                        )}

                        {/* Form */}
                        {!loading && (
                            <>
                                {/* Check-in Config */}
                                <div className="border border-green-200 bg-green-50/30 rounded-lg p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                        <label className="block text-lg font-semibold text-gray-900">
                                            Thời gian cho phép Check-in trước sự kiện (phút)
                                        </label>
                                        {/* Badge hiển thị nguồn config */}
                                        {config.source === 'global' ? (
                                            <span className="ml-auto px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                                                📋 Đang dùng mặc định
                                            </span>
                                        ) : (
                                            <span className="ml-auto px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                                                ⚙️ Cấu hình riêng
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-sm text-gray-500 mb-4">
                                        Số phút trước khi sự kiện bắt đầu mà người dùng có thể
                                        check-in. Giá trị từ 0 đến 600 phút (10 giờ).
                                    </p>

                                    <div className="flex items-center gap-4">
                                        <input
                                            type="number"
                                            name="checkinAllowedBeforeStartMinutes"
                                            value={config.checkinAllowedBeforeStartMinutes}
                                            onChange={handleChange}
                                            min="0"
                                            max="600"
                                            className="w-32 px-4 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-center text-lg font-medium"
                                        />
                                        <span className="text-gray-600">phút trước khi bắt đầu</span>
                                    </div>

                                    {/* Quick Suggestions */}
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-xs text-gray-400">Gợi ý:</span>
                                        {[15, 30, 60, 120].map(val => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() =>
                                                    setConfig(prev => ({
                                                        ...prev,
                                                        checkinAllowedBeforeStartMinutes: val,
                                                        source: 'per-event'
                                                    }))
                                                }
                                                className={`px-3 py-1 text-xs rounded-full transition-colors ${config.checkinAllowedBeforeStartMinutes === val
                                                        ? 'bg-green-600 text-white'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-green-100 hover:text-green-600'
                                                    }`}
                                            >
                                                {val} phút
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Check-out Config */}
                                <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-6">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                        <label className="block text-lg font-semibold text-gray-900">
                                            Thời gian tối thiểu sau khi sự kiện bắt đầu để Check-out
                                            (phút)
                                        </label>
                                        {/* Badge hiển thị nguồn config */}
                                        {config.source === 'global' ? (
                                            <span className="ml-auto px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                                                📋 Đang dùng mặc định
                                            </span>
                                        ) : (
                                            <span className="ml-auto px-2 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full border border-purple-200">
                                                ⚙️ Cấu hình riêng
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-sm text-gray-500 mb-4">
                                        Số phút tối thiểu sau khi sự kiện bắt đầu mà người dùng mới
                                        có thể check-out. Giá trị từ 0 đến 600 phút (10 giờ).
                                    </p>

                                    <div className="flex items-center gap-4">
                                        <input
                                            type="number"
                                            name="minMinutesAfterStart"
                                            value={config.minMinutesAfterStart}
                                            onChange={handleChange}
                                            min="0"
                                            max="600"
                                            className="w-32 px-4 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center text-lg font-medium"
                                        />
                                        <span className="text-gray-600">phút sau khi bắt đầu</span>
                                    </div>

                                    {/* Quick Suggestions */}
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-xs text-gray-400">Gợi ý:</span>
                                        {[15, 30, 60, 120].map(val => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() =>
                                                    setConfig(prev => ({
                                                        ...prev,
                                                        minMinutesAfterStart: val,
                                                        source: 'per-event'
                                                    }))
                                                }
                                                className={`px-3 py-1 text-xs rounded-full transition-colors ${config.minMinutesAfterStart === val
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-gray-100 text-gray-600 hover:bg-purple-100 hover:text-purple-600'
                                                    }`}
                                            >
                                                {val} phút
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Info Box */}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                    <h3 className="font-semibold text-blue-800 mb-2">
                                        Hướng dẫn
                                    </h3>
                                    <ul className="text-sm text-blue-700 space-y-1">
                                        <li>
                                            • <strong>Check-in</strong>: Người dùng có thể check-in
                                            trước thời gian bắt đầu sự kiện theo số phút đã cấu hình
                                        </li>
                                        <li>
                                            • <strong>Check-out</strong>: Người dùng chỉ có thể
                                            check-out sau khi sự kiện đã bắt đầu được số phút đã cấu
                                            hình
                                        </li>
                                        {config.source === 'global' && (
                                            <li className="mt-2 pt-2 border-t border-blue-200">
                                                ℹ️ <strong>Hiện đang dùng cấu hình hệ thống mặc định</strong>. Sau khi lưu, sự kiện này sẽ dùng cấu hình riêng.
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className="inline-flex items-center px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
