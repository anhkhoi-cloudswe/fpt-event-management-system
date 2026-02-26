package main

import (
	"database/sql"
	"fmt"
	"log"
)

func TestAssignSpeaker() {
	// Open database connection
	db, err := sql.Open("mysql", "root:Password@123@tcp(127.0.0.1:3306)/fpt_event_services")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// First, check if there's a speaker
	var speakerID int
	var speakerName string
	err = db.QueryRow("SELECT speaker_id, full_name FROM Speaker LIMIT 1").Scan(&speakerID, &speakerName)
	if err != nil {
		log.Fatalf("No speakers found: %v", err)
	}
	fmt.Printf("Found speaker: ID=%d, Name=%s\n", speakerID, speakerName)

	// Assign this speaker to event 1041
	result, err := db.Exec("UPDATE Event SET speaker_id = ? WHERE event_id = 1041", speakerID)
	if err != nil {
		log.Fatalf("Failed to update event: %v", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Fatalf("Failed to get rows affected: %v", err)
	}

	fmt.Printf("Updated %d rows. Event 1041 now has speaker_id = %d\n", rowsAffected, speakerID)

	// Verify the update
	var updatedSpeakerID sql.NullInt64
	err = db.QueryRow("SELECT speaker_id FROM Event WHERE event_id = 1041").Scan(&updatedSpeakerID)
	if err != nil {
		log.Fatalf("Failed to verify: %v", err)
	}

	if updatedSpeakerID.Valid {
		fmt.Printf("Verification: Event 1041 speaker_id = %d\n", updatedSpeakerID.Int64)
	} else {
		fmt.Println("Verification: Event 1041 speaker_id is NULL")
	}
}
