import { useState, useEffect, useMemo } from 'react'
import { useWallet } from '../hooks/useWallet'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  User,
  Phone,
  Mail,
  Shield,
  Calendar,
  Wallet,
  Globe,
  Moon,
  Sun,
  AlertCircle,
  Eye,
  EyeOff,
  Lock,
  Info,
  CheckCircle2
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { TimezoneCombobox } from '../components/TimezoneCombobox'

const locales = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
]

const normalizeLanguage = (value?: string | null) => {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'vi'
}

const profileTranslations: Record<string, Record<string, string>> = {
  en: {
    profileTab: 'Personal information',
    securityTab: 'Security & Account',
    languageTab: 'Language',
    languageTitle: 'Language',
    displaySettings: 'Display settings',
    languageHelp: 'Your language preference is saved to your account and used on future visits.',
    savePreferences: 'Save Preferences',
    preferencesSaved: 'Language preferences saved',
    oldPassword: 'OLD PASSWORD',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    updatePassword: 'Update password',
    updating: 'Updating...',
    walletBalance: 'E-wallet balance',
    contactInfo: 'Contact Information',
    phoneNumber: 'Phone number',
    noPhone: 'No phone number updated',
    saveChanges: 'Save Changes',
    phoneEmptyError: 'Phone number cannot be empty',
    phoneInvalidError: 'Invalid Vietnamese phone number (10 digits, e.g. 0912345678)',
    checkInputError: 'Please check your inputs!',
    phoneUpdateSuccess: 'Phone number updated successfully!',
    phoneUpdateFail: 'Failed to update phone number!',
    networkError: 'A network connection error occurred!',
    fullName: 'Full Name',
    fullNameLabel: 'Full Name',
    fullNamePlaceholder: 'Enter full name',
    fullNameEmptyError: 'Full name cannot be empty',
    fullNameMinError: 'Full name must be at least 2 characters',
    fullNameMaxError: 'Full name cannot exceed 100 characters',
    fullNameSuccess: 'Full name updated successfully!',
    fullNameFail: 'Failed to update full name!',
    themeLocal: 'Theme & Localization',
    appTheme: 'App Theme',
    themeHelp: 'Change screen contrast (Light or Dark)',
    darkMode: 'Dark mode',
    lightMode: 'Light mode',
    timezoneTitle: 'Working Timezone',
    timezoneHelp: 'Configure timezone to synchronize event calendars accurately',
    procedureTitle: 'Profile Change Procedure',
    p1: 'Phone number can be adjusted and stored immediately via the form to support quick communication.',
    p2: 'Legal identity information such as Full name, School email, and System role cannot be self-updated to prevent identity fraud.',
    p3: 'Steps to request changes:',
    p4: 'Send an email from your official FPT email to the administrators at',
    p5: 'Provide student ID/staff ID and attach a copy of student card/ID card for verification.',
    p6: 'FPT Event technical support will process the change request within 24 working hours.',
    securityCommit: 'Security Commitment',
    securityCommitHelp: 'We apply the most advanced encryption standards to protect your password. FPT Event does not store passwords in plain text and never shares your identification data with third parties.',
    dangerZone: 'Danger Zone',
    dangerZoneHelp: 'When closing your account, the system will place your account in the deletion queue. You have 30 days to cancel the request if you change your mind.',
    closeAccount: 'Close my account',
    ssoTitle: 'You logged in via Google',
    ssoHelp: 'Your account currently does not have a password stored on the FPT Event server because you use Single Sign On (SSO).',
    ssoExplain: 'You can set a separate password at any time. This allows you to log in flexibly using both your Google account and direct email/password.',
    setNewPassword: 'Set new password',
    passwordSecurityTitle: 'Password Security',
    passwordSecurityHelp: 'Set a password of at least 6 characters to secure your account.',
    oldPasswordPlaceholder: 'Enter current password',
    newPasswordPlaceholder: 'Enter new password (at least 6 characters)',
    confirmPasswordPlaceholder: 'Re-enter new password',
    joinedOn: 'Joined on',
    notUpdated: 'Not updated',
    setSSOPasswordTitle: 'Set Account Password',
    setSSOPasswordHelp: 'Set a password for your Google account to be able to log in freely with your email.',
    cancel: 'Cancel',
    setBtn: 'Set Password',
    settingBtn: 'Setting up...',
    closeAccountTitle: 'Confirm account deletion',
    close1: 'You are requesting to delete your personal account.',
    close2: 'Your account will be placed in the deletion queue and you will be logged out immediately.',
    close3: 'You have',
    close4: '30 days',
    close5: 'to log in again and restore the account. After this period, the account and all related data will be permanently deleted and cannot be restored.',
    processing: 'Processing...',
    confirmDelete: 'Confirm delete',
    oldPasswordEmptyError: 'Please enter current password',
    passwordMinError: 'Password must be at least 6 characters',
    passwordMatchError: 'Confirmation password does not match',
    passwordSuccess: 'Password changed successfully!',
    passwordFail: 'Failed to change password',
    ssoSuccess: 'Set password successfully!',
    ssoFail: 'Failed to set password',
    closeSuccess: 'Account closure request successful!',
    closeFail: 'Failed to request account closure'
  },
  vi: {
    profileTab: 'Thông tin cá nhân',
    securityTab: 'Bảo mật & Tài khoản',
    languageTab: 'Ngôn ngữ',
    languageTitle: 'Ngôn ngữ',
    displaySettings: 'Thiết lập hiển thị',
    languageHelp: 'Lựa chọn ngôn ngữ được lưu vào tài khoản và áp dụng cho các lần truy cập tiếp theo.',
    savePreferences: 'Lưu thiết lập',
    preferencesSaved: 'Đã lưu thiết lập ngôn ngữ',
    oldPassword: 'MẬT KHẨU CŨ',
    newPassword: 'Mật khẩu mới',
    confirmPassword: 'Xác nhận mật khẩu mới',
    updatePassword: 'Cập nhật mật khẩu',
    updating: 'Đang cập nhật...',
    walletBalance: 'Số dư ví điện tử',
    contactInfo: 'Thông tin Liên hệ',
    phoneNumber: 'Số điện thoại',
    noPhone: 'Chưa cập nhật số điện thoại',
    saveChanges: 'Lưu thay đổi',
    phoneEmptyError: 'Số điện thoại không được để trống',
    phoneInvalidError: 'Số điện thoại Việt Nam không hợp lệ (10 chữ số, ví dụ: 0912345678)',
    checkInputError: 'Vui lòng kiểm tra lỗi nhập liệu!',
    phoneUpdateSuccess: 'Cập nhật số điện thoại thành công!',
    phoneUpdateFail: 'Cập nhật số điện thoại thất bại!',
    networkError: 'Có lỗi kết nối mạng xảy ra!',
    fullName: 'Họ và Tên',
    fullNameLabel: 'Họ và Tên Đầy Đủ',
    fullNamePlaceholder: 'Nhập họ và tên đầy đủ',
    fullNameEmptyError: 'Họ và tên không được để trống',
    fullNameMinError: 'Họ và tên phải có ít nhất 2 ký tự',
    fullNameMaxError: 'Họ và tên không được vượt quá 100 ký tự',
    fullNameSuccess: 'Cập nhật họ và tên thành công!',
    fullNameFail: 'Cập nhật họ và tên thất bại!',
    themeLocal: 'Giao diện & Khu vực',
    appTheme: 'Giao diện ứng dụng',
    themeHelp: 'Tự do thay đổi độ tương phản màn hình (Sáng hoặc Tối)',
    darkMode: 'Bản tối (Dark)',
    lightMode: 'Bản sáng (Light)',
    timezoneTitle: 'Múi giờ làm việc',
    timezoneHelp: 'Cài đặt hiển thị múi giờ để đồng bộ chính xác lịch sự kiện',
    procedureTitle: 'Quy trình Thay đổi Hồ sơ',
    p1: 'Số điện thoại có thể tự điều chỉnh và lưu trữ tức thì thông qua form bên cạnh để hỗ trợ liên lạc nhanh chóng.',
    p2: 'Các thông tin định danh pháp lý như Họ và tên, Email trường học, và Vai trò hệ thống không thể tự cập nhật nhằm phòng chống gian lận danh tính.',
    p3: 'Các bước yêu cầu thay đổi:',
    p4: 'Gửi email từ hòm thư FPT chính thức tới ban quản trị tại',
    p5: 'Cung cấp mã số sinh viên/mã cán bộ và đính kèm bản sao thẻ sinh viên/CMND đối chiếu.',
    p6: 'Bộ phận hỗ trợ kỹ thuật FPT Event sẽ xử lý yêu cầu thay đổi trong vòng 24h làm việc.',
    securityCommit: 'Cam kết Bảo mật',
    securityCommitHelp: 'Chúng tôi áp dụng các tiêu chuẩn mã hóa tiên tiến nhất để bảo vệ thông tin mật khẩu của bạn. FPT Event không lưu trữ mật khẩu ở dạng plain-text và không bao giờ chia sẻ dữ liệu định danh của bạn cho bên thứ ba.',
    dangerZone: 'Khu vực Nguy hiểm',
    dangerZoneHelp: 'Khi đóng tài khoản, hệ thống sẽ đưa tài khoản của bạn vào hàng đợi xóa. Bạn có 30 ngày để hủy yêu cầu nếu đổi ý.',
    closeAccount: 'Đóng tài khoản của tôi',
    ssoTitle: 'Bạn đăng nhập qua Google',
    ssoHelp: 'Tài khoản của bạn hiện tại chưa có mật khẩu được lưu trữ trên máy chủ FPT Event vì bạn sử dụng phương thức đăng nhập một lần (Single Sign On).',
    ssoExplain: 'Bạn có thể thiết lập mật khẩu riêng bất cứ lúc nào. Việc này cho phép bạn đăng nhập linh hoạt bằng cả tài khoản Google lẫn email/mật khẩu trực tiếp.',
    setNewPassword: 'Thiết lập mật khẩu mới',
    passwordSecurityTitle: 'Bảo mật mật khẩu',
    passwordSecurityHelp: 'Thiết lập mật khẩu có độ dài tối thiểu 6 ký tự để bảo vệ an toàn cho tài khoản của bạn.',
    oldPasswordPlaceholder: 'Nhập mật khẩu hiện tại',
    newPasswordPlaceholder: 'Nhập mật khẩu mới (ít nhất 6 ký tự)',
    confirmPasswordPlaceholder: 'Nhập lại mật khẩu mới',
    joinedOn: 'Tham gia ngày',
    notUpdated: 'Chưa cập nhật',
    setSSOPasswordTitle: 'Thiết lập mật khẩu tài khoản',
    setSSOPasswordHelp: 'Thiết lập mật khẩu cho tài khoản Google để có thể tự do đăng nhập bằng email của bạn.',
    cancel: 'Hủy bỏ',
    setBtn: 'Thiết lập mật khẩu',
    settingBtn: 'Đang thiết lập...',
    closeAccountTitle: 'Xác nhận xóa tài khoản',
    close1: 'Bạn đang thực hiện yêu cầu xóa tài khoản cá nhân.',
    close2: 'Tài khoản của bạn sẽ được đưa vào hàng đợi xóa và bạn sẽ được đăng xuất ngay lập tức.',
    close3: 'Bạn có',
    close4: '30 ngày',
    close5: 'để đăng nhập lại và khôi phục tài khoản. Sau thời gian này, tài khoản và mọi dữ liệu liên quan sẽ bị xóa vĩnh viễn và không thể khôi phục.',
    processing: 'Đang xử lý...',
    confirmDelete: 'Xác nhận xóa',
    oldPasswordEmptyError: 'Vui lòng nhập mật khẩu cũ',
    passwordMinError: 'Mật khẩu phải có ít nhất 6 ký tự',
    passwordMatchError: 'Mật khẩu xác nhận không khớp',
    passwordSuccess: 'Đổi mật khẩu thành công!',
    passwordFail: 'Đổi mật khẩu thất bại',
    ssoSuccess: 'Thiết lập mật khẩu thành công!',
    ssoFail: 'Thiết lập mật khẩu thất bại',
    closeSuccess: 'Yêu cầu đóng tài khoản thành công!',
    closeFail: 'Yêu cầu xóa tài khoản thất bại'
  },
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const { balance: liveBalance } = useWallet()
  const profileWalletBalance = useMemo(() => {
    return Number(liveBalance ?? user?.balance ?? user?.wallet_balance ?? (user?.wallet as any)?.balance ?? 0)
  }, [user, liveBalance])

  // Tab state: profile vs security
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'language'>(() => {
    return searchParams.get('tab') === 'security' ? 'security' : searchParams.get('tab') === 'language' ? 'language' : 'profile'
  })

  // CRITICAL FIX: Read theme directly from document.documentElement.classList
  // This is the SOURCE OF TRUTH set by AuthContext, NOT localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark')
  })

  // Phone settings
  const [phone, setPhone] = useState(user?.phone || '')

  // Full Name settings
  const [fullName, setFullName] = useState(user?.fullName || '')
  const [fullNameError, setFullNameError] = useState('')

  // Timezone states
  const [timezone, setTimezone] = useState(localStorage.getItem('user_timezone') || 'Asia/Ho_Chi_Minh')
  const [autoDetectTz, setAutoDetectTz] = useState(localStorage.getItem('auto_timezone') !== 'false')
  const [language, setLanguage] = useState(() => normalizeLanguage(localStorage.getItem('user_locale')))
  const [appliedLanguage, setAppliedLanguage] = useState(() => normalizeLanguage(localStorage.getItem('user_locale')))
  const t = profileTranslations[appliedLanguage] ?? profileTranslations.vi

  // Password tab states
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)
  const [showSsoNewPassword, setShowSsoNewPassword] = useState(false)
  const [showSsoConfirmPassword, setShowSsoConfirmPassword] = useState(false)

  // Standard user password change states
  const [oldPassword, setOldPassword] = useState('')
  const [standardPassword, setStandardPassword] = useState('')
  const [standardConfirmPassword, setStandardConfirmPassword] = useState('')
  const [standardPasswordError, setStandardPasswordError] = useState('')
  const [isUpdatingStandardPassword, setIsUpdatingStandardPassword] = useState(false)
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // Close account state
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [isClosingAccount, setIsClosingAccount] = useState(false)

  // Error states for phone input
  const [phoneError, setPhoneError] = useState('')

  // Sync phone & theme state when user context is loaded/refreshed
  useEffect(() => {
    if (user?.phone) {
      setPhone(user.phone)
    }
    if (user?.fullName) {
      setFullName(user.fullName)
    }
    if (user?.id) {
      setIsDarkMode((localStorage.getItem('theme_user_' + user.id) || localStorage.getItem('theme')) === 'dark')
    }
    if (user?.language) {
      const profileLanguage = normalizeLanguage(user.language)
      setLanguage(profileLanguage)
      setAppliedLanguage(profileLanguage)
      localStorage.setItem('user_locale', profileLanguage)
      localStorage.setItem('language', profileLanguage)
    }
  }, [user])

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'profile' || tab === 'security' || tab === 'language') {
      setActiveTab(tab)
    }
  }, [searchParams])

  const handleTabChange = (tab: 'profile' | 'security' | 'language') => {
    setActiveTab(tab)
    setSearchParams(tab === 'profile' ? {} : { tab }, { replace: true })
  }

  // Sync theme changes
  useEffect(() => {
    const currentTheme = isDarkMode ? 'dark' : 'light'
    document.documentElement.classList.toggle('dark', isDarkMode)
    localStorage.setItem('theme', currentTheme)

    if (user?.id) {
      localStorage.setItem('theme_user_' + user.id, currentTheme)
    }
    window.dispatchEvent(new Event('theme-change'))
  }, [isDarkMode, user?.id])

  // Sync theme changes reactively when updated from header
  useEffect(() => {
    const handleThemeChange = () => {
      if (user?.id) {
        setIsDarkMode((localStorage.getItem('theme_user_' + user.id) || localStorage.getItem('theme')) === 'dark')
      } else {
        setIsDarkMode(localStorage.getItem('theme') === 'dark')
      }
    }
    window.addEventListener('theme-change', handleThemeChange)
    return () => window.removeEventListener('theme-change', handleThemeChange)
  }, [user])

  // Theme change action call to DB
  const handleToggleTheme = async () => {
    const nextTheme = !isDarkMode ? 'dark' : 'light'
    setIsDarkMode(!isDarkMode)

    if (user) {
      localStorage.setItem('theme_user_' + user.id, nextTheme)
      localStorage.setItem('theme', nextTheme)
      try {
        await fetch('/api/auth/update-theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ theme: nextTheme }),
        })
        await refreshUser()
      } catch (err) {
        console.error('Failed to sync theme with DB:', err)
      }
    }
  }

  const detectTimezone = () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh'
    setTimezone(detected)
    localStorage.setItem('user_timezone', detected)
    localStorage.setItem('auto_timezone', 'true')
    window.dispatchEvent(new Event('timezone-change'))
  }

  // Sync auto-timezone check
  useEffect(() => {
    if (autoDetectTz) {
      detectTimezone()
    } else {
      localStorage.setItem('auto_timezone', 'false')
    }
  }, [autoDetectTz])

  const handleLanguageChange = (locale: string) => {
    setLanguage(normalizeLanguage(locale))
  }

  const handleSaveLanguage = async () => {
    const nextLanguage = normalizeLanguage(language)
    setAppliedLanguage(nextLanguage)
    localStorage.setItem('user_locale', nextLanguage)
    localStorage.setItem('language', nextLanguage)
    window.dispatchEvent(new CustomEvent('language-change', { detail: { locale: nextLanguage } }))

    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ language: nextLanguage }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showToast('error', data.message || 'Failed to save language preference')
        return
      }

      await refreshUser()
      showToast('success', profileTranslations[nextLanguage]?.preferencesSaved ?? profileTranslations.vi.preferencesSaved)
    } catch (err) {
      showToast('error', 'Failed to save language preference')
    }
  }

  // Input phone number validation
  const validatePhone = (value: string): boolean => {
    const cleaned = value.trim()
    if (!cleaned) {
      setPhoneError(t.phoneEmptyError)
      return false
    }
    const phoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/
    if (!phoneRegex.test(cleaned)) {
      setPhoneError(t.phoneInvalidError)
      return false
    }
    setPhoneError('')
    return true
  }

  // Validate full name
  const validateFullName = (value: string): boolean => {
    const cleaned = value.trim()
    if (!cleaned) {
      setFullNameError(t.fullNameEmptyError)
      return false
    }
    if (cleaned.length < 2) {
      setFullNameError(t.fullNameMinError)
      return false
    }
    if (cleaned.length > 100) {
      setFullNameError(t.fullNameMaxError)
      return false
    }
    setFullNameError('')
    return true
  }

  // Handle phone update action directly to DB
  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePhone(phone)) {
      showToast('error', t.checkInputError)
      return
    }

    try {
      const res = await fetch('/api/auth/update-phone', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phone.trim() }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', t.phoneUpdateSuccess)
        localStorage.removeItem('user_phone_' + user?.id)
        await refreshUser()
      } else {
        showToast('error', data.message || t.phoneUpdateFail)
      }
    } catch (err) {
      showToast('error', t.networkError)
    }
  }

  // Handle full name update action directly to DB
  const handleUpdateFullName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateFullName(fullName)) {
      showToast('error', t.checkInputError)
      return
    }

    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fullName: fullName.trim() }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', t.fullNameSuccess)
        await refreshUser()
      } else {
        showToast('error', data.message || t.fullNameFail)
      }
    } catch (err) {
      showToast('error', t.networkError)
    }
  }

  // Handle Set SSO Password
  const handleSetSSOPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordError(t.passwordMinError)
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t.passwordMatchError)
      return
    }

    setIsSubmittingPassword(true)
    setPasswordError('')

    try {
      const res = await fetch('/api/auth/set-sso-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: newPassword }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', t.ssoSuccess)
        setShowSetPasswordModal(false)
        setNewPassword('')
        setConfirmPassword('')
        await refreshUser()
      } else {
        setPasswordError(data.message || t.ssoFail)
      }
    } catch (err) {
      setPasswordError(t.networkError)
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  // Handle standard password change
  const handleUpdateStandardPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword) {
      setStandardPasswordError(t.oldPasswordEmptyError)
      return
    }
    if (standardPassword.length < 6) {
      setStandardPasswordError(t.passwordMinError)
      return
    }
    if (standardPassword !== standardConfirmPassword) {
      setStandardPasswordError(t.passwordMatchError)
      return
    }

    setIsUpdatingStandardPassword(true)
    setStandardPasswordError('')

    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ oldPassword, password: standardPassword }),
      })

      const data = await res.json()
      if (res.ok) {
        showToast('success', t.passwordSuccess)
        setOldPassword('')
        setStandardPassword('')
        setStandardConfirmPassword('')
      } else {
        setStandardPasswordError(data.message || t.passwordFail)
      }
    } catch (err) {
      setStandardPasswordError(t.networkError)
    } finally {
      setIsUpdatingStandardPassword(false)
    }
  }

  // Handle soft account delete
  const handleCloseAccount = async () => {
    setIsClosingAccount(true)
    try {
      const res = await fetch('/api/auth/close-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (res.ok) {
        showToast('success', t.closeSuccess)
        setShowCloseModal(false)
        logout()
      } else {
        const data = await res.json()
        showToast('error', data.message || t.closeFail)
      }
    } catch (err) {
      showToast('error', t.networkError)
    } finally {
      setIsClosingAccount(false)
    }
  }

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(appliedLanguage === 'en' ? 'en-US' : 'vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })
    : t.notUpdated

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
      {/* Profile Banner */}
      <div className={`relative overflow-hidden rounded-3xl border p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 shadow-xl transition-colors duration-500 ${isDarkMode
        ? 'bg-slate-900 border-slate-800 text-white shadow-slate-950/20'
        : 'bg-white/80 border-orange-100/60 shadow-orange-100/10 backdrop-blur-md'
        }`}>
        <div className="relative group">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-600 to-orange-500 flex items-center justify-center text-3xl font-black text-white shadow-xl shadow-orange-500/20 transition-transform group-hover:scale-105 duration-300">
            {user?.fullName?.charAt(0) || 'U'}
          </div>
          <div className="absolute -bottom-1.5 -right-1.5 bg-orange-600 text-white p-1.5 rounded-full border-2 border-white dark:border-slate-900 shadow">
            <Shield size={14} />
          </div>
        </div>

        <div className="flex-1 text-center md:text-left space-y-3 min-w-0">
          <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 justify-center md:justify-start">
            <h1 className="text-xl md:text-2xl font-black truncate text-slate-900 dark:text-white">{user?.fullName}</h1>
            <span className="inline-flex self-center px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-200/50 dark:border-orange-500/15">
              {user?.role}
            </span>
          </div>
          <p className="text-sm text-slate-400 truncate font-medium flex items-center gap-1.5 justify-center md:justify-start">
            <Mail size={15} className="text-slate-400" />
            {user?.email}
          </p>
          <p className="text-xs text-slate-400 font-bold flex items-center gap-1.5 justify-center md:justify-start">
            <Calendar size={15} className="text-slate-400" />
            {t.joinedOn} {joinDate}
          </p>
        </div>

        {profileWalletBalance !== undefined && (
          <div className={`px-5 py-4 rounded-2xl border text-center md:text-right min-w-[150px] shadow-sm ${isDarkMode
            ? 'bg-slate-950/50 border-slate-800/80 text-orange-400'
            : 'bg-orange-50/50 border-orange-100 text-slate-800'
            }`}>
            <div className="flex items-center justify-center md:justify-end gap-1.5 text-xs text-slate-400 font-bold mb-1">
              <Wallet size={14} className="text-orange-500" />
              <span>{t.walletBalance}</span>
            </div>
            <p className="text-xl font-black">{profileWalletBalance.toLocaleString('vi-VN')} đ</p>
          </div>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => handleTabChange('profile')}
          className={`pb-3 text-sm font-extrabold transition-all relative ${activeTab === 'profile'
            ? 'text-orange-600 dark:text-orange-500'
            : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
            }`}
        >
          {t.profileTab}
          {activeTab === 'profile' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => handleTabChange('security')}
          className={`pb-3 text-sm font-extrabold transition-all relative ${activeTab === 'security'
            ? 'text-orange-600 dark:text-orange-500'
            : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
            }`}
        >
          {t.securityTab}
          {activeTab === 'security' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => handleTabChange('language')}
          className={`pb-3 text-sm font-extrabold transition-all relative ${activeTab === 'language'
            ? 'text-orange-600 dark:text-orange-500'
            : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-300'
            }`}
        >
          {t.languageTab}
          {activeTab === 'language' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-600 dark:bg-orange-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Main content left */}
          <div className="md:col-span-2 space-y-8">
            {/* Form contact */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Phone size={18} className="text-orange-500" />
                <span>{t.contactInfo}</span>
              </h3>

              <form onSubmit={handleUpdatePhone} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider pl-1">
                    {t.phoneNumber}
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        if (phoneError) validatePhone(e.target.value)
                      }}
                      placeholder={t.noPhone}
                      className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${phoneError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-600'
                        : isDarkMode ? 'bg-slate-900 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white' : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-900'
                        }`}
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all"
                    >
                      {t.saveChanges}
                    </button>
                  </div>
                  {phoneError && (
                    <p className="text-xs text-rose-600 font-bold pl-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {phoneError}
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Full Name Update Form */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <User size={18} className="text-orange-500" />
                <span>{t.fullName}</span>
              </h3>

              <form onSubmit={handleUpdateFullName} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider pl-1">
                    {t.fullNameLabel}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value)
                        if (fullNameError) validateFullName(e.target.value)
                      }}
                      placeholder={t.fullNamePlaceholder}
                      className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${fullNameError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-600 dark:bg-rose-500/10 dark:border-rose-700 dark:text-rose-400'
                        : isDarkMode ? 'bg-slate-900 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white' : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-900'
                        }`}
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all"
                    >
                      {t.saveChanges}
                    </button>
                  </div>
                  {fullNameError && (
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-bold pl-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {fullNameError}
                    </p>
                  )}
                </div>
              </form>
            </div>

            {/* Config theme and timezone */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Globe size={18} className="text-orange-500" />
                <span>{t.themeLocal}</span>
              </h3>

              <div className="space-y-6">
                {/* Theme selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                  <div>
                    <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{t.appTheme}</h4>
                    <p className="text-xs text-slate-400 mt-0.5">{t.themeHelp}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleTheme}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all min-w-[160px] active:scale-98 ${isDarkMode
                      ? 'bg-slate-800 border-slate-700 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                  >
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {isDarkMode ? <Moon size={15} className="text-orange-400" /> : <Sun size={15} className="text-orange-500" />}
                      <span>{isDarkMode ? t.darkMode : t.lightMode}</span>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${isDarkMode ? 'bg-orange-500' : 'bg-slate-350'}`}>
                      <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-0.25 transition-all ${isDarkMode ? 'right-0.5' : 'left-0.5'}`} />
                    </div>
                  </button>
                </div>

                {/* Timezone selector */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-slate-100">{t.timezoneTitle}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{t.timezoneHelp}</p>
                    </div>
                  </div>

                  <div className="max-w-sm">
                    <TimezoneCombobox
                      value={timezone}
                      autoDetect={autoDetectTz}
                      isDarkMode={isDarkMode}
                      onAutoDetectChange={setAutoDetectTz}
                      onChange={(nextTimezone) => {
                        setTimezone(nextTimezone)
                        localStorage.setItem('user_timezone', nextTimezone)
                        window.dispatchEvent(new Event('timezone-change'))
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar right */}
          <div className="space-y-8">
            <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Info size={16} className="text-orange-500" />
                <span>{t.procedureTitle}</span>
              </h3>

              <div className="space-y-4 text-xs leading-relaxed text-slate-400 font-medium">
                <div className="p-3 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
                  <p>
                    {t.p1}
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-amber-550 flex-shrink-0 mt-0.5" />
                  <p>
                    {t.p2}
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">
                    {t.p3}
                  </p>
                  <ol className="list-decimal list-inside pl-1 space-y-1.5">
                    <li>{t.p4} <a href="mailto:support@fpt.edu.vn" className="text-orange-600 font-bold hover:underline">support@fpt.edu.vn</a>.</li>
                    <li>{t.p5}</li>
                    <li>{t.p6}</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Security & Account */}
      {activeTab === 'security' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-8">
            {/* Password Tab content */}
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Lock size={18} className="text-orange-500" />
                <span>{t.passwordSecurityTitle}</span>
              </h3>

              {user?.ssoProvider === 'GOOGLE' ? (
                // SSO warning banner matching Figure 4 (amber/yellow premium alert block)
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/25 text-amber-800 dark:text-amber-350 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-550 flex-shrink-0 mt-0.5" />
                      <div className="text-sm font-medium leading-relaxed">
                        <p className="font-extrabold text-amber-900 dark:text-amber-200">{t.ssoTitle}</p>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          {t.ssoHelp}
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 font-semibold pl-1 leading-relaxed">
                    {t.ssoExplain}
                  </p>

                  <button
                    onClick={() => setShowSetPasswordModal(true)}
                    className="px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-2xl shadow-md shadow-orange-500/10 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Lock size={14} />
                    <span>{t.setNewPassword}</span>
                  </button>
                </div>
              ) : (
                // Standard Password Change Form
                <form onSubmit={handleUpdateStandardPassword} className="space-y-4">
                  <p className="text-xs text-slate-450 dark:text-slate-400 font-semibold pl-1">
                    {t.passwordSecurityHelp}
                  </p>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                      {t.oldPassword}
                    </label>
                    <div className="relative">
                      <input
                        type={showOldPassword ? 'text' : 'password'}
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder={t.oldPasswordPlaceholder}
                        className={`w-full px-4 pr-11 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${isDarkMode
                          ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200'
                          : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800'
                          }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowOldPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors"
                        aria-label={showOldPassword ? 'Hide old password' : 'Show old password'}
                      >
                        {showOldPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                      {t.newPassword}
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={standardPassword}
                        onChange={(e) => setStandardPassword(e.target.value)}
                        placeholder={t.newPasswordPlaceholder}
                        className={`w-full px-4 pr-11 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${isDarkMode
                          ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200'
                          : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800'
                          }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors"
                        aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                      >
                        {showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider pl-1">
                      {t.confirmPassword}
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={standardConfirmPassword}
                        onChange={(e) => setStandardConfirmPassword(e.target.value)}
                        placeholder={t.confirmPasswordPlaceholder}
                        className={`w-full px-4 pr-11 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${isDarkMode
                          ? 'bg-slate-950 border-slate-700 focus:border-orange-500 text-slate-200'
                          : 'bg-white border-slate-200 focus:border-orange-500 text-slate-800'
                          }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors"
                        aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                      >
                        {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>

                  {standardPasswordError && (
                    <p className="text-xs text-rose-600 font-bold pl-1 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {standardPasswordError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isUpdatingStandardPassword}
                    className="px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-2xl shadow-md active:scale-95 transition-all"
                  >
                    {isUpdatingStandardPassword ? t.updating : t.updatePassword}
                  </button>
                </form>
              )}
            </div>

            {/* Danger Zone: Close Account Flow matching Figure 5 */}
            <div className={`p-6 md:p-8 rounded-3xl border border-rose-500/30 dark:border-rose-500/20 bg-rose-500/5 shadow-xl transition-colors duration-500`}>
              <h3 className="text-base font-black text-rose-600 mb-2 flex items-center gap-2">
                <AlertCircle size={18} className="text-rose-500" />
                <span>{t.dangerZone}</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold pl-1 leading-relaxed mb-5">
                {t.dangerZoneHelp}
              </p>

              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-md shadow-rose-500/10 active:scale-95 transition-all"
              >
                {t.closeAccount}
              </button>
            </div>
          </div>

          {/* Sidebar right */}
          <div className="space-y-8">
            <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Shield size={16} className="text-orange-500" />
                <span>{t.securityCommit}</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                {t.securityCommitHelp}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'language' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className={`p-6 md:p-8 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-base font-black text-slate-800 dark:text-white mb-5 flex items-center gap-2">
                <Globe size={18} className="text-orange-500" />
                <span>{t.languageTitle}</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {locales.map((locale) => (
                  <button
                    key={locale.value}
                    type="button"
                    onClick={() => handleLanguageChange(locale.value)}
                    className={`text-left p-4 rounded-2xl border transition-all ${language === locale.value
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 shadow-sm'
                      : isDarkMode
                        ? 'border-slate-800 bg-slate-950/50 text-slate-200 hover:border-slate-700'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-orange-200'
                      }`}
                  >
                    <div className="text-sm font-black">{locale.label}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{locale.value}</div>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSaveLanguage}
                className="mt-5 px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-2xl shadow-md active:scale-95 transition-all"
              >
                {t.savePreferences}
              </button>
            </div>
          </div>

          <div className="space-y-8">
            <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Info size={16} className="text-orange-500" />
                <span>{t.displaySettings}</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                {t.languageHelp}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Set SSO Password Modal */}
      {showSetPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-900'
            }`}>
            <h3 className="text-lg font-black mb-2 flex items-center gap-2">
              <Lock className="text-orange-500" />
              <span>{t.setSSOPasswordTitle}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5 font-medium leading-relaxed">
              {t.setSSOPasswordHelp}
            </p>

            <form onSubmit={handleSetSSOPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 pl-1">{t.newPassword}</label>
                <div className="relative">
                  <input
                    type={showSsoNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t.newPasswordPlaceholder}
                    className={`w-full px-4 pr-11 py-2.5 text-sm font-semibold rounded-xl border outline-none ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white focus:border-orange-500' : 'bg-white border-slate-200 text-slate-800 focus:border-orange-500'
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSsoNewPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors"
                    aria-label={showSsoNewPassword ? 'Hide new password' : 'Show new password'}
                  >
                    {showSsoNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 pl-1">{t.confirmPassword}</label>
                <div className="relative">
                  <input
                    type={showSsoConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t.confirmPasswordPlaceholder}
                    className={`w-full px-4 pr-11 py-2.5 text-sm font-semibold rounded-xl border outline-none ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white focus:border-orange-500' : 'bg-white border-slate-200 text-slate-800 focus:border-orange-500'
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSsoConfirmPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-orange-500 transition-colors"
                    aria-label={showSsoConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'}
                  >
                    {showSsoConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {passwordError && (
                <p className="text-xs text-rose-500 font-bold pl-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  {passwordError}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200/50 dark:border-slate-800/60">
                <button
                  type="button"
                  onClick={() => {
                    setShowSetPasswordModal(false)
                    setNewPassword('')
                    setConfirmPassword('')
                    setPasswordError('')
                    setShowSsoNewPassword(false)
                    setShowSsoConfirmPassword(false)
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  className="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black rounded-xl hover:shadow-lg active:scale-95 transition-all"
                >
                  {isSubmittingPassword ? t.settingBtn : t.setBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Account Confirmation Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl transition-all duration-300 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-orange-100 text-slate-900'
            }`}>
            <h3 className="text-lg font-black mb-3 text-rose-600 flex items-center gap-2">
              <AlertCircle className="text-rose-500 animate-bounce" />
              <span>{t.closeAccountTitle}</span>
            </h3>
            <div className="text-sm space-y-3 mb-6 leading-relaxed text-slate-400 font-medium">
              <p className="font-extrabold text-slate-750 dark:text-slate-350">
                {t.close1}
              </p>
              <p>
                {t.close2}
              </p>
              <p>
                {t.close3} <strong className="text-orange-500">{t.close4}</strong> {t.close5}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200/50 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleCloseAccount}
                disabled={isClosingAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl hover:shadow-lg active:scale-95 transition-all"
              >
                {isClosingAccount ? t.processing : t.confirmDelete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
