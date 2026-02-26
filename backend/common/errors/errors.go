package errors

import (
	"encoding/json"
	"fmt"
	"net/http"
	"runtime"
	"strings"
)

// ErrorCode represents application-specific error codes
type ErrorCode string

const (
	// Authentication errors (1xxx)
	ErrCodeUnauthorized       ErrorCode = "E1001"
	ErrCodeInvalidCredentials ErrorCode = "E1002"
	ErrCodeTokenExpired       ErrorCode = "E1003"
	ErrCodeInvalidToken       ErrorCode = "E1004"
	ErrCodeAccessDenied       ErrorCode = "E1005"
	ErrCodeUserBlocked        ErrorCode = "E1006"

	// Validation errors (2xxx)
	ErrCodeValidation      ErrorCode = "E2001"
	ErrCodeInvalidInput    ErrorCode = "E2002"
	ErrCodeMissingField    ErrorCode = "E2003"
	ErrCodeInvalidFormat   ErrorCode = "E2004"
	ErrCodeInvalidEmail    ErrorCode = "E2005"
	ErrCodeInvalidPhone    ErrorCode = "E2006"
	ErrCodeInvalidPassword ErrorCode = "E2007"

	// Resource errors (3xxx)
	ErrCodeNotFound       ErrorCode = "E3001"
	ErrCodeAlreadyExists  ErrorCode = "E3002"
	ErrCodeConflict       ErrorCode = "E3003"
	ErrCodeResourceLocked ErrorCode = "E3004"

	// Business logic errors (4xxx)
	ErrCodeBusinessRule     ErrorCode = "E4001"
	ErrCodeInvalidState     ErrorCode = "E4002"
	ErrCodeEventNotActive   ErrorCode = "E4003"
	ErrCodeTicketSoldOut    ErrorCode = "E4004"
	ErrCodeSeatNotAvailable ErrorCode = "E4005"
	ErrCodePaymentFailed    ErrorCode = "E4006"
	ErrCodeOTPExpired       ErrorCode = "E4007"
	ErrCodeOTPInvalid       ErrorCode = "E4008"
	ErrCodeOTPMaxAttempts   ErrorCode = "E4009"

	// External service errors (5xxx)
	ErrCodeExternalService ErrorCode = "E5001"
	ErrCodeVNPayError      ErrorCode = "E5002"
	ErrCodeEmailError      ErrorCode = "E5003"
	ErrCodeRecaptchaError  ErrorCode = "E5004"

	// Internal errors (9xxx)
	ErrCodeInternal ErrorCode = "E9001"
	ErrCodeDatabase ErrorCode = "E9002"
	ErrCodeTimeout  ErrorCode = "E9003"
)

// AppError represents an application error with context
type AppError struct {
	Code       ErrorCode              `json:"code"`
	Message    string                 `json:"message"`
	Details    string                 `json:"details,omitempty"`
	HTTPStatus int                    `json:"-"`
	Cause      error                  `json:"-"`
	Stack      string                 `json:"-"`
	Fields     map[string]interface{} `json:"fields,omitempty"`
}

