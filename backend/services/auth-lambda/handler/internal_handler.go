package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/logger"
)

// ============================================================
// Auth Internal Handler - APIs nội bộ cho Microservices
//
// Các API này KHÔNG được expose ra ngoài (Frontend không gọi):
//   1. GET  /internal/user/profile?userId=  → Thông tin user (fullName, email, role)
//   2. GET  /internal/user/profiles?userIds=1,2,3 → Batch lookup nhiều users
//
// Security: Kiểm tra header X-Internal-Call = "true"
// ============================================================

// AuthInternalHandler xử lý các request nội bộ từ service khác
type AuthInternalHandler struct {
	db     *sql.DB
	logger *logger.Logger
}

// NewAuthInternalHandlerWithDB creates handler with explicit DB connection (DI)
// All DB connections must be injected from main.go - no singleton allowed
func NewAuthInternalHandlerWithDB(dbConn *sql.DB) *AuthInternalHandler {
	return &AuthInternalHandler{
		db:     dbConn,
		logger: logger.Default(),
	}
}

// UserProfileDTO dữ liệu trả về cho internal API
type UserProfileDTO struct {
	UserID   int    `json:"userId"`
	FullName string `json:"fullName"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Role     string `json:"role"`
}

// ============================================================
//  1. HandleGetUserProfile - GET /internal/user/profile?userId=
//     Trả về thông tin user (fullName, email, role)
//     Dùng bởi: event-lambda khi cần thay thế JOIN Users
//
// ============================================================
func (h *AuthInternalHandler) HandleGetUserProfile(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isAuthInternalCall(request) {
		return createAuthInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	userIDStr := request.QueryStringParameters["userId"]
	if userIDStr == "" {
		return createAuthInternalResponse(http.StatusBadRequest, map[string]string{"error": "userId required"})
	}

	userID, err := strconv.Atoi(userIDStr)
	if err != nil {
		return createAuthInternalResponse(http.StatusBadRequest, map[string]string{"error": "invalid userId"})
	}

	var profile UserProfileDTO
	query := `SELECT user_id, full_name, email, phone, role FROM Users WHERE user_id = ?`
	err = h.db.QueryRowContext(ctx, query, userID).Scan(
		&profile.UserID, &profile.FullName, &profile.Email, &profile.Phone, &profile.Role,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return createAuthInternalResponse(http.StatusNotFound, map[string]string{"error": "user not found"})
		}
		h.logger.Warn("[INTERNAL_AUTH] Failed to get user %d: %v", userID, err)
		return createAuthInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}

	h.logger.Info("[INTERNAL_AUTH] ✅ GetUserProfile: userId=%d, name=%s", userID, profile.FullName)
	return createAuthInternalResponse(http.StatusOK, profile)
}

// ============================================================
//  2. HandleGetUserProfiles - GET /internal/user/profiles?userIds=1,2,3
//     Batch lookup: Trả về danh sách user profiles
//     Dùng bởi: event-lambda khi cần requester_name + processed_by_name
//
// ============================================================
func (h *AuthInternalHandler) HandleGetUserProfiles(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isAuthInternalCall(request) {
		return createAuthInternalResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}

	userIDsStr := request.QueryStringParameters["userIds"]
	if userIDsStr == "" {
		return createAuthInternalResponse(http.StatusBadRequest, map[string]string{"error": "userIds required"})
	}

	// Parse comma-separated IDs
	var userIDs []int
	for _, idStr := range splitAndTrim(userIDsStr) {
		id, err := strconv.Atoi(idStr)
		if err != nil {
			continue
		}
		userIDs = append(userIDs, id)
	}

	if len(userIDs) == 0 {
		return createAuthInternalResponse(http.StatusOK, []UserProfileDTO{})
	}

	// Build IN clause
	placeholders := ""
	args := make([]interface{}, len(userIDs))
	for i, id := range userIDs {
		if i > 0 {
			placeholders += ","
		}
		placeholders += "?"
		args[i] = id
	}

	query := "SELECT user_id, full_name, email, phone, role FROM Users WHERE user_id IN (" + placeholders + ")"
	rows, err := h.db.QueryContext(ctx, query, args...)
	if err != nil {
		h.logger.Warn("[INTERNAL_AUTH] Failed to batch get users: %v", err)
		return createAuthInternalResponse(http.StatusInternalServerError, map[string]string{"error": "query failed"})
	}
	defer rows.Close()

	var profiles []UserProfileDTO
	for rows.Next() {
		var p UserProfileDTO
		if err := rows.Scan(&p.UserID, &p.FullName, &p.Email, &p.Phone, &p.Role); err != nil {
			continue
		}
		profiles = append(profiles, p)
	}

	if profiles == nil {
		profiles = []UserProfileDTO{}
	}

	h.logger.Info("[INTERNAL_AUTH] ✅ GetUserProfiles: count=%d", len(profiles))
	return createAuthInternalResponse(http.StatusOK, profiles)
}

// ============================================================
// HELPERS
// ============================================================

func isAuthInternalCall(request events.APIGatewayProxyRequest) bool {
	return request.Headers["X-Internal-Call"] == "true"
}

func createAuthInternalResponse(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"error":"failed to serialize response"}`,
		}, nil
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    map[string]string{"Content-Type": "application/json;charset=UTF-8"},
		Body:       string(body),
	}, nil
}

func splitAndTrim(s string) []string {
	var result []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := s[start:i]
			// Trim spaces
			trimmed := ""
			for _, c := range part {
				if c != ' ' {
					trimmed += string(c)
				}
			}
			if trimmed != "" {
				result = append(result, trimmed)
			}
			start = i + 1
		}
	}
	return result
}
