package response

import (
	"encoding/json"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
)

// CORS Headers for API responses
var CORSHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type,Authorization",
}

// ============================================================
// Lambda Response Helpers
// Unified builders used by ALL Lambda services to eliminate
// duplicated createJSONResponse / createMessageResponse helpers.
// ============================================================

// LambdaHeaders returns standard CORS + JSON headers for all Lambda responses.
// Centralising here means a single change propagates to every service.
func LambdaHeaders() map[string]string {
	return map[string]string{
		"Content-Type":                     "application/json;charset=UTF-8",
		"Access-Control-Allow-Origin":      "*",
		"Access-Control-Allow-Credentials": "true",
		"Access-Control-Allow-Methods":     "GET,POST,PUT,DELETE,OPTIONS",
		"Access-Control-Allow-Headers":     "Content-Type,Authorization,X-User-Id,X-User-Role,X-Request-Id",
	}
}

// LambdaJSON serialises data to JSON and returns an APIGatewayProxyResponse.
// Equivalent to the per-service createJSONResponse helpers.
func LambdaJSON(statusCode int, data interface{}) (events.APIGatewayProxyResponse, error) {
	body, err := json.Marshal(data)
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
	bytes, err := json.Marshal(r)
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
