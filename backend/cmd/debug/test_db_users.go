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

	// Query users with STAFF or ORGANIZER role
	query := `
		SELECT user_id, full_name, email, role, status
		FROM Users
		WHERE role IN ('STAFF', 'ORGANIZER')
		ORDER BY role, full_name
		LIMIT 20
	`

	rows, err := database.QueryContext(context.Background(), query)
	if err != nil {
		log.Fatal("Query error:", err)
	}
	defer rows.Close()

	fmt.Println("\n========================================")
	fmt.Println("Users with STAFF or ORGANIZER role:")
	fmt.Println("========================================")

	count := 0
	for rows.Next() {
		var userID int
		var fullName, email, role, status string

		err := rows.Scan(&userID, &fullName, &email, &role, &status)
		if err != nil {
			log.Fatal("Scan error:", err)
		}

		fmt.Printf("ID: %d | Name: %-25s | Email: %-30s | Role: %-10s | Status: %s\n",
			userID, fullName, email, role, status)
		count++
	}

	if count == 0 {
		fmt.Println("❌ NO USERS FOUND WITH STAFF OR ORGANIZER ROLE!")
		fmt.Println("\nLet's check all users:")

		allQuery := "SELECT user_id, full_name, email, role, status FROM Users LIMIT 10"
		allRows, err := database.QueryContext(context.Background(), allQuery)
		if err != nil {
			log.Fatal("Query error:", err)
		}
		defer allRows.Close()

		for allRows.Next() {
			var userID int
			var fullName, email, role, status string
			err := allRows.Scan(&userID, &fullName, &email, &role, &status)
			if err != nil {
				log.Fatal("Scan error:", err)
			}
			fmt.Printf("ID: %d | Name: %-25s | Email: %-30s | Role: %-10s | Status: %s\n",
				userID, fullName, email, role, status)
		}
	} else {
		fmt.Printf("\n✅ Found %d users with STAFF or ORGANIZER role\n", count)
	}

	fmt.Println("========================================\n")
}
