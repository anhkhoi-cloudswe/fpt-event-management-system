package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/fpt-event-services/common/db"
)

func loadEnvFile(filename string) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return
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

// Script test payment callback - giả lập VNPay callback về
func main() {
	// Load .env
	loadEnvFile(filepath.Join(".", ".env"))

	// Load env
	if err := db.InitDB(); err != nil {
		fmt.Printf("Failed to connect to database: %v\n", err)
		os.Exit(1)
	}
	defer db.CloseDB()

	dbConn := db.GetDB()

	// Thông tin thanh toán test
	txnRef := "11_1032_1065_213_1769852566141" // Lấy từ log
	amount := "25000000"                       // 250,000 VND * 100 (VNPay yêu cầu nhân 100)
	responseCode := "00"                       // 00 = thành công

	fmt.Println("═══════════════════════════════════════════════")
	fmt.Println("TEST VNPAY PAYMENT CALLBACK")
	fmt.Println("═══════════════════════════════════════════════")
	fmt.Printf("Transaction Ref: %s\n", txnRef)
	fmt.Printf("Amount: %s (= %s VND)\n", amount, "250,000")
	fmt.Printf("Response Code: %s (SUCCESS)\n", responseCode)
	fmt.Println("═══════════════════════════════════════════════\n")

	// Parse txnRef để lấy thông tin
	var userID, eventID, categoryTicketID, seatID int
	_, err := fmt.Sscanf(txnRef, "%d_%d_%d_%d_", &userID, &eventID, &categoryTicketID, &seatID)
	if err != nil {
		fmt.Printf("❌ Invalid txnRef format: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Parsed info:\n")
	fmt.Printf("  - User ID: %d\n", userID)
	fmt.Printf("  - Event ID: %d\n", eventID)
	fmt.Printf("  - Category Ticket ID: %d\n", categoryTicketID)
	fmt.Printf("  - Seat ID: %d\n\n", seatID)

	// Check Ticket status ENUM
	var columnType string
	err = dbConn.QueryRow(`
		SELECT COLUMN_TYPE 
		FROM INFORMATION_SCHEMA.COLUMNS 
		WHERE TABLE_SCHEMA = 'fpteventmanagement' 
		AND TABLE_NAME = 'Ticket' 
		AND COLUMN_NAME = 'status'
	`).Scan(&columnType)

	if err == nil {
		fmt.Printf("Ticket.status ENUM: %s\n\n", columnType)
	}

	// Bắt đầu transaction
	tx, err := dbConn.Begin()
	if err != nil {
		fmt.Printf("❌ Failed to begin transaction: %v\n", err)
		os.Exit(1)
	}
	defer tx.Rollback()

	// 1. Tạo Bill
	fmt.Println("Step 1: Creating Bill...")
	billResult, err := tx.Exec(
		"INSERT INTO Bill (user_id, total_amount, payment_method, payment_status, created_at) VALUES (?, ?, 'VNPAY', 'PAID', NOW())",
		userID, "250000",
	)
	if err != nil {
		fmt.Printf("❌ Failed to create bill: %v\n", err)
		os.Exit(1)
	}

	billID, err := billResult.LastInsertId()
	if err != nil {
		fmt.Printf("❌ Failed to get bill ID: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✅ Bill created with ID: %d\n\n", billID)

	// 2. Generate QR code
	qrCodeValue := fmt.Sprintf("TKT_%d_%d_%d", eventID, seatID, billID)
	fmt.Printf("Step 2: Generated QR Code: %s\n\n", qrCodeValue)

	// 3. Tạo Ticket (status ENUM: BOOKED, CHECKED_IN, CHECKED_OUT, EXPIRED, REFUNDED)
	fmt.Println("Step 3: Creating Ticket...")
	ticketResult, err := tx.Exec(
		`INSERT INTO Ticket (user_id, event_id, category_ticket_id, seat_id, qr_code_value, status) 
		VALUES (?, ?, ?, ?, ?, 'BOOKED')`,
		userID, eventID, categoryTicketID, seatID, qrCodeValue,
	)
	if err != nil {
		fmt.Printf("❌ Failed to create ticket: %v\n", err)
		os.Exit(1)
	}

	ticketID, err := ticketResult.LastInsertId()
	if err != nil {
		fmt.Printf("❌ Failed to get ticket ID: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✅ Ticket created with ID: %d\n\n", ticketID)

	// 4. Tạo Bill_Detail (bỏ qua nếu không có bảng)
	fmt.Println("Step 4: Creating Bill Detail (optional)...")
	_, err = tx.Exec(
		"INSERT INTO Bill_Detail (bill_id, ticket_id, price) VALUES (?, ?, ?)",
		billID, ticketID, "250000",
	)
	if err != nil {
		fmt.Printf("⚠️  Bill_Detail table not found (skipped)\n\n")
	} else {
		fmt.Println("✅ Bill detail created\n")
	}

	// 5. Cập nhật trạng thái ghế
	fmt.Println("Step 5: Updating Seat status...")
	result, err := tx.Exec(
		"UPDATE Seat SET status = 'INACTIVE' WHERE seat_id = ?",
		seatID,
	)
	if err != nil {
		fmt.Printf("❌ Failed to update seat: %v\n", err)
		os.Exit(1)
	}

	rows, _ := result.RowsAffected()
	fmt.Printf("✅ Updated %d seat(s)\n\n", rows)

	// Commit transaction
	if err := tx.Commit(); err != nil {
		fmt.Printf("❌ Failed to commit transaction: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("═══════════════════════════════════════════════")
	fmt.Println("✅ PAYMENT PROCESSED SUCCESSFULLY!")
	fmt.Println("═══════════════════════════════════════════════")
	fmt.Printf("Ticket Code: %s\n", qrCodeValue)
	fmt.Printf("Bill ID: %d\n", billID)
	fmt.Printf("Ticket ID: %d\n", ticketID)
	fmt.Println("\nBây giờ bạn có thể:")
	fmt.Println("1. Vào /dashboard để xem vé đã mua")
	fmt.Println("2. Vào /dashboard/payment-success để xem trang thành công")
	fmt.Printf("3. Hoặc truy cập: http://localhost:3000/dashboard/payment-success?ticketId=%d&billId=%d\n", ticketID, billID)
}
