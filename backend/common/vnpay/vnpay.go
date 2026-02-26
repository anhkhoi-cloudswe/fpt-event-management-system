package vnpay

import (
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"
)

// Config holds VNPay configuration
type Config struct {
	TmnCode    string // Terminal ID
	HashSecret string // Secret key for HMAC-SHA512
	PaymentURL string // VNPay payment gateway URL
	ReturnURL  string // Your callback URL
	Version    string // API Version
	Command    string // Command type
	CurrCode   string // Currency code
	Locale     string // Language locale
}

// DefaultConfig returns default VNPay sandbox configuration
func DefaultConfig() *Config {
	return &Config{
		TmnCode:    getEnv("VNPAY_TMN_CODE", "DEMO_TMN_CODE"),
		HashSecret: getEnv("VNPAY_HASH_SECRET", "DEMO_HASH_SECRET"),
		PaymentURL: getEnv("VNPAY_PAYMENT_URL", "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"),
		ReturnURL:  getEnv("VNPAY_RETURN_URL", "http://localhost:8080/api/buyTicket"),
		Version:    "2.1.0",
		Command:    "pay",
		CurrCode:   "VND",
		Locale:     "vn",
	}
}

// ProductionConfig returns production VNPay configuration
func ProductionConfig() *Config {
	config := &Config{
		TmnCode:    mustGetEnv("VNPAY_TMN_CODE"),
		HashSecret: mustGetEnv("VNPAY_HASH_SECRET"),
		PaymentURL: "https://pay.vnpay.vn/vpcpay.html",
		ReturnURL:  mustGetEnv("VNPAY_RETURN_URL"),
		Version:    "2.1.0",
		Command:    "pay",
		CurrCode:   "VND",
		Locale:     "vn",
	}
	return config
}

// PaymentRequest represents a VNPay payment request
type PaymentRequest struct {
	OrderInfo  string  // Mô tả đơn hàng
	Amount     float64 // Số tiền (VND)
	TxnRef     string  // Mã giao dịch unique
	IPAddr     string  // IP của khách hàng
	OrderType  string  // Loại hàng hóa
	CreateDate string  // Thời gian tạo (yyyyMMddHHmmss)
	ExpireDate string  // Thời gian hết hạn (optional)
	BankCode   string  // Mã ngân hàng (optional)
	ReturnURL  string  // Return URL after payment (optional - uses config default if empty)
}

// PaymentResponse represents VNPay callback response
type PaymentResponse struct {
	TmnCode       string
	Amount        string
	BankCode      string
	BankTranNo    string
	CardType      string
	OrderInfo     string
	PayDate       string
	ResponseCode  string
	TransactionNo string
	TxnRef        string
	SecureHash    string
	// Parsed fields
	IsSuccess    bool
	ErrorMessage string
}

// VNPayService handles VNPay payment operations
type VNPayService struct {
	config *Config
}

// NewVNPayService creates a new VNPay service
func NewVNPayService(config *Config) *VNPayService {
	if config == nil {
		config = DefaultConfig()
	}
	return &VNPayService{config: config}
}

