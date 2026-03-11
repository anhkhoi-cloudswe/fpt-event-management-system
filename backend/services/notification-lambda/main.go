package main

import (
	"context"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/config"
	"github.com/fpt-event-services/common/localserver"
	"github.com/fpt-event-services/common/logger"
	tracer "github.com/fpt-event-services/common/xray"
	"github.com/fpt-event-services/services/notification-lambda/handler"
)

var notificationHandler *handler.NotificationHandler

func init() {
	tracer.Configure("notification-service")

	// Log feature flags on startup
	config.LogFeatureFlags()

	// Notification service does NOT need database
	// It only sends emails, generates PDFs, and QR codes
	log := logger.Default()
	log.Info("Notification Lambda initialized (no DB required)")

	// Initialize handler (stateless, no DB dependency)
	notificationHandler = handler.NewNotificationHandler()
}

// Handler routes all API Gateway requests to the appropriate handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := request.Path
	method := request.HTTPMethod

	// ========== Health Check ==========
	if path == "/health" && method == "GET" {
		return events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"status":"UP","service":"notification"}`,
			Headers:    map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	// ========== Internal Routes Only ==========
	switch {
	case path == "/internal/notify/email" && method == "POST":
		return notificationHandler.HandleSendEmail(ctx, request)
	case path == "/internal/notify/ticket-pdf" && method == "POST":
		return notificationHandler.HandleSendTicketPDF(ctx, request)
	case path == "/internal/notify/send-tickets" && method == "POST":
		return notificationHandler.HandleSendTickets(ctx, request)
	// /ticket-confirmation: alias mới cho /ticket-pdf, nhận đúng DTO từ ticket service sau thanh toán
	case path == "/internal/notify/ticket-confirmation" && method == "POST":
		return notificationHandler.HandleSendTicketPDF(ctx, request)
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
	localserver.LoadEnvAndSyncJWT("Notification")

	if localserver.IsLocal() {
		localserver.Start("8086", Handler)
	} else {
		lambda.Start(Handler)
	}
}
