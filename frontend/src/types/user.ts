/**
 * User type definitions for Admin user management
 */

export interface User {
  userId: number
  username: string
  fullName: string
  email: string
  phone: string
  role: 'ADMIN' | 'ORGANIZER' | 'STAFF' | 'CUSTOMER'
  status: 'ACTIVE' | 'INACTIVE'
  createdAt: string
  updatedAt?: string
}

export interface CreateUserRequest {
  fullName: string
  phone: string
  email: string
  password: string
  role: 'ADMIN' | 'ORGANIZER' | 'STAFF'
}

export interface UpdateUserRequest {
  userId: number
  fullName?: string
  email?: string
  phone?: string
  role?: 'ADMIN' | 'ORGANIZER' | 'STAFF'
  status?: 'ACTIVE' | 'INACTIVE'
  password?: string
}