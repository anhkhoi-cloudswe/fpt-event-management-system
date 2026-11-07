import { api } from '../config/api'

export interface SupervisedUser {
  id: number
  email: string
  name: string
  role: string
  safeMode: boolean
  createdAt: string
}

export interface SystemUserOption {
  userId: number
  fullName: string
  email: string
  role: string
  status: string
}

export interface RequestLog {
  id: number
  timestamp: string
  method: string
  path: string
  query?: string
  body?: string
  clientIP: string
  userAgent: string
  status: 'BLOCKED_SAFE_MODE' | 'PASSED_READONLY' | 'PASSED_WRITE'
  message: string
}

export interface PageVisitSession {
  id: string
  userEmail: string
  userName: string
  userId: number
  userRole: string
  pageUrl: string
  pageName: string
  startTime: string
  lastActive: string
  clientIP: string
  userAgent: string
  totalCalls: number
  blockedCalls: number
  requests: RequestLog[]
}

export const ghostAdminService = {
  getStatus: async (): Promise<{ success: boolean; rootAdminEmail: string; supervisedUsers: SupervisedUser[] }> => {
    const res = await api.get('/api/internal/ghost-mode/status')
    return res.data
  },

  getAvailableUsers: async (): Promise<SystemUserOption[]> => {
    // 1. First priority: fetch directly from real Auth Service via /api/users/staff-organizer
    try {
      const res = await api.get('/api/users/staff-organizer')
      const data = res.data
      const users: SystemUserOption[] = []

      const addUsers = (list: any[], defaultRole: string) => {
        if (!Array.isArray(list)) return
        list.forEach((u) => {
          if (u.email) {
            users.push({
              userId: u.id || u.userId || 0,
              fullName: u.fullName || u.username || u.email.split('@')[0],
              email: u.email,
              role: u.role || defaultRole,
              status: u.status || 'ACTIVE'
            })
          }
        })
      }

      addUsers(data.adminList, 'ADMIN')
      addUsers(data.staffList, 'STAFF')
      addUsers(data.organizerList, 'ORGANIZER')
      addUsers(data.studentList, 'STUDENT')
      if (users.length > 0) return users
    } catch (err) {
      console.warn('Direct fetch from /api/users/staff-organizer failed, falling back to internal endpoint...', err)
    }

    // 2. Fallback: Internal endpoint
    try {
      const res = await api.get('/api/internal/ghost-mode/system-users')
      const data = res.data
      const users: SystemUserOption[] = []

      const addUsers = (list: any[], defaultRole: string) => {
        if (!Array.isArray(list)) return
        list.forEach((u) => {
          if (u.email) {
            users.push({
              userId: u.id || u.userId || 0,
              fullName: u.fullName || u.username || u.email.split('@')[0],
              email: u.email,
              role: u.role || defaultRole,
              status: u.status || 'ACTIVE'
            })
          }
        })
      }

      addUsers(data.adminList, 'ADMIN')
      addUsers(data.staffList, 'STAFF')
      addUsers(data.organizerList, 'ORGANIZER')
      addUsers(data.studentList, 'STUDENT')
      return users
    } catch {
      return []
    }
  },

  toggleSafeMode: async (email: string, safeMode: boolean): Promise<{ success: boolean; message: string }> => {
    const res = await api.post('/api/internal/ghost-mode/toggle', { email, safeMode })
    return res.data
  },

  addUser: async (user: { id?: number; email: string; name: string; role: string }): Promise<{ success: boolean; user: SupervisedUser }> => {
    const res = await api.post('/api/internal/ghost-mode/add-user', user)
    return res.data
  },

  removeUser: async (email: string): Promise<{ success: boolean }> => {
    const res = await api.post('/api/internal/ghost-mode/remove-user', { email })
    return res.data
  },

  getSessions: async (): Promise<{ success: boolean; count: number; sessions: PageVisitSession[] }> => {
    const res = await api.get('/api/internal/ghost-mode/sessions')
    return res.data
  },

  clearSessions: async (): Promise<{ success: boolean; message: string }> => {
    const res = await api.delete('/api/internal/ghost-mode/sessions')
    return res.data
  }
}
