import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

export default function SeatManagement() {
  const { eventId } = useParams<{ eventId: string }>()
  
  // Temporary - replace with API calls later
  const event: any = null
  const seats: any[] = []
  
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null)

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Không tìm thấy sự kiện</p>
        <Link to="/events" className="text-blue-600 mt-4 inline-block">
          Quay lại danh sách
        </Link>
      </div>
    )
  }

  if (!event.hasSeating) {
    return (
      <div>
        <Link
          to={`/events/${eventId}`}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Quay lại
        </Link>
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <p className="text-gray-500">Sự kiện này không có quản lý ghế ngồi</p>
        </div>
      </div>
    )
  }

  // Group seats by row
  const seatsByRow: Record<string, typeof seats> = {}
  seats.forEach(seat => {
    if (!seatsByRow[seat.row]) {
      seatsByRow[seat.row] = []
    }
    seatsByRow[seat.row].push(seat)
  })

  const getSeatColor = (status: string) => {
    switch (status) {
      case 'Available':
        return 'bg-green-100 hover:bg-green-200 border-green-300'
      case 'Reserved':
        return 'bg-yellow-100 hover:bg-yellow-200 border-yellow-300'
      case 'Occupied':
        return 'bg-red-100 hover:bg-red-200 border-red-300'
      default:
        return 'bg-gray-100 border-gray-300'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'Available':
        return 'Trống'
      case 'Reserved':
        return 'Đã đặt'
      case 'Occupied':
        return 'Đã ngồi'
      default:
        return status
    }
  }

  const availableCount = seats.filter(s => s.status === 'Available').length
  const reservedCount = seats.filter(s => s.status === 'Reserved').length
  const occupiedCount = seats.filter(s => s.status === 'Occupied').length

  return (
    <div>
      <Link
        to={`/events/${eventId}`}
        className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Quay lại
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Quản lý ghế ngồi</h1>
        <p className="text-gray-600">Event ID: {eventId}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Tổng số ghế</p>
          <p className="text-2xl font-bold text-gray-900">{seats.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Trống</p>
          <p className="text-2xl font-bold text-green-600">{availableCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Đã đặt</p>
          <p className="text-2xl font-bold text-yellow-600">{reservedCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-600">Đã ngồi</p>
          <p className="text-2xl font-bold text-red-600">{occupiedCount}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6">
        <h3 className="font-semibold mb-3">Chú thích:</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-green-100 border-2 border-green-300 rounded mr-2"></div>
            <span className="text-sm">Trống</span>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-yellow-100 border-2 border-yellow-300 rounded mr-2"></div>
            <span className="text-sm">Đã đặt</span>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-8 bg-red-100 border-2 border-red-300 rounded mr-2"></div>
            <span className="text-sm">Đã ngồi</span>
          </div>
        </div>
      </div>

      {/* Stage indicator */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 text-center">
        <div className="bg-gray-200 rounded-lg py-4">
          <p className="font-semibold text-gray-700">Sân khấu / Bục phát biểu</p>
        </div>
      </div>

      {/* Seat Map */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="font-semibold mb-4">Sơ đồ ghế ngồi</h3>
        <div className="space-y-4">
          {Object.keys(seatsByRow).sort().map(row => (
            <div key={row} className="flex items-center space-x-2">
              <div className="w-12 text-center font-semibold text-gray-700">{row}</div>
              <div className="flex-1 flex flex-wrap gap-2">
                {seatsByRow[row]
                  .sort((a, b) => a.column - b.column)
                  .map(seat => (
                    <button
                      key={seat.id}
                      onClick={() => setSelectedSeat(seat.id)}
                      className={`w-12 h-12 border-2 rounded flex items-center justify-center text-sm font-medium transition-colors ${getSeatColor(seat.status)} ${
                        selectedSeat === seat.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                      title={`${seat.seatNumber}: ${getStatusLabel(seat.status)}`}
                    >
                      {seat.column}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seat Details */}
      {selectedSeat && (
        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <h3 className="font-semibold mb-4">Thông tin ghế</h3>
          {(() => {
            const seat = seats.find(s => s.id === selectedSeat)
            if (!seat) return null
            return (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Số ghế:</span>
                  <span className="font-medium">{seat.seatNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Trạng thái:</span>
                  <span className="font-medium">{getStatusLabel(seat.status)}</span>
                </div>
                {seat.registrationId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Mã đăng ký:</span>
                    <span className="font-medium">{seat.registrationId}</span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}



