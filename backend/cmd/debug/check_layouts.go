package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement")
	defer db.Close()

	// Check which events have layouts
	rows, _ := db.Query(`
		SELECT 
			esl.event_id, 
			e.title,
			COUNT(*) as seat_count,
			COUNT(CASE WHEN esl.seat_type = 'VIP' THEN 1 END) as vip_count,
			COUNT(CASE WHEN esl.seat_type = 'STANDARD' THEN 1 END) as std_count
		FROM Event_Seat_Layout esl
		JOIN Event e ON esl.event_id = e.event_id
		GROUP BY esl.event_id, e.title
		ORDER BY esl.event_id DESC
		LIMIT 10
	`)

	fmt.Println("Events with seat layouts:")
	for rows.Next() {
		var eventID, seatCount, vipCount, stdCount int
		var title string
		rows.Scan(&eventID, &title, &seatCount, &vipCount, &stdCount)
		fmt.Printf("Event %d: %s - Total: %d (VIP: %d, STD: %d)\n", eventID, title, seatCount, vipCount, stdCount)
	}

	// Check if event 1032 has layout
	var count1032 int
	db.QueryRow("SELECT COUNT(*) FROM Event_Seat_Layout WHERE event_id = 1032").Scan(&count1032)
	fmt.Printf("\nEvent 1032 layout count: %d\n", count1032)

	// Check what area_id event 1032 uses
	var areaID sql.NullInt64
	db.QueryRow("SELECT area_id FROM Event WHERE event_id = 1032").Scan(&areaID)
	if areaID.Valid {
		fmt.Printf("Event 1032 uses area_id: %d\n", areaID.Int64)
	}
}
