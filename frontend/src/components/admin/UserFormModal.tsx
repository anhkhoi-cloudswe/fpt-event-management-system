import { useState, useEffect } from 'react'
import { useToast } from '../../contexts/ToastContext'
import { X, Eye, EyeOff } from 'lucide-react'
import type { User, CreateUserRequest, UpdateUserRequest } from '../../types/user'
import {
  getEmailError,
  getPhoneError,
  getFullNameError,
  getPasswordError
} from '../../utils/validation'
import { createPortal } from 'react-dom'

interface UserFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateUserRequest | UpdateUserRequest) => Promise<void>
  user?: User | null
  mode: 'create' | 'edit'
}

/**
 * Modal form để tạo mới hoặc chỉnh sửa User (Organizer/Staff)
 */
export default function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  user,
  mode
}: UserFormModalProps) {
  const { showToast } = useToast()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    role: 'STAFF' as 'ADMIN' | 'ORGANIZER' | 'STAFF',
    status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE'
  })

  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [showPassword, setShowPassword] = useState(false)

  // Reset form khi mở modal hoặc thay đổi user
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && user) {
        setFormData({
          username: user.username,
          password: '',
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role as 'ADMIN' | 'ORGANIZER' | 'STAFF',
          status: user.status
        })
      } else {
        setFormData({
          username: '',
          password: '',
          fullName: '',
          email: '',
          phone: '',
          role: 'STAFF',
          status: 'ACTIVE'
        })
      }
      setErrors({})
      setTouched({})
    }
  }, [isOpen, mode, user])

  // Real-time validation for a specific field
  const validateField = (name: string, value: string): string | null => {
    switch (name) {
      case 'fullName':
        return getFullNameError(value)
      case 'email':
        return getEmailError(value)
      case 'phone':
        return getPhoneError(value)
      case 'password':
        if (mode === 'create') {
          return getPasswordError(value)
        }
        return null
      default:
        return null
    }
  }

  // Handle field change with real-time validation
  const handleFieldChange = (name: string, value: string) => {
    // Update form data
    setFormData({ ...formData, [name]: value })

    // Validate if field has been touched
    if (touched[name]) {
      const error = validateField(name, value)
      setErrors(prev => {
        if (error) {
          return { ...prev, [name]: error }
        } else {
          const { [name]: removed, ...rest } = prev
          return rest
        }
      })
    }
  }

  // Handle field blur (mark as touched)
  const handleFieldBlur = (name: string) => {
    setTouched(prev => ({ ...prev, [name]: true }))
    const error = validateField(name, formData[name as keyof typeof formData] as string)
    if (error) {
      setErrors(prev => ({ ...prev, [name]: error }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    // Validate fullName
    const fullNameError = getFullNameError(formData.fullName)
    if (fullNameError) newErrors.fullName = fullNameError

    // Validate email
    const emailError = getEmailError(formData.email)
    if (emailError) newErrors.email = emailError

    // Validate phone
    const phoneError = getPhoneError(formData.phone)
    if (phoneError) newErrors.phone = phoneError

    // Validate password (only for create mode)
    if (mode === 'create') {
      const passwordError = getPasswordError(formData.password)
      if (passwordError) newErrors.password = passwordError
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)
    try {
      if (mode === 'create') {
        const createData: CreateUserRequest = {
          fullName: formData.fullName,
          phone: formData.phone,
          email: formData.email,
          password: formData.password,
          role: formData.role
        }
        await onSubmit(createData)
      } else if (user) {
        const updateData: UpdateUserRequest = {
          userId: user.userId,
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          status: formData.status
        }
        await onSubmit(updateData)
      }
      onClose()
    } catch (error) {
      console.error('Form submit error:', error)
      // Show API/backend error message to user via toast
      const errMsg =
        error instanceof Error
          ? error.message
          : error && typeof error === 'object' && 'message' in error
            ? (error as any).message
            : String(error)
      showToast('error', errMsg || 'Đã có lỗi xảy ra')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return createPortal(
    // ⭐ ABSOLUTE CENTERING: Fixed overlay + centered container
    <div className="fixed inset-0 bg-black/60 z-50 overflow-y-auto backdrop-blur-sm">
      {/* Centering wrapper */}
      <div className="flex items-center justify-center min-h-screen p-4">
        {/* Modal Card: responsive width + scrollable */}
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800/80 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-150 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {mode === 'create' ? 'Tạo người dùng mới' : 'Chỉnh sửa người dùng'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
              disabled={loading}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={e => handleFieldChange('email', e.target.value)}
                onBlur={() => handleFieldBlur('email')}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-all duration-205 ${
                  errors.email ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading || mode === 'edit'}
                placeholder="user@example.com"
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
              {mode === 'edit' && (
                <p className="text-xs italic text-gray-405 dark:text-slate-500 mt-1.5">Email không thể chỉnh sửa</p>
              )}
            </div>

            {/* Password - chỉ hiển thị khi tạo mới */}
            {mode === 'create' ? (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                  Mật khẩu <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => handleFieldChange('password', e.target.value)}
                    onBlur={() => handleFieldBlur('password')}
                    className={`w-full px-3 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-all duration-205 ${
                      errors.password ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                    }`}
                    disabled={loading}
                    placeholder="Tối thiểu 6 ký tự, có chữ và số"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-450 hover:text-gray-650 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-sm mt-1">{errors.password}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                  Mật khẩu (để trống nếu không đổi)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => handleFieldChange('password', e.target.value)}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-205"
                    disabled={loading}
                    placeholder="Để trống nếu không muốn thay đổi mật khẩu"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-450 hover:text-gray-650 dark:text-slate-400 dark:hover:text-slate-200 focus:outline-none"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Họ và tên <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={e => handleFieldChange('fullName', e.target.value)}
                onBlur={() => handleFieldBlur('fullName')}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-all duration-205 ${
                  errors.fullName ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading}
                placeholder="Nguyễn Văn A"
              />
              {errors.fullName && (
                <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Số điện thoại <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => handleFieldChange('phone', e.target.value)}
                onBlur={() => handleFieldBlur('phone')}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-all duration-205 ${
                  errors.phone ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'
                }`}
                disabled={loading}
                placeholder="0912345678"
              />
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                Vai trò <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.role}
                onChange={e =>
                  setFormData({
                    ...formData,
                    role: e.target.value as 'ADMIN' | 'ORGANIZER' | 'STAFF'
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-all duration-205"
                disabled={loading}
              >
                <option value="ADMIN">Admin</option>
                <option value="ORGANIZER">Organizer</option>
                <option value="STAFF">Staff</option>
              </select>
            </div>

            {/* Status - chỉ hiển thị khi edit */}
            {mode === 'edit' && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
                  Trạng thái
                </label>
                <select
                  value={formData.status}
                  onChange={e =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'ACTIVE' | 'INACTIVE'
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white transition-all duration-205"
                  disabled={loading}
                >
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Vô hiệu hóa</option>
                </select>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-150 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-350 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors disabled:bg-gray-100 dark:disabled:bg-slate-900"
                disabled={loading}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white font-medium rounded-lg transition-colors disabled:bg-blue-400"
                disabled={loading}
              >
                {loading
                  ? 'Đang xử lý...'
                  : mode === 'create'
                    ? 'Tạo mới'
                    : 'Cập nhật'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  )
}