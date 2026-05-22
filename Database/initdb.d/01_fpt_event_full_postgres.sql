-- ============================================================
-- FPT Event Management System — PostgreSQL Schema
-- Converted from MySQL for Supabase deployment
-- ============================================================
-- Encoding: UTF-8 (default in PostgreSQL)
-- ============================================================

-- ============================================================
-- CREATE ENUM TYPES (PostgreSQL)
-- ============================================================
CREATE TYPE payment_status_enum AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
CREATE TYPE category_ticket_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED','ACTIVE','INACTIVE');
CREATE TYPE event_status_enum AS ENUM ('OPEN','CLOSED','CANCELLED','UPDATING');
CREATE TYPE event_request_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','UPDATING','CANCELLED','EXPIRED');
CREATE TYPE seat_type_enum AS ENUM ('STANDARD','VIP');
CREATE TYPE seat_layout_status_enum AS ENUM ('AVAILABLE','HOLD','BOOKED','INAVAILABLE');
CREATE TYPE report_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE seat_status_enum AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE ticket_status_enum AS ENUM ('PENDING','BOOKED','CHECKED_IN','CHECKED_OUT','EXPIRED','REFUNDED');
CREATE TYPE user_role_enum AS ENUM ('ADMIN','STAFF','ORGANIZER','STUDENT');
CREATE TYPE user_status_enum AS ENUM ('ACTIVE','INACTIVE','BLOCKED');
CREATE TYPE venue_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED');
CREATE TYPE venue_area_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE');
CREATE TYPE wallet_status_enum AS ENUM ('ACTIVE','FROZEN','CLOSED');
CREATE TYPE wallet_transaction_type_enum AS ENUM ('CREDIT','DEBIT');

-- ============================================================
-- DROP EXISTING TABLES (if exist)
-- ============================================================
DROP TABLE IF EXISTS wallet_transaction CASCADE;
DROP TABLE IF EXISTS wallet CASCADE;
DROP TABLE IF EXISTS notification CASCADE;
DROP TABLE IF EXISTS report CASCADE;
DROP TABLE IF EXISTS ticket CASCADE;
DROP TABLE IF EXISTS event_seat_layout CASCADE;
DROP TABLE IF EXISTS seat CASCADE;
DROP TABLE IF EXISTS category_ticket CASCADE;
DROP TABLE IF EXISTS event_request CASCADE;
DROP TABLE IF EXISTS event CASCADE;
DROP TABLE IF EXISTS bill CASCADE;
DROP TABLE IF EXISTS speaker CASCADE;
DROP TABLE IF EXISTS venue_area CASCADE;
DROP TABLE IF EXISTS venue CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- CREATE TABLES
-- ============================================================

-- Users Table
CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  role user_role_enum NOT NULL,
  status user_status_enum DEFAULT 'ACTIVE',
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6),
  wallet NUMERIC(18,2) DEFAULT 0.00
);

-- Speaker Table
CREATE TABLE speaker (
  speaker_id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  bio TEXT,
  email VARCHAR(100),
  phone VARCHAR(20),
  avatar_url VARCHAR(255)
);

-- Venue Table
CREATE TABLE venue (
  venue_id SERIAL PRIMARY KEY,
  venue_name VARCHAR(200) NOT NULL,
  location VARCHAR(255),
  status venue_status_enum DEFAULT 'AVAILABLE'
);

-- Venue Area Table
CREATE TABLE venue_area (
  area_id SERIAL PRIMARY KEY,
  venue_id INTEGER NOT NULL REFERENCES venue(venue_id) ON DELETE CASCADE,
  area_name VARCHAR(200) NOT NULL,
  floor VARCHAR(50),
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  status venue_area_status_enum DEFAULT 'AVAILABLE',
  UNIQUE(venue_id, area_name)
);

-- Event Table
CREATE TABLE event (
  event_id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  start_time TIMESTAMP(6) WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP(6) WITH TIME ZONE NOT NULL,
  speaker_id INTEGER REFERENCES speaker(speaker_id),
  max_seats INTEGER CHECK (max_seats > 0),
  status event_status_enum NOT NULL DEFAULT 'UPDATING',
  created_by INTEGER REFERENCES users(user_id),
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6),
  area_id INTEGER REFERENCES venue_area(area_id),
  banner_url VARCHAR(500),
  checkin_offset INTEGER DEFAULT 60,
  checkout_offset INTEGER DEFAULT 30,
  CONSTRAINT event_time_check CHECK (end_time > start_time)
);

