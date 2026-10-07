package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/fpt-event-services/services/ticket-service/models"
	"github.com/lib/pq"
)

// incrementFeeConfigVersionTx tăng phiên bản cấu hình biểu phí hệ thống lên 1 trong cùng transaction
func incrementFeeConfigVersionTx(ctx context.Context, tx *sql.Tx) (int, error) {
	var verStr string
	err := tx.QueryRowContext(ctx, `
		SELECT param_value FROM platform_system_parameter 
		WHERE param_key = 'FEE_CONFIG_VERSION' FOR UPDATE
	`).Scan(&verStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return 0, fmt.Errorf("FAIL-CLOSED: thiếu cấu hình FEE_CONFIG_VERSION trong platform_system_parameter")
		}
		return 0, fmt.Errorf("lỗi đọc FEE_CONFIG_VERSION: %w", err)
	}

	currentVer, err := strconv.Atoi(strings.TrimSpace(verStr))
	if err != nil {
		return 0, fmt.Errorf("lỗi định dạng FEE_CONFIG_VERSION không phải số nguyên: %w", err)
	}
	if currentVer <= 0 {
		return 0, fmt.Errorf("giá trị FEE_CONFIG_VERSION không hợp lệ: %d (phải > 0)", currentVer)
	}

	newVer := currentVer + 1

	res, err := tx.ExecContext(ctx, `
		UPDATE platform_system_parameter 
		SET param_value = $1, updated_at = NOW()
		WHERE param_key = 'FEE_CONFIG_VERSION'
	`, strconv.Itoa(newVer))
	if err != nil {
		return 0, fmt.Errorf("lỗi cập nhật FEE_CONFIG_VERSION: %w", err)
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("lỗi kiểm tra RowsAffected cho FEE_CONFIG_VERSION: %w", err)
	}
	if rows != 1 {
		return 0, fmt.Errorf("cập nhật FEE_CONFIG_VERSION không tác động đúng 1 dòng (rows=%d)", rows)
	}

	return newVer, nil
}

// VerifyAdminUser kiểm tra trực tiếp vai trò ADMIN trong cơ sở dữ liệu (không tin JWT)
func (r *TicketRepository) VerifyAdminUser(ctx context.Context, userID int) (bool, error) {
	if userID <= 0 {
		return false, nil
	}
	var role string
	err := r.db.QueryRowContext(ctx, "SELECT role FROM users WHERE user_id = $1", userID).Scan(&role)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("lỗi kiểm tra vai trò user trong DB: %w", err)
	}
	return role == "ADMIN", nil
}

