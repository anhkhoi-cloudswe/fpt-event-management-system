package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/localserver"
	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/storage"
	tracer "github.com/fpt-event-services/common/xray"
	"github.com/fpt-event-services/services/event-lambda/handler"
)

var (
	eventHandler          *handler.EventHandler
	eventInternalHandler  *handler.EventInternalHandler
	eventSchedulerHandler *handler.EventSchedulerHandler
)

func init() {
	tracer.Configure("event-service")

	// Log feature flags on startup
	config.LogFeatureFlags()

	// Initialize database connection
	var dbConn *sql.DB
	if config.IsFeatureEnabled(config.FlagServiceSpecificDB) {
		// Service-specific DB: independent connection pool for event-lambda
		var err error
		dbConn, err = db.InitServiceDB("EVENT")
		if err != nil {
			logger.Default().Fatal("Failed to initialize service-specific database: %v", err)
		}
	} else {
		// Shared DB: use global singleton
		if err := db.InitDB(); err != nil {
			logger.Default().Fatal("Failed to initialize database: %v", err)
		}
		dbConn = db.GetDB()
	}

	// Initialize handlers with explicit DB connection (DI from main)
	eventHandler = handler.NewEventHandlerWithDB(dbConn)
	eventInternalHandler = handler.NewEventInternalHandlerWithDB(dbConn)
	eventSchedulerHandler = handler.NewEventSchedulerHandlerWithDB(dbConn)
}

