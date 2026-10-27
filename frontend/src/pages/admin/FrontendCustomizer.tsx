import React, { useState, useEffect, useMemo } from 'react'
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
  Check,
  BookOpen,
  FileDown,
  RotateCcw,
  Play,
  Pencil,
  Search
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
import {
  GuideDocItem,
  DEFAULT_GUIDE_DOCS,
  STORAGE_KEY as DOCS_STORAGE_KEY,
  parseVideoUrl
} from '../../components/FemsDocsManager'

export default function FrontendCustomizer() {
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'video' | 'brands' | 'hero' | 'sections' | 'docs'>('video')

  // ===================== FEMS GUIDE DOCS & VIDEOS STATE =====================
  const [guideDocs, setGuideDocs] = useState<GuideDocItem[]>(() => {
    try {
      const saved = localStorage.getItem(DOCS_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
    } catch (e) {
      console.error(e)
    }
    return DEFAULT_GUIDE_DOCS
  })

  const [docSearchKeyword, setDocSearchKeyword] = useState('')
  const [docSelectedCategory, setDocSelectedCategory] = useState('ALL')
  const [isDocModalOpen, setIsDocModalOpen] = useState(false)
  const [editingGuideDoc, setEditingGuideDoc] = useState<GuideDocItem | null>(null)

  const [docFormData, setDocFormData] = useState({
    title: '',
    category: 'Sinh viên & Khán giả',
    content: '',
    videoUrl: '',
    documentUrl: '',
    documentName: '',
    order: 1
  })

  const saveGuideDocsToStorage = (newDocs: GuideDocItem[]) => {
    try {
      localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(newDocs))
      window.dispatchEvent(new Event('storage'))
    } catch (err) {
      console.error(err)
    }
    setGuideDocs(newDocs)
  }

  const handleOpenCreateDocModal = () => {
    setEditingGuideDoc(null)
    setDocFormData({
      title: '',
      category: 'Sinh viên & Khán giả',
      content: '',
      videoUrl: '',
      documentUrl: '',
      documentName: '',
      order: guideDocs.length + 1
    })
    setIsDocModalOpen(true)
  }

  const handleOpenEditDocModal = (doc: GuideDocItem) => {
    setEditingGuideDoc(doc)
    setDocFormData({
      title: doc.title,
      category: doc.category || 'Sinh viên & Khán giả',
      content: doc.content,
      videoUrl: doc.videoUrl || '',
      documentUrl: doc.documentUrl || '',
      documentName: doc.documentName || '',
      order: doc.order || 1
    })
    setIsDocModalOpen(true)
  }

  const handleDeleteGuideDoc = (id: string, title: string) => {
    const ok = window.confirm(`Bạn có chắc muốn xóa mục hướng dẫn: "${title}"?`)
    if (!ok) return
    const updated = guideDocs.filter(d => d.id !== id)
    saveGuideDocsToStorage(updated)
    showToast('success', `Đã xóa thành công mục: "${title}"`)
  }

  const handleResetGuideDocs = () => {
    const ok = window.confirm('Khôi phục danh sách tài liệu & hướng dẫn về dữ liệu mẫu chuẩn FEMS?')
    if (!ok) return
    saveGuideDocsToStorage(DEFAULT_GUIDE_DOCS)
    showToast('info', 'Đã khôi phục tài liệu hướng dẫn về mặc định!')
  }

  const handleSubmitDocForm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!docFormData.title.trim()) {
      showToast('error', 'Vui lòng nhập tiêu đề cho hướng dẫn!')
      return
    }
    if (!docFormData.content.trim()) {
      showToast('error', 'Vui lòng nhập nội dung chi tiết!')
      return
    }

    if (editingGuideDoc) {
      const updated = guideDocs.map(d => {
        if (d.id === editingGuideDoc.id) {
          return {
            ...d,
            title: docFormData.title.trim(),
            category: docFormData.category.trim(),
            content: docFormData.content.trim(),
            videoUrl: docFormData.videoUrl.trim(),
            documentUrl: docFormData.documentUrl.trim(),
            documentName: docFormData.documentName.trim(),
            order: Number(docFormData.order) || 1,
            updatedAt: new Date().toLocaleDateString('vi-VN')
          }
        }
        return d
      })
      saveGuideDocsToStorage(updated)
      showToast('success', `Đã cập nhật mục "${docFormData.title}" thành công!`)
    } else {
      const newItem: GuideDocItem = {
        id: `doc-${Date.now()}`,
        title: docFormData.title.trim(),
        category: docFormData.category.trim(),
        content: docFormData.content.trim(),
        videoUrl: docFormData.videoUrl.trim(),
        documentUrl: docFormData.documentUrl.trim(),
        documentName: docFormData.documentName.trim(),
        order: Number(docFormData.order) || guideDocs.length + 1,
        updatedAt: new Date().toLocaleDateString('vi-VN')
      }
      saveGuideDocsToStorage([...guideDocs, newItem])
      showToast('success', `Đã thêm mới mục "${docFormData.title}" thành công!`)
    }

    setIsDocModalOpen(false)
  }

  const docModalVideoPreview = useMemo(() => {
    return parseVideoUrl(docFormData.videoUrl)
  }, [docFormData.videoUrl])

  const docCategories = useMemo(() => {
    const set = new Set<string>()
    guideDocs.forEach(d => {
      if (d.category) set.add(d.category)
    })
    return ['ALL', ...Array.from(set)]
  }, [guideDocs])

  const filteredGuideDocs = useMemo(() => {
    return (guideDocs || [])
      .filter(d => {
        if (!d) return false
        const matchesCategory =
          docSelectedCategory === 'ALL' || d.category === docSelectedCategory
        const kw = docSearchKeyword.trim().toLowerCase()
        const matchesSearch =
          !kw ||
          (d.title || '').toLowerCase().includes(kw) ||
          (d.content || '').toLowerCase().includes(kw) ||
          (d.category || '').toLowerCase().includes(kw)
        return matchesCategory && matchesSearch
      })
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
  }, [guideDocs, docSelectedCategory, docSearchKeyword])

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

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <a
            href="/guest"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-bold text-xs hover:border-orange-500 transition-all shadow-xs"
          >
            <Eye className="w-4 h-4 text-orange-500" />
            <span>Xem trang /guest</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>

          <a
            href="/terms-and-policies?tab=docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-orange-200 dark:border-slate-800 bg-orange-50/50 dark:bg-slate-800 text-orange-600 dark:text-orange-400 font-bold text-xs hover:border-orange-500 transition-all shadow-xs"
          >
            <BookOpen className="w-4 h-4 text-orange-500" />
            <span>Xem trang Tài Liệu & Video</span>
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

        <button
          onClick={() => setActiveTab('docs')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all whitespace-nowrap cursor-pointer ${
            activeTab === 'docs'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Tài Liệu & Video Hướng Dẫn ({guideDocs.length})</span>
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
      {/* TAB 5: TÀI LIỆU & VIDEO HƯỚNG DẪN FEMS (DOCS CRUD & VIDEO EMBED)           */}
      {/* ========================================================================= */}
      {activeTab === 'docs' && (
        <div className="space-y-6">
          {/* Header Card của Tab Tài liệu & Video */}
          <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-black text-slate-900 dark:text-white">
                  Quản Lý Tài Liệu & Video Hướng Dẫn FEMS
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 dark:bg-orange-950 text-orange-600 dark:text-orange-400">
                  {guideDocs.length} mục
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 space-y-0.5 pt-0.5 leading-relaxed">
                <p>
                  Toàn bộ dữ liệu tại đây sẽ tự động hiển thị trên trang công khai <code className="text-orange-600 font-bold">/terms-and-policies?tab=docs</code>.
                </p>
                <p>
                  Bạn có thể chèn link video YouTube/MP4 và đính kèm link tải tài liệu biểu mẫu.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:items-end gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenCreateDocModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition-all cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm hướng dẫn mới</span>
              </button>

              <a
                href="/terms-and-policies?tab=docs"
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl border border-orange-200 dark:border-slate-800 bg-orange-50/50 dark:bg-slate-800 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-orange-100 dark:hover:bg-slate-750 transition-all shadow-2xs"
                title="Mở xem trang tài liệu công khai trong tab mới"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem trang công khai</span>
                <ExternalLink className="w-3 h-3 text-slate-400" />
              </a>
            </div>
          </div>

          {/* Bộ lọc & Tìm kiếm nhanh */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              {docCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setDocSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                    docSelectedCategory === cat
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-orange-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'Tất cả chủ đề' : cat}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Tìm tiêu đề, nội dung hướng dẫn..."
                value={docSearchKeyword}
                onChange={e => setDocSearchKeyword(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          {/* Danh sách thẻ hướng dẫn hiển thị quản trị */}
          {filteredGuideDocs.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-950/40">
              <HelpCircle className="w-10 h-10 text-slate-400 mx-auto mb-3 opacity-60" />
              <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                Không tìm thấy mục hướng dẫn nào
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                {docSearchKeyword ? `Không có kết quả khớp với "${docSearchKeyword}".` : 'Chưa có tài liệu nào trong danh mục này.'}
              </p>
              <button
                type="button"
                onClick={handleOpenCreateDocModal}
                className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm hướng dẫn ngay
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredGuideDocs.map((item) => {
                const parsedVideo = parseVideoUrl(item.videoUrl)
                return (
                  <div
                    key={item.id}
                    className="p-5 sm:p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 hover:border-orange-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1.5 flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-6 h-6 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-xs font-black shrink-0">
                              #{item.order}
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border border-orange-200/60 dark:border-orange-900/40">
                              {item.category || 'Chung'}
                            </span>
                            {parsedVideo.type && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 flex items-center gap-1">
                                <Video className="w-3 h-3" />
                                {parsedVideo.type === 'youtube' ? 'YouTube Video' : 'Direct Video'}
                              </span>
                            )}
                            {item.documentUrl && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/40 flex items-center gap-1">
                                <FileDown className="w-3 h-3" />
                                Tài liệu đính kèm
                              </span>
                            )}
                            {item.updatedAt && (
                              <span className="text-[11px] text-slate-400">
                                Cập nhật: {item.updatedAt}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                            {item.title}
                          </h3>
                        </div>

                        {/* Nút Sửa / Xóa */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditDocModal(item)}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-orange-600 hover:border-orange-400 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          >
                            <Pencil className="w-3.5 h-3.5 text-orange-500" />
                            <span>Sửa</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteGuideDoc(item.id, item.title)}
                            className="px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line font-medium">
                        {item.content}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {/* Preview video nếu có - Bỏ max-w-md để vừa khít 100% cột thẻ */}
                      {parsedVideo.type && (
                        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                            <span className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
                              <Video className="w-4 h-4" /> Link Video đã nhúng:
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-xs">{item.videoUrl}</span>
                          </div>
                          {parsedVideo.type === 'youtube' ? (
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-sm border border-slate-300 dark:border-slate-700 bg-black">
                              <iframe
                                src={parsedVideo.embedUrl}
                                title={item.title}
                                allowFullScreen
                                className="absolute inset-0 w-full h-full border-0"
                              />
                            </div>
                          ) : parsedVideo.type === 'direct' ? (
                            <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-sm border border-slate-300 dark:border-slate-700 bg-black">
                              <video src={parsedVideo.embedUrl} controls className="w-full h-full object-contain" />
                            </div>
                          ) : (
                            <a
                              href={parsedVideo.embedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-orange-600 font-bold hover:underline"
                            >
                              <Play className="w-3.5 h-3.5" /> Mở liên kết video
                            </a>
                          )}
                        </div>
                      )}

                      {/* Hiển thị link file đính kèm nếu có */}
                      {item.documentUrl && (
                        <div className="flex items-center gap-2 text-xs pt-1">
                          <span className="font-bold text-slate-500 shrink-0">File biểu mẫu:</span>
                          <a
                            href={item.documentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 font-bold hover:underline truncate"
                          >
                            <FileDown className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{item.documentName || item.documentUrl}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL THÊM / SỬA TÀI LIỆU & VIDEO HƯỚNG DẪN FEMS (DOCS CRUD)               */}
      {/* ========================================================================= */}
      {isDocModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
              <div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-orange-500" />
                  {editingGuideDoc ? 'Chỉnh sửa tài liệu / video hướng dẫn' : 'Thêm tài liệu / video hướng dẫn mới'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Dữ liệu lưu vào hệ thống và hiển thị trực tiếp tại trang /terms-and-policies?tab=docs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDocModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitDocForm} className="space-y-4">
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
                    value={docFormData.title}
                    onChange={e => setDocFormData({ ...docFormData, title: e.target.value })}
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
                    value={docFormData.category}
                    onChange={e => setDocFormData({ ...docFormData, category: e.target.value })}
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
                  placeholder="Nhập nội dung các bước thực hiện, quy trình, lưu ý quan trọng cho sinh viên hoặc ban tổ chức..."
                  value={docFormData.content}
                  onChange={e => setDocFormData({ ...docFormData, content: e.target.value })}
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
                  value={docFormData.videoUrl}
                  onChange={e => setDocFormData({ ...docFormData, videoUrl: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  💡 Nhập link YouTube (dạng chuẩn, rút gọn `youtu.be` hoặc `shorts`) để hệ thống tự động nhúng khung phát video HD.
                </p>

                {/* Live Preview Video ngay trong modal */}
                {docModalVideoPreview.type === 'youtube' && (
                  <div className="mt-3">
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                      ✓ Đã nhận diện YouTube video - Xem trước:
                    </span>
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-inner border border-slate-300 dark:border-slate-700 bg-black">
                      <iframe
                        src={docModalVideoPreview.embedUrl}
                        title="Video Preview"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full border-0"
                      />
                    </div>
                  </div>
                )}
                {docModalVideoPreview.type === 'direct' && (
                  <div className="mt-3">
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1">
                      ✓ Đã nhận diện file Video trực tiếp:
                    </span>
                    <div className="relative w-full aspect-video rounded-xl overflow-hidden shadow-inner border border-slate-300 dark:border-slate-700 bg-black">
                      <video src={docModalVideoPreview.embedUrl} controls className="w-full h-full object-contain" />
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
                    value={docFormData.documentUrl}
                    onChange={e => setDocFormData({ ...docFormData, documentUrl: e.target.value })}
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
                    value={docFormData.documentName}
                    onChange={e => setDocFormData({ ...docFormData, documentName: e.target.value })}
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
                  value={docFormData.order}
                  onChange={e => setDocFormData({ ...docFormData, order: Number(e.target.value) || 1 })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Nút hành động */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDocModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl text-sm font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-md shadow-orange-500/25 transition-all cursor-pointer active:scale-95"
                >
                  {editingGuideDoc ? 'Lưu thay đổi' : 'Thêm mới hướng dẫn'}
                </button>
              </div>
            </form>
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
