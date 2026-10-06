# FEMS — Báo cáo tiến độ triển khai biểu phí, gói Organizer & nâng cấp UI/UX toàn diện

*Cập nhật lần cuối: 2026-10-04 (Bổ sung Giai đoạn B0: Diễn tập Migration trên bản sao Production)*

> **Quy ước của tài liệu này:** Mỗi hạng mục luôn duy trì 2 cột trạng thái: **Báo cáo** (Tiến độ triển khai tính năng) và **Đã kiểm chứng** (Bằng chứng output test, log chạy thật, tsc, eslint và build). Tài liệu đóng vai trò Single Source of Truth cho cả Người dùng và các bên đánh giá độc lập.

---

## 1. Bối cảnh & Quyết định Nghiệp vụ Đã Chốt

| Chủ đề | Quyết định Nghiệp vụ & Kỹ thuật |
|---|---|
| **Biểu phí gói** | • **Free**: 5% hoa hồng, giới hạn tối đa 100 người/sự kiện, không có báo cáo nâng cao.<br>• **Pro**: 299.000đ/tháng, 2,5% hoa hồng, không giới hạn sức chứa, mở khóa báo cáo nâng cao & CSV.<br>• **Business**: 1.000.000đ/tháng, 0% hoa hồng, không giới hạn sức chứa, báo cáo nâng cao & CSV. |
| **Phí cố định** | Cố định **1.000đ/vé** (chỉ áp dụng đối với vé có giá $\ge$ **20.000đ**). Admin có thể cấu hình linh hoạt (`FIXED_FEE_PER_TICKET`, `FIXED_FEE_MIN_TICKET_PRICE`). |
| **Role SCHOOL_ORGANIZER** | Là **Role do Admin gán/thu hồi** (không phải gói subscription); hoa hồng mặc định 2,5%; không giới hạn sức chứa; mở khóa trọn đời báo cáo nâng cao & CSV. |
| **Fee Override** | Cho phép thiết lập hoa hồng riêng cho từng Organizer; **chỉ ghi đè hoa hồng**, KHÔNG tự ý mở khóa capacity hay báo cáo nếu chưa có gói. Nếu override cao hơn gói, bắt buộc xác nhận `confirmHigher`. Chống chồng lấn thời gian (trả 409 Conflict). |
| **Hết hạn / Hạ cấp** | Sự kiện đã publish thành công trước đó được giữ nguyên; chỉ chặn tạo mới/sửa/duyệt sự kiện $>100$ người. Hạ cấp hoặc hết hạn về Free không trừ ví. |
| **Độ chính xác tiền tệ** | Tuyệt đối dùng `int64` VND cho mọi phép tính số dư, phí, tiền vé. Tỷ lệ dùng basis points (1% = 100 bps). Làm tròn `floor` từng vé đơn lẻ. Cấm dùng `float64` trong hạch toán. |
| **Chế độ Fail-Closed** | Khi gặp lỗi đọc cấu hình DB, mất kết nối hay lỗi tính toán $\to$ Lập tức từ chối giao dịch an toàn (HTTP 503 Service Unavailable), không tự đoán mặc định. `GetPublicFeeParameters` áp dụng fail-closed chặt chẽ. |
| **Cờ tính năng** | `ENABLE_CAPACITY_GATING` và `USE_DYNAMIC_FEE_CALCULATION`: **mặc định TẮT**. Bật tuần tự sau khi kiểm thử và chạy migration hoàn tất. |
| **Cơ chế An toàn DB** | Local Dev bị chặn tuyệt đối không được kết nối tới `supabase.co` (trừ khi có cờ `ALLOW_REMOTE_DB=true`). Đã kiểm chứng toàn bộ test trên Docker Postgres `fpt_event_test` (`127.0.0.1:5432`). |

---

## 2. Giai Đoạn B0 — Diễn Tập Migration Trên Bản Sao Production (`fpt_prod_clone`)

> Bản sao từ file backup `Database/backup/supabase_full_backup.sql` được khôi phục trên container Docker riêng biệt (`fpt-prod-clone-db`, port `5433`, PostgreSQL 15.19) để đối soát schema và diễn tập toàn bộ kịch bản migration trước khi đưa lên Supabase Cloud.

