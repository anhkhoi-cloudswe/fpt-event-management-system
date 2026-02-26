import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { UserPlus, Edit, Trash2, Search, Filter } from 'lucide-react'
import ConfirmModal from '../components/common/ConfirmModal'
import UserFormModal from '../components/admin/UserFormModal'
import type { User, CreateUserRequest, UpdateUserRequest } from '../types/user'

export default function AdminDashboard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const isDev = import.meta.env.DEV

  const mockUsers: User[] = [
    {
      userId: 1,
      username: 'organizer1',
      fullName: 'Organizer One',
      email: 'organizer1@example.local',
      phone: '0123456789',
      role: 'ORGANIZER',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    },
    {
      userId: 2,
      username: 'staff1',
      fullName: 'Staff One',
      email: 'staff1@example.local',
      phone: '0987654321',
      role: 'STAFF',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    },
    {
      userId: 3,
      username: 'organizer2',
      fullName: 'Organizer Two',
      email: 'organizer2@example.local',
      phone: '0112233445',
      role: 'ORGANIZER',
      status: 'INACTIVE',
      createdAt: new Date().toISOString()
    }
  ]

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ORGANIZER' | 'STAFF'>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE')

  useEffect(() => {
    // Always fetch from real API (do not use mock data in dev)
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    // Fetch list of users (ADMIN-managed) from backend
    // GET http://localhost:3000/api/admin/users
    // Uses stored `token` for Authorization header (Bearer)
    try {
      const token = localStorage.getItem('token')

      const response = await fetch('/api/users/staff-organizer', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()

        // Support multiple response shapes:
        // - legacy: an array of users
        // - new: { staffList: [...], organizerList: [...] }
        let usersArray: User[] = []

        if (Array.isArray(data)) {
          usersArray = data
        } else if (data && (Array.isArray(data.staffList) || Array.isArray(data.organizerList))) {
          const staff = Array.isArray(data.staffList) ? data.staffList : []
          const organizers = Array.isArray(data.organizerList) ? data.organizerList : []

          const normalize = (item: any, forcedRole: 'STAFF' | 'ORGANIZER') => ({
            userId: item.id,
            username: item.username || (item.email ? String(item.email).split('@')[0] : `user${item.id}`),
            fullName: item.fullName || '',
            email: item.email || '',
            phone: item.phone || '',
            role: forcedRole,
            status: item.status ? String(item.status).toUpperCase() as 'ACTIVE' | 'INACTIVE' : 'ACTIVE',
            createdAt: item.createdAt || new Date().toISOString()
          })

          usersArray = [
            ...staff.map((s: any) => normalize(s, 'STAFF')),
            ...organizers.map((o: any) => normalize(o, 'ORGANIZER'))
          ]
        } else {
          // fallback to empty
          usersArray = []
        }

        setUsers(usersArray)
      } else {
        throw new Error('Failed to fetch users')
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch users')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateUser = async (data: CreateUserRequest) => {
    // Create a new account via Admin API
    // POST http://localhost:3000/api/admin/create-account
    // Expects body: { fullName, phone, email, password, role }
    try {
      const token = localStorage.getItem('token')

      const response = await fetch('/api/admin/create-account', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (response.ok) {
        showToast('success', 'Tạo người dùng thành công')
        await fetchUsers()
        setIsFormModalOpen(false)
      } else {
        // API may return { error: '...' } or { message: '...' }
        const errMsg = result?.error || result?.message || 'Tạo người dùng thất bại'
        // Throw so callers (modal) can display the message; avoid double toasts here
        throw new Error(String(errMsg))
      }
    } catch (error) {
      console.error('Error creating user:', error)
      throw error
    }
  }

  const handleUpdateUser = async (data: UpdateUserRequest) => {
    // Update user using the same Admin endpoint (PUT)
    // PUT http://localhost:3000/api/admin/create-account
    // Body: { id, fullName, phone, role, status, password }
    try {
      const token = localStorage.getItem('token')
      // Build payload matching the backend requirement
      const payload: any = {
        id: data.userId,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
        status: data.status
      }
      // include password if present
      if ((data as any).password) payload.password = (data as any).password

      const response = await fetch('/api/admin/create-account', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (response.ok) {
        showToast('success', 'Cập nhật người dùng thành công')
        await fetchUsers()
        setIsFormModalOpen(false)
      } else {
        const errMsg = result?.error || result?.message || 'Cập nhật người dùng thất bại'
        throw new Error(String(errMsg))
      }
    } catch (error) {
      console.error('Error updating user:', error)
      throw error
    }
  }

  const performDeleteUser = async (userId: number) => {
    // Soft-delete a user using the admin endpoint (DELETE)
    // DELETE http://localhost:3000/api/admin/create-account
    // Body: { id }
    // On success refetches the user list
    try {
      const token = localStorage.getItem('token')
      // Use query param for DELETE: /api/admin/create-account?id=1
      const url = `/api/admin/create-account?id=${encodeURIComponent(userId)}`
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      // Some backends may return a message or error
      const result = await response.json().catch(() => ({}))

      if (response.ok) {
        const successMsg = result?.message || result?.msg || result?.success || 'Xóa người dùng thành công'
        showToast('success', String(successMsg))
        await fetchUsers()
      } else {
        const errMsg = result?.error || result?.message || 'Xóa người dùng thất bại'
        showToast('error', String(errMsg))
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      showToast('error', 'Lỗi khi xóa người dùng')
    } finally {
      setConfirmOpen(false)
      setConfirmAction(null)
    }
  }

  const handleDeleteUser = (user: User) => {
    setConfirmMessage(
      `Bạn có chắc chắn muốn xóa người dùng "${user.fullName}" (${user.username})?`
    )
    setConfirmAction(() => () => performDeleteUser(user.userId))
    setConfirmOpen(true)
  }

  const handleOpenCreateModal = () => {
    setFormMode('create')
    setSelectedUser(null)
    setIsFormModalOpen(true)
  }

  const handleOpenEditModal = (user: User) => {
    setFormMode('edit')
    setSelectedUser(user)
    setIsFormModalOpen(true)
  }

  const handleFormSubmit = async (
    data: CreateUserRequest | UpdateUserRequest
  ) => {
    if (formMode === 'create') {
      await handleCreateUser(data as CreateUserRequest)
    } else {
      await handleUpdateUser(data as UpdateUserRequest)
    }
  }

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter
    const matchesStatus = statusFilter === 'ALL' || u.status === statusFilter

    return matchesSearch && matchesRole && matchesStatus
  })

  if (user?.role !== 'ADMIN') {
    return (
      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <p className="text-red-500 text-lg">Bạn không có quyền truy cập trang này</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Quản lý Organizer & Staff</h1>
        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus size={20} />
          Tạo người dùng mới
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Tìm kiếm theo tên, username, email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-400" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'ALL' | 'ORGANIZER' | 'STAFF')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tất cả vai trò</option>
              <option value="ORGANIZER">Organizer</option>
              <option value="STAFF">Staff</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="INACTIVE">Vô hiệu hóa</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500">Đang tải...</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-red-500">{error}</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500 text-lg">Không tìm thấy người dùng</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Họ và tên</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số điện thoại</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vai trò</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map(u => (
                <tr key={u.userId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{u.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{u.fullName}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{u.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{u.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${u.role === 'ORGANIZER' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>{u.role}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${u.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleOpenEditModal(u)} className="text-blue-600 hover:text-blue-800" title="Chỉnh sửa"><Edit size={18} /></button>
                      <button onClick={() => handleDeleteUser(u)} className="text-red-600 hover:text-red-800" title="Xóa"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UserFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false)
          setSelectedUser(null)
        }}
        onSubmit={handleFormSubmit}
        user={selectedUser}
        mode={formMode}
      />

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