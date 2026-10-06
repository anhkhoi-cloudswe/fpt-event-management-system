package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/policy"
	"github.com/fpt-event-services/services/ticket-service/models"
	"github.com/lib/pq"
)

var log = logger.Default()

// ResolvedOrganizerPolicy - Kết quả phân giải quyền lợi hoa hồng và hạn mức của Organizer
type ResolvedOrganizerPolicy struct {
	CommissionBps      int    `json:"commissionBps"`
	MaxCapacityLimit   int    `json:"maxCapacityLimit"`
	HasAdvancedReports bool   `json:"hasAdvancedReports"`
	TierCode           string `json:"tierCode"`
	FeeSource          string `json:"feeSource"` // OVERRIDE, ROLE, TIER, FREE
	ConfigVersion      int    `json:"configVersion"`
}

// GetSubscriptionTiers - Lấy danh sách tất cả các gói Organizer đang hoạt động
func (r *TicketRepository) GetSubscriptionTiers(ctx context.Context) ([]models.SubscriptionTier, error) {
	query := `
		SELECT tier_id, tier_code, name, description, price_vnd, billing_cycle,
		       commission_bps, max_capacity_limit, has_advanced_reports, is_active, updated_at
		FROM subscription_tier
		ORDER BY price_vnd ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query subscription tiers: %w", err)
	}
	defer rows.Close()

	var tiers []models.SubscriptionTier
	for rows.Next() {
		var t models.SubscriptionTier
		var desc sql.NullString
		if err := rows.Scan(
			&t.TierID, &t.TierCode, &t.Name, &desc, &t.PriceVND, &t.BillingCycle,
			&t.CommissionBps, &t.MaxCapacityLimit, &t.HasAdvancedReports, &t.IsActive, &t.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan subscription tier: %w", err)
		}
		if desc.Valid {
			t.Description = desc.String
		}
		tiers = append(tiers, t)
	}
	return tiers, nil
}

// GetCurrentSubscription - Lấy thông tin gói dịch vụ hiện tại của Organizer (kèm role & quyền lợi)
func (r *TicketRepository) GetCurrentSubscription(ctx context.Context, userID int) (*models.CurrentSubscriptionResponse, error) {
	// 1. Kiểm tra role thực tế trong users table
	var dbRole string
	err := r.db.QueryRowContext(ctx, "SELECT role FROM users WHERE user_id = $1", userID).Scan(&dbRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("user %d không tồn tại", userID)
		}
		return nil, fmt.Errorf("lỗi đọc role user: %w", err)
	}

	// 2. Tìm gói ACTIVE còn hiệu lực
	var (
		subID                   int
		tierID                  int
		tierCode                string
		tierName                string
		tierBps, tierCap        int
		tierReports             bool
		startDate, endDate      time.Time
		autoRenew               bool
		schedDownID             sql.NullInt64
		schedDownCode           sql.NullString
	)

	subQuery := `
		SELECT us.subscription_id, us.tier_id, st.tier_code, st.name,
		       st.commission_bps, st.max_capacity_limit, st.has_advanced_reports,
		       us.start_date, us.end_date, us.auto_renew,
		       us.scheduled_downgrade_tier_id, sdt.tier_code
		FROM user_subscription us
		JOIN subscription_tier st ON us.tier_id = st.tier_id
		LEFT JOIN subscription_tier sdt ON us.scheduled_downgrade_tier_id = sdt.tier_id
		WHERE us.user_id = $1 AND us.status = 'ACTIVE' AND us.end_date > NOW()
		ORDER BY us.subscription_id DESC
		LIMIT 1
	`
	err = r.db.QueryRowContext(ctx, subQuery, userID).Scan(
		&subID, &tierID, &tierCode, &tierName,
		&tierBps, &tierCap, &tierReports,
		&startDate, &endDate, &autoRenew,
		&schedDownID, &schedDownCode,
	)

	hasActiveSub := (err == nil)

	// 3. Nếu là SCHOOL_ORGANIZER, đọc quyền lợi role_fee_policy
	var hasRolePolicy bool
	var roleBps, roleCap int
	var roleReports bool
	if dbRole == "SCHOOL_ORGANIZER" {
		errRole := r.db.QueryRowContext(ctx, `
			SELECT commission_bps, max_capacity_limit, has_advanced_reports
			FROM role_fee_policy WHERE role_code = 'SCHOOL_ORGANIZER' AND is_active = TRUE
		`).Scan(&roleBps, &roleCap, &roleReports)
		if errRole == nil {
			hasRolePolicy = true
		}
	}

	// 4. Tổng hợp quyền lợi theo nguồn sự thật cao nhất
	res := &models.CurrentSubscriptionResponse{
		OrganizerID: userID,
		Role:        dbRole,
	}

	now := time.Now()
	if hasActiveSub {
		res.TierCode = tierCode
		res.TierName = tierName
		res.StartDate = startDate
		res.EndDate = endDate
		res.DaysRemaining = int(math.Max(0, math.Ceil(endDate.Sub(now).Hours()/24.0)))
		res.AutoRenew = autoRenew
		res.Status = "ACTIVE"
		if schedDownCode.Valid {
			res.ScheduledDowngradeTierCode = &schedDownCode.String
		}

		if hasRolePolicy {
			// Kết hợp ưu đãi tốt nhất giữa Role Policy và Tier
			if roleBps <= tierBps {
				res.CommissionBps = roleBps
				res.FeeSource = "ROLE"
			} else {
				res.CommissionBps = tierBps
				res.FeeSource = "TIER"
			}
			if roleCap == -1 || tierCap == -1 {
				res.MaxCapacityLimit = -1
			} else {
				res.MaxCapacityLimit = int(math.Max(float64(roleCap), float64(tierCap)))
			}
			res.HasAdvancedReports = roleReports || tierReports
		} else {
			res.CommissionBps = tierBps
			res.MaxCapacityLimit = tierCap
			res.HasAdvancedReports = tierReports
			res.FeeSource = "TIER"
		}
		return res, nil
	}

	// Không có gói Active: nếu là School Organizer thì dùng role policy
	if hasRolePolicy {
		res.TierCode = "SCHOOL_ORGANIZER"
		res.TierName = "Cán bộ cấp Trường (School Organizer)"
		res.CommissionBps = roleBps
		res.MaxCapacityLimit = roleCap
		res.HasAdvancedReports = roleReports
		res.FeeSource = "ROLE"
		res.Status = "ACTIVE"
		res.StartDate = now
		res.EndDate = now.AddDate(10, 0, 0) // Vĩnh viễn theo phân quyền
		res.DaysRemaining = 3650
		return res, nil
	}

	// Fallback sang Gói FREE mặc định
	var freeBps, freeCap int
	var freeReports bool
	var freeName string
	errFree := r.db.QueryRowContext(ctx, `
		SELECT name, commission_bps, max_capacity_limit, has_advanced_reports
		FROM subscription_tier WHERE tier_code = 'FREE' AND is_active = TRUE
	`).Scan(&freeName, &freeBps, &freeCap, &freeReports)
	if errFree != nil {
		return nil, fmt.Errorf("FAIL-CLOSED: gói FREE không tồn tại hoặc bị deactive trong DB: %w", errFree)
	}

	res.TierCode = "FREE"
	res.TierName = freeName
	res.CommissionBps = freeBps
	res.MaxCapacityLimit = freeCap
	res.HasAdvancedReports = freeReports
	res.FeeSource = "FREE"
	res.Status = "ACTIVE"
	res.StartDate = now
	res.EndDate = now.AddDate(10, 0, 0)
	res.DaysRemaining = 3650
	return res, nil
}

// SubscribeOrUpgrade - Mua, gia hạn hoặc nâng cấp gói Organizer (hỗ trợ Prorate, Idempotency 23505, trừ ví ACID)
func (r *TicketRepository) SubscribeOrUpgrade(ctx context.Context, userID int, req models.SubscribeRequest) (*models.SubscribeResponse, error) {
	if req.TierCode == "" || req.TierCode == "FREE" {
		return nil, fmt.Errorf("không thể đăng ký gói FREE qua luồng thanh toán ví")
	}

	// 1. Kiểm tra Idempotency trước nếu có request_id (từ subscription_payment_log)
	if req.RequestID != "" {
		var (
			pSubID    int
			pTierCode string
			pPaid     int64
			pCredit   int64
			pStart    time.Time
			pEnd      time.Time
		)
		checkQuery := `
			SELECT spl.subscription_id, st.tier_code, spl.amount_paid_vnd, spl.prorated_credit_vnd,
			       spl.start_date, spl.end_date
			FROM subscription_payment_log spl
			JOIN subscription_tier st ON spl.tier_id = st.tier_id
			WHERE spl.request_id = $1 AND spl.user_id = $2
		`
		err := r.db.QueryRowContext(ctx, checkQuery, req.RequestID, userID).Scan(
			&pSubID, &pTierCode, &pPaid, &pCredit, &pStart, &pEnd,
		)
		if err == nil {
			log.Info("IDEMPOTENT HIT: trả lại kết quả đã xử lý cho request_id=%s", req.RequestID)
			return &models.SubscribeResponse{
				SubscriptionID: pSubID,
				TierCode:       pTierCode,
				AmountPaid:     pPaid,
				ProratedCredit: pCredit,
				StartDate:      pStart,
				EndDate:        pEnd,
				Message:        "Giao dịch đã được ghi nhận trước đó thành công (Idempotent).",
			}, nil
		}
	}

	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return nil, fmt.Errorf("failed to start subscription transaction: %w", err)
	}
	defer tx.Rollback()

	// 2. Lấy thông tin gói mục tiêu (chặn mua nếu is_active = FALSE)
	var targetTier models.SubscriptionTier
	err = tx.QueryRowContext(ctx, `
		SELECT tier_id, tier_code, name, price_vnd, billing_cycle,
		       commission_bps, max_capacity_limit, has_advanced_reports, is_active
		FROM subscription_tier WHERE tier_code = $1 AND is_active = TRUE
	`, req.TierCode).Scan(
		&targetTier.TierID, &targetTier.TierCode, &targetTier.Name, &targetTier.PriceVND,
		&targetTier.BillingCycle, &targetTier.CommissionBps, &targetTier.MaxCapacityLimit,
		&targetTier.HasAdvancedReports, &targetTier.IsActive,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("gói %s không tồn tại hoặc đã bị vô hiệu hóa", req.TierCode)
		}
		return nil, fmt.Errorf("lỗi kiểm tra gói: %w", err)
	}

	now := time.Now()

	// 3. Khóa và đọc gói ACTIVE hiện tại của user (nếu có) trước khi khóa ví
	var (
		currentSubID int
		oldTierID    int
		oldTierCode  string
		oldPrice     int64
		oldStartDate time.Time
		oldEndDate   time.Time
	)
	hasCurrentActive := false
	err = tx.QueryRowContext(ctx, `
		SELECT us.subscription_id, us.tier_id, st.tier_code, st.price_vnd, us.start_date, us.end_date
		FROM user_subscription us
		JOIN subscription_tier st ON us.tier_id = st.tier_id
		WHERE us.user_id = $1 AND us.status = 'ACTIVE' AND us.end_date > NOW()
		FOR UPDATE OF us
	`, userID).Scan(&currentSubID, &oldTierID, &oldTierCode, &oldPrice, &oldStartDate, &oldEndDate)

	if err == nil {
		hasCurrentActive = true
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("lỗi kiểm tra gói hiện tại: %w", err)
	}

	// 4. Phân nhánh xử lý: MUA LẠI CÙNG GÓI vs NÂNG CẤP / MUA MỚI vs HẠ CẤP
	isRenewSameTier := hasCurrentActive && (oldTierCode == req.TierCode)
	if isRenewSameTier && req.Action != "RENEW" && req.Action != "EXTEND" {
		_ = tx.Rollback()
		return nil, fmt.Errorf("xung đột đồng thời: bạn đã có gói %s đang hoạt động hoặc giao dịch đang được xử lý (409 Conflict)", oldTierCode)
	}
	isDowngrade := hasCurrentActive && !isRenewSameTier && (targetTier.PriceVND < oldPrice)

	if isDowngrade {
		// Hạ cấp: Hiệu lực từ kỳ kế, không hoàn tiền
		_, err = tx.ExecContext(ctx, `
			UPDATE user_subscription 
			SET scheduled_downgrade_tier_id = $1, updated_at = NOW()
			WHERE subscription_id = $2
		`, targetTier.TierID, currentSubID)
		if err != nil {
			return nil, fmt.Errorf("lỗi đặt lịch hạ cấp: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("failed to commit downgrade schedule: %w", err)
		}
		return &models.SubscribeResponse{
			SubscriptionID: currentSubID,
			TierCode:       oldTierCode,
			AmountPaid:     0,
			ProratedCredit: 0,
			StartDate:      oldStartDate,
			EndDate:        oldEndDate,
			Message:        fmt.Sprintf("Đã đặt lịch hạ cấp sang gói %s. Gói mới sẽ có hiệu lực từ ngày %s (sau khi gói hiện tại hết hạn).", targetTier.Name, oldEndDate.Format("02/01/2006")),
		}, nil
	}

	var amountToPay int64
	var unusedCredit int64 = 0
	var finalStartDate time.Time
	var finalEndDate time.Time
	actionType := "INITIAL"

	if isRenewSameTier {
		// Mua lại cùng gói: Giá gói đầy đủ, cộng dồn 30 ngày vào end_date hiện có
		actionType = "RENEWAL"
		amountToPay = targetTier.PriceVND
		unusedCredit = 0
		finalStartDate = oldStartDate
		finalEndDate = oldEndDate.AddDate(0, 0, 30)
	} else if hasCurrentActive {
		// Nâng cấp giữa kỳ: Prorate theo quy tắc credit = oldPrice * D / 30 (int64, floor sau khi nhân)
		actionType = "UPGRADE"
		daysRemaining := int(math.Ceil(oldEndDate.Sub(now).Hours() / 24.0))
		if daysRemaining > 0 && oldPrice > 0 {
			unusedCredit = (oldPrice * int64(daysRemaining)) / 30
		}
		amountToPay = targetTier.PriceVND - unusedCredit
		if amountToPay < 0 {
			amountToPay = 0
		}
		finalStartDate = now
		finalEndDate = now.AddDate(0, 0, 30)
	} else {
		// Mua mới lần đầu
		actionType = "INITIAL"
		amountToPay = targetTier.PriceVND
		unusedCredit = 0
		finalStartDate = now
		finalEndDate = now.AddDate(0, 0, 30)
	}

	// 5. Khóa ví Organizer FOR UPDATE và kiểm tra số dư (int64)
	var walletID int
	var walletBalStr string
	err = tx.QueryRowContext(ctx, `
		SELECT wallet_id, balance::text FROM wallet WHERE user_id = $1 FOR UPDATE
	`, userID).Scan(&walletID, &walletBalStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("không tìm thấy ví của tài khoản %d", userID)
		}
		return nil, fmt.Errorf("lỗi kiểm tra ví: %w", err)
	}

	cleanBalStr := walletBalStr
	if idx := strings.Index(cleanBalStr, "."); idx != -1 {
		decimalPart := cleanBalStr[idx+1:]
		if strings.Trim(decimalPart, "0") != "" {
			return nil, fmt.Errorf("số dư ví có phần thập phân lẻ (%s) không hợp lệ, hệ thống chỉ chấp nhận số nguyên VND", walletBalStr)
		}
		cleanBalStr = cleanBalStr[:idx]
	}
	walletBalance, err := strconv.ParseInt(cleanBalStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("lỗi định dạng số dư ví: %w", err)
	}

	if walletBalance < amountToPay {
		return nil, fmt.Errorf("số dư ví không đủ: Số dư hiện tại %s đ, số tiền cần thanh toán %s đ (đã trừ %s đ hoàn tiền gói cũ). Vui lòng nạp thêm tiền vào ví",
			formatMoneyVND(walletBalance), formatMoneyVND(amountToPay), formatMoneyVND(unusedCredit))
	}

	if amountToPay > 0 {
		balanceBefore := walletBalance
		balanceAfter := walletBalance - amountToPay

		_, err = tx.ExecContext(ctx, `
			UPDATE wallet SET balance = $1, updated_at = NOW() WHERE wallet_id = $2
		`, balanceAfter, walletID)
		if err != nil {
			return nil, fmt.Errorf("lỗi cập nhật số dư ví: %w", err)
		}

		desc := fmt.Sprintf("Thanh toán mua gói Organizer %s", targetTier.Name)
		if isRenewSameTier {
			desc = fmt.Sprintf("Gia hạn gói Organizer %s (+30 ngày)", targetTier.Name)
		} else if unusedCredit > 0 {
			desc += fmt.Sprintf(" (được khấu trừ %s đ từ gói cũ)", formatMoneyVND(unusedCredit))
		}
		refType := "SUBSCRIPTION"
		refID := fmt.Sprintf("TIER_%s", targetTier.TierCode)

		_, err = tx.ExecContext(ctx, `
			INSERT INTO wallet_transaction (
				wallet_id, user_id, type, amount, balance_before, balance_after,
				reference_type, reference_id, description, created_at
			) VALUES ($1, $2, 'USAGE_FEE', $3, $4, $5, $6, $7, $8, NOW())
		`, walletID, userID, amountToPay, balanceBefore, balanceAfter, refType, refID, desc)
		if err != nil {
			return nil, fmt.Errorf("lỗi ghi sổ cái giao dịch ví: %w", err)
		}
	}

	var finalSubID int

	if isRenewSameTier {
		// Mua lại cùng gói: cập nhật trực tiếp end_date cộng dồn và amount_paid_vnd
		_, err = tx.ExecContext(ctx, `
			UPDATE user_subscription 
			SET end_date = $1, amount_paid_vnd = amount_paid_vnd + $2, updated_at = NOW()
			WHERE subscription_id = $3
		`, finalEndDate, amountToPay, currentSubID)
		if err != nil {
			return nil, fmt.Errorf("lỗi gia hạn gói hiện tại: %w", err)
		}
		finalSubID = currentSubID
	} else {
		// Nâng cấp: chuyển gói cũ sang UPGRADED
		if hasCurrentActive {
			_, err = tx.ExecContext(ctx, `
				UPDATE user_subscription 
				SET status = 'UPGRADED', updated_at = NOW() 
				WHERE subscription_id = $1
			`, currentSubID)
			if err != nil {
				return nil, fmt.Errorf("lỗi cập nhật trạng thái gói cũ: %w", err)
			}
		}

		autoRenewVal := false
		if req.AutoRenew != nil {
			autoRenewVal = *req.AutoRenew
		}

		// Tạo bản ghi ACTIVE mới
		insertSubQuery := `
			INSERT INTO user_subscription (
				user_id, tier_id, status, start_date, end_date, auto_renew,
				amount_paid_vnd, prorated_credit_vnd, request_id, created_at, updated_at
			) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, $7, $8, NOW(), NOW())
			RETURNING subscription_id
		`
		err = tx.QueryRowContext(ctx, insertSubQuery,
			userID, targetTier.TierID, finalStartDate, finalEndDate, autoRenewVal, amountToPay, unusedCredit, req.RequestID,
		).Scan(&finalSubID)

		if err != nil {
			_ = tx.Rollback()
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code == "23505" {
				switch pqErr.Constraint {
				case "user_subscription_request_id_key":
					var (
						pSubID  int
						pTier   string
						pPaid   int64
						pCredit int64
						pStart  time.Time
						pEnd    time.Time
					)
					_ = r.db.QueryRowContext(ctx, `
						SELECT spl.subscription_id, st.tier_code, spl.amount_paid_vnd, spl.prorated_credit_vnd, spl.start_date, spl.end_date
						FROM subscription_payment_log spl
						JOIN subscription_tier st ON spl.tier_id = st.tier_id
						WHERE spl.request_id = $1 AND spl.user_id = $2
					`, req.RequestID, userID).Scan(&pSubID, &pTier, &pPaid, &pCredit, &pStart, &pEnd)
					return &models.SubscribeResponse{
						SubscriptionID: pSubID,
						TierCode:       pTier,
						AmountPaid:     pPaid,
						ProratedCredit: pCredit,
						StartDate:      pStart,
						EndDate:        pEnd,
						Message:        "Giao dịch đã được ghi nhận thành công (Idempotent).",
					}, nil
				case "uq_user_active_subscription":
					return nil, fmt.Errorf("xung đột đồng thời: bạn đã có gói đang hoạt động hoặc giao dịch đang được xử lý (409 Conflict)")
				}
			}
			return nil, fmt.Errorf("lỗi tạo bản ghi đăng ký gói: %w", err)
		}
	}

	// 7. Ghi nhận request_id vào subscription_payment_log (cho mọi lần thanh toán / gia hạn)
	if req.RequestID != "" {
		var reqIDVal sql.NullString
		reqIDVal.String = req.RequestID
		reqIDVal.Valid = true
		_, err = tx.ExecContext(ctx, `
			INSERT INTO subscription_payment_log (
				subscription_id, user_id, tier_id, action_type, amount_paid_vnd,
				prorated_credit_vnd, request_id, start_date, end_date, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
		`, finalSubID, userID, targetTier.TierID, actionType, amountToPay, unusedCredit, reqIDVal, finalStartDate, finalEndDate)
		if err != nil {
			_ = tx.Rollback()
			var pqErr *pq.Error
			if errors.As(err, &pqErr) && pqErr.Code == "23505" {
				// Replay request_id trùng lặp: rollback và query kết quả cũ từ DB
				var (
					pSubID  int
					pTier   string
					pPaid   int64
					pCredit int64
					pStart  time.Time
					pEnd    time.Time
				)
				errQuery := r.db.QueryRowContext(ctx, `
					SELECT spl.subscription_id, st.tier_code, spl.amount_paid_vnd, spl.prorated_credit_vnd, spl.start_date, spl.end_date
					FROM subscription_payment_log spl
					JOIN subscription_tier st ON spl.tier_id = st.tier_id
					WHERE spl.request_id = $1 AND spl.user_id = $2
				`, req.RequestID, userID).Scan(&pSubID, &pTier, &pPaid, &pCredit, &pStart, &pEnd)
				if errQuery == nil {
					return &models.SubscribeResponse{
						SubscriptionID: pSubID,
						TierCode:       pTier,
						AmountPaid:     pPaid,
						ProratedCredit: pCredit,
						StartDate:      pStart,
						EndDate:        pEnd,
						Message:        "Giao dịch đã được ghi nhận thành công (Idempotent).",
					}, nil
				}
				return &models.SubscribeResponse{
					SubscriptionID: finalSubID,
					TierCode:       targetTier.TierCode,
					AmountPaid:     amountToPay,
					ProratedCredit: unusedCredit,
					StartDate:      finalStartDate,
					EndDate:        finalEndDate,
					Message:        "Giao dịch đã được ghi nhận thành công (Idempotent).",
				}, nil
			}
			return nil, fmt.Errorf("lỗi ghi log thanh toán subscription: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit subscription transaction: %w", err)
	}

	msg := fmt.Sprintf("Kích hoạt thành công gói %s đến ngày %s.", targetTier.Name, finalEndDate.Format("02/01/2006"))
	if isRenewSameTier {
		msg = fmt.Sprintf("Gia hạn thành công gói %s thêm 30 ngày (đến ngày %s).", targetTier.Name, finalEndDate.Format("02/01/2006"))
	}

	return &models.SubscribeResponse{
		SubscriptionID: finalSubID,
		TierCode:       targetTier.TierCode,
		AmountPaid:     amountToPay,
		ProratedCredit: unusedCredit,
		StartDate:      finalStartDate,
		EndDate:        finalEndDate,
		Message:        msg,
	}, nil
}

// ProcessExpiredSubscriptions - Job xử lý chuyển trạng thái EXPIRED và thực hiện Auto-Renew / Hạ cấp
// Trả về: expiredCount (số gói hết hạn), renewedCount (số gói gia hạn/hạ cấp thành công), error
func (r *TicketRepository) ProcessExpiredSubscriptions(ctx context.Context) (int, int, error) {
	query := `
		SELECT us.subscription_id
		FROM user_subscription us
		WHERE us.status = 'ACTIVE' AND us.end_date <= NOW()
		ORDER BY us.subscription_id ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return 0, 0, fmt.Errorf("lỗi tìm kiếm gói hết hạn: %w", err)
	}
	defer rows.Close()

	var subIDs []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return 0, 0, fmt.Errorf("lỗi scan id subscription hết hạn: %w", err)
		}
		subIDs = append(subIDs, id)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, fmt.Errorf("lỗi đọc danh sách subscription hết hạn: %w", err)
	}

	expiredCount := 0
	renewedCount := 0

	for _, subID := range subIDs {
		tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
		if err != nil {
			return expiredCount, renewedCount, fmt.Errorf("lỗi khởi tạo transaction xử lý subscription %d: %w", subID, err)
		}

		// 1. Khóa dòng subscription FOR UPDATE và kiểm tra còn ACTIVE & quá hạn không
		var (
			userID      int
			tierID      int
			autoRenew   bool
			schedDownID sql.NullInt64
		)
		err = tx.QueryRowContext(ctx, `
			SELECT us.user_id, us.tier_id, us.auto_renew, us.scheduled_downgrade_tier_id
			FROM user_subscription us
			WHERE us.subscription_id = $1 AND us.status = 'ACTIVE' AND us.end_date <= NOW()
			FOR UPDATE
		`, subID).Scan(&userID, &tierID, &autoRenew, &schedDownID)
		if err != nil {
			tx.Rollback()
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			return expiredCount, renewedCount, fmt.Errorf("lỗi khóa dòng subscription %d: %w", subID, err)
		}

		// 2. Chuyển gói cũ sang EXPIRED
		_, err = tx.ExecContext(ctx, `
			UPDATE user_subscription 
			SET status = 'EXPIRED', updated_at = NOW()
			WHERE subscription_id = $1
		`, subID)
		if err != nil {
			tx.Rollback()
			return expiredCount, renewedCount, fmt.Errorf("lỗi cập nhật trạng thái EXPIRED cho sub %d: %w", subID, err)
		}

		// 3. Kiểm tra tự động gia hạn hoặc lịch hạ cấp
		targetTierID := tierID
		if schedDownID.Valid && schedDownID.Int64 > 0 {
			targetTierID = int(schedDownID.Int64)
		}

		shouldRenew := autoRenew || (schedDownID.Valid && schedDownID.Int64 > 0)
		if !shouldRenew {
			if err := tx.Commit(); err != nil {
				return expiredCount, renewedCount, fmt.Errorf("lỗi commit hết hạn sub %d: %w", subID, err)
			}
			expiredCount++
			continue
		}

		// 4. Đọc thông tin gói mục tiêu (Lỗi đọc không phải ErrNoRows => rollback và trả error)
		var targetTier models.SubscriptionTier
		err = tx.QueryRowContext(ctx, `
			SELECT tier_id, tier_code, name, price_vnd, is_active
			FROM subscription_tier WHERE tier_id = $1
		`, targetTierID).Scan(
			&targetTier.TierID, &targetTier.TierCode, &targetTier.Name,
			&targetTier.PriceVND, &targetTier.IsActive,
		)
		if err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				tx.Rollback()
				return expiredCount, renewedCount, fmt.Errorf("lỗi đọc thông tin gói mục tiêu sub %d: %w", subID, err)
			}
			// Không tìm thấy gói trong DB => commit chuyển EXPIRED (fallback Free)
			if err := tx.Commit(); err != nil {
				return expiredCount, renewedCount, fmt.Errorf("lỗi commit fallback free sub %d: %w", subID, err)
			}
			expiredCount++
			continue
		}
		if !targetTier.IsActive || targetTier.TierCode == "FREE" {
			// Gói bị tắt hoặc là FREE => kết thúc ở Free, không trừ ví
			if err := tx.Commit(); err != nil {
				return expiredCount, renewedCount, fmt.Errorf("lỗi commit fallback free sub %d: %w", subID, err)
			}
			expiredCount++
			continue
		}

		// 5. Khóa ví và kiểm tra số dư (int64 - Lỗi đọc ví không phải ErrNoRows => rollback và trả error)
		var walletID int
		var walletBalStr string
		err = tx.QueryRowContext(ctx, `
			SELECT wallet_id, balance::text FROM wallet WHERE user_id = $1 FOR UPDATE
		`, userID).Scan(&walletID, &walletBalStr)
		if err != nil {
			if !errors.Is(err, sql.ErrNoRows) {
				tx.Rollback()
				return expiredCount, renewedCount, fmt.Errorf("lỗi đọc thông tin ví sub %d: %w", subID, err)
			}
			// Không tìm thấy ví => kết thúc ở Free
			if err := tx.Commit(); err != nil {
				return expiredCount, renewedCount, fmt.Errorf("lỗi commit sub %d sau kiểm tra ví: %w", subID, err)
			}
			expiredCount++
			continue
		}

		cleanBalStr := walletBalStr
		if idx := strings.Index(cleanBalStr, "."); idx != -1 {
			decimalPart := cleanBalStr[idx+1:]
			if strings.Trim(decimalPart, "0") != "" {
				tx.Rollback()
				return expiredCount, renewedCount, fmt.Errorf("số dư ví có phần thập phân lẻ (%s) không hợp lệ, hệ thống chỉ chấp nhận số nguyên VND", walletBalStr)
			}
			cleanBalStr = cleanBalStr[:idx]
		}
		walletBalance, err := strconv.ParseInt(cleanBalStr, 10, 64)
		if err != nil {
			tx.Rollback()
			return expiredCount, renewedCount, fmt.Errorf("lỗi định dạng số dư ví sub %d: %w", subID, err)
		}

		if walletBalance < targetTier.PriceVND {
			// Không đủ tiền ví => rơi về Free tự nhiên (KHÔNG BAO GIỜ cấp gói trả phí miễn phí)
			if err := tx.Commit(); err != nil {
				return expiredCount, renewedCount, fmt.Errorf("lỗi commit sub %d khi không đủ tiền: %w", subID, err)
			}
			expiredCount++
			continue
		}

		// 6. Trừ tiền ví (int64)
		balanceBefore := walletBalance
		balanceAfter := walletBalance - targetTier.PriceVND

		_, err = tx.ExecContext(ctx, `
			UPDATE wallet SET balance = $1, updated_at = NOW() WHERE wallet_id = $2
		`, balanceAfter, walletID)
		if err != nil {
			tx.Rollback()
			return expiredCount, renewedCount, fmt.Errorf("lỗi trừ tiền ví khi gia hạn sub %d: %w", subID, err)
		}

		desc := fmt.Sprintf("Gia hạn tự động gói Organizer %s", targetTier.Name)
		_, err = tx.ExecContext(ctx, `
			INSERT INTO wallet_transaction (
				wallet_id, user_id, type, amount, balance_before, balance_after,
				reference_type, reference_id, description, created_at
			) VALUES ($1, $2, 'USAGE_FEE', $3, $4, $5, 'SUBSCRIPTION', $6, $7, NOW())
		`, walletID, userID, targetTier.PriceVND, balanceBefore, balanceAfter,
			fmt.Sprintf("RENEW_%s", targetTier.TierCode), desc)
		if err != nil {
			tx.Rollback()
			return expiredCount, renewedCount, fmt.Errorf("lỗi ghi wallet_transaction khi gia hạn sub %d: %w", subID, err)
		}

		// 7. Tạo gói ACTIVE mới
		now := time.Now()
		endDate := now.AddDate(0, 0, 30)
		var newSubID int
		err = tx.QueryRowContext(ctx, `
			INSERT INTO user_subscription (
				user_id, tier_id, status, start_date, end_date, auto_renew,
				amount_paid_vnd, prorated_credit_vnd, created_at, updated_at
			) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, $6, 0, NOW(), NOW())
			RETURNING subscription_id
		`, userID, targetTier.TierID, now, endDate, autoRenew, targetTier.PriceVND).Scan(&newSubID)
		if err != nil {
			tx.Rollback()
			return expiredCount, renewedCount, fmt.Errorf("lỗi tạo subscription mới khi gia hạn sub %d: %w", subID, err)
		}

		// 8. Ghi log thanh toán
		_, err = tx.ExecContext(ctx, `
			INSERT INTO subscription_payment_log (
				subscription_id, user_id, tier_id, action_type, amount_paid_vnd,
				prorated_credit_vnd, start_date, end_date, created_at
			) VALUES ($1, $2, $3, 'AUTO_RENEW', $4, 0, $5, $6, NOW())
		`, newSubID, userID, targetTier.TierID, targetTier.PriceVND, now, endDate)
		if err != nil {
			tx.Rollback()
			return expiredCount, renewedCount, fmt.Errorf("lỗi ghi log thanh toán khi gia hạn sub %d: %w", subID, err)
		}

		if err := tx.Commit(); err != nil {
			return expiredCount, renewedCount, fmt.Errorf("lỗi commit gia hạn sub %d: %w", subID, err)
		}
		expiredCount++
		renewedCount++
	}

	return expiredCount, renewedCount, nil
}

