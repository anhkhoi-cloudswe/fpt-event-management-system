package scheduler

import (
	"context"
	"database/sql"
	"log"
	"os"
	"time"
)

// isLocalMode returns true when running outside AWS Lambda (local development)
func isLocalMode() bool {
	return os.Getenv("AWS_LAMBDA_FUNCTION_NAME") == ""
}

// PendingTicketCleanupScheduler handles automatic cleanup of expired PENDING tickets
// Phase 6: Service-specific scheduler - uses *sql.DB parameter
type PendingTicketCleanupScheduler struct {
	db            *sql.DB
	interval      time.Duration
	timeoutMinute int
	stopChan      chan bool
}

// NewPendingTicketCleanupScheduler creates a new scheduler with explicit DB connection
func NewPendingTicketCleanupScheduler(dbConn *sql.DB, intervalMinutes int) *PendingTicketCleanupScheduler {
	return &PendingTicketCleanupScheduler{
		db:            dbConn,
		interval:      time.Duration(intervalMinutes) * time.Minute,
		timeoutMinute: 5,
		stopChan:      make(chan bool),
	}
}

// Start begins the scheduled cleanup job.
// Local: runs immediately then ticks every interval.
// AWS Lambda: runs once at cold-start; EventBridge calls RunOnce() periodically.
func (s *PendingTicketCleanupScheduler) Start() {
	log.Printf("[TICKET_SCHEDULER] PENDING ticket cleanup job started (interval: %v, timeout: %d min, local ticker: %v)",
		s.interval, s.timeoutMinute, isLocalMode())

	// Run immediately once at startup (both modes)
	s.cleanupExpiredPendingTickets()

	// Local mode: keep goroutine ticker for continuous scheduling
	if isLocalMode() {
		ticker := time.NewTicker(s.interval)
		go func() {
			for {
				select {
				case <-ticker.C:
					s.cleanupExpiredPendingTickets()
				case <-s.stopChan:
					ticker.Stop()
					log.Println("[TICKET_SCHEDULER] PENDING ticket cleanup job stopped")
					return
				}
			}
		}()
	}
}

// Stop stops the scheduler (only relevant in local mode)
func (s *PendingTicketCleanupScheduler) Stop() {
	if isLocalMode() {
		s.stopChan <- true
	}
}

// RunOnce executes a single cleanup cycle.
// Called by the /internal/scheduler/pending-ticket-cleanup endpoint (EventBridge trigger in AWS).
func (s *PendingTicketCleanupScheduler) RunOnce() {
	log.Println("[TICKET_SCHEDULER] RunOnce triggered (EventBridge or manual)")
	s.cleanupExpiredPendingTickets()
}

// cleanupExpiredPendingTickets removes PENDING tickets that exceed timeout
func (s *PendingTicketCleanupScheduler) cleanupExpiredPendingTickets() {
	ctx := context.Background()

	query := `
		SELECT ticket_id, user_id, event_id, seat_id, created_at
		FROM Ticket 
		WHERE status = 'PENDING' 
		  AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
	`

	rows, err := s.db.QueryContext(ctx, query, s.timeoutMinute)
	if err != nil {
		log.Printf("[TICKET_SCHEDULER] Error querying expired PENDING tickets: %v", err)
		return
	}
	defer rows.Close()

	var ticketIDs []int
	var seatIDs []int
	var processedCount int

	for rows.Next() {
		var ticketID, userID, eventID, seatID int
		var createdAt time.Time

		if err := rows.Scan(&ticketID, &userID, &eventID, &seatID, &createdAt); err != nil {
			log.Printf("[TICKET_SCHEDULER] Error scanning ticket row: %v", err)
			continue
		}

		ticketIDs = append(ticketIDs, ticketID)
		seatIDs = append(seatIDs, seatID)
		processedCount++

		log.Printf("[TICKET_SCHEDULER] 🎫 Found expired PENDING ticket #%d (User #%d, Event #%d, created at %s)",
			ticketID, userID, eventID, createdAt.Format("2006-01-02 15:04:05"))
	}

	if len(ticketIDs) == 0 {
		return
	}

	// Begin transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[TICKET_SCHEDULER] Error starting transaction: %v", err)
		return
	}
	defer tx.Rollback()

	// Delete PENDING tickets
	for _, ticketID := range ticketIDs {
		deleteQuery := `DELETE FROM Ticket WHERE ticket_id = ? AND status = 'PENDING'`
		result, err := tx.ExecContext(ctx, deleteQuery, ticketID)
		if err != nil {
			log.Printf("[TICKET_SCHEDULER] Error deleting ticket #%d: %v", ticketID, err)
			continue
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			log.Printf("[TICKET_SCHEDULER] ✅ Deleted expired PENDING ticket #%d", ticketID)
		}
	}

	log.Printf("[TICKET_SCHEDULER] 📋 Released %d seats from deleted PENDING tickets", len(seatIDs))

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("[TICKET_SCHEDULER] Error committing transaction: %v", err)
		return
	}

	log.Printf("[TICKET_SCHEDULER] 📊 Cleaned up %d expired PENDING tickets", processedCount)
}
