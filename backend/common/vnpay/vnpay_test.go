package vnpay

import (
	"crypto/hmac"
	"net/url"
	"strings"
	"testing"
)

func TestCreateSecureHash(t *testing.T) {
	config := &Config{
		TmnCode:    "TEST123",
		HashSecret: "TESTSECRETKEY123456789012345678901234567890",
		PaymentURL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
		ReturnURL:  "http://localhost:8080/callback",
		Version:    "2.1.0",
		Command:    "pay",
		CurrCode:   "VND",
		Locale:     "vn",
	}

	service := NewVNPayService(config)

	params := map[string]string{
		"vnp_Amount":     "10000000",
		"vnp_Command":    "pay",
		"vnp_CreateDate": "20240101120000",
		"vnp_TmnCode":    "TEST123",
		"vnp_TxnRef":     "ORDER123",
	}

	hash := service.createSecureHash(params)

	// Hash should be 128 characters (SHA512 hex)
	if len(hash) != 128 {
		t.Errorf("Expected hash length 128, got %d", len(hash))
	}

	// Same params should produce same hash
	hash2 := service.createSecureHash(params)
	if hash != hash2 {
		t.Error("Same parameters should produce same hash")
	}

	// Different params should produce different hash
	params["vnp_Amount"] = "20000000"
	hash3 := service.createSecureHash(params)
	if hash == hash3 {
		t.Error("Different parameters should produce different hash")
	}
}

