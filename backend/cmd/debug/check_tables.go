package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement")
	defer db.Close()

	// Check Seat columns
	rows, _ := db.Query("DESCRIBE Seat")
	fmt.Println("Seat table columns:")
	for rows.Next() {
		var field, typ, null, key, def, extra sql.NullString
		rows.Scan(&field, &typ, &null, &key, &def, &extra)
		fmt.Printf("  - %s (%s)\n", field.String, typ.String)
	}
	rows.Close()

	// Check Event_Seat_Layout columns
	rows2, _ := db.Query("DESCRIBE Event_Seat_Layout")
	fmt.Println("\nEvent_Seat_Layout columns:")
	for rows2.Next() {
		var field, typ, null, key, def, extra sql.NullString
		rows2.Scan(&field, &typ, &null, &key, &def, &extra)
		fmt.Printf("  - %s (%s)\n", field.String, typ.String)
	}
	rows2.Close()
}
