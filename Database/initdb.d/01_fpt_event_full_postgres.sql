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
CREATE TYPE event_status_enum AS ENUM ('OPEN','CLOSED','CANCELLED','UPDATING','FINISHED');
CREATE TYPE event_request_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','UPDATING','CANCELLED','EXPIRED','FINISHED');
CREATE TYPE seat_type_enum AS ENUM ('STANDARD','VIP');
CREATE TYPE seat_layout_status_enum AS ENUM ('AVAILABLE','HOLD','BOOKED','INAVAILABLE');
CREATE TYPE report_status_enum AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED');
CREATE TYPE seat_status_enum AS ENUM ('ACTIVE','INACTIVE');
CREATE TYPE ticket_status_enum AS ENUM ('PENDING','BOOKED','CHECKED_IN','CHECKED_OUT','EXPIRED','REFUNDED');
CREATE TYPE user_role_enum AS ENUM ('ADMIN','STAFF','ORGANIZER','STUDENT');
CREATE TYPE user_status_enum AS ENUM ('ACTIVE','INACTIVE','BLOCKED');
CREATE TYPE venue_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED');
CREATE TYPE venue_area_status_enum AS ENUM ('AVAILABLE','UNAVAILABLE','DELETED');
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

-- ============================================================
-- SEED DATA PORTED FROM MYSQL
-- ============================================================

