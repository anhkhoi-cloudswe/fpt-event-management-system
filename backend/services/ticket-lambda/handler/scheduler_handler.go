package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/ticket-lambda/scheduler"
)

// TicketSchedulerHandler handles HTTP trigger endpoints for ticket schedulers.
// Local mode: these endpoints are typically NOT called (goroutine tickers run instead).
// AWS mode: EventBridge sends a simulated APIGatewayProxyRequest to trigger cleanup.
type TicketSchedulerHandler struct {
	pendingCleanup *scheduler.PendingTicketCleanupScheduler
}

// NewTicketSchedulerHandlerWithDB creates the scheduler handler and its underlying schedulers.
func NewTicketSchedulerHandlerWithDB(dbConn *sql.DB) *TicketSchedulerHandler {
	return &TicketSchedulerHandler{
		pendingCleanup: scheduler.NewPendingTicketCleanupScheduler(dbConn, 5),
	}
}

// StartSchedulers starts the background goroutine tickers (local mode only).
func (h *TicketSchedulerHandler) StartSchedulers() {
	h.pendingCleanup.Start()
}

// HandlePendingTicketCleanup handles POST /internal/scheduler/pending-ticket-cleanup
// Triggered by EventBridge every 5 minutes in AWS mode.
func (h *TicketSchedulerHandler) HandlePendingTicketCleanup(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isTicketSchedulerCall(request) {
		return ticketSchedulerResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}
	h.pendingCleanup.RunOnce()
	return ticketSchedulerResponse(http.StatusOK, map[string]string{"status": "ok", "job": "pending-ticket-cleanup"})
}

func isTicketSchedulerCall(request events.APIGatewayProxyRequest) bool {
	return request.Headers["X-Internal-Call"] == "true"
}

func ticketSchedulerResponse(status int, body interface{}) (events.APIGatewayProxyResponse, error) {
	data, _ := json.Marshal(body)
	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Body:       string(data),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
