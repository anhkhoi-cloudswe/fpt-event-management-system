package hash

import (
	"crypto/md5"
	"crypto/sha256"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const BcryptCost = 12

// HashPassword hashes a plain password using Bcrypt (Cost 12)
// Returns bcrypt hash string starting with $2a$
func HashPassword(plainPassword string) (string, error) {
	if plainPassword == "" {
		return "", fmt.Errorf("password cannot be empty")
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(plainPassword), BcryptCost)
	if err != nil {
		return "", err
	}

	return string(hashedBytes), nil
}

// VerifyPassword compares plain password with bcrypt hash
func VerifyPassword(plainPassword, storedHash string) bool {
	if plainPassword == "" || storedHash == "" {
		return false
	}

	// Try bcrypt first (new format)
	if strings.HasPrefix(storedHash, "$2a$") {
		err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(plainPassword))
		return err == nil
	}

	// Fallback to legacy SHA-256 for backward compatibility
	return verifyLegacyPassword(plainPassword, storedHash)
}

// verifyLegacyPassword checks legacy password formats (SHA-256, MD5, plaintext)
func verifyLegacyPassword(plainPassword, storedHash string) bool {
	trimmedStoredHash := strings.TrimSpace(storedHash)

	// Check 1: Plain text match (legacy plaintext storage)
	if plainPassword == trimmedStoredHash {
		return true
	}

	// Check 2: MD5 hash match (legacy MD5 storage)
	legacyMD5 := md5.Sum([]byte(plainPassword))
	legacyMD5Hex := fmt.Sprintf("%x", legacyMD5)
	if strings.EqualFold(legacyMD5Hex, trimmedStoredHash) {
		return true
	}

	// Check 3: SHA256 hash match (legacy SHA256 storage)
	legacySHA256 := sha256.Sum256([]byte(plainPassword))
	legacySHA256Hex := fmt.Sprintf("%x", legacySHA256)
	if strings.EqualFold(legacySHA256Hex, trimmedStoredHash) {
		return true
	}

	return false
}

// IsBcryptHash checks if a hash string is in bcrypt format
func IsBcryptHash(hash string) bool {
	return strings.HasPrefix(hash, "$2a$")
}