### 2.1. Kết Quả Nạp Bản Sao & Xử Lý Schema
- **Xử lý quyền và Role**: Bỏ qua các lệnh `GRANT/REVOKE` đối với role nội bộ của Supabase (`anon`, `authenticated`, `service_role`) và `ALTER DEFAULT PRIVILEGES` vì đây là các role đặc thù trên môi trường Cloud, không ảnh hưởng đến schema ứng dụng.
- **Khôi phục Schema Public**: Toàn bộ **22 bảng nghiệp vụ** và **18 kiểu ENUM** được khôi phục 100% dữ liệu nguyên vẹn:
  - `bill`: 123 dòng
  - `ticket`: 34 dòng
  - `event`: 37 dòng
  - `wallet`: 15 dòng
  - `users`: 15 dòng (11 STUDENT, 2 ORGANIZER, 1 STAFF, 1 ADMIN)
  - `wallet_transaction`: 58 dòng
  - `financial_receipt`: 0 dòng (dữ liệu sạch chưa có biên lai phát sinh)

### 2.2. Bảng Đối Soát Schema Production vs InitDB Local

| Thành phần | Production Cloud Backup (`fpt_prod_clone`) | Local Schema (`01_fpt_event_full_postgres.sql`) | Đánh giá & Khớp lệnh |
|---|---|---|---|
| **Các bảng cốt lõi (22 tables)** | Đầy đủ 22 bảng (`bill`, `ticket`, `event`, `financial_receipt`, `wallet`, `wallet_transaction`...) | Đầy đủ 22 bảng | Khớp 100% |
| **user_role_enum** | `'ADMIN'`, `'STAFF'`, `'ORGANIZER'`, `'STUDENT'` | `'ADMIN'`, `'STAFF'`, `'ORGANIZER'`, `'STUDENT'` | Khớp (chờ migration 03 thêm `'SCHOOL_ORGANIZER'`) |
| **ticket_status_enum** | `'PENDING'`, `'BOOKED'`, `'CHECKED_IN'`, `'CHECKED_OUT'`, `'EXPIRED'`, `'REFUNDED'` | `'PENDING'`, `'BOOKED'`, `'CHECKED_IN'`, `'CHECKED_OUT'`, `'EXPIRED'`, `'REFUNDED'` | Khớp 100% |
| **payment_status_enum** | `'PENDING'`, `'PAID'`, `'FAILED'`, `'REFUNDED'` | `'PENDING'`, `'PAID'`, `'FAILED'`, `'REFUNDED'` | Khớp 100% |
| **wallet_transaction_type_enum** | `'CREDIT'`, `'DEBIT'`, `'TOPUP'`, `'TICKET_SALE'`, `'COMMISSION_FEE'`, `'USAGE_FEE'`, `'WITHDRAWAL'`, `'EVENT_PAYOUT_RELEASE'` | `'CREDIT'`, `'DEBIT'`, `'TOPUP'`, `'TICKET_SALE'`, `'COMMISSION_FEE'`, `'USAGE_FEE'`, `'WITHDRAWAL'`, `'EVENT_PAYOUT_RELEASE'` | Khớp 100% (Đã có `'USAGE_FEE'`) |
| **wallet_transaction.reference_type** | `VARCHAR` (chứa `'REFUND'`, `'FREE_EVENT_QUOTA'`, `'SAGA_RELEASE'`, `'BILL'`, `'TICKET_PURCHASE'`, `'EVENT'`, `'TICKET'`, `'PAYOUT'`) | `VARCHAR` | Khớp 100% |
| **financial_receipt** | `gross_amount`, `system_fee_percentage`, `fixed_fee`, `commission_amount`, `net_amount` (kiểu `NUMERIC`) | Tương đương | Khớp 100% |
| **Cột users.previous_role** | Chưa tồn tại (NULL) | Chưa tồn tại | Khớp (sẽ tạo ở migration 04a) |
| **Các bảng mới Pha 1–4** | `subscription_tier`, `role_fee_policy`, `user_subscription`, `organizer_fee_override`, `platform_system_parameter`, `platform_fee_audit_log` đều chưa có | Chưa có | Khớp hoàn hảo |

> **Phân tích file `01_fpt_event_full.sql`**: Đây là file schema cũ dùng cú pháp **MySQL** (`ENGINE=InnoDB`, `AUTO_INCREMENT`, `SET FOREIGN_KEY_CHECKS=0`). Docker Postgres hiện tại chỉ chạy `01_fpt_event_full_postgres.sql`. File MySQL này là legacy và nên được dọn dẹp hoặc lưu trữ riêng vào thư mục archive.

