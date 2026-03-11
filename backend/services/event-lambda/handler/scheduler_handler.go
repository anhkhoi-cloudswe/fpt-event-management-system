package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/services/event-lambda/scheduler"
)

// EventSchedulerHandler handles HTTP trigger endpoints for event schedulers.
// Local mode: these endpoints are typically NOT called (goroutine tickers run instead).
// AWS mode: EventBridge sends a simulated APIGatewayProxyRequest to trigger cleanup.
type EventSchedulerHandler struct {
	eventCleanup   *scheduler.EventCleanupScheduler
	expiredCleanup *scheduler.ExpiredRequestsCleanupScheduler
}

// NewEventSchedulerHandlerWithDB creates the scheduler handler and its underlying schedulers.
// intervalMinutes controls how often the local ticker fires (default 5 min).
func NewEventSchedulerHandlerWithDB(dbConn *sql.DB) *EventSchedulerHandler {
	return &EventSchedulerHandler{
		eventCleanup:   scheduler.NewEventCleanupScheduler(dbConn, 5),
		expiredCleanup: scheduler.NewExpiredRequestsCleanupScheduler(dbConn, 5),
	}
}

// StartSchedulers starts the background goroutine tickers (local mode only).
// In AWS Lambda mode, isLocalMode() inside Start() suppresses the goroutine.
func (h *EventSchedulerHandler) StartSchedulers() {
	h.eventCleanup.Start()
	h.expiredCleanup.Start()
}

// HandleEventCleanup handles POST /internal/scheduler/event-cleanup
// Triggered by EventBridge every 5 minutes in AWS mode.
func (h *EventSchedulerHandler) HandleEventCleanup(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isSchedulerCall(request) {
		return schedulerResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}
	h.eventCleanup.RunOnce()
	return schedulerResponse(http.StatusOK, map[string]string{"status": "ok", "job": "event-cleanup"})
}

// HandleExpiredRequests handles POST /internal/scheduler/expired-requests
// Triggered by EventBridge every 5 minutes in AWS mode.
func (h *EventSchedulerHandler) HandleExpiredRequests(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isSchedulerCall(request) {
		return schedulerResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}
	h.expiredCleanup.RunOnce()
	return schedulerResponse(http.StatusOK, map[string]string{"status": "ok", "job": "expired-requests"})
}

// isSchedulerCall validates that the request comes from an internal caller or EventBridge.
func isSchedulerCall(request events.APIGatewayProxyRequest) bool {
	return request.Headers["X-Internal-Call"] == "true"
}

func schedulerResponse(status int, body interface{}) (events.APIGatewayProxyResponse, error) {
	data, _ := json.Marshal(body)
	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Body:       string(data),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
