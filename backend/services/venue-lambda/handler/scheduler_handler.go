package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/aws/aws-lambda-go/events"
	"github.com/fpt-event-services/common/utils"
	"github.com/fpt-event-services/services/venue-lambda/scheduler"
)

// VenueSchedulerHandler handles HTTP trigger endpoints for venue schedulers.
// Local mode: these endpoints are typically NOT called (goroutine tickers run instead).
// AWS mode: EventBridge sends a simulated APIGatewayProxyRequest to trigger cleanup.
type VenueSchedulerHandler struct {
	venueRelease *scheduler.VenueReleaseScheduler
}

// NewVenueSchedulerHandlerWithDB creates the scheduler handler and its underlying schedulers.
func NewVenueSchedulerHandlerWithDB(dbConn *sql.DB) *VenueSchedulerHandler {
	return &VenueSchedulerHandler{
		venueRelease: scheduler.NewVenueReleaseScheduler(dbConn, 5),
	}
}

// StartSchedulers starts the background goroutine tickers (local mode only).
func (h *VenueSchedulerHandler) StartSchedulers() {
	h.venueRelease.Start()
}

// HandleVenueRelease handles POST /internal/scheduler/venue-release
// Triggered by EventBridge every 5 minutes in AWS mode.
func (h *VenueSchedulerHandler) HandleVenueRelease(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	if !isVenueSchedulerCall(request) {
		return venueSchedulerResponse(http.StatusForbidden, map[string]string{"error": "internal only"})
	}
	h.venueRelease.RunOnce()
	return venueSchedulerResponse(http.StatusOK, map[string]string{"status": "ok", "job": "venue-release"})
}

func isVenueSchedulerCall(request events.APIGatewayProxyRequest) bool {
	return utils.IsValidInternalToken(request.Headers)
}

func venueSchedulerResponse(status int, body interface{}) (events.APIGatewayProxyResponse, error) {
	data, _ := json.Marshal(body)
	return events.APIGatewayProxyResponse{
		StatusCode: status,
		Body:       string(data),
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}
