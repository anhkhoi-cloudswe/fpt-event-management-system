package ga4

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ServiceAccountCredentials matches Google's service account JSON key file
type ServiceAccountCredentials struct {
	Type                    string `json:"type"`
	ProjectID               string `json:"project_id"`
	PrivateKeyID            string `json:"private_key_id"`
	PrivateKey              string `json:"private_key"`
	ClientEmail             string `json:"client_email"`
	ClientID                string `json:"client_id"`
	TokenURI                string `json:"token_uri"`
	AuthProviderX509CertURL string `json:"auth_provider_x509_cert_url"`
	ClientX509CertURL       string `json:"client_x509_cert_url"`
}

// Data models matching frontend expectations
type GA4Summary struct {
	PageViews   int     `json:"pageViews"`
	ActiveUsers int     `json:"activeUsers"`
	Sessions    int     `json:"sessions"`
	BounceRate  float64 `json:"bounceRate"`
	Conversions int     `json:"conversions"`
}

type GA4TimelinePoint struct {
	Date        string `json:"date"` // YYYYMMDD or YYYY-MM-DD
	PageViews   int    `json:"pageViews"`
	ActiveUsers int    `json:"activeUsers"`
}

type GA4DeviceBreakdown struct {
	Device string `json:"device"`
	Users  int    `json:"users"`
}

type GA4TrafficSource struct {
	Source string `json:"source"`
	Users  int    `json:"users"`
}

type GA4Geography struct {
	Country string `json:"country"`
	Users   int    `json:"users"`
}

type GA4TopPage struct {
	Page  string `json:"page"`
	Views int    `json:"views"`
}

type GA4Realtime struct {
	ActiveUsers int `json:"activeUsers"`
}

type GA4AnalyticsResponse struct {
	Summary         GA4Summary           `json:"summary"`
	Timeline        []GA4TimelinePoint   `json:"timeline"`
	DeviceBreakdown []GA4DeviceBreakdown `json:"deviceBreakdown"`
	TopSources      []GA4TrafficSource   `json:"topSources"`
	Geography       []GA4Geography       `json:"geography"`
	TopPages        []GA4TopPage         `json:"topPages,omitempty"`
	Realtime        *GA4Realtime         `json:"realtime,omitempty"`
	IsConfigured    bool                 `json:"isConfigured"`
	IsSampleData    bool                 `json:"isSampleData"`
	Notice          string               `json:"notice,omitempty"`
}

// Client manages connection & tokens to Google Analytics Data API
type Client struct {
	creds        *ServiceAccountCredentials
	propertyID   string // e.g. "properties/123456789"
	parsedKey    *rsa.PrivateKey
	httpClient   *http.Client
	cachedToken  string
	tokenExpiry  time.Time
	tokenLock    sync.RWMutex
	isConfigured bool
}

// NewClient initializes a GA4 Client from credentials
func NewClient() *Client {
	c := &Client{
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}

	c.initCredentials()
	return c
}

func (c *Client) initCredentials() {
	propertyID := os.Getenv("GA4_PROPERTY_ID")
	if propertyID != "" {
		if !strings.HasPrefix(propertyID, "properties/") {
			propertyID = "properties/" + propertyID
		}
		c.propertyID = propertyID
	}

	var jsonBytes []byte
	// 1. Check raw JSON or base64 in env
	if envJSON := os.Getenv("GA4_SERVICE_ACCOUNT_JSON"); envJSON != "" {
		jsonBytes = []byte(envJSON)
	} else {
		// 2. Look for file candidates
		customFile := os.Getenv("GA4_CREDENTIALS_FILE")
		candidates := []string{
			customFile,
			"fpt-event-system-497316-f85b0f0e9a0c.json",
			"../fpt-event-system-497316-f85b0f0e9a0c.json",
			"../../fpt-event-system-497316-f85b0f0e9a0c.json",
			"/etc/secrets/fpt-event-system-497316-f85b0f0e9a0c.json",
		}

		for _, path := range candidates {
			if path == "" {
				continue
			}
			abs, _ := filepath.Abs(path)
			if data, err := os.ReadFile(abs); err == nil && len(data) > 0 {
				jsonBytes = data
				break
			}
		}
	}

	if len(jsonBytes) == 0 {
		return
	}

	var sa ServiceAccountCredentials
	if err := json.Unmarshal(jsonBytes, &sa); err != nil {
		return
	}

	// Parse RSA Private Key
	rsaKey, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(sa.PrivateKey))
	if err != nil {
		return
	}

	c.creds = &sa
	c.parsedKey = rsaKey
	c.isConfigured = (c.propertyID != "")
}

