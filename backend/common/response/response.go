package response

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	commonutils "github.com/fpt-event-services/common/utils"
)

var defaultTrustedOrigins = []string{
	"https://fpt-event.online",
	"https://fpt-event.vercel.app",
	"http://localhost:5173",
	"http://localhost:3000",
}

func trustedOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return defaultTrustedOrigins
	}
	origins := make([]string, 0)
	for _, part := range strings.Split(raw, ",") {
		origin := strings.TrimSpace(part)
		if origin != "" && origin != "*" {
			origins = append(origins, origin)
		}
	}
	if len(origins) == 0 {
		return defaultTrustedOrigins
	}
	return origins
}

func TrustedOrigin(requestOrigin string) string {
	requestOrigin = strings.TrimSpace(requestOrigin)
	for _, origin := range trustedOrigins() {
		if requestOrigin == origin {
			return requestOrigin
		}
	}
	return ""
}

// CORS Headers for API responses
var CORSHeaders = map[string]string{
	"Vary":                             "Origin",
	"Access-Control-Allow-Credentials": "true",
	"Access-Control-Allow-Methods":     "GET,POST,PUT,DELETE,OPTIONS,PATCH",
	"Access-Control-Allow-Headers":     "Content-Type,Authorization,X-Requested-With",
}

// ============================================================
// Lambda Response Helpers
// Unified builders used by ALL Lambda services to eliminate
// duplicated createJSONResponse / createMessageResponse helpers.
// ============================================================

// LambdaHeaders returns standard CORS + JSON headers for all Lambda responses.
// Centralising here means a single change propagates to every service.
func LambdaHeadersForOrigin(origin string) map[string]string {
	headers := map[string]string{
		"Content-Type":                     "application/json;charset=UTF-8",
		"Vary":                             "Origin",
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods":     "GET,POST,PUT,DELETE,OPTIONS",
		"Access-Control-Allow-Headers":     "Content-Type,Authorization,X-Request-Id",
	}
	if allowed := TrustedOrigin(origin); allowed != "" {
		headers["Access-Control-Allow-Origin"] = allowed
	}
	return headers
}

func LambdaHeaders() map[string]string {
	return LambdaHeadersForOrigin("")
}

// LambdaJSON serialises data to JSON and returns an APIGatewayProxyResponse.
// Equivalent to the per-service createJSONResponse helpers.
func LambdaJSON(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := commonutils.MarshalVietnamJSON(data)
	if err != nil {
		return LambdaMsg(http.StatusInternalServerError, "Failed to serialize response")
	}
	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    LambdaHeaders(),
		Body:       string(body),
	}, nil
}

// LambdaMsg returns a {"message": "..."} response.
// Equivalent to the per-service createMessageResponse helpers.
func LambdaMsg(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{"message": message})
	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    LambdaHeaders(),
		Body:       string(body),
	}, nil
}

// LambdaOK returns a {success: true, ...data} response.
// Used for internal notification/confirmation endpoints.
func LambdaOK(data interface{}) (events.APIGatewayProxyResponse, error) {
	resp := SuccessResponse(data)
	return LambdaJSON(http.StatusOK, resp)
}

// LambdaErr returns a {success: false, error: "..."} response.
// Used for internal notification/confirmation endpoints.
func LambdaErr(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"success": false,
		"error":   message,
	})
	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    LambdaHeaders(),
		Body:       string(body),
	}, nil
}

// APIResponse represents a standard API response
type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message,omitempty"`
}

// SuccessResponse creates a success response
func SuccessResponse(data interface{}) APIResponse {
	return APIResponse{
		Success: true,
		Data:    data,
	}
}

// ErrorResponse creates an error response
func ErrorResponse(message string) APIResponse {
	return APIResponse{
		Success: false,
		Error:   message,
	}
}

// MessageResponse creates a message-only response
func MessageResponse(message string) APIResponse {
	return APIResponse{
		Success: true,
		Message: message,
	}
}

// ToJSON converts response to JSON string
func (r APIResponse) ToJSON() (string, error) {
	bytes, err := commonutils.MarshalVietnamJSON(r)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

// Common HTTP status codes
const (
	StatusOK                  = 200
	StatusCreated             = 201
	StatusBadRequest          = 400
	StatusUnauthorized        = 401
	StatusForbidden           = 403
	StatusNotFound            = 404
	StatusConflict            = 409
	StatusInternalServerError = 500
	StatusBadGateway          = 502
)
