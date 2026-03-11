# =============================================================================
# FPT Event Management System — Multi-stage Dockerfile
# =============================================================================
#
# Build args:
#   SERVICE    — human label (e.g. gateway, auth-lambda). Used only for metadata.
#   BUILD_PATH — Go package to build (e.g. ./cmd/gateway, ./services/auth-lambda)
#   GOARCH     — amd64 (default, local x86 dev) | arm64 (Lambda Graviton2 / ECR)
#
# Targets:
#   local  — ultra-slim Alpine image (~20-30 MB). Used by docker-compose locally.
#   lambda — AWS Lambda Container Image base (provided.al2023). Push to ECR.
#
# Examples:
#   # Local dev (built automatically by docker-compose):
#   docker build --target local \
#     --build-arg BUILD_PATH=./services/auth-lambda \
#     -t fpt-auth:local .
#
#   # ECR / Lambda (arm64 Graviton2):
#   docker build --target lambda \
#     --build-arg BUILD_PATH=./services/auth-lambda \
#     --build-arg GOARCH=arm64 \
#     -t <account>.dkr.ecr.ap-southeast-1.amazonaws.com/fpt-auth:latest .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Builder — compile a fully static Go binary
# -----------------------------------------------------------------------------
FROM golang:1.24-alpine AS builder

ARG SERVICE=gateway
ARG BUILD_PATH=./cmd/gateway
ARG GOARCH=amd64

# git is required for `go mod download` on modules hosted on VCS
RUN apk add --no-cache git

WORKDIR /build

# --- dependency layer (cached unless go.mod / go.sum change) -----------------
COPY go.mod go.sum ./
RUN go mod download

# --- full source copy ---------------------------------------------------------
COPY . .

# Build a static binary:
#   CGO_ENABLED=0   → no C runtime dependency, works in scratch/alpine/al2023
#   -ldflags="-s -w" → strip debug symbols → smaller binary
#   -tags lambda.norpc → disable Lambda RPC transport (same as build.sh)
RUN CGO_ENABLED=0 \
    GOOS=linux \
    GOARCH=${GOARCH} \
    go build \
    -ldflags="-s -w" \
    -tags lambda.norpc \
    -o /app/service \
    ${BUILD_PATH}

# Label the image with the service name for observability
LABEL service=${SERVICE}

# =============================================================================
# Stage 2a: LOCAL DEV — Alpine, ~20-30 MB final image
# =============================================================================
FROM alpine:3.21 AS local

# ca-certificates → HTTPS calls to AWS SDK, SMTP, VNPay, reCAPTCHA
# tzdata          → Asia/Ho_Chi_Minh timezone support for schedulers
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/service ./service

# Default port — overridden per-service by LOCAL_PORT env var in docker-compose
EXPOSE 8080

# The binary auto-detects local mode:
#   IsLocal() = (AWS_LAMBDA_FUNCTION_NAME == "") → starts HTTP server
#   Otherwise                                    → starts lambda.Start()
ENTRYPOINT ["./service"]

# =============================================================================
# Stage 2b: AWS LAMBDA CONTAINER IMAGE
# Uses the official Lambda provided runtime base (al2023, arm64-compatible).
# Binary is placed at /var/task/bootstrap — Lambda naming convention.
# Push to ECR, then set Lambda image URI in template.yaml / console.
# =============================================================================
FROM public.ecr.aws/lambda/provided:al2023 AS lambda

COPY --from=builder /app/service /var/task/bootstrap

# Lambda sets AWS_LAMBDA_FUNCTION_NAME automatically at runtime,
# so the binary's IsLocal() returns false → lambda.Start(Handler) runs.
CMD ["bootstrap"]
