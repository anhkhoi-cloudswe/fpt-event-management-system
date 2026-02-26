package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement?parseTime=true")
	defer db.Close()

	// Check event Testing before and after update
	eventID := 1030

	fmt.Println("=== BEFORE: Event Testing ===")
	var title string
	var maxSeats, layoutCount int
	db.QueryRow("SELECT title, max_seats FROM Event WHERE event_id = ?", eventID).Scan(&title, &maxSeats)
	db.QueryRow("SELECT COUNT(*) FROM Event_Seat_Layout WHERE event_id = ?", eventID).Scan(&layoutCount)
	fmt.Printf("Title: %s\n", title)
	fmt.Printf("Max Seats: %d\n", maxSeats)
	fmt.Printf("Layout Count: %d\n", layoutCount)

	var vipLayout, stdLayout int
	db.QueryRow("SELECT COUNT(*) FROM Event_Seat_Layout WHERE event_id = ? AND seat_type = 'VIP'", eventID).Scan(&vipLayout)
	db.QueryRow("SELECT COUNT(*) FROM Event_Seat_Layout WHERE event_id = ? AND seat_type = 'STANDARD'", eventID).Scan(&stdLayout)
	fmt.Printf("Layout: VIP=%d, STANDARD=%d\n", vipLayout, stdLayout)

	var vipTickets, stdTickets int
	db.QueryRow("SELECT COALESCE(SUM(CASE WHEN name = 'VIP' THEN max_quantity ELSE 0 END), 0) FROM Category_Ticket WHERE event_id = ?", eventID).Scan(&vipTickets)
	db.QueryRow("SELECT COALESCE(SUM(CASE WHEN name = 'STANDARD' THEN max_quantity ELSE 0 END), 0) FROM Category_Ticket WHERE event_id = ?", eventID).Scan(&stdTickets)
	fmt.Printf("Tickets: VIP=%d, STANDARD=%d, Total=%d\n", vipTickets, stdTickets, vipTickets+stdTickets)
}
