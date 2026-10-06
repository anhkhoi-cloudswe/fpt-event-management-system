package scheduler

import (
	"context"
	"database/sql"
	"log"
	"time"

	"github.com/fpt-event-services/services/ticket-service/repository"
)

// SubscriptionExpiryScheduler handles automatic expiration and renewal of subscriptions
type SubscriptionExpiryScheduler struct {
	ticketRepo *repository.TicketRepository
	interval   time.Duration
	stopChan   chan bool
}

// NewSubscriptionExpiryScheduler creates a new scheduler instance
func NewSubscriptionExpiryScheduler(dbConn *sql.DB, intervalMinutes int) *SubscriptionExpiryScheduler {
	return &SubscriptionExpiryScheduler{
		ticketRepo: repository.NewTicketRepositoryWithDB(dbConn),
		interval:   time.Duration(intervalMinutes) * time.Minute,
		stopChan:   make(chan bool),
	}
}

// RunOnce executes the subscription expiry and auto-renew job once
func (s *SubscriptionExpiryScheduler) RunOnce(ctx context.Context) (int, int, error) {
	expired, renewed, err := s.ticketRepo.ProcessExpiredSubscriptions(ctx)
	if err != nil {
		log.Printf("[SUBSCRIPTION_SCHEDULER] Error processing expired subscriptions: %v", err)
		return 0, 0, err
	}
	if expired > 0 || renewed > 0 {
		log.Printf("[SUBSCRIPTION_SCHEDULER] Processed %d expired subscriptions, %d auto-renewed/downgraded", expired, renewed)
	}
	return expired, renewed, nil
}

// Start begins periodic execution of the job
func (s *SubscriptionExpiryScheduler) Start() {
	log.Printf("[SUBSCRIPTION_SCHEDULER] Subscription expiry job started (interval: %v)", s.interval)
	ctx := context.Background()
	_, _, _ = s.RunOnce(ctx)

	if isLocalMode() {
		ticker := time.NewTicker(s.interval)
		go func() {
			for {
				select {
				case <-ticker.C:
					_, _, _ = s.RunOnce(context.Background())
				case <-s.stopChan:
					ticker.Stop()
					log.Println("[SUBSCRIPTION_SCHEDULER] Subscription expiry job stopped")
					return
				}
			}
		}()
	}
}

// Stop terminates the scheduler
func (s *SubscriptionExpiryScheduler) Stop() {
	if isLocalMode() {
		s.stopChan <- true
	}
}
