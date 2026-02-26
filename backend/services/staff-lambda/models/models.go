package models

import (
	"database/sql"
	"time"
)

// ============================================================
// Staff Models - Check-in, Check-out
// KHỚP VỚI Java StaffCheckinController, StaffCheckoutController
// ============================================================

// CheckinRequest - Request check-in vé
type CheckinRequest struct {
	TicketCode string `json:"ticketCode"`
	TicketID   string `json:"ticketId"`
}

// CheckoutRequest - Request check-out vé
type CheckoutRequest struct {
	TicketCode string `json:"ticketCode"`
	TicketID   string `json:"ticketId"`
}

// CheckinResult - Kết quả check-in 1 vé
type CheckinResult struct {
	TicketID     int     `json:"ticketId"`
	Success      bool    `json:"success"`
	Error        *string `json:"error,omitempty"`
	Message      *string `json:"message,omitempty"`
	EventName    *string `json:"eventName,omitempty"`
	CustomerName *string `json:"customerName,omitempty"` // ✅ NEW
	SeatCode     *string `json:"seatCode,omitempty"`
	TicketCode   *string `json:"ticketCode,omitempty"`
	CheckInTime  *string `json:"checkInTime,omitempty"`
	PreviousTime *string `json:"previousTime,omitempty"` // ✅ NEW: Thời gian check-in trước đó (nếu trùng lặp)
}

// CheckoutResult - Kết quả check-out 1 vé
type CheckoutResult struct {
	TicketID     int     `json:"ticketId"`
	Success      bool    `json:"success"`
	Error        *string `json:"error,omitempty"`
	Message      *string `json:"message,omitempty"`
	EventName    *string `json:"eventName,omitempty"`
	CustomerName *string `json:"customerName,omitempty"` // ✅ NEW
	SeatCode     *string `json:"seatCode,omitempty"`
	TicketCode   *string `json:"ticketCode,omitempty"`
	CheckOutTime *string `json:"checkOutTime,omitempty"`
	PreviousTime *string `json:"previousTime,omitempty"` // ✅ NEW: Thời gian check-out trước đó (nếu trùng lặp)
}

// CheckinResponse - Response check-in
type CheckinResponse struct {
	Success      bool            `json:"success"`
	Message      string          `json:"message"`
	Results      []CheckinResult `json:"results"`
	SuccessCount int             `json:"successCount"`
	FailCount    int             `json:"failCount"`
}

// CheckoutResponse - Response check-out
type CheckoutResponse struct {
	Success      bool             `json:"success"`
	Message      string           `json:"message"`
	Results      []CheckoutResult `json:"results"`
	SuccessCount int              `json:"successCount"`
	FailCount    int              `json:"failCount"`
}

// TicketForCheckin - Thông tin vé cho check-in
type TicketForCheckin struct {
	TicketID         int        `json:"ticketId"`
	TicketCode       string     `json:"ticketCode"`
	Status           string     `json:"status"`
	CheckInTime      *time.Time `json:"checkInTime"`
	CheckOutTime     *time.Time `json:"checkOutTime"`
	EventID          int        `json:"eventId"`
	EventName        string     `json:"eventName"`
	EventStartTime   time.Time  `json:"eventStartTime"`
	EventEndTime     time.Time  `json:"eventEndTime"`
	SeatCode         *string    `json:"seatCode"`
	CategoryTicketID int        `json:"categoryTicketId"`
	CustomerName     string     `json:"customerName"`  // ✅ NEW: Tên khách hàng
	CustomerEmail    string     `json:"customerEmail"` // ✅ NEW: Email khách hàng

	// ✅ NEW: Per-event config for time validation
	EventCheckinOffset  sql.NullInt64 `json:"-"` // NULL = use global config
	EventCheckoutOffset sql.NullInt64 `json:"-"` // NULL = use global config
}

// ============================================================
// Report Models - Staff xử lý yêu cầu hoàn tiền/báo cáo lỗi
// KHỚP VỚI Java ReportDAO.listReportsForStaff()
// ============================================================

// ReportListResponse - Danh sách report cho staff
type ReportListResponse struct {
	ReportID           int     `json:"reportId"`
	TicketID           int     `json:"ticketId"`
	Title              *string `json:"title,omitempty"`
	Description        *string `json:"description,omitempty"`
	ImageURL           *string `json:"imageUrl,omitempty"`
	CreatedAt          string  `json:"createdAt"`
	ReportStatus       string  `json:"reportStatus"`
	StudentName        string  `json:"studentName"`
	TicketStatus       string  `json:"ticketStatus"`
	CategoryTicketName *string `json:"categoryTicketName,omitempty"`
	Price              float64 `json:"price"`
}

// ReportDetailResponse - Chi tiết report cho staff
// KHỚP VỚI Java ReportDAO.getReportDetailForStaff()
type ReportDetailResponse struct {
	ReportID           int     `json:"reportId"`
	TicketID           int     `json:"ticketId"`
	Title              *string `json:"title,omitempty"`
	Description        *string `json:"description,omitempty"`
	ImageURL           *string `json:"imageUrl,omitempty"`
	CreatedAt          string  `json:"createdAt"`
	ReportStatus       string  `json:"reportStatus"`
	StudentID          int     `json:"studentId"`
	StudentName        string  `json:"studentName"`
	TicketStatus       string  `json:"ticketStatus"`
	CategoryTicketID   int     `json:"categoryTicketId"`
	CategoryTicketName *string `json:"categoryTicketName,omitempty"`
	Price              float64 `json:"price"`
	// Seat info
	SeatID   *int    `json:"seatId,omitempty"`
	SeatCode *string `json:"seatCode,omitempty"`
	RowNo    *string `json:"rowNo,omitempty"`
	ColNo    *int    `json:"colNo,omitempty"`
	// Area info
	AreaID   *int    `json:"areaId,omitempty"`
	AreaName *string `json:"areaName,omitempty"`
	Floor    *int    `json:"floor,omitempty"`
	// Venue info
	VenueID   *int    `json:"venueId,omitempty"`
	VenueName *string `json:"venueName,omitempty"`
	Location  *string `json:"location,omitempty"`
}

// ============================================================
// System Config Models - Admin quản lý cấu hình hệ thống
// KHỚP VỚI Frontend SystemConfig.tsx
// ============================================================

// SystemConfigData - Dữ liệu cấu hình hệ thống
type SystemConfigData struct {
	MinMinutesAfterStart             int `json:"minMinutesAfterStart"`
	CheckinAllowedBeforeStartMinutes int `json:"checkinAllowedBeforeStartMinutes"`
}

// SystemConfigResponse - Response GET system config
type SystemConfigResponse struct {
	Success bool             `json:"success"`
	Data    SystemConfigData `json:"data"`
	Message string           `json:"message,omitempty"`
}
