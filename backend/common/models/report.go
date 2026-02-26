package models

import "time"

// Report represents a complaint/refund request from student
type Report struct {
	ReportID     int        `json:"report_id" db:"report_id"`
	UserID       int        `json:"user_id" db:"user_id"`
	TicketID     int        `json:"ticket_id" db:"ticket_id"`
	Title        string     `json:"title" db:"title"`
	Description  string     `json:"description" db:"description"`
	ImageURL     *string    `json:"image_url" db:"image_url"`
	Status       string     `json:"status" db:"status"` // PENDING, APPROVED, REJECTED
	CreatedAt    time.Time  `json:"created_at" db:"created_at"`
	ProcessedBy  *int       `json:"processed_by" db:"processed_by"` // staff_id
	ProcessedAt  *time.Time `json:"processed_at" db:"processed_at"`
	RefundAmount *float64   `json:"refund_amount" db:"refund_amount"`
	StaffNote    *string    `json:"staff_note" db:"staff_note"`
}

// ReportDetailStaffDTO contains full report information for staff view
type ReportDetailStaffDTO struct {
	ReportID     int       `json:"report_id"`
	TicketID     int       `json:"ticket_id"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	ImageURL     *string   `json:"image_url"`
	CreatedAt    time.Time `json:"created_at"`
	ReportStatus string    `json:"report_status"`

	// Student info
	StudentID   int    `json:"student_id"`
	StudentName string `json:"student_name"`

	// Ticket info
	TicketStatus string `json:"ticket_status"`

	// Category ticket info
	CategoryTicketID   int     `json:"category_ticket_id"`
	CategoryTicketName string  `json:"category_ticket_name"`
	Price              float64 `json:"price"` // ⭐ Giá vé gốc (refund amount)

	// Seat info
	SeatID   *int    `json:"seat_id"`
	SeatCode *string `json:"seat_code"`
	RowNo    *string `json:"row_no"`
	ColNo    *int    `json:"col_no"`

	// Area info
	AreaID   *int    `json:"area_id"`
	AreaName *string `json:"area_name"`
	Floor    *int    `json:"floor"`

	// Venue info
	VenueID   *int    `json:"venue_id"`
	VenueName *string `json:"venue_name"`
	Location  *string `json:"location"`
}

// ReportListStaffDTO contains summary report information for staff list view
type ReportListStaffDTO struct {
	ReportID     int       `json:"report_id"`
	TicketID     int       `json:"ticket_id"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	ImageURL     *string   `json:"image_url"`
	CreatedAt    time.Time `json:"created_at"`
	ReportStatus string    `json:"report_status"`

	// Student info
	StudentName string `json:"student_name"`

	// Ticket info
	TicketStatus string `json:"ticket_status"`

	// Category ticket info
	CategoryTicketName string  `json:"category_ticket_name"`
	Price              float64 `json:"price"`
}

// ProcessReportRequest is the request body for staff processing a report
type ProcessReportRequest struct {
	ReportID  int     `json:"reportId" validate:"required,gt=0"`
	Action    string  `json:"action" validate:"required,oneof=APPROVE REJECT"`
	StaffNote *string `json:"staffNote"`
}

// ProcessReportResponse is the response after processing a report
type ProcessReportResponse struct {
	Status       string   `json:"status"`
	Message      string   `json:"message"`
	RefundAmount *float64 `json:"refundAmount,omitempty"` // Only present when action=APPROVE
}