-- Insert Bill
INSERT INTO bill (bill_id, user_id, total_amount, currency, payment_method, payment_status, created_at, paid_at) VALUES
(34,7,100000.00,'VND','VNPAY','PAID','2025-12-11 09:02:10.976000',NULL),(38,7,20000.00,'VND','VNPAY','PAID','2025-12-11 09:27:07.739000',NULL),(39,1,10000.00,'VND','VNPAY','PAID','2025-12-11 10:08:16.918000',NULL),(40,7,20000.00,'VND','VNPAY','PAID','2025-12-11 12:41:44.271000',NULL),(41,7,10000.00,'VND','VNPAY','PAID','2025-12-11 12:50:43.930000',NULL),(42,7,30000.00,'VND','VNPAY','PAID','2025-12-11 23:07:46.716000',NULL),(43,7,30000.00,'VND','VNPAY','PAID','2025-12-12 08:25:45.317000',NULL),(44,7,20000.00,'VND','VNPAY','PAID','2025-12-12 10:09:36.933000',NULL),(45,7,200000.00,'VND','VNPAY','PAID','2025-12-12 13:25:19.605000',NULL),(46,7,200000.00,'VND','VNPAY','PAID','2025-12-13 20:47:03.436000',NULL),(47,7,30000.00,'VND','VNPAY','PAID','2025-12-15 10:11:31.182000',NULL),(48,7,30000.00,'VND','VNPAY','PAID','2025-12-16 09:45:22.811000',NULL),(49,7,200000.00,'VND','VNPAY','PAID','2025-12-16 09:49:56.420000',NULL),(50,7,100000.00,'VND','VNPAY','PAID','2025-12-17 08:23:11.427000',NULL),(51,7,20000.00,'VND','VNPAY','PAID','2025-12-18 21:34:26.345000',NULL),(52,7,35000.00,'VND','VNPAY','PAID','2025-12-20 19:13:33.865000',NULL),(53,7,50000.00,'VND','VNPAY','PAID','2025-12-20 19:24:22.924000',NULL),(54,7,55000.00,'VND','VNPAY','PAID','2025-12-20 20:12:59.209000',NULL),(55,7,190000.00,'VND','VNPAY','PAID','2025-12-21 21:07:10.872000',NULL),(56,7,110000.00,'VND','VNPAY','PAID','2026-01-01 13:19:29.917000',NULL),(61,10,140000.00,'VND','VNPAY','PAID','2025-12-22 00:06:10.585000',NULL),(62,10,340000.00,'VND','VNPAY','PAID','2025-12-22 00:07:26.140000',NULL),(63,7,340000.00,'VND','VNPAY','PAID','2025-12-22 07:07:55.200000',NULL),(64,7,140000.00,'VND','VNPAY','PAID','2025-12-22 07:13:07.698000',NULL),(65,7,140000.00,'VND','VNPAY','PAID','2025-12-22 07:18:41.574000',NULL),(66,7,200000.00,'VND','VNPAY','PAID','2025-12-22 08:35:46.616000',NULL),(67,7,6000000.00,'VND','VNPAY','PAID','2025-12-22 09:37:35.037000',NULL),(68,7,6000000.00,'VND','VNPAY','PAID','2025-12-22 09:38:38.734000',NULL),(74,11,250000.00,'VND','VNPAY','PAID','2026-01-31 16:46:28.000000',NULL),(77,1,50000000.00,'VND','VNPAY','PAID','2026-02-01 01:21:52.000000',NULL),(79,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 11:21:34.000000',NULL),(80,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 11:41:18.000000',NULL),(81,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 13:10:09.000000',NULL),(82,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 14:20:20.000000',NULL),(83,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:07:22.000000',NULL),(84,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:34:40.000000',NULL),(85,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:50:28.000000',NULL),(86,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:58:58.000000',NULL),(87,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:05:11.000000',NULL),(88,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:21:24.000000',NULL),(89,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:32:29.000000',NULL),(90,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:38:55.000000',NULL),(91,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:50:29.000000',NULL),(92,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:52:13.000000',NULL),(93,22,25000000.00,'VND','VNPAY','PAID','2026-02-04 21:51:58.000000',NULL),(94,22,25000000.00,'VND','VNPAY','PAID','2026-02-04 21:55:02.000000',NULL),(95,22,25000000.00,'VND','VNPAY','PAID','2026-02-04 22:28:45.000000',NULL),(96,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 08:53:04.000000',NULL),(97,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:00:30.000000',NULL),(98,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:05:01.000000',NULL),(99,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:09:27.000000',NULL),(100,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:18:29.000000',NULL),(101,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:31:40.000000',NULL),(102,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:42:06.000000',NULL),(103,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:46:29.000000',NULL),(104,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:53:43.000000',NULL),(105,22,15000000.00,'VND','VNPAY','PAID','2026-02-05 09:55:06.000000',NULL),(106,22,60000000.00,'VND','VNPAY','PAID','2026-02-05 10:12:40.000000',NULL),(107,22,50000000.00,'VND','VNPAY','PAID','2026-02-05 10:17:34.000000',NULL),(108,22,75000000.00,'VND','VNPAY','PAID','2026-02-05 10:23:54.000000',NULL),(109,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 10:25:00.000000',NULL),(110,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 10:42:47.000000',NULL),(111,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 11:38:36.000000',NULL),(112,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 11:53:01.000000',NULL),(113,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 13:16:24.000000',NULL),(114,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 13:47:19.000000',NULL),(115,11,25000000.00,'VND','VNPAY','PAID','2026-02-05 14:14:56.000000',NULL),(116,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 16:08:21.000000',NULL),(117,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 16:46:18.000000',NULL),(118,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 16:52:58.000000',NULL),(119,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 10:52:30.000000',NULL),(120,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 10:58:23.000000',NULL),(121,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 11:11:27.000000',NULL),(122,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 12:50:52.000000',NULL),(123,11,15000000.00,'VND','VNPAY','PAID','2026-02-12 17:10:45.000000',NULL),(124,11,15000000.00,'VND','VNPAY','PAID','2026-02-12 17:22:29.000000',NULL),(125,11,150000.00,'VND','VNPAY','PAID','2026-02-12 17:47:14.000000',NULL),(126,11,800000.00,'VND','VNPAY','PAID','2026-02-25 17:26:13.000000',NULL),(127,11,50000.00,'VND','Wallet','PAID','2026-02-26 11:16:45.000000','2026-02-26 11:16:45'),(128,11,50000.00,'VND','VNPAY','PAID','2026-02-26 11:18:44.000000','2026-02-26 11:18:44'),(129,11,50000.00,'VND','Wallet','PAID','2026-02-26 12:11:55.000000','2026-02-26 12:11:55'),(130,11,0.00,'VND','FREE','PAID','2026-03-04 10:08:52.000000','2026-03-04 10:08:52'),(131,11,400000.00,'VND','VNPAY','PAID','2026-03-04 10:16:03.000000','2026-03-04 10:16:03'),(132,11,0.00,'VND','FREE','PAID','2026-03-04 10:33:10.000000','2026-03-04 10:33:10'),(133,11,350000.00,'VND','Wallet','PAID','2026-03-04 14:10:17.000000','2026-03-04 14:10:17'),(134,11,350000.00,'VND','VNPAY','PAID','2026-03-04 14:19:20.000000','2026-03-04 14:19:20'),(135,11,150000.00,'VND','VNPAY','PAID','2026-03-04 14:21:20.000000','2026-03-04 14:21:20'),(136,11,350000.00,'VND','VNPAY','PAID','2026-03-04 14:48:45.000000','2026-03-04 14:48:45'),(137,11,350000.00,'VND','VNPAY','PAID','2026-03-04 15:03:12.000000','2026-03-04 15:03:12'),(138,11,350000.00,'VND','VNPAY','PAID','2026-03-04 15:14:35.000000','2026-03-04 15:14:35'),(139,11,0.00,'VND','Wallet','PAID','2026-03-04 16:30:30.000000','2026-03-04 16:30:30'),(140,11,0.00,'VND','Wallet','PAID','2026-03-05 23:51:51.000000','2026-03-05 23:51:51'),(141,11,0.00,'VND','FREE','PAID','2026-03-06 00:21:16.000000','2026-03-06 00:21:16'),(142,11,0.00,'VND','FREE','PAID','2026-03-06 00:43:54.000000','2026-03-06 00:43:54'),(143,11,0.00,'VND','FREE','PAID','2026-03-06 00:44:52.000000','2026-03-06 00:44:52');

