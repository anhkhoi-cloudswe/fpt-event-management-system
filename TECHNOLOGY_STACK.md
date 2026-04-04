# 🏗️ FPT EVENT MANAGEMENT SYSTEM — Technology Stack & Architecture

**Version:** 1.0  
**Last Updated:** April 4, 2026  
**Status:** ✅ Production Ready (95% complete)

---

## 📑 Table of Contents

1. [System Overview](#system-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture Design](#architecture-design)
4. [Backend Stack](#backend-stack)
5. [Frontend Stack](#frontend-stack)
6. [Database & Storage](#database--storage)
7. [DevOps & Infrastructure](#devops--infrastructure)
8. [Communication Patterns](#communication-patterns)
9. [Security & Authentication](#security--authentication)
10. [Deployment Architecture](#deployment-architecture)

---

## System Overview

**FPT Event Management System** is a production-grade microservices platform designed to manage the complete event lifecycle at FPT University.

### Core Capabilities
- 🎫 Event submission and approval workflow
- 💰 Multi-method payment processing (Wallet + VNPay)
- 🎫 QR code ticket generation and PDF delivery
- ✅ Real-time check-in and attendance tracking
- 📊 Comprehensive reporting & analytics
- 🖼️ Media management (S3 image upload)
- 🔐 Role-based access control (Admin, Organizer, User, Staff)

### Project Metrics
| Metric | Value | Target |
|--------|-------|--------|
| **Completion** | ✅ 95% | 100% |
| **Compilation Errors** | 0 | 0 |
| **Database Size** | 0.84 MB | ≤ 1 MB |
| **Lambda Functions** | 6/6 | 6/6 |
| **Concurrent Users** | 50+ | 100+ |
| **Response Time (p99)** | < 500ms | < 1s |

---

## Technology Stack

### Quick Reference

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Backend** | Go | 1.25.0 | Core microservices |
| **Web Framework** | Gin Gonic | 1.10 | HTTP routing & middleware |
| **Frontend** | React | 18.2.0 | UI framework |
| **Build Tool** | Vite | 5.0.8 | Bundle & HMR (< 300ms) |
| **Language** | TypeScript | 5.2.2 | Type-safe JavaScript |
| **Styling** | Tailwind CSS | 3.3.6 | Utility-first CSS |
| **ORM** | GORM | 1.25.11 | Database abstraction |
| **Database** | MySQL | 8.0 | Relational data |
| **Cache** | Redis | Alpine | OTP & event cache |
| **Queue** | AWS SQS | (via LocalStack) | Async messaging |
| **File Storage** | AWS S3 | (v2 SDK) | Media uploads |
| **Monitoring** | AWS X-Ray | 1.8.5 | Distributed tracing |
| **IaC** | Terraform | Latest | Infrastructure provisioning |
| **Container** | Docker | Latest | Containerization |

---

## Architecture Design

### 📐 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Vite)                  │
│                    (Vercel / S3 + CloudFront)                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway (ALB)                          │
│              Route by path prefix to microservices              │
└──────────────────────────────┬──────────────────────────────────┘
                               │
        ┌──────────┬──────────┬┴─┬──────────┬──────────┐
        ▼          ▼          ▼  ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │  Auth  │ │ Event  │ │Ticket  │ │ Venue  │ │ Staff  │ │Notif.  │
    │Service │ │Service │ │Service │ │Service │ │Service │ │Service │
    │(8081)  │ │(8082)  │ │(8083)  │ │(8084)  │ │(8085)  │ │(8086)  │
    └────────┘ └────────┘ └────────┘ └────────┘ └────────┘ └────────┘
        │          │          │          │          │          │
        └──────────┴──────────┴┬─────────┴──────────┴──────────┘
                               │ Service-to-Service
                               ▼ (InternalClient)
                    ┌──────────────────────┐
                    │    MySQL 8.0 (RDS)   │
                    │   Private Subnet     │
                    └──────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
    ┌────────┐           ┌────────┐            ┌────────┐
    │ Redis  │           │   S3   │            │LocalStack
    │(Cache) │           │(Media) │            │(SQS Dev)
    └────────┘           └────────┘            └────────┘
```

### 🔄 Service Communication

**Two modes of inter-service communication:**

1. **Sync HTTP** (InternalClient)
   - Service-to-service REST calls over HTTP
   - Automatic retry with exponential backoff
   - Internal token header (`X-Internal-Token`) for authentication
   - JWT propagation through context

2. **Async Queue** (SQS)
   - Notification service consumes from SQS
   - Saga pattern for wallet reserve → confirm → release flow
   - Handles payment state coordination across services

### 🎯 Microservices Architecture

#### 6 Microservices

| Service | Port | Responsibility | Key Dependencies |
|---------|------|-----------------|------------------|
| **Auth** | 8081 | JWT generation, OTP verification, login | MySQL, Redis, reCAPTCHA |
| **Event** | 8082 | Event CRUD, approval workflow, search | MySQL, Cache |
| **Ticket** | 8083 | Ticket purchase, wallet saga, seat allocation | MySQL, SQS, VNPay, S3 |
| **Venue** | 8084 | Venue & area management, capacity | MySQL |
| **Staff** | 8085 | QR check-in, attendance report, statistics | MySQL |
| **Notification** | 8086 | Email delivery, PDF generation, SQS polling | MySQL, SMTP, S3, SQS |

---

## Backend Stack

### Go Microservices (1.25.0)

#### Core Dependencies

```go
// Web Framework
github.com/gin-gonic/gin v1.10.1

// Database
gorm.io/gorm v1.25.11
gorm.io/driver/mysql v1.5.7
github.com/go-sql-driver/mysql v1.9.3

// AWS Services
github.com/aws/aws-lambda-go v1.47.0
github.com/aws/aws-sdk-go-v2 v1.41.3
github.com/aws/aws-sdk-go-v2/service/lambda v1.88.2
github.com/aws/aws-sdk-go-v2/service/s3 v1.96.4
github.com/aws/aws-sdk-go-v2/service/ssm v1.68.2
github.com/aws/aws-xray-sdk-go v1.8.5

// JWT & Security
github.com/golang-jwt/jwt/v5 v5.3.1
golang.org/x/crypto v0.49.0

// PDF & QR Code Generation
github.com/jung-kurt/gofpdf v1.16.2
github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e

// Utilities
github.com/joho/godotenv v1.5.1
golang.org/x/time v0.6.0
github.com/google/uuid (implied for ID generation)
```

#### Project Structure

```
backend/
├── cmd/
│   ├── gateway/              # API Gateway (reverse proxy)
│   └── local-api/            # Single executable for local dev
├── common/
│   ├── config/               # Feature flags, system config
│   ├── db/                   # Database initialization
│   ├── jwt/                  # JWT utilities
│   ├── storage/              # S3 upload helpers
│   ├── scheduler/            # Background jobs
│   ├── email/                # SMTP email client
│   ├── pdf/                  # PDF generation (gofpdf)
│   ├── qrcode/               # QR code generation
│   ├── logger/               # Structured logging
│   ├── models/               # Domain models
│   ├── utils/                # InternalClient, helpers
│   └── response/             # HTTP response wrapper
├── services/
│   ├── auth-lambda/          # Auth service entry point
│   ├── event-lambda/         # Event service entry point
│   ├── ticket-lambda/        # Ticket service entry point
│   ├── venue-lambda/         # Venue service entry point
│   ├── staff-lambda/         # Staff service entry point
│   └── notification-lambda/  # Notification service entry point
├── internal/
│   ├── auth/                 # Auth business logic
│   ├── event/                # Event business logic
│   ├── ticket/               # Ticket business logic
│   └── ...                   # Other domain services
├── go.mod                    # Dependency management
└── internal/                 # Business logic services
```

### Key Technical Patterns

#### 1. **Saga Pattern (Wallet Reserve → Confirm → Release)**
```
User Purchase Flow:
  1. POST /wallet/reserve
     → Row-level lock (SELECT FOR UPDATE)
     → Check balance
     → Create reserve record with ID
     → Return reserve ID
  
  2. User confirms in UI
     → POST /wallet/confirm with reserve ID
     → Decrement balance
     → Mark reserve as confirmed
  
  3. If cancelled:
     → POST /wallet/release
     → Return reserved amount
     → Mark reserve as released
```

**Benefit:** Zero lost funds, atomic transactions with compensation

#### 2. **Seat Allocation (No Double-Booking)**
- 10×10 seat matrix per venue area
- VIP seats reserved first
- `INSERT IGNORE` prevents duplicate allocation
- Row-level locks for concurrent purchases

#### 3. **Internal Service Communication**
```go
// Example: Auth service calling Event service
invocation := internal.InvocationRequest{
  Service: "event",
  Path: "/internal/events",
  Headers: map[string]string{
    "X-Internal-Token": os.Getenv("INTERNAL_AUTH_TOKEN"),
  },
}
resp := internalClient.Invoke(ctx, invocation)
```

#### 4. **Feature Flags (Zero-Downtime Rollback)**
- 10+ feature flags stored in `feature_flags.go`
- Toggle behavior without redeploy
- Examples: payment method, email notification, report display

#### 5. **Background Schedulers**
Runs on startup, executes periodic tasks:
- **Event cleanup:** Auto-close events after 24h
- **Request cleanup:** Remove pending requests
- **Ticket cleanup:** Delete abandoned tickets
- **Venue release:** Reset capacity counters

---

## Frontend Stack

### React + TypeScript + Vite

#### Dependencies

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",    // Client-side routing
    "axios": "^1.6.2",                // HTTP client
    "react-google-recaptcha": "^3.1.0", // reCAPTCHA v3
    "date-fns": "^2.30.0",           // Date manipulation
    "lucide-react": "^0.294.0",      // Icon library
    "qrcode.react": "^3.1.0",        // QR code display
    "html5-qrcode": "^2.3.8",        // QR code scanner for check-in
    "recharts": "^2.10.3",           // Charts for reports
    "@supabase/supabase-js": "^2.86.2", // (optional) Supabase client
  },
  "devDependencies": {
    "typescript": "^5.2.2",
    "vite": "^5.0.8",
    "tailwindcss": "^3.3.6",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "@playwright/test": "^1.58.2",    // E2E testing
    "eslint": "^8.55.0",              // Linting
  }
}
```

#### Project Structure

```
frontend/
├── src/
│   ├── pages/                 # Route pages (event, ticket, report, etc.)
│   ├── components/            # Reusable UI components
│   ├── hooks/                 # Custom React hooks (data fetching, auth)
│   ├── contexts/              # Auth context for user state
│   ├── services/              # API client configurations
│   ├── types/                 # TypeScript interfaces
│   ├── utils/                 # Helper functions (image upload, formatters)
│   ├── assets/                # Images, icons
│   ├── App.tsx                # Root component
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles
├── public/                    # Static assets
├── tests/
│   ├── ticket-purchase.spec.ts # E2E test (Playwright)
│   ├── localStorage-security-test.js
│   └── example.spec.ts
├── vite.config.ts             # Vite configuration
├── tailwind.config.js         # Tailwind CSS config
├── tsconfig.json              # TypeScript config
├── playwright.config.ts       # Playwright E2E config
└── package.json
```

#### Build Performance

- **HMR:** < 300ms (hot module replacement)
- **Bundle Size:** ~150 KB (gzipped)
- **Deployment:** Vercel (automatic on push)
- **Build Time:** < 5s

#### Key UI Features

- 📱 Responsive design (mobile-first)
- 🎨 Tailwind CSS utility styling
- 📊 Charts via Recharts
- 🔐 reCAPTCHA v3 integration
- 📷 QR code scanner (html5-qrcode)
- ✅ Form validation with Axios error handling
- 💾 LocalStorage for user preferences (with security considerations)

---

## Database & Storage

### MySQL 8.0 (RDS)

#### Configuration

```yaml
Engine: MySQL 8.0
Deployment: AWS RDS (Private Subnet)
Collation: utf8mb4_unicode_ci (Vietnamese + emoji support)
Case Sensitivity: false (lower-case-table-names=1)
Max Connections: 100 (connection pooling via GORM)
Backup: Automated daily snapshots
```

#### Schema Highlights

```sql
-- Key Tables
Users              -- Accounts + authentication
Events             -- Event master data
EventAreas         -- Seat categories (VIP, Standard)
Seats              -- 10×10 matrix per area
Tickets            -- Purchase records (PENDING → CONFIRMED → USED)
Wallets            -- User balance + transaction history
Venues             -- Location master data
StaffAccounts      -- Staff check-in accounts
Notifications      -- Delivery status tracking
AdminRequests      -- Event approval workflow
```

#### Size Optimization

- Current: **0.84 MB** (far below 1 MB target)
- Minimal seed data (900+ seats auto-generated per venue)
- Efficient indexing on frequently queried columns

#### GORM Integration

```go
import "gorm.io/gorm"
import "gorm.io/driver/mysql"

// Auto-migration on startup
db.AutoMigrate(&User{}, &Event{}, &Ticket{}, ...)

// Connection pooling configured via env
db.DB().SetMaxOpenConns(25)
db.DB().SetMaxIdleConns(5)
```

### Redis (Cache Layer)

**Purpose:** OTP storage, event cache, session management

**Configuration:**
- Image: `redis:alpine`
- Port: 6379 (localhost only in Docker Compose)
- Persistence: Optional (RDB snapshots)

**Key-Value Examples:**
```
otp:user@fpt.edu.vn       → "123456" (TTL: 5 min)
event:12345               → JSON event object (TTL: 1 hour)
session:jwt_token         → user metadata (TTL: 24h)
```

### AWS S3 (Media Storage)

**Purpose:** Event poster images, user avatars, ticket PDFs

**Configuration:**
- Bucket: Private (CloudFront for public access)
- Lifecycle: Auto-delete old PDFs after 30 days
- Encryption: AES-256

**Upload Flow:**
```go
// Frontend → Presigned URL (from backend)
// Browser → S3 direct upload
// Backend confirms storage
```

---

## DevOps & Infrastructure

### 🐳 Docker & Docker Compose

#### Local Development Stack (9 containers)

```yaml
services:
  mysql           # Database
  redis           # Cache
  localstack      # SQS emulation
  auth-service    # Microservice
  event-service   # Microservice
  ticket-service  # Microservice
  venue-service   # Microservice
  staff-service   # Microservice
  notification-service  # Microservice
  gateway         # API Gateway
  frontend        # React UI
```

#### Dockerfile Strategy

```dockerfile
# Multi-stage build optimizes final image size

FROM golang:1.25-alpine AS build
# Build phase (compiles Go binary)

FROM alpine:latest AS local
# Local dev target (~25 MB)

FROM scratch AS prod
# Production target (~5 MB, no shell/utils)
```

**Benefits:**
- Local images include debugging tools
- Production images minimal attack surface
- Same Dockerfile for both modes

### Infrastructure as Code (Terraform)

#### AWS Resources Managed

```hcl
# Network
resource "aws_vpc" "main"
resource "aws_subnet" "public"   # ALB, Bastion
resource "aws_subnet" "private"  # RDS, ECS

# Compute
resource "aws_ecs_cluster"
resource "aws_ecs_task_definition"
resource "aws_ecs_service"

# Database
resource "aws_db_instance" "mysql"  # RDS

# Load Balancing
resource "aws_lb" "main"  # Application Load Balancer
resource "aws_route53_record"  # DNS routing

# Security
resource "aws_security_group"
resource "aws_acm_certificate"  # HTTPS

# Storage
resource "aws_s3_bucket"  # Media uploads
resource "aws_cloudfront_distribution"  # CDN

# Bastion
resource "aws_instance" "bastion"  # SSH tunnel for DB access
```

#### Deployment Flow

```bash
# 1. Initialize Terraform
terraform init

# 2. Plan changes
terraform plan

# 3. Apply infrastructure
terraform apply

# 4. SSH Tunnel to RDS
ssh -i fpt-bastion-ssh -L 3306:rds-hostname:3306 \
  ec2-user@bastion-public-ip -N

# 5. Deploy containers
./scripts/deploy-ecr.sh
```

### 🐨 Terraform (Infrastructure as Code)

#### Lambda Function Configuration via Terraform

```hcl
# infrastructure/ecs.tf or lambda.tf
resource "aws_lambda_function" "auth_lambda" {
  filename         = "../backend/event-lambda/bootstrap.zip"
  function_name    = "fpt-auth-service"
  role            = aws_iam_role.lambda_role.arn
  handler         = "bootstrap"
  runtime         = "provided.al2"
  timeout         = 60
  memory_size     = 512
  architectures   = ["arm64"]

  environment {
    variables = {
      FEATURE_FLAGS = "true"
      DB_HOST       = aws_db_instance.mysql.endpoint
      DB_PASSWORD   = var.db_password
      JWT_SECRET    = var.jwt_secret
    }
  }
}
```

#### VPC & Networking

```hcl
# Infrastructure/network.tf
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
}

resource "aws_subnet" "lambda" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "ap-southeast-1a"
}
```

  # 6 Lambda functions total
```

**Benefits:**
- Infrastructure versioned in Git
- Environment parity (Dev ≈ Prod)
- Quick rollback via CloudFormation

### CI/CD Pipeline

#### Build & Deployment Scripts

```bash
scripts/
├── deploy-ecr.sh     # Build containers → Push to ECR → Force ECS deployment
└── deploy-ecr.ps1   # Windows PowerShell version
```

**Workflow:**
```
1. Code commit → GitHub
2. ECR login via AWS credentials
3. Docker build (per service)
4. Push images to AWS ECR
5. Update ECS task definition
6. Force ECS service redeploy
7. CloudWatch logs streaming
```

---

## Communication Patterns

### HTTP APIs (REST + JSON)

#### Gateway Routing

```
Request → ALB (port 80/443)
  ↓
API Gateway (port 8080)
  ↓
Route by path prefix:
  /auth/*          → :8081 (Auth Service)
  /events/*        → :8082 (Event Service)
  /tickets/*       → :8083 (Ticket Service)
  /venues/*        → :8084 (Venue Service)
  /staff/*         → :8085 (Staff Service)
  /notifications/* → :8086 (Notification Service)
```

#### Service-to-Service Communication

**Internal HTTP Calls (InternalClient):**

```go
// Example: Event service → Ticket service
type InocationRequest struct {
  Service string                 // "ticket"
  Path    string                 // "/internal/tickets"
  Method  string                 // "GET", "POST"
  Body    interface{}            // Request payload
  Headers map[string]string      // Custom headers
}

// Authentication
Headers["X-Internal-Token"] = os.Getenv("INTERNAL_AUTH_TOKEN")

// Retry policy
// Exponential backoff: 100ms → 200ms → 400ms → ...
```

### Asynchronous Messaging (SQS)

**For:** Email notifications, async task processing

**Flow:**
```
Ticket Service
  ↓ (SQS message)
LocalStack/SQS Queue
  ↓ (poll & consume)
Notification Service
  ↓ (process)
SMTP send + PDF generation + S3 upload
```

**Message Schema:**
```json
{
  "MessageId": "uuid",
  "EventSource": "aws:sqs",
  "Records": [
    {
      "Body": {
        "ticketID": 123,
        "userEmail": "user@fpt.edu.vn",
        "action": "send_ticket"
      }
    }
  ]
}
```

---

## Security & Authentication

### 🔐 Authentication Layers

#### 1. **User Authentication (JWT)**

```go
// JWT Token Structure
type Claims struct {
  UserID   int    `json:"user_id"`
  Email    string `json:"email"`
  Role     string `json:"role"`        // "admin", "organizer", "user", "staff"
  ExpiresAt int64 `json:"exp"`
}

// Token generation on login
jwt.SignedString(secretKey)

// Verification on each request
// Authorization: Bearer <token>
```

**Token Lifespan:** 24 hours

#### 2. **reCAPTCHA v3**

- Integration: Login form
- Score threshold: 0.5 (prevent bots)
- Security: Server-side verification

#### 3. **Internal Service Authentication**

```
Header: X-Internal-Token
Value: Environment variable (shared secret)
```

All inter-service calls require this token.

#### 4. **Password Hashing**

```go
import "golang.org/x/crypto/bcrypt"

// Hash passwords
hashedPassword := bcrypt.GenerateFromPassword(password, 10)

// Verify
bcrypt.CompareHashAndPassword(hashedPassword, password)
```

### 🛡️ Data Security

#### Encryption in Transit
- TLS 1.2+ (HTTPS everywhere)
- Certificate via AWS ACM

#### Encryption at Rest
- S3: AES-256 encryption
- RDS: AWS encryption enabled
- Secrets: AWS Secrets Manager / SSM Parameter Store

#### Sensitive Data Handling
- Payment tokens: Hashed before storage
- OTP: Stored in Redis (no persistence)
- Logs: PII masked via structured logging

---

## Deployment Architecture

### Local Development

```
┌─ Docker Compose ──────────────────┐
│                                   │
│  9 containers (see above)         │
│  Network: fpt-network (bridge)    │
│  Volumes: mysql-data, localstack- │
│  Env file: .env (local mode)      │
│                                   │
│  Access: localhost:8080 (gateway) │
│          localhost:3000 (frontend)│
└───────────────────────────────────┘
```

### Production (AWS)

```
┌─── AWS Cloud ──────────────────────────────┐
│                                            │
│  ┌─ Availability Zone 1 ─┐                 │
│  │ ┌─ Public Subnet ─┐   │                 │
│  │ │ ALB (port 443)  │   │                 │
│  │ │ Bastion Host    │   │                 │
│  │ └─────────────────┘   │                 │
│  │                       │                 │
│  │ ┌─ Private Subnet ──┐ │                 │
│  │ │ ECS Task 1        │ │                 │
│  │ │ (all 6 services)  │ │                 │
│  │ └───────────────────┘ │                 │
│  └───────────────────────┘                 │
│                                            │
│  ┌─ Availability Zone 2 (Failover) ──┐     │
│  │ ECS Task 2 (replica)              │     │
│  └───────────────────────────────────┘     │
│                                            │
│  ┌─ RDS Database (Multi-AZ) ───┐           │
│  │ MySQL 8.0                   │           │
│  │ Backup: Daily snapshots     │           │
│  └─────────────────────────────┘           │
│                                            │
│  ┌─ Storage & CDN ─────────────┐           │
│  │ S3 Bucket (media)           │           │
│  │ CloudFront (CDN)            │           │
│  └─────────────────────────────┘           │
│                                            │
│  ┌─ Caching & Logging ─────────┐           │
│  │ ElastiCache (Redis)         │           │
│  │ CloudWatch Logs             │           │
│  │ X-Ray Tracing               │           │
│  └─────────────────────────────┘           │
│                                            │
│  ┌─ DNS & Security ────────────┐           │
│  │ Route53 (DNS)               │           │
│  │ ACM (HTTPS certs)           │           │
│  │ WAF (DDoS protection)       │           │
│  └─────────────────────────────┘           │
│                                            │
└────────────────────────────────────────────┘
```

### Deployment Checklist

```
Prerequisites:
  ✅ AWS Account with IAM credentials
  ✅ Terraform installed
  ✅ AWS CLI configured
  ✅ Docker & Docker Compose

Infrastructure Setup:
  ✅ terraform init
  ✅ terraform apply
  ✅ SSH tunnel to RDS
  ✅ Database schema migration

Application Deployment:
  ✅ Build containers (docker build)
  ✅ Push to ECR (aws ecr push)
  ✅ Update ECS service (./scripts/deploy-ecr.sh)
  ✅ Verify health checks in CloudWatch

Post-Deployment:
  ✅ Health check all 6 microservices
  ✅ Verify database connectivity
  ✅ Test API Gateway routing
  ✅ Monitor X-Ray traces
  ✅ Set up CloudWatch alarms
```

---

## Monitoring & Observability

### AWS X-Ray

- **Tracing:** Distributed call graph across Lambda functions
- **Service Map:** Visualize inter-service communication
- **Latency Analysis:** Identify bottlenecks

### CloudWatch

- **Logs:** Structured logging from all services
- **Metrics:** Custom metrics (tickets sold, refund rate, etc.)
- **Alarms:** Automatic alerts for errors/latency

### Health Checks

Each service exposes `/health`:
```json
GET /health
{
  "status": "up",
  "service": "auth",
  "version": "1.0.0"
}
```

ALB auto-removes unhealthy instances.

---

## Performance Characteristics

### Latency (p99)

| Operation | Target | Actual |
|-----------|--------|--------|
| Login (Auth) | 200ms | 150ms |
| Event listing | 300ms | 200ms |
| Ticket purchase | 500ms | 400ms |
| Check-in (QR scan) | 100ms | 80ms |
| PDF generation | 2-3s | 2s |

### Throughput

- **Concurrent users:** 50+
- **Ticket purchases/sec:** 5-10
- **API requests/sec:** 100+

### Resource Utilization

- **Lambda cold start:** 500-800ms (first invocation)
- **Lambda warm:** < 10ms
- **Memory per instance:** 512 MB
- **CPU:** Shared (auto-scaled)

---

## Summary: Technology Landscape

| Component | Tech Stack | Rationale |
|-----------|-----------|-----------|
| **Language** | Go 1.25 | Fast, compiled, native concurrency |
| **Framework** | Gin Gonic | Minimal, performant HTTP router |
| **Frontend** | React 18 + TS | Type-safe, component-based UI |
| **Builder** | Vite | Fast HMR, modern bundling |
| **Database** | MySQL 8 | ACID compliance, complex joins |
| **ORM** | GORM | Clean API, auto-migration |
| **Cache** | Redis | Session, OTP, event cache |
| **Queue** | SQS | Async tasks, decoupled services |
| **Storage** | S3 | Scalable file storage, CDN-ready |
| **Container** | Docker | Consistent dev/prod environments |
| **IaC** | Terraform | Version-controlled infrastructure |
| **Compute** | Lambda/ECS | Serverless, auto-scaling |
| **Logging** | CloudWatch + X-Ray | Distributed tracing, debugging |
| **Security** | JWT + bcrypt + TLS | Industry standards |

---

## Next Steps & Roadmap

### Phase 2 (Q2 2026)

- [ ] Amazon Cognito integration (SSO)
- [ ] GraphQL API option
- [ ] Mobile app (React Native)
- [ ] Real-time notifications (WebSocket)
- [ ] Analytics dashboard (BI integration)

### Phase 3 (Q3 2026)

- [ ] AI recommendations (event suggestions)
- [ ] Payment settlement automation
- [ ] Automated refund processing
- [ ] Accessibility audit (WCAG compliance)

---

**Document Version:** 1.0  
**Last Updated:** April 4, 2026  
**Author:** Development Team  
**Status:** ✅ Production Ready