// CreatePaymentURL creates a VNPay payment URL with proper HMAC-SHA512 signature
func (s *VNPayService) CreatePaymentURL(req PaymentRequest) (string, error) {
	// Validate required fields
	if req.TxnRef == "" {
		return "", fmt.Errorf("txnRef is required")
	}
	if req.Amount <= 0 {
		return "", fmt.Errorf("amount must be positive")
	}
	if req.OrderInfo == "" {
		return "", fmt.Errorf("orderInfo is required")
	}
	if req.IPAddr == "" {
		req.IPAddr = "127.0.0.1"
	}
	if req.OrderType == "" {
		req.OrderType = "other"
	}
	if req.CreateDate == "" {
		req.CreateDate = time.Now().Format("20060102150405")
	}

	// Build parameters map
	// ⭐ CRITICAL FIX: VNPay yêu cầu vnp_Amount phải nhân 100 (theo đơn vị nhỏ nhất)
	// Ví dụ: 150.000đ → vnp_Amount=15000000
	// Lý do: VNPay API xử lý tất cả số tiền theo format này, kể cả VND
	params := map[string]string{
		"vnp_Version":    s.config.Version,
		"vnp_Command":    s.config.Command,
		"vnp_TmnCode":    s.config.TmnCode,
		"vnp_Amount":     fmt.Sprintf("%.0f", req.Amount*100), // PHẢI nhân 100
		"vnp_CreateDate": req.CreateDate,
		"vnp_CurrCode":   s.config.CurrCode,
		"vnp_IpAddr":     req.IPAddr,
		"vnp_Locale":     s.config.Locale,
		"vnp_OrderInfo":  req.OrderInfo,
		"vnp_OrderType":  req.OrderType,
		"vnp_ReturnUrl":  req.ReturnURL, // Use request-specific ReturnURL if provided, otherwise config default will be used below
		"vnp_TxnRef":     req.TxnRef,
	}

	// If ReturnURL not specified in request, use config default
	if params["vnp_ReturnUrl"] == "" {
		params["vnp_ReturnUrl"] = s.config.ReturnURL
	}

	// Add optional parameters
	if req.BankCode != "" {
		params["vnp_BankCode"] = req.BankCode
	}
	if req.ExpireDate != "" {
		params["vnp_ExpireDate"] = req.ExpireDate
	}

	// CRITICAL: Create secure hash BEFORE adding it to params
	// The hash is calculated from all params EXCEPT vnp_SecureHash itself
	secureHash := s.createSecureHash(params)
	params["vnp_SecureHash"] = secureHash

	// Build query string (with URL encoding for final URL)
	queryString := s.buildQueryString(params)

	// DEBUG: Print payment URL details
	fmt.Printf("\n========== VNPAY CREATE PAYMENT URL ==========\n")
	fmt.Printf("[Config] TmnCode: %s\n", s.config.TmnCode)
	fmt.Printf("[Config] HashSecret: %s... (length: %d)\n",
		s.config.HashSecret[:6], len(s.config.HashSecret))
	fmt.Printf("[Config] PaymentURL: %s\n", s.config.PaymentURL)
	fmt.Printf("[Config] ReturnURL: %s\n", s.config.ReturnURL)
	fmt.Printf("[Request] Amount VND: %.0f -> vnp_Amount: %.0f (x100)\n",
		req.Amount, req.Amount*100)
	fmt.Printf("[Request] TxnRef: %s\n", params["vnp_TxnRef"])
	fmt.Printf("[Request] OrderInfo: %s\n", params["vnp_OrderInfo"])
	fmt.Printf("[Hash] SecureHash: %s\n", secureHash)
	fmt.Printf("[URL] Full redirect URL:\n%s?%s\n", s.config.PaymentURL, queryString)
	fmt.Printf("=============================================\n\n")

	return s.config.PaymentURL + "?" + queryString, nil
}