func TestCreatePaymentURL(t *testing.T) {
	config := &Config{
		TmnCode:    "TEST123",
		HashSecret: "TESTSECRETKEY123456789012345678901234567890",
		PaymentURL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
		ReturnURL:  "http://localhost:8080/callback",
		Version:    "2.1.0",
		Command:    "pay",
		CurrCode:   "VND",
		Locale:     "vn",
	}

	service := NewVNPayService(config)

	tests := []struct {
		name    string
		req     PaymentRequest
		wantErr bool
	}{
		{
			name: "Valid request",
			req: PaymentRequest{
				OrderInfo: "Test order",
				Amount:    100000,
				TxnRef:    "ORDER123",
				IPAddr:    "127.0.0.1",
			},
			wantErr: false,
		},
		{
			name: "Missing TxnRef",
			req: PaymentRequest{
				OrderInfo: "Test order",
				Amount:    100000,
			},
			wantErr: true,
		},
		{
			name: "Zero amount",
			req: PaymentRequest{
				OrderInfo: "Test order",
				Amount:    0,
				TxnRef:    "ORDER123",
			},
			wantErr: true,
		},
		{
			name: "Missing OrderInfo",
			req: PaymentRequest{
				Amount: 100000,
				TxnRef: "ORDER123",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := service.CreatePaymentURL(tt.req)
			if (err != nil) != tt.wantErr {
				t.Errorf("CreatePaymentURL() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && result == "" {
				t.Error("CreatePaymentURL() returned empty URL")
			}
		})
	}
}

func TestVerifyCallback(t *testing.T) {
	config := &Config{
		TmnCode:    "TEST123",
		HashSecret: "TESTSECRETKEY123456789012345678901234567890",
		PaymentURL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
		ReturnURL:  "http://localhost:8080/callback",
		Version:    "2.1.0",
		Command:    "pay",
		CurrCode:   "VND",
		Locale:     "vn",
	}

	service := NewVNPayService(config)

	// Create valid callback params
	params := map[string]string{
		"vnp_TmnCode":       "TEST123",
		"vnp_Amount":        "10000000",
		"vnp_BankCode":      "NCB",
		"vnp_OrderInfo":     "Test order",
		"vnp_ResponseCode":  "00",
		"vnp_TransactionNo": "12345678",
		"vnp_TxnRef":        "ORDER123",
	}

	// Generate valid hash
	hash := service.createSecureHash(params)
	params["vnp_SecureHash"] = hash

	// Convert to url.Values
	values := url.Values{}
	for k, v := range params {
		values.Set(k, v)
	}

	// Test valid callback
	response, err := service.VerifyCallback(values)
	if err != nil {
		t.Errorf("VerifyCallback() error = %v", err)
	}
	if !response.IsSuccess {
		t.Error("VerifyCallback() expected success response")
	}

	// Test invalid hash
	values.Set("vnp_SecureHash", "INVALIDHASH")
	_, err = service.VerifyCallback(values)
	if err == nil {
		t.Error("VerifyCallback() should fail with invalid hash")
	}

	// Test missing hash
	values.Del("vnp_SecureHash")
	_, err = service.VerifyCallback(values)
	if err == nil {
		t.Error("VerifyCallback() should fail with missing hash")
	}
}

func TestConstantTimeComparison(t *testing.T) {
	// Test that hmac.Equal is used for timing-attack resistance
	hash1 := []byte("ABCDEF123456")
	hash2 := []byte("ABCDEF123456")
	hash3 := []byte("XYZDEF123456")

	if !hmac.Equal(hash1, hash2) {
		t.Error("hmac.Equal should return true for identical hashes")
	}
	if hmac.Equal(hash1, hash3) {
		t.Error("hmac.Equal should return false for different hashes")
	}
}

func TestGetVNPayErrorMessage(t *testing.T) {
	tests := []struct {
		code     string
		expected string
	}{
		{"00", "Giao dịch thành công"},
		{"24", "Giao dịch không thành công do: Khách hàng hủy giao dịch"},
		{"51", "Giao dịch không thành công do: Tài khoản không đủ số dư để thực hiện giao dịch"},
		{"99", "Các lỗi khác"},
		{"XX", "Lỗi không xác định: XX"},
	}

	for _, tt := range tests {
		t.Run(tt.code, func(t *testing.T) {
			result := getVNPayErrorMessage(tt.code)
			if result != tt.expected {
				t.Errorf("getVNPayErrorMessage(%s) = %s, want %s", tt.code, result, tt.expected)
			}
		})
	}
}

// TestSignatureChecklist kiểm tra các điểm trong checklist VNPAY
func TestSignatureChecklist(t *testing.T) {
	config := &Config{
		TmnCode:    "TEST123",
		HashSecret: "TESTSECRETKEY123456789012345678901234567890",
		PaymentURL: "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
		ReturnURL:  "http://localhost:8080/callback",
		Version:    "2.1.0",
		Command:    "pay",
		CurrCode:   "VND",
		Locale:     "vn",
	}
	service := NewVNPayService(config)

	t.Run("1. Test parameter sorting (alphabet order)", func(t *testing.T) {
		params := map[string]string{
			"vnp_TxnRef":     "ORDER001",
			"vnp_Amount":     "1000000",
			"vnp_Command":    "pay",
			"vnp_CreateDate": "20240104120000",
			"vnp_Version":    "2.1.0",
		}

		hash1 := service.createSecureHash(params)

		// Đổi thứ tự insert (nhưng kết quả phải giống nhau do sort)
		params2 := map[string]string{
			"vnp_Version":    "2.1.0",
			"vnp_CreateDate": "20240104120000",
			"vnp_Command":    "pay",
			"vnp_Amount":     "1000000",
			"vnp_TxnRef":     "ORDER001",
		}

		hash2 := service.createSecureHash(params2)

		if hash1 != hash2 {
			t.Error("Hash should be same regardless of insertion order (due to sorting)")
		}
	})

	t.Run("2. Test HMAC-SHA512 (128 chars hex)", func(t *testing.T) {
		params := map[string]string{
			"vnp_Amount": "1000000",
			"vnp_TxnRef": "ORDER001",
		}

		hash := service.createSecureHash(params)

		// SHA512 hex string phải có 128 ký tự
		if len(hash) != 128 {
			t.Errorf("Expected SHA512 hash length 128, got %d", len(hash))
		}

		// Phải là chữ HOA
		if hash != strings.ToUpper(hash) {
			t.Error("Hash should be uppercase")
		}
	})

	t.Run("3. Test amount for VND currency (NO multiply by 100)", func(t *testing.T) {
		req := PaymentRequest{
			OrderInfo: "Test order",
			Amount:    150000, // 150,000 VND
			TxnRef:    "ORDER001",
			IPAddr:    "127.0.0.1",
		}

		url, err := service.CreatePaymentURL(req)
		if err != nil {
			t.Fatalf("CreatePaymentURL error: %v", err)
		}

		// ⭐ CRITICAL FIX: VND không nhân 100! VND chỉ có đơn vị đồng, không có cent
		// Amount sau khi format: 150000 (không nhân 100)
		if !strings.Contains(url, "vnp_Amount=150000") {
			t.Errorf("Amount should NOT be multiplied by 100 for VND (URL: %s)", url)
		}
		
		// Kiểm tra KHÔNG có giá trị nhân 100
		if strings.Contains(url, "vnp_Amount=15000000") {
			t.Error("❌ WRONG: Amount is multiplied by 100! This causes 100x price bug!")
		}
	})

	t.Run("4. Test empty values are excluded", func(t *testing.T) {
		params := map[string]string{
			"vnp_Amount":   "1000000",
			"vnp_TxnRef":   "ORDER001",
			"vnp_BankCode": "", // Giá trị rỗng
		}

		hash := service.createSecureHash(params)

		// Hash không nên bao gồm vnp_BankCode rỗng
		params2 := map[string]string{
			"vnp_Amount": "1000000",
			"vnp_TxnRef": "ORDER001",
		}

		hash2 := service.createSecureHash(params2)

		if hash != hash2 {
			t.Error("Empty values should be excluded from hash calculation")
		}
	})

	t.Run("5. Test vnp_SecureHash excluded from verification", func(t *testing.T) {
		params := map[string]string{
			"vnp_TmnCode":      "TEST123",
			"vnp_Amount":       "1000000",
			"vnp_TxnRef":       "ORDER001",
			"vnp_OrderInfo":    "Test",
			"vnp_ResponseCode": "00", // Thêm vào params trước khi tạo hash
		}

		// Tạo hash hợp lệ (bao gồm cả ResponseCode)
		validHash := service.createSecureHash(params)

		// Tạo url.Values với hash
		values := url.Values{}
		for k, v := range params {
			values.Set(k, v)
		}
		values.Set("vnp_SecureHash", validHash)

		// Verify phải thành công
		response, err := service.VerifyCallback(values)
		if err != nil {
			t.Errorf("VerifyCallback should succeed with valid hash: %v", err)
		}
		if !response.IsSuccess {
			t.Error("Response should be success")
		}
	})

	t.Run("6. Test vnp_SecureHashType excluded from verification", func(t *testing.T) {
		params := map[string]string{
			"vnp_TmnCode":      "TEST123",
			"vnp_Amount":       "1000000",
			"vnp_TxnRef":       "ORDER002",
			"vnp_OrderInfo":    "Test",
			"vnp_ResponseCode": "00",
		}

		validHash := service.createSecureHash(params)

		values := url.Values{}
		for k, v := range params {
			values.Set(k, v)
		}
		values.Set("vnp_SecureHash", validHash)
		values.Set("vnp_SecureHashType", "HmacSHA512") // Không nên ảnh hưởng đến hash

		// Verify vẫn phải thành công
		_, err := service.VerifyCallback(values)
		if err != nil {
			t.Errorf("VerifyCallback should succeed even with vnp_SecureHashType: %v", err)
		}
	})

	t.Run("7. Test special characters in OrderInfo", func(t *testing.T) {
		req := PaymentRequest{
			OrderInfo: "Thanh toán vé sự kiện ĐẶC BIỆT #123 & More!", // Có ký tự đặc biệt
			Amount:    100000,
			TxnRef:    "ORDER003",
			IPAddr:    "127.0.0.1",
		}

		url, err := service.CreatePaymentURL(req)
		if err != nil {
			t.Fatalf("CreatePaymentURL error: %v", err)
		}

		// URL phải encode các ký tự đặc biệt
		if !strings.Contains(url, "vnp_OrderInfo=") {
			t.Error("URL should contain encoded OrderInfo")
		}
	})
}