// GetRoleFeePolicies - Lấy danh sách chính sách phí theo Role
func (r *TicketRepository) GetRoleFeePolicies(ctx context.Context) ([]models.RoleFeePolicy, error) {
	query := `
		SELECT role_code, name, description, commission_bps, max_capacity_limit,
		       has_advanced_reports, is_active, updated_at
		FROM role_fee_policy
		ORDER BY role_code ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query role fee policies: %w", err)
	}
	defer rows.Close()

	var policies []models.RoleFeePolicy
	for rows.Next() {
		var p models.RoleFeePolicy
		var desc sql.NullString
		if err := rows.Scan(
			&p.RoleCode, &p.Name, &desc, &p.CommissionBps,
			&p.MaxCapacityLimit, &p.HasAdvancedReports, &p.IsActive, &p.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan role policy: %w", err)
		}
		if desc.Valid {
			p.Description = desc.String
		}
		policies = append(policies, p)
	}
	return policies, nil
}

// UpdateRoleFeePolicy - Cập nhật chính sách phí cho Role (tăng version, ghi Audit Log trong cùng transaction)
func (r *TicketRepository) UpdateRoleFeePolicy(
	ctx context.Context, adminID int, roleCode string,
	bps int, maxCap int, hasReports bool, isActive bool, reason string,
) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("bắt buộc nhập lý do thay đổi biểu phí để ghi nhận audit log")
	}
	if bps < 0 || bps > 10000 {
		return fmt.Errorf("tỷ lệ hoa hồng không hợp lệ (phải từ 0 đến 10.000 bps)")
	}
	if maxCap <= 0 && maxCap != -1 {
		return fmt.Errorf("giới hạn sức chứa không hợp lệ (phải là -1 cho không giới hạn hoặc số nguyên > 0)")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Đọc dữ liệu cũ
	var oldPolicy models.RoleFeePolicy
	var oldDesc sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT role_code, name, description, commission_bps, max_capacity_limit, has_advanced_reports, is_active
		FROM role_fee_policy WHERE role_code = $1 FOR UPDATE
	`, roleCode).Scan(
		&oldPolicy.RoleCode, &oldPolicy.Name, &oldDesc, &oldPolicy.CommissionBps,
		&oldPolicy.MaxCapacityLimit, &oldPolicy.HasAdvancedReports, &oldPolicy.IsActive,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("role policy %s không tồn tại", roleCode)
		}
		return fmt.Errorf("lỗi đọc role policy cũ: %w", err)
	}
	if oldDesc.Valid {
		oldPolicy.Description = oldDesc.String
	}

	oldJSON, _ := json.Marshal(oldPolicy)
	newPolicy := models.RoleFeePolicy{
		RoleCode:           roleCode,
		Name:               oldPolicy.Name,
		Description:        oldPolicy.Description,
		CommissionBps:      bps,
		MaxCapacityLimit:   maxCap,
		HasAdvancedReports: hasReports,
		IsActive:           isActive,
	}
	newJSON, _ := json.Marshal(newPolicy)

	// 2. Cập nhật
	_, err = tx.ExecContext(ctx, `
		UPDATE role_fee_policy
		SET commission_bps = $1, max_capacity_limit = $2, has_advanced_reports = $3,
		    is_active = $4, updated_by = $5, updated_at = NOW()
		WHERE role_code = $6
	`, bps, maxCap, hasReports, isActive, adminID, roleCode)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật role_fee_policy: %w", err)
	}

	// 3. Tăng FEE_CONFIG_VERSION trong cùng transaction
	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	// 4. Ghi Audit Log
	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('ROLE_POLICY', $1, 'UPDATE', $2::jsonb, $3::jsonb, $4, $5, NOW())
	`, roleCode, string(oldJSON), string(newJSON), reason, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// UpdateSubscriptionTier - Cập nhật thông số gói dịch vụ (Cấm vô hiệu hóa/sửa giá FREE, tăng version, ghi Audit Log trong cùng transaction)
func (r *TicketRepository) UpdateSubscriptionTier(
	ctx context.Context, adminID int, tierID int,
	price int64, bps int, maxCap int, hasReports bool, isActive bool, reason string,
) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("bắt buộc nhập lý do thay đổi biểu phí để ghi nhận audit log")
	}
	if price < 0 {
		return fmt.Errorf("giá gói không được âm")
	}
	if bps < 0 || bps > 10000 {
		return fmt.Errorf("tỷ lệ hoa hồng không hợp lệ (phải từ 0 đến 10.000 bps)")
	}
	if maxCap <= 0 && maxCap != -1 {
		return fmt.Errorf("giới hạn sức chứa không hợp lệ (phải là -1 cho không giới hạn hoặc số nguyên > 0)")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Đọc dữ liệu cũ
	var oldTier models.SubscriptionTier
	var oldDesc sql.NullString
	err = tx.QueryRowContext(ctx, `
		SELECT tier_id, tier_code, name, description, price_vnd, billing_cycle,
		       commission_bps, max_capacity_limit, has_advanced_reports, is_active
		FROM subscription_tier WHERE tier_id = $1 FOR UPDATE
	`, tierID).Scan(
		&oldTier.TierID, &oldTier.TierCode, &oldTier.Name, &oldDesc, &oldTier.PriceVND, &oldTier.BillingCycle,
		&oldTier.CommissionBps, &oldTier.MaxCapacityLimit, &oldTier.HasAdvancedReports, &oldTier.IsActive,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("gói subscription id=%d không tồn tại", tierID)
		}
		return fmt.Errorf("lỗi đọc gói cũ: %w", err)
	}
	if oldDesc.Valid {
		oldTier.Description = oldDesc.String
	}

	// Chặn tắt hoặc sửa giá gói FREE (Ràng buộc nghiệp vụ chk_subscription_tier_free_permanent)
	if oldTier.TierCode == "FREE" {
		if !isActive {
			return fmt.Errorf("không được phép vô hiệu hóa gói FREE mặc định của hệ thống")
		}
		if price != 0 {
			return fmt.Errorf("giá gói FREE mặc định phải bằng 0 đ")
		}
	}

	oldJSON, _ := json.Marshal(oldTier)
	newTier := models.SubscriptionTier{
		TierID:             tierID,
		TierCode:           oldTier.TierCode,
		Name:               oldTier.Name,
		Description:        oldTier.Description,
		PriceVND:           price,
		BillingCycle:       oldTier.BillingCycle,
		CommissionBps:      bps,
		MaxCapacityLimit:   maxCap,
		HasAdvancedReports: hasReports,
		IsActive:           isActive,
	}
	newJSON, _ := json.Marshal(newTier)

	// 2. Cập nhật
	_, err = tx.ExecContext(ctx, `
		UPDATE subscription_tier
		SET price_vnd = $1, commission_bps = $2, max_capacity_limit = $3,
		    has_advanced_reports = $4, is_active = $5, updated_by = $6, updated_at = NOW()
		WHERE tier_id = $7
	`, price, bps, maxCap, hasReports, isActive, adminID, tierID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật subscription_tier: %w", err)
	}

	// 3. Tăng FEE_CONFIG_VERSION trong cùng transaction
	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	// 4. Ghi Audit Log
	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('SUBSCRIPTION_TIER', $1, 'UPDATE', $2::jsonb, $3::jsonb, $4, $5, NOW())
	`, oldTier.TierCode, string(oldJSON), string(newJSON), reason, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// CreateSubscriptionTier - Tạo mới gói dịch vụ
