package models

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrOverrideOverlap      = errors.New("khoảng thời gian ưu đãi bị trùng lặp với ưu đãi đã có của Organizer này")
	ErrConfirmationRequired = errors.New("CONFIRMATION_REQUIRED")
	ErrAdminRequired        = errors.New("chỉ Quản trị viên (Role ADMIN) mới có quyền truy cập")
	ErrTierFreeProtected    = errors.New("không được phép vô hiệu hóa hoặc thu phí gói FREE mặc định")
	ErrInvalidParameter     = errors.New("tham số không hợp lệ")
)

// ConfirmationRequiredError - Lỗi yêu cầu xác nhận khi override BPS cao hơn mức gói hiện tại
type ConfirmationRequiredError struct {
	Message       string
	CommissionBps int
	CurrentBps    int
}

func (e *ConfirmationRequiredError) Error() string {
	return fmt.Sprintf("CONFIRMATION_REQUIRED: %s", e.Message)
}

func (e *ConfirmationRequiredError) Is(target error) bool {
	return target == ErrConfirmationRequired
}

// SubscriptionTier - Thông tin cấu hình gói dịch vụ Organizer
type SubscriptionTier struct {
	TierID             int       `json:"tierId"`
	TierCode           string    `json:"tierCode"`
	Name               string    `json:"name"`
	Description        string    `json:"description"`
	PriceVND           int64     `json:"priceVnd"`
	BillingCycle       string    `json:"billingCycle"`
	CommissionBps      int       `json:"commissionBps"`
	MaxCapacityLimit   int       `json:"maxCapacityLimit"` // -1 = Không giới hạn, 100 cho FREE
	HasAdvancedReports bool      `json:"hasAdvancedReports"`
	IsActive           bool      `json:"isActive"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

// CreateSubscriptionTierRequest - Request tạo gói dịch vụ mới
type CreateSubscriptionTierRequest struct {
	TierCode           string `json:"tierCode"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	PriceVND           int64  `json:"priceVnd"`
	CommissionBps      int    `json:"commissionBps"`
	MaxCapacityLimit   int    `json:"maxCapacityLimit"`
	HasAdvancedReports bool   `json:"hasAdvancedReports"`
	IsActive           bool   `json:"isActive"`
}

// UserSubscription - Bản ghi gói dịch vụ kích hoạt của Organizer
type UserSubscription struct {
	SubscriptionID             int        `json:"subscriptionId"`
	UserID                     int        `json:"userId"`
	TierID                     int        `json:"tierId"`
	TierCode                   string     `json:"tierCode"`
	Status                     string     `json:"status"` // ACTIVE, EXPIRED, CANCELLED, UPGRADED
	StartDate                  time.Time  `json:"startDate"`
	EndDate                    time.Time  `json:"endDate"`
	AutoRenew                  bool       `json:"autoRenew"`
	AmountPaidVND              int64      `json:"amountPaidVnd"`
	ProratedCreditVND          int64      `json:"proratedCreditVnd"`
	ScheduledDowngradeTierID   *int       `json:"scheduledDowngradeTierId,omitempty"`
	ScheduledDowngradeTierCode *string    `json:"scheduledDowngradeTierCode,omitempty"`
	RequestID                  *string    `json:"requestId,omitempty"`
	CreatedAt                  time.Time  `json:"createdAt"`
	UpdatedAt                  time.Time  `json:"updatedAt"`
}

