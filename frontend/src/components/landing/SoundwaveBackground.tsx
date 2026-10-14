import React, { useEffect, useRef } from 'react'

/**
 * Option 3: Dynamic 3D Soundwaves & Spotlight Aura
 * Dải sóng âm thanh và nhịp đập năng lượng sự kiện FPT rực rỡ
 */
export const SoundwaveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth)
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight)

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return
      width = canvas.width = canvas.parentElement.clientWidth
      height = canvas.height = canvas.parentElement.clientHeight
    }
    window.addEventListener('resize', handleResize)

    let step = 0

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      step += 0.02

      // Draw multi-layered sine soundwaves
      const numWaves = 4
      const waveColors = [
        'rgba(249, 115, 22, 0.25)', // orange-500
        'rgba(245, 158, 11, 0.20)', // amber-500
        'rgba(234, 88, 12, 0.18)',  // orange-600
        'rgba(251, 191, 36, 0.15)'  // amber-400
      ]

      const centerY = height * 0.58

      for (let w = 0; w < numWaves; w++) {
        ctx.beginPath()
        ctx.moveTo(0, height)

        const frequency = 0.0035 + w * 0.001
        const amplitude = 35 + w * 15
        const phase = step * (1 + w * 0.3)

        for (let x = 0; x <= width; x += 6) {
          const y = centerY + Math.sin(x * frequency + phase) * amplitude * Math.sin(step * 0.5 + w)
          ctx.lineTo(x, y)
        }

        ctx.lineTo(width, height)
        ctx.closePath()
        ctx.fillStyle = waveColors[w]
        ctx.fill()

        // Wave crest glow line
        ctx.beginPath()
        for (let x = 0; x <= width; x += 6) {
          const y = centerY + Math.sin(x * frequency + phase) * amplitude * Math.sin(step * 0.5 + w)
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.strokeStyle = `rgba(249, 115, 22, ${0.45 - w * 0.08})`
        ctx.lineWidth = 2
        ctx.stroke()
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden select-none z-0">
      {/* Dynamic stage spotlight beams */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[360px] bg-gradient-to-r from-orange-500/20 via-amber-400/25 to-orange-600/20 rounded-full blur-[110px] animate-pulse duration-[5000ms]" />

      {/* Floating soundwave canvas */}
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}
