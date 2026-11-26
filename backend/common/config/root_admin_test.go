package config

import "testing"

func TestIsRootAdminEmail(t *testing.T) {
	t.Setenv("ROOT_ADMIN_EMAIL", "")
	if IsRootAdminEmail("admin@example.com") {
		t.Fatalf("expected false when ROOT_ADMIN_EMAIL is empty")
	}

	t.Setenv("ROOT_ADMIN_EMAIL", "RootAdmin@Example.com, backup.root@example.com")
	if !IsRootAdminEmail("rootadmin@example.com") {
		t.Fatalf("expected case-insensitive match for first root admin email")
	}
	if !IsRootAdminEmail("  backup.root@example.com ") {
		t.Fatalf("expected trimmed match for second root admin email")
	}
	if IsRootAdminEmail("normal.admin@example.com") {
		t.Fatalf("expected false for non-root email")
	}
	if IsRootAdminEmail("") {
		t.Fatalf("expected false for empty email")
	}
}