// VerifyCallback verifies the callback signature from VNPay
// Returns (isValid, parsedResponse, error)
func (s *VNPayService) VerifyCallback(queryParams url.Values) (*PaymentResponse, error) {
	response := &PaymentResponse{
		TmnCode:       queryParams.Get("vnp_TmnCode"),
		Amount:        queryParams.Get("vnp_Amount"),
		BankCode:      queryParams.Get("vnp_BankCode"),
		BankTranNo:    queryParams.Get("vnp_BankTranNo"),
		CardType:      queryParams.Get("vnp_CardType"),
		OrderInfo:     queryParams.Get("vnp_OrderInfo"),
		PayDate:       queryParams.Get("vnp_PayDate"),
		ResponseCode:  queryParams.Get("vnp_ResponseCode"),
		TransactionNo: queryParams.Get("vnp_TransactionNo"),
		TxnRef:        queryParams.Get("vnp_TxnRef"),
		SecureHash:    queryParams.Get("vnp_SecureHash"),
	}

	// Extract received hash
	receivedHash := response.SecureHash
	if receivedHash == "" {
		return response, fmt.Errorf("missing vnp_SecureHash")
	}

	// CRITICAL: Rebuild parameters for verification
	// MUST exclude: vnp_SecureHash và vnp_SecureHashType (nếu có)
	// Lý do: Chỉ băm các tham số bắt đầu bằng vnp_ (trừ 2 tham số trên)
	params := make(map[string]string)
	for key := range queryParams {
		if key != "vnp_SecureHash" && key != "vnp_SecureHashType" {
			params[key] = queryParams.Get(key)
		}
	}

	// Calculate expected hash using same algorithm as CreatePaymentURL
	expectedHash := s.createSecureHash(params)

	// DEBUG: Log verification details
	fmt.Printf("\n========== VNPAY CALLBACK VERIFY ==========\n")
	fmt.Printf("[Callback] TxnRef: %s\n", response.TxnRef)
	fmt.Printf("[Callback] ResponseCode: %s\n", response.ResponseCode)
	fmt.Printf("[Callback] Amount: %s\n", response.Amount)
	fmt.Printf("[Callback] OrderInfo: %s\n", response.OrderInfo)
	fmt.Printf("[Callback] TmnCode: %s\n", response.TmnCode)
	fmt.Printf("[Hash] Received: %s\n", receivedHash)
	fmt.Printf("[Hash] Expected: %s\n", expectedHash)
	fmt.Printf("[Hash] Match: %v\n", strings.ToUpper(receivedHash) == strings.ToUpper(expectedHash))
	fmt.Printf("[Hash] Length: Received=%d, Expected=%d\n", len(receivedHash), len(expectedHash))
	fmt.Printf("==========================================\n\n")

	// Constant-time comparison to prevent timing attacks
	if !hmac.Equal([]byte(strings.ToUpper(receivedHash)), []byte(strings.ToUpper(expectedHash))) {
		return response, fmt.Errorf("invalid signature: hash mismatch")
	}

	// Verify TmnCode matches
	if response.TmnCode != s.config.TmnCode {
		return response, fmt.Errorf("invalid TmnCode")
	}

	// Check response code
	response.IsSuccess = response.ResponseCode == "00"
	response.ErrorMessage = getVNPayErrorMessage(response.ResponseCode)

	return response, nil
}

