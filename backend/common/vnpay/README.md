# VNPay Payment Integration

Package `vnpay` cung cấp integration hoàn chỉnh với cổng thanh toán VNPay, tuân thủ 100% các yêu cầu về chữ ký điện tử HMAC-SHA512.

## 📋 Tính Năng

- ✅ Tạo URL thanh toán với chữ ký HMAC-SHA512
- ✅ Xác thực callback từ VNPay
- ✅ Hỗ trợ cả Sandbox và Production
- ✅ Logging chi tiết để debug
- ✅ Test coverage đầy đủ theo checklist VNPay
- ✅ Bảo mật: constant-time comparison, không log secret

## 🚀 Quick Start

### 1. Cấu Hình Environment

```bash
# Sandbox
export VNPAY_TMN_CODE="your_tmn_code"
export VNPAY_HASH_SECRET="your_hash_secret"
export VNPAY_RETURN_URL="http://localhost:8080/callback"

# Production
export VNPAY_TMN_CODE="prod_tmn_code"
export VNPAY_HASH_SECRET="prod_hash_secret"
export VNPAY_RETURN_URL="https://yourdomain.com/callback"
export VNPAY_PAYMENT_URL="https://pay.vnpay.vn/vpcpay.html"
```

### 2. Tạo Payment URL

```go
package main

import (
    "fmt"
    "github.com/fpt-event-services/common/vnpay"
)

func main() {
    // Sử dụng config mặc định (Sandbox)
    service := vnpay.NewVNPayService(nil)
    
    // Hoặc tùy chỉnh config
    config := vnpay.DefaultConfig()
    config.TmnCode = "YOUR_TMN_CODE"
    config.HashSecret = "YOUR_HASH_SECRET"
    service = vnpay.NewVNPayService(config)
    
    // Tạo payment request
    req := vnpay.PaymentRequest{
        OrderInfo: "Thanh toán vé sự kiện",
        Amount:    150000,  // 150,000 VND
        TxnRef:    "ORDER_" + time.Now().Format("20060102150405"),
        IPAddr:    "127.0.0.1",
        OrderType: "ticket",
    }
    
    // Tạo URL thanh toán
    paymentURL, err := service.CreatePaymentURL(req)
    if err != nil {
        panic(err)
    }
    
    fmt.Println("Payment URL:", paymentURL)
    // Redirect user đến paymentURL
}
```

### 3. Xác Thực Callback

```go
func handleCallback(w http.ResponseWriter, r *http.Request) {
    service := vnpay.NewVNPayService(nil)
    
    // Parse query parameters
    queryParams := r.URL.Query()
    
    // Verify callback signature
    response, err := service.VerifyCallback(queryParams)
    if err != nil {
        http.Error(w, "Invalid signature", http.StatusBadRequest)
        return
    }
    
    // Kiểm tra kết quả giao dịch
    if response.IsSuccess {
        // Giao dịch thành công - Cập nhật database
        fmt.Fprintf(w, "Payment successful: %s", response.TxnRef)
    } else {
        // Giao dịch thất bại
        fmt.Fprintf(w, "Payment failed: %s", response.ErrorMessage)
    }
}
```

## 🔐 Bảo Mật

### Điểm Quan Trọng

1. **KHÔNG hard-code credentials:**
   ```go
   // ❌ SAI
   config.HashSecret = "ABC123XYZ..."
   
   // ✅ ĐÚNG
   config.HashSecret = os.Getenv("VNPAY_HASH_SECRET")
   ```

2. **KHÔNG log HashSecret trong production:**
   - Debug logs đã tự động ẩn HashSecret
   - Kiểm tra lại trước khi deploy

3. **Constant-time comparison:**
   - Code đã sử dụng `hmac.Equal()` để tránh timing attacks

## 🧪 Testing

```bash
# Chạy tất cả tests
go test -v ./common/vnpay/...

# Chạy test checklist
go test -v ./common/vnpay/... -run TestSignatureChecklist

# Với coverage
go test -v -cover ./common/vnpay/...
```

### Test Coverage

Tests bao gồm tất cả các trường hợp trong [VNPay Checklist](../../VNPAY_SIGNATURE_DEBUG.md):

1. ✅ Sắp xếp tham số theo alphabet
2. ✅ Sử dụng HMAC-SHA512
3. ⭐ VND không nhân 100 (VND k có cent, chỉ có đơn vị đồng)
4. ✅ Loại bỏ giá trị rỗng
5. ✅ Loại bỏ `vnp_SecureHash` khi verify
6. ✅ Loại bỏ `vnp_SecureHashType` khi verify
7. ✅ Xử lý ký tự đặc biệt trong OrderInfo

