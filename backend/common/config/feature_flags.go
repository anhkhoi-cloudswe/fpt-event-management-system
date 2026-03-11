package config

import (
	"os"
	"sync"

	"github.com/fpt-event-services/common/logger"
)

// ============================================================
// Feature Flags - Hệ thống cờ tính năng cho Microservices Migration
//
// Mục đích: Cho phép bật/tắt từng tính năng mới mà KHÔNG cần deploy lại
// Safety: Mặc định tất cả = false → Rollback ngay lập tức nếu lỗi
//
// Cách sử dụng:
//   if config.IsFeatureEnabled(config.FlagVenueAPI) {
//       // Logic microservice mới
//   } else {
//       // Logic monolith cũ (giữ nguyên)
//   }
// ============================================================

// Feature Flag Constants
const (
	// FlagUseAPIComposition - Bật API Composition pattern thay SQL JOIN chéo domain
	// Ảnh hưởng: ticket-lambda GetMyTickets, và các query cross-service
	FlagUseAPIComposition = "USE_API_COMPOSITION"

	// FlagVenueAPIEnabled - Bật Venue Service internal APIs
	// Ảnh hưởng: venue_repository.go - Refactor JOIN sang API call
	FlagVenueAPIEnabled = "VENUE_API_ENABLED"

	// FlagAuthAPIEnabled - Bật Auth Service internal APIs
	// Ảnh hưởng: Cross-service user info lookup
	FlagAuthAPIEnabled = "AUTH_API_ENABLED"

	// FlagTicketAPIEnabled - Bật Ticket Service internal APIs
	// Ảnh hưởng: Cross-service ticket info lookup
	FlagTicketAPIEnabled = "TICKET_API_ENABLED"

	// FlagEventAPIEnabled - Bật Event Service internal APIs
	// Ảnh hưởng: Cross-service event info lookup
	FlagEventAPIEnabled = "EVENT_API_ENABLED"

	// FlagWalletServiceEnabled - Bật Wallet Service tách biệt
	// Ảnh hưởng: Dual-Write vào bảng Wallet mới + bảng Users.Wallet cũ
	FlagWalletServiceEnabled = "WALLET_SERVICE_ENABLED"

	// FlagSagaEnabled - Bật Saga pattern cho distributed transactions
	// Ảnh hưởng: Cross-service transaction coordination
	FlagSagaEnabled = "SAGA_ENABLED"

	// FlagNotificationAPIEnabled - Bật Notification Service internal APIs
	// Ảnh hưởng: Email/PDF/QR generation qua API thay vì local
	FlagNotificationAPIEnabled = "NOTIFICATION_API_ENABLED"

	// FlagServiceSpecificScheduler - Bật scheduler chạy trong từng service
	// Ảnh hưởng: Scheduler di chuyển từ common/scheduler vào service-lambda tương ứng
	FlagServiceSpecificScheduler = "SERVICE_SPECIFIC_SCHEDULER"

	// FlagServiceSpecificDB - Bật DB init riêng cho từng service
	// Ảnh hưởng: Mỗi service tự khởi tạo kết nối DB thay vì dùng chung db.GetDB()
	FlagServiceSpecificDB = "SERVICE_SPECIFIC_DB"
)

// AllFeatureFlags - Danh sách tất cả feature flags để logging/monitoring
var AllFeatureFlags = []string{
	FlagUseAPIComposition,
	FlagVenueAPIEnabled,
	FlagAuthAPIEnabled,
	FlagTicketAPIEnabled,
	FlagEventAPIEnabled,
	FlagWalletServiceEnabled,
	FlagSagaEnabled,
	FlagNotificationAPIEnabled,
	FlagServiceSpecificScheduler,
	FlagServiceSpecificDB,
}

var (
	flagCache     map[string]bool
	flagCacheMu   sync.RWMutex
	flagCacheOnce sync.Once
)

// IsFeatureEnabled kiểm tra xem feature flag có được bật không
// Mặc định: false (an toàn - giữ logic cũ)
// Bật: set biến môi trường = "true"
func IsFeatureEnabled(flagName string) bool {
	return os.Getenv(flagName) == "true"
}

// LogFeatureFlags ghi log trạng thái tất cả feature flags khi khởi động
// Giúp giám sát trên CloudWatch
func LogFeatureFlags() {
	log := logger.Default()
	log.Info("============================================================")
	log.Info("🚩 FEATURE FLAGS STATUS (Microservices Migration)")
	log.Info("============================================================")

	for _, flag := range AllFeatureFlags {
		status := "❌ DISABLED (monolith mode)"
		if IsFeatureEnabled(flag) {
			status = "✅ ENABLED (microservice mode)"
		}
		log.Info("  %s = %s", flag, status)
	}

	log.Info("============================================================")
	log.Info("💡 Để bật: set ENV variable = 'true' (ví dụ: VENUE_API_ENABLED=true)")
	log.Info("💡 Để tắt (rollback): xóa hoặc set = 'false'")
	log.Info("============================================================")
}

// GetFeatureFlagStatus trả về map trạng thái tất cả flags (cho health check API)
func GetFeatureFlagStatus() map[string]bool {
	status := make(map[string]bool, len(AllFeatureFlags))
	for _, flag := range AllFeatureFlags {
		status[flag] = IsFeatureEnabled(flag)
	}
	return status
}