// RoleFeePolicy - Chính sách phí theo Role đặc thù (School Organizer)
type RoleFeePolicy struct {
	RoleCode           string    `json:"roleCode"`
	Name               string    `json:"name"`
	Description        string    `json:"description"`
	CommissionBps      int       `json:"commissionBps"`
	MaxCapacityLimit   int       `json:"maxCapacityLimit"`
	HasAdvancedReports bool      `json:"hasAdvancedReports"`
	IsActive           bool      `json:"isActive"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

// OrganizerFeeOverride - Ưu đãi hoa hồng riêng của Organizer
type OrganizerFeeOverride struct {
	OverrideID    int       `json:"overrideId"`
	OrganizerID   int       `json:"organizerId"`
	OrganizerName *string   `json:"organizerName,omitempty"`
	CommissionBps int       `json:"commissionBps"`
	Reason        string    `json:"reason"`
	StartDate     time.Time `json:"startDate"`
	EndDate       time.Time `json:"endDate"`
	CreatedBy     int       `json:"createdBy"`
	CreatedAt     time.Time `json:"createdAt"`
	Warning       string    `json:"warning,omitempty"`
}

// FeeAuditLog - Nhật ký kiểm toán thay đổi biểu phí
type FeeAuditLog struct {
	LogID        int       `json:"logId"`
	TargetEntity string    `json:"targetEntity"`
	TargetID     string    `json:"targetId"`
	Action       string    `json:"action"`
	OldValue     *string   `json:"oldValue,omitempty"`
	NewValue     *string   `json:"newValue,omitempty"`
	Reason       string    `json:"reason"`
	ChangedBy    int       `json:"changedBy"`
	ChangedByName *string  `json:"changedByName,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

// PlatformSystemParameter - Tham số hệ thống chung
type PlatformSystemParameter struct {
	ParamKey    string    `json:"paramKey"`
	ParamValue  string    `json:"paramValue"`
	Description string    `json:"description"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// CurrentSubscriptionResponse - Thông tin gói và quyền hạn hiện tại của Organizer
type CurrentSubscriptionResponse struct {
	OrganizerID                int       `json:"organizerId"`
	Role                       string    `json:"role"`
	TierCode                   string    `json:"tierCode"`
	TierName                   string    `json:"tierName"`
	MaxCapacityLimit           int       `json:"maxCapacityLimit"`
	CommissionBps              int       `json:"commissionBps"`
	HasAdvancedReports         bool      `json:"hasAdvancedReports"`
	FeeSource                  string    `json:"feeSource"` // ROLE, TIER, FREE, OVERRIDE
	Status                     string    `json:"status"`
	StartDate                  time.Time `json:"startDate"`
	EndDate                    time.Time `json:"endDate"`
	DaysRemaining              int       `json:"daysRemaining"`
	AutoRenew                  bool      `json:"autoRenew"`
	ScheduledDowngradeTierCode *string   `json:"scheduledDowngradeTierCode,omitempty"`
}

// SubscriptionPaymentLog - Nhật ký thanh toán / gia hạn từng giao dịch
type SubscriptionPaymentLog struct {
	PaymentID         int       `json:"paymentId"`
	SubscriptionID    int       `json:"subscriptionId"`
	UserID            int       `json:"userId"`
	TierID            int       `json:"tierId"`
	TierCode          string    `json:"tierCode"`
	ActionType        string    `json:"actionType"` // INITIAL, RENEWAL, UPGRADE, AUTO_RENEW
	AmountPaidVND     int64     `json:"amountPaidVnd"`
	ProratedCreditVND int64     `json:"proratedCreditVnd"`
	RequestID         *string   `json:"requestId,omitempty"`
	StartDate         time.Time `json:"startDate"`
	EndDate           time.Time `json:"endDate"`
	CreatedAt         time.Time `json:"createdAt"`
}

// SubscribeRequest - Yêu cầu mua / gia hạn / nâng cấp gói
type SubscribeRequest struct {
	TierCode  string `json:"tierCode"`
	RequestID string `json:"requestId"` // Idempotency key
	AutoRenew *bool  `json:"autoRenew,omitempty"`
	Action    string `json:"action,omitempty"` // BUY (mặc định), RENEW, UPGRADE
}

// UpdateAutoRenewRequest - Yêu cầu bật / tắt tự động gia hạn
type UpdateAutoRenewRequest struct {
	AutoRenew bool `json:"autoRenew"`
}

// SubscribeResponse - Kết quả mua gói
type SubscribeResponse struct {
	SubscriptionID int       `json:"subscriptionId"`
	TierCode       string    `json:"tierCode"`
	AmountPaid     int64     `json:"amountPaid"`
	ProratedCredit int64     `json:"proratedCredit"`
	StartDate      time.Time `json:"startDate"`
	EndDate        time.Time `json:"endDate"`
	Message        string    `json:"message"`
}

// FeeSimulationRequest - Tham số thử tính toán hoa hồng
type FeeSimulationRequest struct {
	OrganizerID    *int    `json:"organizerId,omitempty"`
	RoleCode       *string `json:"roleCode,omitempty"`
	TierCode       *string `json:"tierCode,omitempty"`
	TicketPrice    float64 `json:"ticketPrice"`
	TicketQuantity int     `json:"ticketQuantity"`
}

// FeeSimulationResponse - Kết quả mô phỏng hoa hồng
type FeeSimulationResponse struct {
	TicketPrice        float64 `json:"ticketPrice"`
	TicketQuantity     int     `json:"ticketQuantity"`
	GrossAmount        float64 `json:"grossAmount"`
	CommissionBps      int     `json:"commissionBps"`
	CommissionPercent  float64 `json:"commissionPercent"`
	FixedFeePerTicket  float64 `json:"fixedFeePerTicket"`
	CommissionAmount   float64 `json:"commissionAmount"`
	TotalFixedFee      float64 `json:"totalFixedFee"`
	TotalPlatformFee   float64 `json:"totalPlatformFee"`
	NetAmount          float64 `json:"netAmount"`
	TierCode           string  `json:"tierCode"`
	FeeSource          string  `json:"feeSource"`
	ConfigVersion      int     `json:"configVersion"`
}

// FormatCurrencyVND định dạng số tiền VNĐ: dưới 1 triệu dạng 'k' (vd 299k), từ 1 triệu dạng 'x,y triệu'
// MaskTicketCode che mã vé / QR token để bảo mật danh sách check-in
func MaskTicketCode(rawCode string) string {
	rawCode = strings.TrimSpace(rawCode)
	if rawCode == "" {
		return ""
	}
	if len(rawCode) > 8 {
		prefix := rawCode[:4]
		suffix := rawCode[len(rawCode)-4:]
		return fmt.Sprintf("%s****%s", prefix, suffix)
	}
	if len(rawCode) > 4 {
		return fmt.Sprintf("%s**%s", rawCode[:2], rawCode[len(rawCode)-2:])
	}
	return "***"
}

// EscapeCSVField chống lỗi CSV Injection bằng cách chèn dấu ' trước ô bắt đầu bằng =, +, -, @, \t, \r (sau khi trim space)
// BẢO VỆ SỐ ÂM: Chuỗi biểu diễn số âm (vd "-100000", "-123.45") KHÔNG được chèn dấu nháy đơn
// ĐỂ csv.Writer TỰ QUOTE KHI GHI FILE (tránh lỗi bao đôi ""..."" RFC 4180)
func EscapeCSVField(val string) string {
	trimmed := strings.TrimSpace(val)
	if trimmed == "" {
		return ""
	}

	// Kiểm tra nếu là số âm (vd "-100000", "-123.45") thì GIỮ NGUYÊN, không chèn dấu nháy đơn
	if strings.HasPrefix(trimmed, "-") && len(trimmed) > 1 {
		isNumber := true
		for _, ch := range trimmed[1:] {
			if (ch < '0' || ch > '9') && ch != '.' && ch != ',' {
				isNumber = false
				break
			}
		}
		if isNumber {
			return trimmed
		}
	}

	if strings.HasPrefix(trimmed, "=") || strings.HasPrefix(trimmed, "+") || strings.HasPrefix(trimmed, "-") || strings.HasPrefix(trimmed, "@") || strings.HasPrefix(trimmed, "\t") || strings.HasPrefix(trimmed, "\r") {
		return "'" + trimmed
	}
	return trimmed
}

// FormatCurrencyVND định dạng hiển thị tiền tệ tiếng Việt dùng hoàn toàn số nguyên (không float64):
// - Dưới 1 triệu: dạng 'k' (vd: 299000 -> "299k", 1234 -> "1,23k", 999999 -> "1000k", 0 -> "0k")
// - Từ 1 triệu trở lên: dạng 'x,y triệu' (vd: 1000000 -> "1 triệu", 1050000 -> "1,05 triệu", 1234567 -> "1,23 triệu")
// - Số âm: thêm tiền tố '-' (vd: -299000 -> "-299k", -1050000 -> "-1,05 triệu")
// LƯU Ý: Hàm này chỉ dùng để định dạng chuỗi hiển thị trên UI (tối đa 2 chữ số thập phân). API luôn trả về số nguyên int64 (VND).
func FormatCurrencyVND(amount int64) string {
	if amount == 0 {
		return "0k"
	}
	isNegative := amount < 0
	absAmount := amount
	if isNegative {
		absAmount = -amount
	}

	var formatted string
	if absAmount < 1_000_000 {
		kVal := absAmount / 1000
		rem := absAmount % 1000
		if rem == 0 {
			formatted = fmt.Sprintf("%dk", kVal)
		} else {
			d2 := (rem + 5) / 10
			if d2 >= 100 {
				kVal++
				formatted = fmt.Sprintf("%dk", kVal)
			} else {
				remStr := fmt.Sprintf("%02d", d2)
				remStr = strings.TrimRight(remStr, "0")
				if kVal == 0 {
					formatted = fmt.Sprintf("0,%sk", remStr)
				} else {
					formatted = fmt.Sprintf("%d,%sk", kVal, remStr)
				}
			}
		}
	} else {
		mVal := absAmount / 1_000_000
		rem := absAmount % 1_000_000
		if rem == 0 {
			formatted = fmt.Sprintf("%d triệu", mVal)
		} else {
			d2 := (rem + 5000) / 10000
			if d2 >= 100 {
				mVal++
				formatted = fmt.Sprintf("%d triệu", mVal)
			} else {
				remStr := fmt.Sprintf("%02d", d2)
				remStr = strings.TrimRight(remStr, "0")
				formatted = fmt.Sprintf("%d,%s triệu", mVal, remStr)
			}
		}
	}

	if isNegative {
		return "-" + formatted
	}
	return formatted
}

// EventFinancialOverview - Tổng quan 3 cột tiền tài chính sự kiện (Pha 5)
type EventFinancialOverview struct {
	EventID                   int       `json:"eventId"`
	Title                     string    `json:"title"`
	OrganizerID               int       `json:"organizerId,omitempty"`
	OrganizerName             string    `json:"organizerName,omitempty"`
	TotalGrossRevenue         int64     `json:"totalGrossRevenue"`        // Cột 1: Doanh thu thanh toán (gross)
	TotalGrossFormatted       string    `json:"totalGrossFormatted"`      // Định dạng: 299k, 1,5 triệu
	TotalPlatformFee          int64     `json:"totalPlatformFee"`         // Cột 2: Phí hoa hồng (commission_amount, ĐÃ gồm fixed_fee, không cộng lại)
	TotalPlatformFeeFormatted string    `json:"totalPlatformFeeFormatted"`
	TotalNetProfit            int64     `json:"totalNetProfit"`           // Cột 3: Doanh thu thực nhận (net)
	TotalNetFormatted         string    `json:"totalNetFormatted"`
	TotalTicketsSold          int       `json:"totalTicketsSold"`         // Đếm từ bảng ticket (trừ REFUNDED, gồm vé miễn phí)
	TotalTicketsRefunded      int       `json:"totalTicketsRefunded"`
	Currency                  string    `json:"currency"`
	IsSettled                 bool      `json:"isSettled"`
	CreatedAt                 time.Time `json:"createdAt"`
}

// EventCheckInItem - Chi tiết vé trong danh sách check-in thời gian thực (Pha 5)
type EventCheckInItem struct {
	TicketID         int        `json:"ticketId"`
	TicketCode       string     `json:"ticketCode"`
	CategoryTicketID int        `json:"categoryTicketId"`
	CategoryName     string     `json:"categoryName"`
	PriceVND         int64      `json:"priceVnd"`
	PriceFormatted   string     `json:"priceFormatted"`
	UserID           int        `json:"userId"`
	AttendeeName     string     `json:"attendeeName"`
	AttendeeEmail    string     `json:"attendeeEmail"`
	SeatCode         string     `json:"seatCode,omitempty"`
	Status           string     `json:"status"`
	CheckedInAt      *time.Time `json:"checkedInAt,omitempty"`
	CheckedOutAt     *time.Time `json:"checkedOutAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
}

// EventCategorySeatStatus - Phân tích trạng thái ghế / đăng ký theo loại vé (Pha 5)
type EventCategorySeatStatus struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	CategoryName     string  `json:"categoryName"`
	Price            int64   `json:"price"`
	PriceFormatted   string  `json:"priceFormatted"`
	TotalCapacity    int     `json:"totalCapacity"`
	SoldSeats        int     `json:"soldSeats"`
	RemainingSeats   int     `json:"remainingSeats"`
	CheckedInSeats   int     `json:"checkedInSeats"`
	CheckedOutSeats  int     `json:"checkedOutSeats"`
	FillRatePercent  float64 `json:"fillRatePercent"`
}

