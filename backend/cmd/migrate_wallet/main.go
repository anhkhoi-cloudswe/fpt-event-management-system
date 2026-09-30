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
	envCandidates := []string{"../.env", ".env", "../../.env"}
	for _, p := range envCandidates {
		if _, err := os.Stat(p); err == nil {
			_ = godotenv.Load(p)
			break
		}
	}

	dbURL := os.Getenv("DB_URL")
	if dbURL == "" {
		dbURL = os.Getenv("DATABASE_URL")
	}
	if dbURL == "" {
		log.Fatal("Error: DB_URL is not set in environment")
	}

	log.Printf("Connecting to database...")
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Error opening connection: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Error pinging database: %v", err)
	}
	log.Println("Successfully connected to PostgreSQL database!")

	// 1. Add pending_balance to wallet
	log.Println("1. Ensuring pending_balance exists in wallet table...")
	_, err = db.Exec("ALTER TABLE wallet ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(15,2) NOT NULL DEFAULT 0.00;")
	if err != nil {
		log.Fatalf("Error adding pending_balance to wallet: %v", err)
	}
	log.Println("✅ wallet.pending_balance verified")

	// 2. Add enum values to wallet_transaction_type_enum
	log.Println("2. Adding new enum values to wallet_transaction_type_enum...")
	newEnums := []string{
		"TOPUP",
		"TICKET_SALE",
		"COMMISSION_FEE",
		"USAGE_FEE",
		"WITHDRAWAL",
		"EVENT_PAYOUT_RELEASE",
	}
	for _, val := range newEnums {
		_, err = db.Exec("ALTER TYPE wallet_transaction_type_enum ADD VALUE IF NOT EXISTS '" + val + "'")
		if err != nil {
			log.Printf("Note for enum value %s: %v", val, err)
		} else {
			log.Printf("✅ Enum value '%s' verified", val)
		}
	}

	// 3. Add settlement columns to event
	log.Println("3. Ensuring settlement tracking columns exist in event table...")
	_, err = db.Exec("ALTER TABLE event ADD COLUMN IF NOT EXISTS is_settled BOOLEAN NOT NULL DEFAULT FALSE;")
	if err != nil {
		log.Fatalf("Error adding is_settled to event: %v", err)
	}
	_, err = db.Exec("ALTER TABLE event ADD COLUMN IF NOT EXISTS settled_at TIMESTAMP WITH TIME ZONE;")
	if err != nil {
		log.Fatalf("Error adding settled_at to event: %v", err)
	}
	log.Println("✅ event settlement columns verified")

	// 4. Create financial_receipt table
	log.Println("4. Creating financial_receipt table if not exists...")
	receiptSQL := `
	CREATE TABLE IF NOT EXISTS financial_receipt (
		receipt_id SERIAL PRIMARY KEY,
		order_id BIGINT NOT NULL,
		bill_id INTEGER REFERENCES bill(bill_id) ON DELETE SET NULL,
		ticket_id INTEGER REFERENCES ticket(ticket_id) ON DELETE SET NULL,
		event_id INTEGER NOT NULL REFERENCES event(event_id) ON DELETE CASCADE,
		organizer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
		gross_amount NUMERIC(15,2) NOT NULL,
		system_fee_percentage NUMERIC(5,2) NOT NULL,
		fixed_fee NUMERIC(15,2) NOT NULL DEFAULT 1000.00,
		commission_amount NUMERIC(15,2) NOT NULL,
		net_amount NUMERIC(15,2) NOT NULL,
		currency VARCHAR(10) NOT NULL DEFAULT 'VND',
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_financial_receipt_event_id ON financial_receipt(event_id);
	CREATE INDEX IF NOT EXISTS idx_financial_receipt_organizer_id ON financial_receipt(organizer_id);
	CREATE INDEX IF NOT EXISTS idx_financial_receipt_order_id ON financial_receipt(order_id);
	CREATE INDEX IF NOT EXISTS idx_financial_receipt_created_at ON financial_receipt(created_at);
	`
	_, err = db.Exec(receiptSQL)
	if err != nil {
		log.Fatalf("Error creating financial_receipt table: %v", err)
	}
	log.Println("✅ financial_receipt table verified")

	// 5. Create organizer_bank_account table
	log.Println("5. Creating organizer_bank_account table if not exists...")
	bankSQL := `
	CREATE TABLE IF NOT EXISTS organizer_bank_account (
		account_id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
		bank_code VARCHAR(50) NOT NULL,
		bank_name VARCHAR(150) NOT NULL,
		account_number VARCHAR(50) NOT NULL,
		account_holder_name VARCHAR(150) NOT NULL,
		is_verified BOOLEAN NOT NULL DEFAULT TRUE,
		is_default BOOLEAN NOT NULL DEFAULT FALSE,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, bank_code, account_number)
	);
	CREATE INDEX IF NOT EXISTS idx_organizer_bank_account_user ON organizer_bank_account(user_id);
	`
	_, err = db.Exec(bankSQL)
	if err != nil {
		log.Fatalf("Error creating organizer_bank_account table: %v", err)
	}
	log.Println("✅ organizer_bank_account table verified")

	// 6. Create payout_status_enum & payout_request table
	log.Println("6. Creating payout_status_enum & payout_request table if not exists...")
	payoutSQL := `
	DO $$
	BEGIN
		IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payout_status_enum') THEN
			CREATE TYPE payout_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED');
		END IF;
	END $$;

	CREATE TABLE IF NOT EXISTS payout_request (
		payout_id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
		bank_account_id INTEGER NOT NULL REFERENCES organizer_bank_account(account_id) ON DELETE RESTRICT,
		amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
		status payout_status_enum NOT NULL DEFAULT 'PENDING',
		note TEXT,
		reject_reason TEXT,
		processed_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
		processed_at TIMESTAMP WITH TIME ZONE,
		created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_payout_request_user ON payout_request(user_id);
	CREATE INDEX IF NOT EXISTS idx_payout_request_status ON payout_request(status);
	`
	_, err = db.Exec(payoutSQL)
	if err != nil {
		log.Fatalf("Error creating payout_request table: %v", err)
	}
	log.Println("✅ payout_request table verified")

	log.Println("🎉 Database migration completed successfully!")
}
