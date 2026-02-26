package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, err := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement?parseTime=true")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	areaID := 1 // Lầu 2, Hội trường nhà văn hóa sinh viên

	// Check current max seat_code
	var maxRow string
	var maxCol int
	err = db.QueryRow(`
		SELECT COALESCE(MAX(row_no), 'A'), COALESCE(MAX(col_no), 0)
		FROM Seat WHERE area_id = ?
	`, areaID).Scan(&maxRow, &maxCol)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Area 1 current max: row=%s, col=%d\n", maxRow, maxCol)

	// Count current seats
	var currentCount int
	db.QueryRow("SELECT COUNT(*) FROM Seat WHERE area_id = ? AND status = 'ACTIVE'", areaID).Scan(&currentCount)
	fmt.Printf("Current seats: %d\n", currentCount)

	// Need to create 240 more seats (60 -> 300)
	targetCount := 300
	needCreate := targetCount - currentCount
	fmt.Printf("Need to create: %d seats\n", needCreate)

	if needCreate <= 0 {
		fmt.Println("Already have enough seats!")
		return
	}

	// Create seats in rows K-Z (10 seats per row = 24 rows)
	// Start from row K (existing is A-J with 6 seats each = 60)
	rows := []string{"K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
		"AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL"}
	colsPerRow := 10

	insertQuery := `
		INSERT INTO Seat (area_id, seat_code, row_no, col_no, status)
		VALUES (?, ?, ?, ?, 'ACTIVE')
	`

	stmt, err := db.Prepare(insertQuery)
	if err != nil {
		log.Fatal(err)
	}
	defer stmt.Close()

	created := 0
	for _, row := range rows {
		if created >= needCreate {
			break
		}
		for col := 1; col <= colsPerRow; col++ {
			if created >= needCreate {
				break
			}
			seatCode := fmt.Sprintf("%s%d", row, col)
			_, err := stmt.Exec(areaID, seatCode, row, col)
			if err != nil {
				log.Printf("Error creating %s: %v", seatCode, err)
				continue
			}
			created++
		}
	}

	fmt.Printf("Created %d new seats\n", created)

	// Verify
	var finalCount int
	db.QueryRow("SELECT COUNT(*) FROM Seat WHERE area_id = ? AND status = 'ACTIVE'", areaID).Scan(&finalCount)
	fmt.Printf("Final seat count in Area 1: %d\n", finalCount)
}