// createSecureHash creates HMAC-SHA512 hash for VNPay
// QUAN TRỌNG: Đây là hàm then chốt tạo chữ ký theo chuẩn VNPAY
//
// ⚠️ LƯU Ý: Code này ENCODE hashData để tương thích với Java backend
// Lý do: Java demo của VNPAY đang dùng URLEncoder.encode(value, US_ASCII)
// Mặc dù tài liệu VNPAY mới khuyên không encode, nhưng để tương thích
// với backend Java hiện tại, ta phải encode giống họ.
//
// CHECKLIST VNPAY (KHÔNG ĐƯỢC SAI MỘT BƯỚC):
// ✅ 1. Sắp xếp tất cả params theo thứ tự alphabet (A->Z)
//
//	Ví dụ: vnp_Amount -> vnp_Command -> vnp_CreateDate
//
// ✅ 2. Nối thành chuỗi dạng: key1=encodedValue1&key2=encodedValue2&...
//
//	⚠️ URL encode các giá trị (để khớp với Java backend)
//	⚠️ Bỏ qua các giá trị rỗng
//
// ✅ 3. Dùng HMAC-SHA512 với HashSecret để băm chuỗi trên
// ✅ 4. Chuyển kết quả sang hex string và viết HOA (uppercase)
//
// LƯU Ý VỀ MÃ LỖI VNPAY:
// - Mã 97/70: Sai chữ ký (sai thuật toán hoặc sai chuỗi băm)
// - Mã 01: Giao dịch đã tồn tại (trùng vnp_TxnRef)
func (s *VNPayService) createSecureHash(params map[string]string) string {
	// BƯỚC 1: Sắp xếp parameters theo key (thứ tự alphabet)
	// Ví dụ: vnp_Amount phải đứng trước vnp_Command
	var keys []string
	for k := range params {
		// Không thêm vnp_SecureHash và vnp_SecureHashType vào danh sách băm
		if k != "vnp_SecureHash" && k != "vnp_SecureHashType" {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)

	// BƯỚC 2: Tạo chuỗi dữ liệu để băm
	// ⚠️ NOTE: Code Java demo của VNPAY đang encode hashData (khác với tài liệu)
	// Để tương thích với backend Java, ta phải ENCODE giống họ
	// Theo Java: URLEncoder.encode(value, StandardCharsets.US_ASCII)
	var parts []string
	for _, k := range keys {
		if params[k] != "" { // Bỏ qua giá trị rỗng
			// ENCODE giống Java để tương thích
			encodedValue := url.QueryEscape(params[k])
			parts = append(parts, fmt.Sprintf("%s=%s", k, encodedValue))
		}
	}
	signData := strings.Join(parts, "&")

	// DEBUG: In ra chuỗi dữ liệu trước khi băm (để debug)
	fmt.Printf("\n========== VNPAY HASH DEBUG ==========\n")
	fmt.Printf("[1] Số lượng params: %d\n", len(keys))
	fmt.Printf("[2] Sorted keys: %v\n", keys)
	fmt.Printf("[3] SignData (URL ENCODED - giống Java):\n%s\n", signData)
	fmt.Printf("[4] HashSecret: %s... (length: %d)\n",
		s.config.HashSecret[:min(6, len(s.config.HashSecret))], len(s.config.HashSecret))

	// BƯỚC 3 & 4: Tạo HMAC-SHA512 hash và chuyển sang uppercase hex
	h := hmac.New(sha512.New, []byte(s.config.HashSecret))
	h.Write([]byte(signData))
	hashBytes := h.Sum(nil)
	hashHex := hex.EncodeToString(hashBytes)
	upper := strings.ToUpper(hashHex)

	fmt.Printf("[5] SecureHash (HMAC-SHA512 uppercase): %s\n", upper)
	fmt.Printf("[6] SecureHash length: %d chars (should be 128)\n", len(upper))
	fmt.Printf("======================================\n\n")

	return upper // VNPAY yêu cầu chữ HOA
}

// buildQueryString builds URL query string with proper encoding
// QUAN TRỌNG: Hàm này CHỈ dùng để tạo URL cuối cùng, KHÔNG dùng để tạo hash
//
// Điểm khác với createSecureHash:
// - createSecureHash: KHÔNG URL encode (để băm)
// - buildQueryString: CÓ URL encode (để tạo URL hợp lệ)
func (s *VNPayService) buildQueryString(params map[string]string) string {
	// Sắp xếp parameters theo key alphabetically (giống createSecureHash)
	var keys []string
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Build query string VỚI URL encoding
	// Ví dụ: "Thanh toán vé" -> "Thanh%20to%C3%A1n%20v%C3%A9"
	var parts []string
	for _, k := range keys {
		if params[k] != "" {
			parts = append(parts, fmt.Sprintf("%s=%s", k, url.QueryEscape(params[k])))
		}
	}
	return strings.Join(parts, "&")
}

// getVNPayErrorMessage returns human-readable error message for VNPay response code
func getVNPayErrorMessage(code string) string {
	messages := map[string]string{
		"00": "Giao dịch thành công",
		"07": "Trừ tiền thành công. Giao dịch bị nghi ngờ (liên quan tới lừa đảo, giao dịch bất thường)",
		"09": "Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng chưa đăng ký dịch vụ InternetBanking tại ngân hàng",
		"10": "Giao dịch không thành công do: Khách hàng xác thực thông tin thẻ/tài khoản không đúng quá 3 lần",
		"11": "Giao dịch không thành công do: Đã hết hạn chờ thanh toán",
		"12": "Giao dịch không thành công do: Thẻ/Tài khoản của khách hàng bị khóa",
		"13": "Giao dịch không thành công do: Quý khách nhập sai mật khẩu xác thực giao dịch (OTP)",
		"24": "Giao dịch không thành công do: Khách hàng hủy giao dịch",
		"51": "Giao dịch không thành công do: Tài khoản không đủ số dư để thực hiện giao dịch",
		"65": "Giao dịch không thành công do: Tài khoản của Quý khách đã vượt quá hạn mức giao dịch trong ngày",
		"75": "Ngân hàng thanh toán đang bảo trì",
		"79": "Giao dịch không thành công do: KH nhập sai mật khẩu thanh toán quá số lần quy định",
		"99": "Các lỗi khác",
	}

	if msg, ok := messages[code]; ok {
		return msg
	}
	return "Lỗi không xác định: " + code
}

// Helper functions
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		panic(fmt.Sprintf("required environment variable %s is not set", key))
	}
	return value
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
