package config

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	ssmtypes "github.com/aws/aws-sdk-go-v2/service/ssm/types"
)

// isLocal returns true when running outside AWS Lambda (local development)
func isLocal() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// ssmParamName returns the SSM parameter path for system config.
// Override via env var SSM_SYSTEM_CONFIG_PATH (set in template.yaml).
func ssmParamName() string {
	if v := os.Getenv("SSM_SYSTEM_CONFIG_PATH"); v != "" {
		return v
	}
	return "/fpt-events/system-config"
}

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

// LoadConfig đọc cấu hình từ file (Local) hoặc SSM Parameter Store (AWS).
// Nếu không tìm thấy, trả về cấu hình mặc định.
func LoadConfig() *SystemConfig {
	configMutex.RLock()
	if globalConfig != nil {
		configMutex.RUnlock()
		return globalConfig
	}
	configMutex.RUnlock()

	configMutex.Lock()
	defer configMutex.Unlock()

	// Double-check sau khi có write lock
	if globalConfig != nil {
		return globalConfig
	}

	var cfg *SystemConfig
	if isLocal() {
		cfg = loadConfigFromFile()
	} else {
		cfg = loadConfigFromSSM()
	}

	validateAndClamp(cfg)
	globalConfig = cfg
	return globalConfig
}

// loadConfigFromFile đọc config từ file system_config.json (Local mode)
func loadConfigFromFile() *SystemConfig {
	cfg := DefaultConfig()

	possiblePaths := []string{
		configPath,
		filepath.Join(".", configPath),
		filepath.Join("..", configPath),
		filepath.Join("fpt-event-services #2", configPath),
	}

	for _, path := range possiblePaths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		if jsonErr := json.Unmarshal(data, cfg); jsonErr != nil {
			fmt.Printf("[WARN] Failed to parse config from %s: %v. Using defaults.\n", path, jsonErr)
			return DefaultConfig()
		}
		fmt.Printf("[INFO] Loaded system config from file: %s\n", path)
		return cfg
	}

	fmt.Printf("[WARN] Config file not found. Using defaults: checkinBefore=%d, checkoutAfter=%d\n",
		cfg.CheckinAllowedBeforeStartMinutes, cfg.MinMinutesAfterStart)
	return cfg
}

// loadConfigFromSSM đọc config từ AWS SSM Parameter Store (AWS Lambda mode)
func loadConfigFromSSM() *SystemConfig {
	cfg := DefaultConfig()

	ctx := context.Background()
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		fmt.Printf("[WARN] SSM: failed to load AWS config: %v. Using defaults.\n", err)
		return cfg
	}

	client := ssm.NewFromConfig(awsCfg)
	paramName := ssmParamName()

	output, err := client.GetParameter(ctx, &ssm.GetParameterInput{
		Name:           aws.String(paramName),
		WithDecryption: aws.Bool(false),
	})
	if err != nil {
		fmt.Printf("[WARN] SSM: parameter %s not found (%v). Using defaults.\n", paramName, err)
		return cfg
	}

	if output.Parameter != nil && output.Parameter.Value != nil {
		if jsonErr := json.Unmarshal([]byte(*output.Parameter.Value), cfg); jsonErr != nil {
			fmt.Printf("[WARN] SSM: failed to parse parameter value: %v. Using defaults.\n", jsonErr)
			return DefaultConfig()
		}
		fmt.Printf("[INFO] Loaded system config from SSM: %s\n", paramName)
	}

	return cfg
}

// validateAndClamp ensures config values are within acceptable bounds
func validateAndClamp(cfg *SystemConfig) {
	if cfg.CheckinAllowedBeforeStartMinutes < 0 || cfg.CheckinAllowedBeforeStartMinutes > 600 {
		cfg.CheckinAllowedBeforeStartMinutes = 60
	}
	if cfg.MinMinutesAfterStart < 0 || cfg.MinMinutesAfterStart > 600 {
		cfg.MinMinutesAfterStart = 60
	}
}

// SaveConfig lưu cấu hình vào file (Local) hoặc SSM Parameter Store (AWS).
// Chỉ ADMIN mới được gọi hàm này.
func SaveConfig(cfg *SystemConfig) error {
	if cfg == nil {
		return fmt.Errorf("config cannot be nil")
	}

	if cfg.CheckinAllowedBeforeStartMinutes < 0 || cfg.CheckinAllowedBeforeStartMinutes > 600 {
		return fmt.Errorf("checkinAllowedBeforeStartMinutes must be between 0 and 600")
	}
	if cfg.MinMinutesAfterStart < 0 || cfg.MinMinutesAfterStart > 600 {
		return fmt.Errorf("minMinutesAfterStart must be between 0 and 600")
	}

	var err error
	if isLocal() {
		err = saveConfigToFile(cfg)
	} else {
		err = saveConfigToSSM(cfg)
	}
	if err != nil {
		return err
	}

	// Update in-memory cache regardless of backend
	configMutex.Lock()
	globalConfig = cfg
	configMutex.Unlock()

	fmt.Printf("[INFO] System config saved: checkinBefore=%d, checkoutAfter=%d\n",
		cfg.CheckinAllowedBeforeStartMinutes, cfg.MinMinutesAfterStart)
	return nil
}

// saveConfigToFile lưu config vào file system_config.json (Local mode)
func saveConfigToFile(cfg *SystemConfig) error {
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}
	return nil
}

// saveConfigToSSM lưu config lên AWS SSM Parameter Store (AWS Lambda mode)
func saveConfigToSSM(cfg *SystemConfig) error {
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal config for SSM: %w", err)
	}

	ctx := context.Background()
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return fmt.Errorf("SSM: failed to load AWS config: %w", err)
	}

	client := ssm.NewFromConfig(awsCfg)
	paramName := ssmParamName()

	_, err = client.PutParameter(ctx, &ssm.PutParameterInput{
		Name:      aws.String(paramName),
		Value:     aws.String(string(data)),
		Type:      ssmtypes.ParameterTypeString,
		Overwrite: aws.Bool(true),
	})
	if err != nil {
		return fmt.Errorf("SSM: failed to put parameter %s: %w", paramName, err)
	}
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
