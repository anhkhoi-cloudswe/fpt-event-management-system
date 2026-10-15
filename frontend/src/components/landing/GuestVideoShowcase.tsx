import React, { useState } from 'react'
import { Play, Sparkles, ChevronLeft, ChevronRight, Video as VideoIcon } from 'lucide-react'
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
  const [selectedVideoId, setSelectedVideoId] = useState<string>(sortedVideos[0]?.id || '')

  const currentVideo = sortedVideos.find((v) => v.id === selectedVideoId) || sortedVideos[0]
  const otherVideos = sortedVideos.filter((v) => v.id !== currentVideo?.id)

  const { embedUrl, isDirect } = getEmbedUrl(currentVideo.url)

  return (
    <section className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-16">
      {/* Tiêu đề mục Video giới thiệu (có thể điều chỉnh bởi Admin) */}
      <div className="text-center max-w-3xl mx-auto mb-8 sm:mb-12 space-y-2 sm:space-y-3">
        {badge && (
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-orange-600 shadow-sm">
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

      {/* ================= TH 1: CHỈ CÓ 1 VIDEO DUY NHẤT ================= */}
      {sortedVideos.length === 1 && (
        <div className="max-w-4xl mx-auto rounded-[28px] sm:rounded-[36px] overflow-hidden border border-white/60 bg-white/70 sm:bg-white/50 backdrop-blur-md p-3 sm:p-5 shadow-[0_20px_50px_-15px_rgba(249,115,22,0.15)] transition-all duration-300 will-change-transform">
          <div className="relative w-full aspect-video rounded-[20px] sm:rounded-[28px] overflow-hidden bg-slate-950 shadow-inner transform-gpu contain-paint">
            {isDirect ? (
              <video src={embedUrl} controls preload="metadata" className="w-full h-full object-contain transform-gpu" />
            ) : (
              <iframe
                src={embedUrl}
                title={currentVideo.title}
                loading="lazy"
                className="w-full h-full border-0 transform-gpu"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            )}
          </div>
          <div className="pt-4 px-2 sm:px-4">
            <h3 className="text-base sm:text-xl font-black text-slate-900 tracking-tight">
              {currentVideo.title}
            </h3>
            {currentVideo.description && (
              <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-600 leading-relaxed">
                {currentVideo.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ================= TH 2: CÓ 2 VIDEO (DUAL GRID) ================= */}
      {sortedVideos.length === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
          {sortedVideos.map((vid) => {
            const vidData = getEmbedUrl(vid.url)
            return (
              <div
                key={vid.id}
                className="rounded-[28px] overflow-hidden border border-white/60 bg-white/70 sm:bg-white/50 backdrop-blur-md p-3 sm:p-4 shadow-xl hover:shadow-2xl transition-all duration-300 transform-gpu will-change-transform"
              >
                <div className="relative w-full aspect-video rounded-[20px] overflow-hidden bg-slate-950 contain-paint transform-gpu">
                  {vidData.isDirect ? (
                    <video src={vidData.embedUrl} controls preload="metadata" className="w-full h-full object-contain transform-gpu" />
                  ) : (
                    <iframe
                      src={vidData.embedUrl}
                      title={vid.title}
                      loading="lazy"
                      className="w-full h-full border-0 transform-gpu"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  )}
                </div>
                <div className="pt-3 px-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 line-clamp-1">{vid.title}</h3>
                  {vid.description && (
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2">{vid.description}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ================= TH 3: NHIỀU HƠN 2 VIDEO (>2 VIDEO) ================= */}
      {/* Đúng yêu cầu: Video chính bên trái, danh sách video bên phải kèm thanh ngang cuộn mượt mà */}
      {sortedVideos.length > 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* CỘT TRÁI (Lớn): Video tiêu điểm đang được chọn phát */}
          <div className="lg:col-span-8 rounded-[28px] sm:rounded-[36px] overflow-hidden border border-white/60 bg-white/70 sm:bg-white/50 backdrop-blur-md p-3 sm:p-5 shadow-[0_20px_50px_-10px_rgba(249,115,22,0.15)] will-change-transform">
            <div className="relative w-full aspect-video rounded-[20px] sm:rounded-[28px] overflow-hidden bg-slate-950 shadow-inner transform-gpu contain-paint">
              {isDirect ? (
                <video src={embedUrl} controls preload="metadata" className="w-full h-full object-contain transform-gpu" />
              ) : (
                <iframe
                  key={embedUrl}
                  src={embedUrl}
                  title={currentVideo.title}
                  loading="lazy"
                  className="w-full h-full border-0 transform-gpu"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              )}
            </div>
            <div className="pt-4 px-2 sm:px-4">
              <div className="flex items-center gap-2">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-orange-500 text-white shadow-xs">
                  Đang phát
                </span>
                <h3 className="text-base sm:text-xl font-black text-slate-900 tracking-tight">
                  {currentVideo.title}
                </h3>
              </div>
              {currentVideo.description && (
                <p className="mt-1.5 text-xs sm:text-sm font-semibold text-slate-600 leading-relaxed">
                  {currentVideo.description}
                </p>
              )}
            </div>
          </div>

          {/* CỘT PHẢI: Danh sách video kèm thanh cuộn ngang/dọc rõ ràng */}
          <div className="lg:col-span-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">
                Danh sách video ({sortedVideos.length})
              </span>
              <span className="text-[11px] font-bold text-orange-600">Bấm để chuyển</span>
            </div>

            {/* Khung cuộn với thanh cuộn ngang/dọc thiết kế mượt mà */}
            <div className="flex lg:flex-col gap-3.5 overflow-x-auto lg:overflow-y-auto lg:max-h-[480px] p-2 pb-4 lg:pb-2 rounded-[24px] bg-white/30 backdrop-blur-md border border-white/50 scrollbar-thin scrollbar-thumb-orange-400 scrollbar-track-orange-50">
              {sortedVideos.map((vid, idx) => {
                const isSelected = vid.id === currentVideo.id
                const thumb = getAutoThumbnail(vid)

                return (
                  <button
                    key={vid.id}
                    onClick={() => setSelectedVideoId(vid.id)}
                    className={`group shrink-0 lg:shrink flex items-center gap-3 w-64 lg:w-full p-2.5 rounded-2xl text-left transition-all duration-300 border ${
                      isSelected
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white border-transparent shadow-lg shadow-orange-500/25 scale-[1.02]'
                        : 'bg-white/70 hover:bg-white text-slate-800 border-white/60 hover:shadow-md'
                    }`}
                  >
                    {/* Thumbnail video hoặc placeholder icon */}
                    <div className="relative w-24 h-16 sm:w-28 sm:h-18 rounded-xl overflow-hidden bg-slate-900 shrink-0 shadow-xs">
                      {thumb ? (
                        <img src={thumb} alt={vid.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-orange-400">
                          <Play className="w-6 h-6 fill-orange-400" />
                        </div>
                      )}
                      {/* Play overlay button */}
                      <div className={`absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <div className="w-7 h-7 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-md">
                          <Play className="w-3.5 h-3.5 fill-slate-900 ml-0.5" />
                        </div>
                      </div>
                    </div>

                    {/* Tiêu đề & thứ tự */}
                    <div className="flex-1 min-w-0 pr-1">
                      <span className={`text-[10px] font-black uppercase tracking-wider block ${isSelected ? 'text-orange-100' : 'text-slate-400'}`}>
                        Video {idx + 1}
                      </span>
                      <p className={`text-xs sm:text-sm font-bold line-clamp-2 leading-tight ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                        {vid.title}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