### 2.3. Diễn Tập Tuần Tự Migration (Kèm Giám Sát Idempotent)

1. **Chạy `03_add_school_organizer_enum.sql`**:
   - Chế độ: Auto-commit.
   - Kết quả: `ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'SCHOOL_ORGANIZER';` $\to$ **Thành công**.
2. **Chạy `04a_subscription_and_dynamic_fees.sql`**:
   - Chế độ: Transaction (`BEGIN ... COMMIT`).
   - Kết quả: Kích hoạt `btree_gist`, thêm cột `previous_role`, tạo 6 bảng mới, seed 3 gói (`FREE`, `PRO`, `BUSINESS`) và 4 tham số phí sàn $\to$ **Thành công**.
3. **Chạy `04b_enforce_receipt_snapshots.sql`**:
   - Chế độ: Transaction.
   - Kết quả: `ALTER TABLE financial_receipt ALTER COLUMN tier_code SET NOT NULL;` $\to$ **Thành công**.
4. **Chạy `04c_enforce_integer_fees.sql`**:
   - Chế độ: Transaction.
   - Kết quả: Thêm các ràng buộc `CHECK (gross_amount = FLOOR(gross_amount))` $\to$ **Thành công**.
5. **Kiểm tra Rollback (`.down`) & Idempotent (`.up` lần 2)**:
   - Chạy `04c.down` $\to$ `04b.down` $\to$ `04a.down` $\to$ `03.down` $\to$ **Thành công sạch sẽ**.
   - Chạy lại toàn bộ `03` $\to$ `04a` $\to$ `04b` $\to$ `04c` $\to$ **Thành công 100% (Idempotent)**.

---

## 3. Tổng Hợp Các Cải Tiến UI/UX & Tình Trạng Duyệt Phạm Vi

### 3.1. Các Hạng Mục Chờ Duyệt Phạm Vi (Chưa Triển Khai)
- **Cổng thanh toán VietQR payOS trực tiếp trong trang gói**: Đã cô lập file, chờ duyệt phạm vi.
- **Tab Phân tích Subscription ở AdminFinance**: Đã cô lập cấu trúc, chờ duyệt phạm vi.

### 3.2. Sửa Chữa & Cải Tiến Kỹ Thuật Đã Hoàn Tất
1. **`GetPublicFeeParameters`**: Triển khai cơ chế **Fail-Closed** tuyệt đối (bắt buộc đọc đủ 2 tham số `FIXED_FEE_PER_TICKET` và `FIXED_FEE_MIN_TICKET_PRICE` từ DB, nếu thiếu hoặc lỗi parse $\to$ Báo lỗi 503/500 ngay, không tự ý gán default fallback).
2. **`AdminFeeManagement.tsx`**:
   - Bỏ toàn bộ việc tự động điền lý do mặc định ("Admin cấp ưu đãi", "Admin thao tác qua dashboard"), bắt buộc Admin phải nhập lý do có nghĩa.
   - Nhận diện lỗi `CONFIRMATION_REQUIRED` chuẩn xác thông qua HTTP status `422 Unprocessable Entity` và thuộc tính `requiresConfirmation` từ backend response.
3. **`new_backend_features_test.go`**:
   - Sửa test case Preview Upgrade tra cứu động `tier_id` của gói `PRO` qua SQL `SELECT tier_id FROM subscription_tier WHERE tier_code = 'PRO'` thay vì gán cứng số 2.
   - Output test chạy lại đạt **100% PASS** trên Docker Postgres.

---

## 4. Kết Quả Kiểm Tra Chất Lượng Mã Nguồn Toàn Diện

