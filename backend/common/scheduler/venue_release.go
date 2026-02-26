package scheduler

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/fpt-event-services/services/event-lambda/repository"
)

// VenueReleaseScheduler handles automatic release of venue areas when events end
type VenueReleaseScheduler struct {
	eventRepo *repository.EventRepository
	interval  time.Duration
	stopChan  chan bool
	ticker    *time.Ticker
}

// NewVenueReleaseScheduler creates a new venue release scheduler
func NewVenueReleaseScheduler(intervalMinutes int) *VenueReleaseScheduler {
	return &VenueReleaseScheduler{
		eventRepo: repository.NewEventRepository(),
		interval:  time.Duration(intervalMinutes) * time.Minute,
		stopChan:  make(chan bool),
		ticker:    time.NewTicker(time.Duration(intervalMinutes) * time.Minute),
	}
}

// Start begins the scheduled venue release job
func (s *VenueReleaseScheduler) Start() {
	fmt.Printf("[SCHEDULER] Venue release job started (runs every %v)\n", s.interval)

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
				fmt.Println("[SCHEDULER] Venue release job stopped")
				return
			}
		}
	}()

	log.Printf("[SCHEDULER] ✅ Venue release scheduler initialized (interval: %v)", s.interval)
}

// Stop stops the scheduler
func (s *VenueReleaseScheduler) Stop() {
	s.stopChan <- true
}

// releaseVenues calls the AutoReleaseVenues function to release ended event venues
func (s *VenueReleaseScheduler) releaseVenues() {
	ctx := context.Background()

	fmt.Println("[VENUE_JANITOR] Venue release routine triggered")

	if err := s.eventRepo.AutoReleaseVenues(ctx); err != nil {
		fmt.Printf("[VENUE_JANITOR] ❌ Error in venue release routine: %v\n", err)
		log.Printf("[VENUE_JANITOR] Error: %v", err)
	}
}
