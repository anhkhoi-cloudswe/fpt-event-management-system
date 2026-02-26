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

	query := `
		SELECT user_id, full_name, email, role, status, created_at
		FROM Users
		ORDER BY role, user_id
	`

	rows, err := database.QueryContext(context.Background(), query)
	if err != nil {
		log.Fatal("Query error:", err)
	}
	defer rows.Close()

	fmt.Println("\n╔════════════════════════════════════════════════════════════════════════════════════════════════╗")
	fmt.Println("║                              DANH SÁCH USERS TRONG DATABASE                                   ║")
	fmt.Println("╚════════════════════════════════════════════════════════════════════════════════════════════════╝")
	fmt.Printf("\n%-5s %-25s %-35s %-12s %-10s %-20s\n", "ID", "Họ Tên", "Email", "Role", "Status", "Ngày Tạo")
	fmt.Println("─────────────────────────────────────────────────────────────────────────────────────────────────────")

	count := 0
	adminCount := 0
	staffCount := 0
	organizerCount := 0
	studentCount := 0

	for rows.Next() {
		var id int
		var name, email, role, status, createdAt string

		err := rows.Scan(&id, &name, &email, &role, &status, &createdAt)
		if err != nil {
			log.Fatal("Scan error:", err)
		}

		// Count by role
		switch role {
		case "ADMIN":
			adminCount++
		case "STAFF":
			staffCount++
		case "ORGANIZER":
			organizerCount++
		case "STUDENT":
			studentCount++
		}

		// Format status with color indicators
		statusIcon := "●"
		if status == "ACTIVE" {
			statusIcon = "✓"
		} else if status == "INACTIVE" {
			statusIcon = "✗"
		}

		fmt.Printf("%-5d %-25s %-35s %-12s %s %-8s %-20s\n",
			id, name, email, role, statusIcon, status, createdAt[:10])
		count++
	}

	fmt.Println("─────────────────────────────────────────────────────────────────────────────────────────────────────")
	fmt.Printf("\n📊 TỔNG KẾT:\n")
	fmt.Printf("   • Tổng số users: %d\n", count)
	fmt.Printf("   • ADMIN:     %d user(s)\n", adminCount)
	fmt.Printf("   • STAFF:     %d user(s)\n", staffCount)
	fmt.Printf("   • ORGANIZER: %d user(s)\n", organizerCount)
	fmt.Printf("   • STUDENT:   %d user(s)\n", studentCount)
	fmt.Println("\n════════════════════════════════════════════════════════════════════════════════════════════════════\n")
}
