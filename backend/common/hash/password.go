package hash

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// HashPassword hashes a plain password using SHA-256 (khớp với PasswordUtils.hashPassword)
// Returns lowercase hex string (64 chars)
func HashPassword(plainPassword string) string {
	if plainPassword == "" {
		return ""
	}

	hash := sha256.Sum256([]byte(plainPassword))
	return hex.EncodeToString(hash[:])
}

// VerifyPassword compares plain password with stored hash (khớp với PasswordUtils.verifyPassword)
// Case-insensitive comparison
func VerifyPassword(plainPassword, storedHash string) bool {
	if plainPassword == "" || storedHash == "" {
		return false
	}

	hashedInput := HashPassword(plainPassword)
	return strings.EqualFold(hashedInput, storedHash)
}
