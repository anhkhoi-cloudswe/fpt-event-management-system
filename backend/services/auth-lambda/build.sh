#!/bin/bash

# Build script for auth-lambda

echo "Building auth-lambda..."

# Set environment variables for Lambda
export GOOS=linux
export GOARCH=amd64
export CGO_ENABLED=0

# Build
cd services/auth-lambda
go build -o bootstrap main.go

# Create deployment package
zip auth-lambda.zip bootstrap

echo "Build complete: auth-lambda.zip"
echo "Deploy this file to AWS Lambda"
