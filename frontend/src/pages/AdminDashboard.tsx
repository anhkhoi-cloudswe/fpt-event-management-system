import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { UserPlus, Edit, Trash2, Search, Filter, Users, UserCheck, ShieldAlert, Award } from 'lucide-react'
import ConfirmModal from '../components/common/ConfirmModal'
import UserFormModal from '../components/admin/UserFormModal'
import SpeakerFormModal from '../components/admin/SpeakerFormModal'
import type { User, CreateUserRequest, UpdateUserRequest } from '../types/user'

type ActiveTab = 'STUDENT' | 'SPEAKER' | 'INTERNAL'

export default function AdminDashboard() {
  const { user } = useAuth()
  const { showToast } = useToast()

  // Tab State
  const [activeTab, setActiveTab] = useState<ActiveTab>('STUDENT')

  // Data States
  const [students, setStudents] = useState<any[]>([])
  const [speakers, setSpeakers] = useState<any[]>([])
  const [internalUsers, setInternalUsers] = useState<any[]>([])
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modals for Internal Users
  const [isUserModalOpen, setIsUserModalOpen] = useState(false)
  const [userFormMode, setUserFormMode] = useState<'create' | 'edit'>('create')
  const [selectedUser, setSelectedUser] = useState<any | null>(null)

  // Modals for Speakers
  const [isSpeakerModalOpen, setIsSpeakerModalOpen] = useState(false)
  const [speakerFormMode, setSpeakerFormMode] = useState<'create' | 'edit'>('create')
  const [selectedSpeaker, setSelectedSpeaker] = useState<any | null>(null)

  // Confirmation Modal
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  // Search and Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'ORGANIZER' | 'STAFF'>('ALL')

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
      const speakersResponse = await fetch('/api/v1/admin/speakers')
      let speakerList: any[] = []
      if (speakersResponse.ok) {
        speakerList = await speakersResponse.json()
      }

      setStudents(studentList)
      setInternalUsers(internalList)
      setSpeakers(speakerList)
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err.message || 'Lỗi tải dữ liệu người dùng')
    } finally {
      setLoading(false)
    }
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
      
      const payload: any = isCreate ? {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        password: (data as CreateUserRequest).password,
        role: data.role
      } : {
        id: data.userId,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        status: data.status
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

  const handleDeleteUser = (targetUser: any) => {
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
        ) : null}
      </div>

      {/* Modern Tabs Bar */}
      <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl w-fit border border-slate-200/50 dark:border-slate-800/50">
        <button
          onClick={() => { setActiveTab('STUDENT'); setSearchTerm(''); setStatusFilter('ALL'); }}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
            activeTab === 'STUDENT'
              ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/10'
              : 'text-slate-600 dark:text-slate-350 hover:bg-slate-200/60 dark:hover:bg-slate-850'
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
              : 'text-slate-600 dark:text-slate-350 hover:bg-slate-200/60 dark:hover:bg-slate-850'
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
              : 'text-slate-600 dark:text-slate-350 hover:bg-slate-200/60 dark:hover:bg-slate-850'
          }`}
        >
          <ShieldAlert size={16} />
          Nhân sự nội bộ
        </button>
      </div>

      {/* Search & Filter Section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm p-4">
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
                  : "Tìm kiếm nhân sự theo tên, username, email..."
              }
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 placeholder-slate-400 dark:placeholder-slate-500 transition-all text-sm font-medium shadow-inner"
            />
          </div>

          <div className="flex flex-wrap gap-3 items-center w-full md:w-auto">
            {/* Status Filter (Not applicable to Speakers since speakers don't have ACTIVE/INACTIVE state fields currently) */}
            {activeTab !== 'SPEAKER' && (
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
              <thead className="bg-slate-50/70 dark:bg-slate-850">
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
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {activeTab === 'STUDENT' && filteredItems.map((u) => (
                  <tr key={u.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900 dark:text-white">{u.fullName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-350 font-medium">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-350 font-medium">{u.phone || '—'}</td>
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <button
                        onClick={() => handleDeleteUser(u)}
                        className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                        title="Vô hiệu hóa"
                      >
                        <Trash2 size={16} />
                      </button>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-350 font-medium">{sp.email || '—'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-350 font-medium">{sp.phone || '—'}</td>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-350 font-medium">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-350 font-medium">{u.phone || '—'}</td>
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditUser(u)}
                          className="text-blue-500 hover:text-blue-700 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition-all"
                          title="Sửa"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          title="Xóa / Vô hiệu hóa"
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

      {/* Internal User Form Modal */}
      <UserFormModal
        isOpen={isUserModalOpen}
        onClose={() => {
          setIsUserModalOpen(false)
          setSelectedUser(null)
        }}
        onSubmit={handleUserFormSubmit}
        user={selectedUser}
        mode={userFormMode}
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
        onConfirm={() => confirmAction && confirmAction()}
        onClose={() => {
          setConfirmOpen(false)
          setConfirmAction(null)
        }}
      />
    </div>
  )
}