// IsConfigured returns true if both credentials and Property ID are present
func (c *Client) IsConfigured() bool {
	return c.creds != nil && c.parsedKey != nil && c.propertyID != ""
}

// GetAccessToken retrieves or refreshes Google OAuth2 Bearer token
func (c *Client) GetAccessToken(ctx context.Context) (string, error) {
	c.tokenLock.RLock()
	if c.cachedToken != "" && time.Now().Before(c.tokenExpiry) {
		token := c.cachedToken
		c.tokenLock.RUnlock()
		return token, nil
	}
	c.tokenLock.RUnlock()

	c.tokenLock.Lock()
	defer c.tokenLock.Unlock()

	// Double-check after acquiring write lock
	if c.cachedToken != "" && time.Now().Before(c.tokenExpiry) {
		return c.cachedToken, nil
	}

	if c.creds == nil || c.parsedKey == nil {
		return "", fmt.Errorf("Google Analytics service account credentials not configured")
	}

	now := time.Now()
	tokenURI := c.creds.TokenURI
	if tokenURI == "" {
		tokenURI = "https://oauth2.googleapis.com/token"
	}

	// Create signed JWT assertion
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   c.creds.ClientEmail,
		"scope": "https://www.googleapis.com/auth/analytics.readonly",
		"aud":   tokenURI,
		"exp":   now.Add(1 * time.Hour).Unix(),
		"iat":   now.Unix(),
	})

	assertion, err := token.SignedString(c.parsedKey)
	if err != nil {
		return "", fmt.Errorf("failed to sign JWT assertion: %w", err)
	}

	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", assertion)

	req, err := http.NewRequestWithContext(ctx, "POST", tokenURI, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to exchange token: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("OAuth token exchange error (%d): %s", resp.StatusCode, string(body))
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(body, &tokenResp); err != nil {
		return "", err
	}

	c.cachedToken = tokenResp.AccessToken
	// Buffer 5 minutes before actual expiry
	c.tokenExpiry = now.Add(time.Duration(tokenResp.ExpiresIn-300) * time.Second)

	return c.cachedToken, nil
}

// Google Analytics Data API Request & Response Structs
type runReportRequest struct {
	DateRanges      []dateRange       `json:"dateRanges"`
	Dimensions      []dimension       `json:"dimensions"`
	Metrics         []metric          `json:"metrics"`
	DimensionFilter *filterExpression `json:"dimensionFilter,omitempty"`
	Limit           int               `json:"limit,omitempty"`
}

type dateRange struct {
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
}

type dimension struct {
	Name string `json:"name"`
}

type metric struct {
	Name string `json:"name"`
}

type filterExpression struct {
	Filter *filterClause `json:"filter,omitempty"`
}

type filterClause struct {
	FieldName    string        `json:"fieldName"`
	StringFilter *stringFilter `json:"stringFilter,omitempty"`
}

type stringFilter struct {
	MatchType string `json:"matchType"`
	Value     string `json:"value"`
}

type runReportResponse struct {
	DimensionHeaders []struct {
		Name string `json:"name"`
	} `json:"dimensionHeaders"`
	MetricHeaders []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	} `json:"metricHeaders"`
	Rows []struct {
		DimensionValues []struct {
			Value string `json:"value"`
		} `json:"dimensionValues"`
		MetricValues []struct {
			Value string `json:"value"`
		} `json:"metricValues"`
	} `json:"rows"`
	RowCount int `json:"rowCount"`
}

// RunReport calls the GA4 Data API runReport endpoint
func (c *Client) RunReport(ctx context.Context, req runReportRequest) (*runReportResponse, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return nil, err
	}

	apiURL := fmt.Sprintf("https://analyticsdata.googleapis.com/v1beta/%s:runReport", c.propertyID)
	reqBytes, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(reqBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	respBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	if httpResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GA4 API error (%d): %s", httpResp.StatusCode, string(respBytes))
	}

	var reportResp runReportResponse
	if err := json.Unmarshal(respBytes, &reportResp); err != nil {
		return nil, err
	}

	return &reportResp, nil
}

