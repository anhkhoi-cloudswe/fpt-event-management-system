import { X } from 'lucide-react'
import { Venue } from '../../services/venueService'

interface VenueFormModalProps {
  isOpen: boolean
  venue: Venue | null
  onClose: () => void
  onSubmit: (data: { venueId: number; venueName: string; address: string }) => Promise<void>
}

export default function VenueFormModal({ isOpen, venue, onClose, onSubmit }: VenueFormModalProps) {
  const [formData, setFormData] = React.useState({
    venueId: 0,
    venueName: '',
    address: '',
  })
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (venue) {
      setFormData({
        venueId: venue.venueId,
        venueName: venue.venueName,
        address: venue.address,
      })
    } else {
      setFormData({
        venueId: 0,
        venueName: '',
        address: '',
      })
    }
  }, [venue, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await onSubmit(formData)
      onClose()
    } catch (error) {
      console.error('Error submitting venue:', error)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">
            {venue ? 'Chỉnh sửa địa điểm' : 'Thêm địa điểm mới'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tên địa điểm *
            </label>
            <input
              type="text"
              required
              value={formData.venueName}
              onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nhập tên địa điểm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Địa chỉ *
            </label>
            <input
              type="text"
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nhập địa chỉ"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400"
            >
              {submitting ? 'Đang lưu...' : (venue ? 'Cập nhật' : 'Thêm mới')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Add React import
import React from 'react'
