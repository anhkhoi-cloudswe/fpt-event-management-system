package jwt

import (
	"crypto/md5"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims represents JWT claims structure
type Claims struct {
	UserID int    `json:"userId"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

var (
	// JWT secret key from environment variable
	secretKey = []byte(getEnv("JWT_SECRET", "m5b0u7V6Zy0pZr5j3z2mJ8jJj2cZbYxJw0l0pWlCk8hM6m8cJz7JbZc+oQd8hQ1f"))

	// Token expiration time (7 days)
	tokenExpiration = 7 * 24 * time.Hour
)

// GenerateToken generates a JWT token for a user (khớp JwtUtils.generateToken)
func GenerateToken(userID int, email, role string) (string, error) {
	now := time.Now()

	claims := Claims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenExpiration)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(secretKey)
}

// ValidateToken validates a JWT token and returns claims
func ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return secretKey, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

// GetEmailFromToken extracts email from token (khớp JwtUtils.getEmailFromToken)
func GetEmailFromToken(tokenString string) (string, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return "", err
	}
	return claims.Email, nil
}

// GetRoleFromToken extracts role from token
func GetRoleFromToken(tokenString string) (string, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return "", err
	}
	return claims.Role, nil
}

// IsAdmin checks if the token belongs to an admin user
func IsAdmin(tokenString string) bool {
	role, err := GetRoleFromToken(tokenString)
	if err != nil {
		return false
	}
	return role == "ADMIN"
}

// GetUserIDFromToken extracts user ID from token
func GetUserIDFromToken(tokenString string) (int, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return 0, err
	}
	return claims.UserID, nil
}

// ReloadSecret re-reads JWT_SECRET from the environment.
// Must be called AFTER godotenv.Load() in services that load .env in init(),
// because package-level var secretKey is initialized before main's init() runs.
// Deep-clean: strips surrounding double-quotes, whitespace, \r, \n that
// Windows .env files or editors may inject.
func ReloadSecret() {
	if v := os.Getenv("JWT_SECRET"); v != "" {
		v = strings.TrimSpace(v)        // strip \n, \r, spaces at both ends
		v = strings.TrimPrefix(v, "\"") // strip leading "
		v = strings.TrimSuffix(v, "\"") // strip trailing "
		v = strings.TrimSpace(v)        // one more pass after quote removal
		// Explicit conversion: string → []byte (deterministic, no encoding ambiguity)
		clean := []byte(v)
		secretKey = clean
	}
}

// GetSecretPreview returns "first4...last4 (Len: N, MD5: hex8)" of the active secret for debug logging.
func GetSecretPreview() string {
	hash := md5.Sum(secretKey)
	md5hex := fmt.Sprintf("%x", hash)[:8] // first 8 hex chars
	l := len(secretKey)
	if l >= 8 {
		return fmt.Sprintf("%s...%s (Len: %d, MD5: %s)", string(secretKey[:4]), string(secretKey[l-4:]), l, md5hex)
	}
	return fmt.Sprintf("%s (Len: %d, MD5: %s)", string(secretKey), l, md5hex)
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
