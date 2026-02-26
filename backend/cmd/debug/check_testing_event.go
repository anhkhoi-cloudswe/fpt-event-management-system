package main
import (
"database/sql"
"fmt"
_ "github.com/go-sql-driver/mysql"
)
func main() {
db, _ := sql.Open("mysql", "root:12345@tcp(localhost:3306)/fpteventmanagement?parseTime=true")
defer db.Close()
var eventID, areaID, maxSeats int
var title string
err := db.QueryRow("SELECT event_id, title, area_id, max_seats FROM Event WHERE title LIKE '%Testing%' ORDER BY event_id DESC LIMIT 1").Scan(&eventID, &title, &areaID, &maxSeats)
if err != nil { fmt.Println("Event not found"); return }
fmt.Printf("Event: %s (ID: %d)\n", title, eventID)
fmt.Printf("Area ID: %d, Max Seats: %d\n", areaID, maxSeats)
var layoutCount int
db.QueryRow("SELECT COUNT(*) FROM Event_Seat_Layout WHERE event_id = ?", eventID).Scan(&layoutCount)
fmt.Printf("Event_Seat_Layout: %d seats\n", layoutCount)
var physicalSeats int
db.QueryRow("SELECT COUNT(*) FROM Seat WHERE area_id = ? AND status = 'ACTIVE'", areaID).Scan(&physicalSeats)
fmt.Printf("Physical seats in area: %d\n", physicalSeats)
var vipCount, stdCount int
db.QueryRow("SELECT COALESCE(SUM(CASE WHEN name = 'VIP' THEN max_quantity ELSE 0 END), 0), COALESCE(SUM(CASE WHEN name = 'STANDARD' THEN max_quantity ELSE 0 END), 0) FROM Category_Ticket WHERE event_id = ?", eventID).Scan(&vipCount, &stdCount)
fmt.Printf("Tickets: VIP=%d, STANDARD=%d, Total=%d\n", vipCount, stdCount, vipCount+stdCount)
}
