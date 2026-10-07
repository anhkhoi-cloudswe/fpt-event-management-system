-- UP Migration: 03_add_school_organizer_enum.sql
-- Thêm giá trị 'SCHOOL_ORGANIZER' vào ENUM user_role_enum
-- LƯU Ý: Chạy ở chế độ Auto-commit (KHÔNG bọc trong transaction) vì PostgreSQL không cho phép ALTER TYPE ADD VALUE trong transaction multi-statement.

ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'SCHOOL_ORGANIZER';