// EventRealtimeSeatStatusResponse - Tổng quan trạng thái ghế và đăng ký thời gian thực (Pha 5)
type EventRealtimeSeatStatusResponse struct {
	EventID         int                       `json:"eventId"`
	Title           string                    `json:"title"`
	TotalCapacity   int                       `json:"totalCapacity"`
	TotalSold       int                       `json:"totalSold"`
	TotalRemaining  int                       `json:"totalRemaining"`
	TotalCheckedIn  int                       `json:"totalCheckedIn"`
	TotalCheckedOut int                       `json:"totalCheckedOut"`
	Categories      []EventCategorySeatStatus `json:"categories"`
}

// HourlyCheckInPoint - Thống kê check-in theo khung giờ (Pha 6)
type HourlyCheckInPoint struct {
	Hour  int `json:"hour"`  // Khung giờ 0 - 23
	Count int `json:"count"` // Số lượt check-in
}

// CategorySalesBreakdown - Phân tích doanh thu và loại vé đa chiều (Pha 6)
type CategorySalesBreakdown struct {
	CategoryTicketID int     `json:"categoryTicketId"`
	CategoryName     string  `json:"categoryName"`
	Price            int64   `json:"price"`
	PriceFormatted   string  `json:"priceFormatted"`
	TotalCapacity    int     `json:"totalCapacity"`
	SoldSeats        int     `json:"soldSeats"`
	RemainingSeats   int     `json:"remainingSeats"`
	CheckedInSeats   int     `json:"checkedInSeats"`
	GrossRevenue     int64   `json:"grossRevenue"`
	GrossFormatted   string  `json:"grossFormatted"`
	PlatformFee      int64   `json:"platformFee"`
	NetProfit        int64   `json:"netProfit"`
	NetFormatted     string  `json:"netFormatted"`
	FillRatePercent  float64 `json:"fillRatePercent"`
}

