import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'

const AUTH_ME_ENDPOINTS = ['/api/auth/me', '/api/v1/auth/me'] as const

export type UserRole = 'STUDENT' | 'ORGANIZER' | 'STAFF' | 'ADMIN'

export interface User {
  id: number
  fullName?: string
  email: string
  phone?: string
  role: UserRole
  status?: string
  createdAt?: string
  wallet?: number
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  token: string | null
  setUser: React.Dispatch<React.SetStateAction<User | null>>
  setToken: (token: string | null) => void
  login: (email: string, password: string, role: UserRole) => void
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Keep token state only for compatibility with existing consumers.
  const [token, setToken] = useState<string | null>(null)
  const isLoadingRef = useRef(true)

  useEffect(() => {
    isLoadingRef.current = isLoading
  }, [isLoading])

  const login = (_email: string, _password: string, _role: UserRole) => {
    // Compatibility no-op. Actual login is handled in Login.tsx.
  }

  const fetchUserFromMe = useCallback(async (): Promise<User | null> => {
    for (const endpoint of AUTH_ME_ENDPOINTS) {
      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'include',
        })

        if (res.ok) {
          const data = await res.json()
          const userObj = data?.user ?? data
          return userObj ?? null
        }

        // Session has expired: clear state immediately.
        if (res.status === 401) {
          return null
        }

        // Allow fallback to legacy route when primary endpoint is unavailable.
        if (res.status === 404) {
          continue
        }

        return null
      } catch (err) {
        // Try next endpoint on network/path errors.
        continue
      }
    }

    return null
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const userObj = await fetchUserFromMe()
      setUser(userObj)
    } catch (err) {
      console.error('refreshUser error:', err)
      setUser(null)
    }
  }, [fetchUserFromMe])

  const logout = useCallback(() => {
    void axios.post('/api/logout', null, { withCredentials: true }).catch(() => undefined)
    setUser(null)
    setToken(null)
  }, [])

  useEffect(() => {
    // Remove any legacy token/user entries from localStorage.
    // User state is stored in React state + HttpOnly cookie, NEVER in localStorage.
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('user')
  }, [])

  useEffect(() => {
    axios.defaults.withCredentials = true

    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          setUser(null)
          setToken(null)

          const requestUrl = String(error.config?.url ?? '')
          const isMeRequest = requestUrl.includes('/api/v1/auth/me') || requestUrl.includes('/api/auth/me')

          if (!isLoadingRef.current && !isMeRequest && window.location.pathname !== '/login' && window.location.pathname !== '/') {
            window.location.href = '/login'
          }
        }
        return Promise.reject(error)
      }
    )

    return () => {
      axios.interceptors.response.eject(interceptorId)
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const bootstrapAuth = async () => {
      setIsLoading(true)

      try {
        const userObj = await fetchUserFromMe()

        if (!isMounted) {
          return
        }

        setUser(userObj)
      } catch (err) {
        if (isMounted) {
          console.error('bootstrapAuth error:', err)
          setUser(null)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void bootstrapAuth()

    return () => {
      isMounted = false
    }
  }, [fetchUserFromMe])

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
    <AuthContext.Provider value={{ user, isLoading, token, setUser, setToken, login, logout, refreshUser }}>
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