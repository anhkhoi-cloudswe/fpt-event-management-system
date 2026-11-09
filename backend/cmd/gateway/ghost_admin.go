package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/timeutil"
)

const RootAdminEmail = "nguyenanhkhoi2212@gmail.com"

// SupervisedUser defines an account under surveillance
type SupervisedUser struct {
	ID        int64  `json:"id"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	SafeMode  bool   `json:"safeMode"` // whether fake-success is active
	CreatedAt string `json:"createdAt"`
}

// RequestLog represents an individual API request
type RequestLog struct {
	ID        int64  `json:"id"`
	Timestamp string `json:"timestamp"`
	Method    string `json:"method"`
	Path      string `json:"path"`
	Query     string `json:"query,omitempty"`
	Body      string `json:"body,omitempty"`
	ClientIP  string `json:"clientIP"`
	UserAgent string `json:"userAgent"`
	Status    string `json:"status"` // "BLOCKED_SAFE_MODE" or "PASSED_READONLY" or "PASSED_WRITE"
	Message   string `json:"message"`
}

// PageVisitSession groups all API calls made during a page visit
type PageVisitSession struct {
	ID           string       `json:"id"`
	UserEmail    string       `json:"userEmail"`
	UserName     string       `json:"userName"`
	UserID       int64        `json:"userId"`
	UserRole     string       `json:"userRole"`
	PageUrl      string       `json:"pageUrl"`  // e.g., "/dashboard/reports"
	PageName     string       `json:"pageName"` // e.g., "Báo cáo & Thống kê"
	StartTime    string       `json:"startTime"`
	LastActive   string       `json:"lastActive"`
	ClientIP     string       `json:"clientIP"`
	UserAgent    string       `json:"userAgent"`
	TotalCalls   int          `json:"totalCalls"`
	BlockedCalls int          `json:"blockedCalls"`
	Requests     []RequestLog `json:"requests"`
}

type GhostAdminConfig struct {
	SupervisedUsers []SupervisedUser `json:"supervisedUsers"`
}

type GhostAdminService struct {
	mu             sync.RWMutex
	dbConn         *sql.DB
	configFilePath string
	logFilePath    string
	users          map[string]*SupervisedUser // keyed by lower-case email
	sessions       []*PageVisitSession
	maxSessions    int

	// ✈️ Flight Recorder (Rolling Blackbox) for all authenticated users
	// Keyed by lowercase email -> list of rolling sessions
	blackbox           map[string][]*PageVisitSession
	maxBlackboxPerUser int
}

var ghostAdmin *GhostAdminService

func initGhostAdmin() {
	logsDir := filepath.Join(".", "logs")
	_ = os.MkdirAll(logsDir, 0755)

	cfgPath := filepath.Join(logsDir, "ghost_admin_config.json")
	logPath := filepath.Join(logsDir, "ghost_admin_sessions.json")

	// Attempt to connect to database for persistent cloud storage
	var sqlDB *sql.DB
	if dbPool, err := db.InitServiceDB("Gateway"); err == nil && dbPool != nil {
		sqlDB = dbPool
		log.Println("[GHOST_ADMIN] Database connection established. Persistent storage enabled.")
		// Ensure table exists
		_, _ = sqlDB.Exec(`
			CREATE TABLE IF NOT EXISTS ghost_admin_storage (
				storage_id INT PRIMARY KEY DEFAULT 1,
				supervised_users JSONB NOT NULL DEFAULT '[]'::jsonb,
				sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
				updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
			)
		`)
	} else {
		log.Printf("[GHOST_ADMIN] Database connection skipped or unavailable (%v). Using local file fallback.", err)
	}

	ghostAdmin = &GhostAdminService{
		dbConn:             sqlDB,
		configFilePath:     cfgPath,
		logFilePath:        logPath,
		users:              make(map[string]*SupervisedUser),
		sessions:           make([]*PageVisitSession, 0),
		maxSessions:        200,
		blackbox:           make(map[string][]*PageVisitSession),
		maxBlackboxPerUser: 50, // Keep last 50 page visit sessions per user
	}

	ghostAdmin.loadConfig()
	ghostAdmin.loadSessions()
	log.Printf("[GHOST_ADMIN] Service initialized. %d supervised users loaded.", len(ghostAdmin.users))
}

func (s *GhostAdminService) loadConfig() {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Default fallback: admin.event@fpt.edu.vn
	s.users["admin.event@fpt.edu.vn"] = &SupervisedUser{
		ID:        5,
		Email:     "admin.event@fpt.edu.vn",
		Name:      "Quản trị hệ thống",
		Role:      "ADMIN",
		SafeMode:  true,
		CreatedAt: timeutil.GetNow().Format(time.RFC3339),
	}

	// 1. Try loading from Database JSONB first if available
	if s.dbConn != nil {
		var usersJSON []byte
		err := s.dbConn.QueryRow("SELECT supervised_users FROM ghost_admin_storage WHERE storage_id = 1").Scan(&usersJSON)
		if err == nil && len(usersJSON) > 0 {
			var dbUsers []SupervisedUser
			if jsonErr := json.Unmarshal(usersJSON, &dbUsers); jsonErr == nil && len(dbUsers) > 0 {
				s.users = make(map[string]*SupervisedUser)
				for _, u := range dbUsers {
					emailLower := strings.ToLower(strings.TrimSpace(u.Email))
					userCopy := u
					s.users[emailLower] = &userCopy
				}
				log.Printf("[GHOST_ADMIN] Loaded %d supervised users from database.", len(s.users))
				return
			}
		}
	}

	// 2. Fallback to local config file
	data, err := os.ReadFile(s.configFilePath)
	if err != nil {
		return
	}
	var cfg GhostAdminConfig
	if err := json.Unmarshal(data, &cfg); err == nil && len(cfg.SupervisedUsers) > 0 {
		s.users = make(map[string]*SupervisedUser)
		for _, u := range cfg.SupervisedUsers {
			emailLower := strings.ToLower(strings.TrimSpace(u.Email))
			userCopy := u
			s.users[emailLower] = &userCopy
		}
	}
}

func (s *GhostAdminService) saveConfig() {
	userList := make([]SupervisedUser, 0, len(s.users))
	for _, u := range s.users {
		userList = append(userList, *u)
	}
	cfg := GhostAdminConfig{SupervisedUsers: userList}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err == nil {
		_ = os.WriteFile(s.configFilePath, data, 0644)
	}

	// Persist to DB JSONB
	if s.dbConn != nil {
		usersJSON, mErr := json.Marshal(userList)
		if mErr == nil {
			_, dbErr := s.dbConn.Exec(`
				INSERT INTO ghost_admin_storage (storage_id, supervised_users, updated_at)
				VALUES (1, $1, CURRENT_TIMESTAMP)
				ON CONFLICT (storage_id) DO UPDATE
				SET supervised_users = EXCLUDED.supervised_users, updated_at = CURRENT_TIMESTAMP
			`, string(usersJSON))
			if dbErr != nil {
				log.Printf("[GHOST_ADMIN] Error persisting config to database: %v", dbErr)
			}
		}
	}
}

func (s *GhostAdminService) loadSessions() {
	// 1. Try loading from Database JSONB first if available
	if s.dbConn != nil {
		var sessionsJSON []byte
		err := s.dbConn.QueryRow("SELECT sessions FROM ghost_admin_storage WHERE storage_id = 1").Scan(&sessionsJSON)
		if err == nil && len(sessionsJSON) > 0 {
			var dbSessions []*PageVisitSession
			if jsonErr := json.Unmarshal(sessionsJSON, &dbSessions); jsonErr == nil {
				s.sessions = dbSessions
				log.Printf("[GHOST_ADMIN] Loaded %d sessions from database.", len(s.sessions))
				return
			}
		}
	}

	// 2. Fallback to local file
	data, err := os.ReadFile(s.logFilePath)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &s.sessions)
}

func (s *GhostAdminService) saveSessions() {
	data, err := json.MarshalIndent(s.sessions, "", "  ")
	if err == nil {
		_ = os.WriteFile(s.logFilePath, data, 0644)
	}

	// Persist to DB JSONB
	if s.dbConn != nil {
		sessionsJSON, mErr := json.Marshal(s.sessions)
		if mErr == nil {
			_, dbErr := s.dbConn.Exec(`
				INSERT INTO ghost_admin_storage (storage_id, sessions, updated_at)
				VALUES (1, $1, CURRENT_TIMESTAMP)
				ON CONFLICT (storage_id) DO UPDATE
				SET sessions = EXCLUDED.sessions, updated_at = CURRENT_TIMESTAMP
			`, string(sessionsJSON))
			if dbErr != nil {
				log.Printf("[GHOST_ADMIN] Error persisting sessions to database: %v", dbErr)
			}
		}
	}
}

func derivePageInfo(path string, referer string) (string, string) {
	pageUrl := "/dashboard"
	if referer != "" {
		if u, err := http.NewRequest("GET", referer, nil); err == nil {
			if strings.HasPrefix(u.URL.Path, "/dashboard") {
				pageUrl = u.URL.Path
			}
		}
	}

	switch {
	case strings.Contains(pageUrl, "reports") || strings.Contains(path, "report") || strings.Contains(path, "financial-overview"):
		return "/dashboard/reports", "Báo Cáo & Thống Kê"
	case strings.Contains(pageUrl, "finance") || strings.Contains(path, "finance") || strings.Contains(path, "payouts"):
		return "/dashboard/admin/finance", "Tài Chính & Quyết Toán"
	case strings.Contains(pageUrl, "system-config") || strings.Contains(path, "system-parameters"):
		return "/dashboard/system-config", "Cấu Hình Hệ Thống"
	case strings.Contains(pageUrl, "manage") || strings.Contains(path, "users") || strings.Contains(path, "organization"):
		return "/dashboard/manage", "Quản Lý Nhân Sự & Đơn Vị"
	case strings.Contains(pageUrl, "venues") || strings.Contains(path, "venues"):
		return "/dashboard/venues", "Quản Lý Địa Điểm"
	case strings.Contains(pageUrl, "events") || strings.Contains(path, "events"):
		return "/dashboard/events", "Quản Lý Sự Kiện"
	case strings.Contains(pageUrl, "profile") || strings.Contains(path, "profile"):
		return "/dashboard/profile", "Hồ Sơ Cá Nhân"
	default:
		return pageUrl, "Trang Tổng Quan Dashboard"
	}
}

// RecordActivity records requests for active supervised users (persisted to sessions)
func (s *GhostAdminService) RecordActivity(user *SupervisedUser, r *http.Request, reqLog RequestLog) {
	s.mu.Lock()
	defer s.mu.Unlock()

	referer := r.Header.Get("Referer")
	pageUrl, pageName := derivePageInfo(r.URL.Path, referer)
	now := timeutil.GetNow().Format(time.RFC3339)

	var currentSession *PageVisitSession
	if len(s.sessions) > 0 {
		last := s.sessions[0]
		if strings.EqualFold(last.UserEmail, user.Email) && last.PageUrl == pageUrl {
			currentSession = last
		}
	}

	if currentSession == nil {
		currentSession = &PageVisitSession{
			ID:           fmt.Sprintf("sess_%d", timeutil.GetNow().UnixNano()),
			UserEmail:    user.Email,
			UserName:     user.Name,
			UserID:       user.ID,
			UserRole:     user.Role,
			PageUrl:      pageUrl,
			PageName:     pageName,
			StartTime:    now,
			LastActive:   now,
			ClientIP:     reqLog.ClientIP,
			UserAgent:    reqLog.UserAgent,
			TotalCalls:   0,
			BlockedCalls: 0,
			Requests:     make([]RequestLog, 0),
		}
		s.sessions = append([]*PageVisitSession{currentSession}, s.sessions...)
		if len(s.sessions) > s.maxSessions {
			s.sessions = s.sessions[:s.maxSessions]
		}
	}

	currentSession.LastActive = now
	currentSession.TotalCalls++
	if reqLog.Status == "BLOCKED_SAFE_MODE" {
		currentSession.BlockedCalls++
	}
	currentSession.Requests = append([]RequestLog{reqLog}, currentSession.Requests...)

	s.saveSessions()
}

// RecordBlackboxActivity saves rolling background history for ANY logged-in user
func (s *GhostAdminService) RecordBlackboxActivity(userId int64, email, name, role string, r *http.Request, reqLog RequestLog) {
	s.mu.Lock()
	defer s.mu.Unlock()

	emailLower := strings.ToLower(strings.TrimSpace(email))
	if emailLower == "" {
		return
	}

	userSessions := s.blackbox[emailLower]
	referer := r.Header.Get("Referer")
	pageUrl, pageName := derivePageInfo(r.URL.Path, referer)
	now := timeutil.GetNow().Format(time.RFC3339)

	var currentSession *PageVisitSession
	if len(userSessions) > 0 {
		last := userSessions[0]
		if last.PageUrl == pageUrl {
			currentSession = last
		}
	}

	if currentSession == nil {
		displayName := name
		if displayName == "" {
			displayName = emailLower
		}
		currentSession = &PageVisitSession{
			ID:           fmt.Sprintf("bb_%d", timeutil.GetNow().UnixNano()),
			UserEmail:    emailLower,
			UserName:     displayName,
			UserID:       userId,
			UserRole:     role,
			PageUrl:      pageUrl,
			PageName:     pageName,
			StartTime:    now,
			LastActive:   now,
			ClientIP:     reqLog.ClientIP,
			UserAgent:    reqLog.UserAgent,
			TotalCalls:   0,
			BlockedCalls: 0,
			Requests:     make([]RequestLog, 0),
		}
		userSessions = append([]*PageVisitSession{currentSession}, userSessions...)
		if len(userSessions) > s.maxBlackboxPerUser {
			userSessions = userSessions[:s.maxBlackboxPerUser]
		}
	}

	currentSession.LastActive = now
	currentSession.TotalCalls++
	currentSession.Requests = append([]RequestLog{reqLog}, currentSession.Requests...)

	s.blackbox[emailLower] = userSessions
}

// ImportBlackboxToSessions transfers all historical recorded actions into active supervision sessions
func (s *GhostAdminService) ImportBlackboxToSessions(email string, targetUser *SupervisedUser) int {
	emailLower := strings.ToLower(strings.TrimSpace(email))
	history, exists := s.blackbox[emailLower]
	if !exists || len(history) == 0 {
		return 0
	}

	// Update user details in historical sessions if needed
	for _, sess := range history {
		if targetUser != nil {
			if sess.UserName == "" || sess.UserName == sess.UserEmail {
				sess.UserName = targetUser.Name
			}
			sess.UserID = targetUser.ID
			sess.UserRole = targetUser.Role
		}
	}

	// Prepend historical sessions into main sessions list
	s.sessions = append(history, s.sessions...)
	if len(s.sessions) > s.maxSessions {
		s.sessions = s.sessions[:s.maxSessions]
	}

	// Remove from blackbox since now directly supervised
	delete(s.blackbox, emailLower)
	s.saveSessions()
	return len(history)
}

// RegisterGhostAdminRoutes mounts REST CRUD & Monitor endpoints
func RegisterGhostAdminRoutes(mux *http.ServeMux) {
	// Endpoint to fetch system users for dropdown
	mux.HandleFunc("/api/internal/ghost-mode/system-users", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userEmail := r.Header.Get("X-User-Email")
		if !strings.EqualFold(userEmail, RootAdminEmail) {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized"})
			return
		}

		authHeader := r.Header.Get("Authorization")
		req, err := http.NewRequest("GET", "http://auth-service:8081/api/users/staff-organizer", nil)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		if authHeader != "" {
			req.Header.Set("Authorization", authHeader)
		}
		req.Header.Set("X-User-Email", userEmail)
		req.Header.Set("X-User-Role", "ADMIN")

		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Failed to connect to auth-service"})
			return
		}
		defer resp.Body.Close()

		w.WriteHeader(resp.StatusCode)
		_, _ = io.Copy(w, resp.Body)
	})

	// Get Supervised Users List
	mux.HandleFunc("/api/internal/ghost-mode/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userEmail := r.Header.Get("X-User-Email")
		if !strings.EqualFold(userEmail, RootAdminEmail) {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized"})
			return
		}

		ghostAdmin.mu.RLock()
		userList := make([]SupervisedUser, 0, len(ghostAdmin.users))
		for _, u := range ghostAdmin.users {
			userList = append(userList, *u)
		}
		ghostAdmin.mu.RUnlock()

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"rootAdminEmail":  RootAdminEmail,
			"supervisedUsers": userList,
		})
	})

	// Toggle Safe Mode for a target
	mux.HandleFunc("/api/internal/ghost-mode/toggle", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userEmail := r.Header.Get("X-User-Email")
		if !strings.EqualFold(userEmail, RootAdminEmail) {
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "Unauthorized"})
			return
		}

		var body struct {
			Email    string `json:"email"`
			SafeMode bool   `json:"safeMode"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		ghostAdmin.mu.Lock()
		targetLower := strings.ToLower(strings.TrimSpace(body.Email))
		if u, exists := ghostAdmin.users[targetLower]; exists {
			u.SafeMode = body.SafeMode
			ghostAdmin.saveConfig()
		}
		ghostAdmin.mu.Unlock()

		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Updated successfully"})
	})

	// Add new target to supervision - Automatically imports historical Blackbox logs!
	mux.HandleFunc("/api/internal/ghost-mode/add-user", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userEmail := r.Header.Get("X-User-Email")
		if !strings.EqualFold(userEmail, RootAdminEmail) {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		var body SupervisedUser
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		body.Email = strings.ToLower(strings.TrimSpace(body.Email))
		body.SafeMode = true
		body.CreatedAt = timeutil.GetNow().Format(time.RFC3339)

		ghostAdmin.mu.Lock()
		ghostAdmin.users[body.Email] = &body
		ghostAdmin.saveConfig()
		importedCount := ghostAdmin.ImportBlackboxToSessions(body.Email, &body)
		ghostAdmin.mu.Unlock()

		log.Printf("[GHOST_ADMIN] Added user %s to supervision. Imported %d past sessions from Blackbox cache.", body.Email, importedCount)

		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":        true,
			"user":           body,
			"importedPast":   importedCount,
		})
	})

	// Remove target from supervision
	mux.HandleFunc("/api/internal/ghost-mode/remove-user", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userEmail := r.Header.Get("X-User-Email")
		if !strings.EqualFold(userEmail, RootAdminEmail) {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		var body struct {
			Email string `json:"email"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)

		ghostAdmin.mu.Lock()
		delete(ghostAdmin.users, strings.ToLower(strings.TrimSpace(body.Email)))
		ghostAdmin.saveConfig()
		ghostAdmin.mu.Unlock()

		_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true})
	})

	// Get Sessions & Clear
	mux.HandleFunc("/api/internal/ghost-mode/sessions", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		userEmail := r.Header.Get("X-User-Email")
		if !strings.EqualFold(userEmail, RootAdminEmail) {
			w.WriteHeader(http.StatusForbidden)
			return
		}

		if r.Method == http.MethodDelete {
			ghostAdmin.mu.Lock()
			ghostAdmin.sessions = make([]*PageVisitSession, 0)
			ghostAdmin.saveSessions()
			ghostAdmin.mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Sessions cleared"})
			return
		}

		ghostAdmin.mu.RLock()
		defer ghostAdmin.mu.RUnlock()
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"count":    len(ghostAdmin.sessions),
			"sessions": ghostAdmin.sessions,
		})
	})
}

// InterceptReviewerRequest intercepts requests:
// 1. If user is supervised: applies Safe Mode (fake 200) and records into active sessions.
// 2. If user is NOT supervised: silently records rolling Blackbox history so past actions can be recovered!
func InterceptReviewerRequest(w http.ResponseWriter, r *http.Request) bool {
	userEmail := strings.ToLower(strings.TrimSpace(r.Header.Get("X-User-Email")))
	if userEmail == "" {
		return false
	}

	ghostAdmin.mu.RLock()
	targetUser, isSupervised := ghostAdmin.users[userEmail]
	ghostAdmin.mu.RUnlock()

	clientIP := r.Header.Get("X-Forwarded-For")
	if clientIP == "" {
		clientIP = r.RemoteAddr
	}
	userAgent := r.Header.Get("User-Agent")

	var bodyBytes []byte
	if r.Body != nil {
		bodyBytes, _ = io.ReadAll(r.Body)
		r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	}

	bodyStr := ""
	if len(bodyBytes) > 0 {
		if len(bodyBytes) > 1000 {
			bodyStr = string(bodyBytes[:1000]) + "... (truncated)"
		} else {
			bodyStr = string(bodyBytes)
		}
	}

	isAuthEssential := strings.HasPrefix(r.URL.Path, "/api/v1/auth/login") ||
		strings.HasPrefix(r.URL.Path, "/api/login") ||
		strings.HasPrefix(r.URL.Path, "/api/logout") ||
		strings.HasPrefix(r.URL.Path, "/api/auth/logout") ||
		strings.HasPrefix(r.URL.Path, "/api/auth/refresh") ||
		strings.HasPrefix(r.URL.Path, "/api/auth/me") ||
		strings.HasPrefix(r.URL.Path, "/api/v1/auth/me")

	isWriteMethod := r.Method == http.MethodPost ||
		r.Method == http.MethodPut ||
		r.Method == http.MethodDelete ||
		r.Method == http.MethodPatch

	reqLog := RequestLog{
		ID:        timeutil.GetNow().UnixNano(),
		Timestamp: timeutil.GetNow().Format(time.RFC3339),
		Method:    r.Method,
		Path:      r.URL.Path,
		Query:     r.URL.RawQuery,
		Body:      bodyStr,
		ClientIP:  clientIP,
		UserAgent: userAgent,
	}

	// Case 1: USER IS UNDER ACTIVE SUPERVISION
	if isSupervised {
		if targetUser.SafeMode && isWriteMethod && !isAuthEssential {
			reqLog.Status = "BLOCKED_SAFE_MODE"
			reqLog.Message = "Thao tác ghi/sửa đã bị chặn âm thầm. Trả về Fake 200 OK."
			ghostAdmin.RecordActivity(targetUser, r, reqLog)

			log.Printf("[GHOST_ADMIN] 🛡️ BLOCKED WRITE from %s: %s %s -> FAKE SUCCESS", userEmail, r.Method, r.URL.Path)

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"success": true,
				"status":  "success",
				"message": "Thao tác thực hiện thành công",
				"data":    nil,
			})
			return true
		}

		if isWriteMethod {
			reqLog.Status = "PASSED_WRITE"
			reqLog.Message = "Thao tác ghi được thực hiện thực tế (Safe Mode tắt)"
		} else {
			reqLog.Status = "PASSED_READONLY"
			reqLog.Message = "Xem dữ liệu bình thường"
		}
		ghostAdmin.RecordActivity(targetUser, r, reqLog)
		return false
	}

	// Case 2: USER NOT YET SUPERVISED -> RECORD INTO ROLLING BLACKBOX FLIGHT RECORDER
	// Skip internal monitoring polling endpoints to avoid spamming the blackbox
	if !strings.HasPrefix(r.URL.Path, "/api/internal/ghost-mode/") && !strings.HasPrefix(r.URL.Path, "/api/health") {
		userId, _ := strconv.ParseInt(r.Header.Get("X-User-Id"), 10, 64)
		userName := r.Header.Get("X-User-Name")
		userRole := r.Header.Get("X-User-Role")

		if isWriteMethod {
			reqLog.Status = "PASSED_WRITE"
			reqLog.Message = "Thao tác ghi bình thường trước thời điểm giám sát"
		} else {
			reqLog.Status = "PASSED_READONLY"
			reqLog.Message = "Xem dữ liệu trước thời điểm giám sát"
		}

		ghostAdmin.RecordBlackboxActivity(userId, userEmail, userName, userRole, r, reqLog)
	}

	return false
}
