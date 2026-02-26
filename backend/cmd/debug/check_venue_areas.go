package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	// Connect to database
	db, err := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement?parseTime=true")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Query all venue areas
	query := `
		SELECT va.area_id, va.area_name, va.capacity,
		       (SELECT COUNT(*) FROM Seat WHERE area_id = va.area_id AND status = 'ACTIVE') AS active_seats
		FROM Venue_Area va
		ORDER BY va.area_id
	`
	rows, err := db.Query(query)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	fmt.Println("Area ID | Area Name                  | Capacity | Active Seats")
	fmt.Println("--------+----------------------------+----------+-------------")

	for rows.Next() {
		var areaID, capacity, activeSeats int
		var areaName string
		if err := rows.Scan(&areaID, &areaName, &capacity, &activeSeats); err != nil {
			log.Fatal(err)
		}
		fmt.Printf("%-7d | %-26s | %-8d | %-12d\n", areaID, areaName, capacity, activeSeats)
	}
}
