import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { X, Upload, User, Loader } from 'lucide-react'
import { uploadEventBanner, validateImageFile } from '../../utils/imageUpload'
import { createPortal } from 'react-dom'

interface SpeakerFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: any) => Promise<void>
  speaker?: any | null
  mode: 'create' | 'edit'
}

export default function SpeakerFormModal({
  isOpen,
  onClose,
  onSubmit,
  speaker,
  mode
}: SpeakerFormModalProps) {
  const { showToast } = useToast()
  
  const [formData, setFormData] = useState({
    fullName: '',
    bio: '',
    email: '',
    phone: '',
    avatarUrl: ''
  })
  
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && speaker) {
        setFormData({
          fullName: speaker.fullName || '',
          bio: speaker.bio || '',
          email: speaker.email || '',
          phone: speaker.phone || '',
          avatarUrl: speaker.avatarUrl || ''
        })
        setAvatarPreview(speaker.avatarUrl || null)
      } else {
        setFormData({
          fullName: '',
          bio: '',
          email: '',
          phone: '',
          avatarUrl: ''
        })
        setAvatarPreview(null)
      }
      setAvatarFile(null)
      setErrors({})
    }
  }, [isOpen, mode, speaker])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Họ và tên không được để trống'
    } else if (formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Họ và tên phải có ít nhất 2 ký tự'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email không được để trống'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email không đúng định dạng'
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Số điện thoại không được để trống'
    } else if (!/^\d{9,11}$/.test(formData.phone.trim())) {
      newErrors.phone = 'Số điện thoại phải từ 9 đến 11 số'
    }

    if (!formData.bio.trim()) {
      newErrors.bio = 'Tiểu sử không được để trống'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleFileChange = (file: File) => {
    const validation = validateImageFile(file)
    if (!validation.valid) {
      showToast('error', validation.error || 'Ảnh không hợp lệ')
      return
    }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      handleFileChange(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setLoading(true)
    try {
      let finalAvatarUrl = formData.avatarUrl
      if (avatarFile) {
        finalAvatarUrl = await uploadEventBanner(avatarFile)
      }

      const payload = {
        ...(mode === 'edit' && speaker ? { speakerId: speaker.speakerId } : {}),
        fullName: formData.fullName.trim(),
        bio: formData.bio.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        avatarUrl: finalAvatarUrl
      }

      await onSubmit(payload)
      onClose()
    } catch (err: any) {
      console.error('Speaker submit error:', err)
      showToast('error', err.message || 'Lỗi khi lưu diễn giả')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto backdrop-blur-sm">
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800/80 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 animate-fade-in-up text-slate-900 dark:text-white">
          
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-150 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <h2 className="text-xl font-bold">
              {mode === 'create' ? 'Tạo diễn giả mới' : 'Chỉnh sửa diễn giả'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-650 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Họ và tên */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.fullName}
                onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-850 text-gray-900 dark:text-white transition-all duration-205 ${
                  errors.fullName ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading}
                placeholder="Nguyễn Văn A"
              />
              {errors.fullName && (
                <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-850 text-gray-900 dark:text-white transition-all duration-205 ${
                  errors.email ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading}
                placeholder="diengia@example.com"
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>

            {/* Số điện thoại */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                required
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-850 text-gray-900 dark:text-white transition-all duration-205 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading}
                placeholder="0912345678"
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
              )}
            </div>

            {/* Tiểu sử */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Tiểu sử <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={4}
                value={formData.bio}
                onChange={e => setFormData({ ...formData, bio: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-850 text-gray-900 dark:text-white transition-all duration-205 resize-none ${
                  errors.bio ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading}
                placeholder="Thông tin giới thiệu về diễn giả..."
              />
              {errors.bio && (
                <p className="text-red-500 text-sm mt-1">{errors.bio}</p>
              )}
            </div>

            {/* Ảnh đại diện */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Ảnh đại diện
              </label>
              <div className="flex items-center gap-4 mt-2">
                {avatarPreview ? (
                  <div className="relative">
                    <img
                      src={avatarPreview}
                      alt="Avatar Preview"
                      className="w-16 h-16 rounded-full object-cover border border-gray-250 dark:border-white/10 shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarFile(null)
                        setAvatarPreview(null)
                        setFormData({ ...formData, avatarUrl: '' })
                      }}
                      className="absolute -top-1 -right-1 p-0.5 bg-red-600 text-white rounded-full hover:bg-red-500 transition-colors"
                      disabled={loading}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 border border-dashed border-gray-300 dark:border-white/10 flex items-center justify-center text-gray-400 dark:text-neutral-500">
                    <User className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1">
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                        : 'border-gray-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400'
                    }`}
                  >
                    <input
                      type="file"
                      id="speaker-avatar-upload"
                      accept="image/*"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleFileChange(file)
                      }}
                      className="hidden"
                      disabled={loading}
                    />
                    <label htmlFor="speaker-avatar-upload" className="cursor-pointer block">
                      <Upload className="w-5 h-5 mx-auto text-gray-400 dark:text-neutral-400 mb-1" />
                      <p className="text-xs text-gray-600 dark:text-slate-400">
                        Thả ảnh hoặc click tải lên (tối đa 5MB)
                      </p>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-150 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-350 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                disabled={loading}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-medium rounded-lg shadow transition-colors"
                disabled={loading}
              >
                {loading && <Loader className="w-4 h-4 mr-2 animate-spin" />}
                {loading ? 'Đang lưu...' : mode === 'create' ? 'Tạo mới' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>,
    document.body
  )
}
