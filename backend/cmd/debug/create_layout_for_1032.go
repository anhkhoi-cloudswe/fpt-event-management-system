package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement")
	defer db.Close()

	// Start transaction
	tx, _ := db.Begin()

	// 1. Get seats from area 8
	rows, _ := tx.Query(`
		SELECT seat_id 
		FROM Seat 
		WHERE area_id = 8 AND status = 'ACTIVE'
		ORDER BY row_no, col_no
		LIMIT 100
	`)

	var seatIDs []int
	for rows.Next() {
		var seatID int
		rows.Scan(&seatID)
		seatIDs = append(seatIDs, seatID)
	}
	rows.Close()

	fmt.Printf("Found %d active seats in area 8\n", len(seatIDs))

	// 2. Delete old layout if exists
	result, _ := tx.Exec("DELETE FROM Event_Seat_Layout WHERE event_id = 1032")
	deleted, _ := result.RowsAffected()
	fmt.Printf("Deleted %d old layout rows\n", deleted)

	// 3. Insert new layout: VIP 30, STANDARD 70
	vipCount := 30
	standardCount := 70

	stmt, _ := tx.Prepare(`
		INSERT INTO Event_Seat_Layout (event_id, seat_id, seat_type, status)
		VALUES (1032, ?, ?, 'AVAILABLE')
	`)
	defer stmt.Close()

	inserted := 0
	for i := 0; i < vipCount+standardCount && i < len(seatIDs); i++ {
		seatType := "STANDARD"
		if i < vipCount {
			seatType = "VIP"
		}

		_, err := stmt.Exec(seatIDs[i], seatType)
		if err != nil {
			fmt.Println("Insert error:", err)
			tx.Rollback()
			return
		}
		inserted++
	}

	tx.Commit()

	fmt.Printf("Inserted %d layout rows (VIP: %d, STANDARD: %d)\n", inserted, vipCount, standardCount)

	// Verify
	var count int
	db.QueryRow("SELECT COUNT(*) FROM Event_Seat_Layout WHERE event_id = 1032").Scan(&count)
	fmt.Printf("\nVerification: Event 1032 now has %d seats in layout\n", count)
}