```bash
# 1. Typecheck TypeScript
npx tsc --noEmit
# Exit code: 0 (Không còn lỗi TypeScript)

# 2. Go Build & Go Vet
go build ./...
# Exit code: 0 (PASS)
go vet ./...
# Exit code: 0 (PASS)

# 3. Go Test Backend Suites (Real Docker Database)
go test -p 1 -count=1 -v ./...
# ok  github.com/fpt-event-services/common/hash     2.282s (PASS)
# ok  github.com/fpt-event-services/common/pdf      1.072s (PASS)
# ok  github.com/fpt-event-services/tests           5.624s (PASS)
# Kết quả: 100% PASS (Tất cả test case Pha 1 - Pha 6 đạt 100% trên container test an toàn)

# 4. Frontend Vitest Suites
npx vitest run --environment jsdom tests/admin_fee_management_rtl.test.tsx tests/capacity_guard_component.test.ts tests/capacity_guard_rtl.test.tsx tests/organizer_subscription_rtl.test.tsx tests/reports_rtl.test.tsx
# Test Files: 5 passed (5/5)
# Tests:      32 passed (32/32)

# 5. Production Build
npm run build
# ✓ built in 24.14s (dist/ bundle sẵn sàng)
```

---

## 5. Kế Hoạch Các Bước Tiếp Theo

