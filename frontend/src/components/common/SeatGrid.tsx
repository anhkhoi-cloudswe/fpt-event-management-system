// ===================== FILE: src/components/common/SeatGrid.tsx =====================
// Component hiển thị sơ đồ ghế (grid) theo hàng/cột.
// - Nhận danh sách ghế từ BE
// - Gom ghế theo hàng (rowNo), tạo grid theo cột (colNo)
// - Hiển thị màu theo trạng thái ghế (AVAILABLE/BOOKED/HOLD...)
// - Cho phép chọn ghế (click) và trả ghế về component cha qua onSeatSelect
// - Có hỗ trợ: maxReached (đã chọn đủ ghế) và disabled (khóa toàn bộ grid)

import { useState } from 'react'

// ===================== TYPE: Seat =====================
// Kiểu dữ liệu ghế dùng trong toàn app
export type Seat = {
  seatId: number        // id ghế duy nhất
  seatCode: string      // mã ghế hiển thị (vd: A1, A2)
  rowNo?: string        // hàng (vd: A, B, C) - fallback property
  seatRow?: string      // ✅ NEW: from SQL alias seat_row
  colNo?: string        // cột (vd: 1, 2, 3) - fallback property
  seatColumn?: number   // ✅ NEW: from SQL alias seat_column
  status: string        // trạng thái ghế (AVAILABLE/BOOKED/HOLD/...)
  seatType?: string     // loại ghế (VIP/STANDARD) - từ Event_Seat_Layout
  categoryTicketId?: number // ✅ NEW: FK to category_ticket
  categoryName?: string // ✅ NEW: loại vé (VIP/STANDARD) - từ category_ticket.name
  areaId: number        // id khu vực
}

// ===================== PROPS =====================
// Props component cha truyền vào để SeatGrid render và xử lý click
interface SeatGridProps {
  seats: Seat[]                          // danh sách ghế
  loading?: boolean                      // đang load ghế hay không
  selectedSeats?: Seat[]                 // danh sách ghế đã chọn (để highlight)
  onSeatSelect?: (seat: Seat | null) => void // callback trả về ghế khi user click
  maxReached?: boolean                   // đã chọn đủ số ghế tối đa chưa (vd tối đa 4)
  // Khi true: khóa toàn bộ grid (read-only), dùng khi event đã kết thúc
  disabled?: boolean
  // Khi false: không cho chọn ghế nhưng vẫn hiển thị trạng thái ghế (view-only)
  allowSelect?: boolean
}

