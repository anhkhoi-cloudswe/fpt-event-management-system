import { useState, useEffect } from 'react'
import GA4AnalyticsDashboard from '../components/analytics/GA4AnalyticsDashboard'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { UserPlus, Edit, Trash2, Search, Filter, Users, ShieldAlert, Award, Image as ImageIcon, Plus, X, Upload, DollarSign, Building2 } from 'lucide-react'
import ConfirmModal from '../components/common/ConfirmModal'
import UserFormModal from '../components/admin/UserFormModal'
import SpeakerFormModal from '../components/admin/SpeakerFormModal'
import type { CreateUserRequest, UpdateUserRequest } from '../types/user'
import { uploadEventBanner } from '../utils/imageUpload'

type ActiveTab = 'STUDENT' | 'SPEAKER' | 'INTERNAL' | 'BANNER' | 'ORGANIZATION' | 'ANALYTICS'

export default function AdminDashboard() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // Tab State
  const [activeTab, setActiveTab] = useState<ActiveTab>('STUDENT')

  // Data States
  const [students, setStudents] = useState<any[]>([])
  const [speakers, setSpeakers] = useState<any[]>([])
  const [internalUsers, setInternalUsers] = useState<any[]>([])
  const [sampleBanners, setSampleBanners] = useState<any[]>([])
  const [organizations, setOrganizations] = useState<any[]>([])
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Banner Modal state
  const [isBannerModalOpen, setIsBannerModalOpen] = useState(false)
  const [bannerTitle, setBannerTitle] = useState('')
  const [bannerCategory, setBannerCategory] = useState('')
  const [newBannerFile, setNewBannerFile] = useState<File | null>(null)
  const [newBannerPreview, setNewBannerPreview] = useState('')
  const [isUploadingBanner, setIsUploadingBanner] = useState(false)

  // Modals for Internal Users
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [userFormMode, setUserFormMode] = useState<'create' | 'edit'>('create')
  const [selectedUser, setSelectedUser] = useState<any | null>(null)

  // Modals for Speakers
  const [isSpeakerModalOpen, setIsSpeakerModalOpen] = useState(false)
  const [speakerFormMode, setSpeakerFormMode] = useState<'create' | 'edit'>('create')
  const [selectedSpeaker, setSelectedSpeaker] = useState<any | null>(null)

  // Modals for Organization
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false)
  const [orgFormMode, setOrgFormMode] = useState<'create' | 'edit'>('create')
  const [selectedOrg, setSelectedOrg] = useState<any | null>(null)
  const [orgFormData, setOrgFormData] = useState({
    orgCode: '',
    orgName: '',
    orgType: 'CLUB',
    campusCode: 'HCM',
    description: '',
    status: 'ACTIVE'
  })

  // Confirmation Modal
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)
  const [confirmType, setConfirmType] = useState<'danger' | 'warning' | 'info'>('warning')

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'ORGANIZER' | 'STAFF'>('ALL')
  const [campusFilter, setCampusFilter] = useState<string>('ALL')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Fetch Users List from Auth Service
      const usersResponse = await fetch('/api/users/staff-organizer', {
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      })

      let studentList: any[] = []
      let internalList: any[] = []

      if (usersResponse.ok) {
        const data = await usersResponse.json()

        const normalizeUser = (item: any, role: string) => ({
          userId: item.id,
          username: item.username || (item.email ? String(item.email).split('@')[0] : `user${item.id}`),
          fullName: item.fullName || '',
          email: item.email || '',
          phone: item.phone || '',
          role: role,
          status: item.status ? String(item.status).toUpperCase() : 'ACTIVE',
          createdAt: item.createdAt || new Date().toISOString()
        })

        if (data && (data.staffList || data.organizerList || data.adminList || data.studentList)) {
          const staff = Array.isArray(data.staffList) ? data.staffList : []
          const organizers = Array.isArray(data.organizerList) ? data.organizerList : []
          const admins = Array.isArray(data.adminList) ? data.adminList : []
          const stdList = Array.isArray(data.studentList) ? data.studentList : []

          studentList = stdList.map((s: any) => normalizeUser(s, 'STUDENT'))
          internalList = [
            ...admins.map((a: any) => normalizeUser(a, 'ADMIN')),
            ...organizers.map((o: any) => normalizeUser(o, 'ORGANIZER')),
            ...staff.map((s: any) => normalizeUser(s, 'STAFF'))
          ]
        }
      } else {
        throw new Error('Không thể lấy danh sách người dùng từ hệ thống')
      }

      // 2. Fetch Speakers List from Event Service
      let speakerList: any[] = []
      try {
        const speakersResponse = await fetch('/api/v1/admin/speakers')
        if (speakersResponse.ok) {
          speakerList = await speakersResponse.json()
        }
      } catch (e) {
        console.warn('Could not fetch speakers:', e)
      }

      // 3. Fetch Sample Banners from Event Service
      let bannerList: any[] = []
      try {
        const bannersResponse = await fetch('/api/sample-banners')
        if (bannersResponse.ok) {
          bannerList = await bannersResponse.json()
        }
      } catch (e) {
        console.warn('Could not fetch sample banners:', e)
      }

      // 4. Fetch Organizations List from Auth Service
      let orgList: any[] = []
      try {
        const orgsResponse = await fetch('/api/organizations')
        if (orgsResponse.ok) {
          orgList = await orgsResponse.json()
        }
      } catch (e) {
        console.warn('Could not fetch organizations:', e)
      }

      setStudents(studentList)
      setInternalUsers(internalList)
      setSpeakers(Array.isArray(speakerList) ? speakerList : [])
      setSampleBanners(Array.isArray(bannerList) ? bannerList : [])
      setOrganizations(Array.isArray(orgList) ? orgList : [])
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message || 'Lỗi tải dữ liệu người dùng')
    } finally {
      setLoading(false)
    }
  }

  // --- ORGANIZATION ACTIONS ---
  const handleOpenCreateOrg = () => {
    setOrgFormMode('create')
    setSelectedOrg(null)
    setOrgFormData({
      orgCode: '',
      orgName: '',
      orgType: 'CLUB',
      campusCode: 'HCM',
      description: '',
      status: 'ACTIVE'
    })
    setIsOrgModalOpen(true)
  }

  const handleOpenEditOrg = (org: any) => {
    setOrgFormMode('edit')
    setSelectedOrg(org)
    setOrgFormData({
      orgCode: org.orgCode || '',
      orgName: org.orgName || '',
      orgType: org.orgType || 'CLUB',
      campusCode: org.campusCode || 'HCM',
      description: org.description || '',
      status: org.status || 'ACTIVE'
    })
    setIsOrgModalOpen(true)
  }

  const handleOrgFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const isCreate = orgFormMode === 'create'
      const url = '/api/admin/organizations'
      const method = isCreate ? 'POST' : 'PUT'

      const payload = isCreate
        ? orgFormData
        : { orgId: selectedOrg.orgId, ...orgFormData }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      const result = await response.json().catch(() => ({}))

      if (response.ok) {
        showToast('success', `${isCreate ? 'Tạo mới' : 'Cập nhật'} Câu lạc bộ / Đơn vị thành công!`)
        await fetchData()
        setIsOrgModalOpen(false)
      } else {
        throw new Error(result?.error || result?.message || 'Thao tác thất bại')
      }
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi lưu thông tin')
    }
  }

  const handleDeleteOrg = (org: any) => {
    setConfirmType('danger')
    setConfirmMessage(`Bạn có chắc chắn muốn xóa đơn vị "${org.orgName}" (${org.orgCode})?`)
    setConfirmAction(() => async () => {
      try {
        const response = await fetch(`/api/admin/organizations?id=${org.orgId}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        const result = await response.json().catch(() => ({}))
        if (response.ok) {
          showToast('success', 'Xóa đơn vị thành công')
          await fetchData()
        } else {
          showToast('error', result?.error || result?.message || 'Xóa thất bại')
        }
      } catch (err: any) {
        showToast('error', err.message || 'Lỗi hệ thống')
      } finally {
        setConfirmOpen(false)
        setConfirmAction(null)
      }
    })
    setConfirmOpen(true)
  }

  // --- INTERNAL USER ACTIONS ---
  const handleOpenCreateUser = () => {
    setUserFormMode('create')
    setSelectedUser(null)
    setIsUserModalOpen(true)
  }

  const handleOpenEditUser = (user: any) => {
    setUserFormMode('edit')
    setSelectedUser(user)
    setIsUserModalOpen(true)
  }

  const handleUserFormSubmit = async (data: CreateUserRequest | UpdateUserRequest) => {
    try {
      const isCreate = userFormMode === 'create'
      const url = '/api/admin/create-account'
      const method = isCreate ? 'POST' : 'PUT'
      
      const updateData = data as UpdateUserRequest
      const payload: any = isCreate ? {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        password: (data as CreateUserRequest).password,
        role: data.role
      } : {
        id: updateData.userId,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        status: updateData.status
      }

      if (!isCreate && (data as any).password) {
        payload.password = (data as any).password
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload)
      })

      const result = await response.json().catch(() => ({}))

      if (response.ok) {
        showToast('success', `${isCreate ? 'Tạo mới' : 'Cập nhật'} thành công`)
        await fetchData()
        setIsUserModalOpen(false)
      } else {
        throw new Error(result?.error || result?.message || 'Thao tác thất bại')
      }
    } catch (err: any) {
      console.error(err)
      throw err
    }
  }

  const _handleDeleteUser = (targetUser: any) => {
    setConfirmType('danger')
    setConfirmMessage(
      `Bạn có chắc chắn muốn xóa người dùng "${targetUser.fullName}" (${targetUser.username})?`
    )
    setConfirmAction(() => async () => {
      try {
        const response = await fetch(`/api/admin/create-account?id=${encodeURIComponent(targetUser.userId)}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        const result = await response.json().catch(() => ({}))
        if (response.ok) {
          showToast('success', 'Xóa người dùng thành công')
          await fetchData()
        } else {
          showToast('error', result?.error || result?.message || 'Xóa người dùng thất bại')
        }
      } catch (err: any) {
        showToast('error', err.message || 'Lỗi hệ thống')
      } finally {
        setConfirmOpen(false)
        setConfirmAction(null)
      }
    })
    setConfirmOpen(true)
  }

  const handleToggleUserStatus = (targetUser: any) => {
    if (targetUser.userId === user?.id) {
      showToast('error', 'Bạn không thể tự vô hiệu hóa tài khoản của chính mình!')
      return
    }
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    const statusText = newStatus === 'ACTIVE' ? 'kích hoạt' : 'vô hiệu hóa'
    
    setConfirmType('warning')
    setConfirmMessage(
      `Bạn có chắc chắn muốn ${statusText} tài khoản của "${targetUser.fullName}" (${targetUser.email || targetUser.username})?`
    )
    setConfirmAction(() => async () => {
      try {
        const response = await fetch('/api/admin/create-account', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            id: targetUser.userId,
            fullName: targetUser.fullName,
            phone: targetUser.phone,
            role: targetUser.role,
            status: newStatus
          })
        })
        const result = await response.json().catch(() => ({}))
        if (response.ok) {
          showToast('success', `${newStatus === 'ACTIVE' ? 'Kích hoạt' : 'Vô hiệu hóa'} người dùng thành công`)
          await fetchData()
        } else {
          showToast('error', result?.error || result?.message || 'Cập nhật trạng thái thất bại')
        }
      } catch (err: any) {
        showToast('error', err.message || 'Lỗi hệ thống')
      } finally {
        setConfirmOpen(false)
        setConfirmAction(null)
      }
    })
    setConfirmOpen(true)
  }

  // --- SPEAKER ACTIONS ---
  const handleOpenCreateSpeaker = () => {
    setSpeakerFormMode('create')
    setSelectedSpeaker(null)
    setIsSpeakerModalOpen(true)
  }

  const handleOpenEditSpeaker = (sp: any) => {
    setSpeakerFormMode('edit')
    setSelectedSpeaker(sp)
    setIsSpeakerModalOpen(true)
  }

  const handleSpeakerFormSubmit = async (data: any) => {
    const isCreate = speakerFormMode === 'create'
    const url = isCreate ? '/api/v1/speakers' : `/api/v1/speakers?id=${data.speakerId}`
    const method = isCreate ? 'POST' : 'PUT'

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(data)
    })

    const result = await response.json().catch(() => ({}))

    if (response.ok) {
      showToast('success', `${isCreate ? 'Thêm' : 'Cập nhật'} diễn giả thành công`)
      await fetchData()
      setIsSpeakerModalOpen(false)
    } else {
      throw new Error(result?.message || 'Lưu diễn giả thất bại')
    }
  }

  const handleDeleteSpeaker = (sp: any) => {
    setConfirmType('danger')
    setConfirmMessage(`Bạn có chắc chắn muốn xóa diễn giả "${sp.fullName}"?`)
    setConfirmAction(() => async () => {
      try {
        const response = await fetch(`/api/v1/speakers?id=${sp.speakerId}`, {
          method: 'DELETE',
          credentials: 'include'
        })
        if (response.ok) {
          showToast('success', 'Xóa diễn giả thành công')
          await fetchData()
        } else {
          showToast('error', 'Không thể xóa diễn giả')
        }
      } catch (err: any) {
        showToast('error', err.message || 'Lỗi hệ thống')
      } finally {
        setConfirmOpen(false)
        setConfirmAction(null)
      }
    })
    setConfirmOpen(true)
  }

  // --- SAMPLE BANNER ACTIONS ---
  const handleCreateSampleBannerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!bannerTitle.trim()) {
      showToast('error', 'Vui lòng nhập tiêu đề ảnh mẫu')
      return
    }
    if (!newBannerFile && !newBannerPreview) {
      showToast('error', 'Vui lòng chọn ảnh để tải lên')
      return
    }

    setIsUploadingBanner(true)
    try {
      let finalUrl = newBannerPreview
      if (newBannerFile) {
        finalUrl = await uploadEventBanner(newBannerFile)
      }

      const response = await fetch('/api/v1/admin/sample-banners', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: bannerTitle.trim(),
          url: finalUrl,
          category: bannerCategory.trim() || null,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'Lưu ảnh mẫu thất bại')
      }

      showToast('success', 'Thêm ảnh bìa mẫu thành công!')
      setIsBannerModalOpen(false)
      setBannerTitle('')
      setBannerCategory('')
      setNewBannerFile(null)
      setNewBannerPreview('')
      await fetchData()
    } catch (err: any) {
      console.error(err)
      showToast('error', err.message || 'Lỗi thêm ảnh bìa mẫu')
    } finally {
      setIsUploadingBanner(false)
    }
  }

  const handleDeleteSampleBanner = (banner: any) => {
    setConfirmType('danger')
    setConfirmMessage(`Bạn có chắc chắn muốn xóa ảnh bìa mẫu "${banner.title}"?`)
    setConfirmAction(() => async () => {
      try {
        const response = await fetch(`/api/v1/admin/sample-banners/${banner.bannerId}`, {
          method: 'DELETE',
          credentials: 'include',
        })
        const result = await response.json().catch(() => ({}))
        if (response.ok) {
          showToast('success', 'Xóa ảnh bìa mẫu thành công')
          await fetchData()
        } else {
          showToast('error', result?.message || 'Xóa ảnh bìa mẫu thất bại')
        }
      } catch (err: any) {
        showToast('error', err.message || 'Lỗi hệ thống')
      } finally {
        setConfirmOpen(false)
        setConfirmAction(null)
      }
    })
    setConfirmOpen(true)
  }

  // --- FILTERING LOGIC ---
  const getFilteredData = () => {
    if (activeTab === 'STUDENT') {
      return students.filter(s => {
        const matchSearch = s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.phone.includes(searchTerm)
        const matchStatus = statusFilter === 'ALL' || s.status === statusFilter
        return matchSearch && matchStatus
      })
    } else if (activeTab === 'SPEAKER') {
      return speakers.filter(sp => {
        return sp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (sp.email && sp.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (sp.phone && sp.phone.includes(searchTerm))
      })
    } else if (activeTab === 'BANNER') {
      return sampleBanners.filter(b => {
        const matchSearch = (b.title && b.title.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (b.category && b.category.toLowerCase().includes(searchTerm.toLowerCase()))
        return matchSearch
      })
    } else if (activeTab === 'ORGANIZATION') {
      return organizations.filter(org => {
        const matchSearch = (org.orgName && org.orgName.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (org.orgCode && org.orgCode.toLowerCase().includes(searchTerm.toLowerCase()))
        const matchStatus = statusFilter === 'ALL' || org.status === statusFilter
        const matchCampus = campusFilter === 'ALL' || org.campusCode === campusFilter
        return matchSearch && matchStatus && matchCampus
      })
    } else {
      return internalUsers.filter(u => {
        const matchSearch = u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.email.toLowerCase().includes(searchTerm.toLowerCase())
        const matchStatus = statusFilter === 'ALL' || u.status === statusFilter
        const matchRole = roleFilter === 'ALL' || u.role === roleFilter
        return matchSearch && matchStatus && matchRole
      })
    }
  }

  const filteredItems = getFilteredData()

  if (user?.role !== 'ADMIN') {
    return (
      <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl shadow-md p-12 text-center">
        <p className="text-red-500 text-lg font-bold">Bạn không có quyền truy cập trang này</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Quản lý người dùng & Diễn giả
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Quản lý tập trung sinh viên, diễn giả khách mời và nhân sự vận hành hệ thống.
          </p>
        </div>
        
        {/* Action Button depending on Active Tab */}
        {activeTab === 'SPEAKER' ? (
          <button
            onClick={handleOpenCreateSpeaker}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl shadow-lg shadow-orange-500/20 font-bold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <UserPlus size={18} />
            Thêm diễn giả
          </button>
        ) : activeTab === 'INTERNAL' ? (
          <button
            onClick={handleOpenCreateUser}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl shadow-lg shadow-orange-500/20 font-bold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <UserPlus size={18} />
            Tạo nhân sự mới
          </button>
        ) : activeTab === 'BANNER' ? (
          <button
            onClick={() => setIsBannerModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl shadow-lg shadow-orange-500/20 font-bold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} />
            Thêm ảnh mẫu
          </button>
        ) : activeTab === 'ORGANIZATION' ? (
          <button
            onClick={handleOpenCreateOrg}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white rounded-xl shadow-lg shadow-orange-500/20 font-bold text-sm transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={18} />
            Thêm Câu lạc bộ / Đơn vị
          </button>
        ) : null}
      </div>

      {/* Modern Tabs Bar */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl w-fit border border-slate-200/50 dark:border-slate-800/50">
        <button
          onClick={() => { setActiveTab('STUDENT'); setSearchTerm(''); setStatusFilter('ALL'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'STUDENT'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <Users size={16} />
          Người dùng thông thường
        </button>
        
        <button
          onClick={() => { setActiveTab('SPEAKER'); setSearchTerm(''); setStatusFilter('ALL'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'SPEAKER'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <Award size={16} />
          Diễn giả
        </button>

        <button
          onClick={() => { setActiveTab('INTERNAL'); setSearchTerm(''); setStatusFilter('ALL'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'INTERNAL'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldAlert size={16} />
          Nhân sự nội bộ
        </button>

        <button
          onClick={() => { setActiveTab('ORGANIZATION'); setSearchTerm(''); setStatusFilter('ALL'); setCampusFilter('ALL'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'ORGANIZATION'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <Building2 size={16} />
          Câu lạc bộ & Đơn vị
        </button>

        <button
          onClick={() => { setActiveTab('BANNER'); setSearchTerm(''); setStatusFilter('ALL'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'BANNER'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <ImageIcon size={16} />
          Ảnh bìa mẫu
        </button>

        <button
          onClick={() => setActiveTab('ANALYTICS')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'ANALYTICS'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
          }`}
        >
          <span>📊</span>
          GA4 Analytics
        </button>
      </div>

      {/* ===================== GA4 ANALYTICS TAB ===================== */}
      {activeTab === 'ANALYTICS' && (
        <div className="space-y-4">
          <GA4AnalyticsDashboard
            eventId={null}
            tierCode={null}
            role={user?.role}
          />
        </div>
      )}

      {/* Search & Filter Section — hidden for ANALYTICS tab */}
      {activeTab !== 'ANALYTICS' && (
        <>
          <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/60 rounded-2xl shadow-sm p-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={18} />
            <input
              type="text"
              placeholder={
                activeTab === 'SPEAKER'
                  ? "Tìm kiếm diễn giả theo tên, email, sđt..."
                  : activeTab === 'STUDENT'
                  ? "Tìm kiếm sinh viên theo tên, email, sđt..."
                  : activeTab === 'BANNER'
                  ? "Tìm kiếm ảnh mẫu theo tiêu đề, danh mục..."
                  : activeTab === 'ORGANIZATION'
                  ? "Tìm kiếm CLB / Đơn vị theo tên, mã..."
                  : "Tìm kiếm nhân sự theo tên, username, email..."
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 placeholder-slate-400 dark:placeholder-slate-500 transition-all text-sm font-medium shadow-inner"
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
            {/* Campus Filter (Organization tab only) */}
            {activeTab === 'ORGANIZATION' && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={campusFilter}
                  onChange={e => setCampusFilter(e.target.value)}
                  className="px-3.5 py-2 w-full sm:w-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-sm font-semibold cursor-pointer"
                >
                  <option value="ALL">Tất cả cơ sở</option>
                  <option value="HCM">TP. HCM (HCM)</option>
                  <option value="HL">Hà Nội (HL)</option>
                  <option value="DN">Đà Nẵng (DN)</option>
                  <option value="CT">Cần Thơ (CT)</option>
                  <option value="QNH">Quy Nhơn (QNH)</option>
                </select>
              </div>
            )}

            {/* Status Filter (Not applicable to Speakers or Banners) */}
            {activeTab !== 'SPEAKER' && activeTab !== 'BANNER' && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter size={16} className="text-slate-400" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                  className="px-3.5 py-2 w-full sm:w-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-sm font-semibold cursor-pointer"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Vô hiệu hóa</option>
                </select>
              </div>
            )}

            {/* Role Filter (Internal tab only) */}
            {activeTab === 'INTERNAL' && (
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as 'ALL' | 'ADMIN' | 'ORGANIZER' | 'STAFF')}
                className="px-3.5 py-2 w-full sm:w-auto bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-sm font-semibold cursor-pointer"
              >
                <option value="ALL">Tất cả vai trò</option>
                <option value="ADMIN">Admin</option>
                <option value="ORGANIZER">Organizer</option>
                <option value="STAFF">Staff</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-sm p-20 text-center flex flex-col items-center justify-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400 mt-4 font-semibold text-sm">Đang tải dữ liệu...</p>
        </div>
      ) : error ? (
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-sm p-12 text-center">
          <p className="text-red-500 dark:text-red-400 font-bold">{error}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl shadow-sm p-20 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-lg font-bold">Không tìm thấy bản ghi phù hợp</p>
        </div>
      ) : (
        <div className="bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-slate-200/50 dark:border-slate-800/60 rounded-2xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50/50 dark:bg-slate-950/40">
                {activeTab === 'STUDENT' && (
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Họ và tên</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Số điện thoại</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                  </tr>
                )}
                {activeTab === 'SPEAKER' && (
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Diễn giả</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Số điện thoại</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tiểu sử</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                  </tr>
                )}
                {activeTab === 'INTERNAL' && (
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Username</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Họ và tên</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Số điện thoại</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Vai trò</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                  </tr>
                )}
                {activeTab === 'BANNER' && (
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Xem trước</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tiêu đề</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Danh mục</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Đường dẫn</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                  </tr>
                )}
                {activeTab === 'ORGANIZATION' && (
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mã đơn vị</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tên CLB / Đơn vị</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Loại hình</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cơ sở (Campus)</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Thao tác</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {activeTab === 'STUDENT' && filteredItems.map((u) => (
                  <tr key={u.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white">{u.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">{u.phone || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        u.status === 'ACTIVE'
                          ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-green-600' : 'bg-red-600'}`}></span>
                        {u.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                            u.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                          title={u.status === 'ACTIVE' ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-250 ease-in-out ${
                              u.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {activeTab === 'SPEAKER' && filteredItems.map((sp) => (
                  <tr key={sp.speakerId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                      {sp.avatarUrl ? (
                        <img src={sp.avatarUrl} alt={sp.fullName} className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-800 shadow-sm" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-sm">
                          {sp.fullName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{sp.fullName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">{sp.email || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">{sp.phone || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate" title={sp.bio}>
                      {sp.bio || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditSpeaker(sp)}
                          className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition-all"
                          title="Sửa diễn giả"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteSpeaker(sp)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          title="Xóa diễn giả"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'INTERNAL' && filteredItems.map((u) => (
                  <tr key={u.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white">{u.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 dark:text-slate-200 font-bold">{u.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-medium">{u.phone || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        u.role === 'ADMIN'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400'
                          : u.role === 'ORGANIZER'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        u.status === 'ACTIVE'
                          ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-green-600' : 'bg-red-600'}`}></span>
                        {u.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end items-center gap-4">
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition-all"
                          title="Sửa thông tin"
                        >
                          <Edit size={16} />
                        </button>
                        
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          disabled={u.userId === user?.id}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-250 ease-in-out focus:outline-none ${
                            u.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-700'
                          } ${
                            u.userId === user?.id 
                              ? 'opacity-40 cursor-not-allowed' 
                              : 'cursor-pointer focus:ring-2 focus:ring-orange-500/20 focus:ring-offset-2 dark:focus:ring-offset-slate-900'
                          }`}
                          title={
                            u.userId === user?.id 
                              ? 'Không thể tự thay đổi trạng thái của bản thân' 
                              : u.status === 'ACTIVE' 
                              ? 'Vô hiệu hóa tài khoản' 
                              : 'Kích hoạt tài khoản'
                          }
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-250 ease-in-out ${
                              u.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'BANNER' && filteredItems.map((banner) => (
                  <tr key={banner.bannerId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="w-20 aspect-[16/9] rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 shadow-sm">
                        <img src={banner.url} alt={banner.title} className="w-full h-full object-cover" />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white">{banner.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200/40 dark:border-slate-700/50 text-xs">
                        {banner.category || 'Chưa phân loại'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate" title={banner.url}>{banner.url}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleDeleteSampleBanner(banner)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          title="Xóa ảnh mẫu"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {activeTab === 'ORGANIZATION' && filteredItems.map((org) => (
                  <tr key={org.orgId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-black text-orange-600 dark:text-orange-400">{org.orgCode}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.orgName} className="w-8 h-8 rounded-lg object-cover border border-slate-200 dark:border-slate-800 shadow-sm" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold text-xs">
                          {org.orgName?.charAt(0)?.toUpperCase() || 'O'}
                        </div>
                      )}
                      <span>{org.orgName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400 font-bold">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        org.orgType === 'CLUB'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400'
                          : org.orgType === 'FACULTY'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400'
                          : org.orgType === 'DEPARTMENT'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {org.orgType === 'CLUB' ? 'Câu lạc bộ' : org.orgType === 'FACULTY' ? 'Khoa / Viện' : org.orgType === 'DEPARTMENT' ? 'Phòng ban' : (org.orgType || 'Khác')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600 dark:text-slate-400">{org.campusCode || 'HCM'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        org.status === 'ACTIVE'
                          ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'
                          : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${org.status === 'ACTIVE' ? 'bg-green-600' : 'bg-red-600'}`}></span>
                        {org.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditOrg(org)}
                          className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition-all"
                          title="Sửa đơn vị"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteOrg(org)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          title="Xóa đơn vị"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
        </>
      )}

      <UserFormModal
        isOpen={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false)
          setSelectedUser(null)
        }}
        onSubmit={handleUserFormSubmit}
        user={selectedUser}
        mode={userFormMode}
        isCurrentUser={selectedUser?.userId === user?.id}
      />

      {/* Speaker Form Modal */}
      <SpeakerFormModal
        isOpen={isSpeakerModalOpen}
        onClose={() => {
          setIsSpeakerModalOpen(false)
          setSelectedSpeaker(null)
        }}
        onSubmit={handleSpeakerFormSubmit}
        speaker={selectedSpeaker}
        mode={speakerFormMode}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmOpen}
        message={confirmMessage}
        type={confirmType}
        onConfirm={() => confirmAction && confirmAction()}
        onClose={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
      />

      {/* Banner Create Modal */}
      {isBannerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-extrabold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-orange-500" />
                Thêm ảnh bìa mẫu
              </h3>
              <button
                type="button"
                onClick={() => setIsBannerModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg text-gray-500 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSampleBannerSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  Tiêu đề ảnh *
                </label>
                <input
                  type="text"
                  required
                  value={bannerTitle}
                  onChange={(e) => setBannerTitle(e.target.value)}
                  placeholder="Ví dụ: Hội thảo công nghệ, Âm nhạc..."
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-medium text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  Danh mục / Từ khóa
                </label>
                <input
                  type="text"
                  value={bannerCategory}
                  onChange={(e) => setBannerCategory(e.target.value)}
                  placeholder="Ví dụ: TECHNOLOGY, MUSIC, ART..."
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-medium text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-slate-300 mb-1.5">
                  Chọn hình ảnh
                </label>
                <div className="relative aspect-[16/9] w-full rounded-xl overflow-hidden bg-gray-200 dark:bg-slate-950 border border-dashed border-gray-300 dark:border-slate-800 flex flex-col items-center justify-center group mb-3">
                  {newBannerPreview ? (
                    <>
                      <img src={newBannerPreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => { setNewBannerFile(null); setNewBannerPreview(''); }}
                        className="absolute top-2 right-2 p-1 bg-red-600/80 text-white rounded-lg hover:bg-red-600 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-6 cursor-pointer text-center w-full h-full">
                      <Upload className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">Tải lên ảnh mẫu</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setNewBannerFile(file)
                            setNewBannerPreview(URL.createObjectURL(file))
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBannerModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 dark:border-slate-800 rounded-xl text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 font-bold text-xs"
                  disabled={isUploadingBanner}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/10 hover:shadow-orange-500/20"
                  disabled={isUploadingBanner}
                >
                  {isUploadingBanner ? 'Đang lưu...' : 'Thêm ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Organization Modal */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-5 text-slate-900 dark:text-white animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Building2 className="text-orange-500" size={22} />
                {orgFormMode === 'create' ? 'Tạo mới Câu lạc bộ / Đơn vị' : 'Cập nhật Câu lạc bộ / Đơn vị'}
              </h3>
              <button
                onClick={() => setIsOrgModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleOrgFormSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Mã đơn vị (Code) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={orgFormData.orgCode}
                    onChange={(e) => setOrgFormData({ ...orgFormData, orgCode: e.target.value.toUpperCase() })}
                    placeholder="VD: FCODE, JSCLUB"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none uppercase font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Loại hình <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={orgFormData.orgType}
                    onChange={(e) => setOrgFormData({ ...orgFormData, orgType: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-semibold"
                  >
                    <option value="CLUB">Câu lạc bộ (CLUB)</option>
                    <option value="DEPARTMENT">Phòng ban (DEPARTMENT)</option>
                    <option value="FACULTY">Khoa / Viện (FACULTY)</option>
                    <option value="EXTERNAL">Đối tác / Đơn vị ngoài (EXTERNAL)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Tên Câu lạc bộ / Đơn vị <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={orgFormData.orgName}
                  onChange={(e) => setOrgFormData({ ...orgFormData, orgName: e.target.value })}
                  placeholder="VD: Câu lạc bộ Lập trình F-Code"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Cơ sở (Campus) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={orgFormData.campusCode}
                    onChange={(e) => setOrgFormData({ ...orgFormData, campusCode: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-semibold"
                  >
                    <option value="HCM">TP. Hồ Chí Minh (HCM)</option>
                    <option value="HL">Hòa Lạc / Hà Nội (HL)</option>
                    <option value="DN">Đà Nẵng (DN)</option>
                    <option value="CT">Cần Thơ (CT)</option>
                    <option value="QNH">Quy Nhơn (QNH)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Trạng thái <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={orgFormData.status}
                    onChange={(e) => setOrgFormData({ ...orgFormData, status: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none font-semibold"
                  >
                    <option value="ACTIVE">Hoạt động (ACTIVE)</option>
                    <option value="INACTIVE">Vô hiệu hóa (INACTIVE)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Mô tả
                </label>
                <textarea
                  rows={3}
                  value={orgFormData.description}
                  onChange={(e) => setOrgFormData({ ...orgFormData, description: e.target.value })}
                  placeholder="Mô tả tóm tắt về câu lạc bộ hoặc đơn vị..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsOrgModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-sm shadow-lg shadow-orange-500/20 transition-all"
                >
                  {orgFormMode === 'create' ? 'Tạo mới' : 'Cập nhật'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}