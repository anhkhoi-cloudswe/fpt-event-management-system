package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/scheduler"
	authHandler "github.com/fpt-event-services/services/auth-lambda/handler"
	eventHandler "github.com/fpt-event-services/services/event-lambda/handler"
	eventRepository "github.com/fpt-event-services/services/event-lambda/repository"
	staffHandler "github.com/fpt-event-services/services/staff-lambda/handler"
	ticketHandler "github.com/fpt-event-services/services/ticket-lambda/handler"
	venueHandler "github.com/fpt-event-services/services/venue-lambda/handler"
)

// Adapter converts http.Request to APIGatewayProxyRequest
func adaptRequest(r *http.Request) (events.APIGatewayProxyRequest, error) {
	// Read body
	body, err := io.ReadAll(r.Body)
	if err != nil {
		return events.APIGatewayProxyRequest{}, err
	}
	defer r.Body.Close()

	// Convert headers to map[string]string
	headers := make(map[string]string)
	for key, values := range r.Header {
		if len(values) > 0 {
			headers[key] = values[0]
		}
	}

	// Convert query parameters
	queryParams := make(map[string]string)
	for key, values := range r.URL.Query() {
		if len(values) > 0 {
			queryParams[key] = values[0]
		}
	}

	return events.APIGatewayProxyRequest{
		HTTPMethod:            r.Method,
		Path:                  r.URL.Path,
		Headers:               headers,
		QueryStringParameters: queryParams,
		Body:                  string(body),
	}, nil
}

// writeResponse writes APIGatewayProxyResponse to http.ResponseWriter
func writeResponse(w http.ResponseWriter, resp events.APIGatewayProxyResponse) {
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")

	// Set response headers from Lambda response
	for key, value := range resp.Headers {
		w.Header().Set(key, value)
	}

	// Set status code and write body
	w.WriteHeader(resp.StatusCode)
	w.Write([]byte(resp.Body))
}

// corsMiddleware handles CORS preflight requests
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for all responses
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")

		// Handle preflight request
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// authMiddleware extracts user info from JWT and adds to request headers and context
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Extract token
		authHeader := r.Header.Get("Authorization")
		log.Printf("[AUTH] Authorization header: %s", authHeader[:min(len(authHeader), 50)])

		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			token := authHeader[7:]
			claims, err := jwt.ValidateToken(token)
			if err != nil {
				log.Printf("[AUTH] JWT validation error: %v", err)
			}
			if claims != nil {
				// Extract user info and add to headers for handler
				// Use canonical form: X-User-Id (Go http auto-normalizes headers)
				r.Header.Set("X-User-Id", fmt.Sprintf("%d", claims.UserID))
				r.Header.Set("X-User-Role", claims.Role)
				log.Printf("[AUTH] ✅ Set X-User-Id=%d, X-User-Role=%s", claims.UserID, claims.Role)

				// CRITICAL: Add userID to Context for handlers
				r = r.WithContext(context.WithValue(r.Context(), "userID", claims.UserID))
				r = r.WithContext(context.WithValue(r.Context(), "userRole", claims.Role))
				log.Printf("[AUTH] ✅ Added userID=%d to Context", claims.UserID)
			} else {
				log.Printf("[AUTH] ❌ Claims is nil")
			}
		} else {
			log.Printf("[AUTH] ❌ No Bearer token found")
		}

		next(w, r)
	})
}

// runStartupJanitor runs cleanup tasks when the server starts
func runStartupJanitor() {
	log.Println("========================================")
	log.Println("🧹 [STARTUP JANITOR] Running startup cleanup tasks...")
	log.Println("========================================")

	// Create event repository to access cleanup function
	eventRepo := eventRepository.NewEventRepository()

	// Run venue release for closed events
	ctx := context.Background()
	log.Println("[STARTUP JANITOR] Releasing venues for closed events...")

	if err := eventRepo.AutoReleaseVenues(ctx); err != nil {
		log.Printf("❌ [STARTUP JANITOR] Error releasing venues: %v", err)
	} else {
		log.Println("✅ [STARTUP JANITOR] Venue release completed")
	}

	log.Println("========================================")
	log.Println("🧹 [STARTUP JANITOR] Startup cleanup completed")
	log.Println("========================================")
}

