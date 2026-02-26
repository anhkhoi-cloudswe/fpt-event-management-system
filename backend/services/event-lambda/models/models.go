package models

import (
	"database/sql"
	"time"
)

// ============================================================
// EligibilityError - Error struct for event update eligibility check
// ============================================================
type EligibilityError struct {
	Code    string // EVENT_CLOSED, EVENT_TOO_CLOSE, etc.
	Message string
}

// Event represents an event in the system
// Maps to MySQL table: Event
type Event struct {
	EventID     int            `json:"eventId" db:"event_id"`
	Title       string         `json:"title" db:"title"`
	Description sql.NullString `json:"-" db:"description"`
	StartTime   time.Time      `json:"startTime" db:"start_time"`
	EndTime     time.Time      `json:"endTime" db:"end_time"`
	BannerURL   sql.NullString `json:"-" db:"banner_url"`
	AreaID      sql.NullInt64  `json:"-" db:"area_id"`
	SpeakerID   sql.NullInt64  `json:"-" db:"speaker_id"`
	MaxSeats    int            `json:"maxSeats" db:"max_seats"`
	Status      string         `json:"status" db:"status"`
	CreatedBy   sql.NullInt64  `json:"-" db:"created_by"`
	CreatedAt   time.Time      `json:"createdAt" db:"created_at"`

	// ✅ NEW: Per-event check-in/out config (NULL = use global config)
	CheckinOffset  sql.NullInt64 `json:"checkinOffset,omitempty" db:"checkin_offset"`   // Minutes before start_time to allow check-in
	CheckoutOffset sql.NullInt64 `json:"checkoutOffset,omitempty" db:"checkout_offset"` // Minutes after start_time to allow check-out
}

// Speaker represents a speaker in the system
// Maps to MySQL table: Speaker
type Speaker struct {
	SpeakerID int            `json:"speakerId" db:"speaker_id"`
	FullName  string         `json:"fullName" db:"full_name"`
	Bio       sql.NullString `json:"-" db:"bio"`
	Email     sql.NullString `json:"-" db:"email"`
	Phone     sql.NullString `json:"-" db:"phone"`
	AvatarURL sql.NullString `json:"-" db:"avatar_url"`
}

// VenueArea represents a venue area in the system
// Maps to MySQL table: Venue_Area
type VenueArea struct {
	AreaID   int            `json:"areaId" db:"area_id"`
	VenueID  int            `json:"venueId" db:"venue_id"`
	AreaName string         `json:"areaName" db:"area_name"`
	Floor    sql.NullString `json:"-" db:"floor"`
	Capacity sql.NullInt64  `json:"-" db:"capacity"`
	Status   string         `json:"status" db:"status"`
}

// Venue represents a venue in the system
// Maps to MySQL table: Venue
type Venue struct {
	VenueID   int            `json:"venueId" db:"venue_id"`
	VenueName string         `json:"venueName" db:"venue_name"`
	Location  sql.NullString `json:"-" db:"location"`
	Status    string         `json:"status" db:"status"`
}

// ============================================================
// EventListItem - KHỚP VỚI Java EventListDto
// Dùng cho: GET /api/events (trong openEvents và closedEvents)
// ============================================================
type EventListItem struct {
	EventID     int     `json:"eventId"`
	Title       string  `json:"title"`
	Description *string `json:"description"` // serializeNulls = true trong Java
	StartTime   string  `json:"startTime"`   // Timestamp -> ISO string
	EndTime     string  `json:"endTime"`
	MaxSeats    int     `json:"maxSeats"`
	Status      string  `json:"status"`
	BannerURL   *string `json:"bannerUrl"`

	// Venue Area info
	AreaID   *int    `json:"areaId"`
	AreaName *string `json:"areaName"`
	Floor    *string `json:"floor"`

	// Venue info
	VenueName     *string `json:"venueName"`
	VenueLocation *string `json:"venueLocation"`

	// ✅ NEW: Organizer ID để filter cho ORGANIZER role
	OrganizerID *int `json:"organizerId"`
}

