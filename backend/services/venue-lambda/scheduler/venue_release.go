package scheduler

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"
)

// isLocalMode returns true when running outside AWS Lambda (local development)
func isLocalMode() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// VenueReleaseScheduler handles automatic release of venue areas when events end
// Phase 6: Service-specific scheduler - uses *sql.DB parameter (venue domain)
type VenueReleaseScheduler struct {
	db       *sql.DB
	interval time.Duration
	stopChan chan bool
	ticker   *time.Ticker
}

// NewVenueReleaseScheduler creates a new venue release scheduler with explicit DB connection
func NewVenueReleaseScheduler(dbConn *sql.DB, intervalMinutes int) *VenueReleaseScheduler {
	return &VenueReleaseScheduler{
		db:       dbConn,
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan bool),
		ticker:   time.NewTicker(time.Duration(intervalMinutes) * time.Minute),
	}
}

// Start begins the scheduled venue release job.
// Local: runs immediately then ticks every interval.
// AWS Lambda: runs once at cold-start; EventBridge calls RunOnce() periodically.
func (s *VenueReleaseScheduler) Start() {
	fmt.Printf("[VENUE_SCHEDULER] Venue release job started (interval: %v, local ticker: %v)\n",
		s.interval, isLocalMode())

	// Run immediately once at startup (both modes)
	s.releaseVenues()

	// Local mode: keep goroutine ticker for continuous scheduling
	if isLocalMode() {
		go func() {
			for {
				select {
				case <-s.ticker.C:
					s.releaseVenues()
				case <-s.stopChan:
					s.ticker.Stop()
					fmt.Println("[VENUE_SCHEDULER] Venue release job stopped")
					return
				}
			}
		}()
	}

	log.Printf("[VENUE_SCHEDULER] ✅ Venue release scheduler initialized (interval: %v)", s.interval)
}

// Stop stops the scheduler (only relevant in local mode)
func (s *VenueReleaseScheduler) Stop() {
	if isLocalMode() {
		s.stopChan <- true
	}
}

// RunOnce executes a single venue release cycle.
// Called by the /internal/scheduler/venue-release endpoint (EventBridge trigger in AWS).
func (s *VenueReleaseScheduler) RunOnce() {
	log.Println("[VENUE_SCHEDULER] RunOnce triggered (EventBridge or manual)")
	s.releaseVenues()
}

// releaseVenues releases venue areas for events that have ended
// Phase 6: Direct DB query within venue domain (no cross-service dependency)
func (s *VenueReleaseScheduler) releaseVenues() {
	ctx := context.Background()

	fmt.Println("[VENUE_SCHEDULER] Venue release routine triggered")

	// Find ended events with associated venue areas and release them
	query := `
		UPDATE Venue_Area va
		JOIN Event e ON va.area_id = e.area_id
		SET va.status = 'AVAILABLE'
		WHERE va.status = 'UNAVAILABLE'
		  AND e.end_time < NOW()
		  AND e.status IN ('CLOSED', 'CANCELLED')
	`

	result, err := s.db.ExecContext(ctx, query)
	if err != nil {
		fmt.Printf("[VENUE_SCHEDULER] ❌ Error releasing venues: %v\n", err)
		log.Printf("[VENUE_SCHEDULER] Error: %v", err)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected > 0 {
		fmt.Printf("[VENUE_SCHEDULER] ✅ Released %d venue areas for ended events\n", rowsAffected)
		log.Printf("[VENUE_SCHEDULER] Released %d venue areas", rowsAffected)
	}
}