func main() {
	// Load environment from .env file if exists
	loadEnvFile(".env")

	// Initialize services that depend on environment variables
	authHandler.InitServices()

	// Initialize database
	log.Println("Connecting to MySQL database...")
	if err := db.InitDB(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.CloseDB()
	log.Println("Database connected successfully!")

	// ======================= STARTUP JANITOR =======================
	// Run startup cleanup to release areas for closed events
	runStartupJanitor()

	// Create handlers
	authH := authHandler.NewAuthHandler()
	eventH := eventHandler.NewEventHandler()
	ticketH := ticketHandler.NewTicketHandler()
	venueH := venueHandler.NewVenueHandler()
	staffH := staffHandler.NewStaffHandler()

	// ======================= AUTH ROUTES =======================
	http.HandleFunc("/api/login", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleLogin(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	http.HandleFunc("/api/register", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleRegister(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// POST /api/register/send-otp - Register step 1 - Send OTP to email
	http.HandleFunc("/api/register/send-otp", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleRegisterSendOTP(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// POST /api/register/verify-otp - Register step 2 - Verify OTP and create account
	http.HandleFunc("/api/register/verify-otp", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleRegisterVerifyOTP(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// POST /api/register/resend-otp - Resend OTP for pending registration
	http.HandleFunc("/api/register/resend-otp", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleRegisterResendOTP(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// /api/admin/create-account - POST/PUT/DELETE (Admin user management)
	http.HandleFunc("/api/admin/create-account", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		var resp events.APIGatewayProxyResponse
		switch r.Method {
		case http.MethodPost:
			resp, err = authH.HandleAdminCreateAccount(context.Background(), req)
		case http.MethodPut:
			resp, err = authH.HandleAdminUpdateUser(context.Background(), req)
		case http.MethodDelete:
			resp, err = authH.HandleAdminDeleteUser(context.Background(), req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/users/staff-organizer - Get STAFF & ORGANIZER users (Admin only)
	http.HandleFunc("/api/users/staff-organizer", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleGetStaffOrganizer(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// POST /api/forgot-password - Quên mật khẩu (gửi OTP)
	http.HandleFunc("/api/forgot-password", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleForgotPassword(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// POST /api/reset-password - Đặt lại mật khẩu với OTP
	http.HandleFunc("/api/reset-password", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := authH.HandleResetPassword(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// ======================= EVENT ROUTES =======================

	// GET /api/events - Get all events (with optional filters)
	// ✅ CHANGED: Use authMiddleware to extract JWT and set X-User-Id, X-User-Role headers
	// This enables permission filtering: ORGANIZER sees only their events
	http.HandleFunc("/api/events", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetEvents(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// GET /api/events/open - Get only OPEN events (public)
	http.HandleFunc("/api/events/open", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetOpenEvents(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// GET /api/events/detail?id={eventId} - Get event by ID (khớp với Java)
	http.HandleFunc("/api/events/detail", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetEventDetail(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeResponse(w, resp)
	}))

	// ======================= EVENT REQUEST ROUTES =======================

	// POST /api/event-requests - Tạo yêu cầu sự kiện (ORGANIZER)
	http.HandleFunc("/api/event-requests", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		var resp events.APIGatewayProxyResponse
		switch r.Method {
		case http.MethodPost:
			resp, err = eventH.HandleCreateEventRequest(context.Background(), req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ✅ FIXED ORDER: Register specific routes BEFORE catch-all routes
	// GET /api/event-requests/my - Organizer xem request của mình (KHỚP JAVA)
	http.HandleFunc("/api/event-requests/my", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetMyEventRequests(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/event-requests/my/active - Organizer xem request hoạt động (tab "Chờ")
	// Support pagination: ?limit=10&offset=0
	http.HandleFunc("/api/event-requests/my/active", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetMyActiveEventRequests(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/event-requests/my/archived - Organizer xem request đã lưu trữ (tab "Đã xử lý")
	// Support pagination: ?limit=10&offset=0
	http.HandleFunc("/api/event-requests/my/archived", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetMyArchivedEventRequests(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/staff/event-requests - Staff xem tất cả request (group theo trạng thái) (KHỚP JAVA)
	http.HandleFunc("/api/staff/event-requests", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetPendingEventRequests(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// POST /api/event-requests/process - Duyệt/Từ chối yêu cầu (STAFF/ADMIN)
	http.HandleFunc("/api/event-requests/process", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleProcessEventRequest(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// POST /api/event-requests/update - Cập nhật yêu cầu sự kiện (ORGANIZER)
	http.HandleFunc("/api/event-requests/update", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleUpdateEventRequest(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ✅ FIXED: GET /api/event-requests/{id} - Using method-agnostic pattern (Go 1.22+ compatible)
	// Lấy chi tiết event request cụ thể (ORGANIZER/STAFF/ADMIN)
	// IMPORTANT: Registered after specific routes to avoid conflicts
	http.HandleFunc("/api/event-requests/{id}", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		log.Printf("[ROUTE_DEBUG] Matched /api/event-requests/{id}, Path: %s, Method: %s", r.URL.Path, r.Method)

		// Extract ID from Go 1.22+ path parameter
		requestID := r.PathValue("id")
		log.Printf("[ROUTE_DEBUG] Extracted ID from pattern: %s", requestID)

		if requestID == "" {
			http.Error(w, "Missing event request ID", http.StatusBadRequest)
			return
		}

		// Manually apply auth middleware to this route
		authMiddleware(func(w http.ResponseWriter, r *http.Request) {
			req, err := adaptRequest(r)
			if err != nil {
				http.Error(w, "Failed to read request", http.StatusBadRequest)
				return
			}

			// Add path parameter for backward compatibility with handlers
			req.PathParameters = map[string]string{
				"id": requestID,
			}

			resp, err := eventH.HandleGetEventRequestByID(context.Background(), req)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			writeResponse(w, resp)
		})(w, r)
	})

	// POST /api/events/update-details - Organizer cập nhật chi tiết sự kiện (KHỚP JAVA)
	http.HandleFunc("/api/events/update-details", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		fmt.Println("=== Received update-details request ===")
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			fmt.Printf("ERROR: Failed to read request: %v\n", err)
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		fmt.Printf("Request body: %s\n", req.Body)
		resp, err := eventH.HandleUpdateEventDetails(context.Background(), req)
		if err != nil {
			fmt.Printf("ERROR: HandleUpdateEventDetails failed: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fmt.Println("SUCCESS: Event updated successfully")
		writeResponse(w, resp)
	}))

	// POST /api/events/update-config - Cập nhật cấu hình check-in/out (ADMIN/ORGANIZER)
	http.HandleFunc("/api/events/update-config", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			fmt.Printf("ERROR: Failed to read request: %v\n", err)
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleUpdateEventConfig(context.Background(), req)
		if err != nil {
			fmt.Printf("ERROR: HandleUpdateEventConfig failed: %v\n", err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/events/config - Lấy cấu hình check-in/out hiện tại
	http.HandleFunc("/api/events/config", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetEventConfig(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/events/stats - Thống kê sự kiện
	http.HandleFunc("/api/events/stats", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetEventStats(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/events/available-areas?startTime=...&endTime=... - Danh sách địa điểm trống
	// 💡 YÊU CẦU #4: Gợi ý địa điểm trống cho Staff khi chọn
	http.HandleFunc("/api/events/available-areas", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleGetAvailableAreas(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// POST /api/organizer/events/cancel - Hủy sự kiện (chỉ Organizer)
	http.HandleFunc("/api/organizer/events/cancel", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleCancelEvent(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/events/daily-quota?date=YYYY-MM-DD - Kiểm tra hạn ngạch hàng ngày
	http.HandleFunc("/api/events/daily-quota", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := eventH.HandleCheckDailyQuota(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ======================= TICKET ROUTES =======================

	// GET /api/registrations/my-tickets - Lấy vé của user
	http.HandleFunc("/api/registrations/my-tickets", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleGetMyTickets(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/tickets/list - Lấy danh sách vé (Staff/Admin)
	http.HandleFunc("/api/tickets/list", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleGetTicketList(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/category-tickets - Lấy loại vé của event
	http.HandleFunc("/api/category-tickets", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleGetCategoryTickets(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/bills/my-bills - Lấy hóa đơn của user
	http.HandleFunc("/api/bills/my-bills", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleGetMyBills(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/payment/my-bills - Lấy hóa đơn của user (KHỚP JAVA)
	http.HandleFunc("/api/payment/my-bills", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleGetMyBills(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/payment-ticket - Tạo URL thanh toán VNPay (KHỚP JAVA)
	http.HandleFunc("/api/payment-ticket", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandlePaymentTicket(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/buyTicket - VNPay return URL (KHỚP JAVA)
	http.HandleFunc("/api/buyTicket", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleBuyTicket(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/wallet/balance - Get user's wallet balance
	http.HandleFunc("/api/wallet/balance", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleGetWalletBalance(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// POST /api/wallet/pay-ticket - Pay ticket with wallet (internal balance)
	http.HandleFunc("/api/wallet/pay-ticket", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := ticketH.HandleWalletPayTicket(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ======================= VENUE ROUTES =======================

	// GET /api/venues - Lấy danh sách venues (CRUD)
	http.HandleFunc("/api/venues", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		var resp events.APIGatewayProxyResponse
		switch r.Method {
		case http.MethodGet:
			resp, err = venueH.HandleGetVenues(context.Background(), req)
		case http.MethodPost:
			resp, err = venueH.HandleCreateVenue(context.Background(), req)
		case http.MethodPut:
			resp, err = venueH.HandleUpdateVenue(context.Background(), req)
		case http.MethodDelete:
			resp, err = venueH.HandleDeleteVenue(context.Background(), req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// /api/venues/areas - CRUD cho Venue Areas (KHỚP JAVA)
	http.HandleFunc("/api/venues/areas", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		var resp events.APIGatewayProxyResponse
		switch r.Method {
		case http.MethodGet:
			resp, err = venueH.HandleGetAreas(context.Background(), req)
		case http.MethodPost:
			resp, err = venueH.HandleCreateArea(context.Background(), req)
		case http.MethodPut:
			resp, err = venueH.HandleUpdateArea(context.Background(), req)
		case http.MethodDelete:
			resp, err = venueH.HandleDeleteArea(context.Background(), req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/areas/free - Lấy khu vực còn trống
	http.HandleFunc("/api/areas/free", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := venueH.HandleGetFreeAreas(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/seats - Lấy danh sách ghế
	http.HandleFunc("/api/seats", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := venueH.HandleGetSeats(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ======================= STAFF ROUTES =======================

	// POST /api/staff/checkin - Check-in vé
	http.HandleFunc("/api/staff/checkin", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := staffH.HandleCheckin(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// POST /api/staff/checkout - Check-out vé
	http.HandleFunc("/api/staff/checkout", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := staffH.HandleCheckout(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/staff/reports - Danh sách report
	http.HandleFunc("/api/staff/reports", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := staffH.HandleGetReports(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// POST /api/staff/reports/process - APPROVE/REJECT report (⭐ REFUND LOGIC)
	reportH := staffHandler.NewReportHandler()
	http.HandleFunc("/api/staff/reports/process", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := reportH.HandleProcessReport(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/staff/reports/detail - Chi tiết report
	http.HandleFunc("/api/staff/reports/detail", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		resp, err := reportH.HandleGetReportDetail(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// GET /api/staff/reports/{id} - Chi tiết report (alternative route)
	http.HandleFunc("/api/staff/reports/", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract report ID from path
		pathParts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/staff/reports/"), "/")
		if len(pathParts) == 0 || pathParts[0] == "" {
			http.Error(w, "Missing report ID", http.StatusBadRequest)
			return
		}

		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		// Add path parameter
		req.PathParameters = map[string]string{
			"id": pathParts[0],
		}

		resp, err := staffH.HandleGetReportDetail(context.Background(), req)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ======================= STUDENT REPORT ROUTES =======================

	// POST /api/student/reports - Submit error report for checked-in ticket
	http.HandleFunc("/api/student/reports", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json;charset=UTF-8")

		// Extract user ID from Context (set by authMiddleware)
		userID, ok := r.Context().Value("userID").(int)
		if !ok || userID <= 0 {
			log.Printf("[ERROR] ReportHandler: Cannot find userID in context")
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, `{"status":"fail","message":"Unauthorized: missing user ID"}`)
			return
		}
		log.Printf("[REPORT] Retrieved userID=%d from Context", userID)

		// Extract user role from Context (set by authMiddleware)
		userRole, ok := r.Context().Value("userRole").(string)
		if !ok || userRole != "STUDENT" {
			log.Printf("[ERROR] ReportHandler: Invalid role. Got: %s", userRole)
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprintf(w, `{"status":"fail","message":"Only students can submit reports"}`)
			return
		}

		// Parse JSON body
		var reportBody struct {
			TicketId    int    `json:"ticketId"`
			Title       string `json:"title"`
			Description string `json:"description"`
			ImageUrl    string `json:"imageUrl"`
		}

		if err := json.NewDecoder(r.Body).Decode(&reportBody); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `{"status":"fail","message":"Invalid JSON"}`)
			return
		}

		log.Printf("[REPORT REQUEST] TicketID: %d | UserID: %d | Title: '%s' | Description: '%s'",
			reportBody.TicketId, userID, reportBody.Title, reportBody.Description)

		// Validate input
		if reportBody.TicketId <= 0 {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `{"status":"fail","message":"Invalid ticketId"}`)
			return
		}

		if strings.TrimSpace(reportBody.Description) == "" {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `{"status":"fail","message":"Description is required"}`)
			return
		}

		// Get database connection
		dbConn := db.GetDB()
		if dbConn == nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintf(w, `{"status":"error","message":"Database connection failed"}`)
			return
		}

		// Verify ticket ownership and check status
		var ticketStatus string
		var ticketUserID int
		checkQuery := `SELECT t.status, t.user_id FROM Ticket t WHERE t.ticket_id = ?`
		err := dbConn.QueryRowContext(context.Background(), checkQuery, reportBody.TicketId).Scan(&ticketStatus, &ticketUserID)
		if err != nil {
			if err == sql.ErrNoRows {
				w.WriteHeader(http.StatusNotFound)
				fmt.Fprintf(w, `{"status":"fail","message":"Ticket not found"}`)
			} else {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintf(w, `{"status":"error","message":"Database error"}`)
			}
			return
		}

		// Verify ticket belongs to the user
		if ticketUserID != userID {
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprintf(w, `{"status":"fail","message":"Ticket does not belong to you"}`)
			return
		}

		// Verify ticket is CHECKED_IN
		log.Printf("[CHECK-IN VERIFY] Ticket status in DB: %s", ticketStatus)
		if ticketStatus != "CHECKED_IN" {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprintf(w, `{"status":"fail","message":"Bạn phải check-in trước khi báo cáo lỗi"}`)
			return
		}
		log.Printf("[CHECK-IN VERIFY] Status is CHECKED_IN -> Valid!")

		// Check for duplicate pending report on same ticket
		var existingCount int
		dupQuery := `SELECT COUNT(*) FROM report WHERE ticket_id = ? AND status = 'PENDING'`
		dbConn.QueryRowContext(context.Background(), dupQuery, reportBody.TicketId).Scan(&existingCount)
		if existingCount > 0 {
			w.WriteHeader(http.StatusConflict)
			fmt.Fprintf(w, `{"status":"fail","message":"This ticket already has a pending report"}`)
			return
		}

		// Insert report into database
		log.Printf("[DB INSERT] Saving report to database...")
		now := time.Now()
		insertQuery := `
			INSERT INTO report (user_id, ticket_id, title, description, image_url, status, created_at)
			VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
		`
		result, err := dbConn.ExecContext(context.Background(), insertQuery,
			userID,
			reportBody.TicketId,
			reportBody.Title,
			reportBody.Description,
			reportBody.ImageUrl,
			now,
		)

		if err != nil {
			log.Printf("[DB INSERT ERROR] %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintf(w, `{"status":"error","message":"Failed to create report"}`)
			return
		}

		reportID, _ := result.LastInsertId()
		log.Printf("[DB INSERT] Report created successfully! Report ID: %d", reportID)

		w.WriteHeader(http.StatusCreated)
		fmt.Fprintf(w, `{"status":"success","message":"Report submitted successfully","reportId":%d}`, reportID)
	}))

	// GET /api/student/reports/pending-ticket-ids - Get list of ticket IDs with pending reports
	http.HandleFunc("/api/student/reports/pending-ticket-ids", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("Content-Type", "application/json;charset=UTF-8")

		// Extract user ID from header
		userIDStr := r.Header.Get("X-User-Id")
		userID := 0
		if userIDStr != "" {
			fmt.Sscanf(userIDStr, "%d", &userID)
		}

		if userID <= 0 {
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, `[]`)
			return
		}

		// Get database connection
		dbConn := db.GetDB()
		if dbConn == nil {
			w.WriteHeader(http.StatusOK)
			fmt.Fprintf(w, `[]`)
			return
		}

		// Query pending ticket IDs
		query := `SELECT DISTINCT ticket_id FROM report WHERE user_id = ? AND status = 'PENDING'`
		rows, err := dbConn.QueryContext(context.Background(), query, userID)
		if err != nil {
			log.Printf("[ERROR] Failed to query pending reports: %v", err)
			w.WriteHeader(http.StatusOK)
			fmt.Fprintf(w, `[]`)
			return
		}
		defer rows.Close()

		var pendingIDs []int
		for rows.Next() {
			var id int
			if err := rows.Scan(&id); err == nil {
				pendingIDs = append(pendingIDs, id)
			}
		}

		// Return as JSON array (empty array if no pending reports)
		data, _ := json.Marshal(pendingIDs)
		w.WriteHeader(http.StatusOK)
		w.Write(data)
	}))

	// ======================= SYSTEM CONFIG ROUTES =======================

	// GET /POST /api/admin/config/system - System config (ADMIN only)
	http.HandleFunc("/api/admin/config/system", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		req, err := adaptRequest(r)
		if err != nil {
			http.Error(w, "Failed to read request", http.StatusBadRequest)
			return
		}

		var resp events.APIGatewayProxyResponse
		switch r.Method {
		case http.MethodGet:
			resp, err = staffH.HandleGetSystemConfig(context.Background(), req)
		case http.MethodPost:
			resp, err = staffH.HandleUpdateSystemConfig(context.Background(), req)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeResponse(w, resp)
	}))

	// ======================= HEALTH CHECK =======================
	http.HandleFunc("/health", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	}))

	// ======================= DEBUG ENDPOINTS (TEST ONLY) =======================
	// Test repository methods without auth
	http.HandleFunc("/api/debug/requests/18", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		// Access database directly to test repository
		queryResult, err := db.GetDB().QueryContext(context.Background(),
			`SELECT request_id, title, status FROM Event_Request WHERE requester_id = 18 LIMIT 5`,
		)
		if err != nil {
			http.Error(w, fmt.Sprintf("Query error: %v", err), http.StatusInternalServerError)
			return
		}
		defer queryResult.Close()

		var results []map[string]interface{}
		for queryResult.Next() {
			var id int
			var title, status string
			queryResult.Scan(&id, &title, &status)
			results = append(results, map[string]interface{}{
				"id": id, "title": title, "status": status,
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"message": "Debug query result",
			"data":    results,
		})
	}))

	// ======================= SWAGGER UI =======================
	// Serve Swagger UI HTML
	http.HandleFunc("/swagger-ui.html", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "swagger-ui.html")
	}))

	// Serve OpenAPI JSON spec
	http.HandleFunc("/openapi.json", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "openapi.json")
	}))

	// Start server
	port := getEnv("PORT", "8080")
	fmt.Printf("\n========================================\n")
	fmt.Printf("🚀 Go Backend running on http://localhost:%s\n", port)
	fmt.Printf("========================================\n")
	fmt.Printf("📚 Swagger UI: http://localhost:%s/swagger-ui.html\n", port)
	fmt.Printf("========================================\n")
	fmt.Printf("Available endpoints (Check-in/Checkout/Reports):\n")
	fmt.Printf("\n📦 Auth Service (19 APIs):\n")
	fmt.Printf("  POST /api/login\n")
	fmt.Printf("  POST /api/register\n")
	fmt.Printf("  POST /api/register/send-otp\n")
	fmt.Printf("  POST /api/register/verify-otp\n")
	fmt.Printf("  POST /api/register/resend-otp\n")
	fmt.Printf("  POST /api/forgot-password\n")
	fmt.Printf("  POST /api/reset-password\n")
	fmt.Printf("  POST /api/admin/create-account\n")
	fmt.Printf("  PUT  /api/admin/create-account\n")
	fmt.Printf("  DELETE /api/admin/create-account\n")
	fmt.Printf("  GET  /api/users/staff-organizer\n")
	fmt.Printf("\n📅 Event Service:\n")
	fmt.Printf("  GET  /api/events            - Get all events\n")
	fmt.Printf("  GET  /api/events/detail?id= - Get event detail\n")
	fmt.Printf("  POST /api/events/update-details - Update event\n")
	fmt.Printf("  POST /api/events/update-config  - Update check-in/out config (Admin/Organizer)\n")
	fmt.Printf("  GET  /api/events/config         - Get check-in/out config\n")
	fmt.Printf("  GET  /api/events/stats      - Get event stats\n")
	fmt.Printf("  GET  /api/events/available-areas?startTime=...&endTime=... - Available areas (Staff)\n")
	fmt.Printf("\n📝 Event Request Service:\n")
	fmt.Printf("  POST /api/event-requests         - Create request\n")
	fmt.Printf("  GET  /api/event-requests/{id}    - Get request detail\n")
	fmt.Printf("  GET  /api/event-requests/my      - My requests\n")
	fmt.Printf("  GET  /api/event-requests/my/active   - My active requests (tab 'Chờ', with pagination)\n")
	fmt.Printf("  GET  /api/event-requests/my/archived - My archived requests (tab 'Đã xử lý', with pagination)\n")
	fmt.Printf("  GET  /api/staff/event-requests   - Staff view requests\n")
	fmt.Printf("  POST /api/event-requests/update  - Update request\n")
	fmt.Printf("  POST /api/event-requests/process - Process request\n")
	fmt.Printf("\n🎫 Ticket & Payment Service:\n")
	fmt.Printf("  GET  /api/registrations/my-tickets - My tickets\n")
	fmt.Printf("  GET  /api/tickets/list             - Ticket list\n")
	fmt.Printf("  GET  /api/payment/my-bills         - My bills\n")
	fmt.Printf("  GET  /api/payment-ticket           - VNPay URL\n")
	fmt.Printf("  GET  /api/buyTicket                - VNPay callback\n")
	fmt.Printf("\n🏢 Venue Service:\n")
	fmt.Printf("  GET/POST/PUT/DELETE /api/venues       - Venue CRUD\n")
	fmt.Printf("  GET/POST/PUT/DELETE /api/venues/areas - Area CRUD\n")
	fmt.Printf("  GET  /api/areas/free                  - Free areas\n")
	fmt.Printf("  GET  /api/seats                       - Seats\n")
	fmt.Printf("\n👷 Staff Service:\n")
	fmt.Printf("  POST /api/staff/checkin            - Check-in\n")
	fmt.Printf("  POST /api/staff/checkout           - Check-out\n")
	fmt.Printf("  GET  /api/staff/reports            - Danh sách report\n")
	fmt.Printf("  GET  /api/staff/reports/detail     - Chi tiết report\n")
	fmt.Printf("  POST /api/staff/reports/process    - ⭐ APPROVE/REJECT report (REFUND)\n")
	fmt.Printf("\n⚙️  System Config (Admin):\n")
	fmt.Printf("  GET  /api/admin/config/system  - Get system config\n")
	fmt.Printf("  POST /api/admin/config/system  - Update system config\n")
	fmt.Printf("\n❤️  Health:\n")
	fmt.Printf("  GET  /health\n")
	fmt.Printf("========================================\n\n")

	// ======================= START SCHEDULER =======================
	// Khởi động scheduled job để tự động giải phóng venue areas khi events kết thúc
	eventCleanup := scheduler.NewEventCleanupScheduler(5) // Chạy mỗi 5 phút
	eventCleanup.Start()
	log.Println("✅ Event cleanup scheduler started (runs every 5 minutes)")

	// Khởi động scheduled job để tự động xóa PENDING tickets sau 5 phút
	// Giống Java backend - release ghế nếu user không hoàn thành thanh toán
	pendingTicketCleanup := scheduler.NewPendingTicketCleanupScheduler(1) // Check mỗi 1 phút
	pendingTicketCleanup.Start()
	log.Println("✅ PENDING ticket cleanup scheduler started (checks every 1 minute, timeout: 5 minutes)")

	// ======================= EXPIRED REQUESTS CLEANUP SCHEDULER =======================
	// Khởi động scheduled job để tự động bãi bỏ sự kiện quá hạn cập nhật
	// Logic: Tìm các sự kiện APPROVED/UPDATING trong vòng 24h trước start_time
	// Hành động: Chuyển trạng thái sang CLOSED + giải phóng địa điểm
	// Tần suất: Chạy mỗi 60 phút (1 giờ)
	expiredRequestsCleanup := scheduler.NewExpiredRequestsCleanupScheduler(60)
	expiredRequestsCleanup.Start()
	log.Println("✅ Expired requests cleanup scheduler started (runs every 60 minutes)")

	// ======================= VENUE RELEASE SCHEDULER =======================
	// Khởi động scheduled job để tự động giải phóng địa điểm khi sự kiện kết thúc
	// Ưu tiên: Chỉ giải phóng các địa điểm thuộc sự kiện đã CLOSED
	// Tần suất: Chạy mỗi 5 phút
	venueReleaseScheduler := scheduler.NewVenueReleaseScheduler(5)
	venueReleaseScheduler.Start()
	log.Println("✅ Venue release scheduler started (runs every 5 minutes)")

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// loadEnvFile loads environment variables from a file
// It tries multiple paths: current directory, executable directory
func loadEnvFile(filename string) {
	var data []byte
	var err error
	var loadedFrom string

	// Try 1: Current working directory
	data, err = os.ReadFile(filename)
	if err == nil {
		loadedFrom = filename
	} else {
		// Try 2: Directory of the executable
		execPath, execErr := os.Executable()
		if execErr == nil {
			execDir := filepath.Dir(execPath)
			envPath := filepath.Join(execDir, filename)
			data, err = os.ReadFile(envPath)
			if err == nil {
				loadedFrom = envPath
			}
		}
	}

	if err != nil {
		log.Printf("No .env file found in current directory or executable directory, using system environment variables")
		return
	}

	lines := strings.Split(string(data), "\n")
	count := 0
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Skip comments and empty lines
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Split on first =
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}

		key := strings.TrimSpace(parts[0])
		value := strings.TrimSpace(parts[1])
		// Remove quotes if present
		value = strings.Trim(value, `"'`)

		os.Setenv(key, value)
		count++
	}
	log.Printf("Loaded %d environment variables from %s", count, loadedFrom)
}

// getEnv gets environment variable with default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