// ============================================================
// EventDetailDto - KHỚP VỚI Java EventDetailDto
// Dùng cho: GET /api/events/detail?id=...
// ============================================================
type EventDetailDto struct {
	EventID     int     `json:"eventId"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	StartTime   string  `json:"startTime"`
	EndTime     string  `json:"endTime"`
	MaxSeats    int     `json:"maxSeats"`
	Status      string  `json:"status"`
	BannerURL   *string `json:"bannerUrl"`

	// Venue info
	VenueName *string `json:"venueName"`

	// Venue Area info
	AreaID       *int    `json:"areaId"`
	AreaName     *string `json:"areaName"`
	Floor        *string `json:"floor"`
	AreaCapacity *int    `json:"areaCapacity"`

	// Speaker info
	SpeakerName      *string `json:"speakerName"`
	SpeakerBio       *string `json:"speakerBio"`
	SpeakerAvatarURL *string `json:"speakerAvatarUrl"`
	SpeakerEmail     *string `json:"speakerEmail"`
	SpeakerPhone     *string `json:"speakerPhone"`

	// Danh sách loại vé
	Tickets []CategoryTicket `json:"tickets"`

	// Booking info - để frontend biết có lock không
	HasBookings *bool `json:"hasBookings,omitempty"`
}

// ============================================================
// CategoryTicket - KHỚP VỚI Java CategoryTicket
// ============================================================
type CategoryTicket struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	Name             string  `json:"name"`
	Description      *string `json:"description"`
	Price            float64 `json:"price"`
	MaxQuantity      int     `json:"maxQuantity"`
	Status           string  `json:"status"`
}

// Legacy types - for backward compatibility
type EventListResponse = EventListItem
type EventDetailResponse = EventDetailDto

// ============================================================
// EventRequest - Yêu cầu tạo sự kiện từ ORGANIZER
// KHỚP VỚI Java DTO/EventRequest.java
// ============================================================
type EventRequest struct {
	RequestID          int     `json:"requestId"`
	RequesterID        int     `json:"requesterId"`
	RequesterName      *string `json:"requesterName"`
	Title              string  `json:"title"`
	Description        *string `json:"description"`
	PreferredStartTime *string `json:"preferredStartTime"`
	PreferredEndTime   *string `json:"preferredEndTime"`
	ExpectedCapacity   *int    `json:"expectedCapacity"`
	Status             string  `json:"status"`
	CreatedAt          *string `json:"createdAt"`
	ProcessedBy        *int    `json:"processedBy"`
	ProcessedByName    *string `json:"processedByName"`
	ProcessedAt        *string `json:"processedAt"`
	OrganizerNote      *string `json:"organizerNote"`
	RejectReason       *string `json:"rejectReason"` // ✅ NEW: Lý do từ chối
	// ✅ NEW: Venue information (when APPROVED)
	VenueName    *string `json:"venueName"`
	AreaName     *string `json:"areaName"`
	Floor        *string `json:"floor"`
	AreaCapacity *int    `json:"areaCapacity"`

	// Optional event details when request has been approved and event created
	CreatedEventID *int    `json:"createdEventId"`
	EventStatus    *string `json:"eventStatus,omitempty"` // Status of created Event (UPDATING, OPEN, etc.)
	BannerURL      *string `json:"bannerUrl,omitempty"`
	// Nested speaker object for frontend convenience
	Speaker *SpeakerDTO      `json:"speaker,omitempty"`
	Tickets []CategoryTicket `json:"tickets,omitempty"`
}

// ============================================================
// CreateEventRequestBody - Request body từ FE
// ============================================================
type CreateEventRequestBody struct {
	Title              string  `json:"title"`
	Description        *string `json:"description"`
	PreferredStartTime string  `json:"preferredStartTime"`
	PreferredEndTime   string  `json:"preferredEndTime"`
	ExpectedCapacity   *int    `json:"expectedCapacity"`
}

// ============================================================
// ProcessEventRequestBody - Request body cho approve/reject
// ============================================================
type ProcessEventRequestBody struct {
	RequestID     int     `json:"requestId"`
	Action        string  `json:"action"` // APPROVED or REJECTED
	OrganizerNote *string `json:"organizerNote"`
	RejectReason  *string `json:"rejectReason"` // ✅ NEW: Lý do từ chối (bắt buộc nếu REJECTED)
	// Nếu APPROVED, cần thêm info để tạo event
	AreaID    *int    `json:"areaId"`
	SpeakerID *int    `json:"speakerId"`
	BannerURL *string `json:"bannerUrl"`
}

// ============================================================
// CancelEventRequest - Request body để hủy sự kiện hoặc yêu cầu (Organizer)
// ============================================================
// Hỗ trợ 2 scenario:
// 1. Hủy yêu cầu chưa được duyệt: Gửi requestId (eventId = 0)
// 2. Hủy sự kiện đã duyệt: Gửi eventId (requestId = 0)
type CancelEventRequest struct {
	EventID   int `json:"eventId"`   // ID của sự kiện đã APPROVED (có refund + release area)
	RequestID int `json:"requestId"` // ID của yêu cầu PENDING/UPDATING (chỉ update status)
}

// ============================================================
// CheckDailyQuotaResponse - Response cho API check quota
// ============================================================
type CheckDailyQuotaResponse struct {
	EventDate      string `json:"eventDate"`      // Date of event (YYYY-MM-DD)
	CurrentCount   int    `json:"currentCount"`   // Số event đã approved trong ngày
	MaxAllowed     int    `json:"maxAllowed"`     // Giới hạn (2)
	QuotaExceeded  bool   `json:"quotaExceeded"`  // true nếu >= 2
	CanApproveMore bool   `json:"canApproveMore"` // false nếu >= 2
	WarningMessage string `json:"warningMessage"` // Message cho frontend
}

// ============================================================
// UpdateEventRequest - Request body cho update event
// ============================================================
type UpdateEventRequest struct {
	EventID     int     `json:"eventId"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	StartTime   string  `json:"startTime"`
	EndTime     string  `json:"endTime"`
	MaxSeats    int     `json:"maxSeats"`
	BannerURL   *string `json:"bannerUrl"`
	AreaID      *int    `json:"areaId"`
	SpeakerID   *int    `json:"speakerId"`
}

