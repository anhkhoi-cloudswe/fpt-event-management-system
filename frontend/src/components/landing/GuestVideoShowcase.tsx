import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Video as VideoIcon, ExternalLink } from 'lucide-react'
import { GuestVideoItem } from '../../types/frontendConfig'

interface GuestVideoShowcaseProps {
  videos: GuestVideoItem[]
  badge?: string
  title?: string
  subtitle?: string
}

/**
 * Phân tích và trích xuất URL embed thông minh cho:
 * 1. YouTube chuẩn (watch, youtu.be, embed) & YouTube Shorts (/shorts/ID)
 * 2. TikTok (/video/ID)
 * 3. Instagram Reels & Post (/reel/CODE, /p/CODE)
 * 4. Vimeo
 * 5. Direct video files (.mp4, .webm, .ogg)
 */
export const getEmbedUrl = (url: string): { embedUrl: string; isDirect: boolean } => {
  if (!url) return { embedUrl: '', isDirect: false }
  const trimmed = url.trim()

  // 1. YouTube Shorts: https://www.youtube.com/shorts/VIDEO_ID or youtube.com/shorts/VIDEO_ID
  const ytShortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i)
  if (ytShortsMatch && ytShortsMatch[1]) {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytShortsMatch[1]}?autoplay=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
      isDirect: false,
    }
  }

  // 2. YouTube chuẩn (watch?v=, youtu.be/, embed/)
  const ytMatch = trimmed.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)
  if (ytMatch && ytMatch[1]) {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?autoplay=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`,
      isDirect: false,
    }
  }

  // 3. TikTok: https://www.tiktok.com/@user/video/1234567890123456789 or /v/1234567890
  const tiktokMatch = trimmed.match(/tiktok\.com\/(?:@[^\/]+\/video\/|v\/)(\d+)/i)
  if (tiktokMatch && tiktokMatch[1]) {
    return {
      embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`,
      isDirect: false,
    }
  }

  // 4. Instagram Reels or Post: https://www.instagram.com/reel/Cxxxxxx/ or /p/Cxxxxxx/
  const instaMatch = trimmed.match(/instagram\.com\/(?:reel|p)\/([a-zA-Z0-9_-]+)/i)
  if (instaMatch && instaMatch[1]) {
    return {
      embedUrl: `https://www.instagram.com/p/${instaMatch[1]}/embed/`,
      isDirect: false,
    }
  }

  // 5. Vimeo link: https://vimeo.com/123456789
  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|)(\d+)/i)
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      isDirect: false,
    }
  }

  // 6. Direct video format (.mp4, .webm, .ogg)
  if (/\.(mp4|webm|ogg)($|\?)/i.test(trimmed)) {
    return {
      embedUrl: trimmed,
      isDirect: true,
    }
  }

  // Fallback as iframe URL
  return {
    embedUrl: trimmed,
    isDirect: false,
  }
}

