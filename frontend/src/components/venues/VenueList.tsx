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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {venues.map((venue) => {
        const availableAreasCount = venue.areas?.filter(a => a.status === 'AVAILABLE').length || 0
        
        return (
          <div 
            key={venue.venueId} 
            className={`bg-white rounded-lg border-2 p-5 hover:shadow-md transition-all cursor-pointer ${
              selectedVenueId === venue.venueId 
                ? 'border-blue-500 shadow-md' 
                : 'border-gray-200'
            }`}
            onClick={() => onSelect(venue)}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 mb-1">{venue.venueName}</h3>
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{venue.address}</span>
                </p>
                {availableAreasCount > 0 && (
                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    {availableAreasCount} phòng
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(venue)
                }}
                className="flex-1 px-3 py-2 text-sm text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 font-medium transition-colors"
              >
                Chỉnh sửa
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(venue.venueId)
                }}
                className="flex-1 px-3 py-2 text-sm text-red-600 bg-red-50 rounded-md hover:bg-red-100 font-medium transition-colors"
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
