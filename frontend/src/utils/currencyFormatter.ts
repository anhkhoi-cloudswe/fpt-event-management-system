/**
 * Format currency in VND according to business requirements:
 * - Under 1 million: display format 'k' (e.g., 299000 -> "299k", 0 -> "0k", 50000 -> "50k")
 * - From 1 million upwards: display format 'triệu' with maximum 2 decimal places (e.g., 1000000 -> "1 triệu", 1500000 -> "1,5 triệu", 1230000 -> "1,23 triệu")
 * - Handles negative amounts: "-299k", "-1,5 triệu"
 */
export function formatVndShort(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined || amount === 0) {
    return '0đ'
  }

  const isNegative = amount < 0
  const abs = Math.abs(amount)

  if (abs < 1_000_000) {
    const inK = abs / 1_000
    // If exactly integer in k, format as integer, else up to 2 decimal places with comma
    let formattedK: string
    if (Math.floor(inK) === inK) {
      formattedK = inK.toString()
    } else {
      formattedK = Number(inK.toFixed(2)).toString().replace('.', ',')
    }
    return `${isNegative ? '-' : ''}${formattedK}k`
  }

  const inMillion = abs / 1_000_000
  let formattedMil: string
  if (Math.floor(inMillion) === inMillion) {
    formattedMil = inMillion.toString()
  } else {
    formattedMil = Number(inMillion.toFixed(2)).toString().replace('.', ',')
  }

  return `${isNegative ? '-' : ''}${formattedMil} triệu`
}

/**
 * Standard VND format with thousand separators and 'đ' suffix
 */
export function formatVndFull(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '0đ'
  }
  return `${amount.toLocaleString('vi-VN')}đ`
}