export const GuestVideoShowcase: React.FC<GuestVideoShowcaseProps> = ({
  videos,
  badge = 'Thước Phim Sự Kiện',
  title = 'Sôi Động & Sáng Tạo Tại FPT Education',
  subtitle = 'Cảm nhận năng lượng nhiệt huyết từ các chương trình, hoạt động văn hóa và lễ hội bùng nổ.',
}) => {
  if (!videos || videos.length === 0) return null

  // Sắp xếp video theo thứ tự order đã được admin kéo thả
  const sortedVideos = [...videos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const [currentIndex, setCurrentIndex] = useState<number>(0)

  // Mobile Native Scroll Container Ref
  const mobileScrollRef = useRef<HTMLDivElement>(null)
  const isProgrammaticScrollRef = useRef<boolean>(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Touch flick & velocity tracking refs
  const touchStartTimeRef = useRef<number>(0)
  const touchStartXRef = useRef<number>(0)
  const touchStartYRef = useRef<number>(0)
  const touchEndXRef = useRef<number>(0)
  const isSwipeGestureRef = useRef<boolean | null>(null)

  // Clamp index if list changes
  useEffect(() => {
    if (currentIndex >= sortedVideos.length) {
      setCurrentIndex(Math.max(0, sortedVideos.length - 1))
    }
  }, [sortedVideos.length, currentIndex])

  // Select video index with instant smooth sync
  const handleSelectIndex = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= sortedVideos.length) return
    setCurrentIndex(newIndex)

    // Sync mobile scroll container if on mobile screen
    if (mobileScrollRef.current) {
      const container = mobileScrollRef.current
      const child = container.children[newIndex] as HTMLElement
      if (child) {
        isProgrammaticScrollRef.current = true
        container.scrollTo({
          left: child.offsetLeft - (container.clientWidth - child.clientWidth) / 2,
          behavior: 'smooth',
        })
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
        scrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScrollRef.current = false
        }, 400)
      }
    }
  }, [sortedVideos.length])

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      handleSelectIndex(currentIndex - 1)
    }
  }, [currentIndex, handleSelectIndex])

  const handleNext = useCallback(() => {
    if (currentIndex < sortedVideos.length - 1) {
      handleSelectIndex(currentIndex + 1)
    }
  }, [currentIndex, sortedVideos.length, handleSelectIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlePrev, handleNext])

  // Native Mobile Scroll Listener with zero-lag index synchronization
  const handleMobileScroll = () => {
    if (isProgrammaticScrollRef.current || !mobileScrollRef.current) return
    const container = mobileScrollRef.current
    const scrollLeft = container.scrollLeft
    const width = container.clientWidth

    // Calculate nearest card in view
    let nearestIndex = 0
    let minDistance = Infinity

    for (let i = 0; i < container.children.length; i++) {
      const child = container.children[i] as HTMLElement
      const childCenter = child.offsetLeft + child.clientWidth / 2
      const containerCenter = scrollLeft + width / 2
      const dist = Math.abs(childCenter - containerCenter)
      if (dist < minDistance) {
        minDistance = dist
        nearestIndex = i
      }
    }

    if (nearestIndex !== currentIndex) {
      setCurrentIndex(nearestIndex)
    }
  }

  // Touch flick detection: handles light quick flicks effortlessly
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartTimeRef.current = Date.now()
    touchStartXRef.current = e.targetTouches[0].clientX
    touchStartYRef.current = e.targetTouches[0].clientY
    touchEndXRef.current = e.targetTouches[0].clientX
    isSwipeGestureRef.current = null
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.targetTouches[0].clientX
    const currentY = e.targetTouches[0].clientY
    touchEndXRef.current = currentX

    if (isSwipeGestureRef.current === null) {
      const diffX = Math.abs(currentX - touchStartXRef.current)
      const diffY = Math.abs(currentY - touchStartYRef.current)
      if (diffX > 6 || diffY > 6) {
        isSwipeGestureRef.current = diffX > diffY
      }
    }
  }

  const handleTouchEnd = () => {
    if (isSwipeGestureRef.current) {
      const deltaX = touchStartXRef.current - touchEndXRef.current
      const deltaTime = Math.max(1, Date.now() - touchStartTimeRef.current)
      const velocity = Math.abs(deltaX) / deltaTime // px/ms

      // Low threshold: either distance > 30px or a quick flick (velocity > 0.35 px/ms and distance > 15px)
      const isQuickFlick = velocity > 0.35 && Math.abs(deltaX) > 15
      const isDragSwipe = Math.abs(deltaX) > 30

      if (isQuickFlick || isDragSwipe) {
        if (deltaX > 0) {
          handleNext()
        } else {
          handlePrev()
        }
      }
    }
    isSwipeGestureRef.current = null
  }

  const isSingle = sortedVideos.length === 1

  return (
    <section className="relative w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-16 overflow-hidden">
      {/* Background Decorative Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[600px] h-[250px] sm:h-[350px] bg-gradient-to-tr from-orange-500/15 via-amber-500/10 to-transparent blur-[90px] sm:blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Header section (Badge, Title, Subtitle) */}
      <div className="text-center max-w-3xl mx-auto mb-6 sm:mb-12 space-y-2 sm:space-y-3 px-2">
        {badge && (
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3.5 py-1 sm:px-4 sm:py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-widest text-orange-600 shadow-xs">
            <VideoIcon className="w-3.5 h-3.5" />
            <span>{badge}</span>
          </div>
        )}
        {title && (
          <h2 className="text-xl xs:text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-snug sm:leading-tight">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-xs sm:text-base font-semibold text-slate-600 leading-relaxed max-w-xl mx-auto">
            {subtitle}
          </p>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. MOBILE VIEW (<768px): CSS Scroll-Snap Native Track (Clean Viewport 1-Click Play) */}
      {/* ========================================================================= */}
      <div
        className="block md:hidden w-full select-none"
        style={{ touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          ref={mobileScrollRef}
          onScroll={handleMobileScroll}
          className="flex gap-4 overflow-x-auto overflow-y-hidden px-4 py-3 scrollbar-hide"
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            scrollBehavior: 'smooth',
          }}
        >
          {sortedVideos.map((video, idx) => {
            const isCenter = idx === currentIndex
            const { embedUrl, isDirect } = getEmbedUrl(video.url)

            return (
              <div
                key={video.id}
                style={{
                  scrollSnapAlign: 'center',
                  scrollSnapStop: 'always',
                  flexShrink: 0,
                  transition: 'transform 350ms cubic-bezier(0.25, 1, 0.35, 1), opacity 350ms ease, box-shadow 350ms ease',
                }}
                className={`w-[88vw] max-w-[420px] rounded-[24px] overflow-hidden border ${
                  isCenter
                    ? 'border-orange-500/35 bg-white/95 dark:bg-slate-900/95 shadow-[0_15px_35px_-10px_rgba(249,115,22,0.22)] scale-100 opacity-100'
                    : 'border-white/60 bg-white/75 dark:bg-slate-900/75 opacity-65 scale-[0.97]'
                } backdrop-blur-xl p-2.5`}
              >
                {/* 100% Clean Video Viewport (No obstructive overlays on top of video) */}
                <div className="relative w-full aspect-video rounded-[18px] overflow-hidden bg-slate-950 shadow-inner">
                  {isDirect ? (
                    <video
                      src={embedUrl}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={embedUrl}
                      title={video.title}
                      loading="lazy"
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  )}
                </div>

                {/* Clean Title & Description (No redundant floating badges or status tags) */}
                <div className="pt-2.5 px-1.5 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`text-xs sm:text-sm font-black tracking-tight line-clamp-1 flex-1 ${
                      isCenter ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {video.title}
                    </h3>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Mở video trong tab mới"
                      className="p-1 -mt-0.5 rounded-full text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {video.description && (
                    <p className={`mt-1 text-[10.5px] font-semibold line-clamp-2 leading-relaxed ${
                      isCenter ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {video.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. DESKTOP & TABLET VIEW (>=768px): 3D Perspective Coverflow (Clean Viewport 1-Click Play) */}
      {/* ========================================================================= */}
      <div className="hidden md:block relative w-full pt-1 pb-2 select-none">
        {/* Navigation Arrows with high-contrast Orange Hover */}
        {!isSingle && (
          <>
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              aria-label="Previous video"
              className={`absolute left-2 sm:left-4 lg:left-6 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all duration-300 shadow-xl cursor-pointer group ${
                currentIndex === 0
                  ? 'bg-white/40 text-slate-300 border-white/20 opacity-0 pointer-events-none'
                  : 'bg-white/95 hover:bg-orange-600 text-slate-700 hover:text-white border-white/90 hover:border-orange-500 hover:scale-110 active:scale-95 shadow-orange-500/20'
              }`}
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5] transition-transform duration-300 group-hover:-translate-x-0.5" />
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex === sortedVideos.length - 1}
              aria-label="Next video"
              className={`absolute right-2 sm:right-4 lg:right-6 top-1/2 -translate-y-1/2 z-40 w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all duration-300 shadow-xl cursor-pointer group ${
                currentIndex === sortedVideos.length - 1
                  ? 'bg-white/40 text-slate-300 border-white/20 opacity-0 pointer-events-none'
                  : 'bg-white/95 hover:bg-orange-600 text-slate-700 hover:text-white border-white/90 hover:border-orange-500 hover:scale-110 active:scale-95 shadow-orange-500/20'
              }`}
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5] transition-transform duration-300 group-hover:translate-x-0.5" />
            </button>
          </>
        )}

        {/* 3D Perspective Stage Area (Snug height fitting video cards without bloated gap) */}
        <div
          className="relative w-full h-[380px] md:h-[460px] lg:h-[510px] flex items-center justify-center overflow-visible"
          style={{ perspective: '1200px' }}
        >
          {sortedVideos.map((video, idx) => {
            const offset = idx - currentIndex
            const isCenter = offset === 0
            const isLeft = offset === -1
            const isRight = offset === 1
            const isVisible = Math.abs(offset) <= 2

            let translateX = 0
            let scale = 1
            let zIndex = 20
            let opacity = 1
            let rotateY = 0

            if (isCenter) {
              translateX = 0
              scale = 1
              zIndex = 30
              opacity = 1
              rotateY = 0
            } else if (isLeft) {
              translateX = -68
              scale = 0.84
              zIndex = 15
              opacity = 0.65
              rotateY = 14
            } else if (isRight) {
              translateX = 68
              scale = 0.84
              zIndex = 15
              opacity = 0.65
              rotateY = -14
            } else if (offset === -2) {
              translateX = -115
              scale = 0.68
              zIndex = 5
              opacity = 0
              rotateY = 24
            } else if (offset === 2) {
              translateX = 115
              scale = 0.68
              zIndex = 5
              opacity = 0
              rotateY = -24
            } else {
              translateX = offset > 0 ? 140 : -140
              scale = 0.5
              zIndex = 0
              opacity = 0
              rotateY = 0
            }

            const { embedUrl, isDirect } = getEmbedUrl(video.url)

            return (
              <div
                key={video.id}
                style={{
                  transform: `translateX(${translateX}%) scale(${scale}) rotateY(${rotateY}deg)`,
                  zIndex,
                  opacity: isVisible ? opacity : 0,
                  pointerEvents: isCenter || isLeft || isRight ? 'auto' : 'none',
                  transition: 'all 600ms cubic-bezier(0.25, 1, 0.35, 1)',
                  willChange: 'transform, opacity',
                  transformStyle: 'preserve-3d',
                }}
                className={`absolute w-[76%] md:w-[68%] lg:w-[62%] max-w-[820px] rounded-[36px] overflow-hidden border border-white/75 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-3 sm:p-4 shadow-[0_20px_50px_-15px_rgba(249,115,22,0.18)] ${
                  !isCenter ? 'cursor-pointer hover:opacity-90' : ''
                }`}
              >
                {/* 100% Clean Video Viewport (No obstructive badges inside video frame) */}
                <div className="relative w-full aspect-video rounded-[28px] overflow-hidden bg-slate-950 shadow-inner group">
                  {isDirect ? (
                    <video
                      src={embedUrl}
                      controls
                      preload="metadata"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <iframe
                      src={embedUrl}
                      title={video.title}
                      loading="lazy"
                      className="w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  )}

                  {/* Cinematic Click-to-Focus Overlay for Non-Center Cards */}
                  {!isCenter && (
                    <div
                      onClick={() => handleSelectIndex(idx)}
                      className="absolute inset-0 z-20 bg-slate-950/40 backdrop-blur-[1.5px] transition-opacity duration-500 cursor-pointer hover:bg-slate-950/20 flex items-center justify-center"
                    >
                      <span className="text-xs font-bold text-white/90 bg-black/60 px-3.5 py-1.5 rounded-full border border-white/20 shadow-md">
                        Bấm để chuyển
                      </span>
                    </div>
                  )}
                </div>

                {/* Clean Title & Description (No redundant floating badges or status tags) */}
                <div className="pt-3.5 px-3 text-left transition-opacity duration-500">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className={`text-base sm:text-lg font-black tracking-tight line-clamp-1 flex-1 ${
                      isCenter ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'
                    }`}>
                      {video.title}
                    </h3>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Mở video trong tab mới"
                      className="p-1.5 -mt-0.5 rounded-full text-slate-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                  {video.description && (
                    <p className={`mt-1 text-xs sm:text-[13px] font-semibold line-clamp-2 leading-relaxed ${
                      isCenter ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'
                    }`}>
                      {video.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. PAGINATION DOTS & COUNTER (Synchronized instantly on both Mobile & Desktop) */}
      {/* ========================================================================= */}
      {!isSingle && (
        <div className="mt-2 sm:mt-1 flex flex-col items-center gap-1 sm:gap-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 p-1 rounded-full bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 backdrop-blur-md shadow-xs">
            {sortedVideos.map((_, i) => (
              <button
                key={i}
                onClick={() => handleSelectIndex(i)}
                aria-label={`Go to video ${i + 1}`}
                className={`h-2 sm:h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  i === currentIndex
                    ? 'w-7 sm:w-11 bg-gradient-to-r from-orange-500 to-amber-500 shadow-md shadow-orange-500/40 ring-2 ring-orange-400/30'
                    : 'w-2 sm:w-2.5 bg-slate-300 dark:bg-slate-600 hover:bg-orange-300 dark:hover:bg-orange-500'
                }`}
              />
            ))}
          </div>
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Video {currentIndex + 1} / {sortedVideos.length}
          </p>
        </div>
      )}
    </section>
  )
}
