package main

import (
	"database/sql"
	"fmt"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement?parseTime=true")
	defer db.Close()
	rows, _ := db.Query("SELECT e.event_id, e.title, e.status, u.email FROM Event e JOIN Users u ON e.organizer_id = u.user_id WHERE u.email = 'huy.lqclub@fpt.edu.vn' ORDER BY e.event_id DESC")
	defer rows.Close()
	fmt.Println("Events owned by huy.lqclub@fpt.edu.vn:")
	for rows.Next() {
		var id int
		var title, status, email string
		rows.Scan(&id, &title, &status, &email)
		fmt.Printf("ID: %d, Title: %s, Status: %s\n", id, title, status)
	}
}
