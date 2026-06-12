import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Search, Upload, X, Loader, User } from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { uploadEventBanner, validateImageFile } from '../utils/imageUpload'

interface Speaker {
  speakerId?: number
  fullName: string
  bio: string
  email: string
  phone: string
  avatarUrl: string
}

export default function Speakers() {
  const { showToast } = useToast()
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  // Modal State
  const [isOpen, setIsOpen] = useState(false)
  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null)
  const [formData, setFormData] = useState<Speaker>({
    fullName: '',
    bio: '',
    email: '',
    phone: '',
    avatarUrl: ''
  })
  
  // Image states
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fetchSpeakers = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/v1/admin/speakers', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setSpeakers(data)
      } else {
        showToast('error', 'Không thể tải danh sách diễn giả')
      }
    } catch (error) {
      console.error('Error fetching speakers:', error)
      showToast('error', 'Đã xảy ra lỗi khi kết nối máy chủ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSpeakers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleOpenAddModal = () => {
    setEditingSpeaker(null)
    setFormData({
      fullName: '',
      bio: '',
      email: '',
      phone: '',
      avatarUrl: ''
    })
    setSelectedImage(null)
    setImagePreview(null)
    setIsOpen(true)
  }

  const handleOpenEditModal = (speaker: Speaker) => {
    setEditingSpeaker(speaker)
    setFormData({
      fullName: speaker.fullName,
      bio: speaker.bio,
      email: speaker.email,
      phone: speaker.phone,
      avatarUrl: speaker.avatarUrl
    })
    setSelectedImage(null)
    setImagePreview(speaker.avatarUrl || null)
    setIsOpen(true)
  }

  const handleCloseModal = () => {
    setIsOpen(false)
    setEditingSpeaker(null)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const validation = validateImageFile(file)
    if (!validation.valid) {
      showToast('error', validation.error || 'File không hợp lệ')
      return
    }

    setSelectedImage(file)
    const previewUrl = URL.createObjectURL(file)
    setImagePreview(previewUrl)
  }

  const handleRemoveImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setFormData(prev => ({ ...prev, avatarUrl: '' }))
  }

  const handleInputChange = (field: keyof Speaker, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      // Validate form
      if (!formData.fullName.trim()) {
        showToast('error', 'Vui lòng nhập tên diễn giả')
        setSubmitting(false)
        return
      }

      let finalAvatarUrl = formData.avatarUrl
      if (selectedImage) {
        setUploadingImage(true)
        try {
          finalAvatarUrl = await uploadEventBanner(selectedImage)
        } catch (uploadError) {
          showToast('error', 'Lỗi khi upload ảnh đại diện')
          setSubmitting(false)
          setUploadingImage(false)
          return
        }
        setUploadingImage(false)
      }

      const payload = {
        ...formData,
        avatarUrl: finalAvatarUrl
      }

      if (editingSpeaker) {
        // Edit flow
        const response = await fetch(`/api/v1/speakers?id=${editingSpeaker.speakerId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        })

        if (response.ok) {
          showToast('success', 'Cập nhật thông tin diễn giả thành công')
          handleCloseModal()
          fetchSpeakers()
        } else {
          const errorMsg = await response.text()
          showToast('error', errorMsg || 'Không thể cập nhật diễn giả')
        }
      } else {
        // Create flow
        const response = await fetch('/api/v1/speakers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        })

        if (response.ok) {
          showToast('success', 'Thêm diễn giả thành công')
          handleCloseModal()
          fetchSpeakers()
        } else {
          const errorMsg = await response.text()
          showToast('error', errorMsg || 'Không thể tạo diễn giả')
        }
      }
    } catch (error) {
      console.error('Error submitting speaker form:', error)
      showToast('error', 'Đã xảy ra lỗi khi gửi yêu cầu')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSpeaker = async (speakerId: number) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa diễn giả này không? Việc xóa sẽ hủy liên kết với các sự kiện liên quan.')) {
      return
    }

    try {
      const response = await fetch(`/api/v1/speakers?id=${speakerId}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (response.ok) {
        showToast('success', 'Xóa diễn giả thành công')
        fetchSpeakers()
      } else {
        const errorMsg = await response.text()
        showToast('error', errorMsg || 'Không thể xóa diễn giả')
      }
    } catch (error) {
      console.error('Error deleting speaker:', error)
      showToast('error', 'Đã xảy ra lỗi khi gửi yêu cầu')
    }
  }

  const filteredSpeakers = speakers.filter(s =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone && s.phone.includes(search))
  )

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Quản lý Diễn giả</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Xem danh sách, thêm, chỉnh sửa hoặc xóa thông tin diễn giả trong hệ thống.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center px-5 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-950/20 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Plus className="w-5 h-5 mr-2" />
          + Thêm Diễn Giả
        </button>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-neutral-900/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-2xl">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <input
            type="text"
            placeholder="Tìm diễn giả theo tên, email, điện thoại..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm text-white placeholder-neutral-400 focus:border-blue-500 outline-none transition-colors"
          />
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <Loader className="w-10 h-10 animate-spin text-blue-500 mb-4" />
              <p>Đang tải dữ liệu diễn giả...</p>
            </div>
          ) : filteredSpeakers.length === 0 ? (
            <div className="text-center py-20 text-neutral-400">
              <User className="w-16 h-16 mx-auto text-neutral-600 mb-4" />
              <p className="text-lg font-semibold">Chưa có diễn giả nào</p>
              <p className="text-sm text-neutral-500 mt-1">
                {search ? 'Không tìm thấy kết quả phù hợp' : 'Hãy nhấp vào nút "+ Thêm Diễn Giả" để bắt đầu.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-neutral-400 text-xs uppercase tracking-wider font-semibold">
                  <th className="py-4 px-4">Ảnh đại diện</th>
                  <th className="py-4 px-4">Họ và tên</th>
                  <th className="py-4 px-4">Email</th>
                  <th className="py-4 px-4">Số điện thoại</th>
                  <th className="py-4 px-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-white">
                {filteredSpeakers.map((speaker) => (
                  <tr key={speaker.speakerId} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-4">
                      {speaker.avatarUrl ? (
                        <img
                          src={speaker.avatarUrl}
                          alt={speaker.fullName}
                          className="w-12 h-12 rounded-full object-cover border border-white/10 shadow-md"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-lg border border-blue-500/20 shadow-md">
                          {speaker.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 font-semibold">{speaker.fullName}</td>
                    <td className="py-4 px-4 text-neutral-300">{speaker.email || '-'}</td>
                    <td className="py-4 px-4 text-neutral-300">{speaker.phone || '-'}</td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(speaker)}
                          className="p-2 bg-white/5 hover:bg-blue-600/20 text-neutral-300 hover:text-blue-400 border border-white/10 rounded-xl transition-all cursor-pointer"
                          title="Sửa"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => speaker.speakerId && handleDeleteSpeaker(speaker.speakerId)}
                          className="p-2 bg-white/5 hover:bg-red-600/20 text-neutral-300 hover:text-red-400 border border-white/10 rounded-xl transition-all cursor-pointer"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Reactive Dialog Modal Sheet */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="relative bg-neutral-900/90 border border-white/10 rounded-3xl p-8 backdrop-blur-2xl max-w-lg w-full text-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              type="button"
              onClick={handleCloseModal}
              className="absolute top-4 right-4 p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h2 className="text-2xl font-bold mb-6 text-white">
              {editingSpeaker ? 'Cập nhật Diễn giả' : 'Thêm Diễn giả mới'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* fullName */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  Tên diễn giả *
                </label>
                <input
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:border-blue-500 outline-none w-full transition-colors"
                  placeholder="Nhập họ và tên..."
                />
              </div>

              {/* bio */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  Tiểu sử *
                </label>
                <textarea
                  required
                  rows={4}
                  value={formData.bio}
                  onChange={(e) => handleInputChange('bio', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:border-blue-500 outline-none w-full transition-colors resize-none"
                  placeholder="Thông tin giới thiệu về diễn giả..."
                />
              </div>

              {/* email + phone */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:border-blue-500 outline-none w-full transition-colors"
                    placeholder="example@fpt.edu.vn"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:border-blue-500 outline-none w-full transition-colors"
                    placeholder="0912345678"
                  />
                </div>
              </div>

              {/* Avatar Upload Container */}
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1.5">
                  Ảnh đại diện (tùy chọn)
                </label>
                <div className="flex items-center gap-4">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Avatar Preview"
                        className="w-20 h-20 rounded-full object-cover border border-white/10 shadow-lg"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-1.5 -right-1.5 p-1 bg-red-600 text-white rounded-full hover:bg-red-500 shadow-md transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-white/5 border border-dashed border-white/10 flex items-center justify-center text-neutral-500">
                      <User className="w-8 h-8" />
                    </div>
                  )}

                  <div className="flex-1">
                    <input
                      type="file"
                      id="speaker-avatar-upload"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                    <label
                      htmlFor="speaker-avatar-upload"
                      className="inline-flex items-center px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-white shadow-sm transition-all cursor-pointer"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Tải ảnh lên
                    </label>
                    <p className="text-[11px] text-neutral-400 mt-1">PNG, JPG tối đa 5MB</p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-semibold text-neutral-300 transition-all cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold hover:from-blue-500 hover:to-blue-400 rounded-xl shadow-lg shadow-blue-950/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  {(submitting || uploadingImage) && <Loader className="w-4 h-4 mr-2 animate-spin" />}
                  {submitting ? 'Đang lưu...' : editingSpeaker ? 'Cập nhật' : 'Thêm mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
