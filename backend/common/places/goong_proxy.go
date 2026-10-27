package places

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// ============================================================
// Goong.io Rate Limiter & Security Proxy
// Enforces:
// 1. Global Daily Cap: Max 700 reqs/day (reserves 30% monthly buffer)
// 2. Global Hourly Cap: Max 100 reqs/hour
// 3. Global Rate Limit: Max 4 RPS (prevents Goong 429 errors)
// 4. Per-User Speed: Max 1 req / 2 seconds
// 5. Per-User Daily: Max 30 reqs/day (24h block on abuse)
// 6. In-Memory Query Caching (1 hour TTL)
// ============================================================

type UserThrottle struct {
	Limiter      *rate.Limiter
	DailyCount   int
	LastResetDay int
	BlockedUntil time.Time
}

type CacheItem struct {
	Data      []byte
	ExpiresAt time.Time
}

type GoongProxy struct {
	mu sync.RWMutex

	// Global limits
	globalRpsLimiter *rate.Limiter
	dailyCount       int
	currentDay       int
	hourlyCount      int
	currentHour      int

	// Per-user / IP tracking
	users map[string]*UserThrottle

	// In-memory query cache
	cache map[string]CacheItem

	// HTTP Client
	client *http.Client
}

var (
	instance *GoongProxy
	once     sync.Once
)

const (
	MaxGlobalDailyRequests  = 700
	MaxGlobalHourlyRequests = 100
	MaxUserDailyRequests    = 30
	UserBlockDuration       = 24 * time.Hour
)

// GetProxy returns singleton instance of GoongProxy
func GetProxy() *GoongProxy {
	once.Do(func() {
		instance = &GoongProxy{
			globalRpsLimiter: rate.NewLimiter(rate.Limit(4), 4), // Max 4 RPS
			users:            make(map[string]*UserThrottle),
			cache:            make(map[string]CacheItem),
			client:           &http.Client{Timeout: 4 * time.Second},
		}
	})
	return instance
}

// GetClientIdentifier extracts user ID from header (if authed) or client IP
func GetClientIdentifier(r *http.Request) string {
	userID := r.Header.Get("X-User-Id")
	if userID != "" {
		return "user:" + userID
	}

	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		parts := strings.Split(forwarded, ",")
		return "ip:" + strings.TrimSpace(parts[0])
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return "ip:" + host
	}

	return "ip:" + r.RemoteAddr
}

// CheckLimit checks both global and per-user limits.
// Returns (allowed bool, fallback bool, statusCode int, message string)
func (p *GoongProxy) CheckLimit(clientID string) (bool, bool, int, string) {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := time.Now().In(time.Local)
	today := now.YearDay()
	hour := now.Hour()

	// 1. Reset Global Daily counter if new day
	if p.currentDay != today {
		p.currentDay = today
		p.dailyCount = 0
		log.Printf("[GOONG-PROXY] Daily quota reset. Counter: 0/%d", MaxGlobalDailyRequests)
	}

	// 2. Reset Global Hourly counter if new hour
	if p.currentHour != hour {
		p.currentHour = hour
		p.hourlyCount = 0
	}

	// 3. Check Global Daily Cap (700) -> Triggers graceful fallback
	if p.dailyCount >= MaxGlobalDailyRequests {
		return false, true, http.StatusOK, "Hệ thống đã đạt giới hạn tra cứu tự động hôm nay (700 lượt). Vui lòng nhập tay địa chỉ."
	}

	// 4. Check Global Hourly Cap (100) -> Triggers graceful fallback
	if p.hourlyCount >= MaxGlobalHourlyRequests {
		return false, true, http.StatusOK, "Hệ thống đang trong giờ cao điểm đạt giới hạn tra cứu tạm thời. Vui lòng nhập tay địa chỉ."
	}

	// 5. Check Global RPS (Max 4 RPS)
	if !p.globalRpsLimiter.Allow() {
		return false, false, http.StatusTooManyRequests, "Hệ thống đang xử lý nhiều lượt tra cứu. Vui lòng đợi trong giây lát."
	}

	// 6. Check Per-User Tracking
	u, exists := p.users[clientID]
	if !exists {
		u = &UserThrottle{
			Limiter:      rate.NewLimiter(rate.Every(2*time.Second), 1), // Max 1 req / 2s
			DailyCount:   0,
			LastResetDay: today,
		}
		p.users[clientID] = u
	}

	// Reset user daily count if new day
	if u.LastResetDay != today {
		u.LastResetDay = today
		u.DailyCount = 0
		u.BlockedUntil = time.Time{}
	}

	// Check if user is currently blocked (24h ban)
	if !u.BlockedUntil.IsZero() && now.Before(u.BlockedUntil) {
		return false, false, http.StatusTooManyRequests, "Bạn đã thực hiện quá nhiều thao tác tìm kiếm địa chỉ. Vui lòng thử lại sau."
	}

	// Check user typing speed (Max 1 req / 2s)
	if !u.Limiter.Allow() {
		return false, false, http.StatusTooManyRequests, "Vui lòng thao tác chậm lại (tối đa 1 yêu cầu / 2 giây)."
	}

	// Check user daily quota (Max 30)
	if u.DailyCount >= MaxUserDailyRequests {
		u.BlockedUntil = now.Add(UserBlockDuration)
		log.Printf("[GOONG-PROXY] [SECURITY] Client %s exceeded daily limit of %d. Blocked for 24h.", clientID, MaxUserDailyRequests)
		return false, false, http.StatusTooManyRequests, "Bạn đã thực hiện quá nhiều thao tác tìm kiếm địa chỉ. Vui lòng thử lại sau."
	}

	// Passed all checks!
	p.dailyCount++
	p.hourlyCount++
	u.DailyCount++

	return true, false, http.StatusOK, ""
}

