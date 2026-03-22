# FPT Event Management System

Production-oriented event management platform for FPT University.

Status snapshot (2026-03-22):
- Architecture: Go microservices (Lambda style) + React frontend
- Runtime modes: local Docker Compose, local multi-process, AWS Lambda Container Image
- Core capabilities: event approval workflow, wallet + VNPay payment, QR check-in, reporting, S3 media upload

## 1) Why this project exists

This system covers the full event lifecycle:
1. Organizer submits event request and books venue area.
2. Admin approves request and opens ticket sales.
3. Student purchases ticket via Wallet or VNPay.
4. System issues PDF + QR ticket and sends email notification.
5. Staff scans QR at check-in and updates attendance/reports.

Design targets:
- High data integrity for payment/ticket flows
- Good concurrency behavior under simultaneous purchases
- Low storage waste and clear operational ownership

## 2) Current architecture (what is actually in code)

Backend services (6):
1. Auth service
2. Event service
3. Ticket service
4. Venue service
5. Staff service
6. Notification service

Gateway and communication:
- External traffic enters through gateway (local: port 8080).
- Gateway routes requests by path prefix to service containers/processes.
- Internal service calls use InternalClient with:
  - JWT/context propagation
  - Exponential backoff retry
  - Internal token header for service-to-service auth (`X-Internal-Token`)

Data and infrastructure:
- MySQL 8.0
- AWS S3 for media upload
- AWS SAM template for Lambda deployment
- Structured logging + optional X-Ray integration in AWS runtime

## 3) Important technical patterns

1. Saga-like wallet flow (`reserve -> confirm -> release`) for safer distributed payment handling.
2. API composition for cross-domain data aggregation instead of direct cross-service coupling.
3. Row-level lock (`SELECT ... FOR UPDATE`) in payment-sensitive operations.
4. Background schedulers for cleanup:
   - Event cleanup
   - Expired request cleanup
   - Pending ticket cleanup
   - Venue release
5. Feature flags to control migration and fallback behavior.

## 4) Repository structure (reviewer map)

```text
backend/
  cmd/
    gateway/           # reverse proxy entrypoint (route by prefix)
    local-api/         # single local process adapter for all handlers
  common/
    config/            # feature flags + system config
    db/                # DB init/pool
    jwt/               # auth token utilities
    storage/           # S3 upload helpers
    scheduler/         # shared scheduler jobs
    utils/             # internal client, internal auth token checks
  services/
    auth-lambda/
    event-lambda/
    ticket-lambda/
    venue-lambda/
    staff-lambda/
    notification-lambda/
  template.yaml        # AWS SAM resources

frontend/
  src/
    pages/             # route pages
    components/        # reusable UI
    hooks/             # data logic
    contexts/          # auth context
    services/          # API clients
    utils/             # helpers including image upload

Database/
  initdb.d/            # container bootstrap SQL/scripts

docker-compose.yml     # local 9-container topology
```

## 5) Run locally (recommended path)

Prerequisites:
- Docker Desktop (or Docker Engine + Compose)

Steps:
1. Prepare environment file at repository root:
   - Create `.env` from your own secure values.
   - Do not commit `.env`.
2. Start the stack:

```bash
docker compose up --build
```

3. Main endpoints:
- Frontend: `http://localhost:3000`
- Gateway: `http://localhost:8080`
- MySQL host port: `127.0.0.1:3306`

Stop commands:

```bash
docker compose down
docker compose down -v   # WARNING: removes DB volume
```

## 6) Run locally without Docker (developer mode)

Prerequisites:
- Go 1.25+
- Node.js 20+
- MySQL 8.0

Backend (single local API adapter mode):

```bash
cd backend
go run ./cmd/local-api
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Notes:
- Frontend talks to `/api/*` and should be proxied to backend gateway/local API as configured.
- Ensure required env vars exist before running.

## 7) Environment and secret policy

This repository is documented for reviewers, but secret values must never be exposed.

Rules:
1. Never commit actual credentials, tokens, private keys, or provider secrets.
2. Keep secrets only in local `.env`, cloud secret manager, or CI secret store.
3. Use placeholders in docs, for example:

```env
DB_HOST=<your-db-host>
DB_USER=<your-db-user>
DB_PASSWORD=<your-db-password>
JWT_SECRET=<your-jwt-secret>
INTERNAL_AUTH_TOKEN=<shared-internal-token>
AWS_REGION=<aws-region>
S3_BUCKET=<bucket-name>
SMTP_USERNAME=<smtp-username>
SMTP_PASSWORD=<smtp-password>
VNPAY_TMN_CODE=<vnpay-terminal-code>
VNPAY_HASH_SECRET=<vnpay-secret>
```

4. Do not paste real secrets into issues, PR comments, or screenshots.
5. Rotate any credential immediately if accidental exposure is suspected.

## 8) API overview

Public API groups (via gateway):
- Auth: login/register/me/logout
- Event + Event Request workflows
- Tickets/Registrations/Bills/Wallet
- Venue/Seat operations
- Staff check-in and reports

Internal endpoints:
- `/internal/*` routes are for service-to-service calls only.
- Protected by `X-Internal-Token` validation.

## 9) What reviewers can inspect quickly

Recommended reading order:
1. `TECHNICAL_SUMMARY.md` for architecture and design patterns.
2. `TECHNICAL_REPORT.md` for full migration and operational details.
3. `docker-compose.yml` for local topology and dependencies.
4. `backend/cmd/gateway/main.go` for route mapping and gateway behavior.
5. `backend/common/utils/internal_client.go` and `backend/common/utils/internal_auth.go` for internal call security.
6. `backend/services/ticket-lambda` for wallet/payment and ticket lifecycle logic.

## 10) Known boundaries and roadmap direction

Current state:
- Microservice-style separation at service layer is in place.
- Some legacy compatibility paths still exist for migration safety.

Planned/ongoing hardening directions:
1. Continue reducing legacy path dependency.
2. Expand automated test coverage for payment and concurrency scenarios.
3. Strengthen deployment checks (security scan + config validation in CI).

## 11) License and usage

Private project for FPT OJT context.
Unauthorized redistribution or commercial reuse is not allowed.

---

Last updated: 2026-03-22
Maintainer context: FPT OJT Event Management team
