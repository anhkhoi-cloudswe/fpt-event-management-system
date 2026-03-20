-- ============================================================
-- ENFORCE UTF-8MB4 ENCODING FOR VIETNAMESE CHARACTER SUPPORT
-- ============================================================
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET COLLATION_CONNECTION=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `bill`;
CREATE TABLE `bill` (
  `bill_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `total_amount` decimal(18,2) NOT NULL,
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT 'VND',
  `payment_method` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payment_status` enum('PENDING','PAID','FAILED','REFUNDED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `paid_at` datetime DEFAULT NULL,
  PRIMARY KEY (`bill_id`),
  KEY `FK_Bill_User` (`user_id`),
  CONSTRAINT `FK_Bill_User` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=144 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `category_ticket`;
CREATE TABLE `category_ticket` (
  `category_ticket_id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price` decimal(18,2) DEFAULT '0.00',
  `max_quantity` int DEFAULT NULL,
  `status` enum('AVAILABLE','UNAVAILABLE','DELETED','ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'AVAILABLE',
  PRIMARY KEY (`category_ticket_id`),
  UNIQUE KEY `UQ_CategoryTicket_Event_Name` (`event_id`,`name`),
  CONSTRAINT `FK_CategoryTicket_Event` FOREIGN KEY (`event_id`) REFERENCES `event` (`event_id`),
  CONSTRAINT `category_ticket_chk_1` CHECK ((`max_quantity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=1130 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `event`;
CREATE TABLE `event` (
  `event_id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `start_time` datetime(6) NOT NULL,
  `end_time` datetime(6) NOT NULL,
  `speaker_id` int DEFAULT NULL,
  `max_seats` int DEFAULT NULL,
  `status` enum('OPEN','CLOSED','CANCELLED','UPDATING') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UPDATING',
  `created_by` int DEFAULT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `area_id` int DEFAULT NULL,
  `banner_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `checkin_offset` int DEFAULT '60' COMMENT 'Số phút cho phép check-in trước khi bắt đầu',
  `checkout_offset` int DEFAULT '30' COMMENT 'Số phút cho phép check-out sau khi kết thúc',
  PRIMARY KEY (`event_id`),
  KEY `FK_Event_Area` (`area_id`),
  KEY `FK_Event_CreatedBy` (`created_by`),
  KEY `FK_Event_Speaker` (`speaker_id`),
  CONSTRAINT `FK_Event_Area` FOREIGN KEY (`area_id`) REFERENCES `venue_area` (`area_id`),
  CONSTRAINT `FK_Event_CreatedBy` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `FK_Event_Speaker` FOREIGN KEY (`speaker_id`) REFERENCES `speaker` (`speaker_id`),
  CONSTRAINT `CK_Event_Time` CHECK ((`end_time` > `start_time`)),
  CONSTRAINT `event_chk_1` CHECK ((`max_seats` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=1052 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `event_request`;
CREATE TABLE `event_request` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `requester_id` int NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `preferred_start_time` datetime(6) DEFAULT NULL,
  `preferred_end_time` datetime(6) DEFAULT NULL,
  `expected_capacity` int DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','UPDATING','CANCELLED','EXPIRED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `processed_by` int DEFAULT NULL,
  `processed_at` datetime(6) DEFAULT NULL,
  `organizer_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_event_id` int DEFAULT NULL,
  `reject_reason` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`request_id`),
  KEY `FK_EventRequest_Event` (`created_event_id`),
  KEY `FK_EventRequest_ProcessedBy` (`processed_by`),
  KEY `FK_EventRequest_Requester` (`requester_id`),
  CONSTRAINT `FK_EventRequest_Event` FOREIGN KEY (`created_event_id`) REFERENCES `event` (`event_id`),
  CONSTRAINT `FK_EventRequest_ProcessedBy` FOREIGN KEY (`processed_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `FK_EventRequest_Requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1062 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `event_seat_layout`;
CREATE TABLE `event_seat_layout` (
  `event_id` int NOT NULL,
  `seat_id` int NOT NULL,
  `seat_type` enum('STANDARD','VIP') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('AVAILABLE','HOLD','BOOKED','INAVAILABLE') COLLATE utf8mb4_unicode_ci DEFAULT 'AVAILABLE',
  PRIMARY KEY (`event_id`,`seat_id`),
  KEY `FK_EventSeatLayout_Seat` (`seat_id`),
  CONSTRAINT `FK_EventSeatLayout_Event` FOREIGN KEY (`event_id`) REFERENCES `event` (`event_id`),
  CONSTRAINT `FK_EventSeatLayout_Seat` FOREIGN KEY (`seat_id`) REFERENCES `seat` (`seat_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `notification`;
CREATE TABLE `notification` (
  `notification_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_read` tinyint(1) DEFAULT '0' COMMENT '0: Chưa đọc, 1: Đã đọc',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`notification_id`),
  KEY `FK_Notification_User` (`user_id`),
  CONSTRAINT `FK_Notification_User` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `report`;
CREATE TABLE `report` (
  `report_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `ticket_id` int NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` varchar(2000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `status` enum('PENDING','APPROVED','REJECTED','CANCELLED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `processed_by` int DEFAULT NULL,
  `processed_at` datetime(6) DEFAULT NULL,
  `refund_amount` decimal(18,2) DEFAULT NULL,
  `staff_note` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`report_id`),
  KEY `FK_Report_ProcessedBy` (`processed_by`),
  KEY `FK_Report_Ticket` (`ticket_id`),
  KEY `FK_Report_User` (`user_id`),
  CONSTRAINT `FK_Report_ProcessedBy` FOREIGN KEY (`processed_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `FK_Report_Ticket` FOREIGN KEY (`ticket_id`) REFERENCES `ticket` (`ticket_id`),
  CONSTRAINT `FK_Report_User` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `seat`;
CREATE TABLE `seat` (
  `seat_id` int NOT NULL AUTO_INCREMENT,
  `seat_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `row_no` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `col_no` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `area_id` int NOT NULL,
  `category_ticket_id` int DEFAULT NULL,
  PRIMARY KEY (`seat_id`),
  UNIQUE KEY `UQ_Seat_Area_SeatCode` (`area_id`,`seat_code`),
  KEY `fk_seat_category` (`category_ticket_id`),
  CONSTRAINT `FK_Seat_Area` FOREIGN KEY (`area_id`) REFERENCES `venue_area` (`area_id`),
  CONSTRAINT `fk_seat_category` FOREIGN KEY (`category_ticket_id`) REFERENCES `category_ticket` (`category_ticket_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1468 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `speaker`;
CREATE TABLE `speaker` (
  `speaker_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` longtext COLLATE utf8mb4_unicode_ci,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`speaker_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1063 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `ticket`;
CREATE TABLE `ticket` (
  `ticket_id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `user_id` int NOT NULL,
  `category_ticket_id` int NOT NULL,
  `bill_id` int DEFAULT NULL,
  `seat_id` int DEFAULT NULL,
  `qr_code_value` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_issued_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `status` enum('PENDING','BOOKED','CHECKED_IN','CHECKED_OUT','EXPIRED','REFUNDED') COLLATE utf8mb4_unicode_ci DEFAULT 'BOOKED',
  `checkin_time` datetime(6) DEFAULT NULL,
  `check_out_time` datetime(6) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ticket_id`),
  UNIQUE KEY `UQ_Ticket_Event_Seat` (`event_id`,`seat_id`),
  KEY `FK_Ticket_Bill` (`bill_id`),
  KEY `FK_Ticket_CategoryTicket` (`category_ticket_id`),
  KEY `FK_Ticket_Seat` (`seat_id`),
  KEY `FK_Ticket_User` (`user_id`),
  CONSTRAINT `FK_Ticket_Bill` FOREIGN KEY (`bill_id`) REFERENCES `bill` (`bill_id`),
  CONSTRAINT `FK_Ticket_CategoryTicket` FOREIGN KEY (`category_ticket_id`) REFERENCES `category_ticket` (`category_ticket_id`),
  CONSTRAINT `FK_Ticket_Event` FOREIGN KEY (`event_id`) REFERENCES `event` (`event_id`),
  CONSTRAINT `FK_Ticket_Seat` FOREIGN KEY (`seat_id`) REFERENCES `seat` (`seat_id`),
  CONSTRAINT `FK_Ticket_User` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=311 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('ADMIN','STAFF','ORGANIZER','STUDENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE','BLOCKED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `created_at` datetime(6) DEFAULT CURRENT_TIMESTAMP(6),
  `Wallet` decimal(18,2) DEFAULT '0.00',
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `venue`;
CREATE TABLE `venue` (
  `venue_id` int NOT NULL AUTO_INCREMENT,
  `venue_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('AVAILABLE','UNAVAILABLE','DELETED') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'AVAILABLE',
  PRIMARY KEY (`venue_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `venue_area`;
CREATE TABLE `venue_area` (
  `area_id` int NOT NULL AUTO_INCREMENT,
  `venue_id` int NOT NULL,
  `area_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floor` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int NOT NULL,
  `status` enum('AVAILABLE','UNAVAILABLE') COLLATE utf8mb4_unicode_ci DEFAULT 'AVAILABLE',
  PRIMARY KEY (`area_id`),
  UNIQUE KEY `UQ_VenueArea_Venue_AreaName` (`venue_id`,`area_name`),
  CONSTRAINT `FK_VenueArea_Venue` FOREIGN KEY (`venue_id`) REFERENCES `venue` (`venue_id`) ON DELETE CASCADE,
  CONSTRAINT `venue_area_chk_1` CHECK ((`capacity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `wallet`;
CREATE TABLE `wallet` (
  `wallet_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `balance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `currency` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'VND',
  `status` enum('ACTIVE','FROZEN','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`wallet_id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_wallet_user_id` (`user_id`),
  KEY `idx_wallet_status` (`status`),
  CONSTRAINT `fk_wallet_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `wallet_transaction`;
CREATE TABLE `wallet_transaction` (
  `transaction_id` int NOT NULL AUTO_INCREMENT,
  `wallet_id` int NOT NULL,
  `user_id` int NOT NULL,
  `type` enum('CREDIT','DEBIT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) NOT NULL,
  `balance_before` decimal(15,2) NOT NULL,
  `balance_after` decimal(15,2) NOT NULL,
  `reference_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reference_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`transaction_id`),
  KEY `idx_wallet_tx_wallet_id` (`wallet_id`),
  KEY `idx_wallet_tx_user_id` (`user_id`),
  KEY `idx_wallet_tx_type` (`type`),
  KEY `idx_wallet_tx_created` (`created_at`),
  CONSTRAINT `fk_wallet_tx_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_wallet_tx_wallet` FOREIGN KEY (`wallet_id`) REFERENCES `wallet` (`wallet_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== INSERT DATA SECTION ==========
-- Chèn dữ liệu vào bảng users
INSERT INTO `users` VALUES (1,'Nguyễn Văn An','an.nvse14001@fpt.edu.vn','0901000100','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','STUDENT','ACTIVE','2025-12-01 09:16:32.789573',0.00),(2,'Trần Thị Bình','binh.ttse14002@fpt.edu.vn','0902000200','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','STUDENT','ACTIVE','2025-12-01 09:16:32.789573',0.00),(3,'Lê Quang Huy','huy.lqclub@fpt.edu.vn','0903000300','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','ORGANIZER','ACTIVE','2025-12-01 09:16:32.789573',0.00),(4,'Phạm Minh Thu','thu.pmso@fpt.edu.vn','0904000400','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','STAFF','ACTIVE','2025-12-01 09:16:32.789573',0.00),(5,'Quản trị hệ thống','admin.event@fpt.edu.vn','0905000500','8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92','ADMIN','ACTIVE','2025-12-01 09:16:32.789573',0.00),(7,'Nguyen Vo Minh Chau','nguyenvominhchau165@gmail.com','0901000123','99e5fee36796021ffed4198e0ba9a98c1e5dd44fbb597bf1a9a1b93141e31697','STUDENT','ACTIVE','2025-12-01 12:26:17.798470',200000.00),(9,'Nguyễn Võ Minh Châu','jaelynfox@muagicungre.com','0373253725','db45e60dbcd828b39ca720d7f2202a63399b4563d05030bc4295380eb5966385','STUDENT','ACTIVE','2025-12-21 20:51:56.791286',0.00),(10,'Nguyễn Võ Kim Ngân','nguyenvkngan261001@gmail.com','0923828824','99e5fee36796021ffed4198e0ba9a98c1e5dd44fbb597bf1a9a1b93141e31697','STUDENT','ACTIVE','2025-12-22 00:05:02.154083',0.00),(11,'Anh Khoi','ahkhoinguyen169@gmail.com','0331234567','b2c56341cc2b9f8bf898bd7528dd39e641b51c4fbd51f241b46ad70872dd1b99','STUDENT','ACTIVE','2026-01-28 15:29:20.974209',50000.00),(18,'Twi Trần','therealtwillight@gmail.com','0987456321','b2c56341cc2b9f8bf898bd7528dd39e641b51c4fbd51f241b46ad70872dd1b99','ORGANIZER','ACTIVE','2026-01-30 23:10:38.294863',0.00),(22,'Leon Satoru','nguyenanhkhoi169@gmail.com','0331234567','b2c56341cc2b9f8bf898bd7528dd39e641b51c4fbd51f241b46ad70872dd1b99','STUDENT','ACTIVE','2026-01-30 23:58:41.514641',0.00);

-- Chèn dữ liệu vào bảng bill
INSERT INTO `bill` VALUES (34,7,100000.00,'VND','VNPAY','PAID','2025-12-11 09:02:10.976000',NULL),(38,7,20000.00,'VND','VNPAY','PAID','2025-12-11 09:27:07.739000',NULL),(39,1,10000.00,'VND','VNPAY','PAID','2025-12-11 10:08:16.918000',NULL),(40,7,20000.00,'VND','VNPAY','PAID','2025-12-11 12:41:44.271000',NULL),(41,7,10000.00,'VND','VNPAY','PAID','2025-12-11 12:50:43.930000',NULL),(42,7,30000.00,'VND','VNPAY','PAID','2025-12-11 23:07:46.716000',NULL),(43,7,30000.00,'VND','VNPAY','PAID','2025-12-12 08:25:45.317000',NULL),(44,7,20000.00,'VND','VNPAY','PAID','2025-12-12 10:09:36.933000',NULL),(45,7,200000.00,'VND','VNPAY','PAID','2025-12-12 13:25:19.605000',NULL),(46,7,200000.00,'VND','VNPAY','PAID','2025-12-13 20:47:03.436000',NULL),(47,7,30000.00,'VND','VNPAY','PAID','2025-12-15 10:11:31.182000',NULL),(48,7,30000.00,'VND','VNPAY','PAID','2025-12-16 09:45:22.811000',NULL),(49,7,200000.00,'VND','VNPAY','PAID','2025-12-16 09:49:56.420000',NULL),(50,7,100000.00,'VND','VNPAY','PAID','2025-12-17 08:23:11.427000',NULL),(51,7,20000.00,'VND','VNPAY','PAID','2025-12-18 21:34:26.345000',NULL),(52,7,35000.00,'VND','VNPAY','PAID','2025-12-20 19:13:33.865000',NULL),(53,7,50000.00,'VND','VNPAY','PAID','2025-12-20 19:24:22.924000',NULL),(54,7,55000.00,'VND','VNPAY','PAID','2025-12-20 20:12:59.209000',NULL),(55,7,190000.00,'VND','VNPAY','PAID','2025-12-21 21:07:10.872000',NULL),(56,7,110000.00,'VND','VNPAY','PAID','2026-01-01 13:19:29.917000',NULL),(61,10,140000.00,'VND','VNPAY','PAID','2025-12-22 00:06:10.585000',NULL),(62,10,340000.00,'VND','VNPAY','PAID','2025-12-22 00:07:26.140000',NULL),(63,7,340000.00,'VND','VNPAY','PAID','2025-12-22 07:07:55.200000',NULL),(64,7,140000.00,'VND','VNPAY','PAID','2025-12-22 07:13:07.698000',NULL),(65,7,140000.00,'VND','VNPAY','PAID','2025-12-22 07:18:41.574000',NULL),(66,7,200000.00,'VND','VNPAY','PAID','2025-12-22 08:35:46.616000',NULL),(67,7,6000000.00,'VND','VNPAY','PAID','2025-12-22 09:37:35.037000',NULL),(68,7,6000000.00,'VND','VNPAY','PAID','2025-12-22 09:38:38.734000',NULL),(74,11,250000.00,'VND','VNPAY','PAID','2026-01-31 16:46:28.000000',NULL),(77,1,50000000.00,'VND','VNPAY','PAID','2026-02-01 01:21:52.000000',NULL),(79,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 11:21:34.000000',NULL),(80,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 11:41:18.000000',NULL),(81,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 13:10:09.000000',NULL),(82,11,25000000.00,'VND','VNPAY','PAID','2026-02-04 14:20:20.000000',NULL),(83,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:07:22.000000',NULL),(84,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:34:40.000000',NULL),(85,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:50:28.000000',NULL),(86,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 15:58:58.000000',NULL),(87,11,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:05:11.000000',NULL),(88,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:21:24.000000',NULL),(89,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:32:29.000000',NULL),(90,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:38:55.000000',NULL),(91,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:50:29.000000',NULL),(92,22,15000000.00,'VND','VNPAY','PAID','2026-02-04 16:52:13.000000',NULL),(93,22,25000000.00,'VND','VNPAY','PAID','2026-02-04 21:51:58.000000',NULL),(94,22,25000000.00,'VND','VNPAY','PAID','2026-02-04 21:55:02.000000',NULL),(95,22,25000000.00,'VND','VNPAY','PAID','2026-02-04 22:28:45.000000',NULL),(96,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 08:53:04.000000',NULL),(97,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:00:30.000000',NULL),(98,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:05:01.000000',NULL),(99,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:09:27.000000',NULL),(100,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:18:29.000000',NULL),(101,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:31:40.000000',NULL),(102,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:42:06.000000',NULL),(103,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:46:29.000000',NULL),(104,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 09:53:43.000000',NULL),(105,22,15000000.00,'VND','VNPAY','PAID','2026-02-05 09:55:06.000000',NULL),(106,22,60000000.00,'VND','VNPAY','PAID','2026-02-05 10:12:40.000000',NULL),(107,22,50000000.00,'VND','VNPAY','PAID','2026-02-05 10:17:34.000000',NULL),(108,22,75000000.00,'VND','VNPAY','PAID','2026-02-05 10:23:54.000000',NULL),(109,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 10:25:00.000000',NULL),(110,22,25000000.00,'VND','VNPAY','PAID','2026-02-05 10:42:47.000000',NULL),(111,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 11:38:36.000000',NULL),(112,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 11:53:01.000000',NULL),(113,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 13:16:24.000000',NULL),(114,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 13:47:19.000000',NULL),(115,11,25000000.00,'VND','VNPAY','PAID','2026-02-05 14:14:56.000000',NULL),(116,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 16:08:21.000000',NULL),(117,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 16:46:18.000000',NULL),(118,11,15000000.00,'VND','VNPAY','PAID','2026-02-05 16:52:58.000000',NULL),(119,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 10:52:30.000000',NULL),(120,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 10:58:23.000000',NULL),(121,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 11:11:27.000000',NULL),(122,11,15000000.00,'VND','VNPAY','PAID','2026-02-06 12:50:52.000000',NULL),(123,11,15000000.00,'VND','VNPAY','PAID','2026-02-12 17:10:45.000000',NULL),(124,11,15000000.00,'VND','VNPAY','PAID','2026-02-12 17:22:29.000000',NULL),(125,11,150000.00,'VND','VNPAY','PAID','2026-02-12 17:47:14.000000',NULL),(126,11,800000.00,'VND','VNPAY','PAID','2026-02-25 17:26:13.000000',NULL),(127,11,50000.00,'VND','Wallet','PAID','2026-02-26 11:16:45.000000','2026-02-26 11:16:45'),(128,11,50000.00,'VND','VNPAY','PAID','2026-02-26 11:18:44.000000','2026-02-26 11:18:44'),(129,11,50000.00,'VND','Wallet','PAID','2026-02-26 12:11:55.000000','2026-02-26 12:11:55'),(130,11,0.00,'VND','FREE','PAID','2026-03-04 10:08:52.000000','2026-03-04 10:08:52'),(131,11,400000.00,'VND','VNPAY','PAID','2026-03-04 10:16:03.000000','2026-03-04 10:16:03'),(132,11,0.00,'VND','FREE','PAID','2026-03-04 10:33:10.000000','2026-03-04 10:33:10'),(133,11,350000.00,'VND','Wallet','PAID','2026-03-04 14:10:17.000000','2026-03-04 14:10:17'),(134,11,350000.00,'VND','VNPAY','PAID','2026-03-04 14:19:20.000000','2026-03-04 14:19:20'),(135,11,150000.00,'VND','VNPAY','PAID','2026-03-04 14:21:20.000000','2026-03-04 14:21:20'),(136,11,350000.00,'VND','VNPAY','PAID','2026-03-04 14:48:45.000000','2026-03-04 14:48:45'),(137,11,350000.00,'VND','VNPAY','PAID','2026-03-04 15:03:12.000000','2026-03-04 15:03:12'),(138,11,350000.00,'VND','VNPAY','PAID','2026-03-04 15:14:35.000000','2026-03-04 15:14:35'),(139,11,0.00,'VND','Wallet','PAID','2026-03-04 16:30:30.000000','2026-03-04 16:30:30'),(140,11,0.00,'VND','Wallet','PAID','2026-03-05 23:51:51.000000','2026-03-05 23:51:51'),(141,11,0.00,'VND','FREE','PAID','2026-03-06 00:21:16.000000','2026-03-06 00:21:16'),(142,11,0.00,'VND','FREE','PAID','2026-03-06 00:43:54.000000','2026-03-06 00:43:54'),(143,11,0.00,'VND','FREE','PAID','2026-03-06 00:44:52.000000','2026-03-06 00:44:52');

-- Chèn dữ liệu vào bảng category_ticket
INSERT INTO `category_ticket` VALUES (13,7,'VIP','VIP',100000.00,5,'ACTIVE'),(14,7,'STANDARD','Standard ',50000.00,45,'ACTIVE'),(15,8,'VIP','VIP',20000.00,30,'ACTIVE'),(16,8,'STANDARD','Standard ',10000.00,20,'ACTIVE'),(21,17,'VIP','Vé VIP bao gồm quyền ngồi hàng ghế đầu, tài liệu chuyên sâu nâng cao về xây dựng chatbot AI, voucher giảm 30% khóa học AI nâng cao, giấy chứng nhận VIP và cơ hội networking riêng với diễn giả sau sự kiện.',200000.00,30,'INACTIVE'),(22,17,'STANDARD','Tham dự workshop, nhận tài liệu cơ bản, tham gia thực hành xây dựng chatbot và nhận chứng nhận tham dự.',120000.00,30,'INACTIVE'),(23,16,'VIP','Bao gồm chỗ ngồi ưu tiên, tài liệu nâng cao về Python + AI (file PDF), 1 giờ mentoring online sau workshop, giấy chứng nhận VIP, và bộ notebook code mẫu độc quyền.',95000.00,10,'ACTIVE'),(24,16,'STANDARD','Tham dự workshop, nhận tài liệu cơ bản, tham gia thực hành viết Python và mô hình ML đơn giản, nhận chứng nhận tham dự.',50000.00,30,'ACTIVE'),(25,15,'VIP','Bao gồm quyền tham gia khu vực networking riêng với chuyên gia HR & Tech Recruiter, gói phân tích CV chi tiết, mock interview 1:1 miễn phí sau sự kiện, tài liệu hướng nghiệp nâng cao.',125000.00,10,'INACTIVE'),(26,15,'STANDARD','Tham dự hội thảo, được nghe chia sẻ từ các chuyên gia tuyển dụng, tham gia các phiên hỏi đáp, nhận bộ tài liệu \"IT Career Handbook 2026\".',100000.00,40,'INACTIVE'),(27,14,'VIP','Bao gồm chỗ ngồi ưu tiên, tài liệu Masterbook chuyên sâu, video khóa học "Art of Presentation", 1 buổi coaching cá nhân 30 phút sau workshop, chứng nhận VIP.',30000.00,20,'INACTIVE'),(1021,1014,'VIP','Ngồi hàng đầu dễ dàng xem tranh, giao lưu với host',35000.00,40,'ACTIVE'),(1022,1014,'STANDARD','Ngồi ở vị trí xa khó quan sát được tranh',20000.00,40,'ACTIVE'),(1061,1028,'VIP','Ghế ngồi hàng đầu\nTài liệu workshop đầy đủ (PDF + source code)\nĐược hỏi đáp trực tiếp với diễn giả\nChứng nhận tham gia (Certificate)',200000.00,20,'ACTIVE'),(1062,1028,'STANDARD','Tham gia toàn bộ workshop\nTài liệu học tập cơ bản\nHỏi đáp chung cuối chương trình',140000.00,40,'ACTIVE'),(1063,1029,'VIP','Vé VIP bao gồm quyền ngồi hàng ghế đầu, tài liệu chuyên sâu nâng cao về các công nghệ mới như machine learning, và cơ hội networking riêng với diễn giả sau sự kiện.\n',1500000.00,20,'ACTIVE'),(1064,1029,'STANDARD','\nTham dự workshop, nhận tài liệu cơ bản.',100000.00,30,'ACTIVE'),(1065,1032,'VIP','Giá vé VIP\n',250000.00,30,'ACTIVE'),(1066,1032,'STANDARD','Giá vé STANDARD',150000.00,70,'ACTIVE'),(1073,1039,'STANDARD','Giá vé STANDARD',50000.00,60,'ACTIVE'),(1074,1039,'VIP','Giá vé VIP',150000.00,30,'ACTIVE'),(1111,1047,'STANDARD','Giá vé STANDARD',50000.00,100,'ACTIVE'),(1112,1047,'VIP','Giá vé VIP',200000.00,50,'ACTIVE'),(1121,1049,'STANDARD','Giá vé STANDARD',0.00,200,'ACTIVE'),(1122,1048,'STANDARD','Giá vé STANDARD',100000.00,200,'ACTIVE'),(1123,1048,'VIP','Giá vé VIP',400000.00,50,'ACTIVE'),(1126,1050,'VIP','Giá vé VIP',350000.00,50,'ACTIVE'),(1127,1050,'STANDARD','Giá vé STANDARD',150000.00,200,'ACTIVE'),(1129,1051,'STANDARD','Giá vé STANDARD',0.00,50,'ACTIVE');

-- Chèn dữ liệu vào bảng venue
INSERT INTO `venue` VALUES (1,'Nhà văn hóa sinh viên Đại học Quốc gia Tp HCM','Số 1 Lưu Hữu Phước, Đông Hoà, Dĩ An, Thành phố Hồ Chí Minh, Việt Nam','AVAILABLE'),(2,'FPT University HCM Campus','7 Đ. D1, Long Thạnh Mỹ, Thủ Đức, Thành phố Hồ Chí Minh 700000, Việt Nam','AVAILABLE'),(3,'FPT University (Da Nang Campus)','Khu đô thị FPT City, Ngũ Hành Sơn, Đà Nẵng 550000, Việt Nam','DELETED');

-- Chèn dữ liệu vào bảng venue_area
INSERT INTO `venue_area` VALUES (1,1,'Lầu 2, Hội trường nhà văn hóa sinh viên','2',200,'AVAILABLE'),(6,2,'Sảnh lầu 4, P.408','4',50,'AVAILABLE'),(7,2,'Sảnh lầu 3, P.306','3',100,'AVAILABLE'),(8,1,'Hội Trường Lớn','2',100,'AVAILABLE'),(9,2,'Phòng Sự Kiện','1',40,'AVAILABLE'),(10,1,'Lầu 3 Hội trường nhà văn hóa sinh viên','3',300,'AVAILABLE'),(11,1,'Lầu 4, Hội trường nhà văn hóa sinh viên','4',400,'AVAILABLE'),(12,1,'Lầu 5, Hội trường nhà văn hóa sinh viên','5',500,'AVAILABLE');

-- Chèn dữ liệu vào bảng wallet
INSERT INTO `wallet` VALUES (1,1,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(2,2,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(3,3,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(4,4,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(5,5,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(6,7,200000.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(7,9,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(8,10,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(9,11,450000.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-03-06 08:47:29'),(10,18,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11'),(11,22,0.00,'VND','ACTIVE','2026-02-28 17:20:11','2026-02-28 17:20:11');

-- Chèn dữ liệu vào bảng wallet_transaction
INSERT INTO `wallet_transaction` VALUES (1,9,11,'CREDIT',0.00,50000.00,50000.00,'TICKET','297','Hoàn tiền 100% vé #297 - sự kiện bị hủy','2026-03-04 06:32:12'),(2,9,11,'CREDIT',0.00,50000.00,50000.00,'TICKET','299','Hoàn tiền 100% vé #299 - sự kiện bị hủy','2026-03-04 06:32:12'),(3,9,11,'CREDIT',400000.00,50000.00,450000.00,'TICKET','298','Hoàn tiền 100% vé #298 - sự kiện bị hủy','2026-03-04 06:36:12'),(4,9,11,'DEBIT',350000.00,450000.00,100000.00,'TICKET_PURCHASE','confirmed:2da64e76-9638-41c4-a09d-6d7f9320399d|tickets:tickets:300','RESERVE:2da64e76-9638-41c4-a09d-6d7f9320399d|expires:2026-03-04T14:15:17+07:00|Mua vé event 1050, 1 ghế | CONFIRMED at 2026-03-04 14:10:17','2026-03-04 07:10:17'),(5,9,11,'CREDIT',350000.00,100000.00,450000.00,'REFUND','report:6','Hoàn tiền report #6, ticket #300','2026-03-06 08:47:29');

-- Chèn dữ liệu vào bảng notification
INSERT INTO `notification` VALUES (1,18,'❓ Thông báo: Yêu cầu \'Career Move\' đã được rút lại thành công.',1,'2026-02-09 19:34:01.000000'),(2,18,'❓ Thông báo: Yêu cầu \'Career Move\' đã được rút lại thành công.',1,'2026-02-10 15:13:31.000000'),(3,18,'❓ Thông báo: Yêu cầu \'\' đã được rút lại thành công.',1,'2026-02-10 16:47:42.000000'),(4,18,'❓ Thông báo: Yêu cầu \'\' đã được hủy.',1,'2026-02-10 17:37:40.000000');

-- Chèn dữ liệu vào bảng event (Events with all required fields)
INSERT INTO `event` VALUES (7,'Sự kiện mừng xuân - 2026','Mừng xuân đón tết','2026-01-01 10:00:00.000000','2026-01-01 17:00:00.000000',8,50,'CLOSED',4,'2025-12-08 00:55:02.095264',1,'https://img.freepik.com/premium-vector/talk-show-banner-template_791789-63.jpg?w=2000',60,30),(8,'Buổi dạy Thư Pháp Ngày Xuân 2026','Đánh bài tiến lên','2026-01-01 18:00:00.000000','2026-01-01 22:00:00.000000',9,50,'CLOSED',4,'2025-12-08 01:18:54.179751',1,'https://img.freepik.com/premium-vector/talk-show-banner-template_791789-63.jpg?w=2000',60,30);

-- ============================================================
-- Price Constraints for category_ticket
-- Purpose: Enforce business rules for ticket prices
-- - Price cannot be negative
-- - Price cannot exceed 100 million VNĐ (MAX_TICKET_PRICE)
-- ============================================================

-- ✅ Add check constraint to ensure price >= 0
-- This prevents negative prices which don't make business sense
ALTER TABLE `category_ticket`
ADD CONSTRAINT `CHK_CategoryTicket_Price_NonNegative`
CHECK (`price` >= 0);

-- ✅ Add check constraint to ensure price <= 100,000,000
-- This prevents organizers from setting unrealistic ticket prices
-- Maximum allowed: 100 million VNĐ
ALTER TABLE `category_ticket`
ADD CONSTRAINT `CHK_CategoryTicket_Price_MaxLimit`
CHECK (`price` <= 100000000);

-- ============================================================
-- Documentation:
-- These constraints work together with backend validation to:
-- 1. Prevent negative prices at database level
-- 2. Prevent prices exceeding 100 million VNĐ
-- 3. Act as final safeguard even if backend validation is bypassed
-- 
-- When organizer attempts to set invalid price:
-- - Frontend: Shows warning (red border, error message)
-- - Backend: Returns 400 Bad Request with message
-- - Database: Enforces constraint, rejects INSERT/UPDATE
-- ============================================================

SET FOREIGN_KEY_CHECKS=1;
