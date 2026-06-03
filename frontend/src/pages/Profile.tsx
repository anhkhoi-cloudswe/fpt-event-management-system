import { useState, useEffect, useMemo } from 'react'
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
  { value: 'en-US', label: 'English (United States)' },
  { value: 'vi-VN', label: 'Vietnamese (Vietnam)' },
  { value: 'fr-FR', label: 'FranÃ§ais (France)' },
  { value: 'it-IT', label: 'Italiano (Italia)' },
  { value: 'es-ES', label: 'EspaÃ±ol (EspaÃ±a)' },
  { value: 'pt-BR', label: 'PortuguÃªs (Brasil)' },
  { value: 'de-DE', label: 'Deutsch (Deutschland)' },
]

const profileTranslations: Record<string, Record<string, string>> = {
  'en-US': {
    profileTab: 'Personal information',
    securityTab: 'Security & Account',
    languageTab: 'Language',
    languageTitle: 'Language',
    displaySettings: 'Display settings',
    languageHelp: 'Your language preference is saved in this browser and used on future visits.',
    savePreferences: 'Save Preferences',
    preferencesSaved: 'Language preferences saved',
    oldPassword: 'OLD PASSWORD',
    newPassword: 'New password',
    confirmPassword: 'Confirm new password',
    updatePassword: 'Update password',
    updating: 'Updating...',
    walletBalance: 'E-wallet balance',
  },
  'vi-VN': {
    profileTab: 'Thông tin cá nhân',
    securityTab: 'Bảo mật & Tài khoản',
    languageTab: 'Ngôn ngữ',
    languageTitle: 'Ngôn ngữ',
    displaySettings: 'Thiết lập hiển thị',
    languageHelp: 'Lựa chọn ngôn ngữ được lưu trên trình duyệt này và sẽ được dùng cho các lần truy cập tiếp theo.',
    savePreferences: 'Lưu thiết lập',
    preferencesSaved: 'Đã lưu thiết lập ngôn ngữ',
    oldPassword: 'MẬT KHẨU CŨ',
    newPassword: 'Mật khẩu mới',
    confirmPassword: 'Xác nhận mật khẩu mới',
    updatePassword: 'Cập nhật mật khẩu',
    updating: 'Đang cập nhật...',
    walletBalance: 'Số dư ví điện tử',
  },
  'fr-FR': {
    profileTab: 'Informations personnelles',
    securityTab: 'Sécurité et compte',
    languageTab: 'Langue',
    languageTitle: 'Langue',
    displaySettings: 'Paramètres d’affichage',
    languageHelp: 'Votre préférence linguistique est enregistrée dans ce navigateur.',
    savePreferences: 'Enregistrer',
    preferencesSaved: 'Préférences de langue enregistrées',
    oldPassword: 'ANCIEN MOT DE PASSE',
    newPassword: 'Nouveau mot de passe',
    confirmPassword: 'Confirmer le nouveau mot de passe',
    updatePassword: 'Mettre à jour',
    updating: 'Mise à jour...',
    walletBalance: 'Solde du portefeuille',
  },
  'it-IT': {
    profileTab: 'Informazioni personali',
    securityTab: 'Sicurezza e account',
    languageTab: 'Lingua',
    languageTitle: 'Lingua',
    displaySettings: 'Impostazioni di visualizzazione',
    languageHelp: 'La preferenza della lingua viene salvata in questo browser.',
    savePreferences: 'Salva preferenze',
    preferencesSaved: 'Preferenze lingua salvate',
    oldPassword: 'VECCHIA PASSWORD',
    newPassword: 'Nuova password',
    confirmPassword: 'Conferma nuova password',
    updatePassword: 'Aggiorna password',
    updating: 'Aggiornamento...',
    walletBalance: 'Saldo portafoglio',
  },
  'es-ES': {
    profileTab: 'Información personal',
    securityTab: 'Seguridad y cuenta',
    languageTab: 'Idioma',
    languageTitle: 'Idioma',
    displaySettings: 'Configuración de visualización',
    languageHelp: 'La preferencia de idioma se guarda en este navegador.',
    savePreferences: 'Guardar preferencias',
    preferencesSaved: 'Preferencias de idioma guardadas',
    oldPassword: 'CONTRASEÑA ANTERIOR',
    newPassword: 'Nueva contraseña',
    confirmPassword: 'Confirmar nueva contraseña',
    updatePassword: 'Actualizar contraseña',
    updating: 'Actualizando...',
    walletBalance: 'Saldo de billetera',
  },
  'pt-BR': {
    profileTab: 'Informações pessoais',
    securityTab: 'Segurança e conta',
    languageTab: 'Idioma',
    languageTitle: 'Idioma',
    displaySettings: 'Configurações de exibição',
    languageHelp: 'A preferência de idioma é salva neste navegador.',
    savePreferences: 'Salvar preferências',
    preferencesSaved: 'Preferências de idioma salvas',
    oldPassword: 'SENHA ANTIGA',
    newPassword: 'Nova senha',
    confirmPassword: 'Confirmar nova senha',
    updatePassword: 'Atualizar senha',
    updating: 'Atualizando...',
    walletBalance: 'Saldo da carteira',
  },
  'de-DE': {
    profileTab: 'Persönliche Daten',
    securityTab: 'Sicherheit und Konto',
    languageTab: 'Sprache',
    languageTitle: 'Sprache',
    displaySettings: 'Anzeigeeinstellungen',
    languageHelp: 'Die Spracheinstellung wird in diesem Browser gespeichert.',
    savePreferences: 'Einstellungen speichern',
    preferencesSaved: 'Spracheinstellungen gespeichert',
    oldPassword: 'ALTES PASSWORT',
    newPassword: 'Neues Passwort',
    confirmPassword: 'Neues Passwort bestätigen',
    updatePassword: 'Passwort aktualisieren',
    updating: 'Aktualisierung...',
    walletBalance: 'Wallet-Guthaben',
  },
}