// SetAutoRenew - Bật hoặc tắt tính năng tự động gia hạn gói cho Organizer
func (r *TicketRepository) SetAutoRenew(ctx context.Context, userID int, autoRenew bool) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE user_subscription
		SET auto_renew = $1, updated_at = NOW()
		WHERE user_id = $2 AND status = 'ACTIVE' AND end_date > NOW()
	`, autoRenew, userID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật tự động gia hạn: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("lỗi kiểm tra kết quả cập nhật: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("bạn hiện không có gói nào đang hoạt động để cấu hình tự động gia hạn")
	}
	return nil
}

// ScheduleDowngrade - Đặt lịch hạ cấp gói vào cuối chu kỳ (không hoàn tiền, tiếp tục hưởng quyền lợi đến hết hạn)
func (r *TicketRepository) ScheduleDowngrade(ctx context.Context, userID int, targetTierCode string) error {
	var currentSubID int
	var currentTierCode string
	err := r.db.QueryRowContext(ctx, `
		SELECT us.subscription_id, st.tier_code
		FROM user_subscription us
		JOIN subscription_tier st ON us.tier_id = st.tier_id
		WHERE us.user_id = $1 AND us.status = 'ACTIVE' AND us.end_date > NOW()
	`, userID).Scan(&currentSubID, &currentTierCode)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("bạn hiện không có gói nào đang hoạt động để hạ cấp")
		}
		return fmt.Errorf("lỗi kiểm tra gói hiện tại: %w", err)
	}

	var targetTierID int
	err = r.db.QueryRowContext(ctx, `
		SELECT tier_id FROM subscription_tier WHERE tier_code = $1 AND is_active = TRUE
	`, targetTierCode).Scan(&targetTierID)
	if err != nil {
		return fmt.Errorf("gói hạ cấp %s không tồn tại hoặc bị vô hiệu hóa", targetTierCode)
	}

	_, err = r.db.ExecContext(ctx, `
		UPDATE user_subscription 
		SET scheduled_downgrade_tier_id = $1, updated_at = NOW()
		WHERE subscription_id = $2
	`, targetTierID, currentSubID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật lịch hạ cấp: %w", err)
	}

	return nil
}

// CancelSubscription - Hủy gói hoặc hủy gia hạn tự động
func (r *TicketRepository) CancelSubscription(ctx context.Context, userID int) error {
	res, err := r.db.ExecContext(ctx, `
		UPDATE user_subscription 
		SET auto_renew = FALSE, 
		    scheduled_downgrade_tier_id = (SELECT tier_id FROM subscription_tier WHERE tier_code = 'FREE'),
		    updated_at = NOW()
		WHERE user_id = $1 AND status = 'ACTIVE' AND end_date > NOW()
	`, userID)
	if err != nil {
		return fmt.Errorf("lỗi hủy gói dịch vụ: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("không tìm thấy gói dịch vụ đang hoạt động để hủy")
	}
	return nil
}

// ResolveOrganizerPolicyTx - Phân giải Quyền lợi & Hoa hồng với REPEATABLE READ Snapshot trong Transaction qua shared policy
func (r *TicketRepository) ResolveOrganizerPolicyTx(ctx context.Context, tx *sql.Tx, organizerID int) (*ResolvedOrganizerPolicy, error) {
	p, err := policy.ResolveOrganizerPolicy(ctx, tx, organizerID)
	if err != nil {
		return nil, err
	}
	return &ResolvedOrganizerPolicy{
		CommissionBps:      p.CommissionBps,
		MaxCapacityLimit:   p.MaxCapacityLimit,
		HasAdvancedReports: p.HasAdvancedReports,
		TierCode:           p.TierCode,
		FeeSource:          p.FeeSource,
		ConfigVersion:      p.FeeConfigVersion,
	}, nil
}

func formatMoneyVND(val int64) string {
	in := strconv.FormatInt(val, 10)
	n := len(in)
	if n <= 3 {
		return in
	}
	var res []byte
	rem := n % 3
	if rem > 0 {
		res = append(res, in[:rem]...)
		if n > rem {
			res = append(res, '.')
		}
	}
	for i := rem; i < n; i += 3 {
		res = append(res, in[i:i+3]...)
		if i+3 < n {
			res = append(res, '.')
		}
	}
	return string(res)
}

// PreviewUpgrade - Xem trước chi phí nâng cấp gói kèm Prorated Credit và số tiền thực trả
func (r *TicketRepository) PreviewUpgrade(ctx context.Context, userID int, targetTierCode string) (*models.PreviewUpgradeResponse, error) {
	if targetTierCode == "" || targetTierCode == "FREE" {
		return nil, fmt.Errorf("gói mục tiêu không hợp lệ")
	}

	var targetTier models.SubscriptionTier
	err := r.db.QueryRowContext(ctx, `
		SELECT tier_id, tier_code, name, price_vnd, billing_cycle,
		       commission_bps, max_capacity_limit, has_advanced_reports, is_active
		FROM subscription_tier WHERE tier_code = $1 AND is_active = TRUE
	`, targetTierCode).Scan(
		&targetTier.TierID, &targetTier.TierCode, &targetTier.Name, &targetTier.PriceVND,
		&targetTier.BillingCycle, &targetTier.CommissionBps, &targetTier.MaxCapacityLimit,
		&targetTier.HasAdvancedReports, &targetTier.IsActive,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("gói %s không tồn tại hoặc đã bị vô hiệu hóa", targetTierCode)
		}
		return nil, fmt.Errorf("lỗi kiểm tra gói mục tiêu: %w", err)
	}

	now := time.Now()
	var (
		oldTierCode string
		oldPrice    int64
		oldEndDate  time.Time
	)

	hasActive := false
	err = r.db.QueryRowContext(ctx, `
		SELECT st.tier_code, st.price_vnd, us.end_date
		FROM user_subscription us
		JOIN subscription_tier st ON us.tier_id = st.tier_id
		WHERE us.user_id = $1 AND us.status = 'ACTIVE' AND us.end_date > NOW()
		ORDER BY us.subscription_id DESC LIMIT 1
	`, userID).Scan(&oldTierCode, &oldPrice, &oldEndDate)

	if err == nil {
		hasActive = true
	} else if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("lỗi kiểm tra gói hiện tại: %w", err)
	}

	originalPrice := targetTier.PriceVND
	var proratedCredit int64 = 0
	daysRemaining := 0

	if hasActive && oldPrice > 0 && oldTierCode != targetTierCode {
		daysRemaining = int(math.Ceil(oldEndDate.Sub(now).Hours() / 24.0))
		if daysRemaining < 0 {
			daysRemaining = 0
		}
		if daysRemaining > 0 {
			proratedCredit = (oldPrice * int64(daysRemaining)) / 30
		}
	}

	netPay := originalPrice - proratedCredit
	if netPay < 0 {
		netPay = 0
	}

	return &models.PreviewUpgradeResponse{
		TargetTierCode: targetTierCode,
		OriginalPrice:  originalPrice,
		ProratedCredit: proratedCredit,
		NetPay:         netPay,
		DaysRemaining:  daysRemaining,
	}, nil
}

// GetPublicFeeParameters - Lấy các tham số biểu phí công khai chỉ đọc (không yêu cầu admin, fail-closed)
func (r *TicketRepository) GetPublicFeeParameters(ctx context.Context) (*models.PublicFeeParametersResponse, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT param_key, param_value 
		FROM platform_system_parameter 
		WHERE param_key IN ('FIXED_FEE_PER_TICKET', 'FIXED_FEE_MIN_TICKET_PRICE')
	`)
	if err != nil {
		return nil, fmt.Errorf("lỗi đọc tham số công khai: %w", err)
	}
	defer rows.Close()

	var fixedFee int64 = -1
	var minPrice int64 = -1
	foundCount := 0

	for rows.Next() {
		var key, val string
		if err := rows.Scan(&key, &val); err != nil {
			return nil, fmt.Errorf("lỗi đọc dòng tham số hệ thống: %w", err)
		}
		parsed, errParse := strconv.ParseInt(val, 10, 64)
		if errParse != nil {
			return nil, fmt.Errorf("giá trị tham số %s không phải số nguyên hợp lệ: %w", key, errParse)
		}
		if key == "FIXED_FEE_PER_TICKET" {
			fixedFee = parsed
			foundCount++
		} else if key == "FIXED_FEE_MIN_TICKET_PRICE" {
			minPrice = parsed
			foundCount++
		}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("lỗi duyệt bảng tham số: %w", err)
	}

	if fixedFee < 0 || minPrice < 0 || foundCount < 2 {
		return nil, fmt.Errorf("FAIL-CLOSED: thiếu cấu hình FIXED_FEE_PER_TICKET hoặc FIXED_FEE_MIN_TICKET_PRICE trong DB")
	}

	return &models.PublicFeeParametersResponse{
		FixedFeePerTicket:      fixedFee,
		FixedFeeMinTicketPrice: minPrice,
	}, nil
}

