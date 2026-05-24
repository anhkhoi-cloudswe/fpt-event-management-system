import React, { useRef } from 'react'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function OtpInput({ value, onChange, disabled = false }: OtpInputProps) {
  const length = 6
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  // Ensure we get an array of size `length`
  // Fill empty spaces with empty strings
  const otpArray = value.split('').concat(Array(length).fill('')).slice(0, length)

  const focusInput = (index: number) => {
    if (index >= 0 && index < length) {
      inputsRef.current[index]?.focus()
    }
  }

  const handleChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    // We only care about digits
    const digitsOnly = val.replace(/\D/g, '')
    if (digitsOnly.length === 0) {
      // Empty input
      const newOtpArray = [...otpArray]
      newOtpArray[index] = ''
      onChange(newOtpArray.join(''))
      return
    }

    // Take the last typed digit
    const char = digitsOnly.substring(digitsOnly.length - 1)
    const newOtpArray = [...otpArray]
    newOtpArray[index] = char
    const newOtp = newOtpArray.join('')
    onChange(newOtp)

    // Automatically focus the next input
    if (char && index < length - 1) {
      focusInput(index + 1)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const val = otpArray[index]
      if (!val) {
        // If current is empty, delete previous and focus previous
        if (index > 0) {
          const newOtpArray = [...otpArray]
          newOtpArray[index - 1] = ''
          onChange(newOtpArray.join(''))
          focusInput(index - 1)
        }
      } else {
        // Just clear the current one
        const newOtpArray = [...otpArray]
        newOtpArray[index] = ''
        onChange(newOtpArray.join(''))
      }
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    const digits = pastedText.replace(/\D/g, '').slice(0, length)
    if (digits) {
      onChange(digits)
      // Focus the appropriate input
      const nextIndex = Math.min(digits.length, length - 1)
      focusInput(nextIndex)
    }
  }

  // Handle focusing first input when clicking the group container
  const handleContainerClick = (e: React.MouseEvent) => {
    // Avoid focusing if we clicked on an input directly, as that already focuses it
    if (e.target instanceof HTMLInputElement) return

    const firstEmptyIndex = otpArray.findIndex((val) => val === '')
    const focusIndex = firstEmptyIndex === -1 ? length - 1 : firstEmptyIndex
    focusInput(focusIndex)
  }

  return (
    <div 
      className="flex justify-center gap-3 my-4 cursor-text"
      onClick={handleContainerClick}
    >
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={otpArray[index]}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className="w-12 h-12 text-center text-xl font-bold border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      ))}
    </div>
  )
}
