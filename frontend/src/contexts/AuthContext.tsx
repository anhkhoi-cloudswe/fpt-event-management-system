import React, { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'STUDENT' | 'ORGANIZER' | 'STAFF' | 'ADMIN'

export interface User {
  id: number
  fullName: string
  email: string
  phone?: string
  role: UserRole
  status: string
  createdAt?: string
  wallet?: number
}

interface AuthContextType {
  user: User | null
  token: string | null
  // allow functional updates: setUser(prev => ...)
  setUser: React.Dispatch<React.SetStateAction<User | null>>
  setToken: (token: string | null) => void
  login: (email: string, password: string, role: UserRole) => void
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('token')
  })

  useEffect(() => {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user))
    } else {
      localStorage.removeItem('user')
    }
  }, [user])

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
    }
  }, [token])

  const login = (email: string, password: string, role: UserRole) => {
    // This function is kept for compatibility but is not used
    // The actual login is done via setUser in Login.tsx
  }

  const logout = () => {
    setUser(null)
    setToken(null)
  }

  // Refresh user profile from backend and update context + localStorage
  const refreshUser = async () => {
    try {
      const savedToken = token ?? localStorage.getItem('token')
      if (!savedToken) return

      // Default endpoint - change if your backend uses a different path
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${savedToken}`,
        },
        cache: 'no-store',
        credentials: 'include',
      })

      if (!res.ok) return

      const data = await res.json()
      // Some backends return { user: { ... } }
      const userObj = data?.user ?? data
      if (userObj) {
        setUser(userObj)
        try { localStorage.setItem('user', JSON.stringify(userObj)) } catch (_) {}
      }
    } catch (err) {
      console.error('refreshUser error:', err)
    }
  }

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

