package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var ensureSchemaOnce sync.Once
var ensureSchemaErr error

// FindProjectRoot navigates up from the current working directory to find the root folder containing Database/initdb.d
func FindProjectRoot() string {
	wd, err := os.Getwd()
	if err != nil {
		return "."
	}
	curr := wd
	for {
		// Check if Database/initdb.d/01_fpt_event_full_postgres.sql exists
		sqlPath := filepath.Join(curr, "Database", "initdb.d", "01_fpt_event_full_postgres.sql")
		if _, err := os.Stat(sqlPath); err == nil {
			return curr
		}
		// Also check if Database/migrations exists
		migPath := filepath.Join(curr, "Database", "migrations", "04a_subscription_and_dynamic_fees.sql")
		if _, err := os.Stat(migPath); err == nil {
			return curr
		}
		parent := filepath.Dir(curr)
		if parent == curr {
			break
		}
		curr = parent
	}
	return "."
}

// FindMigrationsDir locates the Database/migrations directory reliably across tests
func FindMigrationsDir() string {
	candidates := []string{
		filepath.Join(FindProjectRoot(), "Database", "migrations"),
		filepath.Join("..", "..", "Database", "migrations"),
		filepath.Join("..", "Database", "migrations"),
		filepath.Join("Database", "migrations"),
	}
	for _, c := range candidates {
		if _, err := os.Stat(filepath.Join(c, "04a_subscription_and_dynamic_fees.sql")); err == nil {
			return c
		}
	}
	return ""
}

// EnsureTestSchema initializes the database schema with 01_fpt_event_full_postgres.sql and 04a migrations
// if the target database (e.g. CI Postgres or local test DB) does not have the required tables yet.
func EnsureTestSchema(db *sql.DB) error {
	ensureSchemaOnce.Do(func() {
		ctx := context.Background()

		// Check if table users exists
		var usersTableExists bool
		checkQuery := `
			SELECT EXISTS (
				SELECT FROM information_schema.tables 
				WHERE table_schema = 'public' 
				AND table_name = 'users'
			);
		`
		if err := db.QueryRowContext(ctx, checkQuery).Scan(&usersTableExists); err != nil {
			ensureSchemaErr = fmt.Errorf("failed to check existing tables: %w", err)
			return
		}

		// Check if table financial_receipt has tier_code column (from 04a migration)
		var receiptTierCodeExists bool
		if usersTableExists {
			checkColQuery := `
				SELECT EXISTS (
					SELECT FROM information_schema.columns 
					WHERE table_schema = 'public' 
					AND table_name = 'financial_receipt' 
					AND column_name = 'tier_code'
				);
			`
			_ = db.QueryRowContext(ctx, checkColQuery).Scan(&receiptTierCodeExists)
		}

		// If schema is already initialized with latest migrations, skip
		if usersTableExists && receiptTierCodeExists {
			return
		}

		rootDir := FindProjectRoot()
		baseSQLPath := filepath.Join(rootDir, "Database", "initdb.d", "01_fpt_event_full_postgres.sql")
		baseSQL, err := os.ReadFile(baseSQLPath)
		if err != nil {
			ensureSchemaErr = fmt.Errorf("failed to read %s: %w", baseSQLPath, err)
			return
		}

		// 1. Ensure required roles exist (service_role, anon, authenticated)
		initRolesSQL := `
			DO $$ 
			BEGIN 
				IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
				IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
				IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
			END $$;
		`
		if _, err := db.ExecContext(ctx, initRolesSQL); err != nil {
			ensureSchemaErr = fmt.Errorf("failed to create roles: %w", err)
			return
		}

		// 2. Load base postgres schema if users table does not exist
		if !usersTableExists {
			if _, err := db.ExecContext(ctx, "SET session_replication_role = 'replica';"); err != nil {
				ensureSchemaErr = fmt.Errorf("failed to set replica role: %w", err)
				return
			}
			if _, err := db.ExecContext(ctx, string(baseSQL)); err != nil {
				ensureSchemaErr = fmt.Errorf("failed to execute %s: %w", baseSQLPath, err)
				return
			}
			if _, err := db.ExecContext(ctx, "SET session_replication_role = 'origin';"); err != nil {
				ensureSchemaErr = fmt.Errorf("failed to reset replica role: %w", err)
				return
			}
		}

		// 3. Run migration 03 (add SCHOOL_ORGANIZER) and 04a if not already present
		migDir := FindMigrationsDir()
		if migDir != "" {
			m03Path := filepath.Join(migDir, "03_add_school_organizer_enum.sql")
			if m03SQL, err := os.ReadFile(m03Path); err == nil {
				_, _ = db.ExecContext(ctx, string(m03SQL))
			}

			if !receiptTierCodeExists {
				m04aPath := filepath.Join(migDir, "04a_subscription_and_dynamic_fees.sql")
				if m04aSQL, err := os.ReadFile(m04aPath); err == nil {
					// Clean comments and execute
					if _, err := db.ExecContext(ctx, string(m04aSQL)); err != nil {
						// Migration might already be applied partially, ignore harmless constraint duplicate errors
						if !strings.Contains(err.Error(), "already exists") {
							ensureSchemaErr = fmt.Errorf("failed to execute %s: %w", m04aPath, err)
							return
						}
					}
				}
			}
		}
	})

	return ensureSchemaErr
}
