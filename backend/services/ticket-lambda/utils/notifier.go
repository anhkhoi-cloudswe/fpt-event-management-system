package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"net/http"
	"os"
	"time"

	"github.com/fpt-event-services/common/registry"
)

// sendTicketsRequest là payload gửi đến Notification Service
type sendTicketsRequest struct {
	TicketIDs []int `json:"ticketIds"`
}

const (
	maxRetries          = 3
	initialRetryDelay   = 500 * time.Millisecond
	maxRetryDelay       = 5 * time.Second
	notificationTimeout = 30 * time.Second // Increased from 10s due to Lambda cold start
)

// exponentialBackoff calculates retry delay with jitter
func exponentialBackoff(attempt int) time.Duration {
	if attempt <= 0 {
		return initialRetryDelay
	}
	// Exponential backoff: 500ms, 1s, 2s, 4s...
	baseDelay := time.Duration(math.Pow(2, float64(attempt-1))) * initialRetryDelay
	if baseDelay > maxRetryDelay {
		baseDelay = maxRetryDelay
	}
	// Add jitter (±25%)
	jitter := time.Duration(rand.Int63n(int64(baseDelay / 4)))
	return baseDelay + jitter - baseDelay/8
}

// CallNotificationService gọi Notification Service để gửi PDF vé cho danh sách ticketIds.
// Hàm này KHÔNG block — nên được gọi trong goroutine.
// Có retry logic với exponential backoff để xử lý AWS Lambda cold start.
// Nếu tất cả retries fail, chỉ log error, không panic (graceful degradation).
func CallNotificationService(ticketIds []int) {
	if len(ticketIds) == 0 {
		return
	}

	// Use smart fallback URL resolution
	baseURL := registry.GetBackendURL("Notification")
	if baseURL == "" {
		fmt.Printf("[NOTIFIER] ❌ Không thể resolve Notification Service URL (kiểm tra INTERNAL_ALB_URL env var hoặc NOTIFICATION_SERVICE_URL)\n")
		return
	}

	endpoint := baseURL + "/internal/notify/send-tickets"

	payload, err := json.Marshal(sendTicketsRequest{TicketIDs: ticketIds})
	if err != nil {
		fmt.Printf("[NOTIFIER] ❌ Không thể marshal payload: %v\n", err)
		return
	}

	// Retry logic
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		resp, err := callNotificationWithTimeout(endpoint, payload)
		if err == nil && resp != nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			fmt.Printf("[NOTIFIER] ✅ Đã kích hoạt gửi PDF vé cho ticketIds=%v (HTTP %d)\n", ticketIds, resp.StatusCode)
			if resp.Body != nil {
				resp.Body.Close()
			}
			return
		}

		lastErr = err
		if resp != nil && resp.StatusCode != 0 {
			fmt.Printf("[NOTIFIER] ⚠️ Attempt %d/%d failed: HTTP %d (ticketIds=%v)\n", attempt, maxRetries, resp.StatusCode, ticketIds)
			if resp.Body != nil {
				resp.Body.Close()
			}
		} else {
			fmt.Printf("[NOTIFIER] ⚠️ Attempt %d/%d failed: %v (ticketIds=%v)\n", attempt, maxRetries, err, ticketIds)
		}

		// Don't retry on last attempt
		if attempt < maxRetries {
			delay := exponentialBackoff(attempt)
			fmt.Printf("[NOTIFIER] ⏳ Retrying in %s...\n", delay)
			time.Sleep(delay)
		}
	}

	// All retries exhausted
	fmt.Printf("[NOTIFIER] ❌ FINAL: Gọi Notification Service thất bại sau %d attempts (ticketIds=%v): %v\n", maxRetries, ticketIds, lastErr)
}

// callNotificationWithTimeout sends HTTP request with proper timeout
func callNotificationWithTimeout(endpoint string, payload []byte) (*http.Response, error) {
	client := &http.Client{
		Timeout: notificationTimeout,
		Transport: &http.Transport{
			MaxIdleConns:    10,
			MaxConnsPerHost: 5,
		},
	}
	defer client.CloseIdleConnections()

	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if token := os.Getenv("INTERNAL_AUTH_TOKEN"); token != "" {
		req.Header.Set("X-Internal-Token", token)
	}

	return client.Do(req)
}