func (r *TicketRepository) CreateSubscriptionTier(ctx context.Context, adminID int, req models.CreateSubscriptionTierRequest) error {
	code := strings.ToUpper(strings.TrimSpace(req.TierCode))
	name := strings.TrimSpace(req.Name)
	if code == "" || name == "" {
		return fmt.Errorf("mã gói (tierCode) và tên gói (name) không được để trống")
	}
	if req.PriceVND < 0 {
		return fmt.Errorf("giá gói không được âm")
	}
	if req.CommissionBps < 0 || req.CommissionBps > 10000 {
		return fmt.Errorf("tỷ lệ hoa hồng không hợp lệ (phải từ 0 đến 10.000 bps)")
	}

	var exists bool
	err := r.db.QueryRowContext(ctx, "SELECT EXISTS(SELECT 1 FROM subscription_tier WHERE tier_code = $1)", code).Scan(&exists)
	if err != nil {
		return err
	}
	if exists {
		return fmt.Errorf("mã gói '%s' đã tồn tại trong hệ thống", code)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var newID int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO subscription_tier (
			tier_code, name, description, price_vnd, billing_cycle,
			commission_bps, max_capacity_limit, has_advanced_reports, is_active, created_at, updated_at
		) VALUES ($1, $2, $3, $4, 'MONTHLY', $5, $6, $7, $8, NOW(), NOW())
		RETURNING tier_id
	`, code, name, req.Description, req.PriceVND, req.CommissionBps, req.MaxCapacityLimit, req.HasAdvancedReports, req.IsActive).Scan(&newID)
	if err != nil {
		return fmt.Errorf("lỗi tạo gói dịch vụ: %w", err)
	}

	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	newJSON, _ := json.Marshal(req)
	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('SUBSCRIPTION_TIER', $1, 'CREATE', '{}'::jsonb, $2::jsonb, 'Tạo gói dịch vụ mới', $3, NOW())
	`, code, string(newJSON), adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// DeleteSubscriptionTier - Xóa gói dịch vụ tùy chỉnh
func (r *TicketRepository) DeleteSubscriptionTier(ctx context.Context, adminID int, tierID int) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var code string
	err = tx.QueryRowContext(ctx, "SELECT tier_code FROM subscription_tier WHERE tier_id = $1 FOR UPDATE", tierID).Scan(&code)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("gói dịch vụ ID=%d không tồn tại", tierID)
		}
		return err
	}

	upperCode := strings.ToUpper(code)
	if upperCode == "FREE" || upperCode == "PRO" || upperCode == "BUSINESS" {
		return fmt.Errorf("gói mặc định hệ thống (%s) không được phép xóa", code)
	}

	var count int
	err = tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM subscription_tier").Scan(&count)
	if err != nil {
		return err
	}
	if count <= 3 {
		return fmt.Errorf("không thể xóa gói khi hệ thống chỉ còn 3 gói dịch vụ")
	}

	_, err = tx.ExecContext(ctx, "DELETE FROM subscription_tier WHERE tier_id = $1", tierID)
	if err != nil {
		return fmt.Errorf("lỗi xóa gói dịch vụ: %w", err)
	}

	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('SUBSCRIPTION_TIER', $1, 'DELETE', '{}'::jsonb, '{}'::jsonb, 'Xóa gói dịch vụ tùy chỉnh', $2, NOW())
	`, code, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// GetFeeOverrides - Lấy danh sách ưu đãi hoa hồng riêng của Organizer
func (r *TicketRepository) GetFeeOverrides(ctx context.Context, organizerID *int) ([]models.OrganizerFeeOverride, error) {
	query := `
		SELECT o.override_id, o.organizer_id, u.full_name, o.commission_bps, o.reason,
		       lower(o.effective_range) AS start_time, upper(o.effective_range) AS end_time,
		       o.created_by, o.created_at
		FROM organizer_fee_override o
		JOIN users u ON o.organizer_id = u.user_id
	`
	var args []interface{}
	if organizerID != nil && *organizerID > 0 {
		query += " WHERE o.organizer_id = $1"
		args = append(args, *organizerID)
	}
	query += " ORDER BY o.override_id DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query fee overrides: %w", err)
	}
	defer rows.Close()

	var overrides []models.OrganizerFeeOverride
	for rows.Next() {
		var o models.OrganizerFeeOverride
		var orgName sql.NullString
		if err := rows.Scan(
			&o.OverrideID, &o.OrganizerID, &orgName, &o.CommissionBps, &o.Reason,
			&o.StartDate, &o.EndDate, &o.CreatedBy, &o.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan fee override: %w", err)
		}
		if orgName.Valid {
			o.OrganizerName = &orgName.String
		}
		overrides = append(overrides, o)
	}
	return overrides, nil
}

// CreateFeeOverride - Tạo ưu đãi hoa hồng riêng (kiểm tra chống chồng lấn thời gian, yêu cầu xác nhận khi override cao hơn mức gói, tăng version & ghi Audit Log)
func (r *TicketRepository) CreateFeeOverride(
	ctx context.Context, adminID int, organizerID int, bps int,
	reason string, startTime, endTime time.Time, confirmHigher bool,
) (*models.OrganizerFeeOverride, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return nil, fmt.Errorf("bắt buộc nhập lý do áp dụng ưu đãi")
	}
	if bps < 0 || bps > 10000 {
		return nil, fmt.Errorf("tỷ lệ hoa hồng ưu đãi không hợp lệ (0 - 10000 bps)")
	}
	if !endTime.After(startTime) {
		return nil, fmt.Errorf("thời gian kết thúc ưu đãi phải sau thời gian bắt đầu")
	}

	// 1. Kiểm tra organizer tồn tại & xác định cảnh báo nếu bps cao hơn gói hiện tại
	var userRole string
	err := r.db.QueryRowContext(ctx, "SELECT role FROM users WHERE user_id = $1", organizerID).Scan(&userRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("người dùng %d không tồn tại", organizerID)
		}
		return nil, fmt.Errorf("lỗi kiểm tra người dùng: %w", err)
	}

	var warningMsg string
	resolved, errResolve := r.GetCurrentSubscription(ctx, organizerID)
	if errResolve != nil {
		return nil, fmt.Errorf("lỗi kiểm tra gói/vai trò hiện tại của organizer: %w", errResolve)
	}
	if resolved != nil {
		if bps > resolved.CommissionBps {
			warningMsg = fmt.Sprintf("Mức hoa hồng override (%d bps = %.2f%%) cao hơn mức gói/vai trò hiện tại (%d bps = %.2f%%) của Organizer.",
				bps, float64(bps)/100.0, resolved.CommissionBps, float64(resolved.CommissionBps)/100.0)
			if !confirmHigher {
				return nil, &models.ConfirmationRequiredError{
					Message:       fmt.Sprintf("%s Vui lòng xác nhận cờ 'confirmHigher=true' để tiếp tục lưu.", warningMsg),
					CommissionBps: bps,
					CurrentBps:    resolved.CommissionBps,
				}
			}
		}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	// 2. Chèn vào bảng organizer_fee_override với tstzrange
	var newID int
	insertQuery := `
		INSERT INTO organizer_fee_override (
			organizer_id, commission_bps, reason, effective_range, created_by, created_at, updated_at
		) VALUES ($1, $2, $3, tstzrange($4, $5, '[)'), $6, NOW(), NOW())
		RETURNING override_id
	`
	err = tx.QueryRowContext(ctx, insertQuery, organizerID, bps, reason, startTime, endTime, adminID).Scan(&newID)
	if err != nil {
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && (pqErr.Constraint == "uq_organizer_fee_override_no_overlap" || pqErr.Code == "23P01") {
			return nil, fmt.Errorf("%w: [%s - %s]", models.ErrOverrideOverlap,
				startTime.Format("02/01/2006 15:04"), endTime.Format("02/01/2006 15:04"))
		}
		return nil, fmt.Errorf("lỗi tạo ưu đãi hoa hồng: %w", err)
	}

	// 3. Tăng FEE_CONFIG_VERSION trong cùng transaction
	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return nil, err
	}

	// 4. Ghi Audit Log
	newVal := map[string]interface{}{
		"organizerId":   organizerID,
		"commissionBps": bps,
		"reason":        reason,
		"startTime":     startTime,
		"endTime":       endTime,
	}
	newJSON, _ := json.Marshal(newVal)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('FEE_OVERRIDE', $1, 'CREATE', NULL, $2::jsonb, $3, $4, NOW())
	`, strconv.Itoa(newID), string(newJSON), reason, adminID)
	if err != nil {
		return nil, fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit: %w", err)
	}

	return &models.OrganizerFeeOverride{
		OverrideID:    newID,
		OrganizerID:   organizerID,
		CommissionBps: bps,
		Reason:        reason,
		StartDate:     startTime,
		EndDate:       endTime,
		CreatedBy:     adminID,
		CreatedAt:     time.Now(),
		Warning:       warningMsg,
	}, nil
}

