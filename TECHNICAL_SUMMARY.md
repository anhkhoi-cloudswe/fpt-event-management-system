# BẢN TÓM TẮT KỸ THUẬT — FPT EVENT MANAGEMENT SYSTEM

# Technical Summary — FPT Event Management System

> **Dự án:** Hệ thống Quản lý Sự kiện FPT  
> **Kiến trúc:** Microservices trên AWS Lambda Container Image  
> **Ngày cập nhật:** 2026-03-12  
> **Stack:** Go 1.24 · Docker Compose · AWS SAM · API Gateway · RDS MySQL · S3 · CloudWatch

---

## MỤC LỤC

1. [Kiến trúc Microservices](#1-kiến-trúc-microservices)
2. [Saga Pattern — Quản lý Wallet](#2-saga-pattern--quản-lý-wallet)
3. [API Composition — Thay thế SQL JOIN](#3-api-composition--thay-thế-sql-join)
4. [Dependency Injection](#4-dependency-injection)
5. [Tổng kết các Design Pattern áp dụng](#5-tổng-kết-các-design-pattern-áp-dụng)
6. [Containerization — Docker & S3](#6-containerization--docker--s3)

---

## 1. KIẾN TRÚC MICROSERVICES

### 1.1 Tổng quan / Overview

Hệ thống được phân tách thành **6 microservices** độc lập, mỗi service được triển khai dưới dạng một AWS Lambda Function riêng biệt:

| # | Service | Chức năng chính | Lambda Function |
|---|---------|----------------|-----------------|
| 1 | **Auth Service** | Đăng ký, đăng nhập, OTP, quản lý tài khoản | `fpt-events-auth-prod` |
| 2 | **Event Service** | CRUD sự kiện, duyệt yêu cầu, thống kê | `fpt-events-event-prod` |
| 3 | **Ticket Service** | Mua vé, quản lý vé, thanh toán ví | `fpt-events-ticket-prod` |
| 4 | **Venue Service** | Quản lý địa điểm và khu vực | `fpt-events-venue-prod` |
| 5 | **Staff Service** | Check-in/out, hoàn tiền, báo cáo | `fpt-events-staff-prod` |
| 6 | **Notification Service** | Email, PDF vé, mã QR | `fpt-events-notification-prod` |

### 1.2 Kiến trúc triển khai / Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS CLOUD                                  │
│                                                                     │
│   ┌───────────────────┐            ┌───────────────────────┐        │
│   │  Public API GW    │            │  Internal API GW      │        │
│   │  /api/*           │            │  /internal/*          │        │
│   │  (Internet-facing)│            │  (VPC-private only)   │        │
│   └────────┬──────────┘            └──────────┬────────────┘        │
│            │                                  │                     │
│   ┌────────▼──────────────────────────────────▼────────────┐        │
│   │                    VPC (10.0.0.0/16)                   │        │
│   │                                                        │        │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │        │
│   │  │   Auth   │  │  Event   │  │  Ticket  │             │        │
│   │  │  Lambda  │  │  Lambda  │  │  Lambda  │             │        │
│   │  └──────────┘  └──────────┘  └──────────┘             │        │
│   │  ┌──────────┐  ┌──────────┐  ┌──────────┐             │        │
│   │  │  Venue   │  │  Staff   │  │  Notif   │             │        │
│   │  │  Lambda  │  │  Lambda  │  │  Lambda  │             │        │
│   │  └──────────┘  └──────────┘  └──────────┘             │        │
│   │                       │                                │        │
│   │              ┌────────▼────────┐                       │        │
│   │              │   RDS MySQL     │                       │        │
│   │              │   db.t3.micro   │                       │        │
│   │              └─────────────────┘                       │        │
│   └────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Giao tiếp giữa các Service / Inter-Service Communication

Hệ thống sử dụng **2 tầng API Gateway** (2-tier API Gateway):

- **Public API Gateway** (`/api/*`): Nhận request từ Internet (frontend, mobile). Có CORS, rate limiting.
- **Internal API Gateway** (`/internal/*`): Chỉ dùng cho giao tiếp service-to-service trong VPC. Không public.

Mỗi service giao tiếp với service khác thông qua **HTTP/REST** qua Internal API Gateway, sử dụng `InternalClient` — một HTTP client tự xây dựng với các tính năng:

| Tính năng | Mô tả |
|-----------|--------|
| **JWT Propagation** | Tự động truyền JWT token từ request gốc sang request nội bộ |
| **Retry Logic** | Retry tối đa 3 lần với Exponential Backoff (500ms → 1s → 2s) để xử lý Lambda Cold Start |
| **Timeout** | Mặc định 5 giây/request |
| **Context Propagation** | Truyền User ID, User Role qua HTTP headers (`X-User-Id`, `X-User-Role`, `X-Internal-Call`) |

**Code tham chiếu:** `backend/common/utils/internal_client.go`

### 1.4 Service Registry

Mỗi service lấy URL của service khác qua **Environment Variables**, với fallback về `localhost` khi chạy local:

```go
// backend/common/utils/service_registry.go
func GetAuthServiceURL() string {
    return getEnvOrDefault("AUTH_SERVICE_URL", "http://localhost:8080")
}
```

Trên AWS, các biến này được inject tự động bởi SAM template, trỏ đến Internal API Gateway:

```yaml
# template.yaml - Globals.Function.Environment
AUTH_SERVICE_URL: !Sub "https://${InternalApi}.execute-api.${AWS::Region}.amazonaws.com/${Environment}"
```

### 1.5 Feature Flags — Chuyển đổi an toàn Monolith → Microservices

Hệ thống sử dụng **10 Feature Flags** (biến môi trường) để bật/tắt từng tính năng microservices mà **không cần deploy lại**:

| Flag | Mục đích |
|------|----------|
| `USE_API_COMPOSITION` | Bật API Composition thay SQL JOIN |
| `VENUE_API_ENABLED` | Bật Venue Internal API |
| `AUTH_API_ENABLED` | Bật Auth Internal API |
| `TICKET_API_ENABLED` | Bật Ticket Internal API |
| `EVENT_API_ENABLED` | Bật Event Internal API |
| `WALLET_SERVICE_ENABLED` | Bật Wallet Service tách biệt |
| `SAGA_ENABLED` | Bật Saga Pattern cho distributed transactions |
| `NOTIFICATION_API_ENABLED` | Bật Notification Internal API |
| `SERVICE_SPECIFIC_SCHEDULER` | Bật scheduler riêng từng service |
| `SERVICE_SPECIFIC_DB` | Bật DB connection pool riêng từng service |

Chiến lược: Mặc định tất cả `= false` → giữ logic Monolith cũ. Bật dần từng flag khi sẵn sàng → **Zero-downtime migration**.

**Code tham chiếu:** `backend/common/config/feature_flags.go`

---

## 2. SAGA PATTERN — QUẢN LÝ WALLET

### 2.1 Vấn đề / The Problem

Khi người dùng mua vé bằng **ví điện tử (Wallet)**, có 2 bước cần thực hiện xuyên suốt nhiều service:

1. **Trừ tiền ví** (Ticket Service → gọi Wallet API)
2. **Tạo vé** (Ticket Service → ghi database)

Nếu bước 2 thất bại sau khi bước 1 đã thành công → tiền bị mất mà không có vé. Đây là bài toán **Distributed Transaction** kinh điển trong Microservices.

### 2.2 Giải pháp: Saga Pattern (Choreography-based)

Hệ thống áp dụng **Saga Pattern** với 3 bước: **Reserve → Confirm → Release (Compensation)**

```
┌─────────────────────────────────────────────────────────────────┐
│                  SAGA: MUA VÉ BẰNG VÍ                          │
│                                                                 │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │  1. RESERVE  │────►│ 2. CREATE   │────►│ 3. CONFIRM  │      │
│  │  Giữ tiền   │     │  Tạo vé     │     │ Xác nhận    │      │
│  │  tạm thời   │     │ trong DB    │     │ trừ tiền    │      │
│  └─────────────┘     └──────┬──────┘     └─────────────┘      │
│                             │                                   │
│                        ❌ Thất bại                              │
│                             │                                   │
│                      ┌──────▼──────┐                           │
│                      │  RELEASE    │                           │
│                      │  Hoàn tiền  │  ← Compensation           │
│                      │  về ví      │                           │
│                      └─────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Chi tiết 3 bước Saga

#### Bước 1: Reserve (Giữ tiền tạm)

```
POST /internal/wallet/reserve
{
    "userId": 123,
    "amount": 500000,
    "referenceType": "TICKET_PURCHASE",
    "referenceId": "event_1:category_2",
    "ttlSeconds": 300           ← Tự động hủy sau 5 phút nếu không confirm
}

Response → reservationId: "uuid-abc-123"
```

- Trừ tạm `amount` khỏi balance (lock tiền)
- Tạo `reservationId` (UUID) để track
- Có TTL: nếu quá thời gian mà không confirm/release → tự động release

#### Bước 2a: Confirm (Xác nhận — Happy Path)

```
POST /internal/wallet/confirm
{
    "reservationId": "uuid-abc-123",
    "userId": 123,
    "referenceId": "ticket_456,ticket_789"   ← Cập nhật sau khi tạo vé
}
```

- Xác nhận trừ tiền chính thức
- Ghi `WalletTransaction` (type=DEBIT) vào lịch sử

#### Bước 2b: Release (Hoàn tiền — Compensation)

```
POST /internal/wallet/release
{
    "reservationId": "uuid-abc-123",
    "userId": 123,
    "reason": "ticket_creation_failed"
}
```

- Hoàn trả tiền về ví (rollback)
- Không tạo record giao dịch DEBIT nào

### 2.4 Tại sao dùng Saga thay vì 2-Phase Commit?

| Tiêu chí | 2-Phase Commit (2PC) | Saga Pattern |
|----------|---------------------|-------------|
| Phù hợp Microservices | ❌ Không (cần DB coordinator) | ✅ Có |
| Latency | Cao (lock DB dài) | Thấp (async, từng bước) |
| Fault Tolerance | Kém (coordinator = SPOF) | Tốt (compensation tự động) |
| Complexity | Thấp (1 transaction) | Trung bình (cần compensation logic) |
| AWS Lambda compatible | ❌ Không (stateless) | ✅ Có (stateless, HTTP-based) |

### 2.5 Data Models

Wallet được tách thành 2 bảng riêng (tách khỏi `Users.Wallet` cũ):

```sql
-- Bảng Wallet (tách khỏi Users)
CREATE TABLE Wallet (
    wallet_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    balance DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'VND',
    status ENUM('ACTIVE','FROZEN','CLOSED') DEFAULT 'ACTIVE'
);

-- Bảng Wallet_Transaction (lịch sử giao dịch)
CREATE TABLE Wallet_Transaction (
    transaction_id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    type ENUM('CREDIT','DEBIT') NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_before DECIMAL(15,2),
    balance_after DECIMAL(15,2),
    reference_type VARCHAR(50),     -- TICKET_PURCHASE, REFUND, TOPUP
    reference_id VARCHAR(100),      -- ticket_ids, report_id
    description TEXT
);
```

**Code tham chiếu:** `backend/common/models/wallet.go`, `Database/wallet_migration.sql`

---

## 3. API COMPOSITION — THAY THẾ SQL JOIN

### 3.1 Vấn đề / The Problem

Trong kiến trúc Monolith, các query thường dùng **SQL JOIN** để kết hợp dữ liệu từ nhiều bảng:

```sql
-- Monolith: 1 query lấy vé + thông tin sự kiện + địa điểm
SELECT t.*, e.EventName, v.VenueName, va.AreaName
FROM Ticket t
JOIN Category_Ticket ct ON t.CategoryID = ct.CategoryID
JOIN Event e ON ct.EventID = e.EventID
JOIN Venue_Area va ON e.VenueAreaID = va.AreaID
JOIN Venue v ON va.VenueID = v.VenueID
WHERE t.UserID = ?
```

Trong Microservices, bảng `Ticket` thuộc **Ticket Service**, bảng `Event` thuộc **Event Service**, bảng `Venue` thuộc **Venue Service** → **Không thể JOIN trực tiếp** (vi phạm Database-per-Service).

### 3.2 Giải pháp: API Composition Pattern

Thay vì JOIN ở tầng SQL, ta **gọi API của từng service** rồi **ghép dữ liệu ở tầng application**:

```
┌──────────────────────────────────────────────────────────────┐
│                  API COMPOSITION FLOW                         │
│                                                              │
│  Client Request: GET /api/tickets/my-tickets                 │
│                          │                                   │
│                   ┌──────▼──────┐                            │
│                   │   Ticket    │                            │
│                   │   Service   │  ← Composer (điều phối)    │
│                   └──┬───┬───┬──┘                            │
│                      │   │   │                               │
│           ┌──────────┘   │   └──────────┐                    │
│           ▼              ▼              ▼                    │
│   ┌──────────────┐ ┌──────────┐ ┌──────────────┐            │
│   │ DB: Tickets  │ │  Event   │ │    Venue     │            │
│   │ (local query)│ │  Service │ │   Service    │            │
│   └──────────────┘ │  (HTTP)  │ │   (HTTP)     │            │
│                    └──────────┘ └──────────────┘            │
│           │              │              │                    │
│           └──────────────┼──────────────┘                    │
│                          ▼                                   │
│                   ┌─────────────┐                            │
│                   │  Merge data │  ← Ghép dữ liệu in-memory │
│                   │  in memory  │                            │
│                   └─────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Triển khai trong code

```go
// backend/services/ticket-lambda/usecase/ticket_usecase.go

func (uc *TicketUseCase) GetMyTickets(ctx context.Context, userID int) ([]models.MyTicketResponse, error) {
    // Feature Flag kiểm soát: bật/tắt không cần deploy lại
    if os.Getenv("USE_API_COMPOSITION") == "true" {
        // MICROSERVICES: API Composition
        return uc.ticketRepo.GetTicketsByUserIDComposed(ctx, userID)
    }
    // MONOLITH FALLBACK: SQL JOIN cũ
    return uc.ticketRepo.GetTicketsByUserID(ctx, userID)
}
```

Hàm `GetTicketsByUserIDComposed` thực hiện:

1. **Query local** — `SELECT * FROM Ticket WHERE UserID = ?` (chỉ bảng thuộc Ticket Service)
2. **Gọi Event Service** — `GET /internal/event/info?eventId=1,2,3` (lấy tên sự kiện)
3. **Gọi Venue Service** — `GET /internal/venue/info?venueId=4,5` (lấy tên địa điểm)
4. **Merge in-memory** — Ghép kết quả thành response hoàn chỉnh trả về client

### 3.4 So sánh SQL JOIN vs API Composition

| Tiêu chí | SQL JOIN (Monolith) | API Composition (Microservices) |
|----------|--------------------|---------------------------------|
| Hiệu năng | ✅ Nhanh (1 query) | 🟡 Chậm hơn (N+1 API calls) |
| Coupling | ❌ Tight (shared DB) | ✅ Loose (HTTP APIs) |
| Scalability | ❌ Không scale riêng | ✅ Scale độc lập từng service |
| Data Ownership | ❌ Vi phạm | ✅ Đúng nguyên tắc |
| Khả năng deploy | ❌ Deploy cùng lúc | ✅ Deploy độc lập |
| Consistency | ✅ Strong (ACID) | 🟡 Eventual consistency |

### 3.5 Thống kê Cross-Service JOINs cần refactor

Hệ thống hiện có **34 SQL JOINs** trải rộng qua 5 services cần thay thế:

| Service | Số JOIN | Cần gọi API từ |
|---------|---------|-----------------|
| Event Service | 15 | Venue, Auth, Ticket |
| Ticket Service | 8 | Event, Venue, Auth |
| Staff Service | 7 | Ticket, Event, Auth, Venue |
| Venue Service | 4 | Event |
| Auth Service | 0 | — |

**Code tham chiếu:** `MICROSERVICE_MIGRATION_REPORT.md` (phân tích chi tiết 34 JOINs)

---

## 4. DEPENDENCY INJECTION

### 4.1 Khái niệm / Concept

**Dependency Injection (DI)** là design pattern trong đó các dependency (database connection, HTTP client, logger...) được **inject từ bên ngoài** vào object, thay vì object tự tạo dependency bên trong.

Lợi ích:
- **Testability** — Dễ dàng mock dependency khi unit test
- **Loose Coupling** — Handler không phụ thuộc vào cách khởi tạo DB
- **Configurability** — Thay đổi cấu hình DB mà không sửa business logic

### 4.2 Triển khai trong hệ thống

Mỗi Lambda service áp dụng DI theo **3 tầng** (3-layer architecture):

```
┌─────────────────────────────────────────────────┐
│  main.go (Composition Root)                      │
│                                                  │
│  func init() {                                   │
│      dbConn := db.InitServiceDB("TICKET")       │  ← Tạo DB connection
│                                                  │
│      ticketHandler = handler.NewTicketHandler    │  ← Inject vào Handler
│          WithDB(dbConn)                          │
│  }                                               │
└──────────────────────┬──────────────────────────┘
                       │ inject dbConn
                       ▼
┌─────────────────────────────────────────────────┐
│  handler/ticket_handler.go                       │
│                                                  │
│  func NewTicketHandlerWithDB(db *sql.DB) {      │
│      useCase := usecase.NewTicketUseCaseWithDB   │  ← Inject vào UseCase
│          (db)                                    │
│  }                                               │
└──────────────────────┬──────────────────────────┘
                       │ inject dbConn
                       ▼
┌─────────────────────────────────────────────────┐
│  usecase/ticket_usecase.go                       │
│                                                  │
│  func NewTicketUseCaseWithDB(db *sql.DB) {      │
│      repo := repository.NewTicketRepository     │  ← Inject vào Repository
│          WithDB(db)                              │
│  }                                               │
└──────────────────────┬──────────────────────────┘
                       │ inject dbConn
                       ▼
┌─────────────────────────────────────────────────┐
│  repository/ticket_repository.go                 │
│                                                  │
│  type TicketRepository struct {                  │
│      db *sql.DB  ← Sử dụng connection đã inject │
│  }                                               │
└─────────────────────────────────────────────────┘
```

### 4.3 Code thực tế

```go
// backend/services/ticket-lambda/main.go — Composition Root

func init() {
    var dbConn *sql.DB
    if config.IsFeatureEnabled(config.FlagServiceSpecificDB) {
        // Service-specific: connection pool riêng cho ticket-lambda
        dbConn, _ = db.InitServiceDB("TICKET")
    } else {
        // Shared: dùng global singleton
        db.InitDB()
        dbConn = db.GetDB()
    }

    // DI: Inject DB connection vào tất cả handlers
    ticketHandler = handler.NewTicketHandlerWithDB(dbConn)
    ticketInternalHandler = handler.NewTicketInternalHandlerWithDB(dbConn)
    walletInternalHandler = handler.NewWalletInternalHandlerWithDB(dbConn)
}
```

### 4.4 Tại sao không dùng DI Framework (Wire, Dig)?

| Tiêu chí | DI Framework | Manual DI (như hệ thống này) |
|----------|-------------|------------------------------|
| Complexity | Cao (code generation, reflection) | Thấp (constructor injection) |
| Lambda Startup | Chậm hơn (init overhead) | Nhanh (trực tiếp) |
| Debuggability | Khó (magic wiring) | Dễ (explicit, có thể trace) |
| Go convention | Ít phổ biến | ✅ Chuẩn Go idiom |

> 💡 **Go Best Practice:** "Accept interfaces, return structs." Hệ thống sử dụng **Constructor Injection** — pattern phổ biến nhất trong Go, không cần framework.

---

## 5. TỔNG KẾT CÁC DESIGN PATTERN ÁP DỤNG

| # | Pattern | Áp dụng tại | Mục đích |
|---|---------|------------|----------|
| 1 | **Microservices Architecture** | Toàn hệ thống | Tách monolith thành 6 services độc lập |
| 2 | **API Gateway** | `template.yaml` (Public + Internal GW) | Routing, CORS, tách public/internal traffic |
| 3 | **Saga Pattern** | Wallet Reserve/Confirm/Release | Distributed transaction khi mua vé bằng ví |
| 4 | **API Composition** | `GetMyTickets`, `GetEventDetail`... | Thay thế SQL JOIN cross-service |
| 5 | **Dependency Injection** | Mỗi `main.go` → Handler → UseCase → Repo | Loose coupling, testability |
| 6 | **Service Registry** | `service_registry.go` + ENV vars | Service discovery qua environment variables |
| 7 | **Feature Flags** | `feature_flags.go` + 10 ENV flags | Safe migration, zero-downtime rollback |
| 8 | **Retry with Exponential Backoff** | `internal_client.go` | Xử lý Lambda Cold Start |
| 9 | **JWT Propagation** | `InternalClient.injectHeaders()` | Truyền authentication context xuyên services |
| 10 | **Strangler Fig** | Feature Flags + Dual path | Chuyển đổi dần từ Monolith → Microservices |

### Đánh giá

Hệ thống hiện đang ở giai đoạn **"Pseudo-Microservices"**:
- ✅ **Tầng Application:** Microservices hoàn chỉnh (6 services độc lập, API Gateway, DI, Feature Flags)
- 🟡 **Tầng Data:** Vẫn shared database (34 JOINs cần refactor sang API Composition)
- ✅ **Wallet:** Đã có Saga Pattern (Reserve/Confirm/Release) — sẵn sàng tách database

Đây là bước trung gian hợp lý theo chiến lược **"Monolith First"** (Martin Fowler) — ưu tiên tách application layer trước, sau đó tách data layer dần dần.

---
## 6. CONTAINERIZATION — DOCKER & S3

### 6.1 Data Flow — Luồng dữ liệu đầy đủ trong Docker

```
Browser
  │
  ├─ GET /api/events ───► Vite Proxy (:3000) ─► gateway:8080
  │                                              ├─► auth-service:8081 ─► MySQL:3306
  │                                              ├─► event-service:8082 ─► MySQL:3306
  │                                              └─► ticket-service:8083 ─► MySQL:3306
  │
  └─ POST /api/events/upload-banner
       ► Server: validate + generate S3 Presigned URL
       ► Browser: PUT presigned URL ──► AWS S3 (trực tiếp, không qua backend)
       ► Browser: commit s3Key ──► Server: xác nhận + ghi DB
```

### 6.2 Dockerfile — Dual Target

```dockerfile
# Stage 1: Build binary tĩnh (CGO_ENABLED=0)
FROM golang:1.24-alpine AS builder
ARG BUILD_PATH=./cmd/gateway
RUN go build -ldflags="-s -w" -tags lambda.norpc -o /app/service ${BUILD_PATH}

# Stage 2a: Local dev (~25 MB)
FROM alpine:3.21 AS local
COPY --from=builder /app/service ./service
ENTRYPOINT ["./service"]   # IsLocal()=true → HTTP server

# Stage 2b: Lambda Container Image (~30 MB)
FROM public.ecr.aws/lambda/provided:al2023 AS lambda
COPY --from=builder /app/service /var/task/bootstrap
CMD ["bootstrap"]          # Lambda inject AWS_LAMBDA_FUNCTION_NAME → IsLocal()=false
```

### 6.3 S3 Upload — Zero-Waste (6 bước)

| Bước | Actor | Hành động |
|-------|-------|----------|
| 1 | Frontend | Gửi file metadata → Server validate (size, type, no upload yet) |
| 2 | Server | `GeneratePresignedURL(key, 15m)` → trả về `{uploadUrl, s3Key, publicUrl}` |
| 3 | Browser | `PUT uploadUrl` truyền file trực tiếp tới S3 |
| 4 | Frontend | Submit form với `s3Key` + dữ liệu sự kiện |
| 5 | Server | `CommitUpload(s3Key)` — kiểm tra object tồn tại trên S3 |
| 6 | Server | Ghi `publicUrl` vào DB, transaction commit |

**Filename Sanitization** — trước khi tạo S3 key, tên file đi qua 6 bước lọc:
`⊤ Unicode NFD → Strip combining marks → lowercase → replace spaces → keep [a-z0-9._-] → suffix timestamp`

Ví dụ: `"Sự Kiện Âm Nhạc 2026.jpg"` → `"su-kien-am-nhac-2026-1741234567.jpg"`

### 6.4 MySQL Case Sensitivity (Linux Docker Fix)

Linux MySQL mặc định phân biệt hoa/thường. Fix:

```yaml
# docker-compose.yml
mysql:
  command: --lower-case-table-names=1
```

> Phải chạy `docker compose down -v` rồi mới `up --build` nếu volume đã tồn tại.

---
## TÀI LIỆU THAM CHIẾU

| Tài liệu | Mô tả |
|-----------|--------|
| `MICROSERVICE_MIGRATION_REPORT.md` | Phân tích chi tiết 34 cross-service JOINs |
| `MICROSERVICE_MIGRATION_ROADMAP.md` | Lộ trình migration 4 giai đoạn |
| `AWS_DEPLOYMENT_REPORT.md` | Chi tiết kiến trúc AWS Lambda deployment |
| `README_AWS.md` | Hướng dẫn triển khai và giám sát trên AWS |
| `backend/common/utils/internal_client.go` | HTTP client cho service-to-service calls |
| `backend/common/utils/service_registry.go` | Service URL resolution |
| `backend/common/config/feature_flags.go` | Hệ thống Feature Flags |
| `backend/common/models/wallet.go` | Wallet & Saga DTOs |
