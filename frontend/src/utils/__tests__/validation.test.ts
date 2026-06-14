import { describe, expect, it } from 'vitest'
import {
  getEmailError,
  getPasswordError,
  isValidEmail,
  isValidFullName,
  isValidPassword,
  isValidRoleForCreation,
  isValidVNPhone,
} from '../validation'

describe('validation utilities', () => {
  it('validates accepted identity fields', () => {
    expect(isValidEmail('student.name+tag@fpt.edu.vn')).toBe(true)
    expect(isValidVNPhone('0912345678')).toBe(true)
    expect(isValidVNPhone('+84912345678')).toBe(true)
    expect(isValidFullName('Nguyen Van A')).toBe(true)
    expect(isValidFullName("Tran Thi Bich-Ngoc")).toBe(true)
  })

  it('rejects invalid identity fields', () => {
    expect(isValidEmail('student@localhost')).toBe(false)
    expect(isValidVNPhone('0212345678')).toBe(false)
    expect(isValidFullName('A')).toBe(false)
    expect(isValidFullName('Admin <script>')).toBe(false)
  })

  it('validates password and account creation roles', () => {
    expect(isValidPassword('pass111')).toBe(true)
    expect(isValidPassword('password')).toBe(false)
    expect(isValidPassword('123456')).toBe(false)
    expect(isValidRoleForCreation('staff')).toBe(true)
    expect(isValidRoleForCreation('student')).toBe(false)
  })

  it('returns user-facing error messages', () => {
    expect(getEmailError('')).toContain('không được để trống')
    expect(getEmailError('student@fpt.edu.vn')).toBeNull()
    expect(getPasswordError('abc')).toContain('ít nhất 6')
    expect(getPasswordError('abc123')).toBeNull()
  })
})
