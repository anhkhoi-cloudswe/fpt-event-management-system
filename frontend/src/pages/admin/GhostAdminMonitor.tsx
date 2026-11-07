import React, { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { 
  ShieldAlert, 
  RefreshCw, 
  Trash2, 
  Eye, 
  CheckCircle, 
  Lock, 
  Unlock,
  Terminal, 
  Activity, 
  Users, 
  Search, 
  Globe,
  Plus,
  UserCheck,
  ChevronRight,
  X,
  ExternalLink,
  Clock,
  ShieldCheck,
  User,
  Monitor,
  Laptop,
  Smartphone,
  Info,
  Copy,
  Check
} from 'lucide-react'
import { 
  ghostAdminService, 
  type SupervisedUser, 
  type PageVisitSession, 
  type RequestLog,
  type SystemUserOption
} from '../../services/ghostAdminService'

// Helper function to parse user agent into human-readable details
function parseUserAgent(ua: string | undefined) {
  if (!ua) {
    return {
      browser: 'Không xác định',
      os: 'Không xác định',
      deviceType: 'Thiết bị không xác định',
      engine: 'Chưa rõ'
    }
  }

  let browser = 'Trình duyệt khác'
  let os = 'Hệ điều hành khác'
  let deviceType = 'Máy tính (Desktop / Laptop)'
  let engine = 'Web Engine'

  // Device type
  if (/mobile/i.test(ua)) {
    deviceType = 'Điện thoại di động (Mobile)'
  } else if (/tablet|ipad/i.test(ua)) {
    deviceType = 'Máy tính bảng (Tablet)'
  }

  // OS detection
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10 / Windows 11'
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1'
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7'
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS (Apple Mac)'
  else if (/iPhone/i.test(ua)) os = 'iOS (Apple iPhone)'
  else if (/iPad/i.test(ua)) os = 'iPadOS (Apple iPad)'
  else if (/Android/i.test(ua)) os = 'Android'
  else if (/Linux/i.test(ua)) os = 'Linux'

  // Browser detection
  if (/Edg\//i.test(ua)) {
    const v = ua.match(/Edg\/([\d.]+)/)?.[1]
    browser = `Microsoft Edge${v ? ` (v${v})` : ''}`
  } else if (/Chrome\/([\d.]+)/i.test(ua) && !/Edg/i.test(ua)) {
    const v = ua.match(/Chrome\/([\d.]+)/)?.[1]
    browser = `Google Chrome${v ? ` (v${v})` : ''}`
  } else if (/Firefox\/([\d.]+)/i.test(ua)) {
    const v = ua.match(/Firefox\/([\d.]+)/)?.[1]
    browser = `Mozilla Firefox${v ? ` (v${v})` : ''}`
  } else if (/Safari\/([\d.]+)/i.test(ua) && !/Chrome/i.test(ua)) {
    const v = ua.match(/Version\/([\d.]+)/)?.[1]
    browser = `Apple Safari${v ? ` (v${v})` : ''}`
  }

  // Engine
  if (/AppleWebKit/i.test(ua)) engine = 'WebKit / Blink (Tiêu chuẩn Chromium)'
  else if (/Gecko/i.test(ua)) engine = 'Gecko'

  return { browser, os, deviceType, engine }
}

export default function GhostAdminMonitor() {
  const [supervisedUsers, setSupervisedUsers] = useState<SupervisedUser[]>([])
  const [sessions, setSessions] = useState<PageVisitSession[]>([])
  const [availableUsers, setAvailableUsers] = useState<SystemUserOption[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [updatingEmail, setUpdatingEmail] = useState<string | null>(null)
  
  // Drill-down states
  const [selectedSession, setSelectedSession] = useState<PageVisitSession | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<RequestLog | null>(null)
  const [selectedUserFilterEmail, setSelectedUserFilterEmail] = useState<string | null>(null)

  // Add user modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedUserEmail, setSelectedUserEmail] = useState('')
  const [userSearchTerm, setUserSearchTerm] = useState('')
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<'ALL' | 'ADMIN' | 'STAFF' | 'ORGANIZER'>('ALL')

  // Search & Filters
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterType, setFilterType] = useState<'ALL' | 'BLOCKED' | 'READONLY'>('ALL')
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchData = async () => {
    try {
      const [statusRes, sessionsRes, usersRes] = await Promise.all([
        ghostAdminService.getStatus(),
        ghostAdminService.getSessions(),
        ghostAdminService.getAvailableUsers()
      ])
      if (statusRes?.supervisedUsers) {
        setSupervisedUsers(statusRes.supervisedUsers)
      }
      if (sessionsRes?.sessions) {
        setSessions(sessionsRes.sessions)
      }
      if (usersRes) {
        setAvailableUsers(usersRes)
      }
    } catch (err) {
      console.error('Failed to load ghost monitor data', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(() => {
      ghostAdminService.getSessions().then((res) => {
        if (res?.sessions) setSessions(res.sessions)
      }).catch(() => {})
    }, 4000)
    return () => clearInterval(timer)
  }, [autoRefresh])

  const handleToggleSafeMode = async (u: SupervisedUser) => {
    setUpdatingEmail(u.email)
    try {
      const nextState = !u.safeMode
      await ghostAdminService.toggleSafeMode(u.email, nextState)
      setSupervisedUsers(prev => prev.map(item => item.email === u.email ? { ...item, safeMode: nextState } : item))
    } catch {
      alert('Không thể chuyển đổi trạng thái Safe Mode')
    } finally {
      setUpdatingEmail(null)
    }
  }

  // Selected User Object from Dropdown
  const chosenUser = useMemo(() => {
    return availableUsers.find(u => u.email.toLowerCase() === selectedUserEmail.toLowerCase()) || null
  }, [availableUsers, selectedUserEmail])

  // Filter out users already supervised
  const unmonitoredUsers = useMemo(() => {
    const supervisedSet = new Set(supervisedUsers.map(s => s.email.toLowerCase()))
    return availableUsers.filter(u => !supervisedSet.has(u.email.toLowerCase()))
  }, [availableUsers, supervisedUsers])

  // Search filtered list for modal
  const filteredModalUsers = useMemo(() => {
    return unmonitoredUsers.filter(u => {
      if (selectedRoleFilter !== 'ALL' && u.role !== selectedRoleFilter) {
        return false
      }
      if (userSearchTerm.trim()) {
        const kw = userSearchTerm.toLowerCase().trim()
        const matchName = u.fullName.toLowerCase().includes(kw)
        const matchEmail = u.email.toLowerCase().includes(kw)
        const matchRole = u.role.toLowerCase().includes(kw)
        const matchId = String(u.userId).includes(kw)
        if (!matchName && !matchEmail && !matchRole && !matchId) {
          return false
        }
      }
      return true
    })
  }, [unmonitoredUsers, userSearchTerm, selectedRoleFilter])

  const handleConfirmAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chosenUser) return
    try {
      await ghostAdminService.addUser({
        id: chosenUser.userId,
        email: chosenUser.email,
        name: chosenUser.fullName,
        role: chosenUser.role
      })
      setIsAddModalOpen(false)
      setSelectedUserEmail('')
      fetchData()
    } catch {
      alert('Không thể thêm người dùng vào danh sách giám sát')
    }
  }

  const handleRemoveUser = async (email: string) => {
    if (!window.confirm(`Bạn có chắc muốn hủy giám sát tài khoản ${email}?`)) return
    try {
      await ghostAdminService.removeUser(email)
      fetchData()
    } catch {
      alert('Không thể xóa')
    }
  }

  const handleClear = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử truy cập này không?')) return
    try {
      await ghostAdminService.clearSessions()
      setSessions([])
      setSelectedSession(null)
      setSelectedRequest(null)
    } catch {
      alert('Không thể xóa lịch sử')
    }
  }

  // Filtered session list
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedUserFilterEmail && s.userEmail.toLowerCase() !== selectedUserFilterEmail.toLowerCase()) {
        return false
      }
      if (filterType === 'BLOCKED' && s.blockedCalls === 0) return false
      if (filterType === 'READONLY' && s.blockedCalls > 0) return false
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase()
        const matchPage = s.pageName.toLowerCase().includes(kw) || s.pageUrl.toLowerCase().includes(kw)
        const matchUser = s.userName.toLowerCase().includes(kw) || s.userEmail.toLowerCase().includes(kw)
        if (!matchPage && !matchUser) return false
      }
      return true
    })
  }, [sessions, selectedUserFilterEmail, filterType, searchKeyword])

  const selectedSupervisedUser = useMemo(() => {
    if (!selectedUserFilterEmail) return null
    return supervisedUsers.find(u => u.email.toLowerCase() === selectedUserFilterEmail.toLowerCase()) || null
  }, [supervisedUsers, selectedUserFilterEmail])

  const totalPageViews = filteredSessions.length
  const totalBlocked = useMemo(() => filteredSessions.reduce((acc, s) => acc + s.blockedCalls, 0), [filteredSessions])

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' - ' + d.toLocaleDateString('vi-VN')
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0 shadow-inner">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Ghost Admin Control & Silent Monitor
                </h1>
                <span className="text-[11px] font-black px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400 border border-orange-200 dark:border-orange-800/60 uppercase tracking-wide">
                  Root Admin
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium">
                Cơ chế khóa ghi âm thầm và giám sát thời gian thực của tài khoản Reviewer.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedUserEmail(unmonitoredUsers[0]?.email || '')
                setIsAddModalOpen(true)
              }}
              className="px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-orange-500 hover:bg-orange-600 text-white transition-all duration-200 flex items-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
            >
              <Plus size={16} />
              <span>Thêm tài khoản giám sát</span>
            </button>
          </div>
        </div>
      </div>

      {/* Supervised Users List (CRUD & Safe Mode Control) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-2">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-orange-500" />
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              Danh sách tài khoản đang được giám sát ({supervisedUsers.length})
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {selectedUserFilterEmail && (
              <button
                onClick={() => setSelectedUserFilterEmail(null)}
                className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <X size={13} />
                <span>Bỏ chọn lọc</span>
              </button>
            )}
            <span className="text-xs text-slate-400 font-medium">
              Nhấp vào ô để lọc nhật ký bên dưới • Bật / Tắt Khóa Ghi độc lập
            </span>
          </div>
        </div>

        {supervisedUsers.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
            Chưa có tài khoản nào trong danh sách giám sát. Hãy nhấn &quot;Thêm tài khoản giám sát&quot; ở trên.
          </div>
        ) : (
          <div className="overflow-x-auto pb-3 pt-2 -mx-1 px-1 custom-horizontal-scrollbar">
            <div 
              className={
                supervisedUsers.length <= 6
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  : "grid grid-rows-2 grid-flow-col auto-cols-[minmax(330px,1fr)] gap-4 min-w-max"
              }
            >
              {supervisedUsers.map((u) => {
                const isSelected = selectedUserFilterEmail?.toLowerCase() === u.email.toLowerCase()
                return (
                  <div 
                    key={u.email}
                    onClick={() => {
                      setSelectedUserFilterEmail(prev => 
                        prev?.toLowerCase() === u.email.toLowerCase() ? null : u.email
                      )
                    }}
                    className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between space-y-4 cursor-pointer relative select-none ${
                      isSelected
                        ? 'border-orange-500 ring-2 ring-orange-500/30 bg-orange-50/50 dark:bg-orange-950/20 shadow-md'
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-950/40 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                            ID #{u.id || '—'}
                          </span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white shadow-xs animate-in fade-in">
                              <Check size={11} strokeWidth={3} />
                              ĐANG XEM
                            </span>
                          )}
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          u.role === 'ADMIN' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' :
                          u.role === 'STAFF' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                          'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mt-2 flex items-center justify-between">
                        <span>{u.name}</span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate" title={u.email}>
                        {u.email}
                      </p>
                    </div>

                    {/* Safe Mode Switch Widget - Fixed single line */}
                    <div 
                      className="flex items-center justify-between pt-3 border-t border-slate-200/60 dark:border-slate-800/60"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-left whitespace-nowrap">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Trạng thái bảo vệ</div>
                        <div className={`text-xs font-extrabold flex items-center gap-1.5 mt-0.5 ${
                          u.safeMode ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${u.safeMode ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          Safe Mode: {u.safeMode ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleToggleSafeMode(u)
                          }}
                          disabled={updatingEmail === u.email}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                            u.safeMode
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              : 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {u.safeMode ? <Lock size={12} /> : <Unlock size={12} />}
                          {updatingEmail === u.email ? '...' : u.safeMode ? 'Khóa Ghi (Bật)' : 'Mở Ghi (Tắt)'}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveUser(u.email)
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
                          title="Gỡ khỏi danh sách giám sát"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Level 1: Page-Level Sessions (Nhật ký vị trí xem của "Supervised Admin") */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {selectedSupervisedUser && (
          <div className="bg-orange-500/10 border-b border-orange-500/20 px-6 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-orange-600 dark:text-orange-400">Đang lọc xem riêng của:</span>
              <span className="font-extrabold text-slate-900 dark:text-white">{selectedSupervisedUser.name}</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">({selectedSupervisedUser.email})</span>
              <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                selectedSupervisedUser.role === 'ADMIN' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' :
                selectedSupervisedUser.role === 'STAFF' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400'
              }`}>
                {selectedSupervisedUser.role}
              </span>
            </div>
            <button
              onClick={() => setSelectedUserFilterEmail(null)}
              className="text-orange-600 dark:text-orange-400 hover:text-orange-700 font-bold flex items-center gap-1 cursor-pointer bg-white dark:bg-slate-900 px-2.5 py-1 rounded-lg border border-orange-200 dark:border-orange-800/60 shadow-2xs"
            >
              <X size={12} />
              <span>Xem tất cả người giám sát</span>
            </button>
          </div>
        )}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-orange-500" />
            <h2 className="font-extrabold text-slate-900 dark:text-white text-base">
              Nhật ký vị trí xem của "Supervised Admin"
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Lọc trang hoặc email..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200 font-medium"
              />
            </div>

            <div className="flex rounded-xl border border-slate-200 dark:border-slate-800 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs font-bold">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'ALL' ? 'bg-orange-500 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Tất cả ({filteredSessions.length})
              </button>
              <button
                onClick={() => setFilterType('BLOCKED')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'BLOCKED' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                Có thao tác bị chặn ({totalBlocked})
              </button>
              <button
                onClick={() => setFilterType('READONLY')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  filterType === 'READONLY' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                Chỉ xem thuần
              </button>
            </div>

            <button
              onClick={fetchData}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              title="Làm mới"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-orange-500' : ''}`} />
            </button>

            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`text-xs px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                autoRefresh
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400'
                  : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800'
              }`}
            >
              {autoRefresh ? 'Tự cập nhật 4s' : 'Đã dừng auto'}
            </button>

            <button
              onClick={handleClear}
              className="p-2 rounded-xl border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600 cursor-pointer"
              title="Xóa toàn bộ lịch sử"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sessions Master Table */}
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          {filteredSessions.length === 0 ? (
            <div className="p-16 text-center text-slate-400 dark:text-slate-500">
              <Terminal className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="font-bold text-sm">Chưa có lượt truy cập nào từ tài khoản được giám sát.</p>
              <p className="text-xs mt-1">Khi tài khoản vào xem các trang như Báo cáo, Quản lý hệ thống, Tài chính... hệ thống sẽ gom thành từng trang tại đây.</p>
            </div>
          ) : (
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50/75 dark:bg-slate-950/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider sticky top-0 border-b border-slate-200 dark:border-slate-800 whitespace-nowrap">
                <tr>
                  <th className="py-3.5 px-6">Thời gian</th>
                  <th className="py-3.5 px-6">Người thực hiện (Supervised)</th>
                  <th className="py-3.5 px-6">Trang đang truy cập</th>
                  <th className="py-3.5 px-6">Tình trạng thao tác</th>
                  <th className="py-3.5 px-6">Địa chỉ IP</th>
                  <th className="py-3.5 px-6 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
                {filteredSessions.map((s) => (
                  <tr 
                    key={s.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="py-3.5 px-6 font-mono text-slate-500 whitespace-nowrap">
                      {formatTime(s.lastActive)}
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{s.userName}</span>
                        <span className="font-mono text-[10px] text-slate-400 font-normal">#{s.userId || '—'}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{s.userEmail}</div>
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      <div className="font-extrabold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                        <Globe size={14} className="text-orange-500" />
                        <span>{s.pageName}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{s.pageUrl}</div>
                    </td>
                    <td className="py-3.5 px-6 whitespace-nowrap">
                      {s.blockedCalls > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 whitespace-nowrap">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Đã chặn {s.blockedCalls} thao tác sửa/xóa (Fake 200)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 whitespace-nowrap">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Chỉ Xem ({s.totalCalls} lệnh GET)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 font-mono text-slate-400 whitespace-nowrap">
                      {s.clientIP}
                    </td>
                    <td className="py-3.5 px-6 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedSession(s)}
                        className="px-3.5 py-1.5 rounded-xl font-bold text-xs bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/40 text-orange-600 dark:text-orange-400 transition-all cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Eye size={13} />
                        <span>Xem chi tiết trang ({s.totalCalls})</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Level 2 Modal: Deep inspection of all API requests inside a session */}
      {selectedSession && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden relative">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    Chi tiết các lệnh khi xem: {selectedSession.pageName}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium font-mono">
                  URL: {selectedSession.pageUrl} • Người dùng: {selectedSession.userName} ({selectedSession.userEmail})
                </p>
              </div>

              <button
                onClick={() => {
                  setSelectedSession(null)
                  setSelectedRequest(null)
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">
              <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 whitespace-nowrap">
                  <tr>
                    <th className="py-3 px-4">Thời gian</th>
                    <th className="py-3 px-4">Phương thức</th>
                    <th className="py-3 px-4">Đường dẫn thực tế</th>
                    <th className="py-3 px-4">Trạng thái bảo vệ</th>
                    <th className="py-3 px-4 text-right">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium">
                  {selectedSession.requests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">{formatTime(req.timestamp)}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded font-black font-mono text-[10px] ${
                          req.method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                          req.method === 'POST' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400' :
                          'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                        }`}>
                          {req.method}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-800 dark:text-slate-200 max-w-sm truncate whitespace-nowrap" title={req.path}>
                        {req.path}
                        {req.query && <span className="text-slate-400 ml-1">?{req.query}</span>}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {req.status === 'BLOCKED_SAFE_MODE' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 whitespace-nowrap">
                            <ShieldAlert size={12} />
                            Đã Chặn & Fake 200 OK
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40 whitespace-nowrap">
                            <CheckCircle size={12} />
                            Chỉ Xem (GET Passed)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="px-2.5 py-1 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 font-bold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap transition-colors"
                        >
                          <Eye size={12} /> Xem payload
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Level 3 Modal: Form JSON Payload Popup (Stacked above Level 2 Modal with z-[110] and Context-Aware Theme) */}
      {selectedRequest && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/75 dark:bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                  <Terminal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Chi tiết Request HTTP</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black ${
                      selectedRequest.method === 'GET' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-700/40' :
                      selectedRequest.method === 'POST' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/40' :
                      'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40'
                    }`}>
                      {selectedRequest.method}
                    </span>
                  </h3>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 max-w-md truncate" title={selectedRequest.path}>
                    {selectedRequest.path}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Meta Info Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <Clock size={12} className="text-orange-500" /> Thời gian gửi lệnh
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {formatTime(selectedRequest.timestamp)}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80">
                  <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1">
                    <Globe size={12} className="text-orange-500" /> Địa chỉ Client IP
                  </div>
                  <div className="text-xs font-mono font-bold text-blue-600 dark:text-cyan-400">
                    {selectedRequest.clientIP}
                  </div>
                </div>
              </div>

              {/* Parsed Device & Browser Details */}
              {(() => {
                const uaInfo = parseUserAgent(selectedRequest.userAgent)
                return (
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                    <div className="text-[11px] uppercase font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Laptop size={14} className="text-orange-500" />
                      Phân tích thiết bị & trình duyệt của người dùng
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="bg-white dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Trình duyệt:</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white font-sans">{uaInfo.browser}</span>
                      </div>

                      <div className="bg-white dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Hệ điều hành:</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white font-sans">{uaInfo.os}</span>
                      </div>

                      <div className="bg-white dark:bg-slate-900/80 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Loại thiết bị:</span>
                        <span className="text-xs font-bold text-slate-900 dark:text-white font-sans">{uaInfo.deviceType}</span>
                      </div>
                    </div>

                    <details className="text-[11px] text-slate-500 font-mono cursor-pointer">
                      <summary className="hover:text-slate-700 dark:hover:text-slate-400 transition-colors select-none font-sans font-medium">
                        Xem chuỗi User-Agent gốc (Raw User-Agent)
                      </summary>
                      <div className="mt-1.5 p-2 bg-slate-100 dark:bg-black/60 rounded-lg text-slate-600 dark:text-slate-400 break-all select-text font-mono text-[10px] border border-slate-200/50 dark:border-transparent">
                        {selectedRequest.userAgent || '(Không có thông tin User-Agent)'}
                      </div>
                    </details>
                  </div>
                )
              })()}

              {/* Payload Data View Only */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Terminal size={13} className="text-orange-500" />
                    Dữ liệu gửi lên (Form Payload JSON / Read-only):
                  </span>
                  {selectedRequest.body && (
                    <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                      Chế độ xem nhật ký (Chỉ đọc)
                    </span>
                  )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-emerald-400 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-60 overflow-y-auto font-mono text-xs select-text shadow-inner">
                  {selectedRequest.body ? (
                    (() => {
                      try {
                        return (
                          <pre className="whitespace-pre-wrap font-mono text-xs">
                            {JSON.stringify(JSON.parse(selectedRequest.body), null, 2)}
                          </pre>
                        )
                      } catch {
                        return <pre className="whitespace-pre-wrap font-mono text-xs">{selectedRequest.body}</pre>
                      }
                    })()
                  ) : (
                    <div className="text-slate-500 dark:text-slate-400 italic py-2 text-center font-sans">
                      (Yêu cầu {selectedRequest.method} này không mang theo body/payload - thường là thao tác tải dữ liệu để xem)
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 flex justify-end">
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white cursor-pointer transition-colors"
              >
                Đóng chi tiết
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Supervised User Modal with Searchable User List */}
      {isAddModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-orange-500" />
                Thêm tài khoản vào danh sách giám sát
              </h3>
              <button 
                onClick={() => {
                  setIsAddModalOpen(false)
                  setUserSearchTerm('')
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmAdd} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Tìm kiếm & chọn tài khoản từ hệ thống
                </label>
                
                {/* Search Box & Role Filter in One Compact Row */}
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Tìm theo tên, email, #ID..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-7 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200 font-medium"
                      autoFocus
                    />
                    {userSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setUserSearchTerm('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Compact Role Filter Dropdown */}
                  <div className="flex-shrink-0">
                    <select
                      value={selectedRoleFilter}
                      onChange={(e) => setSelectedRoleFilter(e.target.value as any)}
                      className="px-2.5 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
                      title="Lọc nhanh theo vai trò"
                    >
                      <option value="ALL">Tất cả vai trò</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="STAFF">STAFF</option>
                      <option value="ORGANIZER">ORGANIZER</option>
                    </select>
                  </div>
                </div>

                {/* Styled Scrollable User List */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40 p-1">
                  {filteredModalUsers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Không tìm thấy tài khoản nào phù hợp với từ khóa "{userSearchTerm}".
                    </div>
                  ) : (
                    filteredModalUsers.map((u) => {
                      const isSelected = selectedUserEmail.toLowerCase() === u.email.toLowerCase()
                      return (
                        <div
                          key={u.email}
                          onClick={() => setSelectedUserEmail(u.email)}
                          className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-orange-500 text-white shadow-xs'
                              : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : u.role === 'ADMIN' ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400' :
                                    u.role === 'STAFF' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' :
                                    'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400'
                              }`}>
                                {u.role}
                              </span>
                              <span className="font-extrabold text-xs truncate">
                                {u.fullName}
                              </span>
                              <span className={`text-[10px] font-mono ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                                #{u.userId}
                              </span>
                            </div>
                            <div className={`text-[11px] font-mono truncate mt-0.5 ${isSelected ? 'text-white/90' : 'text-slate-400'}`}>
                              {u.email}
                            </div>
                          </div>

                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-white text-orange-600 flex items-center justify-center flex-shrink-0">
                              <Check size={13} strokeWidth={3} />
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Auto preview user info after selection */}
              {chosenUser && (
                <div className="p-3.5 rounded-2xl bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/60 dark:border-orange-900/40 space-y-1.5">
                  <div className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wide">
                    Tài khoản đã chọn để đưa vào giám sát:
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <div>
                      <span className="text-slate-900 dark:text-white font-extrabold">{chosenUser.fullName}</span>
                      <span className="text-slate-400 font-mono text-[11px] ml-1.5">({chosenUser.email})</span>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300 font-bold">
                      {chosenUser.role} • #{chosenUser.userId}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false)
                    setUserSearchTerm('')
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!chosenUser}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white shadow-xs cursor-pointer transition-colors"
                >
                  Xác nhận thêm giám sát
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
