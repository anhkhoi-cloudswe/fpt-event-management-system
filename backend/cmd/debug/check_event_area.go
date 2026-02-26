package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	// Connect to database
	dsn := "root:12345@tcp(localhost:3306)/fpteventmanagement?parseTime=true"
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Check event 1032 - describe table first
	rows, err := db.Query("DESCRIBE Event")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println("Event table columns:")
	for rows.Next() {
		var field, typ, null, key, def, extra sql.NullString
		rows.Scan(&field, &typ, &null, &key, &def, &extra)
		fmt.Printf("  - %s\n", field.String)
	}
	rows.Close()

	// Check event 1032
	var eventID int
	var title string
	var areaID sql.NullInt64

	query := "SELECT event_id, title, area_id FROM Event WHERE event_id = 1032"
	err = db.QueryRow(query).Scan(&eventID, &title, &areaID)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Event ID: %d\n", eventID)
	fmt.Printf("Title: %s\n", title)
	fmt.Printf("Area ID: %v\n", areaID)

	if !areaID.Valid {
		fmt.Println("\n❌ PROBLEM: Event không có area_id!")
		fmt.Println("👉 Cần set area_id cho event này để có thể chọn ghế")
	} else {
		fmt.Printf("\n✅ Event có area_id = %d\n", areaID.Int64)

		// Check seats
		var seatCount int
		err = db.QueryRow("SELECT COUNT(*) FROM Seat WHERE area_id = ?", areaID.Int64).Scan(&seatCount)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("✅ Số ghế trong area: %d\n", seatCount)
	}
}
