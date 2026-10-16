import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Play, ChevronLeft, ChevronRight, Video as VideoIcon, ExternalLink } from 'lucide-react'
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

/**
 * Trích xuất ảnh thumbnail tự động nếu là YouTube
 */
export const getAutoThumbnail = (video: GuestVideoItem): string => {
  if (video.thumbnailUrl && video.thumbnailUrl.trim()) {
    return video.thumbnailUrl.trim()
  }
  const ytShortsMatch = video.url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/i)
  if (ytShortsMatch && ytShortsMatch[1]) {
    return `https://img.youtube.com/vi/${ytShortsMatch[1]}/hqdefault.jpg`
  }
  const ytMatch = video.url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i)
  if (ytMatch && ytMatch[1]) {
    return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`
  }
  return ''
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
  const [isPlayingCurrent, setIsPlayingCurrent] = useState<boolean>(false)

  // Touch & Swipe gesture handling
  const touchStartXRef = useRef<number>(0)
  const touchEndXRef = useRef<number>(0)
  const isDraggingRef = useRef<boolean>(false)

  // Clamp index if list changes
  useEffect(() => {
    if (currentIndex >= sortedVideos.length) {
      setCurrentIndex(Math.max(0, sortedVideos.length - 1))
    }
  }, [sortedVideos.length, currentIndex])

  // Reset playing status whenever switching active video
  const handleSelectIndex = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= sortedVideos.length) return
    setCurrentIndex(newIndex)
    setIsPlayingCurrent(false)
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

  // Touch events for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.targetTouches[0].clientX
    touchEndXRef.current = e.targetTouches[0].clientX
    isDraggingRef.current = true
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return
    touchEndXRef.current = e.targetTouches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    const diff = touchStartXRef.current - touchEndXRef.current
    const minSwipeDistance = 50
    if (diff > minSwipeDistance) {
      handleNext()
    } else if (diff < -minSwipeDistance) {
      handlePrev()
    }
  }

  const activeVideo = sortedVideos[currentIndex] || sortedVideos[0]
  const isSingle = sortedVideos.length === 1

  return (
    <section className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16 overflow-hidden">
      {/* Background Decorative Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-orange-500/15 via-amber-500/10 to-transparent blur-[120px] rounded-full pointer-events-none -z-10" />

      {/* Header section (Badge, Title, Subtitle) */}
      <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 space-y-2 sm:space-y-3">
        {badge && (
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-orange-600 shadow-xs">
            <VideoIcon className="w-3.5 h-3.5" />
            <span>{badge}</span>
          </div>
        )}
        {title && (
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-xs sm:text-base font-semibold text-slate-600">
            {subtitle}
          </p>
        )}
      </div>

      {/* ================= COVERFLOW / HORIZONTAL CAROUSEL CONTAINER ================= */}
      <div
        className="relative w-full py-4 select-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Navigation Arrows (Desktop & Tablet) */}
        {!isSingle && (
          <>
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              aria-label="Previous video"
              className={`absolute left-2 sm:left-4 lg:left-8 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all duration-300 shadow-xl cursor-pointer ${
                currentIndex === 0
                  ? 'bg-white/30 text-slate-400 border-white/20 opacity-0 pointer-events-none'
                  : 'bg-white/90 hover:bg-white text-slate-800 hover:text-orange-600 border-white/80 hover:scale-110 active:scale-95 shadow-orange-500/10'
              }`}
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>

            <button
              onClick={handleNext}
              disabled={currentIndex === sortedVideos.length - 1}
              aria-label="Next video"
              className={`absolute right-2 sm:right-4 lg:right-8 top-1/2 -translate-y-1/2 z-30 w-11 h-11 sm:w-13 sm:h-13 rounded-full flex items-center justify-center backdrop-blur-xl border transition-all duration-300 shadow-xl cursor-pointer ${
                currentIndex === sortedVideos.length - 1
                  ? 'bg-white/30 text-slate-400 border-white/20 opacity-0 pointer-events-none'
                  : 'bg-white/90 hover:bg-white text-slate-800 hover:text-orange-600 border-white/80 hover:scale-110 active:scale-95 shadow-orange-500/10'
              }`}
            >
              <ChevronRight className="w-6 h-6 stroke-[2.5]" />
            </button>
          </>
        )}

        {/* 3D Perspective Stage Area */}
        <div
          className="relative w-full h-[260px] xs:h-[300px] sm:h-[400px] md:h-[480px] lg:h-[540px] flex items-center justify-center overflow-visible"
          style={{ perspective: '1200px' }}
        >
          {sortedVideos.map((video, idx) => {
            const offset = idx - currentIndex
            const isCenter = offset === 0
            const isLeft = offset === -1
            const isRight = offset === 1
            const isVisible = Math.abs(offset) <= 2

            // Calculate precise 3D Coverflow positioning
            let translateX = 0
            let scale = 1
            let zIndex = 20
            let opacity = 1
            let rotateY = 0

            if (isCenter) {
              translateX = 0
              scale = 1
              zIndex = 25
              opacity = 1
              rotateY = 0
            } else if (isLeft) {
              translateX = -68 // % translate left peek
              scale = 0.84
              zIndex = 15
              opacity = 0.65
              rotateY = 14
            } else if (isRight) {
              translateX = 68 // % translate right peek
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
            const thumbnail = getAutoThumbnail(video)

            return (
              <div
                key={video.id}
                onClick={() => {
                  if (!isCenter) handleSelectIndex(idx)
                }}
                style={{
                  transform: `translateX(${translateX}%) scale(${scale}) rotateY(${rotateY}deg)`,
                  zIndex,
                  opacity: isVisible ? opacity : 0,
                  pointerEvents: isCenter || isLeft || isRight ? 'auto' : 'none',
                  transition: 'all 600ms cubic-bezier(0.25, 1, 0.35, 1)',
                  willChange: 'transform, opacity',
                  transformStyle: 'preserve-3d',
                }}
                className={`absolute w-[86%] sm:w-[76%] md:w-[68%] lg:w-[62%] max-w-[820px] rounded-[24px] sm:rounded-[36px] overflow-hidden border border-white/70 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-2.5 sm:p-4 shadow-[0_20px_50px_-15px_rgba(249,115,22,0.18)] ${
                  !isCenter ? 'cursor-pointer hover:opacity-90' : ''
                }`}
              >
                {/* Video Screen / Player Container */}
                <div className="relative w-full aspect-video rounded-[18px] sm:rounded-[28px] overflow-hidden bg-slate-950 shadow-inner group">
                  {/* If Center and User has clicked Play -> Show Live Iframe / Video */}
                  {isCenter && isPlayingCurrent ? (
                    isDirect ? (
                      <video
                        src={embedUrl}
                        controls
                        autoPlay
                        preload="metadata"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <iframe
                        src={`${embedUrl}&autoplay=1`}
                        title={video.title}
                        loading="lazy"
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    )
                  ) : (
                    /* Thumbnail preview with stylish Play Button */
                    <div
                      className="relative w-full h-full cursor-pointer flex items-center justify-center group"
                      onClick={() => {
                        if (isCenter) {
                          setIsPlayingCurrent(true)
                        } else {
                          handleSelectIndex(idx)
                        }
                      }}
                    >
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={video.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-white p-4">
                          <VideoIcon className="w-12 h-12 text-orange-500/60 mb-2 animate-pulse" />
                          <span className="text-xs font-bold text-slate-400">Xem video sự kiện</span>
                        </div>
                      )}

                      {/* Ambient Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity group-hover:opacity-90" />

                      {/* Ripple pulsing play button */}
                      <div className="relative z-10 flex items-center justify-center">
                        <div className="absolute w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-orange-500/30 animate-ping duration-[2500ms]" />
                        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-orange-600 to-amber-500 text-white flex items-center justify-center shadow-xl shadow-orange-600/40 group-hover:scale-110 active:scale-95 transition-transform duration-300">
                          <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-white ml-1" />
                        </div>
                      </div>

                      {/* Badge Video Order */}
                      <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] sm:text-xs font-black uppercase tracking-wider text-white shadow-xs">
                        Video #{idx + 1}
                      </div>

                      {/* Quick external link button */}
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Mở tab mới"
                        className="absolute top-3 right-3 p-2 rounded-full bg-black/50 hover:bg-black/80 text-white/80 hover:text-white backdrop-blur-md transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Video Info (Title & Description) */}
                <div className="pt-3 sm:pt-4 px-2 sm:px-3 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    {isCenter && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xs">
                        Tiêu điểm
                      </span>
                    )}
                    <h3 className="text-sm sm:text-lg font-black text-slate-900 dark:text-white tracking-tight line-clamp-1">
                      {video.title}
                    </h3>
                  </div>
                  {video.description && (
                    <p className="text-[11px] sm:text-xs font-semibold text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {video.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Carousel Pagination Dots & Progress Indicator */}
        {!isSingle && (
          <div className="mt-6 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              {sortedVideos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectIndex(i)}
                  aria-label={`Go to video ${i + 1}`}
                  className={`h-2 sm:h-2.5 rounded-full transition-all duration-500 cursor-pointer ${
                    i === currentIndex
                      ? 'w-8 sm:w-10 bg-gradient-to-r from-orange-500 to-amber-500 shadow-md shadow-orange-500/30'
                      : 'w-2 sm:w-2.5 bg-slate-300 dark:bg-slate-700 hover:bg-orange-300'
                  }`}
                />
              ))}
            </div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {currentIndex + 1} / {sortedVideos.length}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}