-- Bill Table
CREATE TABLE bill (
  bill_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  total_amount NUMERIC(18,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'VND',
  payment_method VARCHAR(50),
  payment_status payment_status_enum DEFAULT 'PENDING',
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6),
  paid_at TIMESTAMP WITH TIME ZONE
);

-- Category Ticket Table
CREATE TABLE category_ticket (
  category_ticket_id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES event(event_id),
  name VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  price NUMERIC(18,2) DEFAULT 0.00,
  max_quantity INTEGER CHECK (max_quantity > 0),
  status category_ticket_status_enum NOT NULL DEFAULT 'AVAILABLE',
  UNIQUE(event_id, name),
  CHECK (price >= 0),
  CHECK (price <= 100000000)
);

-- Seat Table
CREATE TABLE seat (
  seat_id SERIAL PRIMARY KEY,
  seat_code VARCHAR(20) NOT NULL,
  row_no VARCHAR(10),
  col_no VARCHAR(10),
  status seat_status_enum DEFAULT 'ACTIVE',
  area_id INTEGER NOT NULL REFERENCES venue_area(area_id),
  category_ticket_id INTEGER REFERENCES category_ticket(category_ticket_id) ON DELETE SET NULL,
  UNIQUE(area_id, seat_code)
);

-- Event Seat Layout Table
CREATE TABLE event_seat_layout (
  event_id INTEGER NOT NULL REFERENCES event(event_id),
  seat_id INTEGER NOT NULL REFERENCES seat(seat_id),
  seat_type seat_type_enum NOT NULL,
  status seat_layout_status_enum DEFAULT 'AVAILABLE',
  PRIMARY KEY (event_id, seat_id)
);

-- Ticket Table
CREATE TABLE ticket (
  ticket_id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES event(event_id),
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  category_ticket_id INTEGER NOT NULL REFERENCES category_ticket(category_ticket_id),
  bill_id INTEGER REFERENCES bill(bill_id),
  seat_id INTEGER REFERENCES seat(seat_id),
  qr_code_value TEXT NOT NULL,
  qr_issued_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6),
  status ticket_status_enum DEFAULT 'BOOKED',
  checkin_time TIMESTAMP(6) WITH TIME ZONE,
  check_out_time TIMESTAMP(6) WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, seat_id)
);

-- Event Request Table
CREATE TABLE event_request (
  request_id SERIAL PRIMARY KEY,
  requester_id INTEGER NOT NULL REFERENCES users(user_id),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  preferred_start_time TIMESTAMP(6) WITH TIME ZONE,
  preferred_end_time TIMESTAMP(6) WITH TIME ZONE,
  expected_capacity INTEGER,
  status event_request_status_enum DEFAULT 'PENDING',
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6),
  processed_by INTEGER REFERENCES users(user_id),
  processed_at TIMESTAMP(6) WITH TIME ZONE,
  organizer_note VARCHAR(500),
  created_event_id INTEGER REFERENCES event(event_id),
  reject_reason TEXT
);

-- Notification Table
CREATE TABLE notification (
  notification_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6)
);

-- Report Table
CREATE TABLE report (
  report_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id),
  ticket_id INTEGER NOT NULL REFERENCES ticket(ticket_id),
  title VARCHAR(200),
  description VARCHAR(2000) NOT NULL,
  image_url VARCHAR(500),
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP(6),
  status report_status_enum DEFAULT 'PENDING',
  processed_by INTEGER REFERENCES users(user_id),
  processed_at TIMESTAMP(6) WITH TIME ZONE,
  refund_amount NUMERIC(18,2),
  staff_note VARCHAR(1000)
);