export default function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const profileWalletBalance = useMemo(() => {
    const walletValue = user?.wallet
    if (walletValue && typeof walletValue === 'object' && walletValue.balance !== undefined) {
      return walletValue.balance
    }
    return user?.balance ?? user?.wallet_balance
  }, [user])

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
  const [language, setLanguage] = useState(localStorage.getItem('user_locale') || 'vi-VN')
  const [appliedLanguage, setAppliedLanguage] = useState(localStorage.getItem('user_locale') || 'vi-VN')
  const t = profileTranslations[appliedLanguage] ?? profileTranslations['vi-VN']

  // Password tab states
  const [showSetPasswordModal, setShowSetPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false)

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
      setIsDarkMode(localStorage.getItem('theme_user_' + user.id) === 'dark')
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
    if (user?.id) {
      const currentTheme = isDarkMode ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', isDarkMode)
      localStorage.setItem('theme', currentTheme)
      localStorage.setItem('theme_user_' + user.id, currentTheme)
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
    window.dispatchEvent(new Event('theme-change'))
  }, [isDarkMode])

  // Sync theme changes reactively when updated from header
  useEffect(() => {
    const handleThemeChange = () => {
      if (user?.id) {
        setIsDarkMode(localStorage.getItem('theme_user_' + user.id) === 'dark')
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
    setLanguage(locale)
  }

  const handleSaveLanguage = () => {
    setAppliedLanguage(language)
    localStorage.setItem('user_locale', language)
    localStorage.setItem('language', language)
    window.dispatchEvent(new CustomEvent('language-change', { detail: { locale: language } }))
    showToast('success', profileTranslations[language]?.preferencesSaved ?? profileTranslations['vi-VN'].preferencesSaved)
  }

  // Input phone number validation
  const validatePhone = (value: string): boolean => {
    const cleaned = value.trim()
    if (!cleaned) {
      setPhoneError('Sá»‘ Ä‘iá»‡n thoáº¡i khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng')
      return false
    }
    const phoneRegex = /^(0[3|5|7|8|9])[0-9]{8}$/
    if (!phoneRegex.test(cleaned)) {
      setPhoneError('Sá»‘ Ä‘iá»‡n thoáº¡i Viá»‡t Nam khÃ´ng há»£p lá»‡ (10 chá»¯ sá»‘, vÃ­ dá»¥: 0912345678)')
      return false
    }
    setPhoneError('')
    return true
  }

  // Validate full name
  const validateFullName = (value: string): boolean => {
    const cleaned = value.trim()
    if (!cleaned) {
      setFullNameError('Há» vÃ  tÃªn khÃ´ng Ä‘Æ°á»£c Ä‘á»ƒ trá»‘ng')
      return false
    }
    if (cleaned.length < 2) {
      setFullNameError('Há» vÃ  tÃªn pháº£i cÃ³ Ã­t nháº¥t 2 kÃ½ tá»±')
      return false
    }
    if (cleaned.length > 100) {
      setFullNameError('Há» vÃ  tÃªn khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ 100 kÃ½ tá»±')
      return false
    }
    setFullNameError('')
    return true
  }

  // Handle phone update action directly to DB
  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validatePhone(phone)) {
      showToast('error', 'Vui lÃ²ng kiá»ƒm tra lá»—i nháº­p liá»‡u!')
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
        showToast('success', 'Cáº­p nháº­t sá»‘ Ä‘iá»‡n thoáº¡i thÃ nh cÃ´ng!')
        localStorage.removeItem('user_phone_' + user?.id)
        await refreshUser()
      } else {
        showToast('error', data.message || 'Cáº­p nháº­t sá»‘ Ä‘iá»‡n thoáº¡i tháº¥t báº¡i!')
      }
    } catch (err) {
      showToast('error', 'CÃ³ lá»—i káº¿t ná»‘i máº¡ng xáº£y ra!')
    }
  }

  // Handle full name update action directly to DB
  const handleUpdateFullName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateFullName(fullName)) {
      showToast('error', 'Vui lÃ²ng kiá»ƒm tra lá»—i nháº­p liá»‡u!')
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
        showToast('success', 'Cáº­p nháº­t há» vÃ  tÃªn thÃ nh cÃ´ng!')
        await refreshUser()
      } else {
        showToast('error', data.message || 'Cáº­p nháº­t há» vÃ  tÃªn tháº¥t báº¡i!')
      }
    } catch (err) {
      showToast('error', 'CÃ³ lá»—i káº¿t ná»‘i máº¡ng xáº£y ra!')
    }
  }

  // Handle Set SSO Password
  const handleSetSSOPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      setPasswordError('Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Máº­t kháº©u xÃ¡c nháº­n khÃ´ng khá»›p')
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
        showToast('success', 'Thiáº¿t láº­p máº­t kháº©u thÃ nh cÃ´ng!')
        setShowSetPasswordModal(false)
        setNewPassword('')
        setConfirmPassword('')
        await refreshUser()
      } else {
        setPasswordError(data.message || 'Thiáº¿t láº­p máº­t kháº©u tháº¥t báº¡i')
      }
    } catch (err) {
      setPasswordError('Lá»—i káº¿t ná»‘i máº¡ng')
    } finally {
      setIsSubmittingPassword(false)
    }
  }

  // Handle standard password change
  const handleUpdateStandardPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword) {
      setStandardPasswordError('Vui lÃ²ng nháº­p máº­t kháº©u cÅ©')
      return
    }
    if (standardPassword.length < 6) {
      setStandardPasswordError('Máº­t kháº©u pháº£i cÃ³ Ã­t nháº¥t 6 kÃ½ tá»±')
      return
    }
    if (standardPassword !== standardConfirmPassword) {
      setStandardPasswordError('Máº­t kháº©u xÃ¡c nháº­n khÃ´ng khá»›p')
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
        showToast('success', 'Äá»•i máº­t kháº©u thÃ nh cÃ´ng!')
        setOldPassword('')
        setStandardPassword('')
        setStandardConfirmPassword('')
      } else {
        setStandardPasswordError(data.message || 'Äá»•i máº­t kháº©u tháº¥t báº¡i')
      }
    } catch (err) {
      setStandardPasswordError('Lá»—i káº¿t ná»‘i máº¡ng')
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
        showToast('success', 'YÃªu cáº§u Ä‘Ã³ng tÃ i khoáº£n thÃ nh cÃ´ng!')
        setShowCloseModal(false)
        logout()
      } else {
        const data = await res.json()
        showToast('error', data.message || 'YÃªu cáº§u xÃ³a tÃ i khoáº£n tháº¥t báº¡i')
      }
    } catch (err) {
      showToast('error', 'CÃ³ lá»—i káº¿t ná»‘i máº¡ng xáº£y ra!')
    } finally {
      setIsClosingAccount(false)
    }
  }

  const joinDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'ChÆ°a cáº­p nháº­t'

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
            Tham gia ngÃ y {joinDate}
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
            <p className="text-xl font-black">{profileWalletBalance.toLocaleString('vi-VN')} Ä‘</p>
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
                <span>ThÃ´ng tin LiÃªn há»‡</span>
              </h3>

              <form onSubmit={handleUpdatePhone} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider pl-1">
                    Sá»‘ Ä‘iá»‡n thoáº¡i
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value)
                        if (phoneError) validatePhone(e.target.value)
                      }}
                      placeholder="ChÆ°a cáº­p nháº­t sá»‘ Ä‘iá»‡n thoáº¡i"
                      className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${phoneError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-600'
                        : isDarkMode ? 'bg-slate-900 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white' : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-900'
                        }`}
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all"
                    >
                      LÆ°u thay Ä‘á»•i
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
                <span>Há» vÃ  TÃªn</span>
              </h3>

              <form onSubmit={handleUpdateFullName} className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider pl-1">
                    Há» vÃ  TÃªn Äáº§y Äá»§
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value)
                        if (fullNameError) validateFullName(e.target.value)
                      }}
                      placeholder="Nháº­p há» vÃ  tÃªn Ä‘áº§y Ä‘á»§"
                      className={`w-full pl-4 pr-24 py-3 text-sm font-semibold rounded-2xl border outline-none transition-all ${fullNameError
                        ? 'border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-1 focus:ring-rose-500 text-rose-600 dark:bg-rose-500/10 dark:border-rose-700 dark:text-rose-400'
                        : isDarkMode ? 'bg-slate-900 border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white' : 'bg-white border-slate-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-slate-900'
                        }`}
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-2 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-xl shadow active:scale-95 transition-all"
                    >
                      LÆ°u thay Ä‘á»•i
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
                <span>Giao diá»‡n & Khu vá»±c</span>
              </h3>

              <div className="space-y-6">
                {/* Theme selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/50 dark:border-slate-800/60">
                  <div>
                    <h4 className="text-sm font-black text-slate-850 dark:text-slate-100">Giao diá»‡n á»©ng dá»¥ng</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Tá»± do thay Ä‘á»•i Ä‘á»™ tÆ°Æ¡ng pháº£n mÃ n hÃ¬nh (SÃ¡ng hoáº·c Tá»‘i)</p>
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
                      <span>{isDarkMode ? 'Báº£n tá»‘i (Dark)' : 'Báº£n sÃ¡ng (Light)'}</span>
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
                      <h4 className="text-sm font-black text-slate-850 dark:text-slate-100">MÃºi giá» lÃ m viá»‡c</h4>
                      <p className="text-xs text-slate-400 mt-0.5">CÃ i Ä‘áº·t hiá»ƒn thá»‹ mÃºi giá» Ä‘á»ƒ Ä‘á»“ng bá»™ chÃ­nh xÃ¡c lá»‹ch sá»± kiá»‡n</p>
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
                <span>Quy trÃ¬nh Thay Ä‘á»•i Há»“ sÆ¡</span>
              </h3>

              <div className="space-y-4 text-xs leading-relaxed text-slate-400 font-medium">
                <div className="p-3 rounded-2xl bg-orange-500/5 border border-orange-500/10 flex items-start gap-2.5">
                  <CheckCircle2 size={16} className="text-orange-500 flex-shrink-0 mt-0.5" />
                  <p>
                    <strong>Sá»‘ Ä‘iá»‡n thoáº¡i</strong> cÃ³ thá»ƒ tá»± Ä‘iá»u chá»‰nh vÃ  lÆ°u trá»¯ tá»©c thÃ¬ thÃ´ng qua form bÃªn cáº¡nh Ä‘á»ƒ há»— trá»£ liÃªn láº¡c nhanh chÃ³ng.
                  </p>
                </div>

                <div className="p-3 rounded-2xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-amber-550 flex-shrink-0 mt-0.5" />
                  <p>
                    CÃ¡c thÃ´ng tin Ä‘á»‹nh danh phÃ¡p lÃ½ nhÆ° <strong>Há» vÃ  tÃªn</strong>, <strong>Email trÆ°á»ng há»c</strong>, vÃ  <strong>Vai trÃ² há»‡ thá»‘ng</strong> khÃ´ng thá»ƒ tá»± cáº­p nháº­t nháº±m phÃ²ng chá»‘ng gian láº­n danh tÃ­nh.
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wide text-[10px]">
                    CÃ¡c bÆ°á»›c yÃªu cáº§u thay Ä‘á»•i:
                  </p>
                  <ol className="list-decimal list-inside pl-1 space-y-1.5">
                    <li>Gá»­i email tá»« hÃ²m thÆ° FPT chÃ­nh thá»©c tá»›i ban quáº£n trá»‹ táº¡i <a href="mailto:support@fpt.edu.vn" className="text-orange-600 font-bold hover:underline">support@fpt.edu.vn</a>.</li>
                    <li>Cung cáº¥p mÃ£ sá»‘ sinh viÃªn/mÃ£ cÃ¡n bá»™ vÃ  Ä‘Ã­nh kÃ¨m báº£n sao tháº» sinh viÃªn/CMND Ä‘á»‘i chiáº¿u.</li>
                    <li>Bá»™ pháº­n há»— trá»£ ká»¹ thuáº­t FPT Event sáº½ xá»­ lÃ½ yÃªu cáº§u thay Ä‘á»•i trong vÃ²ng <strong>24h lÃ m viá»‡c</strong>.</li>
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
                <span>Báº£o máº­t máº­t kháº©u</span>
              </h3>

              {user?.ssoProvider === 'GOOGLE' ? (
                // SSO warning banner matching Figure 4 (amber/yellow premium alert block)
                <div className="space-y-6">
                  <div className="p-5 rounded-2xl bg-amber-500/10 dark:bg-amber-500/5 border border-amber-500/25 text-amber-800 dark:text-amber-350 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-550 flex-shrink-0 mt-0.5" />
                      <div className="text-sm font-medium leading-relaxed">
                        <p className="font-extrabold text-amber-900 dark:text-amber-200">Báº¡n Ä‘Äƒng nháº­p qua Google</p>
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          TÃ i khoáº£n cá»§a báº¡n hiá»‡n táº¡i chÆ°a cÃ³ máº­t kháº©u Ä‘Æ°á»£c lÆ°u trá»¯ trÃªn mÃ¡y chá»§ FPT Event vÃ¬ báº¡n sá»­ dá»¥ng phÆ°Æ¡ng thá»©c Ä‘Äƒng nháº­p má»™t láº§n (Single Sign On).
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 font-semibold pl-1 leading-relaxed">
                    Báº¡n cÃ³ thá»ƒ thiáº¿t láº­p máº­t kháº©u riÃªng báº¥t cá»© lÃºc nÃ o. Viá»‡c nÃ y cho phÃ©p báº¡n Ä‘Äƒng nháº­p linh hoáº¡t báº±ng cáº£ tÃ i khoáº£n Google láº«n email/máº­t kháº©u trá»±c tiáº¿p.
                  </p>

                  <button
                    onClick={() => setShowSetPasswordModal(true)}
                    className="px-5 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white font-black text-xs rounded-2xl shadow-md shadow-orange-500/10 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <Lock size={14} />
                    <span>Thiáº¿t láº­p máº­t kháº©u má»›i</span>
                  </button>
                </div>
              ) : (
                // Standard Password Change Form
                <form onSubmit={handleUpdateStandardPassword} className="space-y-4">
                  <p className="text-xs text-slate-450 dark:text-slate-400 font-semibold pl-1">
                    Thiáº¿t láº­p máº­t kháº©u cÃ³ Ä‘á»™ dÃ i tá»‘i thiá»ƒu 6 kÃ½ tá»± Ä‘á»ƒ báº£o vá»‡ an toÃ n cho tÃ i khoáº£n cá»§a báº¡n.
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
                        placeholder="Nháº­p máº­t kháº©u hiá»‡n táº¡i"
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
                        placeholder="Nháº­p máº­t kháº©u má»›i (Ã­t nháº¥t 6 kÃ½ tá»±)"
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
                        placeholder="Nháº­p láº¡i máº­t kháº©u má»›i"
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
                <span>Khu vá»±c Nguy hiá»ƒm</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold pl-1 leading-relaxed mb-5">
                Khi đóng tài khoản, hệ thống sẽ đưa tài khoản của bạn vào hàng đợi xóa. Bạn có 30 ngày để hủy yêu cầu nếu đổi ý.
              </p>

              <button
                type="button"
                onClick={() => setShowCloseModal(true)}
                className="px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black text-xs rounded-2xl shadow-md shadow-rose-500/10 active:scale-95 transition-all"
              >
                ÄÃ³ng tÃ i khoáº£n cá»§a tÃ´i
              </button>
            </div>
          </div>

          {/* Sidebar right */}
          <div className="space-y-8">
            <div className={`p-6 rounded-3xl border shadow-xl transition-colors duration-500 ${isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 backdrop-blur-md'
              }`}>
              <h3 className="text-sm font-black text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                <Shield size={16} className="text-orange-500" />
                <span>Cam káº¿t Báº£o máº­t</span>
              </h3>
              <p className="text-xs text-slate-400 font-medium leading-relaxed">
                ChÃºng tÃ´i Ã¡p dá»¥ng cÃ¡c tiÃªu chuáº©n mÃ£ hÃ³a tiÃªn tiáº¿n nháº¥t Ä‘á»ƒ báº£o vá»‡ thÃ´ng tin máº­t kháº©u cá»§a báº¡n. FPT Event khÃ´ng lÆ°u trá»¯ máº­t kháº©u á»Ÿ dáº¡ng plain-text vÃ  khÃ´ng bao giá» chia sáº» dá»¯ liá»‡u Ä‘á»‹nh danh cá»§a báº¡n cho bÃªn thá»© ba.
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
              <span>Thiáº¿t láº­p máº­t kháº©u tÃ i khoáº£n</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5 font-medium leading-relaxed">
              Thiáº¿t láº­p máº­t kháº©u cho tÃ i khoáº£n Google Ä‘á»ƒ cÃ³ thá»ƒ tá»± do Ä‘Äƒng nháº­p báº±ng email cá»§a báº¡n.
            </p>

            <form onSubmit={handleSetSSOPassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 pl-1">Máº­t kháº©u má»›i</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tá»‘i thiá»ƒu 6 kÃ½ tá»±"
                  className={`w-full px-4 py-2.5 text-sm font-semibold rounded-xl border outline-none ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white focus:border-orange-500' : 'bg-white border-slate-200 text-slate-800 focus:border-orange-500'
                    }`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 pl-1">XÃ¡c nháº­n máº­t kháº©u má»›i</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nháº­p láº¡i máº­t kháº©u má»›i"
                  className={`w-full px-4 py-2.5 text-sm font-semibold rounded-xl border outline-none ${isDarkMode ? 'bg-slate-950 border-slate-700 text-white focus:border-orange-500' : 'bg-white border-slate-200 text-slate-800 focus:border-orange-500'
                    }`}
                />
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
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                >
                  Há»§y bá»
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  className="px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-black rounded-xl hover:shadow-lg active:scale-95 transition-all"
                >
                  {isSubmittingPassword ? 'Äang thiáº¿t láº­p...' : 'Thiáº¿t láº­p máº­t kháº©u'}
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
              <span>XÃ¡c nháº­n xÃ³a tÃ i khoáº£n</span>
            </h3>
            <div className="text-sm space-y-3 mb-6 leading-relaxed text-slate-400 font-medium">
              <p className="font-extrabold text-slate-750 dark:text-slate-350">
                Báº¡n Ä‘ang thá»±c hiá»‡n yÃªu cáº§u xÃ³a tÃ i khoáº£n cÃ¡ nhÃ¢n.
              </p>
              <p>
                Tài khoản của bạn sẽ được đưa vào hàng đợi xóa và bạn sẽ được đăng xuất ngay lập tức.
              </p>
              <p>
                Báº¡n cÃ³ <strong className="text-orange-500">30 ngÃ y</strong> Ä‘á»ƒ Ä‘Äƒng nháº­p láº¡i vÃ  khÃ´i phá»¥c tÃ i khoáº£n. Sau thá»i gian nÃ y, tÃ i khoáº£n vÃ  má»i dá»¯ liá»‡u liÃªn quan sáº½ bá»‹ xÃ³a vÄ©nh viá»…n vÃ  khÃ´ng thá»ƒ khÃ´i phá»¥c.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-200/50 dark:border-slate-800/60">
              <button
                type="button"
                onClick={() => setShowCloseModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
              >
                Há»§y bá»
              </button>
              <button
                type="button"
                onClick={handleCloseAccount}
                disabled={isClosingAccount}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl hover:shadow-lg active:scale-95 transition-all"
              >
                {isClosingAccount ? 'Äang xá»­ lÃ½...' : 'XÃ¡c nháº­n xÃ³a'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