// RunRealtimeReport calls GA4 Data API runRealtimeReport
func (c *Client) RunRealtimeReport(ctx context.Context) (int, error) {
	token, err := c.GetAccessToken(ctx)
	if err != nil {
		return 0, err
	}

	apiURL := fmt.Sprintf("https://analyticsdata.googleapis.com/v1beta/%s:runRealtimeReport", c.propertyID)
	reqBody := map[string]interface{}{
		"metrics": []map[string]string{
			{"name": "activeUsers"},
		},
	}
	reqBytes, _ := json.Marshal(reqBody)

	httpReq, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(reqBytes))
	if err != nil {
		return 0, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+token)
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return 0, err
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("realtime API status %d", httpResp.StatusCode)
	}

	var reportResp runReportResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&reportResp); err != nil {
		return 0, err
	}

	if len(reportResp.Rows) > 0 && len(reportResp.Rows[0].MetricValues) > 0 {
		val, _ := strconv.Atoi(reportResp.Rows[0].MetricValues[0].Value)
		return val, nil
	}

	return 0, nil
}

// FetchSystemAnalytics retrieves aggregated platform-wide analytics
func (c *Client) FetchSystemAnalytics(ctx context.Context, startDate, endDate string) (*GA4AnalyticsResponse, error) {
	if startDate == "" {
		startDate = "30daysAgo"
	}
	if endDate == "" {
		endDate = "today"
	}

	if !c.IsConfigured() {
		return c.GenerateSampleAnalytics(startDate, endDate, "Hệ thống đang hiển thị dữ liệu mô phỏng do GA4_PROPERTY_ID chưa được cấu hình."), nil
	}

	// 1. Fetch Timeline (date)
	timelineReq := runReportRequest{
		DateRanges: []dateRange{{StartDate: startDate, EndDate: endDate}},
		Dimensions: []dimension{{Name: "date"}},
		Metrics: []metric{
			{Name: "screenPageViews"},
			{Name: "activeUsers"},
			{Name: "sessions"},
			{Name: "bounceRate"},
			{Name: "conversions"},
		},
	}
	timelineResp, err := c.RunReport(ctx, timelineReq)
	if err != nil {
		return c.GenerateSampleAnalytics(startDate, endDate, fmt.Sprintf("Lỗi kết nối GA4 API: %v (Hiển thị dữ liệu mẫu)", err)), nil
	}

	resp := &GA4AnalyticsResponse{
		Timeline:        make([]GA4TimelinePoint, 0),
		DeviceBreakdown: make([]GA4DeviceBreakdown, 0),
		TopSources:      make([]GA4TrafficSource, 0),
		Geography:       make([]GA4Geography, 0),
		TopPages:        make([]GA4TopPage, 0),
		IsConfigured:    true,
		IsSampleData:    false,
	}

	var totalViews, totalUsers, totalSessions, totalConversions int
	var bounceRateSum float64

	for _, row := range timelineResp.Rows {
		dateStr := ""
		if len(row.DimensionValues) > 0 {
			dateStr = row.DimensionValues[0].Value
		}
		views, _ := strconv.Atoi(row.MetricValues[0].Value)
		users, _ := strconv.Atoi(row.MetricValues[1].Value)
		sess, _ := strconv.Atoi(row.MetricValues[2].Value)
		br, _ := strconv.ParseFloat(row.MetricValues[3].Value, 64)
		conv, _ := strconv.Atoi(row.MetricValues[4].Value)

		totalViews += views
		totalUsers += users
		totalSessions += sess
		bounceRateSum += br
		totalConversions += conv

		resp.Timeline = append(resp.Timeline, GA4TimelinePoint{
			Date:        dateStr,
			PageViews:   views,
			ActiveUsers: users,
		})
	}

	rowCount := len(timelineResp.Rows)
	avgBounceRate := 0.0
	if rowCount > 0 {
		avgBounceRate = bounceRateSum / float64(rowCount)
	}

	resp.Summary = GA4Summary{
		PageViews:   totalViews,
		ActiveUsers: totalUsers,
		Sessions:    totalSessions,
		BounceRate:  avgBounceRate,
		Conversions: totalConversions,
	}

	// 2. Fetch Devices
	deviceReq := runReportRequest{
		DateRanges: []dateRange{{StartDate: startDate, EndDate: endDate}},
		Dimensions: []dimension{{Name: "deviceCategory"}},
		Metrics:    []metric{{Name: "activeUsers"}},
		Limit:      5,
	}
	if dResp, err := c.RunReport(ctx, deviceReq); err == nil {
		for _, row := range dResp.Rows {
			if len(row.DimensionValues) > 0 && len(row.MetricValues) > 0 {
				u, _ := strconv.Atoi(row.MetricValues[0].Value)
				resp.DeviceBreakdown = append(resp.DeviceBreakdown, GA4DeviceBreakdown{
					Device: row.DimensionValues[0].Value,
					Users:  u,
				})
			}
		}
	}

	// 3. Fetch Top Sources
	sourceReq := runReportRequest{
		DateRanges: []dateRange{{StartDate: startDate, EndDate: endDate}},
		Dimensions: []dimension{{Name: "sessionSource"}},
		Metrics:    []metric{{Name: "activeUsers"}},
		Limit:      6,
	}
	if sResp, err := c.RunReport(ctx, sourceReq); err == nil {
		for _, row := range sResp.Rows {
			if len(row.DimensionValues) > 0 && len(row.MetricValues) > 0 {
				u, _ := strconv.Atoi(row.MetricValues[0].Value)
				resp.TopSources = append(resp.TopSources, GA4TrafficSource{
					Source: row.DimensionValues[0].Value,
					Users:  u,
				})
			}
		}
	}

	// 4. Fetch Geography
	geoReq := runReportRequest{
		DateRanges: []dateRange{{StartDate: startDate, EndDate: endDate}},
		Dimensions: []dimension{{Name: "country"}},
		Metrics:    []metric{{Name: "activeUsers"}},
		Limit:      5,
	}
	if gResp, err := c.RunReport(ctx, geoReq); err == nil {
		for _, row := range gResp.Rows {
			if len(row.DimensionValues) > 0 && len(row.MetricValues) > 0 {
				u, _ := strconv.Atoi(row.MetricValues[0].Value)
				resp.Geography = append(resp.Geography, GA4Geography{
					Country: row.DimensionValues[0].Value,
					Users:   u,
				})
			}
		}
	}

	// 5. Fetch Top Pages
	pagesReq := runReportRequest{
		DateRanges: []dateRange{{StartDate: startDate, EndDate: endDate}},
		Dimensions: []dimension{{Name: "pagePath"}},
		Metrics:    []metric{{Name: "screenPageViews"}},
		Limit:      5,
	}
	if pResp, err := c.RunReport(ctx, pagesReq); err == nil {
		for _, row := range pResp.Rows {
			if len(row.DimensionValues) > 0 && len(row.MetricValues) > 0 {
				v, _ := strconv.Atoi(row.MetricValues[0].Value)
				resp.TopPages = append(resp.TopPages, GA4TopPage{
					Page:  row.DimensionValues[0].Value,
					Views: v,
				})
			}
		}
	}

	// 6. Realtime active users
	if rt, err := c.RunRealtimeReport(ctx); err == nil {
		resp.Realtime = &GA4Realtime{ActiveUsers: rt}
	}

	return resp, nil
}

