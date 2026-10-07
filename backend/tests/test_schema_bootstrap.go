package main

import (
	"database/sql"

	dbcommon "github.com/fpt-event-services/common/db"
)

// EnsureAllTestTablesExists tự động khởi tạo toàn bộ schema kiểm thử
// độc lập với thư mục Database/ (giúp CI trên GitHub Actions chạy thành công 100% khi Database/ bị .gitignore)
func EnsureAllTestTablesExists(db *sql.DB) error {
	return dbcommon.EnsureAllTestTablesExists(db)
}
