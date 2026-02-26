/**
 * ========================================================================================================
 * UTILS: Frontend Validation - XÁC THỰC INPUT TỪ USER
 * ========================================================================================================
 * 
 * CHỨC NĂNG:
 * - Validate tất cả input từ user trong real-time khi typing
 * - Sử dụng Regex patterns giống backend để kiểm tra format
 * - Tránh gửi invalid data lên server
 * - Cải thiện UX với validation feedback ngay lập tức
 * 
 * VALIDATION METHODS:
 * 1. isValidEmail(email): Kiểm tra email hợp lệ
 *    - Pattern: RFC 5322 simplified
 *    - Example: a@fpt.edu.vn, user.name+tag@example.com
 * 
 * 2. isValidVNPhone(phone): Kiểm tra số điện thoại Việt Nam
 *    - Pattern: (+84|84|0) + (3|5|7|8|9) + 8 chữ số
 *    - Valid: 0912345678, +84912345678, 84912345678
 * 
 * 3. isValidFullName(name): Kiểm tra họ tên
 *    - Pattern: 2-100 ký tự
 *    - Allow: chữ cái (có dấu tiếng Việt), khoảng trắng, dấu chấm, dấu gạch ngang, dấu nháy đơn
 * 
 * 4. isValidPassword(password): Kiểm tra mật khẩu
 *    - Tối thiểu 6 ký tự
 *    - Phải có ít nhất 1 chữ cái (A-Z, a-z)
 *    - Phải có ít nhất 1 chữ số (0-9)
 * 
 * 5. isValidRole(role): Kiểm tra role hợp lệ
 *    - Only: ADMIN, ORGANIZER, STAFF
 */

// Email pattern - matches backend
const EMAIL_PATTERN = /^[a-zA-Z0-9_+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$/

// Vietnamese phone pattern - matches backend
const PHONE_PATTERN = /^(\+84|84|0)(3|5|7|8|9)\d{8}$/

// Full name pattern - supports Vietnamese characters
// In JavaScript, we use a broader approach for Unicode letters
const FULLNAME_PATTERN = /^[a-zA-ZÀ-ỹ .'-]{2,100}$/

// Password pattern - matches backend
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@#$%^&+=!\-]{6,}$/

/**
 * Validate email format
 */
export const isValidEmail = (email: string | null | undefined): boolean => {
  if (!email) return false
  return EMAIL_PATTERN.test(email)
}

/**
 * Validate Vietnamese phone number
 */
export const isValidVNPhone = (phone: string | null | undefined): boolean => {
  if (!phone) return false
  const trimmed = phone.trim()
  return PHONE_PATTERN.test(trimmed)
}

/**
 * Validate full name (supports Vietnamese characters)
 */
export const isValidFullName = (name: string | null | undefined): boolean => {
  if (!name) return false
  const trimmed = name.trim()
  return FULLNAME_PATTERN.test(trimmed)
}

/**
 * Validate password strength
 */
export const isValidPassword = (password: string | null | undefined): boolean => {
  if (!password) return false
  return PASSWORD_PATTERN.test(password)
}

/**
 * Validate role for account creation
 */
export const isValidRoleForCreation = (role: string | null | undefined): boolean => {
  if (!role) return false
  const upperRole = role.toUpperCase()
  return upperRole === 'STAFF' || upperRole === 'ORGANIZER' || upperRole === 'ADMIN'
}

/**
 * Get user-friendly error message for email
 */
export const getEmailError = (email: string): string | null => {
  if (!email.trim()) {
    return 'Email không được để trống'
  }
  if (!isValidEmail(email)) {
    return 'Email không hợp lệ. Ví dụ: user@example.com'
  }
  return null
}

/**
 * Get user-friendly error message for phone
 */
export const getPhoneError = (phone: string): string | null => {
  if (!phone.trim()) {
    return 'Số điện thoại không được để trống'
  }
  if (!isValidVNPhone(phone)) {
    return 'Số điện thoại không hợp lệ. Phải là số Việt Nam (03x, 05x, 07x, 08x, 09x)'
  }
  return null
}

/**
 * Get user-friendly error message for full name
 */
export const getFullNameError = (name: string): string | null => {
  if (!name.trim()) {
    return 'Họ tên không được để trống'
  }
  if (name.trim().length < 2) {
    return 'Họ tên phải có ít nhất 2 ký tự'
  }
  if (name.trim().length > 100) {
    return 'Họ tên không được vượt quá 100 ký tự'
  }
  if (!isValidFullName(name)) {
    return 'Họ tên chỉ được chứa chữ cái, khoảng trắng, dấu chấm, gạch ngang và dấu nháy đơn'
  }
  return null
}

/**
 * Get user-friendly error message for password
 */
export const getPasswordError = (password: string): string | null => {
  if (!password.trim()) {
    return 'Mật khẩu không được để trống'
  }
  if (password.length < 6) {
    return 'Mật khẩu phải có ít nhất 6 ký tự'
  }
  if (!/(?=.*[A-Za-z])/.test(password)) {
    return 'Mật khẩu phải chứa ít nhất 1 chữ cái'
  }
  if (!/(?=.*\d)/.test(password)) {
    return 'Mật khẩu phải chứa ít nhất 1 chữ số'
  }
  if (!isValidPassword(password)) {
    return 'Mật khẩu chỉ được chứa chữ cái, số và ký tự đặc biệt (@#$%^&+=!-)'
  }
  return null
}