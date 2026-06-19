import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, Loader2, QrCode } from 'lucide-react'
import { api } from '../config/api'
import { useAuth } from '../contexts/AuthContext'

type AttendanceResponse = {
  eventName?: string
  status?: string
  alreadyDone?: boolean
  checkInTime?: string
  checkOutTime?: string
  message?: string
}

const formatTime = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function AttendanceConfirm() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const eventId = Number(params.get('eventId') || 0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AttendanceResponse | null>(null)
  const [error, setError] = useState('')

  const canConfirm = useMemo(() => Number.isFinite(eventId) && eventId > 0, [eventId])

  const confirmAttendance = async () => {
    if (!canConfirm) {
      setError('Ma QR khong hop le hoac thieu ma su kien.')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)
    try {
      const response = await api.post<AttendanceResponse>('/attendance/confirm', {
        eventId,
        action: 'CHECKOUT',
      })
      setResult(response.data)
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Khong the xac nhan tham du. Vui long thu lai.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neutral-950 text-slate-900 dark:text-white flex items-center justify-center px-4 py-10">
      <main className="w-full max-w-md rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-sm p-6">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 flex items-center justify-center">
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Xac nhan tham du su kien</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-neutral-400">
              Tai khoan: {user?.fullName || user?.email || 'Sinh vien'}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 p-4 text-sm">
          <p className="font-semibold text-slate-800 dark:text-neutral-100">Ma su kien #{eventId || '--'}</p>
          <p className="mt-1 text-slate-600 dark:text-neutral-400">
            He thong chi xac nhan neu tai khoan nay da dang ky ve cho su kien.
          </p>
        </div>

        {error && (
          <div className="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="mt-5 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">
                {result.alreadyDone ? 'Ban da xac nhan truoc do' : 'Xac nhan thanh cong'}
              </p>
              {result.eventName && <p className="mt-1">{result.eventName}</p>}
              {result.checkOutTime && <p className="mt-1">Thoi gian: {formatTime(result.checkOutTime)}</p>}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={confirmAttendance}
          disabled={loading || !canConfirm}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 dark:disabled:bg-neutral-700"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Xac nhan tham du
        </button>

        <Link
          to="/dashboard/my-tickets"
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/5"
        >
          Xem ve cua toi
        </Link>
      </main>
    </div>
  )
}
