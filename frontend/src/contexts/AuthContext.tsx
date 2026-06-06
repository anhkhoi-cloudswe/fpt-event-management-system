import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { getAccessToken, setAccessToken } from '../config/api'

const AUTH_ME_ENDPOINTS = ['/api/auth/me'] as const

export type UserRole = 'STUDENT' | 'ORGANIZER' | 'STAFF' | 'ADMIN'

export interface User {
  id: number
  fullName?: string
  email: string
  phone?: string
  role: UserRole
  status?: string
  createdAt?: string
  wallet?: number | { balance?: number }
  balance?: number
  wallet_balance?: number
  ssoProvider?: string
  theme?: 'light' | 'dark' | string
  language?: 'vi' | 'en' | string
  timezone_id?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  isLoading: boolean
  isAuthenticated: boolean
  token: string | null
  setUser: React.Dispatch<React.SetStateAction<User | null>>
  setToken: (token: string | null) => void
  login: (email: string, password: string, role: UserRole) => void
  logout: () => void
  refreshUser: () => Promise<void>
  currentLanguage: 'vi' | 'en'
  changeLanguage: (lang: 'vi' | 'en') => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  // Keep token state only for compatibility with existing consumers.
  const [token, setTokenState] = useState<string | null>(null)
  const isLoadingRef = useRef(true)

  const setToken = (t: string | null) => {
    setTokenState(t)
    setAccessToken(t)
  }

  useEffect(() => {
    setIsAuthenticated(!!user)
  }, [user])

  const [currentLanguage, setCurrentLanguage] = useState<'vi' | 'en'>(() => {
    const saved = localStorage.getItem('language') || localStorage.getItem('user_locale')
    return saved?.toLowerCase().startsWith('en') ? 'en' : 'vi'
  })

  const changeLanguage = useCallback((lang: 'vi' | 'en') => {
    setCurrentLanguage(lang)
    localStorage.setItem('language', lang)
    localStorage.setItem('user_locale', lang)
    window.dispatchEvent(new CustomEvent('language-change', { detail: { locale: lang } }))
  }, [])

  useEffect(() => {
    isLoadingRef.current = loading
  }, [loading])

  const login = (_email: string, _password: string, _role: UserRole) => {
    // Compatibility no-op. Actual login is handled in Login.tsx.
  }