// DeleteFeeOverride - Xóa ưu đãi hoa hồng (tăng version, có Audit Log)
func (r *TicketRepository) DeleteFeeOverride(ctx context.Context, adminID int, overrideID int, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("bắt buộc nhập lý do hủy ưu đãi")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var organizerID, bps int
	var oldReason string
	var start, end time.Time
	err = tx.QueryRowContext(ctx, `
		SELECT organizer_id, commission_bps, reason, lower(effective_range), upper(effective_range)
		FROM organizer_fee_override WHERE override_id = $1 FOR UPDATE
	`, overrideID).Scan(&organizerID, &bps, &oldReason, &start, &end)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("ưu đãi id=%d không tồn tại", overrideID)
		}
		return fmt.Errorf("lỗi đọc ưu đãi: %w", err)
	}

	oldVal := map[string]interface{}{
		"overrideId":    overrideID,
		"organizerId":   organizerID,
		"commissionBps": bps,
		"reason":        oldReason,
		"start":         start,
		"end":           end,
	}
	oldJSON, _ := json.Marshal(oldVal)

	_, err = tx.ExecContext(ctx, "DELETE FROM organizer_fee_override WHERE override_id = $1", overrideID)
	if err != nil {
		return fmt.Errorf("lỗi xóa ưu đãi: %w", err)
	}

	// Tăng FEE_CONFIG_VERSION trong cùng transaction
	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('FEE_OVERRIDE', $1, 'DEACTIVATE', $2::jsonb, NULL, $3, $4, NOW())
	`, strconv.Itoa(overrideID), string(oldJSON), reason, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// AssignSchoolOrganizerRole - Cấp quyền School Organizer cho tài khoản Organizer (Lưu previous_role, tăng version, ghi Audit)
func (r *TicketRepository) AssignSchoolOrganizerRole(ctx context.Context, adminID int, targetUserID int, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("bắt buộc nhập lý do cấp quyền School Organizer")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var currentRole string
	err = tx.QueryRowContext(ctx, "SELECT role FROM users WHERE user_id = $1 FOR UPDATE", targetUserID).Scan(&currentRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("người dùng %d không tồn tại", targetUserID)
		}
		return fmt.Errorf("lỗi đọc thông tin user: %w", err)
	}

	if currentRole == "SCHOOL_ORGANIZER" {
		return fmt.Errorf("tài khoản này đã có vai trò School Organizer")
	}
	if currentRole != "ORGANIZER" {
		return fmt.Errorf("chỉ có thể cấp quyền School Organizer cho tài khoản Organizer (vai trò hiện tại: %s)", currentRole)
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE users 
		SET previous_role = role, role = 'SCHOOL_ORGANIZER'
		WHERE user_id = $1
	`, targetUserID)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật vai trò user: %w", err)
	}

	// Tăng FEE_CONFIG_VERSION trong cùng transaction
	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	oldVal := map[string]interface{}{"role": currentRole}
	newVal := map[string]interface{}{"role": "SCHOOL_ORGANIZER"}
	oldJSON, _ := json.Marshal(oldVal)
	newJSON, _ := json.Marshal(newVal)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('USER_ROLE', $1, 'ROLE_ASSIGN', $2::jsonb, $3::jsonb, $4, $5, NOW())
	`, strconv.Itoa(targetUserID), string(oldJSON), string(newJSON), reason, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// RevokeSchoolOrganizerRole - Thu hồi quyền School Organizer, hoàn trả vai trò cũ từ previous_role (tăng version, ghi Audit)
func (r *TicketRepository) RevokeSchoolOrganizerRole(ctx context.Context, adminID int, targetUserID int, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("bắt buộc nhập lý do thu hồi quyền School Organizer")
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var currentRole string
	var prevRole sql.NullString
	err = tx.QueryRowContext(ctx, "SELECT role, previous_role FROM users WHERE user_id = $1 FOR UPDATE", targetUserID).Scan(&currentRole, &prevRole)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("người dùng %d không tồn tại", targetUserID)
		}
		return fmt.Errorf("lỗi đọc thông tin user: %w", err)
	}

	if currentRole != "SCHOOL_ORGANIZER" {
		return fmt.Errorf("tài khoản này không mang vai trò School Organizer (vai trò hiện tại: %s)", currentRole)
	}

	targetRestoreRole := "ORGANIZER"
	if prevRole.Valid && prevRole.String != "" {
		targetRestoreRole = prevRole.String
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE users 
		SET role = $1::user_role_enum, previous_role = NULL
		WHERE user_id = $2
	`, targetRestoreRole, targetUserID)
	if err != nil {
		return fmt.Errorf("lỗi hoàn trả vai trò user: %w", err)
	}

	// Tăng FEE_CONFIG_VERSION trong cùng transaction
	if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
		return err
	}

	oldValRev := map[string]interface{}{"role": "SCHOOL_ORGANIZER"}
	newValRev := map[string]interface{}{"role": targetRestoreRole}
	oldJSONRev, _ := json.Marshal(oldValRev)
	newJSONRev, _ := json.Marshal(newValRev)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('USER_ROLE', $1, 'ROLE_REVOKE', $2::jsonb, $3::jsonb, $4, $5, NOW())
	`, strconv.Itoa(targetUserID), string(oldJSONRev), string(newJSONRev), reason, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// GetSystemParameters - Lấy tất cả tham số hệ thống
func (r *TicketRepository) GetSystemParameters(ctx context.Context) ([]models.PlatformSystemParameter, error) {
	rows, err := r.db.QueryContext(ctx, "SELECT param_key, param_value, description, updated_at FROM platform_system_parameter ORDER BY param_key ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to query system parameters: %w", err)
	}
	defer rows.Close()

	var params []models.PlatformSystemParameter
	for rows.Next() {
		var p models.PlatformSystemParameter
		var desc sql.NullString
		if err := rows.Scan(&p.ParamKey, &p.ParamValue, &desc, &p.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan parameter: %w", err)
		}
		if desc.Valid {
			p.Description = desc.String
		}
		params = append(params, p)
	}
	return params, nil
}

// UpdateSystemParameter - Cập nhật tham số hệ thống (hỗ trợ FIXED_FEE_PER_TICKET, FIXED_FEE_MIN_TICKET_PRICE, tăng version, ghi Audit Log)
func (r *TicketRepository) UpdateSystemParameter(ctx context.Context, adminID int, key, value, reason string) error {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return fmt.Errorf("bắt buộc nhập lý do thay đổi tham số hệ thống")
	}

	if key == "FIXED_FEE_PER_TICKET" || key == "FIXED_FEE_MIN_TICKET_PRICE" {
		v, err := strconv.ParseInt(value, 10, 64)
		if err != nil || v < 0 {
			return fmt.Errorf("giá trị tham số %s phải là số nguyên không âm", key)
		}
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to start transaction: %w", err)
	}
	defer tx.Rollback()

	var oldValue string
	err = tx.QueryRowContext(ctx, "SELECT param_value FROM platform_system_parameter WHERE param_key = $1 FOR UPDATE", key).Scan(&oldValue)
	if err != nil {
		return fmt.Errorf("tham số %s không tồn tại trong hệ thống: %w", key, err)
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE platform_system_parameter 
		SET param_value = $1, updated_by = $2, updated_at = NOW()
		WHERE param_key = $3
	`, value, adminID, key)
	if err != nil {
		return fmt.Errorf("lỗi cập nhật tham số: %w", err)
	}

	// Tăng FEE_CONFIG_VERSION trong cùng transaction (trừ khi chính tham số cập nhật là FEE_CONFIG_VERSION)
	if key != "FEE_CONFIG_VERSION" {
		if _, err := incrementFeeConfigVersionTx(ctx, tx); err != nil {
			return err
		}
	}

	oldVal := map[string]interface{}{"value": oldValue}
	newVal := map[string]interface{}{"value": value}
	oldJSON, _ := json.Marshal(oldVal)
	newJSON, _ := json.Marshal(newVal)

	_, err = tx.ExecContext(ctx, `
		INSERT INTO fee_audit_log (
			target_entity, target_id, action, old_value, new_value, reason, changed_by, created_at
		) VALUES ('SYSTEM_PARAM', $1, 'UPDATE', $2::jsonb, $3::jsonb, $4, $5, NOW())
	`, key, string(oldJSON), string(newJSON), reason, adminID)
	if err != nil {
		return fmt.Errorf("lỗi ghi audit log: %w", err)
	}

	return tx.Commit()
}

