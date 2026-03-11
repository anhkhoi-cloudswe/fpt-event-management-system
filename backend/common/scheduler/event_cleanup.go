package scheduler

import (
	"context"
	"database/sql"
	"time"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/logger"
)

var log = logger.Default()

// EventCleanupScheduler handles automatic cleanup of ended events
type EventCleanupScheduler struct {
	db       *sql.DB
	interval time.Duration
	stopChan chan bool
}

// NewEventCleanupScheduler creates a new scheduler
func NewEventCleanupScheduler(intervalMinutes int) *EventCleanupScheduler {
	return &EventCleanupScheduler{
		db:       db.GetDB(),
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan bool),
	}
}

// Start begins the scheduled cleanup job
func (s *EventCleanupScheduler) Start() {
	log.Info("[SCHEDULER] Event cleanup job started (runs every %v)", s.interval)

	// Run immediately once at startup
	s.cleanupEndedEvents()

	// Then run periodically
	ticker := time.NewTicker(s.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.cleanupEndedEvents()
			case <-s.stopChan:
				ticker.Stop()
				log.Info("[SCHEDULER] Event cleanup job stopped")
				return
			}
		}
	}()
}

// Stop stops the scheduler
func (s *EventCleanupScheduler) Stop() {
	s.stopChan <- true
}

// cleanupEndedEvents processes all events that have ended
func (s *EventCleanupScheduler) cleanupEndedEvents() {
	ctx := context.Background()

	// Find all events that have ended but are not closed/cancelled
	query := `
		SELECT event_id, area_id, title, end_time 
		FROM Event 
		WHERE end_time < NOW() 
		  AND status NOT IN ('CLOSED', 'CANCELLED')
		  AND status = 'OPEN'
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		log.Error("[SCHEDULER] Error querying ended events: %v", err)
		return
	}
	defer rows.Close()

	var processedCount int
	var releasedAreasCount int

	for rows.Next() {
		var eventID int
		var areaID sql.NullInt64
		var title string
		var endTime time.Time

		if err := rows.Scan(&eventID, &areaID, &title, &endTime); err != nil {
			log.Error("[SCHEDULER] Error scanning event row: %v", err)
			continue
		}

		// Update event status to CLOSED
		updateEventQuery := `UPDATE Event SET status = 'CLOSED' WHERE event_id = ?`
		_, err := s.db.ExecContext(ctx, updateEventQuery, eventID)
		if err != nil {
			log.Error("[SCHEDULER] Error closing event #%d: %v", eventID, err)
			continue
		}

		// Release venue area if exists
		if areaID.Valid {
			updateAreaQuery := `UPDATE Venue_Area SET status = 'AVAILABLE' WHERE area_id = ? AND status = 'UNAVAILABLE'`
			result, err := s.db.ExecContext(ctx, updateAreaQuery, areaID.Int64)
			if err != nil {
				log.Error("[SCHEDULER] Error releasing venue area #%d for event #%d: %v", areaID.Int64, eventID, err)
			} else {
				rowsAffected, _ := result.RowsAffected()
				if rowsAffected > 0 {
					releasedAreasCount++
					log.Info("[SCHEDULER] Area #%d released for ended event #%d", areaID.Int64, eventID)
				}
			}
		}

		processedCount++
		log.Info("[SCHEDULER] Event #%d \"%s\" ended at %s closed+venue released",
			eventID, truncateStringScheduler(title, 30), endTime.Format("2006-01-02 15:04"))
	}

	if processedCount > 0 {
		log.Info("[SCHEDULER] Processed %d ended events released %d venue areas", processedCount, releasedAreasCount)
	}
}

// truncateStringScheduler helper to limit log output
func truncateStringScheduler(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
