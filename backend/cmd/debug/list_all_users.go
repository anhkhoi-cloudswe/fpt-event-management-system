package main

import (
	"context"
	"fmt"
	"log"

	"github.com/fpt-event-services/common/db"
)

func main() {
	if err := db.InitDB(); err != nil {
		log.Fatal("Failed to init DB:", err)
	}
	defer db.CloseDB()

	database := db.GetDB()

	query := "SELECT user_id, full_name, email, role, status FROM Users"
	rows, err := database.QueryContext(context.Background(), query)
	if err != nil {
		log.Fatal("Query error:", err)
	}
	defer rows.Close()

	fmt.Println("\n========== ALL USERS ==========")
	for rows.Next() {
		var id int
		var name, email, role, status string
		rows.Scan(&id, &name, &email, &role, &status)
		fmt.Printf("%d | %-25s | %-30s | %-10s | %s\n", id, name, email, role, status)
	}
	fmt.Println("===============================\n")
}