// Error implements the error interface
func (e *AppError) Error() string {
	if e.Cause != nil {
		return fmt.Sprintf("[%s] %s: %v", e.Code, e.Message, e.Cause)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// Unwrap returns the underlying error
func (e *AppError) Unwrap() error {
	return e.Cause
}

// WithDetails adds additional details to the error
func (e *AppError) WithDetails(details string) *AppError {
	e.Details = details
	return e
}

// WithField adds a field to the error
func (e *AppError) WithField(key string, value interface{}) *AppError {
	if e.Fields == nil {
		e.Fields = make(map[string]interface{})
	}
	e.Fields[key] = value
	return e
}

// WithCause wraps an underlying error
func (e *AppError) WithCause(err error) *AppError {
	e.Cause = err
	return e
}

// ToJSON converts error to JSON response format
func (e *AppError) ToJSON() map[string]interface{} {
	result := map[string]interface{}{
		"status":  "error",
		"code":    e.Code,
		"message": e.Message,
	}
	if e.Details != "" {
		result["details"] = e.Details
	}
	if len(e.Fields) > 0 {
		result["fields"] = e.Fields
	}
	return result
}

// WriteJSON writes error as JSON response
func (e *AppError) WriteJSON(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(e.HTTPStatus)
	json.NewEncoder(w).Encode(e.ToJSON())
}

// ============================================================
// Error constructors
// ============================================================

// New creates a new AppError
func New(code ErrorCode, message string) *AppError {
	return &AppError{
		Code:       code,
		Message:    message,
		HTTPStatus: getHTTPStatus(code),
		Stack:      captureStack(2),
	}
}

// Wrap wraps an existing error with AppError
func Wrap(err error, code ErrorCode, message string) *AppError {
	return &AppError{
		Code:       code,
		Message:    message,
		HTTPStatus: getHTTPStatus(code),
		Cause:      err,
		Stack:      captureStack(2),
	}
}

// ============================================================
// Predefined error constructors
// ============================================================

// Authentication errors
func Unauthorized(message string) *AppError {
	return New(ErrCodeUnauthorized, message)
}

func InvalidCredentials() *AppError {
	return New(ErrCodeInvalidCredentials, "Email hoặc mật khẩu không đúng")
}

func TokenExpired() *AppError {
	return New(ErrCodeTokenExpired, "Phiên đăng nhập đã hết hạn")
}

func InvalidToken() *AppError {
	return New(ErrCodeInvalidToken, "Token không hợp lệ")
}

func AccessDenied() *AppError {
	return New(ErrCodeAccessDenied, "Bạn không có quyền truy cập")
}

func UserBlocked() *AppError {
	return New(ErrCodeUserBlocked, "Tài khoản đã bị khóa")
}

// Validation errors
func ValidationError(message string) *AppError {
	return New(ErrCodeValidation, message)
}

func InvalidInput(field, message string) *AppError {
	return New(ErrCodeInvalidInput, message).WithField("field", field)
}

func MissingField(field string) *AppError {
	return New(ErrCodeMissingField, fmt.Sprintf("%s không được để trống", field)).WithField("field", field)
}

func InvalidEmail() *AppError {
	return New(ErrCodeInvalidEmail, "Email không hợp lệ")
}

func InvalidPhone() *AppError {
	return New(ErrCodeInvalidPhone, "Số điện thoại không hợp lệ")
}

func InvalidPassword() *AppError {
	return New(ErrCodeInvalidPassword, "Mật khẩu phải có ít nhất 6 ký tự")
}

// Resource errors
func NotFound(resource string) *AppError {
	return New(ErrCodeNotFound, fmt.Sprintf("%s không tồn tại", resource))
}

func AlreadyExists(resource string) *AppError {
	return New(ErrCodeAlreadyExists, fmt.Sprintf("%s đã tồn tại", resource))
}

func Conflict(message string) *AppError {
	return New(ErrCodeConflict, message)
}

// Business logic errors
func BusinessError(message string) *AppError {
	return New(ErrCodeBusinessRule, message)
}

func EventNotActive() *AppError {
	return New(ErrCodeEventNotActive, "Sự kiện không hoạt động")
}

func TicketSoldOut() *AppError {
	return New(ErrCodeTicketSoldOut, "Vé đã bán hết")
}

func SeatNotAvailable() *AppError {
	return New(ErrCodeSeatNotAvailable, "Ghế không còn trống")
}

func PaymentFailed(reason string) *AppError {
	return New(ErrCodePaymentFailed, fmt.Sprintf("Thanh toán thất bại: %s", reason))
}

func OTPExpired() *AppError {
	return New(ErrCodeOTPExpired, "Mã OTP đã hết hạn")
}

func OTPInvalid() *AppError {
	return New(ErrCodeOTPInvalid, "Mã OTP không đúng")
}

func OTPMaxAttempts() *AppError {
	return New(ErrCodeOTPMaxAttempts, "Đã nhập sai quá 5 lần, vui lòng yêu cầu OTP mới")
}

// External service errors
func ExternalServiceError(service, message string) *AppError {
	return New(ErrCodeExternalService, message).WithField("service", service)
}

func VNPayError(message string) *AppError {
	return New(ErrCodeVNPayError, message)
}

func EmailError(message string) *AppError {
	return New(ErrCodeEmailError, message)
}

func RecaptchaError(message string) *AppError {
	return New(ErrCodeRecaptchaError, message)
}

// Internal errors
func Internal(message string) *AppError {
	return New(ErrCodeInternal, message)
}

func DatabaseError(err error) *AppError {
	return Wrap(err, ErrCodeDatabase, "Lỗi cơ sở dữ liệu")
}

func Timeout() *AppError {
	return New(ErrCodeTimeout, "Yêu cầu đã hết thời gian chờ")
}

// ============================================================
// Helper functions
// ============================================================

func getHTTPStatus(code ErrorCode) int {
	switch code {
	case ErrCodeUnauthorized, ErrCodeInvalidCredentials, ErrCodeTokenExpired, ErrCodeInvalidToken:
		return http.StatusUnauthorized
	case ErrCodeAccessDenied, ErrCodeUserBlocked:
		return http.StatusForbidden
	case ErrCodeValidation, ErrCodeInvalidInput, ErrCodeMissingField, ErrCodeInvalidFormat,
		ErrCodeInvalidEmail, ErrCodeInvalidPhone, ErrCodeInvalidPassword,
		ErrCodeOTPExpired, ErrCodeOTPInvalid, ErrCodeOTPMaxAttempts:
		return http.StatusBadRequest
	case ErrCodeNotFound:
		return http.StatusNotFound
	case ErrCodeAlreadyExists, ErrCodeConflict, ErrCodeResourceLocked:
		return http.StatusConflict
	case ErrCodeBusinessRule, ErrCodeInvalidState, ErrCodeEventNotActive,
		ErrCodeTicketSoldOut, ErrCodeSeatNotAvailable, ErrCodePaymentFailed:
		return http.StatusUnprocessableEntity
	case ErrCodeExternalService, ErrCodeVNPayError, ErrCodeEmailError, ErrCodeRecaptchaError:
		return http.StatusBadGateway
	case ErrCodeTimeout:
		return http.StatusGatewayTimeout
	default:
		return http.StatusInternalServerError
	}
}

func captureStack(skip int) string {
	var pcs [32]uintptr
	n := runtime.Callers(skip+1, pcs[:])
	frames := runtime.CallersFrames(pcs[:n])

	var sb strings.Builder
	for {
		frame, more := frames.Next()
		if strings.Contains(frame.File, "runtime/") {
			if !more {
				break
			}
			continue
		}
		sb.WriteString(fmt.Sprintf("%s\n\t%s:%d\n", frame.Function, frame.File, frame.Line))
		if !more {
			break
		}
	}
	return sb.String()
}

// IsAppError checks if an error is an AppError
func IsAppError(err error) bool {
	_, ok := err.(*AppError)
	return ok
}

// AsAppError converts an error to AppError if possible
func AsAppError(err error) (*AppError, bool) {
	appErr, ok := err.(*AppError)
	return appErr, ok
}

// ToAppError converts any error to AppError
func ToAppError(err error) *AppError {
	if appErr, ok := err.(*AppError); ok {
		return appErr
	}
	return Wrap(err, ErrCodeInternal, err.Error())
}
