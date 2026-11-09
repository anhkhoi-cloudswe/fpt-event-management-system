-- Migration: 08_create_ghost_admin_monitor_table.sql
-- Description: Tạo bảng lưu trữ trạng thái cấu hình và nhật ký giám sát ngầm (Ghost Admin) vào cơ sở dữ liệu production (Supabase / Postgres)
-- Giúp dữ liệu cấu hình danh sách giám sát và phiên hoạt động không bị mất khi Gateway trên Render khởi động lại.

CREATE TABLE IF NOT EXISTS ghost_admin_storage (
    storage_id INT PRIMARY KEY DEFAULT 1,
    supervised_users JSONB NOT NULL DEFAULT '[]'::jsonb,
    sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed bản ghi mặc định cho storage_id = 1 nếu chưa tồn tại
INSERT INTO ghost_admin_storage (storage_id, supervised_users, sessions, updated_at)
VALUES (
    1,
    '[
        {
            "id": 5,
            "name": "Quản trị hệ thống",
            "role": "ADMIN",
            "email": "admin.event@fpt.edu.vn",
            "safeMode": true,
            "createdAt": "2026-11-07T00:00:00Z"
        }
    ]'::jsonb,
    '[]'::jsonb,
    CURRENT_TIMESTAMP
)
ON CONFLICT (storage_id) DO NOTHING;
