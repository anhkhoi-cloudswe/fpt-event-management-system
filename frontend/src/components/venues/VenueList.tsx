import { Building2, MapPin } from 'lucide-react'
import { Venue } from '../../services/venueService'

interface VenueListProps {
  venues: Venue[]
  selectedVenueId: number | null
  onSelect: (venue: Venue) => void
  onEdit: (venue: Venue) => void
  onDelete: (venueId: number) => void
}

export default function VenueList({ venues, selectedVenueId, onSelect, onEdit, onDelete }: VenueListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
      {venues.map((venue) => {
        const availableAreasCount = venue.areas?.filter(a => a.status === 'AVAILABLE').length || 0
        const isSelected = selectedVenueId === venue.venueId
        
        return (
          <div 
            key={venue.venueId} 
            className={`bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-3xl border p-6 shadow-md hover:shadow-2xl hover:shadow-orange-500/10 hover:-translate-y-1 transition-all duration-500 cursor-pointer ${
              isSelected 
                ? 'border-orange-500 ring-2 ring-orange-500/25 bg-white/90 dark:bg-slate-800/90' 
                : 'border-white/80 dark:border-slate-800/80'
            }`}
            onClick={() => onSelect(venue)}
          >
            <div className="flex items-start gap-3.5 mb-5">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 border transition-all duration-300 ${
                isSelected 
                  ? 'bg-orange-100 text-orange-655 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-900/30' 
                  : 'bg-orange-50/50 text-orange-600 border-orange-100/50 dark:bg-slate-850 dark:text-orange-400 dark:border-slate-800'
              }`}>
                <Building2 className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-extrabold text-slate-800 dark:text-white text-base mb-1 truncate">{venue.venueName}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400 dark:text-slate-500" />
                  <span className="truncate">{venue.location}</span>
                </p>
                {availableAreasCount > 0 && (
                  <span className="inline-flex mt-3 px-2.5 py-1 text-[11px] font-extrabold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/30 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/30 shadow-sm">
                    🟢 {availableAreasCount} phòng hoạt động
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex gap-2 border-t border-slate-100/60 dark:border-slate-800 pt-4">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(venue)
                }}
                className="flex-1 px-4 py-2.5 text-xs font-bold text-orange-650 dark:text-orange-400 bg-orange-50/50 dark:bg-slate-850 border border-orange-200/20 dark:border-slate-700 hover:bg-orange-100/50 dark:hover:bg-slate-800 transition-all duration-300 active:scale-95"
              >
                Chỉnh sửa
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(venue.venueId)
                }}
                className="flex-1 px-4 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20 border border-red-200/20 dark:border-slate-700 hover:bg-red-100/50 dark:hover:bg-red-950/40 transition-all duration-300 active:scale-95"
              >
                Xóa
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