// ============================================================
// UpdateEventDetailsRequest - Request body cho update event details
// KHỚP VỚI Java UpdateEventDetailsController
// ============================================================
type UpdateEventDetailsRequest struct {
	EventID   int                 `json:"eventId"`
	Speaker   *SpeakerDTO         `json:"speaker"`
	Tickets   []CategoryTicketDTO `json:"tickets"`
	BannerURL *string             `json:"bannerUrl"`
}

type SpeakerDTO struct {
	FullName  string  `json:"fullName"`
	Bio       *string `json:"bio"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	AvatarURL *string `json:"avatarUrl"`
}

type CategoryTicketDTO struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	Price       float64 `json:"price"`
	MaxQuantity int     `json:"maxQuantity"`
	Status      *string `json:"status"`
}

// ============================================================
// EventStatsResponse - Thống kê sự kiện
// ============================================================
type EventStatsResponse struct {
	EventID         int     `json:"eventId"`
	EventTitle      *string `json:"eventTitle,omitempty"`
	StartTime       *string `json:"startTime,omitempty"`
	TotalTickets    int     `json:"totalTickets"`
	CheckedInCount  int     `json:"totalCheckedIn"`  // ✅ FIX: Changed from checkedInCount to totalCheckedIn (match Frontend)
	CheckedOutCount int     `json:"totalCheckedOut"` // ✅ FIX: Changed from checkedOutCount to totalCheckedOut (match Frontend)
	BookedCount     int     `json:"bookedCount"`
	CancelledCount  int     `json:"cancelledCount"`
	RefundedCount   int     `json:"totalRefunded"` // ✅ NEW: Track refunded tickets count
	TotalRevenue    float64 `json:"totalRevenue"`
}

// ============================================================
// UpdateEventConfigRequest - Request body cho update check-in/out config
// Admin: eventId = -1 để update global config
// Organizer: eventId > 0 để update config riêng cho event của họ
// ============================================================
type UpdateEventConfigRequest struct {
	EventID                          int `json:"eventId"`                          // -1 = global config (admin only), >0 = specific event
	CheckinAllowedBeforeStartMinutes int `json:"checkinAllowedBeforeStartMinutes"` // Số phút cho phép check-in trước start_time
	MinMinutesAfterStart             int `json:"minMinutesAfterStart"`             // Số phút tối thiểu sau start_time mới cho phép check-out
}

// ============================================================
// SystemConfigResponse - Response trả về config hiện tại
// ============================================================
type SystemConfigResponse struct {
	CheckinAllowedBeforeStartMinutes int `json:"checkinAllowedBeforeStartMinutes"`
	MinMinutesAfterStart             int `json:"minMinutesAfterStart"`
}

// ============================================================
// EventConfigResponse - Response trả về config cho event cụ thể
// Source: "per-event" (đã có config riêng) hoặc "global" (dùng config mặc định)
// ============================================================
type EventConfigResponse struct {
	CheckinAllowedBeforeStartMinutes int    `json:"checkinAllowedBeforeStartMinutes"`
	MinMinutesAfterStart             int    `json:"minMinutesAfterStart"`
	Source                           string `json:"source"` // "per-event" hoặc "global"
	HasCheckinOffset                 bool   `json:"-"`      // Internal: có giá trị checkin_offset từ DB
	HasCheckoutOffset                bool   `json:"-"`      // Internal: có giá trị checkout_offset từ DB
}

// ============================================================
// AvailableAreaInfo - Thông tin địa điểm trống
// YÊU CẦU #4: Gợi ý địa điểm cho Staff khi chọn
// ============================================================
type AvailableAreaInfo struct {
	AreaID    int     `json:"areaId"`
	AreaName  string  `json:"areaName"`
	VenueName string  `json:"venueName"`
	Floor     *string `json:"floor"`
	Capacity  *int    `json:"capacity"`
	Status    string  `json:"status"`
}

// ============================================================
// UpdateEventRequestRequest - Request body cho update event request
// Organizer cập nhật thông tin yêu cầu sự kiện ở tab "Đã xử lý"
// Request phải có status = APPROVED để có thể update
// Sau khi update, status sẽ chuyển thành UPDATING
// NOTE: Core fields (title, description, times, capacity) là tùy chọn nhưng nếu được gửi lên, không được phép thay đổi
// Chỉ có thể thay đổi: speaker info, tickets, banner
// ✅ NEW: DryRun parameter - if true, only validate without committing to database
// ============================================================
type UpdateEventRequestRequest struct {
	RequestID          int                      `json:"requestId"`
	EventID            int                      `json:"eventId,omitempty"` // For APPROVED requests: created_event_id from event_request
	Title              string                   `json:"title,omitempty"`
	Description        string                   `json:"description,omitempty"`
	PreferredStartTime string                   `json:"preferredStartTime,omitempty"`
	PreferredEndTime   string                   `json:"preferredEndTime,omitempty"`
	ExpectedCapacity   int                      `json:"expectedCapacity,omitempty"`
	Status             string                   `json:"status"` // Always "UPDATING"
	Speaker            map[string]interface{}   `json:"speaker,omitempty"`
	Tickets            []map[string]interface{} `json:"tickets,omitempty"`
	BannerUrl          string                   `json:"bannerUrl,omitempty"`
	DryRun             bool                     `json:"dryRun,omitempty"` // ✅ NEW: If true, validate only, don't commit
}
