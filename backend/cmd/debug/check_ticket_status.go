package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/go-sql-driver/mysql"
	"github.com/joho/godotenv"
)

func main() {
	// Load .env
	godotenv.Load()

	// Connect to database
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true",
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_NAME"),
	)

	db, err := sql.Open("mysql", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Query latest ticket
	fmt.Println("🎫 LATEST BOOKED TICKETS:")
	fmt.Println("========================================")

	rows, err := db.Query(`
		SELECT 
			t.ticket_id,
			t.user_id,
			t.event_id,
			t.seat_id,
			t.qr_code_value,
			t.status,
			t.bill_id,
			t.created_at,
			u.email,
			u.full_name,
			e.title as event_title,
			s.seat_code,
			b.total_amount
		FROM Ticket t
		JOIN Users u ON t.user_id = u.user_id
		JOIN Event e ON t.event_id = e.event_id
		JOIN Seat s ON t.seat_id = s.seat_id
		LEFT JOIN Bill b ON t.bill_id = b.bill_id
		WHERE t.status = 'BOOKED'
		ORDER BY t.ticket_id DESC
		LIMIT 5
	`)
	if err != nil {
		log.Fatal(err)
	}
	defer rows.Close()

	for rows.Next() {
		var ticketID, userID, eventID, seatID int
		var billID sql.NullInt64
		var qrCode, status, email, fullName, eventTitle, seatCode, createdAt string
		var amount sql.NullString

		err := rows.Scan(&ticketID, &userID, &eventID, &seatID, &qrCode, &status, &billID, &createdAt, &email, &fullName, &eventTitle, &seatCode, &amount)
		if err != nil {
			log.Println(err)
			continue
		}

		fmt.Printf("\n🎟️ Ticket #%d\n", ticketID)
		fmt.Printf("   User: %s (%s)\n", fullName, email)
		fmt.Printf("   Event: %s\n", eventTitle)
		fmt.Printf("   Seat: %s\n", seatCode)
		fmt.Printf("   QR Code: %s\n", qrCode)
		fmt.Printf("   Status: %s\n", status)
		if billID.Valid {
			fmt.Printf("   Bill ID: %d\n", billID.Int64)
		}
		if amount.Valid {
			fmt.Printf("   Amount: %s VND\n", amount.String)
		}
		fmt.Printf("   Created: %s\n", createdAt)
	}

	fmt.Println("\n========================================")
}
