/**
 * Extract dominant vibrant colors from an image URL using an offscreen canvas.
 * Returns primary RGB and secondary RGB tuples: [r, g, b].
 */
export function extractDominantColors(
  imageUrl: string,
  callback: (primary: [number, number, number], secondary: [number, number, number]) => void
) {
  if (!imageUrl) return

  const img = new Image()
  
  // Only set crossOrigin if loading from a different origin
  const isRemote = imageUrl.startsWith('http://') || imageUrl.startsWith('https://')
  const isDifferentOrigin = isRemote && !imageUrl.startsWith(window.location.origin)
  if (isDifferentOrigin) {
    img.crossOrigin = 'Anonymous'
  }

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      canvas.width = 32
      canvas.height = 32
      ctx.drawImage(img, 0, 0, 32, 32)
      const data = ctx.getImageData(0, 0, 32, 32).data

      let bestColor: [number, number, number] | null = null
      let secondBest: [number, number, number] | null = null
      let maxScore = -1
      let secondMaxScore = -1

      let sumR = 0, sumG = 0, sumB = 0, totalValid = 0

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a < 128) continue

        sumR += r
        sumG += g
        sumB += b
        totalValid++

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const delta = max - min
        const sat = max === 0 ? 0 : delta / max
        const brightness = (r * 299 + g * 587 + b * 114) / 1000

        // Skip near-black or blown-out white pixels to capture authentic dominant chromatic hues
        if (brightness < 30 || brightness > 245) continue
        const score = sat * 3.5 + (1 - Math.abs(brightness - 130) / 130)

        if (score > maxScore) {
          secondMaxScore = maxScore
          secondBest = bestColor
          maxScore = score
          bestColor = [r, g, b]
        } else if (
          score > secondMaxScore &&
          bestColor &&
          Math.abs(r - bestColor[0]) + Math.abs(g - bestColor[1]) + Math.abs(b - bestColor[2]) > 50
        ) {
          secondMaxScore = score
          secondBest = [r, g, b]
        }
      }

      // If no high-saturation pixel found, fallback to true average color of image (NOT hardcoded orange)
      const avgR = totalValid > 0 ? Math.round(sumR / totalValid) : 120
      const avgG = totalValid > 0 ? Math.round(sumG / totalValid) : 150
      const avgB = totalValid > 0 ? Math.round(sumB / totalValid) : 180

      const finalPrimary: [number, number, number] = bestColor || [avgR, avgG, avgB]
      const finalSecondary: [number, number, number] = secondBest || [
        Math.min(255, Math.round(avgR * 1.1)),
        Math.min(255, Math.round(avgG * 1.1)),
        Math.min(255, Math.round(avgB * 1.1)),
      ]

      callback(finalPrimary, finalSecondary)
    } catch {
      // Fallback silently if canvas is blocked
    }
  }

  img.src = imageUrl
}