// DailySalesPoint - Chuỗi thời gian doanh thu và số vé bán theo ngày (Pha 6)
type DailySalesPoint struct {
	Date           string `json:"date"` // Dạng 'YYYY-MM-DD'
	TicketsSold    int    `json:"ticketsSold"`
	GrossRevenue   int64  `json:"grossRevenue"`
	PlatformFee    int64  `json:"platformFee"`
	NetProfit      int64  `json:"netProfit"`
	GrossFormatted string `json:"grossFormatted"`
	NetFormatted   string `json:"netFormatted"`
}

// EventAdvancedAnalyticsResponse - Báo cáo nâng cao đa chiều dành riêng cho gói Pro / Business / School Organizer / Admin (Pha 6)
type EventAdvancedAnalyticsResponse struct {
	EventID                   int                      `json:"eventId"`
	Title                     string                   `json:"title"`
	TotalGrossRevenue         int64                    `json:"totalGrossRevenue"`
	TotalGrossFormatted       string                   `json:"totalGrossFormatted"`
	TotalPlatformFee          int64                    `json:"totalPlatformFee"`
	TotalPlatformFeeFormatted string                   `json:"totalPlatformFeeFormatted"`
	TotalNetProfit            int64                    `json:"totalNetProfit"`
	TotalNetFormatted         string                   `json:"totalNetFormatted"`
	TotalTicketsSold          int                      `json:"totalTicketsSold"`
	CheckedInTickets          int                      `json:"checkedInTickets"`
	CheckInRatePercent        float64                  `json:"checkInRatePercent"`
	AverageOrderValue         int64                    `json:"averageOrderValue"`
	TotalCapacity             int                      `json:"totalCapacity"`
	FillRatePercent           float64                  `json:"fillRatePercent"`
	Timeline                  []DailySalesPoint        `json:"timeline"`
	CategoryBreakdown         []CategorySalesBreakdown `json:"categoryBreakdown"`
	HourlyCheckIns            []HourlyCheckInPoint     `json:"hourlyCheckIns"`
	HasAdvancedReports        bool                     `json:"hasAdvancedReports"`
}

