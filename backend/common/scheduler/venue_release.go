package scheduler

import (
	"context"
	"time"

	"github.com/fpt-event-services/common/logger"
	"github.com/fpt-event-services/common/utils"
)

// VenueReleaseScheduler handles automatic release of venue areas when events end
type VenueReleaseScheduler struct {
	client   *utils.InternalClient
	interval time.Duration
	stopChan chan bool
	ticker   *time.Ticker
}

// NewVenueReleaseScheduler creates a new venue release scheduler
func NewVenueReleaseScheduler(intervalMinutes int) *VenueReleaseScheduler {
	return &VenueReleaseScheduler{
		client:   utils.NewInternalClient(),
		interval: time.Duration(intervalMinutes) * time.Minute,
		stopChan: make(chan bool),
		ticker:   time.NewTicker(time.Duration(intervalMinutes) * time.Minute),
	}
}

// Start begins the scheduled venue release job
func (s *VenueReleaseScheduler) Start() {
	logger.Info("[SCHEDULER] Venue release job started", "interval", s.interval)

	// Run immediately once at startup
	s.releaseVenues()

	// Then run periodically
	go func() {
		for {
			select {
			case <-s.ticker.C:
				s.releaseVenues()
			case <-s.stopChan:
				s.ticker.Stop()
				logger.Info("[SCHEDULER] Venue release job stopped")
				return
			}
		}
	}()

	logger.Info("[SCHEDULER] ✅ Venue release scheduler initialized", "interval", s.interval)
}

// Stop stops the scheduler
func (s *VenueReleaseScheduler) Stop() {
	s.stopChan <- true
}

// releaseVenues calls the AutoReleaseVenues function to release ended event venues
func (s *VenueReleaseScheduler) releaseVenues() {
	// Generate a lightweight request-scoped context with RequestID for traceability
	requestID := time.Now().UTC().Format("20060102T150405.000000000Z")
	ctx := context.WithValue(context.Background(), "requestID", requestID)

	logger.Info("[VENUE_JANITOR] Venue release routine triggered", "request_id", requestID)

	// Call Event service scheduler endpoint via InternalClient so services remain decoupled
	// InternalClient maps path -> Lambda function when running on AWS, and HTTP locally.
	_, status, err := s.client.Post(ctx, "http://internal/internal/scheduler/venue-release", nil)
	if err != nil {
		logger.Error("[VENUE_JANITOR] Error calling event service for venue release", "error", err, "status", status, "request_id", requestID)
		return
	}

	logger.Info("[VENUE_JANITOR] Venue release completed", "status", status, "request_id", requestID)
}
