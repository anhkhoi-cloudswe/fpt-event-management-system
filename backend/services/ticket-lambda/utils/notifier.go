package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/fpt-event-services/common/registry"
)

// sendTicketsRequest là payload gửi đến Notification Service
type sendTicketsRequest struct {
	TicketIDs []int `json:"ticketIds"`
}

// CallNotificationService gọi Notification Service để gửi PDF vé cho danh sách ticketIds.
// Hàm này KHÔNG block — nên được gọi trong goroutine.
// Nếu Notification Service không khả dụng, chỉ log lỗi, không panic.
func CallNotificationService(ticketIds []int) {
	if len(ticketIds) == 0 {
		return
	}

	baseURL := registry.GetBackendURL("Notification")
	endpoint := baseURL + "/internal/notify/send-tickets"

	payload, err := json.Marshal(sendTicketsRequest{TicketIDs: ticketIds})
	if err != nil {
		fmt.Printf("[NOTIFIER] ❌ Không thể marshal payload: %v\n", err)
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		fmt.Printf("[NOTIFIER] ❌ Không thể tạo request: %v\n", err)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Call", "true")

	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[NOTIFIER] ❌ Gọi Notification Service thất bại (ticketIds=%v): %v\n", ticketIds, err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		fmt.Printf("[NOTIFIER] ✅ Đã kích hoạt gửi PDF vé cho ticketIds=%v (HTTP %d)\n", ticketIds, resp.StatusCode)
	} else {
		fmt.Printf("[NOTIFIER] ⚠️ Notification Service trả về HTTP %d cho ticketIds=%v\n", resp.StatusCode, ticketIds)
	}
}
