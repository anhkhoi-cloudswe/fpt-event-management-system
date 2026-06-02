import { useParams, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Download } from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useState, useEffect } from 'react'

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()

  // Theme detection
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return false
  })

  useEffect(() => {
    const handleThemeChange = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    }
    window.addEventListener('theme-change', handleThemeChange)
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, { attributes: true })
    return () => {
      window.removeEventListener('theme-change', handleThemeChange)
      observer.disconnect()
    }
  }, [])

  // Temporary - replace with API calls later
  const registrations: any[] = []
  const registration = registrations.find((r: any) => r.id === id)
  const event: any = null

  if (!registration || !event) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Không tìm thấy vé</p>
        <Link to="/my-tickets" className="text-blue-600 dark:text-blue-400 mt-4 inline-block hover:underline">
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
        className="inline-flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Quay lại
      </Link>

      <div className="max-w-2xl mx-auto">
        <div className={`rounded-lg shadow-lg p-8 transition-colors ${isDarkMode ? 'bg-slate-900 border border-slate-800 text-white' : 'bg-white text-slate-900'}`}>
          <div className="text-center mb-8">
            <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{event.title}</h1>
            <p className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Vé tham dự sự kiện</p>
          </div>

          <div className={`border-2 border-dashed rounded-lg p-8 mb-6 transition-colors ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-50'}`}>
            <div className="flex flex-col items-center">
              <QRCodeSVG
                value={registration.qrCode}
                size={200}
                level="H"
                includeMargin={true}
                fgColor={isDarkMode ? '#ffffff' : '#000000'}
                bgColor={isDarkMode ? '#1e293b' : '#ffffff'}
              />
              <p className={`mt-4 text-sm font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {registration.qrCode}
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Họ tên:</span>
              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{registration.userName}</span>
            </div>
            {registration.studentId && (
              <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Mã sinh viên:</span>
                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{registration.studentId}</span>
              </div>
            )}
            <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Email:</span>
              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{registration.userEmail}</span>
            </div>
            <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Thời gian:</span>
              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {format(new Date(event.startDate), 'dd/MM/yyyy HH:mm', { locale: vi })}
              </span>
            </div>
            <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Địa điểm:</span>
              <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{event.location}</span>
            </div>
            {registration.seatNumber && (
              <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Ghế ngồi:</span>
                <span className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{registration.seatNumber}</span>
              </div>
            )}
            <div className={`flex items-center justify-between py-3 border-b ${isDarkMode ? 'border-slate-700' : ''}`}>
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Trạng thái:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${registration.checkedIn
                  ? isDarkMode ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-800'
                  : isDarkMode ? 'bg-yellow-900/40 text-yellow-300' : 'bg-yellow-100 text-yellow-800'
                  }`}
              >
                {registration.checkedIn ? 'Đã check-in' : 'Chưa check-in'}
              </span>
            </div>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleDownload}
              className="flex-1 flex items-center justify-center bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 text-white py-3 rounded-lg transition-colors font-semibold"
            >
              <Download className="w-5 h-5 mr-2" />
              Tải vé
            </button>
            <Link
              to={`/events/${event.id}`}
              className={`flex-1 text-center py-3 rounded-lg transition-colors font-semibold ${isDarkMode ? 'border border-slate-700 hover:bg-slate-800' : 'border border-slate-300 hover:bg-slate-50'}`}
            >
              Xem sự kiện
            </Link>
          </div>

          <div className={`mt-6 p-4 rounded-lg border transition-colors ${isDarkMode ? 'bg-yellow-900/20 border-yellow-700/50' : 'bg-yellow-50 border-yellow-200'}`}>
            <p className={`text-sm ${isDarkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
              <strong>Lưu ý:</strong> Vui lòng mang theo vé QR này khi tham dự sự kiện.
              Nhân viên sẽ quét mã QR để check-in tại cửa vào.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