// PreviewUpgradeRequest - Yêu cầu tính thử chi phí nâng cấp gói
type PreviewUpgradeRequest struct {
	TargetTierCode string `json:"targetTierCode"`
}

// PreviewUpgradeResponse - Chi tiết bảng tính nâng cấp gói kèm Prorated Credit
type PreviewUpgradeResponse struct {
	TargetTierCode string `json:"targetTierCode"`
	OriginalPrice  int64  `json:"originalPrice"`
	ProratedCredit int64  `json:"proratedCredit"`
	NetPay         int64  `json:"netPay"`
	DaysRemaining  int    `json:"daysRemaining"`
}

// PublicFeeParametersResponse - Các tham số biểu phí công khai chỉ đọc cho client/guest
type PublicFeeParametersResponse struct {
	FixedFeePerTicket      int64 `json:"fixedFeePerTicket"`
	FixedFeeMinTicketPrice int64 `json:"fixedFeeMinTicketPrice"`
}

// SubscriptionSubscriberItem - Chi tiết thông tin Organizer đã mua/đang dùng gói
type SubscriptionSubscriberItem struct {
	SubscriptionID int       `json:"subscriptionId"`
	UserID         int       `json:"userId"`
	FullName       string    `json:"fullName"`
	Email          string    `json:"email"`
	TierCode       string    `json:"tierCode"`
	TierName       string    `json:"tierName"`
	Status         string    `json:"status"` // ACTIVE, EXPIRED, CANCELLED, UPGRADED
	AmountPaidVND  int64     `json:"amountPaidVnd"`
	AutoRenew      bool      `json:"autoRenew"`
	StartDate      time.Time `json:"startDate"`
	EndDate        time.Time `json:"endDate"`
	CreatedAt      time.Time `json:"createdAt"`
}

