package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement")
	defer db.Close()

	// Check event status
	var status string
	db.QueryRow("SELECT status FROM Event WHERE event_id = 1032").Scan(&status)
	fmt.Printf("Event 1032 status: %s\n\n", status)

	// Check event 1032 layout
	rows, _ := db.Query(`
		SELECT 
			esl.seat_id,
			esl.seat_type,
			esl.status as layout_status,
			s.seat_code,
			s.status as seat_status,
			CASE 
				WHEN EXISTS (
					SELECT 1 FROM Ticket t
					WHERE t.event_id = 1032
					  AND t.seat_id = esl.seat_id
					  AND t.status IN ('BOOKED','CHECKED_IN','CHECKED_OUT','REFUNDED')
				) THEN 'BOOKED'
				WHEN EXISTS (
					SELECT 1 FROM Ticket t
					WHERE t.event_id = 1032
					  AND t.seat_id = esl.seat_id
					  AND t.status = 'PENDING'
				) THEN 'HOLD'
				ELSE 'AVAILABLE'
			END AS computed_status
		FROM Event_Seat_Layout esl
		JOIN Seat s ON esl.seat_id = s.seat_id
		WHERE esl.event_id = 1032
		LIMIT 10
	`)

	fmt.Println("Event 1032 seat layout (first 10):")
	fmt.Println("SeatID | Type | Layout Status | Seat Code | Seat Status | Computed Status")
	fmt.Println("---------------------------------------------------------------------")

	count := 0
	availableCount := 0
	for rows.Next() {
		var seatID int
		var seatType, layoutStatus, seatCode, seatStatus, computedStatus string
		rows.Scan(&seatID, &seatType, &layoutStatus, &seatCode, &seatStatus, &computedStatus)
		fmt.Printf("%d | %s | %s | %s | %s | %s\n",
			seatID, seatType, layoutStatus, seatCode, seatStatus, computedStatus)
		count++
		if computedStatus == "AVAILABLE" {
			availableCount++
		}
	}
	rows.Close()

	// Count total
	var totalSeats, vipSeats, stdSeats int
	db.QueryRow(`
		SELECT COUNT(*),
		       COUNT(CASE WHEN seat_type = 'VIP' THEN 1 END),
		       COUNT(CASE WHEN seat_type = 'STANDARD' THEN 1 END)
		FROM Event_Seat_Layout
		WHERE event_id = 1032
	`).Scan(&totalSeats, &vipSeats, &stdSeats)

	fmt.Printf("\nTotal seats: %d (VIP: %d, STANDARD: %d)\n", totalSeats, vipSeats, stdSeats)
	fmt.Printf("Available in first 10: %d\n", availableCount)
}
