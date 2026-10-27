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
  img.crossOrigin = 'Anonymous'
  img.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      canvas.width = 32
      canvas.height = 32
      ctx.drawImage(img, 0, 0, 32, 32)
      const data = ctx.getImageData(0, 0, 32, 32).data

      let bestColor: [number, number, number] = [249, 115, 22] // vibrant orange fallback
      let secondBest: [number, number, number] = [234, 88, 12]
      let maxScore = -1
      let secondMaxScore = -1

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        const a = data[i + 3]
        if (a < 128) continue

        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const delta = max - min
        const sat = max === 0 ? 0 : delta / max
        const brightness = (r * 299 + g * 587 + b * 114) / 1000

        // Skip near-black or blown-out white pixels to capture authentic dominant chromatic hues
        if (brightness < 30 || brightness > 245) continue
        const score = sat * 3.2 + (1 - Math.abs(brightness - 130) / 130)

        if (score > maxScore) {
          secondMaxScore = maxScore
          secondBest = bestColor
          maxScore = score
          bestColor = [r, g, b]
        } else if (
          score > secondMaxScore &&
          Math.abs(r - bestColor[0]) + Math.abs(g - bestColor[1]) + Math.abs(b - bestColor[2]) > 60
        ) {
          secondMaxScore = score
          secondBest = [r, g, b]
        }
      }

      callback(bestColor, secondBest)
    } catch {
      // Fallback silently if canvas is tainted by cross-origin
    }
  }
  img.src = imageUrl
}
