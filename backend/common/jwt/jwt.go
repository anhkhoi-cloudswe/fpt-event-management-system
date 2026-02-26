package jwt

import (
	"errors"
	"os"
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

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
