import React, { useState, useEffect } from 'react'
import {
  Video,
  GripVertical,
  Plus,
  Trash2,
  ExternalLink,
  Eye,
  Save,
  RefreshCw,
  Sparkles,
  Layers,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  LayoutTemplate,
  Edit2,
  Building2,
  Image as ImageIcon,
  Sliders,
  Type,
  X,
  Check
} from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { frontendConfigService } from '../../services/frontendConfigService'
import { getEmbedUrl } from '../../components/landing/GuestVideoShowcase'
import {
  FrontendConfigData,
  GuestVideoItem,
  BrandPartnerItem,
  HeroImageItem
} from '../../types/frontendConfig'

export default function FrontendCustomizer() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'video' | 'brands' | 'hero' | 'sections'>('video')

  const [config, setConfig] = useState<FrontendConfigData>({
    videos: [],
    videoShowcaseBadge: 'Thước Phim Sự Kiện',
    videoShowcaseTitle: 'Sôi Động & Sáng Tạo Tại FPT Education',
    videoShowcaseSubtitle: 'Cảm nhận năng lượng nhiệt huyết từ các chương trình, hoạt động văn hóa và lễ hội bùng nổ.',
    heroImages: [],
    brands: [],
    brandSectionTitle: 'Được tin tưởng và đánh giá cao bởi',
    brandSectionSubtitle: '300+ đối tác, doanh nghiệp & tổ chức câu lạc bộ',
    sections: {
      hero: true,
      videos: true,
      brands: true,
      events: true,
      stats: true,
      features: true,
      footer: true,
    },
    heroAnnouncementText: '',
  })

  // ===================== VIDEO SHOWCASE STATE =====================
  const [newTitle, setNewTitle] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [previewVideoUrl, setPreviewVideoUrl] = useState('')

  // Modal Edit Video
  const [editingVideo, setEditingVideo] = useState<GuestVideoItem | null>(null)

  // Drag and drop video
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)

  // ===================== BRAND PARTNERS STATE =====================
  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandLogo, setNewBrandLogo] = useState('')
  const [newBrandWebsite, setNewBrandWebsite] = useState('')
  const [editingBrand, setEditingBrand] = useState<BrandPartnerItem | null>(null)

  // ===================== HERO IMAGES STATE =====================
  const [editingHeroImage, setEditingHeroImage] = useState<HeroImageItem | null>(null)
  const [newHeroTitle, setNewHeroTitle] = useState('')
  const [newHeroImgUrl, setNewHeroImgUrl] = useState('')

  // Fetch initial config
  const fetchConfig = async () => {
    try {
      setLoading(true)
      const data = await frontendConfigService.getConfig()
      setConfig({
        ...data,
        videoShowcaseBadge: data.videoShowcaseBadge || 'Thước Phim Sự Kiện',
        videoShowcaseTitle: data.videoShowcaseTitle || 'Sôi Động & Sáng Tạo Tại FPT Education',
        videoShowcaseSubtitle: data.videoShowcaseSubtitle || 'Cảm nhận năng lượng nhiệt huyết từ các chương trình, hoạt động văn hóa và lễ hội bùng nổ.',
        brandSectionTitle: data.brandSectionTitle || 'Được tin tưởng và đánh giá cao bởi',
        brandSectionSubtitle: data.brandSectionSubtitle || '300+ đối tác, doanh nghiệp & tổ chức câu lạc bộ',
        heroImages: data.heroImages || [],
        brands: data.brands || [],
      })
    } catch (err: any) {
      console.error('Failed to load frontend config:', err)
      showToast('error', 'Không thể tải cấu hình giao diện frontend!')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchConfig()
  }, [])

  // Helper tự động lưu trực tiếp lên backend
  const persistConfig = async (configToSave: FrontendConfigData, successMsg: string) => {
    try {
      setSaving(true)
      await frontendConfigService.updateConfig(configToSave)
      showToast('success', successMsg)
    } catch (err: any) {
      console.error('Failed to save config:', err)
      showToast('error', err.message || 'Lỗi khi lưu cấu hình!')
    } finally {
      setSaving(false)
    }
  }

  // ==========================================
  // LOGIC VIDEO SHOWCASE
  // ==========================================
  const handleAddVideo = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newUrl.trim()) {
      showToast('error', 'Vui lòng nhập tiêu đề và đường dẫn link video!')
      return
    }

    const newVideoItem: GuestVideoItem = {
      id: `v-${Date.now()}`,
      title: newTitle.trim(),
      url: newUrl.trim(),
      description: newDesc.trim() || undefined,
      order: (config.videos?.length || 0) + 1,
    }

    const updatedConfig = {
      ...config,
      videos: [...(config.videos || []), newVideoItem],
    }
    setConfig(updatedConfig)

    setNewTitle('')
    setNewUrl('')
    setNewDesc('')
    setPreviewVideoUrl('')
    persistConfig(updatedConfig, 'Đã thêm video thành công và lưu giao diện!')
  }

  // ===================== GITHUB-STYLE DELETE CONFIRMATION MODAL STATE =====================
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    type: 'video' | 'brand' | 'hero'
    id: string
    name: string
    inputValue: string
  }>({
    isOpen: false,
    type: 'video',
    id: '',
    name: '',
    inputValue: '',
  })

  // Open delete modal
  const requestDelete = (type: 'video' | 'brand' | 'hero', id: string, name: string) => {
    if (type === 'hero' && (config.heroImages?.length || 0) <= 8) {
      showToast('error', 'Trang chủ cần ít nhất 8 hình ảnh để hiển thị đầy đủ bố cục Desktop. Không thể xóa thêm!')
      return
    }

    setDeleteModal({
      isOpen: true,
      type,
      id,
      name,
      inputValue: '',
    })
  }

  // Confirm delete after typing exact name
  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    if (deleteModal.inputValue.trim() !== deleteModal.name.trim()) {
      showToast('error', 'Tên nhập vào chưa khớp, vui lòng kiểm tra lại!')
      return
    }

    const { type, id } = deleteModal
    setDeleteModal({ isOpen: false, type: 'video', id: '', name: '', inputValue: '' })

    if (type === 'video') {
      const updatedVideos = (config.videos || []).filter((v) => v.id !== id).map((v, idx) => ({ ...v, order: idx + 1 }))
      const updatedConfig = { ...config, videos: updatedVideos }
      setConfig(updatedConfig)
      await persistConfig(updatedConfig, 'Đã xóa video và cập nhật giao diện!')
    } else if (type === 'brand') {
      const updatedBrands = (config.brands || []).filter((b) => b.id !== id).map((b, idx) => ({ ...b, order: idx + 1 }))
      const updatedConfig = { ...config, brands: updatedBrands }
      setConfig(updatedConfig)
      await persistConfig(updatedConfig, 'Đã xóa thương hiệu đối tác!')
    } else if (type === 'hero') {
      const updatedList = (config.heroImages || []).filter((h) => h.id !== id).map((h, idx) => ({ ...h, order: idx + 1 }))
      const updatedConfig = { ...config, heroImages: updatedList }
      setConfig(updatedConfig)
      await persistConfig(updatedConfig, 'Đã xóa ảnh khỏi Collage Hero!')
    }
  }

  const handleUpdateVideo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingVideo) return
    const updatedVideos = (config.videos || []).map((v) =>
      v.id === editingVideo.id ? editingVideo : v
    )
    const updatedConfig = {
      ...config,
      videos: updatedVideos,
    }
    setConfig(updatedConfig)
    setEditingVideo(null)
    await persistConfig(updatedConfig, 'Đã cập nhật thông tin video!')
  }

  // Drag and drop video
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const updated = [...(config.videos || [])]
    const [draggedItem] = updated.splice(draggedIndex, 1)
    updated.splice(index, 0, draggedItem)

    const reordered = updated.map((item, idx) => ({
      ...item,
      order: idx + 1,
    }))

    setDraggedIndex(index)
    setConfig((prev) => ({
      ...prev,
      videos: reordered,
    }))
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    persistConfig(config, 'Đã cập nhật thứ tự hiển thị video!')
  }

  // ==========================================
  // LOGIC BRAND PARTNERS (HÌNH 2)
  // ==========================================
  const handleAddBrand = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBrandName.trim()) {
      showToast('error', 'Vui lòng nhập tên đối tác / thương hiệu!')
      return
    }

    const newBrandItem: BrandPartnerItem = {
      id: `b-${Date.now()}`,
      name: newBrandName.trim(),
      logoUrl: newBrandLogo.trim(),
      website: newBrandWebsite.trim() || undefined,
      order: (config.brands?.length || 0) + 1,
    }

    const updatedConfig = {
      ...config,
      brands: [...(config.brands || []), newBrandItem],
    }
    setConfig(updatedConfig)
    setNewBrandName('')
    setNewBrandLogo('')
    setNewBrandWebsite('')
    persistConfig(updatedConfig, 'Đã thêm thương hiệu đối tác mới!')
  }

  const handleUpdateBrand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingBrand) return
    const updatedBrands = (config.brands || []).map((b) =>
      b.id === editingBrand.id ? editingBrand : b
    )
    const updatedConfig = {
      ...config,
      brands: updatedBrands,
    }
    setConfig(updatedConfig)
    setEditingBrand(null)
    await persistConfig(updatedConfig, 'Đã cập nhật đối tác thành công!')
  }

  // ==========================================
  // LOGIC HERO COLLAGE IMAGES (HÌNH 1)
  // ==========================================
  const handleAddHeroImage = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newHeroTitle.trim() || !newHeroImgUrl.trim()) {
      showToast('error', 'Vui lòng nhập tên sự kiện và link ảnh collage!')
      return
    }

    const newItem: HeroImageItem = {
      id: `h-${Date.now()}`,
      title: newHeroTitle.trim(),
      image: newHeroImgUrl.trim(),
      order: (config.heroImages?.length || 0) + 1,
    }

    const updatedConfig = {
      ...config,
      heroImages: [...(config.heroImages || []), newItem],
    }
    setConfig(updatedConfig)
    setNewHeroTitle('')
    setNewHeroImgUrl('')
    persistConfig(updatedConfig, 'Đã thêm ảnh vào Collage Hero!')
  }

  const handleUpdateHeroImage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingHeroImage) return
    const updatedList = (config.heroImages || []).map((h) =>
      h.id === editingHeroImage.id ? editingHeroImage : h
    )
    const updatedConfig = {
      ...config,
      heroImages: updatedList,
    }
    setConfig(updatedConfig)
    setEditingHeroImage(null)
    await persistConfig(updatedConfig, 'Đã cập nhật ảnh Collage Hero!')
  }

  // ==========================================
  // LOGIC SECTIONS TOGGLE
  // ==========================================
  const handleToggleSection = async (sectionKey: keyof typeof config.sections) => {
    const updatedConfig = {
      ...config,
      sections: {
        ...config.sections,
        [sectionKey]: !config.sections[sectionKey],
      },
    }
    setConfig(updatedConfig)
    await persistConfig(updatedConfig, `Đã cập nhật trạng thái hiển thị của khối!`)
  }

  // Lưu tiêu đề động toàn cục
  const handleSaveTitles = async () => {
    await persistConfig(config, 'Đã lưu tiêu đề các khối giao diện!')
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 space-y-4">
        <RefreshCw className="w-10 h-10 text-orange-500 animate-spin" />
        <p className="text-sm font-bold text-slate-500">Đang tải cấu hình giao diện...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20">
      {/* Header & Quick Preview Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-orange-600">
            <LayoutTemplate className="w-4 h-4" />
            <span>Trung Tâm Tùy Biến Giao Diện (Frontend Customizer)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
            Quản Lý Bố Cục & Nội Dung Trang Khách
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Điều chỉnh Video Showcase, Ảnh Collage, Logo Đối tác và bật tắt các khối trên trang <code className="text-orange-600 font-bold">/guest</code>.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/guest"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-bold text-xs hover:border-orange-500 transition-all shadow-xs"
          >
            <Eye className="w-4 h-4 text-orange-500" />
            <span>Xem trang /guest</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </div>

      {/* TABS NAVIGATION BAR */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('video')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'video'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Thước Phim / Video ({config.videos?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('brands')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'brands'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Đối Tác & Thương Hiệu ({config.brands?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('hero')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'hero'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Ảnh Collage ({config.heroImages?.length || 0})</span>
        </button>

        <button
          onClick={() => setActiveTab('sections')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'sections'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Bật / Tắt Khối Section</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: THƯỚC PHIM / VIDEO SHOWCASE                                       */}
      {/* ========================================================================= */}
      {activeTab === 'video' && (
        <div className="space-y-8">
          {/* Card Chỉnh Sửa Tiêu Đề & Phụ Đề của Khối Video */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-orange-500" />
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Chỉnh Sửa Tiêu Đề Khối Thước Phim Video
                </h2>
              </div>
              <button
                onClick={handleSaveTitles}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu tiêu đề</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Nhãn huy hiệu (Badge)
                </label>
                <input
                  type="text"
                  value={config.videoShowcaseBadge || ''}
                  onChange={(e) => setConfig({ ...config, videoShowcaseBadge: e.target.value })}
                  placeholder="VD: Thước Phim Sự Kiện"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Tiêu đề chính (Title)
                </label>
                <input
                  type="text"
                  value={config.videoShowcaseTitle || ''}
                  onChange={(e) => setConfig({ ...config, videoShowcaseTitle: e.target.value })}
                  placeholder="VD: Sôi Động & Sáng Tạo Tại FPT Education"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Mô tả ngắn (Subtitle)
                </label>
                <input
                  type="text"
                  value={config.videoShowcaseSubtitle || ''}
                  onChange={(e) => setConfig({ ...config, videoShowcaseSubtitle: e.target.value })}
                  placeholder="VD: Cảm nhận năng lượng nhiệt huyết từ các chương trình..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Cột trái: Form thêm video mới & Hỗ trợ đa nền tảng */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <Plus className="w-4 h-4 text-orange-500" />
                    <span>Gắn Link Video Mới</span>
                  </h2>
                </div>

                <form onSubmit={handleAddVideo} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tiêu đề video <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="VD: Teaser Ngày Hội FPT Edu Camp 2026..."
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Đường dẫn Link Video <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={newUrl}
                      onChange={(e) => {
                        setNewUrl(e.target.value)
                        setPreviewVideoUrl(e.target.value)
                      }}
                      placeholder="YouTube, Shorts, TikTok, Instagram Reel, Vimeo, MP4..."
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      required
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">YouTube</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">YT Shorts</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200">TikTok</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300">Instagram Reel</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Vimeo / MP4</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Mô tả ngắn (tùy chọn)
                    </label>
                    <textarea
                      rows={2}
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder="Khám phá chuỗi hoạt động bùng nổ của sinh viên..."
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                    />
                  </div>

                  {/* Preview Player */}
                  {previewVideoUrl && (
                    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-black aspect-video relative">
                      {getEmbedUrl(previewVideoUrl).isDirect ? (
                        <video src={getEmbedUrl(previewVideoUrl).embedUrl} controls className="w-full h-full object-contain" />
                      ) : (
                        <iframe
                          src={getEmbedUrl(previewVideoUrl).embedUrl}
                          title="Preview"
                          className="w-full h-full border-0"
                          allowFullScreen
                        />
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:bg-orange-600 dark:hover:bg-orange-500 font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm vào danh sách</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Cột phải: Danh sách Video với CRUD đầy đủ & Kéo thả sắp xếp */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Video className="w-4 h-4 text-orange-500" />
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Danh Sách Video ({config.videos?.length || 0})
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    Bấm giữ biểu tượng <GripVertical className="inline w-3 h-3 text-slate-400" /> để kéo thả
                  </span>
                </div>

                {(!config.videos || config.videos.length === 0) ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                    <Video className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                    <p className="text-xs font-bold text-slate-500">Chưa có video nào trong danh sách.</p>
                    <p className="text-[11px] text-slate-400 max-w-xs">
                      Khi danh sách trống, khu vực Video Showcase trên trang <code className="text-orange-500">/guest</code> sẽ tự động ẩn đi hoàn toàn.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {config.videos.map((vid, idx) => (
                      <div
                        key={vid.id}
                        draggable
                        onDragStart={() => handleDragStart(idx)}
                        onDragOver={(e) => handleDragOver(e, idx)}
                        onDragEnd={handleDragEnd}
                        className="group flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-orange-500/50 transition-all cursor-move"
                      >
                        <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="w-6 h-6 rounded-lg bg-orange-100 dark:bg-orange-950/60 text-orange-600 font-extrabold text-xs flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {vid.title}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate font-mono">
                            {vid.url}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setEditingVideo(vid)}
                            title="Chỉnh sửa video"
                            className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => requestDelete('video', vid.id, vid.title)}
                            title="Xóa video"
                            className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ĐỐI TÁC & THƯƠNG HIỆU (BRAND PARTNERS MARQUEE CAROUSEL - HÌNH 2)   */}
      {/* ========================================================================= */}
      {activeTab === 'brands' && (
        <div className="space-y-8">
          {/* Card Chỉnh Sửa Tiêu Đề của Khối Đối Tác */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="w-5 h-5 text-orange-500" />
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Tiêu Đề Khối Đối Tác & Thương Hiệu
                </h2>
              </div>
              <button
                onClick={handleSaveTitles}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu tiêu đề</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Tiêu đề chính
                </label>
                <input
                  type="text"
                  value={config.brandSectionTitle || ''}
                  onChange={(e) => setConfig({ ...config, brandSectionTitle: e.target.value })}
                  placeholder="VD: Được tin tưởng và đánh giá cao bởi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1.5">
                  Phụ đề số lượng
                </label>
                <input
                  type="text"
                  value={config.brandSectionSubtitle || ''}
                  onChange={(e) => setConfig({ ...config, brandSectionSubtitle: e.target.value })}
                  placeholder="VD: 300+ đối tác, doanh nghiệp & tổ chức câu lạc bộ"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Cột trái: Thêm Brand Mới (Lấn sang trái, thu hẹp lại col-span-4) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-orange-500" />
                  <span>Thêm Thương Hiệu / Khách Hàng Mới</span>
                </h2>

                <form onSubmit={handleAddBrand} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tên thương hiệu <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newBrandName}
                      onChange={(e) => setNewBrandName(e.target.value)}
                      placeholder="VD: TPBank, MoMo, Viettel..."
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Link ảnh Logo (PNG trong suốt hoặc SVG)
                    </label>
                    <input
                      type="url"
                      value={newBrandLogo}
                      onChange={(e) => setNewBrandLogo(e.target.value)}
                      placeholder="https://.../logo.png"
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Website liên kết (tùy chọn)
                    </label>
                    <input
                      type="url"
                      value={newBrandWebsite}
                      onChange={(e) => setNewBrandWebsite(e.target.value)}
                      placeholder="https://tpb.vn"
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>

                  {newBrandLogo && (
                    <div className="p-3 rounded-2xl bg-[#1b1744] flex items-center justify-center">
                      <img src={newBrandLogo} alt="Preview" className="h-8 max-w-[140px] object-contain brightness-100" />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:bg-orange-600 dark:hover:bg-orange-500 font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Đối Tác</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Cột phải: Danh sách Brands với 3 cột dọc (col-span-8) */}
            <div className="lg:col-span-8 space-y-4">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-orange-500" />
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Danh Sách Đối Tác ({config.brands?.length || 0})
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    Chạy 2 hàng chuyển động ngược chiều nhau vô tận
                  </span>
                </div>

                {(!config.brands || config.brands.length === 0) ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6">
                    <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-700" />
                    <p className="text-xs font-bold text-slate-500">Chưa có thương hiệu nào.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[560px] overflow-y-auto pr-1">
                    {config.brands.map((brand, idx) => (
                      <div
                        key={brand.id}
                        className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {brand.logoUrl ? (
                            <img
                              src={brand.logoUrl}
                              alt={brand.name}
                              className="w-7 h-7 object-contain rounded bg-white p-0.5"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-7 h-7 rounded bg-orange-100 text-orange-600 font-extrabold text-xs flex items-center justify-center">
                              {brand.name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {brand.name}
                            </p>
                            {brand.website && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {brand.website}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => setEditingBrand(brand)}
                            title="Sửa đối tác"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => requestDelete('brand', brand.id, brand.name)}
                            title="Xóa đối tác"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ẢNH COLLAGE TRANG KHÁCH (HÌNH 1)                                   */}
      {/* ========================================================================= */}
      {activeTab === 'hero' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Cột trái: Thêm ảnh mới vào Collage */}
            <div className="lg:col-span-5 space-y-6">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-orange-500" />
                  <span>Thêm Ảnh Vào Collage (Hình 1)</span>
                </h2>

                <form onSubmit={handleAddHeroImage} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Tên sự kiện / chú thích ảnh <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newHeroTitle}
                      onChange={(e) => setNewHeroTitle(e.target.value)}
                      placeholder="VD: FPT Tech Hackathon 2026..."
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Link URL hình ảnh <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="url"
                      value={newHeroImgUrl}
                      onChange={(e) => setNewHeroImgUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/photo-..."
                      className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      required
                    />
                  </div>

                  {newHeroImgUrl && (
                    <div className="rounded-2xl overflow-hidden aspect-video relative border border-slate-200 dark:border-slate-800">
                      <img src={newHeroImgUrl} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 rounded-2xl bg-slate-950 dark:bg-white text-white dark:text-slate-950 hover:bg-orange-600 dark:hover:bg-orange-500 font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Thêm Ảnh Collage</span>
                  </button>
                </form>
              </div>
            </div>

            {/* Cột phải: Danh sách ảnh Collage với CRUD */}
            <div className="lg:col-span-7 space-y-4">
              <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-orange-500" />
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      Danh Sách Ảnh Collage ({config.heroImages?.length || 0})
                    </h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    Phân bổ ôm đều 2 cánh màn hình laptop
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-1">
                  {(config.heroImages || []).map((img, idx) => (
                    <div
                      key={img.id}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40"
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-100">
                        <img src={img.image} alt={img.title} className="w-full h-full object-cover" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {img.title}
                        </p>
                        <p className="text-[10px] text-slate-400">Vị trí: #{idx + 1}</p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => setEditingHeroImage(img)}
                          title="Sửa ảnh"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => requestDelete('hero', img.id, img.title)}
                          disabled={(config.heroImages?.length || 0) <= 8}
                          title={(config.heroImages?.length || 0) <= 8 ? 'Cần tối thiểu 8 ảnh để hiển thị đầy đủ bố cục Desktop. Nút xóa bị khóa.' : 'Xóa ảnh'}
                          className={`p-1.5 rounded-lg transition-colors ${
                            (config.heroImages?.length || 0) <= 8
                              ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                              : 'text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 cursor-pointer'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: BẬT / TẮT CÁC KHỐI SECTION TRÊN TRANG GUEST                         */}
      {/* ========================================================================= */}
      {activeTab === 'sections' && (
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-orange-500" />
                <span>Bật / Tắt Các Khối Section Trang /guest</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Admin có thể chủ động ẩn hoặc hiển thị từng khu vực trên trang khách theo kế hoạch truyền thông.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* Thước phim / Video Showcase */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Thước phim / Video Showcase
                  </p>
                  <p className="text-xs text-slate-400">
                    Khu vực video giới thiệu hoạt động & clip nổi bật
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('videos')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.videos !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.videos !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Đối tác & Thương hiệu */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Đối tác & Thương hiệu (Brand Marquee)
                  </p>
                  <p className="text-xs text-slate-400">
                    Khối 2 hàng logo đối tác chuyển động vô tận mượt mà (Hình 2)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('brands')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.brands !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.brands !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Hero Section */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Hero Section (Tiêu đề & Collage ảnh)
                  </p>
                  <p className="text-xs text-slate-400">Phần mở đầu trang khách</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('hero')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.hero !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.hero !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Hoạt động & Sự kiện nổi bật */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Hoạt động & Sự kiện nổi bật
                  </p>
                  <p className="text-xs text-slate-400">Băng chuyền carousel sự kiện</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('events')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.events !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.events !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Số liệu thống kê */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Số liệu thống kê (Stats)
                  </p>
                  <p className="text-xs text-slate-400">Đếm số lượng sự kiện, sinh viên</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('stats')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.stats !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.stats !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Tính năng & Lợi ích */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Tính năng & Lợi ích hệ thống
                  </p>
                  <p className="text-xs text-slate-400">Các khối giới thiệu tính năng</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('features')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.features !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.features !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between py-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    Footer Trang Khách
                  </p>
                  <p className="text-xs text-slate-400">Chân trang kèm hiệu ứng sao</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSection('footer')}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.sections?.footer !== false ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.sections?.footer !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT VIDEO                                                          */}
      {/* ========================================================================= */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-500" />
                <span>Chỉnh Sửa Video</span>
              </h3>
              <button
                onClick={() => setEditingVideo(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateVideo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tiêu đề video
                </label>
                <input
                  type="text"
                  value={editingVideo.title}
                  onChange={(e) => setEditingVideo({ ...editingVideo, title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Đường dẫn Link Video
                </label>
                <input
                  type="url"
                  value={editingVideo.url}
                  onChange={(e) => setEditingVideo({ ...editingVideo, url: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Mô tả ngắn
                </label>
                <textarea
                  rows={3}
                  value={editingVideo.description || ''}
                  onChange={(e) => setEditingVideo({ ...editingVideo, description: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingVideo(null)}
                  className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Cập nhật</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT BRAND                                                          */}
      {/* ========================================================================= */}
      {editingBrand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-500" />
                <span>Chỉnh Sửa Đối Tác & Thương Hiệu</span>
              </h3>
              <button
                onClick={() => setEditingBrand(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateBrand} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên thương hiệu
                </label>
                <input
                  type="text"
                  value={editingBrand.name}
                  onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Link Logo URL
                </label>
                <input
                  type="url"
                  value={editingBrand.logoUrl}
                  onChange={(e) => setEditingBrand({ ...editingBrand, logoUrl: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Website liên kết
                </label>
                <input
                  type="url"
                  value={editingBrand.website || ''}
                  onChange={(e) => setEditingBrand({ ...editingBrand, website: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingBrand(null)}
                  className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Cập nhật</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL EDIT HERO IMAGE                                                     */}
      {/* ========================================================================= */}
      {editingHeroImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-orange-500" />
                <span>Chỉnh Sửa Ảnh Collage</span>
              </h3>
              <button
                onClick={() => setEditingHeroImage(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateHeroImage} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Tên sự kiện / chú thích ảnh
                </label>
                <input
                  type="text"
                  value={editingHeroImage.title}
                  onChange={(e) => setEditingHeroImage({ ...editingHeroImage, title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Link URL hình ảnh
                </label>
                <input
                  type="url"
                  value={editingHeroImage.image}
                  onChange={(e) => setEditingHeroImage({ ...editingHeroImage, image: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  required
                />
              </div>

              {editingHeroImage.image && (
                <div className="rounded-2xl overflow-hidden aspect-video relative border border-slate-200 dark:border-slate-800">
                  <img src={editingHeroImage.image} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingHeroImage(null)}
                  className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-xs shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Cập nhật</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ========================================================================= */}
      {/* MODAL CONFIRM DELETE (GITHUB REPO STYLE: PHẢI NHẬP ĐÚNG TÊN ĐỂ XÁC NHẬN) */}
      {/* ========================================================================= */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-red-200 dark:border-red-950/60 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Xác nhận xóa vĩnh viễn
                </h3>
              </div>
              <button
                onClick={() => setDeleteModal({ isOpen: false, type: 'video', id: '', name: '', inputValue: '' })}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Hành động này <strong className="text-red-600 font-bold">không thể hoàn tác</strong>. Thao tác này sẽ gỡ bỏ mục này ngay lập tức khỏi giao diện trang khách <code className="text-orange-500 font-bold">/guest</code>.
              </p>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-1">
                <p className="text-[11px] font-bold text-slate-500">
                  Để xác nhận, vui lòng nhập chính xác tên dưới đây:
                </p>
                <p className="text-xs font-mono font-black text-slate-900 dark:text-white select-all break-all bg-white dark:bg-slate-900 p-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  {deleteModal.name}
                </p>
              </div>

              <form onSubmit={handleConfirmDelete} className="space-y-4 pt-1">
                <input
                  type="text"
                  value={deleteModal.inputValue}
                  onChange={(e) => setDeleteModal({ ...deleteModal, inputValue: e.target.value })}
                  placeholder="Nhập chính xác tên ở trên vào đây..."
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeleteModal({ isOpen: false, type: 'video', id: '', name: '', inputValue: '' })}
                    className="px-5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    disabled={deleteModal.inputValue.trim() !== deleteModal.name.trim() || saving}
                    className="px-6 py-2.5 rounded-2xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Tôi hiểu, xóa mục này</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
