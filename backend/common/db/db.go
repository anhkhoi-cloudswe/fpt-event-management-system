package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var db *sql.DB

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
	config := Config{
		Server:   getEnv("DB_SERVER", "127.0.0.1"),
		Port:     3306,
		Database: getEnv("DB_NAME", "FPTEventManagement"),
		User:     getEnv("DB_USER", "root"),
		Password: getEnv("DB_PASSWORD", ""),
	}

	return InitDBWithConfig(config)
}

// InitDBWithConfig initializes database with custom config
func InitDBWithConfig(config Config) error {
	// Build MySQL DSN: user:password@tcp(host:port)/database?parseTime=true&loc=Asia/Ho_Chi_Minh
	// parseTime=true: Go tự động parse TIME/DATETIME thành time.Time
	// loc=Asia/Ho_Chi_Minh: Đảm bảo tất cả thời gian luôn theo múi giờ Việt Nam (UTC+7)
	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?parseTime=true&loc=Asia%%2FHo_Chi_Minh",
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
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	// ✅ Log successful connection with timezone confirmation
	fmt.Printf("✅ [DB] Connected successfully with timezone: Asia/Ho_Chi_Minh (UTC+7)\n")
	fmt.Printf("   DSN: %s:%d/%s\n", config.Server, config.Port, config.Database)
	fmt.Printf("   parseTime=%v, loc=Asia/Ho_Chi_Minh\n", true)

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