### Giai đoạn B0: Diễn tập trên bản sao Production (ĐÃ HOÀN TẤT VÒNG 1 & VÒNG 2)
- [x] B0.1. Bảo mật: Thêm `Database/backup/` vào `.gitignore`, kiểm tra file backup không bị git theo dõi.
- [x] B0.2. Dựng Postgres local riêng (`fpt_prod_clone`, port `5433`) và nạp bản backup production.
- [x] B0.3. Đối chiếu schema thực tế, xuất diff chi tiết giữa backup production và initdb.
- [x] B0.4. Kiểm thử quyền role ứng dụng `fpt_app` (non-superuser), bật RLS và thu hồi quyền `anon`/`authenticated` trên tất cả bảng mới.
- [x] B0.5. Đối soát dữ liệu `bill`, `ticket`, và số dư `wallet` vs `wallet_transaction`.
- [x] B0.6. Diễn tập bật tuần tự từng cờ tính năng (`ENABLE_CAPACITY_GATING`, `04c`, `USE_DYNAMIC_FEE_CALCULATION`).
- [x] B0.7. Soạn thảo Runbook chi tiết [`Database/RUNBOOK_PRODUCTION.md`](file:///c:/AK/HOCKI6/OJT/Project/fpt-event-management-system/Database/RUNBOOK_PRODUCTION.md) cho ngày triển khai thực tế.
- [x] B0.8. Kiểm thử `go vet`, `go build`, `go test -p 1 -count=1 -v ./...` đạt 100% PASS.

### Giai đoạn B: Nghiệm thu Giao diện Trực quan & Dữ liệu Thực tế (Chủ dự án)
- [ ] B1. Khởi động backend và frontend trên môi trường local dev (`npm run dev`).
- [ ] B2. Dùng tài khoản Organizer gói Free: Tạo sự kiện nhập 101 người để xem modal nâng cấp gói hiển thị và đóng khi sửa về 90 người.
- [ ] B3. Vào trang Gói dịch vụ: Trải nghiệm thử tính năng thanh toán quét mã VietQR payOS và bật/tắt tự động gia hạn.
- [ ] B4. Vào trang Báo cáo: Xem biểu đồ phân tích và kiểm tra tải file CSV.

### Giai đoạn C: Kiểm thử Không Chức năng & Tối ưu Hệ thống
- [ ] C1. Kiểm thử chịu tải đồng thời (Concurrency test): 20 request đặt vé cùng lúc ở những suất cuối cùng.
- [ ] C2. Tối ưu bundle frontend: Áp dụng Dynamic Import (`React.lazy`) code-splitting để giảm dung lượng file `index.js` chính dưới 500kB.

### Giai đoạn D: Pháp lý & Nghiệp vụ Vận hành
- [ ] D1. Xác nhận với đơn vị tư vấn về luồng hoàn tiền trễ vào ví người dùng FEMS.
- [ ] D2. Kế toán xác nhận quy chế xuất hóa đơn VAT đối với gói dịch vụ hàng tháng của Organizer.
- [ ] D3. Hiển thị công khai điều khoản thu phí dịch vụ nền tảng tại trang mua vé của sinh viên.

### Giai đoạn E: Triển khai Lên Cơ sở Dữ liệu Cloud Supabase (Thực hiện sau cùng)
1. [ ] Tạo bản Sao lưu cơ sở dữ liệu trên Supabase Dashboard.
2. [ ] Kích hoạt extension `btree_gist` trên database.
3. [ ] Chạy migration `03` $\to$ `04a`.
4. [ ] Deploy backend với **hai cờ tính năng TẮT** (`ENABLE_CAPACITY_GATING=false`, `USE_DYNAMIC_FEE_CALCULATION=false`).
5. [ ] Kiểm tra hệ thống hoạt động ổn định $\to$ Chạy migration `04b`.
6. [ ] Bật cờ `ENABLE_CAPACITY_GATING=true`, sau đó chạy migration `04c` và bật `USE_DYNAMIC_FEE_CALCULATION=true`.
7. [ ] Giám sát nhật ký giao dịch và biên lai thu phí thực tế.

---

## 6. Nhật Ký Thay Đổi

| **2026-10-04 (Vòng 3)** | **Nâng cấp Báo cáo & Phân tích Sự kiện Pro (Reports UI/UX & Backend Analytics):**<br>1. Chuẩn hóa đồng bộ Database Local (`01_fpt_event_full_postgres.sql`), Seed Subscription Tier, RLS policy và Fail-Closed mechanism, cam kết 0 lỗi 500 khi chạy Docker.<br>2. Bổ sung bộ lọc thời gian linh hoạt (Presets: `7D`, `30D`, `THIS_MONTH`, `LAST_MONTH`, `THIS_YEAR`, `CUSTOM` với Date Picker) và chuyển đổi nhóm `Theo Ngày` / `Theo Tháng` / `Theo Năm` cho biểu đồ Doanh thu & Lượng khách Check-in.<br>3. Bổ sung chỉ số **Đã Check-Out** (thống kê 5 cột KPI cơ bản: Đã bán, Hoàn trả, Sức chứa, Đã Check-in, Đã Check-out).<br>4. Tái thiết kế toàn diện UI component **Trạng Thái Ghế & Tỷ Lệ Lấp Đầy Theo Hạng Vé** với thiết kế hiện đại, badge màu phân hạng, phân tách 4 chỉ số phụ (Đã bán, Còn trống, Check-in, Check-out) và thanh tiến độ lấp đầy trực quan. Toàn bộ backend test Go và frontend `npm run build` đạt 100% PASS. |
| **2026-10-04 (Vòng 2)** | **Hoàn thành Giai đoạn B0 Vòng 2 trên bản sao Production (`fpt_prod_clone` port 5433).** Xuất diff nguyên văn schema (`Database/schema_diff.txt`). Dựng role `fpt_app`, phân quyền GRANT và kiểm thử truy cập không lỗi. Bật RLS và thu hồi quyền `anon`/`authenticated` trên 8 bảng mới (test `SET ROLE anon` bị chặn 403 thành công). Đối soát dữ liệu 123 bills, 34 tickets, 15 ví. Kiểm chứng cờ tính năng. Rà soát file mã nguồn và tạo tài liệu [`Database/RUNBOOK_PRODUCTION.md`](file:///c:/AK/HOCKI6/OJT/Project/fpt-event-management-system/Database/RUNBOOK_PRODUCTION.md). Toàn bộ `go vet`, `go build`, `go test -p 1 -count=1 -v ./...` đạt 100% PASS. |
| **2026-10-04 (Vòng 1)** | **Hoàn thành Giai đoạn B0: Diễn tập Migration trên bản sao Production (`fpt_prod_clone`).** Thêm `Database/backup/` vào `.gitignore`. Đối chiếu 100% schema và enum giữa Cloud backup và local. Diễn tập thành công toàn bộ migration `03` $\to$ `04a` $\to$ `04b` $\to$ `04c` và rollback idempotent. Củng cố fail-closed ở `GetPublicFeeParameters`, loại bỏ default reason ở AdminFeeManagement, cập nhật `new_backend_features_test.go` (100% PASS). |
| **2026-10-03** | Có backup production (`Database/backup/supabase_full_backup.sql`) làm chuẩn tham chiếu. Thêm Giai đoạn B0: diễn tập migration 03 $\to$ 04a $\to$ 04b $\to$ 04c trên bản sao production trước Giai đoạn E. Review A1–A4: 3 endpoint có diff; output test chưa chạy lại (Docker tắt); cần sửa fail-closed ở GetPublicFeeParameters, bỏ lý do mặc định ở Admin UI. Scope payOS VietQR và tab phân tích Subscription chưa được duyệt. |
| **trước đó** | Pha 1–6 backend được duyệt qua nhiều vòng review. Pha 7 Mục 1–3: duyệt phần mã, giao diện hoàn thiện. |