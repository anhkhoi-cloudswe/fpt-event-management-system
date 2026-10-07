import React, { useState, useEffect } from 'react'

export interface NumericInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string | undefined | null
  onChange?: (value: number) => void
  allowZero?: boolean
  min?: number
  max?: number
}

/**
 * Format a raw number or digits string with thousand separators (commas: e.g. 1,000,000)
 */
export const formatNumberWithCommas = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return ''
  const numStr = String(val).replace(/,/g, '')
  if (isNaN(Number(numStr))) return ''
  
  // Handle optional decimal parts if any
  const parts = numStr.split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

/**
 * Parse a comma-formatted string into a numeric value
 */
export const parseNumberFromCommas = (str: string): number => {
  const clean = str.replace(/,/g, '').trim()
  if (clean === '' || clean === '-') return 0
  const parsed = Number(clean)
  return isNaN(parsed) ? 0 : parsed
}

/**
 * Enhanced Numeric Input Component:
 * - Displays 0 cleanly (or empty when 0 is not yet entered)
 * - Automatically separates thousands with commas (e.g. 1,123 or 100,000)
 * - Prevents leading zero artifacts like "010000"
 * - Maintains precise cursor position and clean UX
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  allowZero = true,
  min,
  max,
  className = '',
  placeholder = '0',
  disabled,
  ...rest
}) => {
  const getDisplayString = (val: number | string | null | undefined): string => {
    if (val === null || val === undefined || val === '') {
      return ''
    }
    const num = typeof val === 'string' ? parseNumberFromCommas(val) : val
    if (num === 0) {
      return allowZero ? '0' : ''
    }
    return formatNumberWithCommas(num)
  }

  const [displayValue, setDisplayValue] = useState<string>(() => getDisplayString(value))

  useEffect(() => {
    setDisplayValue(getDisplayString(value))
  }, [value, allowZero])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    // Strip everything except digits and optional leading minus
    const digitsOnly = raw.replace(/[^\d]/g, '')

    if (digitsOnly === '') {
      setDisplayValue('')
      if (onChange) {
        onChange(0)
      }
      return
    }

    // Strip leading zeroes (e.g. "010000" -> "10000", "00" -> "0")
    let normalizedDigits = digitsOnly.replace(/^0+(?=\d)/, '')
    if (normalizedDigits === '') normalizedDigits = '0'

    let numVal = parseInt(normalizedDigits, 10)
    if (isNaN(numVal)) numVal = 0

    if (max !== undefined && numVal > max) {
      numVal = max
      normalizedDigits = String(max)
    }

    if (min !== undefined && numVal < min && normalizedDigits !== '0') {
      // keep numVal within range
    }

    const formatted = formatNumberWithCommas(normalizedDigits)
    setDisplayValue(formatted)

    if (onChange) {
      onChange(numVal)
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (displayValue === '' && allowZero) {
      setDisplayValue('0')
      if (onChange) onChange(0)
    }
    if (rest.onBlur) {
      rest.onBlur(e)
    }
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      {...rest}
    />
  )
}

export default NumericInput
