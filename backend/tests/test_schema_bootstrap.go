package main

import (
	"context"
	"database/sql"
	"sync"
)

var initSchemaOnce sync.Once

// EnsureAllTestTablesExists tự động khởi tạo toàn bộ schema kiểm thử
// độc lập với thư mục Database/ (giúp CI trên GitHub Actions chạy thành công 100% khi Database/ bị .gitignore)
func EnsureAllTestTablesExists(db *sql.DB) error {
	var err error
	initSchemaOnce.Do(func() {
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

		// 3. Tạo toàn bộ bảng theo đúng schema production
		fullTablesSQL := `
			CREATE TABLE IF NOT EXISTS users (
				user_id SERIAL PRIMARY KEY,
				full_name VARCHAR(100) NOT NULL,
				email VARCHAR(100) NOT NULL UNIQUE,
				phone VARCHAR(20),
				password_hash VARCHAR(255) NOT NULL,
				role VARCHAR(50) NOT NULL DEFAULT 'STUDENT',
				status VARCHAR(50) DEFAULT 'ACTIVE',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				wallet NUMERIC(18,2) DEFAULT 0.00,
				sso_provider VARCHAR(50) DEFAULT NULL,
				deleted_at TIMESTAMPTZ DEFAULT NULL,
				theme VARCHAR(10) DEFAULT 'light',
				language VARCHAR(10) DEFAULT 'vi',
				active_session_token_id VARCHAR(255) DEFAULT NULL,
				previous_role VARCHAR(50) DEFAULT NULL
			);

			CREATE TABLE IF NOT EXISTS venue (
				venue_id SERIAL PRIMARY KEY,
				name VARCHAR(255) NOT NULL,
				location VARCHAR(255) NOT NULL,
				status VARCHAR(50) DEFAULT 'AVAILABLE',
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS venue_area (
				area_id SERIAL PRIMARY KEY,
				venue_id INT REFERENCES venue(venue_id) ON DELETE CASCADE,
				name VARCHAR(255) NOT NULL,
				floor INT DEFAULT 1,
				total_capacity INT NOT NULL DEFAULT 100,
				status VARCHAR(50) DEFAULT 'AVAILABLE',
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS event (
				event_id SERIAL PRIMARY KEY,
				title VARCHAR(255) NOT NULL,
				description TEXT,
				start_time TIMESTAMPTZ NOT NULL,
				end_time TIMESTAMPTZ NOT NULL,
				banner_url VARCHAR(500),
				status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
				created_by INT REFERENCES users(user_id) ON DELETE CASCADE,
				area_id INT,
				max_seats INT DEFAULT 0,
				event_format VARCHAR(50) DEFAULT 'ONSITE',
				meeting_url VARCHAR(500),
				passcode VARCHAR(50),
				organization_type VARCHAR(50) DEFAULT 'FREE',
				privacy_status VARCHAR(50) DEFAULT 'PUBLIC',
				is_settled BOOLEAN DEFAULT FALSE,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS event_request (
				request_id SERIAL PRIMARY KEY,
				requester_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				title VARCHAR(255) NOT NULL,
				description TEXT,
				preferred_start_time TIMESTAMPTZ NOT NULL,
				preferred_end_time TIMESTAMPTZ NOT NULL,
				expected_capacity INT DEFAULT 50,
				status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
				organizer_note TEXT,
				reject_reason TEXT,
				processed_by INT,
				processed_at TIMESTAMPTZ,
				created_event_id INT,
				banner_url VARCHAR(500),
				event_format VARCHAR(50) DEFAULT 'ONSITE',
				meeting_url VARCHAR(500),
				passcode VARCHAR(50),
				organization_type VARCHAR(50) DEFAULT 'FREE',
				privacy_status VARCHAR(50) DEFAULT 'PUBLIC',
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS category_ticket (
				category_ticket_id SERIAL PRIMARY KEY,
				event_id INT NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				name VARCHAR(255) NOT NULL,
				price NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				max_quantity INT NOT NULL DEFAULT 0,
				status VARCHAR(50) DEFAULT 'AVAILABLE',
				description TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS bill (
				bill_id SERIAL PRIMARY KEY,
				user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				total_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
				payment_method VARCHAR(50) DEFAULT 'PAYOS',
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS seat (
				seat_id SERIAL PRIMARY KEY,
				seat_code VARCHAR(50) NOT NULL,
				area_id INT NOT NULL,
				status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS event_seat_layout (
				layout_id SERIAL PRIMARY KEY,
				event_id INT NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				seat_id INT NOT NULL REFERENCES seat(seat_id) ON DELETE CASCADE,
				status VARCHAR(50) NOT NULL DEFAULT 'AVAILABLE',
				seat_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
				price NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS ticket (
				ticket_id SERIAL PRIMARY KEY,
				user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				event_id INT NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
				category_ticket_id INT REFERENCES category_ticket(category_ticket_id) ON DELETE CASCADE,
				bill_id INT REFERENCES bill(bill_id) ON DELETE CASCADE,
				seat_id INT,
				qr_code_value VARCHAR(255) NOT NULL,
				status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				checked_in_at TIMESTAMPTZ,
				checked_out_at TIMESTAMPTZ
			);

			CREATE TABLE IF NOT EXISTS wallet (
				wallet_id SERIAL PRIMARY KEY,
				user_id INT UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				pending_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				currency VARCHAR(10) NOT NULL DEFAULT 'VND',
				status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS wallet_transaction (
				transaction_id SERIAL PRIMARY KEY,
				wallet_id INT REFERENCES wallet(wallet_id) ON DELETE CASCADE,
				user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
				amount NUMERIC(18,2) NOT NULL,
				balance_before NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				balance_after NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				transaction_type VARCHAR(50) NOT NULL,
				status VARCHAR(50) NOT NULL DEFAULT 'PAID',
				reference_id VARCHAR(100),
				description TEXT,
				created_at TIMESTAMPTZ DEFAULT NOW()
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
				updated_by INTEGER,
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
				updated_by INTEGER,
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
				scheduled_downgrade_tier_id INTEGER,
				request_id VARCHAR(100) UNIQUE,
				bill_id INTEGER,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS subscription_payment_log (
				payment_id SERIAL PRIMARY KEY,
				subscription_id INTEGER,
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
				created_by INTEGER NOT NULL,
				created_at TIMESTAMPTZ DEFAULT NOW(),
				updated_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS platform_system_parameter (
				param_key VARCHAR(50) PRIMARY KEY,
				param_value VARCHAR(255) NOT NULL,
				description TEXT,
				updated_at TIMESTAMPTZ DEFAULT NOW(),
				updated_by INTEGER
			);

			CREATE TABLE IF NOT EXISTS fee_audit_log (
				log_id SERIAL PRIMARY KEY,
				target_entity VARCHAR(50) NOT NULL,
				target_id VARCHAR(50) NOT NULL,
				action VARCHAR(50) NOT NULL,
				old_value JSONB,
				new_value JSONB,
				reason TEXT NOT NULL,
				changed_by INTEGER NOT NULL,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			CREATE TABLE IF NOT EXISTS financial_receipt (
				receipt_id SERIAL PRIMARY KEY,
				order_id BIGINT,
				bill_id INT,
				ticket_id INT,
				event_id INT NOT NULL,
				organizer_id INT NOT NULL,
				gross_amount NUMERIC(18,2) NOT NULL,
				system_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 5.00,
				fixed_fee NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				commission_bps INT NOT NULL DEFAULT 500,
				fee_config_version INT NOT NULL DEFAULT 1,
				commission_amount NUMERIC(18,2) NOT NULL DEFAULT 0.00,
				net_amount NUMERIC(18,2) NOT NULL,
				tier_code VARCHAR(50) NOT NULL DEFAULT 'FREE',
				fee_source VARCHAR(50) NOT NULL DEFAULT 'TIER',
				is_reversal BOOLEAN NOT NULL DEFAULT FALSE,
				created_at TIMESTAMPTZ DEFAULT NOW()
			);

			-- Seed dữ liệu cấu hình mặc định
			INSERT INTO subscription_tier (tier_id, tier_code, name, price_vnd, commission_bps, max_capacity_limit, has_advanced_reports, is_active)
			VALUES 
				(1, 'FREE', 'Gói Miễn Phí', 0, 500, 100, FALSE, TRUE),
				(2, 'PRO', 'Gói Chuyên Nghiệp', 299000, 250, -1, TRUE, TRUE),
				(3, 'BUSINESS', 'Gói Doanh Nghiệp', 1000000, 0, -1, TRUE, TRUE)
			ON CONFLICT (tier_id) DO NOTHING;

			INSERT INTO role_fee_policy (role_code, name, commission_bps, max_capacity_limit, has_advanced_reports, is_active)
			VALUES ('SCHOOL_ORGANIZER', 'Đơn vị nội bộ FPT', 250, -1, TRUE, TRUE)
			ON CONFLICT (role_code) DO NOTHING;

			INSERT INTO platform_system_parameter (param_key, param_value, description)
			VALUES 
				('FEE_CONFIG_VERSION', '1', 'Phiên bản biểu phí hiện tại'),
				('SYSTEM_MIN_PAYOUT_AMOUNT', '50000', 'Hạn mức rút tiền tối thiểu')
			ON CONFLICT (param_key) DO NOTHING;
		`
		_, err = db.ExecContext(ctx, fullTablesSQL)
	})
	return err
}
