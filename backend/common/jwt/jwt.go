package jwt

import (
	"errors"
	"log"
	"os"
	"strings"
	"time"

	"github.com/fpt-event-services/common/timeutil"
	jwtlib "github.com/golang-jwt/jwt/v5"
)

// Claims represents the signed user identity embedded in application JWTs.
type Claims struct {
	UserID         int    `json:"userId"`
	Email          string `json:"email"`
	FullName       string `json:"fullName"`
	Role           string `json:"role"`
	TokenType      string `json:"tokenType"`
	SessionTokenID string `json:"sessionTokenId,omitempty"`
	jwtlib.RegisteredClaims
}

var (
	secretKey              []byte
	accessTokenExpiration  = 15 * time.Minute
	refreshTokenExpiration = 7 * 24 * time.Hour
)

func cleanSecret(raw string) string {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "\"")
	raw = strings.TrimSuffix(raw, "\"")
	return strings.TrimSpace(raw)
}

func requireSecretFromEnv() []byte {
	secret := cleanSecret(os.Getenv("JWT_SECRET"))
	if len([]byte(secret)) < 32 {
		log.Fatalf("JWT_SECRET must be configured and at least 32 bytes")
	}
	return []byte(secret)
}

func activeSecret() ([]byte, error) {
	if len(secretKey) >= 32 {
		return secretKey, nil
	}
	return nil, errors.New("JWT_SECRET is not configured")
}

func GetLifespans(role string) (time.Duration, time.Duration) {
	switch strings.ToUpper(role) {
	case "STUDENT":
		return 60 * time.Minute, 7 * 24 * time.Hour
	case "ORGANIZER":
		return 30 * time.Minute, 3 * 24 * time.Hour
	case "STAFF":
		return 30 * time.Minute, 24 * time.Hour
	case "ADMIN":
		return 15 * time.Minute, 8 * time.Hour
	default:
		return 15 * time.Minute, 24 * time.Hour
	}
}

// GenerateToken generates a signed access JWT token for a user.
func GenerateToken(userID int, email, fullName, role string) (string, error) {
	return GenerateAccessToken(userID, email, fullName, role)
}

func GenerateAccessToken(userID int, email, fullName, role string) (string, error) {
	accessExp, _ := GetLifespans(role)
	return generateToken(userID, email, fullName, role, "", "access", accessExp)
}

func GenerateRefreshToken(userID int, email, fullName, role string) (string, error) {
	_, refreshExp := GetLifespans(role)
	return generateToken(userID, email, fullName, role, "", "refresh", refreshExp)
}

func GenerateTokenPair(userID int, email, fullName, role string) (string, string, error) {
	return GenerateTokenPairWithSessionID(userID, email, fullName, role, "")
}

func GenerateTokenPairWithSessionID(userID int, email, fullName, role, sessionTokenID string) (string, string, error) {
	accessExp, refreshExp := GetLifespans(role)
	accessToken, err := generateToken(userID, email, fullName, role, sessionTokenID, "access", accessExp)
	if err != nil {
		return "", "", err
	}
	refreshToken, err := generateToken(userID, email, fullName, role, sessionTokenID, "refresh", refreshExp)
	if err != nil {
		return "", "", err
	}
	return accessToken, refreshToken, nil
}

func generateToken(userID int, email, fullName, role, sessionTokenID string, tokenType string, expiration time.Duration) (string, error) {
	key, err := activeSecret()
	if err != nil {
		return "", err
	}

	now := timeutil.GetNow()
	claims := Claims{
		UserID:         userID,
		Email:          email,
		FullName:       fullName,
		Role:           role,
		TokenType:      tokenType,
		SessionTokenID: sessionTokenID,
		RegisteredClaims: jwtlib.RegisteredClaims{
			IssuedAt:  jwtlib.NewNumericDate(now),
			ExpiresAt: jwtlib.NewNumericDate(now.Add(expiration)),
		},
	}

	token := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, claims)
	return token.SignedString(key)
}

// ValidateToken validates a JWT token and returns verified claims.
func ValidateToken(tokenString string) (*Claims, error) {
	key, err := activeSecret()
	if err != nil {
		return nil, err
	}

	token, err := jwtlib.ParseWithClaims(tokenString, &Claims{}, func(token *jwtlib.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwtlib.SigningMethodHMAC); !ok {
			return nil, errors.New("invalid signing method")
		}
		return key, nil
	}, jwtlib.WithValidMethods([]string{jwtlib.SigningMethodHS256.Alg()}))
	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}
	return nil, errors.New("invalid token")
}

func ValidateAccessToken(tokenString string) (*Claims, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != "" && claims.TokenType != "access" {
		return nil, errors.New("invalid access token type")
	}
	return claims, nil
}

func ValidateRefreshToken(tokenString string) (*Claims, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != "refresh" {
		return nil, errors.New("invalid refresh token type")
	}
	return claims, nil
}

func GetEmailFromToken(tokenString string) (string, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return "", err
	}
	return claims.Email, nil
}

func GetRoleFromToken(tokenString string) (string, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return "", err
	}
	return claims.Role, nil
}

func IsAdmin(tokenString string) bool {
	role, err := GetRoleFromToken(tokenString)
	return err == nil && role == "ADMIN"
}

func GetUserIDFromToken(tokenString string) (int, error) {
	claims, err := ValidateToken(tokenString)
	if err != nil {
		return 0, err
	}
	return claims.UserID, nil
}

// ReloadSecret is the startup guard. It must run after environment loading.
func ReloadSecret() {
	secretKey = requireSecretFromEnv()
}
