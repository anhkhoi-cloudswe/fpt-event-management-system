package models

// ============================================================
// Venue - Địa điểm tổ chức
// ============================================================
type Venue struct {
	VenueID   int         `json:"venueId"`
	VenueName string      `json:"venueName"`
	Location  *string     `json:"location"`
	Status    string      `json:"status"`
	Areas     []VenueArea `json:"areas,omitempty"`
}

// ============================================================
// VenueArea - Khu vực trong địa điểm
// ============================================================
type VenueArea struct {
	AreaID   int     `json:"areaId"`
	VenueID  int     `json:"venueId"`
	AreaName string  `json:"areaName"`
	Floor    *string `json:"floor"`
	Capacity *int    `json:"capacity"`
	Status   string  `json:"status"`
}

// ============================================================
// Seat - Ghế ngồi
// ============================================================
type Seat struct {
	SeatID            int      `json:"seatId"`
	AreaID            int      `json:"areaId"`
	SeatCode          string   `json:"seatCode"`
	Status            string   `json:"status"` // AVAILABLE, BOOKED, HOLD (từ Ticket status)
	Row               *string  `json:"row,omitempty"` // Fallback property name
	SeatRow           *string  `json:"seatRow,omitempty"` // ✅ NEW: From SQL alias seat_row
	Column            *int     `json:"column,omitempty"` // Fallback property name
	SeatColumn        *int     `json:"seatColumn,omitempty"` // ✅ NEW: From SQL alias seat_column
	SeatType          *string  `json:"seatType"` // VIP, STANDARD (từ Event_Seat_Layout hoặc category_ticket.name)
	CategoryTicketID  *int     `json:"categoryTicketId,omitempty"`  // ✅ FIXED: Pointer để handle NULL
	CategoryName      *string  `json:"categoryName,omitempty"`      // ✅ FIXED: Pointer để handle NULL
	Price             *float64 `json:"price,omitempty"`             // ✅ NEW: Price from category_ticket
}

// ============================================================
// FreeAreaResponse - Response cho API lấy area còn trống
// ============================================================
type FreeAreaResponse struct {
	AreaID       int     `json:"areaId"`
	AreaName     string  `json:"areaName"`
	Floor        *string `json:"floor"`
	Capacity     *int    `json:"capacity"`
	VenueID      int     `json:"venueId"`
	VenueName    string  `json:"venueName"`
	VenueAddress *string `json:"venueAddress"`
}

// ============================================================
// CreateVenueRequest - Request tạo venue mới
// ============================================================
type CreateVenueRequest struct {
	VenueName string  `json:"venueName"`
	Location  *string `json:"location"`
}

// ============================================================
// UpdateVenueRequest - Request cập nhật venue
// ============================================================
type UpdateVenueRequest struct {
	VenueID   int     `json:"venueId"`
	VenueName string  `json:"venueName"`
	Location  *string `json:"location"`
	Status    string  `json:"status"`
}

// ============================================================
// CreateAreaRequest - Request tạo area mới
// ============================================================
type CreateAreaRequest struct {
	VenueID  int    `json:"venueId"`
	AreaName string `json:"areaName"`
	Floor    int    `json:"floor"`
	Capacity int    `json:"capacity"`
}

// ============================================================
// UpdateAreaRequest - Request cập nhật area
// ============================================================
type UpdateAreaRequest struct {
	AreaID   int    `json:"areaId"`
	AreaName string `json:"areaName"`
	Floor    int    `json:"floor"`
	Capacity int    `json:"capacity"`
	Status   string `json:"status"`
}
