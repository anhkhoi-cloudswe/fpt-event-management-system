package main

import (
	"context"
	"fmt"
	"log"

	"github.com/fpt-event-services/common/db"
)

func main() {
	// Initialize database
	if err := db.InitDB(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer db.CloseDB()

	database := db.GetDB()

	// Query admin users
	query := `
		SELECT user_id, full_name, email, role, status
		FROM Users
		WHERE role = 'ADMIN'
		LIMIT 10
	`

	rows, err := database.QueryContext(context.Background(), query)
	if err != nil {
		log.Fatal("Query error:", err)
	}
	defer rows.Close()

	fmt.Println("\n========================================")
	fmt.Println("Admin users in database:")
	fmt.Println("========================================")

	count := 0
	for rows.Next() {
		var userID int
		var fullName, email, role, status string

		err := rows.Scan(&userID, &fullName, &email, &role, &status)
		if err != nil {
			log.Fatal("Scan error:", err)
		}

		fmt.Printf("ID: %d | Name: %-25s | Email: %-35s | Status: %s\n",
			userID, fullName, email, status)
		count++
	}

	if count == 0 {
		fmt.Println("❌ NO ADMIN USERS FOUND!")
	} else {
		fmt.Printf("\n✅ Found %d admin user(s)\n", count)
	}

	fmt.Println("========================================\n")
}
