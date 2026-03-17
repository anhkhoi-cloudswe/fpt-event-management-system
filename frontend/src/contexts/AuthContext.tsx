import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import axios from 'axios'

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
  // Keep token state only for compatibility with existing consumers.
  const [token, setToken] = useState<string | null>(null)

  const login = (_email: string, _password: string, _role: UserRole) => {
    // Compatibility no-op. Actual login is handled in Login.tsx.
  }

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      })

      if (!res.ok) {
        setUser(null)
        return
      }

      const data = await res.json()
      const userObj = data?.user ?? data
      if (userObj) {
        setUser(userObj)
      }
    } catch (err) {
      console.error('refreshUser error:', err)
      setUser(null)
    }
  }, [])

  const logout = useCallback(() => {
    void axios.post('/api/logout', null, { withCredentials: true }).catch(() => undefined)
    setUser(null)
    setToken(null)
  }, [])

  useEffect(() => {
    localStorage.removeItem('token')
  }, [])

  useEffect(() => {
    axios.defaults.withCredentials = true

    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          setUser(null)
          setToken(null)
          if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
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
    void refreshUser()
  }, [refreshUser])

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken, login, logout, refreshUser }}>
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