  const fetchUserFromMe = useCallback(async (): Promise<User | null> => {
    for (const endpoint of AUTH_ME_ENDPOINTS) {
      try {
        const res = await axios.get(endpoint, {
          withCredentials: true,
        })
        const data = res.data
        const userObj = data?.user ?? data
        if (userObj?.language) {
          const normalized = userObj.language.toLowerCase().startsWith('en') ? 'en' : 'vi'
          setCurrentLanguage(normalized)
          localStorage.setItem('language', normalized)
          localStorage.setItem('user_locale', normalized)
        }
        return userObj ?? null
      } catch (err: any) {
        if (err.response?.status === 401) {
          return null
        }
        if (err.response?.status === 404) {
          continue
        }
        return null
      }
    }

    return null
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const userObj = await fetchUserFromMe()
      setUser(userObj)
      setIsAuthenticated(Boolean(userObj))
    } catch (err) {
      console.error('refreshUser error:', err)
      setUser(null)
      setIsAuthenticated(false)
    }
  }, [fetchUserFromMe])

  const logout = useCallback(() => {
    void axios.post('/auth/logout', null, { withCredentials: true }).catch(() => undefined)
    setAccessToken(null)
    setUser(null)
    setTokenState(null)
    setIsAuthenticated(false)
  }, [])

  useEffect(() => {
    // Remove any legacy token/user entries from localStorage.
    // User state is stored in React state + HttpOnly cookie, NEVER in localStorage.
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('user')
  }, [])

  // Listen to session expired events from Axios client config
  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null)
      setTokenState(null)
      setIsAuthenticated(false)
    }
    window.addEventListener('auth:session-expired', handleSessionExpired)
    return () => window.removeEventListener('auth:session-expired', handleSessionExpired)
  }, [])

  useEffect(() => {
    // Strictly FORBID automatic background refresh loops if the client is already standing on the public guest route
    if (window.location.pathname === '/guest') {
      setLoading(false) // Instantly release the "Loading Auth State..." screen barrier smoothly
      return
    }

    let isMounted = true

    const bootstrapAuth = async () => {
      setLoading(true)

      try {
        let activeToken = getAccessToken()
        if (!activeToken) {
          try {
            const res = await axios.post('/auth/refresh', null, { withCredentials: true })
            if (res.data && res.data.accessToken) {
              activeToken = res.data.accessToken
              setAccessToken(activeToken)
            }
          } catch (refreshErr) {
            console.warn('Silent refresh failed during bootstrap:', refreshErr)
          }
        }

        const userObj = await fetchUserFromMe()

        if (!isMounted) {
          return
        }

        setUser(userObj)
        setIsAuthenticated(Boolean(userObj))
      } catch (err) {
        if (isMounted) {
          console.error('bootstrapAuth error:', err)
          setUser(null)
          setIsAuthenticated(false)
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    void bootstrapAuth()

    return () => {
      isMounted = false
    }
  }, [fetchUserFromMe])

  useEffect(() => {
    if (user?.language) {
      const normalized = user.language.toLowerCase().startsWith('en') ? 'en' : 'vi'
      setCurrentLanguage(normalized)
      localStorage.setItem('language', normalized)
      localStorage.setItem('user_locale', normalized)
    }
  }, [user])

  // Defensive: Monitor and clear any user entries in localStorage.
  // User state must ONLY exist in React state + HttpOnly cookie, never localStorage.
  useEffect(() => {
    // Clear on mount and whenever user state changes
    localStorage.removeItem('user')
    sessionStorage.removeItem('user')

    // Also monitor window storage events from other tabs that might try to set user
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user' && e.newValue) {
        console.warn('Detected unauthorized localStorage user write. Removing.')
        localStorage.removeItem('user')
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [user])

  // Sync user-isolated theme preference on user state changes.
  // Backend profile theme is the source of truth on initialization/F5.
  useEffect(() => {
    const isDashboardRoute = (pathname: string) => {
      return pathname === '/' || pathname.startsWith('/dashboard') || pathname.startsWith('/my-tickets')
    }

    if (user) {
      const profileTheme = user.theme === 'dark' ? 'dark' : 'light'

      if (profileTheme === 'dark' && isDashboardRoute(window.location.pathname)) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }

      localStorage.setItem('theme', profileTheme)
      localStorage.setItem('theme_user_' + user.id, profileTheme)

      window.dispatchEvent(new Event('theme-change'))
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
      window.dispatchEvent(new Event('theme-change'))
    }
  }, [user])

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      const isDashboardRoute = (pathname: string) => {
        return pathname === '/' || pathname.startsWith('/dashboard') || pathname.startsWith('/my-tickets')
      }

      if (user?.id && e.key === `theme_user_${user.id}`) {
        const newTheme = e.newValue
        if (newTheme === 'dark' && isDashboardRoute(window.location.pathname)) {
          document.documentElement.classList.add('dark')
          localStorage.setItem('theme', 'dark')
        } else {
          document.documentElement.classList.remove('dark')
          localStorage.setItem('theme', 'light')
        }
        window.dispatchEvent(new Event('theme-change'))
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [user])

  useEffect(() => {
    const refreshOnFocus = () => {
      void refreshUser()
    }

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshUser()
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshUser()
    }, 30000)

    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnVisibility)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisibility)
    }
  }, [refreshUser])

  return (
    <AuthContext.Provider value={{ user, loading, isLoading: loading, isAuthenticated, token, setUser, setToken, login, logout, refreshUser, currentLanguage, changeLanguage }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