-- Wallet Table
CREATE TABLE wallet (
  wallet_id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
  balance NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'VND',
  status wallet_status_enum NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Wallet Transaction Table
CREATE TABLE wallet_transaction (
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- CREATE INDEXES
-- ============================================================
CREATE INDEX idx_bill_user_id ON bill(user_id);
CREATE INDEX idx_category_ticket_event_id ON category_ticket(event_id);
CREATE INDEX idx_event_area_id ON event(area_id);
CREATE INDEX idx_event_created_by ON event(created_by);
CREATE INDEX idx_event_speaker_id ON event(speaker_id);
CREATE INDEX idx_event_request_event_id ON event_request(created_event_id);
CREATE INDEX idx_event_request_processed_by ON event_request(processed_by);
CREATE INDEX idx_event_request_requester_id ON event_request(requester_id);
CREATE INDEX idx_notification_user_id ON notification(user_id);
CREATE INDEX idx_report_processed_by ON report(processed_by);
CREATE INDEX idx_report_ticket_id ON report(ticket_id);
CREATE INDEX idx_report_user_id ON report(user_id);
CREATE INDEX idx_seat_area_id ON seat(area_id);
CREATE INDEX idx_seat_category_ticket_id ON seat(category_ticket_id);
CREATE INDEX idx_ticket_bill_id ON ticket(bill_id);
CREATE INDEX idx_ticket_category_ticket_id ON ticket(category_ticket_id);
CREATE INDEX idx_ticket_event_id ON ticket(event_id);
CREATE INDEX idx_ticket_seat_id ON ticket(seat_id);
CREATE INDEX idx_ticket_user_id ON ticket(user_id);
CREATE INDEX idx_venue_area_venue_id ON venue_area(venue_id);
CREATE INDEX idx_wallet_user_id ON wallet(user_id);
CREATE INDEX idx_wallet_status ON wallet(status);
CREATE INDEX idx_wallet_tx_wallet_id ON wallet_transaction(wallet_id);
CREATE INDEX idx_wallet_tx_user_id ON wallet_transaction(user_id);
CREATE INDEX idx_wallet_tx_type ON wallet_transaction(type);
CREATE INDEX idx_wallet_tx_created ON wallet_transaction(created_at);

-- ============================================================
-- INSERT DATA
-- ============================================================

-- Insert Users
INSERT INTO users (user_id, full_name, email, phone, password_hash, role, status, created_at, wallet) VALUES
(1, 'Nguyễn Văn An', 'an.nvse14001@fpt.edu.vn', '0901000100', '$2a$12$FzWlsG8ipFhBBtMeXl5XUOCZ6NlwL9I4h1bwXPrSk1QxLFBGSl9te', 'STUDENT', 'ACTIVE', '2025-12-01 09:16:32.789573+07:00', 0.00),
(2, 'Trần Thị Bình', 'binh.ttse14002@fpt.edu.vn', '0902000200', '$2a$12$2oCoGj2Taesg4vWmsid1WOzCx8Y5Zl6OUaiXVbOE77ZEOI4vwJaC2', 'STUDENT', 'ACTIVE', '2025-12-01 09:16:32.789573+07:00', 0.00),
(3, 'Lê Quang Huy', 'huy.lqclub@fpt.edu.vn', '0903000300', '$2a$12$UfieEaEL0Ug/Dqgif1ie3eLEuPwUVbhCFkRfb/ZVS3Zy6v9ysHhBC', 'ORGANIZER', 'ACTIVE', '2025-12-01 09:16:32.789573+07:00', 0.00),
(4, 'Phạm Minh Thu', 'thu.pmso@fpt.edu.vn', '0904000400', '$2a$12$48FNaLBJTKv2o6kVqOiPP.8LeRYXdQO24XgEyQNMizfuDX7Zdvl4S', 'STAFF', 'ACTIVE', '2025-12-01 09:16:32.789573+07:00', 0.00),
(5, 'Quản trị hệ thống', 'admin.event@fpt.edu.vn', '0905000500', '$2a$12$BCzdHEEw7XeOUB076GKA3eIl4vsSTjPCPUoMA0Yx2S3yTGl3MkJWu', 'ADMIN', 'ACTIVE', '2025-12-01 09:16:32.789573+07:00', 0.00),
(7, 'Nguyen Vo Minh Chau', 'nguyenvominhchau165@gmail.com', '0901000123', '99e5fee36796021ffed4198e0ba9a98c1e5dd44fbb597bf1a9a1b93141e31697', 'STUDENT', 'ACTIVE', '2025-12-01 12:26:17.798470+07:00', 200000.00),
(11, 'Anh Khoi', 'ahkhoinguyen169@gmail.com', '0331234567', '$2a$12$gDVGpOTsjqHspLOEjTxLFuEr3QjOhiW5Sod73kB0or0i57F8uJ9ly', 'STUDENT', 'ACTIVE', '2026-01-28 15:29:20.974209+07:00', 50000.00),
(18, 'Twi Trần', 'therealtwillight@gmail.com', '0987456321', '$2a$12$EbJKiKQ170balgaXV0inOeWuNWQXQFVGaxWinOnkwqtrPSOukPv52', 'ORGANIZER', 'ACTIVE', '2026-01-30 23:10:38.294863+07:00', 0.00);

-- Insert Venue
INSERT INTO venue (venue_id, venue_name, location, status) VALUES
(1, 'Nhà văn hóa sinh viên Đại học Quốc gia Tp HCM', 'Số 1 Lưu Hữu Phước, Đông Hoà, Dĩ An, Thành phố Hồ Chí Minh, Việt Nam', 'AVAILABLE'),
(2, 'FPT University HCM Campus', '7 Đ. D1, Long Thạnh Mỹ, Thủ Đức, Thành phố Hồ Chí Minh 700000, Việt Nam', 'AVAILABLE'),
(3, 'FPT University (Da Nang Campus)', 'Khu đô thị FPT City, Ngũ Hành Sơn, Đà Nẵng 550000, Việt Nam', 'DELETED');

-- Insert Venue Area
INSERT INTO venue_area (area_id, venue_id, area_name, floor, capacity, status) VALUES
(1, 1, 'Lầu 2, Hội trường nhà văn hóa sinh viên', '2', 200, 'AVAILABLE'),
(6, 2, 'Sảnh lầu 4, P.408', '4', 50, 'AVAILABLE'),
(7, 2, 'Sảnh lầu 3, P.306', '3', 100, 'AVAILABLE'),
(8, 1, 'Hội Trường Lớn', '2', 100, 'AVAILABLE'),
(9, 2, 'Phòng Sự Kiện', '1', 40, 'AVAILABLE'),
(10, 1, 'Lầu 3 Hội trường nhà văn hóa sinh viên', '3', 300, 'AVAILABLE'),
(11, 1, 'Lầu 4, Hội trường nhà văn hóa sinh viên', '4', 400, 'AVAILABLE'),
(12, 1, 'Lầu 5, Hội trường nhà văn hóa sinh viên', '5', 500, 'AVAILABLE');

-- Insert Wallet (after users)
INSERT INTO wallet (wallet_id, user_id, balance, currency, status, created_at, updated_at) VALUES
(1, 1, 0.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00'),
(2, 2, 0.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00'),
(3, 3, 0.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00'),
(4, 4, 0.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00'),
(5, 5, 0.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00'),
(6, 7, 200000.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00'),
(9, 11, 450000.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-03-06 08:47:29+07:00'),
(10, 18, 0.00, 'VND', 'ACTIVE', '2026-02-28 17:20:11+07:00', '2026-02-28 17:20:11+07:00');

-- ============================================================
-- MIGRATION NOTES FOR SUPABASE
-- ============================================================
-- 1. All timestamps now use TIMESTAMP(6) WITH TIME ZONE
-- 2. ENUM types are created as PostgreSQL native types
-- 3. SERIAL is used for auto-incrementing primary keys
-- 4. UNIQUE constraints properly configured:
--    - wallet(user_id) - ONE wallet per user
--    - seat(area_id, seat_code) - seat code unique per area
--    - category_ticket(event_id, name) - ticket name unique per event
--    - ticket(event_id, seat_id) - one ticket per seat per event
--    - users(email) - email must be unique
-- 5. Check constraints enforce business rules:
--    - category_ticket price >= 0 AND <= 100,000,000 VND
--    - venue_area capacity > 0
--    - event end_time > start_time
-- 6. Foreign keys use CASCADE for appropriate deletions
-- 7. No need for manual character set configuration (UTF-8 default)
-- ============================================================
