import { useState, useEffect, useMemo } from 'react'
import {
  Video,
  FileDown,
  ExternalLink,
  Play,
  HelpCircle,
  Search
} from 'lucide-react'

export interface GuideDocItem {
  id: string
  title: string
  category: string
  content: string
  videoUrl?: string
  documentUrl?: string
  documentName?: string
  order: number
  updatedAt?: string
}

export const STORAGE_KEY = 'fems_guide_docs_v2'

export const DEFAULT_GUIDE_DOCS: GuideDocItem[] = [
  {
    id: 'doc-1',
    title: '1. Hướng dẫn Nhận vé & Check-in sự kiện',
    category: 'Sinh viên & Khán giả',
    content:
      'Sau khi đăng ký vé thành công, bạn có thể kiểm tra danh sách vé tại mục "Vé của tôi". Xuất trình mã QR tại cổng kiểm soát để kiểm soát viên quét mã ghi nhận điểm danh. Bạn cũng có thể chụp ảnh màn hình lưu offline hoặc cung cấp mã số vé (#ID) để check-in thủ công khi mất kết nối mạng.',
    videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    documentUrl: '',
    documentName: '',
    order: 1,
    updatedAt: new Date().toLocaleDateString('vi-VN')
  },
  {
    id: 'doc-2',
    title: '2. Hướng dẫn Dành cho Ban tổ chức (Organizer)',
    category: 'Ban tổ chức (CLB)',
    content:
      'Các Câu lạc bộ và Đơn vị tổ chức sự kiện cần gửi đơn đăng ký sự kiện trước thời điểm diễn ra tối thiểu 07 ngày làm việc để Nhà trường xét duyệt địa điểm, trang thiết bị và hạn ngạch sự kiện (tối đa 02 sự kiện lớn/ngày trên toàn trường).',
    videoUrl: '',
    documentUrl: 'https://drive.google.com',
    documentName: 'Bieu_mau_de_xuat_su_kien_FPT_2026.docx',
    order: 2,
    updatedAt: new Date().toLocaleDateString('vi-VN')
  },
  {
    id: 'doc-3',
    title: '3. Quy trình phản ánh lỗi ghế ngồi & Nhận hoàn tiền vào Ví nội bộ',
    category: 'Bảo vệ quyền lợi',
    content:
      'Nếu vị trí ghế ngồi của bạn tại sự kiện bị chiếm dụng hoặc hư hỏng vật lý, hãy vào chi tiết vé trong "Vé của tôi" và bấm "Báo cáo lỗi". Staff sẽ thẩm định phản ánh trong vòng 24 giờ. Khi được duyệt, hệ thống sẽ tự động hoàn 100% tiền vé trực tiếp vào Ví nội bộ FEMS của bạn (dùng để mua vé các sự kiện kế tiếp, không hỗ trợ rút tiền mặt).',
    videoUrl: '',
    documentUrl: '',
    documentName: '',
    order: 3,
    updatedAt: new Date().toLocaleDateString('vi-VN')
  }
]

/**
 * Trích xuất ID YouTube hoặc định dạng embed URL an toàn
 */
