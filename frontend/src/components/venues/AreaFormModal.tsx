import React from 'react'
import { X } from 'lucide-react'
import { Area } from '../../services/venueService'

interface AreaFormModalProps {
  isOpen: boolean
  area: Area | null
  venueId: number
  onClose: () => void
  onSubmit: (data: {
    areaId: number
    venueId: number
    areaName: string
    floor: number
    capacity: number
    status: string
  }) => Promise<void>
}

export default function AreaFormModal({ isOpen, area, venueId, onClose, onSubmit }: AreaFormModalProps) {
  const [formData, setFormData] = React.useState({
    areaId: 0,
    venueId: 0,
    areaName: '',
    floor: 0,
    capacity: 0,
    status: 'AVAILABLE',
  })
  const [errors, setErrors] = React.useState<{ [key: string]: string }>({})
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (area) {
      setFormData({
        areaId: area.areaId,
        venueId: area.venueId,
        areaName: area.areaName,
        floor: area.floor,
        capacity: area.capacity,
        status: area.status,
      })
    } else {
      setFormData({
        areaId: 0,
        venueId: venueId,
        areaName: '',
        floor: 0,
        capacity: 0,
        status: 'AVAILABLE',
      })
    }
    setErrors({})
  }, [area, venueId, isOpen])

  // Validation logic
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {}

    // Validate tên phòng
    if (!formData.areaName.trim()) {
      newErrors.areaName = 'Tên phòng không được để trống'
    }

    // Validate sức chứa
    const capacity = Number(formData.capacity)
    if (isNaN(capacity) || capacity <= 0) {
      newErrors.capacity = 'Sức chứa phải lớn hơn 0'
    }

    // Validate tầng (floor) - phải là số nguyên
    const floor = Number(formData.floor)
    if (isNaN(floor) || !Number.isInteger(floor)) {
      newErrors.floor = 'Tầng phải là số nguyên'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setSubmitting(true)
    try {
      // Ensure floor and capacity are numbers
      const submitData = {
        ...formData,
        floor: Number(formData.floor),
        capacity: Number(formData.capacity),
      }
      await onSubmit(submitData)
      onClose()
    } catch (error) {
      console.error('Error submitting area:', error)
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
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800/80 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 animate-fade-in-up">
          <div className="flex items-center justify-between p-6 border-b border-gray-150 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {area ? 'Chỉnh sửa phòng' : 'Thêm phòng mới'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Tên phòng *
              </label>
              <input
                type="text"
                required
                value={formData.areaName}
                onChange={(e) => {
                  setFormData({ ...formData, areaName: e.target.value })
                  setErrors({ ...errors, areaName: '' })
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-950 dark:text-white transition-all duration-205 ${
                  errors.areaName ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                placeholder="Nhập tên phòng"
              />
              {errors.areaName && <p className="text-red-500 text-sm mt-1">{errors.areaName}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Tầng *
              </label>
              <input
                type="number"
                required
                value={formData.floor}
                onChange={(e) => {
                  setFormData({ ...formData, floor: parseInt(e.target.value) || 0 })
                  setErrors({ ...errors, floor: '' })
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-955 dark:text-white transition-all duration-205 ${
                  errors.floor ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                placeholder="Nhập số tầng"
              />
              {errors.floor && <p className="text-red-500 text-sm mt-1">{errors.floor}</p>}
              <p className="text-gray-500 dark:text-slate-450 text-xs mt-1">Cho phép số âm (ví dụ: -1 cho tầng hầm)</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Sức chứa *
              </label>
              <input
                type="number"
                required
                min="1"
                value={formData.capacity}
                onChange={(e) => {
                  setFormData({ ...formData, capacity: parseInt(e.target.value) || 0 })
                  setErrors({ ...errors, capacity: '' })
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-955 dark:text-white transition-all duration-205 ${
                  errors.capacity ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                placeholder="Nhập sức chứa"
              />
              {errors.capacity && <p className="text-red-500 text-sm mt-1">{errors.capacity}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Trạng thái *
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-955 dark:text-white transition-all duration-205"
              >
                <option value="AVAILABLE">Sẵn sàng</option>
                <option value="UNAVAILABLE">Tạm ngưng</option>
              </select>
              <p className="text-gray-500 dark:text-slate-450 text-xs mt-1">Chọn trạng thái của phòng</p>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-350 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400"
              >
                {submitting ? 'Đang lưu...' : (area ? 'Cập nhật' : 'Thêm mới')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
