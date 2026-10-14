import React, { useEffect, useRef } from 'react'

/**
 * ConstellationBackground - Chòm Sao FEMS Tương Tác & Sao Chổi (Shooting Stars / Comets)
 * Phủ toàn màn hình từ đỉnh navbar xuống sát 2 lề trái/phải với dải ngân hà rực rỡ FPT
 */
export const ConstellationBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = (canvas.width = window.innerWidth)
    let height = (canvas.height = window.innerHeight)

    const handleResize = () => {
      if (!canvas) return
      width = canvas.width = window.innerWidth
      height = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    // Tọa độ con trỏ chuột / điểm chạm cảm ứng
    const mouse = { x: -1000, y: -1000, radius: 160 }

    const handleMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        mouse.x = e.touches[0].clientX
        mouse.y = e.touches[0].clientY
      }
    }
    const handleLeave = () => {
      mouse.x = -1000
      mouse.y = -1000
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('mouseleave', handleLeave)

    // Khởi tạo hệ thống hạt chòm sao FEMS
    const numParticles = Math.min(Math.floor((width * height) / 9500), 120)
    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      alpha: number
      color: string
      isStar: boolean
      pulse: number
      pulseSpeed: number
    }> = []

    const colors = ['#ea580c', '#f97316', '#fb923c', '#f59e0b', '#fbbf24', '#fdba74']

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.65,
        vy: (Math.random() - 0.5) * 0.65,
        radius: Math.random() * 2.2 + 1,
        alpha: Math.random() * 0.6 + 0.35,
        color: colors[Math.floor(Math.random() * colors.length)],
        isStar: Math.random() > 0.55, // Các ngôi sao 4 cánh đặc trưng của FEMS
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03
      })
    }

    // ==================== HỆ THỐNG SAO CHỔI (SHOOTING STARS / COMETS) ====================
    interface ShootingStar {
      x: number
      y: number
      length: number
      speed: number
      size: number
      angle: number
      opacity: number
      fadeSpeed: number
      active: boolean
      tailColor: string
      headColor: string
    }

    const shootingStars: ShootingStar[] = []
    const cometColors = [
      { head: '#ffffff', tail: 'rgba(249, 115, 22, ' }, // Ánh cam rực
      { head: '#fff7ed', tail: 'rgba(245, 158, 11, ' }, // Vàng hổ phách
      { head: '#ffffff', tail: 'rgba(251, 146, 60, ' }  // Cam hoàng kim
    ]

    const createShootingStar = () => {
      // Sao chổi xuất hiện từ phía trên hoặc góc trên bên phải
      const startFromTop = Math.random() > 0.4
      const x = startFromTop ? Math.random() * width : width + 20
      const y = startFromTop ? -20 : Math.random() * (height * 0.4)
      const colorScheme = cometColors[Math.floor(Math.random() * cometColors.length)]

      shootingStars.push({
        x,
        y,
        length: 120 + Math.random() * 140, // Đuôi dài vút đẹp mắt
        speed: 9 + Math.random() * 8,       // Tốc độ lướt nhanh
        size: 2.2 + Math.random() * 1.5,
        angle: (Math.PI / 180) * (215 + Math.random() * 20), // Bay chéo từ phải sang trái xuống dưới
        opacity: 1,
        fadeSpeed: 0.012 + Math.random() * 0.008,
        active: true,
        headColor: colorScheme.head,
        tailColor: colorScheme.tail
      })
    }

    // Thời gian định kỳ bắn sao chổi
    let nextShootingStarTime = Date.now() + 1500

    // Hàm vẽ ngôi sao 4 cánh FEMS sắc nét
    const drawFemsStar = (cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number, color: string, alpha: number) => {
      let rot = (Math.PI / 2) * 3
      let x = cx
      let y = cy
      const step = Math.PI / spikes

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx, cy - outerRadius)
      for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius
        y = cy + Math.sin(rot) * outerRadius
        ctx.lineTo(x, y)
        rot += step

        x = cx + Math.cos(rot) * innerRadius
        y = cy + Math.sin(rot) * innerRadius
        ctx.lineTo(x, y)
        rot += step
      }
      ctx.lineTo(cx, cy - outerRadius)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.globalAlpha = alpha
      ctx.shadowBlur = 10
      ctx.shadowColor = color
      ctx.fill()
      ctx.restore()
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      // 1. Quản lý và vẽ Sao Chổi (Shooting Stars)
      const now = Date.now()
      if (now > nextShootingStarTime) {
        createShootingStar()
        // Mỗi 2.5 - 5 giây xuất hiện một ngôi sao chổi lướt qua
        nextShootingStarTime = now + 2200 + Math.random() * 3200
      }

      for (let s = shootingStars.length - 1; s >= 0; s--) {
        const star = shootingStars[s]
        if (!star.active) {
          shootingStars.splice(s, 1)
          continue
        }

        // Cập nhật vị trí
        star.x += Math.cos(star.angle) * star.speed
        star.y -= Math.sin(star.angle) * star.speed // sin(angle) âm khi bay xuống
        star.opacity -= star.fadeSpeed

        if (star.opacity <= 0 || star.x < -150 || star.y > height + 150) {
          star.active = false
          continue
        }

        // Vẽ vệt đuôi sao chổi (Gradient lấp lánh)
        const tailX = star.x - Math.cos(star.angle) * star.length
        const tailY = star.y + Math.sin(star.angle) * star.length

        const gradient = ctx.createLinearGradient(star.x, star.y, tailX, tailY)
        gradient.addColorStop(0, star.headColor)
        gradient.addColorStop(0.2, `${star.tailColor}${star.opacity * 0.9})`)
        gradient.addColorStop(0.7, `${star.tailColor}${star.opacity * 0.3})`)
        gradient.addColorStop(1, `${star.tailColor}0)`)

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(star.x, star.y)
        ctx.lineTo(tailX, tailY)
        ctx.strokeStyle = gradient
        ctx.lineWidth = star.size
        ctx.lineCap = 'round'
        ctx.shadowBlur = 14
        ctx.shadowColor = '#f97316'
        ctx.stroke()

        // Vẽ đầu sao chổi rực sáng (Phát quang đa tầng)
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = star.headColor
        ctx.globalAlpha = star.opacity
        ctx.shadowBlur = 18
        ctx.shadowColor = '#ffffff'
        ctx.fill()
        ctx.restore()
      }

      // 2. Cập nhật & Vẽ Hạt Chòm sao FEMS
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.pulse += p.pulseSpeed

        // Wrap around bounds
        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        // Tương tác chuột/chạm: đẩy nhẹ tạo sóng phản hồi
        const dx = mouse.x - p.x
        const dy = mouse.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius
          p.x -= (dx / dist) * force * 3.5
          p.y -= (dy / dist) * force * 3.5
        }

        const currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse))

        if (p.isStar) {
          drawFemsStar(p.x, p.y, 4, p.radius * 3.8, p.radius * 1.2, p.color, currentAlpha)
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = p.color
          ctx.globalAlpha = currentAlpha
          ctx.shadowBlur = 8
          ctx.shadowColor = p.color
          ctx.fill()
        }

        // Vẽ đường nối chòm sao (Constellation links)
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const dist2 = Math.hypot(p.x - p2.x, p.y - p2.y)
          if (dist2 < 125) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            const lineAlpha = (1 - dist2 / 125) * 0.22
            ctx.strokeStyle = '#f97316'
            ctx.globalAlpha = lineAlpha
            ctx.lineWidth = 0.85
            ctx.stroke()
          }
        }
      }

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('mouseleave', handleLeave)
    }
  }, [])

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-0 overflow-hidden">
      {/* Dải cực quang mờ ảo chuyển động nhẹ nhàng phía sau toàn trang */}
      <div className="absolute -top-32 -left-32 w-[650px] h-[650px] rounded-full bg-gradient-to-tr from-orange-400/20 via-amber-300/15 to-transparent blur-[140px] animate-pulse duration-[8000ms]" />
      <div className="absolute top-1/4 -right-40 w-[680px] h-[680px] rounded-full bg-gradient-to-bl from-orange-500/15 via-red-400/10 to-transparent blur-[150px] animate-pulse duration-[10000ms]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[850px] h-[450px] rounded-full bg-gradient-to-r from-amber-400/15 via-orange-400/15 to-rose-400/10 blur-[140px]" />

      {/* Canvas mạng sao & sao chổi phủ toàn bộ màn hình */}
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}
