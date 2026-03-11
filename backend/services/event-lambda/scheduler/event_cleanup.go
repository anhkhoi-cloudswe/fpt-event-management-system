package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/fpt-event-services/common/utils"
)

// isLocalMode returns true when running outside AWS Lambda (local development)
func isLocalMode() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// EventCleanupScheduler handles automatic cleanup of ended events
// Phase 6: Service-specific scheduler - uses *sql.DB parameter + calls venue API
type EventCleanupScheduler struct {
	db       *sql.DB
	interval time.Duration
	stopChan chan bool
}

// NewEventCleanupScheduler creates a new scheduler with explicit DB connection
func NewEventCleanupScheduler(dbConn *sql.DB, intervalMinutes int) *EventCleanupScheduler {
	return &EventCleanupScheduler{
		db:       dbConn,
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan bool),
	}
}

// Start begins the scheduled cleanup job.
// Local: runs immediately then ticks every interval.
// AWS Lambda: runs once at cold-start; EventBridge calls RunOnce() periodically.
func (s *EventCleanupScheduler) Start() {
	log.Printf("[EVENT_SCHEDULER] Event cleanup job started (interval: %v, local ticker: %v)",
		s.interval, isLocalMode())

	// Run immediately once at startup (both modes)
	s.cleanupEndedEvents()

	// Local mode: keep goroutine ticker for continuous scheduling
	if isLocalMode() {
		ticker := time.NewTicker(s.interval)
		go func() {
			for {
				select {
				case <-ticker.C:
					s.cleanupEndedEvents()
				case <-s.stopChan:
					ticker.Stop()
					log.Println("[EVENT_SCHEDULER] Event cleanup job stopped")
					return
				}
			}
		}()
	}
}

// Stop stops the scheduler (only relevant in local mode)
func (s *EventCleanupScheduler) Stop() {
	if isLocalMode() {
		s.stopChan <- true
	}
}

// RunOnce executes a single cleanup cycle.
// Called by the /internal/scheduler/event-cleanup endpoint (EventBridge trigger in AWS).
func (s *EventCleanupScheduler) RunOnce() {
	log.Println("[EVENT_SCHEDULER] RunOnce triggered (EventBridge or manual)")
	s.cleanupEndedEvents()
}

// cleanupEndedEvents processes all events that have ended
func (s *EventCleanupScheduler) cleanupEndedEvents() {
	ctx := context.Background()

	query := `
		SELECT event_id, area_id, title, end_time 
		FROM Event 
		WHERE end_time < NOW() 
		  AND status NOT IN ('CLOSED', 'CANCELLED')
		  AND status = 'OPEN'
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("[EVENT_SCHEDULER] Error querying ended events: %v", err)
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
			log.Printf("[EVENT_SCHEDULER] Error scanning event row: %v", err)
			continue
		}

		// Update event status to CLOSED
		updateEventQuery := `UPDATE Event SET status = 'CLOSED' WHERE event_id = ?`
		_, err := s.db.ExecContext(ctx, updateEventQuery, eventID)
		if err != nil {
			log.Printf("[EVENT_SCHEDULER] Error closing event #%d: %v", eventID, err)
			continue
		}

		// Phase 6: Release venue area via Venue Service API (instead of direct UPDATE)
		if areaID.Valid {
			if err := releaseAreaViaAPI(ctx, int(areaID.Int64)); err != nil {
				log.Printf("[EVENT_SCHEDULER] Error releasing area #%d via API for event #%d: %v",
					areaID.Int64, eventID, err)
			} else {
				releasedAreasCount++
				log.Printf("[EVENT_SCHEDULER] 🔓 Area #%d released via Venue API for event #%d",
					areaID.Int64, eventID)
			}
		}

		processedCount++
		log.Printf("[EVENT_SCHEDULER] ✅ Event #%d \"%s\" ended at %s → Closed & venue released",
			eventID, truncateString(title, 30), endTime.Format("2006-01-02 15:04"))
	}

	if processedCount > 0 {
		log.Printf("[EVENT_SCHEDULER] 📊 Processed %d ended events, released %d venue areas",
			processedCount, releasedAreasCount)
	}
}

// releaseAreaViaAPI calls Venue Service internal API to release an area
func releaseAreaViaAPI(ctx context.Context, areaID int) error {
	client := utils.NewInternalClient()
	venueURL := utils.GetVenueServiceURL() + "/internal/venue/area-status"

	payload := map[string]interface{}{
		"areaId": areaID,
		"status": "AVAILABLE",
	}

	respBody, statusCode, err := client.Post(ctx, venueURL, payload)
	if err != nil {
		return fmt.Errorf("venue API call failed: %w", err)
	}
	if statusCode != http.StatusOK {
		return fmt.Errorf("venue API returned status %d: %s", statusCode, string(respBody))
	}

	return nil
}

// truncateString helper to limit log output
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