-- Insert Category Ticket
INSERT INTO category_ticket (category_ticket_id, event_id, name, description, price, max_quantity, status) VALUES
(13,7,'VIP','VIP',100000.00,5,'ACTIVE'),(14,7,'STANDARD','Standard ',50000.00,45,'ACTIVE'),(15,8,'VIP','VIP',20000.00,30,'ACTIVE'),(16,8,'STANDARD','Standard ',10000.00,20,'ACTIVE'),(21,17,'VIP','Vé VIP bao gồm quyền ngồi hàng ghế đầu, tài liệu chuyên sâu nâng cao về xây dựng chatbot AI, voucher giảm 30% khóa học AI nâng cao, giấy chứng nhận VIP và cơ hội networking riêng với diễn giả sau sự kiện.',200000.00,30,'INACTIVE'),(22,17,'STANDARD','Tham dự workshop, nhận tài liệu cơ bản, tham gia thực hành xây dựng chatbot và nhận chứng nhận tham dự.',120000.00,30,'INACTIVE'),(23,16,'VIP','Bao gồm chỗ ngồi ưu tiên, tài liệu nâng cao về Python + AI (file PDF), 1 giờ mentoring online sau workshop, giấy chứng nhận VIP, và bộ notebook code mẫu độc quyền.',95000.00,10,'ACTIVE'),(24,16,'STANDARD','Tham dự workshop, nhận tài liệu cơ bản, tham gia thực hành viết Python và mô hình ML đơn giản, nhận chứng nhận tham dự.',50000.00,30,'ACTIVE'),(25,15,'VIP','Bao gồm quyền tham gia khu vực networking riêng với chuyên gia HR & Tech Recruiter, gói phân tích CV chi tiết, mock interview 1:1 miễn phí sau sự kiện, tài liệu hướng nghiệp nâng cao.',125000.00,10,'INACTIVE'),(26,15,'STANDARD','Tham dự hội thảo, được nghe chia sẻ từ các chuyên gia tuyển dụng, tham gia các phiên hỏi đáp, nhận bộ tài liệu "IT Career Handbook 2026".',100000.00,40,'INACTIVE'),(27,14,'VIP','Bao gồm chỗ ngồi ưu tiên, tài liệu Masterbook chuyên sâu, video khóa học "Art of Presentation", 1 buổi coaching cá nhân 30 phút sau workshop, chứng nhận VIP.',30000.00,20,'INACTIVE'),(1021,1014,'VIP','Ngồi hàng đầu dễ dàng xem tranh, giao lưu với host',35000.00,40,'ACTIVE'),(1022,1014,'STANDARD','Ngồi ở vị trí xa khó quan sát được tranh',20000.00,40,'ACTIVE'),(1061,1028,'VIP','Ghế ngồi hàng đầu\nTài liệu workshop đầy đủ (PDF + source code)\nĐược hỏi đáp trực tiếp với diễn giả\nChứng nhận tham gia (Certificate)',200000.00,20,'ACTIVE'),(1062,1028,'STANDARD','Tham gia toàn bộ workshop\nTài liệu học tập cơ bản\nHỏi đáp chung cuối chương trình',140000.00,40,'ACTIVE'),(1063,1029,'VIP','Vé VIP bao gồm quyền ngồi hàng ghế đầu, tài liệu chuyên sâu nâng cao về các công nghệ mới như machine learning, và cơ hội networking riêng với diễn giả sau sự kiện.\n',1500000.00,20,'ACTIVE'),(1064,1029,'STANDARD','\nTham dự workshop, nhận tài liệu cơ bản.',100000.00,30,'ACTIVE'),(1065,1032,'VIP','Giá vé VIP\n',250000.00,30,'ACTIVE'),(1066,1032,'STANDARD','Giá vé STANDARD',150000.00,70,'ACTIVE'),(1073,1039,'STANDARD','Giá vé STANDARD',50000.00,60,'ACTIVE'),(1074,1039,'VIP','Giá vé VIP',150000.00,30,'ACTIVE'),(1111,1047,'STANDARD','Giá vé STANDARD',50000.00,100,'ACTIVE'),(1112,1047,'VIP','Giá vé VIP',200000.00,50,'ACTIVE'),(1121,1049,'STANDARD','Giá vé STANDARD',0.00,200,'ACTIVE'),(1122,1048,'STANDARD','Giá vé STANDARD',100000.00,200,'ACTIVE'),(1123,1048,'VIP','Giá vé VIP',400000.00,50,'ACTIVE'),(1126,1050,'VIP','Giá vé VIP',350000.00,50,'ACTIVE'),(1127,1050,'STANDARD','Giá vé STANDARD',150000.00,200,'ACTIVE'),(1129,1051,'STANDARD','Giá vé STANDARD',0.00,50,'ACTIVE');

