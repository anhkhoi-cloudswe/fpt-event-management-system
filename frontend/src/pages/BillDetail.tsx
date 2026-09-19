//Hình như không dùng trang này
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, CreditCard, Download } from 'lucide-react'
import { formatVietnamDateTime } from '../utils/dateFormat'

type MockBill = {
  id: string
  createdAt: string
  totalAmount: number
  status: 'PENDING' | 'PAID' | 'CANCELED'
  items: {
    ticketId: string
    eventTitle: string
    seatCode?: string
    price: number
  }[]
}

// Temporary mock – replace with API later
const mockBills: MockBill[] = []

export default function BillDetail() {
  const { id } = useParams<{ id: string }>()
  const bill = mockBills.find(b => b.id === id)

  if (!bill) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-slate-400">Không tìm thấy hóa đơn</p>
        <Link to="/dashboard/bills" className="text-blue-600 dark:text-blue-400 mt-4 inline-block font-semibold">
          Quay lại danh sách hóa đơn
        </Link>
      </div>
    )
  }

  const handleDownload = () => {
    // Mock export – replace with real PDF/Excel export later
    alert('Tải hóa đơn thành công (mock).')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 lg:p-8">
      <Link
        to="/dashboard/bills"
        className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 mb-6 font-semibold text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Quay lại danh sách hóa đơn
      </Link>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-8">
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
                <FileText className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
                Hóa đơn #{bill.id}
              </h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Ngày tạo:{' '}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {formatVietnamDateTime(bill.createdAt, 'dd/MM/yyyy HH:mm:ss')}
                </span>
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                  bill.status === 'PAID'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    : bill.status === 'PENDING'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                }`}
              >
                <CreditCard className="w-4 h-4 mr-1" />
                {bill.status === 'PAID'
                  ? 'Đã thanh toán'
                  : bill.status === 'PENDING'
                    ? 'Chờ thanh toán'
                    : 'Đã hủy'}
              </span>
              <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">
                Tổng tiền:{' '}
                <span className="font-bold text-lg text-gray-900 dark:text-white">
                  {bill.totalAmount.toLocaleString('vi-VN')} đ
                </span>
              </p>
            </div>
          </div>

          <div className="py-4 my-4">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Chi tiết vé / hạng mục thanh toán
            </h2>
            {bill.items.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Không có hạng mục trong hóa đơn (mock data rỗng).
              </p>
            ) : (
              <div className="space-y-3">
                {bill.items.map(item => (
                  <div
                    key={item.ticketId}
                    className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-sm"
                  >
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">
                        {item.eventTitle}
                      </p>
                      <p className="text-gray-500 dark:text-slate-400 text-xs mt-0.5">
                        Vé #{item.ticketId}
                        {item.seatCode && ` • Ghế ${item.seatCode}`}
                      </p>
                    </div>
                    <p className="font-extrabold text-orange-600 dark:text-orange-400">
                      {item.price.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 shadow-md transition-all active:scale-95"
            >
              <Download className="w-4 h-4 mr-2" />
              Tải hóa đơn (PDF)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}


