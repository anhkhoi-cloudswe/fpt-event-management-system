package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/fpt-event-services/common/logger"
	_ "github.com/go-sql-driver/mysql"
)

var db *sql.DB

// isLocal returns true when running outside AWS Lambda (local development)
func isLocal() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// applyConnectionPool sets connection pool limits appropriate for the runtime.
// Local: generous limits for concurrent local services.
// AWS Lambda: conservative limits to protect RDS t3.micro from connection storms.
// With 6 Lambda functions each holding up to 3 connections, the worst-case is
// 6 × N_concurrent_executions × 3 connections. Keeping N small is crucial.
func applyConnectionPool(sqlDB *sql.DB) {
	if isLocal() {
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(5)
	} else {
		// AWS Lambda: each function instance holds at most 3 open connections.
		// 6 functions × 3 = 18 connections (well within t3.micro ~80 max).
		sqlDB.SetMaxOpenConns(3)
		sqlDB.SetMaxIdleConns(1)
	}
	sqlDB.SetConnMaxLifetime(5 * time.Minute)
}

// Config holds database configuration
type Config struct {
	Server   string
	Port     int
	Database string
	User     string
	Password string
}

// InitDB initializes database connection pool
func InitDB() error {
	// Check for DB_URL first (full DSN string, used by both AWS SAM and .env)
	if dsn := os.Getenv("DB_URL"); dsn != "" {
		return initDBWithDSN(dsn)
	}

	config := Config{
		Server:   getEnv("DB_SERVER", "127.0.0.1"),
		Port:     3306,
		Database: getEnv("DB_NAME", "FPTEventManagement"),
		User:     getEnv("DB_USER", "fpt_app"),
		Password: getEnv("DB_PASSWORD", "FPTEventAppPassword2026"),
	}

	return InitDBWithConfig(config)
}

// initDBWithDSN initializes global DB using a full DSN string (from DB_URL)
func initDBWithDSN(dsn string) error {
	var err error
	db, err = sql.Open("mysql", dsn)
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

// InitDBWithConfig initializes database with custom config
func InitDBWithConfig(config Config) error {
	// Build MySQL DSN: user:password@tcp(host:port)/database?charset=utf8mb4&...
	// charset=utf8mb4: Vietnamese characters & emoji support
	// collation=utf8mb4_unicode_ci: Proper Vietnamese character sorting
	// parseTime=true: Go tự động parse TIME/DATETIME thành time.Time
	// loc=Asia/Ho_Chi_Minh: Đảm bảo tất cả thời gian luôn theo múi giờ Việt Nam (UTC+7)
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=true&loc=Asia%%2FHo_Chi_Minh&collation=utf8mb4_unicode_ci",
		config.User,
		config.Password,
		config.Server,
		config.Port,
		config.Database,
	)

	var err error
	db, err = sql.Open("mysql", dsn)
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

	// ✅ Log successful connection with timezone confirmation
	logger.Info("[DB] Connected successfully with timezone: Asia/Ho_Chi_Minh (UTC+7)", "server", config.Server, "port", config.Port, "database", config.Database)

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
// When SERVICE_SPECIFIC_DB=true, each Lambda service manages its own connection pool
// instead of sharing the global singleton.
// Returns *sql.DB that the service should pass through DI to its handlers/repos.
func InitServiceDB(serviceName string) (*sql.DB, error) {
	// Check for DB_URL first (full DSN string, used by both AWS SAM and .env)
	var dsn string
	if envDSN := os.Getenv("DB_URL"); envDSN != "" {
		dsn = envDSN
	} else {
		config := Config{
			Server:   getEnv("DB_SERVER", "127.0.0.1"),
			Port:     3306,
			Database: getEnv("DB_NAME", "FPTEventManagement"),
			User:     getEnv("DB_USER", "fpt_app"),
			Password: getEnv("DB_PASSWORD", "FPTEventAppPassword2026"),
		}
		dsn = fmt.Sprintf(
			"%s:%s@tcp(%s:%d)/%s?parseTime=true&loc=Asia%%2FHo_Chi_Minh",
			config.User,
			config.Password,
			config.Server,
			config.Port,
			config.Database,
		)
	}

	serviceDB, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("[%s] failed to open database: %w", serviceName, err)
	}

	// Configure service-specific connection pool (tuned per Lambda)
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
		logger.Info("Service-specific DB pool initialized", "service", serviceName, "max_open", 3, "max_idle", 1, "mode", "lambda")
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
