import React, { useEffect, useRef } from 'react'

/**
 * Option 2: Ambient Campus Atmosphere with Glowing Soundwaves & Floating Embers
 * Mô phỏng không gian campus FPT & âm hưởng sự kiện sôi động
 */
export const AmbientCampusBackground: React.FC = () => {
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

    // Floating festive firefly embers
    const numEmbers = 45
    const embers: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      alpha: number
      hue: number
      fadeSpeed: number
    }> = []

    for (let i = 0; i < numEmbers; i++) {
      embers.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.3 - Math.random() * 0.5, // float up slowly like stage embers
        size: Math.random() * 3 + 1.5,
        alpha: Math.random() * 0.8 + 0.2,
        hue: 20 + Math.random() * 25, // orange to golden
        fadeSpeed: 0.01 + Math.random() * 0.015
      })
    }

    let time = 0

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      time += 0.015

      // Render floating embers
      for (const ember of embers) {
        ember.x += ember.vx + Math.sin(time + ember.y * 0.01) * 0.3
        ember.y += ember.vy
        ember.alpha += Math.sin(time * 3 + ember.x) * 0.01

        if (ember.y < -10) {
          ember.y = height + 10
          ember.x = Math.random() * width
        }

        ctx.beginPath()
        ctx.arc(ember.x, ember.y, ember.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${ember.hue}, 95%, 55%, ${Math.max(0.1, Math.min(0.9, ember.alpha))})`
        ctx.shadowBlur = 12
        ctx.shadowColor = `hsl(${ember.hue}, 100%, 50%)`
        ctx.fill()
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
      {/* Background Campus Image with Deep Frosted Glass Overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-25 scale-105 transition-transform duration-[15000ms] hover:scale-110"
        style={{ backgroundImage: `url('/assets/dai-hoc-fpt-tp-hcm-1.jpeg')` }}
      />
      {/* Dynamic gradient overlay to ensure text readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-orange-50/90 via-amber-50/80 to-orange-100/95 backdrop-blur-[2px]" />

      {/* Radiant spotlights sweeping slowly */}
      <div className="absolute top-0 left-1/4 w-[380px] h-[700px] bg-gradient-to-b from-orange-500/20 via-amber-400/10 to-transparent -rotate-12 blur-3xl animate-pulse duration-[8000ms]" />
      <div className="absolute top-0 right-1/4 w-[380px] h-[700px] bg-gradient-to-b from-amber-500/20 via-orange-400/10 to-transparent rotate-12 blur-3xl animate-pulse duration-[10000ms]" />

      {/* Floating firefly stage canvas */}
      <canvas ref={canvasRef} className="w-full h-full block relative z-10" />
    </div>
  )
}