-- Insert Wallet Transaction
INSERT INTO wallet_transaction (transaction_id, wallet_id, user_id, type, amount, balance_before, balance_after, reference_type, reference_id, description, created_at) VALUES
(1,9,11,'CREDIT',0.00,50000.00,50000.00,'TICKET','297','Hoàn tiền 100% vé #297 - sự kiện bị hủy','2026-03-04 06:32:12'),(2,9,11,'CREDIT',0.00,50000.00,50000.00,'TICKET','299','Hoàn tiền 100% vé #299 - sự kiện bị hủy','2026-03-04 06:32:12'),(3,9,11,'CREDIT',400000.00,50000.00,450000.00,'TICKET','298','Hoàn tiền 100% vé #298 - sự kiện bị hủy','2026-03-04 06:36:12'),(4,9,11,'DEBIT',350000.00,450000.00,100000.00,'TICKET_PURCHASE','confirmed:2da64e76-9638-41c4-a09d-6d7f9320399d|tickets:tickets:300','RESERVE:2da64e76-9638-41c4-a09d-6d7f9320399d|expires:2026-03-04T14:15:17+07:00|Mua vé event 1050, 1 ghế | CONFIRMED at 2026-03-04 14:10:17','2026-03-04 07:10:17'),(5,9,11,'CREDIT',350000.00,100000.00,450000.00,'REFUND','report:6','Hoàn tiền report #6, ticket #300','2026-03-06 08:47:29');

-- Insert Notification
INSERT INTO notification (notification_id, user_id, message, is_read, created_at) VALUES
(1,18,'❓ Thông báo: Yêu cầu ''Career Move'' đã được rút lại thành công.',TRUE,'2026-02-09 19:34:01.000000'),
(2,18,'❓ Thông báo: Yêu cầu ''Career Move'' đã được rút lại thành công.',TRUE,'2026-02-10 15:13:31.000000'),
(3,18,'❓ Thông báo: Yêu cầu '''' đã được rút lại thành công.',TRUE,'2026-02-10 16:47:42.000000'),
(4,18,'❓ Thông báo: Yêu cầu '''' đã được hủy.',TRUE,'2026-02-10 17:37:40.000000');

-- Insert Event
INSERT INTO event (event_id, title, description, start_time, end_time, speaker_id, max_seats, status, created_by, created_at, area_id, banner_url, checkin_offset, checkout_offset) VALUES
(7,'Sự kiện mừng xuân - 2026','Mừng xuân đón tết','2026-01-01 10:00:00.000000','2026-01-01 17:00:00.000000',NULL,50,'CLOSED',4,'2025-12-08 00:55:02.095264',1,'https://img.freepik.com/premium-vector/talk-show-banner-template_791789-63.jpg?w=2000',60,30),(8,'Buổi dạy Thư Pháp Ngày Xuân 2026','Đánh bài tiến lên','2026-01-01 18:00:00.000000','2026-01-01 22:00:00.000000',NULL,50,'CLOSED',4,'2025-12-08 01:18:54.179751',1,'https://img.freepik.com/premium-vector/talk-show-banner-template_791789-63.jpg?w=2000',60,30);

-- ============================================================
-- SUPABASE ROW LEVEL SECURITY (RLS) & POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE speaker ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_area ENABLE ROW LEVEL SECURITY;
ALTER TABLE event ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_seat_layout ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE report ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transaction ENABLE ROW LEVEL SECURITY;

-- Create full-access policies for service_role and postgres
CREATE POLICY "Allow full access to service_role and postgres on users" ON users FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on speaker" ON speaker FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on venue" ON venue FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on venue_area" ON venue_area FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on event" ON event FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on category_ticket" ON category_ticket FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on seat" ON seat FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on event_seat_layout" ON event_seat_layout FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on ticket" ON ticket FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on event_request" ON event_request FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on notification" ON notification FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on report" ON report FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on bill" ON bill FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on wallet" ON wallet FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);
CREATE POLICY "Allow full access to service_role and postgres on wallet_transaction" ON wallet_transaction FOR ALL TO service_role, postgres USING (true) WITH CHECK (true);

-- Create public read-only policies for anon and authenticated
CREATE POLICY "Allow read-only public access on event" ON event FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read-only public access on venue" ON venue FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow read-only public access on category_ticket" ON category_ticket FOR SELECT TO anon, authenticated USING (true);

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
