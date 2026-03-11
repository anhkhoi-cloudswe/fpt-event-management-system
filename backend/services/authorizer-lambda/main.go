package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/fpt-event-services/common/jwt"
	"github.com/fpt-event-services/common/localserver"
)

// ============================================================
// JWT Lambda Authorizer (REQUEST type)
//
// Performs JWT validation at the API Gateway level before any
// main Lambda is invoked, providing an early-rejection security
// layer. Invalid or missing tokens for protected routes are
// denied without incurring main Lambda invocation costs.
//
// Routes marked Authorizer: NONE in template.yaml bypass this.
// ============================================================

// Handler processes API Gateway custom authorizer requests
func Handler(_ context.Context, req events.APIGatewayCustomAuthorizerRequestTypeRequest) (events.APIGatewayCustomAuthorizerResponse, error) {
	// Always allow CORS preflight
	if req.HTTPMethod == "OPTIONS" {
		return allow(req, "anonymous", "", "")
	}

	authHeader := req.Headers["Authorization"]
	if authHeader == "" {
		authHeader = req.Headers["authorization"]
	}

	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return deny(req)
	}

	tokenStr := authHeader[7:]
	claims, err := jwt.ValidateToken(tokenStr)
	if err != nil {
		return deny(req)
	}

	userID := fmt.Sprintf("%d", claims.UserID)
	return allow(req, userID, claims.Role, claims.Email)
}

// allow generates an IAM ALLOW policy and passes user context
func allow(req events.APIGatewayCustomAuthorizerRequestTypeRequest, userID, role, email string) (events.APIGatewayCustomAuthorizerResponse, error) {
	return events.APIGatewayCustomAuthorizerResponse{
		PrincipalID: userID,
		PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
			Version: "2012-10-17",
			Statement: []events.IAMPolicyStatement{
				{
					Action:   []string{"execute-api:Invoke"},
					Effect:   "Allow",
					Resource: []string{buildResourceArn(req)},
				},
			},
		},
		Context: map[string]interface{}{
			"userId": userID,
			"role":   role,
			"email":  email,
		},
	}, nil
}

// deny generates an IAM DENY policy
func deny(req events.APIGatewayCustomAuthorizerRequestTypeRequest) (events.APIGatewayCustomAuthorizerResponse, error) {
	return events.APIGatewayCustomAuthorizerResponse{
		PrincipalID: "anonymous",
		PolicyDocument: events.APIGatewayCustomAuthorizerPolicy{
			Version: "2012-10-17",
			Statement: []events.IAMPolicyStatement{
				{
					Action:   []string{"execute-api:Invoke"},
					Effect:   "Deny",
					Resource: []string{buildResourceArn(req)},
				},
			},
		},
	}, nil
}

// buildResourceArn constructs the API Gateway resource ARN for the policy
// Using wildcard (/*) allows the cached policy to cover all methods/stages
func buildResourceArn(req events.APIGatewayCustomAuthorizerRequestTypeRequest) string {
	arn := req.MethodArn
	if arn == "" {
		return "arn:aws:execute-api:*:*:*"
	}
	// Replace specific method/path with wildcard for policy caching
	// ARN format: arn:aws:execute-api:{region}:{accountId}:{apiId}/{stage}/{method}/{resource}
	parts := strings.SplitN(arn, "/", 2)
	if len(parts) == 2 {
		return parts[0] + "/*"
	}
	return arn
}

func main() {
	localserver.LoadEnvAndSyncJWT("Authorizer")
	lambda.Start(Handler)
}
