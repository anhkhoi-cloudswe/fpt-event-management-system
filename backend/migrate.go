package main

import (
	"database/sql"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Look for .env file in the workspace root
	envPath := "../.env"
	log.Printf("Loading .env from path: %s", envPath)
	if err := godotenv.Load(envPath); err != nil {
		log.Printf("Warning: Failed to load .env from exact path, trying current directory: %v", err)
		if err := godotenv.Load(); err != nil {
			log.Fatalf("Error: Failed to load any .env file: %v", err)
		}
	}

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		log.Fatal("Error: DB_URL is not set in environment")
	}

	log.Printf("Connecting to database...")
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Error: Failed to open connection: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error: Failed to ping database: %v", err)
	}
	log.Println("Successfully connected to Supabase PostgreSQL!")

	// 1. Alter type user_status_enum to add PENDING_DELETE
	log.Println("Checking if PENDING_DELETE exists in user_status_enum...")
	var exists bool
	checkEnumQuery := `
		SELECT EXISTS (
			SELECT 1 FROM pg_type t
			JOIN pg_enum e ON t.oid = e.enumtypid
			WHERE t.typname = 'user_status_enum' AND e.enumlabel = 'PENDING_DELETE'
		);
	`
	err = db.QueryRow(checkEnumQuery).Scan(&exists)
	if err != nil {
		log.Fatalf("Error checking enum type: %v", err)
	}

	if !exists {
		log.Println("PENDING_DELETE enum value does not exist. Adding value...")
		_, err = db.Exec("ALTER TYPE user_status_enum ADD VALUE 'PENDING_DELETE'")
		if err != nil {
			log.Fatalf("Error adding value to enum: %v", err)
		}
		log.Println("Added 'PENDING_DELETE' to user_status_enum successfully!")
	} else {
		log.Println("'PENDING_DELETE' already exists in user_status_enum.")
	}

	// 2. Add columns to users table
	log.Println("Adding columns to users table if not exists...")
	queries := []struct {
		desc  string
		query string
	}{
		{
			desc:  "Add deleted_at column",
			query: "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP(6) WITH TIME ZONE DEFAULT NULL",
		},
		{
			desc:  "Add sso_provider column",
			query: "ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(50) DEFAULT NULL",
		},
		{
			desc:  "Add theme column",
			query: "ALTER TABLE users ADD COLUMN IF NOT EXISTS theme VARCHAR(10) DEFAULT 'light'",
		},
	}

	for _, q := range queries {
		log.Printf("Executing: %s", q.desc)
		_, err = db.Exec(q.query)
		if err != nil {
			log.Fatalf("Error executing schema change (%s): %v", q.desc, err)
		}
		log.Printf("Executed (%s) successfully!", q.desc)
	}

	log.Println("Database schema migration completed successfully!")
}
