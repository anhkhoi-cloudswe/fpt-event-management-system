import React, { useState, useEffect, useMemo } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Video,
  FileDown,
  ExternalLink,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
  Sparkles,
  ShieldCheck,
  Search,
  BookOpen
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

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

const STORAGE_KEY = 'fems_guide_docs_v2'

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
  const { user } = useAuth()
  const isUserAdmin = user?.role === 'ADMIN'

  // Hỗ trợ Admin tự động, kèm nút bật/tắt chế độ quản trị cho phép kiểm thử nhanh
  const [adminMode, setAdminMode] = useState<boolean>(isUserAdmin)

  useEffect(() => {
    if (isUserAdmin) {
      setAdminMode(true)
    }
  }, [isUserAdmin])

  // Danh sách tài liệu lấy từ localStorage
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

  // Tìm kiếm & Lọc danh mục
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Trạng thái Modal Thêm / Sửa
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDoc, setEditingDoc] = useState<GuideDocItem | null>(null)

  // Form state
  const [formData, setFormData] = useState<{
    title: string
    category: string
    content: string
    videoUrl: string
    documentUrl: string
    documentName: string
    order: number
  }>({
    title: '',
    category: 'Sinh viên & Khán giả',
    content: '',
    videoUrl: '',
    documentUrl: '',
    documentName: '',
    order: 1
  })

  // Toast thông báo cục bộ
  const [alertNotice, setAlertNotice] = useState<{
    type: 'success' | 'error' | 'info'
    message: string
  } | null>(null)

  const showAlert = (type: 'success' | 'error' | 'info', message: string) => {
    setAlertNotice({ type, message })
    setTimeout(() => {
      setAlertNotice(null)
    }, 4000)
  }

  // Lưu vào localStorage khi docs thay đổi
  const saveDocsToStorage = (newDocs: GuideDocItem[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newDocs))
    } catch (err) {
      console.error('Lỗi ghi localStorage:', err)
    }
    setDocs(newDocs)
  }

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

  // Mở modal thêm mới
  const handleOpenCreateModal = () => {
    setEditingDoc(null)
    setFormData({
      title: '',
      category: 'Sinh viên & Khán giả',
      content: '',
      videoUrl: '',
      documentUrl: '',
      documentName: '',
      order: docs.length + 1
    })
    setIsModalOpen(true)
  }

  // Mở modal sửa
  const handleOpenEditModal = (item: GuideDocItem) => {
    setEditingDoc(item)
    setFormData({
      title: item.title,
      category: item.category || 'Sinh viên & Khán giả',
      content: item.content,
      videoUrl: item.videoUrl || '',
      documentUrl: item.documentUrl || '',
      documentName: item.documentName || '',
      order: item.order || 1
    })
    setIsModalOpen(true)
  }

  // Xóa tài liệu
  const handleDeleteDoc = (id: string, title: string) => {
    const confirmed = window.confirm(
      `Bạn có chắc chắn muốn xóa mục hướng dẫn: "${title}" không?`
    )
    if (!confirmed) return

    const newDocs = docs.filter(d => d.id !== id)
    saveDocsToStorage(newDocs)
    showAlert('success', `Đã xóa thành công mục "${title}"`)
  }

  // Khôi phục mặc định
  const handleResetDefaults = () => {
    const confirmed = window.confirm(
      'Khôi phục danh sách tài liệu & hướng dẫn về dữ liệu mẫu mặc định của FEMS?'
    )
    if (!confirmed) return

    saveDocsToStorage(DEFAULT_GUIDE_DOCS)
    showAlert('info', 'Đã khôi phục toàn bộ tài liệu hướng dẫn mặc định!')
  }

  // Submit form Thêm / Sửa
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      showAlert('error', 'Vui lòng nhập tiêu đề cho mục hướng dẫn!')
      return
    }

    if (!formData.content.trim()) {
      showAlert('error', 'Vui lòng nhập nội dung hướng dẫn!')
      return
    }

    if (editingDoc) {
      // Update
      const updatedDocs = docs.map(d => {
        if (d.id === editingDoc.id) {
          return {
            ...d,
            title: formData.title.trim(),
            category: formData.category.trim(),
            content: formData.content.trim(),
            videoUrl: formData.videoUrl.trim(),
            documentUrl: formData.documentUrl.trim(),
            documentName: formData.documentName.trim(),
            order: Number(formData.order) || 1,
            updatedAt: new Date().toLocaleDateString('vi-VN')
          }
        }
        return d
      })
      saveDocsToStorage(updatedDocs)
      showAlert('success', `Đã cập nhật mục "${formData.title}" thành công!`)
    } else {
      // Create new
      const newItem: GuideDocItem = {
        id: `doc-${Date.now()}`,
        title: formData.title.trim(),
        category: formData.category.trim(),
        content: formData.content.trim(),
        videoUrl: formData.videoUrl.trim(),
        documentUrl: formData.documentUrl.trim(),
        documentName: formData.documentName.trim(),
        order: Number(formData.order) || docs.length + 1,
        updatedAt: new Date().toLocaleDateString('vi-VN')
      }
      saveDocsToStorage([...docs, newItem])
      showAlert('success', `Đã thêm mới mục "${formData.title}" thành công!`)
    }

    setIsModalOpen(false)
  }

  // Phân tích video URL trong form để live preview
  const videoPreview = useMemo(() => {
    return parseVideoUrl(formData.videoUrl)
  }, [formData.videoUrl])

  return (
    <div className="space-y-6 text-slate-700 dark:text-slate-300 leading-relaxed text-[15px]">
      {/* Toast Alert Thông báo cục bộ */}
      {alertNotice && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between shadow-md transition-all animate-in fade-in duration-300 border ${
            alertNotice.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : alertNotice.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-800 text-blue-800 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {alertNotice.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : alertNotice.type === 'error' ? (
              <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
            <span className="font-semibold text-sm">{alertNotice.message}</span>
          </div>
          <button
            onClick={() => setAlertNotice(null)}
            className="p-1 hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Thanh công cụ Admin Quản trị CRUD */}
      <div className="p-4 sm:p-5 rounded-3xl border border-orange-200 dark:border-slate-800 bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-white/80 dark:from-orange-950/30 dark:via-slate-900/40 dark:to-slate-900/60 backdrop-blur-md shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-black text-slate-900 dark:text-white text-base">
                Quản trị Tài liệu & Video hướng dẫn
              </h4>
              {adminMode && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-600 text-white shadow-xs">
                  ADMIN CRUD BẬT
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
              Cho phép Admin tạo mới, chỉnh sửa nội dung, đính kèm tài liệu và nhúng link video YouTube/MP4
            </p>
          </div>
        </div>

        {/* Nút thao tác Admin */}
        <div className="flex items-center flex-wrap gap-2 sm:self-center">
          {/* Nút Toggle Admin Mode */}
          <button
            type="button"
            onClick={() => setAdminMode(!adminMode)}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 shadow-2xs ${
              adminMode
                ? 'bg-orange-100 dark:bg-orange-950/70 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-800'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-orange-600'
            }`}
            title="Bật/Tắt chế độ chỉnh sửa CRUD Admin"
          >
            <ShieldCheck className="w-4 h-4 text-orange-500" />
            <span>{adminMode ? 'Chế độ Admin: BẬT' : 'Bật quyền Admin CRUD'}</span>
          </button>

          {adminMode && (
            <>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="px-3.5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md shadow-orange-500/25 transition-all flex items-center gap-1.5 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm hướng dẫn mới</span>
              </button>

              <button
                type="button"
                onClick={handleResetDefaults}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 transition-all flex items-center gap-1.5"
                title="Khôi phục lại nội dung ban đầu"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Khôi phục mặc định</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bộ lọc & Tìm kiếm nhanh */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
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
          {adminMode && (
            <button
              onClick={handleOpenCreateModal}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm hướng dẫn ngay
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredDocs.map((item, idx) => {
            const parsedVideo = parseVideoUrl(item.videoUrl)
            return (
              <div
                key={item.id}
                className="group p-5 sm:p-6 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/70 dark:bg-slate-950/50 backdrop-blur-sm hover:border-orange-300/80 dark:hover:border-slate-700 hover:shadow-md transition-all duration-300 relative"
              >
                {/* Header của thẻ hướng dẫn: Tag + Title + Admin Action Buttons */}
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

                  {/* Nút Edit / Delete khi ở chế độ Admin */}
                  {adminMode && (
                    <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-center bg-orange-50/80 dark:bg-slate-900 px-2 py-1 rounded-xl border border-orange-200/60 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(item)}
                        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-orange-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                        title="Chỉnh sửa nội dung & video"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(item.id, item.title)}
                        className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                        title="Xóa mục hướng dẫn này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
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

      {/* Modal Thêm Mới / Chỉnh Sửa Hướng Dẫn & Video (Admin CRUD) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Pencil className="w-5 h-5 text-orange-500" />
                  {editingDoc ? 'Chỉnh sửa tài liệu / video hướng dẫn' : 'Thêm tài liệu / video hướng dẫn mới'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Quản lý nội dung văn bản, đính kèm link video YouTube hoặc file biểu mẫu
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitForm} className="space-y-4">
              {/* Tiêu đề & Phân loại */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tiêu đề mục hướng dẫn <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: 1. Hướng dẫn quét mã QR Check-in hội trường"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-semibold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Phân loại / Nhãn tag
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Sinh viên, Ban tổ chức..."
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Nội dung mô tả chi tiết */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nội dung hướng dẫn chi tiết <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Nhập nội dung các bước thực hiện, lưu ý quan trọng cho sinh viên hoặc ban tổ chức..."
                  value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 leading-relaxed"
                />
              </div>

              {/* Đường dẫn Video (YouTube / MP4) */}
              <div className="space-y-1.5 p-4 rounded-2xl bg-orange-50/50 dark:bg-slate-950/40 border border-orange-200/80 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Video className="w-4 h-4 text-orange-500" />
                    Đường dẫn Video hướng dẫn (YouTube / MP4)
                  </label>
                  <span className="text-[11px] text-slate-400 font-medium">Hỗ trợ nhúng phát trực tiếp</span>
                </div>
                <input
                  type="url"
                  placeholder="https://www.youtube.com/watch?v=... hoặc https://youtu.be/... hoặc link .mp4"
                  value={formData.videoUrl}
                  onChange={e => setFormData({ ...formData, videoUrl: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  💡 Nhập link YouTube (dạng chuẩn, rút gọn `youtu.be` hoặc `shorts`) để hệ thống tự động nhúng khung phát video HD.
                </p>

                {/* Live Preview Video ngay trong modal */}
                {videoPreview.type === 'youtube' && (
                  <div className="mt-3">
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                      ✓ Đã nhận diện YouTube video - Xem trước:
                    </span>
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-inner border border-slate-300 dark:border-slate-700 bg-black">
                      <iframe
                        src={videoPreview.embedUrl}
                        title="Video Preview"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
                {videoPreview.type === 'direct' && (
                  <div className="mt-3">
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                      ✓ Đã nhận diện file Video trực tiếp:
                    </span>
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-inner border border-slate-300 dark:border-slate-700 bg-black">
                      <video src={videoPreview.embedUrl} controls className="w-full h-full object-contain" />
                    </div>
                  </div>
                )}
              </div>

              {/* Tài liệu đính kèm (File / Form) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Đường dẫn tài liệu đính kèm (URL Drive / PDF)
                  </label>
                  <input
                    type="url"
                    placeholder="https://drive.google.com/file/..."
                    value={formData.documentUrl}
                    onChange={e => setFormData({ ...formData, documentUrl: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tên file hiển thị (nếu có)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Mau_de_xuat_su_kien.docx"
                    value={formData.documentName}
                    onChange={e => setFormData({ ...formData, documentName: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                </div>
              </div>

              {/* Thứ tự hiển thị */}
              <div className="w-32 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Thứ tự hiển thị
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.order}
                  onChange={e => setFormData({ ...formData, order: Number(e.target.value) || 1 })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Nút hành động */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-sm font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md shadow-orange-500/25 transition-all active:scale-95"
                >
                  {editingDoc ? 'Lưu thay đổi' : 'Thêm mới hướng dẫn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
