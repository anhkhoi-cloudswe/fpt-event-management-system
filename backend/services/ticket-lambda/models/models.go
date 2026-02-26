package models

import (
	"time"
)

// ============================================================
// MyTicketResponse - KHỚP VỚI Java MyTicketResponse
// Dùng cho: GET /api/registrations/my-tickets
// ============================================================
type MyTicketResponse struct {
	TicketID      int        `json:"ticketId"`
	TicketCode    *string    `json:"ticketCode"` // qr_code_value
	EventName     *string    `json:"eventName"`
	VenueName     *string    `json:"venueName"`
	StartTime     *time.Time `json:"startTime"`
	Status        string     `json:"status"`
	CheckInTime   *time.Time `json:"checkInTime"`
	CheckOutTime  *time.Time `json:"checkOutTime"`
	Category      *string    `json:"category"`
	CategoryPrice *float64   `json:"categoryPrice"`
	SeatCode      *string    `json:"seatCode"`
	BuyerName     *string    `json:"buyerName"`
	PurchaseDate  *time.Time `json:"purchaseDate"`
}

// ============================================================
// CategoryTicket - Loại vé
// ============================================================
type CategoryTicket struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	EventID          int     `json:"eventId"`
	Name             string  `json:"name"`
	Description      *string `json:"description"`
	Price            float64 `json:"price"`
	MaxQuantity      int     `json:"maxQuantity"`
	Status           string  `json:"status"`
}

// ============================================================
// Ticket - Vé đã mua
// ============================================================
type Ticket struct {
	TicketID         int        `json:"ticketId"`
	EventID          int        `json:"eventId"`
	UserID           int        `json:"userId"`
	CategoryTicketID int        `json:"categoryTicketId"`
	SeatID           *int       `json:"seatId"`
	Status           string     `json:"status"`
	QRCodeValue      *string    `json:"qrCodeValue"`
	CheckinTime      *time.Time `json:"checkinTime"`
	CheckOutTime     *time.Time `json:"checkOutTime"`
	CreatedAt        time.Time  `json:"createdAt"`
}

// ============================================================
// Bill - Hóa đơn
// ============================================================
type Bill struct {
	BillID        int        `json:"billId"`
	UserID        int        `json:"userId"`
	TotalAmount   float64    `json:"totalAmount"`
	PaymentMethod *string    `json:"paymentMethod"`
	PaymentStatus string     `json:"paymentStatus"`
	CreatedAt     time.Time  `json:"createdAt"`
	PaidAt        *time.Time `json:"paidAt"`
}

// ============================================================
// BillDetail - Chi tiết hóa đơn
// ============================================================
type BillDetail struct {
	BillDetailID int     `json:"billDetailId"`
	BillID       int     `json:"billId"`
	TicketID     int     `json:"ticketId"`
	Price        float64 `json:"price"`
}

// ============================================================
// BuyTicketRequest - Request mua vé
// ============================================================
type BuyTicketRequest struct {
	EventID          int   `json:"eventId"`
	CategoryTicketID int   `json:"categoryTicketId"`
	SeatIDs          []int `json:"seatIds"`
	Quantity         int   `json:"quantity"`
}

// ============================================================
// MyBillResponse - Response danh sách hóa đơn
// ============================================================
type MyBillResponse struct {
	BillID        int        `json:"billId"`
	TotalAmount   float64    `json:"totalAmount"`
	PaymentMethod *string    `json:"paymentMethod"`
	PaymentStatus string     `json:"paymentStatus"`
	CreatedAt     time.Time  `json:"createdAt"`
	PaidAt        *time.Time `json:"paidAt"`
	EventName     *string    `json:"eventName"`
	TicketCount   int        `json:"ticketCount"`
}

// ============================================================
// TicketEmailData - Data for email sending
// ============================================================
type TicketEmailData struct {
	TicketID      int
	QRCode        string
	EventName     string
	EventDateTime time.Time
	Venue         string
	VenueName     string
	SeatCode      string
	CategoryName  string
	Price         float64
	Email         string
	FullName      string
	PDFBytes      []byte
}

// ============================================================
// PaginatedTicketsResponse - Paginated tickets với metadata
// ============================================================
type PaginatedTicketsResponse struct {
	Tickets      []MyTicketResponse `json:"tickets"`
	TotalPages   int                `json:"totalPages"`
	CurrentPage  int                `json:"currentPage"`
	TotalRecords int                `json:"totalRecords"`
}

// ============================================================
// PaginatedBillsResponse - Paginated bills với metadata
// ============================================================
type PaginatedBillsResponse struct {
	Bills        []MyBillResponse `json:"bills"`
	TotalPages   int              `json:"totalPages"`
	CurrentPage  int              `json:"currentPage"`
	TotalRecords int              `json:"totalRecords"`
}
