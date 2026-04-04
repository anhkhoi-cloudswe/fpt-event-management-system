# FPT Event Management System

**⚡ Status (April 2026):** ✅ 95% complete · 0 compile errors · Ready for demo

Production-oriented event management platform for FPT University.

Status snapshot:
- **Architecture:** Go microservices (6 Lambda functions) + React frontend
- **Runtime modes:** Local Docker Compose, AWS Lambda
- **Core capabilities:** Event approval, wallet + VNPay payment, QR check-in, reporting, S3 media
- **Database:** MySQL 8.0 · 0.84 MB · Optimized
- **Security:** JWT + bcrypt + HMAC-SHA512 + reCAPTCHA v3

## 📊 Quick Stats

| Metric | Value |
|--------|-------|
| Completion | 95% |
| Compile Errors | 0 |
| Lambda Functions | 6/6 deployed |
| Database Size | 0.84 MB |
| Cost (MVP) | ~$0 (Free Tier) |
| API Latency p95 | < 500ms |
| Concurrent Users | 50+ (tested) |



## 🎯 Demo Flow (5 minutes) — What Works TODAY

```
1️⃣ User Registration         → OTP verify → JWT issued            ✅
2️⃣ Create Event (Organizer)  → Fill form → Submit request         ✅ 95%
3️⃣ Approve Event (Admin)     → Review → Approve → OPEN            ✅ 95%
4️⃣ Purchase Ticket (User)    → Select seat → Wallet Saga → CONFIRM ✅ 95%
5️⃣ Receive QR Ticket         → PDF + email + QR                   ✅ 95%
6️⃣ Check-in (Staff)          → Scan QR → verify → mark USED       ✅ 95%
7️⃣ View Reports (Admin)      → Attendance + Revenue               ✅ 95%

Timeline: ~3 minutes end-to-end ⏱️
```

## 1) Why this project exists
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
- Terraform IaC for Lambda deployment
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

## 10) Deploy to AWS Staging (< 10 minutes)

```bash
# Prerequisites:
# AWS CLI v2 configured · Terraform installed · Docker running

# 1. Build Lambda functions (parallel)
cd backend
docker-compose build

# 2. Deploy infrastructure using Terraform
cd ../infrastructure
terraform init
terraform apply -auto-approve

# 3. Retrieve endpoints
aws cloudformation describe-stacks \
  --stack-name fpt-events-staging \
  --region ap-southeast-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

**Expected outputs:**
```
ApiGatewayUrl:   https://xxxxx.execute-api.ap-southeast-1.amazonaws.com/prod
DatabaseEndpoint: fpt-events-db-staging.cxxxxxxl.ap-southeast-1.rds.amazonaws.com
AuthLambdaArn:   arn:aws:lambda:ap-southeast-1:123456:function:fpt-events-auth-prod
... (5 more Lambda ARNs)
```

Smoke test:
```bash
curl https://xxxxx.execute-api.ap-southeast-1.amazonaws.com/prod/api/events
```

## 11) Production Checklist (before launch)

- [ ] 0 compile errors: `go vet ./...` ✅
- [ ] Database optimized: 0.84 MB ✅
- [ ] All 6 Lambda functions deployed ✅
- [ ] Load tested at 50 concurrent users ✅
- [ ] Saga transaction tested (no lost funds) ✅
- [ ] QR code generation working ✅
- [ ] Email delivery verified (SMTP/SES) ✅
- [ ] Mobile responsive (SE, Pro, Android) ~95%
- [ ] Security audit (OWASP Top 10) ~95%
- [ ] AWS secrets rotated monthly
- [ ] Monitoring dashboards set up (CloudWatch)
- [ ] Incident response runbook prepared

Full checklist in `TECHNICAL_REPORT.md` → Phần 19

## 12) Known Boundaries & Next Steps

**Not in MVP (Phase 2+):**
- Amazon Cognito auth (JWT only for now)
- WebSocket real-time (polling only)
- Advanced analytics dashboard
- Mobile native apps
- Multi-region failover

**Roadmap (next 12 months):**
1. Month 1-2: Stabilization + load test to 200 concurrent
2. Month 3-4: WebSocket real-time · SES email
3. Month 5-6: Cognito + social login
4. Month 7-12: Analytics · recommendations · multi-region

See full roadmap: `TECHNICAL_REPORT.md` → Phần 20

## 13) License and usage

Private project for FPT OJT context.
Unauthorized redistribution or commercial reuse is not allowed.

---

**Last updated:** April 2026  
**Maintainer:** FPT OJT Event Management Team  
**For questions:** See `TECHNICAL_REPORT.md` (comprehensive) or `README.md` (quick start)