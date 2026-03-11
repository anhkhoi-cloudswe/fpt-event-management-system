package main

import (
	"context"
	"database/sql"
	"strconv"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/localserver"
	"github.com/fpt-event-services/common/logger"
	tracer "github.com/fpt-event-services/common/xray"
	"github.com/fpt-event-services/services/staff-lambda/handler"
)

var (
	staffHandler         *handler.StaffHandler
	reportHandler        *handler.ReportHandler
	studentReportHandler *handler.StudentReportHandler
)

func init() {
	tracer.Configure("staff-service")

	// Log feature flags on startup
	config.LogFeatureFlags()

	// Initialize database connection
	var dbConn *sql.DB
	if config.IsFeatureEnabled(config.FlagServiceSpecificDB) {
		// Service-specific DB: independent connection pool for staff-lambda
		var err error
		dbConn, err = db.InitServiceDB("STAFF")
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
	staffHandler = handler.NewStaffHandlerWithDB(dbConn)
	reportHandler = handler.NewReportHandlerWithDB(dbConn)
	studentReportHandler = handler.NewStudentReportHandlerWithDB(dbConn)
}

// Handler routes all API Gateway requests to the appropriate handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	method := request.HTTPMethod

	// ========== Health Check ==========
	if path == "/health" && method == "GET" {
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"status":"UP","service":"staff"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	// ========== Public Routes - Staff ==========
	switch {
	case path == "/api/staff/checkin" && method == "POST":
		return staffHandler.HandleCheckin(ctx, request)
	case path == "/api/staff/checkout" && method == "POST":
		return staffHandler.HandleCheckout(ctx, request)
	case path == "/api/admin/config/system" && method == "GET":
		return staffHandler.HandleGetSystemConfig(ctx, request)
	case path == "/api/admin/config/system" && method == "POST":
		return staffHandler.HandleUpdateSystemConfig(ctx, request)
	}

	// ========== Public Routes - Reports ==========
	if strings.HasPrefix(path, "/api/staff/reports") {
		switch {
		case path == "/api/staff/reports/detail" && method == "GET":
			return reportHandler.HandleGetReportDetail(ctx, request)
		case path == "/api/staff/reports" && method == "GET":
			return reportHandler.HandleListReports(ctx, request)
		case path == "/api/staff/reports/process" && method == "POST":
			return reportHandler.HandleProcessReport(ctx, request)
		case path == "/api/staff/reports/approve" && method == "POST":
			return reportHandler.HandleApproveReport(ctx, request)
		case path == "/api/staff/reports/reject" && method == "POST":
			return reportHandler.HandleRejectReport(ctx, request)
		// Handle /api/staff/reports/{reportId}
		case strings.HasPrefix(path, "/api/staff/reports/") && method == "GET" && path != "/api/staff/reports/detail" && path != "/api/staff/reports/process":
			// Extract reportId from path: /api/staff/reports/{reportId}
			parts := strings.Split(path, "/")
			if len(parts) == 5 { // /api/staff/reports/{reportId}
				reportIDStr := parts[4]
				if reportID, err := strconv.Atoi(reportIDStr); err == nil {
					return reportHandler.HandleGetReportDetailByPath(ctx, request, reportID)
				}
			}
			return events.APIGatewayProxyResponse{
				StatusCode: 400,
				Body:       `{"error":"Invalid reportId"}`,
				Headers:    map[string]string{"Content-Type": "application/json"},
			}, nil
		}
	}

	// ========== Public Routes - Student Reports ==========
	if strings.HasPrefix(path, "/api/student/reports") {
		switch {
		case path == "/api/student/reports" && method == "POST":
			return studentReportHandler.HandleSubmitReport(ctx, request)
		case path == "/api/student/reports/pending-ticket-ids" && method == "GET":
			return studentReportHandler.HandleGetPendingTicketIDs(ctx, request)
		}
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
	localserver.LoadEnvAndSyncJWT("Staff")

	if localserver.IsLocal() {
		localserver.Start("8085", Handler)
	} else {
		lambda.Start(Handler)
	}
}
