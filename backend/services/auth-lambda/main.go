package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/services/auth-lambda/handler"
)

var authHandler *handler.AuthHandler

func init() {
	// Initialize database connection
	if err := db.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize handler
	authHandler = handler.NewAuthHandler()
}

// Handler is the Lambda function handler
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Route based on path and method
	path := request.Path
	method := request.HTTPMethod

	switch {
	case path == "/api/login" && method == "POST":
		return authHandler.HandleLogin(ctx, request)

	case path == "/api/register" && method == "POST":
		return authHandler.HandleRegister(ctx, request)

	case path == "/api/admin/create-account" && method == "POST":
		return authHandler.HandleAdminCreateAccount(ctx, request)

	default:
		return events.APIGatewayProxyResponse{
			StatusCode: 404,
			Body:       `{"error":"Not Found"}`,
			Headers: map[string]string{
				"Content-Type": "application/json",
			},
		}, nil
	}
}

func main() {
	lambda.Start(Handler)
}