// Handler routes all API Gateway requests to the appropriate handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	method := request.HTTPMethod

	// ========== Health Check ==========
	if path == "/health" && method == "GET" {
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"status":"UP","service":"event"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	// ========== Scheduler Trigger Routes (EventBridge in AWS / goroutine in Local) ==========
	if path == "/internal/scheduler/event-cleanup" && method == "POST" {
		return eventSchedulerHandler.HandleEventCleanup(ctx, request)
	}
	if path == "/internal/scheduler/expired-requests" && method == "POST" {
		return eventSchedulerHandler.HandleExpiredRequests(ctx, request)
	}

	// ========== Internal Routes (guarded by EVENT_API_ENABLED) ==========
	if strings.HasPrefix(path, "/internal/") {
		if !config.IsFeatureEnabled(config.FlagEventAPIEnabled) {
			return events.APIGatewayProxyResponse{
				StatusCode: 503,
				Body:       `{"error":"Event internal API is disabled. Set EVENT_API_ENABLED=true"}`,
				Headers:    map[string]string{"Content-Type": "application/json"},
			}, nil
		}
		switch {
		case path == "/internal/events/active-by-venue" && method == "GET":
			return eventInternalHandler.HandleActiveByVenue(ctx, request)
		case path == "/internal/events/busy-areas" && method == "GET":
			return eventInternalHandler.HandleBusyAreas(ctx, request)
		case path == "/internal/events/area" && method == "GET":
			return eventInternalHandler.HandleGetEventArea(ctx, request)
		}
	}

	// ========== Upload Route — handled natively (not via proxy) ==========
	// In local microservices mode, the gateway handles this directly (see cmd/gateway/main.go).
	// In AWS Lambda production mode, API Gateway sends binary bodies base64-encoded;
	// this case reconstructs the http.Request and calls storage.HandleImageUpload.
	if path == "/api/upload/image" && method == "POST" {
		return handleUploadImage(ctx, request)
	}

	// ========== Public Routes ==========
	switch {
	case path == "/api/events" && method == "GET":
		return eventHandler.HandleGetEvents(ctx, request)
	case path == "/api/events/open" && method == "GET":
		return eventHandler.HandleGetOpenEvents(ctx, request)
	case path == "/api/events/detail" && method == "GET":
		return eventHandler.HandleGetEventDetail(ctx, request)
	case path == "/api/event-requests" && method == "POST":
		return eventHandler.HandleCreateEventRequest(ctx, request)
	case path == "/api/event-requests/my" && method == "GET":
		return eventHandler.HandleGetMyEventRequests(ctx, request)
	case path == "/api/event-requests/my/active" && method == "GET":
		return eventHandler.HandleGetMyActiveEventRequests(ctx, request)
	case path == "/api/event-requests/my/archived" && method == "GET":
		return eventHandler.HandleGetMyArchivedEventRequests(ctx, request)
	case strings.HasPrefix(path, "/api/event-requests/") && method == "GET":
		return eventHandler.HandleGetEventRequestByID(ctx, request)
	case path == "/api/staff/event-requests" && method == "GET":
		return eventHandler.HandleGetPendingEventRequests(ctx, request)
	case path == "/api/event-requests/process" && method == "POST":
		return eventHandler.HandleProcessEventRequest(ctx, request)
	case path == "/api/event-requests/update" && method == "POST":
		return eventHandler.HandleUpdateEventRequest(ctx, request)
	case path == "/api/events/update-details" && method == "POST":
		return eventHandler.HandleUpdateEventDetails(ctx, request)
	case path == "/api/events/update-config" && method == "POST":
		return eventHandler.HandleUpdateEventConfig(ctx, request)
	case path == "/api/events/config" && method == "GET":
		return eventHandler.HandleGetEventConfig(ctx, request)
	case path == "/api/events/stats" && method == "GET":
		return eventHandler.HandleGetEventStats(ctx, request)
	case path == "/api/events/available-areas" && method == "GET":
		return eventHandler.HandleGetAvailableAreas(ctx, request)
	case path == "/api/organizer/events/cancel" && method == "POST":
		return eventHandler.HandleCancelEvent(ctx, request)
	case (path == "/api/events/disable" || path == "/api/event/disable") && method == "POST":
		return eventHandler.HandleDisableEvent(ctx, request)
	case path == "/api/events/daily-quota" && method == "GET":
		return eventHandler.HandleCheckDailyQuota(ctx, request)
	// GET /api/events/{id} — path-parameter style (frontend / legacy calls)
	// Chuyển đổi sang ?id= để tái sử dụng HandleGetEventDetail
	case strings.HasPrefix(path, "/api/events/") && method == "GET":
		parts := strings.Split(strings.TrimPrefix(path, "/api/events/"), "/")
		if len(parts) > 0 && parts[0] != "" {
			if request.QueryStringParameters == nil {
				request.QueryStringParameters = map[string]string{}
			}
			request.QueryStringParameters["id"] = parts[0]
			return eventHandler.HandleGetEventDetail(ctx, request)
		}
	}

	return events.APIGatewayProxyResponse{
		StatusCode: 404,
		Body:       `{"error":"Not Found"}`,
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}

// handleUploadImage bridges an APIGatewayProxyRequest to storage.HandleImageUpload.
// In local microservices mode the gateway handles /api/upload/image natively;
// this function is the production path where API Gateway delivers the binary body
// as a base64-encoded string (IsBase64Encoded=true).
func handleUploadImage(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var body []byte
	if request.IsBase64Encoded {
		decoded, err := base64.StdEncoding.DecodeString(request.Body)
		if err != nil {
			return events.APIGatewayProxyResponse{
				StatusCode: 400,
				Body:       `{"error":"Invalid base64 body"}`,
				Headers:    map[string]string{"Content-Type": "application/json"},
			}, nil
		}
		body = decoded
	} else {
		body = []byte(request.Body)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, "/api/upload/image", bytes.NewReader(body))
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Body:       `{"error":"Failed to construct request"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}
	for k, v := range request.Headers {
		httpReq.Header.Set(k, v)
	}

	rec := httptest.NewRecorder()
	storage.HandleImageUpload(rec, httpReq)

	result := rec.Result()
	respBody, _ := io.ReadAll(result.Body)
	defer result.Body.Close()

	headers := make(map[string]string)
	for k := range result.Header {
		headers[k] = result.Header.Get(k)
	}

	return events.APIGatewayProxyResponse{
		StatusCode: result.StatusCode,
		Body:       string(respBody),
		Headers:    headers,
	}, nil
}

func main() {
	// Load .env and sync JWT secret FIRST — in main() so it's guaranteed
	// to run after all package-level vars and init() functions are done.
	localserver.LoadEnvAndSyncJWT("Event")

	if localserver.IsLocal() {
		// Start background schedulers only in local mode (goroutine tickers)
		eventSchedulerHandler.StartSchedulers()
		localserver.Start("8082", Handler)
	} else {
		lambda.Start(Handler)
	}
}
