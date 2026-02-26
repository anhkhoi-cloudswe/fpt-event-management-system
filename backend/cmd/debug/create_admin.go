package main

import (
	"context"
	"fmt"
	"log"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/hash"
)

func main() {
	// Initialize database
	if err := db.InitDB(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer db.CloseDB()

	database := db.GetDB()

	email := "admin@fpt.edu.vn"

	// Delete existing admin if exists
	_, err := database.Exec("DELETE FROM Users WHERE email = ?", email)
	if err != nil {
		log.Fatal("Failed to delete old admin:", err)
	}

	// Create new admin user
	password := "Admin@123"
	passwordHash := hash.HashPassword(password)

	query := `
		INSERT INTO Users (full_name, email, phone, password_hash, role, status, Wallet)
		VALUES (?, ?, ?, ?, ?, ?, 0)
	`

	_, err = database.ExecContext(
		context.Background(),
		query,
		"System Administrator",
		email,
		"0123456789",
		passwordHash,
		"ADMIN",
		"ACTIVE",
	)

	if err != nil {
		log.Fatal("Failed to create admin:", err)
	}

	fmt.Println("✅ Successfully created ADMIN user:")
	fmt.Println("   Email:", email)
	fmt.Println("   Password:", password)
}
