# Common Validator Package

Package này cung cấp các hàm validation cho user input, **khớp 100% với ValidationUtil.java**.

## 🎯 Mục đích

- Validate email, phone, password, full name
- Sử dụng regex patterns giống hệt Java
- Trả về error messages tiếng Việt

## 📦 Validation Functions

### `IsValidEmail(email string) bool`

Validate email format (RFC 5322 simplified).

```go
valid := validator.IsValidEmail("user@fpt.edu.vn") // true
valid := validator.IsValidEmail("invalid-email")   // false
```

### `IsValidVNPhone(phone string) bool`

Validate số điện thoại Việt Nam (03x, 05x, 07x, 08x, 09x).

```go
valid := validator.IsValidVNPhone("0912345678")    // true
valid := validator.IsValidVNPhone("+84912345678")  // true
valid := validator.IsValidVNPhone("0112345678")    // false
```

### `IsValidFullName(name string) bool`

Validate họ tên (2-100 ký tự, hỗ trợ tiếng Việt).

```go
valid := validator.IsValidFullName("Nguyễn Văn A") // true
valid := validator.IsValidFullName("A")            // false (quá ngắn)
```

### `IsValidPassword(password string) bool`

Validate mật khẩu (tối thiểu 6 ký tự, có chữ và số).

```go
valid := validator.IsValidPassword("Pass123")   // true
valid := validator.IsValidPassword("pass")      // false (thiếu số)
valid := validator.IsValidPassword("123456")    // false (thiếu chữ)
```

### `IsValidRoleForCreation(role string) bool`

Validate role cho admin create account (chỉ ADMIN/ORGANIZER/STAFF).

```go
valid := validator.IsValidRoleForCreation("STAFF")    // true
valid := validator.IsValidRoleForCreation("STUDENT")  // false
```

## 💬 Error Message Functions

Các hàm này trả về error message tiếng Việt:

### `GetEmailError(email string) string`

```go
err := validator.GetEmailError("") 
// "Email không được để trống"

err := validator.GetEmailError("invalid")
// "Email không hợp lệ. Ví dụ: user@example.com"
```

### `GetPhoneError(phone string) string`

```go
err := validator.GetPhoneError("0112345678")
// "Số điện thoại không hợp lệ. Phải là số Việt Nam (03x, 05x, 07x, 08x, 09x)"
```

### `GetFullNameError(name string) string`

```go
err := validator.GetFullNameError("A")
// "Họ tên phải có ít nhất 2 ký tự"
```

### `GetPasswordError(password string) string`

```go
err := validator.GetPasswordError("pass")
// "Mật khẩu phải chứa ít nhất 1 chữ số"
```

## ✅ Java Compatibility

Regex patterns giống hệt Java ValidationUtil:

| Pattern | Java | Go | Match |
|---------|------|-----|-------|
| Email | `^[a-zA-Z0-9_+&*-]+...` | Same | ✅ |
| Phone | `^(\+84\|84\|0)(3\|5\|7\|8\|9)\d{8}$` | Same | ✅ |
| FullName | `^[\p{L} .'-]{2,100}$` | Same | ✅ |
| Password | `^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@#$%^&+=!\-]{6,}$` | Same | ✅ |

## 🧪 Testing

```bash
go test -v
```

## 📝 Usage Example

```go
package main

import (
    "fmt"
    "github.com/fpt-event-services/common/validator"
)

func validateUserInput(email, phone, name, password string) error {
    // Validate email
    if err := validator.GetEmailError(email); err != "" {
        return fmt.Errorf(err)
    }
    
    // Validate phone
    if err := validator.GetPhoneError(phone); err != "" {
        return fmt.Errorf(err)
    }
    
    // Validate full name
    if err := validator.GetFullNameError(name); err != "" {
        return fmt.Errorf(err)
    }
    
    // Validate password
    if err := validator.GetPasswordError(password); err != "" {
        return fmt.Errorf(err)
    }
    
    return nil
}

func main() {
    err := validateUserInput(
        "user@fpt.edu.vn",
        "0912345678",
        "Nguyễn Văn A",
        "Pass123",
    )
    
    if err != nil {
        fmt.Println("Validation error:", err)
    } else {
        fmt.Println("All inputs valid!")
    }
}
```

## 🌐 Supported Patterns

### Email
- Format: `user@domain.com`
- Cho phép: letters, digits, +, &, *, -, _, .
- Domain: 2-7 chữ cái

### Phone (Vietnamese)
- Prefixes: 03x, 05x, 07x, 08x, 09x
- Format: `0912345678` hoặc `+84912345678` hoặc `84912345678`
- Total: 10-11 digits

### Full Name
- Length: 2-100 characters
- Cho phép: Unicode letters, spaces, dots, hyphens, apostrophes
- Support: Tiếng Việt có dấu

### Password
- Min length: 6 characters
- Must have: At least 1 letter (A-Z, a-z)
- Must have: At least 1 digit (0-9)
- Allowed: Letters, digits, @#$%^&+=!-
