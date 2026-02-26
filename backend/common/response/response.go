package response

import (
	"encoding/json"
)

// CORS Headers for API responses
var CORSHeaders = map[string]string{
	"Access-Control-Allow-Origin":  "*",
	"Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type,Authorization",
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
