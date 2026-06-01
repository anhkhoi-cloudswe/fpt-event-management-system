import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { AlertTriangle, ShieldCheck, LogOut } from 'lucide-react'

export default function AccountRestoreOverlay() {
  const { user, refreshUser, logout } = useAuth()
  const { showToast } = useToast()
  const [isRestoring, setIsRestoring] = useState(false)

  const handleRestore = async () => {
    setIsRestoring(true)
    try {
      const res = await fetch('/api/auth/restore-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (res.ok) {
        showToast('success', 'Tài khoản của bạn đã được khôi phục thành công!')
        // Sync the context state (status will change back to ACTIVE)
        await refreshUser()
      } else {
        const data = await res.json()
        showToast('error', data.message || 'Khôi phục tài khoản thất bại')
      }
    } catch (err) {
      showToast('error', 'Có lỗi kết nối mạng xảy ra!')
    } finally {
      setIsRestoring(false)
    }
  }

  // Calculate remaining days if deletedAt exists (30 days from deletedAt)
  const getRemainingDays = () => {
    return 30 // Default fallback
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-lg bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 text-white rounded-3xl p-8 shadow-2xl text-center space-y-6 relative overflow-hidden">
        {/* Visual background lights */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Warning Icon Container */}
        <div className="p-4 bg-orange-500/10 border border-orange-500/20 text-orange-500 rounded-full w-fit mx-auto shadow-lg shadow-orange-500/5 animate-pulse">
          <AlertTriangle className="w-12 h-12" />
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight text-orange-500">
            Tài khoản đang chờ xóa
          </h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Trạng thái: PENDING_DELETE
          </p>
        </div>

        {/* Description Body */}
        <div className="text-sm text-slate-350 leading-relaxed font-medium space-y-3 bg-slate-900/50 border border-slate-800/80 p-5 rounded-2xl">
          <p>
            Chào <strong className="text-white">{user?.fullName}</strong>, tài khoản của bạn hiện đang trong trạng thái chờ xóa theo yêu cầu của bạn.
          </p>
          <p>
            Bạn có tối đa <strong className="text-orange-400">30 ngày</strong> kể từ lúc gửi yêu cầu để khôi phục tài khoản và toàn bộ dữ liệu. Sau 30 ngày, tài khoản sẽ bị xóa vĩnh viễn khỏi hệ thống FPT Event.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 text-white text-sm font-black rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all disabled:opacity-50"
          >
            <ShieldCheck size={16} />
            <span>{isRestoring ? 'Đang khôi phục...' : 'Khôi phục tài khoản'}</span>
          </button>
          
          <button
            onClick={logout}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-black rounded-2xl active:scale-95 transition-all"
          >
            <LogOut size={16} className="text-red-500" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    </div>
  )
}