// SimulateFeeCalculation - Sandbox tính thử hoa hồng cho vé bán
func (r *TicketRepository) SimulateFeeCalculation(ctx context.Context, req models.FeeSimulationRequest) (*models.FeeSimulationResponse, error) {
	if req.TicketPrice < 0 {
		return nil, fmt.Errorf("giá vé không được âm")
	}
	if req.TicketQuantity <= 0 {
		req.TicketQuantity = 1
	}

	// 1. Đọc tham số fixed fee và version
	fixedFeePerTicket := 1000.0
	minPriceForFixedFee := 20000.0
	configVersion := 1

	var fixedFeeStr, minPriceStr, verStr string
	_ = r.db.QueryRowContext(ctx, "SELECT param_value FROM platform_system_parameter WHERE param_key = 'FIXED_FEE_PER_TICKET'").Scan(&fixedFeeStr)
	_ = r.db.QueryRowContext(ctx, "SELECT param_value FROM platform_system_parameter WHERE param_key = 'FIXED_FEE_MIN_TICKET_PRICE'").Scan(&minPriceStr)
	_ = r.db.QueryRowContext(ctx, "SELECT param_value FROM platform_system_parameter WHERE param_key = 'FEE_CONFIG_VERSION'").Scan(&verStr)

	if v, err := strconv.ParseFloat(fixedFeeStr, 64); err == nil && v >= 0 {
		fixedFeePerTicket = v
	}
	if v, err := strconv.ParseFloat(minPriceStr, 64); err == nil && v >= 0 {
		minPriceForFixedFee = v
	}
	if v, err := strconv.Atoi(verStr); err == nil && v > 0 {
		configVersion = v
	}

	// 2. Xác định bps, tierCode, feeSource
	commissionBps := 500
	tierCode := "FREE"
	feeSource := "FREE"

	if req.OrganizerID != nil && *req.OrganizerID > 0 {
		// Phân giải theo Organizer ID thực tế
		policy, err := r.GetCurrentSubscription(ctx, *req.OrganizerID)
		if err == nil {
			commissionBps = policy.CommissionBps
			tierCode = policy.TierCode
			feeSource = policy.FeeSource
		}
	} else if req.RoleCode != nil && *req.RoleCode == "SCHOOL_ORGANIZER" {
		tierCode = "SCHOOL_ORGANIZER"
		feeSource = "ROLE"
		var bps int
		if err := r.db.QueryRowContext(ctx, "SELECT commission_bps FROM role_fee_policy WHERE role_code = 'SCHOOL_ORGANIZER'").Scan(&bps); err == nil {
			commissionBps = bps
		} else {
			commissionBps = 250
		}
	} else if req.TierCode != nil {
		tierCode = *req.TierCode
		feeSource = "TIER"
		var bps int
		if err := r.db.QueryRowContext(ctx, "SELECT commission_bps FROM subscription_tier WHERE tier_code = $1", tierCode).Scan(&bps); err == nil {
			commissionBps = bps
		} else {
			switch tierCode {
			case "PRO":
				commissionBps = 250
			case "BUSINESS":
				commissionBps = 0
			default:
				commissionBps = 500
				feeSource = "FREE"
			}
		}
	}

	// 3. Tính toán tài chính (Công thức int64 đầu cuối: commission = (gross * bps) / 10000 + fixed_fee)
	priceInt := int64(req.TicketPrice)
	fixedFeeInt := int64(fixedFeePerTicket)
	minPriceInt := int64(minPriceForFixedFee)
	bpsInt := int64(commissionBps)
	qtyInt := int64(req.TicketQuantity)

	var applicableFixedFeeInt int64 = 0
	if priceInt >= minPriceInt {
		applicableFixedFeeInt = fixedFeeInt
	}

	percentCommPerTicketInt := (priceInt * bpsInt) / 10000
	feePerTicketInt := percentCommPerTicketInt + applicableFixedFeeInt

	grossTotalInt := priceInt * qtyInt
	totalFeeInt := feePerTicketInt * qtyInt
	totalFixedInt := applicableFixedFeeInt * qtyInt
	netTotalInt := grossTotalInt - totalFeeInt

	return &models.FeeSimulationResponse{
		TicketPrice:       req.TicketPrice,
		TicketQuantity:    req.TicketQuantity,
		GrossAmount:       float64(grossTotalInt),
		CommissionBps:     commissionBps,
		CommissionPercent: float64(commissionBps) / 100.0,
		FixedFeePerTicket: float64(applicableFixedFeeInt),
		CommissionAmount:  float64(totalFeeInt),
		TotalFixedFee:     float64(totalFixedInt),
		TotalPlatformFee:  float64(totalFeeInt),
		NetAmount:         float64(netTotalInt),
		TierCode:          tierCode,
		FeeSource:         feeSource,
		ConfigVersion:     configVersion,
	}, nil
}

