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
	"github.com/fpt-event-services/services/auth-lambda/handler"
)

var (
	authHandler         *handler.AuthHandler
	authInternalHandler *handler.AuthInternalHandler
)

func init() {
	tracer.Configure("auth-service")

	// Log feature flags on startup
	config.LogFeatureFlags()

	// Initialize database connection
	var dbConn *sql.DB
	if config.IsFeatureEnabled(config.FlagServiceSpecificDB) {
		// Service-specific DB: independent connection pool for auth-lambda
		var err error
		dbConn, err = db.InitServiceDB("AUTH")
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
	authHandler = handler.NewAuthHandlerWithDB(dbConn)
	authInternalHandler = handler.NewAuthInternalHandlerWithDB(dbConn)

	// Initialize auth services (email, recaptcha)
	handler.InitServices()
}

// Handler routes all API Gateway requests to the appropriate handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	method := request.HTTPMethod

	// ========== Health Check ==========
	if path == "/health" && method == "GET" {
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"status":"UP","service":"auth"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	// ========== Internal Routes ==========
	if strings.HasPrefix(path, "/internal/") {
		switch {
		case path == "/internal/user/profile" && method == "GET":
			return authInternalHandler.HandleGetUserProfile(ctx, request)
		case path == "/internal/user/profiles" && method == "GET":
			return authInternalHandler.HandleGetUserProfiles(ctx, request)
		}
	}

	// ========== Public Routes ==========
	switch {
	case path == "/api/login" && method == "POST":
		return authHandler.HandleLogin(ctx, request)
	case path == "/api/logout" && method == "POST":
		return authHandler.HandleLogout(ctx, request)
	case path == "/api/v1/auth/me" && method == "GET":
		return authHandler.HandleMe(ctx, request)
	case path == "/api/auth/me" && method == "GET":
		return authHandler.HandleMe(ctx, request)
	case path == "/api/register" && method == "POST":
		return authHandler.HandleRegister(ctx, request)
	case path == "/api/register/send-otp" && method == "POST":
		return authHandler.HandleRegisterSendOTP(ctx, request)
	case path == "/api/register/verify-otp" && method == "POST":
		return authHandler.HandleRegisterVerifyOTP(ctx, request)
	case path == "/api/register/resend-otp" && method == "POST":
		return authHandler.HandleRegisterResendOTP(ctx, request)
	case path == "/api/forgot-password" && method == "POST":
		return authHandler.HandleForgotPassword(ctx, request)
	case path == "/api/reset-password" && method == "POST":
		return authHandler.HandleResetPassword(ctx, request)
	case path == "/api/admin/create-account" && method == "POST":
		return authHandler.HandleAdminCreateAccount(ctx, request)
	case path == "/api/admin/create-account" && method == "PUT":
		return authHandler.HandleAdminUpdateUser(ctx, request)
	case path == "/api/admin/create-account" && method == "DELETE":
		return authHandler.HandleAdminDeleteUser(ctx, request)
	case path == "/api/users/staff-organizer" && method == "GET":
		return authHandler.HandleGetStaffOrganizer(ctx, request)
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
	localserver.LoadEnvAndSyncJWT("Auth")

	if localserver.IsLocal() {
		localserver.Start("8081", Handler)
	} else {
		lambda.Start(Handler)
	}
}
