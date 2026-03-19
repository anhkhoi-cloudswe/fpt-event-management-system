package utils

import "golang.org/x/crypto/bcrypt"

const bcryptCost = 12

// HashPassword hashes plaintext passwords with bcrypt at cost 12.
// Cost 12 is intentionally slower to increase resistance to brute-force attacks.
func HashPassword(password string) (string, error) {
	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return "", err
	}

	return string(hashedBytes), nil
}

// CheckPasswordHash verifies a plaintext password against a bcrypt hash.
// It returns false for any mismatch or malformed hash without leaking details.
func CheckPasswordHash(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}