// GetFeeAuditLogs - Lấy danh sách lịch sử kiểm toán biểu phí
func (r *TicketRepository) GetFeeAuditLogs(ctx context.Context, page, limit int, entity, action string) ([]models.FeeAuditLog, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	whereClause := "WHERE 1=1"
	var args []interface{}
	idx := 1

	if entity != "" {
		whereClause += fmt.Sprintf(" AND l.target_entity = $%d", idx)
		args = append(args, entity)
		idx++
	}
	if action != "" {
		whereClause += fmt.Sprintf(" AND l.action = $%d", idx)
		args = append(args, action)
		idx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM fee_audit_log l %s", whereClause)
	var totalRecords int
	if err := r.db.QueryRowContext(ctx, countQuery, args...).Scan(&totalRecords); err != nil {
		return nil, 0, fmt.Errorf("failed to count audit logs: %w", err)
	}

	query := fmt.Sprintf(`
		SELECT l.log_id, l.target_entity, l.target_id, l.action,
		       l.old_value::text, l.new_value::text, l.reason, l.changed_by,
		       u.full_name, l.created_at
		FROM fee_audit_log l
		LEFT JOIN users u ON l.changed_by = u.user_id
		%s
		ORDER BY l.log_id DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, idx, idx+1)

	args = append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query audit logs: %w", err)
	}
	defer rows.Close()

	var logs []models.FeeAuditLog
	for rows.Next() {
		var l models.FeeAuditLog
		var oldV, newV, changedName sql.NullString
		if err := rows.Scan(
			&l.LogID, &l.TargetEntity, &l.TargetID, &l.Action,
			&oldV, &newV, &l.Reason, &l.ChangedBy, &changedName, &l.CreatedAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan audit log: %w", err)
		}
		if oldV.Valid {
			l.OldValue = &oldV.String
		}
		if newV.Valid {
			l.NewValue = &newV.String
		}
		if changedName.Valid {
			l.ChangedByName = &changedName.String
		}
		logs = append(logs, l)
	}

	return logs, totalRecords, nil
}