// GetCached returns cached response if valid
func (p *GoongProxy) GetCached(key string) ([]byte, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	item, found := p.cache[key]
	if !found || time.Now().After(item.ExpiresAt) {
		return nil, false
	}
	return item.Data, true
}

// SetCached stores query result for 1 hour
func (p *GoongProxy) SetCached(key string, data []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.cache[key] = CacheItem{
		Data:      data,
		ExpiresAt: time.Now().Add(1 * time.Hour),
	}
}

// HandleAutocomplete processes /api/v1/places/autocomplete
func HandleAutocomplete(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	query := strings.TrimSpace(r.URL.Query().Get("input"))

	// 1. Min-length validation (at least 3 characters)
	if len([]rune(query)) < 3 {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"predictions": []interface{}{},
			"message":     "Nhập tối thiểu 3 ký tự để tìm kiếm địa điểm",
		})
		return
	}

	proxy := GetProxy()
	cacheKey := "autocomplete:" + strings.ToLower(query)

	// 2. Check in-memory cache first (0 Goong API calls consumed!)
	if cachedData, found := proxy.GetCached(cacheKey); found {
		w.Header().Set("X-Cache", "HIT")
		w.WriteHeader(http.StatusOK)
		w.Write(cachedData)
		return
	}

	// 3. Security & Throttling verification
	clientID := GetClientIdentifier(r)
	allowed, isFallback, statusCode, errMsg := proxy.CheckLimit(clientID)

	if isFallback {
		// Daily cap reached -> Tell client to switch to manual textbox
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"fallback":    true,
			"message":     errMsg,
			"predictions": []interface{}{},
		})
		return
	}

	if !allowed {
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "RATE_LIMIT_EXCEEDED",
			"message": errMsg,
		})
		return
	}

	// 4. Retrieve Goong API Key from env
	apiKey := strings.TrimSpace(os.Getenv("GOONG_API_KEY"))
	if apiKey == "" {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"fallback":    true,
			"message":     "Goong API key chưa được cấu hình trên hệ thống. Vui lòng nhập tay địa chỉ.",
			"predictions": []interface{}{},
		})
		return
	}

	// 5. Query Goong Place AutoComplete API
	goongURL := fmt.Sprintf("https://rsapi.goong.io/Place/AutoComplete?api_key=%s&input=%s",
		url.QueryEscape(apiKey),
		url.QueryEscape(query),
	)

	resp, err := proxy.client.Get(goongURL)
	if err != nil {
		log.Printf("[GOONG-PROXY] [ERROR] Upstream call failed: %v", err)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"fallback":    true,
			"message":     "Không thể kết nối máy chủ bản đồ Goong. Vui lòng nhập tay địa chỉ.",
			"predictions": []interface{}{},
		})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode != http.StatusOK {
		log.Printf("[GOONG-PROXY] Upstream status: %d", resp.StatusCode)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"fallback":    true,
			"message":     "Dịch vụ Goong trả lời lỗi. Vui lòng nhập tay địa chỉ.",
			"predictions": []interface{}{},
		})
		return
	}

	// 6. Cache and return response
	proxy.SetCached(cacheKey, body)
	w.Header().Set("X-Cache", "MISS")
	w.WriteHeader(http.StatusOK)
	w.Write(body)
}

// HandlePlaceDetail processes /api/v1/places/detail?place_id=...
func HandlePlaceDetail(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	placeID := strings.TrimSpace(r.URL.Query().Get("place_id"))
	if placeID == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "place_id is required"})
		return
	}

	proxy := GetProxy()
	cacheKey := "detail:" + placeID

	if cachedData, found := proxy.GetCached(cacheKey); found {
		w.Header().Set("X-Cache", "HIT")
		w.WriteHeader(http.StatusOK)
		w.Write(cachedData)
		return
	}

	apiKey := strings.TrimSpace(os.Getenv("GOONG_API_KEY"))
	if apiKey == "" {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "NOT_CONFIGURED"})
		return
	}

	goongURL := fmt.Sprintf("https://rsapi.goong.io/Place/Detail?api_key=%s&place_id=%s",
		url.QueryEscape(apiKey),
		url.QueryEscape(placeID),
	)

	resp, err := proxy.client.Get(goongURL)
	if err != nil {
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	proxy.SetCached(cacheKey, body)
	w.Header().Set("X-Cache", "MISS")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

// HandleQuotaStatus returns current quota usage metrics (Admin/Internal dashboard)
func HandleQuotaStatus(w http.ResponseWriter, r *http.Request) {
	proxy := GetProxy()
	proxy.mu.RLock()
	defer proxy.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"dailyCount":              proxy.dailyCount,
		"maxDailyCap":             MaxGlobalDailyRequests,
		"hourlyCount":             proxy.hourlyCount,
		"maxHourlyCap":            MaxGlobalHourlyRequests,
		"globalRpsLimit":          4,
		"userTypingIntervalLimit": "1 req / 2s",
		"userDailyCap":            MaxUserDailyRequests,
		"activeTrackedClients":    len(proxy.users),
		"cachedQueryCount":        len(proxy.cache),
	})
}
