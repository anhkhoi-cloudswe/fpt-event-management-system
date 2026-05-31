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
    <div className="mt-8 animate-fade-in-up">
      <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-white/80 p-6 sm:p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100/60">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900">
              Danh sách phòng - {venueName}
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              📍 {venueAddress}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-orange-500 text-white text-xs font-bold shadow-lg shadow-orange-500/20 hover:shadow-xl hover:shadow-orange-500/35 transition-all duration-300 hover:scale-[1.02] active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              Thêm phòng
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-orange-600 p-1.5 hover:bg-slate-100/50 rounded-xl transition-all duration-300 active:scale-95"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {visibleAreas.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleAreas.map((area) => (
              <div
                key={area.areaId}
                className="border border-white/80 bg-white/50 backdrop-blur-md rounded-3xl p-5 shadow-sm hover:shadow-2xl hover:shadow-orange-500/5 hover:border-orange-500/50 transition-all duration-500 flex flex-col justify-between"
              >
                <div>
                  <h3 className="font-extrabold text-slate-800 text-base mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                    {area.areaName}
                  </h3>
                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Tầng:</span>
                      <span className="font-extrabold text-slate-800">{area.floor}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Sức chứa:</span>
                      <span className="font-extrabold text-slate-800">{area.capacity} chỗ</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Trạng thái:</span>
                      <span className={`inline-flex px-2.5 py-1 text-[10px] font-extrabold rounded-full border shadow-sm ${
                        area.status === 'AVAILABLE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-250/20'
                          : area.status === 'UNAVAILABLE'
                            ? 'bg-orange-50 text-orange-700 border-orange-250/20'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        {area.status === 'AVAILABLE'
                          ? '🟢 Sẵn sàng'
                          : area.status === 'UNAVAILABLE'
                            ? '🟠 Đang sử dụng'
                            : area.status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-5 border-t border-slate-100/60 pt-4">
                  <button
                    onClick={() => onEdit(area)}
                    className="flex-1 px-3 py-2.5 text-xs font-bold text-orange-650 bg-orange-50/50 border border-orange-200/20 rounded-xl hover:bg-orange-100/50 transition-all duration-300 active:scale-95"
                  >
                    Chỉnh sửa
                  </button>
                  <button
                    onClick={() => onDelete(area.areaId)}
                    className="flex-1 px-3 py-2.5 text-xs font-bold text-red-650 bg-red-50/50 border border-red-200/20 rounded-xl hover:bg-red-100/50 transition-all duration-300 active:scale-95"
                  >
                    Xóa
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 bg-white/40 border border-slate-150 rounded-3xl shadow-inner">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-bold text-sm">Chưa có phòng nào</p>
          </div>
        )}
      </div>
    </div>
  )
}
