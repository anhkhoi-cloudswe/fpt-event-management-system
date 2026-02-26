# Common Hash Package

Package này cung cấp các hàm hash và verify mật khẩu sử dụng SHA-256, **khớp 100% với PasswordUtils.java**.

## 🎯 Mục đích

- Hash mật khẩu trước khi lưu vào database
- Verify mật khẩu khi user login
- Tương thích hoàn toàn với code Java hiện tại

## 📦 Functions

### `HashPassword(plainPassword string) string`

Hash mật khẩu plain text thành hex string 64 ký tự.

```go
hash := hash.HashPassword("Pass123")
// Output: "4c4c58d24f3ee13ce953120f3ae552f5c6a5df7d8c7d3dd83d8d6e3a83c34fc8"
```

### `VerifyPassword(plainPassword, storedHash string) bool`

So sánh mật khẩu plain text với hash đã lưu trong database.

```go
valid := hash.VerifyPassword("Pass123", storedHash)
// Returns: true nếu khớp, false nếu không khớp
```

## ✅ Java Compatibility

Package này được thiết kế để tương thích 100% với Java PasswordUtils:

```java
// Java code
String hash = PasswordUtils.hashPassword("Pass123");
boolean valid = PasswordUtils.verifyPassword("Pass123", hash);
```

```go
// Go code - output giống hệt
hash := hash.HashPassword("Pass123")
valid := hash.VerifyPassword("Pass123", hash)
```

## 🧪 Testing

Chạy tests:

```bash
go test -v
```

Test coverage:

```bash
go test -cover
```

## 🔒 Security Notes

- SHA-256 là one-way hash (không thể decode ngược)
- Output là lowercase hex string
- Case-insensitive comparison khi verify
- ⚠️ Không có salt - tương tự Java code hiện tại

## 📝 Usage Example

```go
package main

import (
    "fmt"
    "github.com/fpt-event-services/common/hash"
)

func main() {
    // Hash password khi user đăng ký
    password := "MyPassword123"
    hashedPassword := hash.HashPassword(password)
    
    // Lưu hashedPassword vào database
    fmt.Println("Hash:", hashedPassword)
    
    // Verify password khi user login
    inputPassword := "MyPassword123"
    isValid := hash.VerifyPassword(inputPassword, hashedPassword)
    
    if isValid {
        fmt.Println("Login successful!")
    } else {
        fmt.Println("Invalid password!")
    }
}
```

## 🔄 Migration from Java

Không cần migrate dữ liệu. Password hash trong database vẫn hoạt động bình thường vì:

1. Go code hash giống hệt Java
2. Verify logic giống nhau
3. Output format giống nhau (64-char hex)
