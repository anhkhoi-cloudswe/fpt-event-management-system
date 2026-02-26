package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/fpt-event-services/common/db"
)

func loadEnvFile(filename string) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return // .env không bắt buộc
	}

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			os.Setenv(key, value)
		}
	}
}

func main() {
	// Load .env file
	loadEnvFile(filepath.Join(".", ".env"))

	// Load env
	if err := db.InitDB(); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.CloseDB()

	dbConn := db.GetDB()

	// Check event 1030
	var eventID int
	var title, status string
	var startTime, endTime string
	err := dbConn.QueryRow(`
		SELECT event_id, title, status, start_time, end_time 
		FROM Event 
		WHERE event_id = 1030
	`).Scan(&eventID, &title, &status, &startTime, &endTime)

	if err != nil {
		log.Fatalf("Event 1030 not found: %v", err)
	}

	fmt.Printf("═══════════════════════════════════════════════\n")
	fmt.Printf("EVENT 1030 INFO:\n")
	fmt.Printf("═══════════════════════════════════════════════\n")
	fmt.Printf("Event ID:   %d\n", eventID)
	fmt.Printf("Title:      %s\n", title)
	fmt.Printf("Status:     %s\n", status)
	fmt.Printf("Start Time: %s\n", startTime)
	fmt.Printf("End Time:   %s\n", endTime)
	fmt.Printf("═══════════════════════════════════════════════\n\n")

	// Check what ENUM values are allowed
	var columnType string
	err = dbConn.QueryRow(`
		SELECT COLUMN_TYPE 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE TABLE_SCHEMA = 'fpteventmanagement' 
		AND TABLE_NAME = 'Event' 
		AND COLUMN_NAME = 'status'
	`).Scan(&columnType)

	if err == nil {
		fmt.Printf("Event.status Column Type: %s\n", columnType)
	}

	// Check Category_Ticket status enum
	err = dbConn.QueryRow(`
		SELECT COLUMN_TYPE 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE TABLE_SCHEMA = 'fpteventmanagement' 
		AND TABLE_NAME = 'Category_Ticket' 
		AND COLUMN_NAME = 'status'
	`).Scan(&columnType)

	if err == nil {
		fmt.Printf("Category_Ticket.status Column Type: %s\n", columnType)
	}

	// Check Seat status enum
	err = dbConn.QueryRow(`
		SELECT COLUMN_TYPE 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE TABLE_SCHEMA = 'fpteventmanagement' 
		AND TABLE_NAME = 'Seat' 
		AND COLUMN_NAME = 'status'
	`).Scan(&columnType)

	if err == nil {
		fmt.Printf("Seat.status Column Type: %s\n\n", columnType)
	}

	if status != "ACTIVE" {
		fmt.Printf("⚠️  Event status is '%s', not 'ACTIVE'.\n", status)
		fmt.Printf("ℹ️  Note: Backend expects 'ACTIVE' status for payment.\n")
		fmt.Printf("   Current status: %s\n", status)
		fmt.Printf("   You may need to change the status via admin interface or SQL.\n")
	} else {
		fmt.Printf("✅ Event is already ACTIVE. No update needed.\n")
	}
}
