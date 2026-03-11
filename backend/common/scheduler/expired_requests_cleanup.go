package scheduler

import (
	"context"
	"database/sql"
	"time"

	"github.com/fpt-event-services/common/db"
	"github.com/fpt-event-services/common/logger"
)

// ExpiredRequestsCleanupScheduler handles automatic closing of expired event update requests
// Purpose: Close events that are APPROVED or UPDATING and haven't been updated within 24 hours of start_time
type ExpiredRequestsCleanupScheduler struct {
	db       *sql.DB
	interval time.Duration
	stopChan chan bool
}

// NewExpiredRequestsCleanupScheduler creates a new scheduler
func NewExpiredRequestsCleanupScheduler(intervalMinutes int) *ExpiredRequestsCleanupScheduler {
	return &ExpiredRequestsCleanupScheduler{
		db:       db.GetDB(),
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan bool),
	}
}

// Start begins the scheduled cleanup job
func (s *ExpiredRequestsCleanupScheduler) Start() {
	logger.Default().Info("[SCHEDULER] Expired requests cleanup job started (runs every %v)", s.interval)

	// Run immediately once at startup
	s.autoCloseExpiredRequests()

	// Then run periodically
	ticker := time.NewTicker(s.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.autoCloseExpiredRequests()
			case <-s.stopChan:
				ticker.Stop()
				logger.Default().Info("[SCHEDULER] Expired requests cleanup job stopped")
				return
			}
		}
	}()
}

// Stop stops the scheduler
func (s *ExpiredRequestsCleanupScheduler) Stop() {
	s.stopChan <- true
}

// autoCloseExpiredRequests automatically closes events that are APPROVED/UPDATING
// and are within 24 hours of their start time without being completed
func (s *ExpiredRequestsCleanupScheduler) autoCloseExpiredRequests() {
	ctx := context.Background()

	// Find all events that are APPROVED or UPDATING and are within 24 hours of start_time
	// These events haven't been fully updated by the organizer before the deadline
	query := `
		SELECT event_id, area_id, title, start_time
		FROM Event 
		WHERE status IN ('APPROVED', 'UPDATING')
		  AND start_time < DATE_ADD(NOW(), INTERVAL 24 HOUR)
		  AND start_time > NOW()
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		logger.Default().Error("[SCHEDULER] Error querying expired event requests: %v", err)
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
			logger.Default().Error("[SCHEDULER] Error scanning event row: %v", err)
			continue
		}

		// ===== START TRANSACTION =====
		tx, err := s.db.BeginTx(ctx, nil)
		if err != nil {
			logger.Default().Error("[SCHEDULER] Error beginning transaction for event #%d: %v", eventID, err)
			continue
		}

		// Update event status to CLOSED
		updateEventQuery := `UPDATE Event SET status = 'CLOSED' WHERE event_id = ?`
		_, err = tx.ExecContext(ctx, updateEventQuery, eventID)
		if err != nil {
			logger.Default().Error("[SCHEDULER] Error closing event #%d: %v", eventID, err)
			tx.Rollback()
			continue
		}

		// Update corresponding Event_Request status to CANCELLED (matches manual cancellation)
		// Note: Event_Request uses CANCELLED status, not CLOSED
		updateRequestQuery := `UPDATE Event_Request SET status = 'CANCELLED' WHERE created_event_id = ?`
		_, err = tx.ExecContext(ctx, updateRequestQuery, eventID)
		if err != nil {
			logger.Default().Error("[SCHEDULER] Error updating event request status for event #%d: %v", eventID, err)
			tx.Rollback()
			continue
		}

		// Release venue area if exists
		if areaID.Valid {
			updateAreaQuery := `UPDATE Venue_Area SET status = 'AVAILABLE' WHERE area_id = ?`
			result, err := tx.ExecContext(ctx, updateAreaQuery, areaID.Int64)
			if err != nil {
				logger.Default().Error("[SCHEDULER] Error releasing venue area #%d for event #%d: %v", areaID.Int64, eventID, err)
				tx.Rollback()
				continue
			} else {
				rowsAffected, _ := result.RowsAffected()
				if rowsAffected > 0 {
					releasedAreasCount++
					logger.Default().Info("[SCHEDULER] Area #%d released for expired event %d", areaID.Int64, eventID)
				}
			}
		}

		// COMMIT TRANSACTION
		if err = tx.Commit(); err != nil {
			logger.Default().Error("[SCHEDULER] Error committing transaction for event #%d: %v", eventID, err)
			continue
		}

		processedCount++
		hoursUntilStart := startTime.Sub(time.Now()).Hours()
		logger.Default().Info("[AUTO_CANCEL] Event #%d \"%s\" closed update deadline elapsed (%.1fh to start) venue released",
			eventID, truncateStringScheduler(title, 50), hoursUntilStart)
	}

	if processedCount > 0 {
		logger.Default().Info("[SCHEDULER] Auto-closed %d expired event requests released %d venue areas", processedCount, releasedAreasCount)
	}
}