// GetAdminSubscriptionAnalytics - Lấy toàn bộ số liệu thống kê gói dịch vụ, người mua gói và biểu đồ chuỗi thời gian dành cho Admin
func (r *TicketRepository) GetAdminSubscriptionAnalytics(ctx context.Context) (*models.AdminSubscriptionAnalyticsResponse, error) {
	resp := &models.AdminSubscriptionAnalyticsResponse{
		TierBreakdown: make([]models.SubscriptionTierBreakdown, 0),
		Timeline:      make([]models.SubscriptionTrendPoint, 0),
		Subscribers:   make([]models.SubscriptionSubscriberItem, 0),
	}

	// 1. Lấy danh sách phân tích theo từng Tier (PRO, BUSINESS, FREE,...)
	tierQuery := `
		SELECT 
			st.tier_code,
			st.name,
			COUNT(us.subscription_id) AS total_bought,
			COUNT(CASE WHEN us.status = 'ACTIVE' AND us.end_date > NOW() THEN 1 END) AS active_users,
			COALESCE(SUM(us.amount_paid_vnd), 0) AS total_revenue
		FROM subscription_tier st
		LEFT JOIN user_subscription us ON st.tier_id = us.tier_id
		GROUP BY st.tier_id, st.tier_code, st.name
		ORDER BY st.price_vnd ASC, st.tier_id ASC
	`
	tRows, err := r.db.QueryContext(ctx, tierQuery)
	if err != nil {
		return nil, fmt.Errorf("lỗi truy vấn phân tích gói subscription: %w", err)
	}
	defer tRows.Close()

	for tRows.Next() {
		var item models.SubscriptionTierBreakdown
		if err := tRows.Scan(&item.TierCode, &item.TierName, &item.TotalBought, &item.ActiveUsers, &item.TotalRevenue); err == nil {
			resp.TierBreakdown = append(resp.TierBreakdown, item)
			resp.TotalRevenueVND += item.TotalRevenue
			resp.TotalSubscribers += item.TotalBought
			resp.TotalActivePackages += item.ActiveUsers
		}
	}

	// 2. Tính số lượng gói hết hạn/huỷ
	var expiredCount int
	errExp := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM user_subscription WHERE status = 'EXPIRED' OR (status = 'ACTIVE' AND end_date <= NOW())
	`).Scan(&expiredCount)
	if errExp == nil {
		resp.TotalExpiredPackages = expiredCount
	}

	// 3. Lấy chuỗi thời gian xu hướng mua gói (toàn bộ lịch sử hoặc theo ngày đăng ký/kích hoạt)
	trendQuery := `
		SELECT 
			TO_CHAR(DATE(COALESCE(start_date, created_at)), 'YYYY-MM-DD') AS day_str,
			COUNT(*) AS daily_count,
			COALESCE(SUM(amount_paid_vnd), 0) AS daily_revenue
		FROM user_subscription
		GROUP BY DATE(COALESCE(start_date, created_at)), TO_CHAR(DATE(COALESCE(start_date, created_at)), 'YYYY-MM-DD')
		ORDER BY day_str ASC
	`
	trRows, err := r.db.QueryContext(ctx, trendQuery)
	if err == nil {
		defer trRows.Close()
		for trRows.Next() {
			var pt models.SubscriptionTrendPoint
			if err := trRows.Scan(&pt.Date, &pt.TotalCount, &pt.TotalRevenue); err == nil {
				resp.Timeline = append(resp.Timeline, pt)
			}
		}
	}

	// 4. Lấy danh sách chi tiết các subscribers (người mua / đang dùng gói)
	subsQuery := `
		SELECT 
			us.subscription_id,
			us.user_id,
			COALESCE(u.full_name, 'Organizer') AS full_name,
			COALESCE(u.email, '') AS email,
			st.tier_code,
			st.name AS tier_name,
			us.status,
			us.amount_paid_vnd,
			us.auto_renew,
			us.start_date,
			us.end_date,
			COALESCE(us.start_date, us.created_at) AS registered_at
		FROM user_subscription us
		JOIN subscription_tier st ON us.tier_id = st.tier_id
		LEFT JOIN users u ON us.user_id = u.user_id
		ORDER BY COALESCE(us.start_date, us.created_at) DESC
		LIMIT 100
	`
	sRows, err := r.db.QueryContext(ctx, subsQuery)
	if err == nil {
		defer sRows.Close()
		for sRows.Next() {
			var sub models.SubscriptionSubscriberItem
			if err := sRows.Scan(
				&sub.SubscriptionID, &sub.UserID, &sub.FullName, &sub.Email,
				&sub.TierCode, &sub.TierName, &sub.Status, &sub.AmountPaidVND,
				&sub.AutoRenew, &sub.StartDate, &sub.EndDate, &sub.CreatedAt,
			); err == nil {
				resp.Subscribers = append(resp.Subscribers, sub)
			}
		}
	}

	return resp, nil
}