export function parseVideoUrl(url?: string): {
  type: 'youtube' | 'direct' | 'other' | null
  embedUrl: string
} {
  if (!url || !url.trim()) {
    return { type: null, embedUrl: '' }
  }

  const trimmed = url.trim()

  // Match YouTube URLs (watch?v=, youtu.be/, shorts/, embed/)
  const ytRegex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i
  const ytMatch = trimmed.match(ytRegex)

  if (ytMatch && ytMatch[1]) {
    return {
      type: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytMatch[1]}?rel=0`
    }
  }

  // Direct video file link
  if (/\.(mp4|webm|ogg)($|\?)/i.test(trimmed)) {
    return {
      type: 'direct',
      embedUrl: trimmed
    }
  }

  // Already embeddable URL or Vimeo
  if (trimmed.includes('player.vimeo.com') || trimmed.includes('/embed/')) {
    return {
      type: 'direct',
      embedUrl: trimmed
    }
  }

  return {
    type: 'other',
    embedUrl: trimmed
  }
}

export default function FemsDocsManager() {
  // Danh sách tài liệu lấy từ localStorage, đồng bộ cùng Admin Dashboard Frontend Customizer
  const [docs, setDocs] = useState<GuideDocItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.error('Lỗi đọc fems_guide_docs từ localStorage:', e)
    }
    return DEFAULT_GUIDE_DOCS
  })

  // Lắng nghe sự kiện thay đổi từ Admin Dashboard trong tab khác hoặc reload
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed)) {
            setDocs(parsed)
          }
        } catch (err) {
          console.error(err)
        }
      }
    }

    const handleFocus = () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDocs(parsed)
          }
        }
      } catch (err) {
        console.error(err)
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Tìm kiếm & Lọc danh mục
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Danh sách các categories độc nhất
  const categories = useMemo(() => {
    const set = new Set<string>()
    docs.forEach(d => {
      if (d.category) set.add(d.category)
    })
    return ['ALL', ...Array.from(set)]
  }, [docs])

  // Lọc danh sách hiển thị
  const filteredDocs = useMemo(() => {
    return docs
      .filter(d => {
        const matchesCategory =
          selectedCategory === 'ALL' || d.category === selectedCategory
        const matchesSearch =
          !searchKeyword.trim() ||
          d.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
          d.content.toLowerCase().includes(searchKeyword.toLowerCase()) ||
          d.category.toLowerCase().includes(searchKeyword.toLowerCase())
        return matchesCategory && matchesSearch
      })
      .sort((a, b) => a.order - b.order)
  }, [docs, selectedCategory, searchKeyword])

  return (
    <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
      {/* Bộ lọc & Tìm kiếm nhanh */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-white/70 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-orange-50 dark:hover:bg-slate-800'
              }`}
            >
              {cat === 'ALL' ? 'Tất cả chủ đề' : cat}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm tài liệu, video..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Danh sách các thẻ hướng dẫn */}
      {filteredDocs.length === 0 ? (
        <div className="text-center py-12 px-4 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40">
          <HelpCircle className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-60" />
          <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
            Không tìm thấy mục hướng dẫn nào phù hợp
          </h4>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {searchKeyword
              ? `Không có kết quả cho từ khóa "${searchKeyword}". Hãy thử tìm kiếm từ khóa khác.`
              : 'Chưa có tài liệu nào trong danh mục này.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredDocs.map((item) => {
            const parsedVideo = parseVideoUrl(item.videoUrl)
            return (
              <div
                key={item.id}
                className="group p-5 sm:p-6 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/70 dark:bg-slate-950/50 backdrop-blur-sm hover:border-orange-300/80 dark:hover:border-slate-700 hover:shadow-md transition-all duration-300 relative"
              >
                {/* Header của thẻ hướng dẫn: Tag + Title */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border border-orange-200/60 dark:border-orange-900/40">
                        {item.category || 'Hướng dẫn chung'}
                      </span>
                      {item.updatedAt && (
                        <span className="text-[11px] text-slate-400">
                          Cập nhật: {item.updatedAt}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-orange-600 transition-colors">
                      {item.title}
                    </h3>
                  </div>
                </div>

                {/* Nội dung text mô tả */}
                <div className="text-slate-700 dark:text-slate-300 leading-relaxed text-[15px] whitespace-pre-line font-medium mb-4">
                  {item.content}
                </div>

                {/* Video Hướng Dẫn Nhúng Trực Tiếp (nếu có) */}
                {parsedVideo.type && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2 mb-2.5 text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">
                      <Video className="w-4 h-4" />
                      <span>Video Clip Hướng dẫn thực hành trực quan:</span>
                    </div>

                    {parsedVideo.type === 'youtube' ? (
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-slate-800 bg-black">
                        <iframe
                          src={parsedVideo.embedUrl}
                          title={item.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="absolute inset-0 w-full h-full border-0"
                        />
                      </div>
                    ) : parsedVideo.type === 'direct' ? (
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden shadow-md border border-slate-200 dark:border-slate-800 bg-black">
                        <video
                          src={parsedVideo.embedUrl}
                          controls
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <a
                        href={parsedVideo.embedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white shadow-xs transition-colors"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Mở liên kết Video hướng dẫn ({parsedVideo.embedUrl})</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}

                {/* File / Tài liệu mẫu đính kèm (nếu có) */}
                {item.documentUrl && (
                  <div className="mt-4 pt-3 flex items-center gap-3">
                    <a
                      href={item.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-orange-200 dark:border-slate-800 hover:border-orange-500 text-slate-800 dark:text-slate-200 hover:text-orange-600 shadow-xs transition-all"
                    >
                      <FileDown className="w-4 h-4 text-orange-500" />
                      <span>{item.documentName || 'Tải tài liệu biểu mẫu đính kèm'}</span>
                      <ExternalLink className="w-3 h-3 text-slate-400" />
                    </a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Hộp ghi chú hỗ trợ chuẩn từ giao diện gốc */}
      <div className="p-5 bg-gradient-to-r from-orange-100/80 via-amber-100/60 to-orange-50/80 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-slate-900/60 rounded-3xl border border-orange-200 dark:border-orange-900/60 text-sm shadow-xs mt-6">
        <p className="font-bold text-orange-900 dark:text-orange-300 flex items-center gap-2 text-base">
          💡 Cần hỗ trợ khẩn cấp hoặc giải đáp thắc mắc?
        </p>
        <p className="text-orange-800 dark:text-orange-400 mt-1 font-medium leading-relaxed">
          Vui lòng liên hệ Văn phòng Quản lý Sự kiện FPT hoặc gửi email tới{' '}
          <code className="bg-orange-200/60 dark:bg-orange-900/60 px-2 py-0.5 rounded-lg text-orange-950 dark:text-orange-200 font-mono font-bold">
            support@fpt.edu.vn
          </code>
          .
        </p>
      </div>
    </div>
  )
}