## 🐛 Debug

Khi gặp lỗi "Sai chữ ký" (mã lỗi 97), kiểm tra:

1. **HashSecret có đúng không?**
   ```bash
   echo $VNPAY_HASH_SECRET
   ```

2. **TmnCode có đúng không?**
   ```bash
   echo $VNPAY_TMN_CODE
   ```

3. **Xem debug logs:**
   - Logs tự động in ra khi tạo payment URL
   - Logs tự động in ra khi verify callback
   - So sánh SignData với chuỗi mong đợi

4. **Đọc hướng dẫn chi tiết:**
   - Xem file [VNPAY_SIGNATURE_DEBUG.md](../../VNPAY_SIGNATURE_DEBUG.md)

## 📚 API Documentation

### Types

#### `Config`
```go
type Config struct {
    TmnCode    string // Merchant code
    HashSecret string // HMAC secret key
    PaymentURL string // VNPay gateway URL
    ReturnURL  string // Your callback URL
    Version    string // API version (default: 2.1.0)
    Command    string // Command type (default: pay)
    CurrCode   string // Currency (default: VND)
    Locale     string // Language (default: vn)
}
```

#### `PaymentRequest`
```go
type PaymentRequest struct {
    OrderInfo  string  // Mô tả đơn hàng
    Amount     float64 // Số tiền (VND) - sẽ tự động nhân 100
    TxnRef     string  // Mã giao dịch unique (bắt buộc)
    IPAddr     string  // IP khách hàng
    OrderType  string  // Loại hàng hóa (default: other)
    CreateDate string  // Format: yyyyMMddHHmmss (auto-generate)
    ExpireDate string  // Optional
    BankCode   string  // Optional
}
```

#### `PaymentResponse`
```go
type PaymentResponse struct {
    TmnCode       string
    Amount        string
    BankCode      string
    OrderInfo     string
    ResponseCode  string
    TxnRef        string
    SecureHash    string
    IsSuccess     bool   // true nếu ResponseCode == "00"
    ErrorMessage  string // Human-readable error
}
```

### Methods

#### `NewVNPayService(config *Config) *VNPayService`
Tạo service instance. Nếu `config == nil`, sử dụng `DefaultConfig()`.

#### `CreatePaymentURL(req PaymentRequest) (string, error)`
Tạo URL thanh toán với chữ ký hợp lệ.

#### `VerifyCallback(queryParams url.Values) (*PaymentResponse, error)`
Xác thực callback từ VNPay và parse response.

## 🔗 References

- [VNPay API Documentation](https://sandbox.vnpayment.vn/apis/)
- [VNPay Merchant Portal](https://sandbox.vnpayment.vn/merchantv2/)
- [Debug Guide](../../VNPAY_SIGNATURE_DEBUG.md)

## ⚠️ Common Issues

### Issue: Lỗi mã 97 (Sai chữ ký)

**Nguyên nhân:**
- HashSecret sai
- TmnCode sai
- Thứ tự params không đúng (nhưng code đã xử lý)

**Giải pháp:**
1. Kiểm tra environment variables
2. Copy lại HashSecret từ VNPay Portal
3. Xem debug logs để so sánh SignData

### Issue: Lỗi mã 01 (Trùng TxnRef)

**Nguyên nhân:**
- Sử dụng lại mã giao dịch cũ

**Giải pháp:**
```go
// Tạo TxnRef unique
TxnRef: "ORDER_" + time.Now().Format("20060102150405") + "_" + uuid.New().String()[:8]
```

### Issue: Amount không đúng

**Lưu ý:**
- VNPay yêu cầu amount phải nhân 100
- Code đã tự động xử lý
- 100,000 VND → `10000000` (trong URL)

## 📝 Changelog

### v1.1.0 (2026-02-04)
- ✅ Cải thiện comment và documentation
- ✅ Thêm debug logs chi tiết
- ✅ Ẩn HashSecret trong logs (bảo mật)
- ✅ Thêm test suite đầy đủ theo VNPay checklist
- ✅ Tạo guide debug chi tiết

### v1.0.0
- Initial implementation
- HMAC-SHA512 signature
- Sandbox và Production support

## 📞 Support

Nếu gặp vấn đề:
1. Đọc [VNPAY_SIGNATURE_DEBUG.md](../../VNPAY_SIGNATURE_DEBUG.md)
2. Chạy tests và xem logs
3. Kiểm tra config environment
4. Liên hệ VNPay support với:
   - TmnCode
   - TxnRef
   - Thời gian giao dịch
   - Logs (KHÔNG gửi HashSecret)
