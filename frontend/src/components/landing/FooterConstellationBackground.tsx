import React, { useEffect, useRef } from 'react'

/**
 * FooterConstellationBackground
 * Hiệu ứng chòm sao FEMS và sao chổi nhẹ nhàng, mượt mà dành riêng cho Footer
 * Chạy 60fps trên GPU canvas, không lag, không chớp giật
 */
export const FooterConstellationBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let isVisible = true
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth)
    let height = (canvas.height = canvas.parentElement?.clientHeight || 450)

    // Tối ưu hóa: Chỉ render canvas khi footer thực sự nằm trong màn hình nhìn thấy (Viewport)
    // Tránh tiêu hao CPU/GPU khi người dùng đang xem video hoặc lướt ở phần trên trang
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          isVisible = entry.isIntersecting
          if (isVisible) {
            cancelAnimationFrame(animationFrameId)
            render()
          }
        })
      },
      { threshold: 0.05 }
    )
    if (canvas.parentElement) {
      observer.observe(canvas.parentElement)
    }

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return
      width = canvas.width = canvas.parentElement.clientWidth
      height = canvas.height = canvas.parentElement.clientHeight
    }
    window.addEventListener('resize', handleResize)

    // Khởi tạo hạt sao cho footer (số lượng vừa phải 35 hạt để siêu nhẹ và tĩnh lặng)
    const numParticles = 35
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

    const colors = ['#ea580c', '#f97316', '#fb923c', '#f59e0b', '#fbbf24']

    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.5 + 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        isStar: Math.random() > 0.6,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.015 + Math.random() * 0.02
      })
    }

    // Hàm vẽ ngôi sao 4 cánh FEMS
    const drawFemsStar = (cx: number, cy: number, outerRadius: number, innerRadius: number, color: string, alpha: number) => {
      let rot = (Math.PI / 2) * 3
      let x = cx
      let y = cy
      const step = Math.PI / 4

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx, cy - outerRadius)
      for (let i = 0; i < 4; i++) {
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
      ctx.shadowBlur = 8
      ctx.shadowColor = color
      ctx.fill()
      ctx.restore()
    }

    // Lớp hiệu ứng Sao Băng (Shooting Star / Meteor) lướt qua bầu trời footer
    interface ShootingStar {
      x: number
      y: number
      length: number
      speed: number
      size: number
      angle: number
      opacity: number
      active: boolean
    }

    let shootingStars: ShootingStar[] = []

    const createShootingStar = () => {
      // Góc chéo ~35-40 độ, xuôi từ trên xuống
      const angle = (Math.PI / 5) + (Math.random() - 0.5) * 0.15
      // Xuất phát rải rác từ cạnh trên hoặc mép trái
      const startFromTop = Math.random() > 0.35
      const startX = startFromTop ? Math.random() * width * 0.85 : 0
      const startY = startFromTop ? 0 : Math.random() * (height * 0.5)

      shootingStars.push({
        x: startX,
        y: startY,
        length: Math.random() * 90 + 90, // Vệt đuôi dài 90-180px dễ quan sát hình dáng
        speed: Math.random() * 2.5 + 4.5, // Tốc độ vừa phải (4.5 - 7 px/frame), đủ nhanh nhưng nhìn rõ dáng bay
        size: Math.random() * 1.5 + 1.8,
        angle: angle,
        opacity: 1,
        active: true
      })
    }

    // Xuất hiện liên tục mỗi 2 - 2.5 giây, đảm bảo người xem luôn thấy sao băng
    let meteorTimer = setInterval(() => {
      createShootingStar()
    }, 2200)

    // Tạo ngay 1 sao băng khi khởi tạo để xuất hiện sớm
    setTimeout(() => {
      createShootingStar()
    }, 500)

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      // Cập nhật và vẽ hạt
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.pulse += p.pulseSpeed

        if (p.x < 0) p.x = width
        if (p.x > width) p.x = 0
        if (p.y < 0) p.y = height
        if (p.y > height) p.y = 0

        const currentAlpha = p.alpha * (0.65 + 0.35 * Math.sin(p.pulse))

        if (p.isStar) {
          drawFemsStar(p.x, p.y, p.radius * 3.5, p.radius * 1.2, p.color, currentAlpha)
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
          ctx.fillStyle = p.color
          ctx.globalAlpha = currentAlpha
          ctx.shadowBlur = 6
          ctx.shadowColor = p.color
          ctx.fill()
        }

        // Đường nối chòm sao
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j]
          const dist = Math.hypot(p.x - p2.x, p.y - p2.y)
          if (dist < 130) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(p2.x, p2.y)
            ctx.strokeStyle = '#f97316'
            ctx.globalAlpha = (1 - dist / 130) * 0.18
            ctx.lineWidth = 0.75
            ctx.stroke()
          }
        }
      }

      // Cập nhật và vẽ Sao Băng (Shooting Stars)
      for (let s = shootingStars.length - 1; s >= 0; s--) {
        const star = shootingStars[s]
        if (!star.active) continue

        const tailX = star.x - Math.cos(star.angle) * star.length
        const tailY = star.y - Math.sin(star.angle) * star.length

        // Vẽ vệt sáng sao băng với gradient
        const grad = ctx.createLinearGradient(tailX, tailY, star.x, star.y)
        grad.addColorStop(0, 'rgba(249, 115, 22, 0)')
        grad.addColorStop(0.5, 'rgba(251, 146, 60, ' + (star.opacity * 0.7) + ')')
        grad.addColorStop(0.85, 'rgba(254, 215, 170, ' + (star.opacity * 0.9) + ')')
        grad.addColorStop(1, 'rgba(255, 255, 255, ' + star.opacity + ')')

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(tailX, tailY)
        ctx.lineTo(star.x, star.y)
        ctx.strokeStyle = grad
        ctx.lineWidth = star.size
        ctx.lineCap = 'round'
        ctx.shadowBlur = 12
        ctx.shadowColor = '#fb923c'
        ctx.stroke()

        // Đầu sao băng phát sáng rực rỡ dạng viên ngọc sáng
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.shadowBlur = 18
        ctx.shadowColor = '#ffffff'
        ctx.fill()
        ctx.restore()

        // Di chuyển sao băng
        star.x += Math.cos(star.angle) * star.speed
        star.y += Math.sin(star.angle) * star.speed
        star.opacity -= 0.006 // Giảm độ mờ chậm hơn để thấy rõ thân sao băng lướt qua

        if (star.x > width + 150 || star.y > height + 150 || star.opacity <= 0) {
          star.active = false
          shootingStars.splice(s, 1)
        }
      }

      if (isVisible) {
        animationFrameId = requestAnimationFrame(render)
      }
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      clearInterval(meteorTimer)
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden">
      {/* Vầng sáng vàng cam huyền ảo phía sau footer */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-96 h-96 bg-orange-600/10 rounded-full blur-[130px]" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-[140px]" />
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  )
}
