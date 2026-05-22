#!/bin/bash
set -e

SERVICE_NAME="ticket-lambda"
echo "Building ${SERVICE_NAME}..."

# Navigate to module root (backend/) relative to this script
cd "$(dirname "$0")/../.."

export GOOS=linux
export GOARCH=arm64
export CGO_ENABLED=0

# Clean previous artifacts
rm -f "services/${SERVICE_NAME}/bootstrap"
rm -f "services/${SERVICE_NAME}/${SERVICE_NAME}.zip"

go build -tags lambda.norpc -o "services/${SERVICE_NAME}/bootstrap" "./services/${SERVICE_NAME}/"

echo "Build complete: services/${SERVICE_NAME}/bootstrap"

# Create deployment package
cd "services/${SERVICE_NAME}"
zip "${SERVICE_NAME}.zip" bootstrap

echo "Deployment package: ${SERVICE_NAME}.zip"
