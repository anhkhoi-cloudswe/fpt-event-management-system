package db

import (
	"context"
	"database/sql"
	"fmt"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/fpt-event-services/common/logger"
	_ "github.com/lib/pq"
)

var db *sql.DB

// isLocal returns true when running outside AWS Lambda and outside Render (local development)
func isLocal() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == "" && os.Getenv("RENDER") != "true"
}

// applyConnectionPool sets connection pool limits appropriate for the runtime.
// Local: generous limits for concurrent local services.
// Render Free Tier / AWS Lambda: conservative limits to protect shared DB from connection storms.
func applyConnectionPool(sqlDB *sql.DB) {
	if isLocal() {
		sqlDB.SetMaxOpenConns(25)
		sqlDB.SetMaxIdleConns(10)
	} else {
		// Render / AWS Lambda: Limit each microservice to at most 4 concurrent open connections.
		// Since there are 6 microservices running in the same Docker container, this keeps the total
		// concurrent connections under 24, preventing connection exhaustion ("too many clients")
		// on free-tier PostgreSQL databases (which typically limit connections to 60 or less).
		sqlDB.SetMaxOpenConns(4)
		sqlDB.SetMaxIdleConns(2)
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

// forceIPv4InDSN modifies the DSN to add a hostaddr parameter containing the resolved IPv4 address.
// This forces Go/lib/pq to connect via IPv4, bypassing unreachable IPv6 addresses on Render
// while preserving the original host name for SSL certificate verification.
func forceIPv4InDSN(dsn string) string {
	if dsn == "" {
		return dsn
	}

	// Try to parse as URL
	u, err := url.Parse(dsn)
	if err != nil {
		// If it's not a URL, it might be a key-value connection string.
		// For key-value strings: "host=foo port=bar sslmode=require"
		// We can check if "hostaddr=" is already present
		if strings.Contains(dsn, "hostaddr=") {
			return dsn
		}
		
		// Parse key-value pair to find host
		parts := strings.Fields(dsn)
		var host string
		for _, part := range parts {
			if strings.HasPrefix(part, "host=") {
				host = strings.TrimPrefix(part, "host=")
				break
			}
		}
		if host != "" {
			ips, err := net.LookupIP(host)
			if err == nil {
				for _, ip := range ips {
					if ip.To4() != nil {
						return dsn + " hostaddr=" + ip.String()
					}
				}
			}
		}
		return dsn
	}

	// For URL DSN: postgres://user:pass@host:port/database
	host := u.Hostname()
	if host == "" || host == "localhost" || host == "127.0.0.1" {
		return dsn
	}

	// Resolve the host to its IPv4 address
	ips, err := net.LookupIP(host)
	if err != nil {
		logger.Warn("[DB] Failed to resolve host for IPv4 mapping", "host", host, "error", err.Error())
		return dsn
	}

	var ipv4 string
	for _, ip := range ips {
		if ip.To4() != nil {
			ipv4 = ip.String()
			break
		}
	}

	if ipv4 == "" {
		// If no IPv4 address was found, and the host is a Supabase direct host (ends with .supabase.co)
		if strings.HasSuffix(host, ".supabase.co") {
			parts := strings.Split(host, ".")
			if len(parts) >= 2 && parts[0] == "db" {
				projectRef := parts[1]
				poolerHost := "aws-1-ap-southeast-1.pooler.supabase.com"
				
				logger.Info("[DB] Direct Supabase host is IPv6-only. Attempting fallback to pooler...", "host", host, "pooler", poolerHost)
				poolerIPs, err := net.LookupIP(poolerHost)
				if err == nil {
					for _, ip := range poolerIPs {
						if ip.To4() != nil {
							ipv4 = ip.String()
							break
						}
					}
				}
				
				if ipv4 != "" {
					logger.Info("[DB] Successfully resolved pooler IPv4. Rewriting connection string to use pooler.", "ipv4", ipv4)
					// Rewrite the URL host & port to pooler (using transaction mode 6543)
					u.Host = net.JoinHostPort(poolerHost, "6543")
					
					// Update username to include projectRef if not already present
					user := u.User.Username()
					if user != "" && !strings.Contains(user, ".") {
						password, hasPassword := u.User.Password()
						if hasPassword {
							u.User = url.UserPassword(user+"."+projectRef, password)
						} else {
							u.User = url.User(user + "." + projectRef)
						}
					}
					
					// Force hostaddr and binary_parameters query params
					q := u.Query()
					q.Set("hostaddr", ipv4)
					q.Set("binary_parameters", "yes")
					u.RawQuery = q.Encode()
					
					return u.String()
				}
			}
		}

		logger.Warn("[DB] No IPv4 addresses found for host", "host", host)
		return dsn
	}

	// Add or overwrite hostaddr to query params
	q := u.Query()
	q.Set("hostaddr", ipv4)
	if u.Port() == "6543" {
		q.Set("binary_parameters", "yes")
	}
	u.RawQuery = q.Encode()

	return u.String()
}

// InitDB initializes database connection pool.
// Reads DB_URL or DATABASE_URL first (full postgres:// DSN), otherwise falls back to individual env vars.
func InitDB() error {
	dsn := os.Getenv("DB_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}
	if dsn != "" {
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

// pingWithRetry pings the database with a retry mechanism.
func pingWithRetry(db *sql.DB, safeHost string) error {
	var err error
	maxRetries := 5
	for i := 1; i <= maxRetries; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		err = db.PingContext(ctx)
		cancel()

		if err == nil {
			return nil
		}

		logger.Warn("[DB] Failed to ping database, retrying...",
			"host", safeHost,
			"attempt", i,
			"max_attempts", maxRetries,
			"error", err.Error(),
		)

		if i < maxRetries {
			time.Sleep(2 * time.Second)
		}
	}
	return fmt.Errorf("ping failed after %d attempts: %w", maxRetries, err)
}

// openAndPingDB opens database connection pool and pings it.
// If the connection pooler returns "tenant/user not found" on aws-0, it swaps the host to aws-1 and retries.
func openAndPingDB(dsn string, safeHost string, serviceName string) (*sql.DB, error) {
	dbConn, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	applyConnectionPool(dbConn)

	err = pingWithRetry(dbConn, safeHost)
	if err != nil {
		dbConn.Close()
		// Check if it's the specific "tenant/user ... not found" pooler error on aws-0.
		// If so, swap to aws-1-ap-southeast-1.pooler.supabase.com and retry.
		if (strings.Contains(err.Error(), "tenant/user") && strings.Contains(err.Error(), "not found")) || 
			strings.Contains(err.Error(), "ENOTFOUND") {
			if strings.Contains(dsn, "aws-0-ap-southeast-1") {
				nextDSN := strings.Replace(dsn, "aws-0-ap-southeast-1", "aws-1-ap-southeast-1", 1)
				// Re-run forceIPv4InDSN to resolve the new aws-1 host
				nextDSN = forceIPv4InDSN(nextDSN)
				
				prefix := "[DB]"
				if serviceName != "" {
					prefix = fmt.Sprintf("[%s] [DB]", serviceName)
				}
				logger.Info(prefix + " Pooler tenant not found on aws-0. Retrying fallback to aws-1 pooler...")
				
				nextDBConn, nextErr := sql.Open("postgres", nextDSN)
				if nextErr != nil {
					return nil, nextErr
				}
				applyConnectionPool(nextDBConn)
				
				pingErr := pingWithRetry(nextDBConn, "aws-1-ap-southeast-1.pooler.supabase.com:6543")
				if pingErr == nil {
					logger.Info(prefix + " Connected successfully to fallback aws-1 pooler")
					return nextDBConn, nil
				}
				nextDBConn.Close()
				return nil, pingErr
			}
		}
		return nil, err
	}
	return dbConn, nil
}

// initDBWithDSN initializes global DB using a full DSN string.
// Expected format: postgres://username:password@host:port/dbname?sslmode=require
func initDBWithDSN(dsn string) error {
	var err error
	
	// Force IPv4 to avoid unreachable IPv6 on Render
	dsn = forceIPv4InDSN(dsn)

	// Safely parse DSN for logging
	safeHost := "unknown"
	safeDB := "unknown"
	if u, parseErr := url.Parse(dsn); parseErr == nil {
		safeHost = u.Host
		safeDB = u.Path
	}
	
	logger.Info("[DB] Attempting database connection via DSN", "host", safeHost, "database", safeDB)

	db, err = openAndPingDB(dsn, safeHost, "")
	if err != nil {
		return err
	}

	logger.Info("[DB] Connected successfully (via DSN)", "host", safeHost, "database", safeDB)
	return nil
}

// InitDBWithConfig initializes database with custom config.
// Builds a postgres:// DSN from individual fields.
func InitDBWithConfig(config Config) error {
	sslmode := getEnv("DB_SSLMODE", "disable")
	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		config.User,
		config.Password,
		config.Server,
		config.Port,
		config.Database,
		sslmode,
	)

	// Force IPv4 to avoid unreachable IPv6 on Render
	dsn = forceIPv4InDSN(dsn)

	var err error
	db, err = openAndPingDB(dsn, config.Server, "")
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	logger.Info("[DB] Connected successfully", "server", config.Server, "port", config.Port, "database", config.Database, "sslmode", sslmode)

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
	// Check for DB_URL or DATABASE_URL first (full DSN string)
	var dsn string
	if envDSN := os.Getenv("DB_URL"); envDSN != "" {
		dsn = envDSN
	} else if envDSN := os.Getenv("DATABASE_URL"); envDSN != "" {
		dsn = envDSN
	} else {
		config := Config{
			Server:   getEnv("DB_HOST", getEnv("DB_SERVER", "127.0.0.1")),
			Port:     getEnv("DB_PORT", "5432"),
			Database: getEnv("DB_NAME", "FPTEventManagement"),
			User:     getEnv("DB_USER", "fpt_app"),
			Password: getEnv("DB_PASSWORD", "FPTEventAppPassword2026"),
		}
		sslmode := getEnv("DB_SSLMODE", "disable")
		dsn = fmt.Sprintf(
			"postgres://%s:%s@%s:%s/%s?sslmode=%s",
			config.User,
			config.Password,
			config.Server,
			config.Port,
			config.Database,
			sslmode,
		)
	}

	// Force IPv4 to avoid unreachable IPv6 on Render
	dsn = forceIPv4InDSN(dsn)

	// Safely parse DSN for logging
	safeHost := "unknown"
	safeDB := "unknown"
	if u, parseErr := url.Parse(dsn); parseErr == nil {
		safeHost = u.Host
		safeDB = u.Path
	}

	logger.Info("Service database pool attempting connection", "service", serviceName, "host", safeHost, "database", safeDB)

	serviceDB, err := openAndPingDB(dsn, safeHost, serviceName)
	if err != nil {
		return nil, fmt.Errorf("[%s] failed to open database at %s: %w", serviceName, safeHost, err)
	}

	if isLocal() {
		logger.Info("Service-specific DB pool initialized", "service", serviceName, "host", safeHost, "max_open", 25, "max_idle", 10)
	} else {
		logger.Info("Service-specific DB pool initialized", "service", serviceName, "host", safeHost, "max_open", 25, "max_idle", 10, "mode", "render")
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
