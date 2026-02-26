import { Building2, PlusCircle, X } from 'lucide-react'
import { Area } from '../../services/venueService'

interface AreaListSectionProps {
  venueName: string
  venueAddress: string
  areas: Area[]
  onClose: () => void
  onAdd: () => void
  onEdit: (area: Area) => void
  onDelete: (areaId: number) => void
}

export default function AreaListSection({
  venueName,
  venueAddress,
  areas,
  onClose,
  onAdd,
  onEdit,
  onDelete
}: AreaListSectionProps) {
  // Hiển thị cả AVAILABLE và UNAVAILABLE areas, loại bỏ DELETED
  const visibleAreas = areas.filter(area => area.status !== 'DELETED')

  return (
    <div className="mt-8">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Danh sách phòng - {venueName}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {venueAddress}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              <PlusCircle className="w-4 h-4" />
              Thêm phòng
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {visibleAreas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleAreas.map((area) => (
              <div
                key={area.areaId}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-semibold text-gray-900 mb-3">
                  {area.areaName}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Tầng:</span>
                    <span className="font-medium text-gray-900">{area.floor}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Sức chứa:</span>
                    <span className="font-medium text-gray-900">{area.capacity} chỗ</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Trạng thái:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${area.status === 'AVAILABLE'
                      ? 'bg-green-100 text-green-800'
                      : area.status === 'UNAVAILABLE'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-gray-100 text-gray-800'
                      }`}>
                      {area.status === 'AVAILABLE'
                        ? 'Sẵn sàng'
                        : area.status === 'UNAVAILABLE'
                          ? 'Đang sử dụng'
                          : area.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => onEdit(area)}
                    className="flex-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 font-medium transition-colors"
                  >
                    Chỉnh sửa
                  </button>
                  <button
                    onClick={() => onDelete(area.areaId)}
                    className="flex-1 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-md hover:bg-red-100 font-medium transition-colors"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Chưa có phòng nào</p>
          </div>
        )}
      </div>
    </div>
  )
}
