package db

import (
	"os"
	"strings"
	"testing"
)

func TestValidateDevDatabaseURL(t *testing.T) {
	// Ensure isLocal() returns true
	_ = os.Unsetenv("AWS_LAMBDA_FUNCTION_NAME")
	_ = os.Unsetenv("RENDER")

	t.Run("Supabase_Blocked_In_Dev", func(t *testing.T) {
		_ = os.Unsetenv("ALLOW_REMOTE_DB")
		supabaseDSN := "postgresql://postgres:MySecretPassword123@db.gdthezbpuopxyubouqmh.supabase.co:5432/postgres"
		err := validateDevDatabaseURL(supabaseDSN)
		if err == nil {
			t.Fatal("Kỳ vọng validateDevDatabaseURL chặn DSN Supabase khi không có ALLOW_REMOTE_DB=true")
		}

		errMsg := err.Error()
		if !strings.Contains(errMsg, "SAFETY GUARD BLOCKED") {
			t.Fatalf("Thông báo lỗi không đúng kỳ vọng: %s", errMsg)
		}
		if strings.Contains(errMsg, "MySecretPassword123") {
			t.Fatalf("LỖI BẢO MẬT: Mật khẩu chưa được che trong thông báo lỗi! msg: %s", errMsg)
		}
		if !strings.Contains(errMsg, "******") {
			t.Fatalf("Kỳ vọng mật khẩu được thay bằng '******': %s", errMsg)
		}
		t.Logf("✅ Đạt: Supabase bị chặn thành công và mật khẩu đã được che: %s", errMsg)
	})

	t.Run("Localhost_Postgres_Allowed", func(t *testing.T) {
		_ = os.Unsetenv("ALLOW_REMOTE_DB")
		localDSN := "postgres://postgres:postgres@127.0.0.1:5432/fpt_event_test?sslmode=disable"
		err := validateDevDatabaseURL(localDSN)
		if err != nil {
			t.Fatalf("Kỳ vọng local DSN được phép kết nối bình thường, nhưng nhận lỗi: %v", err)
		}
		t.Log("✅ Đạt: Localhost DSN được phép qua an toàn")
	})

	t.Run("Supabase_Allowed_When_Explicit_Flag_Set", func(t *testing.T) {
		_ = os.Setenv("ALLOW_REMOTE_DB", "true")
		defer os.Unsetenv("ALLOW_REMOTE_DB")

		supabaseDSN := "postgresql://postgres:MySecretPassword123@db.gdthezbpuopxyubouqmh.supabase.co:5432/postgres"
		err := validateDevDatabaseURL(supabaseDSN)
		if err != nil {
			t.Fatalf("Kỳ vọng Supabase được phép qua khi đặt ALLOW_REMOTE_DB=true, nhưng nhận lỗi: %v", err)
		}
		t.Log("✅ Đạt: ALLOW_REMOTE_DB=true cho phép kết nối có chủ đích")
	})
}
