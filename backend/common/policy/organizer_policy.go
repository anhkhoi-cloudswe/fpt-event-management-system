package policy

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"

	"github.com/fpt-event-services/common/config"
)

// DBExecutor hỗ trợ cả *sql.DB và *sql.Tx
type DBExecutor interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// OrganizerPolicy biểu diễn toàn bộ quyền lợi, hạn mức sức chứa và biểu phí hiệu lực của Organizer
type OrganizerPolicy struct {
	OrganizerID        int    `json:"organizerId"`
	Role               string `json:"role"`
	TierCode           string `json:"tierCode"`
	MaxCapacityLimit   int    `json:"maxCapacityLimit"` // -1 = Không giới hạn, 100 cho FREE
	HasAdvancedReports bool   `json:"hasAdvancedReports"`
	CommissionBps      int    `json:"commissionBps"`
	FeeSource          string `json:"feeSource"` // ROLE, TIER, FREE, OVERRIDE
	FeeConfigVersion   int    `json:"feeConfigVersion"`
	GatingEnabled      bool   `json:"gatingEnabled"`
}

// PlanRequiredError biểu diễn lỗi vượt quá sức chứa cho phép của gói hiện tại
type PlanRequiredError struct {
	MaxAllowed  int    `json:"maxAllowed"`
	Requested   int    `json:"requested"`
	CurrentTier string `json:"currentTier"`
	Message     string `json:"message"`
}

func (e *PlanRequiredError) Error() string {
	return e.Message
}

// ResolveOrganizerPolicy - HÀM PHÂN GIẢI DUY NHẤT TOÀN HỆ THỐNG
// Phân giải quyền hạn (Role + Subscription Tier) và Biểu phí (Bps + Override) theo nguyên tắc Fail-Closed
func ResolveOrganizerPolicy(ctx context.Context, exec DBExecutor, organizerID int) (*OrganizerPolicy, error) {
	// 1. Luôn đọc Role thực tế từ DB (Fail-Closed chống stale JWT token)
	var dbRole string
	err := exec.QueryRowContext(ctx, "SELECT role FROM users WHERE user_id = $1", organizerID).Scan(&dbRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("FAIL-CLOSED: user %d không tồn tại", organizerID)
		}
		return nil, fmt.Errorf("FAIL-CLOSED: lỗi đọc role user %d: %w", organizerID, err)
	}

	// 2. Đọc FEE_CONFIG_VERSION snapshot
	var versionStr string
	err = exec.QueryRowContext(ctx, "SELECT param_value FROM platform_system_parameter WHERE param_key = 'FEE_CONFIG_VERSION'").Scan(&versionStr)
	feeVersion := 1
	if err == nil && versionStr != "" {
		v, parseErr := strconv.Atoi(versionStr)
		if parseErr == nil && v > 0 {
			feeVersion = v
		}
	}

	// 3. Kiểm tra Role Policy nếu là SCHOOL_ORGANIZER
	var hasRolePolicy bool
	var roleBps, roleCap int
	var roleReports bool
	if dbRole == "SCHOOL_ORGANIZER" {
		errRole := exec.QueryRowContext(ctx, `
			SELECT commission_bps, max_capacity_limit, has_advanced_reports
			FROM role_fee_policy 
			WHERE role_code = 'SCHOOL_ORGANIZER' AND is_active = TRUE
		`).Scan(&roleBps, &roleCap, &roleReports)
		if errRole != nil {
			if errors.Is(errRole, sql.ErrNoRows) {
				return nil, fmt.Errorf("FAIL-CLOSED: thiếu cấu hình role_fee_policy cho SCHOOL_ORGANIZER")
			}
			return nil, fmt.Errorf("FAIL-CLOSED: lỗi truy vấn role_fee_policy: %w", errRole)
		}
		hasRolePolicy = true
	}

	// 4. Kiểm tra gói dịch vụ ACTIVE
	var hasActiveTier bool
	var tierCode string
	var tierBps, tierCap int
	var tierReports bool
	errTier := exec.QueryRowContext(ctx, `
		SELECT st.tier_code, st.commission_bps, st.max_capacity_limit, st.has_advanced_reports
		FROM user_subscription us
		JOIN subscription_tier st ON us.tier_id = st.tier_id
		WHERE us.user_id = $1 AND us.status = 'ACTIVE' AND us.end_date > NOW()
		ORDER BY us.subscription_id DESC LIMIT 1
	`, organizerID).Scan(&tierCode, &tierBps, &tierCap, &tierReports)

	if errTier != nil && !errors.Is(errTier, sql.ErrNoRows) {
		return nil, fmt.Errorf("FAIL-CLOSED: lỗi truy vấn user_subscription: %w", errTier)
	}
	if errTier == nil {
		hasActiveTier = true
	}

	var res *OrganizerPolicy

	// 5. Kết hợp quyền lợi giữa Role Policy và Subscription Tier (UNION / best-of)
	if hasRolePolicy && hasActiveTier {
		capLimit := roleCap
		if roleCap == -1 || tierCap == -1 {
			capLimit = -1
		} else if tierCap > roleCap {
			capLimit = tierCap
		}

		bps := roleBps
		source := "ROLE"
		if tierBps < roleBps {
			bps = tierBps
			source = "TIER"
		}

		res = &OrganizerPolicy{
			OrganizerID:        organizerID,
			Role:               dbRole,
			TierCode:           tierCode,
			MaxCapacityLimit:   capLimit,
			HasAdvancedReports: roleReports || tierReports,
			CommissionBps:      bps,
			FeeSource:          source,
			FeeConfigVersion:   feeVersion,
		}
	} else if hasRolePolicy {
		res = &OrganizerPolicy{
			OrganizerID:        organizerID,
			Role:               dbRole,
			TierCode:           "SCHOOL_ORGANIZER",
			MaxCapacityLimit:   roleCap,
			HasAdvancedReports: roleReports,
			CommissionBps:      roleBps,
			FeeSource:          "ROLE",
			FeeConfigVersion:   feeVersion,
		}
	} else if hasActiveTier {
		res = &OrganizerPolicy{
			OrganizerID:        organizerID,
			Role:               dbRole,
			TierCode:           tierCode,
			MaxCapacityLimit:   tierCap,
			HasAdvancedReports: tierReports,
			CommissionBps:      tierBps,
			FeeSource:          "TIER",
			FeeConfigVersion:   feeVersion,
		}
	} else {
		// Fallback Gói FREE từ DB (FAIL-CLOSED NẾU THIẾU BẢN GHI FREE)
		var freeBps, freeCap int
		var freeReports bool
		errFree := exec.QueryRowContext(ctx, `
			SELECT commission_bps, max_capacity_limit, has_advanced_reports
			FROM subscription_tier 
			WHERE tier_code = 'FREE' AND is_active = TRUE
		`).Scan(&freeBps, &freeCap, &freeReports)
		if errFree != nil {
			return nil, fmt.Errorf("FAIL-CLOSED: gói FREE không tồn tại hoặc bị vô hiệu hóa trong DB: %w", errFree)
		}

		res = &OrganizerPolicy{
			OrganizerID:        organizerID,
			Role:               dbRole,
			TierCode:           "FREE",
			MaxCapacityLimit:   freeCap,
			HasAdvancedReports: freeReports,
			CommissionBps:      freeBps,
			FeeSource:          "FREE",
			FeeConfigVersion:   feeVersion,
		}
	}

	// 6. Kiểm tra Override riêng (organizer_fee_override)
	// BẢO MẬT: Override CHỈ thay đổi commission_bps (hoa hồng), KHÔNG được chạm hay hạ thấp quyền lợi/sức chứa/báo cáo!
	var overrideBps int
	errOverride := exec.QueryRowContext(ctx, `
		SELECT commission_bps 
		FROM organizer_fee_override
		WHERE organizer_id = $1 AND effective_range @> NOW()
		ORDER BY created_at DESC
		LIMIT 1
	`, organizerID).Scan(&overrideBps)
	if errOverride == nil {
		res.CommissionBps = overrideBps
		res.FeeSource = "OVERRIDE"
	}

	res.GatingEnabled = config.IsFeatureEnabled(config.FlagEnableCapacityGating)
	return res, nil
}

