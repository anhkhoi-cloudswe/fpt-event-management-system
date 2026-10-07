package db

import (
	"context"
	"database/sql"
	"sync"
)

var initTestSchemaOnce sync.Once

// EnsureAllTestTablesExists tự động khởi tạo toàn bộ schema kiểm thử
// độc lập với thư mục Database/ (giúp CI trên GitHub Actions chạy thành công 100% khi Database/ bị .gitignore)
func EnsureAllTestTablesExists(db *sql.DB) error {
	var err error
	initTestSchemaOnce.Do(func() {
		ctx := context.Background()

		// 1. Tạo các role Supabase giả lập nếu chưa có
		initRolesSQL := `
			DO $$ 
			BEGIN 
				IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
				IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
				IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
			END $$;
		`
		_, _ = db.ExecContext(ctx, initRolesSQL)

		// 2. Tạo extensions và ENUMs
		initEnumsSQL := `
			CREATE EXTENSION IF NOT EXISTS btree_gist;
			DO $$ BEGIN CREATE TYPE payment_status_enum AS ENUM ('PENDING','PAID','FAILED','REFUNDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE category_ticket_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED','ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE event_status_enum AS ENUM ('OPEN','CLOSED','CANCELLED','UPDATING','FINISHED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE event_request_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','UPDATING','CANCELLED','EXPIRED','FINISHED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE seat_type_enum AS ENUM ('STANDARD','VIP'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE seat_layout_status_enum AS ENUM ('AVAILABLE','HOLD','BOOKED','INAVAILABLE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE report_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE seat_status_enum AS ENUM ('ACTIVE','INACTIVE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE ticket_status_enum AS ENUM ('PENDING','BOOKED','CHECKED_IN','CHECKED_OUT','EXPIRED','REFUNDED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE user_role_enum AS ENUM ('ADMIN','STAFF','ORGANIZER','STUDENT','SCHOOL_ORGANIZER'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE user_status_enum AS ENUM ('ACTIVE','INACTIVE','BLOCKED','PENDING_DELETE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE venue_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE venue_area_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE wallet_status_enum AS ENUM ('ACTIVE','FROZEN','CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE wallet_transaction_type_enum AS ENUM ('CREDIT','DEBIT','TOPUP','TICKET_SALE','COMMISSION_FEE','USAGE_FEE','WITHDRAWAL','EVENT_PAYOUT_RELEASE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE payout_status_enum AS ENUM ('PENDING','PROCESSING','COMPLETED','REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE organization_type_enum AS ENUM ('SCHOOL','FREE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
			DO $$ BEGIN CREATE TYPE privacy_status_enum AS ENUM ('PUBLIC','PRIVATE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
		`
		_, _ = db.ExecContext(ctx, initEnumsSQL)

		// Thêm enum value SCHOOL_ORGANIZER nếu enum đã tạo trước đó
		_, _ = db.ExecContext(ctx, "ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'SCHOOL_ORGANIZER';")

		// 3. Tạo toàn bộ bảng theo đúng schema production chuẩn
		fullTablesSQL := `
			CREATE TABLE IF NOT EXISTS users (
				user_id SERIAL PRIMARY KEY,
				full_name VARCHAR(100) NOT NULL,
				email VARCHAR(100) NOT NULL UNIQUE,
				phone VARCHAR(20),
				password_hash VARCHAR(255) NOT NULL,
				role user_role_enum NOT NULL DEFAULT 'STUDENT',
				status user_status_enum DEFAULT 'ACTIVE',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				wallet NUMERIC(18,2) DEFAULT 0.00,
				sso_provider VARCHAR(50) DEFAULT NULL,
				deleted_at TIMESTAMPTZ DEFAULT NULL,
				theme VARCHAR(10) DEFAULT 'light',
				language VARCHAR(10) DEFAULT 'vi',
				active_session_token_id VARCHAR(255) DEFAULT NULL,
				previous_role user_role_enum DEFAULT NULL
			);

			CREATE TABLE IF NOT EXISTS speaker (
				speaker_id SERIAL PRIMARY KEY,
				full_name VARCHAR(100) NOT NULL,
				bio TEXT,
				email VARCHAR(100),
				phone VARCHAR(20),
				avatar_url VARCHAR(255)
			);

			CREATE TABLE IF NOT EXISTS venue (
				venue_id SERIAL PRIMARY KEY,
				venue_name VARCHAR(200) NOT NULL,
				location VARCHAR(255),
				status venue_status_enum DEFAULT 'AVAILABLE'
			);

			CREATE TABLE IF NOT EXISTS venue_area (
				area_id SERIAL PRIMARY KEY,
				venue_id INTEGER NOT NULL REFERENCES venue(venue_id) ON DELETE CASCADE,
				area_name VARCHAR(200) NOT NULL,
				floor VARCHAR(50),
				capacity INTEGER NOT NULL DEFAULT 100,
				status venue_area_status_enum DEFAULT 'AVAILABLE'
			);

			CREATE TABLE IF NOT EXISTS event (
				event_id SERIAL PRIMARY KEY,
				title VARCHAR(200) NOT NULL,
				description TEXT,
				start_time TIMESTAMPTZ NOT NULL,
				end_time TIMESTAMPTZ NOT NULL,
				speaker_id INTEGER REFERENCES speaker(speaker_id),
				max_seats INTEGER DEFAULT 0,
				status event_status_enum NOT NULL DEFAULT 'UPDATING',
				created_by INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				area_id INTEGER REFERENCES venue_area(area_id),
				banner_url VARCHAR(500),
				checkin_offset INTEGER DEFAULT 60,
				checkout_offset INTEGER DEFAULT 30,
				event_format VARCHAR(50) NOT NULL DEFAULT 'ONSITE',
				custom_venue_name VARCHAR(200),
				custom_location VARCHAR(255),
				org_type organization_type_enum NOT NULL DEFAULT 'SCHOOL',
				privacy_status privacy_status_enum NOT NULL DEFAULT 'PUBLIC',
				online_meeting_url VARCHAR(500),
				online_meeting_id VARCHAR(100),
				online_meeting_secret VARCHAR(100),
				is_settled BOOLEAN NOT NULL DEFAULT FALSE,
				settled_at TIMESTAMPTZ
			);

			CREATE TABLE IF NOT EXISTS event_request (
				request_id SERIAL PRIMARY KEY,
				requester_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				title VARCHAR(200) NOT NULL,
				description TEXT,
				preferred_start_time TIMESTAMPTZ,
				preferred_end_time TIMESTAMPTZ,
				expected_capacity INTEGER,
				status event_request_status_enum DEFAULT 'PENDING',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				processed_by INTEGER REFERENCES users(user_id),
				processed_at TIMESTAMPTZ,
				organizer_note VARCHAR(500),
				created_event_id INTEGER REFERENCES event(event_id),
				reject_reason TEXT,
				event_format VARCHAR(50) NOT NULL DEFAULT 'ONSITE',
				custom_venue_name VARCHAR(200),
				custom_location VARCHAR(255),
				banner_url VARCHAR(500),
				org_type organization_type_enum NOT NULL DEFAULT 'SCHOOL',
				privacy_status privacy_status_enum NOT NULL DEFAULT 'PUBLIC',
				online_meeting_url VARCHAR(500),
				online_meeting_id VARCHAR(100),
				online_meeting_secret VARCHAR(100)
			);

			CREATE TABLE IF NOT EXISTS category_ticket (
				category_ticket_id SERIAL PRIMARY KEY,
				event_id INTEGER NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				name VARCHAR(50) NOT NULL,
				description VARCHAR(255),
				price NUMERIC(18,2) DEFAULT 0.00,
				max_quantity INTEGER DEFAULT 0,
				status category_ticket_status_enum NOT NULL DEFAULT 'AVAILABLE'
			);

			CREATE TABLE IF NOT EXISTS bill (
				bill_id SERIAL PRIMARY KEY,
				user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				total_amount NUMERIC(18,2) NOT NULL,
				currency VARCHAR(10) DEFAULT 'VND',
				payment_method VARCHAR(50),
				payment_status payment_status_enum DEFAULT 'PENDING',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				paid_at TIMESTAMPTZ
			);

			CREATE TABLE IF NOT EXISTS seat (
				seat_id SERIAL PRIMARY KEY,
				seat_code VARCHAR(20) NOT NULL,
				row_no VARCHAR(10),
				col_no VARCHAR(10),
				status seat_status_enum DEFAULT 'ACTIVE',
				area_id INTEGER NOT NULL REFERENCES venue_area(area_id),
				category_ticket_id INTEGER REFERENCES category_ticket(category_ticket_id) ON DELETE SET NULL
			);

			CREATE TABLE IF NOT EXISTS event_seat_layout (
				event_id INTEGER NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				seat_id INTEGER NOT NULL REFERENCES seat(seat_id) ON DELETE CASCADE,
				seat_type seat_type_enum NOT NULL,
				status seat_layout_status_enum DEFAULT 'AVAILABLE',
				PRIMARY KEY (event_id, seat_id)
			);

			CREATE TABLE IF NOT EXISTS ticket (
				ticket_id SERIAL PRIMARY KEY,
				event_id INTEGER NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				category_ticket_id INTEGER NOT NULL REFERENCES category_ticket(category_ticket_id),
				bill_id INTEGER REFERENCES bill(bill_id) ON DELETE SET NULL,
				seat_id INTEGER REFERENCES seat(seat_id),
				qr_code_value TEXT NOT NULL,
				qr_issued_at TIMESTAMPTZ DEFAULT NOW(),
				status ticket_status_enum DEFAULT 'BOOKED',
				checkin_time TIMESTAMPTZ,
				check_out_time TIMESTAMPTZ,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS wallet (
				wallet_id SERIAL PRIMARY KEY,
				user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
				balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
				pending_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
				currency VARCHAR(10) NOT NULL DEFAULT 'VND',
				status wallet_status_enum NOT NULL DEFAULT 'ACTIVE',
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS wallet_transaction (
				transaction_id SERIAL PRIMARY KEY,
				wallet_id INTEGER NOT NULL REFERENCES wallet(wallet_id),
				user_id INTEGER NOT NULL REFERENCES users(user_id),
				type wallet_transaction_type_enum NOT NULL,
				amount NUMERIC(15,2) NOT NULL,
				balance_before NUMERIC(15,2) NOT NULL,
				balance_after NUMERIC(15,2) NOT NULL,
				reference_type VARCHAR(50),
				reference_id VARCHAR(100),
				description TEXT,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS financial_receipt (
				receipt_id SERIAL PRIMARY KEY,
				order_id BIGINT NOT NULL,
				bill_id INTEGER REFERENCES bill(bill_id) ON DELETE SET NULL,
				ticket_id INTEGER REFERENCES ticket(ticket_id) ON DELETE SET NULL,
				event_id INTEGER NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				organizer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				gross_amount NUMERIC(15,2) NOT NULL,
				system_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00,
				fixed_fee NUMERIC(15,2) NOT NULL DEFAULT 1000.00,
				commission_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
				net_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
				currency VARCHAR(10) NOT NULL DEFAULT 'VND',
				tier_code VARCHAR(50) NOT NULL DEFAULT 'FREE',
				commission_bps INTEGER NOT NULL DEFAULT 500,
				fee_source VARCHAR(50) NOT NULL DEFAULT 'TIER',
				fee_config_version INTEGER DEFAULT 1,
				is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
				reversal_of_receipt_id INTEGER REFERENCES financial_receipt(receipt_id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS subscription_tier (
				tier_id SERIAL PRIMARY KEY,
				tier_code VARCHAR(50) NOT NULL UNIQUE,
				name VARCHAR(100) NOT NULL,
				description TEXT,
				price_vnd BIGINT NOT NULL DEFAULT 0 CHECK (price_vnd >= 0),
				billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
				commission_bps INTEGER NOT NULL DEFAULT 500 CHECK (commission_bps >= 0 AND commission_bps <= 10000),
				max_capacity_limit INTEGER NOT NULL DEFAULT 100,
				has_advanced_reports BOOLEAN NOT NULL DEFAULT FALSE,
				is_active BOOLEAN NOT NULL DEFAULT TRUE,
				updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS role_fee_policy (
				role_code VARCHAR(50) PRIMARY KEY,
				name VARCHAR(100) NOT NULL,
				description TEXT,
				commission_bps INTEGER NOT NULL DEFAULT 250,
				max_capacity_limit INTEGER NOT NULL DEFAULT -1,
				has_advanced_reports BOOLEAN NOT NULL DEFAULT TRUE,
				is_active BOOLEAN NOT NULL DEFAULT TRUE,
				updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS user_subscription (
				subscription_id SERIAL PRIMARY KEY,
				user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				tier_id INTEGER NOT NULL REFERENCES subscription_tier(tier_id) ON DELETE RESTRICT,
				status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
				start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
				end_date TIMESTAMPTZ NOT NULL,
				auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
				amount_paid_vnd BIGINT NOT NULL DEFAULT 0,
				prorated_credit_vnd BIGINT NOT NULL DEFAULT 0,
				scheduled_downgrade_tier_id INTEGER REFERENCES subscription_tier(tier_id) ON DELETE SET NULL,
				request_id VARCHAR(100) UNIQUE,
				bill_id INTEGER REFERENCES bill(bill_id) ON DELETE SET NULL,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS subscription_payment_log (
				payment_id SERIAL PRIMARY KEY,
				subscription_id INTEGER REFERENCES user_subscription(subscription_id) ON DELETE CASCADE,
				user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				tier_id INTEGER NOT NULL REFERENCES subscription_tier(tier_id) ON DELETE RESTRICT,
				action_type VARCHAR(30) NOT NULL,
				amount_paid_vnd BIGINT NOT NULL DEFAULT 0,
				prorated_credit_vnd BIGINT NOT NULL DEFAULT 0,
				request_id VARCHAR(100) UNIQUE,
				start_date TIMESTAMPTZ NOT NULL,
				end_date TIMESTAMPTZ NOT NULL,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS organizer_fee_override (
				override_id SERIAL PRIMARY KEY,
				organizer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				commission_bps INTEGER NOT NULL,
				reason TEXT NOT NULL,
				effective_range TSTZRANGE NOT NULL,
				created_by INTEGER NOT NULL REFERENCES users(user_id),
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS platform_system_parameter (
				param_key VARCHAR(50) PRIMARY KEY,
				param_value VARCHAR(255) NOT NULL,
				description TEXT,
				updated_at TIMESTAMPTZ DEFAULT NOW(),
				updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL
			);

			CREATE TABLE IF NOT EXISTS fee_audit_log (
				log_id SERIAL PRIMARY KEY,
				target_entity VARCHAR(50) NOT NULL,
				target_id VARCHAR(50) NOT NULL,
				action VARCHAR(50) NOT NULL,
				old_value JSONB,
				new_value JSONB,
				reason TEXT NOT NULL,
				changed_by INTEGER NOT NULL REFERENCES users(user_id),
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS platform_expense_ledger (
				expense_id SERIAL PRIMARY KEY,
				expense_type VARCHAR(50) NOT NULL,
				amount BIGINT NOT NULL CHECK (amount > 0),
				currency VARCHAR(10) NOT NULL DEFAULT 'VND',
				reference_type VARCHAR(50),
				reference_id VARCHAR(100),
				description TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			-- Ensure columns exist if table was partially created
			ALTER TABLE users ADD COLUMN IF NOT EXISTS previous_role user_role_enum DEFAULT NULL;
			ALTER TABLE subscription_tier ADD COLUMN IF NOT EXISTS description TEXT;
			ALTER TABLE subscription_tier ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL;
			ALTER TABLE role_fee_policy ADD COLUMN IF NOT EXISTS description TEXT;
			ALTER TABLE role_fee_policy ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL;

			-- Seed dữ liệu cấu hình mặc định
			INSERT INTO subscription_tier (tier_id, tier_code, name, description, price_vnd, commission_bps, max_capacity_limit, has_advanced_reports, is_active)
			VALUES 
				(1, 'FREE', 'Gói Miễn Phí', 'Gói mặc định cho tất cả Organizer khi mới tạo tài khoản', 0, 500, 100, FALSE, TRUE),
				(2, 'PRO', 'Gói Chuyên Nghiệp', 'Không giới hạn sức chứa, phí hoa hồng ưu đãi 2.5%, mở khóa báo cáo nâng cao', 299000, 250, -1, TRUE, TRUE),
				(3, 'BUSINESS', 'Gói Doanh Nghiệp', 'Dành cho các đơn vị lớn, 0% hoa hồng nền tảng, toàn quyền báo cáo và quản lý', 1000000, 0, -1, TRUE, TRUE)
			ON CONFLICT (tier_id) DO NOTHING;

			INSERT INTO role_fee_policy (role_code, name, description, commission_bps, max_capacity_limit, has_advanced_reports, is_active)
			VALUES ('SCHOOL_ORGANIZER', 'Đơn vị nội bộ FPT', 'Chính sách ưu đãi đặc thù cho các ban ngành/CLB trực thuộc Trường', 250, -1, TRUE, TRUE)
			ON CONFLICT (role_code) DO NOTHING;

			INSERT INTO platform_system_parameter (param_key, param_value, description)
			VALUES 
				('FEE_CONFIG_VERSION', '1', 'Phiên bản biểu phí hiện tại'),
				('SYSTEM_MIN_PAYOUT_AMOUNT', '50000', 'Hạn mức rút tiền tối thiểu'),
				('FIXED_FEE_PER_TICKET', '1000', 'Phí cố định mỗi vé'),
				('FIXED_FEE_MIN_TICKET_PRICE', '20000', 'Giá vé tối thiểu áp dụng phí cố định')
			ON CONFLICT (param_key) DO NOTHING;
		`
		_, err = db.ExecContext(ctx, fullTablesSQL)
	})
	return err
}