// SubscriptionTierBreakdown - Phân tích số lượng và doanh thu theo gói
type SubscriptionTierBreakdown struct {
	TierCode     string `json:"tierCode"`
	TierName     string `json:"tierName"`
	TotalBought  int    `json:"totalBought"`
	ActiveUsers  int    `json:"activeUsers"`
	TotalRevenue int64  `json:"totalRevenue"`
}

// SubscriptionTrendPoint - Điểm dữ liệu chuỗi thời gian doanh thu subscription
type SubscriptionTrendPoint struct {
	Date         string `json:"date"` // 'YYYY-MM-DD'
	TotalCount   int    `json:"totalCount"`
	TotalRevenue int64  `json:"totalRevenue"`
}

// AdminSubscriptionAnalyticsResponse - Báo cáo số liệu người mua gói và gói dịch vụ dành riêng cho Admin
type AdminSubscriptionAnalyticsResponse struct {
	TotalSubscribers     int                          `json:"totalSubscribers"`
	TotalRevenueVND      int64                        `json:"totalRevenueVnd"`
	TotalActivePackages  int                          `json:"totalActivePackages"`
	TotalExpiredPackages int                          `json:"totalExpiredPackages"`
	TierBreakdown        []SubscriptionTierBreakdown  `json:"tierBreakdown"`
	Timeline             []SubscriptionTrendPoint     `json:"timeline"`
	Subscribers          []SubscriptionSubscriberItem `json:"subscribers"`
}