// ===================== COMPONENT =====================
export function SeatGrid({
  seats,
  loading = false,
  selectedSeats = [],
  onSeatSelect,
  maxReached = false,
  disabled = false,
  allowSelect = true,
}: SeatGridProps) {
  // error state hiện tại chưa set ở đâu (đang = null cố định),
  // nhưng để sẵn để sau này có thể hiển thị lỗi.
  const [error] = useState<string | null>(null)

  // ✅ FIXED: Only show ALLOCATED seats (categoryTicketId != null)
  // Organizer chỉ muốn xem những gì đã mua, KHÔNG quan tâm ghế chưa phân bổ
  // This ensures VIP stays in A-B, STANDARD stays in C-G when A2 exists
  const allSeats = seats.filter(seat =>
    seat.categoryTicketId !== null &&
    seat.categoryTicketId !== undefined
  )

  console.log(
    `[SeatGrid] Total ALLOCATED seats=${allSeats.length} (filtered categoryTicketId != null)`,
  )

  // ===================== UI: LOADING =====================
  // Nếu đang load danh sách ghế => hiển thị text loading
  if (loading) {
    return <p className="text-gray-500 mb-3">Đang tải danh sách ghế...</p>
  }

  // ===================== UI: ERROR =====================
  // Nếu có lỗi => hiển thị lỗi (hiện code này không set error nên hầu như không vào)
  if (error) {
    return <p className="text-red-500 mb-3">{error}</p>
  }

  // Debug: log danh sách ghế
  console.log('Seats state (raw):', seats)
  console.log('Seats length (raw):', seats.length)
  console.log('All seats (including unallocated):', allSeats.length)

  // 🔍 DIAGNOSTIC: Log first 3 seats to see field values
  if (allSeats.length > 0) {
    console.log('[SeatGrid] First seat data:', {
      seatId: allSeats[0].seatId,
      seatCode: allSeats[0].seatCode,
      categoryName: allSeats[0].categoryName,
      categoryTicketId: allSeats[0].categoryTicketId,
      seatType: allSeats[0].seatType,
      rowNo: allSeats[0].rowNo,
      seatRow: allSeats[0].seatRow,
      colNo: allSeats[0].colNo,
      seatColumn: allSeats[0].seatColumn,
      status: allSeats[0].status,
      areaId: allSeats[0].areaId,
    })
    if (allSeats.length > 1) {
      console.log('[SeatGrid] Second seat data:', {
        seatId: allSeats[1].seatId,
        seatCode: allSeats[1].seatCode,
        categoryName: allSeats[1].categoryName,
        categoryTicketId: allSeats[1].categoryTicketId,
        seatType: allSeats[1].seatType,
        rowNo: allSeats[1].rowNo,
        seatRow: allSeats[1].seatRow,
        colNo: allSeats[1].colNo,
        seatColumn: allSeats[1].seatColumn,
        status: allSeats[1].status,
      })
    }
  }

  // ===================== UI: EMPTY =====================
  // Nếu mảng ghế rỗng => báo không còn ghế
  if (allSeats.length === 0) {
    return (
      <p className="text-gray-600 mb-4">
        Hiện không còn ghế trống trong khu vực này.
      </p>
    )
  }

  // ===================== GROUP SEATS BY CATEGORY + ROW =====================
  // NEW APPROACH: Group by category first, then by row within each category
  // This prevents mixed sections like Row C having both VIP (C1) and STANDARD (C2-C10)

  // Helper to determine seat category (before grouping)
  const getSeatCategory = (seat: Seat): string => {
    // If seat has allocation (categoryTicketId), determine VIP or STANDARD
    if (seat.categoryTicketId !== null && seat.categoryTicketId !== undefined) {
      // PRIMARY: Check categoryName from category_ticket table
      if (seat.categoryName) {
        const catName = seat.categoryName.toUpperCase()
        if (catName.includes('VIP')) return 'VIP'
        if (catName.includes('STANDARD')) return 'STANDARD'
        return seat.categoryName // Return as-is if exact name
      }

      // SECONDARY: Check seatType from Event_Seat_Layout
      if (seat.seatType) {
        const seatT = seat.seatType.toUpperCase()
        if (seatT.includes('VIP')) return 'VIP'
        if (seatT.includes('STANDARD')) return 'STANDARD'
        return seat.seatType
      }

      // TERTIARY: Fallback to row letter (A-C = VIP, D-J = Standard)
      const rowKey = seat.seatRow || seat.rowNo || seat.seatCode.charAt(0)
      if (rowKey) {
        const rowCode = rowKey.toUpperCase()
        if (['A', 'B', 'C'].includes(rowCode)) return 'VIP'
        if (['D', 'E', 'F', 'G', 'H', 'I', 'J'].includes(rowCode)) return 'STANDARD'
      }
    }

    // Seat is unallocated (no categoryTicketId)
    return 'UNALLOCATED'
  }

  // Group seats: { 'VIP': { 'A': [seats], 'B': [seats] }, 'STANDARD': { 'C': [seats], 'D': [seats] }, ... }
  type CategorySections = Record<string, Record<string, Seat[]>>
  const seatsBySection: CategorySections = {}

  allSeats.forEach((seat) => {
    const category = getSeatCategory(seat)
    const rowKey = seat.seatRow || seat.rowNo || seat.seatCode.charAt(0) || 'X'

    if (!seatsBySection[category]) {
      seatsBySection[category] = {}
    }
    if (!seatsBySection[category][rowKey]) {
      seatsBySection[category][rowKey] = []
    }
    seatsBySection[category][rowKey].push(seat)
  })

  console.log('Seats grouped by category+row:', seatsBySection) // Debug log

  // ===================== FIND MAX COLUMNS =====================
  // Find max column across ALL categories and rows
  const maxColumns = Math.max(
    1,
    ...Object.values(seatsBySection).flatMap((categoryRows) =>
      Object.values(categoryRows).flatMap((rowSeats) =>
        rowSeats.map((s) => {
          // ✅ FIXED: Try multiple property names with fallback
          if (s.seatColumn) return s.seatColumn
          if (s.colNo) return parseInt(s.colNo)
          // Extract from seatCode (e.g., "A5" -> 5)
          const match = s.seatCode.match(/\d+/)
          return match ? parseInt(match[0]) : 1
        }),
      ),
    ),
  )

  // If a row has many columns, enable a compact mode for mobile:
  // - smaller buttons, tighter gaps, and allow wrapping to avoid a huge horizontal row
  const compactMode = maxColumns >= 10

  // ===================== CREATE FULL GRID FOR A ROW =====================
  // Tạo grid dạng (Seat | null)[] theo số cột maxCols
  // col từ 1..maxCols:
  // - nếu tìm thấy ghế đúng col => đưa ghế vào
  // - nếu không có => null (placeholder)
  const createSeatGrid = (rowSeats: Seat[], maxCols: number) => {
    const grid: (Seat | null)[] = []
    for (let col = 1; col <= maxCols; col++) {
      // ✅ FIXED: Try multiple property names with fallback
      const seat = rowSeats.find((s) => {
        if (s.seatColumn) return s.seatColumn === col
        if (s.colNo) return parseInt(s.colNo) === col
        // Extract from seatCode (e.g., "A5" -> 5)
        const match = s.seatCode.match(/\d+/)
        return match ? parseInt(match[0]) === col : false
      })
      // Nếu không có ghế => null
      grid.push(seat || null)
    }
    return grid
  }

  // ===================== COLOR/STYLE FOR A SEAT =====================
  // Return Tailwind className for seat styling based on status and allocation
  const getSeatColor = (
    seat: Seat,
    isSelected: boolean,
    gridDisabled: boolean = false,
  ) => {
    // Note: All seats here are ALLOCATED (filtered by categoryTicketId != null)
    // No need to check UNALLOCATED since they're already filtered out

    /**
     * Nếu grid disabled (event ended...) và ghế không được chọn:
     * -> hiển thị mờ + không cho tương tác
     * -> text-transparent để ẩn seatCode (trông như khóa toàn bộ)
     */
    if (gridDisabled && !isSelected) {
      return 'border-gray-200 bg-white cursor-not-allowed text-transparent'
    }

    // Nếu ghế đang được chọn => highlight xanh dương
    if (isSelected) return 'border-blue-600 bg-blue-100 font-semibold'

    /**
     * Nếu đã chọn đủ số ghế (maxReached) mà ghế này chưa chọn:
     * -> khóa các ghế còn lại (không cho chọn thêm)
     * -> text-transparent để ẩn seatCode
     */
    if (maxReached && !isSelected) {
      return 'border-gray-200 bg-white cursor-not-allowed text-transparent'
    }

    // Nếu ghế đã được đặt/chiếm => đỏ, disable
    if (
      seat.status === 'BOOKED' ||
      seat.status === 'RESERVED' ||
      seat.status === 'OCCUPIED'
    ) {
      return 'border-red-400 bg-red-100 cursor-not-allowed text-red-800'
    }

    // Nếu ghế đang giữ chỗ / hold => xám, disable
    if (seat.status === 'HOLD') {
      return 'border-gray-400 bg-gray-200 cursor-not-allowed text-gray-700'
    }

    // Mặc định xem là ghế trống (AVAILABLE) => xanh lá + hover
    return 'border-green-400 bg-green-50 hover:bg-green-100 text-green-800'
  }

  // ===================== PREPARE CATEGORY SECTIONS FOR RENDERING =====================
  // ✅ FIXED: Display VIP, STANDARD, and UNALLOCATED sections
  // UNALLOCATED rows needed to maintain 10-seat-per-row structure and prevent row splitting
  const sectionOrder: Array<{ key: string; label: string; borderColor: string; bgColor: string; labelStyle: string }> = [
    {
      key: 'VIP',
      label: 'VIP SECTION',
      borderColor: 'border-red-500',
      bgColor: 'bg-red-50/30',
      labelStyle: 'px-3 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full border border-red-300'
    },
    {
      key: 'STANDARD',
      label: 'STANDARD SECTION',
      borderColor: 'border-blue-400',
      bgColor: 'bg-blue-50/30',
      labelStyle: 'px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full border border-blue-300'
    },
    {
      key: 'UNALLOCATED',
      label: 'GHẾỞ TRỐNG',
      borderColor: 'border-gray-300',
      bgColor: 'bg-gray-50/20',
      labelStyle: 'px-3 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full border border-gray-300'
    }
  ]

  // Filter out empty sections
  const sectionsToRender = sectionOrder.filter(section =>
    seatsBySection[section.key] && Object.keys(seatsBySection[section.key]).length > 0
  )

  if (sectionsToRender.length === 0) {
    return <div className="text-center text-gray-500 py-4">Không có ghế nào.</div>
  }

  // ===================== RENDER UI =====================
  return (
    <div className="mb-6">
      {/* Hide native scrollbars for seat rows when overflow-x is used */}
      <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none;}`
      }</style>
      {/* ===================== RENDER CATEGORY SECTIONS ===================== */}
      {/* NEW APPROACH: Render each category as separate section */}
      <div className="space-y-6 max-w-4xl mx-auto px-2">
        {sectionsToRender.map((section) => {
          const rowsInSection = seatsBySection[section.key]
          const sortedRowsInSection = Object.keys(rowsInSection).sort()
          const firstRow = sortedRowsInSection[0]
          const lastRow = sortedRowsInSection[sortedRowsInSection.length - 1]

          return (
            <div key={section.key}>
              {/* Section Label */}
              <div className="mb-3 flex items-center gap-2 lg:justify-center">
                <div className={section.labelStyle}>
                  {section.label}
                </div>
              </div>

              {/* Rows in this category */}
              <div className="space-y-3">
                {sortedRowsInSection.map((row, rowIndex) => {
                  const seatsInRow = rowsInSection[row]
                  const seatGrid = createSeatGrid(seatsInRow, maxColumns)
                  const isFirstRow = rowIndex === 0
                  const isLastRow = rowIndex === sortedRowsInSection.length - 1

                  return (
                    <div key={row}>
                      {/* Row display: letter + seat buttons */}
                      <div className="flex items-center space-x-2 lg:justify-center">
                        {/* Row letter (A/B/C...) */}
                        <div className="w-5 sm:w-8 text-center font-semibold text-gray-700 text-xs sm:text-sm">
                          {row}
                        </div>

                        {/* Seat grid container with category border */}
                        <div
                          className={`flex ${compactMode
                              ? 'gap-0.5 sm:gap-2 overflow-x-auto hide-scrollbar flex-nowrap py-1'
                              : 'gap-1 sm:gap-2 overflow-x-auto hide-scrollbar flex-nowrap py-1'
                            } ${isFirstRow ? 'pt-3' : ''
                            } ${isLastRow ? 'pb-3' : ''
                            } pl-2 pr-2 border-l-4 border-r-4 ${section.borderColor} ${isFirstRow ? 'border-t-4 rounded-t-lg' : ''
                            } ${isLastRow ? 'border-b-4 rounded-b-lg' : ''
                            } ${section.bgColor}`}
                        >
                          {/* Render seat buttons */}
                          {seatGrid.map((seat, index) =>
                            seat ? (
                              <button
                                key={seat.seatId}
                                type="button"
                                onClick={() => {
                                  // Only allow booking AVAILABLE seats (all are allocated already)
                                  if (disabled || seat.status !== 'AVAILABLE') return
                                  if (!allowSelect) return
                                  if (typeof onSeatSelect !== 'function') return
                                  onSeatSelect(seat)
                                }}
                                disabled={
                                  disabled ||
                                  seat.status !== 'AVAILABLE' ||
                                  !allowSelect
                                }
                                className={`${compactMode
                                    ? 'w-6 h-6 sm:w-10 sm:h-8 text-[9px] sm:text-[11px]'
                                    : 'w-8 h-7 sm:w-12 sm:h-10 text-[10px] sm:text-xs'
                                  } border-2 rounded-lg font-medium transition-colors flex-shrink-0 ${getSeatColor(
                                    seat,
                                    selectedSeats.some((s) => s.seatId === seat.seatId),
                                    disabled,
                                  )}`}
                                title={
                                  disabled
                                    ? `${seat.seatCode}: sự kiện đã kết thúc`
                                    : `${seat.seatCode} (${section.key}): ${seat.status}`
                                }
                              >
                                {maxReached &&
                                  !selectedSeats.some((s) => s.seatId === seat.seatId)
                                  ? ''
                                  : seat.seatCode}
                              </button>
                            ) : (
                              // Empty grid cell placeholder
                              <div
                                key={`empty-${row}-${index}`}
                                className={`${compactMode
                                    ? 'w-6 h-6 sm:w-10 sm:h-8 flex-shrink-0'
                                    : 'w-8 h-7 sm:w-12 sm:h-10 flex-shrink-0'
                                  }`}
                              ></div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* ===================== LEGEND / CHÚ THÍCH ===================== */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs font-semibold text-gray-700 mb-2">Chú thích:</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center">
            <div className="w-6 h-6 bg-green-50 border-2 border-green-400 rounded mr-1.5"></div>
            <span>Ghế trống</span>
          </div>
          <div className="flex items-center">
            <div className="w-6 h-6 bg-gray-200 border-2 border-gray-400 rounded mr-1.5"></div>
            <span>Đang đặt</span>
          </div>
          <div className="flex items-center">
            <div className="w-6 h-6 bg-red-100 border-2 border-red-400 rounded mr-1.5"></div>
            <span>Đã đặt</span>
          </div>
        </div>
      </div>
    </div>
  )
}
