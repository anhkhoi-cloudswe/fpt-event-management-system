package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/logger"
)

const LandingConfigKey = "MAIN_LANDING_CONFIG"

// GetLandingPageConfig lấy cấu hình giao diện trang guest từ Database
func (r *EventRepository) GetLandingPageConfig(ctx context.Context) (*config.FrontendConfig, error) {
	query := `
		SELECT config_value::text 
		FROM public.landing_page_config 
		WHERE config_key = $1
		LIMIT 1;
	`

	var rawJSON string
	err := r.db.QueryRowContext(ctx, query, LandingConfigKey).Scan(&rawJSON)
	if err != nil {
		if err == sql.ErrNoRows {
			// Chưa có trong DB -> trả về nil để caller fallback sang file/defaults
			return nil, nil
		}
		return nil, fmt.Errorf("failed to query landing_page_config: %w", err)
	}

	var cfg config.FrontendConfig
	if err := json.Unmarshal([]byte(rawJSON), &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal landing_page_config JSON: %w", err)
	}

	return &cfg, nil
}

// SaveLandingPageConfig lưu/cập nhật cấu hình giao diện trang guest vào Database (UPSERT)
func (r *EventRepository) SaveLandingPageConfig(ctx context.Context, cfg *config.FrontendConfig, updatedBy int) error {
	if cfg == nil {
		return fmt.Errorf("frontend config cannot be nil")
	}

	rawJSON, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal frontend config for DB: %w", err)
	}

	// Chú ý: Dùng $2::jsonb và truyền string(rawJSON) để driver lib/pq gửi dạng text,
	// tránh lỗi "unsupported jsonb version number 123" do pq driver hiểu nhầm []byte là binary jsonb.
	query := `
		INSERT INTO public.landing_page_config (config_key, config_value, description, updated_by, updated_at)
		VALUES ($1, $2::jsonb, 'Cấu hình giao diện Landing Page CMS', NULLIF($3, 0), CURRENT_TIMESTAMP)
		ON CONFLICT (config_key) DO UPDATE 
		SET config_value = EXCLUDED.config_value,
		    updated_by = EXCLUDED.updated_by,
		    updated_at = CURRENT_TIMESTAMP;
	`

	_, err = r.db.ExecContext(ctx, query, LandingConfigKey, string(rawJSON), updatedBy)
	if err != nil {
		logger.Error("SaveLandingPageConfig error: %v", err)
		return fmt.Errorf("failed to upsert landing_page_config: %w", err)
	}

	return nil
}
