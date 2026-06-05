import { X } from 'lucide-react'
import { Venue } from '../../services/venueService'
import React from 'react'

interface VenueFormModalProps {
  isOpen: boolean
  venue: Venue | null
  onClose: () => void
  onSubmit: (data: { venueId: number; venueName: string; location: string }) => Promise<void>
}

export default function VenueFormModal({ isOpen, venue, onClose, onSubmit }: VenueFormModalProps) {
  const [formData, setFormData] = React.useState({
    venueId: 0,
    venueName: '',
    location: '',
  })
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (venue) {
      setFormData({
        venueId: venue.venueId,
        venueName: venue.venueName,
        location: venue.location || '',  // Backend trả về 'location'
      })
    } else {
      setFormData({
        venueId: 0,
        venueName: '',
        location: '',
      })
    }
  }, [venue, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      // Gửi dữ liệu với field 'location' (khớp với Backend API)
      await onSubmit({
        venueId: formData.venueId,
        venueName: formData.venueName,
        location: formData.location,
      })
      onClose()
    } catch (error) {
      console.error('Error submitting venue:', error)
      // Error được xử lý bởi parent component (handleSubmitVenue)
      // showToast sẽ được gọi từ đó
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    // ⭐ ABSOLUTE CENTERING: Fixed overlay + centered container
    <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto backdrop-blur-sm">
      {/* Centering wrapper */}
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal Card: responsive width + scrollable */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800/80 rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 animate-fade-in-up">
          <div className="flex items-center justify-between p-6 border-b border-gray-150 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {venue ? 'Chỉnh sửa địa điểm' : 'Thêm địa điểm mới'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Tên địa điểm *
              </label>
              <input
                type="text"
                required
                disabled={submitting}
                value={formData.venueName}
                onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-950 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-slate-900 transition-all duration-205"
                placeholder="Nhập tên địa điểm"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Địa chỉ *
              </label>
              <input
                type="text"
                required
                disabled={submitting}
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-950 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-slate-900 transition-all duration-205"
                placeholder="Nhập địa chỉ"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-350 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:bg-gray-100 dark:disabled:bg-slate-900"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400"
              >
                {submitting ? 'Đang lưu...' : (venue ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