// FetchEventAnalytics retrieves per-event page metrics filtered by pagePath
func (c *Client) FetchEventAnalytics(ctx context.Context, eventID int, startDate, endDate string) (*GA4AnalyticsResponse, error) {
	if startDate == "" {
		startDate = "30daysAgo"
	}
	if endDate == "" {
		endDate = "today"
	}

	if !c.IsConfigured() {
		return c.GenerateSampleAnalytics(startDate, endDate, fmt.Sprintf("Hiển thị dữ liệu mẫu cho sự kiện #%d (GA4_PROPERTY_ID chưa cấu hình).", eventID)), nil
	}

	// Filter by pagePath containing event ID
	eventPageFilter := &filterExpression{
		Filter: &filterClause{
			FieldName: "pagePath",
			StringFilter: &stringFilter{
				MatchType: "CONTAINS",
				Value:     fmt.Sprintf("/events/%d", eventID),
			},
		},
	}

	timelineReq := runReportRequest{
		DateRanges:      []dateRange{{StartDate: startDate, EndDate: endDate}},
		Dimensions:      []dimension{{Name: "date"}},
		DimensionFilter: eventPageFilter,
		Metrics: []metric{
			{Name: "screenPageViews"},
			{Name: "activeUsers"},
			{Name: "sessions"},
			{Name: "bounceRate"},
			{Name: "conversions"},
		},
	}

	timelineResp, err := c.RunReport(ctx, timelineReq)
	if err != nil || len(timelineResp.Rows) == 0 {
		return c.GenerateSampleAnalytics(startDate, endDate, fmt.Sprintf("Sự kiện #%d chưa có đủ lượt truy cập trên GA4 hoặc API trả về trống.", eventID)), nil
	}

	resp := &GA4AnalyticsResponse{
		Timeline:        make([]GA4TimelinePoint, 0),
		DeviceBreakdown: make([]GA4DeviceBreakdown, 0),
		TopSources:      make([]GA4TrafficSource, 0),
		Geography:       make([]GA4Geography, 0),
		IsConfigured:    true,
		IsSampleData:    false,
	}

	var totalViews, totalUsers, totalSessions, totalConversions int
	var bounceRateSum float64

	for _, row := range timelineResp.Rows {
		dateStr := ""
		if len(row.DimensionValues) > 0 {
			dateStr = row.DimensionValues[0].Value
		}
		views, _ := strconv.Atoi(row.MetricValues[0].Value)
		users, _ := strconv.Atoi(row.MetricValues[1].Value)
		sess, _ := strconv.Atoi(row.MetricValues[2].Value)
		br, _ := strconv.ParseFloat(row.MetricValues[3].Value, 64)
		conv, _ := strconv.Atoi(row.MetricValues[4].Value)

		totalViews += views
		totalUsers += users
		totalSessions += sess
		bounceRateSum += br
		totalConversions += conv

		resp.Timeline = append(resp.Timeline, GA4TimelinePoint{
			Date:        dateStr,
			PageViews:   views,
			ActiveUsers: users,
		})
	}

	rowCount := len(timelineResp.Rows)
	avgBounceRate := 0.0
	if rowCount > 0 {
		avgBounceRate = bounceRateSum / float64(rowCount)
	}

	resp.Summary = GA4Summary{
		PageViews:   totalViews,
		ActiveUsers: totalUsers,
		Sessions:    totalSessions,
		BounceRate:  avgBounceRate,
		Conversions: totalConversions,
	}

	return resp, nil
}

