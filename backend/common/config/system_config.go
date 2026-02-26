package config

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// SystemConfig chứa cấu hình hệ thống cho check-in/check-out
// Tương đương với SystemConfig.json trong Java backend
type SystemConfig struct {
	// CheckinAllowedBeforeStartMinutes: Số phút cho phép check-in trước start_time
	// Mặc định: 60 phút (người dùng có thể check-in từ startTime - 60 phút)
	CheckinAllowedBeforeStartMinutes int `json:"checkinAllowedBeforeStartMinutes"`

	// MinMinutesAfterStart: Số phút tối thiểu sau start_time mới cho phép check-out
	// Mặc định: 60 phút (người dùng chỉ được check-out sau startTime + 60 phút)
	MinMinutesAfterStart int `json:"minMinutesAfterStart"`
}

var (
	globalConfig *SystemConfig
	configMutex  sync.RWMutex
	configPath   = "config/system_config.json"
)

// DefaultConfig trả về cấu hình mặc định (giống Java)
func DefaultConfig() *SystemConfig {
	return &SystemConfig{
		CheckinAllowedBeforeStartMinutes: 60,
		MinMinutesAfterStart:             60,
	}
}

// LoadConfig đọc cấu hình từ file system_config.json
// Nếu file không tồn tại hoặc lỗi, trả về cấu hình mặc định
func LoadConfig() *SystemConfig {
	configMutex.RLock()
	if globalConfig != nil {
		configMutex.RUnlock()
		return globalConfig
	}
	configMutex.RUnlock()

	configMutex.Lock()
	defer configMutex.Unlock()

	// Double-check sau khi có lock
	if globalConfig != nil {
		return globalConfig
	}

	// Tìm file config
	cfg := DefaultConfig()

	// Thử các đường dẫn có thể
	possiblePaths := []string{
		configPath,
		filepath.Join(".", configPath),
		filepath.Join("..", configPath),
		filepath.Join("fpt-event-services #2", configPath),
	}

	var data []byte
	var err error

	for _, path := range possiblePaths {
		data, err = os.ReadFile(path)
		if err == nil {
			// Tìm thấy file
			if jsonErr := json.Unmarshal(data, cfg); jsonErr != nil {
				fmt.Printf("[WARN] Failed to parse config from %s: %v. Using defaults.\n", path, jsonErr)
				cfg = DefaultConfig()
			} else {
				fmt.Printf("[INFO] Loaded system config from %s\n", path)
			}
			break
		}
	}

	if err != nil {
		fmt.Printf("[WARN] Config file not found. Using default config: checkinAllowedBeforeStartMinutes=%d, minMinutesAfterStart=%d\n",
			cfg.CheckinAllowedBeforeStartMinutes, cfg.MinMinutesAfterStart)
	}

	// Validate config
	if cfg.CheckinAllowedBeforeStartMinutes < 0 || cfg.CheckinAllowedBeforeStartMinutes > 600 {
		cfg.CheckinAllowedBeforeStartMinutes = 60
	}
	if cfg.MinMinutesAfterStart < 0 || cfg.MinMinutesAfterStart > 600 {
		cfg.MinMinutesAfterStart = 60
	}

	globalConfig = cfg
	return globalConfig
}

// SaveConfig lưu cấu hình vào file (chỉ ADMIN mới được gọi)
func SaveConfig(cfg *SystemConfig) error {
	if cfg == nil {
		return fmt.Errorf("config cannot be nil")
	}

	// Validate
	if cfg.CheckinAllowedBeforeStartMinutes < 0 || cfg.CheckinAllowedBeforeStartMinutes > 600 {
		return fmt.Errorf("checkinAllowedBeforeStartMinutes must be between 0 and 600")
	}
	if cfg.MinMinutesAfterStart < 0 || cfg.MinMinutesAfterStart > 600 {
		return fmt.Errorf("minMinutesAfterStart must be between 0 and 600")
	}

	configMutex.Lock()
	defer configMutex.Unlock()

	// Tạo thư mục nếu chưa tồn tại
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	// Write to file
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	// Update global config
	globalConfig = cfg
	fmt.Printf("[INFO] System config saved: checkinAllowedBeforeStartMinutes=%d, minMinutesAfterStart=%d\n",
		cfg.CheckinAllowedBeforeStartMinutes, cfg.MinMinutesAfterStart)

	return nil
}

// GetConfig trả về cấu hình hiện tại (thread-safe)
func GetConfig() *SystemConfig {
	return LoadConfig()
}

// UpdateConfig cập nhật cấu hình (chỉ ADMIN mới được gọi)
func UpdateConfig(checkinBefore, checkoutAfter int) error {
	cfg := &SystemConfig{
		CheckinAllowedBeforeStartMinutes: checkinBefore,
		MinMinutesAfterStart:             checkoutAfter,
	}
	return SaveConfig(cfg)
}

// ============================================================
// ✅ Priority Logic: Per-Event Config > Global Config
// ============================================================

// GetEffectiveCheckinOffset trả về check-in offset có hiệu lực
// Priority: Per-event checkin_offset > Global config
// Params:
//   - eventCheckinOffset: sql.NullInt64 từ Event.checkin_offset (NULL hoặc 0 = use global)
//
// Returns: Số phút cho phép check-in trước start_time
func GetEffectiveCheckinOffset(eventCheckinOffset sql.NullInt64) int {
	// Case 1: Event có config riêng (NOT NULL và > 0)
	if eventCheckinOffset.Valid && eventCheckinOffset.Int64 > 0 {
		return int(eventCheckinOffset.Int64)
	}

	// Case 2: Fallback to global config
	globalConfig := GetConfig()
	return globalConfig.CheckinAllowedBeforeStartMinutes
}

// GetEffectiveCheckoutOffset trả về check-out offset có hiệu lực
// Priority: Per-event checkout_offset > Global config
// Params:
//   - eventCheckoutOffset: sql.NullInt64 từ Event.checkout_offset (NULL hoặc 0 = use global)
//
// Returns: Số phút tối thiểu sau start_time mới cho phép check-out
func GetEffectiveCheckoutOffset(eventCheckoutOffset sql.NullInt64) int {
	// Case 1: Event có config riêng (NOT NULL và > 0)
	if eventCheckoutOffset.Valid && eventCheckoutOffset.Int64 > 0 {
		return int(eventCheckoutOffset.Int64)
	}

	// Case 2: Fallback to global config
	globalConfig := GetConfig()
	return globalConfig.MinMinutesAfterStart
}
