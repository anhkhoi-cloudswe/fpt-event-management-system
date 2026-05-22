package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/fpt-event-services/common/logger"
	_ "github.com/lib/pq"
)

var db *sql.DB

// isLocal returns true when running outside AWS Lambda (local development)
func isLocal() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// applyConnectionPool sets connection pool limits appropriate for the runtime.
// Local: generous limits for concurrent local services.
// Render Free Tier / AWS Lambda: conservative limits to protect shared DB from connection storms.
func applyConnectionPool(sqlDB *sql.DB) {
	if isLocal() {
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
	} else {
		// Render Free Tier / Lambda: keep connections low to stay within shared DB limits.
		sqlDB.SetMaxOpenConns(3)
		sqlDB.SetMaxIdleConns(1)
	}
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
}

// Config holds database configuration
type Config struct {
	Server   string
	Port     string
	Database string
	User     string
	Password string
}

// InitDB initializes database connection pool.
// Reads DB_URL first (full postgres:// DSN), otherwise falls back to individual env vars.
func InitDB() error {
	// Check for DB_URL first (full DSN string, e.g. postgres://user:pass@host:5432/db?sslmode=require)
	if dsn := os.Getenv("DB_URL"); dsn != "" {
		return initDBWithDSN(dsn)
	}

	config := Config{
		Server:   getEnv("DB_HOST", getEnv("DB_SERVER", "127.0.0.1")),
		Port:     getEnv("DB_PORT", "5432"),
		Database: getEnv("DB_NAME", "FPTEventManagement"),
		User:     getEnv("DB_USER", "fpt_app"),
		Password: getEnv("DB_PASSWORD", "FPTEventAppPassword2026"),
	}

	return InitDBWithConfig(config)
}

// initDBWithDSN initializes global DB using a full DSN string (from DB_URL).
// Expected format: postgres://username:password@host:port/dbname?sslmode=require
func initDBWithDSN(dsn string) error {
	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	applyConnectionPool(db)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info("[DB] Connected successfully (via DB_URL)")
	return nil
}

// InitDBWithConfig initializes database with custom config.
// Builds a postgres:// DSN from individual fields.
func InitDBWithConfig(config Config) error {
	// postgres://user:password@host:port/database?sslmode=disable
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=disable",
		config.User,
		config.Password,
		config.Server,
		config.Port,
		config.Database,
	)

	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool
	applyConnectionPool(db)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info("[DB] Connected successfully", "server", config.Server, "port", config.Port, "database", config.Database)

	return nil
}

// GetDB returns the database connection
func GetDB() *sql.DB {
	return db
}

// CloseDB closes the database connection
func CloseDB() error {
	if db != nil {
		return db.Close()
	}
	return nil
}

// InitServiceDB creates an independent database connection pool for a specific service.
// When SERVICE_SPECIFIC_DB=true, each service manages its own connection pool
// instead of sharing the global singleton.
// Returns *sql.DB that the service should pass through DI to its handlers/repos.
func InitServiceDB(serviceName string) (*sql.DB, error) {
	// Check for DB_URL first (full DSN string)
	var dsn string
	if envDSN := os.Getenv("DB_URL"); envDSN != "" {
		dsn = envDSN
	} else {
		config := Config{
			Server:   getEnv("DB_HOST", getEnv("DB_SERVER", "127.0.0.1")),
			Port:     getEnv("DB_PORT", "5432"),
			Database: getEnv("DB_NAME", "FPTEventManagement"),
			User:     getEnv("DB_USER", "fpt_app"),
			Password: getEnv("DB_PASSWORD", "FPTEventAppPassword2026"),
		}
		dsn = fmt.Sprintf(
			"postgres://%s:%s@%s:%s/%s?sslmode=disable",
			config.User,
			config.Password,
			config.Server,
			config.Port,
			config.Database,
		)
	}

	serviceDB, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("[%s] failed to open database: %w", serviceName, err)
	}

	// Configure service-specific connection pool
	applyConnectionPool(serviceDB)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := serviceDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("[%s] failed to ping database: %w", serviceName, err)
	}

	if isLocal() {
		logger.Info("Service-specific DB pool initialized", "service", serviceName, "max_open", 25, "max_idle", 5)
	} else {
		logger.Info("Service-specific DB pool initialized", "service", serviceName, "max_open", 3, "max_idle", 1, "mode", "render")
	}

	return serviceDB, nil
}

// getEnv gets environment variable with fallback
func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

// Transaction helpers

// WithTransaction executes a function within a transaction
func WithTransaction(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	defer func() {
		if p := recover(); p != nil {
			_ = tx.Rollback()
			panic(p)
		}
	}()

	if err := fn(tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil {
			return fmt.Errorf("failed to rollback transaction: %v (original error: %w)", rbErr, err)
		}
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}