// ValidateCapacityLimit kiểm tra sức chứa yêu cầu so với giới hạn của Organizer
// Chỉ chặn khi cờ ENABLE_CAPACITY_GATING = true (mặc định tắt ở Pha 2 để không chặn người dùng trước Pha 3)
func ValidateCapacityLimit(policy *OrganizerPolicy, requestedCapacity int) error {
	if !config.IsFeatureEnabled(config.FlagEnableCapacityGating) {
		return nil
	}
	if policy.MaxCapacityLimit == -1 {
		return nil // Không giới hạn
	}
	if requestedCapacity > policy.MaxCapacityLimit {
		return &PlanRequiredError{
			MaxAllowed:  policy.MaxCapacityLimit,
			Requested:   requestedCapacity,
			CurrentTier: policy.TierCode,
			Message:     fmt.Sprintf("Sức chứa sự kiện (%d người) vượt quá giới hạn của gói %s (tối đa %d người). Vui lòng nâng cấp gói để tiếp tục.", requestedCapacity, policy.TierCode, policy.MaxCapacityLimit),
		}
	}
	return nil
}

// CalculateEffectiveCapacity tính tổng sức chứa thực tế theo quy tắc duy nhất toàn hệ thống:
// effective = max(max_seats, ExpectedCapacity, SUM(max_quantity vé request), SUM(max_quantity vé DB), số ghế layout)
func CalculateEffectiveCapacity(ctx context.Context, exec DBExecutor, eventID int, requestCapacity *int, requestTicketsSum int) (int, error) {
	effective := 0
	if requestCapacity != nil && *requestCapacity > effective {
		effective = *requestCapacity
	}
	if requestTicketsSum > effective {
		effective = requestTicketsSum
	}

	if eventID > 0 {
		var maxSeats sql.NullInt64
		err := exec.QueryRowContext(ctx, "SELECT max_seats FROM Event WHERE event_id = $1", eventID).Scan(&maxSeats)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, fmt.Errorf("FAIL-CLOSED: lỗi đọc max_seats event %d: %w", eventID, err)
		}
		if maxSeats.Valid && int(maxSeats.Int64) > effective {
			effective = int(maxSeats.Int64)
		}

		var seatCount int
		err = exec.QueryRowContext(ctx, "SELECT COUNT(*) FROM event_seat_layout WHERE event_id = $1", eventID).Scan(&seatCount)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, fmt.Errorf("FAIL-CLOSED: lỗi đọc event_seat_layout: %w", err)
		}
		if seatCount > effective {
			effective = seatCount
		}

		var ticketSum int
		err = exec.QueryRowContext(ctx, `
			SELECT COALESCE(SUM(max_quantity), 0)
			FROM category_ticket
			WHERE event_id = $1 AND status != 'DELETED'
		`, eventID).Scan(&ticketSum)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return 0, fmt.Errorf("FAIL-CLOSED: lỗi đọc category_ticket: %w", err)
		}
		if ticketSum > effective {
			effective = ticketSum
		}
	}

	return effective, nil
}
