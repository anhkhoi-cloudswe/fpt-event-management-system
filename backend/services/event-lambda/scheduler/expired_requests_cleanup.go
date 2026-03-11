package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/fpt-event-services/common/utils"
)

// ExpiredRequestsCleanupScheduler handles automatic closing of expired event update requests
// Phase 6: Service-specific scheduler - uses *sql.DB parameter + calls venue API
type ExpiredRequestsCleanupScheduler struct {
	db       *sql.DB
	interval time.Duration
	stopChan chan bool
}

// NewExpiredRequestsCleanupScheduler creates a new scheduler with explicit DB connection
func NewExpiredRequestsCleanupScheduler(dbConn *sql.DB, intervalMinutes int) *ExpiredRequestsCleanupScheduler {
	return &ExpiredRequestsCleanupScheduler{
		db:       dbConn,
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan bool),
	}
}

// Start begins the scheduled cleanup job.
// Local: runs immediately then ticks every interval.
// AWS Lambda: runs once at cold-start; EventBridge calls RunOnce() periodically.
func (s *ExpiredRequestsCleanupScheduler) Start() {
	log.Printf("[EVENT_SCHEDULER] Expired requests cleanup job started (interval: %v, local ticker: %v)",
		s.interval, isLocalMode())

	// Run immediately once at startup (both modes)
	s.autoCloseExpiredRequests()

	// Local mode: keep goroutine ticker for continuous scheduling
	if isLocalMode() {
		ticker := time.NewTicker(s.interval)
		go func() {
			for {
				select {
				case <-ticker.C:
					s.autoCloseExpiredRequests()
				case <-s.stopChan:
					ticker.Stop()
					log.Println("[EVENT_SCHEDULER] Expired requests cleanup job stopped")
					return
				}
			}
		}()
	}
}

// Stop stops the scheduler (only relevant in local mode)
func (s *ExpiredRequestsCleanupScheduler) Stop() {
	if isLocalMode() {
		s.stopChan <- true
	}
}

// RunOnce executes a single cleanup cycle.
// Called by the /internal/scheduler/expired-requests endpoint (EventBridge trigger in AWS).
func (s *ExpiredRequestsCleanupScheduler) RunOnce() {
	log.Println("[EVENT_SCHEDULER] ExpiredRequests RunOnce triggered (EventBridge or manual)")
	s.autoCloseExpiredRequests()
}

// autoCloseExpiredRequests automatically closes events that are APPROVED/UPDATING
// and are within 24 hours of their start time without being completed
func (s *ExpiredRequestsCleanupScheduler) autoCloseExpiredRequests() {
	ctx := context.Background()

	query := `
		SELECT event_id, area_id, title, start_time
		FROM Event 
		WHERE status IN ('APPROVED', 'UPDATING')
		  AND start_time < DATE_ADD(NOW(), INTERVAL 24 HOUR)
		  AND start_time > NOW()
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		log.Printf("[EVENT_SCHEDULER] Error querying expired event requests: %v", err)
		return
	}
	defer rows.Close()

	var processedCount int
	var releasedAreasCount int

	for rows.Next() {
		var eventID int
		var areaID sql.NullInt64
		var title string
		var startTime time.Time

		if err := rows.Scan(&eventID, &areaID, &title, &startTime); err != nil {
			log.Printf("[EVENT_SCHEDULER] Error scanning event row: %v", err)
			continue
		}

		// ===== START TRANSACTION =====
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			log.Printf("[EVENT_SCHEDULER] Error beginning transaction for event #%d: %v", eventID, err)
			continue
		}

		// Update event status to CLOSED
		updateEventQuery := `UPDATE Event SET status = 'CLOSED' WHERE event_id = ?`
		_, err = tx.ExecContext(ctx, updateEventQuery, eventID)
		if err != nil {
			log.Printf("[EVENT_SCHEDULER] Error closing event #%d: %v", eventID, err)
			tx.Rollback()
			continue
		}

		// Update corresponding Event_Request status to CANCELLED
		updateRequestQuery := `UPDATE Event_Request SET status = 'CANCELLED' WHERE created_event_id = ?`
		_, err = tx.ExecContext(ctx, updateRequestQuery, eventID)
		if err != nil {
			log.Printf("[EVENT_SCHEDULER] Error updating event request for event #%d: %v", eventID, err)
			tx.Rollback()
			continue
		}

		// COMMIT TRANSACTION (event + request updates)
		if err = tx.Commit(); err != nil {
			log.Printf("[EVENT_SCHEDULER] Error committing transaction for event #%d: %v", eventID, err)
			continue
		}

		// Phase 6: Release venue area via Venue Service API (outside transaction)
		if areaID.Valid {
			if err := releaseAreaViaExpiredAPI(ctx, int(areaID.Int64)); err != nil {
				log.Printf("[EVENT_SCHEDULER] Error releasing area #%d via API for event #%d: %v",
					areaID.Int64, eventID, err)
			} else {
				releasedAreasCount++
				log.Printf("[EVENT_SCHEDULER] 🔓 Area #%d released via Venue API for expired event #%d",
					areaID.Int64, eventID)
			}
		}

		processedCount++
		hoursUntilStart := startTime.Sub(time.Now()).Hours()
		log.Printf("[AUTO_CANCEL] Event #%d \"%s\" closed due to update deadline (%.1f hours until start). Venue area released.",
			eventID, truncateString(title, 50), hoursUntilStart)
	}

	if processedCount > 0 {
		log.Printf("[EVENT_SCHEDULER] 📊 Auto-closed %d expired event requests, released %d venue areas",
			processedCount, releasedAreasCount)
	}
}

// releaseAreaViaExpiredAPI calls Venue Service internal API to release an area
func releaseAreaViaExpiredAPI(ctx context.Context, areaID int) error {
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
