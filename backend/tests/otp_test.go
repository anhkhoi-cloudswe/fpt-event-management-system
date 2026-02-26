package tests

import (
	"sync"
	"testing"
	"time"
)

// Mock OTP Manager for testing
// (Simulates the real OTP Manager behavior)

type MockOTPManager struct {
	records map[string]*MockOTPRecord
	mu      sync.RWMutex
}

type MockOTPRecord struct {
	Email     string
	OTP       string
	ExpiresAt int64
	Attempts  int
	Used      bool
}

func NewMockOTPManager() *MockOTPManager {
	return &MockOTPManager{
		records: make(map[string]*MockOTPRecord),
	}
}

func (m *MockOTPManager) GenerateOTP(email string) string {
	m.mu.Lock()
	defer m.mu.Unlock()

	otp := "123456" // Fixed for testing

	m.records[email] = &MockOTPRecord{
		Email:     email,
		OTP:       otp,
		ExpiresAt: time.Now().Add(5 * time.Minute).Unix(),
		Attempts:  0,
		Used:      false,
	}

	return otp
}

func (m *MockOTPManager) VerifyOTP(email, otp string) (bool, string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	record, exists := m.records[email]
	if !exists {
		return false, "OTP không tồn tại, vui lòng yêu cầu gửi lại"
	}

	if record.Used {
		return false, "OTP đã được sử dụng"
	}

	if time.Now().Unix() > record.ExpiresAt {
		return false, "OTP đã hết hạn"
	}

	if record.Attempts >= 5 {
		return false, "Đã nhập sai quá 5 lần, vui lòng yêu cầu OTP mới"
	}

	if record.OTP != otp {
		record.Attempts++
		return false, "OTP không đúng"
	}

	record.Used = true
	return true, "OTP hợp lệ"
}

func (m *MockOTPManager) Invalidate(email string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.records, email)
}

// SetExpired sets an OTP as expired for testing
func (m *MockOTPManager) SetExpired(email string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if record, exists := m.records[email]; exists {
		record.ExpiresAt = time.Now().Add(-1 * time.Minute).Unix()
	}
}

// ============================================================
// Test: OTP Generation
// ============================================================

func TestOTPGeneration(t *testing.T) {
	manager := NewMockOTPManager()

	tests := []struct {
		name  string
		email string
	}{
		{"Standard email", "user@example.com"},
		{"FPT email", "student@fpt.edu.vn"},
		{"Gmail", "user123@gmail.com"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			otp := manager.GenerateOTP(tt.email)
			if otp == "" {
				t.Error("GenerateOTP() returned empty OTP")
			}
			if len(otp) != 6 {
				t.Errorf("GenerateOTP() returned OTP with length %d, want 6", len(otp))
			}
		})
	}
}

// ============================================================
// Test: OTP Verification
// ============================================================

