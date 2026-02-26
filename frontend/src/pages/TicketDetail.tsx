import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Download } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  
  // Temporary - replace with API calls later
  const registrations: any[] = []
  const registration = registrations.find((r: any) => r.id === id)
  const event: any = null

  if (!registration || !event) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Không tìm thấy vé</p>
        <Link to="/my-tickets" className="text-blue-600 mt-4 inline-block">
          Quay lại
        </Link>
      </div>
    )
  }

  const handleDownload = () => {
    // Mock download functionality
    alert('Tải vé thành công!')
  }

  return (
    <div>
      <Link
        to="/my-tickets"
        className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Quay lại
      </Link>

      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{event.title}</h1>
            <p className="text-gray-600">Vé tham dự sự kiện</p>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 mb-6">
            <div className="flex flex-col items-center">
              <QRCodeSVG
                value={registration.qrCode}
                size={200}
                level="H"
                includeMargin={true}
              />
              <p className="mt-4 text-sm text-gray-600 font-mono">
                {registration.qrCode}
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-gray-600">Họ tên:</span>
              <span className="font-medium">{registration.userName}</span>
            </div>
            {registration.studentId && (
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Mã sinh viên:</span>
                <span className="font-medium">{registration.studentId}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-gray-600">Email:</span>
              <span className="font-medium">{registration.userEmail}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-gray-600">Thời gian:</span>
              <span className="font-medium">
                {format(new Date(event.startDate), 'dd/MM/yyyy HH:mm', { locale: vi })}
              </span>
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-gray-600">Địa điểm:</span>
              <span className="font-medium">{event.location}</span>
            </div>
            {registration.seatNumber && (
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-gray-600">Ghế ngồi:</span>
                <span className="font-medium">{registration.seatNumber}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-gray-600">Trạng thái:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  registration.checkedIn
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {registration.checkedIn ? 'Đã check-in' : 'Chưa check-in'}
              </span>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Download className="w-5 h-5 mr-2" />
              Tải vé
            </button>
            <Link
              to={`/events/${event.id}`}
              className="flex-1 text-center border border-gray-300 py-3 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Xem sự kiện
            </Link>
          </div>

          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Lưu ý:</strong> Vui lòng mang theo vé QR này khi tham dự sự kiện. 
              Nhân viên sẽ quét mã QR để check-in tại cửa vào.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