// GenerateSampleAnalytics provides realistic fallback data when live data is unavailable
func (c *Client) GenerateSampleAnalytics(startDate, endDate, notice string) *GA4AnalyticsResponse {
	now := time.Now()
	timeline := make([]GA4TimelinePoint, 7)
	for i := 6; i >= 0; i-- {
		d := now.AddDate(0, 0, -i)
		timeline[6-i] = GA4TimelinePoint{
			Date:        d.Format("20060102"),
			PageViews:   120 + (i*17)%45,
			ActiveUsers: 45 + (i*9)%25,
		}
	}

	return &GA4AnalyticsResponse{
		Summary: GA4Summary{
			PageViews:   890,
			ActiveUsers: 285,
			Sessions:    340,
			BounceRate:  0.34,
			Conversions: 42,
		},
		Timeline: timeline,
		DeviceBreakdown: []GA4DeviceBreakdown{
			{Device: "mobile", Users: 180},
			{Device: "desktop", Users: 95},
			{Device: "tablet", Users: 10},
		},
		TopSources: []GA4TrafficSource{
			{Source: "facebook.com", Users: 120},
			{Source: "(direct)", Users: 85},
			{Source: "google.com", Users: 55},
			{Source: "zalo.me", Users: 25},
		},
		Geography: []GA4Geography{
			{Country: "Vietnam", Users: 270},
			{Country: "United States", Users: 10},
			{Country: "Japan", Users: 5},
		},
		TopPages: []GA4TopPage{
			{Page: "/events", Views: 340},
			{Page: "/events/detail", Views: 280},
			{Page: "/", Views: 190},
			{Page: "/dashboard", Views: 80},
		},
		Realtime: &GA4Realtime{
			ActiveUsers: 8,
		},
		IsConfigured: c.IsConfigured(),
		IsSampleData: true,
		Notice:       notice,
	}
}
