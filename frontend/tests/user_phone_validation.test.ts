import { describe, it, expect } from 'vitest'
import { isValidVNPhone, getPhoneError } from '../src/utils/validation'

describe('Vietnamese Phone Validation', () => {
  it('should accept valid 10-digit Vietnamese phone numbers with 03, 05, 07, 08, 09 prefixes', () => {
    expect(isValidVNPhone('0912345678')).toBe(true)
    expect(isValidVNPhone('0987654321')).toBe(true)
    expect(isValidVNPhone('0323456789')).toBe(true)
    expect(isValidVNPhone('0523456789')).toBe(true)
    expect(isValidVNPhone('0723456789')).toBe(true)
    expect(isValidVNPhone('0823456789')).toBe(true)
  })

  it('should accept valid phone numbers with +84 and 84 country codes', () => {
    expect(isValidVNPhone('+84912345678')).toBe(true)
    expect(isValidVNPhone('84912345678')).toBe(true)
    expect(isValidVNPhone('+84323456789')).toBe(true)
    expect(isValidVNPhone('84523456789')).toBe(true)
  })

  it('should reject invalid phone prefixes or lengths', () => {
    expect(isValidVNPhone('0123456789')).toBe(false) // 01 is legacy / invalid prefix
    expect(isValidVNPhone('0223456789')).toBe(false) // 02 is landline prefix
    expect(isValidVNPhone('091234567')).toBe(false) // too short (9 digits)
    expect(isValidVNPhone('091234567890')).toBe(false) // too long
    expect(isValidVNPhone('abcdefghij')).toBe(false)
    expect(isValidVNPhone('')).toBe(false)
    expect(isValidVNPhone(null)).toBe(false)
    expect(isValidVNPhone(undefined)).toBe(false)
  })

  it('should return correct user-friendly error messages with getPhoneError', () => {
    // Empty cases
    expect(getPhoneError('')).toBe('Số điện thoại không được để trống')
    expect(getPhoneError('   ')).toBe('Số điện thoại không được để trống')
    expect(getPhoneError(null)).toBe('Số điện thoại không được để trống')
    expect(getPhoneError(undefined)).toBe('Số điện thoại không được để trống')

    // Invalid cases
    expect(getPhoneError('12345')).toBe('Số điện thoại không hợp lệ. Phải là số Việt Nam (03x, 05x, 07x, 08x, 09x)')
    expect(getPhoneError('0123456789')).toBe('Số điện thoại không hợp lệ. Phải là số Việt Nam (03x, 05x, 07x, 08x, 09x)')
    expect(getPhoneError('abcxyz1234')).toBe('Số điện thoại không hợp lệ. Phải là số Việt Nam (03x, 05x, 07x, 08x, 09x)')

    // Valid cases
    expect(getPhoneError('0912345678')).toBeNull()
    expect(getPhoneError('+84912345678')).toBeNull()
    expect(getPhoneError('84912345678')).toBeNull()
  })
})