func TestOTPVerification(t *testing.T) {
	manager := NewMockOTPManager()

	t.Run("Valid OTP", func(t *testing.T) {
		email := "test@example.com"
		otp := manager.GenerateOTP(email)

		valid, msg := manager.VerifyOTP(email, otp)
		if !valid {
			t.Errorf("VerifyOTP() should be valid, got message: %s", msg)
		}
	})

	t.Run("Invalid OTP", func(t *testing.T) {
		email := "test2@example.com"
		manager.GenerateOTP(email)

		valid, msg := manager.VerifyOTP(email, "000000")
		if valid {
			t.Error("VerifyOTP() should be invalid for wrong OTP")
		}
		if msg != "OTP không đúng" {
			t.Errorf("VerifyOTP() wrong message: %s", msg)
		}
	})

	t.Run("Non-existent email", func(t *testing.T) {
		valid, msg := manager.VerifyOTP("nonexistent@example.com", "123456")
		if valid {
			t.Error("VerifyOTP() should be invalid for non-existent email")
		}
		if msg != "OTP không tồn tại, vui lòng yêu cầu gửi lại" {
			t.Errorf("VerifyOTP() wrong message: %s", msg)
		}
	})

	t.Run("OTP already used", func(t *testing.T) {
		email := "test3@example.com"
		otp := manager.GenerateOTP(email)

		// First use - should succeed
		valid, _ := manager.VerifyOTP(email, otp)
		if !valid {
			t.Error("First verification should succeed")
		}

		// Second use - should fail
		valid, msg := manager.VerifyOTP(email, otp)
		if valid {
			t.Error("VerifyOTP() should fail for already used OTP")
		}
		if msg != "OTP đã được sử dụng" {
			t.Errorf("VerifyOTP() wrong message: %s", msg)
		}
	})

	t.Run("Expired OTP", func(t *testing.T) {
		email := "test4@example.com"
		manager.GenerateOTP(email)
		manager.SetExpired(email)

		valid, msg := manager.VerifyOTP(email, "123456")
		if valid {
			t.Error("VerifyOTP() should fail for expired OTP")
		}
		if msg != "OTP đã hết hạn" {
			t.Errorf("VerifyOTP() wrong message: %s", msg)
		}
	})

	t.Run("Max attempts exceeded", func(t *testing.T) {
		email := "test5@example.com"
		manager.GenerateOTP(email)

		// Attempt wrong OTP 5 times
		for i := 0; i < 5; i++ {
			manager.VerifyOTP(email, "000000")
		}

		// 6th attempt should fail with max attempts message
		valid, msg := manager.VerifyOTP(email, "000000")
		if valid {
			t.Error("VerifyOTP() should fail after max attempts")
		}
		if msg != "Đã nhập sai quá 5 lần, vui lòng yêu cầu OTP mới" {
			t.Errorf("VerifyOTP() wrong message: %s", msg)
		}
	})
}

// ============================================================
// Test: OTP Invalidation
// ============================================================

func TestOTPInvalidation(t *testing.T) {
	manager := NewMockOTPManager()

	email := "test@example.com"
	otp := manager.GenerateOTP(email)

	// Verify it exists
	valid, _ := manager.VerifyOTP(email, otp)
	if !valid {
		t.Error("OTP should be valid before invalidation")
	}

	// Regenerate for testing invalidation
	otp = manager.GenerateOTP(email)

	// Invalidate
	manager.Invalidate(email)

	// Should no longer exist
	valid, msg := manager.VerifyOTP(email, otp)
	if valid {
		t.Error("VerifyOTP() should fail after invalidation")
	}
	if msg != "OTP không tồn tại, vui lòng yêu cầu gửi lại" {
		t.Errorf("VerifyOTP() wrong message: %s", msg)
	}
}

// ============================================================
// Test: Concurrent OTP Operations
// ============================================================

func TestOTPConcurrency(t *testing.T) {
	manager := NewMockOTPManager()

	var wg sync.WaitGroup
	emails := []string{
		"user1@example.com",
		"user2@example.com",
		"user3@example.com",
		"user4@example.com",
		"user5@example.com",
	}

	// Generate OTPs concurrently
	for _, email := range emails {
		wg.Add(1)
		go func(e string) {
			defer wg.Done()
			manager.GenerateOTP(e)
		}(email)
	}
	wg.Wait()

	// Verify OTPs concurrently
	for _, email := range emails {
		wg.Add(1)
		go func(e string) {
			defer wg.Done()
			valid, _ := manager.VerifyOTP(e, "123456")
			if !valid {
				t.Errorf("OTP verification failed for %s", e)
			}
		}(email)
	}
	wg.Wait()
}

// ============================================================
// Benchmark tests
// ============================================================

func BenchmarkOTPGeneration(b *testing.B) {
	manager := NewMockOTPManager()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.GenerateOTP("user@example.com")
	}
}

func BenchmarkOTPVerification(b *testing.B) {
	manager := NewMockOTPManager()
	email := "user@example.com"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.GenerateOTP(email)
		manager.VerifyOTP(email, "123456")
	}
}
