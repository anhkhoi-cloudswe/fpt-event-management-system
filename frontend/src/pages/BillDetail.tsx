//Hình như không dùng trang này
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileText, CreditCard, Download } from 'lucide-react'

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
        <p className="text-gray-500">Không tìm thấy hóa đơn</p>
        <Link to="/dashboard/bills" className="text-blue-600 mt-4 inline-block">
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
    <div>
      <Link
        to="/dashboard/bills"
        className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Quay lại
      </Link>

      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                <FileText className="w-6 h-6 mr-2 text-blue-600" />
                Hóa đơn #{bill.id}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Ngày tạo:{' '}
                <span className="font-medium">
                  {new Date(bill.createdAt).toLocaleString('vi-VN')}
                </span>
              </p>
            </div>
            <div className="text-right">
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  bill.status === 'PAID'
                    ? 'bg-green-100 text-green-800'
                    : bill.status === 'PENDING'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                <CreditCard className="w-4 h-4 mr-1" />
                {bill.status === 'PAID'
                  ? 'Đã thanh toán'
                  : bill.status === 'PENDING'
                  ? 'Chờ thanh toán'
                  : 'Đã hủy'}
              </span>
              <p className="mt-3 text-sm text-gray-500">
                Tổng tiền:{' '}
                <span className="font-semibold text-lg text-gray-900">
                  {bill.totalAmount.toLocaleString('vi-VN')} đ
                </span>
              </p>
            </div>
          </div>

          <div className="border-t border-b py-4 my-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Chi tiết vé / hạng mục thanh toán
            </h2>
            {bill.items.length === 0 ? (
              <p className="text-sm text-gray-500">
                Không có hạng mục trong hóa đơn (mock data rỗng).
              </p>
            ) : (
              <div className="space-y-3">
                {bill.items.map(item => (
                  <div
                    key={item.ticketId}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {item.eventTitle}
                      </p>
                      <p className="text-gray-500">
                        Vé #{item.ticketId}
                        {item.seatCode && ` • Ghế ${item.seatCode}`}
                      </p>
                    </div>
                    <p className="font-semibold text-gray-900">
                      {item.price.toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleDownload}
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
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


