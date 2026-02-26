package main

import (
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/services/event-lambda/handler"
)

// For AWS Lambda deployment
// This file is used when deploying to AWS Lambda
func main() {
	eventHandler := handler.NewEventHandler()

	// Lambda handler for API Gateway events
	lambda.Start(eventHandler.HandleGetEvents)
}
