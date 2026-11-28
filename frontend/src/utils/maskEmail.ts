/**
 * Masks an email address for privacy in admin/list views while preserving
 * enough prefix/suffix characters and the domain for recognition.
 *
 * Examples:
 * - "tranhoanganh@gmail.com" -> "tr********nh@gmail.com"
 * - "tranthithuha220205@gmail.com" -> "tran********2205@gmail.com"
 */
export function maskEmail(email?: string | null): string {
  if (!email) return ''
  const trimmed = email.trim()
  const atIndex = trimmed.indexOf('@')
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return trimmed
  }

  const local = trimmed.slice(0, atIndex)
  const domain = trimmed.slice(atIndex) // includes '@'
  const len = local.length

  if (len <= 2) {
    return `${local[0]}${'*'.repeat(Math.max(1, len - 1))}${domain}`
  }
  if (len <= 5) {
    return `${local[0]}${'*'.repeat(len - 2)}${local[len - 1]}${domain}`
  }
  if (len <= 12) {
    const maskLen = Math.min(8, Math.max(4, len - 4))
    return `${local.slice(0, 2)}${'*'.repeat(maskLen)}${local.slice(-2)}${domain}`
  }

  const maskLen = Math.min(8, Math.max(4, len - 8))
  return `${local.slice(0, 4)}${'*'.repeat(maskLen)}${local.slice(-4)}${domain}`
}

/**
 * Masks a phone number for privacy in admin/list views while preserving
 * only the last 3 digits.
 *
 * Examples:
 * - "0963852741" -> "*******741"
 * - "+84963852741" -> "*********741"
 */
export function maskPhone(phone?: string | null): string {
  if (!phone) return ''
  const trimmed = phone.trim()
  if (!trimmed) return ''

  const len = trimmed.length
  if (len <= 3) {
    return '*'.repeat(len)
  }

  return `${'*'.repeat(len - 3)}${trimmed.slice(-3)}`
}
