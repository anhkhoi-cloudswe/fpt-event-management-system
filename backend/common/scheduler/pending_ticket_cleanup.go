package scheduler

import (
	"context"
	"database/sql"
	"log"
	"time"

	"github.com/fpt-event-services/common/db"
)

// PendingTicketCleanupScheduler handles automatic cleanup of expired PENDING tickets
type PendingTicketCleanupScheduler struct {
	db            *sql.DB
	interval      time.Duration
	timeoutMinute int
	stopChan      chan bool
}

// NewPendingTicketCleanupScheduler creates a new scheduler
func NewPendingTicketCleanupScheduler(intervalMinutes int) *PendingTicketCleanupScheduler {
	return &PendingTicketCleanupScheduler{
		db:            db.GetDB(),
		interval:      time.Duration(intervalMinutes) * time.Minute,
		timeoutMinute: 5,
		stopChan:      make(chan bool),
	}
}

// Start begins the scheduled cleanup job
func (s *PendingTicketCleanupScheduler) Start() {
	log.Printf("[SCHEDULER] PENDING ticket cleanup job started (runs every %v minutes, timeout: %d minutes)",
		s.interval, s.timeoutMinute)

	// Run immediately once at startup
	s.cleanupExpiredPendingTickets()

	// Then run periodically
	ticker := time.NewTicker(s.interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				s.cleanupExpiredPendingTickets()
			case <-s.stopChan:
				ticker.Stop()
				log.Println("[SCHEDULER] PENDING ticket cleanup job stopped")
				return
			}
		}
	}()
}

// Stop stops the scheduler
func (s *PendingTicketCleanupScheduler) Stop() {
	s.stopChan <- true
}

// cleanupExpiredPendingTickets removes PENDING tickets that exceed timeout
func (s *PendingTicketCleanupScheduler) cleanupExpiredPendingTickets() {
	ctx := context.Background()

	// Find all PENDING tickets that were created more than timeoutMinute ago
	// ✅ FIXED: Removed non-existent registration_id column
	query := `
		SELECT ticket_id, user_id, event_id, seat_id, created_at
		FROM Ticket 
		WHERE status = 'PENDING' 
		  AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
	`

	rows, err := s.db.QueryContext(ctx, query, s.timeoutMinute)
	if err != nil {
		log.Printf("[SCHEDULER] Error querying expired PENDING tickets: %v", err)
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
			log.Printf("[SCHEDULER] Error scanning ticket row: %v", err)
			continue
		}

		ticketIDs = append(ticketIDs, ticketID)
		seatIDs = append(seatIDs, seatID)
		processedCount++

		log.Printf("[SCHEDULER] 🎫 Found expired PENDING ticket #%d (User #%d, Event #%d, created at %s)",
			ticketID, userID, eventID, createdAt.Format("2006-01-02 15:04:05"))
	}

	if len(ticketIDs) == 0 {
		return
	}

	// Begin transaction
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[SCHEDULER] Error starting transaction: %v", err)
		return
	}
	defer tx.Rollback()

	// Delete PENDING tickets
	for _, ticketID := range ticketIDs {
		deleteQuery := `DELETE FROM Ticket WHERE ticket_id = ? AND status = 'PENDING'`
		result, err := tx.ExecContext(ctx, deleteQuery, ticketID)
		if err != nil {
			log.Printf("[SCHEDULER] Error deleting ticket #%d: %v", ticketID, err)
			continue
		}

		rowsAffected, _ := result.RowsAffected()
		if rowsAffected > 0 {
			log.Printf("[SCHEDULER] ✅ Deleted expired PENDING ticket #%d", ticketID)
		}
	}

	// ✅ FIXED: Seats are automatically released when tickets are deleted
	// No need to delete from Registration table (simplified logic)
	log.Printf("[SCHEDULER] 📋 Released %d seats from deleted PENDING tickets", len(seatIDs))

	// Commit transaction
	if err := tx.Commit(); err != nil {
		log.Printf("[SCHEDULER] Error committing transaction: %v", err)
		return
	}

	log.Printf("[SCHEDULER] 📊 Cleaned up %d expired PENDING tickets", processedCount)
}
