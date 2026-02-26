import { useState } from 'react'
import { X, Upload, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { uploadEventBanner, validateImageFile } from '../../utils/imageUpload'
import { emitWalletRefresh } from '../../hooks/useWallet'

interface CancelTicketModalProps {
  ticketId: number
  eventName: string
  onClose: () => void
  onSuccess: () => void
}

export default function CancelTicketModal({
  ticketId,
  eventName,
  onClose,
  onSuccess
}: CancelTicketModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { showToast } = useToast()

  // Xử lý upload ảnh
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file
    const validation = validateImageFile(file, 5)
    if (!validation.valid) {
      showToast('error', validation.error || 'File không hợp lệ')
      return
    }

    setIsUploading(true)

    try {
      // Upload lên Supabase
      const url = await uploadEventBanner(file, 'user-uploads')
      setImageUrl(url)
      showToast('success', 'Upload ảnh thành công')
    } catch (error) {
      console.error('Error uploading image:', error)
      showToast(
        'error',
        error instanceof Error ? error.message : 'Không thể upload ảnh. Vui lòng thử lại'
      )
    } finally {
      setIsUploading(false)
    }
  }

  // Xử lý gửi yêu cầu hủy vé
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim()) {
      showToast('error', 'Vui lòng nhập tiêu đề')
      return
    }

    if (!description.trim()) {
      showToast('error', 'Vui lòng nhập mô tả chi tiết')
      return
    }

    setIsSubmitting(true)

    try {
      const token = localStorage.getItem('token')
      console.log('[DEBUG] Submitting report for ticketId:', ticketId)
      console.log('[DEBUG] Token exists:', !!token)

      const response = await fetch('/api/student/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include', // include cookies for session-based auth
        body: JSON.stringify({
          ticketId,
          title: title.trim(),
          description: description.trim(),
          imageUrl: imageUrl || null,
        }),
      })

      console.log('[DEBUG] Response status:', response.status, response.statusText)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('[DEBUG] Error response:', errorData)

        // Show more specific error messages based on status code
        let errorMsg = errorData.message || 'Không thể gửi báo cáo lỗi'
        if (response.status === 401) {
          errorMsg = 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại'
        } else if (response.status === 403) {
          errorMsg = 'Bạn không có quyền gửi báo cáo cho vé này'
        } else if (response.status === 409) {
          errorMsg = 'Vé này đã có báo cáo đang chờ xét duyệt'
        }

        throw new Error(errorMsg)
      }

      const data = await response.json()
      console.log('[DEBUG] Report created successfully:', data)

      showToast('success', 'Gửi báo cáo lỗi thành công! Đang chờ xét duyệt')

      // Emit signal để refresh wallet balance (nếu báo cáo được approved, tiền sẽ được hoàn lại)
      emitWalletRefresh()

      onSuccess()
      onClose()
    } catch (error) {
      console.error('[ERROR] Submit report failed:', error)
      showToast(
        'error',
        error instanceof Error ? error.message : 'Có lỗi xảy ra. Vui lòng thử lại'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Báo Cáo Lỗi Vé</h2>
            <p className="text-sm text-gray-600 mt-1">{eventName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Thông báo hướng dẫn */}
          <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-800">
              <p className="font-medium mb-1">Lưu ý:</p>
              <p>Báo cáo lỗi sẽ được gửi đến staff để xét duyệt. Nếu được chấp nhận, tiền sẽ được hoàn vào ví của bạn.</p>
            </div>
          </div>

          {/* Tiêu đề */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Ghế bị hỏng, Âm thanh không rõ, Máy chiếu lỗi..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              disabled={isSubmitting}
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/100 ký tự</p>
          </div>

          {/* Mô tả */}
          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Mô tả chi tiết <span className="text-red-500">*</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả chi tiết vấn đề gặp phải tại sự kiện..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              disabled={isSubmitting}
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">{description.length}/500 ký tự</p>
          </div>

          {/* Upload ảnh */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ảnh minh chứng (nếu có)
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={isUploading || isSubmitting}
                className="hidden"
                id="image-upload"
              />
              <label
                htmlFor="image-upload"
                className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 hover:bg-orange-50 transition-colors ${(isUploading || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-orange-600" />
                    <span className="text-sm text-gray-600">Đang upload...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      {imageUrl ? 'Thay đổi ảnh' : 'Chọn ảnh'}
                    </span>
                  </>
                )}
              </label>

              {imageUrl && (
                <div className="relative">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    disabled={isSubmitting}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">Ảnh tối đa 5MB, định dạng JPG, PNG</p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isSubmitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-lg hover:shadow-lg hover:shadow-orange-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Đang gửi...
                </>
              ) : (
                'Gửi yêu cầu'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
