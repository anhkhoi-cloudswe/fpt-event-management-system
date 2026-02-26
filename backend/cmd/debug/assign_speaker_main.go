package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/fpt-event-services/common/db"
)

func main() {
	// Initialize DB using environment variables
	if err := db.InitDB(); err != nil {
		log.Fatalf("failed to init db: %v", err)
	}
	defer func() {
		if err := db.CloseDB(); err != nil {
			fmt.Fprintln(os.Stderr, "failed to close db:", err)
		}
	}()

	ctx := context.Background()
	conn := db.GetDB()

	// Try to find speaker by full name 'Fernando Alonso'
	var speakerID int
	var speakerName string
	err := conn.QueryRowContext(ctx, "SELECT speaker_id, full_name FROM Speaker WHERE full_name = ? LIMIT 1", "Fernando Alonso").Scan(&speakerID, &speakerName)
	if err != nil {
		// Fall back to first speaker available
		err2 := conn.QueryRowContext(ctx, "SELECT speaker_id, full_name FROM Speaker LIMIT 1").Scan(&speakerID, &speakerName)
		if err2 != nil {
			log.Fatalf("no speaker found: %v, %v", err, err2)
		}
		fmt.Printf("Fernando not found, will use first speaker: ID=%d Name=%s\n", speakerID, speakerName)
	} else {
		fmt.Printf("Found speaker: ID=%d Name=%s\n", speakerID, speakerName)
	}

	// Assign this speaker to event 1041
	res, err := conn.ExecContext(ctx, "UPDATE Event SET speaker_id = ? WHERE event_id = ?", speakerID, 1041)
	if err != nil {
		log.Fatalf("failed to update event: %v", err)
	}
	n, _ := res.RowsAffected()
	fmt.Printf("Updated %d rows: set speaker_id=%d for event 1041\n", n, speakerID)

	// Verify
	var updated sql.NullInt64
	err = conn.QueryRowContext(ctx, "SELECT speaker_id FROM Event WHERE event_id = ?", 1041).Scan(&updated)
	if err != nil {
		log.Fatalf("failed to verify update: %v", err)
	}
	if updated.Valid {
		fmt.Printf("Verification: event 1041 speaker_id = %d\n", updated.Int64)
	} else {
		fmt.Println("Verification: event 1041 speaker_id is NULL")
	}
}
