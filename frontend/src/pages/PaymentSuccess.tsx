import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckCircle2, Ticket, Wallet, CreditCard } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { emitWalletRefresh } from '../hooks/useWallet'

export default function PaymentSuccess() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const [ticketIds, setTicketIds] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer')

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const status = params.get('status')

    if (status && status !== 'success') {
      navigate('/payment-failed' + location.search, { replace: true })
      return
    }

    setTicketIds(params.get('ticketIds') ?? params.get('ticketId'))
    setPaymentMethod(params.get('method') ?? 'bank_transfer')

    const newWalletParam = params.get('newWallet')
    if (newWalletParam) {
      const wallet = Number(newWalletParam)
      if (!Number.isNaN(wallet)) {
        setUser((prev) => prev ? { ...prev, wallet } : prev)
      }
    }

    try {
      emitWalletRefresh()
      sessionStorage.setItem('force-event-detail-refresh', params.get('eventId') || String(Date.now()))
    } catch {
      // Ignore storage/event errors on the success page.
    }
  }, [location.search, navigate, setUser])

  const ticketList = useMemo(() => {
    if (!ticketIds) return []
    return ticketIds.split(',').map((id) => id.trim()).filter(Boolean)
  }, [ticketIds])

  const methodLabel =
    paymentMethod === 'free'
      ? 'Đặt vé miễn phí'
      : paymentMethod === 'wallet'
        ? 'Thanh toán bằng ví'
        : 'Chuyển khoản ngân hàng'

  const MethodIcon = paymentMethod === 'wallet' ? Wallet : paymentMethod === 'free' ? Ticket : CreditCard

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/25">
            <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={3} />
          </div>

          <h1 className="mt-5 text-2xl font-black text-slate-950 dark:text-white">
            Thanh toán thành công
          </h1>

          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-bold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <MethodIcon className="h-4 w-4" />
            {methodLabel}
          </div>
        </div>

        {ticketList.length > 0 && (
          <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900/50 dark:bg-orange-950/20">
            <p className="text-center text-xs font-black uppercase tracking-widest text-orange-700 dark:text-orange-300">
              Mã vé
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {ticketList.map((ticketId) => (
                <span key={ticketId} className="rounded-lg bg-orange-600 px-3 py-1.5 font-mono text-sm font-black text-white">
                  #{ticketId}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => navigate('/my-tickets')}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700"
          >
            Xem vé của tôi
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Về trang chính
          </button>
        </div>
      </div>
    </div>
  )
}
