package jwt

import (
	"testing"
	"time"

	"github.com/fpt-event-services/common/timeutil"
)

func TestGenerateAndValidateTokenPairWithSessionID(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	ReloadSecret()

	accessToken, refreshToken, err := GenerateTokenPairWithSessionID(42, "student@fpt.edu.vn", "Test Student", "STUDENT", "sess-abc-123")
	if err != nil {
		t.Fatalf("GenerateTokenPairWithSessionID failed: %v", err)
	}

	accessClaims, err := ValidateAccessToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken failed: %v", err)
	}
	if accessClaims.SessionTokenID != "sess-abc-123" || accessClaims.UserID != 42 {
		t.Fatalf("unexpected access claims: %+v", accessClaims)
	}

	refreshClaims, err := ValidateRefreshToken(refreshToken)
	if err != nil {
		t.Fatalf("ValidateRefreshToken failed: %v", err)
	}
	if refreshClaims.SessionTokenID != "sess-abc-123" || refreshClaims.UserID != 42 {
		t.Fatalf("unexpected refresh claims: %+v", refreshClaims)
	}
}

func TestValidateTokenRespectsSystemTimeOverride(t *testing.T) {
	t.Setenv("JWT_SECRET", "0123456789abcdef0123456789abcdef")
	t.Setenv("SYSTEM_TIME_OVERRIDE", "2026-04-01T08:00:00+07:00")
	ReloadSecret()

	accessToken, _, err := GenerateTokenPairWithSessionID(7, "admin@fpt.edu.vn", "Admin", "ADMIN", "sess-time-1")
	if err != nil {
		t.Fatalf("GenerateTokenPairWithSessionID failed: %v", err)
	}

	claims, err := ValidateAccessToken(accessToken)
	if err != nil {
		t.Fatalf("ValidateAccessToken should succeed under matching SYSTEM_TIME_OVERRIDE: %v", err)
	}
	expectedIssue := timeutil.GetNow().Truncate(time.Second)
	if !claims.IssuedAt.Time.Equal(expectedIssue) {
		t.Fatalf("expected IssuedAt %v, got %v", expectedIssue, claims.IssuedAt.Time)
	}
}
