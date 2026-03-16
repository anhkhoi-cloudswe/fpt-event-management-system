# BÁO CÁO THỰC TẬP / OJT INTERNSHIP REPORT

> **Chương trình / Program:** FILL_ME *(vd: FCAJ — Fresher Cloud AWS Japan)*  
> **Phiên bản tài liệu / Document version:** 1.0  
> **Ngày nộp / Submission date:** FILL_ME  

---

## MỤC LỤC / TABLE OF CONTENTS

1. [Thông tin sinh viên / Student Information](#1-thông-tin-sinh-viên--student-information)
2. [Worklog — Nhật ký theo tuần / Weekly Log](#2-worklog--nhật-ký-theo-tuần--weekly-log)
3. [Proposal — Đề xuất dự án / Project Proposal](#3-proposal--đề-xuất-dự-án--project-proposal)
4. [Events Participated — Sự kiện tham gia](#4-events-participated--sự-kiện-tham-gia)
5. [Workshop — Dự án kỹ thuật chính / Main Technical Project](#5-workshop--dự-án-kỹ-thuật-chính--main-technical-project)
6. [Self-evaluation — Tự đánh giá](#6-self-evaluation--tự-đánh-giá)
7. [Sharing and Feedback — Cảm nhận & Phản hồi](#7-sharing-and-feedback--cảm-nhận--phản-hồi)

---

## 1. Thông tin sinh viên / Student Information

| Trường / Field | Thông tin / Information |
|----------------|------------------------|
| **Họ tên / Full name** | FILL_ME |
| **Số điện thoại / Phone** | FILL_ME |
| **Email** | FILL_ME |
| **Trường / University** | FILL_ME |
| **Chuyên ngành / Major** | FILL_ME |
| **Công ty thực tập / Internship company** | FILL_ME |
| **Vị trí thực tập / Internship position** | FILL_ME *(vd: Cloud Backend Developer Intern)* |
| **Thời gian thực tập / Internship duration** | FILL_ME *(vd: Tháng 11/2025 – Tháng 3/2026)* |

---

## 2. Worklog — Nhật ký theo tuần / Weekly Log

> **Ghi chú / Note:** Worklog được ghi theo lịch thực tế dự án từ tháng 11/2025 đến tháng 3/2026 (~20 tuần làm việc). Nội dung kỹ thuật dựa trên tài liệu dự án; các tuần nghỉ lễ/cá nhân đánh dấu FILL_ME.

---

### Week 1 — Foundation & Onboarding *(Tuần đầu tháng 11/2025)*

**Công việc đã làm / Work done:**
- Tiếp nhận yêu cầu dự án: xây dựng hệ thống quản lý sự kiện cho FPT University.
- Khảo sát kiến trúc ban đầu: đánh giá Monolith vs. Microservices.
- Thiết lập môi trường phát triển: Go 1.24, Node.js, Docker Desktop, AWS CLI, AWS SAM CLI.
- Thiết lập repository GitHub: `AK17-LeonSatoru/FPT_EVENT_MANAGEMENT_Microservices_withAWSBucket`.

*[EN] Received project requirements for an FPT University event management platform. Evaluated Monolith vs. Microservices architecture. Set up local dev environment (Go 1.24, Docker, AWS SAM CLI). Initialized GitHub repository.*

**Kết quả đạt được / Results:**
- Môi trường phát triển hoạt động ổn định.
- Repository được khởi tạo với cấu trúc monorepo chuẩn (`backend/`, `frontend/`, `scripts/`).

---

### Week 2 — Database Schema & Architecture Design *(Tuần 2, tháng 11/2025)*

**Công việc đã làm / Work done:**
- Thiết kế database schema MySQL 8.0: các bảng `Users`, `Event`, `Ticket`, `Bill`, `Venue`, `Area`, `Wallet`, `Wallet_Transaction`, `Seat`, `Speaker`…
- Xác định 6 microservice domain: Auth, Event, Ticket, Venue, Staff, Notification.
- Phác thảo kiến trúc AWS: API Gateway (Public + Internal), 6 Lambda arm64, RDS MySQL, S3, SSM Parameter Store, VPC.
- Viết ADR (Architecture Decision Record) lý do chọn Serverless Lambda thay ECS/EC2.

*[EN] Designed MySQL 8.0 schema with all core tables. Defined 6 microservice domains. Drafted AWS architecture: dual API Gateway, 6 Lambda arm64 functions, RDS MySQL, S3, SSM Parameter Store inside VPC.*

**Kết quả đạt được / Results:**
- Schema hoàn chỉnh (`FPTEventManagement_v5.sql`), sẵn sàng cho phase phát triển.
- Sơ đồ kiến trúc AWS phiên bản 1.0 được phê duyệt bởi team.

---

### Week 3 — AWS SAM Infrastructure as Code *(Tuần 3, tháng 11/2025)*

**Công việc đã làm / Work done:**
- Viết `template.yaml` (AWS SAM / CloudFormation ~1.000+ dòng):
  - VPC (10.0.0.0/16), Public/Private Subnets, NAT Gateway, Internet Gateway.
  - Security Groups cho Lambda và RDS.
  - VPC Endpoints cho `execute-api` và `ssm` (tránh traffic ra ngoài).
  - RDS MySQL `db.t3.micro` (Free Tier), encrypted storage với `gp3`.
  - 6 Lambda Functions + 2 API Gateways (Public & Internal).
  - S3 Bucket cho media upload với lifecycle policy.
- Viết `samconfig.toml` cho deploy automation.

*[EN] Wrote the full SAM/CloudFormation template (~1,000+ lines): VPC networking, NAT Gateway, VPC Endpoints (execute-api, ssm), RDS db.t3.micro (encrypted gp3), 6 Lambda functions, dual API Gateway, S3 bucket with lifecycle policies.*

**Kết quả đạt được / Results:**
- `template.yaml` có thể deploy thành công lên AWS với lệnh `sam deploy`.
- Infrastructure 100% as-code, reproducible.

---

### Week 4 — Go Backend Foundation & common/ Layer *(Tuần 4, tháng 11/2025)*

**Công việc đã làm / Work done:**
- Xây dựng `common/` layer: các utility dùng chung cho toàn bộ 6 service.
  - `common/jwt/jwt.go`: JWT HS256 sign/verify với `golang-jwt/jwt v5.2.0`.
  - `common/hash/password.go`: bcrypt hash/compare.
  - `common/logger/logger.go`: JSON structured logger với color support.
  - `common/db/db.go`: MySQL connection pool với `go-sql-driver/mysql v1.9.3`.
  - `common/response/response.go`: HTTP response helpers chuẩn hóa.
  - `common/validator/validator.go`: request validation.
  - `common/errors/errors.go`: domain error types.
- Viết unit tests cho `hash` và `validator`.

*[EN] Built the shared `common/` layer: JWT HS256, bcrypt, structured JSON logger, MySQL connection pool, standardized HTTP response helpers, request validator, and domain error types. Wrote unit tests for hash and validator packages.*

**Kết quả đạt được / Results:**
- `common/` layer 0 compile errors, unit tests pass.
- Tất cả 6 service có thể import và sử dụng ngay.

---

### Week 5 — Auth Service & Authorizer Lambda *(Tuần 1, tháng 12/2025)*

**Công việc đã làm / Work done:**
- Xây dựng `auth-lambda`: Register, Login, OTP verification, profile management.
  - `handler/` → `usecase/` → `repository/` (Clean Architecture).
  - Register: validate email domain (@fpt.edu.vn), bcrypt password, OTP email verification.
  - Login: verify bcrypt, issue JWT HS256 (access token + refresh token).
- Xây dựng `authorizer-lambda`: Lambda Authorizer cho API Gateway.
  - Verify JWT → generate IAM Allow/Deny policy.
  - Cache 300 giây để giảm invoke Lambda Authorizer liên tục.
- Tích hợp Google reCAPTCHA v2 (`common/recaptcha/recaptcha.go`) cho Register/Login.

*[EN] Built auth-lambda (register with FPT email domain validation, OTP email verification, bcrypt login, JWT issuance) and authorizer-lambda (JWT verification → IAM policy, 300s cache). Integrated Google reCAPTCHA v2.*

**Kết quả đạt được / Results:**
- Auth flow end-to-end hoạt động: Register → OTP → Login → JWT.
- Lambda Authorizer cache 300s giảm ~60% Lambda invocation cho auth check.

---

### Week 6 — Venue & Event Services *(Tuần 2–3, tháng 12/2025)*

**Công việc đã làm / Work done:**
- Xây dựng `venue-lambda`: CRUD Venue, Area management.
  - Venue có nhiều Area (khu vực), mỗi Area có capacity và trạng thái `AVAILABLE/OCCUPIED/MAINTENANCE`.
  - Venue release scheduler: tự động đặt lại trạng thái Area về `AVAILABLE` sau khi event kết thúc.
- Xây dựng `event-lambda`: CRUD Event, approval workflow.
  - Organizer tạo Event Request (chọn Venue Area + khung giờ + trần giá vé).
  - Admin duyệt/từ chối → Event trở thành `APPROVED`.
  - Expired requests cleanup: huỷ request quá 24h chưa được duyệt.
  - Speaker management.

*[EN] Built venue-lambda (venue/area CRUD, auto-release scheduler) and event-lambda (event CRUD, organizer-request → admin-approval workflow, 24h expiry cleanup, speaker management).*

**Kết quả đạt được / Results:**
- Approval workflow hoạt động end-to-end.
- Scheduler tự động cleanup expired requests mỗi 1 giờ.

---

### Week 7 — Ticket Service & Wallet System *(Tuần 4, tháng 12/2025 — Tuần 1, tháng 1/2026)*

**Công việc đã làm / Work done:**
- Xây dựng `ticket-lambda`: mua vé, seat allocation, lịch sử vé.
  - Seat allocation: ma trận 10×10, VIP rows A–C (ghế đầu tiên), STANDARD rows D–J.
  - `INSERT IGNORE` để ngăn race condition khi nhiều user cùng chọn ghế.
  - `SELECT ... FOR UPDATE` row-level locking cho wallet.
- Xây dựng Wallet system (`common/models/wallet.go`):
  - Bảng `Wallet` (balance, status: ACTIVE/FROZEN/CLOSED).
  - Bảng `Wallet_Transaction` (CREDIT/DEBIT, balance_before/after).
  - VNPay Gateway integration: HMAC-SHA512 signature (`common/vnpay/vnpay.go`).
  - Nạp tiền qua VNPay → Wallet credit.

*[EN] Built ticket-lambda with 10×10 seat matrix (VIP rows A–C, STANDARD D–J), INSERT IGNORE race-condition prevention. Built wallet system with row-level locking (SELECT FOR UPDATE), VNPay HMAC-SHA512 payment gateway integration.*

**Kết quả đạt được / Results:**
- Không xảy ra double-booking dù simulate concurrent requests.
- VNPay sandbox test: nạp tiền thành công, transaction record chính xác.

---

### Week 8 — Saga Pattern & Distributed Transactions *(Tuần 2–3, tháng 1/2026)*

**Công việc đã làm / Work done:**
- Thiết kế và triển khai **Saga Pattern** (Choreography-based) cho luồng mua vé bằng ví:
  - **Bước 1 — Reserve:** giữ tiền tạm (TTL 300s), tạo `reservationId` UUID.
  - **Bước 2a — Confirm:** xác nhận trừ tiền chính thức, ghi `WalletTransaction`.
  - **Bước 2b — Release (Compensation):** hoàn tiền về ví nếu bất kỳ bước nào thất bại.
- Triển khai internal endpoints: `POST /internal/wallet/reserve`, `/confirm`, `/release`.
- Xây dựng `common/utils/internal_client.go`:
  - HTTP client với Exponential Backoff (500ms → 1s → 2s, 3 retries).
  - JWT Propagation tự động.
  - Context header propagation (`X-User-Id`, `X-User-Role`, `X-Internal-Call`).

*[EN] Implemented Saga Pattern (Reserve → Confirm/Release) for distributed wallet transactions across services. Built InternalClient with exponential backoff (3 retries), JWT propagation, and context header forwarding.*

**Kết quả đạt được / Results:**
- Zero money loss trong 100% test case (kể cả simulate failure giữa chừng).
- InternalClient xử lý Lambda Cold Start mượt mà nhờ retry logic.

---

### Week 9 — Notification Service & PDF/QR Generation *(Tuần 4, tháng 1/2026)*

**Công việc đã làm / Work done:**
- Xây dựng `notification-lambda`:
  - Email sender qua SMTP (`common/email/email.go`).
  - PDF ticket generation: `common/pdf/ticket_pdf.go` dùng `jung-kurt/gofpdf v1.16.2`.
  - QR code generation: `common/qrcode/qrcode.go` dùng `skip2/go-qrcode`.
  - PDF đính kèm QR code, gửi qua email khi mua vé thành công.
- Thiết kế **Virtual Notifications** (cost-optimized):
  - Không có bảng Notification riêng trong DB.
  - `GET /api/notifications` → backend query `Bill` + `Ticket` → transform thành notification list.
  - Tiết kiệm storage cost, luôn sync với dữ liệu gốc.
- Triển khai S3 Upload (Zero-Waste 6-step pattern):
  - Step 1: Validate metadata. Step 2: Generate pre-signed URL (15 phút). Step 3: Frontend PUT trực tiếp lên S3. Step 4: Frontend submit với s3Key. Step 5: Backend commit (verify object tồn tại). Step 6: Ghi publicUrl vào DB.

*[EN] Built notification-lambda with SMTP email, PDF ticket (gofpdf) with embedded QR code (go-qrcode). Implemented Virtual Notifications (no DB table, generated from Bill/Ticket data on-the-fly). Added S3 pre-signed URL upload (6-step zero-waste pattern).*

**Kết quả đạt được / Results:**
- Thời gian từ "Mua vé" đến nhận email với PDF+QR: < 3 phút.
- S3 upload pattern loại bỏ hoàn toàn orphaned objects.

---

### Week 10 — Staff Service, Check-in & Analytics *(Tuần 1–2, tháng 2/2026)*

**Công việc đã làm / Work done:**
- Xây dựng `staff-lambda`:
  - QR code scan → Check-in validation (verify ticket status, event status, time window).
  - Check-out tracking.
  - Refund management: staff xử lý hoàn tiền → Wallet credit.
  - Report generation: analytics, CSV export.
- Feature Flags system (`common/config/feature_flags.go`):
  - 10 environment variable flags: `USE_API_COMPOSITION`, `SAGA_ENABLED`, `VENUE_API_ENABLED`, v.v.
  - Zero-downtime migration: bật/tắt từng feature mà không cần redeploy.
- `common/utils/service_registry.go`: URL resolution với fallback localhost.

*[EN] Built staff-lambda: QR scan check-in/out, refund processing to wallet, report analytics & CSV export. Implemented 10-flag Feature Flag system for zero-downtime Monolith→Microservices migration.*

**Kết quả đạt được / Results:**
- Check-in flow hoạt động: quét QR → xác thực → ghi nhận trong < 1 giây.
- Feature Flags cho phép rollback an toàn bất kỳ lúc nào.

---

### Week 11 — API Composition & X-Ray Tracing *(Tuần 3–4, tháng 2/2026)*

**Công việc đã làm / Work done:**
- Triển khai **API Composition Pattern** (thay thế SQL JOIN giữa các service).
  - Thay vì JOIN Event ↔ Venue ↔ User trong 1 query, mỗi service trả data riêng, backend compose.
  - Flag `USE_API_COMPOSITION=true` bật chế độ này.
- Tích hợp **AWS X-Ray** tracing (`common/xray/tracer.go`, SDK `v1.8.5`):
  - `tracer.Configure(serviceName)` tại Lambda entry point.
  - Sub-segments tự động cho HTTP calls, DB queries.
  - Service Map trực quan trên X-Ray Console.
- AWS SSM Parameter Store: migrate config từ hardcode `config.json` lên SSM path `/fpt-events/prod/system-config`.

*[EN] Implemented API Composition pattern (replacing cross-service SQL JOINs). Integrated AWS X-Ray tracing across all Lambda functions (service map, sub-segments). Migrated sensitive config to AWS SSM Parameter Store.*

**Kết quả đạt được / Results:**
- X-Ray service map show toàn bộ 6 service + RDS + S3 dependencies.
- SSM Parameter Store: 0 secrets hardcoded trong source code.

---

### Week 12 — Docker, Frontend Integration & Demo Prep *(Tuần 1–2, tháng 3/2026)*

**Công việc đã làm / Work done:**
- Containerization hoàn chỉnh:
  - Multi-stage Dockerfile: `builder (golang:1.24-alpine)` → `local (alpine:3.21, ~25 MB)` / `lambda (provided:al2023, ~30 MB)`.
  - Binary tự phát hiện môi trường: `AWS_LAMBDA_FUNCTION_NAME` unset → HTTP server; set → `lambda.Start`.
  - `docker-compose.yml`: 9-container topology (1 MySQL + 6 services + 1 gateway + 1 frontend).
  - MySQL `lower_case_table_names=1` fix cho Linux compatibility.
- Frontend (React 18 + TypeScript 5.2 + Vite 5 + Tailwind CSS):
  - Integration test toàn bộ flow: Register → Login → Browse Events → Buy Ticket → Check-in.
  - Deploy lên Vercel (CDN global, auto SSL, CI/CD từ GitHub).
- Build scripts: `build-clean.ps1` cho Windows, `build.sh` cho Linux/Mac.
- DB optimization: từ 2.3 MB → 0.84 MB (clean data, remove orphaned records).
- **0 compile errors** across toàn bộ codebase.
- Chuẩn bị demo OJT: slide, demo script, architecture diagram.

*[EN] Completed multi-stage Docker build (25 MB local / 30 MB Lambda). Finalized 9-container Docker Compose topology. Integrated and tested full frontend flow. Deployed frontend to Vercel. DB optimized to 0.84 MB. Achieved 0 compile errors. Prepared OJT demo materials.*

**Kết quả đạt được / Results:**
- `docker compose up --build` → toàn bộ hệ thống chạy trong < 3 phút.
- Demo end-to-end thành công: từ Register đến nhận QR ticket qua email.
- Hệ thống đạt **95% hoàn thiện**, sẵn sàng demo OJT.

---

> **Tuần 13–12 bổ sung (nếu OJT dài hơn 12 tuần):** FILL_ME

---

## 3. Proposal — Đề xuất dự án / Project Proposal

### 3.1 Tổng quan dự án / Project Overview

**Tên dự án / Project name:** FPT Event Management System  
**Loại dự án / Type:** Serverless Microservices Web Application trên AWS  
**Repository:** [github.com/AK17-LeonSatoru/FPT_EVENT_MANAGEMENT_Microservices_withAWSBucket](https://github.com/AK17-LeonSatoru/FPT_EVENT_MANAGEMENT_Microservices_withAWSBucket.git)

FPT Event Management System là nền tảng quản lý sự kiện tập trung cho **FPT University**, hỗ trợ toàn bộ vòng đời sự kiện — từ khi organizer đăng ký địa điểm, mua vé, nhận QR ticket, đến check-in tại sự kiện — trong một hệ thống duy nhất, bảo mật và có khả năng mở rộng.

Hệ thống được xây dựng và sau đó nâng cấp từ **Modular Monolith** sang **6 Lambda Microservices**, áp dụng Saga Pattern để đảm bảo tính toàn vẹn giao dịch trong môi trường phân tán.

*[EN] FPT Event Management System is a centralized event management platform for FPT University, supporting the full event lifecycle — from venue booking and ticket purchase, to QR ticket issuance and on-site check-in — in a single secure and scalable system. The architecture was progressively upgraded from a Modular Monolith to 6 AWS Lambda Microservices.*

---

### 3.2 Mục tiêu / Objectives

| # | Mục tiêu kỹ thuật / Technical Goal | Kết quả đo lường / Measurable Outcome |
|---|-------------------------------------|---------------------------------------|
| 1 | Xây dựng 6 microservice chuẩn Clean Architecture | 6 Lambda functions, 0 compile errors |
| 2 | Đảm bảo tính toàn vẹn giao dịch phân tán | Saga Pattern: 0% money loss trong distributed transaction |
| 3 | Ngăn race condition khi mua vé đồng thời | `SELECT FOR UPDATE` + `INSERT IGNORE`: 0 double-booking |
| 4 | Thời gian từ mua vé đến nhận QR ticket | < 3 phút end-to-end |
| 5 | Chi phí vận hành MVP | ~$0/tháng (AWS Free Tier) |
| 6 | Zero-downtime migration từ Monolith | Feature Flags: 10 flags, bật/tắt không cần redeploy |
| 7 | Observability đầy đủ | X-Ray service map + CloudWatch structured logs |

---

### 3.3 Vấn đề cần giải quyết / Problems to Solve

| Vấn đề / Problem | Giải pháp / Solution |
|------------------|----------------------|
| **Double-booking ghế:** nhiều user cùng mua ghế cuối cùng | `INSERT IGNORE` + row-level locking, seat matrix 10×10 |
| **Distributed transaction:** trừ tiền ví ≠ tạo vé trong 2 service | Saga Pattern: Reserve → Confirm / Release (compensation) |
| **Lambda Cold Start:** gây delay khi invoke inter-service | InternalClient Exponential Backoff (500ms→1s→2s, 3 retries) |
| **Orphaned S3 objects:** upload xong nhưng không lưu DB | 6-step Zero-Waste Upload: Validate → Pre-sign → Upload → Commit |
| **Notification storage bloat:** bảng Notification dư thừa | Virtual Notifications: generate on-the-fly từ Bill/Ticket data |
| **Hardcoded secrets:** JWT secret, DB password trong code | AWS SSM Parameter Store; `.NoEcho: true` trong SAM template |
| **Không thể rollback khi feature mới lỗi** | 10 Feature Flags: zero-downtime rollback bất kỳ service nào |

---

### 3.4 Kiến trúc giải pháp / Solution Architecture

```
                    USERS (Mobile Browser / Desktop)
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │     VERCEL CDN      │
                    │   React 18 SPA      │
                    │  TypeScript + Vite  │
                    └──────────┬──────────┘
                               │ HTTPS / REST
              ┌────────────────▼─────────────────────┐
              │         AWS API GATEWAY (Public)      │
              │  /api/*  — Internet-facing            │
              │  JWT Lambda Authorizer (cache 300s)   │
              └────────────────┬─────────────────────┘
                               │
              ┌────────────────▼──────────────────────────────┐
              │          VPC 10.0.0.0/16                      │
              │  Private Subnets: 10.0.10.0/24, 10.0.11.0/24 │
              │                                               │
              │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
              │  │  Auth λ  │ │ Event λ  │ │ Ticket λ │      │
              │  └──────────┘ └──────────┘ └──────────┘      │
              │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
              │  │  Venue λ │ │  Staff λ │ │ Notif λ  │      │
              │  └──────────┘ └──────────┘ └──────────┘      │
              │         │ InternalClient (HTTP Retry)│        │
              │  ┌──────▼──────────────┐  ┌─────────────┐    │
              │  │   API GW (Internal) │  │  SSM Param  │    │
              │  │   /internal/*       │  │  Store      │    │
              │  └─────────────────────┘  └─────────────┘    │
              │  ┌───────────────────────┐                    │
              │  │   RDS MySQL 8.0       │                    │
              │  │   db.t3.micro (Free)  │                    │
              │  │   0.84 MB · Encrypted │                    │
              │  └───────────────────────┘                    │
              └────────┬───────────────────────┬──────────────┘
                       │                       │
              ┌────────▼────────┐   ┌──────────▼──────────┐
              │    AWS X-Ray    │   │  CloudWatch Logs     │
              │  Service Map    │   │  (JSON structured)   │
              └─────────────────┘   └─────────────────────┘
                                              │
                                   ┌──────────▼──────────┐
                                   │       AWS S3         │
                                   │  Event banners       │
                                   │  Pre-signed URLs     │
                                   │  ap-southeast-1      │
                                   └─────────────────────┘
```

**AWS Services sử dụng / AWS Services Used:**

| # | Dịch vụ / Service | Mục đích / Purpose | Lý do chọn / Why |
|---|-------------------|--------------------|--------------------|
| 1 | **AWS Lambda (arm64)** | Chạy 6 microservice | Serverless, pay-per-invoke, Graviton2 tiết kiệm 20% chi phí |
| 2 | **API Gateway REST** | Public & Internal endpoint | Managed, CORS, JWT Authorizer cache |
| 3 | **Amazon RDS MySQL 8.0** | Database chính | ACID, row-level locking cho wallet, Free Tier 12 tháng |
| 4 | **Amazon S3** | Media storage (event banners) | Durable, pre-signed URL, không qua backend |
| 5 | **AWS CloudWatch** | Logs & Metrics | JSON structured logs tự động từ Lambda |
| 6 | **AWS X-Ray** | Distributed tracing | Cross-Lambda service map, latency breakdown |
| 7 | **AWS SSM Parameter Store** | Config & Secrets management | Không hardcode secrets, inject vào Lambda |
| 8 | **AWS CloudFormation / SAM** | Infrastructure as Code | Reproducible deployment, version-controlled infra |

---

### 3.5 Timeline / Lịch thực hiện

| Phase | Thời gian | Mục tiêu / Goal | Trạng thái |
|-------|-----------|-----------------|------------|
| **Phase 0** | Tháng 11/2025 | Foundation: DB schema, SAM template, common/ layer | ✅ Hoàn thành |
| **Phase 1** | Tháng 12/2025 – 1/2026 | 6 Lambda services, InternalClient, Feature Flags | ✅ Hoàn thành |
| **Phase 2** | Tháng 2/2026 | Saga Pattern, API Composition, X-Ray tracing | ✅ Hoàn thành |
| **Phase 3** | Tháng 3/2026 | Polish: DB tối ưu (0.84 MB), 0 compile errors, Demo | ✅ 95% hoàn thành |

---

### 3.6 Ngân sách / Budget

| Dịch vụ / Service | Free Tier | Chi phí thực tế / Actual Cost |
|-------------------|-----------|-------------------------------|
| AWS Lambda | 1M requests/tháng · 400K GB-s | $0 |
| API Gateway REST | 1M calls (12 tháng đầu) | $0 |
| RDS MySQL db.t3.micro | 12 tháng Free Tier | $0 |
| S3 (5 GB storage + 50 GB transfer) | Free Tier | $0 |
| SSM Parameter Store | 10K requests/tháng | $0 |
| Vercel (Hobby plan) | Unlimited deploys | $0 |
| **Tổng / Total** | | **~$0/tháng (Free Tier)** |

---

### 3.7 Rủi ro / Risks

| Rủi ro / Risk | Mức độ / Level | Giải pháp / Mitigation |
|---------------|----------------|------------------------|
| Lambda Cold Start gây timeout inter-service | Trung bình | ExponentialBackoff (3 retries), Provisioned Concurrency (Phase 2+) |
| RDS connection pool exhausted (max_connections) | Thấp | Connection pooling đúng cách, db.t3.micro có 66 connections |
| S3 orphaned objects nếu upload thất bại | Thấp | 6-step Zero-Waste pattern + S3 lifecycle expiry 1 ngày |
| Saga incomplete (service crash giữa chừng) | Trung bình | TTL tự động trên WalletReservation (300s auto-release) |
| MySQL case sensitivity trên Linux | Thấp | `lower_case_table_names=1` trong Docker config |
| Free Tier hết hạn sau 12 tháng | Trung bình | Clean architecture dễ migrate lên ECS nếu cần |

---

## 4. Events Participated — Sự kiện tham gia

### Event 1

| Trường / Field | Thông tin / Information |
|----------------|------------------------|
| **Tên sự kiện / Event name** | FILL_ME |
| **Thời gian / Time** | FILL_ME |
| **Địa điểm / Location** | FILL_ME |
| **Vai trò / Role** | FILL_ME |
| **Nội dung chính / Main content** | FILL_ME |
| **Bài học rút ra / Lessons learned** | FILL_ME |

---

### Event 2

| Trường / Field | Thông tin / Information |
|----------------|------------------------|
| **Tên sự kiện / Event name** | FILL_ME |
| **Thời gian / Time** | FILL_ME |
| **Địa điểm / Location** | FILL_ME |
| **Vai trò / Role** | FILL_ME |
| **Nội dung chính / Main content** | FILL_ME |
| **Bài học rút ra / Lessons learned** | FILL_ME |

---

> *Thêm Event 3, 4... nếu có / Add more events as needed.*

---

## 5. Workshop — Dự án kỹ thuật chính / Main Technical Project

### 5.1 Overview / Tổng quan

**Tên Workshop / Workshop Title:**  
*Xây dựng Hệ thống Quản lý Sự kiện Serverless trên AWS với Go Microservices*  
*Building a Serverless Event Management System on AWS with Go Microservices*

**Mô tả / Description:**

Workshop này hướng dẫn cách xây dựng một ứng dụng web production-ready sử dụng kiến trúc **Serverless Microservices** trên AWS. Dự án giải quyết các bài toán thực tế trong hệ thống phân tán: race condition, distributed transactions, zero-downtime migration, và cost optimization.

*[EN] This workshop demonstrates how to build a production-ready web application using a Serverless Microservices architecture on AWS. The project tackles real-world distributed systems challenges: race conditions, distributed transactions, zero-downtime migration, and cost optimization — all within the AWS Free Tier.*

**Use-case thực tế:**
- Quản lý sự kiện đại học (FPT University): 6 service domain, ~50+ API endpoints.
- Hệ thống thanh toán nội bộ (Wallet) với ACID guarantee trong môi trường microservices.
- Check-in bằng QR code tại sự kiện.

**AWS Services sử dụng (≥ 3):** AWS Lambda, API Gateway, RDS MySQL, S3, CloudWatch, X-Ray, SSM Parameter Store, CloudFormation/SAM, VPC, NAT Gateway, VPC Endpoints.

---

### 5.2 Prerequisite / Yêu cầu trước khi bắt đầu

**Tài khoản và quyền / Account & Permissions:**
- AWS Account (Free Tier là đủ cho MVP)
- IAM User với quyền: `AmazonLambdaFullAccess`, `AmazonRDSFullAccess`, `AmazonS3FullAccess`, `AmazonAPIGatewayAdministrator`, `AWSCloudFormationFullAccess`, `AmazonSSMFullAccess`, `AmazonVPCFullAccess`
- **Nguyên tắc Least Privilege:** Trong production, nên tạo IAM Role riêng với quyền tối thiểu cho từng service.

**Công cụ cần cài đặt / Tools to install:**
- [Go 1.24+](https://golang.org/dl/) 
- [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html)
- [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [Node.js 20+](https://nodejs.org/) (cho frontend)

**Region:** `ap-southeast-1` (Singapore) — gần Việt Nam, hỗ trợ đầy đủ dịch vụ

**Kiến thức nền / Prerequisites knowledge:**
- Golang cơ bản (goroutines, interfaces)
- REST API, HTTP methods
- Docker cơ bản
- AWS console cơ bản

---

### 5.3 Mô tả kiến trúc / Architecture Description

Hệ thống theo **Clean Architecture** với 4 tầng rõ ràng cho mỗi service:

```
services/{name}-lambda/
  main.go          ← Lambda entry point → route registration
  handler/         ← HTTP handler (thin controller), parse request
  usecase/         ← Business logic, domain rules
  repository/      ← Database access (interface implementation)
  models/          ← Domain entities

common/            ← Shared utilities (cross-cutting concerns)
  config/          ← Feature flags, system config (SSM)
  utils/           ← InternalClient, ServiceRegistry
  jwt/, hash/      ← Security (JWT HS256, bcrypt)
  logger/          ← Structured JSON logger
  xray/            ← AWS X-Ray tracer wrapper
  pdf/, qrcode/    ← PDF & QR generation
  email/, vnpay/   ← External integrations
  scheduler/       ← Background goroutine schedulers
```

**Nguyên tắc bảo mật / Security principles áp dụng:**
- Không hardcode secrets: dùng AWS SSM Parameter Store + CloudFormation `NoEcho`.
- IAM Least Privilege: Lambda chỉ có quyền tối thiểu (S3 read/write object, SSM read).
- VPC Private Subnets: Lambda và RDS không có public IP.
- JWT Authorizer: mọi API call qua API Gateway đều được xác thực.
- bcrypt password hash (cost factor default ~10).
- HMAC-SHA512 cho VNPay signature.
- `SELECT ... FOR UPDATE` row-level locking để ngăn TOCTOU race condition.

---

### 5.4 Các bước thực hành / Step-by-step Lab

#### Step 1: Clone repository và chuẩn bị môi trường

```bash
git clone https://github.com/AK17-LeonSatoru/FPT_EVENT_MANAGEMENT_Microservices_withAWSBucket.git
cd fpt-event-management-system

# Kiểm tra Go version
go version   # phải >= 1.24

# Kiểm tra Docker
docker --version

# Kiểm tra AWS SAM CLI
sam --version
```

#### Step 2: Cấu hình AWS credentials

```bash
aws configure
# AWS Access Key ID: your-access-key
# AWS Secret Access Key: your-secret-key
# Default region name: ap-southeast-1
# Default output format: json
```

#### Step 3: Chạy local với Docker Compose

```bash
# Build và khởi động toàn bộ hệ thống (9 containers)
docker compose up --build

# Kiểm tra các service đang chạy
docker compose ps
```

Sau bước này, hệ thống sẽ khởi động:
- MySQL: `localhost:3306`
- API Gateway (local): `localhost:8080`
- Frontend: `localhost:3000`
- 6 microservices: ports 8081–8086

#### Step 4: Import database schema

```bash
# Truy cập MySQL container
docker exec -it fpt-mysql mysql -u root -p fpt_event_management
# Nhập password từ docker-compose.yml

# Import schema
source /docker-entrypoint-initdb.d/FPTEventManagement_v5.sql
```

Hoặc dùng MySQL Workbench kết nối `localhost:3306`.

#### Step 5: Test API cơ bản

```bash
# Đăng ký tài khoản
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@fpt.edu.vn","password":"Test@1234","fullName":"Test User"}'

# Đăng nhập
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@fpt.edu.vn","password":"Test@1234"}'

# Response trả về JWT token
```

#### Step 6: Cấu hình VPC Endpoint cho SSM (trên AWS)

Để Lambda trong Private Subnet có thể truy cập SSM mà không qua NAT Gateway (giảm chi phí):

```bash
# Tạo SSM VPC Endpoint qua SAM template (đã có sẵn trong template.yaml)
# SSMVPCEndpoint: Interface endpoint cho com.amazonaws.ap-southeast-1.ssm
```

Xác nhận endpoint hoạt động:
```bash
aws ec2 describe-vpc-endpoints \
  --filters "Name=service-name,Values=com.amazonaws.ap-southeast-1.ssm" \
  --query "VpcEndpoints[].State"
```

#### Step 7: IAM Policy cho Lambda

Mỗi Lambda function cần IAM Role với policy tối thiểu (đã define trong `template.yaml`):

```yaml
# template.yaml — LambdaExecutionRole
Policies:
  - Statement:
    - Effect: Allow
      Action:
        - ssm:GetParameter
        - ssm:GetParameters
      Resource: !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/fpt-events/*"
    - Effect: Allow
      Action:
        - s3:GetObject
        - s3:PutObject
        - s3:DeleteObject
      Resource: !Sub "${MediaBucket.Arn}/*"
    - Effect: Allow
      Action:
        - xray:PutTraceSegments
        - xray:PutTelemetryRecords
      Resource: "*"
    # KHÔNG có s3:* hay iam:* — Principle of Least Privilege
```

#### Step 8: Deploy lên AWS với SAM

```bash
cd backend

# Build tất cả Lambda functions (Docker multi-stage)
sam build --use-container

# Deploy lần đầu (interactive)
sam deploy --guided
# Stack name: fpt-events-stack
# Region: ap-southeast-1
# ConfirmChangeset: Y

# Deploy lần sau
sam deploy
```

#### Step 9: Test & Validation trên AWS

```bash
# Lấy API Gateway URL từ SAM output
API_URL=$(aws cloudformation describe-stacks \
  --stack-name fpt-events-stack \
  --query "Stacks[0].Outputs[?OutputKey=='PublicApiUrl'].OutputValue" \
  --output text)

# Test endpoint
curl -X POST $API_URL/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@fpt.edu.vn","password":"Test@1234"}'

# Xem CloudWatch Logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/fpt-events-auth-prod \
  --start-time $(date -d '10 minutes ago' +%s000)

# Xem X-Ray Traces
aws xray get-service-graph \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s)
```

#### Step 10: Test Saga Pattern (Wallet Purchase)

```bash
TOKEN="<JWT từ bước login>"

# 1. Kiểm tra số dư ví
curl -H "Authorization: Bearer $TOKEN" $API_URL/api/wallet/balance

# 2. Nạp tiền qua VNPay (sandbox)
curl -X POST -H "Authorization: Bearer $TOKEN" $API_URL/api/wallet/topup \
  -d '{"amount": 1000000}'

# 3. Mua vé bằng ví (trigger Saga)
curl -X POST -H "Authorization: Bearer $TOKEN" $API_URL/api/tickets/purchase \
  -d '{"eventId": 1, "categoryId": 1, "paymentMethod": "WALLET"}'

# Kết quả mong đợi: ticket được tạo, tiền bị trừ, email nhận PDF+QR
```

#### Step 11: Kiểm tra Log và Metric

```bash
# CloudWatch Logs — xem structured JSON log
aws logs tail /aws/lambda/fpt-events-ticket-prod --follow

# Kết quả mong đợi (JSON log):
# {"level":"INFO","service":"ticket","msg":"Saga RESERVE success","reservationId":"uuid-abc"}
# {"level":"INFO","service":"ticket","msg":"Ticket created","ticketId":42}
# {"level":"INFO","service":"ticket","msg":"Saga CONFIRM success"}

# CloudWatch Metrics — Lambda errors
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=fpt-events-ticket-prod \
  --start-time $(date -d '1 hour ago' --iso-8601=seconds) \
  --end-time $(date --iso-8601=seconds) \
  --period 300 \
  --statistics Sum
```

#### Step 12: Clean-up (Tránh phát sinh chi phí)

```bash
# Xóa toàn bộ SAM stack (Lambda, API GW, RDS, VPC...)
sam delete --stack-name fpt-events-stack

# Xóa ECR images (Docker images cho Lambda)
aws ecr list-images --repository-name fpt-events-auth \
  --query 'imageIds[*]' --output json | \
  xargs -I{} aws ecr batch-delete-image \
    --repository-name fpt-events-auth \
    --image-ids {}

# Xóa S3 bucket (phải empty trước)
aws s3 rm s3://fpt-events-media-prod --recursive
aws s3api delete-bucket --bucket fpt-events-media-prod

# Xóa CloudWatch Log Groups
aws logs delete-log-group --log-group-name /aws/lambda/fpt-events-auth-prod
# (lặp lại cho các service khác)

# Xóa SSM Parameters
aws ssm delete-parameters \
  --names "/fpt-events/prod/system-config"

# Dừng local Docker
docker compose down -v   # -v để xóa cả volumes
```

---

### 5.5 Kết quả và đo lường / Results & Metrics

| Chỉ số / Metric | Giá trị / Value |
|-----------------|-----------------|
| Số Lambda functions | 6 |
| Số AWS services sử dụng | ≥ 8 |
| DB size (sau tối ưu) | 0.84 MB |
| Compile errors | 0 |
| Mức độ hoàn thiện | 95% |
| Chi phí infrastructure | ~$0/tháng (Free Tier) |
| Cold start Lambda (Go arm64) | ~15 ms |
| Saga transaction (happy path) | < 500 ms |
| Refund rate (test data) | 0.52% |
| Thời gian mua vé → nhận QR email | < 3 phút |

---

## 6. Self-evaluation — Tự đánh giá

> *Chọn mức: Tốt / Khá / Trung bình và viết nhận xét ngắn.*

| Tiêu chí | Mức độ | Nhận xét |
|----------|--------|----------|
| **Kiến thức / Knowledge** | FILL_ME | FILL_ME *(vd: Hiểu sâu về AWS Serverless, Go microservices, distributed systems patterns)* |
| **Khả năng học hỏi / Learning ability** | FILL_ME | FILL_ME |
| **Tính chủ động / Proactiveness** | FILL_ME | FILL_ME |
| **Kỷ luật / Discipline** | FILL_ME | FILL_ME |
| **Giao tiếp / Communication** | FILL_ME | FILL_ME |
| **Teamwork** | FILL_ME | FILL_ME |
| **Giải quyết vấn đề / Problem-solving** | FILL_ME | FILL_ME |
| **Đóng góp cho dự án / Project contribution** | FILL_ME | FILL_ME |

---

## 7. Sharing and Feedback — Cảm nhận & Phản hồi

### 7.1 Cảm nhận về chương trình / Program review

FILL_ME

*Gợi ý / Suggestion: Nêu những điểm bạn tâm đắc nhất trong quá trình tham gia chương trình, ví dụ: cơ hội làm việc với AWS, mentor support, môi trường học tập, v.v.*

---

### 7.2 Mức độ hài lòng / Satisfaction level

| Tiêu chí / Criteria | Đánh giá / Rating (1–5) |
|--------------------|------------------------|
| Nội dung chương trình / Program content | FILL_ME |
| Mentor support | FILL_ME |
| Môi trường làm việc / Work environment | FILL_ME |
| Cơ hội học AWS / AWS learning opportunity | FILL_ME |
| **Tổng thể / Overall** | **FILL_ME** |

---

### 7.3 Điểm cần cải thiện / Areas for improvement

FILL_ME

---

### 7.4 Giới thiệu chương trình cho bạn bè / Would you recommend?

FILL_ME *(Có / Không — và lý do tại sao / Yes / No — and why)*

---

## PHỤ LỤC / APPENDIX

### A. Tech Stack Summary

| Layer | Technology | Version | Hosting |
|-------|-----------|---------|---------|
| Frontend | React + TypeScript + Vite + Tailwind CSS | 18.2 / 5.2 / 5.0 | Vercel (CDN global) |
| Backend Language | Go | 1.24 | AWS Lambda arm64 |
| Containerization | Docker + Docker Compose / Multi-stage Build | — | Local: Alpine ~25 MB |
| IaC / Deploy | AWS SAM CLI + CloudFormation | — | S3 artifact |
| Database | MySQL | 8.0 | AWS RDS db.t3.micro |
| Auth | JWT HS256 + Lambda Authorizer | golang-jwt v5.2.0 | In-Lambda |
| Tracing | AWS X-Ray | SDK Go v1.8.5 | AWS X-Ray Console |
| Logging | Custom Structured Logger (JSON) | — | CloudWatch Logs |
| PDF | gofpdf | v1.16.2 | In-Lambda |
| QR Code | go-qrcode | v0.0.0 | In-Lambda |
| Config Store | AWS SSM Parameter Store | — | `/fpt-events/{env}/system-config` |
| Payment | VNPay Gateway (HMAC-SHA512) | — | External redirect |
| Media | AWS S3 + Pre-signed URLs | aws-sdk-go-v2 | ap-southeast-1 |

### B. Design Patterns Applied

| Pattern | Nơi áp dụng / Applied in | Lý do / Why |
|---------|--------------------------|-------------|
| **Clean Architecture** | Tất cả 6 service | Tách biệt concerns, testable |
| **Saga Pattern** (Choreography) | Wallet purchase flow | Distributed transaction không cần 2PC |
| **API Composition** | Event listing API | Thay thế SQL JOIN giữa services |
| **Feature Flags** | common/config | Zero-downtime migration |
| **Virtual Notifications** | Notification API | Không có bảng DB riêng, giảm cost |
| **Zero-Waste Upload** | S3 banner upload | Ngăn orphaned S3 objects |
| **Exponential Backoff** | InternalClient | Xử lý Lambda Cold Start |
| **Row-level Locking** | Wallet, Seat allocation | Ngăn race condition |
| **Dependency Injection** | Usecase → Repository interface | Testable, swappable implementations |

### C. Repository

- **GitHub:** [AK17-LeonSatoru/FPT_EVENT_MANAGEMENT_Microservices_withAWSBucket](https://github.com/AK17-LeonSatoru/FPT_EVENT_MANAGEMENT_Microservices_withAWSBucket.git)
- **Branch chính:** NOT_SURE *(main / master)*
- **Hướng dẫn chạy local:** Xem [README.md](README.md)
- **Tài liệu kỹ thuật:** [TECHNICAL_REPORT.md](TECHNICAL_REPORT.md), [TECHNICAL_SUMMARY.md](TECHNICAL_SUMMARY.md)

---

*Báo cáo được tạo ngày: 13/03/2026*  
*Report generated: March 13, 2026*
