package main

import (
	"context"
	"database/sql"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/localserver"
	"github.com/fpt-event-services/common/logger"
	tracer "github.com/fpt-event-services/common/xray"
	"github.com/fpt-event-services/services/venue-lambda/handler"
)

var (
	venueHandler          *handler.VenueHandler
	venueInternalHandler  *handler.VenueInternalHandler
	venueSchedulerHandler *handler.VenueSchedulerHandler
)

func init() {
	tracer.Configure("venue-service")

	// Log feature flags on startup
	config.LogFeatureFlags()

	// Initialize database connection
	var dbConn *sql.DB
	if config.IsFeatureEnabled(config.FlagServiceSpecificDB) {
		// Service-specific DB: independent connection pool for venue-lambda
		var err error
		dbConn, err = db.InitServiceDB("VENUE")
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
	venueHandler = handler.NewVenueHandlerWithDB(dbConn)
	venueInternalHandler = handler.NewVenueInternalHandlerWithDB(dbConn)
	venueSchedulerHandler = handler.NewVenueSchedulerHandlerWithDB(dbConn)
}

// Handler routes all API Gateway requests to the appropriate handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	method := request.HTTPMethod

	// ========== Health Check ==========
	if path == "/health" && method == "GET" {
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"status":"UP","service":"venue"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	// ========== Scheduler Trigger Routes (EventBridge in AWS / goroutine in Local) ==========
	if path == "/internal/scheduler/venue-release" && method == "POST" {
		return venueSchedulerHandler.HandleVenueRelease(ctx, request)
	}

	// ========== Internal Routes ==========
	if strings.HasPrefix(path, "/internal/") {
		switch {
		case path == "/internal/venue/info" && method == "GET":
			return venueInternalHandler.HandleGetVenueInfo(ctx, request)
		case path == "/internal/venue/area/info" && method == "GET":
			return venueInternalHandler.HandleGetAreaInfo(ctx, request)
		case path == "/internal/venue/areas" && method == "GET":
			return venueInternalHandler.HandleGetAreasByVenue(ctx, request)
		case path == "/internal/venue/seat/info" && method == "GET":
			return venueInternalHandler.HandleGetSeatInfo(ctx, request)
		case path == "/internal/venue/seats" && method == "GET":
			return venueInternalHandler.HandleGetSeatsByArea(ctx, request)
		case path == "/internal/venue/area/by-seat" && method == "GET":
			return venueInternalHandler.HandleGetAreaBySeat(ctx, request)
		case path == "/internal/venue/area-with-venue" && method == "GET":
			return venueInternalHandler.HandleGetAreaWithVenue(ctx, request)
		case path == "/internal/venue/area-status" && method == "POST":
			return venueInternalHandler.HandleUpdateAreaStatus(ctx, request)
		}
	}

	// ========== Public Routes ==========
	switch {
	case path == "/api/venues" && method == "GET":
		return venueHandler.HandleGetVenues(ctx, request)
	case path == "/api/venues" && method == "POST":
		return venueHandler.HandleCreateVenue(ctx, request)
	case path == "/api/venues" && method == "PUT":
		return venueHandler.HandleUpdateVenue(ctx, request)
	case path == "/api/venues" && method == "DELETE":
		return venueHandler.HandleDeleteVenue(ctx, request)
	case path == "/api/venues/areas" && method == "GET":
		return venueHandler.HandleGetAreas(ctx, request)
	case path == "/api/venues/areas" && method == "POST":
		return venueHandler.HandleCreateArea(ctx, request)
	case path == "/api/venues/areas" && method == "PUT":
		return venueHandler.HandleUpdateArea(ctx, request)
	case path == "/api/venues/areas" && method == "DELETE":
		return venueHandler.HandleDeleteArea(ctx, request)
	case path == "/api/areas/free" && method == "GET":
		return venueHandler.HandleGetFreeAreas(ctx, request)
	case path == "/api/seats" && method == "GET":
		return venueHandler.HandleGetSeats(ctx, request)
	}

	return events.APIGatewayProxyResponse{
		StatusCode: 404,
		Body:       `{"error":"Not Found"}`,
		Headers:    map[string]string{"Content-Type": "application/json"},
	}, nil
}

func main() {
	// Load .env and sync JWT secret FIRST — in main() so it's guaranteed
	// to run after all package-level vars and init() functions are done.
	localserver.LoadEnvAndSyncJWT("Venue")

	if localserver.IsLocal() {
		// Start background schedulers only in local mode (goroutine tickers)
		venueSchedulerHandler.StartSchedulers()
		localserver.Start("8084", Handler)
	} else {
		lambda.Start(Handler)
	}
}
