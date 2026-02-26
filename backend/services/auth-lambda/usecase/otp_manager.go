package usecase

import (
	"crypto/rand"
	"math/big"
	"sync"
	"time"

	"github.com/fpt-event-services/services/auth-lambda/models"
)

// OTPManager quản lý OTP trong memory
// KHỚP VỚI Java utils/PasswordResetManager.java
type OTPManager struct {
	records map[string]*models.OTPRecord
	mu      sync.RWMutex
}

var (
	otpManager *OTPManager
	once       sync.Once
)

// GetOTPManager returns singleton OTP manager
func GetOTPManager() *OTPManager {
	once.Do(func() {
		otpManager = &OTPManager{
			records: make(map[string]*models.OTPRecord),
		}
		// Start cleanup goroutine
		go otpManager.cleanupExpired()
	})
	return otpManager
}

// GenerateOTP sinh OTP 6 chữ số và lưu vào cache
// KHỚP VỚI Java PasswordResetManager.generateOtp
func (m *OTPManager) GenerateOTP(email string) string {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Sinh 6 chữ số ngẫu nhiên
	otp := generateRandomOTP()

	// Lưu vào cache với TTL 5 phút
	m.records[email] = &models.OTPRecord{
		Email:     email,
		OTP:       otp,
		ExpiresAt: time.Now().Add(5 * time.Minute).Unix(),
		Attempts:  0,
		Used:      false,
	}

	return otp
}

// VerifyOTP kiểm tra OTP có hợp lệ không
// KHỚP VỚI Java PasswordResetManager.verifyOtp
func (m *OTPManager) VerifyOTP(email, otp string) (bool, string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	record, exists := m.records[email]
	if !exists {
		return false, "OTP không tồn tại, vui lòng yêu cầu gửi lại"
	}

	// Kiểm tra đã dùng chưa
	if record.Used {
		return false, "OTP đã được sử dụng"
	}

	// Kiểm tra hết hạn
	if time.Now().Unix() > record.ExpiresAt {
		return false, "OTP đã hết hạn"
	}

	// Kiểm tra số lần nhập sai
	if record.Attempts >= 5 {
		return false, "Đã nhập sai quá 5 lần, vui lòng yêu cầu OTP mới"
	}

	// Kiểm tra OTP khớp
	if record.OTP != otp {
		record.Attempts++
		return false, "OTP không đúng"
	}

	// Mark as used
	record.Used = true
	return true, "OTP hợp lệ"
}

// Invalidate vô hiệu hóa OTP
func (m *OTPManager) Invalidate(email string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.records, email)
}

// cleanupExpired xóa các OTP hết hạn (chạy background)
func (m *OTPManager) cleanupExpired() {
	ticker := time.NewTicker(1 * time.Minute)
	for range ticker.C {
		m.mu.Lock()
		now := time.Now().Unix()
		for email, record := range m.records {
			if now > record.ExpiresAt {
				delete(m.records, email)
			}
		}
		m.mu.Unlock()
	}
}

// generateRandomOTP sinh 6 chữ số ngẫu nhiên
func generateRandomOTP() string {
	const charset = "0123456789"
	otp := make([]byte, 6)
	for i := range otp {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		otp[i] = charset[n.Int64()]
	}
	return string(otp)
}
